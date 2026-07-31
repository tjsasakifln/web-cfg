"""indexability_score (0–100) and publication gates for pSEO candidates.

Score components are measurable features (not fixed archetype constants).
Human review is applied separately in build.apply_human_review_gate —
score alone never indexes a page.
"""

from __future__ import annotations

import re

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

# Weights (sum 100)
W_ICP = 20
W_INTENT = 15
W_EVIDENCE = 15
W_CLASS_CONF = 10
W_COMPARABILITY = 10
W_FRESHNESS = 10
W_DIFF = 10
W_SERVICE = 5
W_CANNIBAL = 5

# Sample minima by type
MIN_MARKET_CONTRACTS = 15
MIN_MARKET_BUYERS = 3
MIN_PRICE_OBS = 15
MIN_PRICE_COMPARISON_CONF = 0.55
MIN_AGENCY_CONTRACTS = 12
MIN_RADAR_OPEN = 3
MIN_PROBLEM_EVIDENCE = 15  # not generic contract count

PUBLISH_MIN = 80
PREVIEW_MIN = 65

APPROVED_REVIEWS = frozenset({"APPROVED", "APPROVED_WITH_NOTES"})

# Freshness policy by page type (days unless noted)
FRESHNESS_POLICY = {
    "radar": {"warning_hours": 24, "fail_hours": 72},
    "market": {"warning_days": 30, "fail_days": 90},
    "competition": {"warning_days": 30, "fail_days": 90},
    "agency": {"warning_days": 45, "fail_days": 120},
    "price": {"warning_days": 90, "fail_days": 180},
    "problem_service": {"warning_days": 90, "fail_days": 180},
}



# ---------------------------------------------------------------------------
# Semantic mandatory gates (score cannot compensate)
# ---------------------------------------------------------------------------

INGESTION_PREFIX_RE = re.compile(
    r"^(MRS|TCE|TCM|PNCP|SIASG|COMPRASNET|BEC|BLL|LICITANET)\s*[-–:|/]",
    re.I,
)


def _sample_metrics(ref: dict) -> dict:
    return dict(ref.get("sample_metrics") or {})


def semantic_agency_fails(a: dict) -> list[str]:
    fails: list[str] = []
    name = str(a.get("agency_name") or "")
    if INGESTION_PREFIX_RE.search(name) or name.upper().startswith("MRS-"):
        fails.append("agency_name_ingestion_prefix")
    sm = _sample_metrics(a)
    primary = int(sm.get("primary_contract_count") or a.get("primary_contract_count") or a.get("contract_count") or 0)
    if primary < MIN_AGENCY_CONTRACTS:
        fails.append(f"primary_contracts<{MIN_AGENCY_CONTRACTS}")
    suppliers = int(sm.get("unique_supplier_count") or a.get("supplier_count") or 0)
    if suppliers < 3:
        fails.append("suppliers<3")
    span = int(sm.get("temporal_span_days") or 0)
    # derive span from period if missing
    if span <= 0 and a.get("period_start") and a.get("period_end"):
        try:
            from datetime import date as _d
            span = (_d.fromisoformat(str(a["period_end"])[:10]) - _d.fromisoformat(str(a["period_start"])[:10])).days
        except ValueError:
            span = 0
    if span < 180:
        fails.append("temporal_span_days<180")
    exercises = int(sm.get("exercise_count") or 0)
    if exercises and exercises < 2 and span < 365:
        fails.append("exercises<2")
    day_share = float(sm.get("max_single_day_share") or 0)
    if day_share <= 0 and a.get("seasonality"):
        # approximate from seasonality if single month dominates
        seasons = a.get("seasonality") or []
        total = sum(int(s.get("contract_count") or 0) for s in seasons) or 1
        if seasons:
            day_share = max(int(s.get("contract_count") or 0) for s in seasons) / total
    if day_share > 0.70:
        fails.append("max_single_day_share>0.70")
    if a.get("seasonality") and not a.get("seasonality_eligible", True) and span < 60:
        fails.append("seasonality_without_temporal_base")
    return fails


def semantic_price_fails(pr: dict) -> list[str]:
    fails: list[str] = []
    denom = pr.get("denominator_type") or (pr.get("sample_metrics") or {}).get("denominator_type") or "contrato_integral"
    sm = _sample_metrics(pr)
    primary = int(sm.get("primary_contract_count") or pr.get("primary_contract_count") or pr.get("observation_count") or 0)
    buyers = int(sm.get("unique_buyer_count") or pr.get("unique_buyer_count") or 0)
    suppliers = int(sm.get("unique_supplier_count") or pr.get("unique_supplier_count") or 0)
    span = int(sm.get("temporal_span_days") or pr.get("temporal_span_days") or 0)
    if span <= 0 and pr.get("period_start") and pr.get("period_end"):
        try:
            from datetime import date as _d
            span = (_d.fromisoformat(str(pr["period_end"])[:10]) - _d.fromisoformat(str(pr["period_start"])[:10])).days
        except ValueError:
            span = 0
    max_buyer = float(sm.get("max_buyer_share") or pr.get("max_buyer_share") or 0)
    # Heuristic: if examples all same orgao, concentration is high
    examples = pr.get("public_examples") or []
    if max_buyer <= 0 and examples:
        from collections import Counter
        names = Counter((e.get("orgao_nome") or "?") for e in examples)
        # only a sample of examples — if all same, flag
        if len(names) == 1 and len(examples) >= 3:
            max_buyer = 1.0
    if denom == "contrato_integral":
        if primary < 15:
            fails.append("primary_contracts<15")
        if buyers and buyers < 3:
            fails.append("buyers<3")
        if buyers == 0 and max_buyer >= 1.0:
            fails.append("buyers<3")
        if suppliers and suppliers < 3:
            fails.append("suppliers<3")
        if suppliers == 0 and len({(e.get("orgao_nome"), e.get("valor")) for e in examples}) <= 1:
            # cannot prove diversity
            fails.append("sample_independence_unproven")
        if span < 90:
            fails.append("temporal_span_days<90")
        if max_buyer > 0.60:
            fails.append("max_buyer_share>0.60")
    elif denom == "preco_unitario":
        unit_n = int(pr.get("unit_observation_count") or 0)
        if unit_n < 10:
            fails.append("unit_obs<10")
        for req in ("unit", "quantity_field", "base_date", "locality"):
            if not pr.get(req):
                fails.append(f"unit_price_missing_{req}")
    else:
        fails.append(f"unknown_denominator:{denom}")
    # Label must not promise unit price for integral contracts
    label = f"{pr.get('object_label') or ''} {pr.get('slug') or ''}".lower()
    if denom == "contrato_integral" and re.search(r"pre[cç]o\s+por\s+m|pre[cç]o\s+unit|r\$/m", label):
        fails.append("unit_price_language_on_integral")
    return fails


