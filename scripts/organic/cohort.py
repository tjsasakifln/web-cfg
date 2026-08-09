"""Select diverse pilot cohort from scored SEO opportunities and materialize safely."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


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
    take(lambda o: o.get("cluster") in {"reequilibrio", "aditivos", "medicoes-pagamentos"} and o.get("service_path"), "pillar_service")
    take(lambda o: bool(o.get("unique_data_available")), "data_driven")
    take(lambda o: "ferramentas" in json.dumps(o.get("suggested_internal_links") or [], ensure_ascii=False) or "tool" in o.get("id", ""), "tool")
    take(lambda o: o.get("action") == "improve" and o.get("source") == "gsc_page", "gsc_improve")
    take(lambda o: o.get("action") == "improve", "improve_existing")
    take(lambda o: o.get("source") == "datalake_radar" or o.get("cluster") == "radar-oportunidades", "pseo_radar")
    take(lambda o: o.get("action") in {"noindex", "merge"}, "prune_or_noindex")

    # fill remaining by score
    for o in ranked:
        if len(selected) >= max_n:
            break
        if o["id"] in {s["id"] for s in selected}:
            continue
        item = dict(o)
        item["cohort_slot"] = "score_fill"
        selected.append(item)

    return selected[:max_n]


def _ensure_data_insight_block(html: str, insight: dict[str, Any]) -> str:
    """Inject a provenance-aware insight callout if missing."""
    if "data-organic-insight" in html:
        return html
    headline = insight.get("headline") or "Insight proprietário de contratos públicos"
    as_of = insight.get("data_as_of") or insight.get("as_of") or ""
    n = insight.get("record_count") or (insight.get("result") or {}).get("contract_count") or ""
    method = insight.get("methodology") or ""
    limits = insight.get("limitations") or []
    lim_html = "".join(f"<li>{_esc(str(x))}</li>" for x in limits[:4])
    block = f"""
<aside class="data-insight" data-organic-insight="1" aria-label="Insight de dados proprietários">
  <p class="eyebrow">Evidência de contratos públicos</p>
  <p><strong>{_esc(str(headline))}</strong></p>
  <p class="muted">Corte: {_esc(str(as_of))} · Registros: {_esc(str(n))}</p>
  <p>{_esc(str(method)[:320])}</p>
  <details><summary>Limitações e metodologia</summary><ul>{lim_html}</ul></details>
</aside>
"""
    # Insert after first </header> or after first content-lead paragraph
    if re.search(r"</header>", html, re.I):
        return re.sub(r"</header>", "</header>\n" + block, html, count=1, flags=re.I)
    if re.search(r'<main[^>]*>', html, re.I):
        return re.sub(r'(<main[^>]*>)', r"\1\n" + block, html, count=1, flags=re.I)
    return html


def _esc(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
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
    """Apply safe improvements: insight block on data pages, verify CTA/links exist."""
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
            if item.get("unique_data_available")
            else "demand-graph + commercial intent"
        ),
        "proprietary_data": bool(item.get("unique_data_available")),
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

    # Inject data insight when datalake evidence is rich
    dl = item.get("datalake_evidence") or {}
    if item.get("unique_data_available") and int(dl.get("record_count") or 0) >= 8:
        insight = {
            "headline": item.get("topic"),
            "data_as_of": dl.get("as_of"),
            "record_count": dl.get("record_count"),
            "methodology": dl.get("methodology"),
            "limitations": dl.get("limitations") or [],
            "result": dl.get("result") or {},
        }
        html = _ensure_data_insight_block(html, insight)
        if html != original:
            result["changes"].append("injected_data_insight_block")

    # Contextual service CTA for improve slots (intent → service)
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

    # Tool link when suggested
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
            if re.search(r"</header>", html, re.I):
                html = re.sub(r"</header>", "</header>\n" + tool_block, html, count=1, flags=re.I)
                result["changes"].append("injected_tool_link")
            break

    # Ensure robots meta honesty for blocked gate pages that exist as pSEO thin
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
        "selection_rule": "diversity slots + content value score",
        "items": items,
        "source_counts": opportunities_doc.get("counts"),
        "note": (
            "Indexação editorial/pSEO continua human-gated. "
            "Cohort materializa melhorias seguras e documenta decisões."
        ),
    }
