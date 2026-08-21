// Moving-map geometry, shared by the GNS and GTN renderers.
//
// Everything is emitted as one SVG path per layer: thousands of coastline
// segments as individually positioned elements would crawl.

let basemap = { coast: [], lakes: [], airspace: [] };

export const setBasemap = (data) => {
  basemap = data ?? basemap;
};

export const getBasemap = () => basemap;

/**
 * Track-up projection into a box.
 * @param {{pos:{lat:number,lon:number}, trk:number, range:number,
 *          box:{x:number,y:number,w:number,h:number}}} o
 */
export function projector(o) {
  const cx = o.box.x + o.box.w / 2;
  const cy = o.box.y + o.box.h / 2;
  const ppnm = o.box.h / 2 / o.range;
  const hdg = ((o.trk ?? 0) * Math.PI) / 180;
  const cosLat = Math.max(0.05, Math.cos((o.pos.lat * Math.PI) / 180));
  const sinH = Math.sin(hdg);
  const cosH = Math.cos(hdg);
  return (lon, lat) => {
    const north = (lat - o.pos.lat) * 60;
    const east = (lon - o.pos.lon) * 60 * cosLat;
    return [cx + (east * cosH - north * sinH) * ppnm, cy - (east * sinH + north * cosH) * ppnm];
  };
}

/** Lat/lon window that can reach the box, with the track-up rotation allowed for. */
export function visibleBox(o) {
  const halfWidthNm = (o.box.w / 2 / (o.box.h / 2)) * o.range;
  const radius = Math.hypot(halfWidthNm, o.range) * 1.05;
  const dLat = radius / 60;
  const dLon = radius / 60 / Math.max(0.05, Math.cos((o.pos.lat * Math.PI) / 180));
  return [o.pos.lon - dLon, o.pos.lat - dLat, o.pos.lon + dLon, o.pos.lat + dLat];
}

const hits = (b, win) => !(b[2] < win[0] || b[0] > win[2] || b[3] < win[1] || b[1] > win[3]);

function pathFor(flat, to) {
  let d = '';
  for (let i = 0; i < flat.length; i += 2) {
    const [x, y] = to(flat[i], flat[i + 1]);
    d += `${i ? 'L' : 'M'}${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;
  }
  return d;
}

/** Collect a layer's visible features into one path string. */
function layerPath(rows, win, to, budget) {
  let d = '';
  let used = 0;
  for (const row of rows) {
    if (used > budget) break;
    if (!hits(row.b, win)) continue;
    d += pathFor(row.p, to);
    used += row.p.length / 2;
  }
  return d;
}

/**
 * The map's SVG contents: basemap, airspace, range ring and course lines.
 * Waypoint symbols and labels are left to the caller, which draws them in its
 * own type system.
 *
 * @param {{pos, trk, range, box, plan, direct, declutter, ring}} o
 */
export function mapLayers(o) {
  const { box } = o;
  const to = projector(o);
  const win = visibleBox(o);
  const detail = o.declutter ?? 0;
  const g = [];

  if (detail < 2) {
    const coast = layerPath(basemap.coast, win, to, 12000);
    if (coast) g.push(`<path class="m-coast" d="${coast}"/>`);
    const lakes = layerPath(basemap.lakes, win, to, 8000);
    if (lakes) g.push(`<path class="m-lake" d="${lakes}"/>`);
  }

  if (detail < 1) {
    for (const cls of ['E', 'D', 'C', 'B']) {
      const d = layerPath(
        basemap.airspace.filter((a) => a.c === cls),
        win,
        to,
        6000
      );
      if (d) g.push(`<path class="m-as m-as-${cls}" d="${d}"/>`);
    }
  }

  if (o.ring !== false) {
    const r = (box.h / 2 / o.range) * o.range * 0.5;
    g.push(
      `<circle class="m-ring" cx="${box.x + box.w / 2}" cy="${box.y + box.h / 2}" r="${r}"/>`
    );
  }

  const leg = (a, b) => {
    const [x1, y1] = to(a.lon, a.lat);
    const [x2, y2] = to(b.lon, b.lat);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return '';
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };

  const rows = o.plan ?? [];
  let inactive = '';
  let active = '';
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].active) active += leg(rows[i - 1], rows[i]);
    else inactive += leg(rows[i - 1], rows[i]);
  }
  if (o.direct) active += leg(o.direct.from, o.direct.to);
  if (inactive) g.push(`<path class="m-leg" d="${inactive}"/>`);
  if (active) g.push(`<path class="m-leg act" d="${active}"/>`);

  return g.join('');
}

/** Wrap map contents in a clipped SVG sized to the display. */
export function mapSvg(o, pxW, pxH, scale = 1) {
  return (
    `<svg class="mapsvg" viewBox="0 0 ${pxW} ${pxH}" style="left:0;top:0;` +
    `width:${pxW * scale}px;height:${pxH * scale}px">` +
    `<clipPath id="mapclip"><rect x="${o.box.x}" y="${o.box.y}" width="${o.box.w}" height="${o.box.h}"/></clipPath>` +
    `<g clip-path="url(#mapclip)">${mapLayers(o)}</g></svg>`
  );
}
