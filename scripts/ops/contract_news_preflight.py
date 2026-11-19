#!/usr/bin/env python3
"""Read-only news deployment readiness; report presence, never credential values."""
from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path


def inspect_env(path: Path) -> dict:
    result = {"path": str(path), "exists": path.is_file(), "readable": os.access(path, os.R_OK)}
    if not result["readable"]:
        return result
    keys = {}
    try:
        for line in path.read_text().splitlines():
            match = re.match(r"(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$", line.strip())
            if match and any(token in match[1] for token in ("OPENAI", "DATABASE_URL", "PGHOST", "PGUSER", "RADAR")):
                keys[match[1]] = bool(match[2].strip().strip("\"'"))
        result["configured_names"] = keys
    except (OSError, UnicodeError):
        result["readable"] = False
    return result


def main() -> None:
    result = {"schema": "confenge.contract-news-readiness/v1", "uid": os.getuid()}
    result["paths"] = [
        {"path": item, "exists": Path(item).exists(), "readable": os.access(item, os.R_OK),
         "writable": os.access(item, os.W_OK)}
        for item in ("/etc/confenge-web/runtime.env", "/var/lib/confenge-web",
                     "/var/lib/confenge-market-radar", "/var/lib/confenge-contract-news",
                     "/opt/extra-consultoria", "/opt/confenge-web/current", "/opt/confenge-web/shared")
    ]
    result["runtime_env"] = inspect_env(Path("/etc/confenge-web/runtime.env"))
    try:
        proc = subprocess.run(["systemctl", "list-unit-files", "--no-pager", "--no-legend", "*pncp*", "*radar*", "*contract-news*"], capture_output=True, text=True, timeout=10)
        units = [line.split()[0] for line in proc.stdout.splitlines() if line.split()]
        result["units"] = units
        result["unit_configuration"] = {}
        for unit in units:
            if not re.fullmatch(r"[A-Za-z0-9@._-]+\.(?:service|timer)", unit):
                continue
            prop = subprocess.run(["systemctl", "show", unit, "--property=User,Group,EnvironmentFiles,ActiveState,NextElapseUSecRealtime"], capture_output=True, text=True, timeout=5)
            result["unit_configuration"][unit] = prop.stdout.splitlines()
    except (OSError, subprocess.TimeoutExpired):
        result["unit_configuration_unavailable"] = True
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
