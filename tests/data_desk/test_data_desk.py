"""Drive the shipped Data Desk generator, request contract, and syndication."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.data_desk.embed import embed_has_tracker, embed_has_visible_source
from scripts.data_desk.hashing import package_hash
from scripts.data_desk.metadata import dataset_jsonld, has_real_dataset
from scripts.data_desk.package import (
    FIXTURE_ASSET_REL,
    FIXTURE_OUT_REL,
    assert_no_sensitive,
    build_package,
    generate,
    invalidate_on_update,
    load_asset,
)
from scripts.data_desk.request import SchemaError as RequestError
from scripts.data_desk.request import register_request, request_contract, validate_intake
from scripts.data_desk.schema import SchemaError, WATERMARK
from scripts.data_desk.syndication import SYNDICATION_TARGET_COUNT, validate_manifest
from scripts.discovery.inspect import load_sitemap_urls

AS_OF = "2026-08-16"
FIXTURE_ASSET = ROOT / FIXTURE_ASSET_REL
ASSET_DIR = FIXTURE_ASSET.parent


def _package(**overrides):
    asset = load_asset(FIXTURE_ASSET, root=ROOT)
    asset.update(overrides)
    return build_package(asset, asset_dir=ASSET_DIR, generated_at=AS_OF)


def _generate_fixture(**kwargs):
    return generate(
        root=ROOT,
        asset_path=FIXTURE_ASSET,
        out_dir=kwargs.get("out_dir", ROOT / FIXTURE_OUT_REL),
        generated_at=kwargs.get("generated_at", AS_OF),
        publish_public=False,
    )


def test_fixture_package_watermark_and_no_public_canonical():
    package = _generate_fixture()
    assert package["watermark"] == WATERMARK
    assert package["canonical"] is None
    assert package["public_canonical"] is None
    assert package["sitemap"] is False
    assert package["external_distribution"] is False
    assert package["indexable"] is False
    sitemap = load_sitemap_urls(ROOT)
    assert package["permalink"] not in sitemap
    assert "/internal/data-desk/fixture-only/" not in " ".join(sitemap)
    out = Path(package["output_dir"])
    assert (out / "WATERMARK.txt").read_text(encoding="utf-8").strip() == WATERMARK
    assert "FIXTURE_ONLY" in (out / "citation.txt").read_text(encoding="utf-8")
    assert "FIXTURE_ONLY" in (out / "PRESS-BRIEF.md").read_text(encoding="utf-8")


def test_package_has_citation_versions_and_stable_hash():
    first = _generate_fixture()
    second = _generate_fixture()
    for package in (first, second):
        assert package["citation_text"]
        assert package["method_version"]
        assert package["schema_version"]
        assert package["data_version"]
        assert package["as_of"] == AS_OF
        assert package["coverage"]
        assert package["limitations"]
        assert package["correction_link"] == "https://confenge.com.br/correcoes/"
        assert package["creator"] == "CONFENGE"
        assert package["publisher"] == "CONFENGE"
        assert package["license"]
        assert package["usage_guidance"]
        assert package["identifier"]
        assert package["provenance"]
        assert package["package_hash"]
        assert package["package_version"]
    assert first["package_hash"] == second["package_hash"]
    assert first["package_version"] == second["package_version"]
    assert first["embed_html"] == second["embed_html"]
    rebuilt = dict(first)
    rebuilt.pop("output_dir", None)
    assert package_hash(rebuilt) == first["package_hash"]


def test_update_or_correction_invalidates_hash():
    old = _package()
    asset = load_asset(FIXTURE_ASSET, root=ROOT)
    asset["data_version"] = "fixture-2"
    asset["as_of"] = "2026-08-17"
    asset["citation_text"] = asset["citation_text"] + " Correção."
    updated = invalidate_on_update(old, asset, asset_dir=ASSET_DIR)
    assert updated["package_hash"] != old["package_hash"]
    assert updated["invalidated_previous"] == old["package_hash"]
    assert updated["previous_package_hash"] == old["package_hash"]


def test_dataset_metadata_only_when_dataset_exists():
    asset = load_asset(FIXTURE_ASSET, root=ROOT)
    csv_text = (ASSET_DIR / "table.csv").read_text(encoding="utf-8")
    assert has_real_dataset(asset, csv_text=csv_text) is True
    with_ds = _package()
    assert with_ds["dataset_jsonld"] is not None
    assert with_ds["dataset_jsonld"]["@type"] == "Dataset"
    assert with_ds["dataset_jsonld"]["distribution"]["@type"] == "DataDownload"
    assert with_ds["dataset_jsonld"]["distribution"]["contentUrl"]

    no_ds = load_asset(FIXTURE_ASSET, root=ROOT)
    no_ds["has_dataset"] = False
    no_ds["dataset"] = None
    no_ds["csv"] = None
    built = build_package(no_ds, asset_dir=ASSET_DIR, generated_at=AS_OF)
    assert built["has_dataset"] is False
    assert built["dataset_jsonld"] is None
    assert dataset_jsonld(no_ds, built, csv_text=None) is None


def test_fixture_embed_html_is_not_a_public_seo_page():
    """Shipped validate_seo.py must not treat data/ fixture fragments as pages."""
    import importlib.util

    embed = ROOT / "data" / "data-desk" / "packages" / "fixture-only" / "embed.html"
    assert embed.is_file()
    html = embed.read_text(encoding="utf-8")
    assert "<h1" not in html.lower()
    assert "rel=\"canonical\"" not in html.lower() and "rel='canonical'" not in html.lower()

    spec = importlib.util.spec_from_file_location(
        "validate_seo_shipped", ROOT / "seo" / "scripts" / "validate_seo.py"
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert "data" in mod.SKIP_DIRS
    scanned = {p.resolve() for p in mod.iter_seo_html_pages(ROOT)}
    assert embed.resolve() not in scanned

    proc = subprocess.run(
        [sys.executable, str(ROOT / "seo" / "scripts" / "validate_seo.py")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    combined = (proc.stdout or "") + (proc.stderr or "")
    assert "embed.html" not in combined
    assert proc.returncode == 0, combined[-2000:]
    assert "VALIDATION_OK" in combined


def test_embed_source_visible_and_no_tracker_by_default():
    package = _package()
    html = package["embed_html"]
    assert embed_has_visible_source(html)
    assert embed_has_tracker(html) is False
    assert "Source:" in html
    assert package["permalink"] in html
    assert "<script" not in html.lower()
    assert "googletagmanager" not in html.lower()


def test_optional_media_and_csv_are_not_invented():
    asset = load_asset(FIXTURE_ASSET, root=ROOT)
    asset["csv"] = None
    asset["has_dataset"] = False
    asset["dataset"] = None
    asset["media"] = {"svg": None, "png": None}
    package = build_package(asset, asset_dir=ASSET_DIR, generated_at=AS_OF)
    assert package["csv_included"] is False
    assert package["svg_included"] is False
    assert package["png_included"] is False
    assert package["dataset_jsonld"] is None


def test_data_request_requires_consent_minimizes_pii_and_unknown_prazo():
    asset = load_asset(FIXTURE_ASSET, root=ROOT)
    contract = request_contract(asset)
    assert contract["automatic_promise"] is False
    assert contract["api"] is False
    assert contract["prazo"] == "UNKNOWN"
    assert contract["consent_required"] is True
    assert "cpf" in contract["forbidden_fields"]
    payload = {
        "finalidade": "citação em relatório setorial",
        "organization": "Exemplo Associação",
        "role": "editor",
        "consent": True,
        "prazo": "UNKNOWN",
        "correlation_id": "ddr-test",
        "attribution": "https://exemplo.org/artigo",
        "outcome": "UNKNOWN",
    }
    validate_intake(payload)
    registered = register_request(payload, asset=asset)
    assert registered["automatic_promise"] is False
    assert registered["prazo"] == "UNKNOWN"
    assert registered["outcome"] == "UNKNOWN"
    with pytest.raises(RequestError, match="consent_required"):
        validate_intake({**payload, "consent": False})
    with pytest.raises(RequestError, match="pii_field_forbidden"):
        validate_intake({**payload, "cpf": "00000000000"})
    with pytest.raises(RequestError, match="prazo_must_be_unknown"):
        validate_intake({**payload, "prazo": "48h"})
    with pytest.raises(RequestError, match="automatic_promise_forbidden"):
        validate_intake({**payload, "automatic_promise": True})
    with pytest.raises(RequestError, match="invalid_request_state"):
        validate_intake({**payload, "outcome": "promised"})


def test_syndication_has_five_slots_and_auto_send_false():
    package = _package()
    manifest = package["syndication"]
    validate_manifest(manifest)
    assert manifest["auto_send"] is False
    assert manifest["sent"] is False
    assert len(manifest["targets"]) == SYNDICATION_TARGET_COUNT
    for row in manifest["targets"]:
        assert row["status"] == "PREPARED"
        assert row["outcome"] == "UNKNOWN"
        assert row["target_nominal"] is None
        assert row["citation_link_requirements"]
        assert row["owner"]
    with pytest.raises(SchemaError, match="auto_send_must_be_false"):
        validate_manifest({**manifest, "auto_send": True})


def test_no_raw_or_sensitive_dump():
    package = _package()
    assert_no_sensitive(package)
    with pytest.raises(SchemaError, match="sensitive_key"):
        assert_no_sensitive({"raw_rows": [{"cpf": "1"}]})
    csv_text = (ASSET_DIR / "table.csv").read_text(encoding="utf-8")
    assert "cpf" not in csv_text.lower()
    assert "datalake" not in csv_text.lower()


def test_cli_generate_twice_is_stable(tmp_path):
    out1 = tmp_path / "run-1"
    out2 = tmp_path / "run-2"
    cmd = [
        sys.executable,
        "-m",
        "scripts.data_desk",
        "generate",
        "--asset",
        str(FIXTURE_ASSET),
        "--as-of",
        AS_OF,
    ]
    first = subprocess.run(cmd + ["--out", str(out1)], cwd=ROOT, check=True, capture_output=True, text=True)
    second = subprocess.run(cmd + ["--out", str(out2)], cwd=ROOT, check=True, capture_output=True, text=True)
    hash1 = json.loads((out1 / "package.json").read_text(encoding="utf-8"))["package_hash"]
    hash2 = json.loads((out2 / "package.json").read_text(encoding="utf-8"))["package_hash"]
    assert hash1 == hash2
    assert (out1 / "citation.txt").read_text(encoding="utf-8") == (out2 / "citation.txt").read_text(
        encoding="utf-8"
    )
    assert "FIXTURE_ONLY" in first.stdout
    assert "auto_send: false" in first.stdout
    assert first.stdout.split("output_dir:")[0] == second.stdout.split("output_dir:")[0]
