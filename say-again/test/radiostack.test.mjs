// The box is imported from ../../src, not copied. These check the seam between
// the two apps: that frequencies compare the way a radio does, and that every
// scenario frequency is something the unit can actually be tuned to.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sameFreq } from '../src/radiostack.js';
import { GNS } from '../../src/gns.js';
import { NavData } from '../../src/navdata.js';
import { departureWithFlightFollowing, randomWx } from '../src/scenario.js';

const { airports } = JSON.parse(
  readFileSync(new URL('../data/airports.json', import.meta.url), 'utf8')
);
const byId = new Map(airports.map((a) => [a.id, a]));
const ac = { tail: 'N725SP', type: 'C172' };
const wx = { windDir: 340, windKt: 8, altimeter: '30.12', atis: 'T' };

test('frequencies compare on value, not on trailing zeros', () => {
  assert.ok(sameFreq('124.100', 124.1));
  assert.ok(sameFreq('121.800', '121.8'));
  assert.ok(sameFreq(126, '126.000'));
  assert.ok(!sameFreq('124.100', '124.125'));
  assert.ok(!sameFreq(null, '124.1'));
});

test('the unit tunes in the steps a real COM radio uses', () => {
  const g = new GNS(new NavData([]));
  g.com = { active: '121.800', standby: '121.800' };
  // Small knob is 25 kHz, large knob is 1 MHz.
  g.handle({ type: 'knob', knob: 'LEFT_SMALL', dir: 1 });
  assert.equal(g.view.com.standby, '121.825');
  g.handle({ type: 'knob', knob: 'LEFT_LARGE', dir: 1 });
  assert.equal(g.view.com.standby, '122.825');
});

test('flip-flop swaps standby into active, which is what the check watches', () => {
  const g = new GNS(new NavData([]));
  g.com = { active: '121.800', standby: '124.100' };
  assert.ok(!sameFreq(g.view.com.active, '124.1'), 'not yet transmitting on it');
  g.handle({ type: 'press', key: 'COM_FF' });
  assert.ok(sameFreq(g.view.com.active, '124.1'), 'now you are');
  assert.ok(sameFreq(g.view.com.standby, '121.8'), 'and the old one is parked');
});

test('every frequency a scenario uses is reachable on the COM radio', () => {
  for (const home of airports.filter((a) => a.towered && a.freq.approach).slice(0, 40)) {
    const s = departureWithFlightFollowing({ home, dest: airports[0], ac, wx: randomWx() });
    for (const step of s.steps) {
      const f = Number(step.freq);
      assert.ok(f >= 118 && f <= 136.975, `${home.id}/${step.id}: ${step.freq} outside the COM band`);
      // The radio tunes in 25 kHz steps; anything else could never be dialled.
      const steps25 = Math.round((f - 118) / 0.025);
      assert.ok(
        Math.abs(118 + steps25 * 0.025 - f) < 0.0005,
        `${home.id}/${step.id}: ${step.freq} is not on a 25 kHz boundary`
      );
    }
  }
});

test('a scenario starts with its first two frequencies ready to use', () => {
  const s = departureWithFlightFollowing({
    home: byId.get('KOWD'),
    dest: byId.get('KPYM'),
    ac,
    wx,
  });
  const first = s.steps[0].freq;
  const second = s.steps.find((x) => x.freq !== first)?.freq;
  assert.ok(first && second, 'there is a frequency change to practise');
  assert.ok(!sameFreq(first, second), 'and they differ');
});
