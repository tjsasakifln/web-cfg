import json
import shutil
from pathlib import Path

import pytest

from scripts.pseo import climatizacao_sample as sample


ROOT = Path(__file__).resolve().parents[3]
SAMPLE = ROOT / "data/pseo" / sample.SAMPLE
MANIFEST = ROOT / "data/pseo" / sample.MANIFEST


def test_verified_sample_renders_five_contract_and_document_links(tmp_path: Path):
    data_dir = tmp_path / "data/pseo"
    data_dir.mkdir(parents=True)
    shutil.copyfile(SAMPLE, data_dir / sample.SAMPLE)
    shutil.copyfile(MANIFEST, data_dir / sample.MANIFEST)
    sample.render_all(root=tmp_path, capture_factory=lambda **_kwargs: '<form id="captura-estudo"></form>')
    html = (tmp_path / sample.ROUTE.strip("/") / "index.html").read_text(encoding="utf-8")
    assert html.count("contrato no PNCP") >= 5
    assert html.count("<a href=\"https://pncp.gov.br/pncp-api/") == 5
    assert html.count("data-sector-sample-version=") == 1


def test_manifest_id_or_source_mismatch_fails_closed(tmp_path: Path):
    shutil.copyfile(SAMPLE, tmp_path / sample.SAMPLE)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest["records"][0]["official_url"] = "https://pncp.gov.br/api/changed"
    manifest["verification_sha256"] = sample._canonical_sha256({k: v for k, v in manifest.items() if k != "verification_sha256"})
    (tmp_path / sample.MANIFEST).write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(sample.SampleError, match="verification record fields diverge"):
        sample.load_snapshot(tmp_path / sample.SAMPLE)


def test_verification_digest_cannot_be_decorative(tmp_path: Path):
    shutil.copyfile(SAMPLE, tmp_path / sample.SAMPLE)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest["verification_sha256"] = "0" * 64
    (tmp_path / sample.MANIFEST).write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(sample.SampleError, match="verification manifest digest mismatch"):
        sample.load_snapshot(tmp_path / sample.SAMPLE)


def test_claims_digest_is_checked_even_when_envelope_hashes_are_updated(tmp_path: Path):
    data = json.loads(SAMPLE.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    data["claims_sha256"] = "0" * 64
    manifest["sample_sha256"] = sample._canonical_sha256(data)
    manifest["verification_sha256"] = sample._canonical_sha256({k: v for k, v in manifest.items() if k != "verification_sha256"})
    (tmp_path / sample.SAMPLE).write_text(json.dumps(data), encoding="utf-8")
    (tmp_path / sample.MANIFEST).write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(sample.SampleError, match="sample claims digest mismatch"):
        sample.load_snapshot(tmp_path / sample.SAMPLE)
