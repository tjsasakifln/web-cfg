#!/usr/bin/env python3
"""A comunicação pública apresenta uma solução técnica completa e sob medida.

Campanha SOLUCAO-INTEGRAL-20260913. O fundador decidiu em 2026-09-13 que a
superfície pública não sugere serviço pela metade, abandono depois do
diagnóstico, fragmentação obrigatória da contratação ("isso é outra compra")
nem incapacidade genérica de resolver a necessidade. Cada serviço conserva o
seu nome; a proposta compõe as etapas pertinentes.

O QUE ESTE GATE REPROVA:

1. FRAGMENTAÇÃO OU ABANDONO: a empresa termina prematuramente, apenas aponta,
   exige outra compra desconexa ou transfere ao cliente a coordenação do resto.
   "Isso é outra compra", "continuam compras diferentes", "entra só se for
   contratado à parte", "fica de fora desta unidade", "esta página vende X, não
   Y", "você recebe a indicação do que resolve".
2. BASTIDOR DE CAPACIDADE: inventário interno de ausências, maturidade ou
   autoridade apresentado como argumento comercial. "Não há landing própria",
   "quando ela já existe", "respondemos dizendo se podemos ajudar", "o que dá
   para fazer com o material disponível", identificadores operacionais como
   NEEDS_CONTEXT impressos para o visitante.
3. COMPLETUDE SEM TRABALHO: "solução completa", "solução personalizada",
   "personalizado" ou "sob medida" como slogan, sem que a mesma passagem enumere os trabalhos que compõem a
   solução. A regra e o vocabulário são os da exceção GX-06 do contrato de
   copy, lidos do JSON, para que fonte, scanner e auditoria concordem.

O QUE ESTE GATE NÃO TOCA -- e não deve passar a tocar:

* Informação material de uma oferta específica: preço, extensão contratada,
  obrigação, papel de terceiros, autoria de projeto alheio ("não assinamos
  projeto de terceiro"), condição de campo, ART, local.
* Limitação legítima de exemplo, dado, ferramenta gratuita ou fonte citada.
* Mensagem funcional de erro, privacidade, segurança ou consentimento.
* Distinção técnica útil entre modalidades quando explica a articulação e
  deixa a proposta compor as etapas.
* Proibição de prometer aprovação, êxito, prazo ou preço; isso continua nas
  proteções próprias (FL-08, success_boundary, política de preços).

COBERTURA: sobre a fonte, toda rota exata do registro público de famílias
precisa ter sido lida; sobre o artefato, todo HTML do inventário publicado
precisa ter sido lido. Um universo menor do que o declarado é falha, não PASS.
"""

from __future__ import annotations

import argparse
import json
import html as html_lib
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.public_copy_scope import (  # noqa: E402
    MANIFEST_ROUTE_EXEMPT,
    artifact_html_files,
    relpath,
    visitor_facing_html_files,
)
from scripts.site.test_self_deprecating_copy import (  # noqa: E402
    ARCHIVE_ROUTES,
    SENTENCE_SPLIT,
    human_surface,
)

COPY_CONTRACT = ROOT / "data/commercial/copy-contract.v1.json"
# Preservações por trecho: rota exata + texto exato + categoria + motivo. Se o
# texto mudar, a preservação caduca e o trecho volta a ser examinado.
EXCEPTIONS = ROOT / "data/site/integral-solution-exceptions.json"
FAMILY_REGISTRY = ROOT / "data/organic/public-family-registry.json"

