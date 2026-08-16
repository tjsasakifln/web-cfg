"""Drive the shipped manifesto loader — no reimplementation of decision rules."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts/migration"))

from manifesto_lib import (  # noqa: E402
    REQUIRED_FIELDS,
    load_manifesto,
    manifesto_sha256,
    ready_redirects,
    validate_manifesto,
)


def test_loader_reads_committed_file():
    data = load_manifesto()
    assert data["meta"]["version"] == "v2"
    assert data["entries"], "manifesto has no entries"
    assert manifesto_sha256()


def test_required_fields_on_every_entry():
    data = load_manifesto()
    report = validate_manifesto(data)
    assert report["ok"], report["errors"][:20]
    for entry in data["entries"]:
        for field in REQUIRED_FIELDS:
            assert field in entry, f"{entry.get('legacy_url')} missing {field}"


def test_ready_rows_have_targets_and_no_generic_home():
    report = validate_manifesto()
    assert report["ready_count"] >= 1
    for row in report["ready_redirects"]:
        assert row["target_url"]
        assert not row["target_url"].rstrip("/").endswith("confenge.com.br")
        assert "/consultoria-b2g" not in row["target_url"]
        assert row["expected_http"] in (301, 308)


def test_retire_is_410_not_301_home():
    data = load_manifesto()
    for entry in data["entries"]:
        if entry["decision"] not in {"RETIRE", "RETIRE_410"}:
            continue
        assert entry["target_url"] is None
        assert entry["expected_http"] in (410, 404)
        assert entry["target_absence_justification"]


def test_ready_set_matches_loader():
    ready = ready_redirects()
    assert all(e["status"] == "ready" for e in ready)
    assert all(e["target_url"].startswith("https://confenge.com.br/") for e in ready)


def test_handoff_pins_manifesto_hash():
    digest = manifesto_sha256()
    pin = (ROOT / "data/migration/smartlic-confenge/manifesto.v1.sha256").read_text().strip()
    assert pin == digest
    handoff = (ROOT / "docs/migration/smartlic-confenge/HANDOFF-SMARTLIC-2115.md").read_text()
    new_handoff = (ROOT / "docs/migrations/smartlic/HANDOFF-2115.md").read_text()
    assert digest in handoff
    assert digest in new_handoff
    assert "https://confenge.com.br/" in handoff
    assert "28" in handoff
    # execute set must not tell #2115 to dump home
    assert "301 `/*` to CONFENGE home" in handoff or "Never 301 leftover" in handoff


def test_coverage_includes_gsc_and_families():
    data = load_manifesto()
    urls = {e["legacy_url"] for e in data["entries"]}
    assert "https://smartlic.tech/" in urls
    assert "https://smartlic.tech/cnpj/{cnpj}" in urls
    assert "https://smartlic.tech/blog/aditivos-contratuais-o-que-sao-como-monitorar" in urls
    assert "https://smartlic.tech/perguntas/indice-reajuste-contrato-publico" in urls
    assert len(urls) >= 1000
