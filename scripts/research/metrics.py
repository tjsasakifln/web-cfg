"""Pure metric functions over an already-loaded snapshot.

No filesystem I/O. Tests load the real JSON via snapshot.load_snapshot and
pass the result here.
"""

from __future__ import annotations

from typing import Any

WEDGE = {
    "id": "pavimentacao-edificacoes-4uf-pre-nacional",
    "label": (
        "Pavimentação e edificações públicas no recorte extra-cli pré-nacional "
        "(SC, PI, MG, RS)"
    ),
    "why": (
        "Único recorte publicado no snapshot versionado com dois arquétipos "
        "do ICP CONFENGE, quatro UFs e agregados de volume, ticket e "
        "contagem de compradores/fornecedores. Não é censo do Brasil."
    ),
    "ufs": ["SC", "PI", "MG", "RS"],
    "archetypes": [
        "pavimentacao-infraestrutura-viaria",
        "edificacoes-publicas",
    ],
    "commercial_fit": [
        "bid-room-licitacoes-obras",
        "auditoria-orcamento-licitacao",
        "aditivos-obras-publicas",
        "defesa-margem-contratos-publicos",
    ],
    "national_claim": False,
}

QUESTION_SPECS = (
    {
        "id": "Q1",
        "theme": "volume_valor",
        "question": (
            "Qual o volume e o valor observado de contratos AEC confirmados "
            "nos mercados publicados do recorte?"
        ),
    },
    {
        "id": "Q2",
        "theme": "compradores",
        "question": "Quantos órgãos compradores distintos o recorte observa por mercado?",
    },
    {
        "id": "Q3",
        "theme": "fornecedores",
        "question": "Quantos fornecedores o recorte observa por mercado?",
    },
    {
        "id": "Q4",
        "theme": "concentracao",
        "question": (
            "Há concentração mensurável de compradores ou fornecedores no recorte?"
        ),
    },
    {
        "id": "Q5",
        "theme": "regional",
        "question": (
            "Como os mercados publicados se comparam entre as UFs do recorte?"
        ),
    },
    {
        "id": "Q6",
        "theme": "categorias",
        "question": "Quais categorias/arquétipos o snapshot publica, e com que massa?",
    },
    {
        "id": "Q7",
        "theme": "tamanho_tipico",
        "question": (
            "Qual o tamanho típico do contrato (P25, mediana, P75) por mercado, "
            "e o que esse número não significa?"
        ),
    },
    {
        "id": "Q8",
        "theme": "evolucao",
        "question": (
            "Há série temporal suficiente para afirmar evolução do recorte?"
        ),
    },
)


def _prov(
    snapshot: dict[str, Any],
    *,
    source: str,
    denominator: str,
    filters: str,
    dedup_logic: str,
    value_semantics: str,
    exclusions: str,
    limitation: str,
    cutoff: str | None = None,
) -> dict[str, str]:
    manifest = snapshot["manifest"]
    freshness = manifest.get("freshness") or {}
    return {
        "source": source,
        "snapshot_hash": manifest["dataset_hash"],
        "as_of": manifest["data_as_of"],
        "cutoff": cutoff or freshness.get("data_period_end") or manifest["data_as_of"],
        "denominator": denominator,
        "filters": filters,
        "dedup_logic": dedup_logic,
        "value_semantics": value_semantics,
        "exclusions": exclusions,
        "limitation": limitation,
    }


def _unsupported(
    spec: dict[str, str],
    snapshot: dict[str, Any],
    *,
    reason: str,
    source: str,
) -> dict[str, Any]:
    row = {
        **spec,
        "status": "unsupported",
        "value": None,
        "series": [],
    }
    row.update(
        _prov(
            snapshot,
            source=source,
            denominator="n/a — pergunta não sustentada neste snapshot",
            filters="n/a",
            dedup_logic="n/a",
            value_semantics="n/a",
            exclusions="n/a",
            limitation=reason,
        )
    )
    return row


