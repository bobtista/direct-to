// Builds data/proc/<AIRPORT>.json from the FAA CIFP (ARINC 424-18).
//
// The CIFP is US Government work and free to redistribute. Download the current
// cycle from https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/cifp/
// and point this at the FAACIFP18 file inside:
//
//   node tools/build-procedures.mjs <path/to/FAACIFP18>
//
// Output is one small file per airport plus data/proc/index.json, so the app
// only loads the airport you actually selected.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';

const [, , cifpPath] = process.argv;
if (!cifpPath) {
  console.error('usage: node tools/build-procedures.mjs <FAACIFP18>');
  process.exit(1);
}

// ARINC 424 approach route types, mapped to what a GNS shows on the PROC list.
const ROUTE_TYPE = {
  B: 'LOC BC',
  D: 'VOR/DME',
  F: 'FMS',
  G: 'IGS',
  H: 'RNAV',
  I: 'ILS',
  J: 'GLS',
  L: 'LOC',
  M: 'MLS',
  N: 'NDB',
  P: 'GPS',
  Q: 'NDB/DME',
  R: 'RNAV',
  S: 'VOR',
  T: 'TACAN',
  U: 'SDF',
  V: 'VOR',
  X: 'LDA',
  Y: 'MLS',
  Z: 'MSA',
};

// Waypoint description code byte 4 — the fix's role in the approach.
const ROLE = { A: 'IAF', B: 'IF', I: 'FACF', F: 'FAF', M: 'MAP' };

/** "N39164425" -> 39.27340. Sign, then degrees/minutes/seconds/hundredths. */
function dms(s, degDigits) {
  if (!s || !s.trim()) return null;
  const hemi = s[0];
  const d = Number(s.slice(1, 1 + degDigits));
  const m = Number(s.slice(1 + degDigits, 3 + degDigits));
  const sec = Number(s.slice(3 + degDigits, 5 + degDigits));
  const hun = Number(s.slice(5 + degDigits, 7 + degDigits));
  if (![d, m, sec, hun].every(Number.isFinite)) return null;
  const v = d + m / 60 + (sec + hun / 100) / 3600;
  return hemi === 'S' || hemi === 'W' ? -v : v;
}

const round5 = (v) => (v == null ? null : Math.round(v * 1e5) / 1e5);

/** Decode "R17", "H01CZ", "GPS-A" into a display name and runway. */
function decodeApproach(id) {
  if (id.startsWith('GPS-')) return { name: `GPS-${id.slice(4)}`, rwy: null };
  const type = ROUTE_TYPE[id[0]] ?? id[0];
  const m = /^.(\d{2})([LCR]?)-?([A-Z]?)$/.exec(id);
  if (!m) return { name: `${type} ${id.slice(1)}`, rwy: null };
  const [, num, side, variant] = m;
  const rwy = `${num}${side}`;
  return { name: `${type} ${rwy}${variant ? ` ${variant}` : ''}`, rwy };
}

const text = readFileSync(cifpPath, 'latin1');
const lines = text.split('\n');

// --- pass 1: every fix we might reference, with coordinates ----------------

/** key -> {lat, lon} — keyed by ident, and by airport+ident for terminal fixes. */
const fixes = new Map();

function addFix(key, lat, lon) {
  if (lat == null || lon == null) return;
  if (!fixes.has(key)) fixes.set(key, { lat: round5(lat), lon: round5(lon) });
}

for (const l of lines) {
  if (l[0] !== 'S' || l.length < 100) continue;
  const sec = l[4];
  // ARINC 424 puts the subsection code in column 6 for enroute (E) and navaid
  // (D) records, but column 13 for airport (P) and heliport (H) records.
  const sub = sec === 'P' || sec === 'H' ? l[12] : l[5];

  if (sec === 'P' && sub === 'C') {
    // Terminal waypoint, scoped to its airport.
    const apt = l.slice(6, 10).trim();
    const id = l.slice(13, 18).trim();
    addFix(`${apt}/${id}`, dms(l.slice(32, 41), 2), dms(l.slice(41, 51), 3));
    addFix(id, dms(l.slice(32, 41), 2), dms(l.slice(41, 51), 3));
  } else if (sec === 'E' && sub === 'A') {
    // Enroute waypoint.
    const id = l.slice(13, 18).trim();
    addFix(id, dms(l.slice(32, 41), 2), dms(l.slice(41, 51), 3));
  } else if (sec === 'D' && (sub === ' ' || sub === 'B')) {
    // VHF navaid / NDB.
    const id = l.slice(13, 17).trim();
    addFix(id, dms(l.slice(32, 41), 2), dms(l.slice(41, 51), 3));
  } else if (sec === 'P' && sub === 'N') {
    const id = l.slice(13, 17).trim();
    addFix(id, dms(l.slice(32, 41), 2), dms(l.slice(41, 51), 3));
  } else if (sec === 'P' && sub === 'G') {
    // Runway threshold, referenced by approaches as "RW17".
    const apt = l.slice(6, 10).trim();
    const id = l.slice(13, 18).trim();
    addFix(`${apt}/${id}`, dms(l.slice(32, 41), 2), dms(l.slice(41, 51), 3));
  } else if (sec === 'P' && sub === 'A') {
    // Airport reference point.
    const apt = l.slice(6, 10).trim();
    addFix(apt, dms(l.slice(32, 41), 2), dms(l.slice(41, 51), 3));
  }
}

