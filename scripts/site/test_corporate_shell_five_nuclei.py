"""Campaign 10: corporate shell, five-nucleus chooser, withheld hubs, B2G conservation.

Drives the shipped home/IA/nav files. Does not re-implement the pages, does not
hard-code a golden HTML dump, and does not start past the HTML.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
from pathlib import Path

from scripts.site.public_ia import (
    B2G_NUCLEUS_HREF,
    REQUIRED_NUCLEUS_IDS,
    TAXONOMY_DRAFT_ID,
    header_items,
    load_ia_map,
    nucleus_items,
    validate_contract,
)
from scripts.site.shell_nav import (
    FROZEN_SHELL_FILES,
    HASH_PINNED_SHELL_FILES,
    shipped_html_files,
)


ROOT = Path(__file__).resolve().parents[2]
HOME = ROOT / "index.html"
HUB_ROOT = ROOT / "docs" / "integration" / "campaign-20260904" / "10" / "hubs"
SITEMAP = ROOT / "sitemap.xml"
ALLOWED_ANALYTICS_SURFACES = {
    "corporate-home",
    "nucleus-chooser",
    "nucleus-hub",
    "private-intelligence-asset",
    "primary-triage-action",
}
BANNED_PHRASES = (
    "soluções completas",
    "solução completa",
    "excelência",
    "laudo incontestável",
    "garantia de vitória",
)
FORM_SHA256 = "0f49d7f5f23da5ecc2e58c282d0a57a3bd0d56aabdad678c53165ed85b5883a4"
CONSERVED_B2G = (
    "/servicos-obras-publicas/",
    "/bid-room-licitacoes-obras/",
    "/problemas-que-resolvemos/",
    "/diretoria-b2g/",
    "/medicoes-glosas-obras-publicas/",
    "/defesa-margem-contratos-publicos/",
    "/reequilibrio-obras-publicas/",
)


def _home() -> str:
    return HOME.read_text(encoding="utf-8")


def _chooser(html: str) -> str:
    match = re.search(
        r'<section\b[^>]*id="nucleos"[^>]*>[\s\S]*?</section>', html, re.I
    )
    assert match, "missing #nucleos chooser on shipped home"
    return match.group(0)


def test_ia_contract_names_five_nuclei_and_conserves_b2g() -> None:
    errors = validate_contract()
    assert errors == [], errors
    data = load_ia_map()
    assert data["taxonomy"]["id"] == TAXONOMY_DRAFT_ID
    assert data["taxonomy"]["fail_closed"] is True
    assert [item["id"] for item in nucleus_items(data)] == list(REQUIRED_NUCLEUS_IDS)
    hrefs = [item["href"] for item in header_items(data)]
    assert B2G_NUCLEUS_HREF in hrefs
    assert "/bid-room-licitacoes-obras/" in hrefs
    assert "/problemas-que-resolvemos/" in hrefs
    assert len(hrefs) <= 5


def test_shipped_home_chooser_and_single_primary_cta() -> None:
    html = _home()
    hero = re.search(r'<section\b[^>]*class="hero[\s\S]*?</section>', html, re.I)
    assert hero, "missing hero"
    assert "Engenharia, Perícias e Inteligência Técnica" in hero.group(0)
    assert hero.group(0).count("button-primary") == 1
    assert 'href="#formulario-contato"' in hero.group(0)
    chooser = _chooser(html)
    for nucleus_id in REQUIRED_NUCLEUS_IDS:
        assert f'data-nucleus-id="{nucleus_id}"' in chooser, nucleus_id
    assert chooser.count("button-primary") == 0
    assert 'href="/servicos-obras-publicas/"' in chooser
    withheld = [item for item in nucleus_items() if item["id"] != "public_works_b2g"]
    for item in withheld:
        row = re.search(
            rf'<li\b[^>]*data-nucleus-id="{item["id"]}"[^>]*>[\s\S]*?</li>',
            chooser,
        )
        assert row, item["id"]
        assert "/docs/" not in row.group(0)
        assert "index.html" not in row.group(0)
        assert 'href="#formulario-contato"' in row.group(0)


def test_b2g_routes_stay_linked_in_two_steps() -> None:
    html = _home()
    for href in CONSERVED_B2G:
        assert href in html, href
    header = re.search(r'<header class="site-header"[\s\S]*?</header>', html)
    assert header
    header_html = header.group(0)
    assert "/servicos-obras-publicas/" in header_html
    assert "/bid-room-licitacoes-obras/" in header_html
    assert "/problemas-que-resolvemos/" in header_html
    servicos = (ROOT / "servicos-obras-publicas" / "index.html").read_text(encoding="utf-8")
    assert "/diretoria-b2g/" in servicos
    assert "/bid-room-licitacoes-obras/" in servicos
    problemas = (ROOT / "problemas-que-resolvemos" / "index.html").read_text(encoding="utf-8")
    assert "/medicoes-glosas-obras-publicas/" in problemas
    assert "/reequilibrio-obras-publicas/" in problemas


def test_withheld_hubs_are_isolated_templates() -> None:
    sitemap = SITEMAP.read_text(encoding="utf-8") if SITEMAP.is_file() else ""
    shipped = {path.relative_to(ROOT).as_posix() for path in shipped_html_files()}
    for nucleus_id in REQUIRED_NUCLEUS_IDS:
        path = HUB_ROOT / nucleus_id / "index.html"
        assert path.is_file(), path
        rel = path.relative_to(ROOT).as_posix()
        html = path.read_text(encoding="utf-8")
        assert 'content="noindex,nofollow,noarchive"' in html
        assert f'data-nucleus-id="{nucleus_id}"' in html
        assert 'data-analytics-surface="nucleus-hub"' in html
        assert rel not in shipped
        assert nucleus_id not in sitemap
        assert "/docs/integration/" not in sitemap
        for field in (
            "visitor-job",
            "icp",
            "trigger-events",
            "artifacts",
            "method",
            "available-proof",
            "limits-conflict",
            "next-step",
        ):
            assert f'data-hub-field="{field}"' in html, field
        if nucleus_id == "public_works_b2g":
            assert B2G_NUCLEUS_HREF in html
        else:
            assert 'href="#formulario-contato"' in html or "/#formulario-contato" in html


def test_home_critical_css_hash_is_authorized_in_headers() -> None:
    html = _home()
    match = re.search(
        r'<style data-home-deliverables-critical="">(.*?)</style>', html, re.S
    )
    assert match, "missing home critical style block"
    digest = (
        "sha256-"
        + base64.b64encode(hashlib.sha256(match.group(1).encode("utf-8")).digest()).decode()
    )
    headers = (ROOT / "_headers").read_text(encoding="utf-8")
    assert f"'{digest}'" in headers, digest


def test_form_runtime_bytes_untouched() -> None:
    html = _home()
    form = re.search(
        r'<form\b[^>]*id="formulario-contato"[\s\S]*?</form>', html
    )
    assert form
    digest = hashlib.sha256(form.group(0).encode("utf-8")).hexdigest()
    assert digest == FORM_SHA256


def test_analytics_surfaces_are_allowlisted() -> None:
    html = _home()
    surfaces = set(re.findall(r'data-analytics-surface="([^"]+)"', html))
    assert "corporate-home" in surfaces
    assert "nucleus-chooser" in surfaces
    assert "private-intelligence-asset" in surfaces
    assert "primary-triage-action" in surfaces
    unexpected = surfaces - ALLOWED_ANALYTICS_SURFACES
    assert not unexpected, unexpected


def test_banned_empty_marketing_absent_from_home() -> None:
    blob = _home().lower()
    hits = [phrase for phrase in BANNED_PHRASES if phrase in blob]
    assert hits == []
    assert "não é perito do tjsc" in blob
    assert "perito do tjsc" in blob
    assert "é perito do tjsc" not in blob.replace("não é perito do tjsc", "")


def test_private_intelligence_placeholder_is_fail_closed() -> None:
    html = _home()
    block = re.search(
        r'<aside\b[^>]*id="inteligencia-privada"[\s\S]*?</aside>', html
    )
    assert block
    text = block.group(0)
    assert "private_project_technical_readiness_v1" in text
    assert "private_project_technical_readiness_assessment" in text
    assert "não afirma resultado" in text.lower() or "nao afirma resultado" in text.lower()
    assert "54.055" not in text


def test_title_schema_and_footer_are_not_exclusive_b2g() -> None:
    html = _home()
    title = re.search(r"<title>(.*?)</title>", html)
    assert title and "Engenharia, Perícias e Inteligência Técnica" in title.group(1)
    assert "Consultoria para licitações e contratos de obras públicas" not in title.group(1)
    ld = json.loads(
        re.search(
            r'<script type="application/ld\+json">(.*?)</script>', html, re.S
        ).group(1)
    )
    org = next(node for node in ld["@graph"] if node.get("@type") == "Organization")
    assert "perícias" in org["description"].lower()
    footer = re.search(r'<footer class="site-footer">[\s\S]*?</footer>', html)
    assert footer
    assert "Engenharia, perícias e inteligência técnica" in footer.group(0)
    assert "/servicos-obras-publicas/" in footer.group(0)


def test_frozen_bofu_pages_were_not_rewritten_by_this_campaign() -> None:
    assert FROZEN_SHELL_FILES
    for rel in sorted(FROZEN_SHELL_FILES):
        html = (ROOT / rel).read_text(encoding="utf-8", errors="replace")
        assert "Engenharia, Perícias e Inteligência Técnica" not in html


def test_hash_pinned_rain_canary_keeps_approved_material() -> None:
    from scripts.editorial.striking_distance import (
        approval_errors,
        evaluate_striking_distance,
        load_decisions,
        page_material_hash,
    )

    rel = "conteudos/chuva-prorrogacao-prazo-obra-publica/index.html"
    assert rel in HASH_PINNED_SHELL_FILES
    shipped = {path.relative_to(ROOT).as_posix() for path in shipped_html_files()}
    assert rel not in shipped
    assert rel not in FROZEN_SHELL_FILES
    row = next(item for item in load_decisions()["urls"] if item.get("canary") is True)
    assert row["html"] == rel
    assert page_material_hash(row) == row["approval"]["material_hash"]
    assert approval_errors(row) == []
    report = evaluate_striking_distance()
    assert report["ok"] is True, report["fails"]