def semantic_radar_fails(o: dict) -> list[str]:
    fails: list[str] = []
    items = o.get("items") or []
    open_n = int(o.get("open_count") or len(items) or 0)
    if open_n < MIN_RADAR_OPEN:
        fails.append(f"open<{MIN_RADAR_OPEN}")
    dup_rate = float(o.get("duplicate_rate") if o.get("duplicate_rate") is not None else (o.get("sample_metrics") or {}).get("duplicate_rate") or 0)
    if dup_rate > 0:
        fails.append("duplicate_rate>0")
    # Detect duplicate objects in items
    seen = set()
    dups = 0
    contract_links = 0
    zero_as_missing = 0
    for it in items:
        key = (
            (it.get("objeto") or "")[:120].lower().strip(),
            str(it.get("orgao_nome") or "").lower(),
            str(it.get("data_encerramento") or it.get("closing_at") or "")[:10],
            str(it.get("valor_estimado")),
        )
        if key in seen:
            dups += 1
        seen.add(key)
        url = str(it.get("link_pncp") or it.get("link_oficial") or it.get("canonical_source_url") or "")
        ut = it.get("source_url_type") or ""
        if ut == "contract" or "/app/contratos/" in url:
            contract_links += 1
        vs = it.get("value_status")
        if it.get("valor_estimado") in (0, 0.0) and vs not in {"zero_valid", "known"}:
            zero_as_missing += 1
    if dups:
        fails.append(f"duplicate_items={dups}")
        fails.append("duplicate_rate>0")
    if contract_links:
        fails.append(f"contract_url_as_opportunity={contract_links}")
    if zero_as_missing:
        fails.append(f"zero_used_for_missing_value={zero_as_missing}")
    fr = o.get("freshness") or {}
    if fr.get("status") == "fail":
        fails.append("radar_freshness_fail")
    return fails


def semantic_problem_fails(pr: dict) -> list[str]:
    """Problem pages need claim-specific evidence, not generic contract counts."""
    fails: list[str] = []
    theme = (pr.get("theme") or pr.get("id") or "").lower()
    evidence_count = int(pr.get("evidence_count") or 0)
    specific = pr.get("claim_evidence") or pr.get("direct_evidence") or pr.get("evidence_signals") or []
    # If only generic evidence_count without typed signals → fail for publish eligibility
    if not specific:
        if "aditiv" in theme:
            if not pr.get("amendment_count") and not pr.get("amendment_incidence"):
                fails.append("no_direct_aditivo_evidence")
        elif "sinapi" in theme or "sicro" in theme:
            if not pr.get("reference_mentions") and not pr.get("document_signals"):
                fails.append("no_direct_sinapi_sicro_evidence")
        elif "orcamento" in theme or "edital" in theme:
            if not pr.get("document_divergence_count") and not pr.get("budget_signals"):
                fails.append("no_direct_budget_edital_evidence")
        else:
            if evidence_count and not pr.get("evidence_kind"):
                fails.append("generic_evidence_count_only")
    return fails



@dataclass
class Candidate:
    page_id: str
    page_type: str
    url: str
    title: str
    h1: str
    description: str
    archetype: str | None
    segment: str | None
    region: str | None
    agency_id: str | None
    intent: str
    score: int
    status: str  # publish | noindex | reject (eligible demoted by human gate)
    reasons: list[str] = field(default_factory=list)
    score_breakdown: dict[str, int] = field(default_factory=dict)
    observation_count: int = 0
    sources: list[str] = field(default_factory=list)
    cta_label: str = ""
    cta_intent: str = ""
    related_urls: list[str] = field(default_factory=list)
    data_ref: dict[str, Any] = field(default_factory=dict)
    body_text: str = ""
    mandatory_fail: list[str] = field(default_factory=list)
    quality_eligible: bool = False  # passed score gates before human review
    human_review: str = "PENDING"

    def as_dict(self) -> dict[str, Any]:
        return {
            "page_id": self.page_id,
            "page_type": self.page_type,
            "url": self.url,
            "title": self.title,
            "h1": self.h1,
            "description": _soft_meta(self.description) if "_soft_meta" in globals() else self.description,
            "archetype": self.archetype,
            "segment": self.segment,
            "region": self.region,
            "agency_id": self.agency_id,
            "intent": self.intent,
            "indexability_score": self.score,
            "status": self.status,
            "reasons": self.reasons,
            "score_breakdown": self.score_breakdown,
            "observation_count": self.observation_count,
            "sources": self.sources,
            "cta_label": self.cta_label,
            "cta_intent": self.cta_intent,
            "related_urls": self.related_urls,
            "mandatory_fail": self.mandatory_fail,
            "quality_eligible": self.quality_eligible,
            "human_review": self.human_review,
        }


def _clamp(n: int, lo: int = 0, hi: int = 100) -> int:
    return max(lo, min(hi, n))


