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

2. CLASSIFICAÇÃO CONTEXTUAL, NÃO BANIMENTO DE PALAVRA. ``Acervo técnico`` e
   ``enquadramento legal`` pertencem ao vocabulário do comprador. A decisão do
   fundador de 2026-09-09 exige que cada ocorrência seja classificada: usos
   técnicos recebem fundamento verificável; linguagem de bastidor reprova sem
   herdar a antiga linha de base. Os classificadores são testados com uma forma
   legítima e uma forma operacional para cada palavra ambígua.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.public_copy_scope import (  # noqa: E402
    MANIFEST_ROUTE_EXEMPT,
    artifact_html_files,
    relpath,
    route_for,
    select_options,
    visible_text,
    visitor_facing_html_files,
)
from scripts.site.test_self_deprecating_copy import (  # noqa: E402
    dynamic_text_states,
    jsonld_prose,
)

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

# The old 487-occurrence ratchet is historical evidence only.  It cannot be
# recorded or consulted as publication authorization after 2026-09-09.


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
    """Corpo, nomes acessíveis, busca, dados estruturados e estados literais."""
    return (
        f"{visible_text(html)} \n {human_names(html)} \n {jsonld_prose(html)}"
        f" \n {dynamic_text_states(html)}"
    )


_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\s*[·|]\s*")
_INTERNAL_ENQUADRAMENTO = re.compile(
    r"\bpedido de enquadramento\b"
    r"|\bdura[çc][ãa]o t[íi]pica da conversa\b[^.!?]{0,55}\benquadramento\b"
    r"|\bconversa de enquadramento\b"
    r"|\btriagem aplica\b[^.!?]{0,55}\benquadramentos?\b"
    r"|\benquadramentos?\b[^.!?]{0,55}\b(?:valores publicados|proposta comercial)\b"
    r"|\b(?:pedir|solicitar)\b[^.!?]{0,35}\benquadramento\b"
    r"|\benquadramento (?:do diagn[óo]stico|e termos)\b"
    r"|\buso destes dados\b[^.!?]{0,60}\benquadramento\b"
    r"|\b1 enquadramento\b[^.!?]{0,80}\bCNPJ\b"
    r"|\bos enquadramentos?\b[^.!?]{0,80}\b(?:essencial|complexa|especial)\b"
    r"|\bo que voc[êe] recebe\b[^.!?]{0,30}\benquadramento do formato\b"
    r"|\benquadrar (?:a oportunidade cr[íi]tica|esta demanda|a necessidade)\b"
    r"|\benquadramos a necessidade\b"
    r"|\ban[áa]lise pode ser enquadrada\b",
    re.I,
)
_INTERNAL_ACERVO = re.compile(
    r"\bacervo\b[^.!?]{0,35}\b(?:editorial|interno|do site|de conte[úu]do|de provas?)\b"
    r"|\b(?:editorial|interno)\b[^.!?]{0,35}\bacervo\b",
    re.I,
)
_LEGITIMATE_ACERVO = re.compile(
    r"\bacervo(?:s)?\s+t[ée]cnic[oa]s?\b"
    r"|\bacervo(?:s)?\b[^.!?]{0,130}\b(?:edital|licita[çc][ãa]o|habilita[çc][ãa]o|"
    r"atestados?|CATs?|parcelas? relevantes?|capacidade|equipe|caixa|tipologias?|"
    r"objeto|proposta|contrato|documentos?|concorrente|CNPJ|segmentos?|raio|"
    r"quantitativos?|compradores?|[óo]rg[ãa]os?|cons[óo]rcio|san[çc][õo]es|pagamento|"
    r"registro de pre[çc]os|faixa de R\$\s*\d|ader[êe]ncia)\b"
    r"|\b(?:edital|licita[çc][ãa]o|habilita[çc][ãa]o|atestados?|CATs?|"
    r"parcelas? relevantes?|capacidade|equipe|caixa|tipologias?|objeto|proposta|"
    r"contrato|documentos?|concorrente|CNPJ|segmentos?|raio|quantitativos?|"
    r"compradores?|[óo]rg[ãa]os?|cons[óo]rcio|san[çc][õo]es|pagamento|registro de pre[çc]os|"
    r"faixa de R\$\s*\d|ader[êe]ncia)\b[^.!?]{0,130}\bacervo(?:s)?\b"
    r"|\bacervo\b[^.!?]{0,90}\b(?:faixa de R\$\s*\d|pr[óo]ximo ciclo|compat[íi]vel|"
    r"comprador|objetos? recorrentes?|campo de texto)\b",
    re.I,
)
_INTERNAL_ADERENCIA = re.compile(
    r"\bader[êe]ncia\b[^.!?]{0,45}\b(?:editorial|ao gate|à taxonomia|ao funil|ao workflow)\b"
    r"|\b(?:gate|taxonomia|workflow)\b[^.!?]{0,45}\bader[êe]ncia\b",
    re.I,
)
_DELIVERABLE_CONTEXT = re.compile(
    r"\benquadramento e regras\b[^.!?]{0,80}\bm[ée]todo\b"
    r"|\bdo enquadramento at[ée] as decis[õo]es\b"
    r"|\babertura e enquadramento\b[^.!?]{0,80}\b(?:slide|contexto)\b",
    re.I,
)
_LEGITIMATE_ENQUADRAMENTO = re.compile(
    r"\benquadr(?:amentos?|ar|a|amos|ada|ado)\b[^.!?]{0,120}\b(?:legal|jur[íi]dic[oa]|"
    r"t[ée]cnic[oa]|contratual|tribut[áa]ri[oa]|trabalhista|aditivo|art\.?|lei|edital|"
    r"matriz de riscos?|regime|fato|evento|obriga[çc][ãa]o|causa|escopo|responsabilidade|"
    r"instrumento|projeto|formaliza[çc][ãa]o|c[áa]lculo|limite|medi[çc][ãa]o|vig[êe]ncia|"
    r"execu[çc][ãa]o|altera[çc][ãa]o|reequil[íi]brio|risco|prova|atraso|"
    r"indeferimento|documentos?|custos?|prazo|margem|BDI|SINAPI|CPRB|encargos?|"
    r"desonera[çc][ãa]o|AGU|PGF|contrato|engenharia|obra|quantifica[çc][ãa]o|[íi]ndice|"
    r"pre[çc]o|planilha|§)\b"
    r"|\b(?:legal|jur[íi]dic[oa]|t[ée]cnic[oa]|contratual|tribut[áa]ri[oa]|trabalhista|"
    r"aditivo|art\.?|lei|edital|matriz de riscos?|regime|fato|evento|obriga[çc][ãa]o|"
    r"causa|escopo|responsabilidade|instrumento|projeto|formaliza[çc][ãa]o|c[áa]lculo|"
    r"limite|medi[çc][ãa]o|vig[êe]ncia|execu[çc][ãa]o|altera[çc][ãa]o|"
    r"reequil[íi]brio|risco|prova|atraso|indeferimento|documentos?|custos?|prazo|"
    r"margem|BDI|SINAPI|CPRB|encargos?|desonera[çc][ãa]o|AGU|PGF|contrato|"
    r"engenharia|obra|quantifica[çc][ãa]o|[íi]ndice|pre[çc]o|planilha|§)\b"
    r"[^.!?]{0,120}\benquadr(?:amentos?|ar|a|amos|ada|ado)\b"
    r"|\benquadramento\s+(?:do caso|pr[áa]tico|federal|da empresa|se aplica)\b",
    re.I,
)


