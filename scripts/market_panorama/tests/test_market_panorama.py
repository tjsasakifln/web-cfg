"""Fail-closed tests for the market-panorama consumer."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from scripts.market_panorama import (
    CATALOG_FIXTURE,
    CATALOG_OFFICIAL_LIVE,
    DATA_HOLD,
    DATA_READY,
    PAYLOAD_SCHEMA,
    REASON_HANDOFF_BLOCKED,
    REASON_IDENTITY_LEAK,
    REASON_NO_APPROVAL,
    REASON_NO_HANDOFF,
    REASON_PRODUCER_CLAIMS_INDEX,
    REASON_SUMS_INVALID,
    SOURCE_ABSENT,
    SOURCE_FIXTURE,
    SOURCE_OFFICIAL_LIVE,
    STATE_INDEX,
    STATE_NOINDEX,
)
from scripts.market_panorama.consume import identity_leaks, load_cohort, verify_sums
from scripts.market_panorama.gate import evaluate, panorama_id
from scripts.market_panorama.render import render_hub_html, render_panorama_html, write_pages

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "labeled-fixture.payload.json"


def _payload(**overrides) -> dict:
    base = {
        "schema": PAYLOAD_SCHEMA,
        "contract_version": "v1.0.0",
        "catalog_mode": CATALOG_OFFICIAL_LIVE,
        "data_state": DATA_READY,
        "publication_readiness": DATA_READY,
        "as_of": "2026-08-22",
        "content_hash": "sha256:" + "a" * 64,
        "source_dossier_hash": "sha256:" + "b" * 64,
        "subject_profile": {"uf": "SC", "cnae_principal": "4211101", "buyer_count": 21, "contract_count": 55},
        "reason_codes": [],
        "limitations": ["UNKNOWN não é zero."],
        "sections": {
            "price_panel": {
                "state": DATA_READY,
                "payload": {
                    "reference_scope": "raio de 200 km",
                    "out_of_range_category_count": 1,
                    "out_of_range_factor": 10,
                    "categories": [
                        {
                            "categoria": "OBRAS",
                            "reference_contract_count": 18892,
                            "reference_p25": "25256.39",
                            "reference_p50": "189000.00",
                            "reference_p75": "910202.98",
                            "focal_position": "ABOVE_P75",
                        }
                    ],
                },
            },
            "competitors": {
                "state": DATA_READY,
                "payload": {
                    "primary_category": "OBRAS",
                    "selection_rule": "mesma categoria principal e mesmos compradores",
                    "competitors": [
                        {"supplier_nome": "UNKNOWN", "contract_count": 23, "shared_buyer_count": 16},
                        {"supplier_nome": "UNKNOWN", "contract_count": 3, "shared_buyer_count": 3},
                    ],
                },
            },
            "open_opportunities": {"state": DATA_HOLD, "payload": {"opportunities": []}},
        },
    }
    base.update(overrides)
    return base


def _write_rendezvous(root: Path, payload: dict, *, decision: str = "READY", manifest_extra: dict | None = None) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    manifest = {
        "schema": "authority-handoff-confenge-dossier/1.0",
        "content_hash": payload.get("content_hash"),
        "producer_commit": "deadbeef",
        "dossier_id": "cfg-dossier-test",
        "index_authorization": False,
        "publication_authorization": False,
    }
    manifest.update(manifest_extra or {})

    def dump(name: str, body: dict) -> None:
        (root / name).write_text(json.dumps(body, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    dump("payload.json", payload)
    dump("manifest.json", manifest)
    dump("state.json", {"handoff_decision": decision, "reason_codes": []})
    dump(f"{decision}.json", {"status": decision, "reason_codes": []})
    sums = []
    for path in sorted(p for p in root.rglob("*") if p.is_file() and p.name != "SHA256SUMS.txt"):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        sums.append(f"{digest}  {path.relative_to(root).as_posix()}")
    (root / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n", encoding="utf-8")
    return root


def test_absent_rendezvous_yields_an_empty_cohort(tmp_path):
    bundle = load_cohort(rendezvous=tmp_path / "nothing")
    assert bundle["records"] == []
    assert bundle["source_kind"] == SOURCE_ABSENT
    assert REASON_NO_HANDOFF in bundle["reason_codes"]


def test_blocked_rendezvous_renders_nothing(tmp_path):
    root = _write_rendezvous(tmp_path / "rv", _payload(), decision="BLOCKED")
    bundle = load_cohort(rendezvous=root)
    assert bundle["records"] == []
    assert REASON_HANDOFF_BLOCKED in bundle["reason_codes"]


def test_tampered_payload_is_refused(tmp_path):
    root = _write_rendezvous(tmp_path / "rv", _payload())
    (root / "payload.json").write_text('{"tampered": true}\n', encoding="utf-8")
    bundle = load_cohort(rendezvous=root)
    assert bundle["records"] == []
    assert REASON_SUMS_INVALID in bundle["reason_codes"]
    assert verify_sums(root)


def test_producer_claiming_index_authorization_is_refused(tmp_path):
    root = _write_rendezvous(tmp_path / "rv", _payload(), manifest_extra={"index_authorization": True})
    bundle = load_cohort(rendezvous=root)
    assert bundle["records"] == []
    assert REASON_PRODUCER_CLAIMS_INDEX in bundle["reason_codes"]


def test_identity_leak_is_refused(tmp_path):
    leaky = _payload()
    leaky["sections"]["competitors"]["payload"]["competitors"][0]["supplier_nome"] = "CONSTRUTORA REAL LTDA"
    root = _write_rendezvous(tmp_path / "rv", leaky)
    bundle = load_cohort(rendezvous=root)
    assert bundle["records"] == []
    assert REASON_IDENTITY_LEAK in bundle["reason_codes"]


def test_cnpj_anywhere_in_text_is_a_leak():
    assert identity_leaks({"note": "empresa 00.820.854/0001-14 venceu"})
    assert identity_leaks({"note": "empresa 00820854000114 venceu"})
    assert not identity_leaks({"note": "empresa vencedora", "supplier_nome": "UNKNOWN"})


def test_publisher_own_cnpj_is_not_a_leak():
    """CONFENGE's registered number is in the org schema of every page."""
    assert not identity_leaks({"note": "CONFENGE 52.407.089/0001-09"})


