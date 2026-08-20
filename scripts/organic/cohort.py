"""Select diverse pilot cohort from scored SEO opportunities and materialize safely.

Content-moat honesty:
- Contract-aggregate insights only when datalake_evidence.is_contract_aggregate
  (or equivalent dataset/kind). Never label normative_editorial as N contracts.
- Public HTML must be Portuguese and client-facing (no English backstage jargon).
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# English / internal methodology fragments that must never ship on public HTML
FORBIDDEN_PUBLIC_FRAGMENTS = (
    "open-status filter",
    "never treat history as open",
    "datalake",
    "extra-cli",
    "fetchall",
    "dataset_hash",
)


def _insert_after_page_hero(html: str, block: str) -> str:
    """Place a block inside <main> after H1/hero — never between site header and main."""
    m = re.search(
        r"<main\b[\s\S]*?<header class=\"[^\"]*(?:content-hero|article-hero|pillar-hero)[^\"]*\"[^>]*>[\s\S]*?</header>",
        html,
        re.I,
    )
    if m:
        return html[: m.end()] + "\n" + block + html[m.end() :]
    m = re.search(r"(<main\b[^>]*>[\s\S]*?</h1>)", html, re.I)
    if m:
        return html[: m.end()] + "\n" + block + html[m.end() :]
    return html


def is_contract_aggregate_evidence(dl: dict[str, Any] | None) -> bool:
    """Mirror engine rule: only real contract aggregates are content moat."""
    if not dl:
        return False
    if dl.get("is_contract_aggregate") is True:
        return True
    if dl.get("is_contract_aggregate") is False:
        return False
    kind = str(dl.get("evidence_kind") or dl.get("public_label") or "").lower()
    if kind in {
        "normative_editorial",
        "editorial",
        "editorial_pattern",
        "normative",
        "guide",
        "problem_service_pattern",
    }:
        return False
    if kind in {"market_benchmark", "open_opportunity_radar", "contract_aggregate", "open_radar"}:
        return int(dl.get("record_count") or 0) >= 3
    dataset = str(dl.get("dataset") or "").lower()
    sources = " ".join(str(s).lower() for s in (dl.get("sources") or []))
    blob = f"{dataset} {sources}"
    if "site-confenge" in blob and "pncp" not in blob:
        return False
    return "pncp" in blob or "supplier_contracts" in blob


def select_pilot(opportunities: list[dict[str, Any]], *, max_n: int = 8) -> list[dict[str, Any]]:
    """Pick a diverse cohort: BOFU, MOFU, pillar, data-driven, tool, improve, pSEO."""
    ranked = sorted(opportunities, key=lambda o: -int(o.get("score") or 0))
    selected: list[dict[str, Any]] = []
    seen_slots: set[str] = set()

    def take(pred, slot: str) -> None:
        if slot in seen_slots:
            return
        for o in ranked:
            if o["id"] in {s["id"] for s in selected}:
                continue
            if pred(o):
                item = dict(o)
                item["cohort_slot"] = slot
                selected.append(item)
                seen_slots.add(slot)
                return

    take(lambda o: o.get("intent") == "bofu" and o.get("action") in {"improve", "keep", "create"}, "bofu")
    take(lambda o: o.get("intent") == "mofu", "mofu")
    take(
        lambda o: o.get("cluster") in {"reequilibrio", "aditivos", "medicoes-pagamentos"}
        and o.get("service_path"),
        "pillar_service",
    )
    take(lambda o: bool(o.get("unique_data_available")) and is_contract_aggregate_evidence(o.get("datalake_evidence")), "data_driven")
    take(
        lambda o: "ferramentas" in json.dumps(o.get("suggested_internal_links") or [], ensure_ascii=False)
        or "tool" in o.get("id", ""),
        "tool",
    )
    take(lambda o: o.get("action") == "improve" and o.get("source") == "gsc_page", "gsc_improve")
    take(lambda o: o.get("action") == "improve", "improve_existing")
    take(
        lambda o: o.get("source") == "datalake_radar" or o.get("cluster") == "radar-oportunidades",
        "pseo_radar",
    )
    take(lambda o: o.get("action") in {"noindex", "merge"}, "prune_or_noindex")

    for o in ranked:
        if len(selected) >= max_n:
            break
        if o["id"] in {s["id"] for s in selected}:
            continue
        item = dict(o)
        item["cohort_slot"] = "score_fill"
        selected.append(item)

    return selected[:max_n]


def _esc(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _pt_methodology(method: str) -> str:
    """Ensure methodology is Portuguese and free of backstage English."""
    m = (method or "").strip()
    replacements = {
        "Open-status filter on bids; never treat history as open": (
            "Filtro de status aberto sobre editais/compras do PNCP; "
            "histórico encerrado nunca é tratado como oportunidade vigente."
        ),
        "Open-status filter on bids": "Filtro de status aberto sobre editais do PNCP",
        "never treat history as open": "histórico nunca é tratado como oportunidade vigente",
    }
    for eng, pt in replacements.items():
        if eng.lower() in m.lower() or m == eng:
            m = pt
    return m


def _ensure_data_insight_block(html: str, insight: dict[str, Any], *, contract: bool) -> str:
    """Inject a provenance-aware insight callout if missing.

    contract=True → 'Evidência de contratos públicos' + record counts.
    contract=False → editorial pattern label without implying N contracts analyzed.
    """
    if "data-organic-insight" in html:
        return html
    method = _pt_methodology(str(insight.get("methodology") or ""))
    for frag in FORBIDDEN_PUBLIC_FRAGMENTS:
        if frag.lower() in method.lower():
            method = _pt_methodology(method)  # attempt fix
        if frag.lower() in method.lower() and frag not in ("",):
            # hard strip English leftovers
            if frag == "open-status filter" or "never treat" in method.lower():
                method = (
                    "Filtro de status aberto sobre editais/compras do PNCP; "
                    "histórico encerrado nunca é tratado como oportunidade vigente."
                )
    limits = insight.get("limitations") or []
    lim_html = "".join(f"<li>{_esc(str(x))}</li>" for x in limits[:4])
    as_of = insight.get("data_as_of") or insight.get("as_of") or ""
    n = insight.get("record_count") or (insight.get("result") or {}).get("contract_count") or ""

    label = str(insight.get("public_label") or insight.get("evidence_kind") or "").lower()
    if contract and label in {"open_radar", "open_opportunity_radar"}:
        headline = insight.get("headline") or "Radar de oportunidades abertas"
        eyebrow = "Evidência de editais abertos"
        meta = f"Corte: {_esc(str(as_of))} · Oportunidades abertas no recorte: {_esc(str(n))}"
    elif contract:
        headline = insight.get("headline") or "Insight proprietário de contratos públicos"
        eyebrow = "Evidência de contratos públicos"
        meta = f"Corte: {_esc(str(as_of))} · Contratos no recorte: {_esc(str(n))}"
    else:
        headline = insight.get("headline") or "Padrão técnico-editorial"
        eyebrow = "Enquadramento técnico-editorial"
        meta = (
            f"Atualizado em: {_esc(str(as_of))} · Referências de apoio: {_esc(str(n))}"
            if n
            else f"Atualizado em: {_esc(str(as_of))}"
        )

    block = f"""
