#!/usr/bin/env python3
"""The four private-project demonstrative CSVs must enter the public package."""

from __future__ import annotations

import hashlib
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.public_artifact import (  # noqa: E402
    assemble_public_artifact,
    is_authorized_public_nested_data_dir,
    is_authorized_public_nested_data_file,
)

CSV_RELPATHS = (
    "casos/demonstrativo-projeto-privado/data/coordenacao.csv",
    "casos/demonstrativo-projeto-privado/data/orcamento.csv",
    "casos/demonstrativo-projeto-privado/data/quantitativos.csv",
    "casos/demonstrativo-projeto-privado/data/revisao.csv",
)


def test_allowed_nested_data_dir_is_exact() -> None:
    assert is_authorized_public_nested_data_dir("casos/demonstrativo-projeto-privado/data")
    assert is_authorized_public_nested_data_dir("casos/demonstrativo-infraestrutura/data")
    assert not is_authorized_public_nested_data_dir("data")
    assert not is_authorized_public_nested_data_dir("ops/data")
    assert is_authorized_public_nested_data_file(
        "casos/demonstrativo-projeto-privado/data/revisao.csv"
    )


def test_four_demonstrative_csvs_are_copied_with_matching_bodies(tmp_path: Path | None = None) -> None:
    dest_name = "_site_test_demonstrative_csv_packaging"
    dest = ROOT / dest_name
    try:
        report = assemble_public_artifact(root=ROOT, dest_name=dest_name)
        assert not report.get("errors"), report.get("errors")
        assert not (dest / "data").exists(), "repository data/ must stay out of the package"
        for rel in CSV_RELPATHS:
            source = ROOT / rel
            packaged = dest / rel
            assert source.is_file(), rel
            source_bytes = source.read_bytes()
            assert source_bytes, rel
            assert packaged.is_file(), f"missing from package: {rel}"
            packaged_bytes = packaged.read_bytes()
            assert packaged_bytes == source_bytes, rel
            assert hashlib.sha256(packaged_bytes).hexdigest() == hashlib.sha256(source_bytes).hexdigest()
            assert b";" in packaged_bytes
    finally:
        shutil.rmtree(dest, ignore_errors=True)


if __name__ == "__main__":
    test_allowed_nested_data_dir_is_exact()
    test_four_demonstrative_csvs_are_copied_with_matching_bodies()
    print("test_demonstrative_csv_packaging OK")
