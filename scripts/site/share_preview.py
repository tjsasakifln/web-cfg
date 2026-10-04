"""Compile and validate deterministic social preview metadata.

The compiler works only on an assembled public artifact. It uses each page's
existing canonical, title and description as the source of truth, preserves
valid metadata already supplied by a page generator, and never changes robots
or body bytes.
"""

from __future__ import annotations

import hashlib
import json
import re
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree


CONTRACT_REL = Path("data/site/share-preview-contract.v1.json")
GOVERNANCE_REL = Path("data/organic/noindex-governance-registry.json")
OG_REQUIRED = ("og:title", "og:type", "og:image", "og:url", "og:description")
TWITTER_REQUIRED = ("twitter:card",)


class SharePreviewError(RuntimeError):
    """Fail-closed metadata or contract violation."""


class _Head(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_head = False
        self.in_title = False
        self.title_count = 0
        self.title_parts: list[str] = []
        self.canonicals: list[str] = []
        self.descriptions: list[str] = []
        self.robots: list[str] = []
        self.og: dict[str, list[str]] = {}
        self.twitter: dict[str, list[str]] = {}

    @staticmethod
    def _attrs(attrs: list[tuple[str, str | None]]) -> dict[str, str]:
        return {str(key).lower(): str(value or "") for key, value in attrs}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        values = self._attrs(attrs)
        if tag == "head":
            self.in_head = True
            return
        if not self.in_head:
            return
        if tag == "title":
            self.title_count += 1
            self.in_title = True
        elif tag == "link" and "canonical" in values.get("rel", "").lower().split():
            self.canonicals.append(values.get("href", "").strip())
        elif tag == "meta":
            name = values.get("name", "").strip().lower()
            prop = values.get("property", "").strip().lower()
            content = values.get("content", "").strip()
            if name == "description":
                self.descriptions.append(content)
            elif name == "robots":
                self.robots.append(content)
            if prop.startswith("og:"):
                self.og.setdefault(prop, []).append(content)
            if name.startswith("twitter:"):
                self.twitter.setdefault(name, []).append(content)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title" and self.in_head:
            self.in_title = False
        elif tag.lower() == "head":
            self.in_head = False

    def handle_data(self, data: str) -> None:
        if self.in_head and self.in_title:
            self.title_parts.append(data)

    @property
    def title(self) -> str:
        return " ".join("".join(self.title_parts).split())

    @property
    def noindex(self) -> bool:
        return any("noindex" in {token.strip().lower() for token in value.split(",")} for value in self.robots)


def _fail(code: str, path: str = "") -> None:
    raise SharePreviewError(f"{code}:{path}" if path else code)


def _parse(html: str) -> _Head:
    parsed = _Head()
    parsed.feed(html)
    parsed.close()
    return parsed


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _jpeg_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if not data.startswith(b"\xff\xd8"):
        _fail("share_preview_default_image_not_jpeg", path.as_posix())
    cursor = 2
    start_of_frame = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while cursor + 4 <= len(data):
        if data[cursor] != 0xFF:
            cursor += 1
            continue
        marker = data[cursor + 1]
        cursor += 2
        if marker in {0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
            continue
        if cursor + 2 > len(data):
            break
        length = int.from_bytes(data[cursor:cursor + 2], "big")
        if length < 2 or cursor + length > len(data):
            break
        if marker in start_of_frame and length >= 7:
            height = int.from_bytes(data[cursor + 3:cursor + 5], "big")
            width = int.from_bytes(data[cursor + 5:cursor + 7], "big")
            return width, height
        cursor += length
    _fail("share_preview_default_image_dimensions_unreadable", path.as_posix())


def _load_contract(source_root: Path) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    contract_path = source_root / CONTRACT_REL
    governance_path = source_root / GOVERNANCE_REL
    if not contract_path.is_file() or not governance_path.is_file():
        _fail("share_preview_authority_missing", str(contract_path))
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    governance = json.loads(governance_path.read_text(encoding="utf-8"))
    if contract.get("schema") != "CONFENGE_SHARE_PREVIEW_CONTRACT/1.0.0":
        _fail("share_preview_contract_schema_invalid")
    if contract.get("canonical_origin") != "https://confenge.com.br":
        _fail("share_preview_origin_invalid")
    policy = contract.get("indexable_policy") or {}
    if tuple(policy.get("open_graph_required") or []) != OG_REQUIRED:
        _fail("share_preview_og_policy_invalid")
    if tuple(policy.get("twitter_required") or []) != TWITTER_REQUIRED:
        _fail("share_preview_twitter_policy_invalid")

    reason_codes = governance.get("reason_codes") or {}
    families = {row.get("family_id"): row for row in governance.get("families") or []}
    exceptions: dict[str, dict[str, Any]] = {}
    for row in contract.get("noindex_nonshareable") or []:
        path = str(row.get("path") or "")
        if not path or path.startswith(("/", "\\")) or ".." in Path(path).parts or path in exceptions:
            _fail("share_preview_nonshareable_path_invalid", path)
        reason_code = str(row.get("reason_code") or "")
        if reason_code not in reason_codes:
            _fail("share_preview_reason_code_unknown", path)
        family_id = row.get("governance_family_id")
        if family_id:
            family = families.get(family_id)
            if not family or family.get("reason_code") != reason_code:
                _fail("share_preview_governance_family_mismatch", path)
        if not str(row.get("reason") or "").strip():
            _fail("share_preview_nonshareable_reason_missing", path)
        exceptions[path] = row
    return contract, exceptions


def _validate_default_image(source_root: Path, contract: dict[str, Any]) -> str:
    image = contract.get("default_image") or {}
    source_path = source_root / str(image.get("source_path") or "")
    if not source_path.is_file() or _sha256(source_path) != image.get("sha256"):
        _fail("share_preview_default_image_identity_invalid")
    if _jpeg_size(source_path) != (image.get("width"), image.get("height")):
        _fail("share_preview_default_image_dimensions_invalid")
    return str(image.get("url") or "")


def _route_for(relative: str) -> str:
    if relative == "index.html":
        return "/"
    if relative.endswith("/index.html"):
        return "/" + relative[: -len("index.html")]
    return "/" + relative


def _sitemap_paths(public_root: Path, origin: str) -> set[str]:
    paths: set[str] = set()
    for sitemap in sorted(public_root.glob("sitemap*.xml")):
        try:
            tree = ElementTree.fromstring(sitemap.read_text(encoding="utf-8"))
        except ElementTree.ParseError as exc:
            _fail("share_preview_sitemap_invalid", f"{sitemap.name}:{exc}")
        for node in tree.iter():
            if node.tag.rsplit("}", 1)[-1] != "loc" or not (node.text or "").strip():
                continue
            url = urlsplit((node.text or "").strip())
            if f"{url.scheme}://{url.netloc}" == origin:
                paths.add(url.path or "/")
    return paths


def _validate_public_url(value: str, origin: str, code: str, relative: str) -> None:
    url = urlsplit(value)
    if f"{url.scheme}://{url.netloc}" != origin or url.username or url.password:
        _fail(code, relative)


def _one(values: list[str], code: str, relative: str) -> str:
    if len(values) != 1 or not values[0].strip():
        _fail(code, relative)
    return values[0].strip()


def _validate_no_duplicates(meta: _Head, relative: str) -> None:
    if meta.title_count != 1:
        _fail("share_preview_title_duplicate_or_missing", relative)
    if len(meta.canonicals) > 1 or len(meta.descriptions) > 1:
        _fail("share_preview_source_metadata_duplicate", relative)
    for key in OG_REQUIRED:
        if len(meta.og.get(key, [])) > 1:
            _fail("share_preview_og_duplicate", f"{relative}:{key}")
    for key in TWITTER_REQUIRED:
        if len(meta.twitter.get(key, [])) > 1:
            _fail("share_preview_twitter_duplicate", f"{relative}:{key}")


def _validate_complete(meta: _Head, relative: str, origin: str) -> None:
    canonical = _one(meta.canonicals, "share_preview_canonical_missing", relative)
    _one(meta.descriptions, "share_preview_description_missing", relative)
    if not meta.title:
        _fail("share_preview_title_missing", relative)
    _validate_public_url(canonical, origin, "share_preview_canonical_wrong_origin", relative)
    for key in OG_REQUIRED:
        _one(meta.og.get(key, []), "share_preview_og_missing", f"{relative}:{key}")
    for key in TWITTER_REQUIRED:
        _one(meta.twitter.get(key, []), "share_preview_twitter_missing", f"{relative}:{key}")
    if meta.og["og:type"][0] not in {"website", "article", "profile"}:
        _fail("share_preview_og_type_invalid", relative)
    if meta.twitter["twitter:card"][0] not in {"summary", "summary_large_image"}:
        _fail("share_preview_twitter_card_invalid", relative)
    if meta.og["og:url"][0] != canonical:
        _fail("share_preview_og_url_not_canonical", relative)
    for key in ("og:image",):
        _validate_public_url(meta.og[key][0], origin, "share_preview_image_wrong_origin", relative)


def _insert_metadata(html: str, tags: list[str], relative: str) -> str:
    if not tags:
        return html
    closing = list(re.finditer(r"(?is)</head\s*>", html))
    if len(closing) != 1:
        _fail("share_preview_head_missing_or_duplicate", relative)
    marker = closing[0].start()
    newline = "\r\n" if "\r\n" in html else "\n"
    insertion = newline.join(tags) + newline
    return html[:marker] + insertion + html[marker:]


def apply_share_preview_contract(
    public_root: Path,
    *,
    source_root: Path,
    require_contract_coverage: bool = False,
    apply_missing: bool = True,
) -> dict[str, Any]:
    """Complete previews in the artifact and fail on ambiguous source identity."""

    public_root = Path(public_root).resolve()
    source_root = Path(source_root).resolve()
    contract, exceptions = _load_contract(source_root)
    origin = str(contract["canonical_origin"])
    default_image = _validate_default_image(source_root, contract)
    sitemap_paths = _sitemap_paths(public_root, origin)
    html_paths = sorted(path for path in public_root.rglob("*.html") if path.is_file())
    seen_exceptions: set[str] = set()
    updated_files = 0
    tags_added = 0
    complete_pages = 0
    noindex_shareable_pages = 0

    for path in html_paths:
        relative = path.relative_to(public_root).as_posix()
        route = _route_for(relative)
        raw = path.read_text(encoding="utf-8")
        meta = _parse(raw)
        _validate_no_duplicates(meta, relative)

        exception = exceptions.get(relative)
        if exception:
            seen_exceptions.add(relative)
            if not meta.noindex or route in sitemap_paths:
                _fail("share_preview_nonshareable_must_be_noindex_off_sitemap", relative)
            if meta.og or meta.twitter:
                _fail("share_preview_nonshareable_metadata_present", relative)
            if exception.get("visible_material_terms_must_remain") and not re.search(r"R\$\s*\d", raw):
                _fail("share_preview_material_terms_hidden", relative)
            continue

        if meta.noindex and route in sitemap_paths:
            _fail("share_preview_unexpected_noindex_in_sitemap", relative)
        if len(meta.canonicals) != 1 or len(meta.descriptions) != 1 or not meta.title:
            if meta.noindex:
                _fail("share_preview_noindex_absence_without_contract", relative)
            _fail("share_preview_indexable_source_identity_missing", relative)

        canonical = meta.canonicals[0].strip()
        description = meta.descriptions[0].strip()
        _validate_public_url(canonical, origin, "share_preview_canonical_wrong_origin", relative)
        if not description:
            _fail("share_preview_description_missing", relative)
        if meta.og.get("og:url"):
            _validate_public_url(meta.og["og:url"][0], origin, "share_preview_og_url_wrong_origin", relative)
        if meta.og.get("og:image"):
            _validate_public_url(meta.og["og:image"][0], origin, "share_preview_image_wrong_origin", relative)

        values = {
            "og:title": meta.og.get("og:title", [meta.title])[0],
            "og:type": meta.og.get("og:type", ["website"])[0],
            "og:image": meta.og.get("og:image", [default_image])[0],
            "og:url": meta.og.get("og:url", [canonical])[0],
            "og:description": meta.og.get("og:description", [description])[0],
        }
        tags: list[str] = []
        for key in OG_REQUIRED:
            if key not in meta.og:
                tags.append(f'<meta property="{key}" content="{escape(values[key], quote=True)}">')
        if "twitter:card" not in meta.twitter:
            tags.append('<meta name="twitter:card" content="summary_large_image">')

        if tags and not apply_missing:
            _fail("share_preview_compiled_metadata_missing", relative)

        rendered = _insert_metadata(raw, tags, relative)
        raw_body = re.split(r"(?is)(?=<body\b)", raw, maxsplit=1)
        rendered_body = re.split(r"(?is)(?=<body\b)", rendered, maxsplit=1)
        if len(raw_body) != 2 or len(rendered_body) != 2 or raw_body[1] != rendered_body[1]:
            _fail("share_preview_body_changed", relative)
        final_meta = _parse(rendered)
        _validate_no_duplicates(final_meta, relative)
        _validate_complete(final_meta, relative, origin)
        if tags:
            path.write_text(rendered, encoding="utf-8", newline="")
            updated_files += 1
            tags_added += len(tags)
        complete_pages += 1
        if final_meta.noindex:
            noindex_shareable_pages += 1

    if require_contract_coverage and seen_exceptions != set(exceptions):
        missing = sorted(set(exceptions) - seen_exceptions)
        _fail("share_preview_nonshareable_contract_path_missing", ",".join(missing))
    if require_contract_coverage:
        published_default = public_root / unquote(urlsplit(default_image).path).lstrip("/")
        if not published_default.is_file() or _sha256(published_default) != contract["default_image"]["sha256"]:
            _fail("share_preview_published_default_image_invalid")

    return {
        "schema": contract["schema"],
        "html_files": len(html_paths),
        "complete_pages": complete_pages,
        "noindex_shareable_pages": noindex_shareable_pages,
        "nonshareable_pages": len(seen_exceptions),
        "updated_files": updated_files,
        "metadata_tags_added": tags_added,
        "body_changes": 0,
        "default_image_sha256": contract["default_image"]["sha256"],
    }


def validate_share_preview_contract(
    public_root: Path,
    *,
    source_root: Path,
    require_contract_coverage: bool = True,
) -> dict[str, Any]:
    """Validate final artifact bytes without repairing them during an audit."""

    return apply_share_preview_contract(
        public_root,
        source_root=source_root,
        require_contract_coverage=require_contract_coverage,
        apply_missing=False,
    )
