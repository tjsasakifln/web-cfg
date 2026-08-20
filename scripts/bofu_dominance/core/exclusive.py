"""Guard the exclusive BOFU-CORE tree against engine/HTML writes."""

from __future__ import annotations

import ast
from pathlib import Path

from scripts.bofu_dominance.core.constants import FORBIDDEN_IMPORT_PREFIXES, ROOT

CORE_DIR = ROOT / "scripts" / "bofu_dominance" / "core"


def _module_prefix(name: str) -> str | None:
    for prefix in FORBIDDEN_IMPORT_PREFIXES:
        if name == prefix or name.startswith(prefix + "."):
            return prefix
    return None


def scan_forbidden_imports(base: Path | None = None) -> list[dict[str, str]]:
    hits: list[dict[str, str]] = []
    root = base or CORE_DIR
    for path in sorted(root.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    prefix = _module_prefix(alias.name)
                    if prefix:
                        hits.append(
                            {
                                "file": str(path.relative_to(ROOT)),
                                "import": alias.name,
                                "prefix": prefix,
                            }
                        )
            elif isinstance(node, ast.ImportFrom) and node.module:
                prefix = _module_prefix(node.module)
                if prefix:
                    hits.append(
                        {
                            "file": str(path.relative_to(ROOT)),
                            "import": node.module,
                            "prefix": prefix,
                        }
                    )
    return hits


def owned_relative_paths() -> tuple[str, ...]:
    return (
        "scripts/bofu_dominance/core/",
        "data/bofu-dominance/core/",
        "docs/seo/bofu-dominance/core/",
        "tests/bofu_dominance/core/",
    )
