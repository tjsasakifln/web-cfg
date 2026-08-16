"""Generate one Data Desk package. Default asset is the labeled fixture."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from scripts.data_desk.embed import build_embed, embed_has_tracker
from scripts.data_desk.hashing import package_hash, sha256_text, version_label
from scripts.data_desk.metadata import dataset_jsonld, has_real_dataset
from scripts.data_desk.request import request_contract
from scripts.data_desk.schema import (
    PACKAGE_SCHEMA,
    REQUIRED_PACKAGE_FIELDS,
    SENSITIVE_KEYS,
    WATERMARK,
    SchemaError,
)
from scripts.data_desk.syndication import build_manifest
from scripts.discovery.registry import repo_root

DEFAULT_ASSET_ID = "fixture-only-citation-kit"
DEFAULT_ASSET_REL = Path("data/data-desk/fixture/asset.v1.json")
DEFAULT_OUT_REL = Path("data/data-desk/packages/fixture-only")


def load_asset(path: Path | None = None, *, root: Path | None = None) -> dict[str, Any]:
    root = root or repo_root()
    target = path or (root / DEFAULT_ASSET_REL)
    asset = json.loads(target.read_text(encoding="utf-8"))
    if asset.get("schema") != "data_desk_asset_v1":
        raise SchemaError(f"unexpected_asset_schema:{asset.get('schema')}")
    return asset


def assert_no_sensitive(payload: Any, *, trail: str = "root") -> None:
    if isinstance(payload, dict):
        forbidden = SENSITIVE_KEYS.intersection(payload)
        if forbidden:
            raise SchemaError("sensitive_key:" + ",".join(sorted(forbidden)))
        for key, value in payload.items():
            assert_no_sensitive(value, trail=f"{trail}.{key}")
    elif isinstance(payload, list):
        for idx, value in enumerate(payload):
            assert_no_sensitive(value, trail=f"{trail}[{idx}]")
    elif isinstance(payload, str):
        lowered = payload.lower()
        if "-----begin" in lowered and "private key" in lowered:
            raise SchemaError("sensitive_pem")


def _read_sidecar(asset_dir: Path, name: str | None) -> tuple[str | None, str | None]:
    if not name:
        return None, None
    path = asset_dir / name
    if not path.is_file():
        return None, None
    text = path.read_text(encoding="utf-8")
    return text, sha256_text(text)


def press_brief(asset: dict[str, Any], package: dict[str, Any]) -> str:
    watermark = package.get("watermark") or ""
    lines = [
        f"# {asset.get('title')}",
        "",
        f"**Watermark:** {watermark}" if watermark else "",
        f"**Identifier:** {package.get('identifier')}",
        f"**As of:** {package.get('as_of')}",
        f"**Method / schema / data:** {package.get('method_version')} / {package.get('schema_version')} / {package.get('data_version')}",
        f"**Permalink:** {package.get('permalink')}",
        f"**Public canonical:** {package.get('canonical') or '(none — not a public asset)'}",
        "",
        "## Citation",
        "",
        package.get("citation_text") or "",
        "",
        "## Coverage",
        "",
        package.get("coverage") or "",
        "",
        "## Limitations",
        "",
        package.get("limitations") or "",
        "",
        "## What these data can answer",
        "",
        asset.get("can_answer") or "Only the questions listed in the asset record.",
        "",
        "## What these data cannot answer",
        "",
        asset.get("cannot_answer") or "Anything outside coverage and limitations.",
        "",
        "## Correction",
        "",
        f"Corrections: {package.get('correction_link')}",
        f"Owner: {package.get('correction_owner') or asset.get('correction_owner')}",
        "",
        "## Contact",
        "",
        "Human review only. This package does not send outreach or accept automated promises.",
        "",
        "## License / usage",
        "",
        f"{package.get('license')}",
        "",
        package.get("usage_guidance") or "",
        "",
    ]
    return "\n".join(line for line in lines if line is not None)


def build_package(
    asset: dict[str, Any],
    *,
    asset_dir: Path,
    generated_at: str,
) -> dict[str, Any]:
    csv_text, csv_hash = _read_sidecar(asset_dir, asset.get("csv"))
    svg_text, svg_hash = _read_sidecar(asset_dir, (asset.get("media") or {}).get("svg"))
    png_name = (asset.get("media") or {}).get("png")
    png_hash = None
    if png_name and (asset_dir / png_name).is_file():
        png_hash = sha256_text((asset_dir / png_name).read_bytes().decode("latin-1"))

    fixture = bool(asset.get("fixture") or asset.get("label") == WATERMARK or asset.get("watermark") == WATERMARK)
    public_canonical = asset.get("public_canonical")
    if fixture:
        public_canonical = None
    permalink = asset.get("permalink")
    csv_url = None
    if csv_text and permalink:
        filename = (asset.get("dataset") or {}).get("download_filename") or asset.get("csv")
        csv_url = f"{permalink.rstrip('/')}/{filename}"

    package: dict[str, Any] = {
        "schema": PACKAGE_SCHEMA,
        "id": asset.get("id"),
        "title": asset.get("title"),
        "watermark": WATERMARK if fixture else asset.get("watermark"),
        "fixture": fixture,
        "permalink": permalink,
        "canonical": public_canonical,
        "public_canonical": public_canonical,
        "citation_text": asset.get("citation_text"),
        "method_version": asset.get("method_version"),
        "schema_version": asset.get("schema_version") or asset.get("schema"),
        "data_version": asset.get("data_version"),
        "as_of": asset.get("as_of"),
        "coverage": asset.get("coverage"),
        "limitations": asset.get("limitations"),
        "correction_link": asset.get("correction_link") or "https://confenge.com.br/correcoes/",
        "correction_owner": asset.get("correction_owner") or asset.get("owner"),
        "creator": asset.get("creator") or "CONFENGE",
        "publisher": asset.get("publisher") or "CONFENGE",
        "license": asset.get("license"),
        "usage_guidance": asset.get("usage_guidance"),
        "identifier": asset.get("identifier") or asset.get("id"),
        "provenance": asset.get("provenance"),
        "has_dataset": has_real_dataset(asset, csv_text=csv_text),
        "dataset": asset.get("dataset") if has_real_dataset(asset, csv_text=csv_text) else None,
        "csv_url": csv_url if has_real_dataset(asset, csv_text=csv_text) else None,
        "csv_included": bool(csv_text),
        "svg_included": bool(svg_text),
        "png_included": bool(png_name and (asset_dir / str(png_name)).is_file()),
        "csv_sha256": csv_hash,
        "svg_sha256": svg_hash,
        "png_sha256": png_hash,
        "sitemap": False if fixture else bool(asset.get("sitemap")),
        "external_distribution": False if fixture else bool(asset.get("external_distribution")),
        "indexable": False if fixture else bool(asset.get("indexable")),
        "generated_at": generated_at,
        "previous_package_hash": asset.get("previous_package_hash"),
    }
    package["package_hash"] = package_hash(package)
    package["package_version"] = version_label(package)
    jsonld = dataset_jsonld(asset, package, csv_text=csv_text)
    package["dataset_jsonld"] = jsonld
    embed_html = build_embed(package, svg_markup=svg_text)
    if embed_has_tracker(embed_html):
        raise SchemaError("embed_tracker_forbidden")
    package["embed_html"] = embed_html
    package["request_contract"] = request_contract(asset)
    package["syndication"] = build_manifest(asset, package_version=package["package_version"])
    assert_no_sensitive(package)
    missing = [field for field in REQUIRED_PACKAGE_FIELDS if not package.get(field) and field != "canonical"]
    # canonical may be null on fixture
    if fixture:
        missing = [field for field in missing if field != "canonical"]
    if missing:
        raise SchemaError("package_missing_fields:" + ",".join(missing))
    if fixture and package.get("canonical"):
        raise SchemaError("fixture_must_not_have_public_canonical")
    return package


def write_package(
    package: dict[str, Any],
    *,
    out_dir: Path,
    asset_dir: Path,
    asset: dict[str, Any],
) -> Path:
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "package.json").write_text(
        json.dumps(package, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    (out_dir / "citation.txt").write_text(str(package.get("citation_text") or "") + "\n", encoding="utf-8")
    (out_dir / "PRESS-BRIEF.md").write_text(press_brief(asset, package), encoding="utf-8")
    (out_dir / "embed.html").write_text(package["embed_html"], encoding="utf-8")
    (out_dir / "request-contract.json").write_text(
        json.dumps(package["request_contract"], ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    (out_dir / "syndication.json").write_text(
        json.dumps(package["syndication"], ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    if package.get("dataset_jsonld"):
        (out_dir / "dataset.jsonld").write_text(
            json.dumps(package["dataset_jsonld"], ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    csv_name = asset.get("csv")
    if csv_name and (asset_dir / csv_name).is_file():
        shutil.copy2(asset_dir / csv_name, out_dir / csv_name)
    svg_name = (asset.get("media") or {}).get("svg")
    if svg_name and (asset_dir / svg_name).is_file():
        shutil.copy2(asset_dir / svg_name, out_dir / svg_name)
    png_name = (asset.get("media") or {}).get("png")
    if png_name and (asset_dir / png_name).is_file():
        shutil.copy2(asset_dir / png_name, out_dir / png_name)
    (out_dir / "WATERMARK.txt").write_text(str(package.get("watermark") or "") + "\n", encoding="utf-8")
    return out_dir


def generate(
    *,
    root: Path | None = None,
    asset_path: Path | None = None,
    out_dir: Path | None = None,
    generated_at: str | None = None,
) -> dict[str, Any]:
    root = root or repo_root()
    asset = load_asset(asset_path, root=root)
    asset_dir = (asset_path or (root / DEFAULT_ASSET_REL)).parent
    stamp = generated_at or asset.get("as_of") or "1970-01-01"
    package = build_package(asset, asset_dir=asset_dir, generated_at=stamp)
    dest = out_dir or (root / DEFAULT_OUT_REL)
    write_package(package, out_dir=dest, asset_dir=asset_dir, asset=asset)
    package["output_dir"] = str(dest)
    return package


def invalidate_on_update(old_package: dict[str, Any], new_asset: dict[str, Any], *, asset_dir: Path) -> dict[str, Any]:
    """A correction or version bump must change the package hash."""
    new_asset = dict(new_asset)
    new_asset["previous_package_hash"] = old_package.get("package_hash")
    updated = build_package(
        new_asset,
        asset_dir=asset_dir,
        generated_at=str(new_asset.get("as_of") or old_package.get("generated_at")),
    )
    if updated["package_hash"] == old_package.get("package_hash"):
        raise SchemaError("update_did_not_invalidate_hash")
    updated["invalidated_previous"] = old_package.get("package_hash")
    return updated


def format_generate(package: dict[str, Any]) -> str:
    lines = [
        "DATA DESK PACKAGE",
        f"id: {package.get('id')}",
        f"watermark: {package.get('watermark')}",
        f"permalink: {package.get('permalink')}",
        f"public_canonical: {package.get('canonical')}",
        f"package_version: {package.get('package_version')}",
        f"package_hash: {package.get('package_hash')}",
        f"has_dataset: {str(package.get('has_dataset')).lower()}",
        f"dataset_jsonld: {str(bool(package.get('dataset_jsonld'))).lower()}",
        f"csv_included: {str(package.get('csv_included')).lower()}",
        f"svg_included: {str(package.get('svg_included')).lower()}",
        f"sitemap: {str(package.get('sitemap')).lower()}",
        f"external_distribution: {str(package.get('external_distribution')).lower()}",
        f"syndication.auto_send: {str((package.get('syndication') or {}).get('auto_send')).lower()}",
        f"request.prazo: {(package.get('request_contract') or {}).get('prazo')}",
        f"output_dir: {package.get('output_dir')}",
        "",
        "CITATION",
        f"  {package.get('citation_text')}",
        "",
    ]
    return "\n".join(lines)