def score_components(
    *,
    icp_fit: float,
    intent_clarity: float,
    evidence_strength: float,
    class_confidence: float,
    comparability: float,
    freshness: float,
    differentiation: float,
    service_cta: float,
    anti_cannibal: float = 1.0,
) -> dict[str, int]:
    """Each input 0.0–1.0; returns named component points that sum ≤ 100."""
    return {
        "icp_adherence": int(round(icp_fit * W_ICP)),
        "commercial_intent": int(round(intent_clarity * W_INTENT)),
        "evidence": int(round(evidence_strength * W_EVIDENCE)),
        "classification_confidence": int(round(class_confidence * W_CLASS_CONF)),
        "comparability": int(round(comparability * W_COMPARABILITY)),
        "freshness": int(round(freshness * W_FRESHNESS)),
        "differentiation": int(round(differentiation * W_DIFF)),
        "service_cta": int(round(service_cta * W_SERVICE)),
        "anti_cannibalization": int(round(anti_cannibal * W_CANNIBAL)),
    }


def total_from_breakdown(b: dict[str, int]) -> int:
    return _clamp(sum(b.values()))


def decide_status(score: int, mandatory_fail: list[str]) -> str:
    """Quality status before human review. publish here means quality-eligible."""
    if mandatory_fail:
        return "reject"
    if score >= PUBLISH_MIN:
        return "publish"  # provisional; human gate may demote
    if score >= PREVIEW_MIN:
        return "noindex"
    return "reject"


def apply_human_review_gate(
    cands: list[Candidate],
    existing_reviews: dict[str, dict[str, Any]] | None = None,
    *,
    dataset_hash: str | None = None,
) -> list[Candidate]:
    """Hard gate: only APPROVED / APPROVED_WITH_NOTES may remain publish."""
    existing_reviews = existing_reviews or {}
    for c in cands:
        prev = existing_reviews.get(c.page_id) or {}
        human = prev.get("human_review") or "PENDING"
        if (
            human in APPROVED_REVIEWS
            and prev.get("review_dataset_hash")
            and dataset_hash
            and prev.get("review_dataset_hash") != dataset_hash
        ):
            human = "PENDING"
            c.reasons.append("approval_invalidated_dataset_changed")
        c.human_review = human

        if c.status == "reject":
            c.quality_eligible = False
            continue

        quality_ok = c.status == "publish" and not c.mandatory_fail
        c.quality_eligible = quality_ok

        if human not in APPROVED_REVIEWS:
            if c.status == "publish":
                c.status = "noindex"
                c.reasons.append(f"human_review={human}_blocks_index")
            continue

        # Approved: keep publish only if quality ok
        if not quality_ok:
            if c.status != "reject":
                c.status = "noindex"
                c.reasons.append("approved_but_quality_gates_failed")
    return cands


def icp_similarity(
    candidate_features: dict[str, float],
    signature: dict[str, Any] | None,
) -> float:
    """Cosine-like similarity to sanitized ICP signature histograms (0–1)."""
    if not signature or not signature.get("available"):
        # fallback: use archetype presence density if any
        return candidate_features.get("archetype_known", 0.5)

    # Build vectors from overlapping keys
    acts = signature.get("activity_class_histogram") or {}
    fits = signature.get("sector_fit_histogram") or {}
    sigs = signature.get("public_signal_frequency") or {}

    # Candidate features we can map without proprietary data
    score = 0.0
    weight = 0.0

    # Sector fit: engineering confirmed boosts
    eng = float(fits.get("CONFIRMED_ENGINEERING") or fits.get("engineering") or 0)
    total_fit = sum(float(v) for v in fits.values()) or 1.0
    eng_share = eng / total_fit
    score += eng_share * candidate_features.get("archetype_known", 0.5) * 0.4
    weight += 0.4

    # Activity class diversity signal
    n_acts = len(acts) or 1
    act_align = min(1.0, candidate_features.get("observation_norm", 0.5) * (1.0 + 0.1 * min(n_acts, 5)))
    score += min(1.0, act_align) * 0.3
    weight += 0.3

    # Public signals present
    n_sig = len(sigs)
    sig_align = min(1.0, 0.4 + 0.1 * min(n_sig, 6)) * candidate_features.get("multi_buyer", 0.5)
    score += sig_align * 0.3
    weight += 0.3

    return max(0.0, min(1.0, score / weight if weight else 0.5))


def _record_age_days(manifest: dict[str, Any], page_type: str, data_ref: dict[str, Any]) -> float | None:
    """Age of underlying data (not generated_at alone)."""
    today = date.today()
    # Prefer record-level period_end / as_of
    candidates = [
        data_ref.get("period_end"),
        data_ref.get("as_of"),
        data_ref.get("verified_at"),
        (manifest.get("freshness") or {}).get("data_period_end"),
        manifest.get("data_as_of"),
    ]
    for c in candidates:
        if not c:
            continue
        try:
            d = date.fromisoformat(str(c)[:10])
            return float((today - d).days)
        except ValueError:
            continue
    # last resort: generated_at (penalized by caller)
    gen = manifest.get("generated_at")
    if gen:
        try:
            d = date.fromisoformat(str(gen)[:10])
            return float((today - d).days)
        except ValueError:
            return None
    return None