<aside class="data-insight" data-organic-insight="1" data-insight-kind="{'contract' if contract else 'editorial'}" aria-label="Insight">
  <p class="eyebrow">{eyebrow}</p>
  <p><strong>{_esc(str(headline))}</strong></p>
  <p class="muted">{meta}</p>
  <p>{_esc(str(method)[:320])}</p>
  <details><summary>Limitações e metodologia</summary><ul>{lim_html}</ul></details>
</aside>
"""
    if re.search(r"</header>", html, re.I):
        return re.sub(r"</header>", "</header>\n" + block, html, count=1, flags=re.I)
    if re.search(r"<main[^>]*>", html, re.I):
        return re.sub(r"(<main[^>]*>)", r"\1\n" + block, html, count=1, flags=re.I)
    return html


def remove_organic_insight_blocks(html: str) -> str:
    """Strip previously injected insight asides (for honest re-materialization)."""
    return re.sub(
        r'\s*<aside class="data-insight"[^>]*>.*?</aside>\s*',
        "\n",
        html,
        flags=re.I | re.S,
    )


def _path_from_url(url: str | None, root: Path) -> Path | None:
    if not url:
        return None
    path = url.replace("https://confenge.com.br", "").replace("http://confenge.com.br", "")
    if path.endswith("/"):
        cand = root / path.strip("/") / "index.html"
    else:
        cand = root / path.strip("/")
        if cand.is_dir():
            cand = cand / "index.html"
        elif not cand.suffix:
            cand = root / path.strip("/") / "index.html"
    return cand if cand.exists() else None


def materialize_cohort_item(root: Path, item: dict[str, Any], *, apply: bool) -> dict[str, Any]:
    """Apply safe improvements: honest insights, intent CTAs, tool links."""
    dl = item.get("datalake_evidence") or {}
    contract = bool(item.get("unique_data_available")) and is_contract_aggregate_evidence(dl)

    result = {
        "id": item["id"],
        "cohort_slot": item.get("cohort_slot"),
        "intent": item.get("intent"),
        "action": item.get("action"),
        "score": item.get("score"),
        "existing_url": item.get("existing_url"),
        "proposed_url": item.get("proposed_url"),
        "cluster": item.get("cluster"),
        "cta": item.get("suggested_cta"),
        "index_decision": item.get("publishability"),
        "gate": (item.get("indexability_gate") or {}).get("decision"),
        "differential": (
            "contract-data insight + provenance"
            if contract
            else "demand-graph + commercial intent"
        ),
        "proprietary_data": contract,
        "insight_kind": "contract" if contract else "editorial_or_none",
        "changes": [],
        "path_resolved": None,
    }

    url = item.get("existing_url") or item.get("proposed_url")
    path = _path_from_url(url, root)
    result["path_resolved"] = str(path) if path else None

    if not path or not apply:
        if not path:
            result["changes"].append("url_not_on_disk_skip_html")
        else:
            result["changes"].append("dry_run_no_write")
        return result

    html = path.read_text(encoding="utf-8")
    original = html

    # Always strip dishonest / stale organic insight blocks first
    if "data-organic-insight" in html:
        html2 = remove_organic_insight_blocks(html)
        if html2 != html:
            html = html2
            result["changes"].append("stripped_previous_insight_block")

    # Re-inject only for genuine contract aggregates with enough sample
    min_n = 3 if str(dl.get("public_label") or "").startswith("open") else 8
    if contract and int(dl.get("record_count") or 0) >= min_n:
        insight = {
            "headline": item.get("topic"),
            "data_as_of": dl.get("as_of"),
            "record_count": dl.get("record_count"),
            "methodology": dl.get("methodology"),
            "limitations": dl.get("limitations") or [],
            "result": dl.get("result") or {},
            "public_label": dl.get("public_label"),
            "evidence_kind": dl.get("evidence_kind"),
        }
        before = html
        html = _ensure_data_insight_block(html, insight, contract=True)
        if html != before:
            result["changes"].append("injected_contract_insight_block")
    elif "data-organic-insight" in original and not contract:
        result["changes"].append("removed_false_contract_insight")

    # Contextual service CTA
    service_path = item.get("service_path") or (
        f"/{item['service_fit']}/" if item.get("service_fit") else None
    )
    cta_label = item.get("suggested_cta") or item.get("cta")
    if (
        service_path
        and cta_label
        and item.get("action") in {"improve", "keep"}
        and "data-organic-cta" not in html
        and service_path not in html
    ):
        cta_block = f"""
