"""Demand Engine — GSC snapshots → auditable candidate/rejection records.

Pure functions of (snapshot, config). Reprocessing the same snapshot yields
identical ranking and reason codes. Wall-clock fields are declared and stripped
by comparable_document(). builtin hash() is never used for identity.

A candidate record is a proposal. It never authorizes a page, INDEX grant or
sitemap change. UNKNOWN demand stays UNKNOWN and is excluded from the weighted
total (same rule as MARKET_ANSWER_VALUE_SCORE). Keyword combinations and page
count are reject reasons, not objectives.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.organic.demand_graph import DEMAND_NODES
from scripts.organic.gsc_loader import (
    PRIVACY_NOTE,
    normalize_path,
    normalize_snapshot,
    rows_from_api,
)
from scripts.organic.service_map import map_content_to_service

SCHEMA = "demand-engine/1.0"
UNKNOWN = "UNKNOWN"
DEFAULT_CONFIG = ROOT / "data" / "organic" / "demand-engine-config.json"
LIVE_SNAPSHOT_ROOT = ROOT / "data" / "revops" / "gsc" / "snapshots"
REGISTRY_DEFAULT = ROOT / "data" / "organic" / "demand-engine-registry.json"
READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
WALL_CLOCK_FIELDS = frozenset(
    {"generated_at", "imported_at", "recorded_at", "last_sync_at", "written_at"}
)

REASON_STRIKING_DISTANCE = "striking_distance"
REASON_CANNIBALIZATION = "cannibalization"
REASON_WRONG_LANDING = "wrong_landing"
REASON_QUERY_WITHOUT_USEFUL_PAGE = "query_without_useful_page"
REASON_JOIN_UNAVAILABLE = "join_unavailable"
REASON_KEYWORD_COMBO = "keyword_combination_does_not_authorize_page"
REASON_DEMAND_UNKNOWN = "demand_UNKNOWN"
REASON_DOES_NOT_AUTHORIZE = "does_not_authorize_page"

DECISION_ORDER = {"CANDIDATE": 0, "DEFER": 1, "REJECT": 2}

QUAL_SCORE = {
    "answerable": 0.8,
    "ready": 0.8,
    "fit": 0.8,
    "needs_data": 0.4,
    "weak": 0.4,
    "none": 0.1,
    "unknown": None,
    UNKNOWN: None,
}


def load_config(path: Path | str | None = None) -> dict[str, Any]:
    p = Path(path) if path else DEFAULT_CONFIG
    return json.loads(p.read_text(encoding="utf-8"))


def stable_id(*parts: Any) -> str:
    payload = "\n".join("" if part is None else str(part) for part in parts)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def comparable_document(doc: Any) -> Any:
    """Drop declared wall-clock fields so two runs can be compared byte-wise."""
    if isinstance(doc, dict):
        return {
            key: comparable_document(value)
            for key, value in doc.items()
            if key not in WALL_CLOCK_FIELDS
        }
    if isinstance(doc, list):
        return [comparable_document(item) for item in doc]
    return doc


def _as_unknown(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and value.strip().upper() == UNKNOWN:
        return True
    if isinstance(value, dict) and str(value.get("status") or "").upper() == UNKNOWN:
        return True
    return False


def demand_from_row(row: dict[str, Any]) -> Any:
    """Observed GSC metrics or UNKNOWN. Never coerce missing demand to 0 / 0.15."""
    if row.get("keyword_combination") or row.get("page_count_objective"):
        # Volume on a combination is not demand evidence for a page.
        if _as_unknown(row.get("demand")) and row.get("impressions") is None:
            return UNKNOWN
    if _as_unknown(row.get("demand")) and "impressions" not in row and "clicks" not in row:
        return UNKNOWN
    if row.get("demand_missing") or row.get("no_gsc_evidence"):
        return UNKNOWN
    if row.get("source_table") == "proposal" and _as_unknown(row.get("demand")):
        return UNKNOWN
    if "impressions" not in row and "clicks" not in row:
        return UNKNOWN
    impressions = row.get("impressions")
    clicks = row.get("clicks")
    position = row.get("position")
    if impressions is None and clicks is None and position is None:
        return UNKNOWN
    return {
        "status": "observed",
        "impressions": float(impressions or 0),
        "clicks": float(clicks or 0),
        "position": position,
        "ctr": row.get("ctr"),
        "source_table": row.get("source_table"),
    }


def _compile_rules(config: dict[str, Any]) -> list[tuple[re.Pattern[str], dict[str, Any]]]:
    compiled: list[tuple[re.Pattern[str], dict[str, Any]]] = []
    for rule in config.get("classify_rules") or []:
        compiled.append((re.compile(rule["pattern"], re.I), rule))
    return compiled


def classify_query(query: str | None, config: dict[str, Any]) -> dict[str, Any]:
    text = (query or "").strip()
    if not text:
        return {
            "question_class": "unknown",
            "intent": "unknown",
            "rule_id": None,
        }
    for pattern, rule in _compile_rules(config):
        if pattern.search(text):
            return {
                "question_class": rule["question_class"],
                "intent": rule.get("intent") or "unknown",
                "rule_id": rule.get("id"),
            }
    return {
        "question_class": "unknown",
        "intent": "unknown",
        "rule_id": None,
    }


def _cluster_for_text(text: str) -> str | None:
    blob = (text or "").lower()
    if not blob:
        return None
    best = None
    best_hits = 0
    for node in DEMAND_NODES:
        hits = 0
        for rq in node.get("related_queries") or []:
            tokens = [t for t in rq.lower().split() if len(t) > 3]
            if sum(1 for t in tokens if t in blob) >= max(2, len(tokens) // 2):
                hits += 1
            if rq.lower() in blob or blob in rq.lower():
                hits += 2
        for tok in str(node.get("cluster") or "").replace("-", " ").split():
            if len(tok) > 3 and tok in blob:
                hits += 1
        if hits > best_hits:
            best_hits = hits
            best = node.get("cluster")
    return best if best_hits > 0 else None


def _page_cluster(page: str | None) -> dict[str, Any]:
    if not page:
        return {"cluster": None, "path": None, "matched": False, "service_path": None}
    path = page if page.startswith("/") else normalize_path(page)
    fit = map_content_to_service(path)
    cluster = fit.get("cluster_id")
    if cluster is None and isinstance(fit.get("cluster"), dict):
        cluster = fit["cluster"].get("id")
    return {
        "cluster": cluster,
        "path": path,
        "matched": bool(fit.get("matched")),
        "service_path": fit.get("service_path"),
    }


def _is_useful_page(page: str | None, config: dict[str, Any], question_class: str) -> bool:
    if not page:
        return False
    path = page if page.startswith("/") else normalize_path(page)
    if path in set(config.get("home_paths") or ["/", ""]):
        return question_class == "branded_navigational"
    low = path.lower()
    if any(tok in low for tok in (config.get("legacy_not_useful") or [])):
        return False
    prefixes = tuple(config.get("useful_path_prefixes") or [])
    return path.startswith(prefixes)


def _page_inventory_match(query: str, pages: list[dict[str, Any]]) -> bool:
    tokens = [t for t in re.split(r"\W+", query.lower()) if len(t) > 3]
    if not tokens:
        return False
    for page in pages:
        blob = " ".join(
            str(page.get(k) or "")
            for k in ("page", "path", "url", "query")
        ).lower()
        if sum(1 for t in tokens if t in blob) >= max(1, len(tokens) // 3):
            return True
    return False


def cross_readiness(
    *,
    question_class: str,
    intent: str,
    query: str | None,
    page: str | None,
    config: dict[str, Any],
) -> dict[str, str]:
    cluster = _cluster_for_text(query or "")
    page_info = _page_cluster(page)
    useful = _is_useful_page(page, config, question_class)

    if question_class == "legacy_entity":
        return {
            "answerability": "none",
            "data_readiness": "none",
            "commercial_fit": "none",
        }
    if question_class == "branded_navigational":
        return {
            "answerability": "answerable",
            "data_readiness": "ready",
            "commercial_fit": "none",
        }
    if question_class in {"cost_or_typical_value", "market_learning", "company_self_view"}:
        # extra-cli owns facts. Without a consumer-bound payload this stays needs_data.
        return {
            "answerability": "needs_data",
            "data_readiness": "needs_data",
            "commercial_fit": "fit" if cluster or intent.startswith("commercial") else "weak",
        }
    if cluster or useful or page_info.get("matched"):
        return {
            "answerability": "answerable",
            "data_readiness": "ready" if useful or page_info.get("matched") else "needs_data",
            "commercial_fit": "fit" if cluster or intent.startswith("commercial") else "weak",
        }
    if question_class == "unknown" and not cluster:
        return {
            "answerability": "unknown",
            "data_readiness": "unknown",
            "commercial_fit": "unknown",
        }
    return {
        "answerability": "needs_data",
        "data_readiness": "needs_data",
        "commercial_fit": "weak" if intent.startswith("commercial") else "unknown",
    }


def classify_row(row: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    query = row.get("query")
    page = row.get("page")
    labeled = classify_query(query, config)
    readiness = cross_readiness(
        question_class=labeled["question_class"],
        intent=labeled["intent"],
        query=query,
        page=page,
        config=config,
    )
    demand = demand_from_row(row)
    return {
        **labeled,
        **readiness,
        "demand": demand,
        "cluster": _cluster_for_text(query or "") or _page_cluster(page).get("cluster"),
    }


def is_striking_distance(row: dict[str, Any], config: dict[str, Any]) -> bool:
    band = config.get("striking_distance") or {}
    try:
        position = float(row.get("position"))
        impressions = float(row.get("impressions") or 0)
    except (TypeError, ValueError):
        return False
    return (
        float(band.get("position_min") or 4) <= position <= float(band.get("position_max") or 20)
        and impressions >= float(band.get("min_impressions") or 1)
    )


def is_keyword_combination(row: dict[str, Any]) -> bool:
    if row.get("keyword_combination") or row.get("page_count_objective"):
        return True
    if row.get("authorize_page") is True and row.get("keyword_combination") is not False:
        query = str(row.get("query") or "")
        # Combinatorial seed: many geo/object dimensions glued together.
        dim_hits = len(
            re.findall(
                r"\b(uf|munic[ií]pio|km|paviment|objeto|tipologia|esfera)\b",
                query,
                re.I,
            )
        )
        tokens = [t for t in re.split(r"\W+", query.lower()) if t]
        if dim_hits >= 2 and len(tokens) >= 6:
            return True
    query = str(row.get("query") or "")
    if row.get("combinatorial") or " × " in query or " x " in query.lower():
        return True
    return False


def detect_reasons(
    rows: list[dict[str, Any]],
    classified: list[dict[str, Any]],
    config: dict[str, Any],
) -> list[list[str]]:
    """Return reason codes per row. Join-dependent detectors fail closed."""
    page_rows = [r for r in rows if r.get("page") or r.get("path")]
    by_query_pages: dict[str, set[str]] = defaultdict(set)
    join_present_queries: set[str] = set()
    for row in rows:
        query = (row.get("query") or "").strip()
        page = row.get("page") or row.get("path")
        if row.get("join_status") == "present" and query and page:
            by_query_pages[query.lower()].add(normalize_path(page) if str(page).startswith("http") or str(page).startswith("/") else str(page))
            join_present_queries.add(query.lower())

    reasons: list[list[str]] = []
    for row, label in zip(rows, classified):
        codes: list[str] = [REASON_DOES_NOT_AUTHORIZE]
        query = (row.get("query") or "").strip()
        page = row.get("page") or row.get("path")
        join = row.get("join_status") or REASON_JOIN_UNAVAILABLE

        if is_keyword_combination(row):
            codes.append(REASON_KEYWORD_COMBO)

        if is_striking_distance(row, config) and (query or page) and row.get("source_table") in {
            "queries",
            "pages",
            "query_page",
            "proposal",
        }:
            codes.append(REASON_STRIKING_DISTANCE)

        if label.get("demand") == UNKNOWN:
            codes.append(REASON_DEMAND_UNKNOWN)

        join_dependent = query and row.get("source_table") in {"query_page", "proposal", "queries"}
        if join != "present" and join_dependent:
            codes.append(REASON_JOIN_UNAVAILABLE)

        if query:
            qkey = query.lower()
            if join == "present":
                pages_for_q = by_query_pages.get(qkey) or set()
                if len(pages_for_q) >= 2:
                    codes.append(REASON_CANNIBALIZATION)
                useful = _is_useful_page(page, config, label["question_class"])
                if not useful:
                    codes.append(REASON_QUERY_WITHOUT_USEFUL_PAGE)
                query_cluster = _cluster_for_text(query)
                page_info = _page_cluster(page)
                page_cluster = page_info.get("cluster")
                path = page_info.get("path") or ""
                if page and query_cluster and page_cluster and query_cluster != page_cluster:
                    codes.append(REASON_WRONG_LANDING)
                elif page and path in set(config.get("home_paths") or ["/", ""]) and label["question_class"] != "branded_navigational":
                    codes.append(REASON_WRONG_LANDING)
            else:
                # No join: never invent cannibalization or wrong landing.
                # A missing page on the row is not a gap if the snapshot
                # inventory already has a useful page for the query.
                if REASON_JOIN_UNAVAILABLE not in codes:
                    codes.append(REASON_JOIN_UNAVAILABLE)
                useful_inventory = [
                    inv
                    for inv in page_rows
                    if _is_useful_page(
                        inv.get("page") or inv.get("path"),
                        config,
                        label["question_class"],
                    )
                ]
                if not _page_inventory_match(query, useful_inventory):
                    codes.append(REASON_QUERY_WITHOUT_USEFUL_PAGE)

        # Deduplicate, stable order
        seen: set[str] = set()
        ordered: list[str] = []
        for code in codes:
            if code not in seen:
                seen.add(code)
                ordered.append(code)
        reasons.append(ordered)
    return reasons


def _score_record(label: dict[str, Any], reasons: list[str], config: dict[str, Any]) -> dict[str, Any]:
    weights = dict(config.get("weights") or {})
    demand = label.get("demand")
    components: dict[str, float | None] = {
        "demand": None if demand == UNKNOWN or _as_unknown(demand) else 1.0,
        "answerability": QUAL_SCORE.get(label.get("answerability") or "unknown"),
        "data_readiness": QUAL_SCORE.get(label.get("data_readiness") or "unknown"),
        "commercial_fit": QUAL_SCORE.get(label.get("commercial_fit") or "unknown"),
    }
    # Observed demand with zero impressions is still observed, but weak.
    if isinstance(demand, dict) and demand.get("status") == "observed":
        components["demand"] = 1.0 if float(demand.get("impressions") or 0) > 0 else 0.3

    unknown_components = [name for name, value in components.items() if value is None]
    weighted = 0.0
    weight_sum = 0.0
    weights_used: dict[str, float] = {}
    for name, value in components.items():
        if value is None:
            continue
        weight = float(weights.get(name) or 0)
        if weight <= 0:
            continue
        weights_used[name] = weight
        weighted += value * weight
        weight_sum += weight
    total = round(weighted / weight_sum, 4) if weight_sum else None
    notes = {}
    if "demand" in unknown_components:
        notes["demand"] = "Demand stays UNKNOWN until observed GSC/search evidence exists."
    return {
        "score": total,
        "components": components,
        "weights_used": weights_used,
        "unknown_components": unknown_components,
        "notes": notes,
        "reason_codes": list(reasons),
    }


def decide(
    row: dict[str, Any],
    label: dict[str, Any],
    reasons: list[str],
    config: dict[str, Any],
) -> str:
    if REASON_KEYWORD_COMBO in reasons:
        return "REJECT"
    if label.get("question_class") == "legacy_entity" and REASON_QUERY_WITHOUT_USEFUL_PAGE in reasons:
        return "REJECT"
    demand_unknown = label.get("demand") == UNKNOWN or _as_unknown(label.get("demand"))
    if REASON_CANNIBALIZATION in reasons or REASON_WRONG_LANDING in reasons:
        return "CANDIDATE"
    if REASON_STRIKING_DISTANCE in reasons and label.get("commercial_fit") in {"fit", "weak"}:
        return "CANDIDATE"
    if (
        REASON_QUERY_WITHOUT_USEFUL_PAGE in reasons
        and label.get("commercial_fit") == "fit"
        and not demand_unknown
    ):
        return "CANDIDATE"
    if demand_unknown:
        return "DEFER"
    if REASON_JOIN_UNAVAILABLE in reasons and REASON_STRIKING_DISTANCE not in reasons:
        return "DEFER"
    return "DEFER"


def emit_record(
    row: dict[str, Any],
    label: dict[str, Any],
    reasons: list[str],
    config: dict[str, Any],
    snapshot_id: str,
) -> dict[str, Any]:
    decision = decide(row, label, reasons, config)
    scored = _score_record(label, reasons, config)
    query = row.get("query")
    page = row.get("page") or row.get("path")
    rid = "cand-" + stable_id(
        snapshot_id,
        query,
        page,
        row.get("device"),
        row.get("country"),
        row.get("date"),
        row.get("source_table"),
        decision,
        ",".join(reasons),
    )
    kill = (config.get("kill_gates") or {}).get("default")
    for code in reasons:
        if code in (config.get("kill_gates") or {}):
            kill = (config.get("kill_gates") or {})[code]
            break
    return {
        "id": rid,
        "schema": "demand-candidate/1.0",
        "decision": decision,
        "authorizes_page": False,
        "owner": (config.get("owners") or {}).get(decision) or "web-cfg/organic",
        "expected_evidence": (config.get("expected_evidence") or {}).get(decision),
        "cost": (config.get("costs") or {}).get(decision),
        "kill_gate": kill,
        "reason_codes": list(reasons),
        "query": query,
        "page": page,
        "device": row.get("device"),
        "country": row.get("country"),
        "date": row.get("date"),
        "source_table": row.get("source_table"),
        "join_status": row.get("join_status") or REASON_JOIN_UNAVAILABLE,
        "question_class": label.get("question_class"),
        "intent": label.get("intent"),
        "answerability": label.get("answerability"),
        "data_readiness": label.get("data_readiness"),
        "commercial_fit": label.get("commercial_fit"),
        "cluster": label.get("cluster"),
        "demand": label.get("demand"),
        "snapshot_id": snapshot_id,
        "ranking": {
            "score": scored["score"],
            "components": scored["components"],
            "weights_used": scored["weights_used"],
            "unknown_components": scored["unknown_components"],
            "notes": scored["notes"],
        },
    }


def _proposal_to_row(proposal: dict[str, Any]) -> dict[str, Any]:
    row = {
        "query": proposal.get("query"),
        "page": proposal.get("page"),
        "device": proposal.get("device"),
        "country": proposal.get("country"),
        "date": proposal.get("date"),
        "source_table": "proposal",
        "join_status": "present"
        if proposal.get("query") and proposal.get("page")
        else "join_unavailable",
        "keyword_combination": bool(proposal.get("keyword_combination")),
        "page_count_objective": bool(proposal.get("page_count_objective")),
        "authorize_page": proposal.get("authorize_page"),
        "no_gsc_evidence": proposal.get("no_gsc_evidence", True),
        "demand": proposal.get("demand", UNKNOWN),
        "privacy_note": PRIVACY_NOTE,
    }
    if "impressions" in proposal:
        row["impressions"] = proposal["impressions"]
        row["no_gsc_evidence"] = False
    if "clicks" in proposal:
        row["clicks"] = proposal["clicks"]
    if "position" in proposal:
        row["position"] = proposal["position"]
    if "ctr" in proposal:
        row["ctr"] = proposal["ctr"]
    return row


def run_demand_engine(
    snapshot: dict[str, Any] | None = None,
    *,
    gsc_dir: Path | str | None = None,
    rows: list[dict[str, Any]] | None = None,
    proposals: list[dict[str, Any]] | None = None,
    config: dict[str, Any] | None = None,
    snapshot_id: str | None = None,
) -> dict[str, Any]:
    """Classify, detect and rank. Pure: no clock, no builtin hash()."""
    cfg = config or load_config()
    normalized: dict[str, Any]
    if rows is not None:
        sid = snapshot_id or "rows"
        normalized = {
            "schema": "gsc-snapshot-normalized/1.0",
            "snapshot_id": sid,
            "privacy_note": cfg.get("privacy_note") or PRIVACY_NOTE,
            "totals": {},
            "totals_reconciled": False,
            "join_status": "present"
            if any(r.get("query") and r.get("page") for r in rows)
            else "join_unavailable",
            "rows": rows_from_api(rows, snapshot_id=sid)
            if rows and (rows[0].get("query") is not None or rows[0].get("page") is not None)
            else [],
            "source_tables": {"query_page": len(rows)},
        }
        # If caller already passed normalized 5-tuples, keep them.
        if rows and "source_table" in rows[0]:
            normalized["rows"] = list(rows)
            flags = {r.get("join_status") for r in rows}
            if flags == {"present"}:
                normalized["join_status"] = "present"
            elif "present" in flags:
                normalized["join_status"] = "mixed"
            else:
                normalized["join_status"] = "join_unavailable"
    elif gsc_dir is not None:
        normalized = normalize_snapshot(gsc_dir)
    elif snapshot is not None:
        if "rows" in snapshot and "join_status" in snapshot:
            normalized = snapshot
        else:
            normalized = normalize_snapshot(snapshot)
    else:
        raise ValueError("run_demand_engine requires snapshot, gsc_dir or rows")

    sid = snapshot_id or str(normalized.get("snapshot_id") or "gsc")
    work_rows = list(normalized.get("rows") or [])
    for proposal in proposals or []:
        work_rows.append(_proposal_to_row(proposal))

    classified = [classify_row(row, cfg) for row in work_rows]
    reason_lists = detect_reasons(work_rows, classified, cfg)
    records = [
        emit_record(row, label, reasons, cfg, sid)
        for row, label, reasons in zip(work_rows, classified, reason_lists)
    ]

    records.sort(
        key=lambda rec: (
            DECISION_ORDER.get(rec["decision"], 9),
            0 if rec["ranking"]["score"] is not None else 1,
            -(rec["ranking"]["score"] or 0),
            0 if REASON_STRIKING_DISTANCE in rec["reason_codes"] else 1,
            rec["id"],
        )
    )
    for index, rec in enumerate(records, start=1):
        rec["ranking"]["rank"] = index

    detectors = {
        REASON_STRIKING_DISTANCE: [],
        REASON_CANNIBALIZATION: [],
        REASON_WRONG_LANDING: [],
        REASON_QUERY_WITHOUT_USEFUL_PAGE: [],
        REASON_JOIN_UNAVAILABLE: [],
        REASON_KEYWORD_COMBO: [],
    }
    for rec in records:
        for code in rec["reason_codes"]:
            if code in detectors:
                detectors[code].append(rec["id"])

    ranking = [
        {
            "id": rec["id"],
            "rank": rec["ranking"]["rank"],
            "score": rec["ranking"]["score"],
            "decision": rec["decision"],
            "reason_codes": list(rec["reason_codes"]),
        }
        for rec in records
    ]

    authorized = [rec["id"] for rec in records if rec.get("authorizes_page")]
    return {
        "schema": SCHEMA,
        "snapshot_id": sid,
        "privacy_note": normalized.get("privacy_note") or cfg.get("privacy_note") or PRIVACY_NOTE,
        "join_status": normalized.get("join_status"),
        "totals": normalized.get("totals") or {},
        "totals_reconciled": False,
        "source_tables": normalized.get("source_tables") or {},
        "counts": {
            "rows": len(work_rows),
            "records": len(records),
            "candidates": sum(1 for r in records if r["decision"] == "CANDIDATE"),
            "rejects": sum(1 for r in records if r["decision"] == "REJECT"),
            "defers": sum(1 for r in records if r["decision"] == "DEFER"),
            "authorized_pages": len(authorized),
        },
        "authorized_pages": authorized,
        "ranking": ranking,
        "records": records,
        "detectors": detectors,
        "note": (
            "Candidate records do not authorize pages, INDEX or sitemap changes. "
            "UNKNOWN demand is valid and is not coerced to a number. "
            "Live GSC currentness is a separate credentialed pull."
        ),
    }


def pull_api_fail_closed() -> dict[str, Any]:
    """Delegate to the observatory API path. Never invent a live series."""
    from scripts.revops.search_demand_observatory import pull_api

    result = pull_api(7)
    if result.get("ok"):
        return result
    error = result.get("error") or "blocked"
    residual = (
        "BLOCKED_GSC_READONLY_CREDENTIAL"
        if error in {"missing_credentials", "oauth_flow_not_automated_here"}
        else f"BLOCKED_GSC_{error.upper()}"
    )
    return {
        "ok": False,
        "blocked": True,
        "error": error,
        "currentness": "BLOCKED",
        "stale": True,
        "residual": residual,
        "required_env": result.get("required_env"),
        "fallback": result.get("fallback")
        or "python3 -m scripts.organic demand-engine --gsc-dir seo/gsc-2026-07-30",
        "note": "Live Search Analytics credentials are missing. CSV snapshots are historical only. Absence is not zero.",
        "payload": result,
    }


def content_hash(payload: Any) -> str:
    """Stable SHA-256 of canonical JSON. Never uses builtin hash()."""
    blob = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _dict_rows(value: Any) -> list[dict[str, Any]] | None:
    if not isinstance(value, list):
        return None
    if value and not isinstance(value[0], dict):
        return None
    return [row for row in value if isinstance(row, dict)]


def _rows_from_pull_result(api_result: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    """Load 5-tuple rows from an observatory pull. Does not invent a series.

    Returns (rows, origin). origin is path|payload|unreadable|absent.
    An empty readable list is a real empty pull, not a missing series.
    """
    path = api_result.get("path") or api_result.get("snapshot_path")
    if path:
        p = Path(path)
        if not p.is_absolute():
            p = ROOT / p
        if not p.is_file():
            return [], "unreadable"
        payload = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(payload, list):
            rows = _dict_rows(payload)
            return (rows or [], "path")
        if isinstance(payload, dict):
            for key in ("queries", "rows", "query_page"):
                rows = _dict_rows(payload.get(key))
                if rows is not None:
                    return rows, "path"
            return [], "path"
        return [], "unreadable"
    for key in ("queries", "query_page"):
        rows = _dict_rows(api_result.get(key))
        if rows is not None:
            return rows, "payload"
    rows = _dict_rows(api_result.get("rows"))
    if rows is not None:
        return rows, "payload"
    return [], "absent"


def version_query_page_snapshot(
    rows: list[dict[str, Any]],
    *,
    as_of: str,
    source: str = "search_analytics_api",
    site: str | None = None,
    dest_root: Path | None = None,
) -> dict[str, Any]:
    """Persist a dated hashed 5-tuple snapshot. Does not invent a join."""
    snapshot_id = f"gsc-{as_of}"
    dest = (dest_root or LIVE_SNAPSHOT_ROOT) / snapshot_id
    dest.mkdir(parents=True, exist_ok=True)
    normalized = rows_from_api(rows, snapshot_id=snapshot_id)
    digest = content_hash(normalized)
    rows_path = dest / "query-page.json"
    meta_path = dest / "meta.json"
    hash_path = dest / "query-page.sha256"
    rows_path.write_text(
        json.dumps(normalized, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    hash_path.write_text(digest + "\n", encoding="utf-8")
    join_flags = {row.get("join_status") for row in normalized}
    if not normalized:
        join_status = "join_unavailable"
    elif join_flags == {"present"}:
        join_status = "present"
    elif "present" in join_flags:
        join_status = "mixed"
    else:
        join_status = "join_unavailable"
    meta = {
        "schema": "gsc-live-snapshot/1.0",
        "snapshot_id": snapshot_id,
        "export_date": as_of,
        "as_of": as_of,
        "source": source,
        "site": site,
        "row_count": len(normalized),
        "join_status": join_status,
        "sha256": digest,
        "dimensions": ["query", "page", "device", "country", "date"],
        "totals_reconciled": False,
        "privacy_note": PRIVACY_NOTE,
        "note": "Empty GSC is not scored as 0 / 0.15. Missing join stays join_unavailable.",
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    try:
        rel = str(dest.relative_to(ROOT))
    except ValueError:
        rel = str(dest)
    return {
        "ok": True,
        "snapshot_id": snapshot_id,
        "dir": rel,
        "rows_path": str(rows_path),
        "meta_path": str(meta_path),
        "sha256": digest,
        "join_status": join_status,
        "row_count": len(normalized),
        "rows": normalized,
        "meta": meta,
    }


def consume_live_pull(
    api_result: dict[str, Any],
    *,
    dest_root: Path | None = None,
    registry_path: Path | None = None,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Version a live 5-tuple snapshot and run the same engine path.

    Fail closed when the pull is blocked. Empty GSC is not a default score.
    """
    if not api_result.get("ok"):
        blocked = dict(api_result)
        blocked["ok"] = False
        blocked["blocked"] = True
        blocked.setdefault("currentness", "BLOCKED")
        blocked.setdefault("stale", True)
        blocked.setdefault("residual", "BLOCKED_GSC_READONLY_CREDENTIAL")
        return blocked

    rows, origin = _rows_from_pull_result(api_result)
    as_of = str(api_result.get("as_of") or api_result.get("end") or "live")
    site = api_result.get("site")
    source = str(api_result.get("source") or "search_analytics_api")
    if origin == "unreadable":
        return {
            "ok": False,
            "blocked": True,
            "error": "live_rows_unreadable",
            "currentness": "BLOCKED",
            "stale": True,
            "residual": "BLOCKED_GSC_READONLY_CREDENTIAL",
            "path": api_result.get("path"),
            "note": "Successful pull declared a path but no 5-tuple rows were readable. Absence is not zero.",
        }
    if origin == "absent":
        return {
            "ok": False,
            "blocked": True,
            "error": "live_rows_absent",
            "currentness": "BLOCKED",
            "stale": True,
            "residual": "BLOCKED_GSC_READONLY_CREDENTIAL",
            "note": "Successful pull returned no 5-tuple series. Absence is not zero.",
        }

    versioned = version_query_page_snapshot(
        rows,
        as_of=as_of,
        source=source,
        site=site,
        dest_root=dest_root,
    )
    doc = run_demand_engine(
        rows=versioned["rows"],
        config=config,
        snapshot_id=versioned["snapshot_id"],
    )
    if any(rec.get("authorizes_page") for rec in doc["records"]):
        raise RuntimeError("demand engine must never authorize a page")

    out = registry_path or (dest_root or LIVE_SNAPSHOT_ROOT) / versioned["snapshot_id"] / "registry.json"
    out = Path(out)
    write_document(doc, out)
    slim = slim_registry(doc)
    return {
        "ok": True,
        "blocked": False,
        "currentness": "LIVE",
        "stale": False,
        "residual": None,
        "empty": versioned["row_count"] == 0,
        "snapshot": {
            "id": versioned["snapshot_id"],
            "dir": versioned["dir"],
            "sha256": versioned["sha256"],
            "join_status": versioned["join_status"],
            "row_count": versioned["row_count"],
        },
        "engine": {
            "schema": doc["schema"],
            "snapshot_id": doc["snapshot_id"],
            "join_status": doc["join_status"],
            "counts": doc["counts"],
            "authorized_pages": doc["authorized_pages"],
            "registry": str(out),
        },
        "registry": slim,
        "note": (
            "Empty GSC is not scored as 0 / 0.15. "
            "Candidates do not authorize INDEX. "
            "Missing join stays join_unavailable."
        ),
    }