def freshness_quality(
    manifest: dict[str, Any],
    page_type: str,
    data_ref: dict[str, Any] | None = None,
) -> tuple[float, list[str]]:
    """Return (0–1 quality, fail reasons). Uses real record ages per type policy."""
    data_ref = data_ref or {}
    fails: list[str] = []
    age_days = _record_age_days(manifest, page_type, data_ref)

    if page_type == "radar":
        pol = FRESHNESS_POLICY["radar"]
        # as_of age in hours approx days*24
        if age_days is None:
            fails.append("radar_missing_as_of")
            return 0.0, fails
        age_hours = age_days * 24.0
        # Also hard-fail if open items have stale verification relative to policy
        fr = data_ref.get("freshness") or {}
        if fr.get("status") == "fail":
            fails.append("radar_freshness_fail")
            return 0.0, fails
        if age_hours > pol["fail_hours"]:
            fails.append(f"radar_stale_hours>{pol['fail_hours']}")
            return 0.0, fails
        if age_hours > pol["warning_hours"]:
            return 0.5, []
        return 1.0, []

    pol = FRESHNESS_POLICY.get(page_type) or FRESHNESS_POLICY["market"]
    warn = pol.get("warning_days", 30)
    fail = pol.get("fail_days", 90)
    if age_days is None:
        return 0.4, []
    if age_days > fail:
        fails.append(f"data_age_days>{fail}")
        return 0.0, fails
    if age_days > warn:
        return 0.6, []
    if age_days <= warn / 2:
        return 1.0, []
    return 0.85, []


def _humanize_agency_name(name: str | None) -> str:
    if not name:
        return ""
    n = re.sub(r"^(MRS|TCE|TCM|PNCP|SIASG|COMPRASNET)\s*[-–:|/]\s*", "", str(name), flags=re.I)
    if n == n.upper() and len(n) > 4:
        small = {"de", "da", "do", "das", "dos", "e", "em", "a", "o", "as", "os"}
        parts = []
        for i, w in enumerate(n.split()):
            wl = w.lower()
            parts.append(wl if i > 0 and wl in small else wl.capitalize())
        n = " ".join(parts)
    return n


def _clean_price_label(label: str | None) -> str:
    s = str(label or "")
    s = re.sub(r"\s*\([a-z0-9]+(?:-[a-z0-9]+)+\)", "", s)
    s = s.replace("paralelepipedo", "paralelepípedo").replace("Paralelepipedo", "Paralelepípedo")
    s = s.replace("manutencao", "manutenção").replace("Manutencao", "Manutenção")
    s = s.replace("pavimentacao", "pavimentação").replace("Piaui", "Piauí")
    return s.strip()



def _soft_meta(text: str, max_len: int = 155) -> str:
    """Truncate meta description on word boundary; never mid-word."""
    text = " ".join((text or "").split())
    if len(text) <= max_len:
        return text
    cut = text[: max_len - 1]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    cut = cut.rstrip(" ,;:-")
    if not cut.endswith((".", "!", "?", "…")):
        cut += "…"
    return cut

