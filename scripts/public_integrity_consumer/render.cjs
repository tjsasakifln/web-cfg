"use strict";

const { ASSET } = require("./constants.cjs");
const copyMod = require("./copy.cjs");

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function robotsMeta(kind) {
  if (kind === "result") return "noindex,nofollow,noarchive";
  return "noindex,nofollow,noarchive";
}

function shell({ title, description, canonical, robots, body, extraHead = "" }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}"/>
<meta name="robots" content="${esc(robots)}"/>
<meta name="googlebot" content="${esc(robots)}"/>
<link rel="canonical" href="${esc(canonical)}"/>
<link rel="stylesheet" href="/styles.css"/>
<link rel="stylesheet" href="/styles-tools.css"/>
<meta http-equiv="Cache-Control" content="no-store"/>
${extraHead}
</head>
<body data-asset-family="${esc(ASSET.asset_family)}" data-asset-id="${esc(ASSET.asset_id)}" data-asset-version="${esc(ASSET.asset_version)}" data-source="${esc(ASSET.source)}">
<a class="skip-link" href="#conteudo">Ir ao conteudo</a>
<header class="site-header" id="inicio">
<div class="container header-inner">
<a aria-label="CONFENGE, pagina inicial" class="brand" href="/"><img alt="CONFENGE Inteligencia Tecnica" height="208" src="/assets/logo-confenge.png" width="800"/></a>
<nav aria-label="Navegacao principal" class="desktop-nav">
<a href="/#ofertas">Servicos</a>
<a href="/#jornadas">Problemas que resolvemos</a>
<a href="/conteudos/">Conteudos e ferramentas</a>
<a href="/especialista/tiago-jun-sasaki/">Especialista</a>
</nav>
<a class="button button-primary header-cta" href="/#contato">Analisar meu caso</a>
<button aria-controls="mobile-menu" aria-expanded="false" aria-label="Abrir menu" class="menu-toggle" type="button">
<span>Menu</span>
</button>
</div>
<nav aria-label="Navegacao movel" class="mobile-nav" id="mobile-menu">
<a href="/#ofertas">Servicos</a>
<a href="/#jornadas">Problemas que resolvemos</a>
<a href="/conteudos/">Conteudos e ferramentas</a>
<a href="/especialista/tiago-jun-sasaki/">Especialista</a>
<a class="button button-primary" href="/#contato">Analisar meu caso</a>
</nav>
</header>
<main id="conteudo">
${body}
</main>
</body>
</html>
`;
}

function landingHtml({ flagOn = false } = {}) {
  const c = copyMod.journeyCopy();
  const body = `
