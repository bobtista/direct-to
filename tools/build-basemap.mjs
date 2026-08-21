// Builds data/basemap.json — coastlines, lakes and airspace for the map page.
//
//   node tools/build-basemap.mjs <ne_coastline.json> <ne_lakes.json> <faa_class_airspace.json>
//
// Sources (both free to redistribute):
//   Natural Earth 10m physical vectors — public domain
//   FAA Class Airspace (ArcGIS open data) — US Government work
//
// The raw airspace export is ~550 MB of over-sampled rings, so everything gets
// clipped to US bounds, simplified, chunked for viewport culling, and written
// as flat coordinate arrays.

import { readFileSync, writeFileSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const [, , coastPath, lakesPath, airspacePath] = process.argv;

// Continental US, Alaska and Hawaii.
const BOUNDS = { minLon: -180, minLat: 15, maxLon: -60, maxLat: 72 };

// Class E5 is the enroute Class E blanket — it covers most of the country and
// is not drawn on a moving map. Surface areas (E2) are.
const KEEP_AIRSPACE = new Set(['CLASS_B', 'CLASS_C', 'CLASS_D', 'CLASS_E2']);
const CLASS_LETTER = { CLASS_B: 'B', CLASS_C: 'C', CLASS_D: 'D', CLASS_E2: 'E' };

/** Ramer-Douglas-Peucker on [[lon,lat], ...]. */
function simplify(points, tol) {
  if (points.length < 3) return points;
  const sqTol = tol * tol;

  const sqSegDist = (p, a, b) => {
    let [x, y] = a;
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) [x, y] = b;
      else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };

  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxSq = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const sq = sqSegDist(points[i], points[first], points[last]);
      if (sq > maxSq) {
        index = i;
        maxSq = sq;
      }
    }
    if (maxSq > sqTol && index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const r4 = (v) => Math.round(v * 1e4) / 1e4;

function bboxOf(points) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of points) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [r4(minLon), r4(minLat), r4(maxLon), r4(maxLat)];
}

const outside = (b) =>
  b[2] < BOUNDS.minLon || b[0] > BOUNDS.maxLon || b[3] < BOUNDS.minLat || b[1] > BOUNDS.maxLat;

const flatten = (points) => points.flatMap(([lon, lat]) => [r4(lon), r4(lat)]);

/**
 * Simplify, then cut into runs of at most `chunk` points so that culling a
 * viewport does not have to consider an entire continent as one feature.
 */
function toChunks(points, tol, chunk = 160, extra = {}) {
  const simplified = simplify(points, tol);
  if (simplified.length < 2) return [];
  const out = [];
  for (let i = 0; i < simplified.length - 1; i += chunk - 1) {
    const slice = simplified.slice(i, i + chunk);
    if (slice.length < 2) continue;
    const b = bboxOf(slice);
    if (outside(b)) continue;
    out.push({ ...extra, b, p: flatten(slice) });
  }
  return out;
}

function eachLineString(geometry, fn) {
  const { type, coordinates } = geometry ?? {};
  if (type === 'LineString') fn(coordinates);
  else if (type === 'MultiLineString') coordinates.forEach(fn);
  else if (type === 'Polygon') coordinates.forEach(fn);
  else if (type === 'MultiPolygon') coordinates.forEach((poly) => poly.forEach(fn));
}

// --- coastline and lakes ---------------------------------------------------

function buildPhysical(path, tol, { minRingPoints = 0 } = {}) {
  const gj = JSON.parse(readFileSync(path, 'utf8'));
  const out = [];
  for (const f of gj.features) {
    eachLineString(f.geometry, (ring) => {
      if (ring.length < Math.max(2, minRingPoints)) return;
      out.push(...toChunks(ring, tol));
    });
  }
  return out;
}

const coast = coastPath ? buildPhysical(coastPath, 0.002) : [];
// Only lakes big enough to be a landmark; the file is mostly ponds.
const lakes = lakesPath ? buildPhysical(lakesPath, 0.003, { minRingPoints: 40 }) : [];

// --- airspace --------------------------------------------------------------

const airspace = [];

if (airspacePath) {
  const rl = createInterface({ input: createReadStream(airspacePath), crlfDelay: Infinity });
  for await (const raw of rl) {
    const line = raw.trim().replace(/,$/, '');
    if (!line.startsWith('{"type":"Feature"')) continue;
    let f;
    try {
      f = JSON.parse(line);
    } catch {
      continue;
    }
    const local = f.properties?.LOCAL_TYPE;
    if (!KEEP_AIRSPACE.has(local)) continue;
    const cls = CLASS_LETTER[local];
    eachLineString(f.geometry, (ring) => {
      if (ring.length < 4) return;
      // Rings are closed shapes, so keep them whole rather than chunked.
      const simplified = simplify(ring, 0.002);
      if (simplified.length < 4) return;
      const b = bboxOf(simplified);
      if (outside(b)) return;
      airspace.push({ c: cls, b, p: flatten(simplified) });
    });
  }
}

// --- emit ------------------------------------------------------------------

const pointCount = (rows) => rows.reduce((n, r) => n + r.p.length / 2, 0);

const payload = {
  source: 'Natural Earth (public domain) + FAA Class Airspace (US Government work)',
  bounds: BOUNDS,
  coast,
  lakes,
  airspace,
};

writeFileSync(new URL('../data/basemap.json', import.meta.url), JSON.stringify(payload));

console.log(
  `coast=${coast.length} chunks / ${pointCount(coast).toLocaleString()} pts\n` +
    `lakes=${lakes.length} chunks / ${pointCount(lakes).toLocaleString()} pts\n` +
    `airspace=${airspace.length} rings / ${pointCount(airspace).toLocaleString()} pts`
);
