"""Pin and index the eight original browser editions. No end-user request contacts GitHub."""
from brand import build_archive
from base64 import b64encode
from concurrent.futures import ThreadPoolExecutor
from hashlib import file_digest, sha256
import json
from pathlib import Path, PurePosixPath
import re
import shutil
from struct import unpack
import sys
import tarfile
from tempfile import NamedTemporaryFile, TemporaryDirectory
from zipfile import ZipFile, ZIP_STORED, ZIP_DEFLATED

from release_download import download_release

RELEASES = json.loads(Path(__file__).with_name("releases.json").read_text())
MAX_MEMBER = 10 * 1024 * 1024


def verified(path, spec):
    if not path.is_file() or path.stat().st_size != spec["size"]:
        return False
    with path.open("rb") as src:
        return file_digest(src, "sha256").hexdigest() == spec["sha256"]


def obtain(spec, cache):
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / (spec["sha256"] + ".zip")
    if verified(target, spec):
        return target
    with NamedTemporaryFile(dir=cache, delete=False) as tmp:
        temp = Path(tmp.name)
    try:
        download_release(spec["url"], temp, spec["sha256"])
        if not verified(temp, spec):
            raise ValueError("O ZIP diverge da release fixada.")
        temp.replace(target)
    finally:
        temp.unlink(missing_ok=True)
    return target


def install_app(item, target, cache):
    slug, spec = item
    archive = build_archive(slug, obtain(spec, cache), target)
    filename = archive.name
    archive_size = archive.stat().st_size
    prefix = f"{slug}-browser-edition-v0.8.1/"
    files = {}
    sources = []
    with ZipFile(archive) as z, archive.open("rb") as raw:
        for e in z.infolist():
            if e.is_dir():
                continue
            if not e.filename.startswith(prefix):
                raise ValueError(e.filename)
            name = e.filename[len(prefix):]
            if any(part in ("", ".", "..") for part in name.split("/")) or "\\" in name:
                raise ValueError(name)
            # Never serve server directives or hidden files as application resources.
            if any(part.startswith(".") for part in PurePosixPath(name).parts) or name == "web.config":
                continue
            if name in files or e.file_size > MAX_MEMBER or e.compress_type not in (ZIP_DEFLATED, ZIP_STORED):
                raise ValueError(name)
            raw.seek(e.header_offset)
            header = raw.read(30)
            if header[:4] != b"PK\x03\x04":
                raise ValueError("ZIP local header")
            local_name, extra = unpack("<HH", header[-4:])
            offset = e.header_offset + 30 + local_name + extra
            if offset + e.compress_size > archive_size:
                raise ValueError(name)
            body = z.read(e)  # Verify CRC and hash the uncompressed member.
            files[name] = [offset, e.compress_size, e.file_size, e.compress_type, sha256(body).hexdigest()]
            if name == "index.html":
                for attrs, script in re.findall(rb"<script\b([^>]*)>(.*?)</script\s*>", body, re.I | re.S):
                    kind = re.search(rb"""\btype\s*=\s*["']([^"']+)["']""", attrs, re.I)
                    executable = not kind or kind[1].lower() in (b"importmap", b"module", b"text/javascript", b"application/javascript")
                    if executable and not re.search(rb"\bsrc\s*=", attrs, re.I) and script.strip():
                        sources.append("sha256-" + b64encode(sha256(script).digest()).decode())
    for required in ("index.html", "LICENSE", "NOTICE", "TRADEMARKS.md", "THIRD_PARTY.md"):
        if required not in files:
            raise ValueError(f"{slug}/{required}")
    return slug, {"archive": filename, "size": archive_size, "scripts": sorted(set(sources)), "files": files}


