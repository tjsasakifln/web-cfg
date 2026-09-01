#!/usr/bin/env python3
"""Validate and render the integrated commercial release measurement ledger."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LEDGER = (
    ROOT
    / "data"
    / "organic"
    / "experiments"
    / "integrated-commercial-release-2026-08-31"
    / "ledger.json"
)
DEFAULT_REPORT = (
    ROOT
    / "docs"
    / "measurement"
    / "INTEGRATED-COMMERCIAL-RELEASE-2026-08-31.md"
)
PAGE_CONTRACT = ROOT / "data" / "commercial" / "page-contract-eight.v1.json"
PROTECTION_PLAN = (
    ROOT / "data" / "bofu-dominance" / "frozen-specs" / "unlock-plan.v1.json"
)
EVENT_REGISTRY = ROOT / "netlify" / "functions" / "lib" / "event-registry.json"

MONEY_ROUTES = [
    "/servicos-obras-publicas/",
    "/diagnostico-b2g-expansao/",
    "/bid-room-licitacoes-obras/",
    "/defesa-margem-contratos-publicos/",
    "/atrasos-prorrogacao-obras-publicas/",
    "/defesa-tecnica-contratos-publicos/",
    "/acompanhamento-contratos-obras/",
    "/diretoria-b2g/",
]
OFFER_LADDER_ROUTES = [
    "/entregas/",
    "/casos/modelo-relatorio-inteligencia-licitacoes/",
    "/casos/modelo-base-quantitativa-canonica/",
    "/casos/modelo-apresentacao-executiva-resultados/",
    "/casos/modelo-mapa-compradores-publicos/",
    "/casos/modelo-contratos-vincendos-relicitacao/",
    "/casos/modelo-mapeamento-concorrentes-publicos/",
    "/casos/modelo-painel-precos-obras-publicas/",
    "/casos/modelo-relatorio-executivo-consolidado/",
]
MISSING_PRIMARY_CTA_ROUTES = {
    "/atrasos-prorrogacao-obras-publicas/",
    "/defesa-tecnica-contratos-publicos/",
    "/acompanhamento-contratos-obras/",
}
TERMINAL_DECISIONS = ["REPEAT", "CHANGE", "STOP", "INSUFFICIENT_EVIDENCE"]


def _json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def _verify_git_commit(sha: str) -> None:
    _check(
        len(sha) == 40 and all(character in "0123456789abcdef" for character in sha),
        "treatment SHA must be 40 lowercase hexadecimal characters",
    )
    try:
        subprocess.run(
            ["git", "cat-file", "-e", f"{sha}^{{commit}}"],
            cwd=ROOT,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except subprocess.CalledProcessError as error:
        raise ValueError(f"treatment SHA does not resolve to a commit: {sha}") from error


def _normalized_text(value: str) -> str:
    return " ".join(str(value or "").split())


class _BaselineHtmlParser(HTMLParser):
    """Extract only the literal CTA/form evidence frozen by this ledger."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.body_attrs: dict[str, str] = {}
        self.anchors: list[dict[str, Any]] = []
        self.forms: list[dict[str, Any]] = []
        self.visible_text: list[str] = []
        self._anchor: dict[str, Any] | None = None
        self._form: dict[str, Any] | None = None
        self._submit_text: list[str] | None = None
        self._containers: list[dict[str, Any]] = []
        self._heading_text: list[str] | None = None
        self._hidden_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: str(value or "") for key, value in attrs}
        if tag in {"script", "style", "template"}:
            self._hidden_depth += 1
        if tag == "body":
            self.body_attrs = values
        if tag in {"section", "article", "div"}:
            self._containers.append({"tag": tag, "headings": []})
        if tag in {"h2", "h3"}:
            self._heading_text = []
        if tag == "a":
            self._anchor = {"attrs": values, "text": []}
        if tag == "form":
            associated_heading = ""
            for container in reversed(self._containers):
                if container["headings"]:
                    associated_heading = container["headings"][0]
                    break
            self._form = {
                "attrs": values,
                "submit_label": "",
                "associated_heading": associated_heading,
            }
        if tag == "button" and self._form is not None and values.get("type", "submit") == "submit":
            self._submit_text = []
        if tag == "input" and self._form is not None and values.get("type") == "submit":
            self._form["submit_label"] = _normalized_text(values.get("value", ""))

    def handle_data(self, data: str) -> None:
        if self._hidden_depth == 0 and data.strip():
            self.visible_text.append(data)
        if self._anchor is not None:
            self._anchor["text"].append(data)
        if self._submit_text is not None:
            self._submit_text.append(data)
        if self._heading_text is not None:
            self._heading_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._anchor is not None:
            self._anchor["label"] = _normalized_text("".join(self._anchor.pop("text")))
            self.anchors.append(self._anchor)
            self._anchor = None
        if tag == "button" and self._form is not None and self._submit_text is not None:
            self._form["submit_label"] = _normalized_text("".join(self._submit_text))
            self._submit_text = None
        if tag == "form" and self._form is not None:
            self.forms.append(self._form)
            self._form = None
            self._submit_text = None
        if tag in {"h2", "h3"} and self._heading_text is not None:
            heading = _normalized_text("".join(self._heading_text))
            if heading:
                for container in self._containers:
                    container["headings"].append(heading)
            self._heading_text = None
        if tag in {"section", "article", "div"} and self._containers:
            for index in range(len(self._containers) - 1, -1, -1):
                if self._containers[index]["tag"] == tag:
                    del self._containers[index:]
                    break
        if tag in {"script", "style", "template"} and self._hidden_depth:
            self._hidden_depth -= 1

    @property
    def text(self) -> str:
        return _normalized_text(" ".join(self.visible_text))


