"""Render the bounded, verified PNCP climatization sector sample."""
from __future__ import annotations

import hashlib
import json
from html import escape
from pathlib import Path
from typing import Any, Callable

from scripts.pseo.html_shell import ORG_JSONLD, SITE, breadcrumb_jsonld, breadcrumbs_html, page_shell
from scripts.pseo.market_intelligence_sample import _linked_contract_table, EDITORIAL_SHEET_LINK

ROUTE = "/inteligencia/fornecedores-climatizacao-contratos-publicos/"
VERSION = "climatizacao-sample.v1"
AS_OF = "2026-10-14"
SAMPLE = "climatizacao-sample.v1.json"
MANIFEST = "climatizacao-verification.v1.json"


class SampleError(ValueError):
    pass


def _canonical_sha256(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


def load_snapshot(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    manifest_path = path.with_name(MANIFEST)
    if data.get("schema") != "confenge.market-intelligence-sector-sample/1.0":
        raise SampleError("invalid sample schema")
    if data.get("version") != VERSION or data.get("as_of") != AS_OF:
        raise SampleError("invalid sample identity")
    records = data.get("records")
    if not isinstance(records, list) or len(records) != 5:
        raise SampleError("sample must contain exactly five records")
    ids = [row.get("id") for row in records]
    if len(set(ids)) != 5 or any(not isinstance(item, str) for item in ids):
        raise SampleError("invalid record ids")
    for row in records:
        if not all(isinstance(row.get(key), str) and row[key] for key in ("id", "official_url", "observed_role", "object", "publication_date")):
            raise SampleError("missing public record field")
        if not row["official_url"].startswith("https://pncp.gov.br/"):
            raise SampleError("invalid official url")
    if not manifest_path.is_file():
        raise SampleError("verification manifest missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema") != "confenge.market-intelligence-sector-verification/1.0" or manifest.get("as_of") != data["as_of"]:
        raise SampleError("invalid verification schema")
    if manifest.get("sample_sha256") != _canonical_sha256(data):
        raise SampleError("manifest canonical hash mismatch")
    manifest_without_digest = {key: value for key, value in manifest.items() if key != "verification_sha256"}
    if manifest.get("verification_sha256") != _canonical_sha256(manifest_without_digest):
        raise SampleError("verification manifest digest mismatch")
    if data.get("claims_sha256") != _canonical_sha256({"records": records, "limits": data.get("limits")}):
        raise SampleError("sample claims digest mismatch")
    verified = manifest.get("records") or []
    if {item.get("id") for item in verified} != set(ids):
        raise SampleError("verification ids diverge")
    by_id = {item["id"]: item for item in records}
    for item in verified:
        record = by_id[item["id"]]
        if item.get("official_url") != record["official_url"] or item.get("object_sha256") != record.get("object_sha256") or item.get("document_url") != record["evidence_document"]["official_url"] or item.get("document_sha256") != record["evidence_document"]["sha256"]:
            raise SampleError("verification record fields diverge")
        if item.get("projection_sha256") != _canonical_sha256(record):
            raise SampleError("verification projection missing")
    return data


def render(data: dict[str, Any], capture_factory: Callable[..., str]) -> str:
    digest = _canonical_sha256(data)
    rows = []
    sources = []
    for item in data["records"]:
        buyer = item["buyer"]
        place = item.get("execution_location") or "não confirmado no registro exibido"
        rows.append(([item["id"], f'{item["supplier"]["name"]} ({item["supplier"]["cnpj"]})', item["observed_role"], item["object"], f'{buyer["name"]} ({buyer["cnpj"]})', buyer["uf"], place, item["publication_date"]], item["official_url"]))
        document = item["evidence_document"]
        sources.append(f'<li>{escape(item["supplier"]["name"])}: <a href="{escape(item["official_url"], quote=True)}" rel="noopener">contrato no PNCP</a> · <a href="{escape(document["official_url"], quote=True)}" rel="noopener">{escape(document["type"])}</a></li>')
    table = _linked_contract_table(["Contrato", "Fornecedor", "Papel observado", "Objeto", "Comprador", "UF", "Local de execução", "Publicação"], rows, "Cinco contratos de climatização verificados")
    body = f'''<div data-sector-sample-version="{VERSION}" data-sector-sample-as-of="{data['as_of']}" data-sector-sample-sha256="{digest}">{breadcrumbs_html([("Início", "/"), ("Inteligência", "/inteligencia/"), ("Climatização", None)])}
<header class="content-hero article-hero"><div class="container content-hero-grid"><div><p class="eyebrow t-kicker">Amostra pública verificada</p><h1 class="t-service">Fornecedores de climatização em contratos públicos: quem fornece, instala ou mantém?</h1><p class="content-lead measure">Cinco contratos públicos mostram papéis descritos nos objetos: fornecimento de equipamentos, locação com serviços, manutenção continuada ou corretiva e fornecimento/instalação quando o documento o declara.</p></div></div></header>
<div class="container article-layout"><article class="article-main"><div class="answer-box"><span>Resposta direta</span><p>BAGATOLI aparece com fornecimento e instalação no Grupo 1; D L TORQUATO, com equipamentos sem instalação; LOC TUDO, com locação e serviços; TERMSUL, com manutenção continuada; e EMEREL, com intervenção corretiva. São papéis documentados nesses contratos, a conferir com o produto e o território de quem pesquisa; não formam ranking ou carteira de canais.</p></div>
<section><h2>Os cinco contratos conferidos</h2>{table}<p>Fontes por caso:</p><ul>{''.join(sources)}</ul></section>
<section class="sources-section" id="metodo" data-dataset="{VERSION}"><h2>Método e corte</h2><p><strong>Base de dados deste recorte:</strong> cinco contratos PNCP e seus documentos oficiais, conferidos em 14/10/2026. A busca usou os termos climatização, ar condicionado e condicionamento de ar; considerou publicações de 01/09 a 11/10/2026, limitou a leitura a 30 candidatos e selecionou intencionalmente cinco casos para contrastar papéis documentados. Excluiu registros inativos, sem CNPJ de fornecedor e casos sem confirmação oficial. A UF é do comprador; local de execução só aparece quando o objeto o confirma.</p></section>
<section><h2>Comparações que mudam a seleção</h2><div class="grid-2"><article><h3>D L TORQUATO e BAGATOLI</h3><p>D L TORQUATO fornece Split Inverter com itens sem instalação; BAGATOLI tem aquisição e instalação no Grupo 1. Para um fabricante, falta verificar qual linha do catálogo e qual território interessam antes de tratá-las como canais comparáveis.</p></article><article><h3>TERMSUL e EMEREL</h3><p>TERMSUL aparece em manutenção continuada com materiais sob demanda; EMEREL em corretiva específica. Quem vende produto ou assistência precisa decidir se procura base de manutenção, uma intervenção pontual ou outra relação documental.</p></article><article><h3>Seleção para o seu catálogo</h3><p>A entrega é uma tabela de organizações selecionadas com fonte, papel observado, regra de inclusão e pergunta pendente, acompanhada da interpretação para a decisão do comprador. Para delimitar a pesquisa, informe catálogo, território, produto/aplicação e se precisa investigar fornecimento, instalação ou manutenção.</p></article></div></section>
<section><h2>Perguntas antes de selecionar um canal</h2><p>Qual produto e aplicação do catálogo devem aparecer? O território e o local de execução são confirmados? O documento sustenta fornecimento, instalação, manutenção ou somente material? Quem deve ser aprofundado por fonte adicional antes de qualquer abordagem?</p></section>
<section><h2>Uma pesquisa para o seu catálogo</h2><p>Defina catálogo, território e critérios de seleção. A CONFENGE propõe fontes, recorte, documentos determinantes, formato e revisão para uma seleção verificável.</p><p><a class="button button-primary" href="#captura-estudo">Pedir seleção para meu catálogo</a> <a class="button button-secondary" href="/inteligencia/orgaos/">Conhecer o mapeamento de organizações</a></p></section></article></div>
{capture_factory(path=ROUTE, asset_id="im-climatizacao-v1", heading="Informe catálogo, território e o tipo de organização a selecionar", prompt="Informe o produto, o território e se precisa investigar fornecimento, instalação ou manutenção.", button="Solicitar seleção de fornecedores", analysis_cutoff=data['as_of'], evidence_pack_version=VERSION)}</div>'''
    title = "Fornecedores de climatização em contratos públicos | CONFENGE"
    description = "Cinco contratos públicos de climatização com papéis observados e fontes verificáveis."
    crumbs = [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Climatização", None)]
    graph = [ORG_JSONLD, {"@type": "WebPage", "@id": f"{SITE}{ROUTE}#webpage", "url": f"{SITE}{ROUTE}", "name": title, "description": description, "dateModified": data["as_of"]}, {"@type": "Dataset", "name": "Amostra de cinco contratos públicos de climatização", "description": "Cinco casos verificados; não é censo, ranking ou mercado total.", "dateModified": data["as_of"], "citation": [item["official_url"] for item in data["records"]]}, breadcrumb_jsonld(crumbs)]
    return page_shell(title=title, description=description, canonical_path=ROUTE, robots="index,follow", jsonld_graph=graph, body_main=body, wa_message="Olá, CONFENGE. Quero selecionar organizações de climatização para meu catálogo.", extra_head=EDITORIAL_SHEET_LINK, data_attrs={"content-cluster": "market-intelligence"}, emit_author_meta=False)


def render_all(*, root: Path, capture_factory: Callable[..., str]) -> list[str]:
    data = load_snapshot(root / "data" / "pseo" / SAMPLE)
    target = root / ROUTE.strip("/") / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(render(data, capture_factory), encoding="utf-8")
    return [target.relative_to(root).as_posix()]