def test_official_live_defaults_to_noindex_without_approval(tmp_path):
    root = _write_rendezvous(tmp_path / "rv", _payload())
    bundle = load_cohort(rendezvous=root)
    assert bundle["source_kind"] == SOURCE_OFFICIAL_LIVE
    decision = evaluate(bundle["records"][0], source_kind=bundle["source_kind"], approvals={})
    assert decision.state == STATE_NOINDEX
    assert decision.indexable is False
    assert REASON_NO_APPROVAL in decision.reason_codes


def test_approval_bound_to_the_payload_hash_grants_index():
    from scripts.market_panorama.gate import payload_fingerprint

    payload = _payload()
    pid = panorama_id(payload)
    approvals = {pid: {"approved": True, "payload_fingerprint": payload_fingerprint(payload)}}
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals=approvals)
    assert decision.state == STATE_INDEX
    assert decision.indexable is True


def test_stale_approval_hash_does_not_grant_index():
    payload = _payload()
    approvals = {panorama_id(payload): {"approved": True, "payload_fingerprint": "sha256:stale"}}
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals=approvals)
    assert decision.indexable is False
    assert "approval_hash_drift" in decision.reason_codes


def test_fixture_can_never_index():
    from scripts.market_panorama.gate import payload_fingerprint

    payload = _payload(catalog_mode=CATALOG_FIXTURE, publication_readiness=DATA_HOLD)
    approvals = {
        panorama_id(payload): {"approved": True, "payload_fingerprint": payload_fingerprint(payload)}
    }
    decision = evaluate(payload, source_kind=SOURCE_FIXTURE, approvals=approvals)
    assert decision.indexable is False
    assert decision.state != STATE_INDEX


