"""Draws an invented Slovak lab report, slightly rotated and blurred like a phone photo.

usage: uv run --with pillow python scripts/make-document.py <output.jpg>
It made packages/test-fixtures/documents/lab-report-sk.jpg, which the engine's tests read
with OCR. Invented data only (spec 5.1)."""

import glob
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

font_path = next(p for p in glob.glob("/usr/share/fonts/**/*.ttf", recursive=True) if p.endswith("/DejaVuSans.ttf"))
regular = ImageFont.truetype(font_path, 30)
bold = ImageFont.truetype(font_path.replace("DejaVuSans.ttf", "DejaVuSans-Bold.ttf"), 34)
lines = [
    ("Laboratórny výsledok — Krvný obraz", bold),
    ("Dátum odberu: 3. 10. 2026", regular),
    ("Hemoglobín: 118 g/L (referencia 120–160) — nízky", regular),
    ("Feritín: 9 µg/L (referencia 15–150) — nízky", regular),
    ("Vitamín D: 21 ng/mL — nedostatok", regular),
    ("Glukóza nalačno: 5,1 mmol/L", regular),
    ("Záver: znížené zásoby železa, odporúčaná kontrola.", regular),
]
image = Image.new("RGB", (1400, 620), (246, 244, 238))
draw = ImageDraw.Draw(image)
for index, (text, font) in enumerate(lines):
    draw.text((60, 40 + 76 * index), text, fill=(25, 25, 30), font=font)
image = image.rotate(1.5, expand=True, fillcolor=(200, 198, 190)).filter(ImageFilter.GaussianBlur(0.8))
image.save(sys.argv[1], quality=70)