# ---------------------------------------------------------------------------
# 1. Fragmentação ou abandono. O sujeito é a nossa entrega ou a nossa página.
# ---------------------------------------------------------------------------
FRAGMENTATION = re.compile(
    r"\b(?:e|é|sao|são|seria|seriam|continuam?|permanecem?|seguem?|ficam?|"
    r"vira|viram)\s+(?:uma\s+|duas\s+)?(?:outra|outras)\s+(?:compra|compras|conversa)\b"
    r"|\bisso\s+(?:e|é)\s+outra\s+compra\b"
    r"|\bcompras?\s+(?:distintas?|diferentes?|separadas?|desconexas?)\b"
    r"|\bcontratad[oa]s?\s+(?:a|à)\s+parte\b"
    r"|\bficam?\s+de\s+fora\s+(?:desta|dessa|deste|desse)\s+"
    r"(?:unidade|entrega|compra|pagina|página|servi[çc]o|proposta)\b"
    r"|\besta\s+p[aá]gina\s+(?:vende|n[aã]o\s+(?:vende|trata|cobre))\b"
    r"|\besta\s+n[aã]o\s+[eé]\s+a\s+p[aá]gina\s+de\b"
    r"|\bo\s+trabalho\s+(?:e|é|seria)\s+outro\b"
    r"|\bs[oó]\s+entra\s+(?:aqui\s+)?se\s+(?:a\s+proposta\s+(?:o|a|os|as)\s+nomear|estiver\s+contratad[oa])\b"
    r"|\bs[oó]\s+(?:ocorre|acontece)\s+em\s+proposta\s+posterior\b"
    r"|\b(?:recebe|receber|recebem|receba)\s+a\s+indica[çc][aã]o\b"
    r"|\bindica[çc][aã]o\s+do\s+que\s+resolve\b"
    r"|\bo\s+restante\s+(?:fica|e|é)\s+com\s+(?:voc[eê]|o\s+cliente)\b",
    re.I,
)

# ---------------------------------------------------------------------------
# 2. Bastidor de capacidade. Reprova sozinho: não existe frase comercial
# honesta que precise anunciar a inexistência de uma página ou a dúvida
# sobre a própria capacidade como argumento.
# ---------------------------------------------------------------------------
BACKSTAGE = re.compile(
    r"\bn[aã]o\s+h[aá]\s+(?:landing|p[aá]gina)\s+pr[oó]pria\b"
    r"|\b(?:quando|se)\s+ela\s+j[aá]\s+exist(?:e|ir)\b"
    r"|\b(?:dizendo|dizemos|dizer|avaliamos|avaliar|respondemos|responde)\s+se\s+"
    r"(?:podemos|pode|d[aá]\s+para|conseguimos)\s+ajudar\b"
    r"|\bse\s+(?:ela|a\s+situa[çc][aã]o|o\s+caso)\s+se\s+encaixa\s+na\s+atua[çc][aã]o\b"
    r"|\bo\s+que\s+d[aá]\s+para\s+fazer\s+com\s+o\s+material\b"
    r"|\bdepois\s+de\s+confirmarmos\s+que\s+podemos\s+assumir\b"
    r"|\bn[aã]o\s+estamos\s+prontos\b"
    r"|\bsem\s+capacidade\s+(?:para|de)\b"
    r"|\bpermanece\s+em\s+(?:aberto|contexto)\s+(?:at[eé]|,\s*n[aã]o\s+em\s+promessa)\b"
    r"|\bpermanece\s+em\s+contexto,\s+n[aã]o\s+em\s+promessa\b"
    r"|\bNEEDS_CONTEXT\b|\bSCOPE_REQUIRED\b|\bREQUEST_SCOPE_REVIEW\b",
    re.I,
)

# ---------------------------------------------------------------------------
# 3. Completude sem trabalho enumerado (GX-06, fonte única no contrato).
# ---------------------------------------------------------------------------
COMPLETENESS = re.compile(
    r"\bsolu[çc][aã]o\s+completa\b|\bsolu[çc][oõ]es\s+completas\b"
    r"|\bsolu[çc][aã]o\s+personalizada\b|\bsolu[çc][oõ]es\s+personalizadas\b"
    # bare adjectives released from brand.json and, outside the 23 B2G routes,
    # from FL-05: the campaign keeps them under the same enumeration rule
    r"|\bpersonalizad[oa]s?\b|\bsob[\s-]medida\b",
    re.I,
)

# A completeness claim next to a promise form is never rescued by enumeration:
# "solução completa garantida" / "garantimos aprovação" stay forbidden (FL-08).
PROMISE = re.compile(r"\bgarant(?:imos|ia de|ias de|id[oa]s?)\b|\baprova[çc][aã]o garantida\b|\b[eê]xito garantido\b", re.I)

RULES = ("fragmentacao_ou_abandono", "bastidor_de_capacidade", "completude_sem_trabalho", "completude_com_promessa")


