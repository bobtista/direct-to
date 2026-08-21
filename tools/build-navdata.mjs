// Builds data/navdata.json from OurAirports CSVs (public domain).
//
// Usage:
//   node tools/build-navdata.mjs <airports.csv> <navaids.csv>
//                                [airport-frequencies.csv] [runways.csv]
//
// The frequency and runway files are optional; without them the WPT pages just
// show no data.
import { readFileSync, writeFileSync } from 'node:fs';

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const round = (v, p) => Math.round(Number(v) * 10 ** p) / 10 ** p;

const AIRPORT_TYPES = new Set(['small_airport', 'medium_airport', 'large_airport']);
const NAVAID_TYPES = new Set(['VOR', 'VORTAC', 'VOR-DME', 'NDB', 'NDB-DME', 'DME', 'TACAN']);

const [, , airportsPath, navaidsPath, freqsPath, runwaysPath] = process.argv;

const airports = parseCsv(readFileSync(airportsPath, 'utf8'))
  .filter((a) => a.iso_country === 'US' && AIRPORT_TYPES.has(a.type))
  .map((a) => ({
    id: (a.ident || '').toUpperCase(),
    k: 'APT',
    n: a.name,
    c: a.municipality,
    r: a.iso_region.replace(/^US-/, ''),
    lat: round(a.latitude_deg, 5),
    lon: round(a.longitude_deg, 5),
    e: a.elevation_ft === '' ? null : Math.round(Number(a.elevation_ft)),
  }))
  .filter((a) => /^[A-Z0-9]{3,5}$/.test(a.id) && Number.isFinite(a.lat) && Number.isFinite(a.lon));

const navaids = parseCsv(readFileSync(navaidsPath, 'utf8'))
  .filter((n) => n.iso_country === 'US' && NAVAID_TYPES.has(n.type))
  .map((n) => ({
    id: (n.ident || '').toUpperCase(),
    k: n.type.startsWith('NDB') ? 'NDB' : 'VOR',
    n: n.name,
    c: '',
    r: '',
    lat: round(n.latitude_deg, 5),
    lon: round(n.longitude_deg, 5),
    f: n.frequency_khz === '' ? null : Number(n.frequency_khz),
  }))
  .filter((n) => /^[A-Z0-9]{2,5}$/.test(n.id) && Number.isFinite(n.lat) && Number.isFinite(n.lon));

// One entry per identifier; airports win ties (matches how pilots type idents).
const byId = new Map();
for (const n of navaids) if (!byId.has(n.id)) byId.set(n.id, n);
for (const a of airports) byId.set(a.id, a);

// --- airport detail for the WPT pages ---------------------------------------

// Communication frequencies the GNS lists; the rest are ground-side clutter.
const FREQ_TYPES = new Set([
  'ATIS', 'AWOS', 'ASOS', 'CTAF', 'UNIC', 'UNICOM', 'TWR', 'GND', 'CLD',
  'APP', 'DEP', 'A/D', 'RDO', 'RMP', 'AFIS',
]);

if (freqsPath) {
  const rows = parseCsv(readFileSync(freqsPath, 'utf8'));
  for (const r of rows) {
    const a = byId.get((r.airport_ident || '').toUpperCase());
    if (!a || a.k !== 'APT') continue;
    const type = (r.type || '').toUpperCase();
    if (!FREQ_TYPES.has(type)) continue;
    const mhz = Number(r.frequency_mhz);
    if (!Number.isFinite(mhz) || mhz < 108 || mhz > 137) continue;
    (a.freq ??= []).push({ t: type, d: r.description || type, f: mhz.toFixed(3) });
  }
}

if (runwaysPath) {
  const rows = parseCsv(readFileSync(runwaysPath, 'utf8'));
  for (const r of rows) {
    if (r.closed === '1') continue;
    const a = byId.get((r.airport_ident || '').toUpperCase());
    if (!a || a.k !== 'APT') continue;
    const len = Number(r.length_ft);
    if (!Number.isFinite(len) || len <= 0) continue;
    (a.rwy ??= []).push({
      id: `${r.le_ident}/${r.he_ident}`.replace(/\/$/, ''),
      len: Math.round(len),
      wid: Number(r.width_ft) || null,
      surf: (r.surface || '').toUpperCase().slice(0, 10),
      lit: r.lighted === '1',
    });
  }
}

// Longest runway first, matching how the unit orders them.
for (const a of byId.values()) if (a.rwy) a.rwy.sort((x, y) => y.len - x.len);

const out = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
writeFileSync(
  new URL('../data/navdata.json', import.meta.url),
  JSON.stringify({ source: 'OurAirports (public domain)', count: out.length, waypoints: out })
);
const withFreq = out.filter((a) => a.freq).length;
const withRwy = out.filter((a) => a.rwy).length;
console.log(
  `airports=${airports.length} navaids=${navaids.length} total=${out.length} ` +
    `freq=${withFreq} rwy=${withRwy}`
);
