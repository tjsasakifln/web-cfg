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

ORGANIZATION_FIELDS_WITHOUT_CANONICAL_EVIDENCE = frozenset(
    {"legalName", "taxID", "sameAs", "address"}
)
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


def _keep_registry_backed(
    key: str,
    value: Any,
    allowed: dict[str, set[str]],
) -> bool:
    from scripts.site.credential_registry import schema_value_allowed

    if isinstance(value, list):
        return any(schema_value_allowed(key, item, allowed) for item in value)
    return schema_value_allowed(key, value, allowed)


def _filter_registry_backed(
    key: str,
    value: Any,
    allowed: dict[str, set[str]],
) -> Any:
    from scripts.site.credential_registry import schema_value_allowed

    if isinstance(value, list):
        kept = [item for item in value if schema_value_allowed(key, item, allowed)]
        return kept
    return value


def _sanitize_node(
    value: Any,
    *,
    allowed_registry: dict[str, set[str]] | None = None,
) -> int:
    removed = 0
    if isinstance(value, list):
        for child in value:
            removed += _sanitize_node(child, allowed_registry=allowed_registry)
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
        if key not in value:
            continue
        current = value[key]
        if allowed_registry is not None and _keep_registry_backed(key, current, allowed_registry):
            filtered = _filter_registry_backed(key, current, allowed_registry)
            if filtered or filtered == 0:
                if filtered != current:
                    value[key] = filtered
                    removed += 1
                continue
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
        removed += _sanitize_node(child, allowed_registry=allowed_registry)
    return removed


def sanitize_jsonld_payload(
    payload: Any,
    *,
    allow_registry_backed: bool = False,
    allowed_registry: dict[str, set[str]] | None = None,
) -> tuple[Any, int]:
    if allow_registry_backed and allowed_registry is None:
        from scripts.site.credential_registry import allowed_schema_values

        allowed_registry = allowed_schema_values()
    clone = json.loads(json.dumps(payload, ensure_ascii=False))
    return clone, _sanitize_node(clone, allowed_registry=allowed_registry)


def unsupported_structured_identity(
    payload: Any,
    path: str = "$",
    *,
    allow_registry_backed: bool = False,
    allowed_registry: dict[str, set[str]] | None = None,
) -> list[str]:
    if allow_registry_backed and allowed_registry is None:
        from scripts.site.credential_registry import allowed_schema_values

        allowed_registry = allowed_schema_values()
    errors: list[str] = []
    if isinstance(payload, list):
        for index, child in enumerate(payload):
            errors.extend(
                unsupported_structured_identity(
                    child,
                    f"{path}[{index}]",
                    allow_registry_backed=allow_registry_backed,
                    allowed_registry=allowed_registry,
                )
            )
        return errors
    if not isinstance(payload, dict):
        return errors
    kinds = _types(payload)
    if "Organization" in kinds:
        for key in ORGANIZATION_FIELDS_WITHOUT_CANONICAL_EVIDENCE:
            if key in payload and not (
                allowed_registry is not None
                and _keep_registry_backed(key, payload[key], allowed_registry)
            ):
                errors.append(f"unsupported_structured_identity:{path}.{key}")
    if "Person" in kinds:
        for key in PERSON_FIELDS_WITHOUT_CANONICAL_EVIDENCE:
            if key in payload and not (
                allowed_registry is not None
                and _keep_registry_backed(key, payload[key], allowed_registry)
            ):
                errors.append(f"unsupported_structured_identity:{path}.{key}")
    if kinds.intersection({"Person", "ProfilePage"}) and CREDENTIAL_NAME_RE.search(str(payload.get("name") or "")):
        errors.append(f"unsupported_structured_credential_name:{path}.name")
    if (
        "hasCredential" in payload
        and f"unsupported_structured_identity:{path}.hasCredential" not in errors
        and not (
            allowed_registry is not None
            and _keep_registry_backed(
                "hasCredential", payload["hasCredential"], allowed_registry
            )
        )
    ):
        errors.append(f"unsupported_structured_identity:{path}.hasCredential")
    for key, child in payload.items():
        errors.extend(
            unsupported_structured_identity(
                child,
                f"{path}.{key}",
                allow_registry_backed=allow_registry_backed,
                allowed_registry=allowed_registry,
            )
        )
    return errors


def sanitize_html(html: str, relative_path: str | None = None) -> tuple[str, int]:
    from scripts.site.credential_registry import allowed_schema_values, owned_surface

    removed = 0
    surface = owned_surface(html, relative_path)
    allowed = allowed_schema_values(surface=surface) if surface else None

    def replace(match: re.Match[str]) -> str:
        nonlocal removed
        try:
            payload = json.loads(match.group(2))
        except json.JSONDecodeError:
            return match.group(0)
        sanitized, count = sanitize_jsonld_payload(payload, allowed_registry=allowed)
        removed += count
        body = json.dumps(sanitized, ensure_ascii=False, separators=(",", ":"))
        return f"{match.group(1)}{body}{match.group(3)}"

    return JSON_LD_RE.sub(replace, html), removed


def audit_html(html: str, relative_path: str | None = None) -> list[str]:
    from scripts.site.credential_registry import allowed_schema_values, owned_surface

    surface = owned_surface(html, relative_path)
    allowed = allowed_schema_values(surface=surface) if surface else None
    errors: list[str] = []
    for index, match in enumerate(JSON_LD_RE.finditer(html)):
        try:
            payload = json.loads(match.group(2))
        except json.JSONDecodeError:
            errors.append(f"invalid_jsonld:{index}")
            continue
        errors.extend(
            unsupported_structured_identity(
                payload,
                f"$jsonld[{index}]",
                allowed_registry=allowed,
            )
        )
    return errors


def sanitize_tree(root: Path) -> dict[str, int]:
    scanned = 0
    rewritten = 0
    fields_removed = 0
    for path in sorted(root.rglob("*.html")):
        scanned += 1
        raw = path.read_text(encoding="utf-8")
        try:
            rel = path.relative_to(root).as_posix()
        except ValueError:
            rel = path.name
        cleaned, removed = sanitize_html(raw, relative_path=rel)
        if removed:
            path.write_text(cleaned, encoding="utf-8")
            rewritten += 1
            fields_removed += removed
    return {"html_scanned": scanned, "html_rewritten": rewritten, "fields_removed": fields_removed}
