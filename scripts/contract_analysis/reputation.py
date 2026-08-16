"""Reputational-safety checker for public contract analyses.

Blocks language that infers fraude, irregularidade, culpa, má-fé,
incapacidade or ilegalidade without an explicit documentary/editorial
basis. “Atípico” is never accepted as “irregular”.
"""

from __future__ import annotations

import re
from typing import Any

# Accusatory lemmas that require a named documentary basis.
_ACCUSATORY: tuple[tuple[str, str], ...] = (
    (r"\bfraude\b|\bfraudulent", "reputation_fraude"),
    (r"\birregularidade|\birregular\b", "reputation_irregularidade"),
    (r"\bculpa\b|\bculpado\b|\bculpada\b", "reputation_culpa"),
    (r"\bm[aá]-?\s*f[eé]\b", "reputation_ma_fe"),
    (r"\bincapacidade\b|\bincapaz\b", "reputation_incapacidade"),
    (r"\bilegalidade|\bilegal\b|\bil[ií]cito", "reputation_ilegalidade"),
)

_ATYPICAL = re.compile(r"\bat[ií]pic[oa]s?\b", re.I)

# Allowed documentary-basis kinds. A free-text “we think so” is not a basis.
ALLOWED_BASIS_KINDS = frozenset(
    {
        "official_finding",
        "administrative_decision",
        "court_decision",
        "tcu_acordao",
        "published_sanction",
        "party_admission",
    }
)

ALLOWED_BASIS_TERMS = frozenset(
    {
        "fraude",
        "irregularidade",
        "culpa",
        "ma_fe",
        "má-fé",
        "incapacidade",
        "ilegalidade",
    }
)


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def _collect_text(record: dict[str, Any], extra_text: str = "") -> str:
    chunks = [
        str(record.get("title") or ""),
        str(record.get("executive_summary") or ""),
        str(record.get("why_analysis") or ""),
        str(record.get("insight_singular") or ""),
        str(record.get("cannot_conclude") or ""),
        extra_text,
    ]
    for key in ("facts", "calculations", "comparisons", "interpretation", "timeline"):
        val = record.get(key) or []
        if isinstance(val, list):
            for item in val:
                if isinstance(item, dict):
                    chunks.append(str(item.get("text") or item.get("label") or ""))
                else:
                    chunks.append(str(item))
        else:
            chunks.append(str(val))
    return " ".join(chunks)


_SAFE_SCOPE = re.compile(
    r"n[aã]o\s+(se\s+)?(afirma|conclui|autoriza|implica)|"
    r"n[aã]o\s+(uma\s+)?afirma[cç][aã]o|"
    r"n[aã]o\s+[eé]\s+poss[ií]vel\s+afirmar|"
    r"nem\s+(que\s+|de\s+|houve\s+|h[aá]\s+)|"
    r"sem\s+(afirmar|concluir|imputar)|"
    r"nunca\s+se\s+(afirma|conclui)",
    re.I,
)

# Re-assertion after a negation undoes the safe scope in that window.
_REASSERT = re.compile(
    r"\b(portanto|logo|configura|constitui|trata-se|h[aá]\s+fraude)\b",
    re.I,
)


def _is_negated(blob: str, start: int) -> bool:
    left = max(blob.rfind(".", 0, start), blob.rfind(";", 0, start), 0)
    sentence = blob[left:start]
    if not _SAFE_SCOPE.search(sentence):
        return False
    return not _REASSERT.search(sentence)


def _basis_allows(record: dict[str, Any], code: str) -> bool:
    """True only when the record names a documentary basis for this lemma."""
    wanted = {
        "reputation_fraude": {"fraude"},
        "reputation_irregularidade": {"irregularidade"},
        "reputation_culpa": {"culpa"},
        "reputation_ma_fe": {"ma_fe", "má-fé", "ma-fe"},
        "reputation_incapacidade": {"incapacidade"},
        "reputation_ilegalidade": {"ilegalidade"},
    }.get(code, set())
    for item in record.get("documentary_basis") or []:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or "").strip().lower()
        if kind not in ALLOWED_BASIS_KINDS:
            continue
        if not (item.get("source_ref") or item.get("url") or item.get("document_id")):
            continue
        terms = item.get("allows_terms") or item.get("terms") or []
        normalized = {str(t).strip().lower().replace("á", "a") for t in terms}
        if wanted & normalized or wanted & {t.replace("á", "a") for t in ALLOWED_BASIS_TERMS if t in normalized}:
            return True
        # Explicit allows_terms matching the Portuguese lemma in `code`.
        lemma = code.split("_", 1)[-1].replace("ma_fe", "ma-fe")
        if any(lemma in n or n in lemma for n in normalized):
            return True
    return False


def atypical_collapsed_to_irregular(text: str) -> bool:
    """True when ‘atípico’ is used as a bridge to ‘irregular’ in the same window."""
    blob = _norm(text).lower()
    if not _ATYPICAL.search(blob):
        return False
    if not re.search(r"\birregular", blob):
        return False
    # Same sentence / short window: atípico … portanto/logo/ou seja … irregular
    return bool(
        re.search(
            r"at[ií]pic[oa]s?.{0,80}(portanto|logo|ou seja|configura|constitui|"
            r"trata-se de|é uma|e uma).{0,40}irregular",
            blob,
            flags=re.I,
        )
        or re.search(
            r"irregular.{0,40}(porque|pois|já que|ja que).{0,40}at[ií]pic",
            blob,
            flags=re.I,
        )
    )


def check_reputational_safety(
    record: dict[str, Any],
    *,
    rendered_html: str = "",
) -> list[str]:
    """Return reason codes. Empty list means the copy is reputationally safe."""
    text = _collect_text(record, rendered_html)
    errors: list[str] = []
    for pattern, code in _ACCUSATORY:
        for match in re.finditer(pattern, text, flags=re.I):
            if _is_negated(text, match.start()):
                continue
            if not _basis_allows(record, code):
                errors.append(code)
                break
    if atypical_collapsed_to_irregular(text):
        errors.append("reputation_atipico_as_irregular")
    return sorted(set(errors))
