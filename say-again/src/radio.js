// A VHF-AM voice channel, in Web Audio.
//
// This is what makes synthetic speech read as "ATC". Aviation comms are a
// narrow, noisy, hard-limited pipe, and the ear keys on the channel far more
// than on the voice: band-limit to roughly 300-2700 Hz, squash everything to
// one loudness, clip it slightly, lay a hiss floor underneath, and bracket the
// transmission with a PTT click and a squelch tail.
//
// Ported from an ffmpeg chain that was tuned by ear against LiveATC.

const BAND_LOW = 300;
const BAND_HIGH = 2700;

/** Soft clipping, which is what an overdriven AM transmitter does to a voice. */
function clipCurve(amount = 1.9) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) * 0.82;
  }
  return curve;
}

/** A few seconds of pink-ish noise to use as the channel floor. */
function noiseBuffer(ctx, seconds = 3) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < d.length; i++) {
    const white = Math.random() * 2 - 1;
    // Cheap pink filter: closer to real radio hiss than flat white.
    b0 = 0.99765 * b0 + white * 0.099;
    b1 = 0.963 * b1 + white * 0.283;
    b2 = 0.57 * b2 + white * 1.0192;
    d[i] = (b0 + b1 + b2 + white * 0.1848) * 0.12;
  }
  return buf;
}

export class Radio {
  /**
   * @param {AudioContext} ctx
   * @param {{noise?: number, drive?: number, output?: AudioNode}} opts
   *   noise 0-1 sets how bad the channel is; drive sets the clipping.
   */
  constructor(ctx, { noise = 0.16, drive = 1.9, output } = {}) {
    this.ctx = ctx;
    this.destination = output ?? ctx.destination;

    // --- the voice path ---
    const hp1 = ctx.createBiquadFilter();
    hp1.type = 'highpass';
    hp1.frequency.value = BAND_LOW;
    const hp2 = ctx.createBiquadFilter();
    hp2.type = 'highpass';
    hp2.frequency.value = BAND_LOW;

    const lp1 = ctx.createBiquadFilter();
    lp1.type = 'lowpass';
    lp1.frequency.value = BAND_HIGH;
    const lp2 = ctx.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.value = BAND_HIGH;

    // A presence bump around 1.8 kHz is what gives radio voice its edge.
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 1800;
    presence.Q.value = 0.9;
    presence.gain.value = 6;

    const shaper = ctx.createWaveShaper();
    shaper.curve = clipCurve(drive);
    shaper.oversample = '4x';

    // Hard AGC: everything arrives at the same level, loud.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -28;
    comp.knee.value = 4;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.05;

    const makeup = ctx.createGain();
    makeup.gain.value = 1.8;

    this.input = ctx.createGain();
    this.input.connect(hp1);
    hp1.connect(hp2);
    hp2.connect(lp1);
    lp1.connect(lp2);
    lp2.connect(presence);
    presence.connect(shaper);
    shaper.connect(comp);
    comp.connect(makeup);

    // --- the channel floor, gated so it only exists during a transmission ---
    this.noiseLevel = noise;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;

    const nhp = ctx.createBiquadFilter();
    nhp.type = 'highpass';
    nhp.frequency.value = 380;
    const nlp = ctx.createBiquadFilter();
    nlp.type = 'lowpass';
    nlp.frequency.value = 2600;

    this.noiseSource = ctx.createBufferSource();
    this.noiseSource.buffer = noiseBuffer(ctx);
    this.noiseSource.loop = true;
    this.noiseSource.connect(nhp);
    nhp.connect(nlp);
    nlp.connect(this.noiseGain);
    this.noiseSource.start();

    this.bus = ctx.createGain();
    makeup.connect(this.bus);
    this.noiseGain.connect(this.bus);
    this.bus.connect(this.destination);

    this.muted = false;
    this.volume = 1;
  }

  /** Silence everything: the channel, the clicks, and the speech. */
  setMuted(muted) {
    this.muted = Boolean(muted);
    this.bus.gain.value = this.muted ? 0 : this.volume;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (!this.muted) this.bus.gain.value = this.volume;
  }

