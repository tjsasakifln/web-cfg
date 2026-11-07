"""Pin and index the eight original browser editions. No end-user request contacts GitHub."""
from base64 import b64encode
from concurrent.futures import ThreadPoolExecutor
from hashlib import file_digest, sha256
import json
from pathlib import Path, PurePosixPath
import re
import shutil
from struct import unpack
import sys
from tempfile import NamedTemporaryFile
from urllib.request import urlopen
from zipfile import ZipFile, ZIP_STORED, ZIP_DEFLATED

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
        with urlopen(spec["url"], timeout=90) as response, temp.open("wb") as output:
            shutil.copyfileobj(response, output)
        if not verified(temp, spec):
            raise ValueError("O ZIP diverge da release fixada.")
        temp.replace(target)
    finally:
        temp.unlink(missing_ok=True)
    return target


def install_app(item, target, cache):
    slug, spec = item
    archive = obtain(spec, cache)
    filename = f"{slug}-{spec['sha256'][:16]}.zip"
    shutil.copyfile(archive, target / filename)
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
            if offset + e.compress_size > spec["size"]:
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
    return slug, {"archive": filename, "size": spec["size"], "scripts": sorted(set(sources)), "files": files}


def install(site):
    target = site / "cad" / "suite" / "pacotes"
    target.mkdir(exist_ok=True, parents=True)
    cache = Path.home() / ".cache" / "confenge-suite-cad"
    with ThreadPoolExecutor(max_workers=3) as workers:
        apps = dict(workers.map(lambda item: install_app(item, target, cache), RELEASES.items()))
    (target / "edicoes.json").write_text(json.dumps(apps, ensure_ascii=True, separators=(",", ":"), sort_keys=True))


if __name__ == "__main__":
    install(Path(sys.argv[1]))
