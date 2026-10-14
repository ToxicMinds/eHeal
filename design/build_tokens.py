"""Compile design/project/tokens.json into CSS custom properties.

Run: python3 design/build_tokens.py > apps/web/src/app/tokens.css
The layout follows the design-system page's own tokens.css, plus a
prefers-color-scheme block so the app follows the system theme.
"""

import json
import sys
from pathlib import Path

TOKENS = json.loads((Path(__file__).parent / "project" / "tokens.json").read_text())


def value(raw: str) -> str:
    return f"var(--{raw[1:-1]})" if raw.startswith("{") else raw


def themed(theme: str) -> list[str]:
    first = TOKENS["color"]["themes"][0]["id"]
    lines = []
    for family in ("color", "shadow"):
        for token in TOKENS[family]["tokens"]:
            v = token["value"]
            if isinstance(v, dict):
                if theme in v or theme == first:
                    lines.append(f"  --{token['name']}: {value(v.get(theme, v[first]))};")
            elif theme == first or v.startswith("{"):
                lines.append(f"  --{token['name']}: {value(v)};")
    return lines


def css(font_dir: str | None = None) -> str:
    dark = "\n".join(themed("dark"))
    out = [
        ':root, [data-theme="light"] {', *themed("light"), "}",
        '[data-theme="dark"] {', dark, "  color-scheme: dark;", "}",
        '@media (prefers-color-scheme: dark) {', '  :root:not([data-theme="light"]) {', dark, "    color-scheme: dark;", "  }", "}",
        ":root {",
    ]
    for family in ("spacing", "radius", "size"):
        out += [f"  --{t['name']}: {t['value']};" for t in TOKENS[family]["tokens"]]
    out += [f"  --font-{key}: {stack};" for key, stack in TOKENS["type"]["families"].items()]
    out.append("}")
    for group in TOKENS["type"]["groups"]:
        for style in group["styles"]:
            rules = [f"font-family: var(--font-{style.get('family', group['family'])})", f"font-size: {style['fontSize']}",
                     f"line-height: {style['lineHeight']}", f"font-weight: {style['fontWeight']}"]
            if "letterSpacing" in style:
                rules.append(f"letter-spacing: {style['letterSpacing']}")
            out.append(f".{style['name']} {{ {'; '.join(rules)}; }}")
    if font_dir is not None:
        for font in TOKENS["type"]["fonts"]:
            out.append(f"@font-face {{ font-family: \"{font['family']}\"; src: url(\"{font_dir}/{Path(font['file']).name}\") format(\"woff2\"); "
                       f"font-weight: {font['weight']}; font-style: {font.get('style', 'normal')}; font-display: swap; }}")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    sys.stdout.write("/* eHeal — generated from design/project/tokens.json by design/build_tokens.py */\n" + css())
