"""Tokenize shipped HTML of the prazo/atraso/notificação cluster.

Used by tests to measure pairwise paragraph overlap, title uniqueness,
exclusive chronology/matrix/example/checklist blocks, and stage CTAs.
Does not reimplement page copy: it reads the rendered files on disk.
"""

from __future__ import annotations

import json
import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]

OWNED_ROUTES: tuple[str, ...] = (
    "/conteudos/atraso-obra-culpa-administracao/",
    "/conteudos/prorrogacao-prazo-obra-publica-documentos/",
    "/conteudos/resposta-notificacao-atraso-obra-publica/",
    "/lei-14133-obras/atraso-imputavel-administracao/",
)

OWNERSHIP: dict[str, dict[str, Any]] = {
    "/conteudos/atraso-obra-culpa-administracao/": {
        "decision_id": "provar-causa",
        "h1_needles": ("prova", "culpa"),
        "forbidden_hrefs": ("/defesa-margem-contratos-publicos/",),
        "required_hrefs": ("/conteudos/prorrogacao-prazo-obra-publica-documentos/",),
        "section_ids": ("cronologia", "matriz", "exemplo-tecnico", "checklist"),
        "cta_needles": ("prova", "causa"),
    },
    "/conteudos/prorrogacao-prazo-obra-publica-documentos/": {
        "decision_id": "montar-pedido",
        "h1_needles": ("dossiê", "prorrogação"),
        "forbidden_hrefs": ("/defesa-margem-contratos-publicos/",),
        "required_hrefs": ("/conteudos/resposta-notificacao-atraso-obra-publica/",),
        "section_ids": ("cronologia", "matriz", "exemplo-tecnico", "checklist"),
        "cta_needles": ("dossiê", "prorrogação"),
    },
    "/conteudos/resposta-notificacao-atraso-obra-publica/": {
        "decision_id": "responder-imputacao",
        "h1_needles": ("resposta", "notificação"),
        "forbidden_hrefs": ("/defesa-margem-contratos-publicos/",),
        "required_hrefs": (
            "/lei-14133-obras/atraso-imputavel-administracao/",
            "/defesa-tecnica-contratos-publicos/",
        ),
        "section_ids": ("cronologia", "matriz", "exemplo-tecnico", "checklist"),
        "cta_needles": ("resposta", "notificação"),
    },
    "/lei-14133-obras/atraso-imputavel-administracao/": {
        "decision_id": "compreender-dispositivo",
        "h1_needles": ("vigência", "execução"),
        "forbidden_hrefs": ("/defesa-margem-contratos-publicos/",),
        "required_hrefs": (),
        "section_ids": ("cronologia", "matriz", "exemplo-tecnico", "checklist"),
        "cta_needles": ("enquadrar", "vigência"),
        "robots_must_include": "noindex",
    },
}

OVERLAP_LIMIT = 0.15
TITLE_NEAR_EQUIV = 0.55

_SHELL_TAGS = frozenset(
    {
        "header",
        "nav",
        "footer",
        "script",
        "style",
        "svg",
        "noscript",
    }
)
_SHELL_CLASS_RE = re.compile(
    r"(site-header|site-footer|desktop-nav|mobile-nav|skip-link|svg-sprite|"
    r"contact-float|whatsapp-float|author-box|editorial-cta|lead-inline|"
    r"commercial-bridge|editorial-bridge|article-aside|technical-note|"
    r"article-decision|sources-section|related-section)",
    re.I,
)


class _ArticleText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.skip_stack: list[str] = []
        self.in_article = 0
        self.buf: list[str] = []
        self.blocks: list[str] = []
        self.current_id: str | None = None
        self.section_text: dict[str, list[str]] = {}
        self.title = ""
        self.description = ""
        self.h1 = ""
        self.in_title = False
        self.in_h1 = False
        self.hrefs: list[str] = []
        self.canonical = ""
        self.robots = ""

    def _skipping(self) -> bool:
        return bool(self.skip_stack)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {k: (v or "") for k, v in attrs}
        classes = ad.get("class", "")
        eid = ad.get("id", "")
        if tag == "title":
            self.in_title = True
        if tag == "h1":
            self.in_h1 = True
        if tag == "link" and "canonical" in ad.get("rel", "").split():
            self.canonical = ad.get("href", "")
        if tag == "meta":
            meta_name = ad.get("name", "").lower()
            if meta_name == "robots":
                self.robots = ad.get("content", "")
            elif meta_name == "description":
                self.description = ad.get("content", "")
        if tag == "a" and ad.get("href"):
            self.hrefs.append(ad["href"])
        shell = (
            tag in _SHELL_TAGS
            or bool(_SHELL_CLASS_RE.search(classes))
            or bool(_SHELL_CLASS_RE.search(eid))
        )
        if shell or self._skipping():
            if shell and not self._skipping():
                self.skip_stack.append(tag)
            elif shell and self._skipping():
                self.skip_stack.append(tag)
            return
        if tag == "article":
            self.in_article += 1
        if eid in {"cronologia", "matriz", "exemplo-tecnico", "checklist"}:
            self.current_id = eid

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self.in_title = False
        if tag == "h1":
            self.in_h1 = False
        if self.skip_stack and tag == self.skip_stack[-1]:
            self.skip_stack.pop()
            self._flush()
            return
        if self._skipping():
            return
        if tag == "article" and self.in_article:
            self.in_article -= 1
            self._flush()
        if tag == "section" and self.current_id:
            self.current_id = None
        if tag in {"p", "li", "h2", "h3", "td", "th"}:
            self._flush()

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title += data
        if self.in_h1:
            self.h1 += data
        if self._skipping():
            return
        if self.in_article:
            self.buf.append(data)
            if self.current_id:
                self.section_text.setdefault(self.current_id, []).append(data)

    def _flush(self) -> None:
        text = normalize_text("".join(self.buf))
        self.buf = []
        if len(text) >= 40:
            self.blocks.append(text)


