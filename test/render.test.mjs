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
import { renderGtnScreen } from '../src/gtnscreen.js';
import { setBasemap } from '../src/mapdraw.js';

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
