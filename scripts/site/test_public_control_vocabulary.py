#!/usr/bin/env python3
"""O vocabulário de controle interno não aparece para o visitante.

Complementa scripts/site/test_public_plain_language.py, que já cobre os termos
ingleses de classe epistêmica. Aqui entram os equivalentes burocráticos em
português -- enquadramento, aderência, artefato, acervo, vertical, núcleo -- e
os termos de operação -- gate, handoff, readback, PII.

Duas diferenças em relação ao gate irmão, ambas deliberadas:

1. COBERTURA ALÉM DO CORPO. A apresentação humana não é só o texto visível: a
   descrição que aparece na busca e no compartilhamento, o nome acessível de um
   controle e o rótulo de uma opção também são lidos por uma pessoa. Um leitor
   de tela lê aria-label; o Google lê meta description. Os dois entram.

2. CATRACA EM VEZ DE EXCEÇÃO. A campanha que criou esta regra corrigiu um lote e
   deixou o restante do acervo explicitamente aberto. Registrar cada ocorrência
   remanescente como exceção seria aprová-la, e uma exceção genérica por pasta ou
   por palavra esconderia a cobertura. Então:
     * as rotas de ENFORCED reprovam qualquer ocorrência, sempre;
     * qualquer outra rota reprova se PIORAR em relação à linha de base;
     * o que resta aparece contado no relatório, sem aprovação e sem sumir.
   A linha de base só pode descer. Zerá-la encerra a dívida.
"""

from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.public_copy_scope import (  # noqa: E402
    relpath,
    visible_text,
    visitor_facing_html_files,
)

BASELINE_PATH = ROOT / "data" / "site" / "control-vocabulary-baseline.json"

# Palavra inteira. "fatorial" não é "FACT"; "delegate" não é "gate"; e o
# acento de "aderência" não pode ser a forma de escapar da regra.
FORBIDDEN = {
    "enquadramento": r"\benquadramentos?\b",
    "enquadrar": r"\benquadr(?:ar|a|amos|ada|ado)\b",
    "registrar-para-triagem": r"\bregistrar\b[^.]{0,40}\b(?:triagem|revis[ãa]o de encaixe|enquadramento)\b",
    "revisao-de-encaixe": r"\brevis[ãa]o de encaixe\b",
    "aderencia": r"\bader[êe]ncias?\b",
    "artefato": r"\bartefatos?\b",
    "acervo": r"\bacervos?\b",
    "vertical": r"\bvertica(?:l|is)\b",
    "nucleo": r"\bn[úu]cleos?\b",
    "gate": r"\bgates?\b",
    "handoff": r"\bhandoffs?\b",
    "readback": r"\breadbacks?\b",
    "pii": r"\bPII\b",
}

# O lote corrigido por esta campanha, mais o que é compartilhado por todo o
# site. Aqui a regra é fechada: nenhuma ocorrência passa.
ENFORCED = (
    "index.html",
    "politica-editorial/index.html",
    "uso-de-ia/index.html",
    "conflitos/index.html",
    "quantitativos-orcamento-obras/index.html",
    "triagem-tecnica/index.html",
    "servicos/index.html",
    "servicos-obras-publicas/index.html",
)

# O registro histórico é preservado como foi publicado. Reescrevê-lo para
# satisfazer um gate de linguagem seria falsificar o passado -- e a política
# vigente não usa esse vocabulário.
# Rotas exatas, nao prefixo de pasta: uma isencao por pasta cobriria qualquer
# arquivo futuro sob v/ sem ninguem decidir nada. Estas duas sao o registro
# historico, preservado como foi publicado.
ARCHIVE_ROUTES = (
    "politica-editorial/v/1.0.0/index.html",
    "politica-editorial/historico/index.html",
)

# Teto da divida, medido em 2026-09-07 com o detector JA ALARGADO (formas
# verbais incluidas). O salto de 420 para o numero abaixo NAO e divida nova:
# e cobertura nova. "Enquadrar" sempre esteve nas paginas; o que faltava era
# uma regra que o enxergasse.
# A catraca so pode descer: se alguem rodar --record depois de
# piorar uma pagina, o total sobe e ESTE numero reprova. Baixar o teto exige
# ter corrigido paginas de verdade.
MAX_OPEN_DEBT_OCCURRENCES = 491
MAX_OPEN_DEBT_ROUTES = 159


