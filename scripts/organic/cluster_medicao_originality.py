"""Originality checks for the six indexable Medição/Glosa/Pagamento decision URLs.

Drives the shipped HTML under conteudos/<slug>/index.html. Paragraph extraction
drops navegação, aviso legal, autoria and fontes, then compares normalized
bodies pairwise. This module is the single implementation the pytest file calls;
the test does not reimplement extraction.
"""

from __future__ import annotations

import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

CLUSTER_SLUGS: tuple[str, ...] = (
    "atraso-na-medicao-obra-publica",
    "fiscal-nao-assina-medicao-obra-publica",
    "glosa-por-qualidade-obra-publica",
    "medicao-por-evento-obra-publica",
    "pagamento-parcial-etapa-empreitada-global",
    "atraso-pagamento-contrato-publico-suspender",
)

REQUIRED_SECTION_IDS: tuple[str, ...] = (
    "resposta",
    "cenario",
    "distincoes",
    "documentos",
    "fluxo",
    "exemplo",
    "erros",
    "limites",
    "fontes",
)

# One exclusive numeric or documentary string per remaining URL.
EXCLUSIVE_ARTIFACTS: dict[str, str] = {
    "atraso-na-medicao-obra-publica": "650 m²",
    "fiscal-nao-assina-medicao-obra-publica": "SEI 23456.000781/2026-44",
    "glosa-por-qualidade-obra-publica": "CP-04/lab 1,8 MPa",
    "medicao-por-evento-obra-publica": "Evento E-04",
    "pagamento-parcial-etapa-empreitada-global": "Etapa 3-cobertura",
    "atraso-pagamento-contrato-publico-suspender": "NF-e 1847",
}

CTA_FAMILIES: dict[str, str] = {
    "atraso-na-medicao-obra-publica": "dossie",
    "fiscal-nao-assina-medicao-obra-publica": "dossie",
    "glosa-por-qualidade-obra-publica": "dossie",
    "medicao-por-evento-obra-publica": "conteudo",
    "pagamento-parcial-etapa-empreitada-global": "triagem",
    "atraso-pagamento-contrato-publico-suspender": "triagem",
}

GENERIC_CTA_MOLD = "enviar documentos para análise"
RECEIPT_GUARANTEE = re.compile(
    r"garant(e|imos|ia)\s+(o\s+)?recebimento|recebimento\s+garantido",
    re.I,
)
LEGAL_ADVICE_CLAIM = re.compile(
    r"este\s+texto\s+é\s+aconselhamento\s+jurídico|substitui\s+advogado",
    re.I,
)

_SKIP_CLASS = {
    "article-toc",
    "sources-section",
    "author-box",
    "technical-note",
}
_SKIP_ID = {"fontes"}
_BLOCK_TAGS = {"p", "li", "dd", "dt", "td", "th", "summary"}
_WS = re.compile(r"\s+")
_TAG = re.compile(r"<[^>]+>")


