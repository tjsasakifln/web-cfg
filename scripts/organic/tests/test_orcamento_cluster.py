"""Drive shipped HTML of the orçamento/BDI/SINAPI cluster (CFG10X-08)."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

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
from scripts.site.public_copy_scope import visible_text  # noqa: E402

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
REVALIDATED_SOURCE_IDS = {
    "lei-14133-art23",
    "lei-14133-art25-s7",
    "lei-14133-art59",
    "lei-14133-art103",
    "lei-14133-orcamento-cluster-20260829",
    "sinapi-caixa-metodologia-20260829",
    "sinapi-caixa-calculos-parametros-20260829",
    "sicro-dnit-metodologia-20260829",
    "tcu-sumula-253-20260829",
}


def _inventory_rows() -> dict[str, dict]:
    payload = load_inventory()
    rows = {row["slug"]: row for row in payload["urls"]}
    assert set(rows) == set(CLUSTER_SLUGS)
    return rows


def test_inventory_covers_nine_keep_urls():
    rows = _inventory_rows()
    source_manifest = json.loads(
        (ROOT / "data" / "editorial" / "SOURCE-MANIFEST.json").read_text(encoding="utf-8")
    )
    sources = {row["source_id"]: row for row in source_manifest["sources"]}
    report = []
    for slug, row in rows.items():
        assert row["disposition"] == "KEEP"
        assert row["distinct_problem"] is True
        assert row["path"] == f"/conteudos/{slug}/"
        assert row["intent"].strip()
        assert row["query"].strip()
        assert row["funnel_stage"] in {"TOFU", "MOFU", "BOFU"}
        assert row["owns_concept"] in CONCEPT_MARKERS
        assert row["source_ids"]
        assert set(row["source_ids"]) <= REVALIDATED_SOURCE_IDS
        html = read_shipped_html(slug)
        robots = parse_meta(html, "robots").lower()
        assert "noindex" not in robots
        linked_hosts = {
            urlparse(url).netloc.lower()
            for url in re.findall(r'href=["\'](https?://[^"\']+)', html)
        }
        for source_id in row["source_ids"]:
            assert source_id in sources
            assert urlparse(sources[source_id]["url"]).netloc.lower() in linked_hosts, (
                slug,
                source_id,
            )
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
        assert example["source_reference"], slug
        assert example["accessed_at"] == "2026-08-29", (slug, example["accessed_at"])
        assert example["premise_kind"] == "synthetic", slug
        assert example["official_competence"] == "not-applicable", slug
        assert example["locality"] == "not-applicable", slug
        assert example["charges_basis"] == "not-applicable", slug
        assert "Premissa" in example["html"]
        assert "premissas sintéticas" in example["html"]
        assert "competência oficial, localidade e base oficial de encargos não se aplicam" in example["html"]
        assert '<p class="example-limit"><strong>Limite.</strong>' in example["html"]
        recomputed = recompute_formula(example["formula"], example["inputs"])
        assert recomputed == example["result"], (
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
            example["result"],
        )
        assert key not in seen_payloads, key
        seen_payloads.add(key)
        report.append(
            {
                "page": f"/conteudos/{slug}/",
                "id": example["id"],
                "formula": example["formula"],
                "inputs": {
                    name: format(value, "f")
                    for name, value in example["inputs"].items()
                },
                "recomputed": format(recomputed, "f"),
                "stated_result": format(example["result"], "f"),
                "unit": example["unit"],
                "fonte_url": example["fonte_url"],
                "source_reference": example["source_reference"],
                "accessed_at": example["accessed_at"],
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
        assert 'property="article:modified_time"' in html
        modified_meta = re.search(
            r'<meta\b(?=[^>]*property=["\']article:modified_time["\'])(?=[^>]*content=["\']([^"\']+)["\'])[^>]*>',
            html,
            flags=re.I,
        )
        assert modified_meta and modified_meta.group(1) == "2026-08-29", slug
        assert '"dateModified":"2026-08-29"' in html or '"dateModified": "2026-08-29"' in html
        assert 'datetime="2026-08-29">29 de agosto de 2026</time>' in html
        assert re.search(
            r'<p class="sources-reviewed">.*?datetime="2026-08-29".*?</p>',
            html,
            flags=re.S,
        ), slug
        article_html = re.search(r"<article\b.*?</article>", html, flags=re.I | re.S)
        primary_jsonld = re.search(
            r'<script type="application/ld\+json">(.*?)</script>', html, flags=re.S
        )
        assert article_html and primary_jsonld
        graph = json.loads(primary_jsonld.group(1))["@graph"]
        article_schema = next(node for node in graph if node.get("@type") == "Article")
        assert article_schema["wordCount"] == len(visible_text(article_html.group(0)).split()), slug

        cta = re.search(
            r'<section class="lead-inline" id="diagnostico-confenge".*?</section>',
            html,
            flags=re.S,
        )
        assert cta, slug
        decoded_cta = unquote(cta.group(0))
        assert "Solicitar canal seguro para envio" in decoded_cta, slug
        assert "Não anexe arquivo nesta mensagem" in decoded_cta, slug
        assert not re.search(
            r">Enviar (?:planilha|minuta|matriz|cláusula|diligência)[^<]*<",
            decoded_cta,
            flags=re.I,
        ), slug


def test_revalidated_source_manifest_has_freshness_and_limitations():
    manifest = json.loads(
        (ROOT / "data" / "editorial" / "SOURCE-MANIFEST.json").read_text(encoding="utf-8")
    )
    by_id = {row["source_id"]: row for row in manifest["sources"]}
    assert REVALIDATED_SOURCE_IDS <= set(by_id)
    for source_id in REVALIDATED_SOURCE_IDS:
        source = by_id[source_id]
        assert source["accessed_at"] == "2026-08-29", source_id
        assert source.get("limitations"), source_id


def test_sinapi_snippet_contract_stays_green():
    html = read_shipped_html("sinapi-desonerado-nao-desonerado")
    report = evaluate_sinapi_snippet(html)
    assert report["ok"], report["fails"]


def test_revalidated_primary_urls_and_methodology_limits_are_shipped():
    sicro = read_shipped_html("sinapi-ou-sicro-obra-publica")
    assert "/custos-referenciais/sistemas-de-custos/sicro" in sicro
    assert "/custos-e-pagamentos/custos-e-pagamentos-dnit/" not in sicro
    assert "Sistema de Custos Referenciais de Obras" in sicro

    admin = read_shipped_html("administracao-local-orcamento-obra-publica")
    mobilizacao = read_shipped_html("mobilizacao-desmobilizacao-orcamento-obra")
    bdi = read_shipped_html("bdi-diferenciado-obra-publica")
    assert "valorado em item próprio, separado do BDI" in admin
    assert "valorados em itens próprios, separados do BDI" in mobilizacao
    assert "requisitos cumulativos da Súmula TCU 253" in bdi
    assert "Administração local e mobilização são casas de custo direto" not in bdi
    assert "NUMERO%253A253" in bdi

    sinapi = read_shipped_html("sinapi-desonerado-nao-desonerado")
    assert "transição parcial de 2025 a 2027" in sinapi
    assert "Livro_SINAPI_Calculos_Parametros.pdf" in sinapi


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
