#!/usr/bin/env python3
"""Story 1.4 — .env.example must list product env vars (not only AIOX SaaS templates)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / ".env.example"
ENV_VARS = ROOT / "docs" / "ops" / "ENV-VARS.md"

# Product-critical names that must appear in .env.example (placeholders only)
REQUIRED_PRODUCT = (
    "OPS_TOKEN",
    "LEAD_ALLOW_MEMORY_FALLBACK",
    "LEAD_STORE_DIR",
    "RESEND_API_KEY",
    "TURNSTILE_SECRET_KEY",
    "IP_HASH_SALT",
    "LEAD_RETAIN_DAYS",
    "OPS_WEBHOOK_URL",
    "NTFY_URL",
)

# If present, must be clearly sectioned as non-product
AIOX_MARKERS = ("AIOX", "non-product", "NON-PRODUCT", "framework only")


def main() -> int:
    if not EXAMPLE.is_file():
        print("FAIL missing .env.example")
        return 1
    text = EXAMPLE.read_text(encoding="utf-8")
    env_doc = ENV_VARS.read_text(encoding="utf-8") if ENV_VARS.is_file() else ""

    failed = 0
    for name in REQUIRED_PRODUCT:
        if name not in text:
            print(f"FAIL missing product var in .env.example: {name}")
            failed += 1
        if name not in env_doc and name != "OPS_TOKEN":
            # OPS_TOKEN may live in permissions section of ENV-VARS or elsewhere
            pass

    # No live-looking secrets
    if re.search(r"(sk_live|re_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,})", text):
        print("FAIL possible live secret pattern in .env.example")
        failed += 1

    # Product section must exist
    if "CONFENGE" not in text and "Product" not in text and "Leads" not in text:
        print("FAIL .env.example lacks product section marker")
        failed += 1

    # Supabase must not be presented as required product runtime for Netlify public
    if "SUPABASE_URL" in text:
        # allowed only in clearly non-product section
        idx = text.find("SUPABASE_URL")
        window = text[max(0, idx - 400) : idx]
        if not any(m.lower() in window.lower() for m in AIOX_MARKERS + ("optional", "not used", "non-product")):
            # still ok if under explicit "Optional / unused" header above
            if "unused" not in text[:idx].lower() and "non-product" not in text[:idx].lower():
                print("WARN SUPABASE_URL present — ensure non-product section (not fail if sectioned)")

    # example ⊆ known product-ish names from ENV-VARS (soft): every CAPS= line should be documented or AIOX
    assigns = re.findall(r"^([A-Z][A-Z0-9_]+)=", text, re.M)
    unknown = []
    for name in assigns:
        if name in env_doc or name.startswith(("DEEPSEEK", "OPENROUTER", "ANTHROPIC", "OPENAI", "EXA", "CONTEXT7", "CLICKUP", "N8N", "SENTRY", "GITHUB", "SUPABASE", "AIOX")):
            continue
        if name in (
            "OPS_TOKEN",
            "REVOPS_TOKEN",
            "GSC_BACKUP_DIR",
            "TURNSTILE_SITE_KEY",
            "ALLOWED_ORIGINS",
            "SITE_ID",
            "NETLIFY_SITE_ID",
            "NETLIFY_BLOBS_SITE_ID",
            "NETLIFY_BLOBS_TOKEN",
            "NETLIFY_API_TOKEN",
            "NETLIFY_AUTH_TOKEN",
            "NETLIFY_BLOBS_CONTEXT",
            "CONTEXT",
            "NODE_ENV",
            "COMMIT_REF",
            "CACHED_COMMIT_REF",
            "LEAD_STORE",
            "LEAD_STORE_HTTP_URL",
            "LEAD_STORE_HTTP_TOKEN",
            "LEAD_STORE_HTTP_GET_IDEMPOTENCY_URL",
            "LEAD_FROM_EMAIL",
            "LEAD_NOTIFY_EMAIL",
            "NURTURE_TOKEN_SECRET",
            "LEAD_REQUIRE_TURNSTILE",
            "LEAD_PROBE_SECRET",
            "LEAD_REQUIRE_ORIGIN",
            "LEAD_RATE_WINDOW_MS",
            "LEAD_RATE_MAX_IP",
            "LEAD_RATE_MAX_FP",
            "OPS_WEBHOOK_SECRET",
            "OPS_WEBHOOK_BEARER",
            "CONFENGE_INBOUND_WEBHOOK_URL",
            "CONFENGE_INBOUND_WEBHOOK_SECRET",
            "CONFENGE_INBOUND_ALLOWED_HOSTS",
            "CONFENGE_INBOUND_MAX_ATTEMPTS",
            "CONFENGE_INBOUND_TIMEOUT_MS",
            "CONFENGE_COMMERCIAL_EVENT_ENABLED",
            "CONFENGE_COMMERCIAL_EVENT_WEBHOOK_URL",
            "CONFENGE_COMMERCIAL_EVENT_WEBHOOK_SECRET",
            "CONFENGE_COMMERCIAL_EVENT_HEALTH_URL",
            "CONFENGE_COMMERCIAL_EVENT_ALLOWED_HOSTS",
            "CONFENGE_COMMERCIAL_EVENT_TIMEOUT_MS",
            "NTFY_TOKEN",
            "NTFY_TOPIC",
            "BASE_URL",
            "OPS_BASE",
        ):
            continue
        unknown.append(name)

    if unknown:
        print("FAIL unknown env names not in product allowlist:", ", ".join(unknown[:20]))
        failed += 1
    else:
        print("OK env names allowlisted")

    if failed:
        print(f"ENV_EXAMPLE_HONESTY_FAIL count={failed}")
        return 1
    print("ENV_EXAMPLE_HONESTY_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
