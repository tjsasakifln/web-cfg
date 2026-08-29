"""Static accessibility checks on shipped commercial HTML + CSS."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.public_copy_scope import visitor_facing_html_files  # noqa: E402


# Same justified non-visitor published trees as the skip-link gate. They stay
# fully noindex; a page that becomes indexable under one of these prefixes
# fails that gate and must join the visitor census here.
NON_VISITOR_PUBLISHED_PREFIXES = (
    "piloto/",
    "assets/data-desk/",
)

# WCAG AA requires 4.5:1 for normal text. The release contract keeps at
# least another 0.5:1 on the canonical text/action pairings so a token edit
# cannot leave the public surface sitting exactly on the compliance edge.
AA_CONTRAST_WITH_MARGIN = 5.0
CONTRAST_PAIRS = (
    ("body on white", "text", "white"),
    ("muted on white", "muted", "white"),
    ("muted on soft", "muted", "soft"),
    ("primary action", "white", "green_700"),
    ("ink on soft", "ink", "soft"),
    ("white on navy", "white", "navy_950"),
    ("lime on navy", "lime_accent", "navy_950"),
)


def accessibility_pages(root: Path | None = None) -> list[Path]:
    """Every visitor HTML file except declared non-visitor published trees."""
    from scripts.site.public_copy_scope import relpath

    base = root or ROOT
    out: list[Path] = []
    for path in visitor_facing_html_files(base):
        rel = relpath(path, base)
        if any(rel.startswith(prefix) for prefix in NON_VISITOR_PUBLISHED_PREFIXES):
            continue
        out.append(path)
    return out


# Backward-compatible alias: previously a handwritten list of nine commercial pages.
PAGES = accessibility_pages()


def find_form_field(html: str, field_id: str) -> re.Match[str] | None:
    return re.search(
        rf"<(?:input|select|textarea)\b[^>]*\b(?:id|name)=[\"']{re.escape(field_id)}[\"'][^>]*>",
        html,
        re.I,
    )


def has_accessible_label(html: str, field_id: str) -> bool:
    field = find_form_field(html, field_id)
    if not field:
        return False
    tag = field.group(0)
    aria_label = re.search(r"\baria-label=[\"']([^\"']*)[\"']", tag, re.I)
    if aria_label and aria_label.group(1).strip():
        return True
    labelledby = re.search(r"\baria-labelledby=[\"']([^\"']+)[\"']", tag, re.I)
    if labelledby and any(
        re.search(rf"\bid=[\"']{re.escape(label_id)}[\"']", html, re.I)
        for label_id in labelledby.group(1).split()
    ):
        return True
    element_id = re.search(r"\bid=[\"']([^\"']+)[\"']", tag, re.I)
    if element_id and re.search(
        rf"<label\b[^>]*\bfor=[\"']{re.escape(element_id.group(1))}[\"']",
        html,
        re.I,
    ):
        return True
    return any(tag in label for label in re.findall(r"<label\b[^>]*>[\s\S]*?</label>", html, re.I))


def relative_luminance(hex_color: str) -> float:
    value = hex_color.removeprefix("#")
    if len(value) == 3:
        value = "".join(character * 2 for character in value)
    if not re.fullmatch(r"[0-9a-fA-F]{6}", value):
        raise ValueError(f"invalid hex color: {hex_color}")
    channels = [int(value[offset : offset + 2], 16) / 255 for offset in (0, 2, 4)]
    linear = [
        channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4
        for channel in channels
    ]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast_ratio(foreground: str, background: str) -> float:
    first = relative_luminance(foreground)
    second = relative_luminance(background)
    return (max(first, second) + 0.05) / (min(first, second) + 0.05)


def contrast_contract(root: Path = ROOT) -> tuple[list[str], list[str]]:
    design = json.loads((root / "data/site/design-system.json").read_text(encoding="utf-8"))
    colors = design["colors"]
    tokens = (root / "styles-tokens.css").read_text(encoding="utf-8").lower()
    failures: list[str] = []
    evidence: list[str] = []
    css_names = {
        "green_100_restricted": "green-100",
        "green_signal": "green-700",
        "lime_accent": "lime",
    }
    for name, value in colors.items():
        if not isinstance(value, str) or not value.startswith("#"):
            continue
        css_name = css_names.get(name, name).replace("_", "-")
        css_value = "#fff" if value.lower() == "#ffffff" else value.lower()
        if not re.search(rf"--{re.escape(css_name)}\s*:\s*{re.escape(css_value)}(?:;|\s)", tokens):
            failures.append(f"design token drift: {name}={value} missing from styles-tokens.css")
    for label, foreground_name, background_name in CONTRAST_PAIRS:
        ratio = contrast_ratio(colors[foreground_name], colors[background_name])
        evidence.append(f"{label}={ratio:.2f}:1")
        if ratio < AA_CONTRAST_WITH_MARGIN:
            failures.append(
                f"contrast margin: {label} is {ratio:.2f}:1, expected >= {AA_CONTRAST_WITH_MARGIN:.1f}:1"
            )
    return failures, evidence


def check_page(path: Path) -> list[str]:
    html = path.read_text(encoding="utf-8")
    errors = []
    if 'lang="pt-BR"' not in html and "lang='pt-BR'" not in html:
        errors.append("missing lang")
    if 'href="#conteudo"' not in html and "skip-link" not in html:
        errors.append("missing skip link")
    if "<main" not in html:
        errors.append("missing main landmark")
    if 'id="conteudo"' not in html:
        errors.append("missing #conteudo")
    # Home contact form fields are only required on the site home page.
    if path == ROOT / "index.html":
        for field in ("nome", "empresa", "email", "estagio", "urgencia", "mensagem"):
            if not has_accessible_label(html, field):
                errors.append(f"form field labeling: {field}")
        if not has_accessible_label(html, "consentimento"):
            errors.append("form field labeling: consentimento")
        if not re.search(r"<h1[\s>]", html):
            errors.append("missing h1")
        if "aria-label" not in html:
            errors.append("expected some aria-labels")
    elif "<form" in html:
        for field in ("nome", "empresa", "email", "telefone", "mensagem"):
            if find_form_field(html, field) and not has_accessible_label(html, field):
                errors.append(f"form field labeling: {field}")
        if find_form_field(html, "consentimento") and not has_accessible_label(html, "consentimento"):
            errors.append("form field labeling: consentimento")
    return errors


def main() -> int:
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    failures = []
    if "prefers-reduced-motion" not in css:
        failures.append("css: missing prefers-reduced-motion")
    if ":focus-visible" not in css and ":focus" not in css:
        failures.append("css: missing focus styles")
    contrast_failures, contrast_evidence = contrast_contract(ROOT)
    failures.extend(contrast_failures)
    pages = accessibility_pages(ROOT)
    if len(pages) < 100:
        failures.append(f"accessibility census collapsed: {len(pages)}")
    for p in pages:
        errs = check_page(p)
        for e in errs:
            failures.append(f"{p.relative_to(ROOT)}: {e}")
    if failures:
        print("FAIL accessibility static audit")
        for f in failures:
            print(" -", f)
        return 1
    print("OK audit:accessibility")
    print("checks: landmarks, skip-link, lang, form labels, consent, reduced-motion, focus, contrast")
    print("contrast >= 5.0:1:", ", ".join(contrast_evidence))
    return 0


if __name__ == "__main__":
    sys.exit(main())