class _ArticleParagraphParser(HTMLParser):
    """Collect block text inside article.article-main, honoring skip regions."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_article = False
        self.skip_stack: list[str] = []
        self.cta_stack: list[str] = []
        self.capture_tag: str | None = None
        self.buf: list[str] = []
        self.paragraphs: list[str] = []
        self.section_ids: set[str] = set()
        self.cta_buf: list[str] = []

    @property
    def cta_text(self) -> str:
        return _WS.sub(" ", "".join(self.cta_buf)).strip()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {k: (v or "") for k, v in attrs}
        classes = set((ad.get("class") or "").split())
        ident = ad.get("id") or ""
        if tag == "article" and "article-main" in classes:
            self.in_article = True
        if not self.in_article:
            return
        if ident:
            self.section_ids.add(ident)
        skip = (
            bool(classes & _SKIP_CLASS)
            or ident in _SKIP_ID
            or tag == "nav"
            or (tag == "p" and "technical-note" in classes)
        )
        if skip:
            self.skip_stack.append(tag)
        if (
            "lead-inline" in classes
            or ad.get("data-commercial-bridge") == "1"
            or ident == "diagnostico-confenge"
        ):
            self.cta_stack.append(tag)
        if self.skip_stack:
            return
        if tag in _BLOCK_TAGS and self.capture_tag is None:
            self.capture_tag = tag
            self.buf = []

    def handle_endtag(self, tag: str) -> None:
        if not self.in_article:
            return
        if self.capture_tag == tag:
            raw = _WS.sub(" ", "".join(self.buf)).strip()
            if raw:
                self.paragraphs.append(raw)
            self.capture_tag = None
            self.buf = []
        if self.skip_stack and self.skip_stack[-1] == tag:
            self.skip_stack.pop()
        if self.cta_stack and self.cta_stack[-1] == tag:
            self.cta_stack.pop()
        if tag == "article":
            self.in_article = False

    def handle_data(self, data: str) -> None:
        if not self.in_article:
            return
        if self.cta_stack:
            self.cta_buf.append(data)
        if self.skip_stack:
            return
        if self.capture_tag is not None:
            self.buf.append(data)


def article_path(root: Path, slug: str) -> Path:
    return root / "conteudos" / slug / "index.html"


def parse_article(html: str) -> _ArticleParagraphParser:
    parser = _ArticleParagraphParser()
    parser.feed(html)
    parser.close()
    return parser


def normalize_paragraph(text: str) -> str:
    t = _WS.sub(" ", (text or "")).strip().casefold()
    t = t.replace("\u00a0", " ")
    return t


def extract_body_paragraphs(html: str) -> list[str]:
    """Visible article paragraphs minus nav, legal note, author and fontes."""
    parsed = parse_article(html)
    out: list[str] = []
    seen: set[str] = set()
    for para in parsed.paragraphs:
        norm = normalize_paragraph(para)
        if len(norm) < 24:
            continue
        if norm in seen:
            continue
        seen.add(norm)
        out.append(norm)
    return out


def pairwise_shared_ratio(a: list[str], b: list[str]) -> float:
    if not a or not b:
        return 1.0
    sa, sb = set(a), set(b)
    shared = sa & sb
    return len(shared) / min(len(sa), len(sb))


def heading_levels(html: str) -> list[int]:
    return [int(m.group(1)) for m in re.finditer(r"<h([1-6])\b", html, re.I)]


def headings_skip(html: str) -> bool:
    levels = heading_levels(html)
    if not levels or levels[0] != 1:
        return True
    prev = levels[0]
    for level in levels[1:]:
        if level > prev + 1:
            return True
        prev = level
    return False


def load_jsonld(html: str) -> list[dict]:
    blocks = re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.I | re.S,
    )
    graphs: list[dict] = []
    for raw in blocks:
        data = json.loads(raw)
        if isinstance(data, dict) and "@graph" in data:
            graphs.extend(item for item in data["@graph"] if isinstance(item, dict))
        elif isinstance(data, dict):
            graphs.append(data)
        elif isinstance(data, list):
            graphs.extend(item for item in data if isinstance(item, dict))
    return graphs


def inspect_page(root: Path, slug: str) -> dict:
    path = article_path(root, slug)
    html = path.read_text(encoding="utf-8")
    parsed = parse_article(html)
    title_m = re.search(r"<title>([^<]*)</title>", html)
    desc_tag = re.search(r"<meta\b[^>]*name=[\"']description[\"'][^>]*>", html)
    desc = ""
    if desc_tag:
        dm = re.search(r'content=["\']([^"\']*)["\']', desc_tag.group(0))
        desc = dm.group(1) if dm else ""
    h1s = re.findall(r"<h1[^>]*>(.*?)</h1>", html, re.S)
    h1 = _WS.sub(" ", _TAG.sub(" ", h1s[0])).strip() if h1s else ""
    can_tag = re.search(r"<link\b[^>]*rel=[\"']canonical[\"'][^>]*>", html, re.I)
    canonical = ""
    if can_tag:
        cm = re.search(r'href=["\']([^"\']+)["\']', can_tag.group(0), re.I)
        canonical = cm.group(1) if cm else ""
    paras = extract_body_paragraphs(html)
    graphs = load_jsonld(html)
    types = {item.get("@type") for item in graphs}
    if any(isinstance(t, list) for t in types):
        flat: set[str] = set()
        for t in types:
            if isinstance(t, list):
                flat.update(str(x) for x in t)
            elif t:
                flat.add(str(t))
        types = flat
    cta = parsed.cta_text.casefold()
    visible = _WS.sub(" ", _TAG.sub(" ", html))
    return {
        "slug": slug,
        "path": str(path.relative_to(root)),
        "html": html,
        "title": title_m.group(1) if title_m else "",
        "description": desc,
        "h1": h1,
        "h1_count": len(h1s),
        "canonical": canonical,
        "section_ids": parsed.section_ids,
        "paragraphs": paras,
        "cta_text": parsed.cta_text,
        "cta_family": CTA_FAMILIES[slug],
        "has_generic_cta_mold": GENERIC_CTA_MOLD in cta,
        "has_receipt_guarantee": bool(RECEIPT_GUARANTEE.search(visible)),
        "claims_legal_advice": bool(LEGAL_ADVICE_CLAIM.search(visible)),
        "has_educational_limit": "conteúdo educacional" in visible.casefold()
        or "não substitui" in visible.casefold(),
        "jsonld_types": types,
        "headings_skip": headings_skip(html),
        "artifact": EXCLUSIVE_ARTIFACTS[slug],
        "artifact_present": EXCLUSIVE_ARTIFACTS[slug] in html,
        "pillar_bridge": "/medicoes-glosas-obras-publicas/" in html,
    }


def pairwise_table(pages: dict[str, dict]) -> list[dict]:
    rows: list[dict] = []
    slugs = list(CLUSTER_SLUGS)
    for i, a in enumerate(slugs):
        for b in slugs[i + 1 :]:
            ratio = pairwise_shared_ratio(pages[a]["paragraphs"], pages[b]["paragraphs"])
            shared = sorted(
                set(pages[a]["paragraphs"]) & set(pages[b]["paragraphs"])
            )
            rows.append(
                {
                    "a": a,
                    "b": b,
                    "ratio": round(ratio, 4),
                    "shared_count": len(shared),
                    "a_count": len(pages[a]["paragraphs"]),
                    "b_count": len(pages[b]["paragraphs"]),
                    "shared_samples": shared[:5],
                }
            )
    return rows


def evaluate_cluster(root: Path | None = None) -> dict:
    base = root or ROOT
    pages = {slug: inspect_page(base, slug) for slug in CLUSTER_SLUGS}
    rows = pairwise_table(pages)
    failures: list[str] = []
    for slug, page in pages.items():
        missing = [sid for sid in REQUIRED_SECTION_IDS if sid not in page["section_ids"]]
        if missing:
            failures.append(f"{slug}: missing sections {missing}")
        if page["h1_count"] != 1:
            failures.append(f"{slug}: h1_count={page['h1_count']}")
        expected_can = f"https://confenge.com.br/conteudos/{slug}/"
        if page["canonical"] != expected_can:
            failures.append(f"{slug}: canonical {page['canonical']!r}")
        if page["headings_skip"]:
            failures.append(f"{slug}: heading level skip")
        if not page["artifact_present"]:
            failures.append(f"{slug}: missing exclusive artifact {page['artifact']!r}")
        if page["has_generic_cta_mold"]:
            failures.append(f"{slug}: generic CTA mold")
        if page["has_receipt_guarantee"]:
            failures.append(f"{slug}: receipt guarantee")
        if page["claims_legal_advice"]:
            failures.append(f"{slug}: claims legal advice")
        if not page["has_educational_limit"]:
            failures.append(f"{slug}: missing educational/not-legal-advice limit")
        if not page["pillar_bridge"]:
            failures.append(f"{slug}: missing pillar bridge")
        if "Article" not in page["jsonld_types"]:
            failures.append(f"{slug}: JSON-LD missing Article")
        if "BreadcrumbList" not in page["jsonld_types"]:
            failures.append(f"{slug}: JSON-LD missing BreadcrumbList")
        family = page["cta_family"]
        cta = page["cta_text"].casefold()
        if family == "dossie" and "dossiê" not in cta and "dossie" not in cta:
            failures.append(f"{slug}: CTA family dossiê not in copy")
        if family == "triagem" and "triagem" not in cta:
            failures.append(f"{slug}: CTA family triagem not in copy")
        if family == "conteudo" and "critério" not in cta and "conteúdo" not in cta:
            failures.append(f"{slug}: CTA family conteúdo not in copy")
    for slug, page in pages.items():
        others = [
            inspect_page(base, other)["html"]
            for other in CLUSTER_SLUGS
            if other != slug
        ]
        art = page["artifact"]
        if any(art in html for html in others):
            failures.append(f"{slug}: artifact {art!r} leaked into another cluster URL")
    for row in rows:
        if row["ratio"] >= 0.15:
            failures.append(
                f"{row['a']} vs {row['b']}: shared-paragraph ratio "
                f"{row['ratio']:.1%} (>= 15%) samples={row['shared_samples']}"
            )
    titles = [pages[s]["title"] for s in CLUSTER_SLUGS]
    h1s = [pages[s]["h1"] for s in CLUSTER_SLUGS]
    descs = [pages[s]["description"] for s in CLUSTER_SLUGS]
    if len(set(titles)) != len(titles):
        failures.append("duplicate titles inside cluster")
    if len(set(h1s)) != len(h1s):
        failures.append("duplicate H1 inside cluster")
    if len(set(descs)) != len(descs):
        failures.append("duplicate descriptions inside cluster")
    return {
        "ok": not failures,
        "failures": failures,
        "pairwise": rows,
        "pages": {
            slug: {
                "title": pages[slug]["title"],
                "h1": pages[slug]["h1"],
                "paragraph_count": len(pages[slug]["paragraphs"]),
                "cta_family": pages[slug]["cta_family"],
                "artifact": pages[slug]["artifact"],
            }
            for slug in CLUSTER_SLUGS
        },
    }
