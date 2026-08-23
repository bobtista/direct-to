import test from 'node:test';
import assert from 'node:assert/strict';

import { pickFormat, hintFor, isLocalPage } from '../src/listen.js';

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
