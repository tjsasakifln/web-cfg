"""Drive the shipped generator against the approved SC Market Answer asset."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.data_desk.bind import CANONICAL_SOURCE, load_approved_source
from scripts.data_desk.embed import embed_has_tracker, embed_has_visible_source
from scripts.data_desk.hashing import package_hash
from scripts.data_desk.package import (
    DEFAULT_ASSET_ID,
    DEFAULT_ASSET_REL,
    FIXTURE_ASSET_REL,
    build_package,
    generate,
    invalidate_on_update,
    load_asset,
)
from scripts.data_desk.schema import WATERMARK, SchemaError
from scripts.data_desk.syndication import validate_manifest
from scripts.discovery.inspect import load_sitemap_urls

AS_OF = "2026-08-17T11:29:23.193694+02:00"
REAL_ASSET = ROOT / DEFAULT_ASSET_REL
FIXTURE_ASSET = ROOT / FIXTURE_ASSET_REL
PUBLIC_REL = Path("assets/data-desk/valor-tipico-contratos-pavimentacao-sc/v1")
PII_MARKERS = ("cpf", "rg", "-----begin", "private key", "datalake", "raw_rows")


def _source():
    return load_approved_source(ROOT)


def test_operational_default_is_real_approved_asset():
    asset = load_asset(root=ROOT)
    assert asset["id"] == DEFAULT_ASSET_ID
    assert asset["approved"] is True
    assert asset.get("fixture") is not True
    assert asset.get("watermark") != WATERMARK
    blob = json.dumps(asset, ensure_ascii=False)
    assert WATERMARK not in blob


def test_fixture_still_isolated_when_selected():
    asset = load_asset(FIXTURE_ASSET, root=ROOT)
    assert asset["id"] == "fixture-only-citation-kit"
    assert asset["approved"] is False
    assert asset["fixture"] is True
    assert asset["watermark"] == WATERMARK
    package = generate(
        root=ROOT,
        asset_path=FIXTURE_ASSET,
        out_dir=ROOT / "data" / "data-desk" / "packages" / "fixture-only",
        generated_at="2026-08-16",
        publish_public=False,
    )
    assert package["watermark"] == WATERMARK
    assert package.get("fixture") is True
    out = Path(package["output_dir"])
    assert WATERMARK in (out / "citation.txt").read_text(encoding="utf-8")
    assert (ROOT / "data" / "data-desk" / "packages" / "fixture-only" / "package.json").is_file()


def test_real_package_reconciles_approved_payload(tmp_path):
    src = _source()
    package = generate(
        root=ROOT,
        out_dir=tmp_path / "kit",
        generated_at=AS_OF,
        publish_public=False,
    )
    assert package["id"] == DEFAULT_ASSET_ID
    assert WATERMARK not in json.dumps(package, ensure_ascii=False)
    assert package["stats"]["p25"] == src["stats"]["p25"]
    assert package["stats"]["median"] == src["stats"]["median"]
    assert package["stats"]["p75"] == src["stats"]["p75"]
    assert package["stats"]["n"] == src["stats"]["n"]
    assert package["missingness"]["unknown_or_nonpositive"] == src["missingness"]["unknown_or_nonpositive"]
    assert package["missingness"]["unknown_or_nonpositive"] != 0
    assert package["missingness"]["total_keyword_rows"] == src["missingness"]["total_keyword_rows"]
    assert package["period"]["start"] == src["period"]["start"]
    assert package["period"]["end"] == src["period"]["end"]
    assert package["geography_code"] == "SC"
    assert package["grain"] == "integral_nominal_instrument"
    assert package["grain"] != "custo_por_km"
    assert "custo por km" in package["limitations"].lower() or "não custo" in package["limitations"].lower()
    assert "nacional" in package["limitations"].lower() or "país" in package["limitations"].lower()
    assert "brasil" not in (package.get("coverage") or "").lower() or "não" in (package.get("coverage") or "").lower()
    assert package["payload_content_hash"] == src["payload_content_hash"]
    assert package["rendered_content_hash"] == src["rendered_content_hash"]
    assert package["canonical"] == CANONICAL_SOURCE
    assert package["indexable"] is False
    assert package["sitemap"] is False
    assert package["png_included"] is False


def test_real_artifacts_named_and_canonical(tmp_path):
    dest = tmp_path / "kit"
    package = generate(root=ROOT, out_dir=dest, generated_at=AS_OF, publish_public=False)
    required = [
        "citation.txt",
        "citation-short.txt",
        "chart.svg",
        "table.csv",
        "method.json",
        "method.md",
        "coverage.json",
        "limitations.md",
        "PRESS-BRIEF.md",
        "package.json",
        "request-contract.json",
        "syndication.json",
        "dataset.jsonld",
        "embed.html",
    ]
    for name in required:
        path = dest / name
        assert path.is_file(), name
        assert path.stat().st_size > 0, name
        text = path.read_text(encoding="utf-8")
        assert WATERMARK not in text, name
    citation = (dest / "citation.txt").read_text(encoding="utf-8")
    brief = (dest / "PRESS-BRIEF.md").read_text(encoding="utf-8")
    method = (dest / "method.md").read_text(encoding="utf-8")
    limits = (dest / "limitations.md").read_text(encoding="utf-8")
    embed = (dest / "embed.html").read_text(encoding="utf-8")
    manifest = json.loads((dest / "package.json").read_text(encoding="utf-8"))
    for blob in (citation, brief, method, limits, embed, json.dumps(manifest)):
        assert CANONICAL_SOURCE in blob
    svg = (dest / "chart.svg").read_text(encoding="utf-8")
    assert "<title>" in svg and "<desc>" in svg
    assert CANONICAL_SOURCE in svg
    assert 'role="img"' in svg
    csv_text = (dest / "table.csv").read_text(encoding="utf-8")
    lowered = csv_text.lower()
    for marker in PII_MARKERS:
        assert marker not in lowered
    assert "00091238000170" not in csv_text
    assert re.search(r"\bcpf\b", lowered) is None
    src = _source()
    assert json.dumps(src["stats"]["p25"]) in csv_text
    assert json.dumps(src["stats"]["median"]) in csv_text
    assert json.dumps(src["stats"]["p75"]) in csv_text
    assert embed_has_visible_source(embed)
    assert embed_has_tracker(embed) is False
    assert 'data-tracker="none"' in embed
    assert "<script" not in embed.lower()
    synd = json.loads((dest / "syndication.json").read_text(encoding="utf-8"))
    assert synd["auto_send"] is False
    assert synd["sent"] is False
    for row in synd["targets"]:
        assert row["status"] == "PREPARED_NOT_SENT"
        assert row["outcome"] == "UNKNOWN"
        assert row.get("sent") is False
    with pytest.raises(SchemaError, match="auto_send_must_be_false"):
        validate_manifest({**synd, "auto_send": True})
    dataset = json.loads((dest / "dataset.jsonld").read_text(encoding="utf-8"))
    assert dataset["@type"] == "Dataset"
    assert dataset["distribution"]["@type"] == "DataDownload"
    assert dataset["distribution"]["contentUrl"].endswith("table.csv")
    rebuilt = dict(package)
    rebuilt.pop("output_dir", None)
    rebuilt.pop("public_dir", None)
    for key in list(rebuilt):
        if str(key).startswith("_"):
            rebuilt.pop(key)
    assert package_hash(rebuilt) == package["package_hash"]


def test_cli_real_generate_twice_hash_stable(tmp_path):
    out1 = tmp_path / "real-a"
    out2 = tmp_path / "real-b"
    cmd = [
        sys.executable,
        "-m",
        "scripts.data_desk",
        "generate",
        "--as-of",
        AS_OF,
    ]
    first = subprocess.run(cmd + ["--out", str(out1)], cwd=ROOT, check=True, capture_output=True, text=True)
    second = subprocess.run(cmd + ["--out", str(out2)], cwd=ROOT, check=True, capture_output=True, text=True)
    hash1 = json.loads((out1 / "package.json").read_text(encoding="utf-8"))["package_hash"]
    hash2 = json.loads((out2 / "package.json").read_text(encoding="utf-8"))["package_hash"]
    assert hash1 == hash2
    assert WATERMARK not in first.stdout
    assert "auto_send: false" in first.stdout
    assert CANONICAL_SOURCE in (out1 / "citation.txt").read_text(encoding="utf-8")
    names = sorted(p.name for p in out1.iterdir() if p.is_file())
    assert names == sorted(p.name for p in out2.iterdir() if p.is_file())
    for name in names:
        assert (out1 / name).read_bytes() == (out2 / name).read_bytes()


def test_payload_update_invalidates_package():
    asset = load_asset(REAL_ASSET, root=ROOT)
    old = build_package(asset, asset_dir=REAL_ASSET.parent, generated_at=AS_OF)
    changed = dict(asset)
    changed["data_version"] = "sc-pavimentacao-ticket-1.1"
    changed["as_of"] = "2026-08-18T00:00:00+00:00"
    changed["stats"] = dict(asset["stats"])
    changed["stats"]["median"] = asset["stats"]["median"]
    updated = invalidate_on_update(old, changed, asset_dir=REAL_ASSET.parent)
    assert updated["package_hash"] != old["package_hash"]
    assert updated["invalidated_previous"] == old["package_hash"]


def test_public_namespace_noindex_and_off_sitemap():
    public = ROOT / PUBLIC_REL
    assert public.is_dir()
    index = public / "index.html"
    assert index.is_file()
    html = index.read_text(encoding="utf-8")
    assert 'content="noindex,follow"' in html
    assert CANONICAL_SOURCE in html
    assert WATERMARK not in html
    assert "<script" not in html.lower()
    sitemap = " ".join(load_sitemap_urls(ROOT))
    assert "/assets/data-desk/" not in sitemap
    assert "valor-tipico-contratos-pavimentacao-sc/v1" not in sitemap
    headers = (ROOT / "_headers").read_text(encoding="utf-8")
    assert "/assets/data-desk/*" in headers
    assert "noindex, follow" in headers
    for path in public.rglob("*"):
        if not path.is_file():
            continue
        raw = path.read_text(encoding="utf-8", errors="replace")
        text = raw.lower()
        assert WATERMARK.lower() not in text
        for marker in ("-----begin", "private key"):
            assert marker not in text
        # The request contract lists cpf/rg as forbidden fields. That is not PII.
        if path.name != "request-contract.json":
            assert re.search(r"\bcpf\b", text) is None
        assert re.search(r"\b\d{11}\b", raw) is None


def test_targets_prepared_not_sent():
    researched = json.loads(
        (ROOT / "data" / "data-desk" / "distribution" / "targets-researched.v1.json").read_text(encoding="utf-8")
    )
    finalists = json.loads(
        (ROOT / "data" / "data-desk" / "distribution" / "finalists.v1.json").read_text(encoding="utf-8")
    )
    assert researched["auto_send"] is False
    assert finalists["auto_send"] is False
    assert len(researched["targets"]) >= 10
    assert len(finalists["targets"]) == 5
    required = (
        "organization",
        "public_url",
        "why_useful",
        "angle",
        "asset_link",
        "contact_route",
        "status",
        "outcome",
    )
    for row in finalists["targets"]:
        for field in required:
            assert row.get(field), field
        assert row["status"] == "PREPARED_NOT_SENT"
        assert row["outcome"] == "UNKNOWN"
        assert row.get("sent") is not True
        assert CANONICAL_SOURCE in row["asset_link"]
