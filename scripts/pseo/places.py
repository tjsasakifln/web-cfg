"""Brazilian place names + prepositions (em/no/na) for public copy.

Never emit "em Paraná", "em Bahia", "em RS". Use:
  no Paraná / no Rio Grande do Sul / na Bahia / em Santa Catarina
"""

from __future__ import annotations

import re
import unicodedata

_UF_NAMES: dict[str, str] = {
    "AC": "Acre",
    "AL": "Alagoas",
    "AP": "Amapá",
    "AM": "Amazonas",
    "BA": "Bahia",
    "CE": "Ceará",
    "DF": "Distrito Federal",
    "ES": "Espírito Santo",
    "GO": "Goiás",
    "MA": "Maranhão",
    "MT": "Mato Grosso",
    "MS": "Mato Grosso do Sul",
    "MG": "Minas Gerais",
    "PA": "Pará",
    "PB": "Paraíba",
    "PR": "Paraná",
    "PE": "Pernambuco",
    "PI": "Piauí",
    "RJ": "Rio de Janeiro",
    "RN": "Rio Grande do Norte",
    "RS": "Rio Grande do Sul",
    "RO": "Rondônia",
    "RR": "Roraima",
    "SC": "Santa Catarina",
    "SP": "São Paulo",
    "SE": "Sergipe",
    "TO": "Tocantins",
    "BR": "Brasil",
}
# Masculine article → no/do
_UF_ART_M = frozenset(
    {
        "AC",
        "AP",
        "AM",
        "CE",
        "DF",
        "ES",
        "MA",
        "PA",
        "PR",
        "PI",
        "RJ",
        "RN",
        "RS",
        "TO",
    }
)
# Feminine article → na/da
_UF_ART_F = frozenset({"BA", "PB"})

_NAME_FIXES = {
    "Piaui": "Piauí",
    "Sao Paulo": "São Paulo",
    "Parana": "Paraná",
    "Goias": "Goiás",
    "Ceara": "Ceará",
    "Para": "Pará",
    "Espirito Santo": "Espírito Santo",
    "Rondonia": "Rondônia",
    "Amapa": "Amapá",
}


def _fold(s: str) -> str:
    nk = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nk if not unicodedata.combining(c)).lower()


_NAME_TO_UF: dict[str, str] = {}
for _code, _name in _UF_NAMES.items():
    _NAME_TO_UF[_fold(_name)] = _code


def accent_region(label: str | None) -> str:
    if not label:
        return ""
    s = str(label).strip()
    if len(s) == 2 and s.upper() in _UF_NAMES:
        return _UF_NAMES[s.upper()]
    for a, b in _NAME_FIXES.items():
        s = s.replace(a, b)
    s = s.replace("paralelepipedo", "paralelepípedo").replace(
        "Paralelepipedo", "Paralelepípedo"
    )
    s = s.replace("manutencao", "manutenção").replace("Manutencao", "Manutenção")
    s = s.replace("pavimentacao", "pavimentação").replace("Pavimentacao", "Pavimentação")
    s = re.sub(r"\s*\([a-z0-9]+(?:-[a-z0-9]+)+\)", "", s)
    return s


def place_uf_code(label: str | None) -> str | None:
    if not label:
        return None
    s = str(label).strip()
    if len(s) == 2 and s.upper() in _UF_NAMES:
        return s.upper()
    return _NAME_TO_UF.get(_fold(accent_region(s)))


def place_name(label: str | None) -> str:
    if not label:
        return ""
    uf = place_uf_code(label)
    if uf:
        return _UF_NAMES[uf]
    return accent_region(label)


def em_place(label: str | None) -> str:
    """Locative phrase: no Paraná / na Bahia / em Santa Catarina / no Brasil."""
    if not label:
        return ""
    uf = place_uf_code(label)
    name = place_name(label)
    if not name:
        return ""
    if uf == "BR":
        return "no Brasil"
    if uf in _UF_ART_M:
        return f"no {name}"
    if uf in _UF_ART_F:
        return f"na {name}"
    if uf:
        return f"em {name}"
    return f"em {name}"


def Em_place(label: str | None) -> str:
    s = em_place(label)
    return (s[0].upper() + s[1:]) if s else ""


def de_place(label: str | None) -> str:
    if not label:
        return ""
    uf = place_uf_code(label)
    name = place_name(label)
    if not name:
        return ""
    if uf == "BR":
        return "do Brasil"
    if uf in _UF_ART_M:
        return f"do {name}"
    if uf in _UF_ART_F:
        return f"da {name}"
    return f"de {name}"


def fix_place_locatives(text: str | None) -> str:
    """Rewrite bare 'em UF' / wrong 'em Estado' in free text to no/na/em + full name."""
    if not text:
        return ""
    s = str(text)
    # 1) em XX (UF code)
    def _uf_repl(m: re.Match[str]) -> str:
        uf = m.group(1).upper()
        return em_place(uf)

    s = re.sub(r"\bem\s+([A-Za-z]{2})\b", _uf_repl, s)
    # 2) bare wrong "em <StateWithArticle>" full names
    wrong_em = [
        "Pará",
        "Paraná",
        "Bahia",
        "Paraíba",
        "Rio Grande do Sul",
        "Rio Grande do Norte",
        "Rio de Janeiro",
        "Ceará",
        "Piauí",
        "Maranhão",
        "Amapá",
        "Acre",
        "Amazonas",
        "Espírito Santo",
        "Tocantins",
        "Distrito Federal",
    ]
    for name in wrong_em:
        # only replace "em Name" not already "no Name" / "na Name"
        s = re.sub(rf"\bem\s+{re.escape(name)}\b", em_place(name), s)
    return s