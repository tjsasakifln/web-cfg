"""Regression tests for the pSEO copy/governance incident.

Two independent contracts are locked here:

1. **Locale.** Public copy names a region through
   ``scripts.pseo.geo_locale`` -- correctly accented, with the preposition
   that Brazilian Portuguese actually uses for that UF.
2. **Governance.** ``reject`` is fail-closed: a rejected page is withdrawn
   from the public tree, not merely de-indexed.

Neither copy scan ever walks the whole repo: documentation, fixtures and
snapshots quote the defective strings on purpose and must not trip these.
Two scopes are used, and the difference matters:

* ``test_generated_pages_carry_no_cms_metalanguage`` walks the pSEO-generated
  surface (the routes in ``data/pseo/registry.json`` plus the generated
  trees), because only there can the generator reintroduce a defect.
* ``test_no_cms_metalanguage_anywhere_on_the_visitor_surface`` walks every
  shipped visitor page via ``visitor_facing_relpaths()``. The last
  "evergreen" of this incident was hand-written anchor text on a commercial
  pillar, which the generated-surface scan could never reach.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from scripts.pseo import geo_locale as geo
from scripts.pseo.build import PRESERVED_STATIC_INDEXES

ROOT = Path(__file__).resolve().parents[3]

# Routes under an active measurement freeze (issues #529/#533) whose banned
# copy the freeze -- not an editorial allowlist -- still blocks. The set is
# empty: /diagnostico-pre-licitacao/ was cleaned on 2026-09-01 under the
# reviewed hash-recapture precedent of cf33385d4, recorded in
# docs/decisions/DEFERRED-BY-MEASUREMENT-FREEZE-2026-08-30.md.
# It may only ever shrink. Adding an entry means a visitor is reading CMS
# metalanguage, so any addition needs a dated action in that same document.
FROZEN_COPY_EXCEPTIONS: set[str] = set()

# CMS/SEO metalanguage that must never reach a visitor.
BANNED_COPY = {
    "evergreen": re.compile(r"evergreen", re.I),
    "pagina rolante": re.compile(r"p[áa]gina\s+rolante", re.I),
    "url por edital": re.compile(r"URL\s+por\s+edital", re.I),
}

# Unaccented UF display names that must never be rendered.
BANNED_UNACCENTED = {
    name: re.compile(rf"\b{name}\b")
    for name in (
        "Parana",
        "Piaui",
        "Goias",
        "Ceara",
        "Amapa",
        "Rondonia",
        "Maranhao",
        "Paraiba",
        "Sao Paulo",
        "Espirito Santo",
    )
}


# --------------------------------------------------------------------------
# 1. Locale contract
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("region", "expected"),
    [
        ("PR", "no Paraná"),
        ("SC", "em Santa Catarina"),
        ("RS", "no Rio Grande do Sul"),
        ("CE", "no Ceará"),
        ("BA", "na Bahia"),
        ("MG", "em Minas Gerais"),
        ("SP", "em São Paulo"),
        ("PI", "no Piauí"),
        ("PB", "na Paraíba"),
        ("RJ", "no Rio de Janeiro"),
        ("DF", "no Distrito Federal"),
        ("GO", "em Goiás"),
        ("MT", "no Mato Grosso"),
        ("MS", "no Mato Grosso do Sul"),
        ("TO", "no Tocantins"),
        ("BR", "no Brasil"),
    ],
)
def test_prepositional_phrase_matches_real_portuguese(region, expected):
    assert geo.prepositional_phrase(region) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Parana", "Paraná"),
        ("Piaui", "Piauí"),
        ("PR", "Paraná"),
        ("Santa Catarina", "Santa Catarina"),
        ("nacional", "Brasil"),
    ],
)
def test_display_name_is_always_accented(raw, expected):
    assert geo.display_name(raw) == expected


def test_unaccented_label_resolves_to_the_same_uf_as_its_code():
    # The pipeline receives both "PR" and "Parana"; they must not diverge.
    assert geo.prepositional_phrase("Parana") == geo.prepositional_phrase("PR")
    assert geo.prepositional_phrase("Piaui") == geo.prepositional_phrase("PI")


def test_every_uf_has_a_phrase_and_none_is_naive_em_concatenation():
    codes = [
        "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT",
        "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO",
        "RR", "SC", "SP", "SE", "TO", "BR",
    ]
    for code in codes:
        phrase = geo.prepositional_phrase(code)
        prep, _, name = phrase.partition(" ")
        assert prep in {"no", "na", "em"}, f"{code}: bad preposition {phrase!r}"
        assert name == geo.display_name(code)
        # An accented name must survive into the phrase untouched.
        assert name and not BANNED_UNACCENTED.keys() & {name}


def test_capitalize_only_touches_the_preposition():
    # Never .capitalize()/.title() the whole phrase: it would destroy the name.
    assert geo.prepositional_phrase("RS", capitalize=True) == "No Rio Grande do Sul"
    assert geo.prepositional_phrase("BA", capitalize=True) == "Na Bahia"
    assert geo.prepositional_phrase("SC", capitalize=True) == "Em Santa Catarina"


def test_normalize_label_does_not_corrupt_parana_or_paraiba():
    # The "Para" -> "Pará" repair is whole-word only.
    assert geo.normalize_label("Parana") == "Paraná"
    assert geo.normalize_label("Paraiba") == "Paraíba"
    assert geo.normalize_label("Para") == "Pará"


# --------------------------------------------------------------------------
# 2. Generated public copy
# --------------------------------------------------------------------------


def _generated_public_html() -> list[Path]:
    """Every HTML file the pSEO generator owns, and only those."""
    out: list[Path] = []
    for base in (ROOT / "inteligencia", ROOT / "radar"):
        if not base.exists():
            continue
        for path in sorted(base.rglob("index.html")):
            rel = path.relative_to(ROOT).as_posix()
            if rel in PRESERVED_STATIC_INDEXES:
                continue
            if rel.startswith(("radar/pesquisa/", "analises-contratos-publicos/")):
                continue
            if rel.startswith("inteligencia/valor-tipico-contratos-pavimentacao/"):
                continue
            out.append(path)
    return out


def test_generated_pages_carry_no_cms_metalanguage():
    offenders = []
    for path in _generated_public_html():
        text = path.read_text(encoding="utf-8", errors="replace")
        for label, rx in BANNED_COPY.items():
            if rx.search(text):
                offenders.append(f"{path.relative_to(ROOT)}: {label}")
    assert offenders == [], offenders


def test_generated_pages_never_render_an_unaccented_uf():
    offenders = []
    for path in _generated_public_html():
        text = path.read_text(encoding="utf-8", errors="replace")
        for name, rx in BANNED_UNACCENTED.items():
            if rx.search(text):
                offenders.append(f"{path.relative_to(ROOT)}: {name}")
    assert offenders == [], offenders


def _render_radar_html(slug: str) -> str:
    """Render one radar page from real snapshot data, without writing it.

    The lead and the answer box live only in ``render.py`` and appear in no
    registry field, so scanning the public tree cannot protect them: every
    radar page is currently withdrawn, which would make a disk scan pass
    vacuously. "Página rolante" was the string this incident was named for,
    so it is asserted against freshly rendered HTML instead.
    """
    from scripts.pseo.render import render_candidate
    from scripts.pseo.schema import validate_snapshot
    from scripts.pseo.score import build_candidates

    snap = validate_snapshot(ROOT / "data" / "pseo")
    manifest, data = snap["manifest"], snap["data"]
    for candidate in build_candidates(data, manifest):
        if candidate.url == f"/radar/{slug}/":
            return render_candidate(candidate, manifest)
    raise AssertionError(f"radar candidate not built: {slug}")


def test_rendered_radar_page_has_no_metalanguage_in_its_body():
    html = _render_radar_html("edificacoes-publicas-pr")
    for label, rx in BANNED_COPY.items():
        assert not rx.search(html), f"radar body still renders {label}"
    # The specific sentence the incident was reported for.
    assert "Página rolante" not in html
    assert "Última verificação" in html


def test_rendered_radar_page_uses_the_right_preposition():
    html = _render_radar_html("edificacoes-publicas-pr")
    assert "no Paraná" in html
    assert "em Parana" not in html
    assert not re.search(r"\bParana\b", html)
    assert 'property="og:title"' in html
    assert "application/ld+json" in html
    assert 'class="breadcrumbs' in html
    og = re.search(r'property="og:title" content="([^"]+)"', html) or re.search(
        r'content="([^"]+)" property="og:title"', html
    )
    assert og and "Paraná" in og.group(1) and "Parana" not in og.group(1)


def test_rendered_radar_page_for_a_non_no_uf():
    # Santa Catarina takes "em", not "no": the contract is per-UF, not a rule.
    html = _render_radar_html("edificacoes-publicas-sc")
    assert "em Santa Catarina" in html
    assert "no Santa Catarina" not in html


def test_rendered_radar_page_lists_no_contract_urls():
    html = _render_radar_html("edificacoes-publicas-pr")
    assert "/app/contratos/" not in html


def test_registry_copy_uses_the_locale_contract():
    """Titles/H1s/descriptions must carry the right preposition per UF."""
    registry = json.loads((ROOT / "data/pseo/registry.json").read_text(encoding="utf-8"))
    offenders = []
    for page in registry.get("pages") or []:
        region = page.get("region")
        if not region or not geo.resolve(region):
            continue
        name = geo.display_name(region)
        phrase = geo.prepositional_phrase(region)
        blob = " ".join(
            str(page.get(k) or "") for k in ("title", "h1", "description")
        )
        if name not in blob:
            continue
        # Wherever the name is introduced by a preposition, it must be the
        # right one -- "em Parana"/"em Paraná" for PR is the incident bug.
        for wrong in ("no", "na", "em"):
            bad = f"{wrong} {name}"
            if bad in blob and bad != phrase:
                offenders.append(f"{page.get('page_id')}: {bad!r} (esperado {phrase!r})")
    assert offenders == [], offenders


def test_registry_copy_has_no_metalanguage():
    registry = json.loads((ROOT / "data/pseo/registry.json").read_text(encoding="utf-8"))
    offenders = []
    for page in registry.get("pages") or []:
        blob = " ".join(
            str(page.get(k) or "") for k in ("title", "h1", "description")
        )
        for label, rx in BANNED_COPY.items():
            if rx.search(blob):
                offenders.append(f"{page.get('page_id')}: {label}")
    assert offenders == [], offenders


def test_no_cms_metalanguage_anywhere_on_the_visitor_surface():
    """The ban covers hand-authored HTML too, not only generated pages.

    ``test_generated_pages_carry_no_cms_metalanguage`` scans only the pSEO
    output. The last "evergreen" of this incident was not there: it was the
    anchor text of a hand-written ``<li>`` on /diagnostico-pre-licitacao/,
    which no scan reached, so removing it left nothing to stop it returning.
    This asserts the whole indexable surface instead.
    """
    from scripts.site.public_copy_scope import visitor_facing_relpaths

    files = list(visitor_facing_relpaths())
    # Anti-collapse floor, same idiom as tests/brand/test_logo_contract.mjs.
    # A sitewide scan that silently resolves to an empty or truncated file list
    # passes vacuously, which is precisely how the "evergreen" this test exists
    # for survived every earlier scan. Measured at 243 on 2026-09-01 (#566).
    assert len(files) >= 200, f"visitor-surface scan collapsed to {len(files)} files"

    offenders = []
    for rel in files:
        text = (ROOT / rel).read_text(encoding="utf-8", errors="replace")
        for label, rx in BANNED_COPY.items():
            if rx.search(text):
                offenders.append(f"{rel}: {label}")
    assert offenders == [], offenders


def test_frozen_route_exceptions_are_still_the_only_ones_outstanding():
    """The freeze exception list must shrink to empty, never grow silently."""
    offenders = []
    for rel in sorted(FROZEN_COPY_EXCEPTIONS):
        path = ROOT / rel
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if not any(rx.search(text) for rx in BANNED_COPY.values()):
            offenders.append(
                f"{rel} is clean -- remove it from FROZEN_COPY_EXCEPTIONS"
            )
    assert offenders == [], offenders


# --------------------------------------------------------------------------
# 3. Fail-closed publication governance
# --------------------------------------------------------------------------


def test_no_rejected_page_is_present_in_the_public_tree():
    """The whole governance fix, in one assertion."""
    registry = json.loads((ROOT / "data/pseo/registry.json").read_text(encoding="utf-8"))
    served = [
        page["url"]
        for page in registry.get("pages") or []
        if page.get("status") == "reject"
        and page.get("url")
        and (ROOT / page["url"].strip("/") / "index.html").exists()
    ]
    assert served == [], f"rejected pages still served: {served}"


def test_no_rejected_page_is_listed_in_a_sitemap():
    registry = json.loads((ROOT / "data/pseo/registry.json").read_text(encoding="utf-8"))
    rejected = {
        page["url"]
        for page in registry.get("pages") or []
        if page.get("status") == "reject" and page.get("url")
    }
    offenders = []
    for sitemap in sorted(ROOT.glob("*.xml")) + sorted(ROOT.glob("seo/*.xml")):
        text = sitemap.read_text(encoding="utf-8", errors="replace")
        offenders += [
            f"{sitemap.name}: {url}" for url in sorted(rejected) if url in text
        ]
    assert offenders == [], offenders


def test_build_report_records_every_withdrawal_by_url():
    """A withdrawal is an explicit, URL-level decision, never a silent gap."""
    report = json.loads(
        (ROOT / "seo/pseo-build-report.json").read_text(encoding="utf-8")
    )
    registry = json.loads((ROOT / "data/pseo/registry.json").read_text(encoding="utf-8"))
    rejected = {
        page["url"]
        for page in registry.get("pages") or []
        if page.get("status") == "reject" and page.get("url")
    }
    assert set(report.get("withdrawn_urls") or []) == rejected
    assert report.get("withdrawn_count") == len(rejected)


def test_editorial_report_counts_p0_pages_regardless_of_status():
    """`ok` may never be true while a P0-carrying page is actually served."""
    report = json.loads(
        (ROOT / "seo/pseo-editorial-report.json").read_text(encoding="utf-8")
    )
    for key in ("served_p0_page_count", "withdrawn_p0_page_count"):
        assert key in report, f"missing counter {key}"
    if report.get("served_p0_page_count"):
        assert report.get("ok") is False, "served P0 page must force ok=false"


# --------------------------------------------------------------------------
# 4. Opportunity identity
# --------------------------------------------------------------------------


def test_opportunity_identity_is_the_official_identifier():
    from scripts.pseo.score import radar_opportunity_view

    o = {
        "items": [
            # Same official id twice: one opportunity, not two.
            {"pncp_id": "111-1-000001/2026", "link_oficial": "https://x/app/editais/1"},
            {"pncp_id": "111-1-000001/2026", "link_oficial": "https://x/app/editais/1"},
            # Distinct sequenciais with identical wording: two opportunities.
            {"pncp_id": "111-1-000002/2026", "objeto": "Obra X", "link_oficial": "https://x/app/editais/2"},
            {"pncp_id": "111-1-000003/2026", "objeto": "Obra X", "link_oficial": "https://x/app/editais/3"},
            # A contract record must never count as an opportunity.
            {"pncp_id": "111-1-000004/2026", "link_oficial": "https://pncp.gov.br/app/contratos/111/2026/4"},
            # No official identifier: cannot be proven distinct, fail closed.
            {"pncp_id": None, "link_oficial": "https://x/app/editais/5"},
        ],
        "open_count": 6,
    }
    view = radar_opportunity_view(o)
    assert [i["pncp_id"] for i in view["items"]] == [
        "111-1-000001/2026",
        "111-1-000002/2026",
        "111-1-000003/2026",
    ]
    # The headline count must equal what the page actually lists.
    assert view["open_count"] == len(view["items"]) == 3
    audit = view["identity_audit"]
    assert audit["dropped_contract_url"] == 1
    assert audit["dropped_duplicate_official_id"] == 1
    assert audit["dropped_without_official_id"] == 1


def test_contract_urls_never_reach_a_radar_list():
    from scripts.pseo.score import radar_opportunity_view

    data = json.loads((ROOT / "data/pseo/opportunities.json").read_text(encoding="utf-8"))
    for opportunity in data:
        view = radar_opportunity_view(opportunity)
        for item in view["items"]:
            for field in ("link_pncp", "link_oficial", "canonical_source_url"):
                assert "/app/contratos/" not in str(item.get(field) or ""), (
                    f"{opportunity.get('slug')}: contract URL in opportunity list"
                )
        assert view["open_count"] == len(view["items"])
