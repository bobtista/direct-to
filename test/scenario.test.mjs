import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { departureWithFlightFollowing, activeRunway } from '../src/scenario.js';
import { grade } from '../src/grade.js';

const { airports } = JSON.parse(
  readFileSync(new URL('../data/airports.json', import.meta.url), 'utf8')
);
const byId = new Map(airports.map((a) => [a.id, a]));
const wx = { windDir: 340, windKt: 8, altimeter: '30.12', atis: 'B' };
const ac = { tail: 'N725SP', type: 'C172' };

test('the active runway is the one most into wind', () => {
  const owd = byId.get('KOWD');
  assert.equal(activeRunway(owd, 350).id, '35');
  assert.equal(activeRunway(owd, 170).id, '17');
});

test('a Norwood departure uses the real frequencies', () => {
  const s = departureWithFlightFollowing({
    home: byId.get('KOWD'),
    dest: byId.get('KPYM'),
    ac,
    wx,
  });
  const freqs = Object.fromEntries(s.steps.map((x) => [x.id, x.freq]));
  assert.equal(freqs.ground, '121.800', 'Norwood ground');
  assert.equal(freqs.tower, '126.000', 'Norwood tower');
  assert.equal(freqs.approach, '124.100', 'Boston approach');
  assert.match(s.steps.find((x) => x.id === 'approach').facility, /Boston Approach/);
});

test('every step names a facility, a frequency and an example call', () => {
  const s = departureWithFlightFollowing({
    home: byId.get('KAUS'),
    dest: byId.get('KGTU'),
    ac: { tail: 'N8213C', type: 'PA28' },
    wx,
  });
  for (const step of s.steps) {
    assert.ok(step.facility, `${step.id} has a facility`);
    assert.ok(/^\d{3}\.\d{3}$/.test(step.freq), `${step.id} freq looks real: ${step.freq}`);
    assert.ok(step.reply.length > 10, `${step.id} has a reply`);
    if (!step.controllerFirst) assert.ok(step.example, `${step.id} shows what to say`);
  }
});

test('the taxi clearance requires runway and hold short, and grades that way', () => {
  const s = departureWithFlightFollowing({
    home: byId.get('KOWD'),
    dest: byId.get('KPYM'),
    ac,
    wx,
  });
  const taxi = s.steps.find((x) => x.id === 'ground');
  assert.deepEqual(taxi.requires.map((r) => r.key).sort(), ['holdShort', 'runway']);

  const good = grade(`runway three five, hold short runway three five, five sierra papa`, taxi.requires, ac);
  assert.ok(good.pass, good.summary);

  const bad = grade(`taxiing to three five, five sierra papa`, taxi.requires, ac);
  assert.equal(bad.safe, false, 'no hold short read back');
});

test('the squawk the controller issues is the one graded', () => {
  const s = departureWithFlightFollowing({
    home: byId.get('KOWD'),
    dest: byId.get('KPYM'),
    ac,
    wx,
  });
  const step = s.steps.find((x) => x.id === 'approach');
  assert.match(step.reply, /squawk/);
  const said = `squawk ${[...s.squawk].join(' ')}, five sierra papa`;
  assert.ok(grade(said, step.requires, ac).pass, 'reading back the issued code passes');
  assert.equal(grade('squawk one two three four, five sierra papa', step.requires, ac).pass, false);
});

test('scenarios build for every towered airport with a departure frequency', () => {
  const candidates = airports.filter((a) => a.towered && (a.freq.departure || a.freq.approach));
  assert.ok(candidates.length > 400, `only ${candidates.length} usable fields`);
  for (const home of candidates.slice(0, 80)) {
    const s = departureWithFlightFollowing({ home, dest: airports[0], ac, wx });
    assert.ok(s.steps.length >= 3, `${home.id} produced ${s.steps.length} steps`);
  }
});

// --- spoken vs written ------------------------------------------------------

test('every step carries both a written form and a spoken form', () => {
  const s = departureWithFlightFollowing({
    home: byId.get('KOWD'),
    dest: byId.get('KPYM'),
    ac,
    wx,
  });
  for (const step of s.steps) {
    assert.ok(step.reply, `${step.id} has display text`);
    assert.ok(step.replySpeech, `${step.id} has speech`);
    assert.notEqual(step.reply, step.replySpeech, `${step.id} should differ between the two`);
  }
});

test('the screen shows 725SP while the radio says seven two five sierra papa', () => {
  const s = departureWithFlightFollowing({
    home: byId.get('KOWD'),
    dest: byId.get('KPYM'),
    ac,
    wx,
  });
  const approach = s.steps.find((x) => x.id === 'approach');
  assert.match(approach.reply, /Skyhawk N725SP/, 'written callsign on screen');
  assert.match(approach.replySpeech, /seven two five sierra papa/, 'spoken callsign on the radio');
  assert.ok(!/seven two five/.test(approach.reply), 'no spelled-out digits on screen');
});

test('written replies use compact numbers throughout', () => {
  const s = departureWithFlightFollowing({
    home: byId.get('KOWD'),
    dest: byId.get('KPYM'),
    ac,
    wx,
  });
  const ground = s.steps.find((x) => x.id === 'ground');
  assert.match(ground.reply, new RegExp(`runway ${s.rwy}\\b`), 'runway as digits');

  const handoff = s.steps.find((x) => x.id === 'handoff');
  assert.match(handoff.reply, /\d{3}\.\d/, 'frequency as a number');
  assert.ok(!/point/.test(handoff.reply), 'no spoken "point" on screen');

  const radar = s.steps.find((x) => x.id === 'radar-contact');
  assert.match(radar.reply, /VFR/, 'VFR written plainly');
  assert.match(radar.replySpeech, /V-F-R/, 'and spelled for the radio');
});

test('grading still works against the written or spoken form', () => {
  const s = departureWithFlightFollowing({
    home: byId.get('KOWD'),
    dest: byId.get('KPYM'),
    ac,
    wx,
  });
  const ground = s.steps.find((x) => x.id === 'ground');
  const spelled = `runway ${[...String(s.rwy)].join(' ')}, hold short, five sierra papa`;
  assert.ok(grade(spelled, ground.requires, ac).pass, 'spoken readback');
  assert.ok(grade(`runway ${s.rwy}, hold short, 5SP`, ground.requires, ac).pass, 'typed readback');
});
