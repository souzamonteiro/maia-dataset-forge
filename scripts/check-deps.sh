#!/usr/bin/env bash
set -e
command -v node >/dev/null || { echo 'Node.js >=20 required'; exit 1; }
command -v pdftotext >/dev/null || { echo 'Install poppler-utils: sudo apt install poppler-utils'; exit 1; }
command -v ollama >/dev/null || echo 'Warning: ollama not found in PATH (remote Ollama is also supported).'
echo 'Dependencies look OK.'