def _normalized_destination(href: str) -> str:
    if "wa.me/" in href or "whatsapp.com/" in href:
        return "WHATSAPP_PREFILLED"
    return href


def _derived_primary_cta_contract(
    row: dict[str, Any],
    anchor: dict[str, Any],
    parser: _BaselineHtmlParser,
) -> tuple[str, dict[str, str] | str]:
    attrs = anchor["attrs"]
    destination = _normalized_destination(attrs.get("href", ""))
    named = attrs.get("data-event-name", "")
    if destination == "WHATSAPP_PREFILLED":
        event = "whatsapp_click"
    elif named in {"cta_click", "offer_cta_click", "service_cta_click"}:
        event = "cta_click"
    elif (
        row["route"] == "/servicos-obras-publicas/"
        and destination == "/medicoes-glosas-obras-publicas/"
    ):
        event = "content_to_service"
    else:
        return "UNKNOWN", "UNKNOWN_PENDING_550"

    props: dict[str, str] = {}
    cta_id = attrs.get("data-cta-id") or parser.body_attrs.get("data-cta-id") or ""
    if cta_id:
        props["cta_id"] = cta_id
    position = attrs.get("data-cta-position") or ""
    if position:
        props["cta_position"] = position
    for key in ("offer_id", "next_action_id"):
        value = attrs.get(f"data-{key.replace('_', '-')}") or ""
        if value:
            props[key] = value
    if event == "content_to_service":
        props["destination_path"] = destination
    return event, props


def _verify_route_semantics(row: dict[str, Any], html: bytes) -> None:
    parser = _BaselineHtmlParser()
    parser.feed(html.decode("utf-8"))
    expected_cta = row["current_cta_form_semantics"]["primary_cta"]
    candidates = [
        anchor
        for anchor in parser.anchors
        if _normalized_destination(anchor["attrs"].get("href", ""))
        == expected_cta["destination"]
    ]
    _check(candidates, f"pinned primary CTA destination missing for {row['route']}")
    matching = []
    for anchor in candidates:
        attrs = anchor["attrs"]
        observed_cta_id = (
            attrs.get("data-cta-id")
            or parser.body_attrs.get("data-cta-id")
            or "UNKNOWN"
        )
        observed_position = attrs.get("data-cta-position") or "UNKNOWN"
        if (
            anchor["label"] == expected_cta["label"]
            and observed_cta_id == expected_cta["cta_id"]
            and observed_position == expected_cta["position"]
        ):
            matching.append(anchor)
    _check(len(matching) == 1, f"pinned primary CTA semantics mismatch for {row['route']}")
    derived_event, derived_predicate = _derived_primary_cta_contract(
        row, matching[0], parser
    )
    availability = row["analytics_funnel_availability"]
    _check(
        availability["primary_cta_event"] == derived_event,
        f"pinned primary CTA event predicate mismatch for {row['route']}",
    )
    expected_predicate: dict[str, Any] | str = (
        {"props": derived_predicate}
        if isinstance(derived_predicate, dict)
        else derived_predicate
    )
    _check(
        availability["primary_cta_predicate"] == expected_predicate,
        f"pinned primary CTA property predicate mismatch for {row['route']}",
    )

    expected_form = row["current_cta_form_semantics"]["form"]
    forms = [
        form
        for form in parser.forms
        if form["attrs"].get("data-cta-id") == expected_form["cta_id"]
    ]
    _check(len(forms) == 1, f"pinned form identity mismatch for {row['route']}")
    observed_form = forms[0]
    _check(observed_form["attrs"].get("action") == expected_form["action"], f"pinned form action mismatch for {row['route']}")
    _check(observed_form["submit_label"] == expected_form["submit_label"], f"pinned form submit mismatch for {row['route']}")
    _check(observed_form["associated_heading"] == expected_form["heading"], f"pinned form heading mismatch for {row['route']}")


def load_ledger(path: Path = DEFAULT_LEDGER) -> dict[str, Any]:
    return _json(path)


def _current_offer_ladder_routes() -> list[str]:
    contract = _json(PAGE_CONTRACT)
    return [contract["package"]["hub_route"], *[row["route"] for row in contract["deliverables"]]]