// --- pass 2: approach legs -------------------------------------------------

/** airport -> approach id -> {transitions: Map, final: [], missed: []} */
const airports = new Map();

for (const l of lines) {
  if (l[0] !== 'S' || l[4] !== 'P' || l[12] !== 'F') continue;
  // Continuation record number. A leg with no continuation is numbered 0; a
  // leg that has one numbers the primary 1 and the continuation 2. Taking only
  // "0" silently drops every leg that carries extra data — FAFs included.
  if (l[38] !== '0' && l[38] !== '1') continue;

  const apt = l.slice(6, 10).trim();
  const procId = l.slice(13, 19).trim();
  const transId = l.slice(19, 25).trim();
  const seq = Number(l.slice(26, 29));
  const fixId = l.slice(29, 34).trim();
  const desc = l.slice(39, 43);
  const pathTerm = l.slice(47, 49).trim();
  const altDesc = l[82] === ' ' ? '' : l[82];
  const altRaw = l.slice(84, 89).trim();

  if (!apt || !procId) continue;

  const role = ROLE[desc[3]] ?? (desc[2] === 'S' ? 'SDF' : '');
  const pos = fixes.get(`${apt}/${fixId}`) ?? fixes.get(fixId) ?? null;

  const leg = {
    seq,
    fix: fixId || null,
    role: role || undefined,
    pt: pathTerm || undefined,
    alt: /^\d+$/.test(altRaw) ? Number(altRaw) : undefined,
    ad: altDesc || undefined,
    lat: pos?.lat,
    lon: pos?.lon,
  };
  for (const k of Object.keys(leg)) if (leg[k] === undefined) delete leg[k];

  if (!airports.has(apt)) airports.set(apt, new Map());
  const byProc = airports.get(apt);
  if (!byProc.has(procId)) byProc.set(procId, { transitions: new Map(), common: [] });
  const proc = byProc.get(procId);

  // A transition id starting with "A" names its IAF; a bare route-type letter
  // marks the common final/missed segment.
  if (transId.length > 1 && transId[0] === 'A') {
    const name = transId.slice(1);
    if (!proc.transitions.has(name)) proc.transitions.set(name, []);
    proc.transitions.get(name).push(leg);
  } else {
    proc.common.push(leg);
  }
}

// --- emit ------------------------------------------------------------------

const outDir = new URL('../data/proc/', import.meta.url);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const index = [];
let legCount = 0;

for (const [apt, byProc] of [...airports].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  const approaches = [];
  for (const [id, proc] of [...byProc].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const { name, rwy } = decodeApproach(id);
    const common = proc.common.sort((a, b) => a.seq - b.seq);
    // Everything through the missed approach point is the approach proper.
    const mapAt = common.findIndex((g) => g.role === 'MAP');
    const final = mapAt === -1 ? common : common.slice(0, mapAt + 1);
    const missed = mapAt === -1 ? [] : common.slice(mapAt + 1);

    const transitions = [...proc.transitions]
      .map(([tname, legs]) => ({ id: tname, legs: legs.sort((a, b) => a.seq - b.seq) }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));

    legCount += final.length + missed.length + transitions.reduce((n, t) => n + t.legs.length, 0);
    approaches.push({ id, name, rwy, transitions, final, missed });
  }
  if (!approaches.length) continue;
  writeFileSync(new URL(`./${apt}.json`, outDir), JSON.stringify({ apt, approaches }));
  index.push(apt);
}

writeFileSync(
  new URL('./index.json', outDir),
  JSON.stringify({
    source: 'FAA CIFP (ARINC 424-18), US Government work',
    airports: index,
  })
);

console.log(`airports=${index.length} legs=${legCount} fixes=${fixes.size}`);
