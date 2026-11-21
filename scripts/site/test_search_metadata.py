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
    assert result == {"ok": True, "checked": 75, "audited_indexable": 211, "changed": [], "errors": []}
    for route in sm.policy()["routes"]:
        source = (sm.ROOT / route.strip("/") / "index.html").read_text(encoding="utf-8")
        assert sm.normalize_metadata_html(source, route) == source, route


def test_search_demand_priorities_are_in_the_metadata_policy():
    # These three routes carry half of page-level impressions in the supplied
    # October/November export. A later generator must not bypass their checks.
    priorities = {
        "/conteudos/sinapi-desonerado-nao-desonerado/",
        "/medicoes-glosas-obras-publicas/",
        "/conteudos/empreitada-preco-global-preco-unitario/",
    }
    assert priorities <= sm.policy()["routes"].keys()


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
    assert sm.synchronize(tmp_path) == {"ok": True, "checked": 1, "audited_indexable": 1, "changed": [], "errors": []}
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


@pytest.mark.parametrize(("mutation", "problem"), [
    (lambda s: s.replace("<title>", "<title>Another title</title><title>"), "title_count:2"),
    (lambda s: s.replace("Project &amp; scope | CONFENGE", " &#160; "), "title_empty"),
    (lambda s: s.replace('<meta name="description" content="Drawings &amp; specifications."/>', ""), "description_count:0"),
    (lambda s: s.replace("Drawings &amp; specifications.", "&#160;"), "description_empty"),
    (lambda s: s.replace('</head>', '<meta content="second" name="description"></head>'), "description_count:2"),
    (lambda s: s.replace('</head>', '<link href="https://confenge.com.br/probe/" rel="canonical"></head>'), "canonical_count:2"),
    (lambda s: s.replace('href="https://confenge.com.br/probe/"', 'href="http://confenge.com.br/probe/"'), "canonical_mismatch"),
    (lambda s: s.replace('href="https://confenge.com.br/probe/"', 'href="https://example.com/probe/"'), "canonical_mismatch"),
    (lambda s: s.replace('href="https://confenge.com.br/probe/"', 'href="https://confenge.com.br/probe/?utm_source=test"'), "canonical_mismatch"),
    (lambda s: s.replace('href="https://confenge.com.br/probe/"', 'href="https://confenge.com.br/probe/#title"'), "canonical_mismatch"),
    (lambda s: s.replace('href="https://confenge.com.br/probe/"', 'href="/probe/"'), "canonical_mismatch"),
    (lambda s: s.replace('<meta name="description"', '<meta name="description" content="first"'), "duplicate_metadata_attribute:description:content"),
    (lambda s: s.replace('<link rel="canonical"', '<link rel="canonical" href="https://example.com/probe/"'), "duplicate_canonical_attribute:href"),
    (lambda s: s.replace('</head>', '<meta name="robots" content="index,follow"></head>'), "duplicate_metadata:robots"),
])
def test_indexable_gate_rejects_ambiguous_or_empty_head_metadata(mutation, problem):
    result = sm.inspect_search_head(mutation(document()), "/probe/")
    assert problem in result["problems"]


@pytest.mark.parametrize("wrapper", [
    lambda value: f"<!-- {value} -->",
    lambda value: f"<script>const example = '{value}';</script>",
    lambda value: f"<template>{value}</template>",
    lambda value: f"<title>{value}</title>",
    lambda value: f"<noscript>{value}</noscript>",
])
def test_quoted_noindex_cannot_exempt_a_public_page(wrapper):
    fake = wrapper('<meta name="robots" content="noindex">')
    text = document().replace('</head>', fake + '</head>')
    assert not sm.inspect_search_head(text, "/probe/")["noindex"]


@pytest.mark.parametrize("head_prefix", ["<div>Body content</div>", "Body text", "&#160;"])
def test_implicit_head_end_cannot_exempt_page_with_later_noindex(head_prefix):
    # An HTML tree builder moves these nodes and all later source metadata to
    # body. Neither its fake noindex nor its source title may pass this gate.
    text = document(robots="noindex,follow").replace('<head>', '<head>' + head_prefix)
    result = sm.inspect_search_head(text, "/probe/")
    assert not result["noindex"]
    assert {"title_count:0", "description_count:0", "canonical_count:0"} <= set(result["problems"])
    late_head = document(robots="noindex,follow").replace('<head>', head_prefix + '<head>')
    late_result = sm.inspect_search_head(late_head, "/probe/")
    assert not late_result["noindex"]
    assert {"title_count:0", "description_count:0", "canonical_count:0"} <= set(late_result["problems"])


def test_head_script_style_and_noscript_raw_text_do_not_end_head():
    text = document().replace('<head>', '<head><style>body { color: black; }</style><script>const text = "<div>body</div>";</script><noscript><meta name="robots" content="noindex"><div>fallback</div></noscript>')
    result = sm.inspect_search_head(text, "/probe/")
    assert not result["noindex"] and not result["problems"]


