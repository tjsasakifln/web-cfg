"""Publish the pinned FreeCAD engine locally; browsers never fetch a release host."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from hashlib import file_digest
import json
import os
from pathlib import Path
import shutil
import sys
from tempfile import NamedTemporaryFile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/cad/suite"))
sys.path.insert(0, str(ROOT))
from release_download import download_release
from scripts.site.cache_contract import upsert_hashed_cache_block

MANIFEST = json.loads(Path(__file__).with_name("runtime.json").read_text())


def verified(path: Path, spec: dict) -> bool:
    if not path.is_file() or path.stat().st_size != spec["size"]:
        return False
    with path.open("rb") as source:
        return file_digest(source, "sha256").hexdigest() == spec["sha256"]


def obtain(spec: dict, cache: Path) -> Path:
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / spec["sha256"]
    if verified(target, spec):
        return target
    with NamedTemporaryFile(dir=cache, delete=False) as stream:
        temporary = Path(stream.name)
    try:
        download_release(spec["url"], temporary, spec["sha256"])
        if not verified(temporary, spec):
            raise ValueError("FreeCAD: tamanho ou SHA-256 diverge da versão fixada.")
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    return target


def install(site: Path, cache: Path) -> dict:
    manifest = MANIFEST
    specs = list(manifest["files"].values())
    with ThreadPoolExecutor(max_workers=3) as workers:
        sources = list(workers.map(lambda spec: obtain(spec, cache), specs))
    for spec, source in zip(specs, sources):
        relative = spec["path"].removeprefix("/")
        if not relative.startswith("assets/freecad/") or ".." in Path(relative).parts:
            raise ValueError("FreeCAD: destino inválido.")
        destination = site / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    target = site / "assets/freecad"
    public = {key: value for key, value in manifest.items() if key != "adapted_sources"}
    (target / "runtime.json").write_text(json.dumps(public, ensure_ascii=False, indent=2) + "\n")
    shutil.copyfile(Path(__file__).with_name("sysconfig.py"), target / "sysconfig.txt")
    headers = site / "_headers"
    text = upsert_hashed_cache_block(
        headers.read_text(), [spec["path"] for spec in specs],
        begin="# BEGIN FREECAD HASHED ASSETS", end="# END FREECAD HASHED ASSETS",
    )
    headers.write_text(text)
    return {"version": manifest["version"], "files": len(specs), "bytes": sum(spec["size"] for spec in specs)}


if __name__ == "__main__":
    site = Path(sys.argv[1]).resolve()
    cache = Path(os.environ.get("CONFENGE_FREECAD_CACHE", str(Path.home() / ".cache/confenge-web-freecad")))
    print(json.dumps({"freecad": install(site, cache)}, ensure_ascii=False))
