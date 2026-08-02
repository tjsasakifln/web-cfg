"""Public copy leak gates — real HTML surfaces."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.brand import load_brand  # noqa: E402
from scripts.site.test_design_gates import test_copy_leaks_absent_on_commercial_pages, test_job_title_valid  # noqa: E402


def test_brand_forbidden_phrases_still_enforced():
    brand = load_brand()
    phrases = brand["forbidden_phrases"]
    assert "Arquitetura de ofertas" in phrases
    assert "Sem cases fabricados" in phrases
    pages = [
        ROOT / "index.html",
        ROOT / "diretoria-b2g" / "index.html",
        ROOT / "bid-room-licitacoes-obras" / "index.html",
        ROOT / "llms.txt",
    ]
    for p in pages:
        text = p.read_text(encoding="utf-8")
        lower = text.lower()
        for phrase in ("arquitetura de ofertas", "sem cases fabricados", "sem preço público sem autorização"):
            assert phrase not in lower, f"{p}: {phrase}"


def test_microcopy_preferences():
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "responsáveis" in home.lower()
    assert "análise posterior" in home.lower() or "Aprendizado" in home
    bid = (ROOT / "bid-room-licitacoes-obras" / "index.html").read_text(encoding="utf-8")
    assert "revisão crítica independente" in bid.lower()
    assert not re.search(r"\bowners\b", home, re.I)
    assert not re.search(r"\bowners\b", bid, re.I)


def test_llms_consistent():
    text = (ROOT / "llms.txt").read_text(encoding="utf-8")
    assert "Diretoria B2G fracionada" in text
    assert "/diretoria-b2g/" in text
    assert "Engenheiro Civil e Diretoria B2G fracionada" not in text


if __name__ == "__main__":
    failed = 0
    for t in (
        test_copy_leaks_absent_on_commercial_pages,
        test_job_title_valid,
        test_brand_forbidden_phrases_still_enforced,
        test_microcopy_preferences,
        test_llms_consistent,
    ):
        try:
            t()
            print("OK", t.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", t.__name__, exc)
    sys.exit(1 if failed else 0)
