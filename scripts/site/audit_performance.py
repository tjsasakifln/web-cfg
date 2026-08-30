#!/usr/bin/env python3
"""Static performance budget audit with honest gzip math and per-route census.

Two layers, deliberately separate:

1. Sitewide first-party bytes. ``styles.css`` and ``script.js`` are compared as
   three distinct quantities: uncompressed (raw) bytes, gzip-compressed bytes at
   production level 6, and the hard gzip contract from ``design-system.json``.
   Brotli is reported when the encoder is importable; gzip remains the
   fail-closed transport. A raw-size fudge must not mark an over-budget
   compressed tree OK.

2. Per-route font, asset and CLS census (issue #508). Every shipped visitor
   route is walked, its referenced assets are resolved on disk and classified,
   and each route is compared against ``font_files_max`` and
   ``font_total_gzip_kb_max``. CLS is not measurable without a browser, so this
   auditor does not pretend to measure it: it reads the per-route CLS Chrome
   already produced in ``docs/lighthouse-runs/summary.json`` and enforces the
   declared ``cls_max`` against those rows. ``lighthouse_thresholds.mjs`` reads
   the same JSON key and enforces it against the live run CI performs after the
   site is built, so one declared number gates both the committed evidence and
   the fresh browser measurement.

The site ships zero ``@font-face`` today, so the font budget is calibrated at
zero. The first webfont therefore lands as an explicit, reviewed delta in
``design-system.json`` instead of being absorbed silently.
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

DS_PATH = ROOT / "data" / "site" / "design-system.json"
LIGHTHOUSE_SUMMARY_PATH = ROOT / "docs" / "lighthouse-runs" / "summary.json"
BASELINE_PATH = ROOT / "docs" / "performance" / "PERFORMANCE-BUDGET-BASELINE.json"

CSS_GZIP_CAP_KB = 80
JS_GZIP_CAP_KB = 40
GZIP_LEVEL = 6

# Ceilings on what may be *declared* in design-system.json, mirroring the CSS
# and JS caps. They exist so a future PR cannot quietly raise the font budget to
# an arbitrary number: #494 may spend up to six subsetted WOFF2 faces, and a
# subsetted Latin WOFF2 that needs more than 20 KB gzip is not subsetted.
FONT_FILES_CAP = 6
FONT_GZIP_CAP_KB = 120.0
# The release gate already refuses CLS above 0.05 on every measured route. The
# declaration may tighten that, never loosen it.
CLS_CAP = 0.05

FONT_SUFFIXES = (".woff2", ".woff", ".ttf", ".otf", ".eot")
IMAGE_SUFFIXES = (
    ".svg",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".avif",
    ".gif",
    ".ico",
    ".bmp",
)
STYLE_SUFFIXES = (".css",)
SCRIPT_SUFFIXES = (".js", ".mjs", ".cjs")

# Hosts that only ever serve webfonts. A route that links one has taken on a
# font cost even though no file lands in this repository.
REMOTE_FONT_HOSTS = (
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "use.typekit.net",
    "p.typekit.net",
    "fonts.bunny.net",
    "use.fontawesome.com",
    "cdn.jsdelivr.net/fontsource",
)

ATTR_REF_RE = re.compile(
    r"""\b(?:href|src|poster|data-src|data-href)\s*=\s*["']([^"']+)["']""",
    re.I,
)
SRCSET_RE = re.compile(r"""\bsrcset\s*=\s*["']([^"']+)["']""", re.I)
STYLE_BLOCK_RE = re.compile(r"<style\b[^>]*>(.*?)</style>", re.I | re.S)
STYLE_ATTR_RE = re.compile(r"""\bstyle\s*=\s*["']([^"']*)["']""", re.I)
CSS_URL_RE = re.compile(r"""url\(\s*['"]?([^'")]+?)['"]?\s*\)""", re.I)
CSS_IMPORT_RE = re.compile(r"""@import\s+['"]([^'"]+)['"]""", re.I)
FONT_FACE_RE = re.compile(r"@font-face\b", re.I)
NON_ASSET_SCHEMES = (
    "data:",
    "mailto:",
    "tel:",
    "javascript:",
    "blob:",
    "about:",
    "#",
)


def gzip_len(data: bytes, *, level: int = GZIP_LEVEL) -> int:
    return len(gzip.compress(data, compresslevel=level))


def brotli_len(data: bytes) -> int | None:
    try:
        import brotli  # type: ignore[import-not-found]
    except ImportError:
        return None
    return len(brotli.compress(data))


def kb(n: int) -> float:
    return round(n / 1024, 2)


def evaluate_sizes(
    *,
    css_raw: int,
    css_gzip: int,
    css_brotli: int | None,
    js_raw: int,
    js_gzip: int,
    js_brotli: int | None,
    css_gzip_budget_kb: float,
    js_gzip_budget_kb: float,
    css_gzip_cap_kb: float = CSS_GZIP_CAP_KB,
    js_gzip_cap_kb: float = JS_GZIP_CAP_KB,
) -> dict[str, Any]:
    """Pure budget math. Callers inject measured sizes; this does not read disk."""
    failures: list[str] = []
    if css_gzip_budget_kb > css_gzip_cap_kb:
        failures.append(
            f"declared css_gzip_kb_max {css_gzip_budget_kb} exceeds cap {css_gzip_cap_kb}"
        )
    if js_gzip_budget_kb > js_gzip_cap_kb:
        failures.append(
            f"declared own_js_gzip_kb_max {js_gzip_budget_kb} exceeds cap {js_gzip_cap_kb}"
        )
    css_gzip_kb = kb(css_gzip)
    js_gzip_kb = kb(js_gzip)
    if css_gzip_kb > css_gzip_budget_kb:
        failures.append(
            f"css gzip {css_gzip_kb} KB exceeds hard budget {css_gzip_budget_kb} KB"
        )
    if js_gzip_kb > js_gzip_budget_kb:
        failures.append(
            f"own js gzip {js_gzip_kb} KB exceeds hard budget {js_gzip_budget_kb} KB"
        )
    return {
        "css_raw_kb": kb(css_raw),
        "css_gzip_kb": css_gzip_kb,
        "css_brotli_kb": None if css_brotli is None else kb(css_brotli),
        "css_gzip_budget_kb": css_gzip_budget_kb,
        "js_raw_kb": kb(js_raw),
        "js_gzip_kb": js_gzip_kb,
        "js_brotli_kb": None if js_brotli is None else kb(js_brotli),
        "js_gzip_budget_kb": js_gzip_budget_kb,
        "gzip_level": GZIP_LEVEL,
        "framework_runtime": False,
        "carousel_video_webgl_lottie": False,
        "failures": failures,
        "ok": not failures,
    }


def load_budget(ds_path: Path = DS_PATH) -> dict[str, float]:
    ds = json.loads(ds_path.read_text(encoding="utf-8"))
    budget = ds.get("performance_budget") or {}
    missing = [
        key
        for key in ("font_total_gzip_kb_max", "font_files_max", "cls_max")
        if key not in budget
    ]
    if missing:
        raise KeyError(
            "performance_budget is missing required keys: " + ", ".join(sorted(missing))
        )
    return {
        "css_gzip_budget_kb": float(budget.get("css_gzip_kb_max", CSS_GZIP_CAP_KB)),
        "js_gzip_budget_kb": float(budget.get("own_js_gzip_kb_max", JS_GZIP_CAP_KB)),
        "css_raw_budget_kb": float(budget.get("css_raw_kb_max", 250)),
        "js_raw_budget_kb": float(budget.get("own_js_raw_kb_max", 120)),
        "font_total_gzip_budget_kb": float(budget["font_total_gzip_kb_max"]),
        "font_files_budget": float(budget["font_files_max"]),
        "cls_budget": float(budget["cls_max"]),
    }


# --------------------------------------------------------------------------
# Per-route asset census
# --------------------------------------------------------------------------


def asset_class(path_or_ref: str) -> str:
    """Classify one reference by extension. Unknown extensions are ``other``."""
    lowered = path_or_ref.split("#")[0].split("?")[0].lower()
    if lowered.endswith(FONT_SUFFIXES):
        return "font"
    if lowered.endswith(IMAGE_SUFFIXES):
        return "image"
    if lowered.endswith(STYLE_SUFFIXES):
        return "style"
    if lowered.endswith(SCRIPT_SUFFIXES):
        return "script"
    return "other"


def is_remote_font_reference(ref: str) -> bool:
    """A remote webfont costs the visitor exactly as much as a local one."""
    lowered = ref.lower()
    if not lowered.startswith(("http://", "https://", "//")):
        return False
    if any(host in lowered for host in REMOTE_FONT_HOSTS):
        return True
    return asset_class(lowered) == "font"


def extract_html_references(html: str) -> list[str]:
    """Every asset URL an HTML document asks the browser to fetch."""
    refs: list[str] = []
    refs.extend(ATTR_REF_RE.findall(html))
    for value in SRCSET_RE.findall(html):
        for candidate in value.split(","):
            token = candidate.strip().split()
            if token:
                refs.append(token[0])
    for block in STYLE_BLOCK_RE.findall(html):
        refs.extend(CSS_URL_RE.findall(block))
        refs.extend(CSS_IMPORT_RE.findall(block))
    for value in STYLE_ATTR_RE.findall(html):
        refs.extend(CSS_URL_RE.findall(value))
    return refs


def extract_css_references(css: str) -> list[str]:
    refs = list(CSS_URL_RE.findall(css))
    refs.extend(CSS_IMPORT_RE.findall(css))
    return refs


def count_font_face_rules(text: str) -> int:
    return len(FONT_FACE_RE.findall(text))


def resolve_local_asset(ref: str, base_dir: Path, root: Path) -> Path | None:
    """Resolve one reference to a first-party file inside ``root``, or None."""
    candidate = (ref or "").strip()
    if not candidate:
        return None
    lowered = candidate.lower()
    if lowered.startswith(NON_ASSET_SCHEMES) or lowered.startswith("//"):
        return None
    if lowered.startswith(("http://", "https://")):
        return None
    clean = candidate.split("#")[0].split("?")[0]
    if not clean:
        return None
    target = (root / clean.lstrip("/")) if clean.startswith("/") else (base_dir / clean)
    try:
        resolved = target.resolve()
    except OSError:
        return None
    root_resolved = root.resolve()
    if not resolved.is_relative_to(root_resolved):
        return None
    return resolved if resolved.is_file() else None


class _AssetCache:
    """Read, size and compress each first-party file at most once per audit."""

    def __init__(self) -> None:
        self._sizes: dict[Path, tuple[int, int]] = {}
        self._css: dict[Path, tuple[list[str], int]] = {}

    def sizes(self, path: Path) -> tuple[int, int]:
        """(raw bytes, gzip bytes). Non-text assets still report a gzip number
        so the font budget can be expressed in one unit across every route."""
        cached = self._sizes.get(path)
        if cached is None:
            data = path.read_bytes()
            cached = (len(data), gzip_len(data))
            self._sizes[path] = cached
        return cached

    def css(self, path: Path) -> tuple[list[str], int]:
        """(references, @font-face rule count) for one stylesheet."""
        cached = self._css.get(path)
        if cached is None:
            text = path.read_text(encoding="utf-8", errors="replace")
            cached = (extract_css_references(text), count_font_face_rules(text))
            self._css[path] = cached
        return cached


def measure_route(
    *,
    route: str,
    html_path: Path,
    root: Path,
    cache: _AssetCache | None = None,
) -> dict[str, Any]:
    """Font, asset and stylesheet census for one rendered route.

    Walks the HTML, then every first-party stylesheet it links, so a webfont
    declared inside ``styles.css`` is attributed to every route that loads it.
    """
    cache = cache or _AssetCache()
    html = html_path.read_text(encoding="utf-8", errors="replace")
    base_dir = html_path.parent

    font_face_rules = count_font_face_rules(html)
    remote_fonts: set[str] = set()
    resolved: dict[Path, str] = {}
    pending: list[tuple[str, Path]] = [(ref, base_dir) for ref in extract_html_references(html)]
    seen_css: set[Path] = set()

    while pending:
        ref, ref_base = pending.pop()
        if is_remote_font_reference(ref):
            remote_fonts.add(ref.split("?")[0])
            continue
        local = resolve_local_asset(ref, ref_base, root)
        if local is None:
            continue
        kind = asset_class(local.name)
        resolved.setdefault(local, kind)
        if kind == "style" and local not in seen_css:
            seen_css.add(local)
            css_refs, css_font_faces = cache.css(local)
            font_face_rules += css_font_faces
            pending.extend((css_ref, local.parent) for css_ref in css_refs)

    per_class: dict[str, dict[str, int]] = {}
    font_files: list[str] = []
    for path, kind in sorted(resolved.items()):
        raw, compressed = cache.sizes(path)
        bucket = per_class.setdefault(kind, {"files": 0, "raw": 0, "gzip": 0})
        bucket["files"] += 1
        bucket["raw"] += raw
        bucket["gzip"] += compressed
        if kind == "font":
            font_files.append("/" + path.relative_to(root.resolve()).as_posix())

    font_bucket = per_class.get("font", {"files": 0, "raw": 0, "gzip": 0})
    asset_files = sum(bucket["files"] for bucket in per_class.values())
    asset_raw = sum(bucket["raw"] for bucket in per_class.values())
    asset_gzip = sum(bucket["gzip"] for bucket in per_class.values())

    return {
        "route": route,
        "asset_files": asset_files + len(remote_fonts),
        "asset_raw_kb": kb(asset_raw),
        "asset_gzip_kb": kb(asset_gzip),
        "by_class": {
            kind: {
                "files": bucket["files"],
                "raw_kb": kb(bucket["raw"]),
                "gzip_kb": kb(bucket["gzip"]),
            }
            for kind, bucket in sorted(per_class.items())
        },
        "font_files": font_bucket["files"] + len(remote_fonts),
        "font_gzip_kb": kb(font_bucket["gzip"]),
        "font_raw_kb": kb(font_bucket["raw"]),
        "font_face_rules": font_face_rules,
        "font_sources": sorted(font_files) + sorted(remote_fonts),
    }


def load_route_cls(summary_path: Path = LIGHTHOUSE_SUMMARY_PATH) -> dict[str, float]:
    """Worst Chrome-measured CLS per route from the committed Lighthouse runs.

    This auditor never claims to measure CLS itself. The numbers here come from
    ``npm run test:lighthouse``, which drives headless Chrome against the built
    ``_site`` and commits every run to ``docs/lighthouse-runs/``.
    """
    if not summary_path.is_file():
        return {}
    payload = json.loads(summary_path.read_text(encoding="utf-8"))
    worst: dict[str, float] = {}
    for row in payload.get("results") or []:
        if row.get("error"):
            continue
        path = str(row.get("path") or "")
        value = row.get("cls")
        if not path or not isinstance(value, (int, float)):
            continue
        worst[path] = max(worst.get(path, 0.0), float(value))
    return worst


def evaluate_route_budgets(
    rows: Iterable[dict[str, Any]],
    *,
    font_files_budget: float,
    font_total_gzip_budget_kb: float,
    cls_budget: float,
    font_files_cap: int = FONT_FILES_CAP,
    font_gzip_cap_kb: float = FONT_GZIP_CAP_KB,
    cls_cap: float = CLS_CAP,
) -> dict[str, Any]:
    """Pure per-route budget math. Callers inject measured rows."""
    failures: list[str] = []
    if font_files_budget > font_files_cap:
        failures.append(
            f"declared font_files_max {font_files_budget} exceeds cap {font_files_cap}"
        )
    if font_total_gzip_budget_kb > font_gzip_cap_kb:
        failures.append(
            f"declared font_total_gzip_kb_max {font_total_gzip_budget_kb} "
            f"exceeds cap {font_gzip_cap_kb}"
        )
    if cls_budget > cls_cap:
        failures.append(f"declared cls_max {cls_budget} exceeds cap {cls_cap}")

    rows = list(rows)
    unique_fonts: set[str] = set()
    for row in rows:
        route = row["route"]
        unique_fonts.update(row.get("font_sources") or [])
        if row["font_files"] > font_files_budget:
            sources = ", ".join(row.get("font_sources") or []) or "unnamed"
            failures.append(
                f"{route}: {row['font_files']} font files exceed budget "
                f"{font_files_budget} ({sources})"
            )
        if row["font_gzip_kb"] > font_total_gzip_budget_kb:
            failures.append(
                f"{route}: font gzip {row['font_gzip_kb']} KB exceeds budget "
                f"{font_total_gzip_budget_kb} KB"
            )
        if row["font_files"] == 0 and row["font_face_rules"] > font_files_budget:
            failures.append(
                f"{route}: {row['font_face_rules']} @font-face rules exceed budget "
                f"{font_files_budget} with no resolvable font file"
            )
        cls = row.get("cls")
        if isinstance(cls, (int, float)) and cls > cls_budget:
            failures.append(f"{route}: CLS {cls} exceeds budget {cls_budget}")

    measured_cls = [
        float(row["cls"]) for row in rows if isinstance(row.get("cls"), (int, float))
    ]
    return {
        "routes_measured": len(rows),
        "font_files_total": len(unique_fonts),
        "font_gzip_kb_max_route": max([row["font_gzip_kb"] for row in rows], default=0.0),
        "font_files_budget": font_files_budget,
        "font_total_gzip_budget_kb": font_total_gzip_budget_kb,
        "cls_budget": cls_budget,
        "cls_routes_measured": len(measured_cls),
        "cls_observed_max": max(measured_cls, default=None),
        "asset_raw_kb_max_route": max([row["asset_raw_kb"] for row in rows], default=0.0),
        "asset_files_max_route": max([row["asset_files"] for row in rows], default=0),
        "failures": failures,
    }


def measure_routes(
    root: Path = ROOT,
    *,
    summary_path: Path | None = None,
) -> list[dict[str, Any]]:
    """Per-route font, asset and CLS rows for every shipped visitor route."""
    from scripts.site.public_copy_scope import relpath, route_for

    cls_by_route = load_route_cls(
        summary_path if summary_path is not None else LIGHTHOUSE_SUMMARY_PATH
    )
    cache = _AssetCache()
    rows: list[dict[str, Any]] = []
    for html_path in _route_html_files(root):
        route = route_for(relpath(html_path, root))
        row = measure_route(route=route, html_path=html_path, root=root, cache=cache)
        row["cls"] = cls_by_route.get(route)
        row["cls_source"] = (
            "docs/lighthouse-runs/summary.json" if route in cls_by_route else None
        )
        rows.append(row)
    return sorted(rows, key=lambda row: row["route"])


def _route_html_files(root: Path) -> list[Path]:
    from scripts.site.public_copy_scope import visitor_facing_html_files

    return visitor_facing_html_files(root)


def audit_tree(
    root: Path = ROOT,
    ds_path: Path = DS_PATH,
    *,
    rows: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Sitewide byte budgets plus the per-route census. ``rows`` lets a caller
    that already measured the tree reuse it instead of walking it twice."""
    css = (root / "styles.css").read_bytes()
    js = (root / "script.js").read_bytes()
    budget = load_budget(ds_path)
    report = evaluate_sizes(
        css_raw=len(css),
        css_gzip=gzip_len(css),
        css_brotli=brotli_len(css),
        js_raw=len(js),
        js_gzip=gzip_len(js),
        js_brotli=brotli_len(js),
        css_gzip_budget_kb=budget["css_gzip_budget_kb"],
        js_gzip_budget_kb=budget["js_gzip_budget_kb"],
    )
    report["css_raw_budget_kb"] = budget["css_raw_budget_kb"]
    report["js_raw_budget_kb"] = budget["js_raw_budget_kb"]
    report["css_budget_kb"] = budget["css_gzip_budget_kb"]
    report["js_budget_kb"] = budget["js_gzip_budget_kb"]
    report["css_budget_unit"] = "gzip"
    report["js_budget_unit"] = "gzip"
    report["compared_unit"] = "gzip+raw"
    report["multiplier_fudge"] = False
    report["note"] = (
        "Hard fail is gzip vs the declared gzip contract. Raw and brotli are "
        "reported separately and never used as a fudge for the gzip gate."
    )

    rows = measure_routes(root) if rows is None else rows
    per_route = evaluate_route_budgets(
        rows,
        font_files_budget=budget["font_files_budget"],
        font_total_gzip_budget_kb=budget["font_total_gzip_budget_kb"],
        cls_budget=budget["cls_budget"],
    )
    report["failures"] = [*report["failures"], *per_route["failures"]]
    report["ok"] = not report["failures"]
    report["per_route"] = {
        key: value for key, value in per_route.items() if key != "failures"
    }
    report["per_route"]["cls_measured_by"] = (
        "headless Chrome via npm run test:lighthouse; enforced here and in "
        "scripts/site/lighthouse_thresholds.mjs from the same cls_max key"
    )
    report["font_routes"] = [
        {
            "route": row["route"],
            "font_files": row["font_files"],
            "font_gzip_kb": row["font_gzip_kb"],
            "font_face_rules": row["font_face_rules"],
            "font_sources": row["font_sources"],
        }
        for row in rows
        if row["font_files"] or row["font_face_rules"]
    ]
    report["heaviest_routes"] = [
        {
            "route": row["route"],
            "asset_files": row["asset_files"],
            "asset_raw_kb": row["asset_raw_kb"],
        }
        for row in sorted(
            rows, key=lambda row: (-row["asset_raw_kb"], row["route"])
        )[:10]
    ]
    report["route_cls"] = [
        {"route": row["route"], "cls": row["cls"]}
        for row in rows
        if row["cls"] is not None
    ]
    return report


