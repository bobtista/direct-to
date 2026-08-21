import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NavData } from '../src/navdata.js';
import { GNS } from '../src/gns.js';
import { Procedures } from '../src/procedures.js';
import { UNITS } from '../src/units.js';
import { IdentEntry } from '../src/ident.js';

const raw = JSON.parse(readFileSync(new URL('../data/navdata.json', import.meta.url), 'utf8'));
const db = new NavData(raw.waypoints);
const procIndex = JSON.parse(
  readFileSync(new URL('../data/proc/index.json', import.meta.url), 'utf8')
);
const procs = () =>
  new Procedures(new Set(procIndex.airports), async (apt) =>
    JSON.parse(readFileSync(new URL(`../data/proc/${apt}.json`, import.meta.url), 'utf8'))
  );

const gtn = (opts = {}) => new GNS(db, { unit: 'GTN650XI', ...opts });
const tap = (g, target) => g.handle({ type: 'touch', target });
const type = (g, word) => [...word].forEach((ch) => tap(g, `KEY_${ch}`));

test('the GTN profile is a touch unit with only its physical keys', () => {
  const u = UNITS.GTN650XI;
  assert.equal(u.family, 'GTN');
  const ids = u.regions.map((r) => r.id);
  assert.ok(ids.includes('HOME') && ids.includes('DTO'), 'the two hard keys');
  assert.ok(!ids.includes('CDI') && !ids.includes('FPL'), 'no soft key row on a touchscreen');
  assert.equal(u.bitmap, null, 'nothing to extract, so nothing to fall back to');
  assert.deepEqual(u.px, { w: 840, h: 372 });
});

test('typing on the keypad drives Spell’N’Find the same as the knobs', () => {
  const e = new IdentEntry(db);
  for (const ch of 'KJY') e.push(ch);
  assert.ok(e.match.id.startsWith('KJY'));
  e.push('O');
  assert.equal(e.value, 'KJYO');
  assert.equal(e.resolve().n, 'Leesburg Executive Airport');
  e.backspace();
  assert.equal(e.value.slice(0, 3), 'KJY');
  e.clear();
  assert.equal(e.value, '');
  assert.equal(e.match, null);
});

test('Direct-To: hard key opens the page, keypad spells, Activate flies it', () => {
  const g = gtn();
  assert.equal(g.view.gtn.page, 'HOME');

  g.handle({ type: 'press', key: 'DTO' });
  assert.equal(g.view.gtn.page, 'DTO');

  type(g, 'KGHG');
  assert.equal(g.view.gtn.dto.ident, 'KGHG');
  assert.equal(g.view.gtn.dto.match.id, 'KGHG');
  assert.ok(g.view.gtn.dtoInfo.dis > 0, 'shows bearing and distance before you commit');

  tap(g, 'DTO_ACTIVATE');
  assert.equal(g.view.nav.to, 'KGHG');
  assert.equal(g.view.gtn.page, 'MAP', 'lands you on the map, flying it');
});

test('Activate on an unresolved identifier is refused', () => {
  const g = gtn();
  g.handle({ type: 'press', key: 'DTO' });
  type(g, 'ZZZZZ');
  tap(g, 'DTO_ACTIVATE');
  assert.equal(g.view.message, 'INVALID WAYPOINT');
  assert.equal(g.view.nav, null);
  tap(g, 'MSG_OK');
  assert.equal(g.view.message, null);
});

test('backspace and clear work through the touch layer', () => {
  const g = gtn();
  g.handle({ type: 'press', key: 'DTO' });
  type(g, 'KJYO');
  tap(g, 'DTO_BKSP');
  assert.equal(g.view.gtn.dto.ident.startsWith('KJY'), true);
  tap(g, 'DTO_CLR');
  assert.equal(g.view.gtn.dto.ident, '');
});

test('home page apps navigate, and HOME returns', () => {
  const g = gtn();
  tap(g, 'APP_FPL');
  assert.equal(g.view.gtn.page, 'FPL');
  tap(g, 'APP_MAP');
  assert.equal(g.view.gtn.page, 'MAP');
  g.handle({ type: 'press', key: 'HOME' });
  assert.equal(g.view.gtn.page, 'HOME');
});

test('tapping a nearest airport pre-loads it into Direct-To', () => {
  const g = gtn();
  tap(g, 'APP_NRST');
  assert.equal(g.view.gtn.page, 'NRST');
  const first = g.view.nrst.rows[0].id;
  tap(g, `NRST_${first}`);
  assert.equal(g.view.gtn.page, 'DTO');
  assert.equal(g.view.gtn.dto.ident, first);
});

test('tapping a frequency flip-flops it', () => {
  const g = gtn();
  const before = { ...g.view.com };
  tap(g, 'COM_FF');
  assert.equal(g.view.com.active, before.standby);
  assert.equal(g.view.com.standby, before.active);
});

test('the approach flow works by tapping through the lists', async () => {
  const p = procs();
  const g = gtn({ procedures: p });
  g.flightPlan = [db.exact('KIAD'), db.exact('KJYO')];
  g.activateFlightPlan();
  await p.approaches('KJYO');

  tap(g, 'APP_PROC');
  assert.equal(g.view.gtn.page, 'PROC');
  assert.equal(g.view.proc.state, 'APPROACHES');

  const idx = g.view.proc.approaches.indexOf('RNAV 17');
  tap(g, `PROC_A_${idx}`);
  assert.equal(g.view.proc.state, 'TRANSITIONS');

  const tIdx = g.view.proc.transitions.indexOf('HOAGE');
  tap(g, `PROC_T_${tIdx}`);
  assert.equal(g.view.proc.state, 'CONFIRM');

  tap(g, 'PROC_ACTIVATE');
  assert.deepEqual(
    g.view.fpl.rows.map((r) => r.id),
    ['KIAD', 'HOAGE', 'KORNY', 'CACAS', 'DANMO', 'CEYAC', 'RW17']
  );
  assert.equal(g.view.gtn.page, 'FPL');
});

test('the knob units are unaffected by the touch layer', () => {
  const g = new GNS(db, { unit: 'GNS430' });
  assert.equal(g.isTouch, false);
  g.handle({ type: 'press', key: 'DTO' });
  assert.equal(g.view.mode, 'DTO', 'still the knob-driven direct-to page');
  assert.equal(g.view.family, 'GNS');
});