<nav class="breadcrumbs container" aria-label="breadcrumb"><ol>
<li><a href="/">Inicio</a></li>
<li aria-current="page">Consulta preliminar CEIS e CNEP</li>
</ol></nav>
<header class="tool-page-hero"><div class="container tool-shell">
<p class="eyebrow">${esc(c.eyebrow)}</p>
<h1>${esc(c.title)}</h1>
<p class="content-lead">${esc(c.lead)}</p>
<p class="authority-byline">${esc(c.author_line)} Referencia de metodo: contrato ${esc("public-read-integrity/1.0")}. <a href="${esc(ASSET.correction_path)}">Como corrigir</a></p>
</div></header>
<div class="container tool-shell">
<section aria-labelledby="o-que-e">
<h2 id="o-que-e">O que esta consulta faz</h2>
<p>${esc(c.preliminary)}</p>
<p>${esc(c.sources_covered)}</p>
<p>${esc(c.absence_not_general)}</p>
<p>${esc(c.unavailability_visible)}</p>
</section>
<section class="authority-method" id="metodo" aria-labelledby="metodo-title">
<h2 id="metodo-title">Metodo e limites</h2>
<p>${esc(c.method)}</p>
<ul>${c.limitations.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
<p>${esc(c.correction)}</p>
</section>
<section aria-labelledby="consulta-title">
<h2 id="consulta-title">Consultar CNPJ</h2>
<p>${esc(c.why_cnpj)}</p>
<p>${esc(c.what_will_be_shown)}</p>
<p>${esc(c.privacy)}</p>
<p>${esc(flagOn ? c.fixture_note : c.flag_off_note)}</p>
<form id="integrity-form" class="tool-form" method="post" action="${esc(ASSET.intake_path)}" data-no-url-cnpj="true" data-flag="${flagOn ? "on" : "off"}">
<input type="hidden" name="action" value="consult"/>
<input type="hidden" name="asset_family" value="${esc(ASSET.asset_family)}"/>
<input type="hidden" name="asset_id" value="${esc(ASSET.asset_id)}"/>
<input type="hidden" name="cta_id" value="${esc(ASSET.cta_id)}"/>
<div class="tool-field">
<label for="cnpj">CNPJ da empresa consultada</label>
<input id="cnpj" name="cnpj" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="18" aria-describedby="cnpj-why cnpj-what" required/>
<p id="cnpj-why" class="tool-field-hint">${esc(c.why_cnpj)}</p>
<p id="cnpj-what" class="tool-field-hint">${esc(c.what_will_be_shown)}</p>
</div>
<div class="tool-field" hidden>
<label for="empresa-site">Nao preencha</label>
<input id="empresa-site" name="empresa-site" type="text" tabindex="-1" autocomplete="off"/>
</div>
<div class="tool-actions">
<button id="integrity-submit" class="button button-primary" type="submit"${flagOn ? "" : ""}>Consultar ocorrencias publicas</button>
</div>
<p class="form-status" id="integrity-status" role="status" aria-live="polite"></p>
</form>
</section>
</div>
<script>
(function () {
  var form = document.getElementById("integrity-form");
  if (!form) return;
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var input = document.getElementById("cnpj");
    var status = document.getElementById("integrity-status");
    var fd = new FormData(form);
    var body = {};
    fd.forEach(function (v, k) { body[k] = v; });
    status.hidden = false;
    status.textContent = "Enviando consulta privada...";
    fetch(form.getAttribute("action"), {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      referrerPolicy: "no-referrer"
    }).then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (pack) {
        var loc = pack.res.headers.get("Location") || (pack.data && pack.data.result_url);
        if (loc) {
          window.location.replace(loc);
          return;
        }
        status.textContent = (pack.data && pack.data.message) || "Nao foi possivel concluir a leitura.";
      })
      .catch(function () {
        status.textContent = "Nao foi possivel concluir a leitura.";
      });
    if (input) input.value = "";
  });
})();
</script>
`;
  return shell({
    title: `${c.title} | CONFENGE`,
    description: c.lead,
    canonical: `https://confenge.com.br${ASSET.landing_path}`,
    robots: robotsMeta("landing"),
    body,
  });
}

function pageDisplay(value) {
  if (value === "UNKNOWN" || value === undefined || value === null) return "UNKNOWN";
  return String(value);
}

