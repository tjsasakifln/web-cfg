"""Twelve-item INDEX gate for the official-live contract-analysis canary.

Each item is evaluated against shipped consume/gate/render/approval outputs.
A false item refuses INDEX. There is no INDEX_READY fiction.
"""

from __future__ import annotations

import re
from typing import Any

from scripts.contract_analysis import (
    AUTHORIZED_ANALYSIS_ID,
    AUTHORIZED_CANONICAL_PATH,
    CONTENT_CLASS_ANALYSIS,
    OWNER_CONDITIONAL_PREAPPROVAL_V2,
    SINGULAR_COMPARABLE_REASON,
    STALE_INDEX_TOKENS,
)
from scripts.contract_analysis.approval import (
    approval_allows_index,
    approval_rendered_hash_ok,
    find_approval,
    material_hash,
)
from scripts.contract_analysis.consume import (
    claim_has_locator,
    iter_material_claims,
    official_live_declared,
)
from scripts.contract_analysis.gate import PublicationDecision
from scripts.contract_analysis.handoff import HANDOFF_READY
from scripts.contract_analysis.taxonomy import ANALYSIS_LABEL_PT

INDEX_ITEM_KEYS = (
    "official_source_handoff",
    "epistemic_labels_distinct",
    "material_facts_have_source_locator",
    "singular_falsifiable_anti_doorway",
    "atipico_is_not_irregular",
    "authorship_method_as_of_limitations_correction",
    "taxonomy_analise_tecnica_not_caso",
    "canonical_robots_sitemap_graph",
    "cta_keep_list",
    "no_pii_or_gsc_query",
    "v2_token_and_current_hashes",
    "rollback_noindex_no_ghost_loc",
)

FORBIDDEN_SCHEMA = ("CaseStudy", "Review", "Product")
FORBIDDEN_CLASS = ("CASO_CONFENGE", "customer success", "case study")
PII_CTA_LEMMAS = ("@", "telefone", "whatsapp", "email")
GSC_QUERY_LEMMAS = ("gsc_query", "individual_query", "query.gsc")
IRREGULAR_LEMMAS = ("irregularidade", "fraude", "culpa", "ilegalidade", "má-fé", "ma-fe")
PERCENTILE_LEMMAS = ("acima da mediana", "abaixo da mediana", "ranking de pares")


