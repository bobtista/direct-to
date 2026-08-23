import test from 'node:test';
import assert from 'node:assert/strict';
import { grade, req } from '../src/grade.js';

const AC = { tail: 'N725SP' };

test('a complete readback passes', () => {
  const r = grade(
    'runway three five, hold short, five sierra papa',
    [req.runway('35'), req.holdShort('35')],
    AC
  );
  assert.ok(r.pass, r.summary);
  assert.equal(r.summary, 'Good readback.');
});

test('a missing hold short is caught and flagged as unsafe', () => {
  const r = grade('runway three five, five sierra papa', [req.runway('35'), req.holdShort('35')], AC);
  assert.equal(r.pass, false);
  assert.equal(r.safe, false, 'hold short is a mandatory readback');
  assert.match(r.summary, /hold short/);
});

test('"roger" instead of reading back the numbers is called out', () => {
  const r = grade('roger, five sierra papa', [req.squawk('4621')], AC);
  assert.equal(r.pass, false);
  assert.ok(r.habits.some((h) => h.id === 'roger-instead-of-readback'), r.summary);
});

test('a wrong squawk does not pass just because digits were spoken', () => {
  const r = grade('squawk four six two two, five sierra papa', [req.squawk('4621')], AC);
  assert.equal(r.pass, false);
  assert.match(r.summary, /squawk 4621/);
});

test('altitude and heading assignments are mandatory readbacks', () => {
  const good = grade(
    'left heading zero niner zero, maintain three thousand, five sierra papa',
    [req.heading(90), req.altitude(3000)],
    AC
  );
  assert.ok(good.pass, good.summary);

  const bad = grade('left heading zero niner zero, five sierra papa', [
    req.heading(90),
    req.altitude(3000),
  ], AC);
  assert.equal(bad.safe, false);
});

test('a frequency change is graded however the pilot phrased it', () => {
  const withPoint = grade('one two four point one, five sierra papa', [req.frequency('124.1')], AC);
  const withoutPoint = grade('twenty four one, five sierra papa', [req.frequency('124.1')], AC);
  assert.ok(withPoint.pass, withPoint.summary);
  assert.equal(withoutPoint.pass, false, '"twenty four one" is not the frequency');
});

test('omitting the callsign is flagged even when the readback is right', () => {
  const r = grade('runway three five, hold short', [req.runway('35'), req.holdShort('35')], AC);
  assert.ok(r.safe, 'the required items were all there');
  assert.ok(r.habits.some((h) => h.id === 'no-callsign'), r.summary);
});

test('filler and chatter are flagged without failing a correct readback', () => {
  const r = grade(
    'uh, roger that, with you at three thousand, five sierra papa',
    [req.altitude(3000)],
    AC
  );
  assert.ok(r.safe, 'the altitude was read back');
  const ids = r.habits.map((h) => h.id);
  assert.ok(ids.includes('filler'));
  assert.ok(ids.includes('with-you'));
});

test('non-critical items are suggested, not failed', () => {
  const r = grade('runway three five, hold short, five sierra papa', [
    req.runway('35'),
    req.holdShort('35'),
    req.altimeter('30.12'),
  ], AC);
  assert.ok(r.safe, 'altimeter is not a required readback');
  assert.equal(r.pass, false);
  assert.match(r.summary, /Also worth reading back/);
});

// --- regressions ------------------------------------------------------------

test('"cleared for take off" is accepted, spaced or not', () => {
  const required = [
    req.runway('28'),
    { key: 'clearedTakeoff', value: 'cleared for takeoff', label: 'cleared for takeoff', critical: true },
  ];
  for (const said of [
    'cleared for take off runway 28 Skyhawk 5SP',
    'cleared for takeoff runway 28, 5SP',
    'runway two eight, cleared for takeoff, five sierra papa',
  ]) {
    assert.ok(grade(said, required, AC).pass, `should pass: ${said}`);
  }
});

test('ordinary words are not mistaken for digits', () => {
  // "for" and "to" used to normalise to 4 and 2, wrecking plain phrases.
  const climb = grade('climb to three thousand, five sierra papa', [req.altitude(3000)], AC);
  assert.ok(climb.pass, climb.summary);

  const taxi = grade('taxi to runway two eight, hold short, five sierra papa', [
    req.runway('28'),
    req.holdShort('28'),
  ], AC);
  assert.ok(taxi.pass, taxi.summary);
});

test('an altitude needs the whole number, not just its first digit', () => {
  const required = [req.altitude(3000)];
  assert.ok(grade('maintain three thousand, five sierra papa', required, AC).pass);
  assert.ok(grade('maintain 3000, five sierra papa', required, AC).pass);
  // A stray 3 elsewhere must not satisfy it.
  assert.equal(grade('runway three, five sierra papa', required, AC).pass, false);
});

test('altitudes with hundreds are matched in either form', () => {
  const required = [req.altitude(4500)];
  assert.ok(grade('four thousand five hundred, five sierra papa', required, AC).pass);
  assert.ok(grade('4500, five sierra papa', required, AC).pass);
  assert.equal(grade('four thousand, five sierra papa', required, AC).pass, false);
});

test('"oh" counts as zero next to digits and not otherwise', () => {
  assert.ok(grade('altimeter three oh one two, five sierra papa', [req.altimeter('30.12')], AC).items[0].ok);
  const r = grade('oh, say again, five sierra papa', [req.runway('28')], AC);
  assert.equal(r.pass, false, '"oh" on its own is not a zero');
});

// --- speech recognition mangling --------------------------------------------

test('a correct readback is not failed because the recogniser mangled the callsign', () => {
  // Real transcription from push-to-talk: "five sierra papa" came back as
  // "50 pop". The call was right; the transcription was not.
  const said = 'taxi to Runway 17 via Alpha hold short Runway 17 Skyhawk 50 pop';
  const r = grade(said, [req.runway('17'), req.holdShort('17')], AC);
  assert.ok(r.pass, r.summary);
  assert.equal(r.habits.length, 0, 'no callsign complaint');
});

test('common phonetic mishearings still count as a callsign', () => {
  const required = [req.runway('17')];
  for (const tail of [
    'runway 17, five sierra papa',
    'runway 17, five sarah papa',
    'runway 17, 5 sierra poppa',
    'runway 17, 50 pop',
    'runway 17, 5SP',
    'runway 17, N725SP',
  ]) {
    const r = grade(tail, required, AC);
    assert.ok(
      !r.habits.some((h) => h.id === 'no-callsign'),
      `should accept the callsign in: ${tail}`
    );
  }
});

test('leniency does not extend to actually omitting the callsign', () => {
  const r = grade('runway 17, hold short', [req.runway('17'), req.holdShort('17')], AC);
  assert.ok(r.safe, 'the required items were there');
  assert.ok(r.habits.some((h) => h.id === 'no-callsign'), r.summary);
});

test('a readback that is wrong is still wrong, however it was transcribed', () => {
  const r = grade('taxi via alpha, Skyhawk 50 pop', [req.runway('17'), req.holdShort('17')], AC);
  assert.equal(r.safe, false, 'no hold short, no runway — mangling is no excuse');
});
