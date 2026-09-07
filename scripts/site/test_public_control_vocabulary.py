#!/usr/bin/env python3
"""O vocabulário de controle interno não aparece para o visitante.

Complementa scripts/site/test_public_plain_language.py, que já cobre os termos
ingleses de classe epistêmica. Aqui entram os equivalentes burocráticos em
português -- enquadramento, aderência, artefato, acervo, vertical, núcleo -- e
os termos de operação -- gate, handoff, readback, PII.

Duas diferenças em relação ao gate irmão, ambas deliberadas:

0. COBERTURA ALÉM DAS PALAVRAS SOLTAS. Três leaks não eram vistos por nenhum
   gate: o rótulo de uma opção idêntico ao valor interno que ela envia
   (`<option value="UNKNOWN">UNKNOWN</option>`), um código interno concatenado
   em texto por JavaScript, e os rótulos de máquina de estados (`PUBLISHED`,
   `PAYMENT_RECEIVED`, `Timeline`, `Job do visitante`). Os três entram aqui, com
   contra-exemplos executados no mesmo caminho do gate.

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
    select_options,
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

# State-machine, registry and wire-protocol labels. These are matched
# CASE-SENSITIVELY and are NOT part of the ratchet's tolerated debt: every one
# of them was at zero when the class was added, so any reappearance is a new
# regression, not inherited debt.
#
# They are separated from FORBIDDEN above because that dict is scanned
# case-insensitively, which is right for Portuguese words and wrong here:
# `PUBLISHED` is the offer state machine's token, while "published" inside an
# ordinary English quotation is not the defect this class describes.
FORBIDDEN_EXACT_CASE = {
    # `<span class="offer-state">Oferta publicada · PUBLISHED</span>` shipped the
    # catalog's internal state next to its own Portuguese translation, 8x.
    "estado-de-publicacao": r"\bPUBLISHED\b",
    # The payment provider's webhook vocabulary, shown to the buyer in the
    # commercial terms and on the return page.
    "estado-de-pagamento": r"\bPAYMENT_[A-Z_]+\b|\bCHECKOUT_[A-Z_]+\b",
    # English heading generated onto a Portuguese tool page.
    "timeline": r"\b[Tt]imeline\b",
    # The name of a field in the editorial registry, printed as body copy.
    "campo-do-registro-editorial": r"\bJob do visitante\b",
    # Internal offer code rendered next to a Portuguese label.
    "codigo-de-oferta": r"\bOferta candidata\b",
}

# An option value is the wire value the form submits; it is allowed to be an
# internal token. The LABEL is what a person reads, so a label byte-identical to
# an internal-shaped value is not a label at all -- it is the wire value leaking
# through. The check runs on the (value, label) PAIR, which no text-scanning
# gate can see: `<option value="UNKNOWN">UNKNOWN</option>` shipped for months
# because the word "UNKNOWN" is legitimate elsewhere on that same page, and one
# path-level copy exception granted for those legitimate occurrences silenced
# this one too.
#
# The shape is deliberately narrow. A short acronym a Brazilian reads on sight
# -- the UF codes SC, RS, MG -- is a perfectly good label for its own value, so
# an internal-shaped value is either snake_case/SCREAMING_SNAKE, or a bare
# ALL-CAPS word long enough that it cannot be an acronym the visitor already
# knows (UNKNOWN, 7 characters).
INTERNAL_SHAPED_VALUE = re.compile(
    r"^(?:[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+|[A-Z][A-Z0-9]{4,})$"
)

# JavaScript that writes visitor copy at runtime never reaches the HTML this
# gate parses, so `"Oferta candidata: " + domain.candidate_offer` shipped an
# internal offer code to the screen with every gate green. The pattern is
# specific: an internal identifier concatenated straight after a human label.
VISITOR_JS_DIRS = ("ferramentas", "assets/js", "js")
RENDERED_INTERNAL_CODE = re.compile(
    r"""["'][^"'\n]*[:\u00b7]\s*["']\s*\+\s*[A-Za-z_$][\w.$]*"""
    r"""(?:candidate_offer|offer_candidate|offer_id|offer_code"""
    r"""|public_state|publication_state|canonical_status|state_token)\b"""
)

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
# 2026-09-07 (#611 vocabulary lane): 491 -> 490. Exactly one counted occurrence
# was removed -- the "vertical" in the margin-defense pillar's provenance line,
# which was there because a test demanded the internal tokens
# `source`/`as_of`/`limitation` in visitor copy. That test now grades what the
# paragraph SAYS, so the line could be written in Portuguese.
#
# The lane's other fixes were invisible to this ratchet, so they cannot show up
# as a decrease here. Measured with the detector below before they were fixed:
# PUBLISHED x8 on /entregas/, PAYMENT_RECEIVED x2, Timeline x2, "Job do
# visitante" x3, plus one option label and one JavaScript-rendered offer code
# that no word scan could see at all. All are now at zero and covered by
# FORBIDDEN_EXACT_CASE and the two structural checks, so the ceiling did not
# move to make room for them.
#
# 2026-09-07 (#611 privacy lane, same campaign): three further counted
# occurrences left /privacidade/ when the policy was reconciled with the real
# runtime, retiring that route from the open-debt set entirely.
#
# The two lanes were measured independently against the pre-campaign tree, so
# their ceilings (490 and 488) are not additive. The value below was RE-MEASURED
# with both lanes applied together rather than inferred by arithmetic.
MAX_OPEN_DEBT_OCCURRENCES = 487
MAX_OPEN_DEBT_ROUTES = 158


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
        for term, pattern in FORBIDDEN_EXACT_CASE.items():
            n = len(re.findall(pattern, surface))
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


def option_label_failures(root: Path | None = None) -> list[str]:
    """A `<select>` option must offer a label, not repeat its own wire value."""
    base = root or ROOT
    out: list[str] = []
    for path in visitor_facing_html_files(base):
        rel = relpath(path, base)
        if rel in ARCHIVE_ROUTES:
            continue
        for value, label in select_options(path.read_text(encoding="utf-8")):
            if not value or not INTERNAL_SHAPED_VALUE.match(value):
                continue
            if label.strip() == value:
                out.append(
                    f"{rel}: <option value=\"{value}\"> repete o valor interno como rótulo; "
                    "o visitante precisa de um rótulo em português"
                )
    return out


def rendered_internal_code_failures(root: Path | None = None) -> list[str]:
    """Visitor-facing JS must not concatenate an internal code into visible copy."""
    base = root or ROOT
    out: list[str] = []
    for folder in VISITOR_JS_DIRS:
        root_dir = base / folder
        if not root_dir.is_dir():
            continue
        for path in sorted(root_dir.rglob("*.js")):
            text = path.read_text(encoding="utf-8", errors="replace")
            for hit in RENDERED_INTERNAL_CODE.findall(text):
                out.append(f"{relpath(path, base)}: código interno concatenado em texto visível")
    return out


# The exact shapes that shipped. A detector that stops recognising them has
# stopped working, so they are checked on the same code path the gate runs.
COUNTER_CASES = (
    (
        "option-label-igual-ao-valor",
        lambda: _option_pairs_rejected(
            '<select><option value="UNKNOWN">UNKNOWN</option></select>'
        ),
    ),
    (
        "option-label-em-portugues-passa",
        lambda: not _option_pairs_rejected(
            '<select><option value="UNKNOWN">Ainda não definido</option>'
            '<option value="SC">SC</option></select>'
        ),
    ),
    (
        "codigo-interno-concatenado",
        lambda: bool(
            RENDERED_INTERNAL_CODE.search(
                'add(wrap, "p", "", "Oferta candidata: " + domain.candidate_offer);'
            )
        ),
    ),
    (
        "frase-em-portugues-passa",
        lambda: not RENDERED_INTERNAL_CODE.search(
            'add(wrap, "p", "", "Este ponto pede uma leitura técnica antes da decisão.");'
        ),
    ),
    (
        "estado-de-publicacao-detectado",
        lambda: bool(
            re.search(FORBIDDEN_EXACT_CASE["estado-de-publicacao"], "Oferta publicada · PUBLISHED")
        ),
    ),
    (
        "portugues-corrente-nao-e-estado",
        lambda: not re.search(
            FORBIDDEN_EXACT_CASE["estado-de-publicacao"], "Oferta publicada em agosto"
        ),
    ),
)


def _option_pairs_rejected(html: str) -> bool:
    return any(
        value and INTERNAL_SHAPED_VALUE.match(value) and label.strip() == value
        for value, label in select_options(html)
    )


def selftest_failures() -> list[str]:
    return [
        f"contra-exemplo '{name}' deixou de reprovar: o detector parou de funcionar"
        for name, check in COUNTER_CASES
        if not check()
    ]


def failures() -> list[str]:
    found = scan()
    base = load_baseline()
    out: list[str] = []
    out.extend(selftest_failures())
    out.extend(option_label_failures())
    out.extend(rendered_internal_code_failures())
    for rel in ENFORCED:
        for term, n in (found.get(rel) or {}).items():
            out.append(f"{rel}: '{term}' x{n} — rota do lote corrigido, não admite ocorrência")
    for rel, counts in sorted(found.items()):
        if rel in ENFORCED:
            continue
        for term, n in sorted(counts.items()):
            if term in FORBIDDEN_EXACT_CASE:
                # Fail closed, and stay closed. These classes entered the gate at
                # zero, so there is no debt to inherit: a hit is always new. This
                # ignores the baseline on purpose -- otherwise a future `--record`
                # would file them as tolerated debt and raise the ceiling.
                out.append(
                    f"{rel}: '{term}' x{n} — rótulo interno de máquina ou de registro, "
                    "não admite ocorrência na superfície pública"
                )
                continue
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
