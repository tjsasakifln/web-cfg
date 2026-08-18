#!/usr/bin/env python3
"""Focused checks for organic-striking-distance-cro-01.

Reads shipped HTML, sitemap, robots, redirects and the experiment record.
Does not re-implement page copy or invent GSC outcomes.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.inbound_gates import is_indexable_html, robots_of  # noqa: E402

SITE = "https://confenge.com.br"
ARTICLE = "/conteudos/limite-aditivo-25-50-obra-publica/"
HUB = "/aditivos-obras-publicas/"
REQ = "/reequilibrio-obras-publicas/"
HOME = "/"
DIAG = "/ferramentas/diagnostico-defesa-margem/"
EXPERIMENT = (
    ROOT
    / "data"
    / "organic"
    / "experiments"
    / "organic-striking-distance-cro-01"
    / "experiment.json"
)
POST_METRIC_KEYS = (
    "discovery",
    "impressions",
    "clicks",
    "ranking",
    "CTA",
    "lead",
    "qualified_lead",
    "revenue",
)
CLAIM_RE = re.compile(
    r"(nova posi[cç][aã]o|aumento de impress|aumento de clique|"
    r"gerou lead|gerou receita|fechamos o #84|"
    r"position is now|impressions rose|revenue of)",
    re.I,
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
    m = re.search(rf"<{tag}[^>]*>(.*?)</{tag}>", html, flags=re.I | re.S)
    if not m:
        return ""
    return re.sub(r"<[^>]+>", "", m.group(1)).strip()


def _meta(html: str, name: str) -> str:
    m = re.search(
        rf'<meta[^>]+name=["\']{re.escape(name)}["\'][^>]+content=["\']([^"\']*)["\']',
        html,
        flags=re.I,
    ) or re.search(
        rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']{re.escape(name)}["\']',
        html,
        flags=re.I,
    )
    return m.group(1) if m else ""


def _jsonld_graphs(html: str) -> list[object]:
    out: list[object] = []
    for raw in re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        flags=re.I | re.S,
    ):
        out.append(json.loads(raw))
    return out


def _walk(node: object):
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _walk(v)
    elif isinstance(node, list):
        for item in node:
            yield from _walk(item)


def _hrefs(html: str) -> list[str]:
    return re.findall(r'href=["\']([^"\']+)["\']', html, flags=re.I)


def test_one_self_canonical_and_expected_robots():
    for path in (ARTICLE, HUB, REQ):
        html = _html(path)
        cans = _canonicals(html)
        assert len(cans) == 1, (path, cans)
        assert cans[0] == f"{SITE}{path}", (path, cans[0])
        robots = robots_of(html).lower()
        assert "index" in robots and "noindex" not in robots, (path, robots)
        assert is_indexable_html(html), path


def test_article_listed_once_in_main_sitemap_not_elsewhere():
    loc = f"{SITE}{ARTICLE}"
    main = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    assert main.count(f"<loc>{loc}</loc>") == 1
    for name in (
        "sitemap-editorial.xml",
        "sitemap-jurisprudencia.xml",
        "sitemap-inteligencia.xml",
    ):
        p = ROOT / name
        if p.exists():
            assert loc not in p.read_text(encoding="utf-8"), name


def test_no_combinatorial_or_new_slug():
    assert (ROOT / ARTICLE.strip("/") / "index.html").is_file()
    assert not (ROOT / "conteudos" / "limite-aditivo-obra-publica").exists()
    html = _html(ARTICLE)
    assert "?uf=" not in html and "?q=" not in html


def test_hub_and_article_titles_differ():
    article = _html(ARTICLE)
    hub = _html(HUB)
    a_title, h_title = _tag_text(article, "title"), _tag_text(hub, "title")
    a_h1, h_h1 = _tag_text(article, "h1"), _tag_text(hub, "h1")
    a_desc, h_desc = _meta(article, "description"), _meta(hub, "description")
    assert a_title and h_title and a_title != h_title
    assert a_h1 and h_h1 and a_h1 != h_h1
    assert a_desc and h_desc and a_desc != h_desc
    # Hub must not lead with the exact 25%/50% limit answer.
    assert not re.search(r"^Limite de aditivo 25%", h_h1)
    assert "25%" in a_h1 and "50%" in a_h1


def test_itemlist_has_no_empty_or_fake_url():
    for path in (HUB, REQ):
        html = _html(path)
        assert not re.search(r'"url"\s*:\s*""', html), path
        for graph in _jsonld_graphs(html):
            for node in _walk(graph):
                if node.get("@type") != "ListItem":
                    continue
                url = node.get("url") or node.get("item") or ""
                if not url:
                    # Breadcrumb last item may omit item; ItemList entries must not.
                    continue
                assert isinstance(url, str) and url.startswith("http"), (path, node)


def test_jsonld_parseable_and_faq_matches_visible():
    for path in (ARTICLE, HUB, REQ):
        html = _html(path)
        graphs = _jsonld_graphs(html)
        assert graphs, path
        visible = re.sub(r"<[^>]+>", " ", html)
        for graph in graphs:
            for node in _walk(graph):
                if node.get("@type") != "Question":
                    continue
                name = node.get("name") or ""
                ans = ((node.get("acceptedAnswer") or {}).get("text")) or ""
                assert name and name in visible, (path, name)
                # FAQ answer must be visible, not schema-only.
                snippet = ans[:80].strip()
                assert snippet and snippet in visible, (path, snippet)


def test_internal_links_resolve():
    must = {
        ARTICLE: [
            HUB,
            "/ferramentas/limite-acrescimos-supressoes/",
            DIAG,
        ],
        HUB: [ARTICLE, "/ferramentas/limite-acrescimos-supressoes/", DIAG],
        REQ: [
            "/conteudos/calculo-reequilibrio-economico-financeiro/",
            "/conteudos/documentos-reequilibrio-obra-publica/",
            "/conteudos/matriz-de-riscos-reequilibrio-economico-financeiro/",
            DIAG,
        ],
        HOME: [REQ],
    }
    for page, targets in must.items():
        html = _html(page) if page != HOME else (ROOT / "index.html").read_text(
            encoding="utf-8"
        )
        hrefs = set(_hrefs(html))
        for target in targets:
            assert target in hrefs, (page, target)
            dest = ROOT / target.strip("/") / "index.html"
            assert dest.is_file(), target


def test_home_points_to_reequilibrio_with_descriptive_anchor():
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    assert REQ in home
    assert re.search(
        r'href="/reequilibrio-obras-publicas/"[^>]*>[^<]*[Rr]eequil[ií]brio',
        home,
    )
    assert not re.search(
        r'href="/reequilibrio-obras-publicas/"[^>]*>\s*saiba mais',
        home,
        flags=re.I,
    )


def test_contextual_cta_preserves_attrs_and_has_no_pii():
    for path in (ARTICLE, HUB, REQ):
        html = _html(path)
        assert DIAG in html
        assert 'data-asset-id="diagnostico-defesa-margem"' in html
        assert 'data-cta-id="diagnosticar-contrato"' in html
        assert 'data-route-family="defesa-margem-diagnostico"' in html
        for href in _hrefs(html):
            parsed = urlparse(href)
            blob = (parsed.path + "?" + parsed.query).lower()
            assert "cnpj" not in blob
            assert not re.search(r"\b\d{14}\b", blob)


def test_article_first_fold_has_required_distinctions():
    html = _html(ARTICLE)
    # First fold = hero + answer box, before the long body sections.
    fold = html.split('id="diagnostico"', 1)[0]
    need = (
        "25%",
        "50%",
        "valor inicial atualizado",
        "acréscimo",
        "supress",
        "quantitativ",
        "qualitativ",
        "caso",
    )
    low = fold.lower()
    for token in need:
        assert token.lower() in low, token


def test_no_redirect_of_promoted_article():
    rules = (ROOT / "_redirects").read_text(encoding="utf-8")
    assert not re.search(
        r"^/conteudos/limite-aditivo-25-50-obra-publica/\s+\S+\s+301",
        rules,
        flags=re.M,
    )


def test_no_contract_analysis_in_this_experiment_surface():
    # Guard: this experiment must not touch the PR #118 surface.
    ca = ROOT / "scripts" / "contract_analysis"
    assert ca.is_dir()
    # Compare only by reading the experiment allowlist record, not by mutating.
    rec = json.loads(EXPERIMENT.read_text(encoding="utf-8"))
    changed = rec.get("changeset", {})
    assert "contract_analysis" not in json.dumps(changed)


def test_experiment_record_post_metrics_are_unknown():
    rec = json.loads(EXPERIMENT.read_text(encoding="utf-8"))
    assert rec["experiment_id"] == "organic-striking-distance-cro-01"
    assert rec["baseline"]["live_currentness"] == "BLOCKED"
    post = rec["metrics_post_change"]
    for key in POST_METRIC_KEYS:
        assert post[key] == "UNKNOWN", (key, post[key])
    blob = json.dumps(rec, ensure_ascii=False)
    assert not CLAIM_RE.search(blob)
    assert rec["residual"]["issue_84"] == "OPEN"


if __name__ == "__main__":
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("OK", name)
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print("FAIL", name, exc)
    raise SystemExit(1 if failed else 0)