def _protected_routes() -> set[str]:
    plan = _json(PROTECTION_PLAN)
    return {f"/{slug}/" for slug in plan["protected_pillars"]}


def validate_ledger(record: dict[str, Any]) -> None:
    _check(
        record.get("schema") == "confenge.release-bound-measurement-ledger/1.0",
        "unexpected ledger schema",
    )
    _check(record.get("version") == "1.0.0", "unexpected ledger version")
    _check(record["decision"]["execution_state"] == "EXECUTE_NOW", "execution state drift")
    _check(record["decision"]["outcome_state"] == "VALIDATE", "outcome state drift")

    guard = record["scope_guard"]
    _check(guard["measurement_only"] is True, "ledger must remain measurement-only")
    _check(guard["public_surface_mutation"] is False, "public mutation is forbidden")
    _check(guard["new_public_urls"] == 0, "public URL budget must remain zero")
    for forbidden in (
        "home_redesign",
        "mass_content",
        "analytics_payload_change",
        "gsc_freshness_authority_change",
        "bofu_ownership_projection_change",
        "query_strategy_from_censored_export",
        "protected_route_mutation",
        "unknown_to_zero",
        "combined_seo_conversion_score",
        "causal_claim_allowed",
    ):
        _check(guard[forbidden] is False, f"forbidden scope enabled: {forbidden}")
    _check(guard["instrumentation_gap_issue"] == 550, "instrumentation gap owner drift")

    binding = record["release_binding"]
    baseline = binding["baseline"]
    _check(baseline["origin_main_sha"] == baseline["public_live_sha"], "baseline live/main mismatch")
    _check(len(baseline["origin_main_sha"]) == 40, "baseline SHA must be full length")
    components = {row["ref"]: row for row in binding["candidate_components"]}
    _check(set(components) == {547, 548, 549}, "release component set drift")
    _check(components[547]["type"] == "issue", "#547 must remain explicitly issue-bound")
    _check(components[547]["head_sha"] == "UNKNOWN", "do not invent a #547 head")
    treatment = binding["treatment_anchor"]
    if treatment["status"] == "AWAITING_EXACT_PROMOTED_SHA":
        _check(treatment["exact_promoted_sha"] == "UNKNOWN", "awaiting treatment cannot claim a SHA")
        _check(treatment["promoted_at"] == "UNKNOWN", "awaiting treatment cannot claim a promotion time")
    else:
        _check(treatment["status"] == "PROMOTED_EXACT_SHA", "unknown treatment-anchor status")
        _verify_git_commit(treatment["exact_promoted_sha"])
        _event_time(treatment["promoted_at"])

    snapshot = record["manual_gsc_snapshot"]
    _check(snapshot["source_kind"] == "MANUAL_USER_EXPORT", "manual source label drift")
    _check(snapshot["date_range"] == {"start": "2026-08-02", "end": "2026-08-29", "complete_days": 28}, "GSC date range drift")
    _check(snapshot["site_level"]["clicks"] == 27, "site click baseline drift")
    _check(snapshot["site_level"]["impressions"] == 1201, "site impression baseline drift")
    _check(snapshot["query_privacy"]["visible_query_impressions"] == 52, "query privacy numerator drift")
    _check(snapshot["authority_boundary"]["canonical_freshness_owner_issue"] == 413, "GSC authority drift")
    _check(snapshot["authority_boundary"]["updates_canonical_gsc_authority"] is False, "manual snapshot cannot become freshness authority")

    cohorts = record["cohorts"]
    _check(cohorts["money_pages_528"]["routes"] == MONEY_ROUTES, "money-page cohort drift")
    _check(cohorts["offer_ladder_547"]["routes"] == OFFER_LADDER_ROUTES, "offer-ladder cohort drift")
    source_contract = cohorts["offer_ladder_547"]["source_contract_at_freeze"]
    _check(source_contract["path"] == "data/commercial/page-contract-eight.v1.json", "offer-ladder source path drift")
    _check(len(source_contract["file_sha256"]) == 64, "offer-ladder source hash must be frozen")
    expected_routes = MONEY_ROUTES + OFFER_LADDER_ROUTES
    _check(len(expected_routes) == 17, "expected cohort size drift")
    _check(len(set(expected_routes)) == 17, "cohort routes must be disjoint")

    route_rows = record["routes"]
    by_route = {row["route"]: row for row in route_rows}
    _check(len(route_rows) == len(by_route) == 17, "ledger must contain 17 unique route rows")
    _check(list(by_route) == expected_routes, "route order or membership drift")
    _check(set(by_route).isdisjoint(_protected_routes()), "cohort overlaps protected route registry")

    snapshot_id = snapshot["snapshot_id"]
    baseline_sha = baseline["public_live_sha"]
    missing_cta_routes: set[str] = set()
    for route, row in by_route.items():
        expected_cohort = "money_pages_528" if route in MONEY_ROUTES else "offer_ladder_547"
        _check(row["cohort"] == expected_cohort, f"wrong cohort assignment for {route}")
        _check((ROOT / row["file"]).is_file(), f"missing route source file: {row['file']}")
        _check(row["baseline_identity"]["live_sha"] == baseline_sha, f"live SHA drift for {route}")
        file_hash = row["baseline_identity"]["file_sha256"]
        _check(len(file_hash) == 64 and all(c in "0123456789abcdef" for c in file_hash), f"invalid SHA-256 for {route}")

        gsc = row["gsc_baseline"]
        _check(gsc["snapshot_id"] == snapshot_id, f"GSC snapshot drift for {route}")
        _check(gsc["date_range"] == {"start": "2026-08-02", "end": "2026-08-29"}, f"GSC dates drift for {route}")
        metrics = gsc["metrics"]
        if gsc["row_status"] == "NO_ROW_IN_EXPORT":
            _check(set(metrics.values()) == {"UNKNOWN"}, f"missing GSC row became numeric for {route}")
        else:
            _check(gsc["row_status"] == "MEASURED_ROW", f"unknown GSC row status for {route}")
            _check(all(isinstance(value, (int, float)) for value in metrics.values()), f"measured GSC row is incomplete for {route}")
            _check(metrics["impressions"] >= metrics["clicks"] >= 0, f"invalid GSC counts for {route}")
            expected_ctr = 0 if metrics["impressions"] == 0 else metrics["clicks"] / metrics["impressions"] * 100
            _check(abs(metrics["ctr_percent"] - expected_ctr) <= 0.01, f"GSC CTR does not match counts for {route}")

        protection = row["protection"]
        _check(protection == {"status": "NOT_PROTECTED", "profile": "cohort-not-protected-v1"}, f"protection declaration drift for {route}")
        semantics = row["current_cta_form_semantics"]
        _check(all(semantics["primary_cta"].values()), f"incomplete primary CTA baseline for {route}")
        _check(semantics["form"]["action"] == "/.netlify/functions/lead", f"lead action drift for {route}")
        _check(semantics["form"]["runtime_persistence_required"] is True, f"receipt must remain persistence-bound for {route}")

        analytics = row["analytics_funnel_availability"]
        _check(analytics["profile"] == "web-form-funnel-v1", f"analytics profile drift for {route}")
        if analytics["primary_cta_status"] == "MISSING_DECLARED_EVENT":
            _check(analytics["owner_issue"] == 550, f"missing CTA owner drift for {route}")
            _check(analytics["primary_cta_event"] == "UNKNOWN", f"missing CTA event invented for {route}")
            _check(analytics["primary_cta_source"] == "UNKNOWN_PENDING_550", f"missing CTA source drift for {route}")
            _check(analytics["primary_cta_predicate"] == "UNKNOWN_PENDING_550", f"missing CTA predicate drift for {route}")
            missing_cta_routes.add(route)
        else:
            _check(analytics["primary_cta_status"] == "AVAILABLE_RAW_EXACT_PREDICATE", f"unexpected CTA status for {route}")
            _check(analytics["primary_cta_event"] in {"content_to_service", "cta_click", "whatsapp_click"}, f"unknown CTA event for {route}")
            _check(analytics["primary_cta_source"] == "RAW_EVENTS_ONLY", f"primary CTA must use raw events for {route}")
            predicate = analytics["primary_cta_predicate"]
            _check(isinstance(predicate, dict) and predicate.get("props"), f"missing exact CTA predicate for {route}")
    _check(missing_cta_routes == MISSING_PRIMARY_CTA_ROUTES, "primary CTA gap set drift")

    analytics_profile = record["profiles"]["analytics"]["web-form-funnel-v1"]
    _check(analytics_profile["form_validation_category"]["owner_issue"] == 550, "validation category gap owner drift")
    _check(analytics_profile["receipt"]["event"] == "lead_persisted", "receipt denominator drift")
    _check(analytics_profile["downstream_qco"]["owner"] == "Warmbly", "QCO owner drift")
    events = _json(EVENT_REGISTRY)["events"]
    for event in ("page_view", "content_to_service", "cta_click", "whatsapp_click", "lead_form_start", "lead_form_error", "lead_form_submit", "lead_form_success", "lead_persisted", "qualified_lead"):
        _check(event in events, f"ledger references missing event: {event}")
    _check(events["qualified_lead"]["owner"] == "warmbly", "registry QCO owner drift")
    _check(events["qualified_lead"]["admission"] == "observed_only", "QCO must remain observed-only")

    post = record["post_release_observation"]
    _check(set(post["post_release_values"].values()) == {"UNKNOWN"}, "post-release values must remain UNKNOWN")
    gate = post["minimum_honest_observation_window"]["fixed_sufficiency_gate_per_cohort"]
    _check(gate["minimum_route_visits"] == 100, "route-visit threshold drift")
    _check(gate["minimum_observable_primary_cta_raw_events"] == 20, "CTA threshold drift")
    _check(record["terminal_decision"]["allowed"] == TERMINAL_DECISIONS, "terminal decision set drift")
    _check(record["protected_work"]["gsc_freshness_authority"] == 413, "#413 authority drift")
    _check(record["protected_work"]["bofu_ownership_projection"] == 545, "#545 authority drift")
    verify_baseline_files(record)


