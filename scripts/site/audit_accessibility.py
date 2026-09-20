"""Static accessibility checks on shipped commercial HTML + CSS."""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.public_copy_scope import visitor_facing_html_files  # noqa: E402


# Same justified non-visitor published trees as the skip-link gate. They stay
# fully noindex; a page that becomes indexable under one of these prefixes
# fails that gate and must join the visitor census here.
NON_VISITOR_PUBLISHED_PREFIXES = (
    "piloto/",
    "assets/data-desk/",
)

# WCAG AA requires 4.5:1 for normal text. The release contract keeps at
# least another 0.5:1 on the canonical text/action pairings so a token edit
# cannot leave the public surface sitting exactly on the compliance edge.
AA_CONTRAST_WITH_MARGIN = 5.0
CONTRAST_PAIRS = (
    ("body on white", "text", "white"),
    ("muted on white", "muted", "white"),
    ("muted on soft", "muted", "soft"),
    ("primary action", "white", "green_700"),
    ("ink on soft", "ink", "soft"),
    ("white on navy", "white", "navy_950"),
    ("lime on navy", "lime_accent", "navy_950"),
)


def accessibility_pages(root: Path | None = None) -> list[Path]:
    """Every visitor HTML file except declared non-visitor published trees."""
    from scripts.site.public_copy_scope import relpath

    base = root or ROOT
    out: list[Path] = []
    for path in visitor_facing_html_files(base):
        rel = relpath(path, base)
        if any(rel.startswith(prefix) for prefix in NON_VISITOR_PUBLISHED_PREFIXES):
            continue
        out.append(path)
    return out


# Backward-compatible alias: previously a handwritten list of nine commercial pages.
PAGES = accessibility_pages()


def find_form_field(html: str, field_id: str) -> re.Match[str] | None:
    return re.search(
        rf"<(?:input|select|textarea)\b[^>]*\b(?:id|name)=[\"']{re.escape(field_id)}[\"'][^>]*>",
        html,
        re.I,
    )


def has_accessible_label(html: str, field_id: str) -> bool:
    field = find_form_field(html, field_id)
    if not field:
        return False
    tag = field.group(0)
    aria_label = re.search(r"\baria-label=[\"']([^\"']*)[\"']", tag, re.I)
    if aria_label and aria_label.group(1).strip():
        return True
    labelledby = re.search(r"\baria-labelledby=[\"']([^\"']+)[\"']", tag, re.I)
    if labelledby and any(
        re.search(rf"\bid=[\"']{re.escape(label_id)}[\"']", html, re.I)
        for label_id in labelledby.group(1).split()
    ):
        return True
    element_id = re.search(r"\bid=[\"']([^\"']+)[\"']", tag, re.I)
    if element_id and re.search(
        rf"<label\b[^>]*\bfor=[\"']{re.escape(element_id.group(1))}[\"']",
        html,
        re.I,
    ):
        return True
    return any(tag in label for label in re.findall(r"<label\b[^>]*>[\s\S]*?</label>", html, re.I))


