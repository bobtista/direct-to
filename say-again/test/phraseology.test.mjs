import test from 'node:test';
import assert from 'node:assert/strict';
import {
  digits, frequency, heading, squawk, altitude, runway, altimeter, wind,
  callsign, normalize, contains, phonetic, SPOKEN, WRITTEN,
  soundsLikeCallsign, bestAlternative,
} from '../src/phraseology.js';

test('digits are spoken individually, with niner for 9', () => {
  assert.equal(digits('725'), 'seven two five');
  assert.equal(digits('90'), 'niner zero');
  assert.equal(digits('725SP'), 'seven two five sierra papa');
});

test('frequencies use "point" and drop trailing zeros', () => {
  assert.equal(frequency('124.100'), 'one two four point one');
  assert.equal(frequency('118.500'), 'one one eight point five');
  assert.equal(frequency('121.650'), 'one two one point six five');
  assert.equal(frequency('126.000'), 'one two six point zero');
});

test('headings are always three digits', () => {
  assert.equal(heading(90), 'zero niner zero');
  assert.equal(heading(5), 'zero zero five');
  assert.equal(heading(360), 'zero zero zero');
});

test('squawk codes are four separate digits', () => {
  assert.equal(squawk(4621), 'four six two one');
  assert.equal(squawk('0400'), 'zero four zero zero');
});

test('altitudes are grouped, not spelled out', () => {
  assert.equal(altitude(3500), 'three thousand five hundred');
  assert.equal(altitude(2000), 'two thousand');
  assert.equal(altitude(500), 'five hundred');
  assert.equal(altitude(10500), 'one zero thousand five hundred');
  assert.equal(altitude(18000), 'flight level one eight zero');
});

test('runways include the side when there is one', () => {
  assert.equal(runway('35'), 'three five');
  assert.equal(runway('4'), 'zero four');
  assert.equal(runway('17L'), 'one seven left');
  assert.equal(runway('33R'), 'three three right');
});

test('altimeter and wind read the way a controller says them', () => {
  assert.equal(altimeter(30.12), 'three zero one two');
  assert.equal(altimeter(29.92), 'two niner niner two');
  assert.equal(wind({ dir: 240, kt: 8 }), 'two four zero at eight');
  assert.equal(wind({ dir: 0, kt: 0 }), 'calm');
  assert.equal(wind({ dir: 310, kt: 12, gust: 18 }), 'three one zero at one two gusting one eight');
});

test('callsigns use the type on initial contact and abbreviate after', () => {
  const ac = { tail: 'N725SP', type: 'C172' };
  assert.equal(callsign(ac), 'Skyhawk seven two five sierra papa');
  // AIM 4-2-4: abbreviating drops digits, not the prefix.
  assert.equal(callsign(ac, { abbreviated: true }), 'Skyhawk five sierra papa');
  assert.equal(callsign({ tail: 'N4512J' }), 'november four five one two juliet');
});

test('a Warrior is a Warrior, not a Skyhawk', () => {
  assert.equal(callsign({ tail: 'N8213C', type: 'PA28' }), 'Warrior eight two one three charlie');
});

// --- grading input ----------------------------------------------------------

test('spoken and written readbacks normalise to the same thing', () => {
  assert.equal(normalize('niner five sierra papa'), normalize('95SP'));
  assert.equal(normalize('one two four point one'), normalize('124.1'));
});

test('normalising survives how a recogniser might spell it', () => {
  assert.equal(normalize('tree fife'), '35');
  assert.equal(normalize('alfa juliett x-ray'), 'AJX');
});

test('English homophones stay words, because phraseology is full of them', () => {
  // "to" and "for" were mapped to 2 and 4 to catch recogniser slips. That cost
  // far more than it bought: "cleared for takeoff" stopped matching entirely.
  assert.equal(normalize('to too two'), 'TO TOO 2');
  assert.equal(normalize('cleared for takeoff'), 'CLEARED FOR TAKEOFF');
  assert.equal(normalize('climb to three thousand'), 'CLIMB TO 3 THOUSAND');
});

test('contains finds required elements however they were said', () => {
  const said = 'roger, squawk four six two one, five sierra papa';
  assert.ok(contains(said, '4621'), 'the squawk code');
  assert.ok(contains(said, '5SP'), 'the abbreviated callsign');
  assert.ok(contains('contact departure one two four point one', '124.1'), 'a frequency');
  assert.ok(!contains(said, '4622'), 'and does not match a wrong code');
});

test('a readback missing the hold short instruction is detectable', () => {
  const good = 'runway three five, hold short, five sierra papa';
  const bad = 'runway three five, five sierra papa';
  assert.ok(contains(good, 'hold short'));
  assert.ok(!contains(bad, 'hold short'));
});

test('a lone letter is always its phonetic word, never the letter name', () => {
  // Reading "with T" out loud is wrong on the radio, so neither form shows it.
  assert.equal(SPOKEN.atis('T'), 'tango');
  assert.equal(WRITTEN.atis('T'), 'Tango');
  assert.equal(phonetic('q'), 'quebec');
  assert.equal(phonetic('Z'), 'zulu');
});

test('the best recogniser alternative is the one matching what is expected', () => {
  const alts = ['runway 70 hold short 50 pop', 'runway 17 hold short 5SP', 'runway seventeen'];
  assert.equal(bestAlternative(alts, ['17', 'hold short', '5SP']), 'runway 17 hold short 5SP');
  // With nothing to score against, take the recogniser's own first choice.
  assert.equal(bestAlternative(alts, []), alts[0]);
  assert.equal(bestAlternative(['only one'], ['17']), 'only one');
});

test('callsign leniency is confined to the end of the transmission', () => {
  // "papa" early in a call is a taxiway, not the callsign.
  assert.ok(!soundsLikeCallsign('taxi via papa sierra hold short runway 17', 'N725SP'));
  assert.ok(soundsLikeCallsign('hold short runway 17, five sierra papa', 'N725SP'));
});
