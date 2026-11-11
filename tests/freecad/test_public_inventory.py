"""The packaged license document must participate in canonical page coverage."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.pseo.public_artifact import inventory_public_routes


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