def legitimate_reason(term: str, sentence: str) -> str | None:
    """Return the material reason an ambiguous occurrence is visitor language."""
    if term == "acervo" and not _INTERNAL_ACERVO.search(sentence) and _LEGITIMATE_ACERVO.search(sentence):
        return "qualificacao_tecnica_da_empresa_em_licitacao"
    if term == "aderencia" and not _INTERNAL_ADERENCIA.search(sentence):
        return "compatibilidade_tecnica_entre_objeto_escopo_capacidade_ou_referencia"
    if term in {"enquadramento", "enquadrar"} and _DELIVERABLE_CONTEXT.search(sentence):
        return "contextualizacao_do_problema_e_premissas_na_entrega"
    if (term in {"enquadramento", "enquadrar"}
            and not _INTERNAL_ENQUADRAMENTO.search(sentence)
            and _LEGITIMATE_ENQUADRAMENTO.search(sentence)):
        return "classificacao_tecnica_legal_do_fato_obrigacao_ou_instrumento"
    if term == "vertical" and re.search(r"\bhorizontal e vertical\b", sentence, re.I):
        return "orientacao_fisica_no_objeto_transcrito"
    if term == "nucleo" and re.search(r"\bn[úu]cleo da prote[çc][ãa]o\b", sentence, re.I):
        return "substantivo_comum_centro_da_protecao"
    return None


