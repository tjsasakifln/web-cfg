"""Remove unsupported identity/credential claims from published JSON-LD.

Identity and provenance belong to extra-cli. Until a versioned SELECT-only
identity contract is committed as a consumer input, web-cfg must not promote
owned copy into structured verification. Visible self-declared copy can remain;
the public machine graph omits the unsupported fields fail-closed.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

JSON_LD_RE = re.compile(
    r'(<script\b[^>]*\btype=["\']application/ld\+json["\'][^>]*>)(.*?)(</script>)',
    re.IGNORECASE | re.DOTALL,
)

ORGANIZATION_FIELDS_WITHOUT_CANONICAL_EVIDENCE = frozenset({"legalName", "taxID", "sameAs"})
PERSON_FIELDS_WITHOUT_CANONICAL_EVIDENCE = frozenset(
    {"sameAs", "alumniOf", "hasCredential", "jobTitle"}
)
CREDENTIAL_NAME_RE = re.compile(
    r"(?:^|\b)(?:eng(?:º|ª|°|\.)|engenheir[oa](?:\s+civil)?|consultor(?:a)?\s+b2g)(?:\b|\s)",
    re.IGNORECASE,
)
CREDENTIAL_PREFIX_RE = re.compile(
    r"^\s*(?:eng(?:º|ª|°|\.)|engenheir[oa](?:\s+civil)?)\s*",
    re.IGNORECASE,
)


def _types(node: dict[str, Any]) -> set[str]:
    raw = node.get("@type")
    if isinstance(raw, str):
        return {raw}
    if isinstance(raw, list):
        return {str(value) for value in raw}
    return set()


def _plain_identity_name(value: Any) -> str | None:
    if not isinstance(value, str) or not CREDENTIAL_NAME_RE.search(value):
        return None
    candidate = CREDENTIAL_PREFIX_RE.sub("", value).split("|", 1)[0].strip(" -:|")
    if not candidate or CREDENTIAL_NAME_RE.search(candidate):
        return ""
    return candidate


def _sanitize_node(value: Any) -> int:
    removed = 0
    if isinstance(value, list):
        for child in value:
            removed += _sanitize_node(child)
        return removed
    if not isinstance(value, dict):
        return 0

    kinds = _types(value)
    forbidden: set[str] = set()
    if "Organization" in kinds:
        forbidden.update(ORGANIZATION_FIELDS_WITHOUT_CANONICAL_EVIDENCE)
    if "Person" in kinds:
        forbidden.update(PERSON_FIELDS_WITHOUT_CANONICAL_EVIDENCE)
    if "hasCredential" in value:
        forbidden.add("hasCredential")
    for key in forbidden:
        if key in value:
            del value[key]
            removed += 1
    if kinds.intersection({"Person", "ProfilePage"}) and "name" in value:
        plain_name = _plain_identity_name(value.get("name"))
        if plain_name is not None:
            if plain_name:
                value["name"] = plain_name
            else:
                del value["name"]
            removed += 1
    for child in value.values():
        removed += _sanitize_node(child)
    return removed


def sanitize_jsonld_payload(payload: Any) -> tuple[Any, int]:
    clone = json.loads(json.dumps(payload, ensure_ascii=False))
    return clone, _sanitize_node(clone)


def unsupported_structured_identity(payload: Any, path: str = "$") -> list[str]:
    errors: list[str] = []
    if isinstance(payload, list):
        for index, child in enumerate(payload):
            errors.extend(unsupported_structured_identity(child, f"{path}[{index}]"))
        return errors
    if not isinstance(payload, dict):
        return errors
    kinds = _types(payload)
    if "Organization" in kinds:
        for key in ORGANIZATION_FIELDS_WITHOUT_CANONICAL_EVIDENCE:
            if key in payload:
                errors.append(f"unsupported_structured_identity:{path}.{key}")
    if "Person" in kinds:
        for key in PERSON_FIELDS_WITHOUT_CANONICAL_EVIDENCE:
            if key in payload:
                errors.append(f"unsupported_structured_identity:{path}.{key}")
    if kinds.intersection({"Person", "ProfilePage"}) and CREDENTIAL_NAME_RE.search(str(payload.get("name") or "")):
        errors.append(f"unsupported_structured_credential_name:{path}.name")
    if "hasCredential" in payload and f"unsupported_structured_identity:{path}.hasCredential" not in errors:
        errors.append(f"unsupported_structured_identity:{path}.hasCredential")
    for key, child in payload.items():
        errors.extend(unsupported_structured_identity(child, f"{path}.{key}"))
    return errors


def sanitize_html(html: str) -> tuple[str, int]:
    removed = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal removed
        try:
            payload = json.loads(match.group(2))
        except json.JSONDecodeError:
            return match.group(0)
        sanitized, count = sanitize_jsonld_payload(payload)
        removed += count
        body = json.dumps(sanitized, ensure_ascii=False, separators=(",", ":"))
        return f"{match.group(1)}{body}{match.group(3)}"

    return JSON_LD_RE.sub(replace, html), removed


def audit_html(html: str) -> list[str]:
    errors: list[str] = []
    for index, match in enumerate(JSON_LD_RE.finditer(html)):
        try:
            payload = json.loads(match.group(2))
        except json.JSONDecodeError:
            errors.append(f"invalid_jsonld:{index}")
            continue
        errors.extend(unsupported_structured_identity(payload, f"$jsonld[{index}]"))
    return errors


def sanitize_tree(root: Path) -> dict[str, int]:
    scanned = 0
    rewritten = 0
    fields_removed = 0
    for path in sorted(root.rglob("*.html")):
        scanned += 1
        raw = path.read_text(encoding="utf-8")
        cleaned, removed = sanitize_html(raw)
        if removed:
            path.write_text(cleaned, encoding="utf-8")
            rewritten += 1
            fields_removed += removed
    return {"html_scanned": scanned, "html_rewritten": rewritten, "fields_removed": fields_removed}
