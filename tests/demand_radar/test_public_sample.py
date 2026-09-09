"""The public radar page may only promise what it actually delivers.

Five defects were live on `/radar/nacional-obras-publicas/` and each one is
pinned here with the property that forbids it plus an executable counter-case,
so a regression fails instead of passing quietly:

1. the entity layer (title, h1, og:title, schema.org Dataset, breadcrumb leaf)
   advertised a *national* radar of public works and contract margin without a
   published national series;
2. the coverage window and the denominator were never disclosed -- the page
   cited only the export id, and the published JSON restamped a 15-day
   aggregate as a single-day observation;
3. the served PDF was a pre-correction render, so a download contradicted the
   page it was downloaded from;
4. the parent `/radar/` never linked down to the child it is the breadcrumb
   parent of;
5. the page and its parent exposed a six-row inventory of unpublished cuts and
   their maturity state instead of explaining the value of the evidence that
   is actually available.

The URL and the canonical are deliberately untouched: an established URL is not
renamed to improve a label.
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

import pytest

from scripts.demand_radar.public_sample import (
    ATTRIBUTION_WARNING,
    EXPORT_DATE,
    EXPORT_ID,
    ObservedWindow,
    check,
    dimension_totals,
    download_hrefs,
    observed_window,
    saved_filter_label,
)

ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / "radar" / "nacional-obras-publicas" / "index.html"
HUB = ROOT / "radar" / "index.html"
HUB_GENERATOR = ROOT / "scripts" / "pseo" / "build.py"
SAMPLE = ROOT / "radar" / "nacional-obras-publicas" / "gsc-demand-sample.json"
REGISTRY = ROOT / "data" / "organic" / "public-family-registry.json"

# The claim the page cannot support: a national series of public-works
# contracts and contractual margin. The published evidence is the method and
# first-party search demand, so the words may not appear in the entity layer.
UNDELIVERED_PROMISE = re.compile(r"nacion(?:al|ais)|margem contratual", re.IGNORECASE)


def _page() -> str:
    return PAGE.read_text(encoding="utf-8")


def entity_layer(html: str) -> dict[str, str]:
    """Everything that names the page to a machine or to a search result."""
    layer: dict[str, str] = {}
    title = re.search(r"(?is)<title>(.*?)</title>", html)
    if title:
        layer["title"] = title.group(1)
    h1 = re.search(r"(?is)<h1[^>]*>(.*?)</h1>", html)
    if h1:
        layer["h1"] = re.sub(r"(?s)<[^>]+>", "", h1.group(1))
    og = re.search(r'(?is)<meta\s+property="og:title"\s+content="([^"]*)"', html)
    if og:
        layer["og:title"] = og.group(1)
    for block in re.findall(
        r'(?is)<script type="application/ld\+json">(.*?)</script>', html
    ):
        data = json.loads(block)
        if data.get("@type") == "Dataset":
            layer["dataset.name"] = data["name"]
            layer["dataset.description"] = data["description"]
        if data.get("@type") == "BreadcrumbList":
            layer["breadcrumb.leaf"] = data["itemListElement"][-1]["name"]
    crumb = re.search(r'(?is)<li aria-current="page">(.*?)</li>', html)
    if crumb:
        layer["breadcrumb.visible"] = crumb.group(1)
    return layer


# --------------------------------------------------------------------------
# 1. The entity layer matches what is delivered
# --------------------------------------------------------------------------


def test_page_explains_published_value_without_a_maturity_inventory() -> None:
    html = _page().lower()
    assert "em prepara" not in html
    assert "recortes planejados" not in html
    assert "como usar esta leitura" in html
    assert "priorizar a revisão do orçamento ou do contrato" in html
    for internal_label in (
        "long-tail",
        "striking distance",
        "entidade legada",
        "guest posts",
        "releases só",
        "página (path)",
    ):
        assert internal_label not in html
    assert "taxa de cliques (ctr)" in html
    assert "busca específica com baixa visibilidade" in html
    assert "artigos convidados" in html


def test_hub_generator_and_rendered_hub_share_the_same_public_property() -> None:
    generator = HUB_GENERATOR.read_text(encoding="utf-8").lower()
    hub = HUB.read_text(encoding="utf-8").lower()
    for text in (generator, hub):
        assert "recortes nacionais de contratos seguem" not in text
        assert "nenhum deles está publicado" not in text
        assert "limites da amostra" in text
        assert "perfil da empresa" in text


def test_public_surface_gate_rejects_the_known_pending_inventory_paraphrases() -> None:
    # This is a bounded regression check for the observed family of wording;
    # it does not claim universal semantic interpretation.
    from scripts.site.public_surface_coverage import semantic_fixture_findings

    bad = (
        "<main><h1>Radar</h1><h2>Recortes planejados</h2>"
        "<p>Onde a série contratual ainda não foi revisada, o campo aparece "
        "em preparação.</p></main>"
    )
    assert "publication_backstage" in semantic_fixture_findings(bad, "/radar/")
    assert "publication_backstage" not in semantic_fixture_findings(
        _page(), "/radar/nacional-obras-publicas/"
    )


def test_entity_layer_does_not_promise_the_undelivered_national_series() -> None:
    html = _page()
    layer = entity_layer(html)
    # description is prose that may legitimately *deny* a national claim; the
    # naming fields may not make one.
    named = {k: v for k, v in layer.items() if k != "dataset.description"}
    assert set(named) >= {
        "title",
        "h1",
        "og:title",
        "dataset.name",
        "breadcrumb.leaf",
        "breadcrumb.visible",
    }
    offenders = {k: v for k, v in named.items() if UNDELIVERED_PROMISE.search(v)}
    assert not offenders, (
        "the entity layer promises a national contract/margin series that the "
        f"published evidence does not support: {offenders}"
    )


def test_counter_case_the_old_national_title_fails_this_rule() -> None:
    offenders = {
        k: v
        for k, v in entity_layer(
            "<title>Radar Nacional de Obras Públicas e Margem Contratual | CONFENGE"
            "</title><h1>Radar Nacional de Obras Públicas e Margem Contratual</h1>"
        ).items()
        if UNDELIVERED_PROMISE.search(v)
    }
    assert set(offenders) == {"title", "h1"}


def test_url_and_canonical_are_not_renamed_with_the_label() -> None:
    html = _page()
    assert (
        '<link rel="canonical" href="https://confenge.com.br/radar/'
        'nacional-obras-publicas/"/>' in html
    )
    assert PAGE.is_file()


def test_registry_visitor_job_matches_the_renamed_entity() -> None:
    families = json.loads(REGISTRY.read_text(encoding="utf-8"))["families"]
    radar = next(f for f in families if f["id"] == "radar")
    job = radar["visitor_job"]
    assert not re.search(r"radar nacional", job, re.IGNORECASE), job
    assert "em prepara" not in job, job
    assert "demanda" in job.lower(), job
    assert "limites da amostra" in job.lower(), job


# --------------------------------------------------------------------------
# 2. Window and denominator are disclosed and recomputed
# --------------------------------------------------------------------------


def test_window_is_recomputed_from_the_daily_series() -> None:
    window = observed_window()
    assert window == ObservedWindow(
        start="2026-07-14", end="2026-07-28", days=15, clicks=10, impressions=325
    )


def test_saved_filter_label_is_not_the_observed_window() -> None:
    """The export's own filter overstates coverage by an order of magnitude."""
    assert saved_filter_label() == "Últimos 3 meses"
    assert observed_window().days == 15


