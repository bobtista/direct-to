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
// What the browser recogniser's failures actually mean, in words that say what
// to do about them. An empty string means "expected, stay quiet".
const SPEECH_ERRORS = {
  aborted: '',
  'no-speech': 'No speech detected — hold the key down while you speak.',
  'not-allowed': 'The browser blocked the microphone. Allow it for this site, then try again.',
  'service-not-allowed': 'This browser refused speech recognition for this page.',
  'audio-capture': 'No microphone available — another app may have taken it.',
  network: 'Speech recognition needs a network connection.',
};

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

/** Is this page being served from the same machine the recogniser would run on? */
export function isLocalPage(host = window.location?.hostname ?? '') {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
}

export class Listener {
  /**
   * @param {{onResult: (text: string, engine: string) => void,
   *          onNote?: (msg: string) => void,
   *          endpoint?: string}} opts
   */
  constructor({ onResult, onNote, onIdle, endpoint = DEFAULT_ENDPOINT } = {}) {
    this.onResult = onResult;
    this.onNote = onNote ?? (() => {});
    this.onIdle = onIdle ?? (() => {});
    this.endpoint = endpoint;
    this.engine = null; // 'atc' | 'browser' | null
    this.listening = false;
    this.modelLoaded = false;
    this.hint = '';

    this._stream = null;
    this._recorder = null;
    this._chunks = [];
    this._format = null;

    this._heard = false;
    this._reported = false;
    this._interim = '';

    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    this._sr = SR ? new SR() : null;
    if (this._sr) {
      this._sr.lang = 'en-US';
      // Push-to-talk is a short, deliberate burst, and Chrome will not have
      // finalised a transcript by the time the key comes up. Interim results
      // give us a draft to fall back on, and `continuous` stops it cutting out
      // at the first pause between "Norwood Ground" and the rest of the call.
      this._sr.interimResults = true;
      this._sr.continuous = true;
      this._sr.maxAlternatives = 3;

      this._sr.onstart = () => {
        this._heard = false;
        this._reported = false;
        this._interim = '';
      };
      this._sr.onresult = (e) => this._browserResult(e);
      this._sr.onerror = (e) => {
        const known = Object.prototype.hasOwnProperty.call(SPEECH_ERRORS, e.error);
        // An unmapped error used to fall through to "nothing came through",
        // which hid the one piece of information worth having.
        const msg = known ? SPEECH_ERRORS[e.error] : `Speech recognition failed: ${e.error}.`;
        if (msg) this.onNote(msg);
        this._reported = true;
      };
      // Recognition can end on its own — a pause, a timeout, a lost mic — so
      // the button state has to follow the recogniser rather than the key.
      this._sr.onend = () => {
        this.listening = false;
        this.onIdle();
        // A draft is better than nothing: it is what was actually said, just
        // not yet confirmed.
        if (!this._heard && this._interim.trim()) {
          this._heard = true;
          this.onResult([this._interim.trim()], 'browser');
          return;
        }
        if (!this._heard && !this._reported) {
          this.onNote('Nothing came through — hold the key down while you speak.');
        }
      };
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
    // Only worth asking when the page itself is local. From the hosted copy on
    // GitHub Pages, Chrome blocks loopback requests behind a "wants to access
    // devices on your local network" permission prompt — which no visitor to a
    // public page should be shown, least of all for a server they are not
    // running. Someone serving the app on their LAN to a tablet is in the same
    // position: the model is on the host machine, not on the tablet.
    if (!isLocalPage()) return this.engine;
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
    // The same stream carries drafts and finished transcripts; only a final
    // one counts as heard, but keep the latest draft as a fallback.
    for (let i = e.resultIndex; i < e.results.length; i += 1) {
      const r = e.results[i];
      if (r.isFinal) {
        this._heard = true;
        this.onResult([...r].map((a) => a.transcript), 'browser');
      } else {
        this._interim = r[0]?.transcript ?? '';
      }
    }
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
      this.onIdle();
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
