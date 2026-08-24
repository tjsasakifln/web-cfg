"""Guard plain visitor language on every shipped visitor surface.

Issue #298: SURFACES used to be a hand-written tuple of eight routes ("core
commercial journey"), so the same English/internal jargon shipped freely on the
other 251 public pages. The scope now derives from
`scripts/site/public_copy_scope`, and legitimate occurrences are registered one
by one, with a written reason, in `data/site/copy-exceptions.json`.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.public_copy_scope import (  # noqa: E402
    is_excepted,
    relpath,
    visible_text,
    visitor_facing_html_files,
)

EXCEPTION_RULE = "plain_language"

FORBIDDEN = (
    r"\bpipeline\b",
    r"\bslot(?:s)?\b",
    r"\bsku\b",
    r"\bwip\b",
    r"red flags?",
    r"\bcheckout\b",
    r"catálogo público",
    r"persist-first",
    r"offer_id",
    r"one-off",
    r"\bfact\b",
    r"\bcalculation\b",
    r"\binference\b",
    r"\bunknown\b",
    r"\bowner\b",
    r"\bkickoff\b",
    r"sem case",
    r"contract defense",
    r"\bcfg-",
)


def surfaces() -> list[Path]:
    """Every shipped visitor HTML file. A new public family is in scope by default."""
    return list(visitor_facing_html_files(ROOT))


def scan() -> list[str]:
    failures: list[str] = []
    for path in surfaces():
        rel = relpath(path, ROOT)
        text = visible_text(path.read_text(encoding="utf-8"))
        for pattern in FORBIDDEN:
            if re.search(pattern, text, flags=re.IGNORECASE) and not is_excepted(
                EXCEPTION_RULE, pattern, rel
            ):
                failures.append(f"{rel}: {pattern}")
    return failures


def test_plain_visitor_language_sitewide():
    pages = surfaces()
    assert len(pages) >= 200, f"plain-language scan too narrow: {len(pages)}"
    failures = scan()
    assert not failures, failures


def main() -> None:
    pages = surfaces()
    if len(pages) < 200:
        raise SystemExit(f"plain-language scan too narrow: {len(pages)}")
    failures = scan()
    if failures:
        raise SystemExit("\n".join(failures))
    print(f"PASS: plain visitor language on {len(pages)} shipped visitor surfaces")


if __name__ == "__main__":
    main()
