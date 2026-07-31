"""indexability_score (0–100) and publication gates for pSEO candidates."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Weights (sum 100)
W_ICP = 25
W_INTENT = 20
W_EVIDENCE = 20
W_FRESHNESS = 15
W_DIFF = 10
W_SERVICE = 10

# Sample minima by type
MIN_MARKET_CONTRACTS = 15
MIN_MARKET_BUYERS = 3
MIN_PRICE_OBS = 20
MIN_AGENCY_CONTRACTS = 12
MIN_RADAR_OPEN = 3
MIN_PROBLEM_EVIDENCE = 15

PUBLISH_MIN = 80
PREVIEW_MIN = 65


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
    status: str  # publish | noindex | reject
    reasons: list[str] = field(default_factory=list)
    score_breakdown: dict[str, int] = field(default_factory=dict)
    observation_count: int = 0
    sources: list[str] = field(default_factory=list)
    cta_label: str = ""
    cta_intent: str = ""
    related_urls: list[str] = field(default_factory=list)
    data_ref: dict[str, Any] = field(default_factory=dict)
    body_text: str = ""  # for similarity
    mandatory_fail: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "page_id": self.page_id,
            "page_type": self.page_type,
            "url": self.url,
            "title": self.title,
            "h1": self.h1,
            "description": self.description,
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
        }


def _clamp(n: int, lo: int = 0, hi: int = 100) -> int:
    return max(lo, min(hi, n))


def score_components(
    *,
    icp_fit: float,
    intent_clarity: float,
    evidence_strength: float,
    freshness: float,
    differentiation: float,
    service_cta: float,
) -> dict[str, int]:
    """Each input 0.0–1.0."""
    return {
        "icp_adherence": int(round(icp_fit * W_ICP)),
        "commercial_intent": int(round(intent_clarity * W_INTENT)),
        "evidence": int(round(evidence_strength * W_EVIDENCE)),
        "freshness": int(round(freshness * W_FRESHNESS)),
        "differentiation": int(round(differentiation * W_DIFF)),
        "service_cta": int(round(service_cta * W_SERVICE)),
    }


def total_from_breakdown(b: dict[str, int]) -> int:
    return _clamp(sum(b.values()))


def decide_status(score: int, mandatory_fail: list[str]) -> str:
    if mandatory_fail:
        return "reject"
    if score >= PUBLISH_MIN:
        return "publish"
    if score >= PREVIEW_MIN:
        return "noindex"
    return "reject"


def build_candidates(data: dict[str, Any], manifest: dict[str, Any]) -> list[Candidate]:
    """Turn snapshot tables into scored page candidates."""
    archetypes = {a["id"]: a for a in data.get("archetypes") or []}
    markets = data.get("markets") or []
    agencies = data.get("agencies") or []
    prices = data.get("prices") or []
    competition = data.get("competition") or []
    opportunities = data.get("opportunities") or []
    problems = data.get("problem_service") or []

    freshness_q = _freshness_quality(manifest)
    cands: list[Candidate] = []

    market_by_slug = {m["slug"]: m for m in markets}

    for m in markets:
        fails = []
        if m.get("contract_count", 0) < MIN_MARKET_CONTRACTS:
            fails.append(f"contracts<{MIN_MARKET_CONTRACTS}")
        if m.get("buyer_count", 0) < MIN_MARKET_BUYERS:
            fails.append(f"buyers<{MIN_MARKET_BUYERS}")
        if not m.get("sources"):
            fails.append("no_sources")
        arch = m.get("archetype_id")
        icp = 1.0 if arch in archetypes else 0.5
        evidence = min(1.0, (m.get("contract_count", 0) / 40) * 0.6 + (m.get("buyer_count", 0) / 10) * 0.4)
        breakdown = score_components(
            icp_fit=icp,
            intent_clarity=0.95,
            evidence_strength=evidence,
            freshness=freshness_q,
            differentiation=0.85,
            service_cta=0.9 if arch and archetypes.get(arch, {}).get("confenge_service_slugs") else 0.4,
        )
        score = total_from_breakdown(breakdown)
        status = decide_status(score, fails)
        reasons = list(fails) if fails else [f"score={score}"]
        if status == "publish":
            reasons.append("gates_ok_high_score")
        elif status == "noindex":
            reasons.append("preview_band")
        else:
            reasons.append("below_threshold_or_gate")
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
            )
        )

    for a in agencies:
        fails = []
        if a.get("contract_count", 0) < MIN_AGENCY_CONTRACTS:
            fails.append(f"contracts<{MIN_AGENCY_CONTRACTS}")
        if not a.get("sources"):
            fails.append("no_sources")
        # need archetype mix
        mix = a.get("archetype_mix") or []
        primary = mix[0]["archetype_id"] if mix else None
        icp = 0.9 if primary in archetypes else 0.55
        evidence = min(1.0, a.get("contract_count", 0) / 30)
        breakdown = score_components(
            icp_fit=icp,
            intent_clarity=0.92,
            evidence_strength=evidence,
            freshness=freshness_q,
            differentiation=0.9,
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
                title=f"{a['agency_name']}: histórico de contratação em engenharia | CONFENGE",
                h1=f"Contratação de engenharia em {a['agency_name']}: o que os dados públicos mostram",
                description=(
                    f"Dossiê de comprador: {a['contract_count']} contratos classificados, "
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
            )
        )

    for p in prices:
        fails = []
        if p.get("observation_count", 0) < MIN_PRICE_OBS:
            fails.append(f"obs<{MIN_PRICE_OBS}")
        if p.get("median_value") is None:
            fails.append("no_median")
        if not p.get("warning"):
            fails.append("no_warning")
        arch = p.get("object_pattern")
        evidence = min(1.0, p.get("observation_count", 0) / 35)
        breakdown = score_components(
            icp_fit=1.0 if arch in archetypes else 0.5,
            intent_clarity=0.97,
            evidence_strength=evidence,
            freshness=freshness_q,
            differentiation=0.88,
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
                title=f"Benchmark de valores: {p['object_label']} em {p['region_label']} | CONFENGE",
                h1=f"Dispersão de valores contratados — {p['object_label']} ({p['region_label']})",
                description=(
                    f"Benchmark {p['object_label']} em {p['region_label']}: "
                    f"mediana, P25 e P75 com {p['observation_count']} observações públicas. "
                    f"Não use como preço unitário cego."
                ),
                archetype=arch,
                segment=p.get("object_label"),
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
                    f"/inteligencia/mercados/{p['slug']}/",
                    f"/inteligencia/concorrencia/{p['slug']}/",
                    f"/radar/{p['slug']}/",
                    "/inteligencia/precos/",
                    "/auditoria-orcamento-licitacao/",
                ],
                data_ref=p,
                body_text=_price_body_fingerprint(p),
                mandatory_fail=fails,
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
        breakdown = score_components(
            icp_fit=0.9 if arch in archetypes else 0.5,
            intent_clarity=0.92,
            evidence_strength=evidence,
            freshness=freshness_q,
            differentiation=0.88,
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
                    f"/inteligencia/precos/{c['slug']}/",
                    f"/radar/{c['slug']}/",
                    "/inteligencia/concorrencia/",
                    "/diagnostico-pre-licitacao/",
                ],
                data_ref=c,
                body_text=_comp_body_fingerprint(c),
                mandatory_fail=fails,
            )
        )

    for o in opportunities:
        fails = []
        if o.get("open_count", 0) < MIN_RADAR_OPEN:
            fails.append(f"open<{MIN_RADAR_OPEN}")
        if not o.get("as_of"):
            fails.append("no_as_of")
        arch = _arch_from_slug(o.get("slug"), archetypes)
        evidence = min(1.0, o.get("open_count", 0) / 8)
        breakdown = score_components(
            icp_fit=0.8 if arch in archetypes else 0.45,
            intent_clarity=0.98,
            evidence_strength=evidence,
            freshness=min(1.0, freshness_q + 0.1),
            differentiation=0.7,
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
                    f"{o['open_count']} oportunidades classificadas "
                    f"(atualizado em {o.get('as_of')}). Página evergreen — não é URL por edital."
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
                observation_count=int(o.get("open_count") or 0),
                sources=list(o.get("sources") or []),
                cta_label="Analisar este edital antes da proposta",
                cta_intent="analisar_edital",
                related_urls=[
                    f"/inteligencia/mercados/{o.get('related_market_slug') or o['slug']}/",
                    "/diagnostico-pre-licitacao/",
                    "/auditoria-orcamento-licitacao/",
                ],
                data_ref=o,
                body_text=_radar_body_fingerprint(o),
                mandatory_fail=fails,
            )
        )

    for p in problems:
        fails = []
        ev = p.get("evidence_count") or 0
        if ev < MIN_PROBLEM_EVIDENCE:
            fails.append(f"evidence<{MIN_PROBLEM_EVIDENCE}")
        if not p.get("technical_guide_paths"):
            fails.append("no_guides")
        if not p.get("confenge_service_slug"):
            fails.append("no_service")
        arches = p.get("related_archetypes") or []
        icp = 0.9 if any(a in archetypes for a in arches) else 0.4
        evidence = min(1.0, (ev or 0) / 50)
        breakdown = score_components(
            icp_fit=icp,
            intent_clarity=0.93,
            evidence_strength=evidence,
            freshness=freshness_q * 0.9,
            differentiation=0.95,
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
            )
        )

    return cands


def _freshness_quality(manifest: dict[str, Any]) -> float:
    fr = manifest.get("freshness") or {}
    # If we have a recent period_end within ~1 year of generated_at, good
    end = fr.get("data_period_end") or ""
    gen = (manifest.get("generated_at") or "")[:10]
    if end and gen:
        try:
            from datetime import date

            d_end = date.fromisoformat(str(end)[:10])
            d_gen = date.fromisoformat(gen)
            delta = abs((d_gen - d_end).days)
            if delta <= 60:
                return 1.0
            if delta <= 180:
                return 0.85
            if delta <= 365:
                return 0.65
            return 0.4
        except Exception:
            return 0.6
    return 0.5


def _arch_from_slug(slug: str | None, archetypes: dict[str, Any]) -> str | None:
    if not slug:
        return None
    # try longest archetype id prefix
    best = None
    for aid in archetypes:
        if slug.startswith(aid + "-") or slug == aid:
            if best is None or len(aid) > len(best):
                best = aid
    return best


def _market_related(m, market_by_slug, prices, competition, opportunities) -> list[str]:
    """Candidate sibling URLs — filtered later by build.resolve_related_urls against live pages."""
    slug = m["slug"]
    price_slugs = {p.get("slug") for p in (prices or [])}
    comp_slugs = {c.get("slug") for c in (competition or [])}
    opp_slugs = {o.get("slug") for o in (opportunities or [])}
    urls: list[str] = []
    if slug in price_slugs:
        urls.append(f"/inteligencia/precos/{slug}/")
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
    """Candidate sibling URLs — filtered later by build.resolve_related_urls."""
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
        urls.insert(1, f"/radar/{slug}/")  # may be stripped if not written
    return urls[:8]


def resolve_related_urls(
    cands: list[Candidate],
    *,
    site_root: Path | None = None,
) -> list[Candidate]:
    """Keep only related URLs that exist on disk or will be written this build.

    Prevents dead mesh links to sibling price/radar pages that failed gates.
    """
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
        # strip query/hash for existence
        path_only = url.split("?", 1)[0].split("#", 1)[0]
        if not path_only.endswith("/"):
            path_only = path_only + "/"
        if path_only in written or path_only in hubs:
            return True
        if root is None:
            return path_only in hubs
        # filesystem: directory index or direct file
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
            # normalize
            u0 = u.split("?", 1)[0].split("#", 1)[0]
            if not u0.endswith("/") and u0.startswith("/"):
                # keep guide paths that already end without slash if file exists
                pass
            if exists(u0):
                nu = u0 if u0.endswith("/") or not u0.startswith("/") else u0
                # prefer trailing slash form for dirs
                if nu.startswith("/") and not nu.endswith("/") and not nu.endswith(".html"):
                    if exists(nu + "/"):
                        nu = nu + "/"
                if nu not in kept:
                    kept.append(nu)
        # ensure minimum mesh via hubs/services
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