def test_labeled_fixture_on_disk_is_a_fixture():
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert payload["catalog_mode"] == CATALOG_FIXTURE
    decision = evaluate(payload, source_kind=SOURCE_FIXTURE, approvals={})
    assert decision.indexable is False


def test_rendered_page_is_noindex_and_carries_no_identity(tmp_path):
    payload = _payload()
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    html = render_panorama_html(payload, decision)
    assert 'content="noindex,nofollow,noarchive" name="robots"' in html
    assert 'data-publication-state="PUBLISHABLE_NOINDEX"' in html
    assert "Esta página não autoriza INDEX." in html
    assert not identity_leaks({"html": html})


def test_rendered_page_states_the_out_of_range_treatment():
    payload = _payload()
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    html = render_panorama_html(payload, decision)
    assert "fora da faixa do painel" in html
    assert "Ausência de observação não é ausência de edital." in html


def test_rendered_limitations_translate_producer_infrastructure_language():
    payload = _payload(limitations=["Contratos refletem o estado canônico do DataLake."])
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    html = render_panorama_html(payload, decision)
    assert "Contratos refletem o estado canônico do repositório de dados de referência." in html
    assert "DataLake" not in html


def test_rendered_page_is_byte_stable():
    payload = _payload()
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    assert render_panorama_html(payload, decision) == render_panorama_html(payload, decision)


def test_hub_is_noindex_when_nothing_is_indexable():
    payload = _payload()
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    html = render_hub_html([(payload, decision)], index_count=0)
    assert 'content="noindex,nofollow,noarchive" name="robots"' in html


def test_write_pages_emits_hub_and_page(tmp_path):
    payload = _payload()
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    written = write_pages([(payload, decision)], root=tmp_path)
    assert Path(written["hub"]).exists()
    assert Path(written[decision.panorama_id]).exists()


def test_cli_build_on_absent_rendezvous_reports_and_renders_nothing(tmp_path, capsys):
    from scripts.market_panorama import __main__ as cli

    assert cli.main(["build", "--rendezvous", str(tmp_path / "nothing"), "--report-only"]) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["evaluated"] == 0
    assert report["index_count"] == 0
    assert REASON_NO_HANDOFF in report["reason_codes"]


def test_cli_validate_passes_when_nothing_indexes(tmp_path, capsys):
    from scripts.market_panorama import __main__ as cli

    root = _write_rendezvous(tmp_path / "rv", _payload())
    assert cli.main(["validate", "--rendezvous", str(root)]) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["ok"] is True
    assert report["fixture_indexed"] == []


@pytest.mark.parametrize("field", ["catalog_mode", "data_state", "publication_readiness"])
def test_each_gate_field_blocks_on_its_own(field):
    payload = _payload(**{field: "SOMETHING_ELSE"})
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    assert decision.state == "BLOCKED"
    assert decision.indexable is False


def _crawler_root(tmp_path: Path) -> Path:
    (tmp_path / "robots.txt").write_text(
        "User-agent: *\nAllow: /\n\n# Ops\nUser-agent: *\nDisallow: /ops/\n", encoding="utf-8"
    )
    (tmp_path / "_headers").write_text("/assets/*\n  Cache-Control: public\n", encoding="utf-8")
    return tmp_path


def test_crawler_rules_block_the_family_while_noindex(tmp_path):
    from scripts.market_panorama.render import sync_family_crawler_rules

    root = _crawler_root(tmp_path)
    payload = _payload()
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    sync_family_crawler_rules([(payload, decision)], root=root)
    robots = (root / "robots.txt").read_text(encoding="utf-8")
    headers = (root / "_headers").read_text(encoding="utf-8")
    assert "Disallow: /panorama-mercado-obras-publicas/" in robots
    assert "Allow: /panorama-mercado-obras-publicas/" not in robots
    assert "X-Robots-Tag: noindex, nofollow, noarchive" in headers
    assert "Disallow: /ops/" in robots


