import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NavData, distanceNm, bearingDeg } from '../src/navdata.js';
import { GNS, PAGE_GROUPS } from '../src/gns.js';

const raw = JSON.parse(readFileSync(new URL('../data/navdata.json', import.meta.url), 'utf8'));
const db = new NavData(raw.waypoints);

const press = (g, key) => g.handle({ type: 'press', key });
const turn = (g, knob, dir, n = 1) => {
  for (let i = 0; i < n; i++) g.handle({ type: 'knob', knob, dir });
};
/** Spin the small right knob until the character at the cursor is `ch`. */
const spellChar = (g, ch) => {
  for (let i = 0; i < 40; i++) {
    if (g.view.dto.ident[g.view.dto.i] === ch) return;
    turn(g, 'RIGHT_SMALL', 1);
  }
  assert.fail(`could not spell ${ch}`);
};

test('navdata: KJYO and CSN are present with sane coordinates', () => {
  const kjyo = db.exact('KJYO');
  assert.equal(kjyo.n, 'Leesburg Executive Airport');
  const csn = db.exact('CSN');
  assert.equal(csn.k, 'VOR');
  // KJYO -> CSN is roughly 31 nm on a south-southwesterly heading.
  const d = distanceNm(kjyo, csn);
  assert.ok(d > 28 && d < 34, `distance was ${d}`);
  const b = bearingDeg(kjyo, csn);
  assert.ok(b > 180 && b < 220, `bearing was ${b}`);
});

test("Spell'N'Find fills trailing characters from the first match", () => {
  const g = new GNS(db);
  press(g, 'DTO');
  assert.equal(g.view.mode, 'DTO');
  spellChar(g, 'K');
  // One character typed: the rest auto-fills from the first K* entry.
  const ident = g.view.dto.ident;
  assert.equal(ident[0], 'K');
  assert.ok(g.view.dto.match.id.startsWith('K'));
  assert.equal(ident.trim(), g.view.dto.match.id);
});

test('Direct-To to KJYO: spell, ENT to confirm, ENT to activate', () => {
  const g = new GNS(db, { start: { lat: 38.9445, lon: -77.4558 } }); // KIAD
  press(g, 'DTO');

  for (const ch of 'KJYO') {
    spellChar(g, ch);
    turn(g, 'RIGHT_LARGE', 1);
  }
  assert.equal(g.view.dto.ident.trim(), 'KJYO');

  press(g, 'ENT');
  assert.equal(g.view.dto.phase, 'ACTIVATE', 'first ENT confirms the identifier');

  press(g, 'ENT');
  assert.equal(g.view.mode, 'PAGE');
  assert.equal(g.view.page, 'DEFAULT_NAV', 'activating drops you on the default NAV page');
  assert.equal(g.view.nav.to, 'KJYO');
  assert.ok(g.view.nav.dis > 5 && g.view.nav.dis < 20, `distance ${g.view.nav.dis}`);
});

test('large right knob moves the character cursor, not the page group', () => {
  const g = new GNS(db);
  press(g, 'DTO');
  assert.equal(g.view.dto.i, 0);
  turn(g, 'RIGHT_LARGE', 1);
  assert.equal(g.view.dto.i, 1);
  assert.equal(g.view.mode, 'DTO', 'still on the direct-to page');
});

test('backing the cursor up re-opens the earlier character for editing', () => {
  const g = new GNS(db);
  press(g, 'DTO');
  spellChar(g, 'K');
  turn(g, 'RIGHT_LARGE', 1);
  spellChar(g, 'J');
  assert.ok(g.view.dto.ident.startsWith('KJ'));
  turn(g, 'RIGHT_LARGE', -1);
  assert.equal(g.view.dto.i, 0);
  spellChar(g, 'L');
  assert.equal(g.view.dto.ident[0], 'L');
  assert.ok(g.view.dto.match.id.startsWith('L'), 'match follows the edited prefix');
});

test('an unknown identifier is rejected rather than activated', () => {
  const g = new GNS(db);
  press(g, 'DTO');
  for (const ch of 'ZZZZZ') {
    spellChar(g, ch);
    turn(g, 'RIGHT_LARGE', 1);
  }
  press(g, 'ENT');
  assert.equal(g.view.message, 'INVALID WAYPOINT');
  assert.equal(g.view.nav, null, 'nothing was activated');
});

test('CLR backs out of the activate step, then out of the page', () => {
  const g = new GNS(db);
  press(g, 'DTO');
  spellChar(g, 'K');
  press(g, 'ENT');
  assert.equal(g.view.dto.phase, 'ACTIVATE');
  press(g, 'CLR');
  assert.equal(g.view.dto.phase, 'IDENT');
  press(g, 'CLR');
  assert.equal(g.view.mode, 'PAGE');
});

test('direct-to pre-fills the current destination so ENT ENT re-centres', () => {
  const g = new GNS(db);
  g.activateDirectTo(db.exact('KJYO'));
  press(g, 'DTO');
  assert.equal(g.view.dto.ident.trim(), 'KJYO');
  press(g, 'ENT');
  press(g, 'ENT');
  assert.equal(g.view.nav.to, 'KJYO');
});

