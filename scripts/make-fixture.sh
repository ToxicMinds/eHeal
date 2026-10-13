#!/usr/bin/env bash
# Generates a synthetic speech fixture with Piper (local, free TTS).
# usage: scripts/make-fixture.sh <voice> <output.wav> <text>
# example voice: en_US-lessac-medium (downloaded once into ~/.local/share/eheal/piper)
set -euo pipefail
voice=$1 out=$2 text=$3
dir="${EHEAL_HOME:-$HOME/.local/share/eheal}/piper"
mkdir -p "$dir"
[ -f "$dir/$voice.onnx" ] || uvx --from piper-tts python -m piper.download_voices --download-dir "$dir" "$voice"
uvx --from piper-tts piper -m "$dir/$voice.onnx" -f "$out" -- "$text"
