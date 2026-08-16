/**
 * Self-contained Market Answer → X-Ray journey markup.
 * No lead gate on the public answer. CNPJ never goes in the URL.
 */
const { journeyCopy } = require("./copy.cjs");
const { loadFlag } = require("./flag.cjs");
const { firstCanary } = require("./matrix.cjs");
const MARKET = require("../../data/conversion/fixtures/market-answer-canary.v1.json");

function renderJourney({ flagEnabled, marketAnswer } = {}) {
  const copy = journeyCopy();
  const flag = loadFlag();
  const enabled = flagEnabled == null ? flag.enabled : Boolean(flagEnabled);
  const answer = marketAnswer || MARKET;
  const canary = firstCanary();

  return `<section class="conversion-journey" data-conversion-canary="1" data-flag="${enabled ? "on" : "off"}" data-asset-family="market_answer" data-market-answer-id="${canary.market_answer_id}">
  <article class="market-answer" aria-labelledby="ma-question">
    <p class="eyebrow">Resposta de mercado · fixture</p>
    <h1 id="ma-question">${escapeHtml(answer.question)}</h1>
    <p class="content-lead" data-answer-visible="true">${escapeHtml(answer.answer.headline)}</p>
    <dl class="stage-meta">
      <dt>Mediana (valor integral nominal)</dt><dd>${formatBrl(answer.answer.median_brl)}</dd>
      <dt>P25 / P75</dt><dd>${formatBrl(answer.answer.p25_brl)} / ${formatBrl(answer.answer.p75_brl)}</dd>
      <dt>Amostra</dt><dd>n=${answer.answer.n} · ${escapeHtml(answer.answer.period)}</dd>
      <dt>Unidade</dt><dd>${escapeHtml(answer.answer.unit)}. ${escapeHtml(answer.answer.not_unit)}</dd>
    </dl>
    <p class="tool-field-hint" data-fixture-label="true">${escapeHtml(copy.fixture_label)}</p>
    <section aria-labelledby="ma-method">
      <h2 id="ma-method">Metodo e limites</h2>
      <p>${escapeHtml(answer.method)}</p>
      <p>${escapeHtml(copy.method_limits)}</p>
    </section>
  </article>

  <section class="conversion-cta" aria-labelledby="xray-heading" ${enabled ? "" : "hidden"}>
    <h2 id="xray-heading">${escapeHtml(copy.primary_cta)}</h2>
    <p>${escapeHtml(copy.what_happens_next)}</p>
    <form id="xray-form" class="tool-form" method="post" action="/.netlify/functions/market-answer-intake" data-no-url-cnpj="true">
      <input type="hidden" name="action" value="xray" />
      <input type="hidden" name="market_answer_id" value="${canary.market_answer_id}" />
      <input type="hidden" name="intent" value="ver_propria_empresa" />
      <input type="hidden" name="cta" value="${escapeHtml(copy.primary_cta)}" />
      <div class="tool-field">
        <label for="cnpj">CNPJ da empresa</label>
        <input id="cnpj" name="cnpj" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="18" aria-describedby="cnpj-why cnpj-what" />
        <p id="cnpj-why" class="tool-field-hint">${escapeHtml(copy.why_cnpj)}</p>
        <p id="cnpj-what" class="tool-field-hint">${escapeHtml(copy.what_will_be_shown)}</p>
      </div>
      <div class="tool-actions">
        <button id="xray-submit" class="button button-primary" type="submit">${escapeHtml(copy.primary_cta)}</button>
      </div>
      <p class="form-status" id="xray-status" role="status" hidden></p>
    </form>
    <p>${escapeHtml(copy.privacy)}</p>
  </section>

  <section id="xray-result" hidden aria-live="polite"></section>

  <section id="next-actions" hidden aria-labelledby="next-heading">
    <h2 id="next-heading">Proximos passos</h2>
    <ul>
      <li><button type="button" id="action-explore" class="button">${"Explorar contratos observados"}</button></li>
      <li><button type="button" id="action-second-reading" class="button">${"Peca uma segunda leitura de contrato"}</button></li>
      <li><a id="action-specialist" class="button" href="https://wa.me/5548988344559?text=${encodeURIComponent("Ola, Tiago. Vi a resposta de pavimentacao e quero falar sobre a carteira publica da empresa. Sem prazo prometido.")}">Falar com especialista</a></li>
      <li><button type="button" id="action-none" class="button">Nenhuma acao agora</button></li>
    </ul>
  </section>

  <form id="handraise-form" class="tool-form" method="post" action="/.netlify/functions/market-answer-intake" hidden>
    <input type="hidden" name="action" value="handraise" />
    <h2>Segunda leitura</h2>
    <p>${escapeHtml(copy.responder)}</p>
    <div class="tool-field">
      <label for="nome">Nome</label>
      <input id="nome" name="nome" type="text" autocomplete="name" />
    </div>
    <div class="tool-field">
      <label for="email">E-mail</label>
      <input id="email" name="email" type="email" autocomplete="email" />
    </div>
    <div class="tool-field">
      <label for="telefone">WhatsApp</label>
      <input id="telefone" name="telefone" type="tel" autocomplete="tel" />
    </div>
    <div class="tool-field">
      <label for="estagio">O que voce precisa</label>
      <select id="estagio" name="estagio">
        <option value="">Selecione</option>
        <option value="segunda leitura de contrato">Segunda leitura de contrato</option>
      </select>
    </div>
    <div class="tool-field">
      <label for="consentimento">
        <input id="consentimento" name="consentimento" type="checkbox" value="true" />
        Autorizo o uso destes dados para retorno sobre a leitura pedida. Sem envio automatico.
      </label>
    </div>
    <button id="handraise-submit" class="button button-primary" type="submit">Pedir segunda leitura</button>
    <p class="form-status" id="handraise-status" role="status" hidden></p>
  </form>
</section>`;
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBrl(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "UNKNOWN";
  return `R$ ${v.toLocaleString("pt-BR")}`;
}

function keyboardStructure(html) {
  const src = String(html || "");
  return {
    has_cnpj_label: /<label for="cnpj">/.test(src),
    has_cnpj_input: /id="cnpj"/.test(src),
    describedby_why: /aria-describedby="cnpj-why cnpj-what"/.test(src),
    primary_cta: src.includes("Veja sua empresa neste mercado"),
    submit_is_button: /id="xray-submit"[^>]*type="submit"/.test(src),
    no_positive_tabindex: !/tabindex="[1-9]/.test(src),
    answer_visible: /data-answer-visible="true"/.test(src),
    no_lead_on_xray: !/#xray-form[\s\S]*name="nome"/.test(src.split("id=\"handraise-form\"")[0] || src),
    handraise_hidden: /id="handraise-form"[^>]*hidden/.test(src),
    specialist_is_link: /id="action-specialist"/.test(src),
  };
}

function renderPage({ flagEnabled } = {}) {
  const inner = renderJourney({ flagEnabled });
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Resposta de mercado (canario) | CONFENGE</title>
<meta name="robots" content="noindex,nofollow"/>
<meta name="description" content="Canario noindex: resposta de mercado fixture e X-Ray por CNPJ. Nao e catalogo vivo."/>
<link rel="canonical" href="https://confenge.com.br/piloto/conversao-xray/"/>
<link rel="stylesheet" href="/styles.css"/>
<link rel="stylesheet" href="/styles-tools.css"/>
</head>
<body data-route-family="market-answer-xray" data-asset-id="ma-pavimentacao-valor-tipico-v0">
<a class="skip-link" href="#conteudo">Ir ao conteudo</a>
<main id="conteudo" class="container tool-shell">
${inner}
</main>
<script src="/assets/js/conversion-journey.js" defer></script>
</body>
</html>`;
}

module.exports = {
  renderJourney,
  renderPage,
  keyboardStructure,
  escapeHtml,
};