def slim_registry(doc: dict[str, Any]) -> dict[str, Any]:
    """Small reviewable registry: hashes, reasons, no dumps or secrets."""
    records = []
    for rec in doc.get("records") or []:
        demand = rec.get("demand")
        demand_status = demand if demand == UNKNOWN else (demand or {}).get("status") if isinstance(demand, dict) else UNKNOWN
        records.append(
            {
                "id": rec.get("id"),
                "decision": rec.get("decision"),
                "authorizes_page": False,
                "reason_codes": list(rec.get("reason_codes") or []),
                "query": rec.get("query"),
                "page": rec.get("page"),
                "join_status": rec.get("join_status"),
                "question_class": rec.get("question_class"),
                "intent": rec.get("intent"),
                "demand_status": demand_status,
                "score": (rec.get("ranking") or {}).get("score"),
                "rank": (rec.get("ranking") or {}).get("rank"),
            }
        )
    return {
        "schema": "demand-engine-registry/1.0",
        "snapshot_id": doc.get("snapshot_id"),
        "join_status": doc.get("join_status"),
        "counts": doc.get("counts"),
        "authorized_pages": [],
        "ranking": doc.get("ranking"),
        "records": records,
        "detectors": {
            key: list(ids)
            for key, ids in (doc.get("detectors") or {}).items()
        },
        "note": doc.get("note"),
    }


