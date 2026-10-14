"""Turns an invented consultation into two speaker tracks, as a call would record them.

usage: python3 scripts/make-dialogue.py <consultation.json> <output-dir>
Each turn is spoken by that speaker's Piper voice (local, free text-to-speech); while one
speaks, the other's track is silent. Writes practitioner.wav, patient.wav and script.json
(each speaker's words, the reference for measuring transcription accuracy).
Invented data only (spec 5.1). Text-to-speech is cleaner than a real call: see
packages/test-fixtures/README.md."""

import json
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

PIPER = Path.home() / ".local/share/watson/piper"
GAP = 0.6  # seconds between turns


def speak(voice: str, text: str, out: Path) -> None:
    if not (PIPER / f"{voice}.onnx").is_file():
        subprocess.run(["uvx", "--from", "piper-tts", "python", "-m", "piper.download_voices",
                        "--download-dir", str(PIPER), voice], check=True, capture_output=True)
    subprocess.run(["uvx", "--from", "piper-tts", "piper", "-m", str(PIPER / f"{voice}.onnx"),
                    "-f", str(out), "--", text], check=True, capture_output=True)


def main() -> None:
    case = json.loads(Path(sys.argv[1]).read_text())
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    rate = 22050
    tracks: dict[str, bytearray] = {"practitioner": bytearray(), "patient": bytearray()}
    with tempfile.TemporaryDirectory() as tmp:
        for i, (speaker, text) in enumerate(case["turns"]):
            clip = Path(tmp) / f"{i}.wav"
            speak(case["voices"][speaker], text, clip)
            with wave.open(str(clip)) as w:
                rate = w.getframerate()
                frames = w.readframes(w.getnframes())
            gap = bytes(int(GAP * rate) * 2)
            for who, data in tracks.items():
                data += (frames if who == speaker else bytes(len(frames))) + gap
    for who, data in tracks.items():
        with wave.open(str(out / f"{who}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(bytes(data))
    script = {who: " ".join(t for s, t in case["turns"] if s == who) for who in tracks}
    (out / "script.json").write_text(json.dumps(script, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {out}/practitioner.wav, patient.wav, script.json")


if __name__ == "__main__":
    main()
