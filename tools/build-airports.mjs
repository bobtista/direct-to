// Builds data/airports.json — the fields you can practise talking to.
//
//   node tools/build-airports.mjs <airports.csv> <airport-frequencies.csv> <runways.csv>
//
// Source: OurAirports (public domain). Only airports that actually have a
// controlling frequency are kept: without one there is nobody to talk to.

import { readFileSync, writeFileSync } from 'node:fs';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const [, , airportsPath, freqsPath, runwaysPath] = process.argv;
if (!airportsPath || !freqsPath) {
  console.error(
    'usage: node tools/build-airports.mjs <airports.csv> <airport-frequencies.csv> [runways.csv]'
  );
  process.exit(1);
}

const round = (v, p) => Math.round(Number(v) * 10 ** p) / 10 ** p;

// The positions a VFR pilot talks to, in the order you'd normally use them.
// OurAirports' type strings are inconsistent, so several map to one position.
const POSITION = {
  ATIS: 'atis',
  AWOS: 'atis',
  ASOS: 'atis',
  AFIS: 'atis',
  CLD: 'clearance',
  GND: 'ground',
  TWR: 'tower',
  APP: 'approach',
  DEP: 'departure',
  'A/D': 'approach',
  CTAF: 'ctaf',
  UNIC: 'ctaf',
  UNICOM: 'ctaf',
};

const SUFFIXES =
  /\b(International|Intl|Regional|Rgnl|Municipal|Muni|County|Memorial|Field|Airport|Airpark|Air Park|Executive|Metropolitan|of|at|the)\b/gi;

/**
 * What a controller actually calls the field.
 *
 * If the airport name contains its city, the city is what gets said
 * ("Norwood Memorial Airport" -> "Norwood"). Otherwise the distinctive last
 * word usually wins ("Laurence G Hanscom Field" -> "Hanscom"). Both are
 * heuristics over messy data, so SPOKEN_OVERRIDES has the final say.
 */
const SPOKEN_OVERRIDES = {
  KBOS: 'Boston',
  KBED: 'Hanscom',
  KAUS: 'Austin',
  KOWD: 'Norwood',
  KGTU: 'Georgetown',
  KEDC: 'Austin Executive',
};

function spokenName(id, name, city) {
  if (SPOKEN_OVERRIDES[id]) return SPOKEN_OVERRIDES[id];
  const clean = name.replace(SUFFIXES, ' ').replace(/\s+/g, ' ').trim();
  if (city && clean.toLowerCase().includes(city.toLowerCase())) return city;
  const words = clean.split(' ').filter((w) => w.length > 1);
  return words[words.length - 1] || city || name;
}

const airports = new Map();

for (const a of parseCsv(readFileSync(airportsPath, 'utf8'))) {
  if (a.iso_country !== 'US') continue;
  if (!['small_airport', 'medium_airport', 'large_airport'].includes(a.type)) continue;
  const id = (a.ident || '').toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(id)) continue;
  const lat = round(a.latitude_deg, 5);
  const lon = round(a.longitude_deg, 5);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

  airports.set(id, {
    id,
    // What a controller calls the field on the radio: "Norwood", not
    // "Norwood Memorial Airport".
    name: a.name,
    spoken: spokenName(id, a.name, a.municipality),
    city: a.municipality,
    state: a.iso_region.replace(/^US-/, ''),
    lat,
    lon,
    elev: a.elevation_ft === '' ? null : Math.round(Number(a.elevation_ft)),
    freq: {},
    rwy: [],
  });
}

for (const f of parseCsv(readFileSync(freqsPath, 'utf8'))) {
  const a = airports.get((f.airport_ident || '').toUpperCase());
  if (!a) continue;
  const pos = POSITION[(f.type || '').toUpperCase()];
  if (!pos) continue;
  const mhz = Number(f.frequency_mhz);
  if (!Number.isFinite(mhz) || mhz < 108 || mhz > 137) continue;
  // Keep the first of each position; extras are sector splits we don't model.
  if (!a.freq[pos]) a.freq[pos] = { mhz: mhz.toFixed(3), label: f.description || pos };
}

if (runwaysPath) {
  for (const r of parseCsv(readFileSync(runwaysPath, 'utf8'))) {
    if (r.closed === '1') continue;
    const a = airports.get((r.airport_ident || '').toUpperCase());
    if (!a) continue;
    const len = Number(r.length_ft);
    if (!Number.isFinite(len) || len < 1500) continue;
    for (const end of ['le', 'he']) {
      const ident = r[`${end}_ident`];
      if (!/^\d{1,2}[LCR]?$/.test(ident ?? '')) continue;
      a.rwy.push({
        id: ident,
        len: Math.round(len),
        hdg: r[`${end}_heading_degT`] === '' ? null : Math.round(Number(r[`${end}_heading_degT`])),
      });
    }
  }
}

// Only keep fields you can actually call: a tower, or a CTAF to self-announce.
const out = [...airports.values()]
  .filter((a) => a.freq.tower || a.freq.ctaf)
  .map((a) => {
    a.rwy.sort((x, y) => y.len - x.len);
    a.towered = Boolean(a.freq.tower);
    return a;
  })
  .sort((a, b) => (a.id < b.id ? -1 : 1));

writeFileSync(
  new URL('../data/airports.json', import.meta.url),
  JSON.stringify({ source: 'OurAirports (public domain)', count: out.length, airports: out })
);

const towered = out.filter((a) => a.towered).length;
console.log(
  `airports=${out.length} towered=${towered} untowered=${out.length - towered} ` +
    `withApproach=${out.filter((a) => a.freq.approach).length}`
);
