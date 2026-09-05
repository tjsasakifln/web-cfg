"""Render public authority policy pages from the versioned editorial-policy record."""

from __future__ import annotations

import html
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.html_shell import (  # noqa: E402
    ORG_JSONLD,
    PERSON_JSONLD,
    SITE,
    breadcrumb_jsonld,
    page_shell,
)
from scripts.site.authority import (  # noqa: E402
    current_policy_version,
    load_editorial_policy,
    load_governance,
    write_sealed_editorial_policy,
)
from scripts.site.conflict_gate import (  # noqa: E402
    client_runtime_js,
    first_step_form_html,
    load_contract as load_conflict_contract,
    public_policy_body,
)
from scripts.site.responsive_text import escape_prose_with_opaque_tokens  # noqa: E402

UPDATED_BR = {
    "2026-08-15": "15 de agosto de 2026",
    "2026-08-16": "16 de agosto de 2026",
    "2026-09-04": "4 de setembro de 2026",
}


def _esc(s: str) -> str:
    return html.escape(s or "", quote=True)


def _byline(updated: str, version: str) -> str:
    br = UPDATED_BR.get(updated, updated)
    return (
        '<p class="authority-byline">'
        'Responsável técnico: <a href="/especialista/tiago-jun-sasaki/">Engº Tiago Sasaki</a>'
        f' · Política <span data-policy-version="{_esc(version)}">{_esc(version)}</span>'
        f' · Atualizado em <time datetime="{_esc(updated)}">{_esc(br)}</time>'
        ' · <a href="/correcoes/">Como corrigir</a>'
        "</p>"
    )


def _nav() -> str:
    return (
        '<nav class="authority-policy-nav" aria-label="Políticas de autoridade">'
        '<a href="/politica-editorial/">Editorial</a>'
        '<a href="/correcoes/">Correções</a>'
        '<a href="/uso-de-ia/">Uso de IA</a>'
        '<a href="/conflitos/">Conflitos</a>'
        '<a href="/metodologia-inteligencia/">Metodologia</a>'
        '<a href="/politica-editorial/historico/">Histórico</a>'
        "</nav>"
    )


def _version_banner(version: str, *, historical: bool) -> str:
    if historical:
        return (
            f'<p class="policy-version-disclosure" data-policy-version="{_esc(version)}">'
            f"Esta é a versão histórica <strong>{_esc(version)}</strong>. "
            'A política vigente está em <a href="/politica-editorial/">Política editorial</a>.'
            "</p>"
        )
    return (
        f'<p class="policy-version-disclosure" data-policy-version="{_esc(version)}">'
        f"Versão vigente: <strong>{_esc(version)}</strong>. "
        '<a href="/politica-editorial/historico/">Histórico de versões</a>.'
        "</p>"
    )


def _correction_form(version: str, owner_email: str) -> str:
    mailto = (
        f"mailto:{_esc(owner_email)}?subject=Correcao%20editorial%20CONFENGE"
    )
    return f"""
<h2 id="formulario">Pedido com recibo</h2>
<form class="contact-form" id="correction-form" method="post" action="/.netlify/functions/correction" novalidate>
<input name="policy_version" type="hidden" value="{_esc(version)}"/>
<p class="honeypot"><label for="empresa-site">Não preencha este campo</label>
<input autocomplete="off" id="empresa-site" name="empresa-site" tabindex="-1"/></p>
<div class="field"><label for="page_url">URL da página</label>
<input id="page_url" name="page_url" required="" type="url" inputmode="url" placeholder="https://confenge.com.br/..."/></div>
<div class="field"><label for="contested_excerpt">Trecho contestado</label>
<textarea id="contested_excerpt" maxlength="2000" name="contested_excerpt" required="" rows="4"></textarea></div>
<div class="field"><label for="proposed_correction">Correção proposta</label>
<textarea id="proposed_correction" maxlength="2000" name="proposed_correction" required="" rows="4"></textarea></div>
<div class="field"><label for="contact">E-mail ou WhatsApp para resposta</label>
<input id="contact" name="contact" required="" type="text" autocomplete="email"/>
<p class="form-hint">Só o necessário para responder. Não envie CPF, RG, data de nascimento nem endereço residencial.</p></div>
<div class="field"><label for="contact_name">Como podemos nos dirigir a você <span class="optional-mark">opcional</span></label>
<input id="contact_name" maxlength="80" name="contact_name" type="text" autocomplete="nickname"/></div>
<label class="check"><input name="consentimento" required="" type="checkbox"/> Autorizo o uso destes dados apenas para avaliar e responder ao pedido de correção.</label>
<button class="button button-primary" type="submit">Enviar pedido e receber recibo</button>
<p class="form-note">O prazo é UNKNOWN até existir série medida. O recibo confirma o recebimento, não um SLA.</p>
<div id="correction-result" role="status" aria-live="polite"></div>
</form>
<p>Se o envio automático falhar, escreva para <a href="{mailto}">{_esc(owner_email)}</a> com os mesmos quatro campos. Não há prazo inventado.</p>
<script>
(function () {{
  var form = document.getElementById("correction-form");
  var out = document.getElementById("correction-result");
  if (!form || !out) return;
  form.addEventListener("submit", function (ev) {{
    ev.preventDefault();
    out.textContent = "A enviar…";
    var data = {{}};
    new FormData(form).forEach(function (value, key) {{ data[key] = value; }});
    data.consentimento = form.consentimento && form.consentimento.checked;
    fetch("/.netlify/functions/correction", {{
      method: "POST",
      headers: {{ "content-type": "application/json", accept: "application/json" }},
      body: JSON.stringify(data)
    }}).then(function (res) {{ return res.json().then(function (body) {{ return {{ res: res, body: body }}; }}); }})
      .then(function (pack) {{
        var body = pack.body || {{}};
        if (body.ok && body.receipt_id) {{
          out.innerHTML = "Recibo <code>" + String(body.receipt_id) + "</code>. Prazo: " + String(body.prazo || "UNKNOWN") + ".";
          form.reset();
          return;
        }}
        out.textContent = body.message || "Não foi possível registrar o pedido.";
      }})
      .catch(function () {{
        out.textContent = "Falha de rede. Use o e-mail indicado nesta página.";
      }});
  }});
}})();
</script>
"""


