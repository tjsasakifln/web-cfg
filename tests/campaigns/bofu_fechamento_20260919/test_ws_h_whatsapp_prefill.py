"""WS-H (CONTEXTO-CAPTURA-08): WhatsApp prefills are punctuated sentences.

The intake rewrite that replaced "Posso enviar edital e planilha" with
"Quero solicitar um canal seguro para envio…" landed mid-sentence in nine
articles, gluing "…em cada serviço Quero solicitar…". Every decoded
`wa.me/?text=` in source HTML must end the previous sentence before the
secure-channel request, and `document_intake.rewrite_copy` must never
produce the run-on again.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site import document_intake  # noqa: E402

WA_RE = re.compile(r"""https://wa\.me/\d+\?text=([^"'>\s]+)""", re.I)
# A lower-case letter, digit or accented letter followed by the new sentence
# without any closing punctuation.
RUN_ON_RE = re.compile(r"[a-z0-9áéíóúçãõâêôàü] Quero solicitar")

AFFECTED = (
    "conteudos/sinapi-ou-sicro-obra-publica/index.html",
    "conteudos/mobilizacao-desmobilizacao-orcamento-obra/index.html",
    "conteudos/sinapi-desonerado-nao-desonerado/index.html",
    "conteudos/matriz-de-riscos-reequilibrio-economico-financeiro/index.html",
    "conteudos/empreitada-preco-global-preco-unitario/index.html",
    "conteudos/data-base-orcamento-reajuste-obra-publica/index.html",
    "conteudos/comprovacao-exequibilidade-proposta-obra/index.html",
    "conteudos/bdi-diferenciado-obra-publica/index.html",
    "conteudos/administracao-local-orcamento-obra-publica/index.html",
)


def _decoded_prefills(html: str) -> list[str]:
    return [unquote(m.group(1).replace("+", " ")) for m in WA_RE.finditer(html)]


def _run_ons(path: Path) -> list[str]:
    return [text for text in _decoded_prefills(path.read_text(encoding="utf-8")) if RUN_ON_RE.search(text)]


def test_affected_articles_have_punctuated_prefills():
    broken = {rel: _run_ons(ROOT / rel) for rel in AFFECTED}
    broken = {rel: hits for rel, hits in broken.items() if hits}
    assert not broken, broken


def test_no_source_page_glues_the_secure_channel_request():
    broken: dict[str, list[str]] = {}
    for path in document_intake.visitor_html_files(ROOT):
        hits = _run_ons(path)
        if hits:
            broken[str(path.relative_to(ROOT))] = hits
    assert not broken, broken


def test_rewrite_copy_closes_the_previous_sentence():
    src = "Olá. Quero conferir o BDI desta proposta Posso enviar edital e planilha."
    out = document_intake.rewrite_copy(src)
    assert "proposta. Quero solicitar um canal seguro para envio." in out
    assert not RUN_ON_RE.search(out)
    # Already-punctuated input is untouched beyond the intended replacement.
    src2 = "Olá. Quero conferir o BDI desta proposta. Posso enviar edital e planilha."
    out2 = document_intake.rewrite_copy(src2)
    assert "proposta. Quero solicitar" in out2 and "proposta.. " not in out2
    assert out2 == out
    # The repair also applies to text already rewritten by an earlier pass.
    glued = "Olá. Quero conferir o BDI desta proposta Quero solicitar um canal seguro para envio. Não anexe arquivo nesta mensagem."
    assert document_intake.rewrite_copy(glued) == glued.replace("proposta Quero", "proposta. Quero")
