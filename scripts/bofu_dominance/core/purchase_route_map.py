"""Purchase-to-route matcher over the existing public intent families.

This layer does not replace the 15-family BOFU projection and does not create a
second taxonomy. Corporate intent-family IDs and commercial-consumer offer IDs
stay as declared in CONFENGE_PUBLIC_INTENT_MATRIX/1.0.0.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from scripts.bofu_dominance.core.buyer_decision_map import (
    PROTECTED_ROUTES,
    MapValidationReport,
    _read_json,
    _route_file,
    _route_from_url,
)
from scripts.bofu_dominance.core.constants import (
    PURCHASE_ROUTE_MAP_PATH,
    PURCHASE_ROUTE_MAP_SCHEMA,
    ROOT,
)

PUBLIC_ORIGIN = "https://confenge.com.br"
PAGE_KINDS = ("serviço", "conteúdo de decisão", "prova", "ferramenta", "hub")
BUSINESS_CONTEXTS = ("public", "private", "mixed", "unknown")
DECISIONS = ("KEEP", "ENRICH", "CREATE", "MERGE", "REDIRECT", "RETIRE")
REQUIRED_PURCHASE_FIELDS = (
    "purchase_id",
    "campaign_owner",
    "visitor_job",
    "seed_query_hypothesis",
    "intent_family",
    "offer_id",
    "page_kind",
    "question_answered",
    "business_context",
    "primary_url",
    "proposed_primary_url",
    "source_of_truth",
    "requested_alias",
    "supporting_urls",
    "required_proof",
    "terminal_contact",
    "decision",
    "function_differentiation",
    "requested_indexability",
    "release_unit",
    "publication_cohort",
    "contact_mode",
)
GENERIC_CONTACT_PATHS = {
    "/",
    "/contato",
    "/contato/",
    "/#contato",
    "/triagem-tecnica/",
    "/triagem-tecnica",
}
GENERIC_CONTACT_HOST_PATHS = {
    f"{PUBLIC_ORIGIN}/",
    f"{PUBLIC_ORIGIN}/contato/",
    f"{PUBLIC_ORIGIN}/#contato",
    f"{PUBLIC_ORIGIN}/triagem-tecnica/",
}
OBSOLETE_MATURITY_TOKENS = (
    "obsolete_maturity_inventory",
    "maturity_inventory",
    "inventário de maturidade",
    "inventario de maturidade",
    "maturity census",
    "censo de maturidade",
)
MATERIAL_NOINDEX_CODES = {
    "commercial_surface_deferred",
    "cnpj_individual_result",
    "share_token",
    "ops_private",
    "fixture_synthetic",
    "editorial_disposition_hold",
    "pending_named_human_approval",
    "transactional_exit",
    "commercial_transactional_form",
    "fixture_preview_staging",
    "pending_founder_hash_approval",
    "post_transaction_state",
    "http_status_page",
    "deferred_by_decision_record",
    "market_answer_freshness_stale",
    "pseo_publication_gate_unmet",
    "syndication_kit_permalink",
    "editorial_source_verification_failed",
    "archetype_evidence_incomplete",
    "pending_hash_bound_index_approval",
}
CORPORATE_INTENT_CONTRACT = "CONFENGE_PUBLIC_INTENT_MATRIX/1.0.0"
TOKEN_RE = re.compile(r"[a-z0-9à-ú]+", re.IGNORECASE)
STOPWORDS = {
    "a",
    "as",
    "o",
    "os",
    "de",
    "da",
    "do",
    "das",
    "dos",
    "e",
    "em",
    "para",
    "com",
    "uma",
    "um",
    "que",
    "ou",
    "na",
    "no",
    "por",
    "the",
    "and",
    "of",
    "como",
    "qual",
    "quais",
    "deste",
    "neste",
    "antes",
    "obra",
    "obras",
    "pública",
    "publico",
    "público",
    "públicas",
    "publicas",
    "serviço",
    "serviços",
    "engenharia",
    "entrega",
    "estrutura",
    "contrato",
    "contratual",
    "técnico",
    "tecnica",
    "técnica",
    "projetos",
    "projeto",
}


@dataclass
class RouteFacts:
    path: str
    exists: bool = False
    robots: str | None = None
    canonical: str | None = None
    public_family_id: str | None = None
    noindex_reason_code: str | None = None
    noindex_reason_note: str | None = None
    next_hops: list[str] = field(default_factory=list)
    robots_txt_disallow: bool = False


def _strip_fragment(path: str) -> str:
    return str(path or "").split("#", 1)[0].split("?", 1)[0]


def normalize_path(value: str) -> str:
    raw = str(value or "").strip()
    if raw.startswith("http://") or raw.startswith("https://"):
        parsed = urlparse(raw)
        raw = parsed.path or "/"
    raw = _strip_fragment(raw)
    if not raw:
        return "/"
    if not raw.startswith("/"):
        raw = "/" + raw
    if raw != "/" and not raw.endswith("/"):
        raw += "/"
    return raw


def _path_exists(root: Path, path: str) -> bool:
    route = normalize_path(_strip_fragment(path))
    return _route_file(root, route).is_file()


def _meta_content(html: str, name: str) -> str | None:
    pattern = rf'<meta[^>]+name=["\']{name}["\'][^>]+content=["\']([^"\']+)["\']'
    match = re.search(pattern, html, flags=re.IGNORECASE)
    if match:
        return match.group(1).strip()
    pattern = rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']{name}["\']'
    match = re.search(pattern, html, flags=re.IGNORECASE)
    return match.group(1).strip() if match else None


def _canonical_href(html: str) -> str | None:
    match = re.search(
        r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']',
        html,
        flags=re.IGNORECASE,
    )
    if match:
        return match.group(1).strip()
    match = re.search(
        r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']canonical["\']',
        html,
        flags=re.IGNORECASE,
    )
    return match.group(1).strip() if match else None


def _parse_robots_txt_disallows(text: str) -> set[str]:
    disallowed: set[str] = set()
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith("disallow:"):
            value = stripped.split(":", 1)[1].strip()
            if value:
                disallowed.add(normalize_path(value) if value != "/" else value)
    return disallowed


def _path_disallowed(path: str, disallows: set[str]) -> bool:
    route = normalize_path(path)
    for rule in disallows:
        if not rule or rule == "/":
            continue
        candidate = rule if rule.endswith("/") else rule + "/"
        if route == candidate or route.startswith(candidate):
            return True
    return False


def _bofu_canonical_routes(matrix: dict[str, Any]) -> set[str]:
    routes: set[str] = set()
    for row in matrix.get("rows") or []:
        if isinstance(row, dict) and row.get("canonical_service_route"):
            routes.add(normalize_path(str(row["canonical_service_route"])))
    return routes


def resolve_public_family(
    path: str,
    registry: dict[str, Any],
    bofu_canonical: set[str],
) -> str | None:
    route = normalize_path(path)
    families = [item for item in registry.get("families") or [] if isinstance(item, dict)]
    for family in families:
        match = family.get("match") or {}
        for declared in match.get("routes") or []:
            if normalize_path(str(declared)) == route:
                return str(family.get("id"))
    for family in families:
        match = family.get("match") or {}
        prefix = match.get("prefix")
        if prefix and route.startswith(str(prefix)):
            return str(family.get("id"))
    source = None
    for family in families:
        match = family.get("match") or {}
        if match.get("source") == "data/organic/bofu-intent-matrix.json#rows[].canonical_service_route":
            source = family
            break
    if source and route in bofu_canonical:
        return str(source.get("id"))
    return None


def _noindex_by_family(governance: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(item.get("family_id")): item
        for item in governance.get("families") or []
        if isinstance(item, dict) and item.get("family_id")
    }


def collect_route_inventory(
    root: Path,
    paths: list[str],
    *,
    public_families: dict[str, Any] | None = None,
    noindex_governance: dict[str, Any] | None = None,
    bofu_matrix: dict[str, Any] | None = None,
    robots_txt: str | None = None,
    html_by_path: dict[str, str] | None = None,
) -> dict[str, RouteFacts]:
    """Build route facts for declared paths. Tests may inject html/robots."""
    registry = public_families if public_families is not None else _read_json(
        root / "data/organic/public-family-registry.json"
    )
    governance = noindex_governance if noindex_governance is not None else _read_json(
        root / "data/organic/noindex-governance-registry.json"
    )
    matrix = bofu_matrix if bofu_matrix is not None else _read_json(
        root / "data/organic/bofu-intent-matrix.json"
    )
    robots_source = robots_txt
    if robots_source is None:
        robots_path = root / "robots.txt"
        robots_source = robots_path.read_text(encoding="utf-8") if robots_path.is_file() else ""
    disallows = _parse_robots_txt_disallows(robots_source)
    bofu_canonical = _bofu_canonical_routes(matrix)
    noindex_map = _noindex_by_family(governance)
    inventory: dict[str, RouteFacts] = {}
    for raw in paths:
        route = normalize_path(raw)
        if route in inventory:
            continue
        html_path = _route_file(root, route)
        exists = html_path.is_file()
        html = None
        if html_by_path is not None and route in html_by_path:
            html = html_by_path[route]
            exists = True
        elif exists:
            html = html_path.read_text(encoding="utf-8")
        family_id = resolve_public_family(route, registry, bofu_canonical)
        gov = noindex_map.get(family_id or "")
        facts = RouteFacts(
            path=route,
            exists=exists,
            public_family_id=family_id,
            noindex_reason_code=(gov or {}).get("reason_code"),
            noindex_reason_note=(gov or {}).get("note"),
            robots_txt_disallow=_path_disallowed(route, disallows),
        )
        if html:
            facts.robots = _meta_content(html, "robots")
            facts.canonical = _canonical_href(html)
            hrefs = re.findall(r'href=["\']([^"\']+)["\']', html, flags=re.IGNORECASE)
            facts.next_hops = hrefs
        inventory[route] = facts
    return inventory


def load_purchase_route_map(
    root: Path = ROOT,
    document: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if document is not None:
        return document
    return _read_json(root / PURCHASE_ROUTE_MAP_PATH.relative_to(ROOT))


def project_intent_route_table(
    document: dict[str, Any] | None = None,
    root: Path = ROOT,
) -> list[dict[str, Any]]:
    """Consumable intent/route table for INB-10. Campaign folders are not a source."""
    doc = load_purchase_route_map(root, document)
    rows: list[dict[str, Any]] = []
    for item in doc.get("purchases") or []:
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "purchase_id": item.get("purchase_id"),
                "intent_family": item.get("intent_family"),
                "offer_id": item.get("offer_id"),
                "path": item.get("proposed_primary_url") or item.get("primary_url"),
                "current_path": item.get("primary_url"),
                "kind": item.get("page_kind"),
                "question_answered": item.get("question_answered"),
                "business_context": item.get("business_context"),
                "decision": item.get("decision"),
                "source_of_truth": item.get("source_of_truth"),
                "requested_alias": item.get("requested_alias"),
                "canonical": item.get("canonical")
                or f"{PUBLIC_ORIGIN}{normalize_path(str(item.get('source_of_truth') or item.get('primary_url') or '/'))}",
                "requested_indexability": item.get("requested_indexability"),
                "release_unit": item.get("release_unit"),
                "contact_mode": item.get("contact_mode"),
                "campaign_owner": item.get("campaign_owner"),
                "publication_cohort": item.get("publication_cohort"),
                "b2g_protected": bool(item.get("b2g_protected")),
                "function_differentiation": item.get("function_differentiation"),
            }
        )
    return rows


def _intent_ids(matrix: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(item.get("intent_family")): item
        for item in matrix.get("intent_families") or []
        if isinstance(item, dict) and item.get("intent_family")
    }


def _offer_ids_for_family(family: dict[str, Any] | None) -> set[str]:
    if not family:
        return set()
    return {str(item) for item in family.get("offer_ids") or []}


def _is_generic_contact(value: str) -> bool:
    text = str(value or "").strip()
    if not text:
        return True
    if text in GENERIC_CONTACT_PATHS or text in GENERIC_CONTACT_HOST_PATHS:
        return True
    lowered = text.casefold()
    if lowered.startswith("https://wa.me/") and "text=" not in lowered:
        return True
    if lowered.startswith("mailto:") and "subject=" not in lowered:
        return True
    route = normalize_path(text)
    if route in {"/", "/contato/", "/triagem-tecnica/"} and "#" not in text:
        return True
    return False


def _tokens(text: str) -> set[str]:
    return {
        token.casefold()
        for token in TOKEN_RE.findall(str(text or ""))
        if token.casefold() not in STOPWORDS and len(token) > 3
    }


def _commercial_surfaces(row: dict[str, Any]) -> list[dict[str, str]]:
    declared = row.get("commercial_surfaces")
    if isinstance(declared, list) and declared:
        return [item for item in declared if isinstance(item, dict) and item.get("url")]
    if row.get("page_kind") == "serviço" and row.get("decision") in {"KEEP", "ENRICH"}:
        url = str(row.get("source_of_truth") or row.get("primary_url") or "")
        if url and "#" not in url:
            return [
                {
                    "url": url,
                    "function": str(row.get("function_differentiation") or ""),
                }
            ]
    return []


def _quality_allows_zero_impressions(row: dict[str, Any]) -> bool:
    state = str(row.get("quality_state") or "")
    return state in {
        "PASS",
        "PASS_PENDING_PUBLICATION",
        "EXISTING_COMPLETE",
        "CREATE_CONTRACTED",
    }


def _obsolete_maturity_only(facts: RouteFacts | None) -> bool:
    if facts is None:
        return False
    code = str(facts.noindex_reason_code or "").casefold()
    note = str(facts.noindex_reason_note or "").casefold()
    if facts.noindex_reason_code in MATERIAL_NOINDEX_CODES:
        return False
    haystack = f"{code} {note}"
    return any(token in haystack for token in OBSOLETE_MATURITY_TOKENS)


def _robots_noindex(value: str | None) -> bool:
    return "noindex" in str(value or "").casefold()


def _index_requested(value: str | None) -> bool:
    text = str(value or "").casefold()
    return text.startswith("index") and "noindex" not in text


def validate_purchase_route_map(
    root: Path = ROOT,
    document: dict[str, Any] | None = None,
    *,
    inventory: dict[str, RouteFacts] | None = None,
    intent_matrix: dict[str, Any] | None = None,
    public_families: dict[str, Any] | None = None,
    noindex_governance: dict[str, Any] | None = None,
    bofu_matrix: dict[str, Any] | None = None,
) -> MapValidationReport:
    """Fail-closed purchase matcher. Warnings never exclude a page by themselves."""
    report = MapValidationReport()
    try:
        doc = load_purchase_route_map(root, document)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        report.add("purchase-route-map", "purchase_map_unreadable", str(exc))
        return report

    if doc.get("schema_version") != PURCHASE_ROUTE_MAP_SCHEMA:
        report.add(
            "schema_version",
            "purchase_map_schema_invalid",
            str(doc.get("schema_version")),
        )
    if doc.get("intent_contract") != CORPORATE_INTENT_CONTRACT:
        report.add(
            "intent_contract",
            "purchase_map_second_taxonomy",
            str(doc.get("intent_contract")),
        )

    matrix = intent_matrix if intent_matrix is not None else _read_json(
        root / "data/corporate/intent-family-matrix.v1.json"
    )
    families = _intent_ids(matrix)
    if not families:
        report.add("intent-family-matrix", "corporate_intent_families_missing", "empty")
        return report

    rows = doc.get("purchases") or []
    if not isinstance(rows, list) or not rows:
        report.add("purchases", "purchase_rows_missing", "purchases must be a non-empty array")
        return report

    declared_paths: list[str] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        for key in (
            "primary_url",
            "proposed_primary_url",
            "source_of_truth",
            "requested_alias",
        ):
            if row.get(key):
                declared_paths.append(str(row[key]))
        for url in row.get("supporting_urls") or []:
            declared_paths.append(str(url))
        for surface in _commercial_surfaces(row):
            declared_paths.append(str(surface.get("url")))

    route_inventory = inventory if inventory is not None else collect_route_inventory(
        root,
        declared_paths,
        public_families=public_families,
        noindex_governance=noindex_governance,
        bofu_matrix=bofu_matrix,
    )

    seen_ids: list[str] = []
    families_with_owner: set[str] = set()
    families_with_gap: set[str] = set()
    protected_seen: set[str] = set()
    existing_cohort_members: set[str] = set()
    new_cohort_members: set[str] = set()
    coverage_counts: dict[str, int] = {}

    for index, row in enumerate(rows):
        label = f"purchases[{index}]"
        if not isinstance(row, dict):
            report.add(label, "purchase_row_invalid", "row must be an object")
            continue
        purchase_id = str(row.get("purchase_id") or "")
        label = f"purchases:{purchase_id or index}"
        missing = [field for field in REQUIRED_PURCHASE_FIELDS if field not in row]
        if missing:
            report.add(label, "purchase_fields_missing", str(missing))
            continue
        if not purchase_id:
            report.add(label, "purchase_id_missing", str(index))
            continue
        if purchase_id in seen_ids:
            report.add(label, "duplicate_purchase_id", purchase_id)
        seen_ids.append(purchase_id)

        intent_id = str(row.get("intent_family") or "")
        family = families.get(intent_id)
        if not family:
            report.add(label, "unresolved_intent_family", intent_id)
        offer_id = row.get("offer_id")
        if offer_id not in (None, ""):
            allowed = _offer_ids_for_family(family)
            if str(offer_id) not in allowed:
                report.add(
                    label,
                    "unresolved_offer_id",
                    f"{offer_id!r} not in {intent_id} offer_ids {sorted(allowed)}",
                )

        if row.get("page_kind") not in PAGE_KINDS:
            report.add(label, "page_kind_invalid", str(row.get("page_kind")))
        if row.get("business_context") not in BUSINESS_CONTEXTS:
            report.add(label, "business_context_invalid", str(row.get("business_context")))
        decision = str(row.get("decision") or "")
        if decision not in DECISIONS:
            report.add(label, "purchase_decision_invalid", decision)
        coverage_counts[decision] = coverage_counts.get(decision, 0) + 1

        if not str(row.get("visitor_job") or "").strip():
            report.add(label, "visitor_job_missing", purchase_id)
        if not str(row.get("question_answered") or "").strip():
            report.add(label, "question_answered_missing", purchase_id)
        if not str(row.get("function_differentiation") or "").strip():
            report.add(label, "function_differentiation_missing", purchase_id)

        seed = row.get("seed_query_hypothesis") or {}
        if not isinstance(seed, dict) or seed.get("status") not in {
            "HYPOTHESIS",
            "GSC_CORROBORATION",
            "SERP_SAMPLE",
        }:
            report.add(label, "seed_query_status_invalid", str(seed))
        else:
            if seed.get("status") != "HYPOTHESIS" and not seed.get("source"):
                report.add(label, "seed_query_source_missing", str(seed))
            if seed.get("impressions_are_volume_claim") is True:
                report.add(label, "seed_query_volume_invented", str(seed))

        primary = str(row.get("primary_url") or "")
        proposed = str(row.get("proposed_primary_url") or "")
        source = str(row.get("source_of_truth") or "")
        alias = row.get("requested_alias")
        primary_route = normalize_path(primary)
        proposed_route = normalize_path(proposed) if proposed else ""
        source_route = normalize_path(source)

        if not primary:
            report.add(label, "primary_url_missing", purchase_id)
        if decision == "CREATE" and not proposed:
            report.add(label, "create_without_proposed_url", purchase_id)
        if decision in {"KEEP", "ENRICH"} and proposed and proposed_route != source_route and alias:
            # Alias is a suggestion only; KEEP must not replace an existing owner.
            if source_route != primary_route and not primary.startswith(source):
                report.add(
                    label,
                    "keep_replaced_existing_owner",
                    f"source_of_truth={source} primary={primary}",
                )

        current_facts = route_inventory.get(primary_route)
        has_gap = isinstance(row.get("gap"), dict)
        has_owner = decision in {"KEEP", "ENRICH", "CREATE"}
        if has_owner == has_gap:
            report.add(
                label,
                "purchase_owner_gap_xor_invalid",
                "exactly one of an owner decision (KEEP/ENRICH/CREATE) or an explicit gap is required",
            )
        if decision in {"KEEP", "ENRICH"}:
            exists = bool(current_facts and current_facts.exists) or _path_exists(root, primary)
            if not exists:
                report.add(label, "keep_owner_missing", primary)
            else:
                families_with_owner.add(intent_id)
        elif decision == "CREATE":
            families_with_owner.add(intent_id)
        elif has_gap:
            families_with_gap.add(intent_id)

        if row.get("b2g_protected"):
            route_for_protection = source_route or primary_route
            if route_for_protection in set(PROTECTED_ROUTES):
                protected_seen.add(route_for_protection)
            elif primary_route in set(PROTECTED_ROUTES):
                protected_seen.add(primary_route)

        canonical = str(row.get("canonical") or "")
        canonical_route = None
        if canonical:
            canonical_route = _route_from_url(canonical) or normalize_path(canonical)
        expected_canonical_route = source_route or primary_route
        equivalents = {
            normalize_path(str(item))
            for item in (row.get("equivalent_urls") or [])
            if item
        }
        equivalents.add(expected_canonical_route)
        if proposed_route:
            equivalents.add(proposed_route)
        if canonical_route:
            if canonical_route == "/" and row.get("page_kind") == "serviço":
                report.add(
                    label,
                    "canonical_dumps_to_home",
                    f"{purchase_id}: canonical={canonical}",
                )
            elif canonical_route not in equivalents:
                report.add(
                    label,
                    "canonical_without_equivalence",
                    f"{canonical} is not equivalent to {sorted(equivalents)}",
                )

        if _index_requested(str(row.get("requested_indexability"))):
            facts = current_facts or route_inventory.get(source_route)
            if facts and facts.exists:
                if facts.robots_txt_disallow:
                    report.add(
                        label,
                        "indexable_route_blocked",
                        f"{facts.path} is Disallow in robots.txt; do not rely on crawlers reading noindex",
                    )
                elif _robots_noindex(facts.robots) and decision in {"KEEP", "ENRICH"}:
                    report.add(
                        label,
                        "indexable_route_blocked",
                        f"{facts.path} requests {row.get('requested_indexability')} but meta robots={facts.robots}",
                    )
            if facts and facts.exists and not facts.public_family_id and decision in {"KEEP", "ENRICH"}:
                if row.get("page_kind") in {"serviço", "hub", "ferramenta", "prova", "conteúdo de decisão"}:
                    report.add(
                        label,
                        "destination_without_family",
                        f"{facts.path} has no public-family-registry membership",
                    )

        facts_for_noindex = current_facts or route_inventory.get(source_route)
        if (
            facts_for_noindex
            and _robots_noindex(facts_for_noindex.robots)
            and row.get("business_context") in {"private", "mixed"}
            and _obsolete_maturity_only(facts_for_noindex)
        ):
            report.add(
                label,
                "obsolete_maturity_noindex",
                f"{facts_for_noindex.path} is noindex only because of an obsolete maturity inventory",
            )

        support_urls = row.get("supporting_urls") or []
        if not isinstance(support_urls, list):
            report.add(label, "supporting_urls_invalid", str(support_urls))
            support_urls = []
        declared_hops = row.get("support_destinations") or []
        for support in support_urls:
            support_route = normalize_path(str(support))
            support_facts = route_inventory.get(support_route)
            hops = list(declared_hops)
            if support_facts and support_facts.next_hops:
                hops.extend(support_facts.next_hops)
            service_hops = [
                hop
                for hop in hops
                if hop
                and not _is_generic_contact(str(hop))
                and not str(hop).startswith("#")
                and not str(hop).startswith("javascript:")
            ]
            if hops and not service_hops:
                report.add(
                    label,
                    "support_only_generic_contact",
                    f"{support} next hops={hops}",
                )
            if (
                decision in {"KEEP", "ENRICH"}
                and support_facts is not None
                and not support_facts.exists
                and not _path_exists(root, str(support))
            ):
                report.add(label, "supporting_url_missing", str(support))

        contact = row.get("terminal_contact") or {}
        if not isinstance(contact, dict) or not contact.get("mode"):
            report.add(label, "terminal_contact_invalid", str(contact))

        impressions = row.get("gsc_impressions")
        if impressions == 0 and not _quality_allows_zero_impressions(row):
            report.add(
                label,
                "zero_impressions_without_quality",
                purchase_id,
            )
        if row.get("blocked_by_zero_impressions") is True and _quality_allows_zero_impressions(row):
            report.add(
                label,
                "zero_impressions_forbid_quality_route",
                purchase_id,
            )

        cohort = row.get("publication_cohort") or {}
        if not isinstance(cohort, dict) or not cohort.get("id"):
            report.add(label, "publication_cohort_missing", purchase_id)
        else:
            member = source_route or primary_route
            if cohort.get("id") == "existing-pre-inb-20260911":
                existing_cohort_members.add(member)
                if cohort.get("history_preserved") is False:
                    report.add(label, "existing_history_wiped", purchase_id)
            elif cohort.get("id") == "inb-20260911-new":
                new_cohort_members.add(proposed_route or purchase_id)

        if row.get("page_kind") == "serviço" and decision == "CREATE" and alias:
            if normalize_path(str(alias)) == primary_route and "#" not in primary:
                report.add(
                    label,
                    "alias_overwrote_existing_owner",
                    f"alias={alias} primary={primary}",
                )

    missing_families = sorted(set(families) - families_with_owner - families_with_gap)
    for intent_id in missing_families:
        report.add(
            f"intent_family:{intent_id}",
            "intent_family_without_owner_or_gap",
            "every declared corporate intent family needs a purchase owner or explicit gap",
        )



    commercial_by_purchase: dict[str, list[tuple[str, str]]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        purchase_id = str(row.get("purchase_id") or "")
        for surface in _commercial_surfaces(row):
            commercial_by_purchase.setdefault(purchase_id, []).append(
                (normalize_path(str(surface.get("url"))), str(surface.get("function") or ""))
            )
    for purchase_id, surfaces in commercial_by_purchase.items():
        urls = [item[0] for item in surfaces]
        functions = {item[1].strip() for item in surfaces}
        unique_urls = sorted(set(urls))
        if len(unique_urls) >= 2 and (len(functions) <= 1 or "" in functions):
            function_text = next(iter(functions), "")
            report.add(
                f"purchases:{purchase_id}",
                "undifferentiated_same_purchase",
                (
                    f"urls={unique_urls} function_conflict="
                    f"{function_text or 'missing function differentiation'}"
                ),
            )

    for left_index, left in enumerate(rows):
        if not isinstance(left, dict):
            continue
        left_tokens = _tokens(
            " ".join(
                str(left.get(key) or "")
                for key in ("visitor_job", "question_answered", "seed_query_hypothesis")
            )
        )
        if isinstance(left.get("seed_query_hypothesis"), dict):
            left_tokens |= _tokens(str(left["seed_query_hypothesis"].get("query") or ""))
        for right in rows[left_index + 1 :]:
            if not isinstance(right, dict):
                continue
            if left.get("purchase_id") == right.get("purchase_id"):
                continue
            right_tokens = _tokens(
                " ".join(
                    str(right.get(key) or "")
                    for key in ("visitor_job", "question_answered")
                )
            )
            if isinstance(right.get("seed_query_hypothesis"), dict):
                right_tokens |= _tokens(str(right["seed_query_hypothesis"].get("query") or ""))
            shared = left_tokens & right_tokens
            if len(shared) < 4:
                continue
            left_fn = str(left.get("function_differentiation") or "").strip()
            right_fn = str(right.get("function_differentiation") or "").strip()
            if left_fn and right_fn and left_fn != right_fn:
                report.add(
                    f"purchases:{left.get('purchase_id')}",
                    "lexical_similarity_only",
                    (
                        f"{left.get('purchase_id')} ~ {right.get('purchase_id')} "
                        f"shared_tokens={sorted(shared)[:8]}; distinct functions preserved"
                    ),
                    severity="warning",
                )
            elif left.get("intent_family") == right.get("intent_family") and left_fn != right_fn:
                report.add(
                    f"purchases:{left.get('purchase_id')}",
                    "shared_family_not_cannibalization",
                    (
                        f"{left.get('purchase_id')} and {right.get('purchase_id')} share "
                        f"{left.get('intent_family')} with distinct functions"
                    ),
                    severity="warning",
                )

    if set(PROTECTED_ROUTES) - protected_seen:
        report.add(
            "protected_routes",
            "b2g_protected_route_missing",
            f"missing={sorted(set(PROTECTED_ROUTES) - protected_seen)}",
        )

    if not existing_cohort_members:
        report.add(
            "publication_cohorts",
            "existing_cohort_empty",
            "new pages cannot wipe existing history",
        )

    report.stats = {
        "purchase_rows": len(seen_ids),
        "intent_families_covered": len(families_with_owner | families_with_gap),
        "intent_families_declared": len(families),
        "protected_b2g_routes": len(protected_seen),
        "existing_cohort_members": len(existing_cohort_members),
        "new_cohort_members": len(new_cohort_members),
        "decisions": dict(sorted(coverage_counts.items())),
        "warnings": sum(1 for item in report.findings if item.severity == "warning"),
        "errors": sum(1 for item in report.findings if item.severity == "error"),
    }
    return report


def check_purchase_route_map(root: Path = ROOT) -> MapValidationReport:
    return validate_purchase_route_map(root)
