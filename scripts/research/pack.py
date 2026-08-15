"""Assemble, validate and persist the EDIÇÃO ZERO research pack."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from scripts.research.adversarial import review
from scripts.research.citation import citation_block
from scripts.research.claims import validate_claim_gate
from scripts.research.contract import evaluate_national_claim_gate, next_action_for_gate
from scripts.research.metrics import (
    WEDGE,
    answer_questions,
    coverage_block,
    decide_verdict,
    published_markets,
)
from scripts.research.read_model import load_research_read_model, resolve_edition_source
from scripts.research.snapshot import load_snapshot

_UNSET = object()

PACK_SCHEMA = "confenge-research-pack-v1"
DEFAULT_OUT_DIR = Path("data/research/edicao-zero-2026-07-31")


class PackError(ValueError):
    """Pack failed the fail-closed gate."""


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _charts(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {item["id"]: item for item in questions}
    q1 = by_id["Q1"]
    q5 = by_id["Q5"]
    q2 = by_id["Q2"]
    q3 = by_id["Q3"]
    q7 = by_id["Q7"]
    q4 = by_id["Q4"]

    value_series = [
        {
            "label": f"{row['uf']} · {row['archetype_id']}",
            "contract_count": row["contract_count"],
            "total_value_brl": row["total_value"],
        }
        for row in (q1.get("series") or [])
    ]
    actor_series = []
    buyers = {row["slug"]: row for row in (q2.get("series") or [])}
    suppliers = {row["slug"]: row for row in (q3.get("series") or [])}
    for row in q1.get("series") or []:
        slug = row["slug"]
        actor_series.append(
            {
                "label": f"{row['uf']} · {row['archetype_id']}",
                "contracts": row["contract_count"],
                "buyers": (buyers.get(slug) or {}).get("buyer_count"),
                "suppliers": (suppliers.get(slug) or {}).get("supplier_count"),
            }
        )
    ticket_series = [
        {
            "label": f"{row['uf']} · {row['object_label']}",
            "n": row["n"],
            "p25": row["p25"],
            "median": row["median"],
            "p75": row["p75"],
        }
        for row in (q7.get("series") or [])
        if row.get("object_label")
        in {"Pavimentação e infraestrutura viária", "Edificações públicas"}
    ]
    q1_value = q1.get("value") or {}
    funnel = [
        {
            "stage": "contratos carregados (snapshot)",
            "n": q1_value.get("raw_contracts_loaded"),
        },
        {
            "stage": "aec_confirmed no snapshot",
            "n": q1_value.get("aec_confirmed_contracts_in_snapshot"),
        },
        {
            "stage": "contratos nos 4 mercados publicados",
            "n": q1_value.get("published_market_contract_count"),
        },
    ]
    conc = (q4.get("value") or {}).get("measurable_slice") or {}
    concentration = [
        {
            "label": "contratos no órgão",
            "n": conc.get("contract_count"),
        },
        {
            "label": "fornecedores observados",
            "n": conc.get("supplier_count"),
        },
        {
            "label": "objetos rotulados reajuste",
            "n": conc.get("reajuste_object_count"),
        },
    ]

    return [
        {
            "id": "C1",
            "pergunta": q1["question"],
            "dados": value_series,
            "unidade": "BRL nominal (contrato integral)",
            "source": q1.get("source"),
            "method": q1.get("dedup_logic"),
            "caveat": q1["limitation"],
            "takeaway": (
                "O valor observado vive em 4 células mercado×UF. "
                "Somar as células descreve o recorte publicado, não o Brasil."
            ),
        },
        {
            "id": "C2",
            "pergunta": "Como se comparam contratos, compradores e fornecedores por mercado?",
            "dados": actor_series,
            "unidade": "contagem",
            "source": q2.get("source"),
            "method": q2.get("dedup_logic"),
            "caveat": q2["limitation"],
            "takeaway": (
                "Compradores e fornecedores são quase 1:1 na maior parte das "
                "células. Isso é n pequeno, não prova atomização nacional."
            ),
        },
        {
            "id": "C3",
            "pergunta": q7["question"],
            "dados": ticket_series,
            "unidade": "BRL nominal; P25/mediana/P75 da célula de preço (prices.json)",
            "source": q7.get("source"),
            "method": q7.get("dedup_logic"),
            "caveat": q7["limitation"],
            "takeaway": (
                "A mediana de C3 vem de prices.json, população distinta de "
                "markets.json. É contrato integral, não preço unitário nem "
                "faixa nacional de preço praticado."
            ),
        },
        {
            "id": "C4",
            "pergunta": "Quanto do snapshot publicado chega aos 4 mercados do wedge?",
            "dados": funnel,
            "unidade": "contratos",
            "source": q1.get("source"),
            "method": q1.get("dedup_logic"),
            "caveat": q1["limitation"],
            "takeaway": (
                "A maior parte do snapshot não entra no wedge. Tratar os 4 "
                "mercados como Brasil inverteria o funil."
            ),
        },
        {
            "id": "C5",
            "pergunta": q4["question"],
            "dados": concentration,
            "unidade": "contratos / fornecedores no órgão publicado",
            "source": q4.get("source"),
            "method": q4.get("dedup_logic"),
            "caveat": q4["limitation"],
            "takeaway": (
                "A única concentração mensurável é um órgão em um dia, com "
                "reajustes misturados a ordens de serviço."
            ),
        },
    ]


def _findings(questions: list[dict[str, Any]], adversarial: dict[str, Any]) -> list[dict[str, Any]]:
    by_id = {item["id"]: item for item in questions}
    q1 = by_id["Q1"]["value"]
    q7 = by_id["Q7"]["value"]
    q4 = by_id["Q4"]["value"]
    q8 = by_id["Q8"]
    slice_ = q4.get("measurable_slice") or {}
    findings = [
        {
            "id": "F1",
            "status": "answered",
            "claim": (
                f"Os 4 mercados publicados somam {q1['published_market_contract_count']} "
                f"contratos e {q1['published_market_total_value_brl']} BRL nominais "
                f"(data_as_of do snapshot). O snapshot classifica "
                f"{q1['aec_confirmed_contracts_in_snapshot']} contratos aec_confirmed "
                f"em {q1['raw_contracts_loaded']} carregados."
            ),
            "question_id": "Q1",
            "evidence": {
                "question_id": "Q1",
                "anchor": "#Q1",
                "source": by_id["Q1"].get("source"),
                "denominator": by_id["Q1"].get("denominator"),
            },
        },
        {
            "id": "F2",
            "status": "answered",
            "claim": (
                "Compradores distintos por mercado publicado: "
                + ", ".join(
                    f"{row['uf']} {row['slug'].split('-')[0]}={row['buyer_count']}"
                    for row in (by_id["Q2"].get("series") or [])
                )
                + ". Identidades nominais dos top buyers estão suprimidas."
            ),
            "question_id": "Q2",
            "evidence": {
                "question_id": "Q2",
                "anchor": "#Q2",
                "source": by_id["Q2"].get("source"),
                "denominator": by_id["Q2"].get("denominator"),
            },
        },
        {
            "id": "F3",
            "status": "answered",
            "claim": (
                "Fornecedores observados por mercado publicado: "
                + ", ".join(
                    f"{row['uf']}={row['supplier_count']}"
                    for row in (by_id["Q3"].get("series") or [])
                )
                + "."
            ),
            "question_id": "Q3",
            "evidence": {
                "question_id": "Q3",
                "anchor": "#Q3",
                "source": by_id["Q3"].get("source"),
                "denominator": by_id["Q3"].get("denominator"),
            },
        },
        {
            "id": "F4",
            "status": "partial",
            "claim": (
                f"Concentração mensurável só na fatia "
                f"{slice_.get('agency_name')} ({slice_.get('uf')}): "
                f"{slice_.get('contract_count')} contratos, "
                f"{slice_.get('supplier_count')} fornecedor(es), "
                f"top3_share={slice_.get('concentration_top3_share')}, "
                f"período {slice_.get('period_start')}–{slice_.get('period_end')}. "
                f"{slice_.get('reajuste_object_count')} objetos rotulados reajuste."
            ),
            "question_id": "Q4",
            "evidence": {
                "question_id": "Q4",
                "anchor": "#Q4",
                "source": by_id["Q4"].get("source"),
                "denominator": by_id["Q4"].get("denominator"),
            },
        },
        {
            "id": "F5",
            "status": "answered",
            "claim": (
                "Tickets (piso 5000 BRL, contrato integral): "
                + "; ".join(
                    f"{row['uf']} {row['object_label']} n={row['n']} "
                    f"P25={row['p25']} mediana={row['median']} P75={row['p75']}"
                    for row in (q7.get("by_price_cell") or [])
                    if row.get("object_label")
                    in {
                        "Pavimentação e infraestrutura viária",
                        "Edificações públicas",
                    }
                )
                + ". Não é preço unitário."
            ),
            "question_id": "Q7",
            "evidence": {
                "question_id": "Q7",
                "anchor": "#Q7",
                "source": by_id["Q7"].get("source"),
                "denominator": by_id["Q7"].get("denominator"),
            },
        },
        {
            "id": "F6",
            "status": "unsupported",
            "claim": (
                "Evolução temporal do recorte: não sustentado. "
                + q8["limitation"]
            ),
            "question_id": "Q8",
            "evidence": {
                "question_id": "Q8",
                "anchor": "#Q8",
                "source": q8.get("source"),
                "denominator": q8.get("denominator"),
            },
        },
    ]
    for lens in adversarial.get("lenses") or []:
        findings.append(
            {
                "id": f"ADV-{lens['id']}",
                "status": lens["status"],
                "claim": lens["finding"],
                "question_id": None,
            }
        )
    return findings


def _methodology(snapshot: dict[str, Any]) -> dict[str, Any]:
    manifest = snapshot["manifest"]
    return {
        "title": "Metodologia EDIÇÃO ZERO — recorte pré-nacional",
        "producer": manifest.get("export_entrypoint"),
        "producer_version": manifest.get("export_version"),
        "source_repository": manifest.get("source_repository"),
        "source_commit_sha": manifest.get("source_commit_sha"),
        "source_run_id": manifest.get("source_run_id"),
        "tables": manifest.get("tables"),
        "query_versions": manifest.get("query_versions"),
        "classifier": (snapshot.get("icp_methodology") or {}).get("classifier"),
        "steps": [
            "Preferir o export versionado extra-cli #400 (research_aggregate_v1) quando presente.",
            "Se o export #400 estiver ausente, ilegível, com cobertura insuficiente ou stale, falhar fechado no snapshot 4-UF como preview.",
            "Não copiar datalake; não executar crawler; não inventar coverage nacional.",
            "Restringir findings do preview aos 4 mercados publicados + fatia de agência/concorrência.",
            "Tratar national-candidate-inventory como lacuna de cobertura, não como fato publicado.",
            "Responder pergunta só com proveniência completa; senão marcar unsupported.",
            "Bloquear linguagem de claim quando o denominator não sustentar a afirmação.",
            "Rodar revisão adversarial e o claim-language gate antes de gravar o pack.",
        ],
        "value_semantics": (
            "Valores são contrato integral nominal em BRL. "
            "Não são preço unitário, preço praticado nacional, nem valor deflacionado."
        ),
        "dedup_logic": (
            "O exportador atribui um arquétipo primário por contrato. "
            "Este pack não re-deduplica linhas brutas; não há microdados no snapshot."
        ),
        "limitations": manifest.get("limitations") or [],
    }


def build_pack(
    snapshot: dict[str, Any] | None = None,
    *,
    read_model: Any = _UNSET,
    now: Any = None,
) -> dict[str, Any]:
    loaded = snapshot or load_snapshot()
    if read_model is _UNSET:
        export = load_research_read_model()
    else:
        export = read_model
    gate = evaluate_national_claim_gate(export, now=now)
    resolved = resolve_edition_source(loaded, export, now=now, gate=gate)
    edition = resolved["snapshot"]
    questions = answer_questions(edition)
    coverage = coverage_block(edition, gate=gate)
    adversarial = review(edition)
    verdict = decide_verdict(edition, questions, gate=gate)
    findings = _findings(questions, adversarial)
    charts = _charts(questions)
    meta = edition["meta"]
    indexable = verdict["verdict"] == "PUBLISH" and gate.passed
    pack = {
        "schema": PACK_SCHEMA,
        "edition": "edicao-zero",
        "title": (
            "EDIÇÃO ZERO — pavimentação e edificações públicas no recorte "
            "pré-nacional extra-cli (SC, PI, MG, RS)"
        ),
        "wedge": WEDGE,
        "dataset_hash": meta["dataset_hash"],
        "data_as_of": meta["data_as_of"],
        "generated_at_snapshot": meta["generated_at"],
        "pack_built_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "reproducibility": {
            "snapshot_dir": meta["snapshot_dir"],
            "dataset_hash": meta["dataset_hash"],
            "data_as_of": meta["data_as_of"],
            "source_commit_sha": meta["source_commit_sha"],
            "source_run_id": meta["source_run_id"],
            "dated_folder_dataset_hash": meta["dated_folder_dataset_hash"],
            "dated_folder_is_live": meta["dated_folder_is_live"],
            "entry_point": "python3 -m scripts.research build",
            "edition_source": resolved["source"],
            "extra_cli_public_read_export_consumed": resolved[
                "extra_cli_public_read_export_consumed"
            ],
            "extra_cli_public_read_note": resolved["extra_cli_public_read_note"],
        },
        "coverage": coverage,
        "methodology": _methodology(loaded),
        "questions": questions,
        "findings": findings,
        "charts": charts,
        "adversarial": adversarial,
        "caveats": [
            "Este pack descreve um recorte de 4 UFs. Não é censo do Brasil.",
            "Mediana não é preço unitário nem faixa nacional de preço praticado.",
            "Inventário-candidato (54k aec_confirmed / 4,4M records available) não é finding.",
            resolved["extra_cli_public_read_note"],
            "Preview permanece noindex até extra-cli #400 passar o national claim gate.",
        ],
        "offers": {
            "discrete": True,
            "paths": WEDGE["commercial_fit"],
            "note": (
                "Ofertas CONFENGE entram só como próximo passo operacional "
                "( Bid Room, auditoria de orçamento, aditivos, defesa de margem ), "
                "depois dos fatos do recorte. Sem CTA de ranking nacional."
            ),
        },
        "indexation": {
            "indexable": indexable,
            "robots": "index,follow" if indexable else "noindex,nofollow",
            "sitemap": indexable,
            "reason": (
                "National claim gate passed; human quality gate still applies."
                if indexable
                else "Quality gate extra-cli #400 não passou; verdict != PUBLISH."
            ),
        },
        "national_claim_gate": gate.as_dict(),
        "verdict": verdict["verdict"],
        "verdict_reason": verdict["reason"],
        "next_action": next_action_for_gate(gate),
        "published_market_count": len(published_markets(edition)),
    }
    pack["citation"] = citation_block(pack, download_present=True)
    return pack


def observable_metric_values(pack: dict[str, Any]) -> dict[str, Any]:
    """Stable subset used to prove two runs match."""
    answered = {}
    for question in pack.get("questions") or []:
        if question.get("status") in {"answered", "partial", "unsupported"}:
            answered[question["id"]] = question.get("value")
    return {
        "dataset_hash": pack.get("dataset_hash"),
        "data_as_of": pack.get("data_as_of"),
        "verdict": pack.get("verdict"),
        "question_values": answered,
    }


def validate_pack(pack: dict[str, Any]) -> None:
    errors = validate_claim_gate(pack)
    if not pack.get("dataset_hash") or not pack.get("data_as_of"):
        errors.append("pack missing dataset_hash or data_as_of")
    if not pack.get("reproducibility"):
        errors.append("pack missing reproducibility pointer")
    lenses = {item["id"] for item in (pack.get("adversarial") or {}).get("lenses") or []}
    required_lenses = {
        "duplicidade",
        "consorcios",
        "aditivos",
        "zeros_nulos",
        "aliases",
        "coverage_gaps",
        "outliers",
        "vies_temporal",
    }
    missing_lenses = sorted(required_lenses - lenses)
    if missing_lenses:
        errors.append(f"adversarial review missing lenses: {missing_lenses}")
    if errors:
        raise PackError("pack validation failed:\n- " + "\n- ".join(errors))


def write_pack(pack: dict[str, Any], out_dir: Path | None = None) -> Path:
    validate_pack(pack)
    root = _repo_root()
    directory = out_dir or (root / DEFAULT_OUT_DIR)
    directory.mkdir(parents=True, exist_ok=True)
    pack_path = directory / "pack.json"
    pack_path.write_text(
        json.dumps(pack, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (directory / "chart-series.json").write_text(
        json.dumps(
            {
                "dataset_hash": pack["dataset_hash"],
                "data_as_of": pack["data_as_of"],
                "charts": pack["charts"],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (directory / "reproducibility.json").write_text(
        json.dumps(pack["reproducibility"], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return pack_path
