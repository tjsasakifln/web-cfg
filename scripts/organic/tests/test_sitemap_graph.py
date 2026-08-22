"""Fixture tests for the shipped sitemap graph (issue #152).

Drives scripts.organic.sitemap_graph and scripts.organic.sitemap_hygiene.audit_sitemaps
on tmp trees. No hardcoded production URL counts.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from scripts.organic.sitemap_graph import (
    SITE,
    audit_graph,
    child_lastmod,
    close_graph,
    consumed_market_answer_indexable,
    exact_one_issues,
    loc_set_drift,
    indexability_graph_issues,
    market_answer_canonical,
    normalize_lastmod,
    parse_sitemap_index,
    parse_sitemap_txt,
    parse_urlset_entries,
    render_sitemap_index,
    render_sitemap_txt,
    render_urlset,
    stale_market_answer_issues,
    substantial_lastmod_from_html,
    walk_index_children,
    x_robots_noindex,
    UrlEntry,
)
from scripts.organic.sitemap_hygiene import audit_sitemaps

AS_OF = date(2026, 8, 19)
MA = "https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/"


def _html(
    canonical: str,
    *,
    robots: str = "index,follow",
    modified: str | None = None,
) -> str:
    lm = (
        f'<meta property="article:modified_time" content="{modified}"/>'
        if modified
        else ""
    )
    jsonld = (
        f'{{"@type":"Article","dateModified":"{modified}"}}' if modified else "{}"
    )
    return (
        "<!DOCTYPE html><html><head><title>T</title>"
        f'<meta name="robots" content="{robots}"/>'
        f'<link rel="canonical" href="{canonical}"/>'
        f"{lm}"
        f'<script type="application/ld+json">{jsonld}</script>'
        "</head><body><h1>H</h1></body></html>"
    )


def _write_page(root: Path, loc: str, html: str) -> None:
    path = loc.replace(SITE, "").strip("/")
    if not path:
        dest = root / "index.html"
    else:
        dest = root / path / "index.html"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(html, encoding="utf-8")


def _seed(
    tmp_path: Path,
    *,
    members: dict[str, list[tuple[str, str | None]]],
    pages: dict[str, dict[str, str | None]] | None = None,
    txt: list[str] | None = None,
    robots_extra: str = "",
    redirects: str = "",
    headers: str = "",
    write_txt: bool = True,
) -> Path:
    index_rows = [(f"{SITE}/{name}", None) for name in members]
    (tmp_path / "sitemap-index.xml").write_text(
        render_sitemap_index(index_rows), encoding="utf-8"
    )
    all_locs: list[str] = []
    for name, entries in members.items():
        (tmp_path / name).write_text(render_urlset(entries), encoding="utf-8")
        all_locs.extend(loc for loc, _ in entries)
    if write_txt:
        payload = txt if txt is not None else all_locs
        (tmp_path / "sitemap.txt").write_text(
            render_sitemap_txt(payload), encoding="utf-8"
        )
    robots = "User-agent: *\nAllow: /\n" + robots_extra + f"Sitemap: {SITE}/sitemap-index.xml\n"
    (tmp_path / "robots.txt").write_text(robots, encoding="utf-8")
    if redirects:
        (tmp_path / "_redirects").write_text(redirects, encoding="utf-8")
    if headers:
        (tmp_path / "_headers").write_text(headers, encoding="utf-8")
    for loc, meta in (pages or {}).items():
        _write_page(
            tmp_path,
            loc,
            _html(
                loc,
                robots=str(meta.get("robots") or "index,follow"),
                modified=meta.get("modified"),  # type: ignore[arg-type]
            ),
        )
    return tmp_path


def test_normalize_lastmod_never_future_or_clock():
    assert normalize_lastmod("2026-08-01", as_of=AS_OF) == "2026-08-01"
    assert normalize_lastmod("2026-08-20T12:00:00Z", as_of=AS_OF) is None
    assert normalize_lastmod("", as_of=AS_OF) is None
    assert normalize_lastmod("not-a-date", as_of=AS_OF) is None


def test_substantial_lastmod_from_html_and_omit():
    html = _html(f"{SITE}/a/", modified="2026-08-10")
    assert substantial_lastmod_from_html(html, as_of=AS_OF) == "2026-08-10"
    assert substantial_lastmod_from_html(_html(f"{SITE}/a/"), as_of=AS_OF) is None
    future = _html(f"{SITE}/a/", modified="2026-12-01")
    assert substantial_lastmod_from_html(future, as_of=AS_OF) is None


def test_child_lastmod_max_or_omit():
    assert child_lastmod(["2026-08-01", "2026-08-10", None], as_of=AS_OF) == "2026-08-10"
    assert child_lastmod([None, ""], as_of=AS_OF) is None
    assert child_lastmod(["2026-12-01"], as_of=AS_OF) is None


def test_walk_index_and_all_children_not_only_sitemap_xml():
    index = render_sitemap_index(
        [
            (f"{SITE}/sitemap.xml", "2026-08-01"),
            (f"{SITE}/sitemap-editorial.xml", None),
            (f"{SITE}/sitemap-ghost.xml", None),
        ]
    )
    children = {
        "sitemap.xml": render_urlset([(f"{SITE}/", "2026-08-01")]),
        "sitemap-editorial.xml": render_urlset([(f"{SITE}/lei-14133-obras/", "2026-08-04")]),
        "sitemap-ghost.xml": None,
    }
    entries, members, issues = walk_index_children(index, children)
    assert [m.filename for m in members] == [
        "sitemap.xml",
        "sitemap-editorial.xml",
        "sitemap-ghost.xml",
    ]
    assert {e.loc for e in entries} == {f"{SITE}/", f"{SITE}/lei-14133-obras/"}
    assert any(i.code == "sitemap_member_inaccessible" for i in issues)


def test_exact_one_duplicate_across_members_fails():
    loc = f"{SITE}/shared/"
    issues = exact_one_issues(
        [
            UrlEntry(loc=loc, lastmod=None, member="sitemap.xml"),
            UrlEntry(loc=loc, lastmod=None, member="sitemap-editorial.xml"),
        ]
    )
    assert any(i.code == "duplicate_across_members" for i in issues)


def test_include_and_remove_via_close_graph(tmp_path: Path):
    loc_a = f"{SITE}/a/"
    loc_b = f"{SITE}/b/"
    _seed(
        tmp_path,
        members={"sitemap.xml": [(loc_a, "2026-08-01")]},
        pages={loc_a: {"modified": "2026-08-01"}, loc_b: {"modified": "2026-08-02"}},
    )
    first = audit_sitemaps(tmp_path)
    assert first["ok"] is False
    assert any(i["code"] == "indexable_missing_from_sitemap" for i in first["issues"])
    assert loc_a in first["locs"]
    assert loc_b not in first["locs"]

    xml = (tmp_path / "sitemap.xml").read_text(encoding="utf-8")
    entries = parse_urlset_entries(xml)
    (tmp_path / "sitemap.xml").write_text(
        render_urlset(entries + [(loc_b, None)]), encoding="utf-8"
    )
    report = close_graph(tmp_path, as_of=AS_OF, market_answer_indexable=True)
    assert report["ok"] is True
    assert set(report["locs"]) == {loc_a, loc_b}

    (tmp_path / "sitemap.xml").write_text(render_urlset([(loc_a, None)]), encoding="utf-8")
    removed = close_graph(tmp_path, as_of=AS_OF, market_answer_indexable=True)
    assert loc_b not in removed["locs"]
    assert loc_a in removed["locs"]


def test_substantial_lastmod_change_and_omit(tmp_path: Path):
    loc = f"{SITE}/sinapi/"
    _seed(
        tmp_path,
        members={"sitemap.xml": [(loc, "2026-07-30")]},
        pages={loc: {"modified": "2026-07-30"}},
    )
    closed = close_graph(tmp_path, as_of=AS_OF, market_answer_indexable=True)
    assert closed["ok"] is True
    first = parse_urlset_entries((tmp_path / "sitemap.xml").read_text(encoding="utf-8"))
    assert first == [(loc, "2026-07-30")]

    _write_page(tmp_path, loc, _html(loc, modified="2026-08-18"))
    closed2 = close_graph(tmp_path, as_of=AS_OF, market_answer_indexable=True)
    assert closed2["ok"] is True
    second = parse_urlset_entries((tmp_path / "sitemap.xml").read_text(encoding="utf-8"))
    assert second == [(loc, "2026-08-18")]
    child_lm = parse_sitemap_index(
        (tmp_path / "sitemap-index.xml").read_text(encoding="utf-8")
    )[0].lastmod
    assert child_lm == "2026-08-18"

    _write_page(tmp_path, loc, _html(loc))
    closed3 = close_graph(tmp_path, as_of=AS_OF, market_answer_indexable=True)
    omitted = parse_urlset_entries((tmp_path / "sitemap.xml").read_text(encoding="utf-8"))
    assert omitted == [(loc, None)]
    assert "<lastmod>" not in (tmp_path / "sitemap.xml").read_text(encoding="utf-8")
    assert parse_sitemap_index((tmp_path / "sitemap-index.xml").read_text(encoding="utf-8"))[
        0
    ].lastmod is None


def test_drift_between_txt_and_children_fails(tmp_path: Path):
    loc = f"{SITE}/a/"
    extra = f"{SITE}/ghost/"
    _seed(
        tmp_path,
        members={"sitemap.xml": [(loc, None)]},
        pages={loc: {}},
        txt=[loc, extra],
    )
    report = audit_sitemaps(tmp_path)
    assert report["ok"] is False
    assert any(i["code"] == "loc_set_drift" for i in report["issues"])


def test_close_graph_drops_noindex_html(tmp_path: Path):
    loc_ok = f"{SITE}/a/"
    loc_no = f"{SITE}/secret/"
    _seed(
        tmp_path,
        members={"sitemap.xml": [(loc_ok, None), (loc_no, None)]},
        pages={
            loc_ok: {"robots": "index,follow"},
            loc_no: {"robots": "noindex,nofollow"},
        },
    )
    closed = close_graph(tmp_path, as_of=AS_OF, market_answer_indexable=True)
    assert loc_ok in closed["locs"]
    assert loc_no not in closed["locs"]
    xml = (tmp_path / "sitemap.xml").read_text(encoding="utf-8")
    assert loc_no not in xml
    txt = (tmp_path / "sitemap.txt").read_text(encoding="utf-8")
    assert loc_no not in txt


def test_indexable_must_be_in_valid_sitemap_attribute_order_independent(tmp_path: Path):
    indexed = f"{SITE}/indexed/"
    missing = f"{SITE}/missing/"
    noindex = f"{SITE}/draft/"
    _seed(
        tmp_path,
        members={"sitemap.xml": [(indexed, None)]},
        pages={indexed: {}, missing: {}, noindex: {"robots": "noindex,follow"}},
    )
    # Exercise the reversed attribute order that caused #223/#244.
    draft = tmp_path / "draft" / "index.html"
    draft.write_text(
        draft.read_text(encoding="utf-8").replace(
            'name="robots" content="noindex,follow"',
            'content="noindex,follow" name="robots"',
        ),
        encoding="utf-8",
    )
    entries = [UrlEntry(loc=indexed, lastmod=None, member="sitemap.xml")]
    issues = indexability_graph_issues(tmp_path, entries)
    assert [issue.url for issue in issues] == ["/missing/"]


def test_audit_rejects_referenced_empty_sitemap(tmp_path: Path):
    loc = f"{SITE}/a/"
    _seed(
        tmp_path,
        members={"sitemap.xml": [(loc, None)], "sitemap-empty.xml": []},
        pages={loc: {}},
    )
    report = audit_sitemaps(tmp_path)
    assert report["ok"] is False
    assert any(i["code"] == "empty_sitemap_member" for i in report["issues"])


def test_stale_market_answer_absent_and_present(tmp_path: Path):
    loc = f"{SITE}/a/"
    _seed(
        tmp_path,
        members={
            "sitemap.xml": [(loc, None)],
            "sitemap-inteligencia.xml": [(MA, "2026-08-17")],
        },
        pages={loc: {}, MA: {"robots": "noindex,follow", "modified": "2026-08-17"}},
    )
    present = audit_graph(
        tmp_path, as_of=AS_OF, market_answer_indexable=False
    )
    assert present["ok"] is False
    assert any(i["code"] == "stale_market_answer_in_graph" for i in present["issues"])

    closed = close_graph(tmp_path, as_of=AS_OF, market_answer_indexable=False)
    assert closed["ok"] is True
    assert MA not in closed["locs"]
    intel = (tmp_path / "sitemap-inteligencia.xml").read_text(encoding="utf-8")
    assert MA not in intel
    issues = stale_market_answer_issues(
        [UrlEntry(loc=loc, lastmod=None, member="sitemap.xml")],
        indexable=False,
        canonical=MA,
    )
    assert issues == []


def test_inaccessible_child_member_fails(tmp_path: Path):
    loc = f"{SITE}/a/"
    _seed(
        tmp_path,
        members={"sitemap.xml": [(loc, None)]},
        pages={loc: {}},
    )
    (tmp_path / "sitemap-index.xml").write_text(
        render_sitemap_index(
            [
                (f"{SITE}/sitemap.xml", None),
                (f"{SITE}/sitemap-missing.xml", None),
            ]
        ),
        encoding="utf-8",
    )
    report = audit_sitemaps(tmp_path)
    assert report["ok"] is False
    assert any(i["code"] == "sitemap_member_inaccessible" for i in report["issues"])


def test_noindex_robots_redirect_external_canonical_missing_file(tmp_path: Path):
    loc_ok = f"{SITE}/ok/"
    loc_noindex = f"{SITE}/hidden/"
    loc_blocked = f"{SITE}/ops/secret/"
    loc_redir = f"{SITE}/old/"
    loc_ext = f"{SITE}/ext/"
    loc_missing = f"{SITE}/gone/"
    _seed(
        tmp_path,
        members={
            "sitemap.xml": [
                (loc_ok, None),
                (loc_noindex, None),
                (loc_blocked, None),
                (loc_redir, None),
                (loc_ext, None),
                (loc_missing, None),
            ]
        },
        pages={
            loc_ok: {},
            loc_noindex: {"robots": "noindex,follow"},
            loc_blocked: {},
            loc_redir: {},
            loc_ext: {},
        },
        robots_extra="Disallow: /ops/\n",
        redirects="/old/  /ok/  301\n",
        write_txt=False,
    )
    _write_page(
        tmp_path,
        loc_ext,
        _html("https://example.com/ext/"),
    )
    (tmp_path / "sitemap.txt").write_text(
        render_sitemap_txt(
            [loc_ok, loc_noindex, loc_blocked, loc_redir, loc_ext, loc_missing]
        ),
        encoding="utf-8",
    )
    report = audit_sitemaps(tmp_path)
    codes = {i["code"] for i in report["issues"] if i["severity"] == "high"}
    assert "sitemap_url_noindex" in codes
    assert "sitemap_url_robots_disallowed" in codes
    assert "sitemap_url_is_redirect_source" in codes
    assert "canonical_external" in codes
    assert "sitemap_url_missing_file" in codes
    assert report["ok"] is False


def test_txt_matches_union_after_close(tmp_path: Path):
    loc_a = f"{SITE}/a/"
    loc_b = f"{SITE}/b/"
    _seed(
        tmp_path,
        members={
            "sitemap.xml": [(loc_a, None)],
            "sitemap-editorial.xml": [(loc_b, None)],
        },
        pages={loc_a: {"modified": "2026-08-01"}, loc_b: {"modified": "2026-08-04"}},
        txt=[loc_a],
    )
    report = close_graph(tmp_path, as_of=AS_OF, market_answer_indexable=True)
    assert report["ok"] is True
    txt = parse_sitemap_txt((tmp_path / "sitemap.txt").read_text(encoding="utf-8"))
    assert set(txt) == {loc_a, loc_b}
    assert loc_set_drift({"canonical": [loc_a, loc_b], "sitemap.txt": txt}) == []


def test_consumed_gate_is_the_shipped_market_answer_function():
    """Graph membership for the canary is the shipped gate, not a second policy."""
    flag = consumed_market_answer_indexable()
    assert flag in {True, False, None}
    assert market_answer_canonical().startswith(SITE)


def test_shipped_audit_graph_market_answer_not_indexable():
    """Campaign graph artifact must record the consumed gate, not a stale true."""
    root = Path(__file__).resolve().parents[3]
    report = audit_graph(root)
    assert report["market_answer_indexable"] is False
    assert report["market_answer_in_graph"] is False
    canonical = market_answer_canonical()
    assert canonical not in report["locs"]


def test_shipped_reports_share_graph_cardinality():
    """Hygiene unique_paths == inbound sitemap_locs == union of index children."""
    from scripts.organic.sitemap_graph import load_graph_locs, loc_key, parse_sitemap_txt
    from scripts.site.inbound_gates import gate_index_surface

    root = Path(__file__).resolve().parents[3]
    report = audit_sitemaps(root)
    inbound = gate_index_surface()
    graph = {loc_key(url) for url in load_graph_locs(root)}
    txt = parse_sitemap_txt((root / "sitemap.txt").read_text(encoding="utf-8"))
    assert report["ok"] is True
    assert inbound.ok is True
    assert report["unique_paths"] == inbound.stats["sitemap_locs"] == len(graph)
    assert {loc_key(url) for url in txt} == graph
    assert "sitemap.xml" in report["walked_members"]
    assert not any(i["code"] == "empty_sitemap_member" for i in report["issues"])


def test_audit_sitemaps_is_the_shipped_entry_point(tmp_path: Path):
    loc = f"{SITE}/"
    _seed(
        tmp_path,
        members={"sitemap.xml": [(loc, "2026-08-01")]},
        pages={loc: {"modified": "2026-08-01"}},
    )
    via_hygiene = audit_sitemaps(tmp_path)
    via_graph = audit_graph(tmp_path, as_of=AS_OF, market_answer_indexable=True)
    assert via_hygiene["ok"] is True
    assert via_graph["ok"] is True
    assert via_hygiene["unique_paths"] == via_graph["unique_paths"] == 1
    assert via_hygiene["walked_members"] == ["sitemap.xml"]


def test_robots_longest_allow_beats_family_disallow():
    from scripts.organic.sitemap_graph import path_blocked_by_robots

    robots = (
        "User-agent: *\n"
        "Allow: /analises-contratos-publicos/reajuste-incc-coluna-35-paralelepipedo-sao-goncalo-piaui-2026/\n"
        "Disallow: /analises-contratos-publicos/\n"
    )
    canary = "/analises-contratos-publicos/reajuste-incc-coluna-35-paralelepipedo-sao-goncalo-piaui-2026/"
    other = "/analises-contratos-publicos/fixture-preview/"
    assert path_blocked_by_robots(canary, robots) is False
    assert path_blocked_by_robots(other, robots) is True


def test_x_robots_last_match_index_override_not_family_noindex():
    headers = (
        "/analises-contratos-publicos/*\n"
        "  X-Robots-Tag: noindex, nofollow, noarchive\n"
        "\n"
        "/analises-contratos-publicos/reajuste-incc-coluna-35-paralelepipedo-sao-goncalo-piaui-2026/*\n"
        "  X-Robots-Tag: index, follow\n"
    )
    family = "/analises-contratos-publicos/fixture-preview/"
    canary = "/analises-contratos-publicos/reajuste-incc-coluna-35-paralelepipedo-sao-goncalo-piaui-2026/"
    assert x_robots_noindex(headers, family) is True
    assert x_robots_noindex(headers, canary) is False
