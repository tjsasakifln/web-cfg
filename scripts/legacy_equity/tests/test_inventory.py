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
    HANDOFF_PATH,
    INVENTORY_PATH,
    LEGACY_HANDOFF_PATH,
    MANIFESTO_PATH,
    REQUIRED_FIELDS,
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
