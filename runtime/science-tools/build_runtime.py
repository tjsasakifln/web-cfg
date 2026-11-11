"""Build a relocatable, hash-locked scientific runtime before release packaging."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from email.parser import Parser

ROOT = Path(__file__).resolve().parent
PYTHON_URL = "https://github.com/astral-sh/python-build-standalone/releases/download/20261110/cpython-3.12.16%2B20261110-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz"
PYTHON_SHA256 = "6a9e62dad033790aef722dbd370e0ce76ce17b73627ba3ae679f537049350b39"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def patch_meshers(site):
    patches = []
    for name, relative in (("sectionproperties", "sectionproperties/pre/pre.py"), ("concreteproperties", "concreteproperties/analysis_section.py")):
        file = site / relative
        original = file.read_text()
        marker = "import cytriangle as triangle"
        if original.count(marker) != 1:
            raise RuntimeError(f"{name} mesher import changed; review the pinned adapter")
        file.write_text(original.replace(marker, "import confenge_mesh as triangle  # CONFENGE GEOS mesher; no Triangle"))
        metadata = next(site.glob(name + "-*.dist-info/METADATA"))
        metadata.write_text("\n".join(line for line in metadata.read_text().splitlines() if not line.lower().startswith("requires-dist: cytriangle")) + "\n")
        patches.append({"path": relative, "original_sha256": hashlib.sha256(original.encode()).hexdigest(), "modified_sha256": digest(file), "change": "Replace CyTriangle with confenge_mesh; numerical analysis code unchanged."})
    return patches


def license_inventory(target):
    distributions=[]
    for metadata in sorted((target/'lib/python3.12/site-packages').glob('*.dist-info/METADATA')):
        info=Parser().parsestr(metadata.read_text())
        notices=[p for p in metadata.parent.rglob('*') if p.is_file() and any(word in p.name.lower() for word in ('license','licence','copying','notice'))]
        if not notices:
            raise RuntimeError('License text missing for '+info['Name'])
        distributions.append({'name':info['Name'],'version':info['Version'],'project_urls':info.get_all('Project-URL',[]),'license':info.get('License-Expression') or info.get('License') or [v for v in info.get_all('Classifier',[]) if v.startswith('License ::')], 'notices':[{'path':str(p.relative_to(target)),'sha256':digest(p)} for p in notices]})
    # Font licenses are outside wheel metadata and must remain in the release.
    fonts=target/'lib/python3.12/site-packages/matplotlib/mpl-data/fonts/ttf'
    for name in ('LICENSE_DEJAVU','LICENSE_STIX'):
        if not (fonts/name).is_file(): raise RuntimeError('Font license missing: '+name)
    return distributions


def build():
    target = ROOT / "python"
    if target.exists():
        raise RuntimeError("python runtime already exists; remove the generated directory before rebuilding")
    with tempfile.TemporaryDirectory(prefix="confenge-science-build-") as temporary:
        temp = Path(temporary)
        archive = temp / "python.tar.gz"
        with urllib.request.urlopen(PYTHON_URL, timeout=60) as source, archive.open("wb") as out:
            shutil.copyfileobj(source, out)
        if digest(archive) != PYTHON_SHA256:
            raise RuntimeError("python distribution checksum mismatch")
        with tarfile.open(archive) as tar:
            tar.extractall(temp / "unpacked", filter="data")
        # The immutable release format deliberately forbids symbolic links.
        shutil.copytree(temp / "unpacked/python", target, symlinks=False)
    python = target / "bin/python3.12"
    subprocess.run([str(python), "-m", "pip", "install", "--disable-pip-version-check", "--no-cache-dir", "--no-compile", "--no-deps", "--only-binary=:all:", "--require-hashes", "-r", str(ROOT / "requirements.lock")], check=True)
    site = target / "lib/python3.12/site-packages"
    if any(site.glob("*triangle*")):
        raise RuntimeError("Triangle/CyTriangle is prohibited in the commercial runtime")
    patches = patch_meshers(site)
    # Only execution files remain. Test fixtures include certificates and SQL;
    # they are not calculation inputs and must not weaken release hygiene.
    for path in sorted(target.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if not path.exists():
            continue
        if path.is_dir() and path.name in {"__pycache__", "test", "tests", ".pytest_cache", "idlelib", "tkinter", "ensurepip"}:
            shutil.rmtree(path)
        elif path.is_file() and path.suffix.lower() in {".pyc", ".pem", ".key", ".sql", ".sqlite", ".sqlite3", ".a"}:
            path.unlink()
    for path in site.glob("pip*"):
        shutil.rmtree(path) if path.is_dir() else path.unlink()
    for path in (target / "bin").iterdir():
        if path.name != "python3.12":
            path.unlink() if path.is_file() else shutil.rmtree(path)
    licenses=license_inventory(target)
    (ROOT/'license-inventory.json').write_text(json.dumps(licenses,indent=2)+'\n')
    notices=ROOT/'licenses/python-standalone'
    provenance=json.loads((notices/'provenance.json').read_text())
    if provenance.get('python_version') != '3.12.16' or not (notices/'LICENSE.openssl-3.txt').is_file():
        raise RuntimeError('Standalone Python dependency license provenance is missing')
    manifest = {"schema": "confenge.science-runtime/v1", "python": "3.12.16", "platform": "linux-x86_64-gnu", "python_url": PYTHON_URL, "python_sha256": PYTHON_SHA256, "requirements_sha256": digest(ROOT / "requirements.lock"), "licenses_sha256":digest(ROOT/'license-inventory.json'), "patches": patches, "triangle_included": False}
    (ROOT / "runtime-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("Scientific runtime prepared from pinned distributions; no host installation required.")


if __name__ == "__main__":
    build()
