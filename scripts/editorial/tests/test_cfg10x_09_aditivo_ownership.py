"""CFG10X-09: one owner for the general 25%/50% query; remaining bodies <15% similar.

Drives shipped HTML, sitemaps and `_redirects`. Uses the shipped
`jaccard_similarity` — does not reimplement page copy.
"""

from __future__ import annotations

import json
import re
import sys
from itertools import combinations
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.naturalness import jaccard_similarity  # noqa: E402
from scripts.editorial.registry import approve_human, load_registry, material_hash  # noqa: E402
from scripts.editorial.render import _resolved_internal_url  # noqa: E402
from scripts.site.inbound_gates import is_indexable_html, strip_html  # noqa: E402
from scripts.site.public_copy_scope import visible_text  # noqa: E402


SITE = "https://confenge.com.br"
OWNER = "/conteudos/limite-aditivo-25-50-obra-publica/"
DONOR = "/lei-14133-obras/limite-25-50-aditivo-obra/"
PRECO_GLOBAL = "/conteudos/aditivo-empreitada-por-preco-global/"
DEMOLICAO = "/conteudos/demolicao-nao-prevista-obra-publica/"
OWNED = (OWNER, DONOR, PRECO_GLOBAL, DEMOLICAO)
SIMILARITY_CAP = 0.15
GSC_SNAPSHOT = ROOT / "seo/gsc-2026-08-24/search-analytics-redacted.json"
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
    assert _canonicals(donor_html) == [f"{SITE}{OWNER}"]
    rules = _redirect_rules()
    dest, status = rules[DONOR]
    assert dest == OWNER
    assert status == "301!"
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


def test_donor_cta_landmarks_have_unique_names():
    donor_html = _html(DONOR)
    labels = re.findall(
        r'<section[^>]+class=["\'][^"\']*editorial-cta[^"\']*["\'][^>]+aria-label=["\']([^"\']+)',
        donor_html,
        flags=re.I,
    )
    assert len(labels) == 2
    assert len(set(labels)) == len(labels)


def test_indexable_public_pages_do_not_link_through_donor_redirect():
    for loc in _sitemap_locs():
        if not loc.startswith(SITE):
            continue
        route = loc.removeprefix(SITE).strip("/")
        path = ROOT / route / "index.html" if route else ROOT / "index.html"
        if not path.is_file():
            continue
        html = path.read_text(encoding="utf-8", errors="replace")
        assert f'href="{DONOR}"' not in html, loc


def test_legacy_inventory_records_exact_donor_to_owner_migration():
    inventory = json.loads(
        (ROOT / "data" / "organic" / "legacy-url-inventory.json").read_text(
            encoding="utf-8"
        )
    )
    items = {item["legacy_url"]: item for item in inventory["items"]}
    donor = items[f"{SITE}{DONOR}"]
    assert donor["current_action"] == "301!"
    assert donor["destination"] == OWNER
    assert donor["canonical"] == f"{SITE}{OWNER}"
    assert donor["sitemap_membership"] is False
    owner = items[f"{SITE}{OWNER}"]
    assert owner["current_action"] == "KEEP"
    assert owner["destination"] == OWNER
    assert owner["sitemap_membership"] is True
    host = items["http://confenge.com.br/"]
    assert host["action"] == "keep_https_force_via_netcup_nginx_edge"
    assert "netlify" not in json.dumps(inventory, ensure_ascii=False).lower()


def test_inventory_backed_related_link_resolution_is_explicitly_non_material():
    registry = load_registry()
    affected = {
        page["page_id"]: page
        for page in registry["pages"]
        if page.get("page_id") in {"guia-checklist-aditivo", "lei-item-novo-desconto"}
    }
    assert set(affected) == {"guia-checklist-aditivo", "lei-item-novo-desconto"}
    for page_id, page in affected.items():
        before = material_hash(page)
        related_urls = {item["url"] for item in page.get("related") or []}
        assert DONOR in related_urls, page_id
        assert _resolved_internal_url(DONOR) == OWNER
        assert material_hash(page) == before, page_id

    policy = (ROOT / "docs/editorial/MATERIAL-HASH-GOVERNANCE.md").read_text(
        encoding="utf-8"
    )
    assert "troca de transporte entre URLs semanticamente equivalentes" in policy
    assert "Qualquer mudança de âncora, contexto, intenção" in policy


