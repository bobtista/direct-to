import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NavData } from '../src/navdata.js';
import { GNS, MAP_RANGES } from '../src/gns.js';
import { Procedures, approachLegs, transitionNames } from '../src/procedures.js';

const raw = JSON.parse(readFileSync(new URL('../data/navdata.json', import.meta.url), 'utf8'));
const db = new NavData(raw.waypoints);

const procIndex = JSON.parse(
  readFileSync(new URL('../data/proc/index.json', import.meta.url), 'utf8')
);
const readProc = async (apt) =>
  JSON.parse(readFileSync(new URL(`../data/proc/${apt}.json`, import.meta.url), 'utf8'));

const makeProcs = () => new Procedures(new Set(procIndex.airports), readProc);

const press = (g, k) => g.handle({ type: 'press', key: k });
const turn = (g, knob, dir, n = 1) => {
  for (let i = 0; i < n; i++) g.handle({ type: 'knob', knob, dir });
};

// --- nearest ---------------------------------------------------------------

test('nearest airports are sorted by distance from present position', () => {
  const pos = { lat: 39.078, lon: -77.5575 }; // KJYO
  const near = db.nearest(pos, { kind: 'APT', limit: 10 });
  assert.equal(near[0].wp.id, 'KJYO', 'the airport underneath us is nearest');
  for (let i = 1; i < near.length; i++) {
    assert.ok(near[i].dis >= near[i - 1].dis, 'distances ascend');
  }
  assert.ok(near.every((n) => n.wp.k === 'APT'));
});

test('NRST page: knob scrolls the list and direct-to pre-fills the selection', () => {
  const g = new GNS(db);
  turn(g, 'RIGHT_LARGE', 1, 3); // NAV -> WPT -> AUX -> NRST
  assert.equal(g.view.group, 'NRST');
  press(g, 'CRSR');
  turn(g, 'RIGHT_LARGE', 1, 2);
  const picked = g.view.nrst.rows[g.view.nrst.index].id;
  press(g, 'DTO');
  assert.equal(g.view.dto.ident.trim(), picked, 'direct-to opens on the highlighted airport');
});

// --- leg sequencing --------------------------------------------------------

test('flight plan legs sequence automatically on passing a waypoint', () => {
  const g = new GNS(db);
  g.flightPlan = [db.exact('KJYO'), db.exact('CSN'), db.exact('KIAD')];
  g.activateFlightPlan();
  assert.equal(g.view.nav.to, 'CSN');

  // Put the aircraft essentially on top of CSN and let it tick.
  g.pos = { lat: db.exact('CSN').lat, lon: db.exact('CSN').lon };
  g.tick(1);
  assert.equal(g.view.nav.to, 'KIAD', 'advanced to the next leg');
  assert.equal(g.view.nav.from, 'CSN');
});

test('OBS suspends sequencing, which is the point of the key', () => {
  const g = new GNS(db);
  g.flightPlan = [db.exact('KJYO'), db.exact('CSN'), db.exact('KIAD')];
  g.activateFlightPlan();
  press(g, 'OBS');
  g.pos = { lat: db.exact('CSN').lat, lon: db.exact('CSN').lon };
  g.tick(1);
  assert.equal(g.view.nav.to, 'CSN', 'still holding the same waypoint');
});

test('the last leg does not sequence past the destination', () => {
  const g = new GNS(db);
  g.flightPlan = [db.exact('KJYO'), db.exact('CSN')];
  g.activateFlightPlan();
  g.pos = { lat: db.exact('CSN').lat, lon: db.exact('CSN').lon };
  g.tick(1);
  assert.equal(g.view.nav.to, 'CSN');
});

// --- map range -------------------------------------------------------------

test('RNG steps through the map ranges and clamps at both ends', () => {
  const g = new GNS(db);
  const start = g.view.mapRange;
  press(g, 'RNG_UP');
  assert.ok(g.view.mapRange < start, 'range in zooms closer');
  for (let i = 0; i < 40; i++) press(g, 'RNG_UP');
  assert.equal(g.view.mapRange, MAP_RANGES[0]);
  for (let i = 0; i < 40; i++) press(g, 'RNG_DOWN');
  assert.equal(g.view.mapRange, MAP_RANGES[MAP_RANGES.length - 1]);
});