function sourceCardHtml(source, labels) {
  const records = source.records || [];
  const recHtml = records.length
    ? `<ul>${records.map((rec) => `
<li>
<p><strong>${esc(rec.record_type)}</strong> (${esc(rec.source_id)})</p>
<p>Identificador oficial: ${esc(rec.official_id)}</p>
<p>Autoridade: ${esc(rec.authority)}</p>
<p>Status observado: ${esc(rec.observed_status)}</p>
<p>Inicio: ${esc(pageDisplay(rec.start_date))} · Fim: ${esc(pageDisplay(rec.end_date))}</p>
<p>Instante de captura: ${esc(pageDisplay(rec.captured_at))}</p>
${rec.source_url ? `<p><a href="${esc(rec.source_url)}" rel="nofollow noopener">Fonte oficial</a></p>` : ""}
</li>`).join("")}</ul>`
    : "<p>Nenhuma ocorrencia observada nesta fonte neste envelope.</p>";
  return `
<article class="source-card" data-source-id="${esc(source.source_id)}" data-source-status="${esc(source.status)}">
<h3>${esc(source.source_id)}</h3>
<p>Estado: ${esc(labels[source.status] || source.status)}</p>
<p>Autoridade: ${esc(source.authority)}</p>
<p>Cobertura completa: ${esc(pageDisplay(source.coverage_complete))}</p>
<p>Paginas: esperadas ${esc(pageDisplay(source.pages_expected))}, obtidas ${esc(pageDisplay(source.pages_fetched))}</p>
<p>Instante (as_of): <time>${esc(pageDisplay(source.as_of))}</time></p>
<p>Reason codes: ${esc((source.reason_codes || []).join(", ") || "nenhum")}</p>
${source.official_url ? `<p><a href="${esc(source.official_url)}" rel="nofollow noopener">Pagina oficial da fonte</a></p>` : ""}
${recHtml}
</article>`;
}

function resultHtml(view, { token } = {}) {
  const c = copyMod.journeyCopy();
  const labels = c.state_labels;
  const state = (view && view.aggregate_state) || "UNKNOWN";
  const sources = (view && view.sources) || [];
  const body = `
<nav class="breadcrumbs container" aria-label="breadcrumb"><ol>
<li><a href="/">Inicio</a></li>
<li><a href="${esc(ASSET.landing_path)}">Consulta preliminar CEIS e CNEP</a></li>
<li aria-current="page">Resultado</li>
</ol></nav>
<div class="container tool-shell">
<header>
<p class="eyebrow">Resultado individual · noindex</p>
<h1>Resultado da consulta preliminar</h1>
<p class="content-lead" data-aggregate-state="${esc(state)}">${esc(labels[state] || state)}</p>
<p>Cobertura agregada: ${esc((view && view.coverage_class) || "unknown")}</p>
<p>Instante (as_of): <time datetime="${esc(pageDisplay(view && view.as_of))}">${esc(pageDisplay(view && view.as_of))}</time></p>
<p>Verificado em: ${esc(pageDisplay(view && view.checked_at))}</p>
<p>Freshness: ${esc(pageDisplay(view && view.freshness && view.freshness.status))} (current=${esc(view && view.freshness && view.freshness.is_current)})</p>
<p>${esc(c.author_line)}</p>
</header>
<section aria-labelledby="fontes-title">
<h2 id="fontes-title">Fontes consultadas</h2>
${sources.map((source) => sourceCardHtml(source, labels)).join("")}
</section>
<section id="metodo" aria-labelledby="metodo-res">
<h2 id="metodo-res">Metodo e limites</h2>
<p>${esc((view && view.method) || c.method)}</p>
<ul>${((view && view.limitations) || c.limitations).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
<p><a href="${esc((view && view.correction_route) || ASSET.correction_path)}">Como corrigir um fato publicado</a></p>
</section>
<section aria-labelledby="proxima">
<h2 id="proxima">Proxima acao humana</h2>
<p>${esc((view && view.next_action) || c.next_action_unknown)}</p>
<p><a class="button button-primary" data-cta-id="${esc(ASSET.cta_id)}" data-cta-version="${esc(ASSET.cta_version)}" data-destination-service-id="${esc(ASSET.destination_service_id)}" href="${esc(c.cta.href)}">${esc(c.cta.label)}</a></p>
</section>
${token ? `<p class="tool-field-hint">Referencia opaca da consulta (nao e CNPJ): ${esc(token)}</p>` : ""}
</div>
`;
  return shell({
    title: "Resultado da consulta preliminar | CONFENGE",
    description: "Resultado individual da consulta preliminar CEIS e CNEP. Pagina privada, fora de indice.",
    canonical: `https://confenge.com.br${ASSET.result_path}`,
    robots: robotsMeta("result"),
    body,
  });
}

module.exports = {
  landingHtml,
  resultHtml,
  shell,
  esc,
};
