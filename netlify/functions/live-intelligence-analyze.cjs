/**
 * Live-intelligence company analysis — CONFENGE.
 *
 * Contract:
 * 1) Accept `{ cnpj }`; validate server-side. The CNPJ never leaves this request:
 *    it is not logged, not echoed, not persisted and not put in a URL.
 * 2) Look the company up by the consumer-side digest of the CNPJ.
 * 3) Fail closed. Missing dataset, stale dataset, or no match on a valid CNPJ all
 *    return an explicit "sem dados suficientes" result. A profile is never invented.
 * 4) Return the RESULT itself before any contact form, plus an opaque analysis_id
 *    that is random, never derived from the CNPJ.
 * 5) Persist exactly one thing: the public result record that backs the shareable
 *    /analise-cnpj/r/ page, written through lib/live-intelligence-result-store.cjs
 *    into its own namespace by an allowlist projection. That record holds no CNPJ,
 *    no digest and nothing from the lead flow, and there is no stored mapping from
 *    its token back to the CNPJ. No lead flow, no outbound call, nothing else
 *    written.
 */
const {
  parseBody,
  originAllowed,
  corsHeaders,
  publicErrorBody,
  safeLog,
} = require("./lib/lead-core.cjs");
const { rateLimit } = require("./lib/lead-rate-limit.cjs");
const { clientIp, technicalFingerprint } = require("./lib/lead-core.cjs");
const {
  validateCnpj,
  hashCnpj,
  assertNoCnpjInUrl,
} = require("../../scripts/conversion/cnpj.cjs");
const resultStore = require("./lib/live-intelligence-result-store.cjs");

const RESULT_ROUTE_PREFIX = resultStore.RESULT_ROUTE_PREFIX;
const MAX_AGE_HOURS = 48;

// Fixed epistemic boundary. It is a constant, not a computed sentence, so no
// code path can soften it for a company that happens to look like a good fit.
const DISCLAIMER_PT =
  "Aderência histórica não é habilitação, capacidade nem recomendação. " +
  "Os dados descrevem o histórico público declarado nas fontes citadas e " +
  "podem estar incompletos.";

// --- reader-facing vocabulary ----------------------------------------------
//
// `UNKNOWN`, `test_only_fixture` and friends are contract vocabulary. They stay
// untouched in the stored/returned JSON — only the rendered copy translates
// them, and the translation never adds certainty: a field nobody published says
// exactly that, it never says zero.
const NAO_INFORMADO = "não informado pela fonte";

// The single epistemic-boundary sentence for this surface. It is byte-identical
// in analise-cnpj/index.html and analise-cnpj/r/index.html, which are what the
// client-rendered path shows — the same page used to state this caveat twice in
// two different wordings (finding 13 of
// docs/seo/LIVE-INTELLIGENCE-ARCHETYPE-FINDINGS.md).
const NAO_INFORMADO_NOTA =
  "Quando um campo aparece como não informado pela fonte, o dado não foi " +
  "publicado pelas fontes consultadas. Isso não vale zero e não vale ausência " +
  "de histórico.";

// `source_kind`/`producer_status` as reader copy. An unmapped member falls back
// to a PT-BR phrase, never to the raw token: echoing the constant is exactly
// the leak this map exists to close.
const SOURCE_KIND_PT = {
  official_live: "fonte pública oficial",
  test_only_fixture: "dado de teste, não corresponde a um histórico real",
  fixture: "dado de teste, não corresponde a um histórico real",
};

function fonteKindPt(value) {
  const key = String(value == null ? "" : value).trim();
  if (!key) return NAO_INFORMADO;
  return SOURCE_KIND_PT[key] || "origem não classificada";
}

const RESULT_STATES = Object.freeze({
  MATCH: "PERFIL_ENCONTRADO",
  NO_MATCH: "SEM_DADOS_SUFICIENTES",
  DATASET_ABSENT: "SEM_DADOS_SUFICIENTES",
  DATASET_STALE: "SEM_DADOS_SUFICIENTES",
});