# --- WCAG 2.5.3 label in name, static (BOFU-FECHAMENTO-20260919, A11Y-FRAGMENTOS-06).
# axe's ``label-content-name-mismatch`` is tagged experimental and stays off
# under a tag-only ``runOnly``; it also runs only on the sampled routes of the
# built artifact. This check reads every visitor page of the source tree: an
# ``<a>``/``<button>`` whose accessible name comes from ``aria-label`` or
# ``aria-labelledby`` must contain its visible text (aria-hidden subtrees
# removed, image alt excluded) so a voice user can say what they see.
# Below this count the control census is not the public surface (~690 named
# controls on 2026-09-19).
LABEL_IN_NAME_MIN_CONTROLS = 300
_VOID_TAGS = frozenset(
    {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
)
_INLINE_BLOCK_TAGS = frozenset({"span", "div", "p", "li", "strong", "em", "small", "b", "i", "time", "br"})
_NAME_PUNCTUATION_RE = re.compile(r"[–—\-·•:;,.!?()\[\]\"“”‘’'…»«›‹→←↗↘]+")


class _Node:
    __slots__ = ("tag", "attrs", "children", "parent", "text")

    def __init__(self, tag: str, attrs: list[tuple[str, str | None]], parent: "_Node | None") -> None:
        self.tag = tag
        self.attrs = {name.lower(): (value or "") for name, value in attrs}
        self.parent = parent
        self.children: list[_Node] = []
        self.text: str | None = None


class _TreeParser(HTMLParser):
    """Minimal element tree: enough to walk a control's subtree and resolve ids."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = _Node("#root", [], None)
        self.current = self.root
        self.nodes: list[_Node] = []
        self.ids: dict[str, _Node] = {}

    def _open(self, tag: str, attrs: list[tuple[str, str | None]]) -> _Node:
        node = _Node(tag.lower(), attrs, self.current)
        self.current.children.append(node)
        self.nodes.append(node)
        element_id = node.attrs.get("id", "").strip()
        if element_id and element_id not in self.ids:
            self.ids[element_id] = node
        return node

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = self._open(tag, attrs)
        if node.tag not in _VOID_TAGS:
            self.current = node

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._open(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        node: _Node | None = self.current
        while node is not None and node.tag != tag:
            node = node.parent
        if node is not None and node.parent is not None:
            self.current = node.parent

    def handle_data(self, data: str) -> None:
        text = _Node("#text", [], self.current)
        text.text = data
        self.current.children.append(text)


def normalize_name(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "").replace(" ", " ")
    value = re.sub(r"\s+", " ", value).strip().casefold()
    value = _NAME_PUNCTUATION_RE.sub(" ", value)
    return re.sub(r"\s+", " ", value).strip()


def _at_visible_text(node: _Node, *, root: bool = True) -> str:
    """Text assistive technology renders inside a control: aria-hidden removed, alt excluded."""
    if node.tag == "#text":
        return node.text or ""
    if node.attrs.get("aria-hidden") == "true" or node.tag in {"script", "style", "template", "img"}:
        return ""
    if node.tag == "svg":
        titles = " ".join(
            "".join(part.text or "" for part in child.children if part.tag == "#text")
            for child in node.children
            if child.tag == "title"
        )
        return titles + (" " + node.attrs["aria-label"] if node.attrs.get("aria-label") else "")
    if not root and node.attrs.get("aria-label"):
        return " " + node.attrs["aria-label"] + " "
    out = "".join(_at_visible_text(child, root=False) for child in node.children)
    return f" {out} " if node.tag in _INLINE_BLOCK_TAGS else out


def label_in_name_findings(html: str) -> tuple[list[str], int]:
    """Return ``(problems, named_controls_examined)`` for one document."""
    parser = _TreeParser()
    parser.feed(html or "")
    parser.close()
    problems: list[str] = []
    examined = 0
    for node in parser.nodes:
        is_control = node.tag == "button" or (node.tag == "a" and "href" in node.attrs)
        if not is_control:
            continue
        labelledby = node.attrs.get("aria-labelledby", "").strip()
        aria_label = node.attrs.get("aria-label", "").strip()
        if labelledby:
            source = "aria-labelledby"
            name = " ".join(
                _at_visible_text(parser.ids[ref]) if ref in parser.ids else ""
                for ref in labelledby.split()
            )
        elif aria_label:
            source = "aria-label"
            name = aria_label
        else:
            continue
        examined += 1
        visible = normalize_name(_at_visible_text(node))
        if not visible:
            continue  # icon-only control: 2.5.3 does not apply
        if visible not in normalize_name(name):
            problems.append(
                f"label in name: <{node.tag}> {source}=\"{name.strip()[:80]}\" "
                f"does not contain visible text \"{visible[:80]}\""
            )
    return problems, examined


def relative_luminance(hex_color: str) -> float:
    value = hex_color.removeprefix("#")
    if len(value) == 3:
        value = "".join(character * 2 for character in value)
    if not re.fullmatch(r"[0-9a-fA-F]{6}", value):
        raise ValueError(f"invalid hex color: {hex_color}")
    channels = [int(value[offset : offset + 2], 16) / 255 for offset in (0, 2, 4)]
    linear = [
        channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4
        for channel in channels
    ]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast_ratio(foreground: str, background: str) -> float:
    first = relative_luminance(foreground)
    second = relative_luminance(background)
    return (max(first, second) + 0.05) / (min(first, second) + 0.05)


def contrast_contract(root: Path = ROOT) -> tuple[list[str], list[str]]:
    design = json.loads((root / "data/site/design-system.json").read_text(encoding="utf-8"))
    colors = design["colors"]
    tokens = (root / "styles-tokens.css").read_text(encoding="utf-8").lower()
    failures: list[str] = []
    evidence: list[str] = []
    css_names = {
        "green_100_restricted": "green-100",
        "green_signal": "green-700",
        "lime_accent": "lime",
    }
    for name, value in colors.items():
        if not isinstance(value, str) or not value.startswith("#"):
            continue
        css_name = css_names.get(name, name).replace("_", "-")
        css_value = "#fff" if value.lower() == "#ffffff" else value.lower()
        if not re.search(rf"--{re.escape(css_name)}\s*:\s*{re.escape(css_value)}(?:;|\s)", tokens):
            failures.append(f"design token drift: {name}={value} missing from styles-tokens.css")
    for label, foreground_name, background_name in CONTRAST_PAIRS:
        ratio = contrast_ratio(colors[foreground_name], colors[background_name])
        evidence.append(f"{label}={ratio:.2f}:1")
        if ratio < AA_CONTRAST_WITH_MARGIN:
            failures.append(
                f"contrast margin: {label} is {ratio:.2f}:1, expected >= {AA_CONTRAST_WITH_MARGIN:.1f}:1"
            )
    return failures, evidence


def check_page(path: Path) -> list[str]:
    errors, _ = check_page_with_census(path)
    return errors


def check_page_with_census(path: Path) -> tuple[list[str], int]:
    """Errors of one page plus the number of named controls examined for 2.5.3."""
    html = path.read_text(encoding="utf-8")
    errors = []
    label_problems, named_controls = label_in_name_findings(html)
    errors.extend(label_problems)
    if 'lang="pt-BR"' not in html and "lang='pt-BR'" not in html:
        errors.append("missing lang")
    if 'href="#conteudo"' not in html and "skip-link" not in html:
        errors.append("missing skip link")
    if "<main" not in html:
        errors.append("missing main landmark")
    if 'id="conteudo"' not in html:
        errors.append("missing #conteudo")
    # Home contact form fields are only required on the site home page.
    if path == ROOT / "index.html":
        for field in ("nome", "empresa", "email", "estagio", "urgencia", "mensagem"):
            if not has_accessible_label(html, field):
                errors.append(f"form field labeling: {field}")
        if not has_accessible_label(html, "consentimento"):
            errors.append("form field labeling: consentimento")
        if not re.search(r"<h1[\s>]", html):
            errors.append("missing h1")
        if "aria-label" not in html:
            errors.append("expected some aria-labels")
    elif "<form" in html:
        for field in ("nome", "empresa", "email", "telefone", "mensagem"):
            if find_form_field(html, field) and not has_accessible_label(html, field):
                errors.append(f"form field labeling: {field}")
        if find_form_field(html, "consentimento") and not has_accessible_label(html, "consentimento"):
            errors.append("form field labeling: consentimento")
    return errors, named_controls


def main() -> int:
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    failures = []
    if "prefers-reduced-motion" not in css:
        failures.append("css: missing prefers-reduced-motion")
    if ":focus-visible" not in css and ":focus" not in css:
        failures.append("css: missing focus styles")
    contrast_failures, contrast_evidence = contrast_contract(ROOT)
    failures.extend(contrast_failures)
    pages = accessibility_pages(ROOT)
    if len(pages) < 100:
        failures.append(f"accessibility census collapsed: {len(pages)}")
    named_controls = 0
    for p in pages:
        errs, examined = check_page_with_census(p)
        named_controls += examined
        for e in errs:
            failures.append(f"{p.relative_to(ROOT)}: {e}")
    if named_controls < LABEL_IN_NAME_MIN_CONTROLS:
        failures.append(
            f"label-in-name census collapsed: {named_controls} named controls examined,"
            f" expected >= {LABEL_IN_NAME_MIN_CONTROLS}"
        )
    if failures:
        print("FAIL accessibility static audit")
        for f in failures:
            print(" -", f)
        return 1
    print("OK audit:accessibility")
    print(
        "checks: landmarks, skip-link, lang, form labels, consent, reduced-motion, focus, contrast,"
        " label-in-name (WCAG 2.5.3)"
    )
    print(f"label-in-name: {named_controls} named <a>/<button> controls examined across {len(pages)} pages")
    print("contrast >= 5.0:1:", ", ".join(contrast_evidence))
    return 0


if __name__ == "__main__":
    sys.exit(main())
