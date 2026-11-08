"""Install pinned browser runtime into the public artifact, independent of host Python."""

from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from io import BytesIO
import json
import os
from pathlib import Path
import shutil
import sys
import tarfile
import tempfile
from urllib.request import urlopen
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

HERE = Path(__file__).resolve().parent
ROUTE = Path("avaliacao-imoveis-urbanos/inferencia/engine")
# Minimal complete import closure of the public functions. No projects or reports.
MODULES = (
    "__init__ config_manager logging_manager model_builder influence_policy normative_rules "
    "nbr14653_validation preprocessing variable_schema results result_contract utils "
    "transformations target_transform cost_valuation/__init__ cost_valuation/reconstruction"
).split()


def read_verified(url, digest, local):
    if local.is_file():
        data = local.read_bytes()
        if sha256(data).hexdigest() == digest:
            return data
    for attempt in range(3):
        try:
            with urlopen(url, timeout=60) as response:
                data = response.read(25_000_000)
            if sha256(data).hexdigest() != digest:
                raise ValueError("Conteúdo não corresponde ao SHA-256 fixado: " + url)
            return data
        except OSError:
            if attempt == 2:
                raise


def install(public_root):
    target = public_root / ROUTE
    runtime = target / "runtime"
    runtime.mkdir(parents=True, exist_ok=True)
    for name in ("worker.mjs", "client.mjs"):
        source = HERE.parents[1] / ROUTE / name
        if source.resolve() != (target / name).resolve():
            shutil.copyfile(source, target / name)
    cache = Path(
        os.environ.get("MODELA_ASSET_CACHE")
        or (Path(tempfile.gettempdir()) / "confenge-modela-assets")
    )
    cache.mkdir(parents=True, exist_ok=True)

    def copy(entry):
        name, (url, digest) = entry
        data = read_verified(url, digest, cache / name)
        (runtime / name).write_bytes(data)
        if not (cache / name).exists():
            (cache / name).write_bytes(data)

    pins = json.loads((HERE / "runtime-lock.json").read_text())
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(copy, pins.items()))
    version = json.loads((HERE / "versao-completa.json").read_text())
    rev = version["commit"]
    data = read_verified(
        "https://codeload.github.com/tjsasakifln/modelapro/tar.gz/" + rev,
        version["sha256"],
        Path(os.environ.get("MODELA_COMPLETE_ARCHIVE", str(cache / (rev + ".tgz")))),
    )
    with tarfile.open(fileobj=BytesIO(data), mode="r:gz") as src, ZipFile(
        runtime / "modela.zip", "w"
    ) as out:

        def write(name, payload):
            info = ZipInfo(name, (2026, 11, 7, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            out.writestr(info, payload)

        for module in MODULES:
            name = "modules/" + module + ".py"
            write(name, src.extractfile("modelapro-" + rev + "/" + name).read())
        write("browser_core.py", (HERE / "browser_core.py").read_bytes())
        write("REVISION", rev.encode())
    print(
        "Modela Pro "
        + rev[:8]
        + " | "
        + str(len(pins))
        + " arquivos de execução verificados"
    )


if __name__ == "__main__":
    install(Path(sys.argv[1]).resolve())
