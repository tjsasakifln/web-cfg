"""Guard plain visitor language on the core commercial journey."""

import re
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SURFACES = (
    "index.html",
    "diretoria-b2g/index.html",
    "diagnostico-b2g-expansao/index.html",
    "bid-room-licitacoes-obras/index.html",
    "defesa-margem-contratos-publicos/index.html",
    "defesa-tecnica-contratos-publicos/index.html",
    "acompanhamento-contratos-obras/index.html",
    "atrasos-prorrogacao-obras-publicas/index.html",
)

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


class VisibleText(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hidden_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in {"script", "style", "template"}:
            self.hidden_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "template"} and self.hidden_depth:
            self.hidden_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.hidden_depth:
            self.parts.append(data)


def visible_text(path: Path) -> str:
    parser = VisibleText()
    parser.feed(path.read_text(encoding="utf-8"))
    return " ".join(" ".join(parser.parts).split())


def main() -> None:
    failures: list[str] = []
    for relative in SURFACES:
        text = visible_text(ROOT / relative)
        for pattern in FORBIDDEN:
            if re.search(pattern, text, flags=re.IGNORECASE):
                failures.append(f"{relative}: {pattern}")
    if failures:
        raise SystemExit("\n".join(failures))
    print(f"PASS: plain visitor language on {len(SURFACES)} commercial surfaces")


if __name__ == "__main__":
    main()