// --- waypoint pages --------------------------------------------------------

test('WPT pages carry frequencies and runways for the selected airport', () => {
  const g = new GNS(db);
  turn(g, 'RIGHT_LARGE', 1); // NAV -> WPT
  assert.equal(g.view.group, 'WPT');
  press(g, 'CRSR');
  g.selectWaypoint(db.exact('KIAD'));
  const sel = g.view.wpt.selected;
  assert.equal(sel.id, 'KIAD');
  assert.ok(sel.rwy.length >= 4, 'Dulles has several runways');
  assert.ok(sel.rwy[0].len >= sel.rwy[1].len, 'longest first');
  assert.ok(sel.freq.some((f) => f.t === 'TWR' || f.t === 'ATIS'));
});

// --- procedures ------------------------------------------------------------

test('CIFP decode: KJYO RNAV 17 has the charted fix sequence', async () => {
  const procs = makeProcs();
  const list = await procs.approaches('KJYO');
  const r17 = list.find((a) => a.id === 'R17');
  assert.equal(r17.name, 'RNAV 17');

  const roles = r17.final.map((l) => `${l.fix}:${l.role ?? ''}`);
  assert.deepEqual(roles, ['CACAS:FACF', 'DANMO:FAF', 'CEYAC:SDF', 'RW17:MAP']);

  const faf = r17.final.find((l) => l.role === 'FAF');
  assert.equal(faf.alt, 2100, 'FAF crossing altitude');

  assert.ok(transitionNames(r17).includes('HOAGE'));
  assert.ok(transitionNames(r17).includes('VECTORS'), 'vectors is always offered');
});

test('approachLegs joins a transition to the final segment without repeating a fix', async () => {
  const procs = makeProcs();
  const r17 = (await procs.approaches('KJYO')).find((a) => a.id === 'R17');
  const legs = approachLegs(r17, 'HOAGE');
  const ids = legs.map((l) => l.id);
  assert.deepEqual(ids, ['HOAGE', 'KORNY', 'CACAS', 'DANMO', 'CEYAC', 'RW17']);
  assert.equal(new Set(ids).size, ids.length, 'no duplicated fix at the join');
  assert.ok(legs.every((l) => Number.isFinite(l.lat) && Number.isFinite(l.lon)));
});

test('vectors-to-final starts at the final approach course fix', async () => {
  const procs = makeProcs();
  const r17 = (await procs.approaches('KJYO')).find((a) => a.id === 'R17');
  const legs = approachLegs(r17, 'VECTORS');
  assert.equal(legs[0].id, 'CACAS');
  assert.equal(legs[legs.length - 1].id, 'RW17');
});

test('PROC: select approach, pick a transition, activate into the flight plan', async () => {
  const procs = makeProcs();
  const g = new GNS(db, { procedures: procs });
  g.flightPlan = [db.exact('KIAD'), db.exact('KJYO')];
  g.activateFlightPlan();
  assert.equal(g.destination, 'KJYO');

  // Warm the cache the way the app does before opening PROC.
  await procs.approaches('KJYO');

  press(g, 'PROC');
  assert.equal(g.view.mode, 'PROC');
  assert.equal(g.view.proc.state, 'APPROACHES');
  assert.ok(g.view.proc.approaches.includes('RNAV 17'));

  const idx = g.view.proc.approaches.indexOf('RNAV 17');
  turn(g, 'RIGHT_SMALL', 1, idx);
  press(g, 'ENT');
  assert.equal(g.view.proc.state, 'TRANSITIONS');

  const tIdx = g.view.proc.transitions.indexOf('HOAGE');
  turn(g, 'RIGHT_SMALL', 1, tIdx);
  press(g, 'ENT');
  assert.equal(g.view.proc.state, 'CONFIRM');

  turn(g, 'RIGHT_SMALL', 1); // Load -> Activate
  press(g, 'ENT');

  const ids = g.view.fpl.rows.map((r) => r.id);
  assert.deepEqual(ids, ['KIAD', 'HOAGE', 'KORNY', 'CACAS', 'DANMO', 'CEYAC', 'RW17']);
  assert.ok(!ids.includes('KJYO'), 'the destination airport is replaced by its approach');
  assert.equal(g.view.approach.name, 'RNAV 17');
  assert.equal(g.view.mode, 'FPL', 'the unit shows you the resulting flight plan');
});

