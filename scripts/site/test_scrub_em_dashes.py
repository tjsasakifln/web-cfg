"""Unit tests for public em-dash scrub rules."""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.scrub_em_dashes import (  # noqa: E402
    EM,
    is_official_source_title,
    residual_em_dashes,
    scrub_html,
    scrub_prose,
)


def test_contrast_clause():
    s = "Radar para a sua operação — não para o mercado inteiro."
    out = scrub_prose(s)
    assert EM not in out
    assert "operação, não para" in out


def test_parenthetical_pair():
    s = (
        "Ele precisa do perfil da empresa — capacidade, acervo, órgãos-alvo — "
        "para filtrar o que merece atenção."
    )
    out = scrub_prose(s)
    assert EM not in out
    assert "(capacidade, acervo, órgãos-alvo)" in out


def test_uf_and_region():
    assert "(PR)" in scrub_prose("Edificações públicas — PR")
    assert "Santa Catarina" in scrub_prose("Edificações públicas — Santa Catarina")
    assert EM not in scrub_prose("Edificações públicas — Santa Catarina")


def test_templates():
    s = (
        "Delimite o problema — valor, período, serviço afetado, decisão necessária e "
        "responsável — antes de discutir glosa."
    )
    out = scrub_prose(s)
    assert EM not in out
    assert out.startswith("Delimite o problema (valor")
    assert "próximos passos, sem cadastro" in scrub_prose(
        f"Retornamos com enquadramento técnico e próximos passos — sem cadastro em lista."
    )


def test_chrome_rss():
    out = scrub_prose(f"title=\"CONFENGE {EM} Conteúdos\"")
    assert EM not in out
    assert "CONFENGE · Conteúdos" in out


def test_official_source_preserved():
    s = "Planalto — Lei nº 14.133/2021"
    assert is_official_source_title(s)
    assert scrub_prose(s) == s
    assert scrub_prose(f"Veja TCU — pagamento e o guia.") == f"Veja TCU — pagamento e o guia."


def test_html_protects_source_anchors():
    html = (
        '<p>O desfecho depende de prova — não de narrativa.</p>'
        '<a href="https://www.planalto.gov.br/x">Planalto — Lei nº 14.133/2021</a>'
    )
    out = scrub_html(html)
    assert "prova, não de narrativa" in out
    assert f"Planalto {EM} Lei" in out
    assert residual_em_dashes(out) == []


def test_placeholder_nd():
    assert scrub_prose(f"<td>{EM}</td>") == "<td>n/d</td>"


def test_html_newlines_and_indent_preserved():
    """--write must not smash DOCTYPE/newlines or HTML indentation."""
    html = (
        "<!DOCTYPE html>\n\n"
        '<html lang="pt-BR">\n'
        "<body>\n"
        "  <p>Radar para a sua operação — não para o mercado inteiro.</p>\n"
        "</body>\n"
        "</html>\n"
    )
    out = scrub_html(html)
    assert "<!DOCTYPE html>\n\n<html" in out
    assert "  <p>Radar" in out
    assert "operação, não para" in out
    assert EM not in out


def test_check_cli_fails_on_prose_em_dash():
    """Shipped --check must still fail on a representative U+2014 input."""
    html = "<!DOCTYPE html><html><body><p>Prova — não narrativa.</p></body></html>\n"
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        suffix=".html",
        delete=False,
    ) as fh:
        fh.write(html)
        path = Path(fh.name)
    try:
        proc = subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "site" / "scrub_em_dashes.py"),
                "--check",
                "--path",
                str(path),
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        assert proc.returncode == 1, proc.stdout + proc.stderr
        assert "FAIL" in proc.stderr or "unnormalized" in proc.stderr or "residual" in proc.stderr
    finally:
        path.unlink(missing_ok=True)


def test_pseo_write_public_html_scrubs_prose_em_dash():
    """pseo:audit rebuilds inteligencia HTML; writes must go through the scrubber."""
    from scripts.pseo.build import write_public_html

    path = ROOT / "_g03_pseo_emdash_probe" / "index.html"
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        write_public_html(
            path,
            "<p>insumos e logística — cenário em que reequilíbrio</p>\n",
        )
        out = path.read_text(encoding="utf-8")
        assert EM not in out
        assert "logística, cenário" in out or "logística, cenário" in out.replace("  ", " ")
    finally:
        path.unlink(missing_ok=True)
        try:
            path.parent.rmdir()
        except OSError:
            pass


def test_editorial_write_html_scrubs_prose_em_dash():
    """editorial:build must not reintroduce U+2014; CI runs it before test:copy."""
    from scripts.editorial.build import write_html

    rel = "_g03_emdash_probe"
    path = write_html(rel, "<p>O desfecho depende de prova — não de narrativa.</p>\n")
    try:
        out = path.read_text(encoding="utf-8")
        assert EM not in out
        assert "prova, não de narrativa" in out
    finally:
        path.unlink(missing_ok=True)
        try:
            path.parent.rmdir()
        except OSError:
            pass


def test_check_cli_does_not_mutate_tree():
    """Shipped --check must leave git status unchanged."""
    before = subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=ROOT, text=True
    )
    proc = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts" / "site" / "scrub_em_dashes.py"),
            "--check",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    after = subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=ROOT, text=True
    )
    assert after == before, "scrub_em_dashes.py --check mutated the working tree"


if __name__ == "__main__":
    failed = 0
    for t in (
        test_contrast_clause,
        test_parenthetical_pair,
        test_uf_and_region,
        test_templates,
        test_chrome_rss,
        test_official_source_preserved,
        test_html_protects_source_anchors,
        test_placeholder_nd,
        test_html_newlines_and_indent_preserved,
        test_pseo_write_public_html_scrubs_prose_em_dash,
        test_editorial_write_html_scrubs_prose_em_dash,
        test_check_cli_fails_on_prose_em_dash,
        test_check_cli_does_not_mutate_tree,
    ):
        try:
            t()
            print("OK", t.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", t.__name__, exc)
    sys.exit(1 if failed else 0)
