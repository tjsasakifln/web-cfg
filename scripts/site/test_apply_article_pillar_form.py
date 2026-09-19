#!/usr/bin/env python3
"""O formulário dos artigos leva ao pilar, e o remediador não desfaz isso.

Campanha POS-REDESIGN-FECHAMENTO-20260918, frente artigo (TAREFAS-03).

Cobre a regra única de destino (``scripts/site/apply_article_pillar_form.py``)
e o consumo dela por ``scripts/site/inbound_first_remediate.inject_journey_cta``:

* ``href="/#contato"``, ``href="/?…#contato"`` e o ``href="/"`` nu (com
  ``#contato`` só em ``data-origem``) são todos reescritos para
  ``{pilar}#captura-pilar``; a guarda residual acusa qualquer um deles.
* Artigo congelado por hash não é transformado por ``--write``; só
  ``--write --include-hash-bound`` o transforma, e então imprime o registro a
  recapturar (INBOUND-RECEITA-20260919).
* Link sem ``data-tema``/``data-origem`` (contexto só na query da home) ganha
  os dois derivados (``?tema=`` decodificado, senão o H1; ``/conteudos/<slug>/``)
  e ``data-cta-position``/``data-journey`` quando ausentes; nada presente é
  reescrito; idempotente.
* ``inject_journey_cta`` deriva o destino da mesma regra e preserva a
  lead-inline já apontada ao pilar (WhatsApp em frase natural inclusive).

Uso: python3 scripts/site/test_apply_article_pillar_form.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site import apply_article_pillar_form as apf  # noqa: E402
from scripts.site import inbound_first_remediate as ifr  # noqa: E402
from scripts.site.brand import load_brand  # noqa: E402

PILLAR = "/atrasos-prorrogacao-obras-publicas/"
SLUG = "artigo-de-teste"
LABEL = "Continuar pelo formulário"


def article(
    form_href: str,
    *,
    tema_principal: bool = True,
    wa_text: str = "Ol%C3%A1%2C%20Tiago.%20Li%20o%20artigo%20%22T%22%20e%20quero%20analisar%20um%20caso.",
    form_attrs: str = f' data-cta-position="form" data-journey="contrato"',
    form_tail: str = f' data-tema="Chuva" data-origem="/conteudos/{SLUG}/#contato"',
) -> str:
    tema = f'<p><strong>Tema principal</strong><a href="{PILLAR}">Atrasos</a></p>' if tema_principal else ""
    return (
        "<html><body><main><h1>Chuva e prazo</h1>"
        f"{tema}"
        '<section class="lead-inline" id="diagnostico-confenge" aria-label="Próximo passo" data-journey="contrato">'
        '<div class="lead-inline-copy"><span>Próximo passo</span><strong>Validar</strong><p>x</p></div>'
        '<div class="lead-inline-actions">'
        f'<a class="button button-primary" data-cta-position="inline" data-journey="contrato" href="https://wa.me/5548988344559?text={wa_text}" rel="noopener" target="_blank">WhatsApp</a>'
        f'<a class="button button-secondary"{form_attrs} href="{form_href}"{form_tail}>{LABEL}</a>'
        "</div></section>"
        '<aside class="article-aside"><div class="aside-card"><p>Oferta</p>'
        f'<a class="button button-primary" href="https://wa.me/5548988344559?text={wa_text}">WhatsApp</a></div></aside>'
        "</main></body></html>"
    )


def form_hrefs(html: str) -> list[str]:
    import re

    return re.findall(r'<a [^>]*href="([^"]*)"[^>]*>' + LABEL + "</a>", html)


def form_link(html: str) -> str:
    import re

    m = re.search(r'<a [^>]*>' + LABEL + "</a>", html)
    return m.group(0) if m else ""


def check(cond: bool, msg: str, failures: list[str]) -> None:
    if not cond:
        failures.append(msg)


def main() -> int:
    failures: list[str] = []
    overrides, labels = apf.service_map()
    assert apf.pillar_has_anchor(PILLAR), f"fixture depende de {PILLAR}#captura-pilar"
    target = f"{PILLAR}{apf.PILLAR_ANCHOR}"

    # 1. os quatro formatos de destino na home são reconhecidos e reescritos
    for href in ("/#contato", "/?tema=x&amp;origem=/conteudos/s/#contato", "/", "/?tema=x"):
        src = article(href)
        check(apf.home_form_link(src), f"guarda residual não acusa href={href!r}", failures)
        out, notes = apf.transform(SLUG, src, overrides, labels)
        check(form_hrefs(out) == [target], f"href={href!r} não virou {target}: {form_hrefs(out)}", failures)
        check(not apf.home_form_link(out), f"residual após transformar href={href!r}", failures)
        check('data-origem="/conteudos/' in out and 'data-tema="Chuva"' in out, "data-tema/data-origem perdidos", failures)
        again, _ = apf.transform(SLUG, out, overrides, labels)
        check(again == out, f"transformação não idempotente para href={href!r}", failures)

    # 1a. contexto ausente é derivado, presente é preservado, ordem dos convertidos
    bare = article("/?tema=glosa%20de%20medi%C3%A7%C3%A3o&amp;origem=/conteudos/s/#contato", form_attrs="", form_tail="")
    out, _ = apf.transform(SLUG, bare, overrides, labels)
    link = form_link(out)
    expected = (
        f'<a class="button button-secondary" data-cta-position="form" data-journey="contrato" href="{target}"'
        f' data-tema="glosa de medição" data-origem="/conteudos/{SLUG}/">{LABEL}</a>'
    )
    check(link == expected, f"contexto derivado do ?tema= diferente do esperado:\n{link}\n{expected}", failures)
    again, _ = apf.transform(SLUG, out, overrides, labels)
    check(again == out, "derivação de contexto não idempotente", failures)

    bare_h1 = article("/#contato", form_attrs="", form_tail="")
    out, _ = apf.transform(SLUG, bare_h1, overrides, labels)
    check('data-tema="Chuva e prazo"' in form_link(out), f"sem ?tema= o data-tema deveria vir do H1: {form_link(out)}", failures)
    check(f'data-origem="/conteudos/{SLUG}/"' in form_link(out), "data-origem não derivado do slug", failures)

    jornada = article("/?jornada=edital&amp;tema=Edital%20X&amp;origem=/conteudos/s/#contato", form_attrs="", form_tail="")
    out, _ = apf.transform(SLUG, jornada, overrides, labels)
    check('data-journey="edital"' in form_link(out) and 'data-tema="Edital X"' in form_link(out), f"?jornada= não respeitado: {form_link(out)}", failures)

    partial = article("/#contato", form_attrs="", form_tail=f' data-tema="custos" data-origem="/conteudos/{SLUG}/"')
    out, _ = apf.transform(SLUG, partial, overrides, labels)
    check(
        form_link(out) == f'<a class="button button-secondary" data-cta-position="form" data-journey="contrato" href="{target}" data-tema="custos" data-origem="/conteudos/{SLUG}/">{LABEL}</a>',
        f"tema/origem presentes deveriam ficar e só posição/jornada entrar: {form_link(out)}",
        failures,
    )
    kept = article("/", form_attrs=' data-cta-position="after_answer" data-journey="projeto"')
    out, _ = apf.transform(SLUG, kept, overrides, labels)
    check('data-journey="projeto"' in form_link(out) and 'data-cta-position="after_answer"' in form_link(out) and form_link(out).count("data-journey") == 1, f"atributos presentes foram reescritos: {form_link(out)}", failures)

    # 2. destino do pilar nunca é tratado como home
    check(not apf.home_form_link(article(target)), "guarda residual acusa link já no pilar", failures)
    check(not apf.home_form_link(article(PILLAR)), "guarda residual acusa link à raiz do pilar", failures)

    # 3. sem pilar (nem Tema principal nem override): link mantido e pendência declarada
    src = article("/", tema_principal=False)
    out, notes = apf.transform(SLUG, src, overrides, labels)
    check(form_hrefs(out) == ["/"], "sem pilar o link deveria ficar como está", failures)
    check(any("sem pilar" in n for n in notes), f"pendência 'sem pilar' ausente: {notes}", failures)
    check(apf.form_target(SLUG, src, overrides) is None, "form_target deveria ser None sem pilar", failures)

    # 4. artigos congelados por hash: --write não os toca; só --include-hash-bound
    reasons = apf.frozen_reasons()
    frozen = apf.frozen_articles()
    check(frozen == set(reasons), "frozen_articles deveria derivar de frozen_reasons", failures)
    check({"glosa-de-medicao-obra-publica", "medicao-de-obra-publica-rejeitada", "fiscal-nao-assina-medicao-obra-publica"} <= frozen, f"congelados inesperados: {sorted(frozen)}", failures)
    check(all(apf.REG_CANARY_SIBLING in reasons[s] for s in ("glosa-de-medicao-obra-publica", "medicao-de-obra-publica-rejeitada", "fiscal-nao-assina-medicao-obra-publica")), f"irmãs do canário sem registro: {reasons}", failures)
    check(apf.REG_STRIKING in reasons.get("chuva-prorrogacao-prazo-obra-publica", []), f"chuva sem registro striking-distance: {reasons.get('chuva-prorrogacao-prazo-obra-publica')}", failures)
    # 2026-09-19: o par pinado só por CLICK_ORIGIN (máscara de ponte) não é hash-bound.
    check(not {"custos-indiretos-atraso-administracao-obra", "jogo-de-planilha-aditivo-obra-publica"} & frozen, "par CLICK_ORIGIN não deveria estar congelado por hash", failures)
    import contextlib
    import io

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = apf.run(write=False)
    report = buf.getvalue()
    check(rc == 0, f"--check reprovou na árvore atual:\n{report}", failures)
    for slug in sorted(frozen):
        page = ROOT / "conteudos" / slug / "index.html"
        if page.is_file() and apf.home_form_link(page.read_text(encoding="utf-8")):
            check(f"{slug}: congelado por hash" in report, f"{slug} congelado deveria constar como pendência", failures)
            check(slug not in report.split("desatualizados:")[-1] if "desatualizados:" in report else True, f"{slug} congelado listado como desatualizado", failures)

    # 4a. sandbox: congelado fica intacto sem a flag; com a flag transforma e nomeia o registro
    import tempfile

    frozen_slug = "glosa-de-medicao-obra-publica"
    with tempfile.TemporaryDirectory() as tmp:
        sandbox = Path(tmp) / frozen_slug
        sandbox.mkdir()
        page = sandbox / "index.html"
        page.write_text(article("/#contato", form_attrs="", form_tail=""), encoding="utf-8")
        real_articles = apf.ARTICLES
        apf.ARTICLES = Path(tmp)
        try:
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                rc = apf.run(write=True)
            check(rc == 0 and page.read_text(encoding="utf-8") == article("/#contato", form_attrs="", form_tail=""), "--write sem flag tocou artigo congelado", failures)
            check(f"{frozen_slug}: congelado por hash" in buf.getvalue(), "--write sem flag deveria listar o congelado como pendência", failures)
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                rc = apf.run(write=True, include_hash_bound=True)
            written = page.read_text(encoding="utf-8")
            check(rc == 0 and form_hrefs(written) == [target], f"--include-hash-bound não transformou o congelado: {form_hrefs(written)}", failures)
            check(f"recaptura obrigatória: {frozen_slug}: sha256 novo " in buf.getvalue() and apf.REG_CANARY_SIBLING in buf.getvalue(), f"obrigação de recaptura não impressa:\n{buf.getvalue()}", failures)
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                rc = apf.run(write=True, include_hash_bound=True)
            check(rc == 0 and "artigos alterados: 0" in buf.getvalue() and "recaptura obrigatória" not in buf.getvalue(), f"segunda passada não é idempotente:\n{buf.getvalue()}", failures)
        finally:
            apf.ARTICLES = real_articles
    # 4b. a flag só vale com --write (argparse recusa com --check)
    rejected = False
    with contextlib.redirect_stderr(io.StringIO()):
        try:
            apf.main(["--check", "--include-hash-bound"])
        except SystemExit as exc:
            rejected = exc.code == 2
    check(rejected, "--check --include-hash-bound deveria ser recusado", failures)

    # 5. o remediador deriva o destino da mesma regra
    brand = load_brand()
    origem = f"/conteudos/{SLUG}/"
    check(ifr.article_form_target(origem, article("/")) == target, "remediador não deriva o pilar", failures)
    check(ifr.article_form_target(origem, article("/", tema_principal=False)) == "/#contato", "remediador sem pilar deveria cair em /#contato", failures)
    check(ifr.article_form_target("/ferramentas/x/", article("/")) == "/#contato", "fora de /conteudos/ deveria cair em /#contato", failures)

    frozen_slug = "glosa-de-medicao-obra-publica"
    check(ifr.article_form_target(f"/conteudos/{frozen_slug}/", article("/#contato")) == "/#contato", "remediador deveria manter /#contato no congelado do canário #389", failures)

    # 5a. lead-inline genérica (href="/#contato") regenerada → formulário no pilar
    generic = article("/#contato").replace(' data-journey="contrato"', "", 1)
    out = ifr.inject_journey_cta(generic, brand, "contrato", "Chuva e prazo", origem)
    check(form_hrefs(out) == [target], f"remediador regeneraria href para a home: {form_hrefs(out)}", failures)
    check("/#contato" not in out.split("data-origem")[0], "remediador deixou /#contato no href", failures)

    # 5b. lead-inline já no pilar (com WhatsApp em frase natural) é preservada
    done = article(target)
    out = ifr.inject_journey_cta(done, brand, "contrato", "Chuva e prazo", origem)
    check(out == done, "remediador reescreveu lead-inline já apontada ao pilar", failures)
    check("Li%20o%20artigo" in out, "WhatsApp em frase natural perdido", failures)

    # 5c. sem pilar, o remediador continua caindo na home (comportamento anterior)
    out = ifr.inject_journey_cta(article("/#contato", tema_principal=False), brand, "contrato", "x", origem)
    check(form_hrefs(out) == ["/#contato"], f"sem pilar esperava /#contato: {form_hrefs(out)}", failures)

    if failures:
        print("FAIL test_apply_article_pillar_form")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS test_apply_article_pillar_form: destino único artigo→pilar, remediador alinhado, congelados intactos")
    return 0


def test_apply_article_pillar_form() -> None:
    assert main() == 0


if __name__ == "__main__":
    sys.exit(main())
