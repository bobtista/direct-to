// Push-to-talk speech input, with two engines behind one interface.
//
// The browser's own recogniser is trained on ordinary English and mangles
// aviation speech — "five sierra papa" comes back as "50 pop". When the local
// ATC recogniser is running (npm run asr) we record the audio and send it there
// instead, to a Whisper model fine-tuned on real controller and pilot audio.
//
// Neither engine is required for the app to work: without a microphone you can
// still type, and without the local server you get the browser recogniser.

const HEALTH_TIMEOUT_MS = 900;
const DEFAULT_ENDPOINT = 'http://127.0.0.1:8781';

// Safari's MediaRecorder produces mp4/aac, Chrome and Firefox webm/opus. The
// server decodes either, but it needs the right extension to know which.
const FORMATS = [
  { mime: 'audio/webm;codecs=opus', ext: 'webm' },
  { mime: 'audio/webm', ext: 'webm' },
  { mime: 'audio/mp4', ext: 'mp4' },
  { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
];

/** The first recording format this browser will actually give us. */
export function pickFormat(supported = (m) => window.MediaRecorder?.isTypeSupported?.(m)) {
  return FORMATS.find((f) => supported(f.mime)) ?? null;
}

/**
 * A decoding hint: the vocabulary of the radio, plus this aircraft's callsign.
 *
 * Whisper conditions its decoding on this text, which is what pulls "five
 * sierra papa" back to the right tokens instead of "50 pop".
 *
 * It deliberately does NOT include the values this step is grading — the
 * runway, the squawk, the frequency. Priming the model with the right answer
 * risks it hearing the right answer when you said the wrong one, and a trainer
 * that passes a wrong readback is worse than one that mishears you. The
 * callsign is different: it is on every transmission, it is the thing the
 * browser recogniser reliably destroys, and no amount of biasing invents one
 * out of silence.
 */
const RADIO_VOCABULARY =
  'Air traffic control radio transmission using the phonetic alphabet: ' +
  'alpha bravo charlie delta echo foxtrot golf hotel india juliett kilo lima ' +
  'mike november oscar papa quebec romeo sierra tango uniform victor whiskey ' +
  'xray yankee zulu, niner and tree for nine and three. ' +
  'Typical words: runway, taxi via, hold short, line up and wait, cleared for ' +
  'takeoff, squawk, ident, radar contact, altimeter, climb and maintain, ' +
  'contact approach on, traffic in sight, wilco, roger.';

export function hintFor(step, { callsign = '', type = '' } = {}) {
  const bits = [RADIO_VOCABULARY];
  if (callsign) bits.push(`This aircraft is ${callsign}.`);
  else if (type) bits.push(`This aircraft is a ${type}.`);
  return bits.join(' ').slice(0, 900);
}

export class Listener {
  /**
   * @param {{onResult: (text: string, engine: string) => void,
   *          onNote?: (msg: string) => void,
   *          endpoint?: string}} opts
   */
  constructor({ onResult, onNote, endpoint = DEFAULT_ENDPOINT } = {}) {
    this.onResult = onResult;
    this.onNote = onNote ?? (() => {});
    this.endpoint = endpoint;
    this.engine = null; // 'atc' | 'browser' | null
    this.listening = false;
    this.modelLoaded = false;
    this.hint = '';

    this._stream = null;
    this._recorder = null;
    this._chunks = [];
    this._format = null;

    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    this._sr = SR ? new SR() : null;
    if (this._sr) {
      this._sr.lang = 'en-US';
      this._sr.interimResults = false;
      this._sr.maxAlternatives = 3;
      this._sr.onresult = (e) => this._browserResult(e);
      this._sr.onerror = (e) => this.onNote(`Microphone: ${e.error}`);
      this.engine = 'browser';
    }
  }

  /** Can we take voice input at all? */
  get available() {
    return this.engine != null;
  }

  get engineName() {
    return this.engine === 'atc' ? 'local ATC recogniser' : 'browser recogniser';
  }

  /** Look for the local recogniser; quietly keep the browser one if it is not up. */
  async probe() {
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) return this.engine;
    this._format = pickFormat();
    if (!this._format) return this.engine;

    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), HEALTH_TIMEOUT_MS);
      const res = await fetch(`${this.endpoint}/health`, { signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) return this.engine;
      const health = await res.json();
      if (!health.ok) return this.engine;
      this.engine = 'atc';
      this.modelLoaded = Boolean(health.loaded);
    } catch {
      // Not running. The browser recogniser is the fallback, so say nothing.
    }
    return this.engine;
  }

  /** Expected phraseology for the current step, used to bias decoding. */
  setHint(text) {
    this.hint = text ?? '';
  }

  async start() {
    if (!this.available || this.listening) return;
    this.listening = true;
    if (this.engine === 'atc') await this._startRecording();
    else this._startBrowser();
  }

  async stop() {
    if (!this.listening) return;
    this.listening = false;
    if (this.engine === 'atc') this._stopRecording();
    else this._sr?.stop();
  }

  // --- browser recogniser ---

  _startBrowser() {
    try {
      this._sr.start();
    } catch {
      this.listening = false;
    }
  }

  _browserResult(e) {
    const alts = [...e.results[0]].map((a) => a.transcript);
    this.onResult(alts, 'browser');
  }

  // --- local ATC recogniser ---

  async _startRecording() {
    try {
      // Hold the stream open between transmissions: re-requesting it each time
      // costs half a second, which is long enough to clip the first word.
      this._stream ??= await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      this.listening = false;
      this.onNote(`Microphone unavailable: ${err.name}`);
      return;
    }
    if (!this.listening) return; // released the key while permission was pending

    this._chunks = [];
    this._recorder = new MediaRecorder(this._stream, { mimeType: this._format.mime });
    this._recorder.ondataavailable = (e) => e.data.size && this._chunks.push(e.data);
    this._recorder.onstop = () => this._send();
    this._recorder.start();
  }

  _stopRecording() {
    if (this._recorder?.state === 'recording') this._recorder.stop();
  }

  async _send() {
    const blob = new Blob(this._chunks, { type: this._format.mime });
    this._chunks = [];
    // A stray tap is not a transmission.
    if (blob.size < 1200) return;

    const url = `${this.endpoint}/transcribe?ext=${this._format.ext}` +
      `&hint=${encodeURIComponent(this.hint)}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': this._format.mime },
        body: blob,
      });
      const out = await res.json();
      if (out.error) throw new Error(out.error);
      const text = (out.text ?? '').trim();
      if (text) this.onResult([text], 'atc');
      else if (out.dropped) this.onNote('That did not come through — say again.');
      else this.onNote('Nothing heard — hold the key while you speak.');
    } catch (err) {
      // Losing the server mid-session should degrade, not break.
      this.onNote(`Local recogniser failed (${err.message}); falling back to the browser.`);
      this.engine = this._sr ? 'browser' : null;
    }
  }
}
