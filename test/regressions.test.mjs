// Regression tests for issues found in code review. Each one failed before its
// fix; the comment says what the symptom was.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { NavData, distanceNm, crossTrackNm } from '../src/navdata.js';
import { GNS } from '../src/gns.js';
import { Procedures } from '../src/procedures.js';
import { renderScreen } from '../src/screen.js';

const raw = JSON.parse(readFileSync(new URL('../data/navdata.json', import.meta.url), 'utf8'));
const db = new NavData(raw.waypoints);
const procIndex = JSON.parse(
  readFileSync(new URL('../data/proc/index.json', import.meta.url), 'utf8')
);
const readProc = async (apt) =>
  JSON.parse(readFileSync(new URL(`../data/proc/${apt}.json`, import.meta.url), 'utf8'));
const procs = () => new Procedures(new Set(procIndex.airports), readProc);

const press = (g, k) => g.handle({ type: 'press', key: k });
const turn = (g, knob, dir) => g.handle({ type: 'knob', knob, dir });

// --- the CDI needle --------------------------------------------------------

test('the CDI needle deflects toward the course, not toward the aircraft', () => {
  // A course due north, aircraft east of it — i.e. right of course.
  const from = { id: 'A', lat: 40, lon: -75 };
  const to = { id: 'B', lat: 41, lon: -75 };
  const g = new GNS(db);
  g.flightPlan = [from, to];
  g.activateFlightPlan();
  g.pos = { lat: 40.5, lon: -74.95 };

  assert.ok(crossTrackNm(from, to, g.pos) > 0, 'positive cross-track means right of course');

  const html = renderScreen(g.view);
  // Needle x against the centre of the CDI box; right of course must draw left.
  const needle = [...html.matchAll(/left:([-\d.]+)px;top:6px;font-size:13px/g)].map((m) =>
    Number(m[1])
  );
  assert.equal(needle.length, 1, 'found the needle');
  const centre = 65 + (240 - 65 - 2) / 2 - 6; // DATA_X + DATA_W/2, less half the glyph box
  assert.ok(needle[0] < centre, `needle at ${needle[0]} should be left of centre ${centre}`);
});

// --- flight plan integrity --------------------------------------------------

test('deleting a row above the active leg keeps the same waypoint active', () => {
  const g = new GNS(db);
  g.flightPlan = [db.exact('KIAD'), db.exact('CSN'), db.exact('KJYO')];
  g.activateFlightPlan();
  assert.equal(g.view.nav.to, 'CSN');

  press(g, 'FPL');
  press(g, 'CRSR');
  g.fplCursorRow = 0; // the row above the active leg
  press(g, 'CLR');

  assert.deepEqual(g.view.fpl.rows.map((r) => r.id), ['CSN', 'KJYO']);
  assert.equal(g.view.nav.to, 'CSN', 'still navigating to the same fix');
});

test('loading a shorter approach does not strand the active leg past the end', async () => {
  const p = procs();
  const g = new GNS(db, { procedures: p });
  g.flightPlan = [db.exact('KIAD'), db.exact('KJYO')];
  const list = await p.approaches('KJYO');

  g.loadApproach(list.find((a) => a.id === 'R17'), 'HOAGE', true, 'KJYO');
  assert.ok(g.view.nav, 'navigating the approach');

  g.loadApproach(list.find((a) => a.id === 'I17'), 'VECTORS', false, 'KJYO');
  assert.ok(g.legIndex < g.flightPlan.length, 'active leg still inside the plan');
  assert.ok(g.view.nav, 'navigation did not silently die');
});

test('activating an approach goes active on the transition fix, not the one after', async () => {
  const p = procs();
  const g = new GNS(db, { procedures: p });
  const list = await p.approaches('KJYO');
  g.loadApproach(list.find((a) => a.id === 'R17'), 'HOAGE', true, 'KJYO');
  assert.equal(g.view.nav.to, 'HOAGE', 'the IAF the pilot chose');
});

