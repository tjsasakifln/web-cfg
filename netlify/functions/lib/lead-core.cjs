/**
 * Pure lead validation, sanitization, idempotency, and response DTO helpers.
 * No I/O — unit-testable without mocks of the unit under test.
 */
const crypto = require("crypto");
const { validateCnpj } = require("../../../scripts/conversion/cnpj.cjs");
const adaptiveIntake = require("./adaptive-intake.cjs");

const MAX_BODY_BYTES = 24 * 1024;
// Standard antivirus fixture. Rejected as bytes, never persisted. Not a real sample.
const EICAR_SIGNATURE = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const FILE_FIELD_KEYS = new Set([
  "file",
  "files",
  "arquivo",
  "arquivos",
  "anexo",
  "anexos",
  "attachment",
  "attachments",
  "document",
  "documents",
  "documento",
  "documentos",
  "upload",
  "uploads",
  "filename",
  "file_name",
  "filedata",
  "file_data",
  "blob",
  "binary",
  "octet",
]);
const DOCUMENT_INTENT_ALLOWED = new Set(["secure_channel_request"]);
// Live-intelligence next-action kinds. Server-side allowlist, not free text: an
// unknown value is dropped to null rather than forwarded, so a tampered form
// cannot invent a commercial intent for warmbly to act on.
const INTENT_KIND_ALLOWED = new Set([
  "MONITOR_OPPORTUNITY",
  "MONITOR_COMPANY",
  "REQUEST_DEEP_DIVE",
  "REQUEST_HUMAN_REVIEW",
]);
const MAX_FIELD = {
  nome: 120,
  telefone: 40,
  email: 180,
  empresa: 180,
  estagio: 120,
  jornada: 40,
  urgencia: 80,
  mensagem: 2000,
  origem: 180,
  landing_page: 240,
  referrer: 240,
  utm_source: 80,
  utm_medium: 80,
  utm_campaign: 80,
  utm_content: 80,
  utm_term: 80,
  content_cluster: 80,
  route_family: 80,
  cta_id: 80,
  asset_id: 80,
  correlation_id: 80,
  landing_url: 240,
  idempotency_key: 80,
  turnstile_token: 2048,
  public_contract_id: 80,
  public_entity_id: 80,
  public_id_slug: 80,
  cnpj: 20,
  analysis_id: 120,
  evidence_pack_version: 80,
  asset_family: 80,
  query_class: 80,
  deliverable_id: 16,
  analysis_cutoff: 10,
  opportunity_deadline: 10,
  contract_event: 32,
  contract_stage: 24,
  // BOFU-FECHAMENTO-20260919 (FAMILIAS-PUBLICAS-01): campos opcionais da fase
  // preparatoria, preenchidos pelo orgao contratante no hub de obras publicas.
  procurement_object: 120,
  procurement_stage: 32,
  procurement_regulation: 80,
  funding_source: 32,
  contract_value_band: 24,
  lot_count: 4,
  execution_regime: 40,
  decision_intent: 32,
  faixa_contrato: 24,
  risco_em_jogo: 24,
  frequencia: 24,
  maturidade_documental: 24,
  capacidade_interna: 24,
  offer_id: 80,
  terms_id: 80,
  amount_cents: 16,
  document_intent: 40,
  intent_kind: 40,
  session_id: 32,
  tema: 120,
};

/** Query/body keys that may persist as attribution. Everything else is dropped. */
const ATTR_ALLOWLIST = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "jornada",
  "origem",
  "origin_url",
  "landing_url",
  "landing_page",
  "referrer",
  "route_family",
  "cta_id",
  "asset_id",
  "correlation_id",
  "session_id",
  "tema",
  "pseo_page_id",
  "page_type",
  "archetype",
  "segment",
  "region",
  "agency_id",
  "intent",
  "source_run_id",
  "dataset_hash",
  "cta_position",
  "content_cluster",
  "analysis_id",
  "evidence_pack_version",
  "asset_family",
  "query_class",
  "deliverable_id",
  "offer_id",
  "terms_id",
];

const ATTR_LOCATION_KEYS = new Set([
  "origem",
  "origin_url",
  "landing_url",
  "landing_page",
  "referrer",
]);

