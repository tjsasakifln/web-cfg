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
    assert "responsáveis" in home.lower() or "responsável" in home.lower()
    assert "aprend" in home.lower() or "recalibr" in home.lower()
    bid = (ROOT / "bid-room-licitacoes-obras" / "index.html").read_text(encoding="utf-8")
    assert "revisão crítica independente" in bid.lower()
    assert not re.search(r"\bowners\b", home, re.I)
    assert not re.search(r"\bowners\b", bid, re.I)
    # Defensive / internal language must not appear on public home
    lower = home.lower()
    for phrase in (
        "sem inventar case",
        "sem métrica fictícia",
        "sem metrica ficticia",
        "javascript",
        "arquétipo",
        "arquetipo",
        "pipeline editorial",
        "visual regression",
        "red team",
        "sem cta genérico",
        "cta genérico único",
        "jornada a",
        "jornada b",
        "jornada c",
        "prova próxima ao cta",
        "funil",
    ):
        assert phrase not in lower, f"public leak: {phrase}"
    # Client-facing journey section (not briefing metalinguage)
    assert "como podemos ajudar" in lower
    assert "qual situação sua empresa precisa resolver agora" in lower
    assert "problema urgente em contrato" in lower
    assert "edital ou proposta em análise" in lower
    assert "operação b2g sem método" in lower
    assert "enviar documentos para análise" in lower
    assert "enviar edital para triagem" in lower
    assert "diagnosticar operação b2g" in lower or "diagnosticar a operação b2g" in lower
    # Visible labels "Jornada A/B/C" must not appear (data-journey attrs OK)
    assert not re.search(r">\s*Jornada\s+[ABC]\s*<", home), "visible Jornada A/B/C label"
    assert "risco de não agir" not in lower
    # English offer terms explained in Portuguese on first commercial exposure
    assert "sala de decisão" in lower or "bid room" in lower
    assert "defesa técnica" in lower or "proteção de margem" in lower

def test_llms_consistent():
    text = (ROOT / "llms.txt").read_text(encoding="utf-8")
    assert "Diretoria B2G fracionada" in text
    assert "/diretoria-b2g/" in text
    assert "Engenheiro Civil e Diretoria B2G fracionada" not in text




def test_concordance_and_forbidden_microcopy():
    """Gate for already-identified grammar/CTA defects — not a substitute for human review."""
    commercial = [
        ROOT / "index.html",
        ROOT / "diretoria-b2g" / "index.html",
        ROOT / "diagnostico-b2g-360" / "index.html",
        ROOT / "bid-room-licitacoes-obras" / "index.html",
        ROOT / "defesa-margem-contratos-publicos" / "index.html",
        ROOT / "obrigado.html",
        ROOT / "especialista" / "tiago-jun-sasaki" / "index.html",
    ]
    forbidden = [
        "Premissas e decisões registrados",
        "Preferir formulário",
        "Deep work",
        "Conhecer a Diretoria B2G",
        "GO / REVIEW / NO-GO",
        "GO/REVIEW/NO-GO",
        "assume a recomendação e confronta com o resultado",
    ]
    for path in commercial:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        for phrase in forbidden:
            assert phrase not in text, f"{path}: forbidden microcopy {phrase!r}"
        # no em-dash (travessão) in user-facing commercial HTML
        assert "—" not in text, f"{path}: em-dash/travessão present"
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "Premissas e decisões ficam registradas" in home
    assert "confrontada posteriormente com o resultado" in home or "confrontada depois com o resultado" in home
    # Journey confirmations exist
    for name in ("obrigado-contrato.html", "obrigado-edital.html", "obrigado-operacao.html"):
        p = ROOT / name
        assert p.exists(), name
        t = p.read_text(encoding="utf-8")
        assert "data-lead-success" in t
        assert "Prazo" in t or "prazo" in t
        assert "wa.me" in t
    assert "Diagnosticar a operação B2G" in home or "Diagnosticar operação B2G" in home
    assert "Enviar documentos para análise" in home
    # Thank-you pages must not expose journey letter labels to visitors
    for name in ("obrigado-contrato.html", "obrigado-edital.html", "obrigado-operacao.html"):
        ty = (ROOT / name).read_text(encoding="utf-8")
        assert not re.search(r"Jornada\s+[ABC]", ty), f"{name}: visible Jornada letter"
    # Journey-aligned CTA family on offer pages
    assert "Diagnosticar a operação B2G" in (ROOT / "diagnostico-b2g-360" / "index.html").read_text(encoding="utf-8")
    assert "Enviar edital para triagem" in (ROOT / "bid-room-licitacoes-obras" / "index.html").read_text(encoding="utf-8")
    defesa = (ROOT / "defesa-margem-contratos-publicos" / "index.html").read_text(encoding="utf-8")
    assert "Enviar documentos para análise" in defesa
    assert "Diagnosticar a operação B2G" in (ROOT / "diretoria-b2g" / "index.html").read_text(encoding="utf-8")


def test_whatsapp_float_in_landmark():
    pages = [
        ROOT / "index.html",
        ROOT / "diretoria-b2g" / "index.html",
        ROOT / "obrigado.html",
    ]
    for path in pages:
        text = path.read_text(encoding="utf-8")
        assert "contact-float" in text, f"{path}: missing contact-float landmark"
        assert 'aria-label="Contato rápido"' in text or "Contato rápido" in text

if __name__ == "__main__":
    failed = 0
    for t in (
        test_copy_leaks_absent_on_commercial_pages,
        test_job_title_valid,
        test_brand_forbidden_phrases_still_enforced,
        test_microcopy_preferences,
        test_llms_consistent,
        test_concordance_and_forbidden_microcopy,
        test_whatsapp_float_in_landmark,
    ):
        try:
            t()
            print("OK", t.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", t.__name__, exc)
    sys.exit(1 if failed else 0)