def _git_blob(commit: str, path: str) -> bytes:
    try:
        return subprocess.run(
            ["git", "show", f"{commit}:{path}"],
            cwd=ROOT,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        ).stdout
    except subprocess.CalledProcessError as error:
        raise ValueError(f"cannot read pinned git blob {commit}:{path}") from error


def verify_baseline_files(record: dict[str, Any]) -> None:
    """Verify frozen hashes and semantics against the baseline git tree."""

    baseline_sha = record["release_binding"]["baseline"]["origin_main_sha"]
    source_contract = record["cohorts"]["offer_ladder_547"]["source_contract_at_freeze"]
    contract_blob = _git_blob(baseline_sha, source_contract["path"])
    _check(
        hashlib.sha256(contract_blob).hexdigest() == source_contract["file_sha256"],
        "offer-ladder source contract hash mismatch",
    )
    for row in record["routes"]:
        blob = _git_blob(baseline_sha, row["file"])
        observed = hashlib.sha256(blob).hexdigest()
        _check(observed == row["baseline_identity"]["file_sha256"], f"baseline blob hash mismatch for {row['route']}")
        _verify_route_semantics(row, blob)


def current_offer_contract_comparison(record: dict[str, Any]) -> dict[str, Any]:
    """Report contemporary contract drift without rewriting historical membership."""

    current = _current_offer_ladder_routes()
    frozen = record["cohorts"]["offer_ladder_547"]["routes"]
    return {
        "status": "MATCHES_FROZEN" if current == frozen else "DRIFT_REPORTED_NOT_REWRITTEN",
        "frozen_routes": frozen,
        "current_routes": current,
        "added": [route for route in current if route not in frozen],
        "removed": [route for route in frozen if route not in current],
    }


