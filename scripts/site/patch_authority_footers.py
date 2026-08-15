"""Patch footer-bottom on owned chrome pages to the authority cluster."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.authority import FOOTER_AUTHORITY_NAV  # noqa: E402

PAGES = [
    "index.html",
    "especialista/tiago-jun-sasaki/index.html",
    "metodologia-inteligencia/index.html",
    "casos/index.html",
    "casos/aditivo-art125-demonstrativo/index.html",
    "casos/medicao-glosa-demonstrativo/index.html",
    "diretoria-b2g/index.html",
    "diagnostico-b2g-360/index.html",
    "bid-room-licitacoes-obras/index.html",
    "defesa-margem-contratos-publicos/index.html",
    "ferramentas/index.html",
    "ferramentas/limite-acrescimos-supressoes/index.html",
    "ferramentas/checklist-reequilibrio/index.html",
    "ferramentas/matriz-atraso-obra/index.html",
    "ferramentas/diagnostico-defesa-margem/index.html",
    "radar/nacional-obras-publicas/index.html",
    "lei-14133-obras/limite-25-50-aditivo-obra/index.html",
    "conteudos/limite-aditivo-25-50-obra-publica/index.html",
    "privacidade/index.html",
    "termos-de-uso/index.html",
]

BOTTOM_RE = re.compile(
    r'<div class="container footer-bottom">.*?</div>',
    re.S,
)

REPLACEMENT = (
    '<div class="container footer-bottom">'
    '<span>© <span id="year">2026</span> CONFENGE. CNPJ 52.407.089/0001-09.</span>'
    f"{FOOTER_AUTHORITY_NAV}"
    "</div>"
)


def main() -> int:
    changed = 0
    for rel in PAGES:
        path = ROOT / rel
        html = path.read_text(encoding="utf-8")
        if FOOTER_AUTHORITY_NAV in html and "footer-bottom" in html:
            print("skip", rel)
            continue
        if not BOTTOM_RE.search(html):
            print("MISS", rel)
            return 1
        new = BOTTOM_RE.sub(REPLACEMENT, html, count=1)
        path.write_text(new, encoding="utf-8")
        changed += 1
        print("patched", rel)
    print("changed", changed)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
