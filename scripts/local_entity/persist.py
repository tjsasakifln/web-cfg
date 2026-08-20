"""Write local-entity artifacts after PII / honesty scans."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.local_entity.validate import PIILeakError, scan_artifact_payload


def persist_json(path: Path, doc: dict[str, Any]) -> None:
    errors = scan_artifact_payload(doc, path.name)
    if errors:
        raise PIILeakError(path.name + ":" + ",".join(errors))
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
    again = scan_artifact_payload(payload, path.name)
    if again:
        raise PIILeakError(path.name + ":" + ",".join(again))
    path.write_text(payload, encoding="utf-8")


def write_bundle(out_dir: Path, artifacts: dict[str, dict[str, Any]]) -> list[str]:
    written: list[str] = []
    for name, doc in artifacts.items():
        path = out_dir / name
        persist_json(path, doc)
        written.append(str(path))
    return written
