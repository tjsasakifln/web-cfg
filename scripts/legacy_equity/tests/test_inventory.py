"""Drive the shipped inventory loader — no reimplementation of decision rules."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))

from legacy_equity.inventory import (  # noqa: E402
    ACTIONS,
    ALLOWLIST_QUERY_KEYS,
    HANDOFF_PATH,
    INVENTORY_PATH,
    LEGACY_HANDOFF_PATH,
    MANIFESTO_PATH,
    PII_QUERY_KEYS,
    REQUIRED_FIELDS,
    apply_query_string_policy,
    inventory_sha256,
    load_inventory,
    manifesto_sha256,
    ready_redirects,
    validate_inventory,
)


def test_loader_reads_committed_inventory():
    data = load_inventory()
    assert data["meta"]["version"] == "v2"
    assert data["meta"]["schema"] == "smartlic-url-map-v2"
    assert data["entries"], "inventory has no entries"
    assert inventory_sha256()


def test_manifesto_projection_is_byte_identical():
    assert INVENTORY_PATH.read_bytes() == MANIFESTO_PATH.read_bytes()
    assert inventory_sha256() == manifesto_sha256()
    pin = INVENTORY_PATH.with_suffix(".sha256").read_text(encoding="utf-8").strip()
    assert pin == inventory_sha256()
    assert pin == (MANIFESTO_PATH.parent / "manifesto.v1.sha256").read_text(encoding="utf-8").strip()


def test_required_fields_on_every_entry():
    data = load_inventory()
    report = validate_inventory(data)
    assert report["ok"], report["errors"][:20]
    for entry in data["entries"]:
        for field in REQUIRED_FIELDS:
            assert field in entry, f"{entry.get('legacy_url')} missing {field}"
        assert entry["action"] in ACTIONS
        assert entry["decision"] == entry["action"]
        assert entry["target"] == entry["target_url"]


def test_actions_are_only_the_six_verbs():
    data = load_inventory()
    seen = {e["action"] for e in data["entries"]}
    assert seen <= ACTIONS
    assert "REDIRECT" not in seen
    assert "RETIRE" not in seen


def test_determinism_two_hashes_agree():
    first = hashlib.sha256(INVENTORY_PATH.read_bytes()).hexdigest()
    second = hashlib.sha256(INVENTORY_PATH.read_bytes()).hexdigest()
    assert first == second
    assert first == inventory_sha256()


def test_handoff_pins_inventory_hash():
    digest = inventory_sha256()
    handoff = HANDOFF_PATH.read_text(encoding="utf-8")
    legacy = LEGACY_HANDOFF_PATH.read_text(encoding="utf-8")
    assert digest in handoff
    assert digest in legacy
    assert "https://confenge.com.br/" in handoff
    assert "28" in handoff
    assert "Never 301 leftover" in handoff or "301 `/*` to CONFENGE home" in handoff


def test_coverage_includes_gsc_and_families():
    data = load_inventory()
    urls = {e["legacy_url"] for e in data["entries"]}
    assert "https://smartlic.tech/" in urls
    assert "https://smartlic.tech/cnpj/{cnpj}" in urls
    assert "https://smartlic.tech/blog/aditivos-contratuais-o-que-sao-como-monitorar" in urls
    assert "https://smartlic.tech/perguntas/indice-reajuste-contrato-publico" in urls
    assert "https://smartlic.tech/blog/como-consultar-contratos-publicos-pncp" in urls
    assert len(urls) >= 1000
    assert len(ready_redirects(data)) == 11


def test_execute_set_matches_ready_redirects():
    data = load_inventory()
    execute = json.loads((INVENTORY_PATH.parent / "execute-set.v2.json").read_text(encoding="utf-8"))
    ready = ready_redirects(data)
    assert execute["inventory_sha256"] == inventory_sha256()
    assert execute["default_status"] == 410
    assert len(execute["redirects"]) == len(ready) == 11
    execute_paths = {row["path"] for row in execute["redirects"]}
    for entry in ready:
        path = entry["legacy_url"].removeprefix("https://smartlic.tech") or "/"
        if path != "/" and path.endswith("/"):
            path = path.rstrip("/")
        assert path in execute_paths


def test_execute_set_holds_are_an_exact_fail_closed_projection():
    """Compiled HOLD rows must be source-owned, minimal and impossible to hand-edit."""
    data = load_inventory()
    execute = json.loads((INVENTORY_PATH.parent / "execute-set.v2.json").read_text(encoding="utf-8"))
    source_holds = {
        entry["legacy_url"]: entry
        for entry in data["entries"]
        if entry["action"] == "HOLD_TARGET_NOT_READY"
    }
    compiled_holds = {row["legacy_url"]: row for row in execute["holds"]}

    assert compiled_holds.keys() == source_holds.keys()
    expected_keys = {
        "legacy_url",
        "path",
        "skip_reason",
        "intended_future_surface",
        "expected_http",
        "target_url",
    }
    for legacy_url, row in compiled_holds.items():
        source = source_holds[legacy_url]
        expected_path = legacy_url.removeprefix("https://smartlic.tech") or "/"
        if expected_path != "/" and expected_path.endswith("/"):
            expected_path = expected_path.rstrip("/")
        assert set(row) == expected_keys
        assert row["path"] == expected_path
        assert row["skip_reason"] == source["skip_reason"]
        assert row["intended_future_surface"] == source["intended_future_surface"]
        assert row["expected_http"] == 410
        assert row["target_url"] is None

    checklist = source_holds[
        "https://smartlic.tech/blog/checklist-habilitacao-licitacao-2026"
    ]
    assert checklist["status"] == "hold"
    assert checklist["target"] is None
    assert "explicit SUNSET decision" in checklist["reason"]


def test_query_pii_is_dropped_from_location():
    data = load_inventory()
    ready = ready_redirects(data)
    assert ready
    for entry in ready:
        policy = entry["query_string_policy"]
        assert policy["mode"] == "allowlist"
        persist = list(policy["persist"])
        assert persist == list(ALLOWLIST_QUERY_KEYS)
        target = entry["target"]
        dirty = (
            "email=ada@example.com&phone=48999999999&name=Ada&cnpj=00000000000191"
            "&cpf=00000000191&utm_source=gsc&jornada=defesa&evil=1"
        )
        location = apply_query_string_policy(target, dirty, persist)
        lowered = location.lower()
        for key in PII_QUERY_KEYS:
            assert key not in lowered, (entry["legacy_url"], location)
        assert "evil=" not in location
        assert "utm_source=gsc" in location
        assert "jornada=defesa" in location
        assert location.startswith(target.rstrip("/"))
        cases = {c["name"]: c for c in entry["test_cases"]}
        pii_case = cases["pii-query-dropped"]
        assert "email" in pii_case["expect"]["forbid"]
        assert "cnpj" in pii_case["expect"]["forbid"]
        assert pii_case["expect"]["location"] == target


def test_payment_delay_blog_does_not_target_work_delay_pillar():
    data = load_inventory()
    row = next(
        e
        for e in data["entries"]
        if e["legacy_url"]
        == "https://smartlic.tech/blog/orgaos-risco-atraso-pagamento-licitacao"
    )
    assert row["action"] == "REDIRECT_301"
    assert row["target"] == (
        "https://confenge.com.br/conteudos/atraso-pagamento-contrato-publico-suspender/"
    )
    assert "atrasos-prorrogacao-obras-publicas" not in row["target"]
    assert "payment" in row["semantic_equivalence"].lower()
