"""Adversarial review of the published snapshot (no new data collection)."""

from __future__ import annotations

import re
from typing import Any


def _count_object_hits(markets: list[dict[str, Any]], pattern: str) -> int:
    regex = re.compile(pattern, re.IGNORECASE)
    hits = 0
    for market in markets:
        for obj in market.get("top_objects") or []:
            blob = " ".join(
                str(obj.get(key) or "") for key in ("label", "example_objeto")
            )
            if regex.search(blob):
                hits += int(obj.get("count") or 1)
    return hits


def review(snapshot: dict[str, Any]) -> dict[str, Any]:
    markets = list(snapshot.get("markets") or [])
    prices = list(snapshot.get("prices") or [])
    agencies = list(snapshot.get("agencies") or [])
    competition = list(snapshot.get("competition") or [])
    opportunities = list(snapshot.get("opportunities") or [])
    manifest = snapshot["manifest"]
    inventory = snapshot.get("national_candidate_inventory") or {}

    agency = agencies[0] if agencies else {}
    reajuste_n = next(
        (
            obj.get("count")
            for obj in (agency.get("top_objects") or [])
            if "reajuste" in (obj.get("label") or "").lower()
        ),
        0,
    )
    manutencao_n = next(
        (
            obj.get("count")
            for obj in (agency.get("top_objects") or [])
            if "manutenção predial" in (obj.get("label") or "").lower()
            or "manutencao predial" in (obj.get("label") or "").lower()
        ),
        0,
    )

    opp_ufs: set[str] = set()
    for radar in opportunities:
        for item in radar.get("items") or []:
            if item.get("uf"):
                opp_ufs.add(item["uf"])

    consorcio_hits = _count_object_hits(markets, r"cons[oó]rcio")
    registro_precos_hits = _count_object_hits(markets, r"registro de pre")
    aditivo_hits = _count_object_hits(markets, r"aditiv")

    price_max_vs_median = []
    for item in prices:
        median = item.get("median_value") or item.get("mediana") or 0
        maximum = item.get("max_value") or item.get("max") or 0
        n = item.get("n") or item.get("observation_count")
        if median:
            price_max_vs_median.append(
                {
                    "slug": item.get("slug"),
                    "n": n,
                    "median": median,
                    "max": maximum,
                    "max_over_median": round(float(maximum) / float(median), 2),
                    "exporter_outlier_count": item.get("outlier_count"),
                }
            )

    suppressed_value_zero = []
    for market in markets:
        for buyer in market.get("top_buyers") or []:
            if buyer.get("suppressed") and float(buyer.get("total_value") or 0) == 0:
                suppressed_value_zero.append(market.get("slug"))

    market_spans = []
    for market in markets:
        market_spans.append(
            {
                "slug": market.get("slug"),
                "period_start": market.get("period_start"),
                "period_end": market.get("period_end"),
                "years": [row.get("year") for row in (market.get("value_by_year") or [])],
            }
        )

    return {
        "lenses": [
            {
                "id": "duplicidade",
                "status": "flagged",
                "finding": (
                    f"A fatia de agência {agency.get('name')} conta "
                    f"{agency.get('contract_count')} contratos no mesmo dia "
                    f"{agency.get('period_start')}, dos quais {manutencao_n} "
                    f"são o mesmo objeto de manutenção predial sob demanda e "
                    f"{reajuste_n} são rotulados como reajuste. O export público "
                    "não separa ATA, ordem de serviço e reajuste. Contar 49 como "
                    "49 obras distintas inflaria volume."
                ),
                "evidence": {
                    "agency_contract_count": agency.get("contract_count"),
                    "supplier_count": agency.get("supplier_count"),
                    "period_start": agency.get("period_start"),
                    "period_end": agency.get("period_end"),
                    "manutencao_object_count": manutencao_n,
                    "reajuste_object_count": reajuste_n,
                },
            },
            {
                "id": "consorcios",
                "status": "flagged",
                "finding": (
                    f"Texto de objeto menciona consórcio em {consorcio_hits} "
                    "ocorrência(s) dos top_objects publicados. Não há flag "
                    "estruturado de consórcio no snapshot. Participação de "
                    "consórcio não é quantificável."
                ),
                "evidence": {"object_text_hits": consorcio_hits},
            },
            {
                "id": "aditivos",
                "status": "flagged",
                "finding": (
                    f"top_objects dos 4 mercados têm {aditivo_hits} menção(ões) "
                    f"a aditivo e {registro_precos_hits} a registro de preços. "
                    f"A fatia Caxias tem {reajuste_n} contratos rotulados "
                    "Reajuste. Sem campo estruturado de termo aditivo, esses "
                    "instrumentos não entram como métrica de aditivo."
                ),
                "evidence": {
                    "aditivo_object_hits": aditivo_hits,
                    "registro_precos_hits": registro_precos_hits,
                    "reajuste_object_count": reajuste_n,
                },
            },
            {
                "id": "zeros_nulos",
                "status": "flagged",
                "finding": (
                    "A query pública declara valor_gt_0. Células de preço "
                    "excluem nulo, zero e valor < 5000 BRL. Compradores "
                    f"suprimidos publicam total_value=0 nos mercados "
                    f"{suppressed_value_zero}. Esse zero é política de "
                    "privacidade, não valor econômico."
                ),
                "evidence": {
                    "query_versions": manifest.get("query_versions"),
                    "markets_with_suppressed_value_zero": suppressed_value_zero,
                },
            },
            {
                "id": "aliases",
                "status": "flagged",
                "finding": (
                    "Nomes de órgão variam no próprio recorte (ao menos 4 grafias "
                    "nos exemplos públicos: MRS-PREFEITURA, PREFEITURA MUNICIPAL, "
                    "Unidade Única, PM VENANACIO AIRES). buyer_count usa o "
                    "identificador do exportador; aliases cadastrais podem "
                    "fragmentar ou colapsar órgãos."
                ),
                "evidence": {
                    "agency_name": agency.get("agency_name") or agency.get("name"),
                    "sample_orgao_nomes": [
                        (ex.get("orgao_nome"), ex.get("uf"))
                        for item in prices
                        for ex in (item.get("public_examples") or [])[:1]
                    ],
                },
            },
            {
                "id": "coverage_gaps",
                "status": "flagged",
                "finding": (
                    f"Snapshot publicado: {len(markets)} mercados, UFs "
                    f"{sorted({m.get('region') for m in markets})}, "
                    f"{(manifest.get('denominators') or {}).get('aec_confirmed_contracts')} "
                    "aec_confirmed, "
                    f"{(manifest.get('denominators') or {}).get('contracts_total_loaded')} "
                    "contratos carregados. Radar de oportunidades inclui UFs "
                    f"{sorted(opp_ufs)} (PR não é mercado publicado). "
                    "Inventário-candidato no mesmo dataset_hash reporta "
                    f"national_records_available="
                    f"{(inventory.get('denominators') or {}).get('national_records_available')} "
                    "e aec_confirmed_contracts="
                    f"{(inventory.get('denominators') or {}).get('aec_confirmed_contracts')}, "
                    "mas permanece PENDING / QUALITY_ELIGIBLE e não alimenta findings."
                ),
                "evidence": {
                    "published_ufs": sorted({m.get("region") for m in markets}),
                    "opportunity_ufs": sorted(opp_ufs),
                    "classification_counts": manifest.get("classification_counts"),
                    "inventory_n_candidates": inventory.get("n_candidates"),
                    "inventory_denominators": inventory.get("denominators"),
                    "manifest_limitations": manifest.get("limitations"),
                },
            },
            {
                "id": "outliers",
                "status": "flagged",
                "finding": (
                    "Células de preço declaram outlier_count=0, mas o máximo "
                    "chega a várias vezes a mediana (pavimentação PI e SC, "
                    "edificações MG). Sem regra de outlier no export, o máximo "
                    "é um contrato integral heterogêneo, não um erro estatístico "
                    "removido."
                ),
                "evidence": {"max_over_median": price_max_vs_median},
            },
            {
                "id": "vies_temporal",
                "status": "flagged",
                "finding": (
                    "Três mercados publicados cabem em janelas de semanas de "
                    "2026. A agência/concorrência de Caxias é um único dia "
                    "(2026-07-03). Edificações RS é o único com 2025+2026 e "
                    "ainda assim com n anual baixo. O recorte reflete ingestão "
                    "recente, não um ano-calendário comparável."
                ),
                "evidence": {
                    "market_spans": market_spans,
                    "agency_span": {
                        "start": agency.get("period_start"),
                        "end": agency.get("period_end"),
                    },
                    "competition_span": {
                        "start": (competition[0].get("period_start") if competition else None),
                        "end": (competition[0].get("period_end") if competition else None),
                    },
                    "freshness": manifest.get("freshness"),
                },
            },
        ]
    }