<aside class="lead-inline" data-organic-cta="1" aria-label="Próximo passo">
  <div class="lead-inline-copy">
    <span>Próximo passo</span>
    <strong>{_esc(str(cta_label))}</strong>
    <p>Conteúdo alinhado à intenção desta página — sem CTA genérico.</p>
  </div>
  <div class="lead-inline-actions">
    <a class="button button-primary" data-cta-position="organic_intent" href="{_esc(service_path)}">{_esc(str(cta_label))}</a>
  </div>
</aside>
"""
        if re.search(r"</article>", html, re.I):
            html = re.sub(r"</article>", cta_block + "\n</article>", html, count=1, flags=re.I)
            result["changes"].append("injected_intent_cta")
        elif re.search(r"</main>", html, re.I):
            html = re.sub(r"</main>", cta_block + "\n</main>", html, count=1, flags=re.I)
            result["changes"].append("injected_intent_cta")

    for link in item.get("suggested_internal_links") or []:
        if "/ferramentas/" in str(link) and str(link) not in html and "data-organic-tool" not in html:
            tool_block = f"""
<aside class="lead-inline" data-organic-tool="1" aria-label="Ferramenta relacionada">
  <div class="lead-inline-copy"><span>Ferramenta</span>
  <strong>Use a ferramenta antes de formalizar o pedido</strong>
  <p>Resultado orientativo, sem cadastro.</p></div>
  <div class="lead-inline-actions">
    <a class="button button-secondary" href="{_esc(str(link))}">Abrir ferramenta</a>
  </div>
