"""WS-H (A11Y-FRAGMENTOS-03): aria-* idrefs in source HTML resolve to an id.

Visitor pages of the source tree (the same set `document_intake` rewrites);
`_site` is the build output and is covered by the sitewide gates.
"""

from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.document_intake import visitor_html_files  # noqa: E402

IDREF_ATTRS = ("aria-labelledby", "aria-describedby", "aria-controls")


class _Doc(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.refs: list[tuple[str, str]] = []

    def handle_starttag(self, tag, attrs):
        row = dict(attrs)
        if row.get("id"):
            self.ids.add(row["id"])
        for attr in IDREF_ATTRS:
            value = row.get(attr)
            if value:
                for ref in value.split():
                    self.refs.append((attr, ref))


def _broken(path: Path) -> list[str]:
    doc = _Doc()
    doc.feed(path.read_text(encoding="utf-8"))
    return sorted({f"{attr}={ref}" for attr, ref in doc.refs if ref not in doc.ids})


def test_conteudos_directory_section_is_named_by_its_heading():
    html = (ROOT / "conteudos/index.html").read_text(encoding="utf-8")
    assert 'aria-labelledby="dir-title"' in html
    assert re.search(r'<h2 id="dir-title">Análises de licitação e contrato público</h2>', html)


def test_aria_idrefs_resolve_in_every_source_page():
    pages = visitor_html_files(ROOT)
    assert len(pages) > 100
    broken = {str(p.relative_to(ROOT)): _broken(p) for p in pages}
    broken = {k: v for k, v in broken.items() if v}
    assert not broken, f"aria idref sem id no mesmo documento: {broken}"