def install_fields(site, cad_archive):
    bundle = Path(__file__).with_name("field-packs-2026-11-07.tar.gz")
    expected = "89887b40ded4d19a70c0a94d02d24c2a670c7162c886edae09b2c88f15ec50c8"
    with bundle.open("rb") as src:
        if file_digest(src, "sha256").hexdigest() != expected:
            raise ValueError("O catálogo de especialidades diverge da cópia verificada.")
    target = site / "assets" / "fields"
    with tarfile.open(bundle, "r:gz") as tar:
        index = json.load(tar.extractfile("index.json"))
        expected_packs = {p["file"]: p for p in index["packs"]}
        host_contract = json.loads((Path(__file__).resolve().parents[3] / "runtime/contract.json").read_text())
        if sorted(p["id"] for p in index["packs"]) != host_contract["cad_field_ids"]:
            raise ValueError("As fichas públicas não correspondem aos 74 pacotes licenciados.")
        if len(expected_packs) != 74 or set(tar.getnames()) != {"index.json", *expected_packs}:
            raise ValueError("Inventário de especialidades inválido.")
        for member in tar.getmembers():
            if not member.isfile() or not re.fullmatch(r"(?:index\.json|[a-z0-9-]+/pack\.json)", member.name):
                raise ValueError(member.name)
            data = tar.extractfile(member).read()
            if member.name != "index.json":
                source = json.loads(data)
                entry = expected_packs[member.name]
                if (not source.get("author") or source.get("license") != "Apache-2.0" or
                        source["id"] != entry["id"] or sha256(data).hexdigest() != entry["sha256"]):
                    raise ValueError(member.name)
            dst = target / member.name
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(data)
    shutil.copyfile(Path(__file__).with_name("NOTICE-fields.txt"), target / "NOTICE.txt")
    with ZipFile(cad_archive) as edition:
        (target / "LICENSE.txt").write_bytes(edition.read("cadcraft-browser-edition-v0.8.1/LICENSE"))


def install_engines(site):
    archive = Path(__file__).with_name("calc-engines-2026-11-07.tar.gz")
    expected = "45e5b89cb52bbd30798755a418b866a52704a8ac985a398c4d3372e63a0bf1ed"
    with archive.open("rb") as source:
        if file_digest(source, "sha256").hexdigest() != expected:
            raise ValueError("Os módulos de cálculo divergem da distribuição verificada.")
    target = site / "assets/cad-engines"
    with tarfile.open(archive, "r:gz") as tar:
        records = json.load(tar.extractfile("origens.json"))
        if set(tar.getnames()) != {"origens.json", *records} or len(records) != 99:
            raise ValueError("Inventário de módulos de cálculo inválido.")
        for member in tar.getmembers():
            path = member.name
            if not member.isfile() or not re.fullmatch(r"(?:[a-z0-9-]+/)*[a-z0-9-]+\.(?:js|json)", path):
                raise ValueError(path)
            data = tar.extractfile(member).read()
            if path in records and (sha256(data).hexdigest() != records[path]["sha256"] or
                                    b"SPDX-License-Identifier: Apache-2.0" not in data[:2500]):
                raise ValueError(path)
            dst = target / path
            if path == "skill-packs.js":
                dst = site / "assets/js/skill-packs.js"  # path used by the official edition
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(data)
    shutil.copyfile(site / "assets/fields/LICENSE.txt", target / "LICENSE.txt")
    shutil.copyfile(Path(__file__).with_name("NOTICE-engines.txt"), target / "NOTICE.txt")


def install(site):
    target = site / "cad" / "suite" / "pacotes"
    target.parent.mkdir(exist_ok=True, parents=True)
    cache = Path.home() / ".cache" / "confenge-suite-cad"
    # A build may reuse its output directory. Publish only this complete generation.
    with TemporaryDirectory(dir=target.parent) as tmp:
        staged = Path(tmp) / "pacotes"
        staged.mkdir()
        with ThreadPoolExecutor(max_workers=3) as workers:
            apps = dict(workers.map(lambda item: install_app(item, staged, cache), RELEASES.items()))
        (staged / "edicoes.json").write_text(json.dumps(apps, ensure_ascii=True, separators=(",", ":"), sort_keys=True))
        if target.exists():
            shutil.rmtree(target)
        target.mkdir()
        for app in apps.values():
            (staged / app["archive"]).replace(target / app["archive"])
        (staged / "edicoes.json").replace(target / "edicoes.json")
    install_fields(site, target / apps["cadcraft"]["archive"])
    install_engines(site)


if __name__ == "__main__":
    install(Path(sys.argv[1]))
