"""The packaged license document must participate in canonical page coverage."""

import json
from pathlib import Path
import shutil
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.pseo.public_artifact import inventory_public_routes
from scripts.site.public_surface_coverage import coverage_report
from scripts.site.site_excellence import measure_published_route_census
from scripts.site.test_integral_solution_copy import coverage_problems


APPLICATION = "cad/freecad/index.html"
DOCUMENT = "cad/freecad/creditos.html"
VENDOR = "cad/freecad/unrelated-vendor-page.html"
ROUTES = ["/cad/freecad/", "/" + DOCUMENT]


def _html(root, relative, body="<h1>Fontes e licenças</h1>"):
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('<meta name="robots" content="noindex"><main>' + body + "</main>")


def _manifest(root, routes):
    path = root / "manifest.json"
    path.write_text(json.dumps({"html_route_count": len(routes), "html_routes": routes}))
    return path


def test_freecad_supporting_document_is_inventoried_without_vendor_html(tmp_path):
    application = tmp_path / "cad/freecad"
    application.mkdir(parents=True)
    (application / "index.html").write_text("<html>entry</html>")
    (application / "creditos.html").write_text("<html>sources and licenses</html>")
    (application / "unrelated-vendor-page.html").write_text("<html>not declared</html>")

    inventory = inventory_public_routes(tmp_path)

    assert inventory["html_routes"] == ["/cad/freecad/", "/cad/freecad/creditos.html"]
    assert inventory["html_route_count"] == 2


def test_inventory_does_not_claim_a_missing_supporting_document(tmp_path):
    application = tmp_path / "cad/freecad"
    application.mkdir(parents=True)
    (application / "index.html").write_text("<html>entry</html>")

    inventory = inventory_public_routes(tmp_path)

    assert inventory["html_routes"] == ["/cad/freecad/"]


def test_artifact_census_recognizes_document_without_admitting_vendor_html(tmp_path):
    artifact = tmp_path / "artifact"
    for relative in (APPLICATION, DOCUMENT, VENDOR):
        _html(artifact, relative)
    manifest = _manifest(tmp_path, ROUTES)

    report = coverage_report(artifact, manifest)

    assert report["ok"], report["errors"]
    assert report["artifact_html_total"] == report["copy_scanned_html"] == 3
    assert report["artifact_index_routes"] == 1
    assert report["artifact_manifest_routes"] == report["manifest_routes"] == 2


def test_artifact_census_rejects_missing_document_even_when_index_exists(tmp_path):
    artifact = tmp_path / "artifact"
    _html(artifact, APPLICATION)
    manifest = _manifest(tmp_path, ROUTES)

    report = coverage_report(artifact, manifest)

    assert not report["ok"]
    assert report["manifest_routes_missing_from_artifact"] == ["/" + DOCUMENT]


def test_artifact_census_rejects_document_omitted_from_manifest(tmp_path):
    artifact = tmp_path / "artifact"
    for relative in (APPLICATION, DOCUMENT):
        _html(artifact, relative)
    manifest = _manifest(tmp_path, ROUTES[:1])

    report = coverage_report(artifact, manifest)

    assert not report["ok"]
    assert report["artifact_routes_unlisted"] == ["/" + DOCUMENT]


def test_artifact_census_rejects_vendor_html_promoted_to_declared_route(tmp_path):
    artifact = tmp_path / "artifact"
    for relative in (APPLICATION, DOCUMENT, VENDOR):
        _html(artifact, relative)
    manifest = _manifest(tmp_path, ROUTES + ["/" + VENDOR])

    report = coverage_report(artifact, manifest)

    assert not report["ok"]
    assert report["manifest_routes_missing_from_artifact"] == ["/" + VENDOR]
    assert report["copy_scanned_html"] == 3


def test_vendor_html_keeps_copy_enforcement_outside_manifest_route_class(tmp_path):
    artifact = tmp_path / "artifact"
    for relative in (APPLICATION, DOCUMENT):
        _html(artifact, relative)
    _html(artifact, VENDOR, "<h1>Ferramenta</h1><p>proof_state: DRAFT</p>")
    manifest = _manifest(tmp_path, ROUTES)

    report = coverage_report(artifact, manifest)

    assert not report["ok"]
    assert VENDOR in report["copy_findings"] or VENDOR in report["semantic_findings"]
    assert report["copy_scanned_html"] == 3


def test_integral_copy_coverage_reads_filename_document_at_its_real_path(tmp_path):
    manifest = _manifest(tmp_path, ROUTES)

    assert coverage_problems(
        tmp_path, [APPLICATION, DOCUMENT], require_artifact=True, manifest=manifest
    ) == []
    assert coverage_problems(
        tmp_path, [APPLICATION], require_artifact=True, manifest=manifest
    ) == [f"declared public route not read by the gate: {DOCUMENT}"]


@pytest.mark.parametrize("omitted_from", ["neither", "artifact", "manifest", "both"])
def test_scorecard_document_census_preserves_independent_source_and_artifact(tmp_path, omitted_from):
    source = tmp_path / "source"
    artifact = tmp_path / "artifact"
    for relative in (APPLICATION, DOCUMENT, VENDOR):
        _html(source, relative)
    shutil.copytree(source, artifact)
    if omitted_from in {"artifact", "both"}:
        (artifact / DOCUMENT).unlink()
    manifest = _manifest(
        tmp_path, ROUTES[:1] if omitted_from in {"manifest", "both"} else ROUTES
    )

    report = measure_published_route_census(source, artifact, manifest)

    expected = []
    if omitted_from in {"artifact", "both"}:
        expected.append("census_artifact_drift")
    if omitted_from in {"manifest", "both"}:
        expected.append("census_manifest_drift")
    assert report["status"] == ("MEASURED_FAIL" if expected else "MEASURED_PASS")
    assert report["codes"] == expected
    assert report["evidence"]["source_count"] == 3
    assert report["evidence"]["manifest_expected_count"] == 2