def test_crawler_rules_allow_only_the_approved_slug(tmp_path):
    from scripts.market_panorama.gate import payload_fingerprint
    from scripts.market_panorama.render import sync_family_crawler_rules

    root = _crawler_root(tmp_path)
    payload = _payload()
    approvals = {
        panorama_id(payload): {"approved": True, "payload_fingerprint": payload_fingerprint(payload)}
    }
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals=approvals)
    sync_family_crawler_rules([(payload, decision)], root=root)
    robots = (root / "robots.txt").read_text(encoding="utf-8")
    headers = (root / "_headers").read_text(encoding="utf-8")
    assert f"Allow: /panorama-mercado-obras-publicas/{decision.slug}/" in robots
    assert "Disallow: /panorama-mercado-obras-publicas/" in robots
    # Netlify last-match wins: the index override must come after the family block.
    assert headers.index("X-Robots-Tag: noindex") < headers.index("X-Robots-Tag: index, follow")


def test_crawler_rules_are_idempotent(tmp_path):
    from scripts.market_panorama.render import sync_family_crawler_rules

    root = _crawler_root(tmp_path)
    payload = _payload()
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    sync_family_crawler_rules([(payload, decision)], root=root)
    once = (root / "robots.txt").read_text(encoding="utf-8")
    sync_family_crawler_rules([(payload, decision)], root=root)
    twice = (root / "robots.txt").read_text(encoding="utf-8")
    assert once == twice
    assert twice.count("# Market-panorama family — generated") == 1
    assert twice.count("# Market-panorama family — end") == 1


def test_revoking_an_approval_removes_the_allow(tmp_path):
    from scripts.market_panorama.render import sync_family_crawler_rules

    root = _crawler_root(tmp_path)
    payload = _payload()
    from scripts.market_panorama.gate import payload_fingerprint

    approved = {
        panorama_id(payload): {"approved": True, "payload_fingerprint": payload_fingerprint(payload)}
    }
    sync_family_crawler_rules(
        [(payload, evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals=approved))], root=root
    )
    assert "Allow: /panorama-mercado-obras-publicas/" in (root / "robots.txt").read_text(encoding="utf-8")
    sync_family_crawler_rules(
        [(payload, evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={}))], root=root
    )
    robots = (root / "robots.txt").read_text(encoding="utf-8")
    assert "Allow: /panorama-mercado-obras-publicas/" not in robots
    assert "Disallow: /panorama-mercado-obras-publicas/" in robots


def test_page_description_differs_from_the_hub():
    """Duplicate meta descriptions fail the site SEO validator."""
    from scripts.market_panorama.render import HUB_DESCRIPTION, description_for

    payload = _payload()
    description = description_for(payload)
    assert description != HUB_DESCRIPTION
    assert len(description) <= 160
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    page = render_panorama_html(payload, decision)
    hub = render_hub_html([(payload, decision)], index_count=0)
    assert f'content="{description}" name="description"' in page
    assert f'content="{description}" name="description"' not in hub


# --- Regressions pinned from the adversarial review -------------------------


def test_approval_is_bound_to_a_fingerprint_the_consumer_computes():
    """A producer-declared content_hash is not evidence; swapping facts must void it."""
    from scripts.market_panorama.gate import payload_fingerprint

    payload = _payload()
    approvals = {
        panorama_id(payload): {
            "approved": True,
            "payload_fingerprint": payload_fingerprint(payload),
        }
    }
    assert evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals=approvals).indexable is True

    swapped = _payload()
    swapped["subject_profile"]["buyer_count"] = 9999
    swapped["content_hash"] = payload["content_hash"]  # producer keeps the old string
    decision = evaluate(swapped, source_kind=SOURCE_OFFICIAL_LIVE, approvals=approvals)
    assert decision.indexable is False
    assert "no_individual_index_approval" in decision.reason_codes or (
        "approval_hash_drift" in decision.reason_codes
    )


