/**
 * Generic commercial DoD — fail-closed review of attributable
 * page→use→CTA→lead→action/outcome loops declared in a versioned registry.
 *
 * Decision functions consume a facts object only. HTTP, env, and ops I/O
 * stay in the audit CLI. Synthetic/qa is never pipeline. UNKNOWN stays
 * UNKNOWN. Do not invent a person, a WON, or INBOUND NOW.
 */

export const LEARNING_TOKENS = Object.freeze([
  "REPEAT",
  "CHANGE",
  "STOP",
  "NEED_MORE_DATA",
]);

export const EXIT_TOKENS = Object.freeze([
  "READY",
  "READY_BEHIND_HUMAN_GATE",
  "ADJUST",
  "BLOCKED",
  "NO_GO",
]);

export const NON_REAL_KINDS = Object.freeze(["synthetic", "qa", "spam", "internal"]);

export const PII_KEYS = Object.freeze([
  "nome",
  "email",
  "telefone",
  "mensagem",
  "phone",
  "name",
  "cnpj",
]);

export const CANONICAL_INBOUND_URL =
  "https://api.confenge.com.br/api/v1/webhooks/confenge/inbound";

const REQUIRED_LOOP_KEYS = Object.freeze([
  "id",
  "asset_path",
  "service_path",
  "expected_transition",
  "capture_contract",
  "cta_contract",
  "attribution_contract",
  "outcome_owner",
  "enabled",
]);

export function validateCommercialLoopRegistry(registry = {}) {
  const errors = [];
  if (registry.schema !== "confenge.commercial-loops/1.0") errors.push("schema");
  if (!Array.isArray(registry.loops) || registry.loops.length < 2) errors.push("loops_min_2");
  const ids = new Set();
  for (const [index, loop] of (registry.loops || []).entries()) {
    for (const key of REQUIRED_LOOP_KEYS) {
      if (loop?.[key] == null) errors.push(`loops[${index}].${key}`);
    }
    if (ids.has(loop?.id)) errors.push(`duplicate_loop_id:${loop.id}`);
    ids.add(loop?.id);
    if (!String(loop?.asset_path || "").startsWith("/")) errors.push(`asset_path:${loop?.id}`);
    if (!String(loop?.service_path || "").startsWith("/")) errors.push(`service_path:${loop?.id}`);
    if (loop?.attribution_contract?.source !== "CONFENGE_WEB") errors.push(`source:${loop?.id}`);
    if (loop?.outcome_owner !== "warmbly") errors.push(`outcome_owner:${loop?.id}`);
  }
  return { ok: errors.length === 0, errors };
}

/** Exact next command from docs/ops/WARMBLY-INBOUND.md plus the loop-specific consent residual. */
export function buildNextCommand(loop = {}) {
  const actionPath = loop.capture_contract?.page_path || loop.asset_path || "<registered-loop-path>";
  return [
    "# Netlify production",
    `CONFENGE_INBOUND_WEBHOOK_URL=${CANONICAL_INBOUND_URL}`,
    "CONFENGE_INBOUND_WEBHOOK_SECRET=<shared>",
    "# Warmbly",
    "CONFENGE_AUTO_SEND_ENABLED=false",
    "# This shell, to read ops counters",
    "export OPS_TOKEN='<production ops token>'",
    "export CONFENGE_AUTO_SEND_EVIDENCE=OFF",
    "node scripts/site/money_asset_prod_proof.mjs https://confenge.com.br",
    `# Then a consented real visitor uses ${actionPath}.`,
    "# Do not invent a person. Do not send WhatsApp/email from this repo.",
  ].join("\n");
}

const ABSOLUTE_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = String(text).match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

export function parseCanonicalHref(html) {
  return firstMatch(html, [
    /<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["']/i,
    /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']canonical["']/i,
  ]);
}