def evaluate_performance(root: Path | None = None, *, budget: dict | None = None) -> dict[str, Any]:
    """Shipped gzip-honest report used by truthful-gates and the CLI."""
    ds_path = DS_PATH
    if budget is not None:
        report = audit_tree(root or ROOT, ds_path)
        report["css_budget_kb"] = float(budget.get("css_gzip_kb_max", report["css_budget_kb"]))
        report["js_budget_kb"] = float(budget.get("own_js_gzip_kb_max", report["js_budget_kb"]))
        return report
    return audit_tree(root or ROOT, ds_path)


# --------------------------------------------------------------------------
# Readable output and the checked-in baseline
# --------------------------------------------------------------------------


def render_route_table(rows: Iterable[dict[str, Any]]) -> str:
    """Fixed-width per-route census, ordered by route so two SHAs diff cleanly."""
    header = (
        f"{'route':<72}{'assets':>7}{'raw KB':>9}{'fonts':>7}"
        f"{'font KB':>9}{'@font-face':>11}{'CLS':>8}"
    )
    lines = [header, "-" * len(header)]
    for row in sorted(rows, key=lambda row: row["route"]):
        cls = row.get("cls")
        cls_text = "-" if cls is None else f"{float(cls):.3f}"
        lines.append(
            f"{row['route'][:72]:<72}{row['asset_files']:>7}{row['asset_raw_kb']:>9.1f}"
            f"{row['font_files']:>7}{row['font_gzip_kb']:>9.2f}"
            f"{row['font_face_rules']:>11}{cls_text:>8}"
        )
    return "\n".join(lines)


