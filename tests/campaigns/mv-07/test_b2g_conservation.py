import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[3]
CAMPAIGN = ROOT / "docs/integration/campaign-20260905/07"
BASELINE_PATH = CAMPAIGN / "b2g-conservation-baseline.json"


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        href = dict(attrs).get("href")
        if href:
            self.hrefs.append(href)


class VisibleTextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        if data.strip():
            self.parts.append(data.strip())


def load_baseline():
    return json.loads(BASELINE_PATH.read_text(encoding="utf-8"))


def route_file(route):
    if route == "/":
        return ROOT / "index.html"
    return ROOT / route.strip("/") / "index.html"


def normalize_local_route(href):
    parsed = urlparse(href)
    if parsed.scheme or parsed.netloc:
        if parsed.netloc not in {"confenge.com.br", "www.confenge.com.br"}:
            return None
        path = parsed.path
    else:
        path = parsed.path
    if not path.startswith("/"):
        return None
    if path.endswith(".html") or "." in Path(path).name:
        return None
    return path if path.endswith("/") else f"{path}/"


def local_links(path):
    return local_links_from_markup(path.read_text(encoding="utf-8"))


def local_links_from_markup(markup):
    parser = LinkParser()
    parser.feed(markup)
    return {
        route
        for href in parser.hrefs
        if (route := normalize_local_route(href)) is not None
    }


def visible_text(markup):
    parser = VisibleTextParser()
    parser.feed(markup)
    return " ".join(parser.parts)


def assert_indexable_self_canonical(route, sitemap, require_explicit_robots=True):
    path = route_file(route)
    assert path.is_file(), f"B2G route disappeared: {route}"
    html = path.read_text(encoding="utf-8")
    canonical = f"https://confenge.com.br{route}"
    assert re.search(
        rf'<link\b(?=[^>]*\brel=["\']canonical["\'])(?=[^>]*\bhref=["\']{re.escape(canonical)}["\'])[^>]*>',
        html,
        re.IGNORECASE,
    ), f"B2G self-canonical changed: {route}"
    robots = re.search(
        r'<meta\b(?=[^>]*\bname=["\']robots["\'])(?=[^>]*\bcontent=["\']([^"\']+)["\'])[^>]*>',
        html,
        re.IGNORECASE,
    )
    directives = {token.strip() for token in robots.group(1).lower().split(",")} if robots else set()
    if require_explicit_robots:
        assert {"index", "follow"} <= directives, f"B2G route lost exact index,follow: {route}"
    assert not {"noindex", "nofollow"} & directives, f"B2G route gained blocking robots: {route}"
    assert f"<loc>{canonical}</loc>" in sitemap, f"B2G route left sitemap: {route}"


def registry_covers(route, registry):
    for family in registry["families"]:
        match = family["match"]
        if route in match.get("routes", []):
            return True
        if route.startswith(match.get("prefix", "__NO_PREFIX__")):
            return True
    return False


def assert_surface_matches_baseline(item, sitemap):
    route = item["route"]
    path = route_file(route)
    assert path.is_file(), f"B2G surface disappeared: {route}"
    html = path.read_text(encoding="utf-8")
    canonical = f"https://confenge.com.br{route}"
    if item["canonical_required"]:
        assert re.search(
            rf'<link\b(?=[^>]*\brel=["\']canonical["\'])(?=[^>]*\bhref=["\']{re.escape(canonical)}["\'])[^>]*>',
            html,
            re.IGNORECASE,
        ), f"B2G surface lost its self-canonical: {route}"

    robots = re.search(
        r'<meta\b(?=[^>]*\bname=["\']robots["\'])(?=[^>]*\bcontent=["\']([^"\']+)["\'])[^>]*>',
        html,
        re.IGNORECASE,
    )
    directives = {token.strip() for token in robots.group(1).lower().split(",")} if robots else set()
    if item["index_state"] == "INDEXABLE":
        assert not {"noindex", "nofollow"} & directives, f"B2G surface lost indexability: {route}"
    else:
        assert "noindex" in directives, f"quarantined B2G surface was published without its gates: {route}"

    in_sitemap = f"<loc>{canonical}</loc>" in sitemap
    assert in_sitemap is item["sitemap_required"], f"B2G surface sitemap state changed: {route}"


