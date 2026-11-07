"""Empacota só o código de distribuição. O HTML público é mantido na árvore bim/."""
import argparse
import gzip
import tarfile
from pathlib import Path

here = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("checkout", type=Path, help="checkout revisado do projeto CONFENGE BIM")
root = parser.parse_args().checkout.resolve()
files = ["package.json", "package-lock.json", "scripts/preparar-web.cjs",
         "scripts/avisos-canivete.cjs", "scripts/fotogrametria-vite.mjs"]
for pattern in ("scripts/build-*.cjs", "web/*.mjs", "web/*.css", "web/*.txt",
                "docs/avisos-*.txt", "docs/LICENCAS-*", "docs/fontes-ifclite.txt"):
    files.extend(str(p.relative_to(root)) for p in root.glob(pattern))
examples = ["modelo-piloto.ifc", "modelo-piloto-r02.ifc", "checklist-parede.ids", "flange-180mm.ifc",
            "lote-chapas.txt", "pavilhao-ipe.ifc", "planta-digitalizada.pdf", "planta-digitalizada.dwg",
            "prancha-ocr.pdf", "prancha-ocr-p1.dwg", "vistas-galpao.zip"]
files.extend("examples/" + name for name in examples)
with (here / "aplicativo.tar.gz").open("wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", filename="", mtime=0) as compressed:
    with tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for name in sorted(set(files)):
            src = root / name
            entry = tarfile.TarInfo(name)
            entry.size = src.stat().st_size
            entry.mode = 0o644
            with src.open("rb") as data:
                archive.addfile(entry, data)
