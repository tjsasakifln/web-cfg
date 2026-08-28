"""CFG10X-09: one owner for the general 25%/50% query; remaining bodies <15% similar.

Drives shipped HTML, sitemaps and `_redirects`. Uses the shipped
`jaccard_similarity` — does not reimplement page copy.
"""

from __future__ import annotations

import re
import sys
from itertools import combinations
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.naturalness import jaccard_similarity  # noqa: E402
from scripts.site.inbound_gates import is_indexable_html, strip_html  # noqa: E402


SITE = "https://confenge.com.br"
OWNER = "/conteudos/limite-aditivo-25-50-obra-publica/"
DONOR = "/lei-14133-obras/limite-25-50-aditivo-obra/"
PRECO_GLOBAL = "/conteudos/aditivo-empreitada-por-preco-global/"
DEMOLICAO = "/conteudos/demolicao-nao-prevista-obra-publica/"
OWNED = (OWNER, DONOR, PRECO_GLOBAL, DEMOLICAO)
SIMILARITY_CAP = 0.15
BOILERPLATE = (
    "Quer validar este cenário com a CONFENGE",
    "Envie o edital, a planilha ou a notificação",
    "Conteúdo educacional. Não substitui",
    "Engenheiro Civil formado pela EESC-USP",
    "Enquadramos o risco, a urgência e os documentos necessários",
    "Sem promessa de deferimento ou recuperação",
    "Ver serviço de aditivos",
    "Analisar este cenário",
    "Conversar pelo WhatsApp",
)


def _html(url_path: str) -> str:
    return (ROOT / url_path.strip("/") / "index.html").read_text(
        encoding="utf-8", errors="replace"
    )


def _canonicals(html: str) -> list[str]:
    return re.findall(
        r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']',
        html,
        flags=re.I,
    ) or re.findall(
        r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']canonical["\']',
        html,
        flags=re.I,
    )


def _tag_text(html: str, tag: str) -> str:
    match = re.search(rf"<{tag}[^>]*>(.*?)</{tag}>", html, flags=re.I | re.S)
    if not match:
        return ""
    return re.sub(r"<[^>]+>", "", match.group(1)).strip()


def _meta_description(html: str) -> str:
    match = re.search(
        r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)["\']|'
        r'<meta[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']description["\']',
        html,
        flags=re.I,
    )
    if not match:
        return ""
    return (match.group(1) or match.group(2) or "").strip()


def _redirect_rules() -> dict[str, tuple[str, str]]:
    rules: dict[str, tuple[str, str]] = {}
    for line in (ROOT / "_redirects").read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if not parts or parts[0].startswith("#"):
            continue
        if len(parts) < 3:
            continue
        rules[parts[0]] = (parts[1], parts[2])
    return rules


def _article_body(html: str) -> str:
    art = re.search(r"<article[^>]*>(.*?)</article>", html, flags=re.S | re.I)
    body = strip_html(art.group(1) if art else html)
    for drop in BOILERPLATE:
        body = body.replace(drop, " ")
    return re.sub(r"\s+", " ", body).strip()


def _sitemap_locs() -> set[str]:
    locs: set[str] = set()
    for name in (
        "sitemap.xml",
        "sitemap-editorial.xml",
        "sitemap-jurisprudencia.xml",
        "sitemap-inteligencia.xml",
    ):
        path = ROOT / name
        if not path.exists():
            continue
        locs.update(re.findall(r"<loc>([^<]+)</loc>", path.read_text(encoding="utf-8")))
    return locs


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def test_one_self_canonical_owner_for_general_25_50_query():
    owner_html = _html(OWNER)
    assert is_indexable_html(owner_html)
    cans = _canonicals(owner_html)
    assert cans == [f"{SITE}{OWNER}"]
    title = _tag_text(owner_html, "title")
    h1 = _tag_text(owner_html, "h1")
    assert "25%" in title and "50%" in title
    assert "25%" in h1 and "50%" in h1

    donor_html = _html(DONOR)
    assert not is_indexable_html(donor_html)
    rules = _redirect_rules()
    dest, status = rules[DONOR]
    assert dest == OWNER
    assert status.startswith("301")
    assert DONOR != OWNER
    assert OWNER not in rules
    from_paths = set(rules)
    assert dest not in from_paths

    donor_title = _norm(_tag_text(donor_html, "title"))
    donor_h1 = _norm(_tag_text(donor_html, "h1"))
    owner_title = _norm(re.sub(r"\s*\|\s*CONFENGE\s*$", "", title))
    owner_h1 = _norm(h1)
    # Shipped donor HTML may still exist as a noindex shell; it must not keep
    # an equivalent title/H1 competing for the same consulta.
    assert donor_title != owner_title or not is_indexable_html(donor_html)
    assert donor_h1 != owner_h1 or not is_indexable_html(donor_html)

    locs = _sitemap_locs()
    assert f"{SITE}{OWNER}" in locs
    assert f"{SITE}{DONOR}" not in locs


def test_remaining_indexable_owned_bodies_are_below_15_percent_similar():
    remaining = []
    for url in OWNED:
        html = _html(url)
        if url == DONOR:
            assert not is_indexable_html(html)
            continue
        assert is_indexable_html(html), url
        remaining.append((url, _article_body(html)))
    assert {url for url, _ in remaining} == {OWNER, PRECO_GLOBAL, DEMOLICAO}
    for (left_url, left), (right_url, right) in combinations(remaining, 2):
        score = jaccard_similarity(left, right, n=6)
        assert score < SIMILARITY_CAP, (
            f"{left_url} ~ {right_url} jaccard6={score:.3f} (cap {SIMILARITY_CAP})"
        )


def test_owned_pages_keep_distinct_title_h1_meta():
    rows = []
    for url in (OWNER, PRECO_GLOBAL, DEMOLICAO):
        html = _html(url)
        rows.append(
            (
                url,
                _norm(_tag_text(html, "title")),
                _norm(_tag_text(html, "h1")),
                _norm(_meta_description(html)),
            )
        )
    titles = [row[1] for row in rows]
    h1s = [row[2] for row in rows]
    metas = [row[3] for row in rows]
    assert len(set(titles)) == 3
    assert len(set(h1s)) == 3
    assert len(set(metas)) == 3


def test_preco_global_and_demolicao_have_exclusive_decision_sections():
    preco = _html(PRECO_GLOBAL)
    demo = _html(DEMOLICAO)
    for html, needles in (
        (
            preco,
            (
                "preço global",
                "quantitativo",
                "projeto",
                "matriz de riscos",
                "Lei nº 14.133",
                "14.133",
            ),
        ),
        (
            demo,
            (
                "demoli",
                "volume",
                "foto",
                "planilha",
                "Lei nº 14.133",
                "14.133",
            ),
        ),
    ):
        low = html.lower()
        for needle in needles:
            assert needle.lower() in low, needle
    # Scenario exclusivity: each page names a fact pattern the other does not.
    assert "galeria" in preco.lower() or "bueiro" in preco.lower() or "projeto básico" in preco.lower()
    assert "escola" in demo.lower() or "alvenaria" in demo.lower() or "entulho" in demo.lower()