def _surface_files(base: Path, *, require_artifact: bool) -> list[Path]:
    files = artifact_html_files(base) if require_artifact else visitor_facing_html_files(base)
    if require_artifact and not files:
        raise ValueError(f"public artifact has no HTML: {base}")
    return files


def classify_scan(
    root: Path | None = None, *, require_artifact: bool = False
) -> dict[str, object]:
    """Classify every matched occurrence as legitimate or a publication defect."""
    base = (root or ROOT).resolve()
    all_found: dict[str, dict[str, int]] = {}
    legitimate: dict[str, dict[str, int]] = {}
    defects: dict[str, dict[str, int]] = {}
    reasons: dict[str, int] = {}
    classifications: list[dict[str, object]] = []
    defect_examples: list[dict[str, object]] = []
    for path in _surface_files(base, require_artifact=require_artifact):
        rel = relpath(path, base)
        if rel in ARCHIVE_ROUTES or (
            require_artifact and route_for(rel) in MANIFEST_ROUTE_EXEMPT
        ):
            continue
        surface = human_surface(path.read_text(encoding="utf-8"))
        for sentence in _SENTENCE_SPLIT.split(surface):
            normalized = " ".join(sentence.split())
            if not normalized:
                continue
            for term, pattern in FORBIDDEN.items():
                n = len(re.findall(pattern, normalized, flags=re.IGNORECASE))
                if not n:
                    continue
                all_found.setdefault(rel, {})[term] = all_found.setdefault(rel, {}).get(term, 0) + n
                reason = legitimate_reason(term, normalized)
                target = legitimate if reason else defects
                target.setdefault(rel, {})[term] = target.setdefault(rel, {}).get(term, 0) + n
                if reason:
                    reasons[reason] = reasons.get(reason, 0) + n
                item = {
                    "path": rel,
                    "term": term,
                    "count": n,
                    "status": "legitimate" if reason else "defect",
                    "reason": reason,
                    "context": normalized[:500],
                }
                classifications.append(item)
                if not reason:
                    defect_examples.append(item)
            for term, pattern in FORBIDDEN_EXACT_CASE.items():
                n = len(re.findall(pattern, normalized))
                if not n:
                    continue
                all_found.setdefault(rel, {})[term] = all_found.setdefault(rel, {}).get(term, 0) + n
                defects.setdefault(rel, {})[term] = defects.setdefault(rel, {}).get(term, 0) + n
                item = {
                    "path": rel,
                    "term": term,
                    "count": n,
                    "status": "defect",
                    "reason": None,
                    "context": normalized[:500],
                }
                classifications.append(item)
                defect_examples.append(item)
    return {
        "all": all_found,
        "legitimate": legitimate,
        "defects": defects,
        "legitimate_reasons": reasons,
        "classifications": classifications,
        "defect_examples": defect_examples,
    }


