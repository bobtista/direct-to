import test from 'node:test';
import assert from 'node:assert/strict';
import { speakThroughRadio, stopSpeaking } from '../src/radio.js';

/** A radio that just records whether the mic was keyed and unkeyed. */
function stubRadio() {
  const calls = [];
  return { calls, keyDown: () => calls.push('down'), keyUp: () => calls.push('up') };
}

test('a transmission resolves even with no speech engine present', async () => {
  const r = stubRadio();
  const t0 = Date.now();
  await speakThroughRadio(r, 'Skyhawk five sierra papa, runway three five, cleared for takeoff.');
  const ms = Date.now() - t0;
  assert.deepEqual(r.calls, ['down', 'up'], 'the mic was keyed and released');
  assert.ok(ms > 300 && ms < 8000, `took ${ms} ms — should be about the length of the call`);
});

test('longer transmissions hold the mic longer', async () => {
  const short = Date.now();
  await speakThroughRadio(stubRadio(), 'Roger.');
  const shortMs = Date.now() - short;

  const long = Date.now();
  await speakThroughRadio(
    stubRadio(),
    'Skyhawk seven two five sierra papa, Boston Approach, radar contact two miles ' +
      'south of Norwood, maintain VFR, altimeter three zero one two, traffic ten ' +
      "o'clock three miles northbound altitude indicates two thousand five hundred."
  );
  const longMs = Date.now() - long;
  assert.ok(longMs > shortMs, `${longMs} ms should exceed ${shortMs} ms`);
});

test('keying up cuts the controller off instead of waiting them out', async () => {
  // The push-to-talk key used to be disabled while the controller spoke, so a
  // long transmission you had already understood was dead time you could only
  // sit through.
  const r = stubRadio();
  const t0 = Date.now();
  const speech = speakThroughRadio(
    r,
    'Skyhawk five sierra papa, Norwood Ground, runway three five, taxi via alpha, ' +
      'hold short of runway three five, and advise when ready to copy your clearance.'
  );
  setTimeout(stopSpeaking, 50);
  await speech;
  const ms = Date.now() - t0;

  assert.deepEqual(r.calls, ['down', 'up'], 'the mic is released, not left keyed');
  assert.ok(ms < 1000, `cut off after ${ms} ms — it should not have played out in full`);
});

test('cutting off when nothing is being said is harmless', () => {
  assert.doesNotThrow(() => stopSpeaking());
  assert.doesNotThrow(() => stopSpeaking());
});