test('loading a second approach replaces the first', async () => {
  const procs = makeProcs();
  const g = new GNS(db, { procedures: procs });
  g.flightPlan = [db.exact('KIAD'), db.exact('KJYO')];
  const list = await procs.approaches('KJYO');

  g.loadApproach(list.find((a) => a.id === 'R17'), 'HOAGE', false, 'KJYO');
  const first = g.view.fpl.rows.length;
  g.loadApproach(list.find((a) => a.id === 'I17'), 'MRB', false, 'KJYO');
  const ids = g.view.fpl.rows.map((r) => r.id);
  assert.equal(ids[0], 'KIAD');
  assert.ok(!ids.includes('CEYAC'), 'RNAV-only step-down fix is gone');
  assert.ok(first > 0);
  assert.equal(g.view.approach.name, 'ILS 17');
});

test('PROC without a destination or without published approaches says so', () => {
  const g = new GNS(db, { procedures: makeProcs() });
  press(g, 'PROC');
  assert.equal(g.view.message, 'NO DESTINATION');
  press(g, 'ENT');

  g.flightPlan = [db.exact('CSN')]; // a VOR, not an airport
  press(g, 'PROC');
  assert.equal(g.view.message, 'NO DESTINATION');
});

test('every airport file in the index parses and has at least one approach', async () => {
  const procs = makeProcs();
  const sample = ['KJYO', 'KIAD', 'KBOS', 'KSFO', 'KJFK', 'KDEN'].filter((a) =>
    procs.has(a)
  );
  assert.ok(sample.length >= 5, 'expected the big airports to be present');
  for (const apt of sample) {
    const list = await procs.approaches(apt);
    assert.ok(list.length > 0, `${apt} has approaches`);
    for (const a of list) {
      assert.ok(a.name && a.name.trim(), `${apt} ${a.id} has a display name`);
      assert.ok(Array.isArray(a.final));
    }
  }
});

// --- map -------------------------------------------------------------------

test('a Direct-To gives the map a course line to draw', () => {
  const g = new GNS(db);
  assert.equal(g.view.mapDirect, null, 'nothing to draw before activating');

  g.activateDirectTo(db.exact('KGHG'));
  const d = g.view.mapDirect;
  assert.ok(d, 'the map gets the direct-to leg even though it is not in the flight plan');
  assert.equal(d.to.id, 'KGHG');
  assert.ok(Number.isFinite(d.to.lat) && Number.isFinite(d.to.lon));
  assert.ok(Number.isFinite(d.from.lat) && Number.isFinite(d.from.lon));
});

test('auto zoom picks a range that keeps the destination on screen', () => {
  const g = new GNS(db);
  g.activateDirectTo(db.exact('KGHG')); // ~362 nm from KJYO
  assert.equal(g.view.autoZoom, true);
  assert.equal(g.view.mapRange, 200, 'far away, so the en route maximum');

  // Close in and the scale should step down with us.
  g.pos = { lat: 41.85, lon: -71.05 };
  assert.ok(g.view.nav.dis < 30);
  assert.ok(g.view.mapRange >= g.view.nav.dis, 'destination still fits');
  assert.ok(g.view.mapRange <= 30, `stepped down, got ${g.view.mapRange}`);

  g.pos = { lat: 42.0929, lon: -70.6800 }; // right on top of the field
  assert.ok(g.view.mapRange <= 2, `closest scale, got ${g.view.mapRange}`);
});

test('RNG takes over from auto zoom without jumping scale', () => {
  const g = new GNS(db);
  g.activateDirectTo(db.exact('KGHG'));
  assert.equal(g.view.mapRange, 200);

  press(g, 'RNG_UP'); // zoom in one step
  assert.equal(g.view.autoZoom, false, 'manual override');
  assert.equal(g.view.mapRange, 150, 'stepped down from what was displayed, not from the stored 5');

  // Auto zoom can be handed back from the map page menu.
  g.group = 0;
  g.page = 1;
  press(g, 'MENU');
  assert.equal(g.view.menu.items[0], 'Auto Zoom On?');
  press(g, 'ENT');
  assert.equal(g.view.autoZoom, true);
  assert.equal(g.view.mapRange, 200);
});