def normalize_text(text: str) -> str:
    t = text.lower()
    t = re.sub(r"[^\wáàâãéêíóôõúç\s]", " ", t, flags=re.I)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def html_path_for(route: str, root: Path | None = None) -> Path:
    base = root or ROOT
    return base / route.strip("/") / "index.html"


def parse_page(route: str, root: Path | None = None) -> _ArticleText:
    path = html_path_for(route, root)
    html = path.read_text(encoding="utf-8")
    parser = _ArticleText()
    parser.feed(html)
    parser._flush()
    return parser


def paragraph_set(parser: _ArticleText) -> set[str]:
    return {b for b in parser.blocks if b}


def substantive_shingles(parser: _ArticleText, size: int = 5) -> set[str]:
    """Return paragraph-bounded word shingles for substantive reuse checks."""
    shingles: set[str] = set()
    for block in parser.blocks:
        tokens = block.split()
        shingles.update(" ".join(tokens[i : i + size]) for i in range(len(tokens) - size + 1))
    return shingles


def pairwise_overlap(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 0.0
    inter = len(a & b)
    smaller = min(len(a), len(b))
    return inter / smaller if smaller else 0.0


def title_token_jaccard(a: str, b: str) -> float:
    sa = set(re.findall(r"\w+", normalize_text(a)))
    sb = set(re.findall(r"\w+", normalize_text(b)))
    sa -= {"confenge", "a", "o", "de", "da", "do", "em", "na", "no", "e"}
    sb -= {"confenge", "a", "o", "de", "da", "do", "em", "na", "no", "e"}
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def section_normalized(parser: _ArticleText, section_id: str) -> str:
    return normalize_text(" ".join(parser.section_text.get(section_id) or []))


def measure_cluster(root: Path | None = None) -> dict[str, Any]:
    pages: dict[str, _ArticleText] = {r: parse_page(r, root) for r in OWNED_ROUTES}
    pairs = []
    for i, ra in enumerate(OWNED_ROUTES):
        for rb in OWNED_ROUTES[i + 1 :]:
            shingles_a = substantive_shingles(pages[ra])
            shingles_b = substantive_shingles(pages[rb])
            shared = shingles_a & shingles_b
            ratio = pairwise_overlap(shingles_a, shingles_b)
            pairs.append(
                {
                    "a": ra,
                    "b": rb,
                    "shared_samples": sorted(shared)[:12],
                    "shared_count": len(shared),
                    "overlap": round(ratio, 4),
                    "size_a": len(shingles_a),
                    "size_b": len(shingles_b),
                }
            )
    return {
        "routes": list(OWNED_ROUTES),
        "titles": {r: pages[r].title.strip() for r in OWNED_ROUTES},
        "descriptions": {r: pages[r].description.strip() for r in OWNED_ROUTES},
        "h1": {r: pages[r].h1.strip() for r in OWNED_ROUTES},
        "robots": {r: pages[r].robots for r in OWNED_ROUTES},
        "pairs": pairs,
        "max_overlap": max((p["overlap"] for p in pairs), default=0.0),
    }


def two_way_loops(root: Path | None = None) -> list[tuple[str, str]]:
    pages = {r: parse_page(r, root) for r in OWNED_ROUTES}
    loops: list[tuple[str, str]] = []
    for i, ra in enumerate(OWNED_ROUTES):
        for rb in OWNED_ROUTES[i + 1 :]:
            a_to_b = any(rb.rstrip("/") in h for h in pages[ra].hrefs)
            b_to_a = any(ra.rstrip("/") in h for h in pages[rb].hrefs)
            if a_to_b and b_to_a:
                loops.append((ra, rb))
    return loops