def _page(
    *,
    path: str,
    title: str,
    description: str,
    h1: str,
    eyebrow: str,
    crumbs: list[tuple[str, str | None]],
    body: str,
    updated: str,
    version: str,
    historical: bool = False,
) -> str:
    webpage = {
        "@type": "WebPage",
        "@id": f"{SITE}{path}#webpage",
        "url": f"{SITE}{path}",
        "name": title,
        "description": description,
        "dateModified": updated,
        "inLanguage": "pt-BR",
        "isPartOf": {"@id": f"{SITE}/#organization"},
        "author": {"@id": f"{SITE}/#tiago"},
        "publisher": {"@id": f"{SITE}/#organization"},
        "version": version,
    }
    crumb_items = "".join(
        (
            f'<li><a href="{href}">{label}</a><span aria-hidden="true">/</span></li>'
            if href
            else f'<li aria-current="page">{label}</li>'
        )
        for label, href in crumbs
    )
    main = f"""
<nav aria-label="Navegação estrutural" class="breadcrumbs container"><ol>
{crumb_items}
</ol></nav>
<header class="content-hero"><div class="container">
<p class="eyebrow">{eyebrow}</p>
<h1>{h1}</h1>
<p class="content-lead">{description}</p>
{_byline(updated, version)}
{_nav()}
</div></header>
<section class="section"><div class="container article-layout">
<article class="article-main simple-card privacy-card" data-policy-version="{_esc(version)}">
{_version_banner(version, historical=historical)}
{body}
</article>
</div></section>
"""
    return page_shell(
        title=f"{title} | CONFENGE",
        description=description,
        canonical_path=path,
        robots="index,follow,max-snippet:-1",
        jsonld_graph=[ORG_JSONLD, PERSON_JSONLD, breadcrumb_jsonld(crumbs), webpage],
        body_main=main,
        wa_message="Olá, Tiago. Quero pedir uma correção ou esclarecer a governança editorial da CONFENGE.",
        author_name="Engº Tiago Sasaki",
        data_attrs={"surface-type": "policy", "policy-version": version},
    )


def _write(rel: str, html_doc: str) -> Path:
    dest = ROOT / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(html_doc, encoding="utf-8")
    return dest


def _historico_body(policy: dict) -> str:
    rows = []
    for entry in policy.get("changelog") or []:
        ver = entry.get("version") or ""
        href = entry.get("archive_path") or f"/politica-editorial/v/{ver}/"
        rows.append(
            "<li>"
            f'<a href="{_esc(href)}">Versão {_esc(ver)}</a>'
            f" · vigente em {_esc(entry.get('effective_at') or '')}. "
            f"{escape_prose_with_opaque_tokens(entry.get('summary') or '')}"
            "</li>"
        )
    return (
        "<h2 id=\"changelog\">Changelog</h2>"
        "<p>Mudança de política gera versão nova. O histórico abaixo não é reescrito em silêncio.</p>"
        f"<ol>{''.join(rows)}</ol>"
        f"<p>Versão vigente: <strong>{_esc(current_policy_version(policy))}</strong>. "
        "Prazo de correção: UNKNOWN.</p>"
    )