def build_candidates(data: dict[str, Any], manifest: dict[str, Any]) -> list[Candidate]:
    archetypes = {a["id"]: a for a in data.get("archetypes") or []}
    markets = data.get("markets") or []
    agencies = data.get("agencies") or []
    prices = data.get("prices") or []
    competition = data.get("competition") or []
    opportunities = data.get("opportunities") or []
    problems = data.get("problem_service") or []
    icp_sig = ((data.get("icp_methodology") or {}).get("internal_signature_aggregates")) or {}

    cands: list[Candidate] = []
    market_by_slug = {m["slug"]: m for m in markets}

    for m in markets:
        fails: list[str] = []
        if m.get("contract_count", 0) < MIN_MARKET_CONTRACTS:
            fails.append(f"contracts<{MIN_MARKET_CONTRACTS}")
        if m.get("buyer_count", 0) < MIN_MARKET_BUYERS:
            fails.append(f"buyers<{MIN_MARKET_BUYERS}")
        if not m.get("sources"):
            fails.append("no_sources")
        arch = m.get("archetype_id")
        obs_norm = min(1.0, (m.get("contract_count", 0) / 80))
        multi_buyer = min(1.0, (m.get("buyer_count", 0) / 12))
        icp = icp_similarity(
            {
                "archetype_known": 1.0 if arch in archetypes else 0.3,
                "observation_norm": obs_norm,
                "multi_buyer": multi_buyer,
            },
            icp_sig,
        )
        evidence = min(1.0, (m.get("contract_count", 0) / 40) * 0.55 + (m.get("buyer_count", 0) / 10) * 0.45)
        # differentiation from concrete top objects / buyers
        n_obj = len(m.get("top_objects") or [])
        n_buy = len(m.get("top_buyers") or [])
        diff = min(1.0, 0.35 + 0.08 * n_obj + 0.07 * n_buy + 0.1 * min(3, len(m.get("value_by_year") or [])))
        fresh, fresh_fails = freshness_quality(manifest, "market", m)
        fails.extend(fresh_fails)
        class_conf = 0.95 if arch in archetypes else 0.4
        breakdown = score_components(
            icp_fit=icp,
            intent_clarity=min(1.0, 0.7 + 0.05 * multi_buyer + 0.1 * obs_norm),
            evidence_strength=evidence,
            class_confidence=class_conf,
            comparability=0.7,  # markets are demand aggregates
            freshness=fresh,
            differentiation=diff,
            service_cta=0.9 if arch and archetypes.get(arch, {}).get("confenge_service_slugs") else 0.4,
            anti_cannibal=0.9,
        )
        score = total_from_breakdown(breakdown)
        status = decide_status(score, fails)
        reasons = list(fails) if fails else [f"score={score}"]
        if status == "publish":
            reasons.append("quality_gates_ok")
        url = f"/inteligencia/mercados/{m['slug']}/"
        cands.append(
            Candidate(
                page_id=m["id"],
                page_type="market",
                url=url,
                title=f"Mercado de {m['segment']} em {m['region_label']}: contratos e órgãos | CONFENGE",
                h1=f"Quanto o poder público contratou em {m['segment']} — {m['region_label']}",
                description=(
                    f"Inteligência de mercado: {m['contract_count']} contratos, "
                    f"{m['buyer_count']} órgãos em {m['region_label']}. "
                    f"Medianas, compradores e implicações para empresas de engenharia."
                ),
                archetype=arch,
                segment=m.get("segment"),
                region=m.get("region"),
                agency_id=None,
                intent="encontrar_mercados_oportunidades",
                score=score,
                status=status,
                reasons=reasons,
                score_breakdown=breakdown,
                observation_count=int(m.get("contract_count") or 0),
                sources=list(m.get("sources") or []),
                cta_label="Solicitar um mapa aplicado à minha empresa",
                cta_intent="mapa_mercado",
                related_urls=_market_related(m, market_by_slug, prices, competition, opportunities),
                data_ref=m,
                body_text=_market_body_fingerprint(m),
                mandatory_fail=fails,
                quality_eligible=status == "publish",
            )
        )

    for a in agencies:
        fails = []
        if a.get("contract_count", 0) < MIN_AGENCY_CONTRACTS:
            fails.append(f"contracts<{MIN_AGENCY_CONTRACTS}")
        if not a.get("sources"):
            fails.append("no_sources")
        fails.extend(semantic_agency_fails(a))
        mix = a.get("archetype_mix") or []
        primary = mix[0]["archetype_id"] if mix else None
        obs_norm = min(1.0, a.get("contract_count", 0) / 40)
        icp = icp_similarity(
            {
                "archetype_known": 1.0 if primary in archetypes else 0.35,
                "observation_norm": obs_norm,
                "multi_buyer": 0.6,
            },
            icp_sig,
        )
        evidence = min(1.0, a.get("contract_count", 0) / 30)
        n_obj = len(a.get("top_objects") or [])
        diff = min(1.0, 0.4 + 0.1 * n_obj + (0.15 if a.get("municipio") else 0))
        fresh, fresh_fails = freshness_quality(manifest, "agency", a)
        fails.extend(fresh_fails)
        breakdown = score_components(
            icp_fit=icp,
            intent_clarity=min(1.0, 0.75 + 0.1 * obs_norm),
            evidence_strength=evidence,
            class_confidence=0.85 if primary in archetypes else 0.45,
            comparability=0.65,
            freshness=fresh,
            differentiation=diff,
            service_cta=0.88,
        )
        score = total_from_breakdown(breakdown)
        status = decide_status(score, fails)
        url = f"/inteligencia/orgaos/{a['slug']}/engenharia/"
        cands.append(
            Candidate(
                page_id=a["id"],
                page_type="agency",
                url=url,
                title=f"{_humanize_agency_name(a.get('agency_name'))}: histórico de contratação em engenharia | CONFENGE",
                h1=f"Contratação de engenharia em {_humanize_agency_name(a.get('agency_name'))}: o que os dados públicos mostram",
                description=(
                    f"Dossiê de comprador: {a.get('primary_contract_count') or a['contract_count']} contratos primários classificados, "
                    f"objetos, valores e cuidados para disputar contratos deste órgão."
                ),
                archetype=primary,
                segment=None,
                region=a.get("uf"),
                agency_id=a.get("agency_cnpj8") or a.get("slug"),
                intent="avaliar_orgao_comprador",
                score=score,
                status=status,
                reasons=[*(["gates_ok"] if not fails else fails), f"score={score}"],
                score_breakdown=breakdown,
                observation_count=int(a.get("contract_count") or 0),
                sources=list(a.get("sources") or []),
                cta_label="Avaliar estratégia para disputar contratos deste órgão",
                cta_intent="estrategia_orgao",
                related_urls=_agency_related(a, markets),
                data_ref=a,
                body_text=_agency_body_fingerprint(a),
                mandatory_fail=fails,
                quality_eligible=status == "publish",
            )
        )

    for p in prices:
        fails = []
        if p.get("observation_count", 0) < MIN_PRICE_OBS:
            fails.append(f"obs<{MIN_PRICE_OBS}")
        fails.extend(semantic_price_fails(p))
        if p.get("median_value") is None:
            fails.append("no_median")
        if not p.get("warning"):
            fails.append("no_warning")
        conf = float(p.get("comparison_confidence") or 0)
        if conf and conf < MIN_PRICE_COMPARISON_CONF:
            fails.append(f"comparison_confidence<{MIN_PRICE_COMPARISON_CONF}")
        if not p.get("comparison_group") and conf == 0:
            # legacy snapshot without comparison keys — require explicit warning + enough obs
            if p.get("observation_count", 0) < 20:
                fails.append("no_comparison_group")
        flags = p.get("heterogeneity_flags") or []
        if any("contaminated" in str(f) or "mixed" in str(f) for f in flags):
            fails.append("heterogeneous_comparison_group")
        arch = p.get("object_pattern")
        evidence = min(1.0, p.get("observation_count", 0) / 35)
        comparability = conf if conf else (0.5 if p.get("observation_count", 0) >= 20 else 0.2)
        fresh, fresh_fails = freshness_quality(manifest, "price", p)
        fails.extend(fresh_fails)
        n_ex = len(p.get("public_examples") or [])
        diff = min(1.0, 0.3 + 0.15 * n_ex + (0.2 if p.get("dispersion_iqr") else 0))
        icp = icp_similarity(
            {
                "archetype_known": 1.0 if arch in archetypes else 0.35,
                "observation_norm": min(1.0, p.get("observation_count", 0) / 40),
                "multi_buyer": 0.5,
            },
            icp_sig,
        )
        breakdown = score_components(
            icp_fit=icp,
            intent_clarity=0.9,
            evidence_strength=evidence,
            class_confidence=0.9 if arch in archetypes else 0.4,
            comparability=comparability,
            freshness=fresh,
            differentiation=diff,
            service_cta=0.92,
        )
        score = total_from_breakdown(breakdown)
        status = decide_status(score, fails)
        url = f"/inteligencia/precos/{p['slug']}/"
        cands.append(
            Candidate(
                page_id=p["id"],
                page_type="price",
                url=url,
                title=f"Faixa de valores de contratos: {_clean_price_label(p.get('object_label'))} em {_clean_price_label(p.get('region_label'))} | CONFENGE",
                h1=f"Valores de contratos — {_clean_price_label(p.get('object_label'))} ({_clean_price_label(p.get('region_label'))})",
                description=(
                    f"Faixa de valores contratuais de {_clean_price_label(p.get('object_label'))} em {_clean_price_label(p.get('region_label'))}: "
                    f"mediana, P25 e P75 com {p['observation_count']} contratos primários. "
                    f"Tickets contratuais integrais — não são preços unitários."
                ),
                archetype=arch,
                segment=_clean_price_label(p.get("object_label")),
                region=p.get("region"),
                agency_id=None,
                intent="estimar_valores_dispersao",
                score=score,
                status=status,
                reasons=[*(fails or ["gates_ok"]), f"score={score}"],
                score_breakdown=breakdown,
                observation_count=int(p.get("observation_count") or 0),
                sources=list(p.get("sources") or []),
                cta_label="Validar preço, risco e margem",
                cta_intent="validar_preco_margem",
                related_urls=[
                    "/inteligencia/precos/",
                    "/auditoria-orcamento-licitacao/",
                    "/diagnostico-pre-licitacao/",
                ],
                data_ref=p,
                body_text=_price_body_fingerprint(p),
                mandatory_fail=fails,
                quality_eligible=status == "publish",
            )
        )

    for c in competition:
        fails = []
        if c.get("contract_count", 0) < MIN_MARKET_CONTRACTS:
            fails.append(f"contracts<{MIN_MARKET_CONTRACTS}")
        if c.get("supplier_count", 0) < 3:
            fails.append("suppliers<3")
        evidence = min(
            1.0,
            (c.get("supplier_count", 0) / 12) * 0.5
            + (c.get("contract_count", 0) / 30) * 0.35
            + (c.get("agencies_with_activity", 0) / 8) * 0.15,
        )
        arch = _arch_from_slug(c.get("slug"), archetypes)
        fresh, fresh_fails = freshness_quality(manifest, "competition", c)
        fails.extend(fresh_fails)
        n_sup = len(c.get("observed_suppliers") or [])
        diff = min(1.0, 0.35 + 0.08 * n_sup)
        icp = icp_similarity(
            {
                "archetype_known": 0.9 if arch in archetypes else 0.35,
                "observation_norm": min(1.0, c.get("contract_count", 0) / 40),
                "multi_buyer": min(1.0, (c.get("agencies_with_activity") or 0) / 8),
            },
            icp_sig,
        )
        breakdown = score_components(
            icp_fit=icp,
            intent_clarity=0.88,
            evidence_strength=evidence,
            class_confidence=0.85 if arch in archetypes else 0.4,
            comparability=0.6,
            freshness=fresh,
            differentiation=diff,
            service_cta=0.85,
        )
        score = total_from_breakdown(breakdown)
        status = decide_status(score, fails)
        url = f"/inteligencia/concorrencia/{c['slug']}/"
        cands.append(
            Candidate(
                page_id=c["id"],
                page_type="competition",
                url=url,
                title=f"Concorrência observada: {c['segment']} em {c['region_label']} | CONFENGE",
                h1=f"Fornecedores observados em {c['segment']} — {c['region_label']}",
                description=(
                    f"Concorrência observada em {c['segment']} ({c['region_label']}): "
                    f"{c['supplier_count']} fornecedores e {c['contract_count']} contratos "
                    f"no recorte público — sem juízo de qualidade."
                ),
                archetype=arch,
                segment=c.get("segment"),
                region=c.get("region"),
                agency_id=None,
                intent="compreender_concorrencia",
                score=score,
                status=status,
                reasons=[*(fails or ["gates_ok"]), f"score={score}"],
                score_breakdown=breakdown,
                observation_count=int(c.get("contract_count") or 0),
                sources=list(c.get("sources") or []),
                cta_label="Solicitar um mapa aplicado à minha empresa",
                cta_intent="mapa_concorrencia",
                related_urls=[
                    f"/inteligencia/mercados/{c['slug']}/",
                    "/inteligencia/concorrencia/",
                    "/diagnostico-pre-licitacao/",
                ],
                data_ref=c,
                body_text=_comp_body_fingerprint(c),
                mandatory_fail=fails,
                quality_eligible=status == "publish",
            )
        )

    for o in opportunities:
        fails = []
        open_n = int(o.get("open_count") or 0)
        if open_n < MIN_RADAR_OPEN:
            fails.append(f"open<{MIN_RADAR_OPEN}")
        fails.extend(semantic_radar_fails(o))
        if not o.get("as_of") and not o.get("verified_at"):
            fails.append("no_as_of")
        # Never treat historical as open
        hist = int(o.get("historical_count") or 0)
        if open_n > 0 and hist > 0 and open_n == hist:
            # suspicious: open equals full history
            fails.append("open_equals_historical_suspect")
        arch = _arch_from_slug(o.get("slug"), archetypes)
        evidence = min(1.0, open_n / 8)
        fresh, fresh_fails = freshness_quality(manifest, "radar", o)
        fails.extend(fresh_fails)
        # Validate items have end dates >= as_of when present
        as_of = o.get("as_of") or o.get("verified_at")
        bad_items = 0
        for it in o.get("items") or []:
            end = it.get("data_encerramento")
            if end and as_of and str(end)[:10] < str(as_of)[:10]:
                bad_items += 1
        if bad_items:
            fails.append(f"stale_items_in_open_list={bad_items}")
        n_items = len(o.get("items") or [])
        diff = min(1.0, 0.3 + 0.05 * n_items)
        icp = icp_similarity(
            {
                "archetype_known": 0.8 if arch in archetypes else 0.3,
                "observation_norm": min(1.0, open_n / 10),
                "multi_buyer": 0.5,
            },
            icp_sig,
        )
        breakdown = score_components(
            icp_fit=icp,
            intent_clarity=0.95,
            evidence_strength=evidence,
            class_confidence=0.8 if arch in archetypes else 0.35,
            comparability=0.5,
            freshness=fresh,
            differentiation=diff,
            service_cta=0.95,
        )
        score = total_from_breakdown(breakdown)
        status = decide_status(score, fails)
        url = f"/radar/{o['slug']}/"
        cands.append(
            Candidate(
                page_id=o["id"],
                page_type="radar",
                url=url,
                title=f"Radar de oportunidades: {o['segment']} em {o['region_label']} | CONFENGE",
                h1=f"Oportunidades abertas em {o['segment']} — {o['region_label']}",
                description=(
                    f"Radar de {o['segment']} em {o['region_label']}: "
                    f"{open_n} oportunidades abertas "
                    f"(verificado em {as_of}). Página evergreen — não é URL por edital."
                ),
                archetype=arch,
                segment=o.get("segment"),
                region=o.get("region"),
                agency_id=None,
                intent="avaliar_oportunidades",
                score=score,
                status=status,
                reasons=[*(fails or ["gates_ok"]), f"score={score}"],
                score_breakdown=breakdown,
                observation_count=open_n,
                sources=list(o.get("sources") or []),
                cta_label="Analisar este edital antes da proposta",
                cta_intent="analisar_edital",
                related_urls=(
                    (
                        [f"/inteligencia/mercados/{o['related_market_slug']}/"]
                        if o.get("related_market_slug")
                        else []
                    )
                    + [
                        "/diagnostico-pre-licitacao/",
                        "/auditoria-orcamento-licitacao/",
                    ]
                ),
                data_ref=o,
                body_text=_radar_body_fingerprint(o),
                mandatory_fail=fails,
                quality_eligible=status == "publish",
            )
        )

    for p in problems:
        fails = []
        fails.extend(semantic_problem_fails(p))
        ev = p.get("evidence_count") or 0
        # Generic evidence_count alone never proves a specific claim.
        # Keep a soft observation floor only when direct signals exist.
        has_direct = bool(
            p.get("claim_evidence")
            or p.get("direct_evidence")
            or p.get("evidence_signals")
            or p.get("amendment_count")
            or p.get("reference_mentions")
            or p.get("document_divergence_count")
        )
        if has_direct and ev < MIN_PROBLEM_EVIDENCE:
            fails.append(f"evidence<{MIN_PROBLEM_EVIDENCE}")
        if not has_direct:
            fails.append("no_claim_specific_evidence")
        if not p.get("technical_guide_paths"):
            fails.append("no_guides")
        if not p.get("confenge_service_slug"):
            fails.append("no_service")
        arches = p.get("related_archetypes") or []
        icp = icp_similarity(
            {
                "archetype_known": 0.9 if any(a in archetypes for a in arches) else 0.3,
                "observation_norm": min(1.0, (ev or 0) / 60),
                "multi_buyer": 0.5,
            },
            icp_sig,
        )
        evidence = min(1.0, (ev or 0) / 50)
        fresh, fresh_fails = freshness_quality(manifest, "problem_service", p)
        fails.extend(fresh_fails)
        breakdown = score_components(
            icp_fit=icp,
            intent_clarity=0.9,
            evidence_strength=evidence,
            class_confidence=0.75,
            comparability=0.5,
            freshness=fresh * 0.9,
            differentiation=0.95,  # unique problem themes
            service_cta=1.0,
        )
        score = total_from_breakdown(breakdown)
        status = decide_status(score, fails)
        url = f"/inteligencia/cenarios/{p['slug']}/"
        cands.append(
            Candidate(
                page_id=p["id"],
                page_type="problem_service",
                url=url,
                title=f"{p['problem_label']} | CONFENGE",
                h1=p["problem_label"],
                description=(p.get("observed_pattern") or "")[:160],
                archetype=arches[0] if arches else None,
                segment=p.get("theme"),
                region=None,
                agency_id=None,
                intent="proteger_margem_proposta_contrato",
                score=score,
                status=status,
                reasons=[*(fails or ["gates_ok"]), f"score={score}"],
                score_breakdown=breakdown,
                observation_count=int(ev or 0),
                sources=list(p.get("sources") or []),
                cta_label="Organizar documentos e próximos passos",
                cta_intent="organizar_documentos",
                related_urls=list(p.get("technical_guide_paths") or [])[:4]
                + [f"/{p['confenge_service_slug']}/"],
                data_ref=p,
                body_text=(p.get("observed_pattern") or "") + " " + (p.get("problem_label") or ""),
                mandatory_fail=fails,
                quality_eligible=status == "publish",
            )
        )

    for c in cands:
        c.description = _soft_meta(c.description)

    return cands


