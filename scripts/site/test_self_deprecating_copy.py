#!/usr/bin/env python3
"""Comunicação autodepreciativa não volta à superfície pública.

Issue #638. O fundador e engenheiro responsável, Tiago Jun Sasaki, determinou
em 2026-09-07 que a comunicação que anuncia o que a CONFENGE *não* tem seja
varrida do site. O caso mais caro era uma frase que se oferecia para dizer, sem
ninguém perguntar, que o registro no CREA e as obras anteriores do responsável
"não estão afirmados aqui".

O QUE ESTE GATE REPROVA (quatro formas, todas com sujeito nosso):

1. VOLUNTARIAR UM DÉFICIT sobre a nossa própria credencial, formação, registro,
   histórico ou inventário de prova. "Registro no CREA não está afirmado",
   "sem comprovação", "não temos casos".
2. TAXONOMIA INTERNA na assinatura visível: "Classe de permissão: ...", ou a
   chave técnica `as_of` impressa como se fosse português.
3. TÍTULO DE AUSÊNCIA: um h1/h2/h3 cujo assunto é a falta de prova, caso,
   depoimento ou credencial. Anunciar o vazio em manchete é o padrão varrido.
4. ENQUADRAR A PALAVRA DO TITULAR COMO INFERIOR a um registro público. Atribuir
   fonte é legítimo e continua obrigatório; depreciar quem assina, não.

O QUE ESTE GATE NÃO TOCA -- e não deve passar a tocar:

* Rotular um exemplo demonstrativo como demonstrativo. Isso é informação para o
  leitor e continua exigido por scripts/commercial/real_proof_registry.mjs.
* Incerteza honesta sobre método, dado ou fonte: "quando não há fonte que
  sustente um trecho, ele não sobe". Por isso um DEFICIT só reprova quando o
  SUJEITO da frase é a nossa credencial, o nosso histórico ou o nosso estoque de
  prova -- e nunca por uma frase de método.
* O registro histórico da política editorial, preservado como foi publicado.

ESCOPO ATUAL: desde a decisão expressa de 2026-09-09, toda ocorrência em uma
superfície pública atual reprova. A antiga linha de base continua no histórico
do repositório, mas não é lida nem pode ser regravada para aprovar dívida.
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
    visible_text,
    visitor_facing_html_files,
)

# ---------------------------------------------------------------------------
# 1 + 4. Déficit voluntário, e a palavra do titular rebaixada.
# Um DEFICIT só conta quando a frase também carrega um SUBJECT nosso.
# ---------------------------------------------------------------------------
DEFICIT = re.compile(
    r"n[ãa]o (?:est[ãa]o?|s[ãa]o|é|e|foi|foram|fica[m]?)\s+\w{0,12}\s*"
    r"(?:afirmad|declarad|comprovad|atestad|verificad|demonstrad|documentad)"
    r"|n[ãa]o (?:afirmamos|alegamos|declaramos|temos|possu[íi]mos|contamos com|"
    r"apresentamos|exibimos)"
    r"|sem (?:comprova[çc][ãa]o|prova|provas|credencial|credenciais|registro|"
    r"lastro|evid[êe]ncia)"
    r"|nenhum[ao]?\s+\w{0,14}\s*(?:publicad|aprovad|autorizad|comprovad|"
    r"registrad|dispon[íi]vel)"
    r"|zero\s+\w{0,14}\s*(?:publicad|aprovad|resultado|caso|prova|cliente)"
    r"|(?:permanece[m]?|continua[m]?|segue[m]?|est[áa]|est[ãa]o)\s+(?:em\s+)?zero"
    r"|\bem zero\b|\bpermanece vazio\b|\bcontinua vazio\b|\bregistro vazio\b"
    r"|n[ãa]o (?:h[áa]|existe|existem)\s+\w{0,14}\s*"
    r"(?:case|cases|review|depoimento|logotipo|prova|provas|resultado|credencial)"
    r"|(?:mera|apenas uma|somente uma) declara[çc][ãa]o"
    r"|n[ãa]o substitui prova"
    r"|declara[çc][ãa]o do titular"
    r"|vale menos que|inferior a um registro",
    re.I,
)

# O sujeito tem de ser a NOSSA credencial, o NOSSO histórico ou o NOSSO estoque
# de prova. Deliberadamente fora daqui: "CONFENGE", "responsável", "engenheiro",
# "experiência" e o genérico "prova". Eles aparecem em qualquer parágrafo e
# transformavam limite honesto de escopo -- "advocacia, promessa de recuperação
# ou tese sem evidência" -- em falso positivo. A regra é estreita de propósito:
# prefere deixar passar um caso duvidoso a proibir uma frase honesta.
SUBJECT = re.compile(
    r"\b(?:crea|registro profissional|conselho de classe|nota fiscal"
    r"|forma[çc][ãa]o|diploma|credencial|credenciais|t[íi]tulo profissional"
    r"|obras anteriores|obra anterior|hist[óo]rico profissional|portf[óo]lio"
    r"|acervo t[ée]cnico"
    r"|resultado de cliente|resultados de clientes|prova de cliente"
    r"|provas de clientes|cases?|depoimentos?|reviews?|logotipos?"
    r"|casos? de sucesso)\b",
    re.I,
)

# ---------------------------------------------------------------------------
# 2. Taxonomia interna e chave técnica impressas para o visitante.
# Estas reprovam sozinhas: não existe frase honesta que precise delas.
# ---------------------------------------------------------------------------
INTERNAL_TAXONOMY = re.compile(
    r"classe de permiss[ãa]o"
    r"|\bas_of\b"
    r"|\(as of\)"
    r"|\bas of\s+(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]+\s+\d{4})\b"
    r"|\bpermission[_ ]class\b"
    r"|\bproof[_ ]state\b"
    r"|\bWITHHELD\b|\bSELF_ATTESTED\b",
    re.I,
)

REVIEW_BACKSTAGE = re.compile(
    r"\bn[ãa]o houve\b[^.!?]{0,45}\b(?:revis[ãa]o humana|segundo revisor)\b"
    r"|\bsem\s+(?:revis[ãa]o humana|segundo revisor(?: independente)?)\b",
    re.I,
)

# ---------------------------------------------------------------------------
# 3. Manchete cujo assunto é a ausência.
# ---------------------------------------------------------------------------
HEADING_ABSENCE = re.compile(
    r"\b(?:nenhum[ao]?|zero|ainda n[ãa]o|n[ãa]o (?:h[áa]|temos|possu[íi]mos|existe|existem))\b"
    r"|\bsem\s+(?:prova|provas|caso|casos|credencial|credenciais|depoimento"
    r"|refer[êe]ncia|refer[êe]ncias|resultado|resultados)\b",
    re.I,
)
HEADING_SUBJECT = re.compile(
    r"\b(?:resultados?|casos?|cases?|provas?|depoimentos?|reviews?|clientes?"
    r"|credencial|credenciais|registro|portf[óo]lio|refer[êe]ncias?)\b",
    re.I,
)
# Uma pergunta dirigida ao leitor -- "Ainda não sabe em qual frente o seu caso
# entra?" -- fala da situação DELE, não da nossa prova. Não é autodepreciação.
HEADING_SECOND_PERSON = re.compile(r"\b(?:seu|sua|seus|suas|voc[êe]|te|lhe)\b", re.I)

HEADING_RE = re.compile(r"<h([1-3])\b[^>]*>(.*?)</h\1>", re.I | re.S)
SENTENCE_SPLIT = re.compile(r"(?<=[.!?;])\s+|\s*·\s*|\s*\|\s*")

RULES = ("deficit_sobre_nos", "taxonomia_interna", "manchete_de_ausencia")

# O registro histórico é preservado como foi publicado. Reescrevê-lo para
# satisfazer um gate de linguagem seria falsificar o passado. Rotas exatas.
ARCHIVE_ROUTES = (
    "politica-editorial/v/1.0.0/index.html",
    "politica-editorial/v/1.1.0/index.html",
    "politica-editorial/v/1.2.0/index.html",
    "politica-editorial/historico/index.html",
)

# The 2026-09-09 founder decision superseded the ratchet.  A historical
# baseline is evidence of what was once open; it is not authorization to ship
# any occurrence now.  There is therefore no mutable ceiling in this gate.


class _HumanNames(HTMLParser):
    """Texto lido por uma pessoa que não é o corpo visível da página."""

    WANTED_ATTRS = ("aria-label", "alt", "title", "placeholder", "aria-placeholder")
    WANTED_META = (
        "description",
        "og:description",
        "twitter:description",
        "og:title",
        "twitter:title",
    )

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


_JSONLD_RE = re.compile(
    r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.I | re.S,
)
_JSONLD_TEXT_KEYS = {
    "description",
    "disambiguatingDescription",
    "headline",
    "name",
    "abstract",
    "text",
    "jobTitle",
    "articleSection",
    "keywords",
    "serviceType",
    "alternateName",
    "slogan",
    "caption",
}


def jsonld_prose(html: str) -> str:
    """Prosa dentro de ld+json.

    Nem visible_text nem o parser de nomes humanos enxergam <script>, e foi
    exatamente ali que a moldura de ausência sobreviveu à primeira varredura:
    a description estruturada continuava dizendo que resultados de clientes
    "permanecem em zero". O buscador lê isso. Entra no escopo.
    """
    out: list[str] = []

    def append_text(node: object) -> None:
        if isinstance(node, str):
            out.append(node)
        elif isinstance(node, list):
            for item in node:
                append_text(item)
        elif isinstance(node, dict):
            for item in node.values():
                append_text(item)

    def walk(node: object) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if key in _JSONLD_TEXT_KEYS:
                    append_text(value)
                else:
                    walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    for match in _JSONLD_RE.finditer(html or ""):
        try:
            walk(json.loads(match.group(1)))
        except json.JSONDecodeError:
            continue
    return " ".join(" ".join(out).split())


_TEMPLATE_RE = re.compile(r"<template\b[^>]*>(.*?)</template>", re.I | re.S)
_TAG_RE = re.compile(r"<[^>]+>")
_SCRIPT_RE = re.compile(r"<script\b(?![^>]*application/ld\+json)[^>]*>(.*?)</script>", re.I | re.S)
_JS_TEXT_SINK_RE = re.compile(
    r"(?:\.\s*(?:textContent|innerText|innerHTML)|\b(?:textContent|innerText|innerHTML))"
    r"\s*=\s*([\"'`])((?:\\.|(?!\1).)*?)\1",
    re.I | re.S,
)
_JS_ATTRIBUTE_SINK_RE = re.compile(
    r"\.setAttribute\(\s*([\"'])(?:aria-label|aria-placeholder|title|alt|placeholder)\1"
    r"\s*,\s*([\"'`])((?:\\.|(?!\2).)*?)\2",
    re.I | re.S,
)
_JS_LITERAL_DECL_RE = re.compile(
    r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\"'`])"
    r"((?:\\.|(?!\2).)*?)\2\s*;?",
    re.S,
)
_JS_VARIABLE_TEXT_SINK_RE = re.compile(
    r"(?:\.\s*(?:textContent|innerText|innerHTML)|\b(?:textContent|innerText|innerHTML))"
    r"\s*=\s*([A-Za-z_$][\w$]*)\b",
    re.I,
)
_JS_VARIABLE_ATTRIBUTE_SINK_RE = re.compile(
    r"\.setAttribute\(\s*([\"'])(?:aria-label|aria-placeholder|title|alt|placeholder)\1"
    r"\s*,\s*([A-Za-z_$][\w$]*)\s*\)",
    re.I,
)


def dynamic_text_states(html: str) -> str:
    """Literal copy rendered by common interaction-time HTML/JS mechanisms.

    This is deliberately a bounded static analysis.  It covers HTML templates
    and literal assignments to the browser's text/accessibility sinks. It also
    resolves a same-script identifier declared as one static literal. It does
    not claim to understand arbitrary JavaScript, interpolation or runtime data;
    browser journey tests remain responsible for those.
    """
    parts: list[str] = []
    for raw in _TEMPLATE_RE.findall(html or ""):
        parts.append(_TAG_RE.sub(" ", raw))
    for script in _SCRIPT_RE.findall(html or ""):
        parts.extend(match.group(2) for match in _JS_TEXT_SINK_RE.finditer(script))
        parts.extend(match.group(3) for match in _JS_ATTRIBUTE_SINK_RE.finditer(script))
        literals = {match.group(1): match.group(3) for match in _JS_LITERAL_DECL_RE.finditer(script)}
        for match in _JS_VARIABLE_TEXT_SINK_RE.finditer(script):
            if match.group(1) in literals:
                parts.append(literals[match.group(1)])
        for match in _JS_VARIABLE_ATTRIBUTE_SINK_RE.finditer(script):
            if match.group(2) in literals:
                parts.append(literals[match.group(2)])
    return " ".join(" ".join(parts).split())


def human_names(html: str) -> str:
    parser = _HumanNames()
    parser.feed(html)
    return " ".join(" ".join(parser.parts).split())


def human_surface(html: str) -> str:
    """Corpo, nomes acessíveis, busca, dado estruturado e estados de interação."""
    return (
        f"{visible_text(html)} \n {human_names(html)} \n {jsonld_prose(html)}"
        f" \n {dynamic_text_states(html)}"
    )


def findings_for(html: str) -> dict[str, int]:
    """{regra: ocorrências} numa página."""
    counts: dict[str, int] = {}
    surface = human_surface(html)

    for sentence in SENTENCE_SPLIT.split(surface):
        if DEFICIT.search(sentence) and SUBJECT.search(sentence):
            counts["deficit_sobre_nos"] = counts.get("deficit_sobre_nos", 0) + 1

    n = len(INTERNAL_TAXONOMY.findall(surface))
    if n:
        counts["taxonomia_interna"] = n

    n = len(REVIEW_BACKSTAGE.findall(surface))
    if n:
        counts["bastidor_de_revisao"] = n

    for _level, raw in HEADING_RE.findall(html or ""):
        heading = " ".join(re.sub(r"<[^>]+>", " ", raw).split())
        if HEADING_SECOND_PERSON.search(heading):
            continue
        if HEADING_ABSENCE.search(heading) and HEADING_SUBJECT.search(heading):
            counts["manchete_de_ausencia"] = counts.get("manchete_de_ausencia", 0) + 1

    return counts


def _scan_files(base: Path, *, require_artifact: bool) -> list[Path]:
    if require_artifact:
        files = artifact_html_files(base)
        if not files:
            raise ValueError(f"public artifact has no HTML: {base}")
        return files
    return visitor_facing_html_files(base)


def scan(
    root: Path | None = None, *, require_artifact: bool = False
) -> dict[str, dict[str, int]]:
    """Scan every HTML surface, including noindex and interaction-time copy."""
    base = (root or ROOT).resolve()
    found: dict[str, dict[str, int]] = {}
    for path in _scan_files(base, require_artifact=require_artifact):
        rel = relpath(path, base)
        if rel in ARCHIVE_ROUTES:
            continue
        if require_artifact and "/" + rel.removesuffix("index.html") in MANIFEST_ROUTE_EXEMPT:
            continue
        counts = findings_for(path.read_text(encoding="utf-8", errors="replace"))
        if counts:
            found[rel] = counts
    return found


def failures(root: Path | None = None, *, require_artifact: bool = False) -> list[str]:
    found = scan(root, require_artifact=require_artifact)
    return [
        f"{rel}: '{rule}' x{n} — superfície pública não admite a ocorrência"
        for rel, counts in sorted(found.items())
        for rule, n in sorted(counts.items())
    ]


def test_self_deprecating_copy_does_not_reach_the_visitor() -> None:
    bad = failures()
    assert not bad, "comunicação autodepreciativa na superfície pública:\n  " + "\n  ".join(bad)


def test_detector_catches_the_exact_phrases_the_owner_ordered_removed() -> None:
    """Contra-prova: se o gerador reintroduzir a forma, isto reprova."""
    swept = (
        "<h1>Página</h1><p>O responsável é Engenheiro Civil formado pela EESC-USP. "
        "Registro no CREA, obras anteriores e disponibilidade para qualquer disciplina "
        "não estão afirmados aqui.</p>",
        '<h1>Página</h1><p class="authority-byline">Responsável: Engº Tiago Sasaki · '
        "Classe de permissão: demonstrativo (método, sem cliente)</p>",
        '<h1>Página</h1><p class="credential-as-of">as_of 4 de setembro de 2026.</p>',
        '<h1>Página</h1><p>Referência (as of 2026-08-17).</p>',
        '<h1>Página</h1><p>Referência da página (as of): <time>15 de agosto de 2026</time></p>',
        '<h1>Página</h1><p>Não houve revisão humana manual nem segundo revisor independente.</p>',
        "<h1>Página</h1><h2>Resultados de clientes: nenhum publicado até agora</h2>",
        "<h1>Página</h1><p>Formação em engenharia civil: declaração do titular.</p>",
        '<h1>Página</h1><script type="application/ld+json">'
        '{"@type":"WebPage","description":"Resultados de clientes permanecem em zero '
        'até existir autorização e evidência."}</script>',
        '<meta name="robots" content="noindex"><meta name="description" '
        'content="Credenciais sem comprovação"><h1>Rascunho</h1>',
        '<h1>Página</h1><section inert>Classe de permissão: WITHHELD</section>',
        '<h1>Página</h1><p aria-hidden="true">as_of 2026-09-09</p>',
        '<h1>Página</h1><template><p>Resultados de clientes permanecem em zero</p></template>',
        '<h1>Página</h1><script>status.textContent = "as_of 2026-09-09";</script>',
        '<h1>Página</h1><script>const copy = "proof_state: DRAFT"; status.textContent = copy;</script>',
    )
    for html in swept:
        assert findings_for(html), html[:90]


def test_detector_leaves_honest_uncertainty_and_demonstrative_labels_alone() -> None:
    """A regra varre autodepreciação, não honestidade nem rotulagem."""
    kept = (
        "<h1>Página</h1><p>Quando não há fonte que sustente um trecho, ele não sobe, "
        "e continua não subindo até existir a fonte.</p>",
        "<h1>Página</h1><p><strong>O que ainda não sabemos:</strong> fica dito que não "
        "sabemos, no lugar de um número inventado.</p>",
        "<h1>Página</h1><p>Não prometemos um prazo em dias porque nunca medimos um.</p>",
        '<h1>Página</h1><p class="case-badge">DEMONSTRATIVO · NÃO É CASO CONFENGE · '
        "NÃO É CASE DE CLIENTE</p>",
        "<h1>Página</h1><p>Exemplo demonstrativo, com dados sintéticos.</p>",
        "<h1>Página</h1><p>Engenheiro Civil formado pela EESC-USP, com registro "
        "profissional ativo no CREA e mais de R$ 700 milhões em obras e projetos "
        "analisados. Serviços técnicos emitidos com ART e nota fiscal.</p>",
        "<h1>Página</h1><p>Fonte: registro público</p><p>Fonte: Tiago Jun Sasaki</p>",
        '<h1>Página</h1><p>O prazo depende dos documentos recebidos e começa quando '
        'confirmamos o conjunto necessário.</p>',
        '<h1>Página</h1><p>Acervo técnico exigido pelo edital: CAT compatível com a parcela.</p>',
        '<h1>Página</h1><p>O projeto aprovado pela autoridade competente integra os documentos de entrada.</p>',
        '<script type="application/json">{"as_of":"2026-08-17T11:29:23Z"}</script>',
        '<h1>Página</h1><script>const copy = "Pedido recebido"; status.textContent = copy;</script>',
    )
    for html in kept:
        assert findings_for(html) == {}, (html[:90], findings_for(html))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--require-artifact", action="store_true")
    parser.add_argument("--record", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.record:
        print("REFUSED: the 2026-09-09 zero-tolerance gate cannot record open debt", file=sys.stderr)
        return 2
    for test in (
        test_detector_catches_the_exact_phrases_the_owner_ordered_removed,
        test_detector_leaves_honest_uncertainty_and_demonstrative_labels_alone,
    ):
        test()
        print(f"OK {test.__name__}")
    try:
        bad = failures(args.root, require_artifact=args.require_artifact)
        found = scan(args.root, require_artifact=args.require_artifact)
    except ValueError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    total = sum(sum(c.values()) for c in found.values())
    by_rule: dict[str, int] = {}
    for counts in found.values():
        for rule, n in counts.items():
            by_rule[rule] = by_rule.get(rule, 0) + n
    print(f"PUBLIC FINDINGS: {len(found)} routes, {total} occurrences")
    for rule, n in sorted(by_rule.items(), key=lambda kv: -kv[1]):
        print(f"  {rule:24} {n:5}")
    if bad:
        print(f"\nFAIL ({len(bad)}):")
        for line in bad:
            print("  " + line)
        return 1
    print("\nPASS: no self-deprecating communication on the public surface")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
