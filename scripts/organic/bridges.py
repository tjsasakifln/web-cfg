"""Editorial commercial bridges — education-first, no ad/popup/dark patterns."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from scripts.organic.service_map import map_content_to_service

BRIDGE_MARKER = 'data-commercial-bridge="1"'


def _esc(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def render_bridge_html(fit: dict[str, Any], *, source_path: str) -> str:
    title = fit.get("bridge_title") or "Quando o problema deixa de ser só técnico"
    body = fit.get("bridge_body") or (
        "Se o tema desta página já afeta margem, prazo ou caixa, "
        "vale enquadrar o caso no serviço Confenge correspondente."
    )
    cta = fit.get("cta_label") or "Ver serviço relacionado"
    service = fit.get("service_path") or "/#contato"
    # Preserve editorial origin for attribution without UTM spam
    href = service
    if "?" not in href:
        sep = "&" if "#" in href else "?"
        # keep hash anchors working: insert query before hash
        if "#" in href:
            base, frag = href.split("#", 1)
            href = f"{base}?origem={_esc(source_path)}#{frag}"
        else:
            href = f"{href}{sep}origem={source_path.rstrip('/')}"
    tools = fit.get("tools") or []
    tool_html = ""
    if tools:
        t = tools[0]
        tool_html = (
            f'<a class="text-link" href="{_esc(t)}" data-cta-position="organic_bridge_tool">'
            f"Ferramenta relacionada</a>"
        )
    return f"""
<aside class="editorial-bridge commercial-bridge" {BRIDGE_MARKER} data-cluster="{_esc(str(fit.get('cluster_id') or ''))}" aria-label="Quando o problema se torna comercial">
  <p class="eyebrow">Do diagnóstico técnico à decisão</p>
  <h2 class="bridge-title">{_esc(str(title))}</h2>
  <p>{_esc(str(body))}</p>
  <div class="bridge-actions">
    <a class="button button-secondary" data-cta-position="organic_bridge" href="{_esc(href)}">{_esc(str(cta))}</a>
    {tool_html}
  </div>
</aside>
"""


def remove_bridge(html: str) -> str:
    return re.sub(
        r'\s*<aside class="editorial-bridge commercial-bridge"[^>]*>.*?</aside>\s*',
        "\n",
        html,
        flags=re.I | re.S,
    )


def inject_bridge(html: str, fit: dict[str, Any], *, source_path: str) -> tuple[str, bool]:
    """Inject or replace a single editorial bridge. Returns (html, changed)."""
    if not fit.get("matched") or not fit.get("service_path"):
        return html, False
    block = render_bridge_html(fit, source_path=source_path)
    original = html
    if BRIDGE_MARKER in html or 'data-commercial-bridge="1"' in html:
        html = remove_bridge(html)
    # Prefer end of article body; avoid doubling CTAs if organic_intent already present
    if re.search(r"</article>", html, re.I):
        html = re.sub(r"</article>", block + "\n</article>", html, count=1, flags=re.I)
    elif re.search(r"</main>", html, re.I):
        html = re.sub(r"</main>", block + "\n</main>", html, count=1, flags=re.I)
    else:
        return original, False
    return html, html != original


def apply_bridges(
    root: Path,
    *,
    only_indexable: bool = True,
    paths: list[str] | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Apply bridges to content pages that map to a service."""
    targets: list[Path] = []
    if paths:
        for p in paths:
            rel = p.strip("/")
            cand = root / rel / "index.html"
            if cand.exists():
                targets.append(cand)
    else:
        targets = list(root.glob("conteudos/*/index.html"))

    results: list[dict[str, Any]] = []
    applied = 0
    for page in targets:
        rel = "/" + str(page.parent.relative_to(root)).replace("\\", "/") + "/"
        html = page.read_text(encoding="utf-8", errors="replace")
        noindex = bool(
            re.search(r'name=["\']robots["\'][^>]*noindex|content=["\'][^"\']*noindex', html, re.I)
        )
        if only_indexable and noindex:
            results.append({"path": rel, "status": "skipped_noindex"})
            continue
        fit = map_content_to_service(rel)
        if not fit.get("matched"):
            results.append({"path": rel, "status": "skipped_no_service_fit"})
            continue
        new_html, changed = inject_bridge(html, fit, source_path=rel)
        if changed and not dry_run:
            page.write_text(new_html, encoding="utf-8")
            applied += 1
            results.append(
                {
                    "path": rel,
                    "status": "applied",
                    "service_path": fit.get("service_path"),
                    "cluster_id": fit.get("cluster_id"),
                }
            )
        elif changed:
            results.append({"path": rel, "status": "dry_run_would_apply", "service_path": fit.get("service_path")})
        else:
            results.append({"path": rel, "status": "unchanged", "service_path": fit.get("service_path")})

    return {
        "schema_version": "commercial-bridges-v1",
        "only_indexable": only_indexable,
        "dry_run": dry_run,
        "applied": applied,
        "results": results,
    }