def published_markets(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    return list(snapshot.get("markets") or [])


def answer_questions(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    markets = published_markets(snapshot)
    prices = list(snapshot.get("prices") or [])
    competition = list(snapshot.get("competition") or [])
    agencies = list(snapshot.get("agencies") or [])
    archetypes = list(snapshot.get("archetypes") or [])
    manifest = snapshot["manifest"]
    specs = {item["id"]: item for item in QUESTION_SPECS}

    answers: list[dict[str, Any]] = []

    # Q1 volume / valor
    market_rows = [
        {
            "id": market.get("id"),
            "slug": market.get("slug"),
            "uf": market.get("region"),
            "archetype_id": market.get("archetype_id"),
            "segment": market.get("segment"),
            "contract_count": market.get("contract_count"),
            "total_value": market.get("total_value"),
            "period_start": market.get("period_start"),
            "period_end": market.get("period_end"),
        }
        for market in markets
    ]
    q1 = {
        **specs["Q1"],
        "status": "answered",
        "value": {
            "published_market_contract_count": sum(
                int(row["contract_count"] or 0) for row in market_rows
            ),
            "published_market_total_value_brl": round(
                sum(float(row["total_value"] or 0) for row in market_rows), 2
            ),
            "aec_confirmed_contracts_in_snapshot": (
                manifest.get("denominators") or {}
            ).get("aec_confirmed_contracts")
            or manifest.get("counts", {}).get("classified_aec_contracts"),
            "raw_contracts_loaded": (
                manifest.get("denominators") or {}
            ).get("contracts_total_loaded")
            or manifest.get("counts", {}).get("raw_contracts"),
            "published_markets": len(market_rows),
            "by_market": market_rows,
        },
        "series": market_rows,
    }
    q1.update(
        _prov(
            snapshot,
            source="data/pseo/markets.json + data/pseo/manifest.json",
            denominator=(
                "published markets in markets.json (not aec_confirmed universe, "
                "not raw PNCP load)"
            ),
            filters=(
                "aec_confirmed only; primary archetype in "
                "{pavimentacao-infraestrutura-viaria, edificacoes-publicas}; "
                "UFs in {SC, PI, MG, RS}"
            ),
            dedup_logic=(
                "Exporter keeps one primary archetype per contract; "
                "multi-label objects enter only the primary market cell"
            ),
            value_semantics=(
                "valor_total nominal BRL of the contract instrument as ingested; "
                "not unit price, not practiced price, not deflated"
            ),
            exclusions=(
                "aec_probable, ambiguous, insufficient_context, non_aec; "
                "markets not promoted to the public 4-cell set; "
                "manutenção predial (agency/competition slice)"
            ),
            limitation=(
                "Os contratos dos 4 mercados publicados não equivalem ao "
                "conjunto aec_confirmed do snapshot nem a um recorte de 27 UFs. "
                "O manifest declara cobertura incompleta frente ao conjunto "
                "nacional de referência do datalake."
            ),
        )
    )
    answers.append(q1)

    # Q2 buyers
    buyer_rows = [
        {
            "slug": market.get("slug"),
            "uf": market.get("region"),
            "buyer_count": market.get("buyer_count"),
            "suppressed_buyer_cells": (
                ((market.get("privacy") or {}).get("top_buyers") or {}).get(
                    "suppressed_cells"
                )
            ),
            "named_buyers_published": [
                item.get("name")
                for item in (market.get("top_buyers") or [])
                if not item.get("suppressed")
            ],
        }
        for market in markets
    ]
    q2 = {
        **specs["Q2"],
        "status": "answered",
        "value": {
            "by_market": buyer_rows,
            "named_buyer_identities_available": any(
                row["named_buyers_published"] for row in buyer_rows
            ),
        },
        "series": buyer_rows,
    }
    q2.update(
        _prov(
            snapshot,
            source="data/pseo/markets.json",
            denominator="distinct buyer identifiers counted by the exporter per market cell",
            filters="same published-market filter as Q1",
            dedup_logic="buyer identity as ingested (CNPJ8/name); no cross-UF merge",
            value_semantics="count of distinct organs, not spend share",
            exclusions=(
                "buyer names with cell count < 5 are bucketed as "
                "'outros (células suprimidas)'; values of suppressed cells are 0"
            ),
            limitation=(
                "Contagens de compradores são por célula mercado×UF. "
                "Identidades nominais dos top buyers estão suprimidas neste snapshot."
            ),
        )
    )
    answers.append(q2)

    # Q3 suppliers
    supplier_rows = [
        {
            "slug": market.get("slug"),
            "uf": market.get("region"),
            "supplier_count": market.get("supplier_count"),
        }
        for market in markets
    ]
    competition_rows = [
        {
            "slug": item.get("slug"),
            "uf": item.get("region"),
            "supplier_count": item.get("supplier_count"),
            "contract_count": item.get("contract_count"),
            "observed_suppliers": [
                {
                    "display_name": supplier.get("display_name"),
                    "contract_count": supplier.get("contract_count"),
                    "total_value": supplier.get("total_value"),
                }
                for supplier in (item.get("observed_suppliers") or [])
            ],
        }
        for item in competition
    ]
    q3 = {
        **specs["Q3"],
        "status": "answered",
        "value": {
            "by_market": supplier_rows,
            "competition_slices": competition_rows,
        },
        "series": supplier_rows,
    }
    q3.update(
        _prov(
            snapshot,
            source="data/pseo/markets.json + data/pseo/competition.json",
            denominator="distinct supplier identifiers counted per published market cell",
            filters="same published-market filter as Q1; competition is a separate slice",
            dedup_logic=(
                "supplier display names are truncated in the public export; "
                "no quality ranking"
            ),
            value_semantics="observed suppliers in the ingested contracts, not market share of Brazil",
            exclusions="suppliers absent from the ingested slice; no inference of non-activity",
            limitation=(
                "Ausência na lista não implica ausência de atuação. "
                "O recorte de concorrência publicado é 1 célula (manutenção predial RS)."
            ),
        )
    )
    answers.append(q3)

    # Q4 concentration — partial
    agency = agencies[0] if agencies else {}
    competition0 = competition[0] if competition else {}
    q4 = {
        **specs["Q4"],
        "status": "partial",
        "value": {
            "market_hhi_available": any(
                item.get("hhi_proxy") is not None for item in competition
            ),
            "market_top_buyers_named": False,
            "measurable_slice": {
                "kind": "agency_competition",
                "agency_name": agency.get("agency_name") or agency.get("name"),
                "uf": agency.get("uf"),
                "contract_count": agency.get("contract_count"),
                "supplier_count": agency.get("supplier_count"),
                "total_value": agency.get("total_value"),
                "period_start": agency.get("period_start"),
                "period_end": agency.get("period_end"),
                "concentration_top3_share": competition0.get("concentration_top3_share"),
                "reajuste_object_count": next(
                    (
                        obj.get("count")
                        for obj in (agency.get("top_objects") or [])
                        if "reajuste" in (obj.get("label") or "").lower()
                    ),
                    None,
                ),
            },
        },
        "series": [
            {
                "slice": agency.get("slug"),
                "contract_count": agency.get("contract_count"),
                "supplier_count": agency.get("supplier_count"),
                "concentration_top3_share": competition0.get("concentration_top3_share"),
            }
        ],
    }
    q4.update(
        _prov(
            snapshot,
            source="data/pseo/agencies.json + data/pseo/competition.json",
            denominator="contracts in the single published agency/competition slice",
            filters="manutencao-predial-engenharia + UF=RS + mass-critical agency cell",
            dedup_logic=(
                "public export does not split ATA/ordem de serviço/reajuste; "
                "each ingested contract row is one count"
            ),
            value_semantics=(
                "concentration_top3_share is the share of the slice held by the "
                "top 3 observed suppliers, not a national HHI"
            ),
            exclusions="4 published pavimentação/edificações markets (buyer names suppressed)",
            limitation=(
                "Concentração só é mensurável na fatia Caxias do Sul / manutenção "
                "predial (1 dia civil, 1 órgão, 1 fornecedor dominante). "
                "HHI dos 4 mercados publicados é nulo; top buyers estão suprimidos."
            ),
            cutoff=agency.get("period_end") or manifest.get("data_as_of"),
        )
    )
    answers.append(q4)

    # Q5 regional
    q5 = {
        **specs["Q5"],
        "status": "answered",
        "value": {
            "ufs_in_published_markets": sorted(
                {row["uf"] for row in market_rows if row.get("uf")}
            ),
            "by_market": market_rows,
            "compares_brazil_regions": False,
        },
        "series": market_rows,
    }
    q5.update(
        _prov(
            snapshot,
            source="data/pseo/markets.json",
            denominator="the 4 published market cells",
            filters="same as Q1",
            dedup_logic="one primary market cell per contract",
            value_semantics="side-by-side UF×archetype comparison inside the recorte",
            exclusions="23 UFs sem mercado publicado; inventário-candidato não entra no valor",
            limitation=(
                "Comparação regional restrita a SC, PI, MG e RS. "
                "Não é ranking de regiões brasileiras."
            ),
        )
    )
    answers.append(q5)

    # Q6 categories
    archetype_rows = [
        {
            "id": item.get("id") or item.get("slug"),
            "label": item.get("label"),
            "evidence_contract_count": item.get("evidence_contract_count"),
            "evidence_buyer_count": item.get("evidence_buyer_count"),
            "ufs_observed": [
                uf.get("uf") for uf in (item.get("ufs_observed") or [])
            ],
            "published_as_market": (item.get("id") or item.get("slug"))
            in {market.get("archetype_id") for market in markets},
        }
        for item in archetypes
    ]
    q6 = {
        **specs["Q6"],
        "status": "answered",
        "value": {
            "published_market_archetypes": sorted(
                {market.get("archetype_id") for market in markets}
            ),
            "archetypes_in_snapshot": archetype_rows,
        },
        "series": archetype_rows,
    }
    q6.update(
        _prov(
            snapshot,
            source="data/pseo/archetypes.json + data/pseo/markets.json",
            denominator=(
                "evidence_contract_count of each archetype object; "
                "published markets are a subset"
            ),
            filters="textual object-pattern classification; aec_confirmed for public aggregates",
            dedup_logic=(
                "a contract may match more than one archetype pattern; "
                "published markets use the primary label only"
            ),
            value_semantics="category mass inside the snapshot, not a national category mix",
            exclusions="inventory-only archetypes (candidato) are not treated as published markets",
            limitation=(
                "Arquétipos listam UFs além de SC/PI/MG/RS com n pequeno. "
                "Essas UFs não viram mercado publicado e não sustentam recorte nacional."
            ),
        )
    )
    answers.append(q6)

    # Q7 typical size — prices.json is a distinct query from markets.json
    markets_by_slug = {item.get("slug"): item for item in markets}
    price_vs_market = []
    price_rows = []
    for item in prices:
        slug = item.get("slug")
        market = markets_by_slug.get(slug) or {}
        price_n = item.get("n") or item.get("observation_count")
        market_n = market.get("contract_count")
        row = {
            "slug": slug,
            "uf": item.get("region"),
            "object_label": item.get("object_label"),
            "n": price_n,
            "min": item.get("min_value") or item.get("min"),
            "p25": item.get("p25_value") or item.get("p25"),
            "median": item.get("median_value") or item.get("mediana"),
            "p75": item.get("p75_value") or item.get("p75"),
            "max": item.get("max_value") or item.get("max"),
            "price_floor_brl": 5000,
            "published_market": bool(market),
            "market_contract_count": market_n,
            "market_median": market.get("median_value"),
            "market_p25": market.get("p25_value"),
            "market_p75": market.get("p75_value"),
            "unit_price": False,
        }
        price_rows.append(row)
        if market:
            price_vs_market.append(
                {
                    "slug": slug,
                    "price_n": price_n,
                    "market_n": market_n,
                    "price_n_minus_market_n": (
                        None
                        if price_n is None or market_n is None
                        else int(price_n) - int(market_n)
                    ),
                }
            )
    q7 = {
        **specs["Q7"],
        "status": "answered",
        "value": {
            "by_price_cell": price_rows,
            "price_vs_market": price_vs_market,
            "populations": (
                "prices.json and markets.json are distinct exporter queries "
                "on the same snapshot; n and percentiles are not interchangeable"
            ),
            "not_unit_price": True,
            "not_practiced_price_band": True,
        },
        "series": price_rows,
    }
    q7.update(
        _prov(
            snapshot,
            source="data/pseo/prices.json (percentiles); markets.json only as a distinct comparison population",
            denominator=(
                "price-cell observations as published in prices.json "
                "(inclusion_criteria of that file, including valor_total >= 5000 BRL)"
            ),
            filters=(
                "aec_confirmed + matching archetype + UF as stated on each "
                "price cell; mean is not published. Do not reuse markets.json n."
            ),
            dedup_logic="one contract instrument per observation; SQLite ORDER BY + OFFSET percentiles",
            value_semantics=(
                "P25/mediana/P75 of the integral contract value in nominal BRL "
                "inside the price-cell query; not a unit price, not a "
                "practiced-price band, and not the markets.json median"
            ),
            exclusions="null, zero, or below 5000 BRL inside the price query; unclassified objects; arithmetic mean",
            limitation=(
                "prices.json e markets.json são populações de query distintas. "
                "n e percentis divergem nos dois sentidos e não se explica o "
                "desvio pelo piso de 5000 BRL (esse piso é critério da célula "
                "de preço, não uma prova de que n_preço < n_mercado). "
                "Células de preço sem mercado publicado (ex.: manutenção predial) "
                "não entram no wedge. Objetos do mesmo arquétipo podem ser "
                "tecnicamente incomparáveis."
            ),
        )
    )
    answers.append(q7)

    # Q8 evolution — unsupported
    yearly = []
    for market in markets:
        years = market.get("value_by_year") or []
        yearly.append(
            {
                "slug": market.get("slug"),
                "years": years,
                "year_count": len(years),
            }
        )
    multi_year = [row for row in yearly if row["year_count"] > 1]
    q8 = _unsupported(
        specs["Q8"],
        snapshot,
        source="data/pseo/markets.json value_by_year",
        reason=(
            "Série anual insuficiente: 3 de 4 mercados publicados têm um único "
            "ano ("
            + ", ".join(row["slug"] for row in yearly if row["year_count"] <= 1)
            + f"). Apenas {len(multi_year)} mercado cruza dois anos civis, "
            "com n anual baixo e janelas de poucas semanas. "
            "Evolução do recorte: não sustentado."
        ),
    )
    q8["value"] = {
        "by_market_years": yearly,
        "multi_year_markets": multi_year,
    }
    q8["series"] = yearly
    answers.append(q8)

    return answers


def coverage_block(snapshot: dict[str, Any]) -> dict[str, Any]:
    manifest = snapshot["manifest"]
    markets = published_markets(snapshot)
    inventory = snapshot.get("national_candidate_inventory") or {}
    inv_denoms = inventory.get("denominators") or {}
    ufs = sorted({item.get("region") for item in markets if item.get("region")})
    return {
        "ufs": ufs,
        "uf_count": len(ufs),
        "published_markets": len(markets),
        "national_universe_complete": False,
        "national_denominator": None,
        "snapshot_aec_confirmed_contracts": (
            manifest.get("denominators") or {}
        ).get("aec_confirmed_contracts"),
        "snapshot_raw_contracts": (
            manifest.get("denominators") or {}
        ).get("contracts_total_loaded"),
        "manifest_limitation": next(
            (
                item
                for item in manifest.get("limitations") or []
                if "national universe" in item.lower() or "universo" in item.lower()
            ),
            "Datalake coverage is incomplete relative to the national universe.",
        ),
        "inventory_not_used_as_published_fact": {
            "present": bool(inventory),
            "dataset_hash": inventory.get("dataset_hash"),
            "generated_at": inventory.get("generated_at"),
            "n_candidates": inventory.get("n_candidates"),
            "national_records_available": inv_denoms.get("national_records_available"),
            "aec_confirmed_contracts_in_inventory": inv_denoms.get(
                "aec_confirmed_contracts"
            ),
            "why_excluded": (
                "Inventário-candidato (QUALITY_ELIGIBLE / human_review PENDING). "
                "Não passou pelo recorte público de markets.json. "
                "Serve só como evidência de lacuna de cobertura, não como finding."
            ),
        },
    }


def decide_verdict(snapshot: dict[str, Any], questions: list[dict[str, Any]]) -> dict[str, Any]:
    markets = published_markets(snapshot)
    coverage = coverage_block(snapshot)
    if not markets:
        return {
            "verdict": "KILL",
            "reason": "Nenhum mercado publicado no snapshot. Sem wedge sustentável.",
        }
    answered = [item for item in questions if item.get("status") == "answered"]
    if len(answered) < 3:
        return {
            "verdict": "KILL",
            "reason": "Menos de 3 perguntas sustentadas. Sem tese citável.",
        }
    if not coverage["national_universe_complete"] or coverage["uf_count"] < 27:
        return {
            "verdict": "NEEDS_DATA",
            "reason": (
                f"Wedge sustentável apenas como recorte de {coverage['uf_count']} UF(s) "
                f"e {coverage['published_markets']} mercado(s) publicados. "
                "O manifest declara cobertura incompleta frente ao conjunto "
                "de referência do datalake. "
                "PUBLISH exigiria export public_read versionado com cobertura "
                "de 27 UFs documentada e denominator explícito."
            ),
        }
    return {
        "verdict": "PUBLISH",
        "reason": "Coverage+denominator sustentam tese nacional.",
    }
