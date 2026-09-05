"""Parse the exclusive-B2G hardcode inventory table."""

from __future__ import annotations

from pathlib import Path

VALID_CLASSIFICATIONS = frozenset(
    {"KEEP_VERTICAL", "GENERALIZE_CORPORATE", "REPLACE", "REMOVE_OBSOLETE"}
)
REQUIRED_COLUMNS = (
    "arquivo",
    "simbolo_trecho",
    "funcao",
    "classificacao",
    "substituicao",
    "teste",
)

ROOT = Path(__file__).resolve().parents[2]
INVENTORY_PATH = ROOT / "docs" / "architecture" / "B2G-EXCLUSIVE-HARDCODE-INVENTORY.md"


class InventoryError(ValueError):
    """Inventory table failed closed."""


def parse_inventory_table(text: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    header_seen = False
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line.startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) != 6:
            raise InventoryError(f"inventory_column_count_invalid:{len(cells)}")
        if not header_seen:
            header_seen = True
            continue
        if set("".join(cells)) <= set("-: "):
            continue
        row = {
            "arquivo": cells[0],
            "simbolo_trecho": cells[1],
            "funcao": cells[2],
            "classificacao": cells[3],
            "substituicao": cells[4],
            "teste": cells[5],
        }
        if row["classificacao"] not in VALID_CLASSIFICATIONS:
            raise InventoryError(f"inventory_classification_invalid:{row['classificacao']}")
        for key in REQUIRED_COLUMNS:
            if not row[key]:
                raise InventoryError(f"inventory_field_missing:{key}")
        rows.append(row)
    if not rows:
        raise InventoryError("inventory_empty")
    return rows


def load_inventory(path: Path | None = None) -> list[dict[str, str]]:
    target = path or INVENTORY_PATH
    return parse_inventory_table(target.read_text(encoding="utf-8"))
