#!/usr/bin/env python3
"""Build the pinned CONFENGE OpenCAD edition and its complete corresponding source.

Run only in an isolated builder. This script writes packages, never publishes a site.
"""
from __future__ import annotations

import base64
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile

REPO = Path(__file__).resolve().parents[4]
BUILD_FILES = Path(__file__).resolve().parent
OUTPUT = REPO / "scripts/cad/opencad"
WORK = REPO / ".cache/opencad-confenge-build"
SOURCE = WORK / "opencad-confenge"
VENDOR = WORK / "opencad-vendor"
RUNTIME = WORK / "runtime"
HOSTING = WORK / "hosting"
TARGET_CACHE = REPO / ".cache/opencad-target"
UPSTREAM = "https://github.com/HakanSeven12/OpenCADStudio.git"
COMMIT = "fb0a667e269b6c924233ecd450a11dd7cba40eea"
VERSION = "2026.45+confenge.1"
LOGO_SHA256 = "e6bb135d070993411cb46adce88747187f3decd2f85f23e9899a9c89e97e7586"
PART_SIZE = 48 * 1024 * 1024
HOSTING_FILES = (
    "cad/index.html", "cad/editor.css", "cad/editor.js", "cad/host-protocol.mjs",
    "cad/editor/frame.htm", "cad/editor/frame.css", "cad/editor/start.js",
    "assets/js/tool-credits.mjs", "assets/js/tool-referral.mjs",
    "assets/css/tool-credits.css", "assets/logo-confenge-white.png",
    "runtime/tools-commerce/exports.cjs", "scripts/cad/publicar.py", "_headers",
)


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def run(*args: str, cwd: Path = SOURCE, capture: bool = False) -> str:
    result = subprocess.run(args, cwd=cwd, check=True, text=True,
                            stdout=subprocess.PIPE if capture else None)
    return result.stdout if capture else ""


def add_tree(archive: tarfile.TarFile, root: Path, prefix: str) -> None:
    for current, directories, files in os.walk(root):
        directories[:] = sorted(
            name for name in directories
            if name not in {".git", "__pycache__"}
            and not (root == SOURCE and Path(current) == root and name in {"target", "dist"})
        )
        for name in sorted(files):
            path = Path(current) / name
            relative = path.relative_to(root).as_posix()
            archive_name = f"{prefix}/{relative}" if prefix else relative
            info = archive.gettarinfo(str(path), arcname=archive_name)
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            info.mtime = 0
            if info.isfile():
                info.mode = 0o755 if os.access(path, os.X_OK) else 0o644
                with path.open("rb") as stream:
                    archive.addfile(info, stream)
            elif info.issym():
                target = (path.parent / os.readlink(path)).resolve()
                if not target.is_relative_to(root.resolve()):
                    raise RuntimeError(f"Source symlink leaves its tree: {path}")
                archive.addfile(info)
            else:
                raise RuntimeError(f"Unsupported source entry: {path}")


