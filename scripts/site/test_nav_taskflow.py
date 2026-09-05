#!/usr/bin/env python3
"""Task-first navigation gates (issue #183).

A visitor who lands on an internal page from search must reach services,
problems and tools from the header, in one header interaction, without going
back to a home anchor first.

This is the repo-verifiable half of the tree test: a deterministic reachability
walk over the shipped HTML (header link -> destination page link). It does not
replace a moderated study with real users; it does guarantee the structure the
study would be run against, and it fails when the structure regresses.

Run: python3 scripts/site/test_nav_taskflow.py
"""

from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.public_ia import (  # noqa: E402
    HUB_ROLES,
    active_header_href,
    audit_orphans,
    audit_primary_nav_hygiene,
    breadcrumb_trail,
    first_viewport_names_journey,
    footer_problem_cluster_dump,
    hubs,
    materialize_route_map,
    parent_of,
    parse_jsonld_breadcrumb_trail,
    parse_visible_breadcrumb_trail,
    validate_contract,
)
from scripts.site.shell_nav import (  # noqa: E402
    FROZEN_SHELL_FILES,
    HEADER_CTA_RE,
    MOBILE_NAV_RE,
    ROOT as SHELL_ROOT,
    desktop_cta,
    hub,
    load_brand,
    mobile_cta,
    nav_items,
    nav_cta,
    shipped_html_files,
)

# Four visitor tasks: one header interaction, then at most one hub click.
TASKS = {
    "edital": "/bid-room-licitacoes-obras/",
    "glosa": "/medicoes-glosas-obras-publicas/",
    "reequilibrio": "/reequilibrio-obras-publicas/",
    "ferramenta": "/ferramentas/",
}
FROZEN_NAV_LABELS = [
    "Serviços",
    "Problemas que resolvemos",
    "Conteúdos",
    "Ferramentas",
    "Especialista",
]


class _NavLinks(HTMLParser):
    """Collect (href, label) for one nav class, in document order."""

    def __init__(self, nav_class: str) -> None:
        super().__init__()
        self.nav_class = nav_class
        self.links: list[tuple[str, str]] = []
        self._depth = 0
        self._href: str | None = None
        self._cls: str = ""
        self._buf: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {k: (v or "") for k, v in attrs}
        if tag == "nav" and self.nav_class in ad.get("class", "").split():
            self._depth = 1
            return
        if not self._depth:
            return
        if tag == "nav":
            self._depth += 1
        if tag == "a":
            self._href = ad.get("href", "")
            self._cls = ad.get("class", "")
            self._buf = []

    def handle_endtag(self, tag: str) -> None:
        if self._depth and tag == "a" and self._href is not None:
            label = re.sub(r"\s+", " ", "".join(self._buf)).strip()
            # The trailing CTA button is not a taxonomy item.
            if label and "button" not in (self._cls or "").split():
                self.links.append((self._href, label))
            self._href = None
        if self._depth and tag == "nav":
            self._depth -= 1

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._buf.append(data)


def nav_links(html: str, nav_class: str) -> list[tuple[str, str]]:
    parser = _NavLinks(nav_class)
    parser.feed(html)
    return parser.links


def internal_hrefs(html: str) -> set[str]:
    out = set()
    for href in re.findall(r'href="(/[^"#?]*)"', html):
        out.add(href if href.endswith("/") or "." in href.rsplit("/", 1)[-1] else href + "/")
    return out


