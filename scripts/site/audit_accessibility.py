"""Static accessibility checks on shipped commercial HTML + CSS."""

from __future__ import annotations

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
    print("checks: landmarks, skip-link, lang, form labels, consent, reduced-motion, focus")
    return 0


if __name__ == "__main__":
    sys.exit(main())
