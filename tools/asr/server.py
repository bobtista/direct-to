"""Local speech recognition tuned for ATC phraseology.

Browser speech recognition is trained on ordinary English and mangles the
phonetic alphabet: "five sierra papa" comes back as "50 pop". This serves a
Whisper model fine-tuned on air traffic control audio instead, which does not.

Everything stays on this machine — no audio leaves it, and there is nothing to
pay for after the model download.

    npm run asr           # from the repo root

The trainer detects it automatically and falls back to the browser recogniser
when it is not running, so this is an upgrade rather than a dependency.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

MODEL = os.environ.get("ASR_MODEL", "jacktol/whisper-medium.en-fine-tuned-for-ATC-faster-whisper")
PORT = int(os.environ.get("ASR_PORT", "8781"))
# The page is served from a different port, so the browser needs permission.
ALLOWED_ORIGIN = os.environ.get("ASR_ORIGIN", "*")
MAX_BYTES = 8 * 1024 * 1024
# Nobody talks faster than this, controllers included; anything above it is the
# model inventing words rather than transcribing them.
MAX_WORDS_PER_SEC = 6.0
NO_SPEECH_MAX = 0.6

_model = None
_model_lock = threading.Lock()
_load_error: str | None = None


def get_model():
    """Load once, on first use, so startup does not block on three gigabytes."""
    global _model, _load_error
    with _model_lock:
        if _model is None and _load_error is None:
            try:
                from faster_whisper import WhisperModel

                print(f"loading {MODEL} …", flush=True)
                # int8 on CPU is the right trade on Apple silicon: the model is
                # small enough that accuracy holds and it starts far faster.
                _model = WhisperModel(MODEL, device="cpu", compute_type="int8")
                print("ready", flush=True)
            except Exception as exc:  # noqa: BLE001 - report, do not crash
                _load_error = f"{type(exc).__name__}: {exc}"
                print(f"model failed to load: {_load_error}", file=sys.stderr, flush=True)
    return _model


# Browsers disagree on recording format: Chrome and Firefox give webm/opus,
# Safari mp4/aac. PyAV reads all of them, but it sniffs by extension.
EXTS = {"webm", "mp4", "ogg", "wav", "m4a"}


def transcribe(audio: bytes, hint: str = "", ext: str = "webm") -> dict:
    model = get_model()
    if model is None:
        return {"error": _load_error or "model unavailable"}

    # faster-whisper decodes via PyAV, which wants a real file for webm/opus.
    suffix = f".{ext if ext in EXTS else 'webm'}"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as fh:
        fh.write(audio)
        path = fh.name
    try:
        segments, info = model.transcribe(
            path,
            language="en",
            beam_size=5,
            # The hint is what the pilot is expected to say at this point in the
            # scenario. Whisper conditions on it, which is what makes callsigns
            # and squawk codes come back right.
            initial_prompt=hint or None,
            condition_on_previous_text=False,
            temperature=0.0,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 300},
        )
        kept = [s for s in segments if s.no_speech_prob < NO_SPEECH_MAX]
        text = " ".join(s.text.strip() for s in kept).strip()

        # Prompted decoding has one failure mode that matters here: given
        # unclear audio, Whisper can parrot the hint back. In a trainer that
        # would grade a mumble as a flawless readback, so throw out anything
        # that could not physically have been said in the time recorded.
        speech = sum(s.end - s.start for s in kept) or info.duration
        if text and speech > 0 and len(text.split()) / speech > MAX_WORDS_PER_SEC:
            return {"text": "", "dropped": "implausible speech rate"}

        return {"text": text, "duration": round(info.duration, 2)}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"{type(exc).__name__}: {exc}"}
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # quieter than the default
        if "/transcribe" in (self.path or ""):
            print(f"  {fmt % args}", flush=True)

    def _send(self, code: int, payload: dict):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # noqa: N802 - the http.server interface
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):  # noqa: N802
        if urlparse(self.path).path != "/health":
            self._send(404, {"error": "not found"})
            return
        # Report readiness without forcing a load, so the page can show status
        # while the model is still warming up.
        self._send(200, {
            "ok": True,
            "model": MODEL,
            "loaded": _model is not None,
            "error": _load_error,
        })

    def do_POST(self):  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/transcribe":
            self._send(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BYTES:
            self._send(400, {"error": "empty or oversized audio"})
            return

        audio = self.rfile.read(length)
        query = parse_qs(parsed.query)
        hint = (query.get("hint") or [""])[0][:900]
        ext = (query.get("ext") or ["webm"])[0].lower()
        result = transcribe(audio, hint, ext)
        self._send(200 if "text" in result else 500, result)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"ATC speech recognition on http://127.0.0.1:{PORT}")
    print("first transcription will pause while the model loads")
    # Warm up in the background so the first real request is not the slow one.
    threading.Thread(target=get_model, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