  /** A short burst of filtered noise: the mic click and the squelch tail. */
  #burst({ at, duration, level, low, high }) {
    const { ctx } = this;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseSource.buffer;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = low;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = high;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    src.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(this.destination);
    src.start(at);
    src.stop(at + duration + 0.02);
  }

  /** Key the mic: click, then open the noise floor. */
  keyDown(at = this.ctx.currentTime) {
    this.#burst({ at, duration: 0.035, level: 0.5, low: 800, high: 3200 });
    this.noiseGain.gain.cancelScheduledValues(at);
    this.noiseGain.gain.setValueAtTime(0, at);
    this.noiseGain.gain.linearRampToValueAtTime(this.noiseLevel, at + 0.04);
  }

  /** Unkey: close the floor and let the squelch crash. */
  keyUp(at = this.ctx.currentTime) {
    this.noiseGain.gain.cancelScheduledValues(at);
    this.noiseGain.gain.setValueAtTime(this.noiseGain.gain.value, at);
    this.noiseGain.gain.linearRampToValueAtTime(0, at + 0.03);
    this.#burst({ at: at + 0.02, duration: 0.12, level: 0.4, low: 1200, high: 3400 });
  }

  /** How rough this channel sounds, 0 (clean) to 1 (barely readable). */
  setQuality(q) {
    this.noiseLevel = 0.05 + (1 - q) * 0.45;
  }
}


let cancelCurrent = null;

/**
 * Stop the controller mid-word.
 *
 * On a real radio, keying up while someone is transmitting steps on them. Here
 * it just means you are ready to talk, and waiting out a transmission you have
 * already understood is the most tiring part of practising.
 */
export function stopSpeaking() {
  try {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  } catch {
    // A browser without speech synthesis has nothing to cancel.
  }
  const finish = cancelCurrent;
  cancelCurrent = null;
  finish?.();
}

/**
 * Speak text through the radio using the browser's own voices.
 *
 * SpeechSynthesis will not route into a Web Audio graph, so the channel effect
 * cannot be applied to it directly — the click, hiss and squelch are played
 * alongside instead, which lands most of the impression. Swapping in a TTS that
 * returns audio (see the README) routes properly through `radio.input`.
 *
 * @returns {Promise<void>} resolves when the transmission finishes
 */
export function speakThroughRadio(radio, text, voiceOpts = {}) {
  const rate = voiceOpts.rate ?? 1.15;
  // Rough spoken duration, used to time the squelch when the engine goes quiet
  // on us. ~14 characters a second at normal rate is close enough for ATC.
  const estimateMs = Math.max(700, (text.length / (14 * rate)) * 1000);

  return new Promise((resolve) => {
    let timer = null;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (cancelCurrent === finish) cancelCurrent = null;
      radio.keyUp();
      resolve();
    };

    // Keying up mid-transmission has to be able to cut the controller off, and
    // the promise's resolver is the only thing that can do that cleanly.
    cancelCurrent = finish;

    radio.keyDown();

    // Some environments have no voices at all (headless, a fresh Linux install,
    // a locked-down browser). Never let a missing voice deadlock the scenario:
    // key the mic, wait out the estimate, unkey.
    // Muted still takes the full time, so scenario pacing is unchanged.
    // A browser can expose speechSynthesis and still have no voices installed
    // (headless Chrome, some Linux setups). speak() then fires nothing at all,
    // so check first rather than waiting on events that never come.
    const engine = typeof speechSynthesis === 'undefined' ? null : speechSynthesis;
    const hasVoice = Boolean(engine && engine.getVoices && engine.getVoices().length);
    if (!engine || !hasVoice) {
      timer = setTimeout(finish, estimateMs);
      return;
    }

    const u = new SpeechSynthesisUtterance(text);
    if (voiceOpts.voice) u.voice = voiceOpts.voice;
    u.rate = rate;
    u.pitch = voiceOpts.pitch ?? 1;
    // SpeechSynthesis has its own volume, outside the Web Audio graph, so a
    // muted radio has to silence it here too.
    u.volume = radio.muted ? 0 : (voiceOpts.volume ?? radio.volume ?? 1);
    u.onend = finish;
    u.onerror = finish;

    // Belt and braces: resolve on our own schedule if the engine never reports
    // back, which it does not when no voice is installed.
    timer = setTimeout(finish, estimateMs + 2500);

    try {
      engine.speak(u);
    } catch {
      finish();
    }
  });
}