def test_baseline_is_bound_to_fetched_main_and_production_observation():
    baseline = load_baseline()
    assert baseline["base_sha"] == "470a5ffafeaf45a59649109742ce5885f9789328"
    assert baseline["production"]["build_info_commit"] == "89b081a8676d8a0b30747dfcb1477f21d9ac4dfb"
    assert baseline["production"]["relation_to_base"] == "PRODUCTION_ONE_MAIN_COMMIT_BEHIND_AT_OBSERVATION"
    assert baseline["production"]["canonical_domain"] == "confenge.com.br"
    assert baseline["production"]["host_architecture_version"] == "confenge-nginx-node/v2"


def test_every_core_b2g_route_keeps_file_index_self_canonical_and_sitemap():
    baseline = load_baseline()
    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")

    for item in baseline["core_routes"]:
        assert_indexable_self_canonical(item["route"], sitemap)


def test_b2g_tools_and_data_surfaces_keep_indexable_routes_and_registry_coverage():
    baseline = load_baseline()
    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    registry = json.loads((ROOT / "data/organic/public-family-registry.json").read_text(encoding="utf-8"))

    for item in baseline["b2g_tools"]:
        assert_surface_matches_baseline(item, sitemap)
        route = item["route"]
        assert registry_covers(route, registry), f"B2G tool lost public-family coverage: {route}"

    for item in baseline["b2g_data_surfaces"]:
        route_or_prefix = item.get("route", item.get("prefix"))
        if "route" in item:
            assert_surface_matches_baseline(item, sitemap)
        else:
            assert item["instance_routes"], f"B2G data prefix has no conserved instances: {route_or_prefix}"
            for route in item["instance_routes"]:
                instance_item = {**item, "route": route}
                assert_surface_matches_baseline(instance_item, sitemap)
        assert registry_covers(route_or_prefix, registry), (
            f"B2G data surface lost public-family coverage: {route_or_prefix}"
        )


def test_baseline_covers_bofu_matrix_without_mixing_the_new_entity_offer():
    baseline = load_baseline()
    bofu = json.loads((ROOT / "data/organic/bofu-intent-matrix.json").read_text(encoding="utf-8"))
    baseline_routes = {item["route"] for item in baseline["core_routes"]}
    matrix_routes = {row["canonical_service_route"] for row in bofu["rows"]}
    assert matrix_routes <= baseline_routes
    assert "/servicos-obras-publicas/" in baseline_routes
    assert "/planejamento-tecnico-licitacoes-obras-publicas/" not in matrix_routes


def test_b2g_hub_remains_reachable_from_home_in_at_most_two_actions():
    target = "/servicos-obras-publicas/"
    first_hop = local_links(ROOT / "index.html")
    if target in first_hop:
        return

    for route in first_hop:
        candidate = route_file(route)
        if candidate.is_file() and target in local_links(candidate):
            return
    raise AssertionError("B2G hub is no longer reachable from home in one or two actions")


def test_home_first_touch_keeps_an_explicit_b2g_message_and_destination():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    header = re.search(r"<header\b[^>]*>.*?</header>", html, re.IGNORECASE | re.DOTALL)
    main = re.search(r"<main\b[^>]*>.*?</main>", html, re.IGNORECASE | re.DOTALL)
    first_section = re.search(
        r"<section\b[^>]*>.*?</section>",
        main.group(0) if main else "",
        re.IGNORECASE | re.DOTALL,
    )
    assert header and first_section, "home lost its visible header or first decision block"
    first_touch_markup = f"{header.group(0)} {first_section.group(0)}"
    first_touch = visible_text(first_touch_markup).lower()
    assert any(
        marker in first_touch
        for marker in ("obras públicas", "mercado público", "contrato público", "b2g")
    ), "broad home erased the B2G message match from the first touch"
    first_touch_destinations = local_links_from_markup(first_touch_markup)
    b2g_destinations = {
        "/servicos-obras-publicas/",
        "/bid-room-licitacoes-obras/",
        "/problemas-que-resolvemos/",
        "/diretoria-b2g/",
    }
    assert first_touch_destinations & b2g_destinations, "first touch lost every visible B2G path"