// Attribution identifiers are machine-readable dimensions, not free text. Keeping
// them token-shaped prevents a visitor name/message from being smuggled into logs
// or analytics through a UTM/data-* field.
const ATTR_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const ATTR_PATH_RE = /^\/[A-Za-z0-9._~!$&'()*+,;=:@/-]*$/;

// Public catalogue IDs are accepted only from the versioned canonical source.
// A broken/missing registry makes a submitted selection fail closed; a generic
// hand-raise without deliverable_id remains valid.
let DELIVERABLE_STATE_BY_ID = new Map();
try {
  const registry = require("../../../data/commercial/deliverables-registry.v1.json");
  DELIVERABLE_STATE_BY_ID = new Map(
    (registry.deliverables || []).map((entry) => [entry.deliverable_id, entry.public_state]),
  );
} catch {
  DELIVERABLE_STATE_BY_ID = new Map();
}

// Familias de servico "por proposta" que o formulario de /entregas/ oferece ao
// lado do catalogo com preco. Nao sao entregas do registro: viram o tipo de
// necessidade (estagio) com o MESMO valor que a home usa, e a jornada e
// derivada dele -- nunca do "operacao" oculto do formulario, que e B2G.
const SERVICE_FAMILY_STAGE = new Map([
  ["SERV-PROJETO", "projeto, revisão ou compatibilização"],
  ["SERV-ORCAMENTO", "quantitativos ou orçamento"],
  ["SERV-DIAGNOSTICO", "obra ou imóvel para inspecionar ou documentar"],
  ["SERV-PERICIA", "perícia, assistência técnica ou avaliação"],
  ["SERV-SST", "segurança do trabalho"],
]);

function assertDeliverableSelection(raw) {
  const id = clamp(raw, MAX_FIELD.deliverable_id).toUpperCase();
  if (!id) return { ok: true, deliverable_id: null };
  if (SERVICE_FAMILY_STAGE.has(id)) {
    return { ok: true, deliverable_id: null, service_family_stage: SERVICE_FAMILY_STAGE.get(id) };
  }
  const state = DELIVERABLE_STATE_BY_ID.get(id);
  if (!state) {
    return {
      ok: false,
      status: 422,
      error: "deliverable_id_unknown",
      message: "Entrega inexistente no catálogo vigente.",
    };
  }
  if (state === "BLOCKED") {
    return {
      ok: false,
      status: 422,
      error: "deliverable_unavailable",
      message: "Esta entrega ainda não está disponível para análise comercial.",
    };
  }
  return { ok: true, deliverable_id: id };
}

// FAMILIAS-PUBLICAS-05 (BOFU-FECHAMENTO-20260919): rota publicada -> entrega
// do registro, para o lead que chega de um pilar sem `deliverable_id` oculto.
// Chave: slug da rota (`/medicoes-glosas-obras-publicas/` -> o mesmo valor que
// o formulario grava em estagio/asset_id). BLOCKED nunca e derivado.
// Nunca a partir de `landing_page`/`landing_url`: sao atribuicao de PRIMEIRO
// toque (nav.js mergeFirstTouch) e o hidden `landing_page` e forcado em todo
// formulario a partir da sessao, entao apontavam para a pagina em que a
// sessao comecou, nao para a rota do formulario (aditivos chegava como o
// Dossie de Medicao; a home e o hub 'ainda nao sei' chegavam com entrega).
let DELIVERABLE_ID_BY_ROUTE_SLUG = new Map();
try {
  const registry = require("../../../data/commercial/deliverables-registry.v1.json");
  DELIVERABLE_ID_BY_ROUTE_SLUG = new Map(
    (registry.deliverables || [])
      .filter((entry) => entry.route && entry.public_state !== "BLOCKED")
      .map((entry) => [String(entry.route).replace(/^\/+|\/+$/g, ""), entry.deliverable_id]),
  );
} catch {
  DELIVERABLE_ID_BY_ROUTE_SLUG = new Map();
}

function routeSlugOf(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) {
    try {
      text = new URL(text).pathname;
    } catch {
      return "";
    }
  }
  text = text.split(/[?#]/)[0];
  return text.replace(/^\/+|\/+$/g, "");
}

function deriveDeliverableIdFromRoute(lead) {
  if (!lead || typeof lead !== "object") return "";
  for (const candidate of [lead.estagio, lead.asset_id, lead.route_family]) {
    const slug = routeSlugOf(candidate);
    if (slug && DELIVERABLE_ID_BY_ROUTE_SLUG.has(slug)) return DELIVERABLE_ID_BY_ROUTE_SLUG.get(slug);
  }
  return "";
}

// The catalogue hub captures an initial hand-raise, not the qualification
// questionnaire of a product route. Keep this exception route-exact so a
// forged product-page payload cannot bypass the published fail-closed fields.
function isGenericDeliverablesHandraise(data) {
  if (!data || typeof data !== "object") return false;
  const landingPage = String(data.landing_page || data.landing_url || "").trim();
  return (
    (landingPage === "/entregas/" || landingPage === "https://confenge.com.br/entregas/") &&
    String(data.route_family || "").trim() === "entregas" &&
    String(data.origem || "").trim() === "entregas" &&
    String(data.estagio || "").trim() === "entregas-exemplos-hub" &&
    String(data.asset_id || "").trim() === "entregas-exemplos-hub" &&
    String(data.cta_id || "").trim() === "entregas-hub-handraise" &&
    !String(data.offer_id || "").trim()
  );
}

const LICITACAO_PRODUCT_IDS = new Set(["CFG-D12", "CFG-D13", "CFG-D14", "CFG-D15", "CFG-D16"]);
// Mesmo value do <option> "Ainda não sei qual serviço preciso" em index.html.
const ESTAGIO_UNKNOWN_SERVICE = "ainda não sei qual serviço";
const CONTRACT_VALUE_BANDS = new Set(["ate_5m", "5m_20m", "20m_100m", "acima_100m", "UNKNOWN"]);
const EXECUTION_REGIMES = new Set([
  "empreitada_preco_global",
  "empreitada_preco_unitario",
  "contratacao_integrada",
  "contratacao_semi_integrada",
  "outro",
  "UNKNOWN",
]);
const LICITACAO_DECISION_INTENTS = new Set([
  "avaliar_disputa",
  "avancar",
  "avancar_condicoes",
  "esclarecer_impugnar",
  "recusar",
  "UNKNOWN",
]);
const ICP_TICKET_BANDS = new Set(["ate_250k", "250k_1m", "acima_1m", "unknown"]);
const ICP_RISK_BANDS = new Set([
  "abaixo_entrada",
  "faixa_entrada",
  "faixa_diagnostico",
  "faixa_dossie",
  "acima_dossie",
  "unknown",
]);
const ICP_FREQUENCY = new Set(["pontual", "recorrente", "unknown"]);
const ICP_DOCS = new Set(["forte", "parcial", "fraca", "unknown"]);
const ICP_CAPACITY = new Set(["suficiente", "limitada", "inexistente", "unknown"]);

function pickEnum(value, allowed, maxLen) {
  const raw = clamp(value, maxLen);
  return allowed.has(raw) ? raw : null;
}

function isCanonicalIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function businessDaysUntil(value, now = new Date()) {
  if (!isCanonicalIsoDate(value)) return -1;
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const end = new Date(`${value}T00:00:00Z`);
  const calendarDays = Math.ceil((end.getTime() - cursor.getTime()) / 86400000) + 1;
  if (calendarDays < 0 || calendarDays > 366) return -1;
  let days = 0;
  while (cursor <= end) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function assertLicitacaoQualification(data, deliverableId) {
  if (!LICITACAO_PRODUCT_IDS.has(deliverableId)) return { ok: true, qualification: null };
  const publicContractId = clamp(data.public_contract_id, MAX_FIELD.public_contract_id);
  const deadline = clamp(data.opportunity_deadline, MAX_FIELD.opportunity_deadline);
  const valueBand = clamp(data.contract_value_band, MAX_FIELD.contract_value_band);
  const regime = clamp(data.execution_regime, MAX_FIELD.execution_regime);
  const decisionIntent = clamp(data.decision_intent, MAX_FIELD.decision_intent);
  const lotRaw = clamp(data.lot_count, MAX_FIELD.lot_count);
  const lotCount = Number(lotRaw);
  const deadlineBusinessDays = businessDaysUntil(deadline);
  const minimumBusinessDays = deliverableId === "CFG-D12" ? 5 : 1;
  if (
    publicContractId.length < 3 ||
    !isCanonicalIsoDate(deadline) ||
    !CONTRACT_VALUE_BANDS.has(valueBand) ||
    !EXECUTION_REGIMES.has(regime) ||
    !LICITACAO_DECISION_INTENTS.has(decisionIntent) ||
    !/^\d{1,3}$/.test(lotRaw) ||
    !Number.isInteger(lotCount) ||
    lotCount < 1 ||
    lotCount > 999 ||
    deadlineBusinessDays < minimumBusinessDays
  ) {
    return {
      ok: false,
      status: 422,
      error: "licitacao_qualification_invalid",
      message: "Informe edital, prazo seguro, faixa de valor, lotes, regime e decisão nos formatos publicados.",
    };
  }
  return {
    ok: true,
    qualification: {
      opportunity_deadline: deadline,
      contract_value_band: valueBand,
      lot_count: lotCount,
      execution_regime: regime,
      decision_intent: decisionIntent,
    },
  };
}

const EIGHT_PRODUCT_IDS = new Set([
  "CFG-D01", "CFG-D02", "CFG-D03", "CFG-D04",
  "CFG-D05", "CFG-D06", "CFG-D07", "CFG-D08",
]);
const EXPANSION_DECISION_INTENTS = new Set([
  "priorizar_oportunidades",
  "validar_mercado",
  "escolher_territorio",
  "monitorar_renovacoes",
  "comparar_concorrentes",
  "referenciar_precos",
  "consolidar_plano",
  "UNKNOWN",
]);

function validatedCnpjOrNull(raw) {
  const check = validateCnpj(clamp(raw, MAX_FIELD.cnpj));
  return check.ok ? check.cnpj : null;
}

function assertEightProductQualification(data, deliverableId) {
  if (!EIGHT_PRODUCT_IDS.has(deliverableId)) return { ok: true, qualification: null };
  const cnpjCheck = validateCnpj(clamp(data.cnpj || data.cnpj14, MAX_FIELD.cnpj));
  const analysisCutoff = clamp(data.analysis_cutoff, MAX_FIELD.analysis_cutoff);
  const deadline = clamp(data.opportunity_deadline, MAX_FIELD.opportunity_deadline);
  const decisionIntent = clamp(data.decision_intent, MAX_FIELD.decision_intent);
  const cutoffTime = isCanonicalIsoDate(analysisCutoff) ? Date.parse(`${analysisCutoff}T00:00:00Z`) : NaN;
  const deadlineTime = isCanonicalIsoDate(deadline) ? Date.parse(`${deadline}T00:00:00Z`) : NaN;
  if (
    !cnpjCheck.ok ||
    !Number.isFinite(cutoffTime) ||
    !Number.isFinite(deadlineTime) ||
    cutoffTime < Date.parse("2000-01-01T00:00:00Z") ||
    cutoffTime > deadlineTime ||
    businessDaysUntil(deadline) < 1 ||
    !EXPANSION_DECISION_INTENTS.has(decisionIntent)
  ) {
    return {
      ok: false,
      status: 422,
      error: "expansion_qualification_invalid",
      message: "Informe CNPJ, data de corte, prazo e decisão nos formatos publicados.",
    };
  }
  return {
    ok: true,
    qualification: {
      cnpj: cnpjCheck.cnpj,
      analysis_cutoff: analysisCutoff,
      opportunity_deadline: deadline,
      decision_intent: decisionIntent,
    },
  };
}

const CONTRACT_DEFENSE_IDS = new Set([
  "CFG-D17", "CFG-D18", "CFG-D19", "CFG-D20", "CFG-D21", "CFG-D22", "CFG-D23",
]);
// BOFU-FECHAMENTO-20260919 (FAMILIAS-PUBLICAS-01, decisao C1): o orgao que
// planeja a contratacao entra pelo MESMO formulario do hub como evento
// estruturado `planejamento_contratacao` (lado contratante). Nao ha contrato
// nem estagio de evento; a jornada continua `contrato` e o estagio gravado e
// `planejamento-contratacao-publica`, que o CTA do bloco do orgao tambem
// escreve no hidden via data-estagio (js/modules/nav.js, DATASET_TO_FIELD).
const CONTRACT_EVENT_PLANNING = "planejamento_contratacao";
const ESTAGIO_PLANEJAMENTO_CONTRATACAO = "planejamento-contratacao-publica";
const CONTRACT_EVENTS = new Set([
  "risco_margem",
  "medicao_glosa_pagamento",
  "mudanca_escopo",
  "atraso_prorrogacao",
  "reajuste",
  "reequilibrio",
  "notificacao_sancao",
  CONTRACT_EVENT_PLANNING,
  "outro",
]);
const CONTRACT_STAGES = new Set([
  "identificado", "documentando", "quantificando", "em_resposta", "UNKNOWN",
]);
// Campos OPCIONAIS da fase preparatoria (enum fechado ou texto curto
// sanitizado como tema). Nunca entram em analytics; viajam no texto
// versionado do handoff com rotulo e ficam no registro durvel.
const PROCUREMENT_STAGES = new Set([
  "dfd_etp", "termo_referencia_projeto", "orcamento_referencia", "edital_minuta", "nao_sei",
]);
const FUNDING_SOURCES = new Set([
  "recurso_proprio", "transferencia_uniao", "transferencia_estado", "financiamento", "nao_sei",
]);

function procurementContext(data) {
  const stage = clamp(data.procurement_stage, MAX_FIELD.procurement_stage);
  const funding = clamp(data.funding_source, MAX_FIELD.funding_source);
  return {
    procurement_object: sanitizeAttributionTopic(data.procurement_object, MAX_FIELD.procurement_object) || null,
    procurement_stage: PROCUREMENT_STAGES.has(stage) ? stage : null,
    procurement_regulation: sanitizeAttributionTopic(data.procurement_regulation, MAX_FIELD.procurement_regulation) || null,
    funding_source: FUNDING_SOURCES.has(funding) ? funding : null,
  };
}

function assertContractDefenseQualification(data, deliverableId) {
  const publicContractId = clamp(data.public_contract_id, MAX_FIELD.public_contract_id);
  const contractEvent = clamp(data.contract_event, MAX_FIELD.contract_event);
  const deadline = clamp(data.opportunity_deadline, MAX_FIELD.opportunity_deadline);
  // FAMILIAS-PUBLICAS-04: o estagio do evento e publicado como opcional
  // ("Ainda nao sei"). Vazio com evento valido e o mesmo que UNKNOWN; antes,
  // um pedido completo que nao tocava o campo chegava como lacuna "invalid".
  const informedStage = clamp(data.contract_stage, MAX_FIELD.contract_stage);
  const planning = contractEvent === CONTRACT_EVENT_PLANNING;
  const contractStage = informedStage || (CONTRACT_EVENTS.has(contractEvent) && !planning ? "UNKNOWN" : "");
  // O hub de obras publicas aceita "ainda nao sei qual entrega" (entrega
  // vazia) e ainda assim publica evento e estagio como obrigatorios: o que o
  // visitante informou tem de ser validado e persistido, nao descartado.
  // Identificador e prazo tambem pertencem a qualificacao de licitacao, por
  // isso so evento e estagio -- exclusivos deste formulario -- abrem o contexto.
  const contractContext = CONTRACT_DEFENSE_IDS.has(deliverableId)
    || Boolean(contractEvent || contractStage);
  if (!contractContext) return { ok: true, qualification: null };
  // Identificador do contrato e prazo sao OPCIONAIS na captura publicada
  // (decisao 2026-09-09: demanda incompleta e bem-vinda; o que falta e pedido
  // na triagem). Quando informados, continuam nos formatos publicados: um
  // identificador com 3+ caracteres e um prazo valido e seguro.
  const safeDays = deadline ? businessDaysUntil(deadline) : null;
  const minDays = deliverableId === "CFG-D23" ? 5 : 1;
  // Orgao planejando a contratacao: nao ha contrato assinado nem estagio de
  // evento, entao nenhum dos dois e exigido e nenhuma lacuna e registrada.
  // Um estagio informado fora do enum e descartado, nao vetado.
  if (
    (publicContractId && publicContractId.length < 3) ||
    !CONTRACT_EVENTS.has(contractEvent) ||
    (!planning && !CONTRACT_STAGES.has(contractStage)) ||
    (deadline && safeDays < minDays)
  ) {
    return {
      ok: false,
      status: 422,
      error: "contract_qualification_invalid",
      message: "Informe evento e estágio; contrato e prazo, se informados, nos formatos publicados.",
    };
  }
  return {
    ok: true,
    qualification: {
      public_contract_id: publicContractId,
      contract_event: contractEvent,
      opportunity_deadline: deadline,
      // Orgao: nao ha contrato, entao o padrao UNKNOWN do <select> (e o vazio)
      // nao viram "estagio contratual=UNKNOWN" no handoff; so um estagio
      // real informado e persistido.
      contract_stage: planning
        ? (CONTRACT_STAGES.has(contractStage) && contractStage !== "UNKNOWN" ? contractStage : null)
        : contractStage,
    },
  };
}

function looksLikePii(value, key) {
  const s = String(value || "");
  if (!s) return false;
  if (/@/.test(s)) return true;
  if (key === "correlation_id" || key === "session_id" || key === "lead_id") return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return false;
  if (s.startsWith("c-")) return false;
  if (/^(sess|lead|opp|prop|sale|evt)-/.test(s)) return false;
  const compactDigits = s.replace(/[\s()./+\-]/g, "");
  return /^\d{10,15}$/.test(compactDigits);
}

function sanitizeAttributionValue(val, maxLen, key) {
  if (val == null) return "";
  const s = stripControl(val).slice(0, maxLen || 180);
  if (!s || looksLikePii(s, key) || !ATTR_TOKEN_RE.test(s)) return "";
  return s;
}

// `tema` is the short subject the visitor arrived with (data-tema of the
// article/case CTA or ?tema= on the home): dataset/H1 text such as
// "glosa de medição obra pública", so it keeps spaces and accents that the
// token contract rejects. It is still an attribution dimension, never free
// text from the visitor: control characters and angle brackets are stripped,
// an e-mail or a digit run the size of a phone/CPF/CNPJ drops the whole value.
function sanitizeAttributionTopic(val, maxLen) {
  if (val == null) return "";
  const s = stripControl(val).replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLen || MAX_FIELD.tema).trim();
  if (!s) return "";
  if (/@/.test(s)) return "";
  if (/\d{8,}/.test(s)) return "";
  const compactDigits = s.replace(/(\d)[\s().\/+-]+(?=\d)/g, "$1");
  if (/\d{10,}/.test(compactDigits)) return "";
  return s;
}

function sanitizeAttributionLocation(val, maxLen, key) {
  if (val == null) return "";
  const raw = stripControl(val).slice(0, maxLen || 240);
  if (!raw) return "";

  try {
    // Absolute URLs retain only scheme/host/path. Query and fragment are never
    // attribution storage because they can contain email, phone or message text.
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    const clean = `${url.origin}${url.pathname}`.slice(0, maxLen || 240);
    let decodedPath = url.pathname;
    try {
      decodedPath = decodeURIComponent(url.pathname);
    } catch {
      return "";
    }
    return looksLikePii(clean, key) || looksLikePii(decodedPath, key) ? "" : clean;
  } catch {
    // Same-site paths are stored without query/fragment; plain origin slugs use
    // the same strict token contract as the remaining attribution dimensions.
    if (raw.startsWith("/")) {
      const path = raw.split(/[?#]/, 1)[0].slice(0, maxLen || 240);
      return path && !looksLikePii(path, key) && ATTR_PATH_RE.test(path) ? path : "";
    }
    return sanitizeAttributionValue(raw, maxLen, key);
  }
}

function normalizeSessionId(value) {
  const sessionId = String(value || "").slice(0, MAX_FIELD.session_id);
  return /^sess-[0-9a-f]{27}$/i.test(sessionId) ? sessionId.toLowerCase() : "";
}

// Web-side origin class (issue #706, contract data/revops/proposal-counting.v1.json,
// section web_origin_class). Derived on the server at persist time from the
// already-sanitized UTM tokens and the referrer HOST only (never the full URL,
// never a visitor value): it is a verdict, not an intake field, so it is not in
// ATTR_ALLOWLIST and a posted `origin_class` is ignored. It is evidence for
// Warmbly's commercial origin class, not that class: `direct_or_unknown` is
// never read as organic and never promotes to demonstrated inbound.
const ORIGIN_CLASS_VALUES = Object.freeze(["campaign", "search_organic", "referral", "direct_or_unknown"]);
const SEARCH_ENGINE_HOST_PREFIXES = Object.freeze(["google.", "bing.", "duckduckgo.", "yahoo.", "ecosia."]);
let OWN_HOSTS = null;
function ownHosts() {
  // ALLOWED_ORIGINS is declared further down; resolve on first use.
  if (!OWN_HOSTS) {
    OWN_HOSTS = new Set(
      [...ALLOWED_ORIGINS].map((origin) => {
        try {
          return new URL(origin).hostname.toLowerCase();
        } catch {
          return "";
        }
      }).filter(Boolean),
    );
  }
  return OWN_HOSTS;
}

function referrerHost(referrer) {
  const raw = String(referrer || "").trim();
  if (!raw || raw.startsWith("/")) return "";
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isSearchEngineHost(host) {
  // Classify search_organic only for the engine's actual SEARCH host, never
  // any other subdomain on the same domain (mail., docs., drive., accounts.,
  // groups., translate., sites. all read as referral instead). A click
  // arriving from Gmail/Docs/Drive/etc. must never be credited as organic
  // search — "desconhecido não recebe crédito automático".
  const normalized = String(host || "").toLowerCase().replace(/^www\./, "");
  if (!normalized) return false;
  const labels = normalized.split(".");
  // google.<tld...> (google.com, google.com.br, google.co.uk, ...): the
  // first label must be exactly "google" (not a subdomain of it, like
  // mail.google.com), and what follows must look like a real public-suffix
  // tail (1–2 short labels), so google.com.evil.example never matches.
  const tail = labels.slice(1);
  const tailLooksLikeTld = tail.length >= 1 && tail.length <= 2 && tail.every((l) => l.length >= 2 && l.length <= 3);
  if (labels[0] === "google" && tailLooksLikeTld) return true;
  if (normalized === "bing.com") return true;
  if (normalized === "duckduckgo.com") return true;
  if (normalized === "ecosia.org") return true;
  // Yahoo search only: search.yahoo.com or <cc>.search.yahoo.com.
  if (normalized === "search.yahoo.com") return true;
  if (labels.length === 4 && labels[1] === "search" && labels[2] === "yahoo" && labels[3] === "com") return true;
  return false;
}

function deriveOriginClass({ utm_source, utm_medium, referrer } = {}) {
  if (utm_source || utm_medium) return "campaign";
  const host = referrerHost(referrer);
  if (!host || ownHosts().has(host) || host === "localhost" || host === "127.0.0.1") return "direct_or_unknown";
  if (isSearchEngineHost(host)) return "search_organic";
  return "referral";
}

/**
 * Keep only allowlisted attribution keys. Drops arbitrary query params and PII.
 */
function pickAttribution(data) {
  const src = data && typeof data === "object" ? data : {};
  const out = {};
  for (const key of ATTR_ALLOWLIST) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    const max = MAX_FIELD[key] || 180;
    const v = key === "session_id"
      ? normalizeSessionId(src[key])
      : key === "tema"
        ? sanitizeAttributionTopic(src[key], max)
        : ATTR_LOCATION_KEYS.has(key)
          ? sanitizeAttributionLocation(src[key], max, key)
          : sanitizeAttributionValue(src[key], max, key);
    if (v) out[key] = v;
  }
  return out;
}

const ALLOWED_JOURNEYS = new Set(["contrato", "edital", "operacao", "conteudo", "pseo", "outro"]);
const ALLOWED_ORIGINS = new Set([
  "https://confenge.com.br",
  "https://www.confenge.com.br",
  "https://confenge.netlify.app",
  "http://127.0.0.1:8765",
  "http://127.0.0.1:8766",
  "http://localhost:8765",
  "http://localhost:8766",
]);

function stripControl(s) {
  return String(s || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(s, n) {
  const t = stripControl(s);
  return t.length > n ? t.slice(0, n) : t;
}

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return "";
  return digits;
}

function normalizeEmail(raw) {
  const e = clamp(raw, MAX_FIELD.email).toLowerCase();
  if (!e) return "";
  // Practical RFC-ish check — server-side only
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "";
  if (e.length > 180) return "";
  return e;
}

function normalizeJourney(raw, estagio) {
  const j = clamp(raw, MAX_FIELD.jornada).toLowerCase();
  if (ALLOWED_JOURNEYS.has(j)) return j;
  const e = clamp(estagio, MAX_FIELD.estagio).toLowerCase();
  if (/edital|proposta|licita/.test(e)) return "edital";
  if (/contrato|glosa|medi[cç][aã]o|aditivo|reequil|atraso|san[cç]/.test(e)) return "contrato";
  if (/diagn[oó]stico|opera[cç][aã]o|diretoria|b2g/.test(e)) return "operacao";
  // Sem sinal, nao adivinhe: classificar como "operacao" rebaixava em silencio
  // um contrato urgente para a jornada de menor urgencia.
  return "outro";
}

function looksLikeBinaryPayload(raw) {
  if (raw == null) return false;
  const text = typeof raw === "string" ? raw : String(raw);
  if (!text) return false;
  if (text.includes("\0")) return true;
  if (text.includes(EICAR_SIGNATURE)) return true;
  if (text.startsWith("%PDF") || text.startsWith("PK\u0003\u0004") || text.startsWith("MZ")) return true;
  if (/^data:[^;]+;base64,/i.test(text.slice(0, 96))) return true;
  return false;
}

function contentTypeRejectsFiles(contentType) {
  const ct = String(contentType || "").toLowerCase();
  if (!ct) return false;
  if (ct.includes("multipart/")) return true;
  if (ct.includes("application/octet-stream")) return true;
  if (ct.includes("application/pdf") || ct.includes("application/zip")) return true;
  if (ct.startsWith("image/") || ct.startsWith("audio/") || ct.startsWith("video/")) return true;
  if (ct.includes("application/vnd")) return true;
  return false;
}

function isBufferLike(value) {
  return (
    Buffer.isBuffer(value) ||
    (value && typeof value === "object" && value.type === "Buffer" && Array.isArray(value.data))
  );
}

function rejectFileShape(raw, contentType, data) {
  if (contentTypeRejectsFiles(contentType)) {
    return { ok: false, error: "file_payload_rejected", status: 415 };
  }
  if (looksLikeBinaryPayload(raw)) {
    return { ok: false, error: "file_payload_rejected", status: 415 };
  }
  if (data && typeof data === "object") {
    for (const key of Object.keys(data)) {
      const lower = String(key).toLowerCase();
      if (FILE_FIELD_KEYS.has(lower) || /\.(pdf|xlsx?|docx?|zip|exe|bin)$/i.test(lower)) {
        return { ok: false, error: "file_payload_rejected", status: 415 };
      }
      const value = data[key];
      if (isBufferLike(value)) {
        return { ok: false, error: "file_payload_rejected", status: 415 };
      }
      if (typeof value === "string" && looksLikeBinaryPayload(value)) {
        return { ok: false, error: "file_payload_rejected", status: 415 };
      }
    }
  }
  return null;
}

function leadHasFilePayload(record) {
  if (!record || typeof record !== "object") return false;
  return Boolean(rejectFileShape("", "", record));
}

function titularExport(record) {
  if (leadHasFilePayload(record)) {
    const err = new Error("file_payload_forbidden");
    err.code = "file_payload_forbidden";
    throw err;
  }
  const exported = {
    lead_id: record.lead_id || null,
    received_at: record.received_at || null,
    jornada: record.jornada || null,
    estagio: record.estagio || null,
    document_intent: record.document_intent || null,
    // The record holds what the subject asked for; a subject export that omits
    // it would be less honest than the record it describes.
    intent_kind: record.intent_kind || null,
    canal_seguro: Boolean(record.canal_seguro),
    channel_status: record.document_intent ? "canal escolhido posteriormente" : null,
    source: record.source || "CONFENGE_WEB",
  };
  for (const key of Object.keys(exported)) {
    if (FILE_FIELD_KEYS.has(key.toLowerCase())) {
      const err = new Error("file_payload_forbidden");
      err.code = "file_payload_forbidden";
      throw err;
    }
  }
  return exported;
}

function parseBody(event) {
  if (!event || event.body == null) return { ok: true, data: {} };
  let raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : String(event.body);
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return { ok: false, error: "payload_too_large", status: 413 };
  }
  const headers = event.headers || {};
  const ct = String(headers["content-type"] || headers["Content-Type"] || "").toLowerCase();
  const early = rejectFileShape(raw, ct, null);
  if (early) return early;

  let data;
  if (ct.includes("application/json")) {
    try {
      const parsed = JSON.parse(raw || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed;
      } else {
        return { ok: false, error: "invalid_json", status: 400 };
      }
    } catch {
      return { ok: false, error: "invalid_json", status: 400 };
    }
  } else if (!ct || ct.includes("application/x-www-form-urlencoded") || ct.includes("text/plain")) {
    const out = {};
    for (const part of raw.split("&")) {
      if (!part) continue;
      const eq = part.indexOf("=");
      const k = eq === -1 ? part : part.slice(0, eq);
      const v = eq === -1 ? "" : part.slice(eq + 1);
      try {
        out[decodeURIComponent(k.replace(/\+/g, " "))] = decodeURIComponent(v.replace(/\+/g, " "));
      } catch {
        /* skip bad pair */
      }
    }
    data = out;
  } else {
    return { ok: false, error: "unsupported_media_type", status: 415 };
  }
  const after = rejectFileShape(raw, ct, data);
  if (after) return after;
  return { ok: true, data };
}

function isHoneypot(data) {
  const hp = data["empresa-site"] || data.bot_field || data.website || data.fax;
  return Boolean(hp && String(hp).trim());
}

/**
 * Owner-approved non-catalog action identities (intent-action matrix).
 * They are deliberately absent from the frozen catalog snapshot, so the price
 * authority is the matrix `authorized_amount_cents`, not the offer registry.
 */
function nonCatalogAction(offerId) {
  if (!offerId) return null;
  try {
    const matrix = require("../../../scripts/conversion/matrix.cjs");
    const route = matrix
      .listRoutes()
      .find((r) => r && r.offer_id === offerId && r.authorized_amount_cents != null);
    return route || null;
  } catch {
    return null;
  }
}

function assertOfferTermsAndPrice(data) {
  const offerId = clamp(data.offer_id, MAX_FIELD.offer_id);
  const termsId = clamp(data.terms_id || data.terms_version, MAX_FIELD.terms_id);
  const amountRaw = data.amount_cents;
  if (!offerId && !termsId && (amountRaw == null || amountRaw === "")) {
    return { ok: true, offer_id: "", terms_id: "" };
  }
  const action = nonCatalogAction(offerId);
  if (action) {
    // Non-catalog action: no catalog terms version applies before human acceptance.
    if (termsId) {
      return {
        ok: false,
        status: 422,
        error: "terms_version_mismatch",
        message: "Os termos submetidos não coincidem com o registro vigente.",
      };
    }
    if (amountRaw != null && amountRaw !== "") {
      const cents = Number(amountRaw);
      if (!Number.isFinite(cents) || cents !== action.authorized_amount_cents) {
        return {
          ok: false,
          status: 422,
          error: "price_mismatch",
          message: "O valor submetido não coincide com o registro.",
        };
      }
    }
    return { ok: true, offer_id: offerId, terms_id: "" };
  }
  let registry;
  try {
    registry = require("../../../scripts/offers/registry.cjs");
  } catch {
    return {
      ok: false,
      status: 422,
      error: "offer_registry_unavailable",
      message: "Registro de oferta indisponível.",
    };
  }
  const canonicalTerms = registry.AUTHORITY.terms_version;
  if (termsId && termsId !== canonicalTerms) {
    return {
      ok: false,
      status: 422,
      error: "terms_version_mismatch",
      message: "Os termos submetidos não coincidem com o registro vigente.",
    };
  }
  if (!offerId) {
    return {
      ok: false,
      status: 422,
      error: "offer_id_required",
      message: "Informe o offer_id do registro.",
    };
  }
  const offer = registry.getOffer(offerId);
  if (!offer) {
    return {
      ok: false,
      status: 422,
      error: "offer_id_unknown",
      message: "Oferta inexistente no registro.",
    };
  }
  if (amountRaw != null && amountRaw !== "") {
    const cents = Number(amountRaw);
    if (!Number.isFinite(cents) || cents !== offer.amount_cents) {
      return {
        ok: false,
        status: 422,
        error: "price_mismatch",
        message: "O valor submetido não coincide com o registro.",
      };
    }
  }
  return { ok: true, offer_id: offerId, terms_id: termsId || canonicalTerms };
}

/**
 * Validate and normalize inbound lead payload.
 * @returns {{ ok: true, lead: object } | { ok: false, status: number, error: string, message: string }}
 */
function validateAndNormalize(data) {
  if (isHoneypot(data)) {
    return { ok: true, honeypot: true };
  }

  const conflictParties = adaptiveIntake.rejectConflictParties(data);
  if (conflictParties) return conflictParties;

  const adaptiveResult = adaptiveIntake.validateAdaptiveIntake(data);
  if (adaptiveResult.handled && !adaptiveResult.ok) return adaptiveResult;
  const adaptiveFields = adaptiveResult.handled && adaptiveResult.ok ? adaptiveResult.fields : null;

  const offerCheck = assertOfferTermsAndPrice(data);
  if (!offerCheck.ok) return offerCheck;
  const deliverableCheck = assertDeliverableSelection(data.deliverable_id);
  if (!deliverableCheck.ok) return deliverableCheck;
  const qualificationDeliverableId = isGenericDeliverablesHandraise(data)
    ? null
    : deliverableCheck.deliverable_id;
  let licitacaoCheck = { ok: true, qualification: null };
  let eightCheck = { ok: true, qualification: null };
  let contractCheck = { ok: true, qualification: null };
  // A qualificação descreve a necessidade; ela NÃO decide se o contato é
  // recebido. Documentação incompleta, contrato ainda sem número e prazo mais
  // curto que o piso publicado passaram a ser LACUNA REGISTRADA, nunca veto de
  // recebimento: antes devolviam 422 sem gravar nada, e o cliente apresentava
  // isso ao visitante como pane de servidor. O piso material continua publicado
  // na própria rota; o que acabou foi descartar a pessoa que chega fora dele.
  // Isto vale SOMENTE para as três qualificações de produto. Rejeições
  // estruturais e de segurança (payload, origem, honeypot, mídia) continuam
  // fail-closed e inalteradas.
  const qualificationGaps = [];
  if (!adaptiveFields) {
    licitacaoCheck = assertLicitacaoQualification(data, qualificationDeliverableId);
    if (!licitacaoCheck.ok) qualificationGaps.push(licitacaoCheck.error);
    eightCheck = assertEightProductQualification(data, qualificationDeliverableId);
    if (!eightCheck.ok) qualificationGaps.push(eightCheck.error);
    contractCheck = assertContractDefenseQualification(data, qualificationDeliverableId);
    if (!contractCheck.ok) qualificationGaps.push(contractCheck.error);
  }
  const productQualification = licitacaoCheck.qualification || eightCheck.qualification || contractCheck.qualification;
  // Fallback ao valor bruto: numa lacuna, productQualification é null e um
  // prazo curto -- exatamente o caso que mais precisa de resposta rápida --
  // desapareceria do registro. Só valores dentro do enum publicado (ou datas
  // canônicas) sobrevivem; texto livre fora do enum continua descartado.
  // Datas: rawIsoDate só exige o formato canônico. Um prazo já vencido ou um
  // corte igual/posterior ao prazo (as condições que antes geravam 422)
  // sobrevive como CONTEXTO BRUTO, por decisão do fundador (AGENTS.md:
  // demanda não confirmada é NEEDS_CONTEXT, não promessa nem descarte). O
  // motivo fica em qualification_gaps para a triagem humana ler; o piso de
  // prazo publicado continua sendo confirmado antes do aceite técnico.
  const rawEnum = (value, allowed, max) => {
    const v = clamp(value, max);
    return allowed.has(v) ? v : "";
  };
  const rawIsoDate = (value, max) => {
    const v = clamp(value, max);
    return isCanonicalIsoDate(v) ? v : "";
  };
  const rawLotCount = () => {
    const v = clamp(data.lot_count, MAX_FIELD.lot_count);
    return /^\d{1,3}$/.test(v) && Number(v) >= 1 ? Number(v) : null;
  };
  const gapFallback = qualificationGaps.length > 0;

  // Radar Decisório purchase parameters. Server-side, fail-closed: the browser
  // check is a convenience, this one is the contract.
  let radarParams = null;
  let radar = null;
  try {
    radar = require("./radar-params.cjs");
  } catch {
    radar = null;
  }
  if (radar && radar.isRadarSubmission(data)) {
    if (offerCheck.offer_id && offerCheck.offer_id !== radar.RADAR_OFFER_ID) {
      return {
        ok: false,
        status: 422,
        error: "radar_offer_mismatch",
        message: "A oferta submetida não corresponde ao Radar Decisório.",
      };
    }
    const check = radar.validateRadarParams(data);
    if (!check.ok) return check;
    radarParams = check.params;
    offerCheck.offer_id = radar.RADAR_OFFER_ID;
  }

  const nome = clamp(data.nome || data.name, MAX_FIELD.nome);
  // Presenca e validade sao coisas diferentes. normalizePhone e normalizeEmail
  // devolvem "" nos dois casos, e ate 2026-08-31 o servidor tratava os dois
  // como o mesmo: um WhatsApp digitado errado era descartado em silencio, e o
  // visitante que so tinha informado esse canal recebia "Informe WhatsApp ou
  // e-mail para retorno." Ele TINHA informado. A mensagem culpava o visitante
  // por um campo que ele preencheu, e nao dizia o que estava errado.
  const rawTelefone = clamp(data.telefone || data.whatsapp || data.phone || data.tel, MAX_FIELD.telefone);
  const rawEmail = clamp(data.email, MAX_FIELD.email);
  const telefone = normalizePhone(rawTelefone);
  const normalizedEmail = normalizeEmail(rawEmail);
  // On a Radar order the delivery e-mail is also the contact channel.
  const email = normalizedEmail || (radarParams ? radarParams.email_entrega : "");
  const familyStage = deliverableCheck.service_family_stage || "";
  const informedEstagio = adaptiveFields
    ? adaptiveFields.estagio
    : familyStage || clamp(data.estagio || data.tipo_demanda || data.demand_type, MAX_FIELD.estagio);
  // Não saber qual serviço precisa nunca elimina uma pessoa válida: sem
  // estágio, o registro recebe o mesmo valor que a home oferece a quem quer
  // ser orientado e é marcado NEEDS_CONTEXT. Contato e consentimento continuam
  // obrigatórios abaixo; a jornada é derivada do valor efetivo.
  const estagioMissing = !adaptiveFields && !informedEstagio;
  // Decisao C1 (BOFU-FECHAMENTO-20260919): o evento `planejamento_contratacao`
  // identifica o lado contratante; o estagio gravado passa a ser o do orgao,
  // e nao o asset id oculto do hub, para o handoff, o e-mail e o by_service
  // distinguirem orgao e contratada. Vale com ou sem o CTA que pre-preenche.
  const contractEventEffective = contractCheck.qualification?.contract_event
    || (gapFallback ? rawEnum(data.contract_event, CONTRACT_EVENTS, MAX_FIELD.contract_event) : "");
  const planningSide = !adaptiveFields && contractEventEffective === CONTRACT_EVENT_PLANNING;
  // Estagio "pegajoso": o CTA do bloco do orgao grava o hidden
  // `planejamento-contratacao-publica`; se o visitante troca depois o evento
  // por um da contratada, o estagio do orgao nao pode seguir no registro (o
  // handoff diria "situacao declarada" do orgao e by_service contaria o lado
  // errado). Com um evento efetivo que nao e o do orgao, recai na identidade
  // do formulario (asset_id) ou no padrao de quem ainda nao sabe. Evento
  // ausente ou invalido nao rebaixa: o que o visitante declarou fica.
  const stickyPlanningEstagio = !adaptiveFields
    && informedEstagio === ESTAGIO_PLANEJAMENTO_CONTRATACAO
    && Boolean(contractEventEffective)
    && contractEventEffective !== CONTRACT_EVENT_PLANNING;
  // Mesmo sanitizador do `asset_id` gravado, para o registro nao ficar com
  // estagio != asset_id quando o sanitizador descarta algo.
  const demotedEstagio = stickyPlanningEstagio
    ? sanitizeAttributionValue(data.asset_id, MAX_FIELD.asset_id, "asset_id")
    : informedEstagio;
  const estagioDefaulted = estagioMissing || (stickyPlanningEstagio && !demotedEstagio);
  const estagio = planningSide
    ? ESTAGIO_PLANEJAMENTO_CONTRATACAO
    : (estagioDefaulted ? ESTAGIO_UNKNOWN_SERVICE : demotedEstagio);
  const jornada = adaptiveFields
    ? adaptiveFields.jornada
    : normalizeJourney(familyStage ? "" : data.jornada || data.journey, estagio);
  const consentRaw = data.consentimento ?? data.consent ?? data.lgpd;
  const consentimento =
    consentRaw === true ||
    consentRaw === "true" ||
    consentRaw === "on" ||
    consentRaw === "1" ||
    consentRaw === "yes" ||
    consentRaw === "sim";

  if (!nome || nome.length < 2) {
    return {
      ok: false,
      status: 400,
      error: "validation",
      message: "Informe seu nome.",
    };
  }
  // Recusar antes de "faltou canal": quem digitou algo precisa saber o que
  // estava errado no que digitou, nao ser informado de que nao digitou nada.
  if (rawTelefone && !telefone) {
    return {
      ok: false,
      status: 400,
      error: "validation",
      field: "telefone",
      message:
        "WhatsApp invalido. Informe DDD e numero, com 10 ou 11 digitos. Exemplo: (48) 98834-4559.",
    };
  }
  if (rawEmail && !normalizedEmail) {
    return {
      ok: false,
      status: 400,
      error: "validation",
      field: "email",
      message:
        "E-mail invalido. Informe um endereco completo, como nome@empresa.com.br.",
    };
  }
  if (!telefone && !email) {
    return {
      ok: false,
      status: 400,
      error: "validation",
      message: "Informe WhatsApp ou e-mail para retorno.",
    };
  }
  if (!estagio) {
    return {
      ok: false,
      status: 400,
      error: "validation",
      message: "Informe o tipo de necessidade.",
    };
  }
  if (!consentimento) {
    return {
      ok: false,
      status: 400,
      error: "consent",
      message: "É necessário autorizar o uso dos dados para retorno.",
    };
  }
  // analytics_consent / marketing_consent / cookie_consent never substitute
  // this request-processing consent and never block persist. Privilege claims
  // from the browser (paid_priority, approved, authorized, …) are not copied
  // onto the lead and grant no commercial status.

  const lead = {
    nome,
    telefone: telefone || null,
    email: email || null,
    empresa: clamp(data.empresa, MAX_FIELD.empresa) || null,
    estagio,
    jornada,
    urgencia: adaptiveFields
      ? adaptiveFields.urgency
      : clamp(data.urgencia, MAX_FIELD.urgencia) || null,
    mensagem: adaptiveFields ? null : clamp(data.mensagem || data.message, MAX_FIELD.mensagem) || null,
    consentimento: true,
    origem: sanitizeAttributionLocation(data.origem, MAX_FIELD.origem, "origem") || null,
    // JOR-03 / TAREFAS-01: the subject the visitor arrived with. `origem` keeps
    // its own semantics (route slug or attributed landing); `tema` is what the
    // operator reads to know which article or case brought the request.
    tema: sanitizeAttributionTopic(data.tema, MAX_FIELD.tema) || null,
    landing_page:
      sanitizeAttributionLocation(
        data.landing_page || data.landing || data.landing_url,
        MAX_FIELD.landing_page,
        "landing_page",
      ) || null,
    landing_url:
      sanitizeAttributionLocation(
        data.landing_url || data.landing_page,
        MAX_FIELD.landing_url,
        "landing_url",
      ) || null,
    referrer:
      sanitizeAttributionLocation(data.referrer || data.ref, MAX_FIELD.referrer, "referrer") || null,
    utm_source: sanitizeAttributionValue(data.utm_source, MAX_FIELD.utm_source, "utm_source") || null,
    utm_medium: sanitizeAttributionValue(data.utm_medium, MAX_FIELD.utm_medium, "utm_medium") || null,
    utm_campaign:
      sanitizeAttributionValue(data.utm_campaign, MAX_FIELD.utm_campaign, "utm_campaign") || null,
    utm_content:
      sanitizeAttributionValue(data.utm_content, MAX_FIELD.utm_content, "utm_content") || null,
    utm_term: sanitizeAttributionValue(data.utm_term, MAX_FIELD.utm_term, "utm_term") || null,
    content_cluster:
      sanitizeAttributionValue(
        data.content_cluster,
        MAX_FIELD.content_cluster,
        "content_cluster",
      ) || null,
    route_family: sanitizeAttributionValue(data.route_family, MAX_FIELD.route_family, "route_family") || null,
    cta_id: sanitizeAttributionValue(data.cta_id, MAX_FIELD.cta_id, "cta_id") || null,
    asset_id: sanitizeAttributionValue(data.asset_id, MAX_FIELD.asset_id, "asset_id") || null,
    correlation_id: sanitizeAttributionValue(data.correlation_id, MAX_FIELD.correlation_id, "correlation_id") || null,
    session_id: normalizeSessionId(data.session_id || data.sid) || null,
    analysis_id: sanitizeAttributionValue(data.analysis_id, MAX_FIELD.analysis_id, "analysis_id") || null,
    evidence_pack_version: sanitizeAttributionValue(
      data.evidence_pack_version,
      MAX_FIELD.evidence_pack_version,
      "evidence_pack_version",
    ) || null,
    asset_family: sanitizeAttributionValue(data.asset_family, MAX_FIELD.asset_family, "asset_family") || null,
    query_class: sanitizeAttributionValue(data.query_class, MAX_FIELD.query_class, "query_class") || null,
    deliverable_id: deliverableCheck.deliverable_id,
    analysis_cutoff:
      productQualification?.analysis_cutoff
      || (gapFallback ? rawIsoDate(data.analysis_cutoff, MAX_FIELD.analysis_cutoff) : "")
      || null,
    opportunity_deadline:
      productQualification?.opportunity_deadline
      || (gapFallback ? rawIsoDate(data.opportunity_deadline, MAX_FIELD.opportunity_deadline) : "")
      || null,
    contract_event:
      productQualification?.contract_event
      || (gapFallback ? rawEnum(data.contract_event, CONTRACT_EVENTS, MAX_FIELD.contract_event) : "")
      || null,
    contract_stage:
      productQualification?.contract_stage
      || (gapFallback ? rawEnum(data.contract_stage, CONTRACT_STAGES, MAX_FIELD.contract_stage) : "")
      || null,
    ...(adaptiveFields ? {} : procurementContext(data)),
    contract_value_band:
      productQualification?.contract_value_band
      || (gapFallback ? rawEnum(data.contract_value_band, CONTRACT_VALUE_BANDS, MAX_FIELD.contract_value_band) : "")
      || null,
    lot_count: productQualification?.lot_count || (gapFallback ? rawLotCount() : null) || null,
    execution_regime:
      productQualification?.execution_regime
      || (gapFallback ? rawEnum(data.execution_regime, EXECUTION_REGIMES, MAX_FIELD.execution_regime) : "")
      || null,
    decision_intent:
      productQualification?.decision_intent
      || (gapFallback
        ? rawEnum(data.decision_intent, LICITACAO_DECISION_INTENTS, MAX_FIELD.decision_intent)
          || rawEnum(data.decision_intent, EXPANSION_DECISION_INTENTS, MAX_FIELD.decision_intent)
        : "")
      || null,
    faixa_contrato: pickEnum(data.faixa_contrato, ICP_TICKET_BANDS, MAX_FIELD.faixa_contrato),
    risco_em_jogo: pickEnum(data.risco_em_jogo, ICP_RISK_BANDS, MAX_FIELD.risco_em_jogo),
    frequencia: pickEnum(data.frequencia, ICP_FREQUENCY, MAX_FIELD.frequencia),
    maturidade_documental: pickEnum(data.maturidade_documental, ICP_DOCS, MAX_FIELD.maturidade_documental),
    capacidade_interna: pickEnum(data.capacidade_interna, ICP_CAPACITY, MAX_FIELD.capacidade_interna),
    turnstile_token: clamp(data["cf-turnstile-response"] || data.turnstile_token, MAX_FIELD.turnstile_token) || null,
    idempotency_key: clamp(data.idempotency_key || data.idempotencyKey, MAX_FIELD.idempotency_key) || null,
    public_contract_id: productQualification?.public_contract_id || clamp(data.public_contract_id, MAX_FIELD.public_contract_id) || null,
    public_entity_id: clamp(data.public_entity_id, MAX_FIELD.public_entity_id) || null,
    public_id_slug: clamp(data.public_id_slug, MAX_FIELD.public_id_slug) || null,
    // Identidade estruturada só com CNPJ VALIDADO. Decisão explícita: isto vale
    // para TODOS os caminhos (lacuna ou não), porque o fallback anterior era o
    // mesmo `clamp(data.cnpj)` sem guarda em qualquer formulário; com a lacuna
    // de qualificação passando a ser recebida (em vez de 422), ele passou a
    // gravar texto livre no campo estruturado, na chave de idempotência e no
    // handoff Warmbly. Texto livre e dígitos inválidos viram null; um CNPJ
    // válido sobrevive normalizado (14 dígitos), mesmo fora dos oito produtos.
    cnpj: eightCheck.qualification?.cnpj || validatedCnpjOrNull(data.cnpj || data.cnpj14),
    offer_id: offerCheck.offer_id || null,
    terms_id: offerCheck.terms_id || null,
    radar_params: radarParams,
    source: "CONFENGE_WEB",
    document_intent: DOCUMENT_INTENT_ALLOWED.has(clamp(data.document_intent, MAX_FIELD.document_intent))
      ? clamp(data.document_intent, MAX_FIELD.document_intent)
      : null,
    intent_kind: INTENT_KIND_ALLOWED.has(clamp(data.intent_kind, MAX_FIELD.intent_kind))
      ? clamp(data.intent_kind, MAX_FIELD.intent_kind)
      : null,
    canal_seguro:
      data.canal_seguro === true ||
      data.canal_seguro === "true" ||
      data.canal_seguro === "on" ||
      data.canal_seguro === "1" ||
      data.canal_seguro === "yes" ||
      data.canal_seguro === "sim" ||
      clamp(data.document_intent, MAX_FIELD.document_intent) === "secure_channel_request",
  };

  // Server-derived, from sanitized fields only; see deriveOriginClass.
  lead.origin_class = deriveOriginClass(lead);
  // FAMILIAS-PUBLICAS-05: os pilares congelados capturam sem deliverable_id
  // oculto; a entrega e derivada da rota (registro), so para o registro e o
  // handoff, DEPOIS das qualificacoes de produto (que continuam lendo apenas
  // o id postado: um pilar sem campos de evento nao vira lacuna).
  if (!lead.deliverable_id && !adaptiveFields) {
    lead.deliverable_id = deriveDeliverableIdFromRoute(lead) || null;
  }

  if (adaptiveFields) {
    lead.adaptive_intake = true;
    lead.need_code = adaptiveFields.need_code;
    lead.nucleus_id = adaptiveFields.nucleus_id;
    lead.offer_candidate_id = adaptiveFields.offer_candidate_id;
    lead.source_asset_id = adaptiveFields.source_asset_id;
    lead.source_origin_asset_id = adaptiveFields.source_origin_asset_id || null;
    lead.source_origin_route_family = adaptiveFields.source_origin_route_family || null;
    lead.landing_family = adaptiveFields.landing_family;
    lead.city_class = adaptiveFields.city_class;
    lead.site_class = adaptiveFields.site_class;
    lead.location_material = adaptiveFields.location_material;
    lead.city = adaptiveFields.city;
    lead.uf = adaptiveFields.uf;
    lead.decision_role = adaptiveFields.decision_role;
    lead.pessoa_tipo = adaptiveFields.pessoa_tipo;
    lead.canal_preferido = adaptiveFields.canal_preferido;
    lead.why_now = adaptiveFields.why_now;
    lead.desired_decision = adaptiveFields.desired_decision;
    lead.document_availability_class = adaptiveFields.document_availability_class;
    lead.qualification_state = adaptiveFields.qualification_state;
    lead.conflict_status = adaptiveFields.conflict_status;
    lead.conflict_reference = adaptiveFields.conflict_reference;
    lead.intake_contract_version = adaptiveFields.intake_contract_version;
    lead.intake_pin_hash = adaptiveFields.intake_pin_hash;
    lead.taxonomy_version = adaptiveFields.taxonomy_version;
    lead.offer_catalog_version = adaptiveFields.offer_catalog_version;
    lead.admission_policy_version = adaptiveFields.admission_policy_version;
    lead.admission_policy_id = adaptiveFields.admission_policy_id;
    lead.admission_policy_hash = adaptiveFields.admission_policy_hash;
    lead.governance_source_sha = adaptiveFields.governance_source_sha;
    lead.outbound_eligible = false;
    lead.auto_send = false;
    lead.sensitive_docs_ack = true;
    lead.claim_stage = adaptiveFields.claim_stage || null;
    lead.valuation_purpose = adaptiveFields.valuation_purpose || null;
    lead.inspection_window = adaptiveFields.inspection_window || null;
    lead.property_class = adaptiveFields.property_class || null;
    lead.work_type = adaptiveFields.work_type || null;
    lead.work_stage = adaptiveFields.work_stage || null;
    lead.project_status = adaptiveFields.project_status || null;
    lead.budget_class = adaptiveFields.budget_class || null;
    lead.bim_status = adaptiveFields.bim_status || null;
    lead.establishment_class = adaptiveFields.establishment_class || null;
    lead.risk_class = adaptiveFields.risk_class || null;
    lead.sst_doc_class = adaptiveFields.sst_doc_class || null;
    lead.certame_stage = adaptiveFields.certame_stage || null;
    lead.contract_relation = adaptiveFields.contract_relation || null;
    lead.entity_class = adaptiveFields.entity_class || null;
  }

  // Uma lacuna de qualificação (ou um visitante que ainda não sabe qual
  // serviço precisa) marca o registro para leitura humana; ela não impede o
  // recebimento. NEEDS_CONTEXT já existe no contrato (ver deriveQualification
  // em adaptive-intake): nenhum enum novo é criado aqui.
  if (!lead.qualification_state && (qualificationGaps.length || estagioDefaulted)) {
    lead.qualification_state = "NEEDS_CONTEXT";
  }
  // Por que NEEDS_CONTEXT: os códigos de erro das checagens de produto que
  // falharam, mais `estagio_unknown_service` quando o visitante não informou
  // o serviço (nunca o valor informado, nunca PII). Ausente num registro
  // limpo. Fica fora do material de idempotência: a chave é estável mesmo
  // quando a mesma lacuna é reenviada.
  const gapReasons = [...new Set([...qualificationGaps, ...(estagioDefaulted ? ["estagio_unknown_service"] : [])])];
  if (gapReasons.length) {
    lead.qualification_gaps = gapReasons;
  }

  return { ok: true, honeypot: false, lead };
}

/**
 * Lead id generation.
 * When `deterministic: true` (preferred for explicit idempotency keys), same seed
 * always yields the same id across retries and concurrent durable-store writes.
 */
function generateLeadId(seedMaterial, options = {}) {
  if (options && options.deterministic) {
    const digest = crypto
      .createHash("sha256")
      .update(String(seedMaterial || "empty"))
      .digest("hex");
    return `lead-${digest.slice(0, 27)}`;
  }
  const material = [
    seedMaterial || "",
    String(Date.now()),
    crypto.randomBytes(16).toString("hex"),
  ].join("|");
  const digest = crypto.createHash("sha256").update(material).digest("hex");
  return `lead-${digest.slice(0, 27)}`;
}

function idempotencyKeyFor(lead, explicit) {
  if (explicit) {
    // Normalize: strip accidental idk: prefix double-wrap; clamp length
    let e = String(explicit).trim();
    if (e.toLowerCase().startsWith("idk:")) e = e.slice(4);
    e = e.slice(0, 120);
    if (e) return `idk:${e}`;
  }
  // 15-minute window bucket to collapse double-submit
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  // A Radar submission is an order specification, not only a contact lead.
  // Two configurations from the same person in the same bucket must not
  // collapse into one record and silently discard the later parameters.
  // Normalize the set-valued field so a retry with a different checkbox order
  // still converges to the same key.
  const radar = lead && lead.radar_params;
  const radarMaterial = radar
    ? JSON.stringify({
        schema: radar.schema || "",
        offer_id: radar.offer_id || "",
        cnpj: radar.cnpj || "",
        recorte: radar.recorte || "",
        uf: radar.uf || "",
        cidade_base: radar.cidade_base || "",
        raio_km: radar.raio_km == null ? "" : radar.raio_km,
        segmentos: Array.isArray(radar.segmentos)
          ? [...new Set(radar.segmentos.map(String))].sort()
          : [],
        acervo_tecnico: radar.acervo_tecnico || "",
        email_entrega: radar.email_entrega || "",
      })
    : "";
  const productMaterial = lead?.deliverable_id
    ? JSON.stringify({
        deliverable_id: lead.deliverable_id,
        cnpj: lead.cnpj || "",
        public_contract_id: lead.public_contract_id || "",
        analysis_cutoff: lead.analysis_cutoff || "",
        opportunity_deadline: lead.opportunity_deadline || "",
        contract_event: lead.contract_event || "",
        contract_stage: lead.contract_stage || "",
        contract_value_band: lead.contract_value_band || "",
        lot_count: lead.lot_count == null ? "" : lead.lot_count,
        execution_regime: lead.execution_regime || "",
        decision_intent: lead.decision_intent || "",
      })
    : "";
  const adaptiveMaterial = lead?.nucleus_id
    ? JSON.stringify({
        need_code: lead.need_code || "",
        nucleus_id: lead.nucleus_id,
        offer_candidate_id: lead.offer_candidate_id || "",
        qualification_state: lead.qualification_state || "",
        conflict_status: lead.conflict_status || "",
        location_material: Boolean(lead.location_material),
        city: lead.city || "",
        uf: lead.uf || "",
        admission_policy_hash: lead.admission_policy_hash || "",
      })
    : "";
  const material = [
    lead.nome,
    lead.telefone || "",
    lead.email || "",
    lead.jornada,
    lead.estagio,
    radarMaterial,
    productMaterial,
    adaptiveMaterial,
    String(bucket),
  ].join("|");
  return `auto:${crypto.createHash("sha256").update(material).digest("hex").slice(0, 32)}`;
}

function clientIp(event) {
  const h = event.headers || {};
  const xff = h["x-forwarded-for"] || h["X-Forwarded-For"] || "";
  if (xff) return String(xff).split(",")[0].trim().slice(0, 80);
  return String(h["client-ip"] || h["x-nf-client-connection-ip"] || h["x-real-ip"] || "").slice(0, 80) || "unknown";
}

function technicalFingerprint(event, lead) {
  const h = event.headers || {};
  const ua = String(h["user-agent"] || h["User-Agent"] || "").slice(0, 200);
  const al = String(h["accept-language"] || h["Accept-Language"] || "").slice(0, 80);
  const material = [clientIp(event), ua, al, lead?.jornada || ""].join("|");
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 16);
}

function probeAuthorized(event, env = process.env) {
  const h = (event && event.headers) || {};
  const provided = String(h["x-confenge-probe"] || h["X-Confenge-Probe"] || "");
  const expected = String(env.LEAD_PROBE_SECRET || "");
  // This credential bypasses the human-only Turnstile challenge, so keep the
  // implementation aligned with the documented 32+ character requirement.
  if (!provided || expected.length < 32) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function originAllowed(event) {
  const h = event.headers || {};
  const origin = String(h.origin || h.Origin || "").trim();
  const referer = String(h.referer || h.Referer || "").trim();
  const probe = probeAuthorized(event);
  if (origin && ALLOWED_ORIGINS.has(origin)) return { ok: true, origin, probe };
  // Same-site form posts may omit Origin; allow if Referer is our host
  if (!origin && referer) {
    try {
      const u = new URL(referer);
      const base = `${u.protocol}//${u.host}`;
      if (ALLOWED_ORIGINS.has(base)) return { ok: true, origin: base, probe };
    } catch {
      /* ignore */
    }
  }
  // Netlify scheduled/synthetic probes without browser origin (ops only when header set)
  if (probe) {
    return { ok: true, origin: "https://confenge.com.br", probe: true };
  }
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return { ok: false, status: 403, error: "origin_denied", message: "Origem não autorizada." };
  }
  // Missing origin on POST from non-browser tools: deny in production-like config
  if (process.env.LEAD_REQUIRE_ORIGIN === "1" && !origin) {
    return { ok: false, status: 403, error: "origin_required", message: "Origem não autorizada." };
  }
  return { ok: true, origin: origin || "https://confenge.com.br" };
}

function corsHeaders(origin) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://confenge.com.br";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Idempotency-Key, X-Confenge-Probe",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

// CONTEXTO-CAPTURA-02 (BOFU-FECHAMENTO-20260919): sem JavaScript (ou com o
// bundle bloqueado), o navegador faz o POST nativo do formulario e recebia o
// JSON cru de erro como pagina. Uma requisicao que chega como envio nativo --
// urlencoded (ou sem content-type) ou pedindo text/html -- e SEM o token do
// Turnstile (que so existe com JavaScript) recebe um 4xx text/html minimo com
// os canais fixos do site. Clientes JS (JSON, ou token presente) continuam
// recebendo exatamente a resposta JSON de antes. Nada do corpo enviado e
// devolvido; os canais vem de data/site/brand.json, nunca da requisicao.
let BRAND_CHANNELS = { whatsapp_base: "https://wa.me/5548988344559", email: "tiago.sasaki@confenge.com.br" };
try {
  const brand = require("../../../data/site/brand.json");
  const contact = (brand && brand.contact) || {};
  BRAND_CHANNELS = {
    whatsapp_base: String(contact.whatsapp_base || BRAND_CHANNELS.whatsapp_base),
    email: String(contact.email || BRAND_CHANNELS.email),
  };
} catch {
  /* canais canonicos acima */
}
const NATIVE_FORM_WA_TEXT = "Ol%C3%A1%2C%20Tiago.%20Quero%20explicar%20uma%20situa%C3%A7%C3%A3o%20t%C3%A9cnica%20e%20entender%20o%20pr%C3%B3ximo%20passo.";

function isNativeFormRequest(event, data) {
  const headers = (event && event.headers) || {};
  const pick = (name) => String(headers[name] || headers[name.toLowerCase()] || headers[name.replace(/(^|-)([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase())] || "").toLowerCase();
  const contentType = pick("content-type");
  const accept = pick("accept");
  const hasToken = Boolean(data && (data["cf-turnstile-response"] || data.turnstile_token));
  if (hasToken) return false;
  if (accept.includes("application/json")) return false;
  const nativeBody = !contentType || contentType.includes("application/x-www-form-urlencoded");
  const wantsHtml = accept.includes("text/html");
  return nativeBody || wantsHtml;
}

function nativeFormFallbackResponse(headers) {
  const wa = `${BRAND_CHANNELS.whatsapp_base}?text=${NATIVE_FORM_WA_TEXT}`;
  const mail = `mailto:${BRAND_CHANNELS.email}`;
  const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const body = [
    "<!doctype html>",
    '<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>',
    '<meta name="robots" content="noindex,nofollow"/>',
    "<title>Pedido não enviado por este caminho | CONFENGE</title>",
    "<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#111}a{color:#0b4f8a}</style>",
    "</head><body>",
    "<h1>O formulário não conseguiu registrar o pedido</h1>",
    "<p>Neste navegador, o envio pelo formulário não conclui nem devolve protocolo. Fale pelo WhatsApp ou pelo e-mail: chegam direto e valem o mesmo.</p>",
    `<p><a href="${escape(wa)}">Falar pelo WhatsApp</a> · <a href="${escape(mail)}">${escape(BRAND_CHANNELS.email)}</a></p>`,
    '<p><a href="https://confenge.com.br/">Voltar ao site</a></p>',
    "</body></html>",
  ].join("\n");
  return {
    statusCode: 400,
    headers: { ...(headers || {}), "Content-Type": "text/html; charset=utf-8" },
    body,
  };
}

/** Public response whitelist — never include channels, topics, tokens, PII. */
function publicSuccessBody({
  lead_id,
  received_at,
  journey,
  stage_category,
  status,
  notify_status,
  email_status,
  idempotent,
  correlation_id,
  external_reference,
  delivery_business_days,
  document_intent,
  nucleus_id,
  qualification_state,
  conflict_status,
}) {
  const body = {
    ok: true,
    lead_id,
    receipt_id: lead_id, // back-compat for front-end
    received_at,
    source: "CONFENGE_WEB",
    journey,
    stage_category: stage_category ? String(stage_category).slice(0, 80) : undefined,
    status: status || "persisted",
  };
  if (nucleus_id) body.nucleus_id = String(nucleus_id).slice(0, 80);
  if (qualification_state) body.qualification_state = String(qualification_state).slice(0, 40);
  if (conflict_status) body.conflict_status = String(conflict_status).slice(0, 40);
  if (document_intent === "secure_channel_request") {
    body.document_intent = "secure_channel_request";
    body.channel_status = "canal escolhido posteriormente";
  }
  // Payment correlation for paid parameter orders. Never PII: an offer id and a
  // digest. Emitted only after the durable persist succeeded.
  if (correlation_id) body.correlation_id = String(correlation_id).slice(0, 60);
  if (external_reference) body.external_reference = String(external_reference).slice(0, 200);
  if (delivery_business_days) {
    body.delivery_business_days = Number(delivery_business_days);
    body.delivery_clock_starts_at = "form_submitted";
  }
  // Non-PII delivery status for probe/ops verification (never secrets/topics)
  if (notify_status) body.notify_status = String(notify_status).slice(0, 24);
  if (email_status) body.email_status = String(email_status).slice(0, 24);
  if (idempotent === true) body.idempotent = true;
  return body;
}

function publicErrorBody({ error, message, field }) {
  const body = {
    ok: false,
    error: error || "error",
    message: message || "Não foi possível processar a solicitação.",
  };
  // Um 400 legítimo nomeia o campo (telefone, email) para o cliente destacar
  // o que corrigir; nunca carrega o valor digitado.
  if (field && /^[a-z_]{1,40}$/.test(String(field))) body.field = String(field);
  return body;
}

const SENSITIVE_LOG_KEY = /(?:^|_)(?:authorization|bearer|cnpj|cpf|email|ip|mail|message|mensagem|name|nome|phone|secret|tel|token|whatsapp|file|arquivo|anexo|document|upload|eicar)(?:_|$)/i;

function redactSensitiveText(value) {
  let text = String(value == null ? "" : value);
  try {
    text = decodeURIComponent(text);
  } catch {
    // Keep malformed percent-encoding printable, then apply the same guards.
  }
  return text
    .replaceAll(EICAR_SIGNATURE, "[redacted]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted]")
    .replace(/\b\d{3}[.-]?\d{3}[.-]?\d{3}-?\d{2}\b/g, "[redacted]")
    .replace(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/]?\d{4}-?\d{2}\b/g, "[redacted]")
    .replace(/(?<![A-Za-z0-9])\+?\s*\(?(?:\d[\s().-]*){10,15}(?![A-Za-z0-9])/g, "[redacted]")
    .replace(/\b(?:Bearer\s+|Basic\s+)[A-Za-z0-9._~+/=-]+/gi, "[redacted]")
    .replace(/t=\d+,v1=[a-f0-9]+/gi, "t=…,v1=[redacted]")
    .replace(/((?:secret|token|password|authorization)[=:]\s*)[^\s,;&]+/gi, "$1[redacted]")
    .slice(0, 160);
}

function sanitizeLogFields(fields) {
  const safe = {};
  for (const [key, value] of Object.entries(fields && typeof fields === "object" ? fields : {})) {
    if (SENSITIVE_LOG_KEY.test(key)) {
      safe[key] = typeof value === "boolean" ? value : "[redacted]";
      continue;
    }
    if (typeof value === "string") safe[key] = redactSensitiveText(value);
    else if (typeof value === "number" || typeof value === "boolean" || value == null) safe[key] = value;
    else safe[key] = "[redacted]";
  }
  return safe;
}

/** Structured log line — defense-in-depth redaction even if a caller errs. */
function safeLog(level, event, fields) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitizeLogFields(fields),
  });
  if (level === "error") console.error(line);
  else console.log(line);
}

function retentionPolicy() {
  return {
    retain_days: Number(process.env.LEAD_RETAIN_DAYS || 730),
    purpose: "contato comercial e atendimento de solicitação do titular",
    legal_basis: "consentimento (art. 7º, I, LGPD) e legítimo interesse operacional",
  };
}

module.exports = {
  MAX_BODY_BYTES,
  MAX_FIELD,
  ESTAGIO_UNKNOWN_SERVICE,
  INTENT_KIND_ALLOWED,
  ATTR_ALLOWLIST,
  ALLOWED_ORIGINS,
  ALLOWED_JOURNEYS,
  looksLikePii,
  sanitizeAttributionValue,
  sanitizeAttributionLocation,
  pickAttribution,
  sanitizeAttributionTopic,
  parseBody,
  looksLikeBinaryPayload,
  rejectFileShape,
  leadHasFilePayload,
  titularExport,
  EICAR_SIGNATURE,
  FILE_FIELD_KEYS,
  isHoneypot,
  nonCatalogAction,
  assertOfferTermsAndPrice,
  assertDeliverableSelection,
  assertLicitacaoQualification,
  assertEightProductQualification,
  assertContractDefenseQualification,
  validateAndNormalize,
  generateLeadId,
  idempotencyKeyFor,
  clientIp,
  technicalFingerprint,
  probeAuthorized,
  originAllowed,
  corsHeaders,
  publicSuccessBody,
  publicErrorBody,
  isNativeFormRequest,
  nativeFormFallbackResponse,
  deriveDeliverableIdFromRoute,
  CONTRACT_EVENT_PLANNING,
  ESTAGIO_PLANEJAMENTO_CONTRATACAO,
  redactSensitiveText,
  sanitizeLogFields,
  safeLog,
  retentionPolicy,
  clamp,
  normalizePhone,
  normalizeEmail,
  normalizeJourney,
  adaptiveIntake,
  deriveOriginClass,
  ORIGIN_CLASS_VALUES,
  SEARCH_ENGINE_HOST_PREFIXES,
};
