"""Drive shipped HTML of the orçamento/BDI/SINAPI cluster (CFG10X-08)."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.organic.orcamento_cluster import (  # noqa: E402
    CLUSTER_SLUGS,
    CONCEPT_MARKERS,
    dump_json,
    extract_example,
    jsonld_types,
    load_inventory,
    page_path,
    parse_canonical,
    parse_h1,
    parse_meta,
    parse_title,
    read_shipped_html,
    recompute_formula,
    similarity_matrix,
    strip_shell,
)
from scripts.organic.service_map import (  # noqa: E402
    extract_bridge_service,
    html_has_commercial_bridge,
    map_content_to_service,
)
from scripts.organic.sinapi_snippet import evaluate_sinapi_snippet  # noqa: E402

PRIMARY_HOSTS = (
    "planalto.gov.br",
    "caixa.gov.br",
    "gov.br",
    "tcu.gov.br",
    "licitacoesecontratos.tcu.gov.br",
)
STUFFING = (
    "guia prático:",
    "documentos, erros e próximo passo",
    "cluster orçamento",
)
BOILERPLATE_NEEDLES = (
    "boilerplate residual",
    "slug-stuffed answer mold",
    "WA slug-stuffed label",
)


def _inventory_rows() -> dict[str, dict]:
    payload = load_inventory()
    rows = {row["slug"]: row for row in payload["urls"]}
    assert set(rows) == set(CLUSTER_SLUGS)
    return rows


def test_inventory_covers_nine_keep_urls():
    rows = _inventory_rows()
    report = []
    for slug, row in rows.items():
        assert row["disposition"] == "KEEP"
        assert row["distinct_problem"] is True
        assert row["path"] == f"/conteudos/{slug}/"
        assert row["intent"].strip()
        assert row["query"].strip()
        assert row["funnel_stage"] in {"TOFU", "MOFU", "BOFU"}
        assert row["owns_concept"] in CONCEPT_MARKERS
        html = read_shipped_html(slug)
        robots = parse_meta(html, "robots").lower()
        assert "noindex" not in robots
        report.append(row)
    dump_json("cluster-inventory.json", {"urls": report, "disposition": "KEEP_ALL"})


def test_pairwise_similarity_under_15_percent():
    matrix = similarity_matrix()
    dump_json("cluster-similarity.json", matrix)
    offenders = [pair for pair in matrix["pairs"] if pair["similarity"] >= 0.15]
    assert not offenders, offenders
    assert matrix["worst"] < 0.15


def test_exclusive_examples_recompute_from_shipped_html():
    seen_ids: set[str] = set()
    seen_payloads: set[tuple] = set()
    report = []
    for slug in CLUSTER_SLUGS:
        html = read_shipped_html(slug)
        example = extract_example(html)
        assert example["id"], slug
        assert example["id"] not in seen_ids, example["id"]
        seen_ids.add(example["id"])
        assert example["formula"]
        assert example["inputs"], slug
        assert example["fonte_url"]
        host = urlparse(example["fonte_url"]).netloc.lower()
        assert any(host == allowed or host.endswith("." + allowed) for allowed in PRIMARY_HOSTS), host
        assert re.match(r"\d{4}-\d{2}-\d{2}$", example["fonte_date"]), example["fonte_date"]
        recomputed = recompute_formula(example["formula"], example["inputs"])
        assert recomputed == pytest.approx(example["result"], rel=1e-9, abs=1e-6), (
            slug,
            example["formula"],
            example["inputs"],
            recomputed,
            example["result"],
        )
        visible = strip_shell(html)
        assert example["formula"].split("(")[0][:8] in html
        key = (
            example["formula"],
            tuple(sorted(example["inputs"].items())),
            round(example["result"], 6),
        )
        assert key not in seen_payloads, key
        seen_payloads.add(key)
        report.append(
            {
                "page": f"/conteudos/{slug}/",
                "id": example["id"],
                "formula": example["formula"],
                "inputs": example["inputs"],
                "recomputed": recomputed,
                "stated_result": example["result"],
                "unit": example["unit"],
                "fonte_url": example["fonte_url"],
                "fonte_date": example["fonte_date"],
            }
        )
    dump_json("cluster-calculations.json", {"examples": report})


def test_metadata_canonical_schema_and_cta():
    rows = _inventory_rows()
    for slug, row in rows.items():
        html = read_shipped_html(slug)
        title = parse_title(html)
        desc = parse_meta(html, "description")
        h1 = parse_h1(html)
        canonical = parse_canonical(html)
        assert title.endswith("| CONFENGE") or slug == "matriz-de-riscos-reequilibrio-economico-financeiro"
        core = re.sub(r"\s*\|\s*CONFENGE\s*$", "", title).strip()
        assert 20 <= len(core) <= 72, (slug, len(core), core)
        assert desc
        assert 50 <= len(desc) <= 170, (slug, len(desc), desc)
        folded = desc.lower()
        for needle in STUFFING:
            assert needle not in folded, (slug, needle)
        hyphen_slug = slug.replace("-", " ")
        assert folded.count(hyphen_slug) <= 1
        assert h1
        expected = f"https://confenge.com.br/conteudos/{slug}/"
        assert canonical.rstrip("/") == expected.rstrip("/")
        types = jsonld_types(html)
        assert "Article" in types, slug
        assert "FAQPage" in types, slug
        assert "BreadcrumbList" in types, slug
        assert "wa.me/5548988344559" in html
        assert re.search(r'href="/\?[^"]*origem=/conteudos/' + re.escape(slug), html)
        assert html_has_commercial_bridge(html)
        mapped = map_content_to_service(f"/conteudos/{slug}/")
        assert mapped["cluster_id"] == row["cluster_id"]
        assert extract_bridge_service(html) == row["service_path"]
        body = strip_shell(html).lower()
        for concept, markers in CONCEPT_MARKERS.items():
            assert any(marker in body for marker in markers), (slug, concept)


def test_sinapi_snippet_contract_stays_green():
    html = read_shipped_html("sinapi-desonerado-nao-desonerado")
    report = evaluate_sinapi_snippet(html)
    assert report["ok"], report["fails"]


def test_validate_seo_log_has_no_cluster_boilerplate(tmp_path):
    """Drive the real validator against the repo; cluster warnings fail."""
    import subprocess

    proc = subprocess.run(
        [sys.executable, str(ROOT / "seo" / "scripts" / "validate_seo.py")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    log = (proc.stdout or "") + (proc.stderr or "")
    dump_path = dump_json("validate-seo-meta.json", {"returncode": proc.returncode})
    report_dir = dump_path.parent if dump_path else tmp_path
    (report_dir / "validate-seo.log").write_text(log, encoding="utf-8")
    assert proc.returncode == 0, log[-4000:]
    assert "VALIDATION_OK" in log
    for slug in CLUSTER_SLUGS:
        assert f"boilerplate residual {slug}" not in log
        assert f"slug-stuffed answer mold {slug}" not in log
        assert f"WA slug-stuffed label {slug}" not in log
