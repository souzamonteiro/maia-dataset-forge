#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec 9>data/logs/batch-pilot.lock
flock -n 9 || { echo 'Another benchmark holds the lock'; exit 1; }
echo "[$(date -Is)] Downloading llama3.1:8b"
ollama pull llama3.1:8b
echo "[$(date -Is)] Downloading gemma3:12b"
ollama pull gemma3:12b
echo "[$(date -Is)] Starting comparison"
node scripts/compare-generators.js