def test_page_states_the_window_and_the_domain_denominator() -> None:
    html = _page()
    for token in ("2026-07-14", "2026-07-28", "325", "15 dias"):
        assert token in html, token
    assert EXPORT_ID in html


def test_dimension_tables_do_not_reconcile_and_the_page_says_so() -> None:
    totals = dimension_totals()
    assert totals["pages"] == {"rows": 59, "clicks": 10, "impressions": 364}
    assert totals["queries"] == {"rows": 20, "clicks": 0, "impressions": 54}
    assert totals["pages"]["impressions"] > observed_window().impressions
    html = _page()
    assert "364" in html and "54" in html


def test_no_published_row_is_restamped_as_a_daily_observation() -> None:
    sample = json.loads(SAMPLE.read_text(encoding="utf-8"))
    assert sample["observed_period"]["start"] == "2026-07-14"
    assert sample["observed_period"]["end"] == "2026-07-28"
    assert sample["property_totals_in_period"]["impressions"] == 325
    rows = sample["top_queries"]
    assert rows
    for row in rows:
        assert "date" not in row, row
        assert row["period_start"] == "2026-07-14"
        assert row["period_end"] == "2026-07-28"


def test_published_artifacts_agree_with_the_export() -> None:
    assert check(ROOT) == []


def test_export_date_is_derived_not_echoed_from_the_artifact() -> None:
    """The one field a stale artifact would most plausibly lie about.

    `as_of` used to be copied out of the file being checked, so a wrong export
    date reproduced itself through every regeneration and still compared equal.
    It now comes off the export id, and the export cannot predate the last day
    it reports.
    """
    sample = json.loads(SAMPLE.read_text(encoding="utf-8"))
    assert EXPORT_DATE == "2026-07-30"
    assert EXPORT_ID.endswith(EXPORT_DATE)
    assert sample["as_of"] == EXPORT_DATE
    assert EXPORT_DATE >= observed_window().end
    assert sample["attribution_warning"] == ATTRIBUTION_WARNING