// A broken or missing projection makes every lookup fail closed. This mirrors
// the deliverables-registry load in lead-core.cjs: a fail-open default here
// would mean answering a visitor from nothing.
let DATASET = null;
let DATASET_LOAD_ERROR = "";
try {
  // eslint-disable-next-line global-require
  DATASET = require("../../data/live_intelligence/live/companies.json");
} catch (err) {
  DATASET = null;
  DATASET_LOAD_ERROR = "dataset_absent";
}

// Swapping the dataset swaps the input of a fail-closed decision, so the hook
// is inert outside tests. A caller that can require this module must not be
// able to change what a visitor is told about a company.
function _setDatasetForTests(next) {
  if (process.env.NODE_ENV !== "test") return;
  DATASET = next;
  DATASET_LOAD_ERROR = next ? "" : "dataset_absent";
}

function parseInstant(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Freshness is the producer's declared window, never the wall clock: the
 * dataset says when it was cut and when it was exported.
 */
function datasetFreshness(dataset) {
  if (!dataset || typeof dataset !== "object") return { ok: false, reason: "dataset_absent" };
  if (!dataset.companies || typeof dataset.companies !== "object") {
    return { ok: false, reason: "dataset_absent" };
  }
  const sourceAsOf = parseInstant(dataset.source_as_of);
  const generatedAt = parseInstant(dataset.generated_at);
  if (sourceAsOf === null || generatedAt === null) {
    return { ok: false, reason: "freshness_absent" };
  }
  const ageHours = (generatedAt - sourceAsOf) / 3600000;
  if (ageHours < 0 || ageHours > MAX_AGE_HOURS) {
    return { ok: false, reason: "freshness_stale" };
  }
  return { ok: true, reason: "" };
}

/**
 * Opaque, random, never CNPJ-derived. Minted by the result store, which owns
 * both the identifier and the route it resolves at, so the token that addresses
 * a stored result and the token that travels with a lead can never diverge.
 */
const newAnalysisId = resultStore.newResultToken;
const resultRoute = resultStore.resultRoute;

function insufficientResult(analysisId, reason, establishmentDigest = null) {
  const result = {
    ok: true,
    analysis_id: analysisId,
    result_path: resultRoute(analysisId),
    state: RESULT_STATES.NO_MATCH,
    reason,
    titulo: "Sem dados suficientes para este CNPJ",
    explicacao:
      "Não há histórico público suficiente nas fontes consultadas para descrever o " +
      "perfil contratual deste CNPJ. Ausência de dados não é ausência de histórico.",
    perfil: null,
    categorias: [],
    faixas: [],
    geografias: [],
    compradores: [],
    oportunidades_aderentes: [],
    dimensoes_da_aderencia: [],
    gaps: [],
    unknowns: [],
    limitations: [
      "As fontes consultadas não retornaram contratos públicos para este CNPJ.",
      "Um CNPJ sem histórico nas fontes pode ter histórico em fontes não consultadas.",
    ],
    as_of: null,
    fonte_kind: null,
    disclaimer: DISCLAIMER_PT,
  };
  // Private field: server-side only, never exposed to client
  if (establishmentDigest) {
    result._establishment_digest = establishmentDigest;
  }
  return result;
}

function matchResult(analysisId, profile, establishmentDigest = null) {
  const dimensoes = new Set();
  for (const row of profile.oportunidades_aderentes || []) {
    for (const dim of row.dimensoes || []) dimensoes.add(dim);
  }
  const result = {
    ok: true,
    analysis_id: analysisId,
    result_path: resultRoute(analysisId),
    state: RESULT_STATES.MATCH,
    reason: "",
    titulo: "Perfil contratual público",
    // The "not published is not zero" caveat lives once per page, in the
    // epistemic-boundary section, not here as well: this sentence and that one
    // used to say the same thing in different words on the same render.
    explicacao:
      "O perfil abaixo descreve o histórico público declarado nas fontes citadas.",
    perfil: profile.perfil || null,
    categorias: profile.categorias || [],
    faixas: profile.faixas || [],
    geografias: profile.geografias || [],
    compradores: profile.compradores || [],
    oportunidades_aderentes: profile.oportunidades_aderentes || [],
    dimensoes_da_aderencia: [...dimensoes],
    gaps: profile.gaps || [],
    unknowns: profile.unknowns || [],
    limitations: profile.limitations || [],
    as_of: profile.as_of || null,
    fonte_kind: profile.source_kind || null,
    disclaimer: DISCLAIMER_PT,
  };
  // Private field: server-side only, never exposed to client
  if (establishmentDigest) {
    result._establishment_digest = establishmentDigest;
  }
  return result;
}

/** Pure lookup, exported so tests drive the real decision, not a reimplementation. */
function analyze(cnpjRaw, dataset = DATASET) {
  const check = validateCnpj(cnpjRaw);
  if (!check.ok) {
    return { ok: false, status: 422, error: check.error, message: check.message };
  }
  const analysisId = newAnalysisId();
  const urlCheck = assertNoCnpjInUrl(resultRoute(analysisId), check.cnpj);
  if (!urlCheck.ok) {
    // Unreachable by construction; a random token cannot contain the CNPJ. The
    // guard stays so a future token scheme cannot quietly leak one.
    return { ok: false, status: 500, error: "route_unsafe", message: "Não foi possível gerar o resultado." };
  }
  const fresh = datasetFreshness(dataset);
  if (!fresh.ok) {
    return insufficientResult(analysisId, fresh.reason);
  }
  const digest = hashCnpj(check.cnpj);
  // establishmentDigest is stored privately and used server-side for identity
  // resolution. It is never exposed to the client.
  const establishmentDigest = digest;
  const profile = dataset.companies[digest];
  if (!profile || typeof profile !== "object") {
    return insufficientResult(analysisId, "no_match", establishmentDigest);
  }
  return matchResult(analysisId, profile, establishmentDigest);
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Every interpolated value goes through this. No exceptions, no raw HTML. */
function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

function pageHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    // The result surface is never indexable: it is a per-visitor projection
    // behind an unguessable token, not a public document.
    "X-Robots-Tag": "noindex, nofollow",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
  };
}