class _HumanNames(HTMLParser):
    """Texto lido por uma pessoa que não é o corpo visível da página."""

    WANTED_ATTRS = ("aria-label", "alt", "title", "placeholder", "aria-placeholder")
    WANTED_META = ("description", "og:description", "twitter:description",
                   "og:title", "twitter:title")

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        got = dict(attrs)
        if tag == "title":
            self._in_title = True
        if tag == "meta":
            key = (got.get("name") or got.get("property") or "").lower()
            if key in self.WANTED_META and got.get("content"):
                self.parts.append(got["content"])
        for name in self.WANTED_ATTRS:
            if got.get(name):
                self.parts.append(got[name])

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.parts.append(data)


def human_names(html: str) -> str:
    parser = _HumanNames()
    parser.feed(html)
    return " ".join(" ".join(parser.parts).split())


def human_surface(html: str) -> str:
    """Tudo que uma pessoa lê: corpo visível, nome acessível e texto de busca."""
    return f"{visible_text(html)} \n {human_names(html)}"


def scan() -> dict[str, dict[str, int]]:
    """{rota: {termo: ocorrências}} sobre toda a superfície humana."""
    found: dict[str, dict[str, int]] = {}
    for path in visitor_facing_html_files(ROOT):
        rel = relpath(path, ROOT)
        if rel in ARCHIVE_ROUTES:
            continue
        surface = human_surface(path.read_text(encoding="utf-8"))
        counts = {}
        for term, pattern in FORBIDDEN.items():
            n = len(re.findall(pattern, surface, flags=re.IGNORECASE))
            if n:
                counts[term] = n
        if counts:
            found[rel] = counts
    return found


def load_baseline() -> dict[str, dict[str, int]]:
    if not BASELINE_PATH.is_file():
        return {}
    return json.loads(BASELINE_PATH.read_text(encoding="utf-8")).get("open_debt") or {}


def write_baseline(found: dict[str, dict[str, int]]) -> None:
    payload = {
        "schema_version": "1.0.0",
        "purpose": (
            "Dívida aberta de vocabulário de controle na superfície pública. "
            "Não é aprovação: é a contagem do que falta corrigir. Só pode diminuir."
        ),
        "owner_issue": 611,
        "recorded_at": "2026-09-07",
        "enforced_routes": list(ENFORCED),
        "open_debt": dict(sorted(found.items())),
    }
    BASELINE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                             encoding="utf-8")


def failures() -> list[str]:
    found = scan()
    base = load_baseline()
    out: list[str] = []
    for rel in ENFORCED:
        for term, n in (found.get(rel) or {}).items():
            out.append(f"{rel}: '{term}' x{n} — rota do lote corrigido, não admite ocorrência")
    for rel, counts in sorted(found.items()):
        if rel in ENFORCED:
            continue
        for term, n in sorted(counts.items()):
            was = (base.get(rel) or {}).get(term, 0)
            if n > was:
                out.append(f"{rel}: '{term}' x{n} (linha de base {was}) — piorou")
    total = sum(sum(c.values()) for c in found.values())
    if total > MAX_OPEN_DEBT_OCCURRENCES:
        out.append(f"divida aberta subiu para {total} ocorrencias; o teto e "
                   f"{MAX_OPEN_DEBT_OCCURRENCES} e so pode descer")
    if len(found) > MAX_OPEN_DEBT_ROUTES:
        out.append(f"divida aberta subiu para {len(found)} rotas; o teto e "
                   f"{MAX_OPEN_DEBT_ROUTES} e so pode descer")
    return out


def test_control_vocabulary_does_not_reach_the_visitor() -> None:
    bad = failures()
    assert not bad, "vocabulário interno na superfície pública:\n  " + "\n  ".join(bad)


def main() -> int:
    if "--record" in sys.argv:
        found = scan()
        write_baseline(found)
        total = sum(sum(c.values()) for c in found.values())
        print(f"recorded open debt: {len(found)} routes, {total} occurrences")
        return 0
    bad = failures()
    found = scan()
    total = sum(sum(c.values()) for c in found.values())
    by_term: dict[str, int] = {}
    for counts in found.values():
        for t, n in counts.items():
            by_term[t] = by_term.get(t, 0) + n
    print(f"OPEN DEBT (explicitly not approved): {len(found)} routes, {total} occurrences")
    for t, n in sorted(by_term.items(), key=lambda kv: -kv[1]):
        print(f"  {t:16} {n:5}")
    if bad:
        print(f"\nFAIL ({len(bad)}):")
        for line in bad:
            print("  " + line)
        return 1
    print("\nPASS: no regression, and the corrected batch stays clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