def main() -> int:
    brand = load_brand()
    failures: list[str] = []

    # --- 1. Header labels point at destinations that match them -------------
    for item in nav_items(brand):
        href = item["href"]
        if href.startswith("/#") or href.startswith("#"):
            failures.append(
                f"nav label {item['label']!r} still points at a home anchor: {href}"
            )
            continue
        target = ROOT / href.strip("/") / "index.html"
        if not target.is_file():
            failures.append(f"nav label {item['label']!r} target missing: {href}")

    services = hub(brand, "services")
    problems = hub(brand, "problems")
    for meta, key in ((services, "services"), (problems, "problems")):
        if not meta.get("url"):
            failures.append(f"navigation.hubs.{key}.url missing in brand.json")

    # --- 2. Desktop / mobile / footer carry the same taxonomy ---------------
    expected = [(i["href"], i["label"]) for i in nav_items(brand)]
    expected_cta = nav_cta(brand)
    expected_desktop_cta = desktop_cta(brand)
    expected_mobile_cta = mobile_cta(brand)
    checked = 0
    for path in shipped_html_files():
        html = path.read_text(encoding="utf-8", errors="replace")
        if 'class="desktop-nav"' not in html:
            continue
        checked += 1
        rel = path.relative_to(ROOT).as_posix()
        desktop = nav_links(html, "desktop-nav")
        if desktop != expected:
            failures.append(f"{rel}: desktop nav {desktop} != {expected}")
        mobile = nav_links(html, "mobile-nav")
        if mobile and mobile != expected:
            failures.append(f"{rel}: mobile nav {mobile} != {expected}")
        header_cta = HEADER_CTA_RE.search(html)
        protected_offer_cta = bool(
            header_cta
            and 'data-cta-kind="offer"' in header_cta.group(0)
            and 'data-next-action-id="' in header_cta.group(0)
            and 'data-offer-id="' in header_cta.group(0)
            and 'data-cta-position="report_header"' in header_cta.group(0)
        )
        if expected_desktop_cta not in html and not protected_offer_cta:
            failures.append(
                f"{rel}: desktop CTA is not navigation.cta "
                f"{expected_cta['label']!r} -> {expected_cta['href']!r}"
            )
        mobile_block = MOBILE_NAV_RE.search(html)
        if mobile_block and expected_mobile_cta not in mobile_block.group(2):
            failures.append(
                f"{rel}: mobile CTA is not navigation.cta "
                f"{expected_cta['label']!r} -> {expected_cta['href']!r}"
            )
        footer_top = re.search(
            r'<div class="container footer-top">(.*?)<div class="container footer-bottom">',
            html,
            re.S,
        )
        if footer_top:
            missing = [
                href
                for href, _ in expected
                if f'href="{href}"' not in footer_top.group(1)
            ]
            if missing:
                failures.append(f"{rel}: footer missing header hrefs {missing}")
        # Keyboard + touch: plain anchors plus a real button for the mobile menu.
        if "menu-toggle" in html:
            if not re.search(
                r'<button[^>]*\bclass="[^"]*menu-toggle[^"]*"[^>]*>', html
            ) or "aria-expanded" not in html:
                failures.append(f"{rel}: mobile menu toggle is not a button with aria-expanded")
        # Route choice must be measurable without PII.
        if 'data-cta-position="header_nav"' not in html:
            failures.append(f"{rel}: header nav links miss data-cta-position")
    if checked < 200:
        failures.append(f"expected the shell on ~200 pages, saw {checked}")

    # --- 2b. The freeze exception is declared, bounded and label-consistent --
    # The six BOFU pillars are byte-frozen by CONFENGE-WEB-BOFU-FROZEN-PILLAR-SPECS-01
    # until 2026-09-16, so the sync skips them. They must still show the same labels,
    # and the skip list must be exactly the campaign's frozen HTML — never wider.
    # The later deliverables decision added one mutable-shell label, so the frozen
    # pages retain the earlier five-label contract until their own freeze lifts.
    from scripts.bofu_dominance.frozen_specs.constants import (  # noqa: PLC0415
        FORBIDDEN_RELATIVE_PATHS,
    )

    campaign_frozen = {r for r in FORBIDDEN_RELATIVE_PATHS if r.endswith("/index.html")}
    if set(FROZEN_SHELL_FILES) != campaign_frozen:
        failures.append(
            f"shell sync skip list {sorted(FROZEN_SHELL_FILES)} "
            f"!= frozen campaign HTML {sorted(campaign_frozen)}"
        )
    for rel in sorted(campaign_frozen):
        html = (SHELL_ROOT / rel).read_text(encoding="utf-8", errors="replace")
        labels = [label for _, label in nav_links(html, "desktop-nav")]
        if labels != FROZEN_NAV_LABELS:
            failures.append(
                f"{rel}: frozen page labels {labels} != {FROZEN_NAV_LABELS}"
            )

    # --- 3. Active state is visible and inherited by descendant/task routes -
    # Two-door chrome: B2G children highlight Obras públicas; biblioteca and
    # ferramentas highlight Biblioteca. The IA map is the authority.
    active_cases = {
        problems["url"]: active_header_href(problems["url"]),
        "/bid-room-licitacoes-obras/": active_header_href("/bid-room-licitacoes-obras/"),
        "/diretoria-b2g/": active_header_href("/diretoria-b2g/"),
        "/defesa-tecnica-contratos-publicos/": active_header_href(
            "/defesa-tecnica-contratos-publicos/"
        ),
        "/conteudos/ata-reuniao-ordem-servico-obra-publica/": active_header_href(
            "/conteudos/ata-reuniao-ordem-servico-obra-publica/"
        ),
        "/ferramentas/limite-acrescimos-supressoes/": active_header_href(
            "/ferramentas/limite-acrescimos-supressoes/"
        ),
    }
    for current, active in active_cases.items():
        path = ROOT / current.strip("/") / "index.html"
        html = path.read_text(encoding="utf-8")
        for nav_class in ("desktop-nav", "mobile-nav"):
            match = re.search(
                rf'<nav\b[^>]*\b{nav_class}\b[^>]*>(.*?)</nav>', html, re.S | re.I
            )
            current_hrefs = (
                re.findall(
                    r'<a\b(?=[^>]*\baria-current="page")[^>]*\bhref="([^"]+)"',
                    match.group(1),
                )
                if match
                else []
            )
            if current_hrefs != [active]:
                failures.append(
                    f"{current}: {nav_class} active branch {current_hrefs} != {[active]}"
                )

    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    for selector in (
        '.desktop-nav a[aria-current="page"]',
        '.mobile-nav a[aria-current="page"]',
    ):
        if selector not in css:
            failures.append(f"styles.css misses visible active selector {selector}")

    # The generated hubs must switch no-js to js before CSS can expose JS-only states.
    for meta in (services, problems):
        html = (ROOT / meta["url"].strip("/") / "index.html").read_text(
            encoding="utf-8"
        )
        toggle = "document.documentElement.classList.replace('no-js','js')"
        if toggle not in html or html.index(toggle) > html.index('href="/styles.css"'):
            failures.append(f"{meta['url']}: no-js -> js toggle missing before stylesheet")

    # --- 4. Static reachability: each named task is <= 2 links from the header
    # This is a repository contract, not a participant study or conversion result.
    hub_targets: dict[str, set[str]] = {}
    for item in nav_items(brand):
        href = item["href"]
        target = ROOT / href.strip("/") / "index.html"
        if target.is_file():
            hub_targets[href] = internal_hrefs(target.read_text(encoding="utf-8"))

    header = {href for href, _ in expected}
    attempts = len(TASKS)
    successes = 0
    misses: list[str] = []
    for task, destination in TASKS.items():
        direct = destination in header
        via_hub = any(
            href in header and destination in reachable
            for href, reachable in hub_targets.items()
        )
        if direct or via_hub:
            successes += 1
        else:
            misses.append(task)

    if successes != attempts:
        failures.append(
            f"static reachability {successes}/{attempts}; unreachable tasks: {misses}"
        )

    # --- 5. CFG10X-11 IA contract on shipped HTML --------------------------------
    contract_errors = validate_contract()
    failures.extend(f"ia contract: {err}" for err in contract_errors)
    if len(expected) > 5:
        failures.append(f"header has {len(expected)} destinations; max is 5")
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    if not first_viewport_names_journey(home):
        failures.append("home header does not name a purchase situation without B2G")
    for hub_row in hubs():
        role = hub_row.get("role")
        if role not in HUB_ROLES:
            failures.append(f"hub {hub_row.get('route')} role {role!r} not in {sorted(HUB_ROLES)}")
    routes = materialize_route_map(ROOT)
    if not routes:
        failures.append("route map is empty")
    for route, rec in routes.items():
        if rec.get("parent") is None and route != "/":
            failures.append(f"route {route} has no parent")
        if "job" not in rec or "next_action" not in rec or "index_state" not in rec:
            failures.append(f"route {route} missing job/next_action/index_state")
        if rec.get("index_state") == "index" and rec.get("parent"):
            parent = rec["parent"]
            if parent not in routes and parent != "/":
                failures.append(f"indexable {route} parent {parent} is not a public route")
    for path in (
        ROOT / "problemas-que-resolvemos" / "index.html",
        ROOT / "servicos-obras-publicas" / "index.html",
        ROOT / "bid-room-licitacoes-obras" / "index.html",
        ROOT / "diretoria-b2g" / "index.html",
    ):
        html = path.read_text(encoding="utf-8")
        route = "/" + path.parent.relative_to(ROOT).as_posix() + "/"
        parent = parent_of(route)
        crumb = re.search(
            r'<nav aria-label="Navegação estrutural"[^>]*>(.*?)</nav>', html, re.S
        )
        schema = re.search(
            r'"@type":"BreadcrumbList".*?"itemListElement":(\[.*?\])', html, re.S
        )
        if not crumb:
            failures.append(f"{route}: missing visible breadcrumbs")
        elif parent == "/" and 'href="/"' not in crumb.group(1):
            failures.append(f"{route}: breadcrumbs missing Início")
        if not schema:
            failures.append(f"{route}: missing BreadcrumbList")
    hub_routes = {hub["route"] for hub in hubs()}
    for route in (
        "/defesa-margem-contratos-publicos/",
        "/atrasos-prorrogacao-obras-publicas/",
        "/acompanhamento-contratos-obras/",
        "/defesa-tecnica-contratos-publicos/",
    ):
        rec = routes.get(route)
        if not rec:
            failures.append(f"{route}: missing from route map")
            continue
        if rec.get("file") in FROZEN_SHELL_FILES:
            failures.append(f"{route}: probe is frozen; pick a live child")
            continue
        if route in hub_routes or rec.get("parent") in (None, "/"):
            failures.append(f"{route}: probe must be a non-hub child")
            continue
        html = (ROOT / rec["file"]).read_text(encoding="utf-8")
        visible = parse_visible_breadcrumb_trail(html)
        schema_trail = parse_jsonld_breadcrumb_trail(html, route)
        expected = breadcrumb_trail(
            route, current_label=visible[-1][0] if visible else None
        )
        if visible != expected:
            failures.append(f"{route}: visible crumbs {visible} != {expected}")
        if schema_trail != expected:
            failures.append(f"{route}: BreadcrumbList {schema_trail} != {expected}")
    clusters = [c["url"] for c in brand.get("problem_clusters") or [] if c.get("url")]
    if footer_problem_cluster_dump(home, clusters):
        failures.append("home footer dumps the full problem-cluster taxonomy")
    failures.extend(f"nav hygiene: {err}" for err in audit_primary_nav_hygiene(ROOT))
    graph = audit_orphans(ROOT)
    if graph["orphan_count"] != 0:
        failures.append(
            f"indexable orphans={graph['orphan_count']}: {graph['orphans'][:12]}"
        )

    if failures:
        print("FAIL nav taskflow:")
        for line in failures[:30]:
            print("  ", line)
        return 1
    print(
        "PASS nav taskflow",
        {
            "pages_with_shell": checked,
            "static_reachability": f"{successes}/{attempts}",
            "participant_study": "not run; issue #183 remains open",
            "tasks": sorted(TASKS),
        },
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