def _arch_from_slug(slug: str | None, archetypes: dict[str, Any]) -> str | None:
    if not slug:
        return None
    best = None
    for aid in archetypes:
        if slug.startswith(aid + "-") or slug == aid:
            if best is None or len(aid) > len(best):
                best = aid
    return best


def _market_related(m, market_by_slug, prices, competition, opportunities) -> list[str]:
    slug = m["slug"]
    # Map mesh_slug → real price slug (comparison groups may differ from market slug)
    price_by_mesh = {}
    for p in prices or []:
        if p.get("slug"):
            price_by_mesh[p["slug"]] = p["slug"]
        if p.get("mesh_slug"):
            price_by_mesh[p["mesh_slug"]] = p["slug"]
    comp_slugs = {c.get("slug") for c in (competition or [])}
    opp_slugs = {o.get("slug") for o in (opportunities or [])}
    urls: list[str] = []
    if slug in price_by_mesh:
        urls.append(f"/inteligencia/precos/{price_by_mesh[slug]}/")
    if slug in comp_slugs:
        urls.append(f"/inteligencia/concorrencia/{slug}/")
    if slug in opp_slugs:
        urls.append(f"/radar/{slug}/")
    urls.extend(
        [
            "/inteligencia/mercados/",
            "/diagnostico-pre-licitacao/",
            "/auditoria-orcamento-licitacao/",
        ]
    )
    return urls[:8]