def test_missing_head_metadata_cannot_be_supplied_by_comments_script_or_body():
    text = document()
    description = '<meta name="description" content="Drawings &amp; specifications."/>'
    text = text.replace(description, '<!-- ' + description + ' -->')
    text = text.replace('<body>', '<body>' + description)
    text = text.replace('</head>', '<script>const sample = ' + json.dumps(description) + ';</script></head>')
    result = sm.inspect_search_head(text, "/probe/")
    assert "description_count:0" in result["problems"]
    assert not sm.inspect_search_head(document().replace('<body>', '<body><meta name="robots" content="noindex">'), "/probe/")["noindex"]


def test_ambiguous_robots_attribute_and_second_head_cannot_hide_metadata_errors():
    duplicate = document().replace('content="index,follow"', 'content="index,follow" content="noindex"')
    assert not sm.inspect_search_head(duplicate, "/probe/")["noindex"]
    duplicate_head = document().replace('</head>', '</head><head><meta name="robots" content="noindex"></head>')
    result = sm.inspect_search_head(duplicate_head, "/probe/")
    assert "head_missing_or_duplicate" in result["problems"] and not result["noindex"]


def test_head_reader_handles_attribute_order_case_entities_and_long_useful_snippets():
    text = document().replace('<head>', '<HEAD>').replace('</head>', '</HEAD>')
    text = text.replace('<meta name="description" content="Drawings &amp; specifications."/>', '<META CONTENT="Drawings &amp; specifications." NAME="Description">')
    result = sm.inspect_search_head(text, "/probe/")
    assert not result["problems"]
    assert result["title"] == "Project & scope | CONFENGE"
    assert result["description"] == "Drawings & specifications."
    text = text.replace('Project &amp; scope | CONFENGE', 'Descriptive title ' * 8).replace('Drawings &amp; specifications.', 'Useful description ' * 20)
    assert not sm.inspect_search_head(text, "/probe/")["problems"]


def _write_page(root, route, text):
    target = root / route.strip("/") / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text.replace('https://confenge.com.br/probe/', sm.SITE + route))
    return target


def test_all_indexable_routes_are_audited_without_adding_them_to_projection_policy(tmp_path):
    _write_page(tmp_path, "/probe/", document())
    later = _write_page(tmp_path, "/new-family/", document().replace('Project &amp; scope | CONFENGE', 'A distinct title').replace('Drawings &amp; specifications.', 'Another description.'))
    assert sm.audit_indexable_metadata(tmp_path)["ok"]
    later.write_text(later.read_text().replace('name="description"', 'name="example"'))
    result = sm.audit_indexable_metadata(tmp_path)
    assert not result["ok"] and result["checked"] == 2
    assert result["errors"] == ["search_head:/new-family/:description_count:0"]


def test_duplicate_snippets_decode_entities_and_collapse_whitespace(tmp_path):
    _write_page(tmp_path, "/probe/", document())
    _write_page(tmp_path, "/duplicate/", document().replace('Project &amp; scope | CONFENGE', 'project &#38;   scope | confenge').replace('Drawings &amp; specifications.', 'Drawings &#38;   specifications.'))
    result = sm.audit_indexable_metadata(tmp_path)
    assert sorted(result["errors"]) == ["duplicate_description:/duplicate/,/probe/", "duplicate_title:/duplicate/,/probe/"]


def test_artifact_census_does_not_hide_new_html_in_internal_named_directories(tmp_path):
    _write_page(tmp_path, "/probe/", document())
    _write_page(tmp_path, "/docs/fixture/", "<html><head></head><body>Unexpected public fixture</body></html>")
    assert sm.audit_indexable_metadata(tmp_path)["ok"]
    result = sm.audit_indexable_metadata(tmp_path, artifact=True)
    assert not result["ok"] and result["checked"] == 2
    assert any("/docs/fixture/:description_count:0" in problem for problem in result["errors"])


def test_real_noindex_headers_and_http_errors_are_not_indexable_metadata(tmp_path):
    _write_page(tmp_path, "/probe/", document())
    _write_page(tmp_path, "/private/", document(robots="NOINDEX,follow"))
    _write_page(tmp_path, "/none/", document(robots="none"))
    _write_page(tmp_path, "/header-only/", "<html><body>Private utility</body></html>")
    _write_page(tmp_path, "/gone/", "<html><body>Withdrawn</body></html>")
    _write_page(tmp_path, "/gone-family/child/", "<html><body>Withdrawn</body></html>")
    (tmp_path / "_headers").write_text('/header-only/*\n  X-Robots-Tag: noindex,follow\n')
    (tmp_path / "_redirects").write_text('/gone /404.html 410\n/gone-family/* /404.html 410\n')
    result = sm.audit_indexable_metadata(tmp_path)
    assert result == {"ok": True, "checked": 1, "routes": ["/probe/"], "errors": []}
    (tmp_path / "_redirects").write_text('/gone /probe/ 200\n/gone /404.html 410\n/gone-family/* /404.html 410\n')
    result = sm.audit_indexable_metadata(tmp_path)
    assert not result["ok"] and any('/gone/:title_count:0' in problem for problem in result["errors"])