SEARCH_INDEX = re.compile(r'\sdata-search="([^"]*)"', re.I)


def _strip(text: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn"
    ).lower()


def load_enumeration_rule() -> dict:
    contract = json.loads(COPY_CONTRACT.read_text(encoding="utf-8"))
    rule = next(item for item in contract["gate_exceptions"] if item["id"] == "GX-06")
    if rule.get("implemented_as") != "enumerated_scope_adjacency":
        raise ValueError("GX-06 is not the enumerated-scope exception any more")
    return rule


def enumerates_work(surface: str, index: int, matched_len: int, rule: dict) -> bool:
    """Same passage rule as scripts/commercial/copy_contract_audit.mjs."""
    window = int(rule.get("window_chars") or 420)
    minimum = int(rule.get("minimum_work_terms") or 3)
    text = _strip(surface)
    before = text[max(0, index - window) : index]
    start = max(before.rfind("."), before.rfind("!"), before.rfind("?"), before.rfind(":")) + 1
    # Forward: the sentence holding the term plus the next one, never further.
    # A navigation list three blocks later must not rescue a bare slogan.
    after = text[index + matched_len : index + matched_len + window]
    stops = [m.end() for m in re.finditer(r"[.!?]", after)]
    if len(stops) >= 2:
        after = after[: stops[1]]
    passage = before[start:] + text[index : index + matched_len] + after
    seen: set[str] = set()
    for term in rule.get("work_vocabulary", []):
        term_n = _strip(term)
        if re.search(r"\b" + re.escape(term_n).replace(r"\ ", r"\s+"), passage):
            seen.add(term_n.split()[0][:6])
    return len(seen) >= minimum


def load_exceptions() -> list[dict]:
    if not EXCEPTIONS.is_file():
        return []
    rows = json.loads(EXCEPTIONS.read_text(encoding="utf-8")).get("preserved", [])
    for row in rows:
        # Route-exact, dated, owned by an issue, with the legitimate category and
        # the specific reason (AGENTS.md: commercial exceptions are never anonymous).
        for key in ("route", "rule", "text", "category", "reason", "issue", "owner", "reviewed_at"):
            if not row.get(key):
                raise ValueError(f"integral-solution exception without {key}: {row}")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(row["reviewed_at"])):
            raise ValueError(f"integral-solution exception reviewed_at must be YYYY-MM-DD: {row}")
        if len(str(row["reason"])) < 40:
            raise ValueError(f"integral-solution exception reason too short to name offer, information and effect: {row}")
        if row["category"] not in ("C3", "C4", "C5", "C6", "C7"):
            raise ValueError(f"exception must name a legitimate category, got {row['category']}")
    return rows


def _preserved(rel: str, rule_id: str, sentence: str, exceptions: list[dict]) -> bool:
    route = "/" + rel.removesuffix("index.html")
    return any(
        row["route"] == route and row["rule"] == rule_id and row["text"] in sentence
        for row in exceptions
    )


def findings_for(html: str, rule: dict | None = None, rel: str = "", exceptions: list[dict] | None = None) -> dict[str, list[str]]:
    """{regra: [trechos]} numa página."""
    rule = rule or load_enumeration_rule()
    exceptions = exceptions or []
    found: dict[str, list[str]] = {}
    surface = human_surface(html)
    # the visitor searches the content directory through data-search; that index
    # is read like copy (found stale on /conteudos/ after the 2026-09-13 release)
    search_index = " ".join(html_lib.unescape(m.group(1)) for m in SEARCH_INDEX.finditer(html))
    if search_index:
        surface = surface + ". " + search_index

    for sentence in SENTENCE_SPLIT.split(surface):
        if FRAGMENTATION.search(sentence) and not _preserved(rel, "fragmentacao_ou_abandono", sentence, exceptions):
            found.setdefault("fragmentacao_ou_abandono", []).append(sentence.strip()[:160])
        if BACKSTAGE.search(sentence) and not _preserved(rel, "bastidor_de_capacidade", sentence, exceptions):
            found.setdefault("bastidor_de_capacidade", []).append(sentence.strip()[:160])

    stripped = _strip(surface)
    for match in COMPLETENESS.finditer(stripped):
        snippet = surface[max(0, match.start() - 40) : match.end() + 80].strip()[:160]
        if not enumerates_work(surface, match.start(), len(match.group(0)), rule):
            found.setdefault("completude_sem_trabalho", []).append(snippet)
        window = stripped[max(0, match.start() - 160) : match.end() + 160]
        if PROMISE.search(window):
            found.setdefault("completude_com_promessa", []).append(snippet)
    return found


