"""Check WCAG contrast of the design system's colour pairs in every theme.

Run: python3 design/check_contrast.py   (exits 1 if a pair falls short)
"""

import json
import sys
from pathlib import Path

TOKENS = json.loads((Path(__file__).parent / "project" / "tokens.json").read_text())

# (foreground, background, minimum ratio): 4.5 for text, 3 for marks, edges and focus.
PAIRS = [
    *[(fg, bg, 4.5) for fg in ("ink", "ink-muted") for bg in ("ground", "paper", "paper-sunk")],
    *[("ink", bg, 4.5) for bg in ("practitioner-tint", "patient-tint", "oxblood-tint")],
    *[(voice, bg, 4.5) for voice in ("practitioner", "patient", "oxblood") for bg in ("ground", "paper")],
    ("practitioner", "practitioner-tint", 4.5),
    ("patient", "patient-tint", 4.5),
    ("oxblood", "oxblood-tint", 4.5),
    ("on-practitioner", "practitioner", 4.5),
    ("on-practitioner", "practitioner-deep", 4.5),
    ("on-patient", "patient", 4.5),
    ("lamp-ink", "lamp-tint", 4.5),
    ("on-screen", "screen", 4.5),
    *[("lamp-mark", bg, 3) for bg in ("paper", "lamp-tint")],
    *[(edge, bg, 3) for edge in ("rule-strong", "focus") for bg in ("ground", "paper", "paper-sunk")],
]


def resolve(name: str, theme: str) -> str:
    token = next(t for t in TOKENS["color"]["tokens"] if t["name"] == name)
    value = token["value"]
    value = value if isinstance(value, str) else value.get(theme, value["light"])
    return resolve(value[1:-1], theme) if value.startswith("{") else value


def luminance(hex_colour: str) -> float:
    def channel(c: int) -> float:
        s = c / 255
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4

    r, g, b = (int(hex_colour[i : i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def ratio(a: str, b: str) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


failures = 0
for theme in (t["id"] for t in TOKENS["color"]["themes"]):
    for fg, bg, minimum in PAIRS:
        r = ratio(resolve(fg, theme), resolve(bg, theme))
        if r < minimum:
            failures += 1
            print(f"FAIL {theme}: {fg} on {bg} = {r:.2f} (needs {minimum})")
print(f"{len(PAIRS) * len(TOKENS['color']['themes'])} pairs checked, {failures} short")
sys.exit(1 if failures else 0)
