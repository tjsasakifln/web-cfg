from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from seo.scripts.validate_seo import internal_target_exists


def test_missing_route_and_redirect_target_fail(tmp_path):
    assert not internal_target_exists(tmp_path, "/nao-existe/", "")
    assert not internal_target_exists(tmp_path, "/old/", "/old /missing 301")
    assert not internal_target_exists(tmp_path, "/loop/", "/loop /other 301\n/other /loop 301")


def test_files_pretty_urls_and_explicit_redirects(tmp_path):
    (tmp_path / "new").mkdir()
    (tmp_path / "new/index.html").write_text('<h1 id="answer">Answer</h1>')
    (tmp_path / "guide.pdf").write_bytes(b"fixture")
    rules = "/old /new/ 301\n/archive/* /:splat 301\n/gone /new/ 410"
    for href in ("/new", "/new/", "/new/?view=1#answer", "/old/", "/archive/new/", "/guide.pdf"):
        assert internal_target_exists(tmp_path, href, rules), href
    assert not internal_target_exists(tmp_path, "/gone", rules)
    assert not internal_target_exists(tmp_path, "/../outside", rules)


def test_runtime_rewrite_requires_existing_handler(tmp_path):
    rules = "/api/example /.netlify/functions/example 200"
    assert not internal_target_exists(tmp_path, "/api/example", rules)
    functions = tmp_path / "netlify/functions"
    functions.mkdir(parents=True)
    (functions / "example.cjs").write_text("exports.handler = async () => ({statusCode: 200});")
    assert internal_target_exists(tmp_path, "/api/example", rules)


def test_packaged_example_must_exist_in_build_source(tmp_path):
    import io
    import tarfile
    archive = tmp_path / "scripts/bim/aplicativo.tar.gz"
    archive.parent.mkdir(parents=True)
    with tarfile.open(archive, "w:gz") as package:
        entry = tarfile.TarInfo("examples/sample.ifc")
        entry.size = 3
        package.addfile(entry, io.BytesIO(b"IFC"))
    assert internal_target_exists(tmp_path, "/bim/examples/sample.ifc", "")
    assert not internal_target_exists(tmp_path, "/bim/examples/missing.ifc", "")