def test_donor_is_terminally_migrated_and_not_approvable():
    registry = load_registry()
    donor = next(page for page in registry["pages"] if page["page_id"] == "lei-limite-25-50")
    assert donor["status"] == "MIGRATED"
    assert not donor.get("approval")
    with pytest.raises(ValueError, match="requires_EDITORIAL_REVIEWED"):
        approve_human(
            registry,
            donor["page_id"],
            reviewer="Human reviewer",
            notes="A sufficiently long review note for the negative migration test.",
            sources_verified=list(donor.get("sources") or []),
        )


def test_active_submission_and_approval_docs_never_reactivate_donor():
    submit = json.loads(
        (ROOT / "docs" / "editorial" / "GSC-SUBMIT-CANDIDATES.json").read_text(
            encoding="utf-8"
        )
    )
    assert f"{SITE}{DONOR}" not in submit["urls"]
    assert f"{SITE}{OWNER}" in submit["urls"]
    for relative in (
        "docs/editorial/WAVE1-FIRST-COHORT.md",
        "docs/editorial/WAVE1-POST-APPROVAL-RUNBOOK.md",
        "docs/editorial/MATERIAL-HASH-GOVERNANCE.md",
        "docs/editorial/EXTERNAL-ACTIONS-UNLOCK.md",
    ):
        text = (ROOT / relative).read_text(encoding="utf-8")
        assert "`lei-limite-25-50`" not in text or "MIGRATED" in text
    archived_packet = (
        ROOT / "docs" / "editorial" / "WAVE1-HUMAN-REVIEW-PACKET.md"
    ).read_text(encoding="utf-8")
    assert "SUPERSEDED_EVIDENCE" in archived_packet
    assert "MIGRATED" in archived_packet.split("## Páginas", 1)[0]


def test_existing_ownership_is_pinned_to_current_gsc_and_organic_selection():
    """The migration decision must remain evidence-led, not branch inertia.

    The 2026-08-24 export is immutable and git-safe. Search Analytics returns
    top rows only, so absence of the donor remains UNKNOWN rather than a zero
    demand claim.
    """
    gsc = json.loads(GSC_SNAPSHOT.read_text(encoding="utf-8"))
    assert gsc["source"] == "search_analytics_api"
    assert gsc["synthetic"] is False
    assert gsc["ready_for_product_decisions"] is True
    assert gsc["max_date"] == "2026-08-18"

    owner_rows = [
        row for row in gsc["queries"] if row.get("page") == f"{SITE}{OWNER}"
    ]
    donor_rows = [
        row for row in gsc["queries"] if row.get("page") == f"{SITE}{DONOR}"
    ]
    assert len(owner_rows) == 27
    assert sum(row["impressions"] for row in owner_rows) == 28
    assert sum(row["clicks"] for row in owner_rows) == 0
    assert donor_rows == []  # Missing from a top-rows export is UNKNOWN, not zero.

    candidates = json.loads(
        (ROOT / "data/organic/breakout/candidates.json").read_text(encoding="utf-8")
    )["candidates"]
    selection = json.loads(
        (ROOT / "data/organic/breakout/selection.json").read_text(encoding="utf-8")
    )["assets"]
    candidate = next(item for item in candidates if item.get("url") == OWNER)
    selected = next(item for item in selection if item.get("url") == OWNER)
    assert candidate["asset_id"] == "limite-aditivo-25-50-obra-publica"
    assert candidate["existing_url"] is True
    assert candidate["index_intent"] == "INDEX"
    assert selected["asset_id"] == candidate["asset_id"]


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


@pytest.mark.parametrize("url", (OWNER, PRECO_GLOBAL, DEMOLICAO))
def test_article_schema_matches_published_article_and_visible_citations(url: str):
    html = _html(url)
    article_html = re.search(r"<article\b.*?</article>", html, flags=re.I | re.S)
    assert article_html, url
    actual_words = len(visible_text(article_html.group(0)).split())
    jsonld = re.search(
        r'<script type="application/ld\+json">(.*?)</script>',
        html,
        flags=re.S,
    )
    assert jsonld, url
    graph = json.loads(jsonld.group(1))["@graph"]
    article = next(node for node in graph if node.get("@type") == "Article")
    assert article["wordCount"] == actual_words, (
        url,
        article["wordCount"],
        actual_words,
    )
    for citation in article.get("citation") or []:
        assert f'href="{citation}"' in html, (url, citation)