def _scan_files(base: Path, *, require_artifact: bool) -> list[Path]:
    if require_artifact:
        files = artifact_html_files(base)
        if not files:
            raise ValueError(f"public artifact has no HTML: {base}")
        return files
    return visitor_facing_html_files(base)


def coverage_problems(
    base: Path, scanned: list[str], *, require_artifact: bool, manifest: Path | None = None
) -> list[str]:
    """The declared universe must be a subset of what was actually read."""
    problems: list[str] = []
    read = set(scanned)
    if require_artifact:
        # The manifest is written by scripts/pseo/public_artifact.py next to the
        # source tree (seo/), describing the assembled _site; it is the
        # independent inventory the scan is reconciled against.
        manifest = manifest or (ROOT / "seo" / "PUBLIC-ARTIFACT-MANIFEST.json")
        if not manifest.is_file():
            return [f"artifact manifest missing: {manifest}"]
        data = json.loads(manifest.read_text(encoding="utf-8"))
        expected = {route.strip("/") + "/index.html" if route != "/" else "index.html" for route in data.get("html_routes", [])}
        expected |= {name for name in data.get("root_files", []) if name.endswith(".html")}
        if data.get("html_route_count") != len(data.get("html_routes", [])):
            problems.append("manifest html_route_count disagrees with html_routes")
    else:
        registry = json.loads(FAMILY_REGISTRY.read_text(encoding="utf-8"))
        expected = set()
        for family in registry.get("families", []):
            for route in family.get("match", {}).get("routes", []):
                expected.add(route.strip("/") + "/index.html" if route != "/" else "index.html")
    missing = sorted(route for route in expected if route not in read and "/" + route.removesuffix("index.html") not in MANIFEST_ROUTE_EXEMPT)
    for route in missing:
        problems.append(f"declared public route not read by the gate: {route}")
    if not expected:
        problems.append("declared universe is empty")
    return problems


def scan(
    root: Path | None = None, *, require_artifact: bool = False, manifest: Path | None = None
) -> tuple[dict[str, dict[str, list[str]]], list[str], list[str]]:
    base = (root or ROOT).resolve()
    rule = load_enumeration_rule()
    exceptions = load_exceptions()
    found: dict[str, dict[str, list[str]]] = {}
    scanned: list[str] = []
    used: set[int] = set()
    for path in _scan_files(base, require_artifact=require_artifact):
        rel = relpath(path, base)
        scanned.append(rel)
        if rel in ARCHIVE_ROUTES:
            continue
        if require_artifact and "/" + rel.removesuffix("index.html") in MANIFEST_ROUTE_EXEMPT:
            continue
        html = path.read_text(encoding="utf-8", errors="replace")
        hits = findings_for(html, rule, rel, exceptions)
        if hits:
            found[rel] = hits
        surface = human_surface(html)
        route = "/" + rel.removesuffix("index.html")
        for i, row in enumerate(exceptions):
            if row["route"] == route and row["text"] in surface:
                used.add(i)
    coverage = coverage_problems(base, scanned, require_artifact=require_artifact, manifest=manifest)
    for i, row in enumerate(exceptions):
        if i not in used:
            coverage.append(f"stale preservation: {row['route']} no longer contains {row['text']!r}; re-examine or remove it")
    return found, scanned, coverage


def failures(root: Path | None = None, *, require_artifact: bool = False) -> list[str]:
    found, _scanned, coverage = scan(root, require_artifact=require_artifact)
    lines = [f"coverage: {problem}" for problem in coverage]
    for rel, hits in sorted(found.items()):
        for rule_id, snippets in sorted(hits.items()):
            for snippet in snippets:
                lines.append(f"{rel}: '{rule_id}' {snippet!r}")
    return lines


def test_public_surface_presents_an_integral_solution() -> None:
    bad = failures()
    assert not bad, "comunicação fragmentada ou de bastidor na superfície pública:\n  " + "\n  ".join(bad)


