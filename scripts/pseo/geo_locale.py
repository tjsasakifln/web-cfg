"""Single source of truth for geographic display copy in the pSEO pipeline.

Public copy that names a region must never build the geographic phrase by naive
``"em " + region_label`` concatenation: Brazilian Portuguese picks the
preposition from the specific UF name, not from a general rule ("no Paraná",
"em Santa Catarina", "na Bahia", "no Ceará").

Two accessors, deliberately separate:

* :func:`display_name` -- the bare, correctly accented name ("Paraná").
  Use it for structured data (``spatialCoverage``), table cells, parentheses
  and anywhere the surrounding text already supplies the preposition.
* :func:`prepositional_phrase` -- preposition + name ("no Paraná").
  Use it in running prose, in place of ``f"em {region_label}"``.

This module replaces the former ``render.accent_region`` and
``score._clean_price_label``; :func:`normalize_label` keeps their
object-label normalisation so there is one normaliser, not three.
"""

from __future__ import annotations

import re
import unicodedata

# UF code -> (display name, preposition).
# The preposition is a property of the individual name and was verified against
# standard Brazilian Portuguese usage; it is not derivable from gender alone.
_UF: dict[str, tuple[str, str]] = {
    "AC": ("Acre", "no"),
    "AL": ("Alagoas", "em"),
    "AP": ("Amapá", "no"),
    "AM": ("Amazonas", "no"),
    "BA": ("Bahia", "na"),
    "CE": ("Ceará", "no"),
    "DF": ("Distrito Federal", "no"),
    "ES": ("Espírito Santo", "no"),
    "GO": ("Goiás", "em"),
    "MA": ("Maranhão", "no"),
    "MT": ("Mato Grosso", "no"),
    "MS": ("Mato Grosso do Sul", "no"),
    "MG": ("Minas Gerais", "em"),
    "PA": ("Pará", "no"),
    "PB": ("Paraíba", "na"),
    "PR": ("Paraná", "no"),
    "PE": ("Pernambuco", "em"),
    "PI": ("Piauí", "no"),
    "RJ": ("Rio de Janeiro", "no"),
    "RN": ("Rio Grande do Norte", "no"),
    "RS": ("Rio Grande do Sul", "no"),
    "RO": ("Rondônia", "em"),
    "RR": ("Roraima", "em"),
    "SC": ("Santa Catarina", "em"),
    "SP": ("São Paulo", "em"),
    "SE": ("Sergipe", "em"),
    "TO": ("Tocantins", "no"),
    # National scope: the pipeline uses "BR" / "Brasil" / "nacional".
    "BR": ("Brasil", "no"),
}

# Aliases that resolve to a UF code, folded to accent-free lowercase.
_ALIASES: dict[str, str] = {"nacional": "BR", "brasil": "BR", "br": "BR"}


def _fold(s: str) -> str:
    """Accent-free, lowercase, whitespace-collapsed form for lookup."""
    s = unicodedata.normalize("NFKD", str(s or "").strip().lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return " ".join(s.split())


# Reverse index: folded display name -> UF code.
_BY_NAME: dict[str, str] = {_fold(name): code for code, (name, _) in _UF.items()}
_BY_NAME.update(_ALIASES)


def resolve(region: str | None) -> str | None:
    """Return the UF code for a UF code, a display name or a known alias."""
    if not region:
        return None
    raw = str(region).strip()
    if raw.upper() in _UF:
        return raw.upper()
    return _BY_NAME.get(_fold(raw))


def display_name(region: str | None) -> str:
    """Correctly accented bare name: ``"PR"`` / ``"Parana"`` -> ``"Paraná"``.

    Unknown values are passed through :func:`normalize_label` so callers never
    regress to a raw unaccented string.
    """
    code = resolve(region)
    if code:
        return _UF[code][0]
    return normalize_label(region)


def preposition(region: str | None) -> str:
    """The preposition that introduces the region: ``"no"``/``"na"``/``"em"``.

    Unknown regions fall back to ``"em"``, the safe generic form.
    """
    code = resolve(region)
    return _UF[code][1] if code else "em"


def prepositional_phrase(region: str | None, *, capitalize: bool = False) -> str:
    """Preposition + name, e.g. ``"no Paraná"``, ``"em Santa Catarina"``.

    Use ``capitalize=True`` at the start of a sentence ("No Paraná, ...").
    Only the preposition is capitalised, so the accented name is untouched --
    never call ``.capitalize()`` or ``.title()`` on the result.
    """
    name = display_name(region)
    if not name:
        return ""
    prep = preposition(region)
    if capitalize:
        prep = prep[:1].upper() + prep[1:]
    return f"{prep} {name}"


# --- generic label normalisation (folded in from accent_region/_clean_price_label) ---

_LABEL_FIXES: tuple[tuple[str, str], ...] = (
    ("Espirito Santo", "Espírito Santo"),
    ("Mato Grosso do Sul", "Mato Grosso do Sul"),
    ("Sao Paulo", "São Paulo"),
    ("Rondonia", "Rondônia"),
    ("Maranhao", "Maranhão"),
    ("Paraiba", "Paraíba"),
    ("Parana", "Paraná"),
    ("Piaui", "Piauí"),
    ("Goias", "Goiás"),
    ("Ceara", "Ceará"),
    ("Amapa", "Amapá"),
    ("Para", "Pará"),
    ("paralelepipedo", "paralelepípedo"),
    ("Paralelepipedo", "Paralelepípedo"),
    ("manutencao", "manutenção"),
    ("Manutencao", "Manutenção"),
    ("pavimentacao", "pavimentação"),
    ("Pavimentacao", "Pavimentação"),
)

# Archetype slug accidentally left in a label, e.g. "foo (manutencao-predial)".
_SLUG_IN_PARENS = re.compile(r"\s*\([a-z0-9]+(?:-[a-z0-9]+)+\)")


def normalize_label(label: str | None) -> str:
    """Repair accents and strip archetype slugs from a free-text label.

    ``"Para"`` -> ``"Pará"`` is applied last and only on a whole-word match, so
    it cannot corrupt "Paraná", "Paraíba" or the preposition "para".
    """
    if not label:
        return ""
    s = str(label)
    s = _SLUG_IN_PARENS.sub("", s)
    for bad, good in _LABEL_FIXES:
        if bad == "Para":
            # Whole word only: "Para" the state, never "Paraná"/"para".
            s = re.sub(r"\bPara\b", good, s)
        else:
            s = s.replace(bad, good)
    return s.strip()


__all__ = [
    "display_name",
    "normalize_label",
    "preposition",
    "prepositional_phrase",
    "resolve",
]
