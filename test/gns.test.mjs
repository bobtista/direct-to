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

test('the VLOC small knob wraps its kilohertz, not the whole band', () => {
  // This test used to assert 108.00, which was the bug: the small knob was
  // adding to the whole frequency, so it carried into the megahertz and then
  // fell off the end of the band. On the real box the two halves of the knob
  // are independent.
  const g = new GNS(db);
  press(g, 'CV');
  g.vloc.standby = '117.95'; // top of the kilohertz, top of the band
  turn(g, 'LEFT_SMALL', 1);
  assert.equal(g.view.vloc.standby, '117.00', 'kilohertz wrap stays in 117');

  g.vloc.standby = '117.95';
  turn(g, 'LEFT_LARGE', 1);
  assert.equal(g.view.vloc.standby, '108.95', 'the megahertz wraps and keeps the kilohertz');
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

test('the COM small knob never carries into the megahertz', () => {
  // Turning the small knob past .975 stepped the frequency up a whole
  // megahertz: 124.975 became 125.000. On the real box it wraps to 124.000 —
  // the small knob cannot change which megahertz you are on.
  const g = new GNS(db);
  g.com.standby = '124.975';
  turn(g, 'LEFT_SMALL', 1);
  assert.equal(g.view.com.standby, '124.000');

  g.com.standby = '124.000';
  turn(g, 'LEFT_SMALL', -1);
  assert.equal(g.view.com.standby, '124.975', 'backwards wraps the same way');
});

test('the COM large knob wraps the band and keeps the kilohertz', () => {
  const g = new GNS(db);
  g.com.standby = '136.450';
  turn(g, 'LEFT_LARGE', 1);
  assert.equal(g.view.com.standby, '118.450');

  g.com.standby = '118.450';
  turn(g, 'LEFT_LARGE', -1);
  assert.equal(g.view.com.standby, '136.450');
});

test('tuning does not drift', () => {
  // 0.025 has no exact binary representation, so repeated addition used to
  // creep. Forty clicks is one full turn of the kilohertz.
  const g = new GNS(db);
  g.com.standby = '121.700';
  for (let i = 0; i < 40; i++) turn(g, 'LEFT_SMALL', 1);
  assert.equal(g.view.com.standby, '121.700');

  for (let i = 0; i < 17; i++) turn(g, 'LEFT_SMALL', 1);
  for (let i = 0; i < 17; i++) turn(g, 'LEFT_SMALL', -1);
  assert.equal(g.view.com.standby, '121.700');
});

test('every reachable COM frequency is a real 25 kHz channel', () => {
  const g = new GNS(db);
  g.com.standby = '118.000';
  const seen = new Set();
  for (let i = 0; i < 19 * 40 + 5; i++) {
    turn(g, 'LEFT_SMALL', 1);
    if (i % 40 === 39) turn(g, 'LEFT_LARGE', 1);
    const f = g.view.com.standby;
    const mhz = Number(f);
    assert.ok(mhz >= 118 && mhz <= 136.975, `${f} is outside the COM band`);
    assert.equal(Math.round(mhz * 1000) % 25, 0, `${f} is not a 25 kHz channel`);
    seen.add(f);
  }
  assert.ok(seen.size > 700, `expected most of the band to be reachable, saw ${seen.size}`);
});
