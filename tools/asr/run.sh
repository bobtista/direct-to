#!/usr/bin/env bash
# Start the local ATC speech recogniser. Run `npm run asr:setup` first.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x .venv/bin/python ]; then
  echo "Not set up yet — run: npm run asr:setup" >&2
  exit 1
fi

exec .venv/bin/python server.py
