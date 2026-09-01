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
from pathlib import Path
from typing import Any

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


def write_public_html(path: Path, html: str) -> None:
    """Write visitor HTML after the shipped em-dash scrubber."""
    path.write_text(scrub_html(html), encoding="utf-8")

# Hand-authored surfaces under inteligencia/radar. pSEO generation wipes other
# index.html files in those trees and rewrites them from the snapshot.
PRESERVED_STATIC_INDEXES = frozenset(
    {
        "inteligencia/index.html",
        "inteligencia/mercados/index.html",
        "inteligencia/orgaos/index.html",
        "inteligencia/precos/index.html",
        "inteligencia/concorrencia/index.html",
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
    """Sitemap only for publish URLs + hubs that have ≥1 publish child.

    Empty hubs stay out of the sitemap (they are rendered noindex,follow).
    """
    pubs = [c for c in cands if c.status == "publish"]
    urls: list[str] = []
    for c in sorted(pubs, key=lambda x: x.url):
        lm = _hub_lastmod_for_page(c, lastmod)
        urls.append(
            f" <url>\n <loc>{SITE}{c.url}</loc>\n <lastmod>{lm}</lastmod>\n </url>"
)

    hub_defs = [
        ("/inteligencia/", None), # root hub always if any publish or own editorial
        ("/inteligencia/mercados/", "market"),
        ("/inteligencia/orgaos/", "agency"),
        ("/inteligencia/precos/", "price"),
        ("/inteligencia/concorrencia/", "competition"),
        ("/inteligencia/cenarios/", "problem_service"),
        ("/radar/", "radar"),
    ]
    for hpath, ptype in hub_defs:
        if ptype is None:
            if not pubs:
                continue
        else:
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
    from scripts.organic.sitemap_graph import close_graph

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

    def items_for(ptype: str) -> list[tuple]:
        out = []
        kind = type_labels.get(ptype, "Inteligência")
        for c in sorted(pubs, key=lambda x: -x.score):
            if c.page_type != ptype:
                continue
            badge = "publicada" if c.status == "publish" else "preview (revisão)"
            # Never expose pipeline page_type as visitor copy
            meta = badge
            out.append((c.url, kind, c.h1[:90], meta))
        return out

    def hub_robots(ptype: str | None) -> str:
        """Empty hubs: noindex,follow. Hubs with publish children: index,follow."""
        if ptype is None:
            return "index,follow" if publish_types else "noindex,follow"
        return "index,follow" if ptype in publish_types else "noindex,follow"

    written = []
    hubs = [
        (
            "/inteligencia/",
            "Inteligência aplicada à decisão B2G | CONFENGE",
            "O mercado público deixa rastros. Nós transformamos esses rastros em decisão.",
            "Mercados, órgãos, preços e concorrência como evidência para decisões de participação, preço e proteção de margem.",
            "Contratos, órgãos, preços, concorrência e oportunidades só criam valor quando são confrontados "
            "com a capacidade, o risco e a estratégia da empresa. Esta área organiza evidências públicas "
            "para apoiar decisões comerciais e técnicas, sem confundir frequência histórica com certeza futura.",
            [
                ("/inteligencia/mercados/", "Mercados", "Onde a demanda se concentra", "Demanda e órgãos"),
                ("/inteligencia/orgaos/", "Órgãos", "Quem contrata o que importa", "Dossiês compradores"),
                ("/inteligencia/precos/", "Preços", "Referências antes de precificar", "Medianas e faixas"),
                ("/inteligencia/concorrencia/", "Concorrência", "Quem aparece com frequência", "Observado, não ranking"),
                ("/inteligencia/cenarios/", "Cenários", "Problema + decisão técnica", "Enquadramento aplicado"),
                ("/metodologia-inteligencia/", "Método", "Como lemos as evidências", "Limites e fontes"),
            ],
            [("Início", "/"), ("Inteligência", None)],
            None,
),
        (
            "/inteligencia/mercados/",
            "Mercados públicos de engenharia | CONFENGE",
            "Mercados por segmento e região",
            "Contratos, órgãos e evolução: para priorizar onde atuar.",
            "Lista de mercados com massa mínima de contratos e compradores. "
            "Use para decidir em quais UFs e segmentos alocar esforço comercial.",
            items_for("market"),
            [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Mercados", None)],
            "market",
),
        (
            "/inteligencia/orgaos/",
            "Órgãos compradores de engenharia | CONFENGE",
            "Dossiês de órgãos compradores",
            "Histórico de contratação em engenharia com massa crítica.",
            "Dossiês de órgãos com contratos primários, fornecedores e limitações explícitas. "
            "Útil para mapear aderência antes de precificar.",
            items_for("agency"),
            [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Órgãos", None)],
            "agency",
),
        (
            "/inteligencia/precos/",
            "Benchmarks de valores contratados | CONFENGE",
            "Preços e dispersão contratual",
            "Medianas e quartis com critérios de inclusão, sem média cega.",
            "Benchmarks de contratos integrais comparáveis. Não são preços unitários SINAPI/SICRO.",
            items_for("price"),
            [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Preços", None)],
            "price",
),
        (
            "/inteligencia/concorrencia/",
            "Concorrência observada em obras públicas | CONFENGE",
            "Concorrência observada",
            "Fornecedores e concentração no recorte público.",
            "Frequência neutra de fornecedores no recorte, observação pública, não ranking comercial.",
            items_for("competition"),
            [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Concorrência", None)],
            "competition",
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
            "Radar de oportunidades B2G | CONFENGE",
            "Radar de oportunidades para a sua operação, não para o mercado inteiro.",
            "Monitoramento estruturado do mercado público calibrado ao perfil da construtora.",
            "O radar da CONFENGE não é um feed genérico de editais. Ele precisa do perfil da empresa "
            "(capacidade, acervo, órgãos-alvo, faixas de valor e apetite de risco) para filtrar o que "
            "merece atenção. Sem cobertura integral prometida. Sem fingir disponibilidade quando o "
            "recorte ainda não está publicado para o visitante.",
            # Only list publish radar children publicly; noindex previews stay out of hub promo
            [it for it in items_for("radar") if it[3] == "publicada"],
            [("Início", "/"), ("Radar", None)],
            "radar",
),
    ]
    from scripts.pseo.html_shell import wa_link as _wa_link

    for path, title, h1, desc, intro, items, crumbs, ptype in hubs:
        empty_cta = None
        eyebrow = "Inteligência aplicada à decisão"
        wa = (
            "Olá, Tiago. Quero aplicar a inteligência de mercado da CONFENGE "
            "à decisão da minha empresa."
)
        if path == "/radar/":
            eyebrow = "Monitoramento estruturado"
            wa = (
                "Olá, Tiago. Quero configurar o radar de oportunidades com o perfil "
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
                    "secondary_label": "Começar pelo diagnóstico B2G",
                    "secondary_href": "/diagnostico-b2g-360/",
                }
        html = render_hub(
            title=title,
            h1=h1,
            description=desc,
            path=path,
            intro=intro,
            items=items,
            robots=hub_robots(ptype),
            crumbs=crumbs,
            eyebrow=eyebrow,
            wa_message=wa,
            empty_cta=empty_cta,
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

    hubs = [] if dry_run else render_hubs(cands)
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
