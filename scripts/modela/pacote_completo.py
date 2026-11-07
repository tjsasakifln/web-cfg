"""Build the complete public application from one verified upstream source archive."""
from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import tarfile
from urllib.request import urlopen
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent
ROUTE = Path("avaliacao-imoveis-urbanos/inferencia")
# Only executable application sources, its curated configuration, and user documentation.
# Source root PDFs, real cases, uploads, job stores and private credentials are never inputs.
SOURCE_DIRS = {"backend", "frontend", "modules", "profiles", "constraints", ".devcontainer"}
SCRIPTS = {"c15_local", "publico"}
FILES = {"README.md", "SECURITY.md", "THIRD_PARTY_NOTICES.md", "MANIFEST.in", "pyproject.toml",
         "requirements.txt", "setup.py", "Dockerfile", "compose.yaml", "compose.yml",
         "docker-compose.yml", "INICIAR.md", "Dockerfile.public", ".dockerignore"}
SUFFIXES = {".py", ".json", ".css", ".md", ".html", ".txt", ".sh", ".cmd", ".yml", ".yaml", ".toml", ".svg"}

def include(path):
    parts = path.parts
    if len(parts) == 1:
        return path.name in FILES
    if any(part in {"__pycache__", ".git", "uploads", "secrets"} for part in parts):
        return False
    allowed = parts[0] in SOURCE_DIRS or (len(parts) > 2 and parts[0] == "scripts" and parts[1] in SCRIPTS)
    return allowed and (path.suffix.lower() in SUFFIXES or path.name == "Dockerfile")

def compile_package(dest):
    pin = json.loads((ROOT / "versao-completa.json").read_text())
    sha = pin["commit"]
    url = f"https://codeload.github.com/tjsasakifln/modelapro/tar.gz/{sha}"
    cached = os.environ.get("MODELA_COMPLETE_ARCHIVE")
    source = Path(cached).read_bytes() if cached else urlopen(url, timeout=90).read(20_000_000)
    if hashlib.sha256(source).hexdigest() != pin["sha256"]:
        raise ValueError("O hash da distribuição do Modela Pro divergiu da versão aprovada.")
    dest.mkdir(parents=True, exist_ok=True)
    package = dest / "modela-pro-completo.zip"
    with tarfile.open(fileobj=io.BytesIO(source),mode="r:gz") as tar, ZipFile(package, "w") as out:
        for entry in sorted(tar, key=lambda item:item.name):
            parts = PurePosixPath(entry.name).parts
            if not entry.isfile() or len(parts)<2 or parts[0] != f"modelapro-{sha}" or ".." in parts:
                continue
            relative = PurePosixPath(*parts[1:])
            if not include(relative):
                continue
            data = tar.extractfile(entry).read()
            info = ZipInfo("modela-pro/"+str(relative),(2026,11,7,0,0,0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = (0o100755 if entry.mode & 0o111 else 0o100644) << 16
            out.writestr(info,data)
        for required in ("pyproject.toml","README.md","frontend/app.py","backend/api.py","modules/normative_rules.py"):
            out.getinfo("modela-pro/"+required)
    return package

if __name__ == "__main__":
    import sys
    print(compile_package(Path(sys.argv[1]).resolve() / ROUTE))