# --------------------------------------------------------------------------
# Counter-cases: the checker has to fail when the defect is reintroduced
# --------------------------------------------------------------------------


@pytest.fixture()
def sandbox(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    (root / "seo").mkdir(parents=True)
    shutil.copytree(ROOT / "seo" / "gsc-2026-07-30", root / "seo" / "gsc-2026-07-30")
    shutil.copytree(
        ROOT / "radar" / "nacional-obras-publicas",
        root / "radar" / "nacional-obras-publicas",
    )
    assert check(root) == []
    return root


def test_counter_case_restamping_rows_with_a_date_fails(sandbox: Path) -> None:
    path = sandbox / "radar" / "nacional-obras-publicas" / "gsc-demand-sample.json"
    sample = json.loads(path.read_text(encoding="utf-8"))
    for row in sample["top_queries"]:
        row.pop("period_start", None)
        row.pop("period_end", None)
        row["date"] = "2026-07-30"
    path.write_text(json.dumps(sample, ensure_ascii=False, indent=2) + "\n", "utf-8")
    problems = check(sandbox)
    assert any("single-day observation" in p for p in problems), problems


def test_counter_case_dropping_the_denominator_from_the_page_fails(
    sandbox: Path,
) -> None:
    path = sandbox / "radar" / "nacional-obras-publicas" / "index.html"
    path.write_text(path.read_text(encoding="utf-8").replace("325", "muitas"), "utf-8")
    problems = check(sandbox)
    assert any("impressions denominator" in p for p in problems), problems


def test_counter_case_hiding_the_window_from_the_page_fails(sandbox: Path) -> None:
    path = sandbox / "radar" / "nacional-obras-publicas" / "index.html"
    path.write_text(path.read_text(encoding="utf-8").replace("2026-07-14", ""), "utf-8")
    problems = check(sandbox)
    assert any("observed window start" in p for p in problems), problems


def test_counter_case_a_wrong_export_date_fails(sandbox: Path) -> None:
    path = sandbox / "radar" / "nacional-obras-publicas" / "gsc-demand-sample.json"
    sample = json.loads(path.read_text(encoding="utf-8"))
    sample["as_of"] = "2026-08-31"
    path.write_text(json.dumps(sample, ensure_ascii=False, indent=2) + "\n", "utf-8")
    problems = check(sandbox)
    assert any("was pulled on" in p for p in problems), problems


def test_counter_case_softening_the_attribution_warning_fails(sandbox: Path) -> None:
    path = sandbox / "radar" / "nacional-obras-publicas" / "gsc-demand-sample.json"
    sample = json.loads(path.read_text(encoding="utf-8"))
    sample["attribution_warning"] = "Search Console data."
    path.write_text(json.dumps(sample, ensure_ascii=False, indent=2) + "\n", "utf-8")
    problems = check(sandbox)
    assert any("attribution warning was altered" in p for p in problems), problems


def test_counter_case_a_stale_sample_that_ignores_the_export_fails(
    sandbox: Path,
) -> None:
    path = sandbox / "radar" / "nacional-obras-publicas" / "gsc-demand-sample.json"
    sample = json.loads(path.read_text(encoding="utf-8"))
    sample["property_totals_in_period"]["impressions"] = 99999
    path.write_text(json.dumps(sample, ensure_ascii=False, indent=2) + "\n", "utf-8")
    problems = check(sandbox)
    assert any("is not what" in p for p in problems), problems


# --------------------------------------------------------------------------
# 3. No download the repository cannot verify
# --------------------------------------------------------------------------


def test_the_stale_pdf_is_neither_served_nor_linked() -> None:
    assert not (ROOT / "radar" / "nacional-obras-publicas" / "radar-nacional.pdf").exists()
    assert ".pdf" not in _page()


def test_every_offered_download_exists_and_is_machine_checkable() -> None:
    hrefs = download_hrefs(_page())
    assert hrefs, "the page must still offer the PII-free JSON sample"
    for href in hrefs:
        target = ROOT / href.lstrip("/")
        assert target.is_file(), href
        assert target.suffix == ".json", href


def test_counter_case_readding_an_unverifiable_pdf_fails(sandbox: Path) -> None:
    public = sandbox / "radar" / "nacional-obras-publicas"
    (public / "radar-nacional.pdf").write_bytes(b"%PDF-1.4\n% stale render\n")
    page = public / "index.html"
    page.write_text(
        page.read_text(encoding="utf-8").replace(
            '<a class="button button-secondary" href="/radar/nacional-obras-publicas/'
            'gsc-demand-sample.json">',
            '<a class="button button-secondary" href="/radar/nacional-obras-publicas/'
            'radar-nacional.pdf">Download PDF</a>\n'
            '<a class="button button-secondary" href="/radar/nacional-obras-publicas/'
            'gsc-demand-sample.json">',
        ),
        "utf-8",
    )
    problems = check(sandbox)
    assert any("no gate in this repository can" in p for p in problems), problems


def test_counter_case_a_link_to_a_missing_file_fails(sandbox: Path) -> None:
    page = sandbox / "radar" / "nacional-obras-publicas" / "index.html"
    page.write_text(
        page.read_text(encoding="utf-8").replace(
            "gsc-demand-sample.json", "gsc-demand-sample-v9.json"
        ),
        "utf-8",
    )
    problems = check(sandbox)
    assert any("not in the repo" in p for p in problems), problems


# --------------------------------------------------------------------------
# 4. The breadcrumb parent links down
# --------------------------------------------------------------------------


def test_radar_hub_links_down_to_the_page_that_points_up_to_it() -> None:
    child = _page()
    assert '"item":"https://confenge.com.br/radar/"' in child
    assert '<a href="/radar/">Radar</a>' in child

    hub = HUB.read_text(encoding="utf-8")
    assert 'href="/radar/nacional-obras-publicas/"' in hub, (
        "/radar/ is the declared breadcrumb parent but never links to its child"
    )
    # The link has to describe the value of the published evidence, rather than
    # expose an inventory of future cuts or re-promise a national series.
    section = hub[hub.index('href="/radar/nacional-obras-publicas/"') :][:1400]
    assert "em prepara" not in section
    assert "2026-07-14" in section and "325" in section
    assert "perfil da empresa" in section