def test_detector_catches_fragmentation_backstage_and_empty_completeness() -> None:
    """Contra-prova: se um gerador reintroduzir a forma, isto reprova."""
    rule = load_enumeration_rule()
    swept = (
        ("<h1>Revisão</h1><p>Elaborar a disciplina que falta é outra compra.</p>", "fragmentacao_ou_abandono"),
        ("<h1>Revisão</h1><p>Revisão, elaboração e compatibilização continuam compras diferentes.</p>", "fragmentacao_ou_abandono"),
        ("<h1>Inspeção</h1><p>Projeto de reparo: não está nesta entrega; entra só se for contratado à parte.</p>", "fragmentacao_ou_abandono"),
        ("<h1>Inspeção</h1><p>Projeto de reparo e perícia ficam de fora desta unidade.</p>", "fragmentacao_ou_abandono"),
        ("<h1>Complementares</h1><p>Esta página vende elaboração, não revisão nem parceria.</p>", "fragmentacao_ou_abandono"),
        ("<h1>Home</h1><p>Você recebe a indicação do que resolve.</p>", "fragmentacao_ou_abandono"),
        # paráfrase representativa do mesmo abandono
        ("<h1>SST</h1><p>Produção do módulo só ocorre em proposta posterior.</p>", "fragmentacao_ou_abandono"),
        ("<h1>Hub</h1><p>Não há landing própria nesta publicação; o pedido entra aqui.</p>", "bastidor_de_capacidade"),
        ("<h1>Triagem</h1><p>A CONFENGE responde dizendo se pode ajudar e quais informações faltam.</p>", "bastidor_de_capacidade"),
        ("<h1>Home</h1><p>Depois: resposta sobre o que dá para fazer com o material disponível.</p>", "bastidor_de_capacidade"),
        ("<h1>Hub</h1><p>Cada situação nomeia a página própria, quando ela já existe.</p>", "bastidor_de_capacidade"),
        ('<h1>Página</h1><meta name="description" content="Não há landing própria para avaliação.">', "bastidor_de_capacidade"),
        ('<h1>Página</h1><script type="application/ld+json">{"@type":"Service","description":"Elaborar é outra compra."}</script>', "fragmentacao_ou_abandono"),
        ('<h1>Página</h1><script>status.textContent = "A resposta diz se ela se encaixa na atuação da CONFENGE.";</script>', "bastidor_de_capacidade"),
        ('<h1>Página</h1><p aria-hidden="true">Isso é outra compra.</p>', "fragmentacao_ou_abandono"),
        ('<h1>Biblioteca</h1><article data-search="revisão e compatibilização três compras distintas: conferir"><p>Três etapas com nome próprio.</p></article>', "fragmentacao_ou_abandono"),
        ('<h1>Página</h1><details><summary>Limites</summary><p>Compatibilizar é uma compra distinta de elaborar.</p></details>', "fragmentacao_ou_abandono"),
        ("<h1>Página</h1><p>Solução completa para a sua obra. Fale com a gente.</p>", "completude_sem_trabalho"),
        ('<h1>Página</h1><img alt="soluções personalizadas em engenharia">', "completude_sem_trabalho"),
        ("<h1>Página</h1><p>Atendimento personalizado para a sua obra. Fale com a gente.</p>", "completude_sem_trabalho"),
        ("<h1>Página</h1><p>Engenharia sob medida para o seu empreendimento.</p>", "completude_sem_trabalho"),
        # inputs the client already has are not work of ours
        ("<h1>Página</h1><p>Solução completa para quem já tem projeto, edital e planilha.</p>", "completude_sem_trabalho"),
        ("<h1>Página</h1><p>Solução completa garantida: elaboração, revisão e compatibilização com aprovação garantida.</p>", "completude_com_promessa"),
        ("<h1>Página</h1><p>Solução completa: projeto, cronograma e relatório.</p>", "completude_sem_trabalho"),
        # a service list two sentences later, in another block, does not rescue a bare slogan
        ("<h1>Erro</h1><p>Solução completa para a sua obra. Fale com a gente.</p><p>Confira o endereço.</p>"
         "<ul><li>Projeto, revisão, compatibilização, orçamento e perícia.</li></ul>", "completude_sem_trabalho"),
    )
    for html, expected in swept:
        got = findings_for(html, rule)
        assert expected in got, (html[:90], got)