export function parseRobotsMeta(html) {
  return firstMatch(html, [
    /<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["']([^"']+)["']/i,
    /<meta\b[^>]*\bcontent=["']([^"']+)["'][^>]*\bname=["']robots["']/i,
  ]);
}

export function canonicalHostIsConfenge(href) {
  if (typeof href !== "string" || !ABSOLUTE_SCHEME.test(href.trim())) return false;
  try {
    const url = new URL(href.trim());
    return url.protocol === "https:" && url.hostname === "confenge.com.br" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

export function extractDiagnosticoSignals(html, loop = {}) {
  const text = String(html);
  const canonical = parseCanonicalHref(text);
  const robots = parseRobotsMeta(text);
  const ident = text.indexOf('id="identificacao"');
  const cta = text.indexOf('id="segunda-leitura"');
  return {
    surface: "diagnostico",
    title_ok: /Diagn[oó]stico de Defesa de Margem/i.test(text),
    utility_before_cta: ident > -1 && cta > -1 && ident < cta,
    cta_segunda_leitura: text.includes(loop.cta_contract?.copy || ""),
    visible_fonte: /fonte/i.test(text),
    visible_as_of: /as_of/i.test(text),
    visible_unknown: text.includes("UNKNOWN"),
    visible_reajuste: /reajuste/i.test(text),
    visible_reequilibrio: /reequil[ií]brio/i.test(text),
    visible_medicao: /medi[cç][aã]o/i.test(text),
    visible_bdi_in_utility: /<main[\s\S]*?\bBDI\b[\s\S]*?<\/main>/i.test(text) && !/Orçamento e BDI/i.test(text),
    visible_bdi_footer_only: /Orçamento e BDI/i.test(text),
    canonical_href: canonical,
    canonical_host_confenge: canonicalHostIsConfenge(canonical),
    robots_meta: robots,
    robots_indexable: Boolean(robots && /\bindex\b/i.test(robots) && !/\bnoindex\b/i.test(robots)),
    smartlic_present: /smartlic/i.test(text),
    source_confenge_web_hint: /CONFENGE/.test(text),
  };
}

export function extractPillarSignals(html, loop = {}) {
  const text = String(html);
  const canonical = parseCanonicalHref(text);
  const robots = parseRobotsMeta(text);
  return {
    surface: "pillar",
    title_ok: /defesa t[eé]cnica e prote[cç][aã]o de margem/i.test(text),
    links_to_diagnostico: text.includes(loop.asset_path || ""),
    links_to_asset: text.includes(loop.asset_path || ""),
    segunda_leitura_phrase: /segunda leitura/i.test(text),
    visible_fonte: /fonte|evidenc/i.test(text),
    canonical_href: canonical,
    canonical_host_confenge: canonicalHostIsConfenge(canonical),
    robots_meta: robots,
    robots_indexable: Boolean(robots && /\bindex\b/i.test(robots) && !/\bnoindex\b/i.test(robots)),
    smartlic_present: /smartlic/i.test(text),
  };
}

function sitemapLocUrls(xml) {
  const found = [];
  const pattern = /<loc>([^<]+)<\/loc>/gi;
  let match;
  while ((match = pattern.exec(String(xml)))) {
    try {
      found.push(new URL(match[1].trim()));
    } catch {
      // Unparseable loc is not a canonical CONFENGE destination.
    }
  }
  return found;
}

function locMatches(url, expected) {
  const want = new URL(expected);
  const left = url.pathname.replace(/\/+$/, "/") || "/";
  const right = want.pathname.replace(/\/+$/, "/") || "/";
  return url.origin === want.origin && left === right;
}

export function extractSitemapSignals(xml, loop = {}, { indexable = true } = {}) {
  const locs = sitemapLocUrls(xml);
  const hasAsset = locs.some((url) =>
    locMatches(url, `https://confenge.com.br${loop.asset_path || "/__missing_asset__/"}`),
  );
  const hasPillar = locs.some((url) =>
    locMatches(url, `https://confenge.com.br${loop.service_path || "/__missing_service__/"}`),
  );
  return {
    has_diagnostico_loc: hasAsset,
    has_pillar_loc: hasPillar,
    consistent_with_indexable: indexable ? hasAsset && hasPillar : !hasAsset,
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function attrValue(tag, name) {
  const match = String(tag).match(new RegExp(`\\b${escapeRegex(name)}=["']([^"']*)["']`, "i"));
  return match ? match[1] : null;
}

function formBlocks(html) {
  return [...String(html).matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)].map((match) => match[0]);
}

function fieldValue(form, name) {
  const tags = [...String(form).matchAll(/<(?:input|textarea|select)\b[^>]*>/gi)].map((match) => match[0]);
  const tag = tags.find((candidate) => attrValue(candidate, "name") === name);
  if (!tag) return null;
  return attrValue(tag, "value");
}

function hasRequiredField(form, name) {
  const tags = [...String(form).matchAll(/<(?:input|textarea|select)\b[^>]*>/gi)].map((match) => match[0]);
  const tag = tags.find((candidate) => attrValue(candidate, "name") === name);
  return Boolean(tag && /\brequired(?:\s*=|\s|>)/i.test(tag));
}

export function extractLoopSurfaceSignals(loop = {}, { asset_html = "", service_html = "" } = {}) {
  const reasonCodes = [];
  const assetCanonical = parseCanonicalHref(asset_html);
  const serviceCanonical = parseCanonicalHref(service_html);
  const expectedAssetCanonical = `https://confenge.com.br${loop.asset_path || ""}`;
  const expectedServiceCanonical = `https://confenge.com.br${loop.service_path || ""}`;
  const assetCanonicalOk = assetCanonical === expectedAssetCanonical;
  const serviceCanonicalOk = serviceCanonical === expectedServiceCanonical;
  if (!assetCanonicalOk) reasonCodes.push("ASSET_CANONICAL_MISMATCH");
  if (!serviceCanonicalOk) reasonCodes.push("SERVICE_CANONICAL_MISMATCH");

  const transitionHref = loop.expected_transition?.href || "";
  const transitionOk = Boolean(
    transitionHref && new RegExp(`href=["']${escapeRegex(transitionHref)}["']`, "i").test(asset_html),
  );
  if (!transitionOk) reasonCodes.push("EXPECTED_TRANSITION_MISSING");

  const captureHtml = loop.capture_contract?.page_path === loop.service_path ? service_html : asset_html;
  const forms = formBlocks(captureHtml);
  const ctaId = loop.cta_contract?.cta_id || "";
  const form = forms.find((candidate) =>
    candidate.includes(`data-cta-id="${ctaId}"`) ||
    fieldValue(candidate, "cta_id") === ctaId,
  );
  if (!form) reasonCodes.push("CAPTURE_FORM_MISSING");

  const opening = form ? (form.match(/^<form\b[^>]*>/i) || [""])[0] : "";
  const actionOk = Boolean(form && attrValue(opening, "action") === loop.capture_contract?.form_action);
  const methodOk = Boolean(
    form && String(attrValue(opening, "method") || "get").toLowerCase() === loop.capture_contract?.method,
  );
  const ajaxOk = !loop.capture_contract?.ajax_to_lead_function || attrValue(opening, "data-ajax") === "true";
  const requiredFieldsOk = Boolean(
    form && (loop.capture_contract?.required_fields || []).every((name) => hasRequiredField(form, name)),
  );
  const consentOk = Boolean(
    form && hasRequiredField(form, loop.capture_contract?.consent_field || "consentimento"),
  );
  if (!actionOk) reasonCodes.push("CAPTURE_ACTION_MISMATCH");
  if (!methodOk) reasonCodes.push("CAPTURE_METHOD_MISMATCH");
  if (!ajaxOk) reasonCodes.push("AJAX_LEAD_ADAPTER_MISSING");
  if (!requiredFieldsOk || !consentOk) reasonCodes.push("CAPTURE_REQUIRED_FIELDS_MISSING");

  const ctaCopyOk = Boolean(form && String(form).includes(loop.cta_contract?.copy || ""));
  const ctaPositionOk = Boolean(
    form && String(form).includes(`data-cta-position="${loop.cta_contract?.cta_position || ""}"`),
  );
  if (!ctaCopyOk) reasonCodes.push("CTA_COPY_MISMATCH");
  if (!ctaPositionOk) reasonCodes.push("CTA_POSITION_MISMATCH");

  const attribution = loop.attribution_contract || {};
  const attrPairs = ["asset_id", "route_family", "cta_id", "landing_page"];
  const attributionFieldsOk = Boolean(
    form && attrPairs.every((name) => fieldValue(form, name) === attribution[name]),
  );
  const sourceOk = attribution.source === "CONFENGE_WEB";
  if (!attributionFieldsOk) reasonCodes.push("ATTRIBUTION_FIELDS_MISMATCH");
  if (!sourceOk) reasonCodes.push("ATTRIBUTION_SOURCE_MISMATCH");

  return {
    loop_id: loop.id || null,
    surface_ready: assetCanonicalOk && serviceCanonicalOk && transitionOk && ctaCopyOk && ctaPositionOk,
    capture_ready: Boolean(form && actionOk && methodOk && ajaxOk && requiredFieldsOk && consentOk),
    attribution_ready: attributionFieldsOk && sourceOk,
    reason_codes: reasonCodes,
  };
}

export function blobHasPii(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (/"nome"\s*:\s*"[^"]+"/i.test(text)) return true;
  if (/"email"\s*:\s*"[^"]+"/i.test(text)) return true;
  if (/"telefone"\s*:\s*"[^"]+"/i.test(text)) return true;
  if (/"mensagem"\s*:\s*"[^"]+"/i.test(text)) return true;
  if (/"cnpj"\s*:\s*"\d{14}"/i.test(text)) return true;
  return false;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function stripPii(value) {
  if (Array.isArray(value)) return value.map(stripPii);
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (PII_KEYS.includes(String(key).toLowerCase())) continue;
    out[key] = stripPii(raw);
  }
  return out;
}

function isNonRealKind(kind) {
  return NON_REAL_KINDS.includes(String(kind || "").toLowerCase());
}

function looksSyntheticContact(facts) {
  const email = String(facts.email || facts.contact_email || "");
  const label = String(facts.label || facts.nome || facts.name || "");
  if (/@example\.com$/i.test(email)) return true;
  if (/SYNTHETIC-INBOUND/i.test(label)) return true;
  if (/^qa[-.]/i.test(email) || /@qa\./i.test(email)) return true;
  return false;
}

function configured(facts, booleanKey, stateKey, acceptedStates = ["SET"]) {
  if (facts[booleanKey] === true) return true;
  return acceptedStates.includes(String(facts[stateKey] || "").toUpperCase());
}

function missingState(facts, booleanKey, stateKey, defaultWhenFalse) {
  const explicit = String(facts[stateKey] || "").toUpperCase();
  if (explicit) return explicit;
  return facts[booleanKey] === false ? defaultWhenFalse : "UNKNOWN";
}

export function classifyRealLoop(facts = {}, loopConfig = {}) {
  const kind = facts.record_kind == null ? null : String(facts.record_kind);
  const leadId = facts.lead_id || facts.receipt_id || null;
  const missing = [];
  const nextCommand = buildNextCommand(loopConfig);

  if (!facts.consented_real_contact) {
    missing.push({
      prerequisite: "consented_real_contact",
      status: "MISSING",
      note: `No consented real person used ${loopConfig.capture_contract?.page_path || "the registered action"}. Do not invent one.`,
    });
  }
  if (!configured(facts, "inbound_url_set", "inbound_url_state")) {
    missing.push({
      prerequisite: "CONFENGE_INBOUND_WEBHOOK_URL",
      status: missingState(facts, "inbound_url_set", "inbound_url_state", "UNSET"),
      note: `Set on Netlify production to ${CANONICAL_INBOUND_URL}`,
    });
  }
  if (!configured(facts, "inbound_secret_set", "inbound_secret_state")) {
    missing.push({
      prerequisite: "CONFENGE_INBOUND_WEBHOOK_SECRET",
      status: missingState(facts, "inbound_secret_set", "inbound_secret_state", "UNSET"),
      note: "Shared HMAC with Warmbly. Server env only.",
    });
  }
  if (!configured(facts, "ops_token_set", "ops_token_state")) {
    missing.push({
      prerequisite: "OPS_TOKEN",
      status: missingState(facts, "ops_token_set", "ops_token_state", "UNSET"),
      note: "Required to read ops?action=inbound_handoff.",
    });
  }
  if (!configured(facts, "auto_send_off_evidenced", "auto_send_state", ["OFF", "FALSE"])) {
    missing.push({
      prerequisite: "CONFENGE_AUTO_SEND_ENABLED",
      status: missingState(facts, "auto_send_off_evidenced", "auto_send_state", "UNKNOWN"),
      note: "Warmbly auto-send must be proven false before claiming INBOUND NOW.",
    });
  }
  if (!configured(facts, "warmbly_handoff_observed", "warmbly_handoff_state", ["PROVEN", "OBSERVED"])) {
    missing.push({
      prerequisite: "Warmbly receipt/action",
      status: missingState(facts, "warmbly_handoff_observed", "warmbly_handoff_state", "UNKNOWN"),
      note: "No matching Warmbly receipt/action was observed for a real persisted lead.",
    });
  }

  const synthetic =
    isNonRealKind(kind) ||
    looksSyntheticContact(facts) ||
    facts.probe === true ||
    facts.test_mode === true;

  if (synthetic) {
    return stripPii({
      status: "BLOCKED",
      commercial_event: false,
      qualified_lead: false,
      qualified_pipeline: false,
      outcome: "UNKNOWN",
      human_route_action: null,
      lead_id: leadId,
      record_kind: kind || "synthetic",
      reason:
        "Synthetic/qa/probe persist is capture proof, not a commercial event. Shipped rule: non-real SKIP Warmbly.",
      missing_prerequisites: missing,
      next_command: nextCommand,
      residual: [
        `consented real page→use→CTA→lead from ${loopConfig.capture_contract?.page_path || loopConfig.asset_path || "registered loop"}`,
        "human-route action and outcome or rejection or UNKNOWN",
        "Netlify inbound URL+secret",
        "Warmbly auto-send OFF evidenced",
      ],
    });
  }

  if (!leadId || !facts.consented_real_contact) {
    return stripPii({
      status: "BLOCKED",
      commercial_event: false,
      qualified_lead: false,
      qualified_pipeline: "UNKNOWN",
      outcome: "UNKNOWN",
      human_route_action: null,
      lead_id: leadId,
      record_kind: kind,
      reason: "No persist-first real lead_id with consent. Fail closed.",
      missing_prerequisites: missing,
      next_command: nextCommand,
      residual: missing.map((row) => row.prerequisite),
    });
  }

  const outcome = facts.outcome || "UNKNOWN";
  const action = facts.human_route_action || null;
  const operatorEvidence = facts.operator_or_warmbly_evidence === true;
  const handoffObserved = configured(
    facts,
    "warmbly_handoff_observed",
    "warmbly_handoff_state",
    ["PROVEN", "OBSERVED"],
  );
  const rejected = outcome === "REJECTED" || facts.real_rejection === true;
  const observedAction = Boolean(action || rejected || (outcome && outcome !== "UNKNOWN"));
  const complete = handoffObserved && observedAction;
  const qualifiedPipeline =
    operatorEvidence && kind === "real" && rejected
      ? false
      : operatorEvidence && kind === "real" && outcome !== "UNKNOWN"
        ? true
        : "UNKNOWN";

  return stripPii({
    status: complete ? "PROVEN" : "UNKNOWN",
    commercial_event: complete,
    qualified_lead: operatorEvidence && kind === "real",
    qualified_pipeline: qualifiedPipeline,
    outcome,
    human_route_action: action,
    lead_id: leadId,
    record_kind: kind,
    reason: complete
      ? "Real lead plus recorded action/outcome/rejection."
      : "Real lead persisted; action/outcome still UNKNOWN.",
    missing_prerequisites: complete ? missing.filter((row) => row.status !== "SET") : missing,
    next_command: complete && !missing.length ? null : nextCommand,
    residual: complete
      ? missing.filter((row) => row.status !== "SET").map((row) => row.prerequisite)
      : ["human-route action", "outcome or rejection", ...missing.map((row) => row.prerequisite)],
  });
}

export function decideLearning(facts = {}, loop = classifyRealLoop(facts)) {
  if (loop.outcome === "REJECTED" && facts.salvage === false) return "STOP";
  if (loop.commercial_event && facts.named_friction && facts.friction_requires_change) {
    return "CHANGE";
  }
  if (loop.commercial_event && (loop.outcome === "WON" || facts.repeatable === true)) {
    return "REPEAT";
  }
  return "NEED_MORE_DATA";
}

export function decideExit(facts = {}, loop = classifyRealLoop(facts)) {
  const reduces =
    facts.reduces_risk === true ||
    facts.reduces_time_to_evidence === true ||
    facts.reduces_cost === true ||
    facts.reduces_uncertainty === true;

  if (facts.product_volume_only === true && !reduces) return "NO_GO";
  if (facts.product_change_required === true && facts.named_friction) return "ADJUST";
  if (loop.commercial_event && Array.isArray(facts.human_gates) && facts.human_gates.length) {
    return "READY_BEHIND_HUMAN_GATE";
  }
  if (loop.commercial_event && loop.status === "PROVEN" && !loop.missing_prerequisites?.length) {
    return "READY";
  }
  if (loop.status === "BLOCKED" || !loop.commercial_event) return "BLOCKED";
  return "BLOCKED";
}

export function dimensionNotes(facts = {}, loop = classifyRealLoop(facts), learning = decideLearning(facts, loop)) {
  return {
    icp: {
      token: learning,
      evidenced: facts.icp_evidenced === true,
      note:
        facts.icp_note ||
        "No real account or decision unit observed from this vertical. ICP stays hypothesized.",
    },
    trigger: {
      token: learning,
      evidenced: facts.trigger_evidenced === true,
      note:
        facts.trigger_note ||
        "Reajuste / reequilíbrio / medição stay UNKNOWN on the live sample; BDI is not in the diagnose utility (footer cluster only).",
    },
    offer: {
      token: learning,
      evidenced: facts.offer_evidenced === true,
      note:
        facts.offer_note ||
        "Offer copy 'segunda leitura deste contrato' is shipped. No real uptake.",
    },
    friction: {
      token: learning,
      evidenced: Boolean(facts.named_friction),
      note:
        facts.friction_note ||
        "Named blockers are inbound env / auto-send evidence / consented contact — not a proven product-copy friction.",
    },
  };
}

export function buildReview(facts = {}, loopConfig = {}) {
  const safe = stripPii(facts);
  const loop = classifyRealLoop(safe, loopConfig);
  const learning = decideLearning(safe, loop);
  const exit = decideExit(safe, loop);
  if (!LEARNING_TOKENS.includes(learning)) {
    throw new Error(`illegal learning token ${learning}`);
  }
  if (!EXIT_TOKENS.includes(exit)) {
    throw new Error(`illegal exit token ${exit}`);
  }
  if (loop.qualified_pipeline === true && loop.qualified_lead !== true) {
    throw new Error("pipeline cannot be asserted without qualified_lead evidence");
  }
  const review = stripPii({
    campaign: safe.campaign || "BOFU-COMMERCIAL-DOD",
    loop_id: loopConfig.id || null,
    asset: `https://confenge.com.br${loopConfig.asset_path || ""}`,
    pillar: `https://confenge.com.br${loopConfig.service_path || ""}`,
    outcome_owner: loopConfig.outcome_owner || "UNKNOWN",
    learning,
    exit,
    real_loop: loop,
    dimensions: dimensionNotes(safe, loop, learning),
    already_shipped: safe.already_shipped || ["#76", "#79", "#80", "#81", "#82"],
    residual: loop.residual,
    next_command: loop.next_command,
    kill_gate: {
      reduces_risk: safe.reduces_risk === true,
      reduces_time_to_evidence: safe.reduces_time_to_evidence === true,
      reduces_cost: safe.reduces_cost === true,
      reduces_uncertainty: safe.reduces_uncertainty === true,
      product_volume_only: safe.product_volume_only === true,
    },
    note: "Fixture, preview, dry-run, or synthetic 201 is not campaign-complete.",
  });
  if (blobHasPii(review)) {
    throw new Error("review leaked PII keys");
  }
  return review;
}

export function buildCommercialLoopReport(loopConfig = {}, facts = {}, surfaceSignals = {}) {
  const review = buildReview(facts, loopConfig);
  const realLoop = review.real_loop;
  const handoffReady = Boolean(
    configured(facts, "inbound_url_set", "inbound_url_state") &&
    configured(facts, "inbound_secret_set", "inbound_secret_state") &&
    configured(facts, "ops_token_set", "ops_token_state") &&
    configured(facts, "auto_send_off_evidenced", "auto_send_state", ["OFF", "FALSE"]) &&
    configured(facts, "warmbly_handoff_observed", "warmbly_handoff_state", ["PROVEN", "OBSERVED"]),
  );
  const reasonCodes = [...(surfaceSignals.reason_codes || [])];
  for (const item of realLoop.missing_prerequisites || []) {
    reasonCodes.push(String(item.prerequisite || "UNKNOWN").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") + `_${item.status}`);
  }
  if (realLoop.outcome === "UNKNOWN") reasonCodes.push("COMMERCIAL_OUTCOME_UNKNOWN");
  return stripPii({
    loop_id: loopConfig.id || null,
    enabled: loopConfig.enabled === true,
    asset_path: loopConfig.asset_path || null,
    service_path: loopConfig.service_path || null,
    surface_ready: surfaceSignals.surface_ready === true,
    capture_ready: surfaceSignals.capture_ready === true,
    attribution_ready: surfaceSignals.attribution_ready === true,
    handoff_ready: handoffReady,
    commercial_event: realLoop.commercial_event === true,
    qualified_pipeline: realLoop.qualified_pipeline,
    outcome: realLoop.outcome,
    outcome_owner: loopConfig.outcome_owner || "UNKNOWN",
    reason_codes: [...new Set(reasonCodes)].sort(),
    review,
  });
}

export function envPresenceFromProcess(env = process.env) {
  return {
    inbound_url_set: Boolean(env.CONFENGE_INBOUND_WEBHOOK_URL),
    inbound_secret_set: Boolean(env.CONFENGE_INBOUND_WEBHOOK_SECRET),
    ops_token_set: Boolean(env.OPS_TOKEN || env.REVOPS_TOKEN),
    auto_send_off_evidenced:
      env.CONFENGE_AUTO_SEND_EVIDENCE === "OFF" ||
      env.CONFENGE_AUTO_SEND_EVIDENCE === "false" ||
      env.CONFENGE_AUTO_SEND_ENABLED === "false",
  };
}
