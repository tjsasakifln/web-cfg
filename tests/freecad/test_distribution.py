from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import sys
import runpy
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location("freecad_installer", ROOT / "scripts/freecad/install.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
from scripts.site.cache_contract import parse_header_rules, require_html_override_no_transform
from scripts.site.csp_contract import apply_wallet_document_policies, csp_directives_from_text


def test_release_is_pinned_and_public_manifest_has_exact_payload():
    private = installer.MANIFEST
    public = json.loads((ROOT / "assets/freecad/runtime.json").read_text())
    assert {k: v for k, v in private.items() if k != "adapted_sources"} == public
    assert private["decoded_bytes"] == 503224999
    assert sum(entry["size"] for entry in private["files"].values()) == private["decoded_bytes"]
    for name, entry in private["files"].items():
        assert entry["url"] == "https://github.com/Virtastic/freecad-web/releases/download/v1.0.9/" + name
        assert entry["sha256"][:12] in entry["path"]


def test_corrupt_cached_payload_is_never_accepted(tmp_path):
    data = b"fixed runtime"
    expected = {"size": len(data), "sha256": sha256(data).hexdigest()}
    path = tmp_path / "runtime"
    path.write_bytes(data)
    assert installer.verified(path, expected)
    path.write_bytes(b"wrong runtime")
    assert not installer.verified(path, expected)
    path.write_bytes(data[:-1])
    assert not installer.verified(path, expected)


def test_isolation_and_wasm_authority_do_not_leak_to_the_launcher(tmp_path):
    headers = (ROOT / "_headers").read_text()
    parsed = parse_header_rules(headers)
    assert not require_html_override_no_transform(parsed=parsed, label="source")
    runtime = parsed["/cad/freecad/*"]
    assert runtime["cross-origin-opener-policy"] == "same-origin"
    assert runtime["cross-origin-embedder-policy"] == "require-corp"
    assert "noindex" in runtime["x-robots-tag"]
    assert "wasm-unsafe-eval" not in parsed["/*"]["content-security-policy"]
    for route in ["cad/freecad", "ferramentas/modelador-parametrico-3d"]:
        (tmp_path / route).mkdir(parents=True)
        (tmp_path / route / "index.html").write_text("<html></html>")
    result = parse_header_rules(apply_wallet_document_policies(headers, tmp_path))
    app = result["/cad/freecad/"]["content-security-policy"]
    launcher = result["/ferramentas/modelador-parametrico-3d/"]["content-security-policy"]
    assert "wasm-unsafe-eval" in app and "wasm-unsafe-eval" not in launcher
    assert "identitytoolkit.googleapis.com" in app
    assert "apis.google.com" not in app and "firebaseapp.com" not in app
    assert "frame-src 'none'" in app


def test_engine_cannot_be_downloaded_by_reading_the_public_page():
    page = (ROOT / "ferramentas/modelador-parametrico-3d/index.html").read_text()
    script = (ROOT / "ferramentas/modelador-parametrico-3d/launcher.mjs").read_text()
    assert "503 MB" in page and "cópia" in page and "FCStd" in page
    assert "FreeCAD.wasm" not in page and "FreeCAD.data" not in page
    assert "fetch(" not in script and "import(" not in script
    assert 'addEventListener(\'click\'' in script
    assert '<h1 id="titulo">Modelador paramétrico 3D grátis no navegador</h1>' in page


def test_copied_compatibility_does_not_install_remote_features_or_inject_query_into_python():
    graphics = (ROOT / "cad/freecad/vendor/graphics.js").read_text()
    runtime = (ROOT / "cad/freecad/runtime.mjs").read_text()
    assert "_fcaddonreq" not in graphics
    assert "fcweb_share" not in graphics
    assert "location.search" not in graphics
    assert "7 * 86400" not in graphics
    assert "_os.remove(_os.path.join(self.DIR, f))" not in graphics
    assert "__fcHttpDeviceInstall" not in runtime
    assert "__fcSessionPreboot" not in runtime
    assert "getPreloadedPackage" in runtime and "wasmBinary: wasm" in runtime
    assert "FemWorkbench" in (ROOT / "cad/freecad/bootstrap.txt").read_text()
    assert "GPL-3.0-only" in (ROOT / "cad/freecad/vendor/qtloader.js").read_text()
    for path in ["LICENSE-FreeCAD-Web.txt", "NOTICE-upstream.txt", "NOTICE.txt", "licenses/GPL-3.0-only.txt", "licenses/LGPL-3.0-only.txt"]:
        assert (ROOT / "cad/freecad" / path).is_file()


def test_dialog_escape_and_bridge_errors_never_accept_an_action(monkeypatch):
    roles = ['Ok', 'Yes', 'YesToAll', 'No', 'NoToAll', 'Abort', 'Retry', 'Ignore',
             'Save', 'SaveAll', 'Discard', 'Apply', 'Reset', 'Close', 'Cancel']
    messagebox = type("MessageBox", (), {name: 1 << i for i, name in enumerate(roles)})
    messagebox.NoButton = 0
    bridge = SimpleNamespace(confirm=lambda *_: -1)
    monkeypatch.setitem(sys.modules, "PySide6", SimpleNamespace(QtWidgets=SimpleNamespace(QMessageBox=messagebox)))
    monkeypatch.setitem(sys.modules, "_fcwebdlg", bridge)
    runpy.run_path(str(ROOT / "cad/freecad/vendor/dialogs.txt"))
    assert messagebox.question(None, 'title', 'body', messagebox.Yes) == messagebox.NoButton
    assert messagebox.question(None, 'title', 'body', messagebox.Yes | messagebox.No) == messagebox.No
    assert messagebox.question(None, 'title', 'body', messagebox.Save | messagebox.Discard | messagebox.Cancel) == messagebox.Cancel
    instance = messagebox()
    instance.standardButtons = lambda: (_ for _ in ()).throw(RuntimeError('bridge failed'))
    assert instance.exec() == messagebox.NoButton
