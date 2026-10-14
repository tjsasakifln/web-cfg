#!/usr/bin/env python3
"""Build static pSEO pages from data/pseo snapshot. Fail-closed on bad data.

Indexation policy (no artificial page cap):
  if mandatory_fail -> reject
  elif human_review not in APPROVED|APPROVED_WITH_NOTES -> noindex
  elif quality_gates_passed (score/status eligible) -> publish
  else -> noindex | reject | consolidated
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import date
from html import escape
from pathlib import Path
from typing import Any
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.render import render_candidate, render_hub # noqa: E402
from scripts.pseo.schema import SnapshotError, validate_snapshot # noqa: E402
from scripts.pseo.score import (# noqa: E402
    APPROVED_REVIEWS,
    Candidate,
    apply_human_review_gate,
    build_candidates,
    resolve_related_urls,
)
from scripts.pseo.similarity import find_similar_pairs # noqa: E402
from scripts.site.scrub_em_dashes import scrub_html # noqa: E402

SITE = "https://confenge.com.br"
SIM_THRESHOLD = 0.88
MARKET_INTELLIGENCE_MATERIAL_DATE = "2026-10-14"
MARKET_INTELLIGENCE_COMMERCIAL_ROUTES = (
    "/inteligencia/",
    "/inteligencia/orgaos/",
    "/inteligencia/mercados/",
    "/inteligencia/concorrencia/",
    "/inteligencia/acompanhamento/",
    "/inteligencia/precos/",
    "/inteligencia/pesquisa-sob-encomenda/",
)

# Public analyses only enter this list after their checked-in evidence, method and
# technical verification are approved. The entries below are generated from the
# dated, non-census PNCP sample in data/pseo/market-intelligence-sample.v1.json.
MARKET_INTELLIGENCE_APPROVED_ANALYSES: tuple[tuple[str, str, str], ...] = (
    (
        "/inteligencia/relacoes-compradores-fornecedores/",
        "Relações documentadas entre compradores e fornecedores",
        "Dez pares públicos conferidos contrato a contrato no PNCP, com identidade legal e limites explícitos de interpretação.",
    ),
    (
        "/inteligencia/composicao-contratos-amostra/",
        "Composição de uma amostra de contratos públicos",
        "Categorias, UFs compradoras, calendário, vigência e valores integrais dos dez contratos verificados.",
    ),
)
MARKET_INTELLIGENCE_PUBLIC_ROUTES = MARKET_INTELLIGENCE_COMMERCIAL_ROUTES + tuple(
    route for route, _title, _summary in MARKET_INTELLIGENCE_APPROVED_ANALYSES
)


def write_public_html(path: Path, html: str) -> None:
    """Write visitor HTML after the shipped em-dash scrubber."""
    path.write_text(scrub_html(html), encoding="utf-8")


def _market_intelligence_hero_cta(
    asset_id: str, label: str, proof_href: str, proof_label: str
) -> dict[str, str]:
    return {
        "cta_id": f"{asset_id}-hero",
        "route_family": "inteligencia-mercado",
        "journey": "outro",
        "intent": "market_research_scope",
        "href": "#captura-estudo",
        "label": label,
        "secondary_href": proof_href,
        "secondary_label": proof_label,
    }


def _market_intelligence_next_step(label: str) -> dict[str, str]:
    return {
        "title": "A proposta começa pela decisão e pelo recorte.",
        "body": (
            "Explique o que precisa decidir e o que já sabe sobre produto, setor, "
            "território ou carteira. A CONFENGE verifica a aderência, delimita fontes, "
            "entregas, revisões e direitos de uso e então prepara a proposta."
        ),
        "primary_label": label,
        "primary_href": "#captura-estudo",
        "secondary_label": "Conhecer o método de pesquisa",
        "secondary_href": "/metodologia-inteligencia/",
    }


def _market_intelligence_capture(
    *, path: str, asset_id: str, heading: str, prompt: str, button: str,
    analysis_cutoff: str = "",
    evidence_pack_version: str = "",
) -> str:
    from scripts.pseo.html_shell import wa_link

    route = path if path.endswith("/") else f"{path}/"
    landing = f"{SITE}{route}"
    cta_id = f"{asset_id}-capture"
    whatsapp = wa_link(
        "Olá, CONFENGE. Quero contratar uma pesquisa de mercado. "
        f"Minha necessidade é: {prompt.lower()}"
    )
    email_subject = quote(f"Pesquisa de mercado: {heading}")
    analysis_attr = (
        f' data-analysis-cutoff="{escape(analysis_cutoff)}"' if analysis_cutoff else ""
    )
    analysis_field = (
        f'<input type="hidden" name="analysis_cutoff" value="{escape(analysis_cutoff)}">'
        if analysis_cutoff else ""
    )
    evidence_attr = (
        f' data-evidence-pack-version="{escape(evidence_pack_version)}"'
        if evidence_pack_version else ""
    )
    evidence_field = (
        f'<input type="hidden" name="evidence_pack_version" value="{escape(evidence_pack_version)}">'
        if evidence_pack_version else ""
    )
    return rf'''<section aria-labelledby="captura-estudo-title" class="sec pillar-capture" id="captura-estudo">
<div class="container pillar-capture-grid"><div class="pillar-capture-copy">
<span class="t-kicker">Solicitar proposta</span><h2 class="t-editorial" id="captura-estudo-title">{escape(heading)}</h2>
<p>{escape(prompt)} Comece com o contexto disponível. Não envie carteira, documentos sigilosos nem dados pessoais de terceiros neste primeiro contato.</p>
<div class="contact-primary"><a class="button button-secondary" data-cta-id="{escape(asset_id)}-whatsapp" data-fallback-channel="whatsapp" data-route-family="inteligencia-mercado" data-journey="outro" data-intent="market_research_scope" href="{escape(whatsapp)}" rel="noopener" target="_blank">Falar pelo WhatsApp</a>
<ul class="contact-alt"><li><a data-cta-id="{escape(asset_id)}-email" href="mailto:tiago.sasaki@confenge.com.br?subject={email_subject}">Enviar contexto por e-mail</a></li><li><a data-cta-id="{escape(asset_id)}-phone" href="tel:+5548988344559">Ligar: (48) 98834-4559</a></li></ul></div>
</div><form class="pillar-capture-form" name="diagnostico-confenge" method="post" action="/.netlify/functions/lead" data-capture-form data-offer-id="" data-cta-id="{escape(cta_id)}" data-asset-id="{escape(asset_id)}" data-route-family="inteligencia-mercado" data-cta-position="market_intelligence_capture" data-form-contract="next-state/v1" data-next-state-profile="service_fit_review" data-runtime-profile="shared_lead_form_v1" data-receipt-required="true" data-intent="market_research_scope"{evidence_attr}{analysis_attr}><p class="form-hint" data-form-value>Conte sua necessidade e indique um canal para retorno. Você pode começar com as informações que já tiver.</p>
<p class="form-hint" data-field-purpose>Obrigatórios: decisão e recorte, nome, um canal de retorno (WhatsApp ou e-mail) e o consentimento; os demais campos são opcionais. WhatsApp aceita DDD e 10 ou 11 dígitos; e-mail precisa de domínio e extensão completos.</p>
<noscript><p class="form-hint form-nojs-note">Sem JavaScript, este formulário não envia. Use o <a href="{escape(whatsapp, quote=True)}">WhatsApp</a> ou o <a href="mailto:tiago.sasaki@confenge.com.br">e-mail</a> ao lado.</p></noscript>
<input type="hidden" name="offer_id" value=""><input type="hidden" name="terms_id" value=""><input type="hidden" name="intent" value="market_research_scope">{evidence_field}{analysis_field}<input id="jornada-hidden" type="hidden" name="jornada" value="outro"><input id="estagio" type="hidden" name="estagio" value="pesquisa de mercado"><input type="hidden" name="origem" value="{escape(route)}"><input type="hidden" name="asset_id" value="{escape(asset_id)}"><input type="hidden" name="cta_id" value="{escape(cta_id)}"><input type="hidden" name="route_family" value="inteligencia-mercado"><input type="hidden" name="landing_page" value="{escape(landing)}">
<label>Decisão e recorte <textarea id="mensagem" name="mensagem" rows="5" maxlength="2000" required placeholder="Ex.: quero selecionar distribuidores para um produto no Sul e entender quais critérios a pesquisa pode verificar."></textarea></label>
<label>Nome <input id="nome" name="nome" required autocomplete="name"></label>
<label>Empresa <span class="optional-mark">opcional</span> <input id="empresa" name="empresa" autocomplete="organization"></label>
<label>E-mail <span class="optional-mark">informe e-mail ou WhatsApp</span> <input id="email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="180" pattern="[^@\s]+@[^@\s]+\.[A-Za-z]{{2,}}" title="Informe um e-mail completo, como nome@empresa.com.br."></label>
<label>WhatsApp <span class="optional-mark">informe WhatsApp ou e-mail</span> <input id="telefone" name="telefone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" pattern="(\+?55[\s.\-]?)?\(?\d{{2}}\)?[\s.\-]?9?\d{{4}}[\s.\-]?\d{{4}}" title="Informe DDD e número, com 10 ou 11 dígitos."></label>
<label class="capture-consent"><input type="checkbox" name="consentimento" value="1" required> Autorizo o uso destes dados para retorno sobre esta pesquisa.</label>
<div class="field turnstile-slot" id="turnstile-slot" hidden data-turnstile-sitekey=""><div class="cf-turnstile" data-theme="light" data-size="compact"></div></div>
<button class="button button-primary" type="submit">{escape(button)}</button><p class="form-status" role="status" aria-live="polite"></p>
<p class="form-hint" data-form-boundary>Compartilhe referências técnicas não sigilosas por e-mail ou WhatsApp. Para documentos confidenciais, combinamos uma forma reservada de envio. Dados usados apenas para este retorno; retenção de até 730 dias. A exclusão pode ser pedida pelos canais da <a href="/privacidade/">Política de Privacidade</a>, com o protocolo.</p>
</form></div></section>'''


def _market_intelligence_family_content(
    *, path: str, asset_id: str, decision: str, deliverables: list[tuple[str, str]],
    adaptation: list[tuple[str, str]], limits: list[str], capture_heading: str,
    capture_prompt: str, capture_button: str,
) -> str:
    deliverable_items = "".join(
        f'<li><span class="list-ruled__index">{index:02d}</span><div><h3>{escape(title)}</h3><p>{escape(text)}</p></div></li>'
        for index, (title, text) in enumerate(deliverables, 1)
    )
    adaptation_cards = "".join(
        f'<article><h3>{escape(title)}</h3><p>{escape(text)}</p></article>'
        for title, text in adaptation
    )
    limit_items = "".join(f"<li>{escape(item)}</li>" for item in limits)
    return f'''<section aria-labelledby="entrega-title" class="sec"><div class="container">
<header class="sec-head sec-head--split"><span class="t-kicker">Decisão e entrega</span><h2 class="t-editorial" id="entrega-title">{escape(decision)}</h2><p>Pesquisa preparada sob encomenda, depois de conferir sua necessidade e as fontes disponíveis. A proposta delimita fontes, recorte, método, entregas, revisão, critério de aceitação e direitos de uso. Preço e prazo dependem desse escopo.</p></header>
<ol class="list-ruled">{deliverable_items}</ol></div></section>
<section aria-labelledby="adaptacao-title" class="sec sec--soft"><div class="container"><header class="sec-head sec-head--split"><span class="t-kicker">Aplicação ao seu caso</span><h2 class="t-editorial" id="adaptacao-title">O que a pesquisa adapta à sua decisão</h2><p>Produto, território, período, carteira e documentos disponíveis mudam a pergunta e o esforço. A CONFENGE define o trabalho necessário antes de iniciar a pesquisa específica.</p></header><div class="grid-2">{adaptation_cards}</div></div></section>
<section aria-labelledby="limites-title" class="sec"><div class="container"><div class="conditions"><h2 class="t-editorial" id="limites-title">O que os dados não autorizam concluir sozinhos</h2><ul>{limit_items}</ul></div></div></section>
{_market_intelligence_capture(path=path, asset_id=asset_id, heading=capture_heading, prompt=capture_prompt, button=capture_button)}'''


def _market_intelligence_root_content() -> str:
    analyses = ""
    if MARKET_INTELLIGENCE_APPROVED_ANALYSES:
        rows = "".join(
            f'<li><span class="list-ruled__index">{index:02d}</span><div><h3><a href="{escape(url)}">{escape(title)}</a></h3><p>{escape(summary)}</p></div></li>'
            for index, (url, title, summary) in enumerate(MARKET_INTELLIGENCE_APPROVED_ANALYSES, 1)
        )
        analyses = f'''<section aria-labelledby="analises-publicas-title" class="sec sec--soft"><div class="container"><header class="sec-head sec-head--split"><span class="t-kicker">Análises públicas</span><h2 class="t-editorial" id="analises-publicas-title">Veja o método aplicado a perguntas reais</h2><p>Cada análise informa recorte, fontes, corte, método e limites. A publicação demonstra a pesquisa e não revela carteira ou dados reservados de clientes.</p></header><ol class="list-ruled">{rows}</ol></div></section>'''
    return f'''<section aria-labelledby="contratacao-inteligencia-title" class="sec"><div class="container"><header class="sec-head sec-head--split"><span class="t-kicker">Como contratar</span><h2 class="t-editorial" id="contratacao-inteligencia-title">Uma pergunta de negócio, um recorte verificável e uma entrega definida</h2><p>A CONFENGE usa registros públicos, documentos e fontes adequadas à pergunta. A proposta informa o que será pesquisado, como a conclusão será revista e o que chega às mãos do contratante.</p></header><div class="grid-2"><article><h3>Estudo avulso</h3><p>Decisão, período, território, fontes e entrega fechados para uma necessidade específica.</p></article><article><h3>Seleção conforme seu produto e território</h3><p>Conferência de documentos e seleção de organizações conforme produto, restrições, território e carteira fornecida pelo contratante, com conclusões reservadas.</p></article><article><h3>Atualização contratada</h3><p>Novo corte ou acompanhamento com frequência e escopo definidos quando a fonte e a operação permitirem.</p></article><article><h3>Uso institucional</h3><p>Pesquisa para consultorias, associações, redes e fabricantes, com finalidade e direitos de uso descritos na proposta.</p></article></div></div></section>
<section aria-labelledby="escopo-inteligencia-title" class="sec sec--soft"><div class="container"><div class="conditions"><h2 class="t-editorial" id="escopo-inteligencia-title">O escopo considera</h2><ul><li>A decisão que o estudo precisa apoiar.</li><li>O recorte de produto, categoria, território e período.</li><li>As fontes e os documentos que podem responder à pergunta.</li><li>A profundidade da conferência e da revisão.</li><li>O formato da entrega e os direitos de uso.</li><li>A necessidade de atualização ou recortes adicionais.</li></ul></div></div></section>
{analyses}
{_market_intelligence_capture(path="/inteligencia/", asset_id="im-hub-v1", heading="Conte a decisão que a pesquisa precisa apoiar", prompt="Informe a necessidade, o setor ou produto e o recorte que já conhece.", button="Solicitar proposta de estudo")}'''

# Hand-authored surfaces under inteligencia/radar. pSEO generation wipes other
# index.html files in those trees and rewrites them from the snapshot.
PRESERVED_STATIC_INDEXES = frozenset(
    {
        "inteligencia/index.html",
        "inteligencia/mercados/index.html",
        "inteligencia/orgaos/index.html",
        "inteligencia/precos/index.html",
        "inteligencia/concorrencia/index.html",
        "inteligencia/acompanhamento/index.html",
        "inteligencia/pesquisa-sob-encomenda/index.html",
        "inteligencia/relacoes-compradores-fornecedores/index.html",
        "inteligencia/composicao-contratos-amostra/index.html",
        "inteligencia/cenarios/index.html",
        "radar/index.html",
        "radar/nacional-obras-publicas/index.html",
    }
)


def is_preserved_static_surface(rel: str) -> bool:
    """True for hand-authored pages the pSEO wipe must not delete."""
    norm = str(rel).replace("\\", "/").lstrip("./")
    if norm in PRESERVED_STATIC_INDEXES:
        return True
    # Flagship research preview (NEEDS_DATA, noindex). Not a pSEO template.
    if norm.startswith("radar/pesquisa/"):
        return True
    # Contract-analysis family (#83). Not a pSEO template.
    if norm.startswith("analises-contratos-publicos/"):
        return True
    # Market Answer canary (#84). Not a pSEO template.
    if norm.startswith("inteligencia/valor-tipico-contratos-pavimentacao/"):
        return True
    return False


def url_to_path(url: str) -> Path:
    rel = url.strip("/")
    return ROOT / rel / "index.html"


def _prune_empty_dir(directory: Path) -> None:
    """Remove a now-empty generated page directory, never its parents' content.

    Only walks upward while the directory is empty and still inside the two
    generated trees, so a withdrawn route leaves no empty shell behind.
    """
    roots = (ROOT / "inteligencia", ROOT / "radar")
    cur = directory
    while cur.is_dir() and any(cur != r and r in cur.parents for r in roots):
        try:
            if any(cur.iterdir()):
                return
            cur.rmdir()
        except OSError:
            return
        cur = cur.parent


def load_existing_reviews(registry_path: Path) -> dict[str, dict[str, Any]]:
    if not registry_path.exists():
        return {}
    try:
        reg = json.loads(registry_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for p in reg.get("pages") or []:
        pid = p.get("page_id")
        if pid:
            out[pid] = {
                "human_review": p.get("human_review") or "PENDING",
                "reviewer": p.get("reviewer"),
                "review_date": p.get("review_date"),
                "review_notes": p.get("review_notes"),
                "review_dataset_hash": p.get("review_dataset_hash") or p.get("dataset_hash"),
                "evidences_checked": p.get("evidences_checked"),
                "review_checklist": p.get("review_checklist"),
                "data_quality_metrics": p.get("data_quality_metrics"),
                "evidence_sample": p.get("evidence_sample"),
                "claims_checked": p.get("claims_checked"),
                "source_links_checked": p.get("source_links_checked"),
                "cannibalization_checked": p.get("cannibalization_checked"),
                "editorial_issues": p.get("editorial_issues"),
                "approval_rationale": p.get("approval_rationale"),
                "approver": p.get("approver"),
                "reviewed_render_hash": p.get("reviewed_render_hash"),
                "reviewed_material_signature": p.get("reviewed_material_signature")
                or p.get("current_material_signature"),
                "page_material_hash": p.get("page_material_hash"),
                # Sem esta linha, write_registry nunca conseguia carregar a data
                # para frente. Ele TENTA: a expressao e
                #   material_date if material_changed else (
                #       prev.get("last_material_change") or material_date)
                # mas `prev` e montado aqui a partir de uma lista fixa de chaves,
                # e last_material_change nao estava nela. prev.get devolvia None,
                # o `or` caia em material_date, e o campo era reescrito com a data
                # da corrida em TODA build, para toda pagina, inclusive as que nao
                # mudaram material nenhum. O ramo de carry-forward existia e era
                # inalcancavel.
                "last_material_change": p.get("last_material_change"),
            }
    return out


def apply_similarity_gate(cands: list[Candidate]) -> list[Candidate]:
    """Consolidate near-duplicates (similarity only, no numeric publish cap)."""
    by_id = {c.page_id: c for c in cands}
    publishable = [c for c in cands if c.status in {"publish", "noindex", "eligible"}]
    pairs = find_similar_pairs(
        [(c.page_id, c.body_text + " " + c.h1) for c in publishable],
        threshold=SIM_THRESHOLD,
)
    for a, b, s in pairs:
        ca, cb = by_id[a], by_id[b]
        if ca.page_type != cb.page_type:
            continue
        loser = ca if (ca.observation_count, ca.score) < (cb.observation_count, cb.score) else cb
        winner = cb if loser is ca else ca
        if loser.status == "reject":
            continue
        loser.status = "reject"
        loser.mandatory_fail.append(f"similar_to:{winner.page_id}:{s}")
        loser.reasons.append(f"consolidated_similar_to={winner.page_id}")
    return cands



def _attach_review_signatures(registry: dict, cands: list, root: Path) -> None:
    """Persist material signatures. Render-hash alone must not wipe approval.

    Invalidation is driven by page_material_hash (see apply_human_review_gate).
    Rebuilds that only change non-material chrome keep APPROVED_UNCHANGED.
    """
    import hashlib
    from scripts.pseo.score import _material_signature, page_material_hash

    by_id = {c.page_id: c for c in cands}
    for p in registry.get("pages") or []:
        c = by_id.get(p.get("page_id"))
        if not c:
            continue
        # Keep prior reviewed signature if approved
        p["reviewed_material_signature"] = p.get("reviewed_material_signature")
        cur = _material_signature(c)
        p["current_material_signature"] = cur
        p["page_material_hash"] = page_material_hash(cur)
        if p.get("human_review") in {"APPROVED", "APPROVED_WITH_NOTES"}:
            prev_sig = p.get("reviewed_material_signature") or {}
            if prev_sig:
                for k, v in cur.items():
                    if k not in prev_sig:
                        continue
                    if prev_sig.get(k) is not None and prev_sig.get(k) != v:
                        p["human_review"] = "PENDING"
                        p.setdefault("reasons", [])
                        if isinstance(p.get("reasons"), list):
                            p["reasons"].append(f"approval_invalidated_material:{k}")
                        p["status"] = "noindex" if p.get("status") == "publish" else p.get("status")
                        break
            # Record current render hash for diagnostics only, do not demote
            url = (p.get("url") or "").strip("/")
            hp = root / url / "index.html"
            if hp.exists():
                p["current_render_hash"] = hashlib.sha256(hp.read_bytes()).hexdigest()[:32]
        # Always expose quality metrics
        p["data_quality_metrics"] = (c.data_ref or {}).get("sample_metrics") or p.get(
            "data_quality_metrics"
)



def write_registry(
    cands: list[Candidate],
    manifest: dict[str, Any],
    out: Path,
    existing_reviews: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    material_date = date.today().isoformat()
    existing_reviews = existing_reviews or {}
    dataset_hash = manifest.get("dataset_hash")
    rows = []
    from scripts.pseo.score import (# local import avoids cycles at module load
        _material_signature,
        page_material_hash,
)

    for c in cands:
        prev = existing_reviews.get(c.page_id) or {}
        # human_review already resolved by apply_human_review_gate on the candidate
        human = getattr(c, "human_review", None) or prev.get("human_review") or "PENDING"
        cur_sig = _material_signature(c)
        cur_hash = page_material_hash(cur_sig)
        prev_hash = prev.get("page_material_hash") or page_material_hash(
            prev.get("reviewed_material_signature") or {}
)
        material_changed = bool(prev_hash and prev_hash != cur_hash and prev.get("reviewed_material_signature"))
        rows.append(
            {
                **c.as_dict(),
                "dataset_hash": dataset_hash,
                "source_run_id": manifest.get("source_run_id"),
                "last_material_change": material_date if material_changed else (
                    prev.get("last_material_change") or material_date
),
                "canonical_related": (c.related_urls or [None])[0],
                "human_review": human,
                "reviewer": prev.get("reviewer"),
                "review_date": prev.get("review_date"),
                "review_notes": prev.get("review_notes"),
                "review_dataset_hash": prev.get("review_dataset_hash"),
                "evidences_checked": prev.get("evidences_checked"),
                "publication_decision_reason": "; ".join(c.reasons),
                "page_material_hash": cur_hash,
                "current_material_signature": cur_sig,
                "reviewed_material_signature": prev.get("reviewed_material_signature"),
                "reviewed_render_hash": prev.get("reviewed_render_hash"),
                "review_checklist": prev.get("review_checklist"),
                "approval_rationale": prev.get("approval_rationale"),
                "approver": prev.get("approver"),
                "data_quality_metrics": prev.get("data_quality_metrics")
                or (c.data_ref or {}).get("sample_metrics"),
                "evidence_sample": prev.get("evidence_sample"),
                "claims_checked": prev.get("claims_checked"),
                "source_links_checked": prev.get("source_links_checked"),
                "cannibalization_checked": prev.get("cannibalization_checked"),
                "editorial_issues": prev.get("editorial_issues"),
            }
)
    registry = {
        "generated_at": material_date,
        "dataset_hash": dataset_hash,
        "source_run_id": manifest.get("source_run_id"),
        "counts": dict(Counter(c.status for c in cands)),
        "by_type": dict(Counter(c.page_type for c in cands)),
        "human_review_policy": {
            "indexable_states": sorted(APPROVED_REVIEWS),
            "note": "Only APPROVED and APPROVED_WITH_NOTES may be published/indexed.",
        },
        "pages": rows,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(registry, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    out.write_text(text, encoding="utf-8")
    return registry


def _sitemap_lastmod(manifest: dict[str, Any]) -> str:
    """W3C date for sitemap lastmod, never in the future (GSC hard-rejects that).

    Prefer data_as_of (export verification date). Do NOT use data_period_end:
    open-bid end dates often sit months ahead of as_of and poison lastmod.
    """
    today = date.today()
    candidates: list[date] = []
    for raw in (
        manifest.get("data_as_of"),
        (manifest.get("freshness") or {}).get("data_as_of"),
        (manifest.get("freshness") or {}).get("generated_at"),
        manifest.get("generated_at"),
):
        if not raw:
            continue
        s = str(raw)[:10]
        try:
            d = date.fromisoformat(s)
        except ValueError:
            continue
        if d <= today:
            candidates.append(d)
    if candidates:
        return max(candidates).isoformat()
    return today.isoformat()


def _hub_lastmod_for_page(c: Candidate, default: str) -> str:
    """Prefer per-page material last change over deploy clock."""
    ref = c.data_ref or {}
    for key in ("as_of", "period_end", "period_start", "verified_at"):
        raw = ref.get(key)
        if not raw:
            continue
        s = str(raw)[:10]
        try:
            d = date.fromisoformat(s)
        except ValueError:
            continue
        if d <= date.today():
            return d.isoformat()
    return default


def write_sitemap(cands: list[Candidate], lastmod: str) -> Path:
    """Sitemap for approved publications and the finite commercial hub set."""
    pubs = [c for c in cands if c.status == "publish"]
    urls: list[str] = []
    for c in sorted(pubs, key=lambda x: x.url):
        lm = _hub_lastmod_for_page(c, lastmod)
        urls.append(
            f" <url>\n <loc>{SITE}{c.url}</loc>\n <lastmod>{lm}</lastmod>\n </url>"
)

    commercial_hubs = set(MARKET_INTELLIGENCE_COMMERCIAL_ROUTES)
    for hpath in reversed(MARKET_INTELLIGENCE_PUBLIC_ROUTES):
        urls.insert(
            0,
            f" <url>\n <loc>{SITE}{hpath}</loc>\n <lastmod>{MARKET_INTELLIGENCE_MATERIAL_DATE}</lastmod>\n </url>",
        )

    hub_defs = [
        ("/inteligencia/cenarios/", "problem_service"),
        ("/radar/", "radar"),
    ]
    for hpath, ptype in hub_defs:
        if hpath in commercial_hubs:
            continue
        children = [c for c in pubs if c.page_type == ptype]
        if not children:
            continue
        urls.insert(
            0,
            f" <url>\n <loc>{SITE}{hpath}</loc>\n <lastmod>{lastmod}</lastmod>\n </url>",
)
    seen = set()
    final = []
    for u in urls:
        if u in seen:
            continue
        seen.add(u)
        final.append(u)
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    xml += "\n".join(final) + "\n</urlset>\n"
    path = ROOT / "sitemap-inteligencia.xml"
    path.write_text(xml, encoding="utf-8")
    try:
        from scripts.market_answers.sitemap import apply_market_answer_sitemap
        from scripts.market_answers.consume import load_approvals, load_candidate, load_payload
        from scripts.market_answers.gate import evaluate

        decision = evaluate(load_candidate(), load_payload(), load_approvals(), today=None)
        apply_market_answer_sitemap(ROOT, indexable=decision.indexable, lastmod="")
    except Exception:
        # pSEO sitemap must still write even if the Market Answer consumer
        # cannot load. INDEX flip is owned by scripts.market_answers.
        pass
    return path


def write_sitemap_index(lastmod: str) -> Path:
    """Rewrite sitemap-index from existing children. `lastmod` is ignored (no build clock)."""
    del lastmod
    from scripts.organic.sitemap_graph import close_graph, ensure_index_member

    if (ROOT / "sitemap-inteligencia.xml").is_file():
        ensure_index_member(ROOT, "sitemap-inteligencia.xml")
    close_graph(ROOT)
    return ROOT / "sitemap-index.xml"


def patch_main_sitemap_index() -> None:
    """Keep robots.txt pointing at a single canonical sitemap index."""
    robots = ROOT / "robots.txt"
    text = robots.read_text(encoding="utf-8")
    lines = []
    saw_index = False
    for line in text.splitlines():
        if line.strip().lower().startswith("sitemap:"):
            if "sitemap-index.xml" in line and not saw_index:
                lines.append("Sitemap: https://confenge.com.br/sitemap-index.xml")
                saw_index = True
            continue
        lines.append(line)
    if not saw_index:
        lines.append("Sitemap: https://confenge.com.br/sitemap-index.xml")
    new_text = "\n".join(lines).rstrip() + "\n"
    if new_text != text:
        robots.write_text(new_text, encoding="utf-8")


def render_hubs(cands: list[Candidate]) -> list[str]:
    pubs = [c for c in cands if c.status in {"publish", "noindex"}]
    publish_types = {c.page_type for c in cands if c.status == "publish"}

    type_labels = {
        "market": "Mercado",
        "agency": "Órgão comprador",
        "price": "Benchmark de preços",
        "competition": "Concorrência observada",
        "radar": "Radar de oportunidades",
        "problem_service": "Cenário problema → serviço",
    }

    def _hub_summary(description: str | None) -> str:
        # A description pode terminar em reticências (corte de meta description);
        # na linha do hub vai só a oração inteira, nunca um fragmento cortado.
        text = (description or "").strip()
        if text.endswith(("…", "...")):
            body = text.rstrip("….").strip()
            head, dot, _tail = body.rpartition(". ")
            if dot:
                return f"{head}."
            # Sem ponto final: a oração principal até o primeiro travessão,
            # ponto e vírgula ou dois-pontos; se não houver, a linha fica sem
            # resumo em vez de exibir um fragmento cortado.
            for sep in (" — ", "; ", ": "):
                clause = body.split(sep, 1)[0].strip()
                if sep in body and len(clause) >= 40:
                    return f"{clause}."
            return ""
        return text

    def items_for(ptype: str) -> list[tuple]:
        out = []
        kind = type_labels.get(ptype, "Inteligência")
        for c in sorted(pubs, key=lambda x: -x.score):
            if c.page_type != ptype:
                continue
            # 2026-09-08: o rótulo de estado editorial "preview (revisão)" era copy
            # de pipeline exposta ao visitante. Trocado por um descritor de leitura.
            # O sentinel "publicada" permanece: o filtro do hub /radar/ depende dele.
            badge = "publicada" if c.status == "publish" else "leitura de caso"
            # Never expose pipeline page_type as visitor copy
            meta = badge
            # O resumo da página (description do snapshot) é o que o visitante lê
            # na linha do hub; o sentinela fica na quarta posição para o filtro.
            out.append((c.url, kind, c.h1[:90], meta, _hub_summary(c.description)))
        return out

    def hub_robots(path: str, ptype: str | None) -> str:
        """Commercial hubs are first-party pages; data-only hubs follow child state."""
        if path in MARKET_INTELLIGENCE_COMMERCIAL_ROUTES:
            return "index,follow"
        if ptype is None:
            return "index,follow" if publish_types else "noindex,follow"
        return "index,follow" if ptype in publish_types else "noindex,follow"

    written = []
    hubs = [
        (
            "/inteligencia/",
            "Inteligência de mercado para decisões de crescimento | CONFENGE",
            "Pesquisa de mercado para escolher clientes, canais, produtos e movimentos com mais clareza.",
            "Estudos sob encomenda para mapear clientes e parceiros, mercados, concorrentes, oportunidades e referências documentais.",
            "A CONFENGE transforma registros públicos e pesquisa documental em recortes úteis para empresas, "
            "consultorias, associações e redes. Cada trabalho parte da decisão do contratante e termina em uma "
            "entrega definida, com fontes, método, limites e próximos passos.",
            [
                ("/inteligencia/orgaos/", "Clientes e canais", "Mapear clientes, distribuidores e parceiros", "Seleção justificada de organizações e canais compatíveis com produto, território e decisão comercial."),
                ("/inteligencia/mercados/", "Mercados", "Avaliar mercado, expansão e produtos", "Demanda observada, nichos, territórios, categorias e recorrência para orientar expansão e portfólio."),
                ("/inteligencia/concorrencia/", "Concorrência", "Analisar concorrentes, carteiras e empresas", "Presença observada, concentração, continuidade de fornecedores e seleção documental de parceiros."),
                ("/inteligencia/acompanhamento/", "Acompanhamento", "Acompanhar oportunidades e mudanças relevantes", "Recortes periódicos delimitados para decisões recorrentes, sem promessa de alerta instantâneo."),
                ("/inteligencia/precos/", "Preços e documentos", "Pesquisar referências comparáveis", "Fontes, especificações e condições de fornecimento para comparar referências e preparar decisões."),
                ("/inteligencia/pesquisa-sob-encomenda/", "Uso institucional", "Contratar pesquisa sob encomenda", "Estudos, bases curadas e análises para consultorias, associações, redes, fabricantes e outros setores."),
            ],
            [("Início", "/"), ("Inteligência", None)],
            None,
),
        (
            "/inteligencia/mercados/",
            "Pesquisa de mercado, expansão e produtos | CONFENGE",
            "Estudo de mercado para expansão comercial",
            "Pesquisa sob encomenda de demanda observada, nichos, territórios, categorias e recorrência.",
            "O estudo organiza evidências para comparar mercados e apoiar decisões sobre catálogo, presença regional, "
            "abastecimento e assistência técnica. Logística, estoque e programação física entram somente quando as fontes "
            "trazem local, quantidade e condições de entrega suficientes.",
            items_for("market"),
            [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Mercados", None)],
            "market",
),
        (
            "/inteligencia/orgaos/",
            "Mapeamento de clientes, distribuidores e parceiros | CONFENGE",
            "Mapeamento de distribuidores e clientes para sua empresa",
            "Mapas justificados de compradores públicos, fornecedores, distribuidores, integradores e prestadores complementares.",
            "A pesquisa parte do produto, do território e do modelo de canal para selecionar organizações compatíveis. "
            "Quando houver carteira do contratante, o cruzamento é reservado e serve para orientar a priorização, sem vender "
            "contatos pessoais nem presumir interesse de compra.",
            items_for("agency"),
            [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Clientes e parceiros", None)],
            "agency",
),
        (
            "/inteligencia/precos/",
            "Pesquisa de preços e referências documentais | CONFENGE",
            "Pesquisa de preços e condições de fornecimento",
            "Pesquisa sob encomenda de referências, fontes, especificações e condições de fornecimento.",
            "A comparação verifica objeto, unidade, quantidade, período e demais condições materiais. Valores integrais de "
            "contratos ajudam a dimensionar porte, mas não viram preço unitário sem composição comparável.",
            items_for("price"),
            [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Preços", None)],
            "price",
),
        (
            "/inteligencia/concorrencia/",
            "Análise de concorrentes, carteiras e empresas | CONFENGE",
            "Análise de concorrentes e carteira pública de empresas",
            "Pesquisa sob encomenda de presença observada, concentração, continuidade e complementaridade territorial.",
            "A leitura documental ajuda a comparar atuação comercial e selecionar empresas para aprofundamento. Ela não "
            "substitui avaliação financeira, crédito, certificação, diligência jurídica nem garantia de desempenho.",
            items_for("competition"),
            [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Concorrência", None)],
            "competition",
),
        (
            "/inteligencia/acompanhamento/",
            "Oportunidades e acompanhamento de mercado | CONFENGE",
            "Pesquisa de oportunidades entre fornecedores do governo",
            "Acompanhamento contratado de mudanças, contratos recentes, términos previstos e necessidades complementares.",
            "A CONFENGE define com o contratante o tema, as fontes, a frequência possível e o formato de cada atualização. "
            "O trabalho pode investigar compras planejadas quando disponíveis e desdobramentos de contratos recentes, sem "
            "tratar vencimento como compra aberta nem prometer alerta automático.",
            [],
            [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Acompanhamento", None)],
            None,
),
        (
            "/inteligencia/pesquisa-sob-encomenda/",
            "Pesquisa sob encomenda e uso institucional | CONFENGE",
            "Pesquisa de mercado para consultorias e associações",
            "Pesquisa de mercado para consultorias e associações.",
            "O trabalho pode resultar em relatório reservado, base curada, exportação, atualização ou licença não exclusiva "
            "de uma análise própria. A proposta define a finalidade, os participantes autorizados e os direitos de uso, sem "
            "anunciar competência regulada que o estudo não exige nem comprova.",
            [],
            [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Pesquisa sob encomenda", None)],
            None,
),
        (
            "/inteligencia/cenarios/",
            "Cenários técnicos para decisão | CONFENGE",
            "Do padrão público à decisão da construtora",
            "Cenários que ligam evidência pública a decisões de proposta, preço e contrato.",
            "Cenários recorrentes (aditivos, SINAPI/SICRO, orçamento×edital, medição/glosa) "
            "com limitações, fontes oficiais e próximo passo comercial concreto.",
            items_for("problem_service"),
            [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Cenários", None)],
            "problem_service",
),
        (
            "/radar/",
            "Radar de oportunidades no mercado público | CONFENGE",
            "Radar de oportunidades para a sua operação, não para o mercado inteiro.",
            "Monitoramento estruturado do mercado público calibrado ao perfil da construtora.",
            "O radar da CONFENGE não é um feed genérico de editais. Ele parte do perfil da empresa "
            "(capacidade, acervo, órgãos-alvo, faixas de valor e apetite de risco) para separar o que "
            "merece a atenção da sua operação.",
            # Only list publish radar children publicly; noindex previews stay out of hub promo
            [it for it in items_for("radar") if it[3] == "publicada"],
            [("Início", "/"), ("Radar", None)],
            "radar",
),
    ]
    from scripts.pseo.html_shell import wa_link as _wa_link

    commercial_content = {
        "/inteligencia/": _market_intelligence_root_content(),
        "/inteligencia/orgaos/": _market_intelligence_family_content(
            path="/inteligencia/orgaos/",
            asset_id="im-clientes-v1",
            decision="Escolher onde aprofundar a prospecção e quais canais podem ampliar a presença comercial.",
            deliverables=[
                ("Mapa de organizações", "Lista estruturada de compradores públicos, fornecedores, distribuidores, integradores ou prestadores complementares dentro do recorte contratado."),
                ("Critérios de seleção", "Justificativa documentada para incluir, comparar ou retirar cada grupo da priorização."),
                ("Plano de aprofundamento", "Perguntas, fontes e verificações seguintes para transformar a seleção em uma decisão comercial."),
            ],
            adaptation=[
                ("Produto e aplicação", "O que a empresa oferece, para quem serve e quais usos precisam aparecer nos registros."),
                ("Território e canal", "Regiões, modelo de distribuição, integração, representação ou prestação complementar."),
                ("Carteira reservada", "Clientes atuais ou perfis de referência podem orientar similaridade sem serem publicados nem reutilizados."),
                ("Nível de conferência", "O escopo define se basta mapear organizações ou se documentos e casos determinantes precisam ser lidos."),
            ],
            limits=[
                "Contratação passada ou presença documental não prova interesse de compra atual.",
                "A entrega não vende contatos pessoais nem presume autorização para abordagem.",
                "Nome semelhante não resolve identidade de empresa, filial ou consórcio.",
                "Compatibilidade observada orienta pesquisa e priorização; não garante venda, parceria ou desempenho.",
            ],
            capture_heading="Explique quem você precisa encontrar e para qual decisão",
            capture_prompt="Informe o produto ou serviço, o território, o tipo de canal e o resultado esperado do mapa.",
            capture_button="Solicitar proposta de mapeamento",
        ),
        "/inteligencia/mercados/": _market_intelligence_family_content(
            path="/inteligencia/mercados/",
            asset_id="im-mercados-v1",
            decision="Comparar mercados, territórios ou categorias antes de alocar produto, estoque e esforço comercial.",
            deliverables=[
                ("Recorte de demanda observada", "Tabela de categorias, compradores, territórios, períodos e modalidades que as fontes sustentam."),
                ("Leitura de recorrência e concentração", "Separação entre ocorrências, contratos únicos e versões para evitar volume duplicado."),
                ("Implicações para a decisão", "Síntese do que o recorte apoia sobre expansão, catálogo, abastecimento ou assistência técnica."),
            ],
            adaptation=[
                ("Mercado e categoria", "A pergunta pode partir de produto, aplicação, comprador, cadeia de fornecimento ou território."),
                ("Período e atualidade", "O corte histórico é datado; atualização e acompanhamento são dimensionados separadamente."),
                ("Quantidade e entrega", "Logística e estoque só entram quando unidade, quantidade, local e condições de entrega são suficientes."),
                ("Decisão interna", "A apresentação pode ser preparada para diretoria, comercial, produto, suprimentos ou rede institucional."),
            ],
            limits=[
                "Evolução da captura de dados não é crescimento do mercado.",
                "Sem denominador confiável, o estudo não publica participação nem mercado total.",
                "Município do comprador, local de entrega e presença comercial são conceitos diferentes.",
                "Histórico ajuda a formular cenários; não prevê compra futura nem resultado comercial.",
            ],
            capture_heading="Delimite o mercado, a decisão e o período de interesse",
            capture_prompt="Informe o produto ou categoria, o território e se a decisão envolve expansão, catálogo, abastecimento ou assistência técnica.",
            capture_button="Solicitar proposta de estudo de mercado",
        ),
        "/inteligencia/concorrencia/": _market_intelligence_family_content(
            path="/inteligencia/concorrencia/",
            asset_id="im-concorrencia-v1",
            decision="Entender presença observada, concentração e complementaridade antes de escolher uma empresa para aprofundamento.",
            deliverables=[
                ("Mapa de presença observada", "Comparação de empresas, categorias, compradores, territórios e períodos dentro das fontes contratadas."),
                ("Carteiras e continuidade", "Leitura de continuidade, substituição e concentração com identidade e critérios explícitos."),
                ("Seleção documental", "Lista justificada de empresas e documentos que merecem diligência complementar para a decisão."),
            ],
            adaptation=[
                ("Pergunta competitiva", "Entrada, expansão, parceria, aquisição empresarial ou composição de rede exigem recortes diferentes."),
                ("Identidade empresarial", "Filiais, consórcios e mudanças de nome precisam de tratamento compatível com a fonte disponível."),
                ("Carteira e território", "A comparação pode observar compradores, categorias e regiões sem revelar dados reservados do contratante."),
                ("Profundidade documental", "O escopo separa contagem agregada, leitura de documentos e validação de casos determinantes."),
            ],
            limits=[
                "Frequência observada não é ranking de qualidade ou reputação.",
                "Contratos públicos não comprovam faturamento, solvência, crédito ou capacidade financeira.",
                "A pesquisa não certifica regularidade, desempenho, disponibilidade nem interesse em parceria.",
                "Uma seleção para aprofundamento não substitui diligência financeira, jurídica ou operacional.",
            ],
            capture_heading="Explique quais empresas e qual decisão precisam ser comparadas",
            capture_prompt="Informe o mercado, o território, o período e se a decisão envolve concorrência, parceria, carteira ou seleção empresarial.",
            capture_button="Solicitar proposta de análise competitiva",
        ),
        "/inteligencia/acompanhamento/": _market_intelligence_family_content(
            path="/inteligencia/acompanhamento/",
            asset_id="im-acompanhamento-v1",
            decision="Definir quais mudanças precisam ser revistas de forma recorrente e com que evidência.",
            deliverables=[
                ("Linha de base", "Primeiro retrato do tema, das fontes, do período e dos critérios que orientam cada atualização."),
                ("Atualização delimitada", "Novo corte com mudanças relevantes, contratos recentes, términos previstos ou sinais documentais contratados."),
                ("Síntese para ação", "Registro do que mudou, do que permanece incerto e das verificações necessárias para a próxima decisão."),
            ],
            adaptation=[
                ("Tema e gatilho", "Produto, categoria, carteira, território, fornecedor ou necessidade complementar que motiva a revisão."),
                ("Fontes disponíveis", "A frequência possível depende da atualização, estabilidade e direito de uso de cada fonte."),
                ("Rotina de decisão", "O formato pode apoiar reunião, planejamento comercial, suprimentos ou revisão de carteira."),
                ("Critério de mudança", "A proposta define o que conta como alteração material e o que permanece apenas como contexto."),
            ],
            limits=[
                "Acompanhamento contratado não é alerta instantâneo nem assinatura já ativa.",
                "Término previsto não significa compra aberta ou oportunidade ainda contratável.",
                "Compra planejada, contrato recente, assinatura e demanda de terceiros são estados diferentes.",
                "A frequência só é definida depois de confirmar fonte, esforço e capacidade operacional.",
            ],
            capture_heading="Defina o que precisa ser acompanhado e qual decisão se repete",
            capture_prompt="Informe o tema, o território, a frequência desejada e quais mudanças alterariam sua decisão.",
            capture_button="Solicitar proposta de acompanhamento",
        ),
        "/inteligencia/precos/": _market_intelligence_family_content(
            path="/inteligencia/precos/",
            asset_id="im-precos-v1",
            decision="Comparar referências compatíveis antes de preparar proposta, negociar ou pesquisar fornecedores.",
            deliverables=[
                ("Caderno de referências", "Tabela com fonte, data, especificação, unidade, quantidade e condições relevantes para cada comparação."),
                ("Pesquisa documental", "Documentos e trechos que sustentam a referência, com critérios de inclusão e exclusão."),
                ("Leitura de comparabilidade", "Síntese do que pode ser comparado, das diferenças materiais e das lacunas que exigem nova pesquisa."),
            ],
            adaptation=[
                ("Especificação", "Características técnicas e comerciais que tornam duas referências comparáveis ou incompatíveis."),
                ("Quantidade e unidade", "Escala, embalagem, composição e unidade precisam permanecer ligadas ao valor observado."),
                ("Local e período", "Praça, data-base, entrega, tributos e demais condições podem mudar a utilidade da referência."),
                ("Uso da pesquisa", "Preparação de proposta, orçamento, negociação, compra ou pesquisa de fornecedores pedem entregas diferentes."),
            ],
            limits=[
                "Valor integral de contrato não é preço unitário de item.",
                "Preço sem especificação, quantidade, unidade e condições não é referência comparável.",
                "Contrato misto não pode ter seu valor inteiro atribuído a cada categoria.",
                "A pesquisa organiza evidência; não garante fornecimento, estoque ou manutenção da condição observada.",
            ],
            capture_heading="Informe o item, a especificação e a decisão de preço",
            capture_prompt="Descreva o que precisa comparar, a unidade, a quantidade, o local, o período e a finalidade da pesquisa.",
            capture_button="Solicitar proposta de pesquisa de preços",
        ),
        "/inteligencia/pesquisa-sob-encomenda/": _market_intelligence_family_content(
            path="/inteligencia/pesquisa-sob-encomenda/",
            asset_id="im-institucional-v1",
            decision="Encomendar um estudo que sua organização possa usar, apresentar ou atualizar dentro de uma finalidade definida.",
            deliverables=[
                ("Relatório sob encomenda", "Pergunta, recorte, método, resultados e recomendações preparados para o uso contratado."),
                ("Base curada ou exportação", "Dados selecionados e documentados no formato acordado, quando fontes e direitos permitirem."),
                ("Licença ou atualização", "Uso não exclusivo de análise própria, recortes adicionais ou nova edição com condições específicas."),
            ],
            adaptation=[
                ("Organização e público", "Consultoria, associação, rede, fabricante ou outra organização informa quem usará a entrega."),
                ("Finalidade", "Decisão interna, estudo setorial, apoio a clientes, conteúdo institucional ou planejamento exigem direitos distintos."),
                ("Formato", "Relatório, apresentação, tabela, base curada, sumário executivo ou combinação definida em proposta."),
                ("Direitos de uso", "Participantes, citação, circulação, atualização, revenda e exclusividade são tratados expressamente."),
            ],
            limits=[
                "Entrega reservada não concede exclusividade setorial por padrão.",
                "Dados e conclusões confidenciais de um contratante não são reutilizados para outro.",
                "Revenda, exclusividade e uso por participantes adicionais exigem condições próprias.",
                "A pesquisa não anuncia competência regulada de outro setor nem substitui o profissional legalmente responsável.",
            ],
            capture_heading="Explique a pesquisa, o público e o uso institucional pretendido",
            capture_prompt="Informe a pergunta, quem utilizará a entrega, o formato desejado e se haverá circulação entre participantes ou clientes.",
            capture_button="Solicitar proposta de pesquisa sob encomenda",
        ),
    }
    commercial_assets = {
        "/inteligencia/": ("im-hub-v1", "Solicitar estudo de mercado", "/inteligencia/relacoes-compradores-fornecedores/", "Examinar uma análise de empresas"),
        "/inteligencia/orgaos/": ("im-clientes-v1", "Solicitar meu mapeamento", "/inteligencia/relacoes-compradores-fornecedores/", "Examinar uma análise de empresas"),
        "/inteligencia/mercados/": ("im-mercados-v1", "Solicitar estudo de mercado", "/inteligencia/composicao-contratos-amostra/", "Examinar uma análise de mercado"),
        "/inteligencia/concorrencia/": ("im-concorrencia-v1", "Analisar concorrentes e empresas", "/inteligencia/relacoes-compradores-fornecedores/", "Examinar empresas verificadas"),
        "/inteligencia/acompanhamento/": ("im-acompanhamento-v1", "Definir acompanhamento", "/inteligencia/composicao-contratos-amostra/", "Examinar uma análise pública"),
        "/inteligencia/precos/": ("im-precos-v1", "Contratar pesquisa de preços", "/inteligencia/composicao-contratos-amostra/", "Examinar valores e condições"),
        "/inteligencia/pesquisa-sob-encomenda/": ("im-institucional-v1", "Contratar pesquisa", "/inteligencia/relacoes-compradores-fornecedores/", "Examinar uma análise pública"),
    }

    for path, title, h1, desc, intro, items, crumbs, ptype in hubs:
        empty_cta = None
        eyebrow = "Inteligência aplicada à decisão"
        wa = (
            "Olá, CONFENGE. Quero aplicar a inteligência de mercado da CONFENGE "
            "à decisão da minha empresa."
)
        if path == "/radar/":
            eyebrow = "Monitoramento estruturado"
            wa = (
                "Olá, CONFENGE. Quero configurar o radar de oportunidades com o perfil "
                "da minha construtora."
)
            if not items:
                empty_cta = {
                    "title": "Sem perfil da empresa, o radar vira ruído.",
                    "body": (
                        "Se você já disputa ou executa contratos públicos, o caminho certo é "
                        "calibrar o recorte, não assinar mais um alerta genérico."
),
                    "primary_label": "Configurar meu radar de oportunidades",
                    "primary_href": _wa_link(wa),
                    "secondary_label": "Começar pelo diagnóstico da operação em obras públicas",
                    "secondary_href": "/diagnostico-b2g-360/",
                }
        hero_cta = None
        after_content_html = ""
        if path in commercial_content:
            asset_id, label, proof_href, proof_label = commercial_assets[path]
            hero_cta = _market_intelligence_hero_cta(
                asset_id, label, proof_href, proof_label
            )
            empty_cta = _market_intelligence_next_step(label)
            eyebrow = "Inteligência de mercado sob encomenda"
            after_content_html = commercial_content[path]
        extra_html = ""
        if path == "/radar/":
            # /radar/ is the declared breadcrumb parent of the hand-authored
            # /radar/nacional-obras-publicas/, which is not a pSEO publication and so
            # can never appear in `items`. Without this the hub never linked down to
            # its own child, and editing the built HTML did not survive a rebuild.
            extra_html = (
                '<section aria-labelledby="radar-publicado" class="sec sec--tight sec--rule-top">'
                '<span class="t-kicker">Publicado</span>'
                '<h2 id="radar-publicado" class="t-editorial">Método e demanda observada</h2>'
                '<p class="measure"><a class="text-link" href="/radar/nacional-obras-publicas/">'
                "Radar de obras públicas: método aberto e demanda observada</a> apresenta o "
                "método reproduzível de leitura de contratos públicos e a demanda orgânica "
                "medida no próprio domínio pelo Google Search Console, na janela de "
                "2026-07-14 a 2026-07-28 (15 dias, 10 cliques e 325 impressões em "
                "confenge.com.br inteiro).</p>"
                '<p class="measure">A leitura ajuda a localizar temas de orçamento e contratos que já atraem '
                "buscas e explica os limites da amostra. Para uma decisão sobre oportunidades, "
                "o recorte é configurado com perfil da empresa, região, segmentos e acervo.</p>"
                "</section>"
)
        html = render_hub(
            title=title,
            h1=h1,
            description=desc,
            path=path,
            intro=intro,
            items=items,
            robots=hub_robots(path, ptype),
            crumbs=crumbs,
            eyebrow=eyebrow,
            wa_message=wa,
            empty_cta=empty_cta,
            extra_html=extra_html,
            after_content_html=after_content_html,
            hero_cta=hero_cta,
)
        out = url_to_path(path)
        out.parent.mkdir(parents=True, exist_ok=True)
        write_public_html(out, html)
        written.append(str(out.relative_to(ROOT)))
    return written


def build(data_dir: Path | None = None, dry_run: bool = False) -> dict[str, Any]:
    data_dir = data_dir or (ROOT / "data" / "pseo")
    try:
        snap = validate_snapshot(data_dir)
    except SnapshotError as exc:
        print(f"FAIL-CLOSED: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc

    manifest = snap["manifest"]
    data = snap["data"]
    registry_path = data_dir / "registry.json"
    existing_reviews = load_existing_reviews(registry_path)

    # Baseline URLs known BEFORE registry rewrite / HTML wipe, freeze new reject paths.
    prior_urls: set[str] = set()
    if registry_path.exists():
        try:
            prior_reg = json.loads(registry_path.read_text(encoding="utf-8"))
            for p in prior_reg.get("pages") or []:
                if p.get("url"):
                    prior_urls.add(str(p["url"]))
        except (OSError, json.JSONDecodeError):
            pass
    for base in (ROOT / "inteligencia", ROOT / "radar"):
        if not base.exists():
            continue
        for index in base.rglob("index.html"):
            try:
                url_guess = "/" + str(index.parent.relative_to(ROOT)).replace("\\", "/") + "/"
                prior_urls.add(url_guess)
            except ValueError:
                pass

    cands = build_candidates(data, manifest)
    cands = apply_similarity_gate(cands)
    # Human review is a hard gate, never publish PENDING
    cands = apply_human_review_gate(cands, existing_reviews, dataset_hash=manifest.get("dataset_hash"))
    cands = resolve_related_urls(cands, site_root=ROOT)

    if not dry_run:
        registry = write_registry(cands, manifest, registry_path, existing_reviews)
    else:
        registry = {"pages": []}

    written_pages = []
    if not dry_run:
        for base in (ROOT / "inteligencia", ROOT / "radar"):
            if not base.exists():
                continue
            for index in base.rglob("index.html"):
                rel = index.relative_to(ROOT).as_posix()
                if is_preserved_static_surface(rel):
                    continue
                # Record path as prior URL before wipe
                url_guess = "/" + str(index.parent.relative_to(ROOT)).replace("\\", "/") + "/"
                prior_urls.add(url_guess)
                try:
                    index.unlink()
                except OSError:
                    pass
    withdrawn_pages = []
    for c in cands:
        # Fail-closed: `reject` means the page is never written to the public
        # tree, whether or not the path existed before. The earlier rule only
        # skipped *new* reject paths (Wave 0 freeze: "não criar novas páginas"),
        # which left a page that regressed publish -> reject still being served
        # and rewritten on every build. A reject page is withdrawn instead: the
        # wipe above already removed it, and it is not re-emitted here.
        path = url_to_path(c.url)
        if c.status == "reject":
            withdrawn_pages.append(
                {
                    "url": c.url,
                    "status": c.status,
                    "score": c.score,
                    "path": str(path.relative_to(ROOT)),
                    "reasons": c.reasons,
                    "previously_public": c.url in prior_urls,
                }
)
            # A reject page that existed before this run has just been removed
            # by the wipe. Remove its now-empty directory too, so the public
            # tree carries no trace of a withdrawn route.
            if not dry_run:
                _prune_empty_dir(path.parent)
            continue
        # Only status=publish enters the intelligence sitemap.
        try:
            html = render_candidate(c, manifest)
        except Exception as exc: # noqa: BLE001
            if c.status == "reject":
                continue
            raise
        if not dry_run:
            path.parent.mkdir(parents=True, exist_ok=True)
            write_public_html(path, html)
        written_pages.append(
            {
                "url": c.url,
                "status": c.status,
                "score": c.score,
                "path": str(path.relative_to(ROOT)),
            }
)

    if not dry_run:
        # After HTML is on disk, attach signatures / invalidate approvals on render change
        _attach_review_signatures(registry, cands, ROOT)
        registry_path.write_text(
            json.dumps(registry, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
)

    render_market_intelligence_sample = None
    if not dry_run:
        from scripts.pseo.market_intelligence_sample import (
            load_snapshot as load_market_intelligence_sample,
        )
        from scripts.pseo.market_intelligence_sample import (
            render_all as render_market_intelligence_sample,
        )

        # The public proof block and the two analysis routes are emitted only
        # after the independent PNCP claims manifest matches the snapshot.
        load_market_intelligence_sample(
            ROOT / "data" / "pseo" / "market-intelligence-sample.v1.json"
        )
    hubs = [] if dry_run else render_hubs(cands)
    market_intelligence_analyses: list[str] = []
    if not dry_run:
        assert render_market_intelligence_sample is not None
        market_intelligence_analyses = render_market_intelligence_sample(
            root=ROOT,
            capture_factory=_market_intelligence_capture,
        )
    # lastmod = when the snapshot was verified, never use bid data_period_end
    # (open-bid end dates can be months in the future and GSC rejects future lastmod).
    lastmod = _sitemap_lastmod(manifest)
    sm = None if dry_run else write_sitemap(cands, lastmod)
    if not dry_run:
        patch_main_sitemap_index()
        write_sitemap_index(lastmod)

    summary = {
        "ok": True,
        "dataset_hash": manifest.get("dataset_hash"),
        "source_run_id": manifest.get("source_run_id"),
        "counts": dict(Counter(c.status for c in cands)),
        "publishable": [c.url for c in cands if c.status == "publish"],
        "noindex": [c.url for c in cands if c.status == "noindex"],
        "rejected": [
            {"url": c.url, "reasons": c.reasons, "score": c.score}
            for c in cands
            if c.status == "reject"
        ],
        "pages_written": len(written_pages),
        # Explicit, URL-level record of every route withheld from the public
        # tree this run. A reject page is withdrawn, never silently rewritten.
        "withdrawn_urls": [w["url"] for w in withdrawn_pages],
        "withdrawn_count": len(withdrawn_pages),
        "withdrawn_previously_public": [
            w["url"] for w in withdrawn_pages if w["previously_public"]
        ],
        "withdrawn": withdrawn_pages,
        "hubs": hubs,
        "market_intelligence_analyses": market_intelligence_analyses,
        "sitemap": str(sm.relative_to(ROOT)) if sm else None,
        "registry": str(registry_path.relative_to(ROOT)),
        "policy": {
            "max_publish_pages": None,
            "human_review_required": True,
            "indexable_reviews": sorted(APPROVED_REVIEWS),
        },
    }
    report_path = ROOT / "seo" / "pseo-build-report.json"
    if not dry_run:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return summary


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Build CONFENGE pSEO static pages")
    p.add_argument("--data", type=Path, default=None)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args(argv)
    build(args.data, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
