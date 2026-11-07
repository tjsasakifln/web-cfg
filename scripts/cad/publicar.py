"""Install the pinned, unmodified CADCraft web runtime into the public site."""
import hashlib
import os
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


if __name__ == "__main__":
    install(Path(sys.argv[1]))