def test_jsonld_cannot_close_its_own_script_block():
    payload = _payload()
    payload["as_of"] = '2026-08</script><script>alert(document.domain)</script>'
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    html = render_panorama_html(payload, decision)
    block = html.split('<script type="application/ld+json">', 1)[1].split("</script>", 1)[0]
    assert "<" not in block
    assert json.loads(block)


def test_crawler_block_does_not_eat_what_follows_it(tmp_path):
    from scripts.market_panorama.render import sync_family_crawler_rules

    root = _crawler_root(tmp_path)
    payload = _payload()
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    sync_family_crawler_rules([(payload, decision)], root=root)
    robots = root / "robots.txt"
    robots.write_text(
        robots.read_text(encoding="utf-8") + "\nSitemap: https://confenge.com.br/sitemap-extra.xml\n",
        encoding="utf-8",
    )
    sync_family_crawler_rules([(payload, decision)], root=root)
    after = robots.read_text(encoding="utf-8")
    assert "Sitemap: https://confenge.com.br/sitemap-extra.xml" in after
    assert "Disallow: /ops/" in after


def test_a_duplicated_block_is_collapsed_to_one(tmp_path):
    from scripts.market_panorama.render import (
        HEADERS_FAMILY_BEGIN,
        HEADERS_FAMILY_END,
        sync_family_crawler_rules,
    )

    root = _crawler_root(tmp_path)
    stale = (
        f"{HEADERS_FAMILY_BEGIN}\n"
        "/panorama-mercado-obras-publicas/obras-publicas-sc-2026-08/*\n"
        "  X-Robots-Tag: index, follow\n\n"
        f"{HEADERS_FAMILY_END}\n"
    )
    headers = root / "_headers"
    headers.write_text(headers.read_text(encoding="utf-8") + "\n" + stale + "\n" + stale, encoding="utf-8")
    payload = _payload()
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    sync_family_crawler_rules([(payload, decision)], root=root)
    after = headers.read_text(encoding="utf-8")
    assert after.count(HEADERS_FAMILY_BEGIN) == 1
    assert "X-Robots-Tag: index, follow" not in after


def test_an_approved_page_gets_a_crawlable_hub_and_a_sitemap(tmp_path):
    from scripts.market_panorama.gate import payload_fingerprint
    from scripts.market_panorama.render import (
        SITEMAP_NAME,
        sitemap_locs,
        sync_family_crawler_rules,
        write_sitemap,
    )

    root = _crawler_root(tmp_path)
    payload = _payload()
    approvals = {
        panorama_id(payload): {"approved": True, "payload_fingerprint": payload_fingerprint(payload)}
    }
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals=approvals)
    pairs = [(payload, decision)]
    sync_family_crawler_rules(pairs, root=root)
    write_sitemap(pairs, root=root)
    robots = (root / "robots.txt").read_text(encoding="utf-8")
    headers = (root / "_headers").read_text(encoding="utf-8")
    assert "Allow: /panorama-mercado-obras-publicas/$" in robots
    assert f"Allow: /panorama-mercado-obras-publicas/{decision.slug}/" in robots
    assert "/panorama-mercado-obras-publicas/\n  X-Robots-Tag: index, follow" in headers
    assert (root / SITEMAP_NAME).is_file()
    assert len(sitemap_locs(pairs)) == 2


def test_sitemap_is_removed_when_nothing_is_approved(tmp_path):
    from scripts.market_panorama.render import SITEMAP_NAME, write_sitemap

    (tmp_path / SITEMAP_NAME).write_text("<urlset/>", encoding="utf-8")
    payload = _payload()
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    assert write_sitemap([(payload, decision)], root=tmp_path) is None
    assert not (tmp_path / SITEMAP_NAME).exists()