def package(name: str, trees: list[tuple[Path, str]]) -> dict:
    path = WORK / name
    with path.open("wb") as raw:
        with gzip.GzipFile(fileobj=raw, mode="wb", filename="", mtime=0, compresslevel=6) as compressed:
            with tarfile.open(fileobj=compressed, mode="w|", format=tarfile.PAX_FORMAT) as archive:
                for tree, prefix in trees:
                    add_tree(archive, tree, prefix)
    parts = []
    with path.open("rb") as stream:
        index = 1
        while block := stream.read(PART_SIZE):
            part = OUTPUT / f"{name}.part-{index:03d}"
            part.write_bytes(block)
            parts.append({"file": part.name, "sha256": digest(part), "bytes": len(block)})
            index += 1
    return {"archive": name, "sha256": digest(path), "bytes": path.stat().st_size,
            "parts": parts}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if WORK.exists():
        raise SystemExit(f"Use a clean builder; output already exists: {WORK}")
    WORK.mkdir(parents=True)
    logo = REPO / "assets/logo-confenge-white.png"
    if digest(logo) != LOGO_SHA256:
        raise SystemExit("The CONFENGE logo changed. Review and pin the approved artwork first.")
    run("git", "init", str(SOURCE), cwd=WORK)
    run("git", "fetch", "--depth=1", UPSTREAM, COMMIT)
    run("git", "checkout", "--detach", "FETCH_HEAD")
    if run("git", "rev-parse", "HEAD", capture=True).strip() != COMMIT:
        raise SystemExit("Unexpected upstream revision")
    patch = BUILD_FILES / "confenge.patch"
    run("git", "apply", "--check", str(patch))
    run("git", "apply", str(patch))
    shutil.copyfile(logo, SOURCE / "assets/confenge-logo.png")
    encoded = base64.b64encode(logo.read_bytes()).decode("ascii")
    (SOURCE / "assets/logo.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        'width="800" height="208" viewBox="0 0 800 208"><image width="800" height="208" '
        f'xlink:href="data:image/png;base64,{encoded}"/></svg>\n', encoding="utf-8")
    shutil.copyfile(patch, SOURCE / "CONFENGE-UPSTREAM.patch")
    source_build = SOURCE / "confenge-build"
    source_build.mkdir()
    for entry in BUILD_FILES.iterdir():
        if entry.is_file():
            shutil.copyfile(entry, source_build / entry.name)
    workflow = REPO / ".github/workflows/build-opencad-confenge.yml"
    shutil.copyfile(workflow, source_build / "build-opencad-confenge.yml")
    host_commit = run("git", "rev-parse", "HEAD", cwd=REPO, capture=True).strip()
    if os.environ.get("GITHUB_SHA") and host_commit != os.environ["GITHUB_SHA"]:
        raise SystemExit("The hosting checkout does not match the triggering commit")
    host_files = {}
    for relative in HOSTING_FILES:
        target = HOSTING / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(REPO / relative, target)
        host_files[relative] = digest(target)
    (HOSTING / "ORIGIN.json").write_text(json.dumps({
        "repository": "https://github.com/tjsasakifln/web-cfg",
        "commit": host_commit, "files": host_files,
    }, indent=2) + "\n", encoding="utf-8")
    # Complete vendoring includes all lockfile targets, because Cargo resolves
    # native workspace members even when compiling only the WebAssembly target.
    vendor_config = run("cargo", "vendor", "--locked", "--versioned-dirs", str(VENDOR), capture=True)
    vendor_config = vendor_config.replace(str(VENDOR), "../opencad-vendor")
    (SOURCE / "CONFENGE-VENDOR-CONFIG.toml").write_text(vendor_config, encoding="utf-8")
    cargo_config = SOURCE / ".cargo/config.toml"
    with cargo_config.open("a", encoding="utf-8") as stream:
        stream.write("\n# Complete corresponding source, including vendored dependencies.\n")
        stream.write(vendor_config)
    TARGET_CACHE.mkdir(parents=True, exist_ok=True)
    (SOURCE / "target").symlink_to(TARGET_CACHE, target_is_directory=True)
    os.environ["CARGO_TARGET_DIR"] = str(TARGET_CACHE)
    os.environ["CARGO_NET_OFFLINE"] = "true"
    os.environ["CARGO_BUILD_JOBS"] = "1"
    os.environ["CONFENGE_CAD_OUTPUT"] = str(RUNTIME)
    run("sh", "scripts/build-confenge-web.sh")
    required = ["confenge-cad.js", "confenge-cad_bg.wasm", "ocs-parse-worker.js",
                "worker_pkg/ocs_web_worker.js", "worker_pkg/ocs_web_worker_bg.wasm",
                "ocs-control.js", "fonts/latin.ttf", "fonts/OFL.txt", "logo.png"]
    for relative in required:
        if not (RUNTIME / relative).is_file():
            raise SystemExit(f"Missing runtime output: {relative}")
    for relative in ["confenge-cad_bg.wasm", "worker_pkg/ocs_web_worker_bg.wasm"]:
        with (RUNTIME / relative).open("rb") as stream:
            if stream.read(4) != b"\0asm":
                raise SystemExit(f"Invalid WebAssembly magic: {relative}")
    # Only generated package parts are replaced. Builder source and the rest of
    # the site stay untouched; publication remains the repository release flow.
    for pattern in ("opencad-runtime.tar.gz.part-*", "corresponding-source.tar.gz.part-*"):
        for old in OUTPUT.glob(pattern):
            old.unlink()
    runtime = package("opencad-runtime.tar.gz", [(RUNTIME, "")])
    runtime["files"] = {path.relative_to(RUNTIME).as_posix(): digest(path)
                        for path in sorted(RUNTIME.rglob("*")) if path.is_file()}
    source = package("corresponding-source.tar.gz",
                     [(SOURCE, "opencad-confenge"), (VENDOR, "opencad-vendor"),
                      (HOSTING, "hosting")])
    shutil.copyfile(SOURCE / "LICENSE", OUTPUT / "LICENSE.txt")
    notice = (SOURCE / "CONFENGE-NOTICE.md").read_text(encoding="utf-8")
    notice += (
        "\nCódigo-fonte correspondente desta edição, com dependências e instruções de compilação:\n"
        "/cad/editor/licencas/corresponding-source.tar.gz\n"
        "\nTexto integral da licença GNU GPL v3:\n/cad/editor/licencas/GPL-3.0.txt\n"
        "\nAs fontes tipográficas incluídas conservam a licença SIL Open Font License, "
        "disponível em /cad/editor/fonts/OFL.txt e no pacote correspondente. "
        "As demais licenças estão junto de suas dependências em opencad-vendor.\n"
        "\nA pasta hosting do pacote registra os arquivos da ponte CONFENGE usados nesta compilação.\n"
        f"Revisão da hospedagem: {host_commit}\n"
    )
    (OUTPUT / "NOTICE.txt").write_text(notice, encoding="utf-8")
    manifest = {
        "schema": 1, "engine": "OpenCAD Studio", "version": VERSION,
        "upstream": {"repository": UPSTREAM.removesuffix(".git"), "ref": "v2026.45", "commit": COMMIT},
        "build": {"rust": "1.99.1", "wasm_bindgen": "0.2.108", "profile": "release",
                  "optimization": 3, "jobs": 1, "patch_sha256": digest(patch),
                  "logo_sha256": LOGO_SHA256, "host_commit": host_commit,
                  "host_files": host_files},
        "runtime": runtime, "source": source,
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"runtime_bytes": runtime["bytes"], "source_bytes": source["bytes"],
                      "runtime_sha256": runtime["sha256"], "source_sha256": source["sha256"]}, indent=2))


if __name__ == "__main__":
    main()
