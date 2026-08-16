"""Dataset/DataDownload JSON-LD only when a real dataset/distribution exists."""

from __future__ import annotations

from typing import Any


def has_real_dataset(asset: dict[str, Any], *, csv_text: str | None) -> bool:
    if asset.get("has_dataset") is not True:
        return False
    dataset = asset.get("dataset")
    if not isinstance(dataset, dict):
        return False
    if not dataset.get("name") or not dataset.get("description"):
        return False
    if not csv_text or not str(csv_text).strip():
        return False
    return True


def dataset_jsonld(
    asset: dict[str, Any],
    package: dict[str, Any],
    *,
    csv_text: str | None,
) -> dict[str, Any] | None:
    """Emit Dataset + DataDownload only for a real aggregated distribution."""
    if not has_real_dataset(asset, csv_text=csv_text):
        return None
    dataset = asset["dataset"]
    content_url = package.get("csv_url")
    if not content_url:
        return None
    # Fixture packages have no public canonical — still describe the package
    # distribution so tests can prove the rule; they must not be published.
    return {
        "@context": "https://schema.org",
        "@type": "Dataset",
        "name": dataset.get("name"),
        "description": dataset.get("description"),
        "creator": {"@type": "Organization", "name": package.get("creator"), "url": "https://confenge.com.br/"},
        "publisher": {"@type": "Organization", "name": package.get("publisher"), "url": "https://confenge.com.br/"},
        "license": package.get("license"),
        "identifier": package.get("identifier"),
        "dateModified": package.get("as_of"),
        "isAccessibleForFree": True,
        "distribution": {
            "@type": "DataDownload",
            "encodingFormat": dataset.get("encoding_format") or "text/csv",
            "contentUrl": content_url,
            "name": dataset.get("download_filename") or "download.csv",
        },
    }