def test_detector_leaves_material_truth_examples_and_enumerated_offers_alone() -> None:
    """A regra varre abandono e slogan, não verdade material nem exemplo."""
    rule = load_enumeration_rule()
    kept = (
        "<h1>Revisão</h1><p>Não substituímos o autor original nem assinamos projeto de terceiro; "
        "a devolutiva vai ao autor e os ajustes previstos seguem na mesma proposta.</p>",
        "<h1>Complementares</h1><p>A autoria arquitetônica permanece com o autor de origem.</p>",
        "<h1>Orçamento</h1><p>O serviço de R$ 5.900 e 7 dias úteis reconcilia cronograma, registros e comunicações.</p>",
        "<h1>Orçamento</h1><p>Exemplo demonstrativo com números hipotéticos. Não é obra de cliente.</p>",
        "<h1>Ferramenta</h1><p>A saída é uma triagem numérica, não uma conclusão jurídica.</p>",
        "<h1>Contato</h1><p>O formulário não está disponível agora. Use WhatsApp, e-mail ou telefone.</p>",
        "<h1>Inspeção</h1><p>A vistoria é indispensável e o deslocamento entra na proposta.</p>",
        "<h1>Serviços</h1><p>Proposta sob medida: elaboração, revisão e compatibilização das disciplinas, "
        "com quantitativos e orçamento no mesmo escopo.</p>",
        "<h1>Serviços</h1><p>Conduzimos uma solução completa e sob medida: elaboração das disciplinas que faltam, "
        "revisão do que já existe, compatibilização das interfaces, quantitativos e orçamento.</p>",
        "<h1>Serviços</h1><p>Revisão, compatibilização e quantitativos entram na mesma proposta quando a "
        "necessidade pede uma solução completa.</p>",
        "<h1>Perícia</h1><p>Nunca prometemos aprovação, deferimento ou êxito judicial.</p>",
        "<h1>Compatibilização</h1><p>Compatibilizar registra as interferências; elaborar produz a disciplina; "
        "a proposta combina as duas etapas quando o caso pede.</p>",
        '<h1>Página</h1><a data-terminal-action="NEEDS_CONTEXT" href="/triagem-tecnica/">Conte a necessidade</a>',
    )
    for html in kept:
        assert findings_for(html, rule) == {}, (html[:90], findings_for(html, rule))


def test_enumeration_rule_is_the_contract_rule() -> None:
    rule = load_enumeration_rule()
    assert rule["minimum_work_terms"] >= 3
    assert "revisao" in rule["work_vocabulary"] and "orcamento" in rule["work_vocabulary"]


def test_coverage_refuses_a_smaller_universe(tmp_path: Path | None = None) -> None:
    """Omitir uma rota declarada do universo lido é falha, não PASS."""
    base = ROOT
    registry = json.loads(FAMILY_REGISTRY.read_text(encoding="utf-8"))
    declared = [
        route for family in registry.get("families", []) for route in family.get("match", {}).get("routes", [])
    ]
    assert declared, "registry declares no exact routes"
    full = [relpath(path, base) for path in visitor_facing_html_files(base)]
    assert coverage_problems(base, full, require_artifact=False) == []
    victim = declared[0].strip("/") + "/index.html" if declared[0] != "/" else "index.html"
    smaller = [rel for rel in full if rel != victim]
    problems = coverage_problems(base, smaller, require_artifact=False)
    assert any(victim in problem for problem in problems), problems


# --- contact paths (campaign v2: transversal communication and contact) -----

B2G_ONLY_PREFILL = "demanda relacionada a licitação, contrato ou obra pública"
WA_LINK = re.compile(r'href="https://wa\.me/\d+\?text=([^"]+)"', re.I)


def _wa_texts(html: str) -> list[str]:
    from urllib.parse import unquote

    return [unquote(m.group(1)) for m in WA_LINK.finditer(html)]