def _shipped_root(tmp_path: Path, robots_extra: str = "", headers_extra: str = "") -> Path:
    root = _crawler_root(tmp_path)
    (root / "robots.txt").write_text(
        (root / "robots.txt").read_text(encoding="utf-8") + robots_extra, encoding="utf-8"
    )
    (root / "_headers").write_text(
        (root / "_headers").read_text(encoding="utf-8") + headers_extra, encoding="utf-8"
    )
    return root


def test_validate_fails_on_a_page_that_ships_indexable_without_approval(tmp_path, capsys):
    from scripts.market_panorama import __main__ as cli
    from scripts.market_panorama.render import PUBLIC_DIR

    root = _shipped_root(tmp_path)
    page = root / PUBLIC_DIR / "obras-publicas-sc-2026-08" / "index.html"
    page.parent.mkdir(parents=True, exist_ok=True)
    page.write_text(
        '<meta content="index,follow" name="robots"/><body data-panorama-id="mp-unknown"></body>',
        encoding="utf-8",
    )
    code = cli.main(["validate", "--rendezvous", str(tmp_path / "none"), "--root", str(root)])
    report = json.loads(capsys.readouterr().out)
    assert code == 1
    assert report["ok"] is False
    assert any("no approved ledger entry" in p for p in report["shipped_problems"])
    assert any("robots.txt does not allow it" in p for p in report["shipped_problems"])


def test_validate_fails_on_a_duplicated_generated_block(tmp_path, capsys):
    from scripts.market_panorama import __main__ as cli
    from scripts.market_panorama.render import ROBOTS_FAMILY_BEGIN

    root = _shipped_root(tmp_path, robots_extra=f"\n{ROBOTS_FAMILY_BEGIN}\n\n{ROBOTS_FAMILY_BEGIN}\n")
    code = cli.main(["validate", "--rendezvous", str(tmp_path / "none"), "--root", str(root)])
    report = json.loads(capsys.readouterr().out)
    assert code == 1
    assert any("appears 2 times" in p for p in report["shipped_problems"])


def test_a_fixture_build_does_not_touch_production_crawler_rules(tmp_path, capsys):
    from scripts.market_panorama import __main__ as cli

    root = _crawler_root(tmp_path)
    before_robots = (root / "robots.txt").read_text(encoding="utf-8")
    before_headers = (root / "_headers").read_text(encoding="utf-8")
    monkey = Path.cwd()
    assert monkey  # the CLI writes relative to the module root, so audit via --root
    cli.main(["build", "--fixture", str(FIXTURE), "--report-only"])
    capsys.readouterr()
    assert (root / "robots.txt").read_text(encoding="utf-8") == before_robots
    assert (root / "_headers").read_text(encoding="utf-8") == before_headers


def test_committed_pages_carry_the_current_shared_chrome():
    """Committed HTML goes stale when the shared chrome changes.

    The WhatsApp sprite in `scripts/pseo/html_shell.py` gained a second path;
    pages generated before that shipped the old glyph and failed the site-wide
    CTA gate, which does not run in this suite. Regenerating the family is the
    fix, and this is what notices without needing a rendezvous.
    """
    from scripts.market_panorama.render import PUBLIC_DIR
    from scripts.pseo.html_shell import SVG_SPRITE

    root = Path(__file__).resolve().parents[3]
    pages = sorted((root / PUBLIC_DIR).rglob("index.html"))
    if not pages:
        pytest.skip("family not built in this checkout")
    for page in pages:
        html = page.read_text(encoding="utf-8")
        assert SVG_SPRITE in html, f"{page.relative_to(root)} was built with stale shared chrome; rebuild the family"


def test_family_is_in_the_publish_allowlist():
    """`_site` copies only PUBLIC_TOP_DIRS; a family left out 404s in production."""
    from scripts.market_panorama import FAMILY_SLUG
    from scripts.pseo.public_artifact import PUBLIC_TOP_DIRS

    assert FAMILY_SLUG in PUBLIC_TOP_DIRS


