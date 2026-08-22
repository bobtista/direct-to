import test from 'node:test';
import assert from 'node:assert/strict';
import { speakThroughRadio } from '../src/radio.js';

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