def evaluate_index_items_v2(
    record: dict[str, Any],
    decision: PublicationDecision,
    html: str,
    *,
    token: str = "",
    handoff: dict[str, Any] | None = None,
    headers_text: str = "",
    robots_text: str = "",
    sitemap_locs: list[str] | None = None,
    rollback_proven: bool | None = None,
) -> dict[str, Any]:
    """Return the twelve INDEX items as booleans plus an all_pass flag."""
    html = html or ""
    lowered = html.lower()
    handoff = handoff or {}
    locs = list(sitemap_locs or [])
    slug = str(decision.slug or record.get("slug") or "")
    stored = find_approval(record)
    items: dict[str, bool] = {}

    items["official_source_handoff"] = bool(
        official_live_declared(record)
        or (
            record.get("source_kind") == "official_live"
            and record.get("catalog_mode") == "official_live"
            and not record.get("is_fixture")
        )
    ) and (
        handoff.get("status") == HANDOFF_READY
        or str(record.get("handoff_status") or "") == HANDOFF_READY
    ) and bool(record.get("content_hash")) and bool(
        record.get("root_content_hash") or handoff.get("root_content_hash")
    )

    items["epistemic_labels_distinct"] = all(
        f'data-epistemic="{kind}"' in html
        for kind in ("FACT", "CALCULATION", "INFERENCE", "UNKNOWN")
    )

    facts = [
        item
        for item in iter_material_claims(record)
        if str(item.get("kind") or item.get("class") or "").upper() in {"FACT", "CALCULATION"}
        or (not item.get("kind") and item.get("claim_id"))
    ]
    locators_ok = bool(facts) and all(
        claim_has_locator(item) and (item.get("source_ref") or item.get("url") or item.get("source_refs"))
        for item in facts
    )
    items["material_facts_have_source_locator"] = locators_ok

    thesis = str(record.get("thesis") or record.get("insight_singular") or "")
    items["singular_falsifiable_anti_doorway"] = (
        len(thesis) >= 80
        and bool(record.get("thesis_falsifiable") or record.get("counterproof"))
        and len(str(record.get("utility_beyond_source") or "")) >= 60
    )

    cannot = str(record.get("cannot_conclude") or "").lower()
    irregular_as_claim = False
    for lemma in IRREGULAR_LEMMAS:
        if lemma in lowered and "não se afirma" not in cannot and "nao se afirma" not in cannot:
            # Honest negation is allowed; a naked accusation is not.
            window = lowered
            if f"não se afirma {lemma}" not in window and f"nao se afirma {lemma}" not in window:
                if "não se afirma" not in cannot:
                    irregular_as_claim = True
    items["atipico_is_not_irregular"] = (not irregular_as_claim) and (
        "não se afirma" in cannot or "nao se afirma" in cannot
    )

    author = record.get("author") if isinstance(record.get("author"), dict) else {"name": record.get("author")}
    reviewer = record.get("reviewer") if isinstance(record.get("reviewer"), dict) else {"name": record.get("reviewer")}
    author_name = str((author or {}).get("name") if isinstance(author, dict) else author or "")
    reviewer_name = str((reviewer or {}).get("name") if isinstance(reviewer, dict) else reviewer or "")
    items["authorship_method_as_of_limitations_correction"] = (
        record.get("human_authorship_confirmed") is True
        and "rascunho" not in author_name.lower()
        and (len(reviewer_name) >= 5 or bool(record.get("solo_reviewer_disclosure")))
        and len(str(record.get("methodology") or "")) >= 40
        and len(str(record.get("limitations") or "")) >= 40
        and bool(str(record.get("as_of") or (record.get("freshness") or {}).get("as_of") or ""))
        and "/correcoes/" in html
        and "rascunho editorial" not in lowered
    )

    schema_clean = all(token not in html for token in FORBIDDEN_SCHEMA)
    class_ok = CONTENT_CLASS_ANALYSIS in html or ANALYSIS_LABEL_PT.lower() in lowered
    caso_as_identity = "CASO_CONFENGE" in html or '"@type":"CaseStudy"' in html
    items["taxonomy_analise_tecnica_not_caso"] = class_ok and schema_clean and not caso_as_identity

    canonical_ok = AUTHORIZED_CANONICAL_PATH in html or f'rel="canonical"' in html
    robots_meta = 'name="robots"' in html
    indexable = decision.state == "PUBLISHABLE_INDEX" and decision.indexable
    if indexable:
        robots_content = ""
        for match in re.finditer(r"<meta\b[^>]*>", html, re.I):
            tag = match.group(0)
            if not re.search(r'name=["\']robots["\']', tag, re.I):
                continue
            content = re.search(r'content=["\']([^"\']+)["\']', tag, re.I)
            if content:
                robots_content = content.group(1)
                break
        robots_ok = "index" in robots_content.lower() and "noindex" not in robots_content.lower()
        xrobots_ok = (
            not headers_text
            or (
                f"{AUTHORIZED_CANONICAL_PATH.rstrip('/')}/*" in headers_text
                and "X-Robots-Tag: index, follow" in headers_text
            )
        )
        sitemap_ok = any(slug in loc for loc in locs) if locs else decision.sitemap is True
    else:
        robots_ok = "noindex" in html
        xrobots_ok = True
        sitemap_ok = not any(slug and slug in loc for loc in locs)
    items["canonical_robots_sitemap_graph"] = canonical_ok and robots_meta and robots_ok and xrobots_ok and sitemap_ok

    cta_ok = (
        'data-analysis-id="' in html
        and 'data-asset-family="' in html
        and 'data-cta-id="' in html
        and 'data-source="CONFENGE_WEB"' in html
        and 'data-destination-service-id="' in html
        and 'id="proximo-passo"' in html
    )
    items["cta_keep_list"] = cta_ok

    cta_slice = html
    start = html.find('id="proximo-passo"')
    if start != -1:
        end = html.find("</section>", start)
        cta_slice = html[start:end if end != -1 else start + 800]
    pii_hit = any(tok in cta_slice.lower() for tok in PII_CTA_LEMMAS) or any(
        tok in lowered for tok in GSC_QUERY_LEMMAS
    )
    percentile_hit = any(tok in lowered for tok in PERCENTILE_LEMMAS)
    items["no_pii_or_gsc_query"] = (not pii_hit) and (not percentile_hit)

    allowed, _reasons = approval_allows_index(record)
    hash_ok, _hash_reasons = approval_rendered_hash_ok(record, html)
    token_ok = token == OWNER_CONDITIONAL_PREAPPROVAL_V2 and token not in STALE_INDEX_TOKENS
    stored_token = str((stored or {}).get("token") or token or "")
    hashes_coincide = True
    if stored:
        hashes_coincide = (
            str(stored.get("material_hash") or "") == material_hash(record)
            and str(stored.get("source_dossier_hash") or stored.get("official_payload_hash") or "")
            == str(record.get("content_hash") or "")
            and hash_ok
        )
    items["v2_token_and_current_hashes"] = (
        token_ok
        and stored_token == OWNER_CONDITIONAL_PREAPPROVAL_V2
        and hashes_coincide
        and (allowed if indexable else True)
    )

    if rollback_proven is None:
        items["rollback_noindex_no_ghost_loc"] = (not indexable) or decision.sitemap is True
    else:
        items["rollback_noindex_no_ghost_loc"] = bool(rollback_proven)

    # Comparable contract is recorded, not consumed.
    comparable_ok = (
        str(record.get("id") or record.get("analysis_id") or "") != AUTHORIZED_ANALYSIS_ID
        or (
            record.get("comparable_available") is True
            and record.get("comparable_consumed") is False
            and str(record.get("comparable_reason") or "") == SINGULAR_COMPARABLE_REASON
        )
    )
    all_pass = all(items[key] for key in INDEX_ITEM_KEYS) and comparable_ok
    return {
        "items": items,
        "all_pass": all_pass,
        "comparable_available": record.get("comparable_available"),
        "comparable_consumed": record.get("comparable_consumed"),
        "comparable_reason": record.get("comparable_reason"),
        "indexable": indexable,
        "index_count_allowed": 1 if (all_pass and indexable) else 0,
    }
