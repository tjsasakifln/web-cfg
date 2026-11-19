"""Adversarial checks for approved metadata and its regeneration boundary."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import struct

import pytest

from scripts.site import search_metadata as sm


def config(**settings):
    data = deepcopy(sm.policy())
    data["routes"] = {"/probe/": settings}
    return data


def document(schema=None, *, robots="index,follow"):
    schema = schema if schema is not None else {
        "@context": "https://schema.org", "@graph": [
            {"@type": "WebPage", "url": sm.SITE + "/probe/", "name": "Older title", "description": "Older description"},
            {"@type": "Service", "name": "Unchanged service", "offers": {"@type": "Offer", "price": "690", "priceCurrency": "BRL"}},
            {"@type": "Article", "datePublished": "2026-09-11", "author": {"@id": sm.SITE + "/#tiago"}},
        ],
    }
    return f'''<!doctype html><html><head><title>Project &amp; scope | CONFENGE</title>
<meta name="description" content="Drawings &amp; specifications."/>
<meta name="robots" content="{robots}"/>
<link rel="canonical" href="{sm.SITE}/probe/"/>
<script>window.unchanged = "head script";</script>
<script type="application/ld+json">{json.dumps(schema)}</script>
</head><body><main><h1>Project and scope</h1><p>Read this visible content.</p>
<script>window.checkout = "unchanged";</script></main></body></html>'''


def graphs(text):
    return [node for match in sm.LD.finditer(text) for node in sm._nodes(json.loads(match.group(2)))]


def test_all_approved_sources_are_stable_and_assets_exist():
    result = sm.synchronize(sm.ROOT)
    assert result == {"ok": True, "checked": 59, "changed": [], "errors": []}
    for route in sm.policy()["routes"]:
        source = (sm.ROOT / route.strip("/") / "index.html").read_text(encoding="utf-8")
        assert sm.normalize_metadata_html(source, route) == source, route


def test_editorial_findings_match_the_current_source_not_a_second_override():
    audit = json.loads((sm.ROOT / "docs/audits/2026-11-13-copy-seo/seo-findings.json").read_text())
    assert [item["id"] for item in audit["items"]] == [f"S{i:02d}" for i in range(1, 51)]
    for item in audit["items"][:34]:
        text = (sm.ROOT / item["route"].strip("/") / "index.html").read_text()
        parser = sm.Tags()
        parser.feed(text.split("</head>")[0])
        assert parser.metas["og:title"] == [item["after"]["title"]], item["id"]
        assert parser.metas["description"] == [item["after"]["description"]], item["id"]


def test_readiness_breadcrumbs_match_canonical_ia_and_preserve_landing_semantics():
    from scripts.site.public_ia import breadcrumb_trail, parse_jsonld_breadcrumb_trail, parse_visible_breadcrumb_trail
    from scripts.site.shell_nav import sync_breadcrumbs

    route = "/ferramentas/prontidao-tecnica-obra-privada/"
    text = (sm.ROOT / route.strip("/") / "index.html").read_text()
    expected = breadcrumb_trail(route)
    assert expected == [
        ("Início", "/"),
        ("Ferramentas", "/ferramentas/"),
        ("Prontidão técnica de obra privada", None),
    ]
    assert parse_visible_breadcrumb_trail(text) == expected
    assert parse_jsonld_breadcrumb_trail(text, route) == expected
    assert text.index('aria-label="Navegação estrutural"') < text.index("<h1>")
    for _, href in expected:
        if href is not None:
            assert (sm.ROOT / href.strip("/") / "index.html").is_file()
    pages = [node for node in graphs(text) if node.get("@type") == "WebPage"]
    assert len(pages) == 1 and pages[0]["url"] == sm.SITE + route
    assert "WebApplication" not in text
    assert sync_breadcrumbs(text, route) == text


def test_projection_preserves_body_canonical_robots_scripts_offers_and_dates():
    before = document()
    after = sm.normalize_metadata_html(before, "/probe/", config())
    assert before.split("</head>", 1)[1] == after.split("</head>", 1)[1]
    assert '<script>window.unchanged = "head script";</script>' in after
    for pattern in (r'<meta name="robots"[^>]*>', r'<link rel="canonical"[^>]*>'):
        assert re.findall(pattern, before) == re.findall(pattern, after)
    source_nodes, output_nodes = graphs(before), graphs(after)
    assert source_nodes[1] == output_nodes[1]
    assert source_nodes[2]["datePublished"] == output_nodes[2]["datePublished"]
    assert output_nodes[2]["author"]["name"] == "Tiago Jun Sasaki"
    assert "dateModified" not in output_nodes[2]
    assert sm.normalize_metadata_html(after, "/probe/", config()) == after


def test_noindex_and_out_of_scope_pages_are_untouched():
    for robots in ("noindex,follow", "NOINDEX,nofollow"):
        text = document(robots=robots)
        assert sm.normalize_metadata_html(text, "/probe/", config()) == text
    text = document()
    assert sm.normalize_metadata_html(text, "/not-approved/", config()) == text


@pytest.mark.parametrize("mutation", [
    lambda s: s.replace("<head>", "<head><head>"),
    lambda s: s.replace("</head>", "</head></head>"),
    lambda s: s.replace("<title>", "<title>Duplicate</title><title>"),
    lambda s: s.replace('<meta name="description"', '<meta name="description" content="duplicate"/><meta name="description"'),
    lambda s: s.replace('<meta name="robots"', '<meta name="robots" content="noindex"/><meta name="robots"'),
    lambda s: s.replace('<link rel="canonical"', '<link rel="canonical" href="https://confenge.com.br/wrong/"/><link rel="canonical"'),
    lambda s: s.replace('href="https://confenge.com.br/probe/"', 'href="https://example.com/probe/"'),
    lambda s: s.replace('</head>', '<meta property="og:title" content="one"/><meta property="og:title" content="two"/></head>'),
    lambda s: s.replace('</head>', '<meta property="og:image" content="https://example.com/image.jpg"/></head>'),
    lambda s: s.replace('"@context": "https://schema.org"', 'BROKEN JSON'),
])
def test_ambiguous_or_invalid_documents_fail_closed(mutation):
    with pytest.raises((ValueError, json.JSONDecodeError)):
        sm.normalize_metadata_html(mutation(document()), "/probe/", config())


@pytest.mark.parametrize("root", [None, "invalid", 13, {"@graph": {}}, {"@graph": [False]}])
def test_invalid_jsonld_shapes_fail_closed(root):
    text = document().replace(json.dumps({}), "")
    text = sm.LD.sub(lambda m: m.group(1) + json.dumps(root) + m.group(3), text)
    with pytest.raises(ValueError):
        sm.normalize_metadata_html(text, "/probe/", config())


def test_array_types_and_existing_collection_entity_are_supported():
    node = {"@context": "https://schema.org", "@type": ["WebPage", "CollectionPage"],
            "url": sm.SITE + "/probe/", "mainEntity": {"@id": sm.SITE + "/preserved/#itemlist"}}
    out = graphs(sm.normalize_metadata_html(document(node), "/probe/", config()))[0]
    assert out["@type"] == ["WebPage", "CollectionPage"]
    assert out["mainEntity"] == node["mainEntity"]


def test_new_article_does_not_invent_dates_authors_or_images():
    node = {"@context": "https://schema.org", "@type": "WebPage", "url": sm.SITE + "/probe/"}
    after = sm.normalize_metadata_html(document(node), "/probe/", config(article=True))
    article = next(n for n in graphs(after) if n["@type"] == "Article")
    assert article["headline"] == "Project and scope"
    assert not {"datePublished", "dateModified", "author", "image", "aggregateRating"} & article.keys()
    assert sm.normalize_metadata_html(after, "/probe/", config(article=True)) == after


def test_missing_route_and_missing_image_block_the_artifact(tmp_path, monkeypatch):
    config_cache = config()
    monkeypatch.setattr(sm, "policy", lambda: config_cache)
    result = sm.synchronize(tmp_path)
    assert not result["ok"] and result["errors"] == ["missing_page:/probe/"]
    path = tmp_path / "probe/index.html"
    path.parent.mkdir()
    path.write_text(sm.normalize_metadata_html(document(), "/probe/", config_cache))
    result = sm.synchronize(tmp_path)
    assert not result["ok"] and "missing_social_asset:" in result["errors"][0]


def test_release_image_version_is_verified_against_the_actual_bytes(tmp_path, monkeypatch):
    config_cache = config()
    monkeypatch.setattr(sm, "policy", lambda: config_cache)
    image = tmp_path / "assets/og-confenge.jpg"
    image.parent.mkdir()
    image.write_bytes(b"versioned-image-fixture")
    digest = hashlib.sha256(image.read_bytes()).hexdigest()
    base_url = config_cache["default_image"]["url"]
    path = tmp_path / "probe/index.html"
    path.parent.mkdir()
    normalized = sm.normalize_metadata_html(document(), "/probe/", config_cache)
    versioned = normalized.replace(base_url + '"', base_url + "?v=" + digest + '"')
    path.write_text(versioned)
    assert sm.normalize_metadata_html(versioned, "/probe/", config_cache) == versioned
    assert sm.synchronize(tmp_path) == {"ok": True, "checked": 1, "changed": [], "errors": []}
    image.write_bytes(b"unexpected-bytes")
    result = sm.synchronize(tmp_path)
    assert result["errors"] == ["social_asset_digest_mismatch:/probe/:/assets/og-confenge.jpg"]
    image.unlink()
    result = sm.synchronize(tmp_path)
    assert result["errors"] == ["missing_social_asset:/probe/:/assets/og-confenge.jpg"]


@pytest.mark.parametrize("suffix", [
    "?v=stale", "?v=", "?v", "?crop=1200", "?v=" + "0" * 64 + "&crop=1200",
    "?v=" + "0" * 64 + "&v=" + "0" * 64, "#preview",
])
def test_unapproved_image_queries_and_fragments_remain_blocked(tmp_path, suffix):
    image = tmp_path / "assets/og-confenge.jpg"
    image.parent.mkdir()
    image.write_bytes(b"image-fixture")
    assert sm._social_asset_problem(tmp_path, sm.SITE + "/assets/og-confenge.jpg" + suffix) in {
        "invalid_social_asset_version", "invalid_social_asset_url"
    }


def test_revised_snippets_are_supported_by_the_visible_page():
    from scripts.site.visible_parity import compare_visible_parity

    for route in sm.policy()["routes"]:
        source = (sm.ROOT / route.strip("/") / "index.html").read_text(encoding="utf-8")
        result = compare_visible_parity(source, url=sm.SITE + route)
        assert result["ok"], (route, result["defects"])


def test_default_image_has_the_declared_dimensions_without_extra_dependency():
    policy = sm.policy()["default_image"]
    data = (sm.ROOT / policy["url"].removeprefix(sm.SITE + "/")).read_bytes()
    assert data[:2] == b"\xff\xd8"
    i = 2
    dimensions = None
    while i < len(data):
        assert data[i] == 0xFF
        marker = data[i + 1]
        length = int.from_bytes(data[i + 2:i + 4], "big")
        if marker in (0xC0, 0xC1, 0xC2):
            height, width = struct.unpack(">HH", data[i + 5:i + 9])
            dimensions = (width, height)
            break
        i += length + 2
    assert dimensions == (policy["width"], policy["height"]) == (1200, 630)


def test_collection_schema_matches_the_visible_case_directory():
    text = (sm.ROOT / "casos/index.html").read_text()
    directory = sm.Directory("/casos/")
    directory.feed(text.split("</head>", 1)[1])
    collection = next(n for n in graphs(text) if n["@type"] == "CollectionPage")
    entries = collection["mainEntity"]["itemListElement"]
    assert collection["mainEntity"]["numberOfItems"] == len(entries) == len(directory.items) == 12
    assert [(e["url"], e["name"]) for e in entries] == [(sm.SITE + url, name) for url, name in directory.items]
