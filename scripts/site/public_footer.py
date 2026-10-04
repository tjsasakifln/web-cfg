"""Render and validate the single public CONFENGE footer component."""

from __future__ import annotations

import re
from html import escape
from pathlib import Path

from scripts.site.authority import footer_authority_nav
from scripts.site.brand import footer_blurb
from scripts.site.public_ia import CONTACT, footer_columns_html


_SITE_FOOTER_RE = re.compile(
    r'<footer\b[^>]*\bclass="[^"]*\bsite-footer\b[^"]*"[^>]*>.*?</footer>',
    re.IGNORECASE | re.DOTALL,
)
_PP_FOOTER_RE = re.compile(
    r'<footer\b[^>]*\bclass="[^"]*\bpp-footer\b', re.IGNORECASE
)
_PAGE_DATES_RE = re.compile(
    r'<span class="footer-page-dates">.*?<time datetime="([^"]+)">.*?</time>.*?'
    r'<time datetime="([^"]+)">(.*?)</time>.*?</span>',
    re.IGNORECASE | re.DOTALL,
)
_META_RE = re.compile(r"<meta\b[^>]*>", re.IGNORECASE)
_ATTR_RE = re.compile(r'''([:\w-]+)\s*=\s*(["'])(.*?)\2''', re.DOTALL)
_BODY_END_RE = re.compile(r"</body\s*>", re.IGNORECASE)
_FOOTER_LOGO = '<img alt="CONFENGE" decoding="async" height="58" loading="lazy" src="/assets/logo-confenge-white-500-1677038e.png" width="224"/>'


class PublicFooterError(RuntimeError):
    """Fail-closed public footer contract violation."""


def _is_indexable(html: str) -> bool:
    """Return the effective on-page indexability signal for a public HTML file."""

    for tag in _META_RE.findall(html):
        attrs = {name.lower(): value for name, _quote, value in _ATTR_RE.findall(tag)}
        if attrs.get("name", "").lower() != "robots":
            continue
        directives = {item.strip().lower() for item in attrs.get("content", "").split(",")}
        return "noindex" not in directives
    return True


def render_public_footer(
    *,
    published_at: str | None = None,
    modified_at: str | None = None,
    modified_label: str | None = None,
) -> str:
    """Render the canonical footer, retaining page dates when supplied."""

    if bool(published_at) != bool(modified_at):
        raise ValueError("public footer page dates must be supplied together")
    dates = ""
    if published_at and modified_at:
        label = modified_label or modified_at
        dates = (
            ' <span class="footer-page-dates">· publicada em '
            f'<time datetime="{escape(published_at, quote=True)}">{escape(published_at)}</time> · '
            'atualizada em '
            f'<time datetime="{escape(modified_at, quote=True)}">{escape(label)}</time></span>'
        )
    return f"""<footer class="site-footer">
<div class="container footer-top">
<div class="footer-brand">{_FOOTER_LOGO}<p>{escape(footer_blurb())}</p></div>
{footer_columns_html()}
</div>
<div class="container footer-bottom"><span>© <span id="year">2026</span> CONFENGE. CNPJ 52.407.089/0001-09.{dates}</span>{footer_authority_nav()}</div>
</footer>"""


def validate_public_footer_tree(site_root: Path) -> dict[str, int]:
    """Validate every shipped footer against navigation and authority sources."""

    root = Path(site_root).resolve()
    canonical_columns = footer_columns_html()
    canonical_authority = footer_authority_nav()
    canonical_blurb = f"<p>{escape(footer_blurb())}</p>"
    footer_files = 0
    dated_footers = 0
    indexable_footer_files = 0
    for path in sorted(root.rglob("*.html")):
        relative = path.relative_to(root).as_posix()
        if any(part in {".git", "node_modules", "_site"} for part in Path(relative).parts):
            continue
        html = path.read_text(encoding="utf-8")
        if _PP_FOOTER_RE.search(html):
            raise PublicFooterError(f"public_footer_legacy_pp_family:{relative}")
        matches = list(_SITE_FOOTER_RE.finditer(html))
        if not matches:
            if _is_indexable(html):
                raise PublicFooterError(f"public_footer_missing_on_indexable:{relative}")
            continue
        if len(matches) != 1:
            raise PublicFooterError(f"public_footer_count_invalid:{relative}")
        footer = matches[0].group(0)
        if canonical_columns not in footer:
            raise PublicFooterError(f"public_footer_navigation_drift:{relative}")
        if canonical_authority not in footer:
            raise PublicFooterError(f"public_footer_authority_drift:{relative}")
        if canonical_blurb not in footer:
            raise PublicFooterError(f"public_footer_brand_drift:{relative}")
        if footer.count(_FOOTER_LOGO) != 1 or footer.count("<img") != 1:
            raise PublicFooterError(f"public_footer_logo_drift:{relative}")
        mailto = re.findall(r'href="(mailto:[^"]+)"', footer, flags=re.IGNORECASE)
        tel = re.findall(r'href="(tel:[^"]+)"', footer, flags=re.IGNORECASE)
        if mailto != [CONTACT["email_href"]] or tel != [CONTACT["tel_href"]]:
            raise PublicFooterError(f"public_footer_contact_identity_drift:{relative}")
        if "footer-page-dates" in footer:
            if footer.count("<time ") != 2:
                raise PublicFooterError(f"public_footer_page_dates_invalid:{relative}")
            dated_footers += 1
        footer_files += 1
        if _is_indexable(html):
            indexable_footer_files += 1
    return {
        "footer_files": footer_files,
        "dated_footers": dated_footers,
        "indexable_footer_files": indexable_footer_files,
    }


def apply_public_footer_tree(site_root: Path) -> dict[str, int]:
    """Compile every existing public footer from the canonical component."""

    root = Path(site_root).resolve()
    changed_files = 0
    inserted_files = 0
    for path in sorted(root.rglob("*.html")):
        relative = path.relative_to(root).as_posix()
        if any(part in {".git", "node_modules", "_site"} for part in Path(relative).parts):
            continue
        html = path.read_text(encoding="utf-8")
        if _PP_FOOTER_RE.search(html):
            raise PublicFooterError(f"public_footer_legacy_pp_family:{relative}")
        matches = list(_SITE_FOOTER_RE.finditer(html))
        if not matches:
            if not _is_indexable(html):
                continue
            body_ends = list(_BODY_END_RE.finditer(html))
            if len(body_ends) != 1:
                raise PublicFooterError(f"public_footer_body_end_invalid:{relative}")
            rendered = render_public_footer()
            end = body_ends[0]
            updated = html[: end.start()] + rendered + html[end.start() :]
            path.write_text(updated, encoding="utf-8", newline="\n")
            changed_files += 1
            inserted_files += 1
            continue
        if len(matches) != 1:
            raise PublicFooterError(f"public_footer_count_invalid:{relative}")
        old = matches[0].group(0)
        dates = _PAGE_DATES_RE.search(old)
        rendered = render_public_footer(
            published_at=dates.group(1) if dates else None,
            modified_at=dates.group(2) if dates else None,
            modified_label=dates.group(3) if dates else None,
        )
        if old == rendered:
            continue
        updated = html[: matches[0].start()] + rendered + html[matches[0].end() :]
        path.write_text(updated, encoding="utf-8", newline="\n")
        changed_files += 1
    return {
        "changed_files": changed_files,
        "inserted_files": inserted_files,
        **validate_public_footer_tree(root),
    }