test('PROC still finds the destination after an approach is loaded', async () => {
  const p = procs();
  const g = new GNS(db, { procedures: p });
  g.flightPlan = [db.exact('KIAD'), db.exact('KJYO')];
  g.activateFlightPlan();
  const list = await p.approaches('KJYO');
  g.loadApproach(list.find((a) => a.id === 'R17'), 'HOAGE', true, 'KJYO');

  assert.equal(g.destination, 'KJYO', 'the airport is remembered, not re-derived');
  press(g, 'PROC');
  assert.equal(g.view.mode, 'PROC', 'can pick a different approach');
  assert.notEqual(g.view.message, 'NO DESTINATION');
});

// --- procedures -------------------------------------------------------------

test('an airport cached with no approaches reports it instead of throwing', async () => {
  const p = new Procedures(new Set(['KZZZ']), async () => ({ approaches: [] }));
  const g = new GNS(db, { procedures: p });
  g.flightPlan = [db.exact('KJYO')];
  await p.approaches('KZZZ'); // caches []

  g.approach = { apt: 'KZZZ' };
  press(g, 'PROC');
  assert.equal(g.view.message, 'NO PROCEDURES');
  assert.doesNotThrow(() => press(g, 'ENT'), 'ENT must not throw on an empty list');
});

// --- direct-to --------------------------------------------------------------

test('editing the identifier after ENT returns to spelling', () => {
  const g = new GNS(db);
  press(g, 'DTO');
  for (let i = 0; i < 40 && g.view.dto.ident[0] !== 'K'; i++) turn(g, 'RIGHT_SMALL', 1);
  press(g, 'ENT');
  assert.equal(g.view.dto.phase, 'ACTIVATE');
  turn(g, 'RIGHT_SMALL', 1);
  assert.equal(g.view.dto.phase, 'IDENT', 'touching the knob reopens the entry');
});

// --- map ranges -------------------------------------------------------------

test('turning auto zoom off keeps the scale that was on screen', () => {
  const g = new GNS(db);
  g.activateDirectTo(db.exact('KGHG'));
  assert.equal(g.view.mapRange, 200, 'auto picked the en route scale');

  g.group = 0;
  g.page = 1; // MAP
  g.declutter = 2;
  press(g, 'MENU');
  assert.equal(g.view.menu.items[0], 'Auto Zoom Off?');
  press(g, 'ENT');

  assert.equal(g.view.autoZoom, false);
  assert.equal(g.view.mapRange, 200, 'no jump back to the stored default');
  assert.equal(g.view.declutter, 2, 'the pilot’s map detail is untouched');
});

// --- procedure data ---------------------------------------------------------

test('no approach leg sits absurdly far from its own airport', () => {
  const apts = new Map(raw.waypoints.filter((w) => w.k === 'APT').map((w) => [w.id, w]));
  const sample = procIndex.airports.filter((_, i) => i % 7 === 0); // ~430 airports
  let worst = 0;
  let worstAt = '';
  for (const apt of sample) {
    const home = apts.get(apt);
    if (!home) continue;
    const data = JSON.parse(
      readFileSync(new URL(`../data/proc/${apt}.json`, import.meta.url), 'utf8')
    );
    for (const a of data.approaches) {
      const legs = [...a.final, ...a.missed, ...a.transitions.flatMap((t) => t.legs)];
      for (const l of legs) {
        if (l.lat == null) continue;
        const d = distanceNm(home, l);
        if (d > worst) {
          worst = d;
          worstAt = `${apt} ${a.name} ${l.fix}`;
        }
      }
    }
  }
  assert.ok(worst < 150, `worst leg was ${worst.toFixed(0)} nm at ${worstAt}`);
});

test('every procedure file parses and names its approaches', () => {
  const files = readdirSync(new URL('../data/proc/', import.meta.url)).filter(
    (f) => f !== 'index.json'
  );
  assert.equal(files.length, procIndex.airports.length, 'index matches the files on disk');
});