def scan() -> dict[str, dict[str, int]]:
    """Backward-compatible full census; publication uses classify_scan()."""
    return classify_scan()["all"]  # type: ignore[return-value]


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
    (
        "acervo-tecnico-e-legitimo",
        lambda: legitimate_reason(
            "acervo", "O edital exige acervo técnico compatível com a parcela relevante."
        )
        == "qualificacao_tecnica_da_empresa_em_licitacao",
    ),
    (
        "acervo-editorial-e-bastidor",
        lambda: legitimate_reason("acervo", "Consulte nosso acervo editorial interno.")
        is None,
    ),
    (
        "acervo-pendente-nao-e-legitimado-por-fallback",
        lambda: legitimate_reason("acervo", "Acervo pendente de revisão interna.") is None,
    ),
    (
        "empresa-sozinha-nao-prova-contexto-do-acervo",
        lambda: legitimate_reason("acervo", "O acervo da empresa segue pendente.") is None,
    ),
    (
        "valorizacao-fabricada-do-acervo-nao-e-legitima",
        lambda: legitimate_reason("acervo", "Nosso acervo é o melhor do mercado.") is None,
    ),
    (
        "aderencia-tecnica-e-legitima",
        lambda: legitimate_reason(
            "aderencia", "A aderência do objeto ao escopo e à capacidade será conferida."
        )
        == "compatibilidade_tecnica_entre_objeto_escopo_capacidade_ou_referencia",
    ),
    (
        "aderencia-ao-gate-e-bastidor",
        lambda: legitimate_reason(
            "aderencia", "A aderência ao gate editorial será conferida."
        )
        is None,
    ),
    (
        "enquadramento-legal-e-legitimo",
        lambda: legitimate_reason(
            "enquadramento", "O enquadramento legal do aditivo muda a memória de cálculo."
        )
        == "classificacao_tecnica_legal_do_fato_obrigacao_ou_instrumento",
    ),
    (
        "enquadramento-contextual-da-entrega-e-legitimo",
        lambda: legitimate_reason(
            "enquadramento",
            "A narrativa vai do enquadramento até as decisões documentadas.",
        )
        == "contextualizacao_do_problema_e_premissas_na_entrega",
    ),
    (
        "pedido-de-enquadramento-e-bastidor",
        lambda: legitimate_reason(
            "enquadramento", "Envie um pedido de enquadramento pelo formulário."
        )
        is None,
    ),
    (
        "enquadramento-comercial-nao-e-tecnico",
        lambda: legitimate_reason(
            "enquadramento", "Peça um enquadramento comercial para ver se atendemos."
        ) is None,
    ),
    (
        "vertical-fisica-e-legitima",
        lambda: legitimate_reason(
            "vertical", "Sinalização viária horizontal e vertical."
        )
        == "orientacao_fisica_no_objeto_transcrito",
    ),
    (
        "vertical-comercial-e-bastidor",
        lambda: legitimate_reason("vertical", "Esta é nossa vertical comercial.") is None,
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


def failures(
    root: Path | None = None, *, require_artifact: bool = False
) -> list[str]:
    classified = classify_scan(root, require_artifact=require_artifact)
    found = classified["defects"]
    out: list[str] = []
    out.extend(selftest_failures())
    out.extend(option_label_failures(root))
    out.extend(rendered_internal_code_failures(root))
    for rel, counts in sorted(found.items()):
        for term, n in sorted(counts.items()):
            out.append(
                f"{rel}: '{term}' x{n} — uso de controle/bastidor sem fundamento técnico"
            )
    return out


def test_control_vocabulary_does_not_reach_the_visitor() -> None:
    bad = failures()
    assert not bad, "vocabulário interno na superfície pública:\n  " + "\n  ".join(bad)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--require-artifact", action="store_true")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--record", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.record:
        print("REFUSED: the 2026-09-09 classified gate cannot record open debt", file=sys.stderr)
        return 2
    try:
        bad = failures(args.root, require_artifact=args.require_artifact)
        classified = classify_scan(args.root, require_artifact=args.require_artifact)
    except ValueError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    found = classified["all"]
    defects = classified["defects"]
    legitimate = classified["legitimate"]
    total = sum(sum(c.values()) for c in found.values())
    defect_total = sum(sum(c.values()) for c in defects.values())
    legitimate_total = sum(sum(c.values()) for c in legitimate.values())
    by_term: dict[str, int] = {}
    for counts in found.values():
        for t, n in counts.items():
            by_term[t] = by_term.get(t, 0) + n
    report = {
        "schema": "confenge.control-vocabulary-classification/v1",
        "ok": not bad,
        "root": str(args.root.resolve()),
        "matched_routes": len(found),
        "matched_occurrences": total,
        "legitimate_occurrences": legitimate_total,
        "defect_routes": len(defects),
        "defect_occurrences": defect_total,
        "legitimate_reasons": classified["legitimate_reasons"],
        "classifications": classified["classifications"],
        "defect_examples": classified["defect_examples"],
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    print(
        f"CLASSIFIED: {len(found)} routes, {total} occurrences; "
        f"legitimate={legitimate_total}; defects={defect_total} on {len(defects)} routes"
    )
    for t, n in sorted(by_term.items(), key=lambda kv: -kv[1]):
        print(f"  {t:16} {n:5}")
    if bad:
        print(f"\nFAIL ({len(bad)}):")
        for line in bad:
            print("  " + line)
        return 1
    print("\nPASS: every occurrence classified and no visitor-facing control vocabulary defect")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
