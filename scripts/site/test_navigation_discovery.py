"""Discovery-menu acceptance: destinations, native controls and shell parity."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import re

import pytest

from scripts.site.navigation_discovery import render_discovery_bar, render_navigation
from scripts.site.public_ia import load_ia_map
from scripts.site.public_navigation import promote_public_navigation
from scripts.site.test_nav_taskflow import public_target_exists


ROOT = Path(__file__).resolve().parents[2]
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


class _DOM(HTMLParser):
    def __init__(self, html: str) -> None:
        super().__init__()
        self.root = {"tag": "root", "attrs": {}, "children": []}
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = {"tag": tag, "attrs": dict(attrs), "children": []}
        self.stack[-1]["children"].append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index]["tag"] == tag:
                del self.stack[index:]
                return

    def handle_data(self, data):
        self.stack[-1]["children"].append(data)


def _nodes(node, tag=None, cls=None):
    result = []
    for child in node["children"]:
        if isinstance(child, str):
            continue
        if (tag is None or child["tag"] == tag) and (cls is None or cls in child["attrs"].get("class", "").split()):
            result.append(child)
        result.extend(_nodes(child, tag, cls))
    return result


def _text(node):
    return " ".join(" ".join(child if isinstance(child, str) else _text(child) for child in node["children"]).split())


def _direct_text(node):
    return " ".join(" ".join(child for child in node["children"] if isinstance(child, str)).split())


def _assert_menu_contract(menu, groups, kind):
    assert not _nodes(menu, "nav"), "navigation landmarks must not nest"
    actual_groups = _nodes(menu, "details", "nav-group")
    assert [node["attrs"]["data-nav-group"] for node in actual_groups] == [group["id"] for group in groups]
    assert {node["attrs"].get("name") for node in actual_groups} == {f"nav-{kind}"}, "native groups must be exclusive within their own navigation"
    assert len(_nodes(menu, "summary")) == len(groups)
    for actual, expected in zip(actual_groups, groups, strict=True):
        assert "open" not in actual["attrs"], "menus must not cover the page on arrival"
        summaries = _nodes(actual, "summary")
        assert len(summaries) == 1
        assert _text(summaries[0]) == expected["label"]
        assert _direct_text(summaries[0]) == expected["label"]
        assert not _nodes(summaries[0]), "native summary labels do not need decorative DOM wrappers"
        assert summaries[0]["attrs"].get("role") not in {"menu", "menuitem", "button"}
        panels = _nodes(actual, "div", "nav-panel")
        assert len(panels) == 1
        assert summaries[0]["attrs"].get("aria-controls") == panels[0]["attrs"].get("id")
        overviews = [a for a in _nodes(actual, "a") if a["attrs"].get("data-nav-primary") == "true"]
        assert len(overviews) == 1
        assert overviews[0]["attrs"]["href"] == expected["href"]
        assert overviews[0]["attrs"]["data-nav-label"] == expected["label"]
        assert _text(overviews[0]) == expected["overview_label"]
        children = _nodes(actual, "a", "nav-destination")
        assert len(children) == len(expected["children"])
        assert len(_nodes(actual, "a")) == len(children) + 1, "unexpected or hidden menu link"
        panel_children = [child for child in panels[0]["children"] if not isinstance(child, str)]
        assert panel_children == [*children, overviews[0]], "destinations lead directly to the full-width overview footer"
        for child, declared in zip(children, expected["children"], strict=True):
            assert child["attrs"]["href"] == declared["href"]
            assert child["attrs"]["data-nav-destination"] == declared["id"]
            assert _direct_text(child) == declared["label"]
            descriptions = _nodes(child, "span", "nav-destination__description")
            assert len(descriptions) == 1
            assert _text(descriptions[0]) == declared["description"]
            assert _nodes(child) == descriptions, "only the visible description needs its own element"
            assert "aria-current" not in child["attrs"], "only the primary branch owns current-page state"
    anchors = _nodes(menu, "a")
    assert len([a for a in anchors if a["attrs"].get("aria-current") == "page"]) <= 1
    assert all(a["attrs"].get("data-cta-position") in {"header_nav", "mobile_nav"} for a in anchors)
    assert all(a["attrs"].get("data-navigation-link") == "true" for a in anchors)


def test_discovery_destinations_are_real_and_describe_available_actions():
    header = load_ia_map()["header"]
    groups = header["destinations"]
    assert [group["label"] for group in groups] == ["Projetos", "Serviços", "Ferramentas", "Inteligência", "Obras públicas", "Conteúdos"]
    assert len({group["id"] for group in groups}) == len(groups)
    all_links = list(groups)
    for group in groups:
        children = group["children"]
        assert children and group["overview_label"] and group["description"]
        assert len({item["id"] for item in children}) == len(children)
        assert len({item["href"] for item in children}) == len(children)
        assert all(item["label"].strip() and item["description"].strip() for item in children)
        all_links.extend(children)
    all_links.extend(header["quick_links"])
    all_links.extend(header["utility_links"])
    for link in all_links:
        assert link["href"].startswith("/") and not link["href"].startswith("//")
        assert public_target_exists(link["href"]), link
        assert not link["href"].startswith(("/profissionais/", "/ops/", "/intranet/", "/api/")), link
    expected_quick = {"/cad/", "/bim/", "/projetos-prontos/", "/ferramentas/radar-mercado-publico/"}
    assert {item["href"] for item in header["quick_links"]} == expected_quick
    assert {item["href"] for item in header["utility_links"]} == {"/empresa/"}
    ready = [link for link in all_links if link["href"] == "/projetos-prontos/"]
    assert ready
    assert all(not re.search(r"compre|comprar|compra imediata|download imediato|pagamento", link["label"] + " " + link.get("description", ""), re.I) for link in ready)


@pytest.mark.parametrize("kind", ["desktop", "mobile", "pp-desktop", "pp-mobile"])
def test_each_shell_has_complete_native_navigation_without_javascript(kind):
    groups = load_ia_map()["header"]["destinations"]
    rendered = render_navigation(kind=kind, current="/cad/")
    dom = _DOM(f'<nav>{rendered}</nav>')
    menu = _nodes(dom.root, "nav")[0]
    _assert_menu_contract(menu, groups, kind)
    current = [a for a in _nodes(menu, "a") if a["attrs"].get("aria-current") == "page"]
    assert len(current) == 1 and current[0]["attrs"]["href"] == "/ferramentas/"
    assert not _nodes(menu, "script")
    ids = [node["attrs"]["id"] for node in _nodes(menu) if node["attrs"].get("id")]
    assert len(ids) == len(set(ids))
    assert all(identifier.startswith(f"nav-{kind}-") for identifier in ids)


@pytest.mark.parametrize("relative", ["index.html", "ferramentas/index.html", "projetos/index.html", "projeto-estrutura-metalica/index.html", "projetos-prontos/index.html"])
def test_published_shell_families_compile_the_same_discovery_contract(relative):
    source = (ROOT / relative).read_text(encoding="utf-8")
    rendered = promote_public_navigation(source, relative_path=relative)
    assert promote_public_navigation(rendered, relative_path=relative) == rendered
    dom = _DOM(rendered)
    groups = load_ia_map()["header"]["destinations"]
    menus = [node for node in _nodes(dom.root, "nav") if {"desktop-nav", "mobile-nav", "pp-nav", "pp-mobile-nav"} & set(node["attrs"].get("class", "").split())]
    assert len(menus) == 2, relative
    kinds = {"desktop-nav": "desktop", "mobile-nav": "mobile", "pp-nav": "pp-desktop", "pp-mobile-nav": "pp-mobile"}
    for menu in menus:
        kind = next(value for cls, value in kinds.items() if cls in menu["attrs"].get("class", "").split())
        # CTA has its own declared analytics and is already independently gated.
        _assert_menu_contract({**menu, "children": [child for child in menu["children"] if isinstance(child, str) or child["tag"] != "a"]}, groups, kind)
    panel_ids = [node["attrs"]["id"] for node in _nodes(dom.root, "div", "nav-panel")]
    assert len(panel_ids) == len(set(panel_ids)), relative
    tracking_ids = [node["attrs"]["data-cta-id"] for node in _nodes(dom.root, "a") if node["attrs"].get("data-navigation-link") == "true"]
    assert len(tracking_ids) == len(set(tracking_ids)), relative
    bars = _nodes(dom.root, "div", "nav-discovery")
    assert len(bars) == 1, relative
    shortcut_regions = _nodes(dom.root, "nav", "nav-discovery-region")
    assert len(shortcut_regions) == 1, relative
    assert shortcut_regions[0]["attrs"].get("aria-label") == "Acesso direto", relative
    assert _nodes(shortcut_regions[0], "div", "nav-discovery") == bars, relative
    headers = [node for node in _nodes(dom.root, "header") if {"site-header", "pp-header"} & set(node["attrs"].get("class", "").split())]
    assert len(headers) == 1, relative
    assert not _nodes(headers[0], "div", "nav-discovery"), relative
    assert re.search(r'</header>\s*<!-- BEGIN NAV DISCOVERY -->', rendered), relative
    header = load_ia_map()["header"]
    assert [(a["attrs"]["href"], _text(a)) for a in _nodes(bars[0], "a")] == [(item["href"], item["label"]) for item in header["quick_links"] + header["utility_links"]]


def test_discovery_bar_has_one_named_landmark_without_loading_apps():
    rendered = render_discovery_bar()
    dom = _DOM(rendered)
    landmarks = _nodes(dom.root, "nav")
    assert len(landmarks) == 1
    assert landmarks[0]["attrs"].get("aria-label") == "Acesso direto"
    assert "nav-discovery-region" in landmarks[0]["attrs"].get("class", "").split()
    assert not _nodes(dom.root, "script")
    assert not _nodes(dom.root, "iframe")
    assert not _nodes(dom.root, "img")
    assert len(_nodes(dom.root, "a")) == 5
