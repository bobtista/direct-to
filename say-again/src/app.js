import { Radio, speakThroughRadio } from './radio.js';
import {
  departureWithFlightFollowing,
  untoweredPattern,
  classBTransition,
  randomWx,
} from './scenario.js';
import { grade, isCallup } from './grade.js';
import { WRITTEN, SPOKEN } from './phraseology.js';
import { RadioStack, sameFreq } from './radiostack.js';
import { bestAlternative } from './phraseology.js';
import { Listener, hintFor, isLocalPage } from './listen.js';

const $ = (id) => document.getElementById(id);

const els = {
  home: $('home'),
  dest: $('dest'),
  tail: $('tail'),
  type: $('type'),
  brief: $('brief'),
  airports: $('airports'),
  banner: $('banner'),
  panel: $('radio-panel'),
  freq: $('freq'),
  facility: $('facility'),
  prompt: $('prompt'),
  ptt: $('ptt'),
  typeInstead: $('type-instead'),
  hear: $('hear'),
  show: $('show'),
  typed: $('typed'),
  typedText: $('typed-text'),
  example: $('example'),
  log: $('log'),
  mute: $('mute'),
  ear: $('ear'),
  kind: $('kind'),
  bravo: $('bravo'),
  bravoField: $('bravo-field'),
  peekSay: $('peek-say'),
  peekWhy: $('peek-why'),
  cockpit: $('cockpit'),
  stack: $('stack'),
  stackUnits: $('stack-units'),
  tunedState: $('tuned-state'),
  freqWarn: $('freq-warn'),
};

// --- data -------------------------------------------------------------------

const data = await fetch('./data/airports.json')
  .then((r) => {
    if (!r.ok) throw new Error(`airports.json: ${r.status}`);
    return r.json();
  })
  .catch((err) => {
    console.error(err);
    return null;
  });

if (!data?.airports?.length) {
  els.banner.textContent = 'Could not load data/airports.json — run `npm start` and reload.';
  throw new Error('airport data unavailable');
}

const byId = new Map(data.airports.map((a) => [a.id, a]));

// Towered fields make the better practice, so list those first.
for (const a of data.airports.filter((x) => x.towered).slice(0, 800)) {
  const o = document.createElement('option');
  o.value = a.id;
  o.label = `${a.spoken} — ${a.city ?? ''}`;
  els.airports.appendChild(o);
}

// --- the box ----------------------------------------------------------------
//
// The GPS unit is the same module Direct-To renders. Its waypoint database is
// optional here: the radio works without it, and loading it just means the
// screen has something useful on it.

const waypoints = await fetch('../data/navdata.json')
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => d?.waypoints ?? [])
  .catch(() => []);

const stack = new RadioStack({
  mount: els.stack,
  waypoints,
  onChange: () => refreshTuned(),
});

for (const u of RadioStack.units) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.unit = u.id;
  b.textContent = u.short;
  b.title = u.name;
  b.setAttribute('aria-pressed', String(u.id === 'GNS430'));
  els.stackUnits.appendChild(b);
}
els.stackUnits.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  btn.blur();
  stack.setUnit(btn.dataset.unit);
  for (const b of els.stackUnits.querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.unit === btn.dataset.unit));
  }
  refreshTuned();
});

/**
 * Compare what is tuned against what this step is on.
 *
 * Advisory by design: a wrong frequency does not block the exchange, it just
 * says so. Blocking would stall practice on a fumbled knob twist.
 */
function refreshTuned() {
  const s = currentStep();
  if (!s?.freq) {
    els.tunedState.textContent = '—';
    els.tunedState.className = '';
    els.freqWarn.hidden = true;
    return;
  }
  const f = stack.frequencies;
  if (stack.isActive(s.freq)) {
    els.tunedState.textContent = `Tuned — active ${f.comActive}`;
    els.tunedState.className = 'ok';
    els.freqWarn.hidden = true;
  } else if (stack.isStandby(s.freq)) {
    els.tunedState.textContent = `In standby (${f.comStandby}) — flip-flop it across`;
    els.tunedState.className = 'warn';
    els.freqWarn.hidden = false;
  } else {
    els.tunedState.textContent = `Active ${f.comActive} — this step is on ${s.freq}`;
    els.tunedState.className = 'warn';
    els.freqWarn.hidden = false;
  }
}

// --- audio ------------------------------------------------------------------

let ctx = null;
let radio = null;
let voices = [];

function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext ?? window.webkitAudioContext)();
    radio = new Radio(ctx);
    radio.setMuted(muted);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return radio;
}

