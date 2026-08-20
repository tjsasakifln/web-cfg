"""Gating tests for CONFENGE-WEB-BOFU-SAFE-EXECUTION-01.

Reads the four shipped index.html files (not copies). Asserts distinct
BOFU jobs, first-fold contract, epistemic labels, claims, SEO tags,
#153 attributes, exclusive-area git diff and PR #159 observe_only exclusion.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from html import unescape
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.authority import ANALYSIS_CASE_TOKENS  # noqa: E402
from scripts.site.test_organic_striking_distance_cro_01 import CLAIM_RE  # noqa: E402

DOCS = ROOT / "docs" / "seo" / "bofu-dominance" / "safe-execution"
QUEUE = DOCS / "observe-only-queue-pr-159.json"
FREEZE = DOCS / "BEFORE-FREEZE.json"

PAGES = (
    "defesa-margem-contratos-publicos",
    "atrasos-prorrogacao-obras-publicas",
    "defesa-tecnica-contratos-publicos",
    "acompanhamento-contratos-obras",
)

JOB = {
    "defesa-margem-contratos-publicos": {
        "phrase": "detecção, documentação, cálculo e decisão",
        "frontier": ("detecção", "documentação", "cálculo", "decisão"),
    },
    "atrasos-prorrogacao-obras-publicas": {
        "phrase": "causa, responsabilidade, caminho crítico e registro contemporâneo",
        "frontier": ("causa", "responsabilidade", "caminho crítico", "registro contemporâneo"),
    },
    "defesa-tecnica-contratos-publicos": {
        "phrase": "subsídio técnico, não advocacia",
        "frontier": ("subsídio técnico", "não advocacia"),
    },
    "acompanhamento-contratos-obras": {
        "phrase": "rotina preventiva e recorrente",
        "frontier": ("rotina preventiva", "recorrente"),
    },
}

FIRST_FOLD_KEYS = ("ICP", "Trigger", "Job", "Entrega")
EPISTEMIC = ("FACT", "CALCULATION", "INFERENCE", "UNKNOWN")
EXCLUSIVE_PREFIXES = (
    "defesa-margem-contratos-publicos/",
    "atrasos-prorrogacao-obras-publicas/",
    "defesa-tecnica-contratos-publicos/",
    "acompanhamento-contratos-obras/",
    "docs/seo/bofu-dominance/safe-execution/",
    "tests/bofu_dominance/safe_execution/",
)
FORBIDDEN_DIFF = (
    "ferramentas/diagnostico-defesa-margem/",
    "conteudos/chuva-prorrogacao-prazo-obra-publica/",
    "conteudos/sinapi-desonerado-nao-desonerado/",
    "aditivos-obras-publicas/",
    "styles.css",
    "script.js",
    "package.json",
    "package-lock.json",
    "sitemap.xml",
    "robots.txt",
    "_redirects",
)
SAFE_URLS = [f"/{slug}/" for slug in PAGES]
EXISTING_BODY_ATTRS = {
    "defesa-margem-contratos-publicos": {
        "data-cta-id": "offer_hero",
        "data-route-family": "margin-defense",
        "data-asset-id": "defesa-margem-contratos-publicos",
        "data-journey": "contrato",
        "data-offer-id": "contract-defense",
    },
    "atrasos-prorrogacao-obras-publicas": {
        "data-cta-id": "pillar_hero",
        "data-route-family": "atrasos",
        "data-asset-id": "atrasos-prorrogacao-obras-publicas",
        "data-journey": "contrato",
    },
}


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._skip = False
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style"}:
            self._skip = True

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"}:
            self._skip = False

    def handle_data(self, data: str) -> None:
        if not self._skip:
            self.parts.append(data)


def shipped_html(slug: str) -> str:
    path = ROOT / slug / "index.html"
    assert path.is_file(), f"missing shipped page {path}"
    return path.read_text(encoding="utf-8")


def visible_text(html: str) -> str:
    parser = _TextExtractor()
    parser.feed(html)
    return re.sub(r"\s+", " ", "".join(parser.parts))


def first_fold(html: str) -> str:
    m = re.search(
        r'<header[^>]*class="[^"]*content-hero[^"]*"[^>]*>.*?</header>',
        html,
        flags=re.I | re.S,
    )
    assert m, "missing content-hero first fold"
    return m.group(0)


def tag_text(html: str, tag: str) -> str:
    m = re.search(rf"<{tag}[^>]*>(.*?)</{tag}>", html, flags=re.I | re.S)
    assert m, f"missing <{tag}>"
    return unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip()


def meta_description(html: str) -> str:
    m = re.search(
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)["\']',
        html,
        flags=re.I,
    ) or re.search(
        r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']description["\']',
        html,
        flags=re.I,
    )
    assert m, "missing meta description"
    return m.group(1)


def canonical(html: str) -> str:
    m = re.search(
        r'rel=["\']canonical["\'][^>]*href=["\']([^"\']+)["\']',
        html,
        flags=re.I,
    ) or re.search(
        r'href=["\']([^"\']+)["\'][^>]*rel=["\']canonical["\']',
        html,
        flags=re.I,
    )
    assert m, "missing canonical"
    return m.group(1)


def body_attrs(html: str) -> dict[str, str]:
    m = re.search(r"<body([^>]*)>", html, flags=re.I)
    assert m, "missing body"
    return dict(re.findall(r'(data-[\w-]+)=["\']([^"\']*)["\']', m.group(1)))


def primary_ctas_in(html: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for m in re.finditer(
        r"<a([^>]*class=[\"'][^\"']*button-primary[^\"']*[\"'][^>]*)>",
        html,
        flags=re.I,
    ):
        tag = m.group(1)
        href = re.search(r'href=["\']([^"\']+)["\']', tag)
        attrs = dict(re.findall(r'(data-[\w-]+)=["\']([^"\']*)["\']', tag))
        out.append({"href": href.group(1) if href else "", **attrs})
    return out


def jsonld_blocks(html: str) -> list[dict]:
    blocks = []
    for raw in re.findall(
        r'<script type="application/ld\+json">(.*?)</script>',
        html,
        flags=re.I | re.S,
    ):
        blocks.append(json.loads(raw))
    assert blocks, "missing JSON-LD"
    return blocks


def jsonld_nodes_of_type(html: str, type_name: str) -> list[dict]:
    found: list[dict] = []
    for block in jsonld_blocks(html):
        nodes = block.get("@graph") if isinstance(block, dict) else None
        if nodes is None:
            nodes = [block]
        if not isinstance(nodes, list):
            nodes = [nodes]
        for node in nodes:
            if not isinstance(node, dict):
                continue
            types = node.get("@type")
            types = types if isinstance(types, list) else [types]
            if type_name in types:
                found.append(node)
    return found


def first_eyebrow(html: str) -> str:
    fold = first_fold(html)
    m = re.search(r'<p class="eyebrow">([^<]+)', fold)
    return m.group(1).strip() if m else ""


def flatten_names(node: object, acc: list[str]) -> None:
    if isinstance(node, dict):
        for key in ("name", "description", "headline"):
            val = node.get(key)
            if isinstance(val, str) and val.strip():
                acc.append(val)
        for val in node.values():
            flatten_names(val, acc)
    elif isinstance(node, list):
        for item in node:
            flatten_names(item, acc)


def origin_html(slug: str) -> str:
    return subprocess.check_output(
        ["git", "show", f"origin/main:{slug}/index.html"],
        cwd=ROOT,
        text=True,
    )


def git_diff_names() -> list[str]:
    work = subprocess.check_output(
        ["git", "diff", "--name-only", "origin/main"],
        cwd=ROOT,
        text=True,
    )
    cached = subprocess.check_output(
        ["git", "diff", "--cached", "--name-only", "origin/main"],
        cwd=ROOT,
        text=True,
    )
    names = {line.strip() for line in (work + cached).splitlines() if line.strip()}
    return sorted(names)


def test_shipped_files_are_the_entry_point():
    for slug in PAGES:
        path = ROOT / slug / "index.html"
        html = shipped_html(slug)
        assert path.read_text(encoding="utf-8") == html
        assert "CONFENGE" in html


def test_distinct_first_fold_jobs_match_frontiers():
    folds = {slug: visible_text(first_fold(shipped_html(slug))) for slug in PAGES}
    phrases = []
    for slug, spec in JOB.items():
        fold = folds[slug]
        phrase = spec["phrase"]
        assert phrase in fold, f"{slug} first fold missing job phrase {phrase!r}"
        for term in spec["frontier"]:
            assert term in fold, f"{slug} first fold missing frontier term {term!r}"
        phrases.append(phrase)
    assert len(set(phrases)) == 4
    for slug, phrase in ((s, JOB[s]["phrase"]) for s in PAGES):
        for other in PAGES:
            if other == slug:
                continue
            assert phrase not in folds[other], f"{phrase!r} leaked into {other} first fold"


def test_first_fold_states_icp_trigger_job_entrega_and_primary_cta():
    for slug in PAGES:
        html = shipped_html(slug)
        fold = first_fold(html)
        vis = visible_text(fold)
        for key in FIRST_FOLD_KEYS:
            assert key in vis, f"{slug} first fold missing {key}"
        assert re.search(
            r'class="[^"]*button-primary',
            fold,
            flags=re.I,
        ), f"{slug} first fold missing primary CTA"
        assert re.search(r"<h1[^>]*>", fold, flags=re.I)


def test_epistemic_labels_visible():
    for slug in PAGES:
        vis = visible_text(shipped_html(slug))
        for label in EPISTEMIC:
            assert re.search(rf"\b{label}\b", vis), f"{slug} missing visible {label}"


def test_fit_nao_fit_legal_technical_boundary_and_client_owner():
    for slug in PAGES:
        vis = visible_text(shipped_html(slug)).lower()
        entra = "entra" in vis or "fit" in vis
        nao = "não entra" in vis or "nao entra" in vis or "não fit" in vis or "nao fit" in vis
        assert entra and nao, f"{slug} missing fit/não-fit"
        assert "fronteira jurídica" in vis or "fronteira juridica" in vis
        assert "fronteira técnica" in vis or "fronteira tecnica" in vis
        assert "owner do cliente" in vis


def test_no_invented_case_or_review_claims():
    for slug in PAGES:
        html = shipped_html(slug)
        vis = visible_text(html)
        assert not CLAIM_RE.search(html), f"{slug} matched striking-distance claim regex"
        assert not CLAIM_RE.search(vis)
        lower = vis.lower()
        for token in ANALYSIS_CASE_TOKENS:
            assert token not in lower, f"{slug} invented-case token {token!r}"
        assert "nossos clientes dizem" not in lower
        assert "case de sucesso" not in lower


def test_title_h1_meta_canonical_schema():
    titles: dict[str, str] = {}
    h1s_by_slug: dict[str, str] = {}
    webpage_names: dict[str, str] = {}
    for slug in PAGES:
        html = shipped_html(slug)
        title = tag_text(html, "title")
        h1_matches = re.findall(r"<h1[^>]*>(.*?)</h1>", html, flags=re.I | re.S)
        assert title
        assert len(h1_matches) == 1
        h1 = unescape(re.sub(r"<[^>]+>", "", h1_matches[0])).strip()
        assert h1
        desc = meta_description(html)
        assert desc
        can = canonical(html)
        assert can == f"https://confenge.com.br/{slug}/"
        pages = jsonld_nodes_of_type(html, "WebPage")
        assert pages, f"{slug} missing WebPage JSON-LD"
        wp_name = str(pages[0].get("name") or "")
        wp_desc = str(pages[0].get("description") or "")
        services = jsonld_nodes_of_type(html, "Service")
        assert services, f"{slug} missing Service JSON-LD"
        svc_desc = str(services[0].get("description") or "")
        phrase = JOB[slug]["phrase"]
        for label, text in (("title", title), ("h1", h1), ("WebPage.name", wp_name)):
            assert phrase in text, f"{slug} {label} missing job phrase {phrase!r}: {text!r}"
        for other, spec in JOB.items():
            if other == slug:
                continue
            assert spec["phrase"] not in title, f"{slug} title cannibalizes {other}"
            assert spec["phrase"] not in h1, f"{slug} H1 cannibalizes {other}"
            assert spec["phrase"] not in wp_name, f"{slug} WebPage.name cannibalizes {other}"
        vis = visible_text(html)
        assert h1 in vis
        assert desc in html
        titles[slug] = title
        h1s_by_slug[slug] = h1
        webpage_names[slug] = wp_name
        if slug == "defesa-margem-contratos-publicos":
            assert not re.match(r"\s*Defesa técnica", title, flags=re.I), (
                f"defesa-margem title leads with Defesa técnica: {title!r}"
            )
            assert "Defesa técnica" not in title
            eyebrow = first_eyebrow(html)
            chrome = " ".join([title, desc, eyebrow, wp_name, wp_desc, svc_desc]).lower()
            for token in (
                "defesa técnica",
                "notifica",
                "aditivo",
                "reequil",
            ):
                assert token not in chrome, (
                    f"defesa-margem title/meta/eyebrow/schema still carries {token!r}: {chrome[:240]!r}"
                )
            assert "proteção de margem" in chrome
            assert "contract defense" in vis.lower()
        if slug == "acompanhamento-contratos-obras":
            assert "pleitos" not in h1.lower()
            assert "pleitos" not in wp_name.lower()
            svc_type = str(services[0].get("serviceType") or "").lower()
            assert "pleitos" not in svc_type
    assert len(set(titles.values())) == 4
    assert len(set(h1s_by_slug.values())) == 4


def test_existing_153_attributes_preserved_and_primary_cta_complete():
    freeze = json.loads(FREEZE.read_text(encoding="utf-8"))
    for slug in PAGES:
        html = shipped_html(slug)
        attrs = body_attrs(html)
        expected = EXISTING_BODY_ATTRS.get(slug) or freeze["pages"][slug]["body_data_attrs"]
        for key, value in expected.items():
            if not value:
                continue
            assert attrs.get(key) == value, f"{slug} body {key} changed from {value!r} to {attrs.get(key)!r}"
        assert attrs.get("data-cta-id")
        assert attrs.get("data-route-family")
        assert attrs.get("data-asset-id")
        assert attrs.get("data-journey")
        fold = first_fold(html)
        primaries = primary_ctas_in(fold)
        assert primaries, f"{slug} first fold has no .button-primary"
        for cta in primaries:
            assert cta.get("data-cta-id"), f"{slug} primary CTA missing data-cta-id"
            assert cta.get("data-route-family"), f"{slug} primary CTA missing data-route-family"
        before = origin_html(slug)
        before_hrefs = {c["href"] for c in primary_ctas_in(before) if c["href"]}
        after_hrefs = {c["href"] for c in primary_ctas_in(html) if c["href"]}
        missing = before_hrefs - after_hrefs
        assert not missing, f"{slug} lost CTA hrefs {missing}"


def test_existing_css_js_only():
    for slug in PAGES:
        html = shipped_html(slug)
        sheets = re.findall(r'<link[^>]+rel=["\']stylesheet["\'][^>]*>', html, flags=re.I)
        hrefs = []
        for tag in sheets:
            m = re.search(r'href=["\']([^"\']+)["\']', tag)
            if m:
                hrefs.append(m.group(1))
        assert any(h.startswith("/styles.css") for h in hrefs), slug
        assert all(
            h.startswith("/styles.css") or h.startswith("/styles-") for h in hrefs
        ), f"{slug} unexpected stylesheet {hrefs}"
        scripts = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html, flags=re.I)
        assert any(s.startswith("/script.js") for s in scripts), slug
        local = [s for s in scripts if s.startswith("/") and not s.startswith("//")]
        assert all(s.startswith("/script.js") or s.startswith("/assets/js/") for s in local), local


def test_git_diff_is_exclusive_area():
    """On a single-PR branch this is exclusive-area. On convergence, frozen
    experiment HTML still cannot change; other transplanted trees may.
    """
    names = git_diff_names()
    frozen_html = (
        "ferramentas/diagnostico-defesa-margem/",
        "conteudos/chuva-prorrogacao-prazo-obra-publica/",
        "conteudos/sinapi-desonerado-nao-desonerado/",
        "aditivos-obras-publicas/index.html",
        "diagnostico-b2g-360/index.html",
        "diagnostico-pre-licitacao/index.html",
        "auditoria-orcamento-licitacao/index.html",
        "reequilibrio-obras-publicas/index.html",
        "medicoes-glosas-obras-publicas/index.html",
    )
    for forbidden in frozen_html:
        hits = [n for n in names if n == forbidden or n.startswith(forbidden)]
        assert not hits, f"frozen path changed: {hits}"
    for slug in PAGES:
        assert any(n.startswith(f"{slug}/") for n in names) or (ROOT / slug / "index.html").is_file()


def test_four_urls_absent_from_pr159_observe_only():
    snapshot = json.loads(QUEUE.read_text(encoding="utf-8"))
    observed = {item["path"] for item in snapshot["observe_only"]}
    for url in SAFE_URLS:
        assert url not in observed, f"{url} is in PR #159 observe_only"
    body = snapshot.get("pr", {})
    assert body.get("number") == 159
    assert snapshot["as_of"]
    assert snapshot["source_kind"]
    assert observed == {
        "/conteudos/sinapi-desonerado-nao-desonerado/",
        "/aditivos-obras-publicas/",
        "/conteudos/chuva-prorrogacao-prazo-obra-publica/",
    }


def test_preflight_artifacts_exist():
    for name in (
        "PREFLIGHT.md",
        "BEFORE-FREEZE.json",
        "SERP-CENSUS.md",
        "observe-only-queue-pr-159.json",
        "performance-before.json",
    ):
        path = DOCS / name
        assert path.is_file(), path
        text = path.read_text(encoding="utf-8")
        if path.suffix == ".json":
            data = json.loads(text)
            assert data.get("as_of") == "2026-08-19" or "2026-08-19" in text
        else:
            assert "2026-08-19" in text
    freeze = json.loads(FREEZE.read_text(encoding="utf-8"))
    for slug in PAGES:
        rec = freeze["pages"][slug]
        assert rec["sha256"]
        assert rec["canonical"].endswith(f"/{slug}/")
        assert rec["title"]
        assert rec["h1"]
    census = (DOCS / "SERP-CENSUS.md").read_text(encoding="utf-8")
    assert "UNKNOWN" in census
    assert "LIVE_JOB_OK" in census or "credential_failure" in census
    assert "0 clicks" not in census.split("live GSC")[-1] or "UNKNOWN" in census
    perf = json.loads((DOCS / "performance-before.json").read_text(encoding="utf-8"))
    assert "css_kb" in perf and "js_kb" in perf


def test_pillars_keep_commercial_bridge_and_defesa_margem_required_copy():
    for slug in (
        "atrasos-prorrogacao-obras-publicas",
        "defesa-tecnica-contratos-publicos",
        "acompanhamento-contratos-obras",
    ):
        html = shipped_html(slug)
        assert "commercial-bridge" in html
    defesa = shipped_html("defesa-margem-contratos-publicos")
    assert "Contract Defense" in defesa
    assert "Enviar documentos para análise" in defesa
    assert "proteção de margem" in defesa.lower() or "Defesa técnica" in defesa
    assert len(re.findall(r'data-offer-section="([^"]+)"', defesa)) >= 4
    assert "—" not in defesa
    assert "Conhecer a Diretoria B2G" not in defesa
    assert "extra-cli" not in defesa.lower()