def contact_path_problems(rel: str, html: str) -> list[str]:
    """Transversal contact surfaces must welcome public and private needs.

    /conteudos/ lists private paths (projeto, orçamento, inspeção, SST...); its
    general invitation and floating WhatsApp may not assume a public-works
    demand, may not ask for documents on first contact, and must keep an
    explicit public-works path. The 404 is reached from any URL. The triage
    item that names quantitativos/orçamento must let the visitor leave with an
    orçamento message, not only an inspection one.
    """
    problems: list[str] = []
    if rel in ("conteudos/index.html", "404.html"):
        for text in _wa_texts(html):
            if B2G_ONLY_PREFILL in text:
                problems.append(f"{rel}: WhatsApp pré-preenchido só de obra pública: {text!r}")
    if rel == "conteudos/index.html":
        start = html.find('<section class="content-cta">')
        cta = html[start : html.find("</section>", start)] if start >= 0 else ""
        if not cta:
            problems.append(f"{rel}: convite geral (content-cta) ausente")
        else:
            plain = _strip(re.sub(r"<[^>]+>", " ", cta))
            if re.search(r"\benvie\b[^.]{0,80}\b(contrato|planilha|medi[çc][õo]es|projeto|laudo)\b", plain, re.I):
                problems.append(f"{rel}: convite geral pede documentos no primeiro contato")
            if not re.search(r"projeto|revis[ãa]o|or[çc]amento|inspe[çc][ãa]o|seguran[çc]a do trabalho", plain, re.I):
                problems.append(f"{rel}: convite geral não acolhe necessidades privadas")
            if 'href="/servicos-obras-publicas/"' not in cta:
                problems.append(f"{rel}: convite geral perdeu o caminho próprio de obra pública")
    if rel == "triagem-tecnica/index.html":
        start = html.find('<li id="obra-imovel">')
        item = html[start : html.find("</li>", start)] if start >= 0 else ""
        texts = _wa_texts(item)
        plain = _strip(re.sub(r"<[^>]+>", " ", item))
        if re.search(r"quantitativos|or[çc]amento", plain, re.I):
            if not any(re.search(r"quantitativos|or[çc]amento", t, re.I) for t in texts):
                problems.append(f"{rel}#obra-imovel: nomeia orçamento mas só sai com mensagem de inspeção")
            if 'href="/quantitativos-orcamento-obras/"' not in item:
                problems.append(f"{rel}#obra-imovel: sem caminho para a página de quantitativos e orçamento")
        if not any(re.search(r"inspecionar|documentar", t, re.I) for t in texts):
            problems.append(f"{rel}#obra-imovel: caminho de inspeção removido")
    return problems


CONTACT_PATH_FILES = ("conteudos/index.html", "404.html", "triagem-tecnica/index.html")


def contact_path_findings(root: Path) -> list[str]:
    out: list[str] = []
    for rel in CONTACT_PATH_FILES:
        path = root / rel
        if not path.is_file():
            out.append(f"{rel}: ausente em {root}")
            continue
        out.extend(contact_path_problems(rel, path.read_text(encoding="utf-8", errors="replace")))
    return out


