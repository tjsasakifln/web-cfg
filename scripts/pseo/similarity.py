"""Textual similarity gate: near-duplicate pages fail or consolidate."""

from __future__ import annotations

import re
from typing import Iterable

# Jaccard on word shingles — pages above threshold are too similar.
DEFAULT_THRESHOLD = 0.82


def tokenize(text: str) -> set[str]:
    t = (text or "").lower()
    t = re.sub(r"[^\w\s]", " ", t, flags=re.UNICODE)
    return {w for w in t.split() if len(w) > 2}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def find_similar_pairs(
    items: Iterable[tuple[str, str]],
    threshold: float = DEFAULT_THRESHOLD,
) -> list[tuple[str, str, float]]:
    """items: (id, text). Returns pairs (id_a, id_b, score) >= threshold."""
    arr = list(items)
    tokens = [(i, tokenize(t)) for i, t in arr]
    pairs: list[tuple[str, str, float]] = []
    for i in range(len(tokens)):
        for j in range(i + 1, len(tokens)):
            s = jaccard(tokens[i][1], tokens[j][1])
            if s >= threshold:
                pairs.append((tokens[i][0], tokens[j][0], round(s, 4)))
    return pairs