function listBlock(heading, values) {
  const rows = (values || []).filter((value) => String(value || "").trim());
  if (!rows.length) return "";
  return `<h3>${esc(heading)}</h3><ul>${rows.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>`;
}

/**
 * Render a stored result as a standalone page.
 *
 * The token is in the address bar; the CNPJ is not, was never stored and is not
 * available to this function. There is nothing here to leak.
 */
function renderResultPage(result) {
  const perfil = result.perfil && typeof result.perfil === "object" ? result.perfil : null;
  const perfilRows = perfil
    ? `<dl>${Object.keys(perfil)
        .map((key) => {
          const raw = perfil[key];
          const shown = raw === null || raw === "" ? NAO_INFORMADO : raw;
          return `<dt>${esc(key.replace(/_/g, " "))}</dt><dd>${esc(shown)}</dd>`;
        })
        .join("")}</dl>`
    : "";
  const aderentes = (result.oportunidades_aderentes || []).filter(
    (row) => row && String(row.opportunity_id || "").trim(),
  );
  const aderentesHtml = aderentes.length
    ? `<h3>Oportunidades aderentes</h3><ul>${aderentes
        .map((row) => {
          const id = String(row.opportunity_id);
          const dims = (row.dimensoes || []).join(", ") || NAO_INFORMADO;
          const href = `/oportunidades/${id.split("/").map(encodeURIComponent).join("/")}/`;
          return `<li><a href="${esc(href)}">${esc(id)}</a> — dimensões: ${esc(dims)}</li>`;
        })
        .join("")}</ul>`
    : "";
  const limitations = (result.limitations || []).filter((v) => String(v || "").trim());
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1" name="viewport"/>
<meta content="noindex,nofollow" name="robots"/>
<meta content="same-origin" name="referrer"/>
<meta content="#061a33" name="theme-color"/>
<title>${esc(result.titulo || "Resultado da análise")} | CONFENGE</title>
<link href="/assets/favicon-32.png" rel="icon" sizes="32x32" type="image/png"/>
<link href="/styles.css" rel="stylesheet"/>
<script defer="" src="/script.js?v=fortune02"></script>
<script defer="" src="/assets/js/live-intelligence.js"></script>
</head>
<body class="simple-page" data-asset-id="analise-cnpj-resultado" data-asset-family="analise-perfil-contratual" data-route-family="live-company-analysis" data-intel-surface="company" data-index-state="NOINDEX" data-analysis-id="${esc(result.analysis_id || "")}">
<main class="simple-main" id="conteudo">
<article class="simple-card">
<section class="section">
<p class="eyebrow">Perfil contratual público</p>
<h1>${esc(result.titulo || "Resultado da análise")}</h1>
<p>${esc(result.explicacao || "")}</p>
</section>
<section class="section">
${perfilRows}
${listBlock("Categorias declaradas", result.categorias)}
${listBlock("Faixas de valor declaradas", result.faixas)}
${listBlock("Geografias declaradas", result.geografias)}
${listBlock("Compradores declarados", result.compradores)}
${listBlock("Dimensões da aderência", result.dimensoes_da_aderencia)}
${listBlock("Lacunas declaradas", result.gaps)}
${listBlock("O que as fontes não informaram", result.unknowns)}
${aderentesHtml}
</section>
${limitations.length ? `<section class="section"><h2>Limitações declaradas</h2><ul>${limitations.map((v) => `<li>${esc(v)}</li>`).join("")}</ul></section>` : ""}
<section class="section">
<h2>O que esta análise não afirma</h2>
<p>${esc(result.disclaimer || DISCLAIMER_PT)}</p>
<p>${esc(NAO_INFORMADO_NOTA)}</p>
${result.as_of ? `<p class="form-note">Dados declarados até ${esc(result.as_of)}.</p>` : ""}
</section>
<section class="section" id="hashes" data-section-archetype="provenance_hashes">
<h2>Procedência técnica</h2>
<dl>
<dt>Identificador estável</dt><dd>${esc(result.analysis_id || NAO_INFORMADO)}</dd>
<dt>Origem dos dados</dt><dd>${esc(fonteKindPt(result.fonte_kind))}</dd>
<dt>Elegível a indexação</dt><dd>não</dd>
</dl>
</section>
<section class="section" id="proximo-passo" data-section-archetype="contextual_next_action">
<h2>Próximo passo</h2>
<p>Este endereço é o resultado desta análise. Ele pode ser guardado ou compartilhado: o CNPJ consultado não aparece nele e não foi gravado.</p>
<div class="journey-next">
<button class="button button-primary" type="button" data-intel-cta="request" data-intent-kind="MONITOR_COMPANY" data-cta-id="intel_monitor_company" data-cta-position="company_next_action">Monitorar oportunidades aderentes ao CNPJ</button>
<button class="button button-secondary" type="button" data-intel-cta="request" data-intent-kind="REQUEST_DEEP_DIVE" data-cta-id="intel_request_deep_dive" data-cta-position="company_next_action">Pedir aprofundamento desta análise</button>
<button class="button button-secondary" type="button" data-intel-cta="request" data-intent-kind="REQUEST_HUMAN_REVIEW" data-cta-id="intel_request_human_review" data-cta-position="company_next_action">Pedir revisão humana</button>
</div>
<p><a href="/analise-cnpj/">Analisar outro CNPJ</a></p>
</section>

<section class="section" id="pedido" data-section-archetype="contextual_next_action" hidden>
<h2 id="pedido-titulo">Registrar o pedido</h2>
<form class="contact-form" id="intel-lead-form" novalidate method="post" action="/api/web/lead" data-form-contract="next-state/v1" data-next-state-profile="service_fit_review" data-runtime-profile="inline_receipt_v1" data-receipt-required="true">
<p class="form-hint" data-form-value>Registre a demanda e a decisão que está na mesa para a CONFENGE enquadrar a entrega, a prova necessária e a capacidade de atendimento.</p>
<p class="form-hint" data-field-purpose>Os campos marcados como obrigatórios delimitam a decisão e identificam o responsável; o canal solicitado permite retorno. Empresa e contexto adicional são opcionais quando não estão marcados.</p>
<input id="intel-intent-kind" name="intent_kind" type="hidden" value=""/>
<input id="intel-analysis-id" name="analysis_id" type="hidden" value="${esc(result.analysis_id || "")}"/>
<input name="origem" type="hidden" value="/analise-cnpj/"/>
<input name="jornada" id="jornada-hidden" type="hidden" value="operacao"/>
<input name="estagio" id="estagio" type="hidden" value="escolhendo oportunidades"/>
<input name="route_family" type="hidden" value="live-company-analysis"/>
<input id="intel-cta-id" name="cta_id" type="hidden" value=""/>
<p class="honeypot"><label for="intel-empresa-site">Não preencha este campo</label><input autocomplete="off" id="intel-empresa-site" name="empresa-site" tabindex="-1"/></p>
<div class="field"><label for="intel-nome">Nome</label><input autocomplete="name" id="intel-nome" name="nome" required="" type="text"/></div>
<div class="form-row" role="group" aria-describedby="intel-contato-hint">
<div class="field"><label for="intel-telefone">WhatsApp</label><input autocomplete="tel" id="intel-telefone" inputmode="tel" maxlength="20" name="telefone" pattern="(\+?55[\s.\-]?)?\(?\d{2}\)?[\s.\-]?9?\d{4}[\s.\-]?\d{4}" placeholder="(48) 98834-4559" title="Informe DDD e número, com 10 ou 11 dígitos." type="tel"/></div>
<div class="field"><label for="intel-email">E-mail</label><input autocapitalize="off" autocomplete="email" id="intel-email" inputmode="email" maxlength="180" name="email" pattern="[^@\s]+@[^@\s]+\.[A-Za-z]{2,}" placeholder="nome@empresa.com.br" spellcheck="false" title="Informe um e-mail completo, como nome@empresa.com.br." type="email"/></div>
</div>
<p class="form-hint" id="intel-contato-hint">Informe WhatsApp ou e-mail para retorno. O CNPJ consultado não acompanha este pedido: o vínculo é o identificador opaco da análise.</p>
<div class="field"><label for="intel-topic">Tópico de interesse <span class="optional-mark">opcional</span></label><input autocomplete="off" id="intel-topic" maxlength="200" name="topic" type="text"/></div>
<div class="field" id="intel-cadence-field" hidden>
  <label for="intel-cadence">Frequência de monitoramento</label>
  <select id="intel-cadence" name="cadence">
    <option value="immediate">Imediato (quando surgem)</option>
    <option value="weekly">Semanal</option>
    <option value="monthly">Mensal</option>
  </select>
</div>
<div class="field"><label for="intel-mensagem">Contexto em poucas linhas <span class="optional-mark">opcional</span></label><textarea id="intel-mensagem" name="mensagem" rows="3"></textarea></div>
<label class="consent" for="intel-consentimento"><input id="intel-consentimento" name="consentimento" required="" type="checkbox"/><span>Autorizo o uso destes dados para retorno sobre esta solicitação, conforme a <a href="/privacidade/">Política de Privacidade</a>.</span></label>
<input id="intel-consent-at" name="consent_at" type="hidden" value=""/>
<div class="field turnstile-slot" id="turnstile-slot" hidden data-turnstile-sitekey="${esc(process.env.TURNSTILE_SITE_KEY || "")}">
  <div class="cf-turnstile" data-theme="light" data-size="normal"></div>
</div>
<button class="button button-primary button-lg" type="submit">Registrar seguimento desta análise</button>
</form>
<div class="form-status" id="pedido-status" role="status" aria-live="polite" hidden></div>
<div class="form-legal">
<p class="form-note">Retorno direto. Sem lista de e-mails ou compartilhamento comercial dos dados.</p>
<p class="form-note" data-form-boundary>O registro não é compra, parecer jurídico ou promessa de resultado. O site não recebe arquivo; quando necessário, o canal seguro é combinado após o protocolo. Dados usados apenas para este retorno; retenção de até 730 dias. A exclusão pode ser pedida pelos canais da <a href="/privacidade/">Política de Privacidade</a>, com o protocolo.</p>
</div>
</section>
</article>
</main>
<footer class="site-footer">
<div class="container footer-bottom"><span>© CONFENGE. CNPJ 52.407.089/0001-09.</span><a href="/privacidade/">Política de Privacidade</a></div>
</footer>
</body>
</html>`;
}

/**
 * Error surface for the JS-absent path.
 *
 * `message` is always one of this module's own constant strings. The submitted
 * CNPJ is never interpolated here, so a rejected input cannot be reflected back
 * into the page or into any link on it.
 */
function errorPage(message) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1" name="viewport"/>
<meta content="noindex,nofollow" name="robots"/>
<meta content="same-origin" name="referrer"/>
<title>Não foi possível concluir a consulta | CONFENGE</title>
<link href="/styles.css" rel="stylesheet"/>
</head>
<body class="simple-page">
<main class="simple-main"><article class="simple-card"><section class="section">
<h1>Não foi possível concluir a consulta</h1>
<p>${esc(message)}</p>
<p><a class="button button-primary" href="/analise-cnpj/">Voltar e tentar novamente</a></p>
</section></article></main>
</body>
</html>`;
}

