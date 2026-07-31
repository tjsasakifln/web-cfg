#!/usr/bin/env python3
"""Validate pSEO snapshot, registry, HTML pages and SEO invariants."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.schema import SnapshotError, validate_snapshot  # noqa: E402
from scripts.pseo.similarity import find_similar_pairs  # noqa: E402

FORBIDDEN_HTML = [
    re.compile(r"score_total", re.I),
    re.compile(r"commercial_state", re.I),
    re.compile(r"top\s*20\s*propriet", re.I),
    re.compile(r"do_not_contact", re.I),
    re.compile(r"human_notes", re.I),
    re.compile(r"suggested_offer", re.I),
]


def validate_all(data_dir: Path | None = None) -> dict:
    data_dir = data_dir or (ROOT / "data" / "pseo")
    errors: list[str] = []
    warnings: list[str] = []

    try:
        snap = validate_snapshot(data_dir)
    except SnapshotError as e:
        return {"ok": False, "errors": [str(e)]}

    reg_path = data_dir / "registry.json"
    if not reg_path.exists():
        errors.append("registry.json missing — run pseo:build first")
        return {"ok": False, "errors": errors}

    registry = json.loads(reg_path.read_text(encoding="utf-8"))
    pages = registry.get("pages") or []
    publish = [p for p in pages if p.get("status") == "publish"]
    noindex = [p for p in pages if p.get("status") == "noindex"]

    # No artificial numeric cap on publish count.
    # Human review hard gate: publish requires APPROVED | APPROVED_WITH_NOTES
    approved_states = {"APPROVED", "APPROVED_WITH_NOTES"}
    for p in publish:
        hr = p.get("human_review") or "PENDING"
        if hr not in approved_states:
            errors.append(
                f"publish page without human approval: {p.get('url')} human_review={hr}"
            )
    if len(publish) < 1:
        warnings.append(
            "zero publish pages — expected during containment until human review"
        )

    # uniqueness + content gates
    titles, h1s, canons, descs = [], [], [], []
    broken_internal: list[str] = []
    hub_paths = [
        ROOT / "inteligencia" / "index.html",
        ROOT / "inteligencia" / "mercados" / "index.html",
        ROOT / "inteligencia" / "orgaos" / "index.html",
        ROOT / "inteligencia" / "precos" / "index.html",
        ROOT / "inteligencia" / "concorrencia" / "index.html",
        ROOT / "inteligencia" / "cenarios" / "index.html",
        ROOT / "radar" / "index.html",
    ]
    for hp in hub_paths:
        if hp.exists():
            hub_html = hp.read_text(encoding="utf-8")
            if re.search(r"\bscore\s+\d{1,3}\b", hub_html, re.I):
                errors.append(f"public hub leaks indexability score: {hp.relative_to(ROOT)}")

    def internal_target_exists(href: str) -> bool:
        """True if relative site path resolves to an existing file."""
        if not href or href.startswith(("#", "mailto:", "tel:", "https://", "http://", "//")):
            return True  # not an internal path check
        if href.startswith("https://wa.me") or "wa.me" in href:
            return True
        path_only = href.split("?", 1)[0].split("#", 1)[0]
        if not path_only.startswith("/"):
            return True
        # home / query contact forms
        if path_only in {"/", ""}:
            return (ROOT / "index.html").exists()
        rel = path_only.strip("/")
        if (ROOT / rel / "index.html").exists():
            return True
        if (ROOT / f"{rel}.html").exists():
            return True
        if (ROOT / rel).is_file():
            return True
        return False

    for p in publish + noindex:
        url = p["url"]
        path = ROOT / url.strip("/") / "index.html"
        if not path.exists():
            errors.append(f"missing HTML for {url}")
            continue
        html = path.read_text(encoding="utf-8")
        for pat in FORBIDDEN_HTML:
            if pat.search(html):
                errors.append(f"forbidden in {url}: {pat.pattern}")
        if re.search(r"\bscore\s+\d{1,3}\b", html, re.I) and "indexability" not in html.lower():
            # block public leakage of numeric editorial scores
            if "indexável" in html or "preview" in html.lower() or "related-card" in html:
                # only fail if it looks like hub badge pattern "score N"
                if re.search(r"score\s+\d{1,3}\s*·", html, re.I) or re.search(
                    r">score\s+\d{1,3}<", html, re.I
                ):
                    errors.append(f"public page leaks score badge: {url}")
        title_m = re.search(r"<title>(.*?)</title>", html, re.I | re.S)
        h1_m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.I | re.S)
        # our format: <link href="..." rel="canonical"/>
        can_m = re.search(r'<link href="([^"]+)" rel="canonical"/>', html)
        robots_m = re.search(r'content="([^"]+)" name="robots"', html)
        desc_m = re.search(
            r'<meta content="([^"]*)" name="description"/>|<meta name="description" content="([^"]*)"',
            html,
            re.I,
        )
        if not title_m:
            errors.append(f"no title: {url}")
        else:
            titles.append(re.sub(r"\s+", " ", title_m.group(1)).strip())
        if not h1_m:
            errors.append(f"no h1: {url}")
        else:
            h1s.append(re.sub(r"<[^>]+>", "", h1_m.group(1)).strip())
        if not can_m:
            errors.append(f"no canonical: {url}")
        else:
            canons.append(can_m.group(1))
            if not can_m.group(1).startswith("https://confenge.com.br"):
                errors.append(f"canonical not absolute confenge: {url}")
        if not desc_m:
            errors.append(f"no meta description: {url}")
        else:
            d = (desc_m.group(1) or desc_m.group(2) or "").strip()
            descs.append(d)
            if len(d) < 40:
                warnings.append(f"short description: {url}")
        # single h1
        if len(re.findall(r"<h1\b", html, re.I)) != 1:
            errors.append(f"h1 count != 1: {url}")
        # methodology section
        if 'id="metodologia"' not in html and "Metodologia" not in html:
            errors.append(f"missing metodologia: {url}")
        # CTA attribution
        if "pseo_page_id" not in html and "data-pseo-page-id" not in html:
            warnings.append(f"weak attribution markers: {url}")
        # robots policy
        if p.get("status") == "noindex":
            rob = robots_m.group(1) if robots_m else ""
            if "noindex" not in rob:
                errors.append(f"noindex page missing robots noindex: {url}")
        if p.get("status") == "publish":
            rob = robots_m.group(1) if robots_m else ""
            if "noindex" in rob:
                errors.append(f"publish page has noindex: {url}")
            hr = p.get("human_review") or "PENDING"
            if hr not in {"APPROVED", "APPROVED_WITH_NOTES"}:
                errors.append(f"publish HTML but human_review={hr}: {url}")
        # author
        if "Tiago Sasaki" not in html:
            errors.append(f"missing author: {url}")
        # json-ld
        if "application/ld+json" not in html:
            errors.append(f"missing json-ld: {url}")
        else:
            for m in re.finditer(
                r'<script type="application/ld\+json">(.*?)</script>', html, re.S
            ):
                try:
                    json.loads(m.group(1))
                except json.JSONDecodeError as e:
                    errors.append(f"invalid json-ld {url}: {e}")

        # broken internal links (mesh integrity)
        for href in re.findall(r'href="([^"]+)"', html):
            if not href.startswith("/"):
                continue
            if href.startswith("/?"):  # contact form with query — home exists
                if not (ROOT / "index.html").exists():
                    broken_internal.append(f"{url} -> {href}")
                continue
            if not internal_target_exists(href):
                broken_internal.append(f"{url} -> {href}")

    if broken_internal:
        # cap list for readability
        sample = broken_internal[:15]
        errors.append(f"broken internal links ({len(broken_internal)}): {sample}")

    if len(titles) != len(set(titles)):
        errors.append(f"duplicate titles: {Counter(titles).most_common(3)}")
    if len(h1s) != len(set(h1s)):
        errors.append(f"duplicate h1s: {Counter(h1s).most_common(3)}")
    if len(canons) != len(set(canons)):
        errors.append(f"duplicate canonicals: {Counter(canons).most_common(3)}")
    if len(descs) != len(set(descs)):
        errors.append(f"duplicate descriptions: {Counter(descs).most_common(3)}")

    # sitemap only publish
    sm = ROOT / "sitemap-inteligencia.xml"
    if not sm.exists():
        errors.append("sitemap-inteligencia.xml missing")
    else:
        sm_text = sm.read_text(encoding="utf-8")
        for p in noindex:
            if p["url"] in sm_text:
                errors.append(f"noindex URL in sitemap: {p['url']}")
        for p in publish:
            if p["url"] not in sm_text:
                errors.append(f"publish URL missing from sitemap: {p['url']}")
        for loc in re.findall(r"<loc>([^<]+)</loc>", sm_text):
            if "?" in loc or "#" in loc:
                errors.append(f"query-string or fragment URL in sitemap: {loc}")
        # GSC rejects / poorly handles future lastmod
        from datetime import date as _date

        today = _date.today()
        for lm in re.findall(r"<lastmod>([^<]+)</lastmod>", sm_text):
            try:
                d = _date.fromisoformat(lm.strip()[:10])
            except ValueError:
                errors.append(f"invalid lastmod in sitemap: {lm}")
                continue
            if d > today:
                errors.append(f"future lastmod in sitemap (GSC rejects): {lm}")

    idx = ROOT / "sitemap-index.xml"
    if publish and not idx.exists():
        warnings.append("sitemap-index.xml missing (recommended single GSC entrypoint)")

    # similarity among publish — compare answer-box + h1 (not full chrome/template)
    body_items = []
    for p in publish:
        path = ROOT / p["url"].strip("/") / "index.html"
        if not path.exists():
            continue
        html = path.read_text(encoding="utf-8")
        h1_m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.I | re.S)
        ans_m = re.search(r'id="resposta"[^>]*>.*?<p>(.*?)</p>', html, re.I | re.S)
        h1 = re.sub(r"<[^>]+>", "", h1_m.group(1)) if h1_m else ""
        ans = re.sub(r"<[^>]+>", "", ans_m.group(1)) if ans_m else ""
        # include first table caption/rows snippet for evidence uniqueness
        tbl = re.search(r"<tbody>(.*?)</tbody>", html, re.S)
        tbl_txt = re.sub(r"<[^>]+>", " ", tbl.group(1))[:400] if tbl else ""
        body_items.append((p["page_id"], f"{h1} {ans} {tbl_txt}"))
    sim = find_similar_pairs(body_items, threshold=0.90)
    if sim:
        errors.append(f"high similarity publish pairs: {sim[:5]}")

    # Editorial audit — must not leave publishable pages with P0/P1 defects
    try:
        from scripts.pseo.editorial_audit import run_editorial_audit

        ed = run_editorial_audit(root=ROOT)
        result_ed = {
            "ok": ed.get("ok"),
            "publish_fail_count": ed.get("publish_fail_count"),
            "p0_issue_count": ed.get("p0_issue_count"),
        }
        if not ed.get("ok"):
            errors.append(
                f"editorial_audit_failed: publish_fails={ed.get('publish_fail_count')} "
                f"p0={ed.get('p0_issue_count')} (see seo/pseo-editorial-report.md)"
            )
    except Exception as exc:  # noqa: BLE001 — surface as validation error
        errors.append(f"editorial_audit_error: {exc}")
        result_ed = {"ok": False, "error": str(exc)}

    result = {
        "ok": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "publish_count": len(publish),
        "noindex_count": len(noindex),
        "reject_count": sum(1 for p in pages if p.get("status") == "reject"),
        "dataset_hash": snap["manifest"].get("dataset_hash"),
        "editorial_audit": result_ed,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return result


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=None)
    args = ap.parse_args(argv)
    r = validate_all(args.data)
    return 0 if r.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
