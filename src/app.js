import { Radio, speakThroughRadio } from './radio.js';
import { departureWithFlightFollowing, randomWx } from './scenario.js';
import { grade } from './grade.js';
import { WRITTEN } from './phraseology.js';

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
  if (!home || !dest) {
    els.banner.textContent = 'Unknown airport. Use an ICAO identifier like KOWD.';
    return;
  }
  if (!home.towered) {
    els.banner.textContent = `${home.id} is untowered — pick a towered field to practise ATC calls.`;
    return;
  }

  const ac = { tail: els.tail.value.trim() || 'N725SP', type: els.type.value || undefined };
  scenario = departureWithFlightFollowing({ home, dest, ac, wx: randomWx() });
  step = 0;

  els.log.innerHTML = '';
  els.panel.hidden = false;
  els.banner.textContent =
    `${scenario.title} · wind ${String(scenario.wx.windDir).padStart(3, '0')} at ` +
    `${scenario.wx.windKt} · altimeter ${scenario.wx.altimeter} · information ${WRITTEN.atis(scenario.wx.atis)} · ` +
    `runway ${scenario.rwy} · you are ${WRITTEN.callsign(ac)}`;
  showStep();
}

function showStep() {
  const s = currentStep();
  if (!s) {
    els.prompt.textContent = 'Scenario complete.';
    els.freq.textContent = '---.---';
    els.facility.textContent = '—';
    els.ptt.disabled = true;
    return;
  }
  els.freq.textContent = s.freq;
  els.facility.textContent = s.facility;
  els.prompt.textContent = s.prompt;
  els.example.hidden = true;
  els.example.textContent = s.example ?? '';
  els.ptt.disabled = !recognition || !s.example;
  els.typedText.value = '';

  // Some steps are the controller talking first; nothing to say, just listen.
  if (s.controllerFirst) transmit(s);
}

/** Play the controller's reply and, if the step needs one, wait for a readback. */
async function transmit(s) {
  const r = audio();
  s.transmitted = true;
  // Show the written form, speak the spoken one.
  log('atc', `${s.facility}: ${s.reply}`);
  await speakThroughRadio(r, s.replySpeech ?? s.reply, voiceFor(s.facility));
  if (s.note) log('note', s.note);
  if (!s.requires.length) {
    // Nothing mandatory here; move on once the pilot acknowledges or skips.
    els.ptt.disabled = !recognition;
  }
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

  const result = grade(said, s.requires, scenario.ac);
  log(result.safe ? (result.pass ? 'good' : 'warn') : 'bad', result.summary);
  advance();
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
  const result = grade(said, s.requires, scenario.ac);
  log(result.safe ? (result.pass ? 'good' : 'warn') : 'bad', result.summary);
  s.awaitingReadback = false;
  advance();
}

function advance() {
  step += 1;
  setTimeout(showStep, 400);
}

function handleInput(said) {
  const s = currentStep();
  if (!s || !said.trim()) return;
  // Once a step's reply has gone out, anything further is a readback — even if
  // the controller is still mid-transmission.
  if (s.awaitingReadback || s.transmitted) submitReadback(said);
  else submitCall(said);
}

// --- speech recognition -----------------------------------------------------

const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
let recognition = null;

if (SR) {
  recognition = new SR();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;
  recognition.onresult = (e) => {
    // Any alternative that mentions the callsign is likelier to be the real one.
    const alts = [...e.results[0]].map((a) => a.transcript);
    const tail = scenario?.ac.tail.slice(-3).toLowerCase() ?? '';
    const best = alts.find((t) => t.toLowerCase().includes(tail[0] ?? '')) ?? alts[0];
    handleInput(best);
  };
  recognition.onerror = (e) => log('note', `Microphone: ${e.error}`);
} else {
  els.ptt.title = 'This browser has no speech recognition — use "Type instead".';
}

let listening = false;
function startListening() {
  if (!recognition || listening) return;
  audio();
  listening = true;
  els.ptt.classList.add('keyed');
  try {
    recognition.start();
  } catch {
    listening = false;
  }
}
function stopListening() {
  if (!recognition || !listening) return;
  listening = false;
  els.ptt.classList.remove('keyed');
  recognition.stop();
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

els.hear.addEventListener('click', () => {
  const s = currentStep();
  if (s) transmit(s);
});

els.show.addEventListener('click', () => {
  els.example.hidden = !els.example.hidden;
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
  get scenario() { return scenario; },
  get step() { return step; },
  handleInput,
  brief,
  setMuted,
};