test('page groups: large knob selects the group, small knob the page', () => {
  const g = new GNS(db);
  assert.equal(g.view.group, 'NAV');
  turn(g, 'RIGHT_LARGE', 1);
  assert.equal(g.view.group, PAGE_GROUPS[1].id);
  turn(g, 'RIGHT_LARGE', -1);
  assert.equal(g.view.group, 'NAV');
  turn(g, 'RIGHT_SMALL', 1);
  assert.equal(g.view.page, 'MAP');
});

test('press and hold CLR returns to the default NAV page', () => {
  const g = new GNS(db);
  turn(g, 'RIGHT_LARGE', 1);
  turn(g, 'RIGHT_SMALL', 1);
  g.handle({ type: 'hold', key: 'CLR' });
  assert.equal(g.view.group, 'NAV');
  assert.equal(g.view.page, 'DEFAULT_NAV');
});

test('flight plan: build KJYO -> CSN with the cursor and knobs', () => {
  const g = new GNS(db);
  press(g, 'FPL');
  assert.equal(g.view.mode, 'FPL');
  press(g, 'CRSR');
  assert.equal(g.view.cursor, true);

  const spellFpl = (word) => {
    for (const ch of word) {
      for (let i = 0; i < 40 && g.view.fpl.edit?.ident[g.view.fpl.edit.i] !== ch; i++) {
        turn(g, 'RIGHT_SMALL', 1);
      }
      turn(g, 'RIGHT_LARGE', 1);
    }
    press(g, 'ENT');
  };
  spellFpl('KJYO');
  spellFpl('CSN');

  assert.deepEqual(
    g.view.fpl.rows.map((r) => r.id),
    ['KJYO', 'CSN']
  );

  press(g, 'MENU');
  assert.equal(g.view.mode, 'MENU');
  assert.equal(g.view.menu.items[0], 'Activate Flight Plan?');
  press(g, 'ENT');
  assert.equal(g.view.nav.to, 'CSN');
  assert.equal(g.view.nav.from, 'KJYO');
});

test('flight plan: CLR deletes the waypoint under the cursor', () => {
  const g = new GNS(db);
  g.flightPlan = [db.exact('KJYO'), db.exact('CSN')];
  press(g, 'FPL');
  press(g, 'CRSR');
  g.fplCursorRow = 0;
  press(g, 'CLR');
  assert.deepEqual(
    g.view.fpl.rows.map((r) => r.id),
    ['CSN']
  );
});

test('COM tuning: large knob steps MHz, small knob steps 25 kHz, flip-flop swaps', () => {
  const g = new GNS(db);
  g.com = { active: '121.700', standby: '125.450' };
  turn(g, 'LEFT_LARGE', 1);
  assert.equal(g.view.com.standby, '126.450');
  turn(g, 'LEFT_SMALL', 1);
  assert.equal(g.view.com.standby, '126.475');
  press(g, 'COM_FF');
  assert.equal(g.view.com.active, '126.475');
  assert.equal(g.view.com.standby, '121.700');
});

test('PUSH C/V moves tuning between COM and VLOC', () => {
  const g = new GNS(db);
  assert.equal(g.view.tuning, 'COM');
  press(g, 'CV');
  assert.equal(g.view.tuning, 'VLOC');
  g.vloc.standby = '110.20';
  turn(g, 'LEFT_SMALL', 1);
  assert.equal(g.view.vloc.standby, '110.25', 'small knob steps 50 kHz');
  turn(g, 'LEFT_LARGE', 1);
  assert.equal(g.view.vloc.standby, '111.25', 'large knob steps 1 MHz');
});

test('VLOC tuning wraps at the top of the band', () => {
  const g = new GNS(db);
  press(g, 'CV');
  g.vloc.standby = '117.95'; // top of the nav band
  turn(g, 'LEFT_SMALL', 1);
  assert.equal(g.view.vloc.standby, '108.00');
});

test('CDI toggles the nav source and OBS toggles suspend', () => {
  const g = new GNS(db);
  press(g, 'CDI');
  assert.equal(g.view.navSource, 'VLOC');
  press(g, 'OBS');
  assert.equal(g.view.obs, true);
});

test('flying the aircraft closes the distance to the destination', () => {
  const g = new GNS(db, { start: { lat: 38.9445, lon: -77.4558 } });
  g.activateDirectTo(db.exact('KJYO'));
  const before = g.view.nav.dis; // KIAD -> KJYO is roughly 9 nm
  for (let i = 0; i < 12; i++) g.tick(10); // two minutes at 120 kt = 4 nm
  const after = g.view.nav.dis;
  assert.ok(after < before, `expected to close: ${before} -> ${after}`);
  const flown = before - after;
  assert.ok(flown > 3.5 && flown < 4.5, `expected ~4 nm, got ${flown}`);
});

test('the page menu reports which page it was opened over', () => {
  const g = new GNS(db);
  press(g, 'FPL');
  press(g, 'MENU');
  assert.equal(g.view.menu.from, 'FPL', 'so the renderer draws the flight plan underneath');
  press(g, 'CLR');
  press(g, 'MENU');
  assert.equal(g.view.menu.from, 'FPL');
});