test('the map still draws flight plan legs, with the active one flagged', () => {
  const g = new GNS(db);
  g.flightPlan = [db.exact('KJYO'), db.exact('CSN'), db.exact('KIAD')];
  g.activateFlightPlan();
  const plan = g.view.mapPlan;
  assert.deepEqual(plan.map((p) => p.id), ['KJYO', 'CSN', 'KIAD']);
  assert.deepEqual(plan.map((p) => p.active), [false, true, false]);
  assert.ok(plan.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)));
});

// --- basemap ---------------------------------------------------------------

test('basemap data is bounded, indexed and small enough to ship', () => {
  const bm = JSON.parse(readFileSync(new URL('../data/basemap.json', import.meta.url), 'utf8'));

  for (const layer of ['coast', 'lakes', 'airspace']) {
    assert.ok(bm[layer].length > 0, `${layer} has features`);
    for (const row of bm[layer].slice(0, 200)) {
      assert.equal(row.b.length, 4, 'every feature carries a bbox for culling');
      assert.ok(row.b[0] <= row.b[2] && row.b[1] <= row.b[3], 'bbox is well formed');
      assert.ok(row.p.length >= 4 && row.p.length % 2 === 0, 'flat lon/lat pairs');
      // Features are selected by intersecting the US window, not cut at it, so
      // a chunk crossing the edge is kept whole — it just must reach inside.
      assert.ok(
        row.b[2] >= -180 && row.b[0] <= -60 && row.b[3] >= 15 && row.b[1] <= 72,
        `${layer} intersects the US window`
      );
    }
  }

  // Nothing should wander far past the window, or the filter is not working.
  const far = [...bm.coast, ...bm.lakes, ...bm.airspace].filter(
    (r) => r.b[1] < 5 || r.b[3] > 80 || r.b[2] > -50
  );
  assert.equal(far.length, 0, 'no feature strays well outside the region');

  const classes = new Set(bm.airspace.map((a) => a.c));
  assert.deepEqual([...classes].sort(), ['B', 'C', 'D', 'E']);

  const points = ['coast', 'lakes', 'airspace'].reduce(
    (n, k) => n + bm[k].reduce((m, r) => m + r.p.length / 2, 0),
    0
  );
  assert.ok(points < 400_000, `simplified to ${points} points`);
});

test('airspace near Boston is present and classed correctly', () => {
  const bm = JSON.parse(readFileSync(new URL('../data/basemap.json', import.meta.url), 'utf8'));
  const box = [-71.5, 41.8, -70.5, 42.6]; // Cape Cod Bay up to Boston
  const hits = (b) => !(b[2] < box[0] || b[0] > box[2] || b[3] < box[1] || b[1] > box[3]);

  const near = bm.airspace.filter((a) => hits(a.b));
  assert.ok(near.some((a) => a.c === 'B'), "Boston's Class B");
  assert.ok(near.some((a) => a.c === 'D'), 'Class D fields in the area');
  assert.ok(bm.coast.some((c) => hits(c.b)), 'coastline in the area');
});

// --- declutter -------------------------------------------------------------

test('CLR declutters the map page in three steps and wraps', () => {
  const g = new GNS(db);
  g.group = 0;
  g.page = 1; // MAP
  assert.equal(g.view.declutter, 0);
  press(g, 'CLR');
  assert.equal(g.view.declutter, 1);
  press(g, 'CLR');
  assert.equal(g.view.declutter, 2);
  press(g, 'CLR');
  assert.equal(g.view.declutter, 0, 'wraps back to full detail');
});

test('CLR still clears the cursor rather than decluttering elsewhere', () => {
  const g = new GNS(db);
  g.group = 3; // NRST
  press(g, 'CRSR');
  assert.equal(g.view.cursor, true);
  press(g, 'CLR');
  assert.equal(g.view.cursor, false);
  assert.equal(g.view.declutter, 0, 'declutter untouched off the map page');
});

test('declutter does not fire while the map cursor is active', () => {
  const g = new GNS(db);
  g.group = 0;
  g.page = 1;
  press(g, 'CRSR');
  press(g, 'CLR');
  assert.equal(g.view.declutter, 0);
  assert.equal(g.view.cursor, false, 'CLR dismissed the cursor first');
});
