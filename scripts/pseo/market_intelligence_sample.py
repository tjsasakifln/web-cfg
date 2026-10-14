"""Render two dated market-intelligence analyses from a checked public sample.

The checked-in snapshot is deliberately small and non-census. This module
recomputes every published aggregate from its ten contract-grain records before
writing HTML. It never consumes the exploratory private extract at render time.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from datetime import date
from decimal import Decimal
from html import escape
from pathlib import Path
from typing import Any, Callable

from scripts.pseo.html_shell import (
    ORG_JSONLD,
    SITE,
    breadcrumb_jsonld,
    breadcrumbs_html,
    indicators_html,
    page_shell,
    table_html,
)


SCHEMA = "confenge.market-intelligence-sample/1.0"
VERSION = "market-intelligence-sample.v1"
AS_OF = "2026-10-14"
EDITORIAL_SHEET_LINK = '<link href="/assets/editorial-article.css" rel="stylesheet"/>'
RELATIONS_ROUTE = "/inteligencia/relacoes-compradores-fornecedores/"
COMPOSITION_ROUTE = "/inteligencia/composicao-contratos-amostra/"
ROUTES = (RELATIONS_ROUTE, COMPOSITION_ROUTE)

# Editorial readings are constrained to the exact object text in the canonical
# PNCP projection. They describe the role observed in one instrument, never a
# general capability, channel position or willingness to partner.
CONTRACT_READINGS: dict[str, dict[str, str]] = {
    "03137985000190-2-000016/2026": {
        "role": "Projeto executivo e execução de obra de saneamento",
        "territory": "Comprador em Belém/PA; execução expressa em Soure/PA",
        "reason": "Mostra que a sede do comprador e o local de execução podem divergir.",
        "pending": "Separar nos documentos o escopo de projeto, obra e apoio técnico.",
    },
    "04092706000181-2-000121/2026": {
        "role": "Estudos, projetos e assessoramento técnico para pontes",
        "territory": "Vilhena/RO, expresso no objeto e no comprador",
        "reason": "A categoria “Compras” encobre um objeto de engenharia e não basta para selecionar papel comercial.",
        "pending": "Confirmar o limite do assessoramento e o que ficará para a futura execução.",
    },
    "10559279000100-2-000044/2026": {
        "role": "Projeto estrutural executivo e execução de fundações",
        "territory": "Catanduva/SP, expresso no objeto e no comprador",
        "reason": "Combina elaboração técnica e execução física no mesmo instrumento.",
        "pending": "Conferir a divisão de valor e responsabilidade entre projeto e bases executadas.",
    },
    "13988308000139-2-000393/2026": {
        "role": "Projeto estrutural de coberturas metálicas e fundações",
        "territory": "Cinco escolas nomeadas; comprador em Senhor do Bonfim/BA",
        "reason": "Representa um escopo de projeto estrutural delimitado por unidades escolares.",
        "pending": "Confirmar endereço e condições de cada unidade nos documentos do contrato.",
    },
    "18715490000178-2-000069/2026": {
        "role": "Projetos executivos e execução semi-integrada de infraestrutura viária",
        "territory": "Ibirité/MG, expresso no objeto e no comprador",
        "reason": "É o maior valor do recorte, mas reúne projeto e obra e não serve como comparável de projeto isolado.",
        "pending": "Separar parcelas de projeto, obra e acessos para qualquer comparação de aderência ou preço.",
    },
    "18836965000184-2-000120/2026": {
        "role": "Concepção, estudos ambientais, projetos e apoio técnico de saneamento",
        "territory": "Distritos de Raul Soares/MG, expressos no objeto",
        "reason": "Mostra um papel de projeto e apoio técnico sem execução de obra declarada no objeto.",
        "pending": "Conferir entregáveis e extensão do cadastro técnico e do apoio.",
    },
    "46223756000109-2-000026/2026": {
        "role": "Projetos executivos multidisciplinares em BIM",
        "territory": "Ribeirão Bonito, Tejupá/SP, expresso no objeto",
        "reason": "Distingue coordenação multidisciplinar BIM de um projeto complementar isolado.",
        "pending": "Conferir disciplinas, nível de desenvolvimento e critério de compatibilização.",
    },
    "46377800000127-2-007449/2026": {
        "role": "Projetos executivos e reforma estrutural e funcional",
        "territory": "Comprador em São Paulo/SP; unidade não identificada no campo publicado",
        "reason": "Combina projeto e execução, mas o campo público não resolve o local específico.",
        "pending": "Identificar a unidade e separar serviços por documento e planilha.",
    },
    "82939380000199-2-000819/2026": {
        "role": "Projetos complementares para reforma e cobertura",
        "territory": "CEI Clara Zomkowski; comprador em Joaçaba/SC",
        "reason": "Permite comparar projeto complementar com o escopo BIM multidisciplinar de Tejupá.",
        "pending": "Confirmar endereço, disciplinas finais e se houve serviços posteriores.",
    },
    "91551119000108-2-000028/2026": {
        "role": "Anteprojeto, projetos de arquitetura e engenharia para troca de telhado",
        "territory": "Comprador em Alegrete/RS; local não repetido no objeto publicado",
        "reason": "A categoria “Obras” contém aqui um objeto descrito como prestação de serviços técnicos de projeto.",
        "pending": "Conferir se o instrumento inclui execução física além dos projetos e planilhas.",
    },
}


class SampleError(ValueError):
    """The public sample is incomplete, internally inconsistent or unsafe."""


def _canonical_sha256(value: Any) -> str:
    payload = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _date(value: str) -> date:
    return date.fromisoformat(value[:10])


def _term_days(contract: dict[str, Any]) -> int:
    return (_date(contract["valid_to"]) - _date(contract["valid_from"])).days


def _publication_lag_days(contract: dict[str, Any]) -> int:
    return (_date(contract["published_at"]) - _date(contract["signature_date"])).days


def _summary(contracts: list[dict[str, Any]]) -> dict[str, Any]:
    terms = [_term_days(contract) for contract in contracts]
    lags = [_publication_lag_days(contract) for contract in contracts]
    return {
        "contracts": len(contracts),
        "distinct_buyer_cnpjs": len({c["buyer"]["cnpj"] for c in contracts}),
        "distinct_supplier_nis": len({c["supplier"]["ni"] for c in contracts}),
        "signature_window": {
            "from": min(c["signature_date"] for c in contracts),
            "to": max(c["signature_date"] for c in contracts),
        },
        "publication_lag_days": {"min": min(lags), "max": max(lags)},
        "term_days": {"min": min(terms), "max": max(terms)},
        "category_counts": dict(
            sorted(Counter(c["category"] for c in contracts).items(), key=lambda row: (-row[1], row[0]))
        ),
        "buyer_uf_counts": dict(
            sorted(Counter(c["buyer"]["uf"] for c in contracts).items(), key=lambda row: (-row[1], row[0]))
        ),
        "aggregate_integral_value_brl": float(
            sum(Decimal(str(c["value_global_brl"])) for c in contracts)
        ),
    }


def load_snapshot(path: Path) -> dict[str, Any]:
    raw = path.read_text(encoding="utf-8")
    lowered = raw.lower()
    if "source_extract" in lowered or "public_read_v1" in lowered:
        raise SampleError("snapshot carries a forbidden fixture or interface claim")
    data = json.loads(raw)
    if data.get("schema") != SCHEMA or data.get("version") != VERSION:
        raise SampleError("unexpected market-intelligence snapshot schema/version")
    if data.get("as_of") != AS_OF or data.get("grain") != "one PNCP contract":
        raise SampleError("snapshot must remain dated and at one-contract grain")
    if data.get("status") != "PUBLIC_FACTS_RECHECKED_NON_CENSUS_SAMPLE":
        raise SampleError("snapshot has not passed the public-fact sample gate")

    lineage = data.get("lineage") or {}
    manifest_name = lineage.get("verification_manifest")
    if manifest_name != "market-intelligence-verification.v1.json":
        raise SampleError("a versioned public-claims manifest is required")
    manifest_path = path.parent / manifest_name
    if not manifest_path.is_file():
        raise SampleError("public-claims manifest is missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if _canonical_sha256(manifest) != lineage.get("verification_manifest_sha256"):
        raise SampleError("public-claims manifest canonical hash does not match the snapshot")
    if manifest.get("schema") != "confenge.pncp-public-claims-manifest/1.0":
        raise SampleError("unexpected public-claims manifest schema")
    coverage = manifest.get("coverage") or {}
    if coverage.get("requested") != 10 or coverage.get("http_200") != 10:
        raise SampleError("public-claims manifest does not cover all ten contracts")
    claims = manifest.get("claims") or []
    if len(claims) != 10 or len({claim.get("id") for claim in claims}) != 10:
        raise SampleError("public-claims manifest must contain ten unique claims")
    if _canonical_sha256(claims) != manifest.get("claims_sha256"):
        raise SampleError("public-claims manifest aggregate digest is invalid")
    if manifest.get("claims_sha256") != lineage.get("verification_claims_sha256"):
        raise SampleError("snapshot does not pin the verified claims digest")
    claim_by_id: dict[str, dict[str, Any]] = {}
    for claim in claims:
        projection = claim.get("projection") or {}
        if claim.get("id") != projection.get("id"):
            raise SampleError("manifest claim ID diverges from its projection")
        if _canonical_sha256(projection) != claim.get("projection_sha256"):
            raise SampleError("manifest projection digest is invalid")
        claim_by_id[claim["id"]] = claim
    retrieval_by_projection = {
        row.get("projection_sha256"): row
        for row in manifest.get("retrievals") or []
        if row.get("http_status") == 200
    }
    if len(retrieval_by_projection) != 10:
        raise SampleError("manifest retrieval coverage is incomplete")

    contracts = data.get("contracts") or []
    if len(contracts) != 10 or len({c.get("id") for c in contracts}) != 10:
        raise SampleError("the approved sample must contain ten unique contracts")
    for contract in contracts:
        if not re.fullmatch(r"\d{14}-2-\d{6}/\d{4}", str(contract.get("id") or "")):
            raise SampleError("invalid canonical PNCP contract identifier")
        if not str(contract.get("url") or "").startswith("https://pncp.gov.br/api/pncp/v1/orgaos/"):
            raise SampleError("each row must link to its official PNCP endpoint")
        buyer = contract.get("buyer") or {}
        supplier = contract.get("supplier") or {}
        if not re.fullmatch(r"\d{14}", str(buyer.get("cnpj") or "")):
            raise SampleError("buyer identity must be a legal-entity CNPJ")
        if not re.fullmatch(r"\d{14}", str(supplier.get("ni") or "")):
            raise SampleError("supplier identity must be a legal-entity CNPJ/NI")
        if not buyer.get("legal_name") or not supplier.get("legal_name"):
            raise SampleError("official legal names are required")
        claim = claim_by_id.get(contract["id"])
        if claim is None:
            raise SampleError("snapshot contract is absent from the public-claims manifest")
        projection = {
            key: value
            for key, value in contract.items()
            if key not in {"url", "projection_sha256"}
        }
        if projection != claim["projection"]:
            raise SampleError("snapshot fields diverge from the verified public projection")
        if contract.get("projection_sha256") != claim.get("projection_sha256"):
            raise SampleError("snapshot projection digest diverges from the manifest")
        retrieval = retrieval_by_projection.get(claim["projection_sha256"])
        if retrieval is None or retrieval.get("endpoint") != contract.get("url"):
            raise SampleError("snapshot official endpoint diverges from the manifest")

    computed = _summary(contracts)
    if computed != data.get("summary"):
        raise SampleError("stored summary diverges from contract-grain records")
    expected = {
        "contracts": 10,
        "distinct_buyer_cnpjs": 10,
        "distinct_supplier_nis": 10,
        "signature_window": {"from": "2026-08-21", "to": "2026-10-09"},
        "publication_lag_days": {"min": 0, "max": 49},
        "term_days": {"min": 89, "max": 913},
        "category_counts": {"Obras": 4, "Serviços": 3, "Serviços de Engenharia": 2, "Compras": 1},
        "buyer_uf_counts": {"SP": 3, "MG": 2, "BA": 1, "PA": 1, "RO": 1, "RS": 1, "SC": 1},
        "aggregate_integral_value_brl": 41446506.23,
    }
    if computed != expected:
        raise SampleError("sample no longer matches the technically verified result")
    verification = data.get("verification") or {}
    if verification.get("requested") != 10 or verification.get("retrieved") != 10 or verification.get("failed") != 0:
        raise SampleError("PNCP endpoint verification is incomplete")
    return data


def _br_date(value: str) -> str:
    parsed = _date(value)
    return parsed.strftime("%d/%m/%Y")


def _money(value: float | int) -> str:
    rendered = f"{Decimal(str(value)):,.2f}"
    return "R$ " + rendered.replace(",", "X").replace(".", ",").replace("X", ".")


def _cnpj(value: str) -> str:
    return f"{value[:2]}.{value[2:5]}.{value[5:8]}/{value[8:12]}-{value[12:]}"


def _excerpt(value: str, limit: int = 170) -> str:
    compact = " ".join(value.split())
    if len(compact) <= limit:
        return compact
    cut = compact[:limit].rsplit(" ", 1)[0]
    return f"{cut}…"


def _linked_contract_table(
    headers: list[str], rows: list[tuple[list[str], str]], caption: str
) -> str:
    head = "".join(f"<th>{escape(header)}</th>" for header in headers + ["Fonte oficial"])
    body = []
    for cells, url in rows:
        values = "".join(f"<td>{escape(value)}</td>" for value in cells)
        source = (
            '<td><a href="' + escape(url, quote=True) + '" rel="noopener">Abrir contrato no PNCP</a></td>'
        )
        body.append(f"<tr>{values}{source}</tr>")
    return (
        f'<div class="table-wrap" data-pseo-table="1" role="group" tabindex="0" '
        f'aria-label="{escape(caption, quote=True)}"><table class="data-table">'
        f"<caption>{escape(caption)}</caption><thead><tr>{head}</tr></thead>"
        f"<tbody>{''.join(body)}</tbody></table></div>"
    )


def _dataset_graph(data: dict[str, Any], route: str, h1: str, description: str) -> list[dict[str, Any]]:
    dataset = {
        "@type": "Dataset",
        "@id": f"{SITE}{route}#dataset",
        "name": h1,
        "description": description,
        "identifier": VERSION,
        "creator": {"@id": f"{SITE}/#organization"},
        "isBasedOn": "https://pncp.gov.br/",
        "temporalCoverage": "2026-08-21/2026-10-09",
        "spatialCoverage": "Brasil",
        "variableMeasured": [
            "identidade legal do comprador",
            "identidade legal do fornecedor",
            "categoria",
            "UF do comprador",
            "datas do contrato",
            "vigência",
            "valor integral",
        ],
        "dateModified": data["as_of"],
    }
    crumbs = [("Início", "/"), ("Inteligência", "/inteligencia/"), (h1, None)]
    return [
        ORG_JSONLD,
        {
            "@type": "WebPage",
            "@id": f"{SITE}{route}#webpage",
            "url": f"{SITE}{route}",
            "name": h1,
            "description": description,
            "about": {"@id": dataset["@id"]},
            "publisher": {"@id": f"{SITE}/#organization"},
            "dateModified": data["as_of"],
        },
        dataset,
        breadcrumb_jsonld(crumbs),
    ]


def _sample_marker(data: dict[str, Any]) -> str:
    return (
        f'data-market-sample-version="{escape(data["version"], quote=True)}" '
        f'data-market-sample-as-of="{escape(data["as_of"], quote=True)}" '
        f'data-market-sample-sha256="{_canonical_sha256(data)}"'
    )


def _method_section(data: dict[str, Any]) -> str:
    return f'''<section class="sources-section" id="metodo" data-dataset="{VERSION}"><p class="eyebrow t-kicker">Fonte, corte e método</p>
<h2>Como esta amostra foi conferida</h2>
<p><strong>Base de dados deste recorte:</strong> conjunto versionado de dez contratos PNCP, com os campos reproduzidos nas tabelas desta página e corte em <time datetime="{AS_OF}">14/10/2026</time>.</p>
<p>O grão é um contrato PNCP. A CONFENGE selecionou dez identificadores fixos em um recorte delimitado e cada contrato foi rechecado no endpoint oficial do PNCP em <time datetime="{AS_OF}">14/10/2026</time>. A comparação usa somente os campos publicados e conferidos para esses mesmos instrumentos.</p>
<p>As identidades exibidas são a razão social e o CNPJ ou NI devolvidos pelo PNCP. As contagens usam apenas os dez registros. Vigência é a diferença entre a data final e a inicial; defasagem de publicação é a diferença entre a data de publicação e a assinatura; o valor é o valor integral publicado para o instrumento.</p>
<p class="technical-note"><strong>Limites:</strong> seleção exploratória, ilustrativa e possivelmente enviesada; sem denominador populacional. Ela não é censo, carteira de clientes, ranking comercial, medição de participação de mercado ou prova de demanda futura. Valor integral não é preço unitário, receita, orçamento disponível, carga de trabalho ou capacidade. A ausência de fornecedor subcontratado nos campos consultados não prova que subcontratação seja proibida ou inexistente.</p>
<p class="technical-note">Versão do recorte público: <code>{VERSION}</code>. Corte da fonte: <time datetime="{AS_OF}">14/10/2026</time>. Resultados posteriores, alterações cadastrais ou documentos não incluídos podem mudar a seleção, a classificação e a decisão comercial.</p></section>'''


def _capture(
    capture_factory: Callable[..., str], *, route: str, asset_id: str, heading: str, prompt: str
) -> str:
    return capture_factory(
        path=route,
        asset_id=asset_id,
        heading=heading,
        prompt=prompt,
        button="Solicitar proposta de pesquisa",
        analysis_cutoff=AS_OF,
        evidence_pack_version=VERSION,
    )


def render_relations(data: dict[str, Any], capture_factory: Callable[..., str]) -> str:
    route = RELATIONS_ROUTE
    h1 = "Quem são os compradores e fornecedores documentados nesta amostra?"
    description = (
        "Dez relações públicas entre compradores e fornecedores, rechecadas contrato a contrato no PNCP em 14/10/2026."
    )
    summary = data["summary"]
    rows = []
    decision_rows = []
    for contract in data["contracts"]:
        buyer = contract["buyer"]
        supplier = contract["supplier"]
        reading = CONTRACT_READINGS[contract["id"]]
        rows.append(
            (
                [
                    contract["id"],
                    f'{buyer["legal_name"]}, CNPJ {_cnpj(buyer["cnpj"])}',
                    f'{supplier["legal_name"]} (NI) {_cnpj(supplier["ni"])}',
                    contract["category"],
                    _br_date(contract["signature_date"]),
                ],
                contract["url"],
            )
        )
        decision_rows.append(
            (
                [
                    supplier["legal_name"],
                    reading["role"],
                    _excerpt(contract["object_original"]),
                    reading["territory"],
                    _br_date(contract["signature_date"]),
                    reading["reason"],
                    reading["pending"],
                ],
                contract["url"],
            )
        )
    table = _linked_contract_table(
        ["Contrato", "Comprador no PNCP", "Fornecedor no PNCP", "Categoria", "Assinatura"],
        rows,
        "Dez relações comprador–fornecedor documentadas no PNCP",
    )
    decision_table = _linked_contract_table(
        [
            "Pessoa jurídica contratada",
            "Papel observado neste contrato",
            "Objeto oficial (trecho)",
            "UF do comprador e local de execução",
            "Assinatura",
            "Razão de inclusão na comparação",
            "O que ainda pesquisar",
        ],
        decision_rows,
        "Leitura de aderência dos dez contratos a partir do objeto oficial",
    )
    crumbs = [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Relações documentadas", None)]
    body = f'''<div {_sample_marker(data)}>{breadcrumbs_html(crumbs)}
<header class="content-hero article-hero"><div class="container content-hero-grid"><div><p class="eyebrow t-kicker">Amostra pública verificada</p><h1 class="t-editorial">{escape(h1)}</h1><p class="content-lead measure">Uma leitura contrato a contrato para mostrar quais pares institucionais aparecem neste recorte, sem presumir interesse, contato ou oportunidade comercial.</p><div class="article-meta"><span>Fonte: PNCP</span><span>Corte: <time datetime="{AS_OF}">14/10/2026</time></span><span>Grão: um contrato</span></div></div></div></header>
<div class="container article-layout"><article class="article-main">
<div class="answer-box" id="resposta"><span>Resposta direta</span><p>A amostra contém {summary["contracts"]} contratos, com {summary["distinct_buyer_cnpjs"]} CNPJs compradores e {summary["distinct_supplier_nis"]} NIs fornecedores distintos. Cada par abaixo está ligado a um contrato oficial específico.</p></div>
<section id="relacoes"><p class="eyebrow t-kicker">Resultado completo</p><h2>Os pares documentados</h2><p>Os nomes legais foram copiados dos campos de identidade do endpoint oficial. “Comprador” descreve a entidade registrada no PNCP; “fornecedor” descreve a pessoa jurídica contratada naquele instrumento.</p>{table}</section>
<section id="aderencia"><p class="eyebrow t-kicker">Seleção examinável</p><h2>O objeto muda o papel observado e a próxima pergunta</h2><p>Esta leitura não atribui uma função geral à empresa. Ela registra somente o papel descrito em cada contrato, o território que o campo público sustenta, a razão para manter o caso na comparação e a pendência que impede uma conclusão maior.</p>{decision_table}</section>
<section id="leitura"><p class="eyebrow t-kicker">Conclusão comercial do recorte</p><h2>Categoria igual não significa papel comercial igual</h2><p>Dois contratos classificados como “Serviços de Engenharia” ensinam uma diferença concreta: o de Joaçaba descreve projetos complementares para reforma e cobertura; o de Tejupá reúne projetos executivos multidisciplinares, orçamento, cronograma e compatibilização em BIM. Uma seleção de parceiros para uma disciplina isolada e outra para coordenação multidisciplinar não deveriam usar apenas a categoria como filtro.</p><p>O contraste também aparece em “Obras”: o contrato de Ibirité reúne projetos executivos e execução semi-integrada de infraestrutura viária, enquanto o objeto de Alegrete descreve anteprojeto e projetos de arquitetura e engenharia para troca de telhado. O maior valor contratado, sozinho, não identifica a organização mais aderente a um escopo de projeto.</p><p>Os campos verificados não classificam nenhuma dessas pessoas jurídicas como distribuidor, integrador, instalador ou mantenedor. Esses papéis só podem entrar em uma seleção depois de documentos adicionais sustentarem a classificação. O registro de um contrato não comprova interesse comercial, disponibilidade para parceria ou oportunidade de subcontratação.</p></section>
<section id="servico"><p class="eyebrow t-kicker">Aplicação ao serviço</p><h2>Da lista pública a uma pesquisa útil para a sua decisão</h2><p>A CONFENGE pode delimitar critérios de busca, conferir identidades e documentos, separar fatos de hipóteses e entregar um mapa de organizações para investigação comercial. A proposta define recorte, fontes, profundidade, formato, revisão e direitos de uso antes do início.</p></section>
{_method_section(data)}
</article><aside class="article-aside"><div class="aside-card"><span>Escopo da prova</span><h2>Dez contratos, dez pares</h2><p>A página descreve somente relações formais registradas no PNCP neste recorte não censitário.</p><a class="button button-secondary" href="{COMPOSITION_ROUTE}">Ver composição da amostra</a></div><div class="aside-card aside-compact"><strong>Coleção</strong><a href="/inteligencia/orgaos/">Pesquisa de clientes, canais e parceiros</a><a href="/inteligencia/">Inteligência de mercado</a></div></aside></div>
{_capture(capture_factory, route=route, asset_id="im-relacoes-v1", heading="Defina quais relações sua pesquisa precisa verificar", prompt="Informe o produto ou serviço, o território e os critérios de cliente, canal ou parceiro que precisam ser investigados.")}</div>'''
    return page_shell(
        title="Relações entre compradores e fornecedores no PNCP | CONFENGE",
        description=description,
        canonical_path=route,
        robots="index,follow",
        jsonld_graph=_dataset_graph(data, route, h1, description),
        body_main=body,
        wa_message="Olá, CONFENGE. Quero pesquisar compradores, canais ou parceiros para uma decisão comercial.",
        extra_head=EDITORIAL_SHEET_LINK,
        data_attrs={"content-cluster": "market-intelligence", "sample-version": VERSION},
        emit_author_meta=False,
    )


def render_composition(data: dict[str, Any], capture_factory: Callable[..., str]) -> str:
    route = COMPOSITION_ROUTE
    h1 = "Como se compõem os dez contratos desta amostra?"
    description = (
        "Categorias, UFs compradoras, calendário, vigência e valores integrais de dez contratos rechecados no PNCP em 14/10/2026."
    )
    summary = data["summary"]
    by_id = {contract["id"]: contract for contract in data["contracts"]}
    ibirite = by_id["18715490000178-2-000069/2026"]
    alegrete = by_id["91551119000108-2-000028/2026"]
    vilhena = by_id["04092706000181-2-000121/2026"]
    soure = by_id["03137985000190-2-000016/2026"]
    largest_share = (
        Decimal(str(ibirite["value_global_brl"]))
        / Decimal(str(summary["aggregate_integral_value_brl"]))
        * Decimal("100")
    ).quantize(Decimal("0.1"))
    category_table = table_html(
        ["Categoria no PNCP", "Contratos"],
        [[name, count] for name, count in summary["category_counts"].items()],
        "Composição por categoria dos dez contratos",
    )
    uf_table = table_html(
        ["UF do comprador", "Contratos"],
        [[uf, count] for uf, count in summary["buyer_uf_counts"].items()],
        "Composição por UF compradora dos dez contratos",
    )
    rows = []
    for contract in data["contracts"]:
        rows.append(
            (
                [
                    contract["id"],
                    contract["buyer"]["uf"],
                    contract["category"],
                    _br_date(contract["signature_date"]),
                    f'{_br_date(contract["valid_from"])} a {_br_date(contract["valid_to"])}',
                    str(_term_days(contract)),
                    _money(contract["value_global_brl"]),
                ],
                contract["url"],
            )
        )
    contract_table = _linked_contract_table(
        ["Contrato", "UF", "Categoria", "Assinatura", "Vigência", "Dias", "Valor integral"],
        rows,
        "Calendário, vigência e valor integral dos dez contratos",
    )
    crumbs = [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Composição da amostra", None)]
    body = f'''<div {_sample_marker(data)}>{breadcrumbs_html(crumbs)}
<header class="content-hero article-hero"><div class="container content-hero-grid"><div><p class="eyebrow t-kicker">Amostra pública verificada</p><h1 class="t-editorial">{escape(h1)}</h1><p class="content-lead measure">Uma descrição inteira do recorte por categoria, UF compradora, datas, vigência e valor integral, sem transformar dez contratos em tendência ou tamanho de mercado.</p><div class="article-meta"><span>Fonte: PNCP</span><span>Corte: <time datetime="{AS_OF}">14/10/2026</time></span><span>Grão: um contrato</span></div></div></div></header>
<div class="container article-layout"><article class="article-main">
<div class="answer-box" id="resposta"><span>Resposta direta</span><p>São {summary["contracts"]} contratos assinados entre {_br_date(summary["signature_window"]["from"])} e {_br_date(summary["signature_window"]["to"])}. A soma descritiva dos valores integrais publicados é {_money(summary["aggregate_integral_value_brl"])}; ela não representa tamanho de mercado, receita ou preço unitário.</p></div>
<section id="indicadores"><p class="eyebrow t-kicker">Resultado inteiro</p><h2>Números do recorte</h2>{indicators_html([("Contratos", "10", "um registro por instrumento"), ("Categorias", "4", "classificação do PNCP"), ("UFs compradoras", "7", "localização do comprador"), ("Vigência", "89 a 913 dias", "fim menos início"), ("Defasagem da publicação", "0 a 49 dias", "publicação menos assinatura"), ("Valor integral somado", _money(summary["aggregate_integral_value_brl"]), "soma descritiva")])}</section>
<section id="composicao"><p class="eyebrow t-kicker">Distribuição descritiva</p><h2>Categorias e UFs presentes</h2><p>As contagens descrevem somente estes dez contratos. Não há denominador populacional para calcular participação, concentração setorial ou representatividade.</p>{category_table}{uf_table}</section>
<section id="contratos"><p class="eyebrow t-kicker">Calendário e valores</p><h2>Os dez registros que formam o resultado</h2>{contract_table}</section>
<section id="comparacoes"><p class="eyebrow t-kicker">Comparação para seleção</p><h2>Quatro diferenças que a contagem simples esconderia</h2><div class="grid-2">
<article><h3>“Obras” reúne papéis diferentes</h3><p><a href="{escape(ibirite['url'], quote=True)}" rel="noopener">Ibirité</a> descreve contratação semi-integrada com projetos executivos e execução viária. <a href="{escape(alegrete['url'], quote=True)}" rel="noopener">Alegrete</a> descreve serviços técnicos de anteprojeto e projetos para troca de telhado. Para selecionar empresa de projeto, execução ou combinação dos dois, a categoria sozinha é insuficiente.</p></article>
<article><h3>“Compras” pode conter engenharia</h3><p>O registro de <a href="{escape(vilhena['url'], quote=True)}" rel="noopener">Vilhena</a> está em “Compras”, mas o objeto oficial trata de estudos, levantamentos, projetos para seis pontes e assessoramento técnico. Uma pesquisa por rótulo perderia o papel observado ou o classificaria de forma inadequada.</p></article>
<article><h3>UF do comprador não resolve o local</h3><p>No contrato da secretaria sediada em Belém, o objeto localiza a execução em <a href="{escape(soure['url'], quote=True)}" rel="noopener">Soure/PA</a>. Em outro registro estadual, a unidade prisional não aparece no campo reproduzido. A escolha territorial precisa do objeto e, quando faltar localização, dos documentos.</p></article>
<article><h3>O maior valor domina a soma</h3><p>O contrato de Ibirité representa {str(largest_share).replace('.', ',')}% da soma integral desta amostra. Isso explica por que a soma não descreve um contrato típico nem autoriza estimar mercado; antes de comparar valores, é preciso separar projeto, obra e demais parcelas.</p></article>
</div></section>
<section id="leitura"><p class="eyebrow t-kicker">Conclusão comercial do recorte</p><h2>Como usar esta composição em uma nova pesquisa</h2><p>Categoria, localização do comprador, calendário e vigência ajudam a formular hipóteses para um estudo maior, mas os objetos mostram quais organizações realmente entram em cada seleção. Para um catálogo de serviços de projeto, por exemplo, contratos que combinam projeto e obra precisam ser separados dos objetos exclusivamente técnicos antes de comparar aderência.</p><p>O valor integral preserva a escala do instrumento, mas não pode ser convertido em preço unitário, receita do fornecedor, carga de trabalho ou participação de mercado. Uma pesquisa sob encomenda pode ampliar o período e o universo, deduplicar registros, conferir documentos e aplicar os critérios do contratante. Este recorte sozinho não sustenta tendência histórica, previsão, TAM, market share, oportunidade ou disponibilidade comercial.</p></section>
{_method_section(data)}
</article><aside class="article-aside"><div class="aside-card"><span>Maior instrumento do recorte</span><h2>{_money(33564883.70)}</h2><p>Contrato 18715490000178-2-000069/2026; também tem a maior vigência observada, de 913 dias. É um extremo desta amostra, não uma referência de mercado.</p><a class="button button-secondary" href="{RELATIONS_ROUTE}">Conferir os pares documentados</a></div><div class="aside-card aside-compact"><strong>Coleção</strong><a href="/inteligencia/mercados/">Pesquisa de mercados</a><a href="/inteligencia/precos/">Pesquisa de preços</a></div></aside></div>
{_capture(capture_factory, route=route, asset_id="im-composicao-v1", heading="Defina o recorte que sua análise precisa comparar", prompt="Informe a categoria, o território, o período e a decisão que os contratos públicos precisam ajudar a responder.")}</div>'''
    return page_shell(
        title="Composição de dez contratos públicos no PNCP | CONFENGE",
        description=description,
        canonical_path=route,
        robots="index,follow",
        jsonld_graph=_dataset_graph(data, route, h1, description),
        body_main=body,
        wa_message="Olá, CONFENGE. Quero uma pesquisa sobre a composição de contratos públicos.",
        extra_head=EDITORIAL_SHEET_LINK,
        data_attrs={"content-cluster": "market-intelligence", "sample-version": VERSION},
        emit_author_meta=False,
    )


def render_all(
    *, root: Path, capture_factory: Callable[..., str] | None = None
) -> list[str]:
    if capture_factory is None:
        from scripts.pseo.build import _market_intelligence_capture

        capture_factory = _market_intelligence_capture
    source = root / "data" / "pseo" / "market-intelligence-sample.v1.json"
    data = load_snapshot(source)
    rendered = {
        RELATIONS_ROUTE: render_relations(data, capture_factory),
        COMPOSITION_ROUTE: render_composition(data, capture_factory),
    }
    written = []
    for route, html in rendered.items():
        target = root / route.strip("/") / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(html, encoding="utf-8")
        written.append(target.relative_to(root).as_posix())
    return written


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    written = render_all(root=root)
    print(json.dumps({"ok": True, "written": written}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
