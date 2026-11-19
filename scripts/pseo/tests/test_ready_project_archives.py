"""Exercise real public copying and post-build inspection with forbidden ZIPs."""
from pathlib import Path
from unittest.mock import patch

from scripts.pseo.public_artifact import assemble_public_artifact, audit_public_artifact


def put(root: Path, relative: str, value: bytes) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(value)


def test_residential_archives_cannot_be_published(tmp_path: Path) -> None:
    private = (
        "assets/projects-ready/license.zip",
        "assets/projects-ready/nested/license.ZIP",
        "projetos-prontos/entrega/license.zip",
    )
    for relative in private:
        put(tmp_path, relative, b"PK\x03\x04private-commercial-archive")
    public = "assets/public-tool/download.zip"
    preview = "assets/projects-ready/preview.pdf"
    put(tmp_path, public, b"PK\x03\x04authorized-public-tool")
    put(tmp_path, preview, b"%PDF-public-preview")
    put(tmp_path, "projetos-prontos/index.html", b"<!doctype html><title>Consulta</title>")
    # Finalization is separately gated. Keep this regression focused on the
    # production copier, without downloading unrelated BIM applications.
    finalized = {key: {} for key in (
        "navigation_audit", "css_assets", "commercial_media", "share_preview",
        "public_footer", "structured_identity",
    )}
    finalized.update(promoted_navigation_files=[], scrubbed_html_files=[])
    with patch("scripts.pseo.public_artifact.finalize_public_artifact", return_value=finalized):
        report = assemble_public_artifact(tmp_path)
    assert report["ok"] is False
    assert {f"private_project_archive:{relative}" for relative in private} <= set(report["errors"])
    site = tmp_path / "_site"
    assert not any((site / relative).exists() for relative in private)
    assert (site / public).read_bytes() == b"PK\x03\x04authorized-public-tool"
    assert (site / preview).is_file()

    # Poison the built artifact after the copy. The independent audit must
    # still reject it, while leaving unrelated public download paths alone.
    for relative in private:
        put(site, relative, b"PK\x03\x04private-commercial-archive")
    audit = audit_public_artifact(tmp_path)
    findings = {row["path"] for row in audit["findings"] if row["code"] == "private_project_archive"}
    assert findings == set(private)
    assert audit["ok"] is False