def run_pull_api(
    *,
    dest_root: Path | None = None,
    registry_path: Path | None = None,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Shipped --pull-api path: fail closed, or version + classify a live pull."""
    return consume_live_pull(
        pull_api_fail_closed(),
        dest_root=dest_root,
        registry_path=registry_path,
        config=config,
    )


def write_document(doc: dict[str, Any], out: Path, *, generated_at: str | None = None) -> Path:
    payload = dict(doc)
    if generated_at is not None:
        payload["generated_at"] = generated_at
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="CONFENGE Demand Engine (WEB-016)")
    parser.add_argument("--gsc-dir", default=None, help="Versioned CSV snapshot directory")
    parser.add_argument("--rows", default=None, help="JSON list of query×page API/fixture rows")
    parser.add_argument("--proposals", default=None, help="JSON list of extra proposals (UNKNOWN demand, combos)")
    parser.add_argument(
        "--out",
        default=None,
        help="Write document (generated_at is the only wall-clock field)",
    )
    parser.add_argument("--config", default=None)
    parser.add_argument(
        "--pull-api",
        action="store_true",
        help="Attempt live Search Analytics pull; fail closed without credentials",
    )
    parser.add_argument(
        "--compare-strip-clock",
        action="store_true",
        help="Print comparable_document JSON (no wall-clock fields)",
    )
    args = parser.parse_args(argv)

    if args.pull_api:
        pulled = run_pull_api()
        print(json.dumps(pulled, ensure_ascii=False, indent=2))
        return 0 if pulled.get("ok") else 2

    rows = None
    if args.rows:
        payload = json.loads(Path(args.rows).read_text(encoding="utf-8"))
        rows = payload if isinstance(payload, list) else payload.get("rows")
    proposals = None
    if args.proposals:
        proposals = json.loads(Path(args.proposals).read_text(encoding="utf-8"))

    gsc_dir = None
    if args.gsc_dir:
        gsc_dir = Path(args.gsc_dir)
        if not gsc_dir.is_absolute():
            gsc_dir = ROOT / gsc_dir
    elif rows is None:
        preferred = ROOT / "seo" / "gsc-2026-07-30"
        fallback = ROOT / "seo" / "gsc-2026-08-09"
        gsc_dir = preferred if preferred.exists() else fallback

    config = load_config(args.config) if args.config else load_config()
    doc = run_demand_engine(
        gsc_dir=gsc_dir,
        rows=rows,
        proposals=proposals,
        config=config,
    )
    if args.compare_strip_clock:
        print(json.dumps(comparable_document(doc), ensure_ascii=False, indent=2, sort_keys=True))
    else:
        print(
            json.dumps(
                {
                    "ok": True,
                    "schema": doc["schema"],
                    "snapshot_id": doc["snapshot_id"],
                    "join_status": doc["join_status"],
                    "counts": doc["counts"],
                    "authorized_pages": doc["authorized_pages"],
                    "top": doc["ranking"][:8],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    if args.out:
        from datetime import datetime, timezone

        out = Path(args.out)
        if not out.is_absolute():
            out = ROOT / out
        write_document(doc, out, generated_at=datetime.now(timezone.utc).isoformat())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
