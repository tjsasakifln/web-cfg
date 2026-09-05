"""Scan owned strategy documents for exclusive-B2G corporate claims.

B2G as a specialist vertical is allowed. B2G as the only corporate category
is not. Historical/superseded blocks may quote the old thesis.
"""

from __future__ import annotations

import re
from pathlib import Path

HISTORICAL_BLOCK = re.compile(
    r"<!--\s*SUPERSEDED_THESIS_START\s*-->.*?<!--\s*SUPERSEDED_THESIS_END\s*-->",
    re.DOTALL | re.IGNORECASE,
)

EXCLUSIVE_B2G_CORPORATE = (
    re.compile(r"B2G intelligence company", re.IGNORECASE),
    re.compile(r"principal ativo brasileiro de aquisi[cç][aã]o B2G", re.IGNORECASE),
    re.compile(r"only corporate market.{0,40}B2G", re.IGNORECASE),
    re.compile(r"B2G as the only corporate", re.IGNORECASE),
    re.compile(r"unica categoria corporativa.{0,40}B2G", re.IGNORECASE),
    re.compile(r"CONFENGE is a B2G", re.IGNORECASE),
    re.compile(r"empresa B2G aplicada", re.IGNORECASE),
    re.compile(
        r"for B2G \(business-to-government\) engineering consulting focused",
        re.IGNORECASE,
    ),
)

OWNED_STRATEGY_PATHS = (
    Path("AGENTS.md"),
    Path("docs/architecture/ADR-STRAT-002-confenge-canonical-public-surface.md"),
    Path("docs/strategy/MARKET-CAPTURE-OS.md"),
    Path("docs/architecture/system-architecture.md"),
)


def strip_superseded_thesis(text: str) -> str:
    return HISTORICAL_BLOCK.sub(" ", text)


def exclusive_b2g_corporate_hits(text: str) -> list[str]:
    live = strip_superseded_thesis(text)
    hits: list[str] = []
    for pattern in EXCLUSIVE_B2G_CORPORATE:
        for match in pattern.finditer(live):
            hits.append(match.group(0))
    return hits


def scan_strategy_text(text: str, *, source: str) -> list[str]:
    return [f"{source}: exclusive B2G corporate claim: {hit}" for hit in exclusive_b2g_corporate_hits(text)]


def scan_owned_strategy_docs(root: Path) -> list[str]:
    findings: list[str] = []
    for relative in OWNED_STRATEGY_PATHS:
        path = root / relative
        findings.extend(scan_strategy_text(path.read_text(encoding="utf-8"), source=str(relative)))
    return findings