def test_contact_paths_reject_public_only_invitation_and_budget_as_inspection() -> None:
    """Contra-provas: as formas antigas reprovam; as atuais passam."""
    wa = "https://wa.me/5548988344559?text="
    old_hub = (
        '<section class="content-cta"><div><h2>Envie contrato, planilha e medições e receba a leitura técnica do seu caso.</h2>'
        f'<a href="{wa}Ol%C3%A1%2C%20Tiago.%20Gostaria%20de%20analisar%20uma%20demanda%20relacionada%20a%20licita%C3%A7%C3%A3o%2C%20contrato%20ou%20obra%20p%C3%BAblica.">Analisar</a></div></section>'
    )
    got = contact_path_problems("conteudos/index.html", old_hub)
    assert any("só de obra pública" in g for g in got) and any("pede documentos" in g for g in got) and any("obra pública" in g for g in got), got
    old_404 = f'<aside class="contact-float"><a href="{wa}Ol%C3%A1%2C%20Tiago.%20Gostaria%20de%20analisar%20uma%20demanda%20relacionada%20a%20licita%C3%A7%C3%A3o%2C%20contrato%20ou%20obra%20p%C3%BAblica.">W</a></aside>'
    assert contact_path_problems("404.html", old_404), "404 com prefill só de obra pública deveria reprovar"
    old_triage = (
        '<li id="obra-imovel"><strong>Obra ou imóvel para inspecionar.</strong> Infiltração, laudo de estado, quantitativos ou orçamento. '
        f'<a href="{wa}Ol%C3%A1%2C%20Tiago.%20Tenho%20uma%20obra%20ou%20im%C3%B3vel%20para%20inspecionar%20ou%20documentar.">Falar</a></li>'
    )
    got = contact_path_problems("triagem-tecnica/index.html", old_triage)
    assert any("só sai com mensagem de inspeção" in g for g in got) and any("sem caminho" in g for g in got), got
    new_triage = (
        '<li id="obra-imovel"><strong>Obra ou imóvel para inspecionar, documentar ou orçar.</strong> Laudo de estado: '
        f'<a href="{wa}Ol%C3%A1.%20Tenho%20uma%20obra%20para%20inspecionar%20ou%20documentar.">Falar</a>. Quantitativos ou orçamento: '
        f'<a href="{wa}Ol%C3%A1.%20Quero%20proposta%20de%20quantitativos%20ou%20or%C3%A7amento.">Falar</a> ou <a href="/quantitativos-orcamento-obras/">ver</a>.</li>'
    )
    assert contact_path_problems("triagem-tecnica/index.html", new_triage) == [], contact_path_problems("triagem-tecnica/index.html", new_triage)
    new_hub = (
        '<section class="content-cta"><div><h2>Descreva a necessidade; a resposta indica o trabalho de engenharia que a resolve.</h2>'
        '<p>Projeto, revisão, orçamento ou inspeção. Contrato ou planilha só entram depois, pelo canal seguro. <a href="/servicos-obras-publicas/">Obra pública</a>.</p>'
        f'<a href="{wa}Ol%C3%A1.%20Quero%20conversar%20sobre%20um%20projeto%20ou%20servi%C3%A7o%20de%20engenharia.">Analisar</a></div></section>'
    )
    assert contact_path_problems("conteudos/index.html", new_hub) == [], contact_path_problems("conteudos/index.html", new_hub)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--require-artifact", action="store_true")
    parser.add_argument("--manifest", type=Path, help="artifact inventory (default seo/PUBLIC-ARTIFACT-MANIFEST.json)")
    parser.add_argument("--json", type=Path, help="write the findings map here")
    args = parser.parse_args()
    for test in (
        test_detector_catches_fragmentation_backstage_and_empty_completeness,
        test_detector_leaves_material_truth_examples_and_enumerated_offers_alone,
        test_enumeration_rule_is_the_contract_rule,
        test_coverage_refuses_a_smaller_universe,
        test_contact_paths_reject_public_only_invitation_and_budget_as_inspection,
    ):
        test()
        print(f"OK {test.__name__}")
    try:
        found, scanned, coverage = scan(args.root, require_artifact=args.require_artifact, manifest=args.manifest)
    except ValueError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    total = sum(len(v) for hits in found.values() for v in hits.values())
    print(f"SCANNED: {len(scanned)} html files under {args.root}")
    print(f"PUBLIC FINDINGS: {len(found)} routes, {total} occurrences")
    by_rule: dict[str, int] = {}
    for hits in found.values():
        for rule_id, snippets in hits.items():
            by_rule[rule_id] = by_rule.get(rule_id, 0) + len(snippets)
    for rule_id, n in sorted(by_rule.items(), key=lambda kv: -kv[1]):
        print(f"  {rule_id:28} {n:5}")
    if args.json:
        args.json.write_text(
            json.dumps({"scanned": len(scanned), "coverage": coverage, "findings": found}, ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
    bad = [f"coverage: {problem}" for problem in coverage]
    bad.extend(f"contact: {problem}" for problem in contact_path_findings(args.root))
    for rel, hits in sorted(found.items()):
        for rule_id, snippets in sorted(hits.items()):
            for snippet in snippets:
                bad.append(f"{rel}: '{rule_id}' {snippet!r}")
    if bad:
        print(f"\nFAIL ({len(bad)}):")
        for line in bad:
            print("  " + line)
        return 1
    print("\nPASS: the public surface presents an integral solution")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