def _event_time(value: str) -> datetime:
    raw = str(value or "").strip()
    if len(raw) == 10:
        raw = f"{raw}T00:00:00+00:00"
    elif raw.endswith("Z"):
        raw = f"{raw[:-1]}+00:00"
    parsed = datetime.fromisoformat(raw)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _event_path(event: dict[str, Any]) -> str:
    props = event.get("props") or {}
    path = str(props.get("page_path") or event.get("path") or "/").split("?", 1)[0]
    if not path.startswith("/"):
        path = f"/{path}"
    if path != "/" and not path.endswith("/"):
        path = f"{path}/"
    return path


def _matches_primary_cta(row: dict[str, Any], event: dict[str, Any]) -> bool:
    availability = row["analytics_funnel_availability"]
    if availability["primary_cta_status"] != "AVAILABLE_RAW_EXACT_PREDICATE":
        return False
    if event.get("event") != availability["primary_cta_event"]:
        return False
    props = event.get("props") or {}
    expected_props = availability["primary_cta_predicate"]["props"]
    return all(str(props.get(key, "")) == str(value) for key, value in expected_props.items())


def extract_observation(
    record: dict[str, Any],
    events: list[dict[str, Any]],
    window_start: str,
    window_end_exclusive: str,
    *,
    input_complete: bool,
    treatment_sha: str,
    stable_treatment: bool,
) -> dict[str, Any]:
    """Extract cohort metrics from accepted raw events using frozen predicates."""

    _check(input_complete, "raw event completeness must be explicitly asserted; otherwise counts stay UNKNOWN")
    _check(stable_treatment, "one stable treatment segment must be explicitly asserted")
    treatment = record["release_binding"]["treatment_anchor"]
    _check(treatment["status"] == "PROMOTED_EXACT_SHA", "observation is blocked until the ledger records one exact promoted treatment")
    _check(treatment["exact_promoted_sha"] == treatment_sha, "observation treatment SHA does not match the ledger anchor")
    _verify_git_commit(treatment_sha)
    promoted_at = _event_time(treatment["promoted_at"])
    start = _event_time(window_start)
    end = _event_time(window_end_exclusive)
    _check(end > start, "observation end must be after start")
    _check(start >= promoted_at, "observation window cannot start before treatment promotion")
    complete_days = (end - start).total_seconds() / 86400
    by_route = {row["route"]: row for row in record["routes"]}
    counters: dict[str, dict[str, Any]] = {}
    for route, row in by_route.items():
        primary: int | str = 0
        if row["analytics_funnel_availability"]["primary_cta_status"] != "AVAILABLE_RAW_EXACT_PREDICATE":
            primary = "UNKNOWN_UNOBSERVABLE"
        counters[route] = {
            "route_visit": 0,
            "primary_cta": primary,
            "form_start": 0,
            "form_validation": {"total": 0, "by_category": {}},
            "submit": 0,
            "receipt": 0,
        }

    seen_event_ids: set[str] = set()
    accepted_events = 0
    for event in events:
        try:
            occurred_at = _event_time(str(event.get("ts") or ""))
        except (TypeError, ValueError):
            continue
        if not (start <= occurred_at < end):
            continue
        route = _event_path(event)
        row = by_route.get(route)
        if row is None:
            continue
        props = event.get("props") or {}
        event_id = str(props.get("event_id") or "")
        if event_id:
            if event_id in seen_event_ids:
                continue
            seen_event_ids.add(event_id)
        accepted_events += 1
        event_name = str(event.get("event") or "")
        route_counts = counters[route]
        if event_name == "page_view":
            route_counts["route_visit"] += 1
        if _matches_primary_cta(row, event):
            _check(isinstance(route_counts["primary_cta"], int), f"unobservable CTA became countable for {route}")
            route_counts["primary_cta"] += 1
        if event_name == "lead_form_start":
            route_counts["form_start"] += 1
        if event_name == "lead_form_error":
            route_counts["form_validation"]["total"] += 1
            category = str(
                props.get("validation_category")
                or props.get("error_code")
                or "UNKNOWN_CATEGORY"
            )[:40]
            categories = route_counts["form_validation"]["by_category"]
            categories[category] = categories.get(category, 0) + 1
        if event_name == "lead_form_submit":
            route_counts["submit"] += 1
        if event_name == "lead_persisted":
            route_counts["receipt"] += 1

    cohort_results: dict[str, Any] = {}
    threshold = record["post_release_observation"]["minimum_honest_observation_window"][
        "fixed_sufficiency_gate_per_cohort"
    ]
    for cohort_id, cohort in record["cohorts"].items():
        cohort_rows = [counters[route] for route in cohort["routes"]]
        primary_values = [row["primary_cta"] for row in cohort_rows]
        coverage_complete = all(isinstance(value, int) for value in primary_values)
        primary_total: int | str = (
            sum(primary_values) if coverage_complete else "UNKNOWN_INCOMPLETE_COVERAGE"
        )
        route_total = sum(row["route_visit"] for row in cohort_rows)
        cohort_results[cohort_id] = {
            "route_visit": route_total,
            "primary_cta": primary_total,
            "primary_cta_semantic_coverage_complete": coverage_complete,
            "form_start": sum(row["form_start"] for row in cohort_rows),
            "submit": sum(row["submit"] for row in cohort_rows),
            "receipt": sum(row["receipt"] for row in cohort_rows),
            "fixed_sufficiency_gate": {
                "minimum_window": complete_days >= record["post_release_observation"]["minimum_honest_observation_window"]["complete_days"],
                "route_visit": route_total >= threshold["minimum_route_visits"],
                "primary_cta": coverage_complete
                and int(primary_total) >= threshold["minimum_observable_primary_cta_raw_events"],
                "semantic_coverage": coverage_complete,
            },
        }
        gate = cohort_results[cohort_id]["fixed_sufficiency_gate"]
        gate["passed"] = all(gate.values())

    return {
        "schema": "confenge.release-observation-extract/1.0",
        "ledger_id": record["ledger_id"],
        "source": "ACCEPTED_RAW_EVENTS_EXACT_PREDICATES",
        "input_completeness": "OPERATOR_ASSERTED_COMPLETE",
        "treatment": {
            "exact_promoted_sha": treatment_sha,
            "promoted_at": treatment["promoted_at"],
            "stability": "OPERATOR_ASSERTED_SINGLE_TREATMENT",
        },
        "window": {
            "start_inclusive": start.isoformat().replace("+00:00", "Z"),
            "end_exclusive": end.isoformat().replace("+00:00", "Z"),
            "complete_days": complete_days,
        },
        "accepted_cohort_events": accepted_events,
        "routes": counters,
        "cohorts": cohort_results,
        "serp_exposure": "SEPARATE_GSC_INPUT_REQUIRED",
        "downstream_qco": "UNKNOWN_EXTERNAL_WARMBLY_OBSERVATION_REQUIRED",
        "causal_claim": "FORBIDDEN",
    }


