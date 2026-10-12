"""Keep the labor-SST dispute handoff distinct from preventive SST."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SERVICES = ROOT / "servicos" / "index.html"
GENERATOR = ROOT / "scripts" / "site" / "render_nav_hubs.py"


def _labor_anchor(document: str) -> str:
    match = re.search(
        r'<a\b(?=[^>]*data-hub-link="servicos-sst-labor-assistance")[^>]*>',
        document,
    )
    assert match, "labor-SST contact link missing"
    return match.group(0)


def test_labor_sst_handoff_uses_canonical_service_page_with_distinct_context() -> None:
    """A labor case must reach its service owner, not the civil-assistance branch."""
    for document in (
        SERVICES.read_text(encoding="utf-8"),
        GENERATOR.read_text(encoding="utf-8"),
    ):
        anchor = _labor_anchor(document)
        assert 'href="/assistencia-tecnica-pericia-trabalhista/"' in anchor
        assert '/triagem-tecnica/' not in anchor
        for attribute, value in {
            "data-journey": "pericia",
            "data-route-family": "assistencia-tecnica-pericia-trabalhista",
            "data-asset-id": "corporate_services_hub_v1",
            "data-tema": "Assistência técnica trabalhista em SST",
            "data-origem": "/servicos/",
            "data-origin-url": "/servicos/",
        }.items():
            assert f'{attribute}="{value}"' in anchor


def test_labor_sst_copy_preserves_the_preventive_boundary() -> None:
    row = re.search(
        r'<article class="corporate-service-row" id="servico-diagnostico">[\s\S]*?</article>',
        SERVICES.read_text(encoding="utf-8"),
    )
    assert row
    for phrase in ("documentação preventiva", "conflito", "sigilo", "perícia trabalhista"):
        assert phrase in row.group(0)
