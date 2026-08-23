import test from 'node:test';
import assert from 'node:assert/strict';

import { Listener, pickFormat, hintFor, isLocalPage } from '../src/listen.js';

test('picks the browser recording format, preferring opus', () => {
  const chrome = pickFormat((m) => m.startsWith('audio/webm'));
  assert.equal(chrome.mime, 'audio/webm;codecs=opus');
  assert.equal(chrome.ext, 'webm');

  const safari = pickFormat((m) => m === 'audio/mp4');
  assert.equal(safari.ext, 'mp4');
});

test('a browser that records nothing we can send gets no format', () => {
  assert.equal(pickFormat(() => false), null);
});

test('the hint carries the callsign in spoken form', () => {
  const hint = hintFor({}, { callsign: 'Skyhawk seven two five sierra papa' });
  assert.match(hint, /seven two five sierra papa/);
});

test('the hint primes the phonetic alphabet', () => {
  const hint = hintFor(null);
  assert.match(hint, /sierra/);
  assert.match(hint, /papa/);
  assert.match(hint, /niner/);
});

test('the hint never leaks the values the step is grading', () => {
  // Priming Whisper with the right answer would let it hear the right answer
  // when the pilot said the wrong one, which would pass a bad readback.
  const step = {
    requires: [{ value: 17 }, { value: 4680 }],
    exampleSpeech: 'runway one seven, squawk four six eight zero',
    readbackSpeech: 'runway one seven, hold short runway one seven',
  };
  const hint = hintFor(step, { callsign: 'Skyhawk five sierra papa' });
  assert.doesNotMatch(hint, /one seven/);
  assert.doesNotMatch(hint, /four six eight zero/);
});

test('with no callsign yet, the aircraft type anchors it instead', () => {
  assert.match(hintFor(null, { type: 'Skyhawk' }), /is a Skyhawk/);
});

test('a missing step still produces a usable hint', () => {
  assert.match(hintFor(null), /radio transmission/i);
  assert.match(hintFor(undefined, { callsign: '' }), /radio transmission/i);
});

test('the hint stays inside the prompt budget', () => {
  assert.ok(hintFor({}, { callsign: 'x '.repeat(500) }).length <= 900);
});

test('only a locally served page looks for the local recogniser', () => {
  // From the hosted copy, probing loopback earns the visitor a "wants to access
  // devices on your local network" prompt for a server they are not running.
  assert.ok(isLocalPage('localhost'));
  assert.ok(isLocalPage('127.0.0.1'));
  assert.ok(isLocalPage(''));
  assert.ok(!isLocalPage('bobtista.github.io'));
  assert.ok(!isLocalPage('192.168.1.40'));
});

/** Stand-in for the browser's SpeechRecognition, so the state machine is testable. */
class FakeSR {
  start() { this.onstart?.(); }
  stop() { this.onend?.(); }
  fire(transcript, isFinal = true) {
    const result = [{ transcript }];
    result.isFinal = isFinal;
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
  fail(error) { this.onerror?.({ error }); }
}

function listenerWithFakeSR() {
  const notes = [];
  let idle = 0;
  const results = [];
  globalThis.window = { SpeechRecognition: FakeSR };
  const l = new Listener({
    onResult: (alts, engine) => results.push([alts, engine]),
    onNote: (m) => notes.push(m),
    onIdle: () => (idle += 1),
  });
  return { l, notes, results, idle: () => idle };
}

test('a transmission that recognised nothing says so', () => {
  // This was silent before: you keyed up, nothing happened, and there was no
  // way to tell a dead microphone from a bad call.
  const { l, notes, idle } = listenerWithFakeSR();
  l.start();
  l._sr.stop();
  assert.deepEqual(notes, ['Nothing came through — hold the key down while you speak.']);
  assert.equal(idle(), 1);
  assert.equal(l.listening, false);
});

test('a recognised transmission reports no complaint', () => {
  const { l, notes, results } = listenerWithFakeSR();
  l.start();
  l._sr.fire('runway one seven hold short');
  l._sr.stop();
  assert.deepEqual(notes, []);
  assert.deepEqual(results, [[['runway one seven hold short'], 'browser']]);
});

test('a blocked microphone explains itself, and a normal key-up stays quiet', () => {
  const denied = listenerWithFakeSR();
  denied.l.start();
  denied.l._sr.fail('not-allowed');
  denied.l._sr.stop();
  assert.match(denied.notes[0], /blocked the microphone/);
  assert.equal(denied.notes.length, 1, 'should not also complain that nothing came through');

  const normal = listenerWithFakeSR();
  normal.l.start();
  normal.l._sr.fail('aborted');
  normal.l._sr.stop();
  assert.deepEqual(normal.notes, []);
});

test('recognition ending on its own releases the key', () => {
  // Chrome ends recognition after a pause, so the button has to follow the
  // recogniser rather than waiting for a key-up that already happened.
  const { l, idle } = listenerWithFakeSR();
  l.start();
  assert.equal(l.listening, true);
  l._sr.stop();
  assert.equal(l.listening, false);
  assert.equal(idle(), 1);
});

test('a draft transcript is used when the key comes up before Chrome finalises', () => {
  // This is the ordinary case for push-to-talk: a short burst ends before the
  // recogniser has committed to a transcript. Throwing the draft away is what
  // produced "Nothing came through" on a call that was actually spoken.
  const { l, notes, results } = listenerWithFakeSR();
  l.start();
  l._sr.fire('norwood ground skyhawk five sierra papa request taxi', false);
  l._sr.stop();
  assert.deepEqual(notes, []);
  assert.deepEqual(results, [
    [['norwood ground skyhawk five sierra papa request taxi'], 'browser'],
  ]);
});

test('a final transcript wins over the draft that preceded it', () => {
  const { l, results } = listenerWithFakeSR();
  l.start();
  l._sr.fire('norwood ground sky', false);
  l._sr.fire('norwood ground skyhawk five sierra papa', true);
  l._sr.stop();
  assert.equal(results.length, 1);
  assert.deepEqual(results[0][0], ['norwood ground skyhawk five sierra papa']);
});

test('an unrecognised error says what it was instead of blaming the key', () => {
  const { l, notes } = listenerWithFakeSR();
  l.start();
  l._sr.fail('language-not-supported');
  l._sr.stop();
  assert.deepEqual(notes, ['Speech recognition failed: language-not-supported.']);
});
