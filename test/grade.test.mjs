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