def _archive_body(entry: dict, version_rec: dict) -> str:
    parts = [
        f"<p><strong>Resumo desta versão:</strong> {_esc(entry.get('summary') or '')}</p>",
        f"<p>Prazo então registrado: {_esc(version_rec.get('prazo_then') or version_rec.get('prazo') or 'UNKNOWN')}.</p>",
    ]
    pages = version_rec.get("pages") or {}
    for key in ("editorial", "corrections", "ai_use", "conflicts"):
        spec = pages.get(key) or {}
        title = spec.get("title") or key
        parts.append(f"<h2>{_esc(title)}</h2>")
        parts.append(spec.get("body") or "")
    return "\n".join(parts)


def render_analysis_hub() -> Path:
    """Do not overwrite the consume hub. Residual slots live in contract_analysis.render."""
    dest = ROOT / "analises-contratos-publicos" / "index.html"
    if not dest.is_file():
        raise FileNotFoundError(
            "analysis hub is owned by scripts.contract_analysis.render; "
            "run python3 -m scripts.contract_analysis build"
        )
    return dest


def render_all() -> list[Path]:
    write_sealed_editorial_policy()
    policy = load_editorial_policy()
    gov = load_governance()
    version = current_policy_version(policy)
    updated = str(policy.get("effective_at") or "")
    current_pages = ((policy.get("versions") or {}).get(version) or {}).get("pages") or {}
    owner_email = (gov.get("correction") or {}).get("owner_email") or "tiago.sasaki@confenge.com.br"
    written: list[Path] = []

    for key, spec in current_pages.items():
        slug = spec.get("slug")
        if not slug:
            continue
        body = spec.get("body") or ""
        title = spec.get("title") or slug
        description = spec.get("description") or ""
        h1 = spec.get("h1") or spec.get("title") or slug
        eyebrow = spec.get("eyebrow") or "Governança"
        crumb_label = h1
        page_updated = updated
        if key == "corrections":
            body = body + _correction_form(version, owner_email)
        if key == "conflicts":
            conflict = load_conflict_contract()
            copy = conflict.get("public_copy") or {}
            title = str(copy.get("title") or title)
            description = str(copy.get("description") or description)
            h1 = str(copy.get("h1") or h1)
            eyebrow = str(copy.get("eyebrow") or eyebrow)
            crumb_label = h1
            body = body.replace("Owner: Engº Tiago Sasaki", "Responsável: Engº Tiago Sasaki")
            written.append(_write("conflitos/conflict-gate.js", client_runtime_js(conflict)))
            body = (
                body
                + public_policy_body(conflict)
                + first_step_form_html(conflict)
                + '<script src="/conflitos/conflict-gate.js" defer=""></script>\n'
            )
        html_doc = _page(
            path=f"/{slug}/",
            title=title,
            description=description,
            h1=h1,
            eyebrow=eyebrow,
            crumbs=[("Início", "/"), (crumb_label, None)],
            body=body,
            updated=page_updated,
            version=version,
        )
        written.append(_write(f"{slug}/index.html", html_doc))

    historico = _page(
        path="/politica-editorial/historico/",
        title="Histórico da política editorial",
        description="Changelog das políticas públicas da CONFENGE. Versões anteriores permanecem legíveis.",
        h1="Histórico da política editorial",
        eyebrow="Governança",
        crumbs=[
            ("Início", "/"),
            ("Política editorial", "/politica-editorial/"),
            ("Histórico", None),
        ],
        body=_historico_body(policy),
        updated=updated,
        version=version,
    )
    written.append(_write("politica-editorial/historico/index.html", historico))

    for entry in policy.get("changelog") or []:
        ver = str(entry.get("version") or "")
        if not ver or ver == version:
            continue
        version_rec = (policy.get("versions") or {}).get(ver) or {}
        archive = _page(
            path=f"/politica-editorial/v/{ver}/",
            title=f"Política editorial {ver} (histórica)",
            description=entry.get("summary") or f"Versão histórica {ver} da política editorial CONFENGE.",
            h1=f"Política editorial {ver}",
            eyebrow="Arquivo",
            crumbs=[
                ("Início", "/"),
                ("Política editorial", "/politica-editorial/"),
                (f"Versão {ver}", None),
            ],
            body=_archive_body(entry, version_rec),
            updated=str(entry.get("effective_at") or updated),
            version=ver,
            historical=True,
        )
        written.append(_write(f"politica-editorial/v/{ver}/index.html", archive))
    return written


if __name__ == "__main__":
    written = render_all()
    for p in written:
        print("wrote", p.relative_to(ROOT))
