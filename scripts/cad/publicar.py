"""Install the pinned, unmodified CADCraft web runtime into the public site."""
import hashlib
import os
import re
from pathlib import Path
import shutil
import sys
import tempfile
import urllib.request
import zipfile

VERSION = "0.18.0"
DIGEST = "2440d15ebe28ce0a97f107a860f96d3bc21d98381b9f685676843b876a4d9086"
RELEASE = f"https://github.com/storytold/cadcraft/releases/download/v{VERSION}/cadcraft-web-{VERSION}.zip"
BASENAME = "cadcraft-web-d875c3c223026021"
SNIPPET = "snippets/eframe-d31a8450ea12dfc1/inline0.js"
FILES = {
    name: name for name in [BASENAME + ".js", BASENAME + "_bg.wasm", SNIPPET]
}
for name in ["NOTICE", "LICENSE-MIT", "LICENSE-APACHE", "ATTRIBUTION.md"]:
    FILES[name] = "licencas/" + name.removesuffix(".md") + ".txt"


def valid(path):
    return path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == DIGEST


def install(output):
    cache = Path.home() / ".cache" / "confenge-cad"
    cache.mkdir(mode=0o700, parents=True, exist_ok=True)
    archive = cache / (DIGEST + ".zip")
    if not valid(archive):
        with tempfile.NamedTemporaryFile(dir=cache, delete=False) as temp:
            name = Path(temp.name)
        try:
            with urllib.request.urlopen(RELEASE, timeout=90) as response, name.open("wb") as tmp:
                shutil.copyfileobj(response, tmp)
            if not valid(name):
                raise ValueError("O pacote CADCraft recebido diverge da versão fixada.")
            os.replace(name, archive)
        finally:
            name.unlink(missing_ok=True)
    with zipfile.ZipFile(archive) as z:
        for src, dst in FILES.items():
            path = output / "cad" / "editor" / dst
            path.parent.mkdir(parents=True, exist_ok=True)
            with z.open(f"cadcraft-web-{VERSION}/{src}") as inp, path.open("wb") as out:
                shutil.copyfileobj(inp, out)


def version_editor_assets(output):
    # The origin caches unversioned JS for hours. Bind each parent to the
    # bytes of its children so returning visitors get one consistent editor.
    links = {
        "drawing.mjs": ["../bim/web/vendor-cad/acad.mjs"],
        "codec-worker.mjs": ["./drawing.mjs"],
        "codec.js": ["./codec-worker.mjs"],
        "editor/frame.htm": ["./start.js", "./frame.css"],
        "editor.js": ["./codec.js", "./preview.mjs", "/cad/editor/frame.htm?host=parent"],
        "index.html": ["/cad/editor.js"],
    }
    for parent, children in links.items():
        path = output / "cad" / parent
        html_or_js = path.read_text(encoding="utf-8")
        for url in children:
            filename = url.split("?", 1)[0]
            asset = output / filename.lstrip("/") if filename.startswith("/") else path.parent / filename
            digest = hashlib.sha256(asset.read_bytes()).hexdigest()[:16]
            prefix = url + ("&" if "?" in url else "?") + "v="
            pattern = re.escape(url) + r"(?:[?&]v=[a-f0-9]+)?(?=['\"])"
            html_or_js, count = re.subn(pattern, prefix + digest, html_or_js)
            if not count:
                raise ValueError(f"Missing CAD asset reference: {parent} -> {url}")
        path.write_text(html_or_js, encoding="utf-8")


if __name__ == "__main__":
    output = Path(sys.argv[1])
    install(output)
    version_editor_assets(output)
