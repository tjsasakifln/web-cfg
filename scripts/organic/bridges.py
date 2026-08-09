"""Editorial commercial bridges — education-first, no ad/popup/dark patterns."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any
from urllib.parse import quote, parse_qsl, urlencode

from scripts.organic.service_map import map_content_to_service

BRIDGE_MARKER = 'data-commercial-bridge="1"'


def _esc(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def with_origem(service: str, source_path: str) -> str:
    """Append origem= attribution without breaking query, fragment, or encoding.

    - percent-encodes the path value
    - preserves existing query params
    - keeps fragment after query
    - does not invent absolute hosts
    """
    raw = (service or "").strip() or "/#contato"
    origin = quote((source_path or "").rstrip("/") or "/", safe="/")

    # Relative path with optional query/fragment
    if raw.startswith("#"):
        return f"?origem={origin}{raw}"

    # Split fragment first
    frag = ""
    if "#" in raw:
        raw, frag = raw.split("#", 1)
        frag = "#" + frag

    # Existing query
    if "?" in raw:
        base, qs = raw.split("?", 1)
        pairs = [(k, v) for k, v in parse_qsl(qs, keep_blank_values=True) if k != "origem"]
        pairs.append(("origem", (source_path or "").rstrip("/") or "/"))
        return f"{base}?{urlencode(pairs)}{frag}"

    return f"{raw}?origem={origin}{frag}"


def has_commercial_article_aside(html: str, service_path: str | None = None) -> bool:
    """True when a sticky/article-aside already carries a commercial CTA.

    Stacking a full secondary button next to WhatsApp/service aside creates CTA
    fatigue. Soft bridges keep the educational transition without a second button.
    If service_path is provided and appears in the aside, that is a strong signal;
    any aside with a button/WhatsApp CTA is enough to prefer soft mode.
    """
    if not html:
        return False
    aside = re.search(
        r'<aside[^>]*class=["\'][^"\']*article-aside[^"\']*["\'][^>]*>.*?</aside>',
        html,
        flags=re.I | re.S,
    )
    if not aside:
        return False
    block = aside.group(0)
    if service_path:
        variants = {
            service_path,
            service_path.rstrip("/"),
            service_path.rstrip("/") + "/",
        }
        if any(v and v in block for v in variants):
            return True
    # WhatsApp / primary button / service card already present
    if re.search(r"wa\.me/|button-primary|aside-card", block, re.I):
        return True
    return False


# Back-compat alias used by tests / callers
def has_same_service_aside(html: str, service_path: str | None) -> bool:
    return has_commercial_article_aside(html, service_path)


def render_bridge_html(
    fit: dict[str, Any],
    *,
    source_path: str,
    soft: bool = False,
) -> str:
    """Render bridge.

    soft=True: education-only transition when a same-service article-aside already
    provides the primary commercial CTA (WhatsApp / service link). Avoids stacked
    commercial buttons without dropping the diagnostic framing.
    """
    title = fit.get("bridge_title") or "Quando o problema deixa de ser só técnico"
    body = fit.get("bridge_body") or (
        "Se o tema desta página já afeta margem, prazo ou caixa, "
        "vale enquadrar o caso no serviço Confenge correspondente."
    )
    cta = fit.get("cta_label") or "Ver serviço relacionado"
    service = fit.get("service_path") or "/#contato"
    href = with_origem(service, source_path)

    tools = fit.get("tools") or []
    tool_html = ""
    if tools and not soft:
        t = tools[0]
        tool_html = (
            f'<a class="text-link" href="{_esc(t)}" data-cta-position="organic_bridge_tool">'
            f"Ferramenta relacionada</a>"
        )

    if soft:
        # Soft bridge: no second button; single text-link to service for attribution
        actions = (
            f'<p class="bridge-soft-link">'
            f'<a class="text-link" data-cta-position="organic_bridge" href="{_esc(href)}">'
            f"{_esc(str(cta))}</a></p>"
        )
        soft_attr = ' data-bridge-mode="soft"'
    else:
        actions = (
            f'<div class="bridge-actions">'
            f'<a class="button button-secondary" data-cta-position="organic_bridge" '
            f'href="{_esc(href)}">{_esc(str(cta))}</a>'
            f"{tool_html}"
            f"</div>"
        )
        soft_attr = ""

    return f"""
<aside class="editorial-bridge commercial-bridge" {BRIDGE_MARKER} data-cluster="{_esc(str(fit.get('cluster_id') or ''))}"{soft_attr} aria-label="Quando o problema se torna comercial">
  <p class="eyebrow">Do diagnóstico técnico à decisão</p>
  <h2 class="bridge-title">{_esc(str(title))}</h2>
  <p>{_esc(str(body))}</p>
  {actions}
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
    soft = has_commercial_article_aside(html, fit.get("service_path"))
    block = render_bridge_html(fit, source_path=source_path, soft=soft)
    original = html
    if BRIDGE_MARKER in html or 'data-commercial-bridge="1"' in html:
        html = remove_bridge(html)
    # Prefer end of article body
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
        soft = has_commercial_article_aside(html, fit.get("service_path"))
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
                    "mode": "soft" if soft else "full",
                }
            )
        elif changed:
            results.append(
                {
                    "path": rel,
                    "status": "dry_run_would_apply",
                    "service_path": fit.get("service_path"),
                    "mode": "soft" if soft else "full",
                }
            )
        else:
            results.append(
                {
                    "path": rel,
                    "status": "unchanged",
                    "service_path": fit.get("service_path"),
                    "mode": "soft" if soft else "full",
                }
            )

    return {
        "schema_version": "commercial-bridges-v1",
        "only_indexable": only_indexable,
        "dry_run": dry_run,
        "applied": applied,
        "results": results,
    }