def _agency_related(a, markets) -> list[str]:
    urls = [
        "/inteligencia/orgaos/",
        "/diagnostico-pre-licitacao/",
        "/auditoria-orcamento-licitacao/",
    ]
    uf = a.get("uf")
    mix = a.get("archetype_mix") or []
    market_slugs = {m.get("slug") for m in (markets or [])}
    if mix and uf:
        slug = f"{mix[0]['archetype_id']}-{str(uf).lower()}"
        if slug in market_slugs:
            urls.insert(0, f"/inteligencia/mercados/{slug}/")
        urls.insert(1, f"/radar/{slug}/")
    return urls[:8]


def resolve_related_urls(
    cands: list[Candidate],
    *,
    site_root: Path | None = None,
) -> list[Candidate]:
    from pathlib import Path as _Path

    root = _Path(site_root) if site_root else None
    written = {c.url for c in cands if c.status != "reject"}
    hubs = {
        "/inteligencia/",
        "/inteligencia/mercados/",
        "/inteligencia/orgaos/",
        "/inteligencia/precos/",
        "/inteligencia/concorrencia/",
        "/inteligencia/cenarios/",
        "/radar/",
        "/conteudos/",
        "/diagnostico-pre-licitacao/",
        "/auditoria-orcamento-licitacao/",
        "/medicoes-glosas-obras-publicas/",
        "/aditivos-obras-publicas/",
        "/reequilibrio-obras-publicas/",
        "/atrasos-prorrogacao-obras-publicas/",
        "/defesa-tecnica-contratos-publicos/",
        "/acompanhamento-contratos-obras/",
        "/especialista/tiago-jun-sasaki/",
    }

    def exists(url: str) -> bool:
        if not url or not url.startswith("/"):
            return False
        path_only = url.split("?", 1)[0].split("#", 1)[0]
        if not path_only.endswith("/"):
            path_only = path_only + "/"
        if path_only in written or path_only in hubs:
            return True
        if root is None:
            return path_only in hubs
        rel = path_only.strip("/")
        if (root / rel / "index.html").exists():
            return True
        if (root / f"{rel}.html").exists():
            return True
        return False

    type_hub = {
        "market": "/inteligencia/mercados/",
        "agency": "/inteligencia/orgaos/",
        "price": "/inteligencia/precos/",
        "competition": "/inteligencia/concorrencia/",
        "radar": "/radar/",
        "problem_service": "/inteligencia/cenarios/",
    }

    for c in cands:
        if c.status == "reject":
            c.related_urls = []
            continue
        kept: list[str] = []
        for u in c.related_urls or []:
            u0 = u.split("?", 1)[0].split("#", 1)[0]
            if exists(u0):
                nu = u0
                if nu.startswith("/") and not nu.endswith("/") and not nu.endswith(".html"):
                    if exists(nu + "/"):
                        nu = nu + "/"
                if nu not in kept:
                    kept.append(nu)
        fallbacks = [
            type_hub.get(c.page_type, "/inteligencia/"),
            "/inteligencia/",
            "/diagnostico-pre-licitacao/",
            "/auditoria-orcamento-licitacao/",
            "/conteudos/",
        ]
        for fb in fallbacks:
            if len(kept) >= 3:
                break
            if exists(fb) and fb not in kept and fb != c.url:
                kept.append(fb)
        c.related_urls = kept[:8]
    return cands


