import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  departureWithFlightFollowing,
  untoweredPattern,
  classBTransition,
  activeRunway,
} from '../src/scenario.js';
import { grade, isCallup } from '../src/grade.js';

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
    // Either you open the exchange and there is a model call, or the
    // controller does and there is not.
    assert.equal(Boolean(step.example), !step.controllerFirst, `${step.id} turn-taking`);
    assert.ok(step.why, `${step.id} explains itself`);
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

test('the ATIS code is spoken and shown phonetically', () => {
  const s = departureWithFlightFollowing({
    home: byId.get('KOWD'),
    dest: byId.get('KPYM'),
    ac,
    wx: { ...wx, atis: 'T' },
  });
  const ground = s.steps.find((x) => x.id === 'ground');
  assert.match(ground.example, /information Tango/, 'the example shows the word');
  assert.match(ground.exampleSpeech, /information tango/, 'and says it');
  assert.ok(!/with T\b/.test(ground.example), 'never a bare letter');
  assert.ok(!/with T\b/.test(ground.prompt), 'not in the prompt either');
});

// --- untowered --------------------------------------------------------------

test('untowered calls are announcements with nobody replying', () => {
  const s = untoweredPattern({ home: byId.get('KPYM'), dest: byId.get('KPYM'), ac, wx });
  assert.ok(s.steps.length >= 6, 'covers taxi through clear of the runway');
  for (const step of s.steps) {
    assert.equal(step.mode, 'announce');
    assert.equal(step.reply, null, 'nobody answers on a CTAF');
    assert.ok(step.example, 'every call has a model');
    assert.ok(step.why, 'and an explanation');
  }
});

test('every untowered call is bookended with the field name', () => {
  const s = untoweredPattern({ home: byId.get('KPYM'), dest: byId.get('KPYM'), ac, wx });
  for (const step of s.steps) {
    assert.match(step.example, /^Plymouth traffic,/, `${step.id} opens with the field`);
    assert.match(step.example, /Plymouth\.$/, `${step.id} closes with the field`);
  }
});

test('an untowered call missing the field name fails', () => {
  const s = untoweredPattern({ home: byId.get('KPYM'), dest: byId.get('KPYM'), ac, wx });
  const taxi = s.steps[0];
  const bad = grade('Skyhawk 725SP taxiing to the runway', taxi.requires, { ...ac, mode: 'announce' });
  assert.equal(bad.safe, false);
  assert.match(bad.summary, /Your call is missing/, 'worded as a call, not a readback');

  const good = grade(taxi.example, taxi.requires, { ...ac, mode: 'announce' });
  assert.ok(good.pass, good.summary);
});

// --- Class B ----------------------------------------------------------------

test('Class B requires an explicit clearance, not just contact', () => {
  const s = classBTransition({
    home: byId.get('KOWD'),
    dest: byId.get('KFIT'),
    bravo: byId.get('KBOS'),
    ac,
    wx,
  });
  const request = s.steps.find((x) => x.id === 'request');
  assert.match(request.reply, /remain clear of the Class Bravo/i);
  assert.ok(
    request.requires.some((r) => r.key === 'remainClear' && r.critical),
    '"remain clear" is a mandatory readback'
  );

  const cleared = s.steps.find((x) => x.id === 'cleared');
  assert.match(cleared.reply, /cleared into the Class Bravo/i);
  assert.ok(cleared.requires.some((r) => r.key === 'clearedBravo' && r.critical));
});

test('reading back only the squawk misses "remain clear"', () => {
  const s = classBTransition({
    home: byId.get('KOWD'),
    dest: byId.get('KFIT'),
    bravo: byId.get('KBOS'),
    ac,
    wx,
  });
  const request = s.steps.find((x) => x.id === 'request');
  const partial = grade(`squawk ${s.squawk}, 5SP`, request.requires, ac);
  assert.equal(partial.safe, false);
  assert.match(partial.summary, /remain clear/);
  assert.ok(grade(request.readback, request.requires, ac).pass, 'the model readback passes');
});

// --- callup and retry -------------------------------------------------------

test('a bare callup is recognised rather than graded as a failed readback', () => {
  const s = departureWithFlightFollowing({
    home: byId.get('KOWD'),
    dest: byId.get('KPYM'),
    ac,
    wx,
  });
  const approach = s.steps.find((x) => x.id === 'approach');
  assert.ok(isCallup('Boston Approach, Skyhawk N725SP', {
    facility: approach.facility,
    tail: ac.tail,
  }));
  assert.ok(!isCallup(approach.example, { facility: approach.facility, tail: ac.tail }));
});

test('every step offers a model call and an explanation for Peek', () => {
  const builders = [
    departureWithFlightFollowing({ home: byId.get('KOWD'), dest: byId.get('KPYM'), ac, wx }),
    untoweredPattern({ home: byId.get('KPYM'), dest: byId.get('KPYM'), ac, wx }),
    classBTransition({
      home: byId.get('KOWD'), dest: byId.get('KFIT'), bravo: byId.get('KBOS'), ac, wx,
    }),
  ];
  for (const s of builders) {
    for (const step of s.steps) {
      assert.ok(step.why?.length > 40, `${s.id}/${step.id} explains why`);
      assert.ok(step.example || step.readback, `${s.id}/${step.id} shows what to say`);
    }
  }
});

test('every scenario grades its own model answer as correct', () => {
  // The grader and the scripts drifted apart once already: the callsign check
  // only looked at the last few words, so a correct initial callup and every
  // untowered self-announce came back with a bad-habit note. If the app cannot
  // pass its own example, it is teaching the wrong thing.
  const scenarios = [
    departureWithFlightFollowing({ home: byId.get('KOWD'), dest: byId.get('KPYM'), ac, wx }),
    untoweredPattern({ home: byId.get('KPYM'), dest: byId.get('KPYM'), ac, wx }),
    classBTransition({
      home: byId.get('KOWD'), dest: byId.get('KPYM'), bravo: byId.get('KBOS'), ac, wx,
    }),
  ];

  let checked = 0;
  for (const sc of scenarios) {
    for (const s of sc.steps) {
      const model = s.exampleSpeech ?? s.readback;
      if (!model) continue;
      checked += 1;
      const r = grade(model, s.requires ?? [], { ...ac, mode: s.mode });
      assert.deepEqual(
        r.missing ?? [], [],
        `${sc.title} / ${s.id}: model answer missing a requirement — ${model}`,
      );
      assert.deepEqual(
        (r.habits ?? []).map((h) => h.id), [],
        `${sc.title} / ${s.id}: model answer flagged a bad habit — ${model}`,
      );
    }
  }
  assert.ok(checked > 15, `expected to check most steps, checked ${checked}`);
});