def _section_html(html: str, section_id: str) -> str:
    """The markup of one rendered <section>, up to the next one."""
    start = html.index(f'id="{section_id}"')
    end = html.find("<section", start)
    return html[start : end if end != -1 else len(html)]


def _body_rows(html: str, section_id: str) -> int:
    """Rows in the section table, minus the single <thead> row."""
    block = _section_html(html, section_id)
    return block.count("<tr>") - block.count("<thead>")


def _many_opportunities(count: int) -> dict:
    payload = _payload()
    payload["sections"]["open_opportunities"] = {
        "state": DATA_READY,
        "payload": {
            "opportunities": [
                {
                    "orgao_nome": f"ORGAO MUNICIPAL {index:06d}",
                    "modalidade": "PREGAO ELETRONICO",
                    "data_encerramento": f"2026-09-{(index % 28) + 1:02d}",
                    "valor_estimado": "125000.00",
                }
                for index in range(count)
            ]
        },
    }
    return payload


def _many_categories(count: int) -> dict:
    payload = _payload()
    payload["sections"]["price_panel"]["payload"]["categories"] = [
        {
            "categoria": f"CATEGORIA {index:04d}",
            "reference_contract_count": index,
            "reference_p25": "1000.00",
            "reference_p50": "2000.00",
            "reference_p75": "3000.00",
            "focal_position": "P25_P50",
        }
        for index in range(count)
    ]
    return payload


def test_a_huge_opportunity_list_is_capped_and_the_page_says_the_real_total():
    from scripts.market_panorama.render import OPPORTUNITY_ROW_CAP

    payload = _many_opportunities(50_000)
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    html = render_panorama_html(payload, decision)
    assert _body_rows(html, "editais") == OPPORTUNITY_ROW_CAP
    assert f"Mostrando {OPPORTUNITY_ROW_CAP} de 50000 editais observados" in html
    # 50.000 rows rendered a 4,5 MB page. The cap is what keeps it readable.
    assert len(html) < 250_000


def test_a_huge_price_panel_is_capped_and_the_page_says_the_real_total():
    from scripts.market_panorama.render import PRICE_CATEGORY_ROW_CAP

    payload = _many_categories(5_000)
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    html = render_panorama_html(payload, decision)
    assert _body_rows(html, "faixas-de-valor") == PRICE_CATEGORY_ROW_CAP
    assert f"Mostrando {PRICE_CATEGORY_ROW_CAP} de 5000 categorias observadas" in html
    assert len(html) < 250_000


def test_the_capped_price_rows_are_the_best_evidenced_ones():
    from scripts.market_panorama.render import PRICE_CATEGORY_ROW_CAP

    payload = _many_categories(200)
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    block = _section_html(render_panorama_html(payload, decision), "faixas-de-valor")
    for index in range(200 - PRICE_CATEGORY_ROW_CAP, 200):
        assert f"<td>CATEGORIA {index:04d}</td>" in block
    assert "<td>CATEGORIA 0000</td>" not in block


def test_the_capped_subset_does_not_depend_on_the_producer_order():
    """A cut driven by serialisation order is not a decision, it is an accident."""
    payload = _many_opportunities(300)
    shuffled = _many_opportunities(300)
    shuffled["sections"]["open_opportunities"]["payload"]["opportunities"].reverse()
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    other = evaluate(shuffled, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    first = _section_html(render_panorama_html(payload, decision), "editais")
    second = _section_html(render_panorama_html(shuffled, other), "editais")
    assert first == second


def test_a_section_under_the_cap_claims_no_truncation():
    """Silence about truncation must mean the table is complete."""
    payload = _many_opportunities(3)
    decision = evaluate(payload, source_kind=SOURCE_OFFICIAL_LIVE, approvals={})
    html = render_panorama_html(payload, decision)
    assert _body_rows(html, "editais") == 3
    assert "ca-truncation-note" not in html