def _market_body_fingerprint(m: dict[str, Any]) -> str:
    parts = [
        m.get("segment", ""),
        m.get("region_label", ""),
        str(m.get("contract_count")),
        str(m.get("median_value")),
        " ".join(t.get("label", "") for t in (m.get("top_objects") or [])[:5]),
        " ".join(b.get("name", "") or "" for b in (m.get("top_buyers") or [])[:5]),
        " ".join(m.get("interpretation_hooks") or []),
    ]
    return " ".join(parts)


def _agency_body_fingerprint(a: dict[str, Any]) -> str:
    return " ".join(
        [
            a.get("agency_name") or "",
            a.get("municipio") or "",
            str(a.get("contract_count")),
            str(a.get("median_value")),
            " ".join(o.get("label", "") for o in (a.get("top_objects") or [])[:5]),
            " ".join(a.get("practical_notes") or []),
        ]
    )


def _price_body_fingerprint(p: dict[str, Any]) -> str:
    return " ".join(
        [
            p.get("object_label") or "",
            p.get("region_label") or "",
            str(p.get("median_value")),
            str(p.get("p25_value")),
            str(p.get("p75_value")),
            p.get("comparison_group") or "",
            p.get("warning") or "",
            " ".join(x.get("objeto", "")[:40] for x in (p.get("public_examples") or [])[:3]),
        ]
    )


def _comp_body_fingerprint(c: dict[str, Any]) -> str:
    return " ".join(
        [
            c.get("segment") or "",
            c.get("region_label") or "",
            str(c.get("supplier_count")),
            str(c.get("concentration_top3_share")),
            " ".join(s.get("display_name", "") for s in (c.get("observed_suppliers") or [])[:5]),
            c.get("language_note") or "",
        ]
    )


def _radar_body_fingerprint(o: dict[str, Any]) -> str:
    return " ".join(
        [
            o.get("segment") or "",
            o.get("region_label") or "",
            str(o.get("open_count")),
            o.get("as_of") or "",
            " ".join((i.get("objeto") or "")[:50] for i in (o.get("items") or [])[:5]),
        ]
    )