</aside>
"""
            inserted = _insert_after_page_hero(html, tool_block)
            if inserted != html:
                html = inserted
                result["changes"].append("injected_tool_link")
            break

    gate = item.get("indexability_gate") or {}
    if not gate.get("indexable") and item.get("action") == "noindex":
        if re.search(r'name=["\']robots["\']', html, re.I):
            html2 = re.sub(
                r'content=["\']index,follow[^"\']*["\']',
                'content="noindex,follow"',
                html,
                count=1,
                flags=re.I,
            )
            if html2 != html:
                html = html2
                result["changes"].append("robots_set_noindex_follow")

    # Final public-copy guard on insight blocks
    for frag in FORBIDDEN_PUBLIC_FRAGMENTS:
        if frag.lower() in html.lower() and "data-organic-insight" in html:
            # rewrite methodology inside insight if English leaked
            html = re.sub(
                r"(Open-status filter on bids; never treat history as open)",
                "Filtro de status aberto sobre editais/compras do PNCP; "
                "histórico encerrado nunca é tratado como oportunidade vigente.",
                html,
                flags=re.I,
            )
            result["changes"].append("scrubbed_public_english_methodology")

    if html != original:
        path.write_text(html, encoding="utf-8")
        result["changes"].append("file_written")
    else:
        result["changes"].append("no_html_delta")

    return result


def select_and_materialize_cohort(
    root: Path,
    opportunities_doc: dict[str, Any],
    *,
    apply: bool = False,
    max_n: int = 8,
) -> dict[str, Any]:
    opps = list(opportunities_doc.get("opportunities") or [])
    selected = select_pilot(opps, max_n=max_n)
    items = [materialize_cohort_item(root, s, apply=apply) for s in selected]
    return {
        "schema_version": "organic-pilot-cohort-v1",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "apply": apply,
        "selection_rule": "diversity slots + content value score + contract-moat honesty",
        "items": items,
        "source_counts": opportunities_doc.get("counts"),
        "note": (
            "Indexação editorial/pSEO continua human-gated. "
            "unique_data_available / contract insights only for genuine contract aggregates."
        ),
    }
