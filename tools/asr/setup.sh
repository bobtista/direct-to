#!/usr/bin/env bash
# One-time setup for the local ATC speech recogniser.
#
# Downloads a Whisper model fine-tuned on air traffic control audio (~3 GB)
# and the Python package that runs it. Everything lands in this directory and
# the shared Hugging Face cache; nothing touches the system Python.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v uv >/dev/null 2>&1; then
  echo "This needs uv: brew install uv" >&2
  exit 1
fi

echo "Creating the environment…"
uv venv --python 3.12 .venv
# shellcheck disable=SC1091
source .venv/bin/activate
uv pip install --quiet faster-whisper

echo "Fetching the ATC model (~3 GB, one time)…"
echo "If it stalls, ctrl-C and run this again — it picks up where it left off."
python -c "
from huggingface_hub import snapshot_download
snapshot_download('${ASR_MODEL:-jacktol/whisper-medium.en-fine-tuned-for-ATC-faster-whisper}',
                  max_workers=4)
print('done')
"

echo
echo "Ready. Start it with:  npm run asr"
