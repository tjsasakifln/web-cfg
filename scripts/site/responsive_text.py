"""HTML text helpers for natural prose mixed with opaque identifiers."""

from __future__ import annotations

import html
import re

_LEADING_PUNCTUATION = "([{\"'“‘«"
_TRAILING_PUNCTUATION = ".,;:!?)]}\"'”’»"
_HEX_DIGEST = re.compile(r"[0-9a-fA-F]{32,}")
_CAMPAIGN_TOKEN = re.compile(r"[A-Z0-9]+(?:-[A-Z0-9]+){3,}")


def _is_opaque_token(value: str) -> bool:
    if not value:
        return False
    if value.startswith(("https://", "http://")):
        return True
    if value.startswith("R$&"):
        return False
    if _HEX_DIGEST.fullmatch(value) or _CAMPAIGN_TOKEN.fullmatch(value):
        return True
    if "_" in value and len(value) >= 12:
        return True
    if "=" in value and len(value) >= 12:
        return True
    if "/" in value and len(value) >= 16:
        return (
            any(char.isdigit() for char in value)
            or value.endswith((".json", ".csv", ".xml"))
            or value.replace("/", "").replace("_", "").isupper()
        )
    return False


def _render_word(word: str, *, escape_html: bool) -> str:
    leading_length = len(word) - len(word.lstrip(_LEADING_PUNCTUATION))
    trailing_length = len(word) - len(word.rstrip(_TRAILING_PUNCTUATION))
    leading = word[:leading_length]
    end = len(word) - trailing_length if trailing_length else len(word)
    core = word[leading_length:end]
    trailing = word[end:]
    escaped = html.escape(core, quote=True) if escape_html else core
    if _is_opaque_token(core):
        escaped = f"<span data-opaque-token>{escaped}</span>"
    if escape_html:
        leading = html.escape(leading, quote=True)
        trailing = html.escape(trailing, quote=True)
    return leading + escaped + trailing


def escape_prose_with_opaque_tokens(value: str) -> str:
    """Escape prose while opting only machine-like tokens into mid-token wrap."""

    return "".join(
        part if part.isspace() else _render_word(part, escape_html=True)
        for part in re.split(r"(\s+)", str(value or ""))
        if part
    )


def mark_opaque_tokens_in_html_text(value: str) -> str:
    """Add wrapping opt-ins to an already escaped HTML text node."""

    return "".join(
        part if part.isspace() else _render_word(part, escape_html=False)
        for part in re.split(r"(\s+)", str(value or ""))
        if part
    )
