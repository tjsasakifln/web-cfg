#!/usr/bin/env python3
"""A nota sem JavaScript entra uma vez, no lugar certo, e respeita as exclusões.

Campanha CONFENGE-INBOUND-RECEITA-E-PRODUCAO-20260919 (W6-ops-web). Cobre
``scripts/site/apply_form_nojs_note.py``:

* formulário de captura (``action="/.netlify/functions/lead"``, ``/api/web/lead``
  ou ``data-capture-form``) sem a nota recebe ``<noscript>`` com a frase fixa e
  dois links, depois do ``<fieldset>`` de abertura ou do primeiro ``form-hint``;
* reaproveita o primeiro ``wa.me`` e o primeiro ``mailto:`` da página; sem eles,
  usa os canais canônicos;
* idempotente: segunda passagem não muda nada; nota já presente (padrão da home)
  não é duplicada; formulário que não é de captura fica intacto;
* fora do escopo: artigo preso por hash, ``/piloto/*``, ``/nurture/`` e a home.

Uso: python3 scripts/site/test_apply_form_nojs_note.py
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site import apply_form_nojs_note as afn  # noqa: E402
from scripts.site.font_preload import BYTE_PINNED_ARTICLES  # noqa: E402

SHELL_HEAD = '<!DOCTYPE html><html class="no-js" lang="pt-BR"><head><meta charset="utf-8"/><title>t</title></head><body>'
SHELL_FOOT = '<footer><a href="mailto:tiago.sasaki@confenge.com.br">e-mail</a></footer></body></html>'

CAPTURE_WITH_HINT = (
    '<form action="/.netlify/functions/lead" class="contact-form" method="POST" name="diagnostico-confenge" id="f1">'
    '<p class="form-hint" data-form-value>Registre a demanda.</p>\n'
    '<p class="form-hint" data-field-purpose>Nome e canal.</p>'
    '<input name="form-name" type="hidden" value="x"/></form>'
)
CAPTURE_WITH_FIELDSET = (
    '<form action="/api/web/lead" method="POST" name="diagnostico-b2g" id="f2">\n'
    '<fieldset class="form-step"><legend>Passo 1</legend><input name="nome"/></fieldset></form>'
)
CAPTURE_HIDDEN_FIRST = (
    '<form data-capture-form method="POST" name="diagnostico-b2g" id="f3">\n'
    '<input type="hidden" name="offer_id" value=""/><input name="nome"/></form>'
)
TOOL_FORM = '<form id="f" method="post" class="tool-form"><input name="valor"/><button class="tool-run">Calcular</button></form>'
HOME_LIKE = (
    '<p class="form-nojs-note">Neste navegador, o formulário não consegue registrar o pedido.</p>'
    '<form action="/obrigado" data-capture-form method="POST" name="diagnostico-b2g" id="formulario-contato">'
    '<p class="form-hint" data-form-value>Vale para qualquer tamanho.</p>'
    '<noscript><p class="form-hint form-nojs-note">já tem</p></noscript><input name="nome"/></form>'
)
WA_ON_PAGE = '<a href="https://wa.me/5548988344559?text=Ol%C3%A1%2C%20Tiago.%20Tenho%20glosa.">WhatsApp</a>'

failures: list[str] = []


def check(cond: bool, name: str, detail: object = "") -> None:
    if cond:
        print(f"PASS {name}")
    else:
        failures.append(name)
        print(f"FAIL {name} {detail}")


def page(*parts: str) -> str:
    return SHELL_HEAD + "".join(parts) + SHELL_FOOT


# --- transform: insertion point, text, channels ---------------------------------
out = afn.transform(page(WA_ON_PAGE, CAPTURE_WITH_HINT))
check(out.count(afn.NOTE_CLASS) == 1, "inserted_once_after_first_hint")
check(
    '<p class="form-hint" data-form-value>Registre a demanda.</p>\n<noscript><p class="form-hint form-nojs-note">' in out,
    "position_after_first_form_hint",
    out,
)
check(
    "Sem JavaScript, este formulário não envia. Use o <a" in out and "</a> ao lado.</p></noscript>" in out,
    "fixed_sentence",
)
check('href="https://wa.me/5548988344559?text=Ol%C3%A1%2C%20Tiago.%20Tenho%20glosa."' in out, "reuses_page_whatsapp")
check('href="mailto:tiago.sasaki@confenge.com.br"' in out, "reuses_page_mailto")
check("<noscript>" in out and "</noscript>" in out, "wrapped_in_noscript_no_css_dependency")

out_fs = afn.transform(page(CAPTURE_WITH_FIELDSET))
check(
    '<fieldset class="form-step"><legend>' not in out_fs.split(afn.NOTE_CLASS)[0]
    and '<fieldset class="form-step">\n<noscript>' in out_fs,
    "position_after_opening_fieldset",
    out_fs,
)
check("https://wa.me/5548988344559?text=" in out_fs, "canonical_whatsapp_when_page_has_none")
check("%20" in out_fs.split('wa.me/5548988344559?text=')[1].split('"')[0], "whatsapp_text_generic_and_encoded")

out_hidden = afn.transform(page(CAPTURE_HIDDEN_FIRST))
check('id="f3">\n<noscript>' in out_hidden, "position_right_after_form_when_no_hint_or_fieldset", out_hidden)

# --- idempotency and non-capture forms ------------------------------------------
check(afn.transform(out) == out, "idempotent_second_pass_hint")
check(afn.transform(out_fs) == out_fs, "idempotent_second_pass_fieldset")
check(afn.transform(page(TOOL_FORM)) == page(TOOL_FORM), "tool_form_untouched")
check(afn.transform(page(HOME_LIKE)) == page(HOME_LIKE), "existing_note_not_duplicated")
two = page(WA_ON_PAGE, TOOL_FORM, CAPTURE_WITH_HINT)
out_two = afn.transform(two)
check(out_two.count(afn.NOTE_CLASS) == 1 and out_two.index("tool-form") < out_two.index(afn.NOTE_CLASS), "only_capture_form_gets_note")

# --- scope: exclusions in a fixture root ----------------------------------------
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    pinned = sorted(BYTE_PINNED_ARTICLES)[0]
    files = {
        "servico-x/index.html": page(CAPTURE_WITH_HINT),
        pinned: page(CAPTURE_WITH_HINT),
        "piloto/x/index.html": page(CAPTURE_WITH_HINT),
        "nurture/index.html": page('<form id="nurture-form" data-capture-form method="post" action="/x"><input name="email"/></form>'),
        "index.html": page(HOME_LIKE.replace("<noscript>", "").replace("</noscript>", "").replace(
            '<p class="form-hint form-nojs-note">já tem</p>', "")),
        "ferramentas/t/index.html": page(TOOL_FORM),
    }
    for rel, html in files.items():
        target = root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(html, encoding="utf-8")
    pending = {rel for rel, _path, _new in afn.pending_changes(root)}
    check(pending == {"servico-x/index.html"}, "scope_excludes_hash_bound_piloto_nurture_home_and_tool_forms", pending)
    check(afn.excluded(pinned) and afn.excluded("piloto/x/index.html") and afn.excluded("nurture/index.html") and afn.excluded("index.html"), "excluded_predicate")
    check(not afn.excluded("servico-x/index.html"), "excluded_predicate_allows_in_scope")

    # --check reports and exits 1 without writing; --write applies; second --write is a no-op.
    before = (root / "servico-x/index.html").read_text(encoding="utf-8")
    rc_check = afn.main(["--check", "--root", str(root)])
    check(rc_check == 1 and (root / "servico-x/index.html").read_text(encoding="utf-8") == before, "check_mode_reports_without_writing", rc_check)
    rc_write = afn.main(["--write", "--root", str(root)])
    after = (root / "servico-x/index.html").read_text(encoding="utf-8")
    check(rc_write == 0 and after.count(afn.NOTE_CLASS) == 1, "write_mode_applies_once", rc_write)
    check((root / pinned).read_text(encoding="utf-8") == page(CAPTURE_WITH_HINT), "hash_bound_left_byte_identical")
    rc_again = afn.main(["--write", "--root", str(root)])
    check(rc_again == 0 and (root / "servico-x/index.html").read_text(encoding="utf-8") == after, "write_mode_idempotent")
    check(afn.main(["--check", "--root", str(root)]) == 0, "check_clean_after_write")

if failures:
    print(f"FAILED {len(failures)}: {', '.join(failures)}")
    raise SystemExit(1)
print("ALL apply_form_nojs_note checks passed")
