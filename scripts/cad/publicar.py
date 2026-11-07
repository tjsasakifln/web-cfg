"""Install the verified CONFENGE distribution of the CADCraft web runtime."""
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

VERSION = "0.18.0"
DIGEST = "2440d15ebe28ce0a97f107a860f96d3bc21d98381b9f685676843b876a4d9086"
RELEASE = f"https://github.com/storytold/cadcraft/releases/download/v{VERSION}/cadcraft-web-{VERSION}.zip"
BRANDING = Path(__file__).resolve().parent / "branding"
SNIPPET = "snippets/eframe-d31a8450ea12dfc1/inline0.js"
FILES = {SNIPPET: SNIPPET}
for name in ["NOTICE", "LICENSE-MIT", "LICENSE-APACHE", "ATTRIBUTION.md"]:
    FILES[name] = "licencas/" + name.removesuffix(".md") + ".txt"


def valid(path):
    return path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == DIGEST


def verify(path, expected):
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError(f"SHA-256 incorreto para {path.name}.")


def install_runtime(archive, editor):
    receipt = json.loads((BRANDING / "runtime.json").read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory(dir=editor) as tmp:
        stage = Path(tmp)
        for item in receipt["modules"]:
            base = stage / item["source"]
            base.write_bytes(archive.read(f"cadcraft-web-{VERSION}/{base.name}"))
            verify(base, item["source_sha256"])
            delta = BRANDING / item["patch"]
            verify(delta, item["patch_sha256"])
            result = stage / item["target"]
            subprocess.run(["zstd", "-q", "-d", f"--patch-from={base}", str(delta),
                            "-o", str(result)], check=True)
            verify(result, item["target_sha256"])
        for item in receipt["modules"]:
            os.replace(stage / item["target"], editor / item["target"])
        for item in receipt["modules"]:
            (editor / item["source"]).unlink(missing_ok=True)


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
        install_runtime(z, output / "cad" / "editor")


def version_editor_assets(output):
    # The origin caches unversioned JS for hours. Bind each parent to the
    # bytes of its children so returning visitors get one consistent editor.
    links = {
        "editor/start.js": ["./confenge-cad.js", "./confenge-cad_bg.wasm"],
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