let muted = localStorage.getItem('sayagain.muted') === '1';

function setMuted(next) {
  muted = Boolean(next);
  radio?.setMuted(muted);
  if (muted && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  els.mute.textContent = muted ? 'Unmute' : 'Mute';
  els.mute.setAttribute('aria-pressed', String(muted));
  try {
    localStorage.setItem('sayagain.muted', muted ? '1' : '0');
  } catch {
    // Private browsing; the preference just won't stick.
  }
}

function loadVoices() {
  voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
}
loadVoices();
speechSynthesis.onvoiceschanged = loadVoices;

/** A stable voice per facility, so ground and approach sound like two people. */
function voiceFor(facility) {
  if (!voices.length) return {};
  let h = 0;
  for (const c of facility) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return {
    voice: voices[h % voices.length],
    rate: 1.1 + ((h >> 3) % 5) * 0.04,
    pitch: 0.9 + ((h >> 6) % 5) * 0.06,
  };
}

// --- scenario state ---------------------------------------------------------

let scenario = null;
let step = 0;

function currentStep() {
  return scenario?.steps[step] ?? null;
}

function brief() {
  const home = byId.get(els.home.value.trim().toUpperCase());
  const dest = byId.get(els.dest.value.trim().toUpperCase());
  const kind = els.kind.value;
  if (!home || !dest) {
    els.banner.textContent = 'Unknown airport. Use an ICAO identifier like KOWD.';
    return;
  }
  if (kind !== 'untowered' && !home.towered) {
    els.banner.textContent = `${home.id} is untowered — pick a towered field, or switch to the untowered scenario.`;
    return;
  }
  if (kind === 'untowered' && !home.freq.ctaf) {
    els.banner.textContent = `${home.id} has no CTAF in the data — pick another field.`;
    return;
  }

  const ac = { tail: els.tail.value.trim() || 'N725SP', type: els.type.value || undefined };
  const wx = randomWx();

  if (kind === 'untowered') {
    scenario = untoweredPattern({ home, dest, ac, wx });
  } else if (kind === 'classb') {
    const bravo = byId.get(els.bravo.value.trim().toUpperCase());
    if (!bravo) {
      els.banner.textContent = 'Unknown Class B airport.';
      return;
    }
    scenario = classBTransition({ home, dest, bravo, ac, wx });
  } else {
    scenario = departureWithFlightFollowing({ home, dest, ac, wx });
  }

  step = 0;
  els.log.innerHTML = '';
  els.panel.hidden = false;
  els.cockpit.hidden = false;
  // Start on the first frequency with the next one already in standby, the way
  // you would set up before taxi.
  const first = scenario.steps[0]?.freq;
  const second = scenario.steps.find((x) => x.freq !== first)?.freq;
  stack.setCom(first, second ?? first);

  const bits = [
    scenario.title,
    `wind ${String(wx.windDir).padStart(3, '0')} at ${wx.windKt}`,
    `altimeter ${wx.altimeter}`,
  ];
  if (kind !== 'classb') bits.push(`information ${WRITTEN.atis(wx.atis)}`, `runway ${scenario.rwy}`);
  bits.push(`you are ${WRITTEN.callsign(ac)}`);
  els.banner.textContent = bits.join(' · ');
  showStep();
}

function showStep() {
  const s = currentStep();
  if (!s) {
    els.prompt.textContent = 'Scenario complete.';
    els.freq.textContent = '---.---';
    els.facility.textContent = '—';
    els.ptt.disabled = true;
    els.hear.disabled = true;
    els.show.disabled = true;
    return;
  }
  els.freq.textContent = s.freq;
  els.facility.textContent = s.facility;
  els.prompt.textContent = s.prompt;
  els.example.hidden = true;
  refreshPeek();
  refreshTuned();
  els.typedText.value = '';
  refreshControls();

  // Some steps are the controller talking first; nothing to say, just listen.
  if (s.controllerFirst) transmit(s);
}

let speaking = false;

/** Repeat a transmission that has already happened. Changes no state. */
async function replay(s) {
  if (!s?.transmitted || speaking) return;
  speaking = true;
  refreshControls();
  log('atc', `${s.facility}: ${s.reply}`);
  await speakThroughRadio(audio(), s.replySpeech ?? s.reply, voiceFor(s.facility));
  speaking = false;
  refreshControls();
}

/** Play the controller's reply and, if the step needs one, wait for a readback. */
async function transmit(s) {
  const r = audio();
  s.transmitted = true;
  speaking = true;
  refreshControls();
  // Show the written form, speak the spoken one.
  log('atc', `${s.facility}: ${s.reply}`);
  await speakThroughRadio(r, s.replySpeech ?? s.reply, voiceFor(s.facility));
  speaking = false;
  if (s.note) log('note', s.note);
  refreshControls();
}

/** Enable only the buttons that make sense for where the exchange has got to. */
function refreshControls() {
  const s = currentStep();
  const yourTurn = Boolean(s) && (!s.controllerFirst || s.transmitted) && !speaking;
  els.ptt.disabled = !listener.available || !yourTurn;
  els.hear.disabled = !s?.transmitted || speaking;
  els.hear.title = speaking
    ? 'The controller is still transmitting'
    : s?.transmitted
      ? 'Repeat the last transmission'
      : 'Nothing to repeat yet — it is your turn';
  els.show.disabled = !s;
}

function log(kind, text) {
  const div = document.createElement('div');
  div.className = `entry ${kind}`;
  div.textContent = text;
  els.log.appendChild(div);
  div.scrollIntoView({ block: 'nearest' });
}

/** Grade what the pilot said, report it, and advance. */
async function submitCall(said) {
  const s = currentStep();
  if (!s || !said.trim()) return;
  log('pilot', `You: ${said}`);

  // A bare check-in is a real move on a busy frequency: you wait for "go ahead"
  // before spending airtime on the whole request.
  if (isCallup(said, { facility: s.facility, tail: scenario.ac.tail })) {
    const abbr = WRITTEN.callsign(scenario.ac, { abbreviated: true });
    const reply = `${abbr}, ${s.facility}, go ahead.`;
    log('atc', `${s.facility}: ${reply}`);
    speaking = true;
    refreshControls();
    await speakThroughRadio(audio(), reply, voiceFor(s.facility));
    speaking = false;
    log('note', 'Now make the request.');
    refreshControls();
    return;
  }

  // Untowered: nobody answers, so the call itself is what gets graded.
  if (s.mode === 'announce') {
    return report(grade(said, s.requires, { ...scenario.ac, mode: 'announce' }), s);
  }

  if (!s.controllerFirst) {
    // Decide the readback is owed *before* awaiting the reply. A pilot can key
    // up while the controller is still talking, and that input must be graded
    // rather than replaying the transmission.
    s.awaitingReadback = s.requires.length > 0;
    await transmit(s);
    if (s.awaitingReadback) {
      log('note', 'Now read it back.');
      return;
    }
    return advance();
  }

  report(grade(said, s.requires, scenario.ac), s);
}

/** Grade a readback for a step whose reply has already played. */
function submitReadback(said) {
  const s = currentStep();
  if (!s.requires.length) {
    // Nothing mandatory here — acknowledge and move on.
    log('pilot', `You: ${said}`);
    return advance();
  }
  log('pilot', `You: ${said}`);
  report(grade(said, s.requires, scenario.ac), s);
}

/**
 * Show the critique, and only move on when it was right.
 *
 * Failing forward teaches the wrong thing: if the readback was incomplete you
 * stay on this step and try again, the way a controller would simply wait.
 */
function report(result, s) {
  log(result.safe ? (result.pass ? 'good' : 'warn') : 'bad', result.summary);

  // Advisory: say it, do not block on it.
  if (s.freq && !stack.isActive(s.freq)) {
    log(
      'note',
      stack.isStandby(s.freq)
        ? `${s.freq} is in standby — flip-flop it across before you transmit.`
        : `You are transmitting on ${stack.frequencies.comActive}; this exchange is on ${s.freq}.`
    );
  }

  if (result.pass) {
    s.attempts = 0;
    return advance();
  }

  s.attempts = (s.attempts ?? 0) + 1;
  const what = s.mode === 'announce' ? 'call' : 'readback';
  if (s.attempts === 1) {
    log('note', `Try that ${what} again — say the parts you missed.`);
  } else {
    // Two misses is enough; show the model call rather than let it grind.
    refreshPeek();
    els.example.hidden = false;
    log('note', 'Here is the wording — say it and move on.');
  }
  refreshControls();
}

function advance() {
  step += 1;
  setTimeout(showStep, 400);
}

function handleInput(said) {
  const s = currentStep();
  if (!s || !said.trim()) return;
  if (s.mode === 'announce') return submitCall(said);
  // Once a step's reply has gone out, anything further is a readback — even if
  // the controller is still mid-transmission.
  if (s.awaitingReadback || s.transmitted) submitReadback(said);
  else submitCall(said);
}

// --- speech recognition -----------------------------------------------------

const listener = new Listener({
  onNote: (msg) => log('note', msg),
  onResult: (alts, engine) => {
    // The browser recogniser often gets aviation speech right only in its
    // second or third guess, so score them against what this step expects.
    // The ATC model returns one transcript and does not need the help.
    const expected = (currentStep()?.requires ?? []).map((r) => r.value);
    const best = engine === 'atc' ? alts[0] : bestAlternative(alts, expected);
    if (alts.length > 1 && best !== alts[0]) {
      log('note', `Heard "${alts[0].trim()}" — using the closer guess "${best.trim()}".`);
    }
    handleInput(best);
  },
});

listener.probe().then(() => {
  showEngine();
  refreshControls();
});

/** Say which recogniser is listening, and how to get the better one. */
function showEngine() {
  const el = els.ear;
  el.hidden = false;
  if (listener.engine === 'atc') {
    el.textContent = listener.modelLoaded
      ? 'Local ATC recogniser — it hears phonetics properly.'
      : 'Local ATC recogniser found; still loading the model, so the first call may lag.';
  } else if (listener.available && isLocalPage()) {
    el.innerHTML =
      'Browser recogniser — it fumbles phonetics. Run <code>npm run asr</code> for the ATC-tuned one.';
  } else if (listener.available) {
    // Telling a visitor to the hosted copy to run a server they do not have
    // would be noise; say what would actually help.
    el.innerHTML =
      'Browser recogniser — it fumbles phonetics like "five sierra papa". ' +
      'The ATC-tuned recogniser needs the app <a href="https://github.com/bobtista/direct-to">run locally</a>.';
  } else {
    el.textContent = 'No speech recognition in this browser — use Type instead.';
  }
}

if (!listener.available) {
  els.ptt.title = 'This browser has no speech recognition — use "Type instead".';
}

/** The tail number as it should sound, to anchor the recogniser. */
function callsignSpeech() {
  return scenario?.ac ? SPOKEN.callsign(scenario.ac) : '';
}

function startListening() {
  if (!listener.available || listener.listening) return;
  audio();
  // Tell the recogniser what this step is expecting. It biases decoding
  // towards real phraseology without accepting a wrong readback as right.
  listener.setHint(hintFor(currentStep(), { callsign: callsignSpeech(), type: scenario?.ac?.type }));
  els.ptt.classList.add('keyed');
  listener.start();
}

function stopListening() {
  // Unkey the button first: if the microphone was refused, the listener has
  // already stopped and would otherwise leave the key stuck down.
  els.ptt.classList.remove('keyed');
  listener.stop();
}

// Hold the button like a real PTT.
els.ptt.addEventListener('pointerdown', startListening);
els.ptt.addEventListener('pointerup', stopListening);
els.ptt.addEventListener('pointerleave', stopListening);

// --- wiring -----------------------------------------------------------------

els.brief.addEventListener('click', brief);
els.mute.addEventListener('click', () => setMuted(!muted));
setMuted(muted);

els.typeInstead.addEventListener('click', () => {
  els.typed.hidden = !els.typed.hidden;
  if (!els.typed.hidden) els.typedText.focus();
});

els.typed.addEventListener('submit', (e) => {
  e.preventDefault();
  const said = els.typedText.value;
  els.typedText.value = '';
  handleInput(said);
});

// "Say again" repeats what the controller already said. When it is still your
// turn there is nothing to repeat, and playing the reply early would both spoil
// the answer and leave the step thinking it had transmitted.
els.hear.addEventListener('click', () => replay(currentStep()));

function refreshPeek() {
  const s = currentStep();
  if (!s) return;
  // Before the controller speaks you need the call; afterwards, the readback.
  const say = s.transmitted && s.readback ? s.readback : s.example ?? s.readback;
  els.peekSay.textContent = say ?? '(nothing to say — just listen)';
  els.peekWhy.textContent = s.why ?? '';
}

els.show.addEventListener('click', () => {
  refreshPeek();
  els.example.hidden = !els.example.hidden;
});

els.kind.addEventListener('change', () => {
  els.bravoField.hidden = els.kind.value !== 'classb';
});

// Space bar keys the mic, the way a yoke switch would.
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  if (document.activeElement?.tagName === 'INPUT') return;
  e.preventDefault();
  startListening();
});
window.addEventListener('keyup', (e) => {
  if (e.code !== 'Space') return;
  if (document.activeElement?.tagName === 'INPUT') return;
  stopListening();
});

// Exposed for the console and for tests. Automated runs should call
// setMuted(true) first — this app makes noise by design.
window.__sayagain = {
  stack,
  get scenario() { return scenario; },
  get step() { return step; },
  handleInput,
  brief,
  setMuted,
};
