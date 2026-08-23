"""Static accessibility checks on shipped commercial HTML + CSS."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGES = [
    ROOT / "index.html",
    ROOT / "diretoria-b2g" / "index.html",
    ROOT / "diagnostico-b2g-360" / "index.html",
    ROOT / "bid-room-licitacoes-obras" / "index.html",
    ROOT / "defesa-margem-contratos-publicos" / "index.html",
    ROOT / "atrasos-prorrogacao-obras-publicas" / "index.html",
    ROOT / "defesa-tecnica-contratos-publicos" / "index.html",
    ROOT / "acompanhamento-contratos-obras" / "index.html",
    ROOT / "ferramentas" / "diagnostico-defesa-margem" / "index.html",
]


def has_accessible_label(html: str, field_id: str) -> bool:
    field = re.search(
        rf"<(?:input|select|textarea)\b[^>]*\bid=[\"']{re.escape(field_id)}[\"'][^>]*>",
        html,
        re.I,
    )
    if not field:
        return True
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
    if re.search(rf"<label\b[^>]*\bfor=[\"']{re.escape(field_id)}[\"']", html, re.I):
        return True
    return any(
        re.search(rf"\bid=[\"']{re.escape(field_id)}[\"']", label, re.I)
        for label in re.findall(r"<label\b[^>]*>[\s\S]*?</label>", html, re.I)
    )


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
            if f'for="{field}"' not in html and f'id="{field}"' not in html:
                errors.append(f"form field labeling: {field}")
        if not re.search(r"<h1[\s>]", html):
            errors.append("missing h1")
        if "aria-label" not in html:
            errors.append("expected some aria-labels")
    elif "<form" in html:
        for field in ("nome", "empresa", "email", "telefone", "mensagem"):
            if not has_accessible_label(html, field):
                errors.append(f"form field labeling: {field}")
        consent = re.search(
            r"<label\b[^>]*>[\s\S]*?<input\b[^>]*\bname=[\"']consentimento[\"'][^>]*>[\s\S]*?</label>",
            html,
            re.I,
        )
        if 'name="consentimento"' in html and not consent:
            errors.append("form field labeling: consentimento")
    return errors


def main() -> int:
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    failures = []
    if "prefers-reduced-motion" not in css:
        failures.append("css: missing prefers-reduced-motion")
    if ":focus-visible" not in css and ":focus" not in css:
        failures.append("css: missing focus styles")
    for p in PAGES:
        errs = check_page(p)
        for e in errs:
            failures.append(f"{p.relative_to(ROOT)}: {e}")
    if failures:
        print("FAIL accessibility static audit")
        for f in failures:
            print(" -", f)
        return 1
    print("OK audit:accessibility")
    print("checks: landmarks, skip-link, lang, form labels (home), reduced-motion, focus")
    return 0


if __name__ == "__main__":
    sys.exit(main())