def load_raw_events(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return [json.loads(line) for line in text.splitlines() if line.strip()]
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict) and isinstance(parsed.get("events"), list):
        return parsed["events"]
    raise ValueError("raw event input must be a JSON list, an {events: []} object, or NDJSON")


def _gsc_cell(row: dict[str, Any]) -> str:
    gsc = row["gsc_baseline"]
    if gsc["row_status"] == "NO_ROW_IN_EXPORT":
        return "NO_ROW_IN_EXPORT (UNKNOWN)"
    metrics = gsc["metrics"]
    return f"{metrics['clicks']} / {metrics['impressions']} / {metrics['ctr_percent']}% / {metrics['position']}"


def render_report(record: dict[str, Any]) -> str:
    baseline = record["release_binding"]["baseline"]
    treatment = record["release_binding"]["treatment_anchor"]
    snapshot = record["manual_gsc_snapshot"]
    if treatment["status"] == "PROMOTED_EXACT_SHA":
        treatment_summary = (
            f"The bound treatment is exact public SHA `{treatment['exact_promoted_sha']}`, "
            f"promoted at `{treatment['promoted_at']}`. Post-release extracts must match this SHA "
            "and assert one stable treatment segment."
        )
    else:
        treatment_summary = (
            "The treatment SHA and promotion timestamp are **UNKNOWN** until one public build "
            "contains the accepted #548 and #549 changes plus an implementation satisfying #547."
        )
    lines = [
        "# Integrated commercial release measurement ledger",
        "",
        "> Generated from `data/organic/experiments/integrated-commercial-release-2026-08-31/ledger.json`. Edit the ledger, not this report.",
        "",
        "## Frozen release boundary",
        "",
        f"The pre-release baseline is `origin/main = public live = {baseline['public_live_sha']}` as observed at `{baseline['observed_at']}`. {treatment_summary}",
        "",
        "PR heads are component evidence only. They are never substituted for the exact promoted SHA:",
        "",
        "| Ref | Kind | State at freeze | Head | Role |",
        "|---|---|---|---|---|",
    ]
    for component in record["release_binding"]["candidate_components"]:
        lines.append(
            f"| #{component['ref']} | {component['type']} | {component['state']} | `{component['head_sha']}` | {component['role']} |"
        )

    lines.extend(
        [
            "",
            "## Manual Search Console baseline",
            "",
            f"Source: {snapshot['source']}. Range: `{snapshot['date_range']['start']}` through `{snapshot['date_range']['end']}` (Web, 28 days). This does not update the durable freshness authority owned by #413.",
            "",
            f"Site context: **{snapshot['site_level']['clicks']} clicks / {snapshot['site_level']['impressions']} impressions / {snapshot['site_level']['ctr_percent']}% CTR / {snapshot['site_level']['impression_weighted_daily_average_position']} weighted daily position**.",
            "",
            f"Only {snapshot['query_privacy']['visible_query_impressions']} of {snapshot['query_privacy']['site_impressions']} impressions ({snapshot['query_privacy']['visible_share_percent']}%) appear in the query export. The visible queries are not the query universe. The two weekly samples are context, not a trend.",
            "",
            "A page absent from the export is `NO_ROW_IN_EXPORT`; its clicks, impressions, CTR and position remain `UNKNOWN`, never zero.",
            "",
            "Cohort membership is frozen locally in the ledger. `page-contract-eight.v1.json` matched the nine-route offer cohort at freeze time; later contract drift is reported separately and never rewrites this historical cohort.",
            "",
            "## Route-level frozen baseline",
            "",
            "GSC cells are `clicks / impressions / CTR / position`.",
            "",
            "| Cohort | Route | GSC page row | Current primary CTA | Primary CTA event | Current form submit | Protection |",
            "|---|---|---|---|---|---|---|",
        ]
    )
    for row in record["routes"]:
        cta = row["current_cta_form_semantics"]["primary_cta"]
        form = row["current_cta_form_semantics"]["form"]
        analytics = row["analytics_funnel_availability"]
        event = analytics["primary_cta_event"]
        if event == "UNKNOWN":
            event = "UNKNOWN (#550)"
        lines.append(
            f"| `{row['cohort']}` | `{row['route']}` | {_gsc_cell(row)} | {cta['label']} → `{cta['destination']}` | `{event}` | {form['submit_label']} | {row['protection']['status']} |"
        )

    profile = record["profiles"]["analytics"]["web-form-funnel-v1"]
    window = record["post_release_observation"]["minimum_honest_observation_window"]
    gate = window["fixed_sufficiency_gate_per_cohort"]
    lines.extend(
        [
            "",
            "## Funnel availability",
            "",
            "| Stage | Availability | Canonical event / owner | Interpretation |",
            "|---|---|---|---|",
            f"| Route visit | {profile['route_visit']['status']} | `{profile['route_visit']['event']}` | Denominator, not a lead |",
            f"| Primary CTA | Exact raw-event predicate per route; 3 routes incomplete | `content_to_service`, `cta_click`, or `whatsapp_click` | Route aggregates are forbidden; #550 owns the missing hash-CTA semantic |",
            f"| Form start | {profile['form_start']['status']} | `{profile['form_start']['event']}` | Engagement |",
            f"| Validation category | {profile['form_validation_category']['status']} | `{profile['form_validation_category']['event']}` | Ordinary client-validation category is missing; #550 owns the gap |",
            f"| Submit | {profile['submit']['status']} | `{profile['submit']['event']}` | Attempt, not persistence |",
            f"| Receipt | {profile['receipt']['status']} | `{profile['receipt']['event']}` | Persisted lead denominator, not QCO |",
            f"| QCO and downstream | {profile['downstream_qco']['status']} | Warmbly | Missing/unmatchable evidence remains UNKNOWN |",
            "",
            "No route-level analytics counts were supplied for the pre-release period. Their baseline values are `UNKNOWN_NOT_EXPORTED`; event availability is not a zero count and later counts cannot become an uplift claim by subtraction.",
            "",
            "## Post-release observation contract",
            "",
            "- Technical smoke: exact-SHA identity, all 17 routes, CTA/form presence, D01/ladder truth, `CONFENGE_WEB`, consent, Turnstile, idempotency, receipt and PII rejection within 24 hours.",
            "- First read: after 7 complete days on a stable treatment, for data quality and directional progression only.",
            f"- Minimum honest decision window: {window['complete_days']} complete days, at least {gate['minimum_route_visits']} route visits and {gate['minimum_observable_primary_cta_raw_events']} exact-predicate raw primary CTA events **per cohort**. These are sufficiency gates, not effect or success thresholds.",
            "- Money pages and offer-ladder pages remain separate cohorts. SERP exposure remains context only and is never combined with conversion into one score.",
            "- Any later SHA touching a cohort route or shared CTA/form/offer contract must be logged and segmented or must end the window.",
            "- The extractor remains blocked while the treatment anchor is UNKNOWN. After promotion it requires the matching exact SHA plus an explicit single-treatment stability assertion, emits that SHA and promotion time, and accepts only an explicitly asserted-complete raw-event export with an inclusive UTC start and exclusive UTC end; without those bindings it fails closed instead of returning zeros. Its per-route predicates exclude final CTAs and submit-side CTA aliases from the primary-CTA gate.",
            "",
            "## Terminal decision",
            "",
        ]
    )
    for decision in TERMINAL_DECISIONS:
        lines.append(f"- **{decision}:** {record['terminal_decision']['predeclared_rules'][decision]}")
    lines.extend(
        [
            "",
            "Thresholds, windows and decision rules are frozen before promotion. Tiny-sample CTR movement, visible-query rows, clicks, form submissions or receipts cannot prove causality, ROI, QCO, proposal, contract or margin.",
            "",
            "## Ownership, protection and rollback",
            "",
            "`web-cfg` owns public acquisition, capture and PII-free analytics. `extra-cli` owns facts/identity/provenance through SELECT-only contracts. Warmbly owns commercial action and downstream outcomes. Issues #126, #127, #128, #327, #387 and #529 remain protected; this ledger neither resets nor releases them. #413 remains the GSC freshness authority and #545 remains the BOFU ownership projection.",
            "",
            "Rollback this ledger, validator and report together. A later public treatment rollback must preserve this frozen baseline and all observation history.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ledger", type=Path, default=DEFAULT_LEDGER)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--write-report", action="store_true")
    parser.add_argument("--check-report", action="store_true")
    parser.add_argument("--events-file", type=Path)
    parser.add_argument("--window-start")
    parser.add_argument("--window-end-exclusive")
    parser.add_argument("--treatment-sha")
    parser.add_argument("--assert-complete-raw-export", action="store_true")
    parser.add_argument("--assert-stable-treatment", action="store_true")
    parser.add_argument("--observation-out", type=Path)
    args = parser.parse_args()

    record = load_ledger(args.ledger)
    validate_ledger(record)
    rendered = render_report(record)
    if args.write_report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(rendered, encoding="utf-8")
    if args.check_report:
        _check(args.report.is_file(), f"missing generated report: {args.report}")
        _check(args.report.read_text(encoding="utf-8") == rendered, "generated report is stale")
    extraction_args = (
        args.events_file,
        args.window_start,
        args.window_end_exclusive,
        args.treatment_sha,
    )
    if any(extraction_args):
        _check(
            all(extraction_args),
            "events extraction requires --events-file, --window-start, --window-end-exclusive and --treatment-sha",
        )
        observation = extract_observation(
            record,
            load_raw_events(args.events_file),
            args.window_start,
            args.window_end_exclusive,
            input_complete=args.assert_complete_raw_export,
            treatment_sha=args.treatment_sha,
            stable_treatment=args.assert_stable_treatment,
        )
        serialized = json.dumps(observation, ensure_ascii=False, indent=2) + "\n"
        if args.observation_out:
            args.observation_out.parent.mkdir(parents=True, exist_ok=True)
            args.observation_out.write_text(serialized, encoding="utf-8")
        else:
            print(serialized, end="")
    contract_status = current_offer_contract_comparison(record)["status"]
    print(
        "OK integrated commercial release ledger: "
        f"{len(record['routes'])} routes, baseline {record['release_binding']['baseline']['public_live_sha']}, "
        f"current_offer_contract={contract_status}",
        file=sys.stderr if args.events_file and not args.observation_out else sys.stdout,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