/**
 * The opaque token, taken from the rewritten path or the rewrite's query.
 *
 * `_redirects` maps `/analise-cnpj/r/*` onto this function with `?token=:splat`,
 * but the path is read first so the route also works when a host forwards the
 * original path unchanged.
 */
function resultTokenFromEvent(event) {
  const path = String((event && event.path) || "");
  const match = path.match(/\/analise-cnpj\/r\/([^/?#]+)/);
  if (match && resultStore.isResultToken(match[1])) return match[1];
  const qs = (event && event.queryStringParameters) || {};
  const raw = String(qs.token || "").replace(/\/+$/, "");
  return resultStore.isResultToken(raw) ? raw : "";
}

/**
 * A request that came from a plain HTML form submit rather than from fetch().
 *
 * This is the JS-absent path. It must never be answered with JSON the visitor
 * would see as raw text, and it must never be answered with anything that puts
 * the submitted CNPJ into a URL.
 */
function wantsHtml(event) {
  const h = (event && event.headers) || {};
  const ct = String(h["content-type"] || h["Content-Type"] || "").toLowerCase();
  if (ct.includes("application/json")) return false;
  const accept = String(h.accept || h.Accept || "").toLowerCase();
  if (accept.includes("application/json")) return false;
  return true;
}

exports.handler = async (event) => {
  const originCheck = originAllowed(event);
  const headers = corsHeaders(originCheck.origin);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  // --- The shareable result surface ----------------------------------------
  // `GET ?token=<opaque>` resolves a stored result as JSON. The static shell at
  // /analise-cnpj/r/index.html calls this with the token from its own address,
  // which is what makes a result survive a refresh, back/forward, and being
  // opened cold from a shared link in another browser session.
  //
  // The token is the only input, it is random, and it carries no CNPJ — so this
  // read is safe to expose to anyone holding the link, and to no one else.
  if (event.httpMethod === "GET" || event.httpMethod === "HEAD") {
    // Malformed/truncated/garbage/empty token, never-issued token, and an
    // expired-but-unswept token are all the same visitor-facing case: "you do
    // not hold a valid, live result". Answering them identically (same status,
    // same body shape) means a caller can never use the response to tell those
    // three apart, which is what makes the token space safe to probe at all.
    const token = resultTokenFromEvent(event);
    const stored = token ? resultStore.loadResult(token, { event }) : null;
    if (!stored) {
      return {
        statusCode: 404,
        headers: { ...headers, "X-Robots-Tag": "noindex, nofollow" },
        body: JSON.stringify(publicErrorBody({ error: "result_not_found", message: "Este resultado não existe mais." })),
      };
    }
    safeLog("info", "live_intelligence_result_view", { state: stored.result.state || "" });
    return {
      statusCode: 200,
      headers: { ...headers, "X-Robots-Tag": "noindex, nofollow" },
      body: JSON.stringify({ ok: true, ...stored.result }),
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify(publicErrorBody({ error: "method_not_allowed", message: "Método não permitido." })),
    };
  }
  if (!originCheck.ok) {
    safeLog("warn", "origin_denied", {});
    return {
      statusCode: originCheck.status || 403,
      headers,
      body: JSON.stringify(publicErrorBody({ error: originCheck.error, message: originCheck.message })),
    };
  }

  const parsed = parseBody(event);
  if (!parsed.ok) {
    return {
      statusCode: parsed.status || 400,
      headers,
      body: JSON.stringify(publicErrorBody({ error: parsed.error, message: "Requisição inválida." })),
    };
  }

  // A CNPJ lookup is enumerable by construction, so it is rate limited on the
  // same buckets as the lead endpoint.
  const limited = rateLimit({
    ip: clientIp(event),
    fingerprint: technicalFingerprint(event),
  });
  if (!limited.allowed) {
    const rateMessage = "Muitas consultas. Tente novamente em alguns minutos.";
    if (wantsHtml(event)) {
      return { statusCode: 429, headers: pageHeaders(), body: errorPage(rateMessage) };
    }
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify(publicErrorBody({ error: "rate_limited", message: rateMessage })),
    };
  }

  const html = wantsHtml(event);
  const result = analyze(parsed.data && parsed.data.cnpj);
  if (!result.ok) {
    if (html) {
      // The rejected input is never echoed back — not into the page, not into
      // a URL. The visitor is told what to fix, not shown what they typed.
      return {
        statusCode: result.status || 422,
        headers: pageHeaders(),
        body: errorPage(result.message || "Não foi possível concluir a consulta."),
      };
    }
    return {
      statusCode: result.status || 422,
      headers,
      body: JSON.stringify(publicErrorBody({ error: result.error, message: result.message })),
    };
  }

  // Persist the result so its URL resolves for anyone holding the link. The
  // record carries no CNPJ and no contact data; see the allowlist projection in
  // lib/live-intelligence-result-store.cjs.
  const saved = resultStore.saveResult(result, { event });

  // The log records the decision, never the subject: no CNPJ, no digest.
  safeLog("info", "live_intelligence_analyze", {
    state: result.state,
    reason: result.reason || "",
    dataset_load_error: DATASET_LOAD_ERROR || "",
    result_persisted: saved.ok ? "yes" : "no",
  });

  if (!saved.ok) {
    // The answer still stands; only the shareable address does not. Rather than
    // hand out a link that 404s, the field is removed. A promise that cannot be
    // kept is not shipped.
    delete result.result_path;
    if (html) {
      return { statusCode: 200, headers: pageHeaders(), body: renderResultPage(result) };
    }
    return { statusCode: 200, headers, body: JSON.stringify(resultStore.publicResult(result)) };
  }

  if (html) {
    // The JS-absent path. A native form POST carries the CNPJ in the request
    // body, never in a URL, so nothing enters the address bar, the history entry
    // or any onward Referer. The answer is server-rendered here rather than
    // redirected to the shareable address, because that address is a static
    // shell that hydrates itself with JS — redirecting a visitor who has no JS
    // would send them to an empty page. They get the full result; what they do
    // not get is a bookmarkable link to it.
    return { statusCode: 200, headers: pageHeaders(), body: renderResultPage(result) };
  }
  return { statusCode: 200, headers, body: JSON.stringify(resultStore.publicResult(result)) };
};

exports.analyze = analyze;
exports.datasetFreshness = datasetFreshness;
exports.newAnalysisId = newAnalysisId;
exports.resultRoute = resultRoute;
exports.DISCLAIMER_PT = DISCLAIMER_PT;
exports.NAO_INFORMADO = NAO_INFORMADO;
exports.NAO_INFORMADO_NOTA = NAO_INFORMADO_NOTA;
// Exported so the test asserts provenance disclosure against the real mapping
// rather than a copy of the phrase that could drift away from it.
exports.fonteKindPt = fonteKindPt;
exports.RESULT_STATES = RESULT_STATES;
exports.RESULT_ROUTE_PREFIX = RESULT_ROUTE_PREFIX;
exports._setDatasetForTests = _setDatasetForTests;
