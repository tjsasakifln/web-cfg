"""Composite editorial gates used by build and CI."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import unquote, urlparse, parse_qs

from scripts.editorial.naturalness import evaluate_body, strip_html, find_internal_terms
from scripts.editorial.registry import INDEXABLE_STATES
from scripts.editorial.sources import is_official_url, page_sources_ok, load_manifest


EMAIL_RE = re.compile(r"mailto:([^\"'\s>]+)", re.I)
WA_RE = re.compile(r"https?://wa\.me/\d+\?text=([^\"'\s>]+)", re.I)


def has_contextual_whatsapp(html: str, *, theme_token: str | None = None) -> tuple[bool, str]:
    m = WA_RE.search(html)
    if not m:
        return False, "missing_whatsapp"
    msg = unquote(m.group(1)).lower()
    if len(msg) < 40:
        return False, "whatsapp_message_too_short"
    if theme_token and theme_token.lower() not in msg:
        # allow partial theme match via key words
        tokens = [t for t in re.split(r"\W+", theme_token.lower()) if len(t) > 4]
        if tokens and not any(t in msg for t in tokens[:3]):
            return False, "whatsapp_not_contextual"
    return True, msg[:120]


def has_contextual_email(html: str, *, theme_token: str | None = None) -> tuple[bool, str]:
    m = EMAIL_RE.search(html)
    if not m:
        return False, "missing_mailto"
    raw = unquote(m.group(1))
    # mailto:addr?subject=...&body=...
    if "?" not in raw and "subject=" not in raw.lower():
        # plain mailto without subject is weak but acceptable if body page has separate mailto with subject
        if "subject=" not in html.lower():
            return False, "mailto_missing_subject"
    subject_m = re.search(r"subject=([^&\"']+)", html, re.I)
    if not subject_m:
        return False, "mailto_missing_subject"
    subject = unquote(subject_m.group(1))
    if len(subject) < 8:
        return False, "mailto_subject_too_short"
    if theme_token:
        tokens = [t for t in re.split(r"\W+", theme_token.lower()) if len(t) > 4]
        sub_l = subject.lower()
        if tokens and not any(t in sub_l for t in tokens[:3]):
            # also check body
            body_m = re.search(r"body=([^\"']+)", html, re.I)
            body = unquote(body_m.group(1)).lower() if body_m else ""
            if not any(t in body for t in tokens[:3]):
                return False, "mailto_not_contextual"
    return True, subject[:120]


def analytics_hooks_present(html: str) -> list[str]:
    """Require data attributes for first-party editorial events."""
    missing = []
    if 'data-content-type="' not in html and "data-content-type='" not in html:
        missing.append("data-content-type")
    if 'data-editorial-topic="' not in html and "data-topic='" not in html and 'data-topic="' not in html:
        missing.append("data-editorial-topic|data-topic")
    return missing


def evaluate_page(
    page: dict[str, Any],
    html: str,
    *,
    other_bodies: list[str] | None = None,
    manifest: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Full gate suite for one editorial page + rendered HTML."""
    issues: list[str] = []
    body_text = page.get("body_markdown") or strip_html(html)
    nat = evaluate_body(
        body_text,
        keyword=page.get("primary_keyword"),
        max_similarity_bodies=other_bodies,
    )
    if not nat["ok"]:
        issues.extend(nat["issues"])

    # HTML internal ban
    html_internal = find_internal_terms(html)
    if html_internal:
        issues.append("html_internal:" + ",".join(html_internal[:8]))

    # Sources
    man = manifest if manifest is not None else load_manifest()
    src_issues = page_sources_ok(page.get("sources") or [], man)
    issues.extend(src_issues)

    # Legal device when archetype is law application
    if page.get("archetype") == "lei_14133":
        devices = page.get("legal_devices") or []
        if not devices:
            issues.append("lei_page_missing_legal_devices")
        # body must mention at least one art.
        if not re.search(r"art\.?\s*\d+", body_text, re.I):
            issues.append("lei_body_missing_article_citation")

    if page.get("archetype") == "jurisprudencia":
        for field in ("court", "decision_number", "decision_date", "official_source_url"):
            if not page.get(field):
                issues.append(f"jurisprudence_missing_{field}")
        url = page.get("official_source_url") or ""
        if url and not is_official_url(url):
            issues.append("jurisprudence_non_official_url")

    # CTAs
    theme = page.get("theme") or page.get("title") or ""
    ok_wa, wa_detail = has_contextual_whatsapp(html, theme_token=theme)
    if not ok_wa:
        issues.append(wa_detail)
    ok_em, em_detail = has_contextual_email(html, theme_token=theme)
    if not ok_em:
        issues.append(em_detail)

    # Meta
    if not page.get("title") or len(page.get("title") or "") > 70:
        # soft: long titles are issues only if extreme
        if not page.get("title"):
            issues.append("missing_title")
        elif len(page["title"]) > 90:
            issues.append("title_too_long")
    if not page.get("meta_description") or len(page.get("meta_description") or "") < 50:
        issues.append("weak_meta_description")
    if not page.get("direct_answer"):
        issues.append("missing_direct_answer")
    else:
        wc = len(page["direct_answer"].split())
        if wc < 40 or wc > 120:
            issues.append(f"direct_answer_words={wc}_expected_50_100")

    # Approval → indexable
    status = page.get("status") or "DRAFT"
    if status in INDEXABLE_STATES:
        appr = page.get("approval") or {}
        if not appr.get("reviewer"):
            issues.append("indexable_without_reviewer")
        if appr.get("material_hash") and appr.get("material_hash") != page.get("material_hash"):
            issues.append("approval_material_hash_mismatch")

    # Canonical path shape
    url = page.get("url") or ""
    if not url.startswith("/"):
        issues.append("url_not_absolute_path")

    analytics_missing = analytics_hooks_present(html)
    if analytics_missing:
        issues.append("analytics_hooks:" + ",".join(analytics_missing))

    # Required structural signals in body
    for signal, label in (
        (r"\b(documento|checklist|memória|diario|diário)s?\b", "docs"),
        (r"\b(riscos?|erros?|cuidado|aten[çc][aã]o)\b", "risks"),
    ):
        if not re.search(signal, body_text, re.I):
            issues.append(f"missing_signal_{label}")

    return {
        "ok": not issues,
        "issues": issues,
        "naturalness": nat,
        "status": status,
        "url": url,
        "page_id": page.get("page_id"),
    }


def sitemap_membership_ok(
    sitemap_urls: list[str],
    indexable_urls: list[str],
    *,
    reject_urls: list[str] | None = None,
) -> list[str]:
    """Every sitemap URL must be in the indexable set; none in reject."""
    issues = []
    idx = set(indexable_urls)
    rej = set(reject_urls or [])
    for u in sitemap_urls:
        path = urlparse(u).path if u.startswith("http") else u
        if path not in idx:
            issues.append(f"sitemap_not_indexable:{path}")
        if path in rej:
            issues.append(f"sitemap_rejected:{path}")
    return issues
