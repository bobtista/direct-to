// Rendering smoke tests.
//
// The state machine tests never call a renderer, so a missing import or a
// renamed helper can pass every other test and still leave a page blank in the
// browser. These walk every page of every unit and assert real output.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NavData } from '../src/navdata.js';
import { GNS, PAGE_GROUPS } from '../src/gns.js';
import { UNITS } from '../src/units.js';
import { renderScreen } from '../src/screen.js';
import { eventForRegion, KEYBOARD } from '../src/bezel.js';
import { renderGtnScreen } from '../src/gtnscreen.js';
import { setBasemap, mapLayers, projector } from '../src/mapdraw.js';

const raw = JSON.parse(readFileSync(new URL('../data/navdata.json', import.meta.url), 'utf8'));
const db = new NavData(raw.waypoints);
setBasemap(JSON.parse(readFileSync(new URL('../data/basemap.json', import.meta.url), 'utf8')));

/** A unit with an active leg, a plan and a map worth drawing. */
function flying(unitId) {
  const g = new GNS(db, { unit: unitId, start: { lat: 41.85, lon: -70.75 } });
  g.flightPlan = [db.exact('KIAD'), db.exact('CSN'), db.exact('KGHG')];
  g.activateFlightPlan();
  return g;
}

const render = (g) => (g.view.family === 'GTN' ? renderGtnScreen(g.view) : renderScreen(g.view));

test('every faceplate drawing produces SVG', () => {
  for (const [id, u] of Object.entries(UNITS)) {
    const svg = u.art();
    assert.ok(svg.startsWith('<svg'), `${id} draws an svg`);
    assert.ok(svg.length > 3000, `${id} svg has real content`);
    assert.ok(svg.includes(`viewBox="0 0 ${u.bezel.w} ${u.bezel.h}"`), `${id} viewBox matches profile`);
  }
});

test('GNS units render every page in every group without throwing', () => {
  for (const id of ['GNS430', 'GNS530']) {
    for (let gi = 0; gi < PAGE_GROUPS.length; gi++) {
      for (let pi = 0; pi < PAGE_GROUPS[gi].pages.length; pi++) {
        const g = flying(id);
        g.group = gi;
        g.page = pi;
        const html = render(g);
        assert.ok(html.length > 200, `${id} ${PAGE_GROUPS[gi].pages[pi]} rendered`);
      }
    }
  }
});

test('the GNS map page actually draws its layers', () => {
  for (const id of ['GNS430', 'GNS530']) {
    const g = flying(id);
    g.group = 0;
    g.page = 1; // MAP
    g.autoZoom = false;
    g.mapRange = 30;
    const html = render(g);
    assert.ok(html.includes('<svg'), `${id} map emits an svg`);
    // Coastline, airspace and the flight plan legs all live in that svg.
    const paths = (html.match(/<path/g) ?? []).length;
    assert.ok(paths >= 3, `${id} map drew ${paths} paths, expected basemap + legs`);
    assert.ok(html.includes('m-coast'), `${id} map drew coastline`);
  }
});

test('GNS modal pages render', () => {
  for (const mode of ['DTO', 'FPL']) {
    const g = flying('GNS430');
    g.handle({ type: 'press', key: mode === 'DTO' ? 'DTO' : 'FPL' });
    assert.ok(render(g).length > 200, `${mode} rendered`);
  }
  const g = flying('GNS430');
  g.handle({ type: 'press', key: 'FPL' });
  g.handle({ type: 'press', key: 'MENU' });
  assert.ok(render(g).includes('PAGE MENU'), 'menu rendered over the flight plan');
});

test('the GTN renders every page it offers', () => {
  const pages = ['HOME', 'DTO', 'MAP', 'FPL', 'NRST', 'WPT', 'TRAFFIC'];
  for (const page of pages) {
    const g = flying('GTN650XI');
    g.gtn.page = page;
    if (page === 'DTO') g.handle({ type: 'press', key: 'DTO' });
    const html = render(g);
    assert.ok(html.length > 200, `GTN ${page} rendered`);
    assert.ok(html.includes('data-touch'), `GTN ${page} offers touch targets`);
  }
});