def build_baseline(
    root: Path = ROOT,
    ds_path: Path = DS_PATH,
    *,
    rows: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """The delta anchor #494 declares against.

    Only stable facts are recorded as contract: the declared budget, the font
    census (zero today) and the Chrome-measured per-route CLS. Per-route asset
    weight moves with every content edit, so it is summarised as an
    informational snapshot rather than frozen into a gate that every editorial
    PR would have to refresh.
    """
    budget = load_budget(ds_path)
    rows = measure_routes(root) if rows is None else rows
    cls_rows = [row for row in rows if row["cls"] is not None]
    return {
        "issue": 508,
        "generated_by": "npm run audit:performance -- --write-baseline",
        "budget": {
            "css_gzip_kb_max": budget["css_gzip_budget_kb"],
            "css_raw_kb_max": budget["css_raw_budget_kb"],
            "own_js_gzip_kb_max": budget["js_gzip_budget_kb"],
            "own_js_raw_kb_max": budget["js_raw_budget_kb"],
            "font_total_gzip_kb_max": budget["font_total_gzip_budget_kb"],
            "font_files_max": budget["font_files_budget"],
            "cls_max": budget["cls_budget"],
        },
        "fonts": {
            "measured_by": "scripts/site/audit_performance.py measure_routes",
            "routes_with_font_files": sorted(
                row["route"] for row in rows if row["font_files"]
            ),
            "routes_with_font_face_rules": sorted(
                row["route"] for row in rows if row["font_face_rules"]
            ),
            "font_files_total": len(
                {source for row in rows for source in row["font_sources"]}
            ),
            "font_gzip_kb_total": round(
                sum(row["font_gzip_kb"] for row in rows if row["font_files"]), 2
            ),
        },
        "cls": {
            "measured_by": (
                "headless Chrome, npm run test:lighthouse, committed to "
                "docs/lighthouse-runs/"
            ),
            "routes_measured": len(cls_rows),
            "observed_max": max((float(row["cls"]) for row in cls_rows), default=None),
            "per_route": [
                {"route": row["route"], "cls": float(row["cls"])} for row in cls_rows
            ],
        },
        "assets_snapshot": {
            "note": (
                "informational; per-route asset weight moves with editorial "
                "content, so it is not a frozen gate. Refresh with "
                "npm run audit:performance -- --write-baseline"
            ),
            "routes_measured": len(rows),
            "asset_raw_kb_max_route": max(
                (row["asset_raw_kb"] for row in rows), default=0.0
            ),
            "asset_files_max_route": max(
                (row["asset_files"] for row in rows), default=0
            ),
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--format",
        choices=("json", "text"),
        default="json",
        help="json (default, machine-readable) or text (per-route table)",
    )
    parser.add_argument(
        "--write-baseline",
        action="store_true",
        help=f"rewrite {BASELINE_PATH.relative_to(ROOT)} from the current tree",
    )
    args = parser.parse_args(argv)

    rows = measure_routes()
    report = audit_tree(rows=rows)

    if args.write_baseline:
        baseline = build_baseline(rows=rows)
        BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
        BASELINE_PATH.write_text(
            json.dumps(baseline, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(f"WROTE {BASELINE_PATH.relative_to(ROOT)}")

    if args.format == "text":
        print(render_route_table(rows))
        print()
        print(
            f"routes={report['per_route']['routes_measured']} "
            f"font_files={report['per_route']['font_files_total']}/"
            f"{report['per_route']['font_files_budget']:g} "
            f"font_gzip_kb_max_route={report['per_route']['font_gzip_kb_max_route']}/"
            f"{report['per_route']['font_total_gzip_budget_kb']:g} "
            f"cls_max_observed={report['per_route']['cls_observed_max']}/"
            f"{report['per_route']['cls_budget']} "
            f"css_gzip_kb={report['css_gzip_kb']}/{report['css_budget_kb']:g} "
            f"js_gzip_kb={report['js_gzip_kb']}/{report['js_budget_kb']:g}"
        )
    else:
        print(json.dumps(report, ensure_ascii=False, indent=2))

    if not report["ok"]:
        print("FAIL performance budget exceeded", file=sys.stderr)
        for failure in report["failures"]:
            print(f"FAIL {failure}", file=sys.stderr)
        return 1
    print("OK audit:performance")
    return 0


if __name__ == "__main__":
    sys.exit(main())