def test_future_corporate_services_page_cannot_take_b2g_canonical_or_redirects():
    corporate = ROOT / "servicos/index.html"
    if not corporate.exists():
        return

    html = corporate.read_text(encoding="utf-8")
    assert re.search(
        r'<link\b(?=[^>]*\brel=["\']canonical["\'])(?=[^>]*\bhref=["\']https://confenge\.com\.br/servicos/["\'])[^>]*>',
        html,
        re.IGNORECASE,
    ), "corporate services must self-canonicalize instead of taking the B2G canonical"
    assert "/servicos-obras-publicas/" in local_links(corporate)

    redirects = (ROOT / "_redirects").read_text(encoding="utf-8")
    bad = re.compile(
        r"^/(?:servicos|servicos\.html|services)\s+/servicos-obras-publicas/\s+30[1278]\b",
        re.MULTILINE,
    )
    assert not bad.search(redirects), "legacy corporate aliases still hijack the B2G hub"


def test_pncp_numbers_keep_vertical_context_cutoff_method_and_limit():
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    proof_start = home.find('class="home-proof-strip"')
    proof_end = home.find("<!-- 2.", proof_start)
    market_marker = home.find('id="mercado-pncp"')
    market_start = home.rfind("<section", 0, market_marker)
    market_end = home.find("<!-- 5.", market_marker)
    assert min(proof_start, proof_end, market_marker, market_start, market_end) >= 0

    blocks = {
        "home proof strip": home[proof_start:proof_end].lower(),
        "market evidence": home[market_start:market_end].lower(),
    }
    for label, block in blocks.items():
        assert "pncp" in block, f"{label} lost its PNCP provenance"
        assert re.search(r"\d", block), f"{label} no longer contains numeric proof"
        assert "obra" in block or "engenharia" in block, f"{label} lost B2G context"
        assert "corte" in block, f"{label} lost its cutoff"
        assert "/metodologia-inteligencia/" in block, f"{label} lost its method link"
        assert any(marker in block for marker in ("recorte", "não a base nacional", "limite", "universo")), (
            f"{label} lost its coverage limit"
        )
    assert "pncp.gov.br/" in blocks["market evidence"], "record-level proof lost its official PNCP links"


def test_b2g_capture_and_destinations_stay_confenge_only():
    baseline = load_baseline()
    corpus = " ".join(
        route_file(item["route"]).read_text(encoding="utf-8")
        for item in baseline["core_routes"]
    ).lower()
    channels = baseline["current_terminal_and_external_destinations"]
    assert channels["persistent_capture"] in corpus
    assert channels["whatsapp_host"] in corpus
    assert channels["published_mailbox"] in corpus
    assert "smartlic" not in corpus
    assert channels["smartlic_allowed"] is False
    assert channels["inbound_authorizes_outbound"] is False


def test_outbound_state_is_preserved_as_paused_without_inventing_a_destination():
    outbound = load_baseline()["outbound_acquisition"]
    assert outbound["transport_owner"] == "warmbly"
    assert outbound["verdict"] == "NO_GO_SMTP"
    assert outbound["dispatch"] == "PAUSED"
    assert outbound["smtp_sent"] is False
    assert outbound["new_entity_cohort"]["campaign_state"] == "PAUSED"
    assert outbound["new_entity_cohort"]["sends"] == 0
    assert outbound["live_landing_destinations"].startswith("UNKNOWN_NOT_OBSERVED")


def test_b2g_hashes_are_diagnostic_and_not_a_byte_freeze():
    invariants = load_baseline()["required_post_integration_invariants"]
    assert invariants["existing_b2g_html_exact_hash_required"] is False
    assert invariants["hashes_are_diagnostic_not_freeze"] is True