test('the GTN map draws its layers too', () => {
  const g = flying('GTN650XI');
  g.gtn.page = 'MAP';
  g.autoZoom = false;
  g.mapRange = 30;
  const html = render(g);
  assert.ok(html.includes('m-coast'), 'GTN map drew coastline');
  assert.ok((html.match(/<path/g) ?? []).length >= 3);
});

test('a message overlay renders on both families', () => {
  for (const id of ['GNS430', 'GTN650XI']) {
    const g = flying(id);
    g.message = 'TEST MESSAGE';
    assert.ok(render(g).includes('TEST MESSAGE'), `${id} shows messages`);
  }
});

test('every hit region on every unit maps to an event', () => {
  for (const [id, u] of Object.entries(UNITS)) {
    for (const r of u.regions) {
      assert.ok(eventForRegion(r.id), `${id}: region ${r.id} has no event mapping`);
    }
  }
});

test('every keyboard binding targets a region some unit actually has', () => {
  const known = new Set(Object.values(UNITS).flatMap((u) => u.regions.map((r) => r.id)));
  for (const [key, id] of Object.entries(KEYBOARD)) {
    assert.ok(known.has(id), `key "${key}" maps to ${id}, which no unit has`);
    assert.ok(eventForRegion(id), `key "${key}" maps to ${id}, which has no event`);
  }
});

test('the moving map draws nothing until a basemap is supplied', () => {
  // The geometry lives in a module-level store. Say Again rendered an empty
  // black box for exactly this reason: it never called setBasemap, so every
  // layer came back empty however good the position was.
  const opts = {
    pos: { lat: 42.19, lon: -71.17 },
    trk: 0,
    range: 30,
    box: { x: 0, y: 0, w: 240, h: 128 },
  };

  setBasemap({ coast: [], lakes: [], airspace: [] });
  const bare = mapLayers(opts);
  // The range ring is drawn from the aircraft, not from map data, so it shows
  // up either way — it was the only thing on screen when this was broken.
  assert.match(bare, /m-ring/);
  assert.doesNotMatch(bare, /<path/, 'no basemap means no geography');

  // Each feature is a bounding box for culling plus a flat lon/lat run.
  setBasemap({
    coast: [{ b: [-71.5, 42.0, -70.0, 42.5], p: [-71.5, 42.0, -70.5, 42.5, -70.0, 42.2] }],
    lakes: [],
    airspace: [],
  });
  assert.match(mapLayers(opts), /<path/, 'a coastline should reach the screen');

  setBasemap({ coast: [], lakes: [], airspace: [] });
});

test('the map can be flown north-up, and says which it is', () => {
  // Track-up is the 430's default and it is authentic, but it rotates an
  // unfamiliar area into something unreadable — and while parked, the track it
  // rotates to is meaningless.
  const g = new GNS(new NavData([{ id: 'KPYM', lat: 41.909, lon: -70.729, kind: 'APT' }]));
  g.pos = { lat: 42.1905, lon: -71.1729 };
  g.track = 170;
  g.group = 0;
  g.page = 1;

  assert.match(renderScreen(g.view), /TRK UP/);

  const press = (key) => g.handle({ type: 'press', key });
  press('MENU');
  const items = g.view.menu.items;
  assert.ok(items.includes('North Up?'), `expected a north-up option, got ${items.join(', ')}`);
  g.menu.sel = items.indexOf('North Up?');
  press('ENT');

  assert.equal(g.mapNorthUp, true);
  assert.match(renderScreen(g.view), /NORTH UP/);

  // And it offers the way back.
  press('MENU');
  assert.ok(g.view.menu.items.includes('Track Up?'));
});

test('north-up stops the world rotating under the aeroplane', () => {
  const opts = {
    pos: { lat: 42.19, lon: -71.17 },
    range: 60,
    box: { x: 0, y: 0, w: 240, h: 128 },
  };
  const to = (trk) => projector({ ...opts, trk });

  // A point due south should render below the aircraft when north is up.
  const south = [-71.17, 41.69];
  const [, yNorthUp] = to(0)(...south);
  assert.ok(yNorthUp > 64, 'due south should be below centre on a north-up map');

  // Facing south, the same point is ahead of you, so it moves above centre.
  const [, yTrackUp] = to(180)(...south);
  assert.ok(yTrackUp < 64, 'due south should be ahead when tracking south');
});
