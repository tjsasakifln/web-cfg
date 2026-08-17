/**
 * WEB-011 commercial DoD — fail-closed review of one attributable
 * page→use→CTA→lead→action/outcome event on the margin-defense vertical.
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

export const MONEY_ASSET_PATH = "/ferramentas/diagnostico-defesa-margem/";
export const PILLAR_PATH = "/defesa-margem-contratos-publicos/";
export const CTA_COPY = "Quero uma segunda leitura deste contrato";

/** Exact next command from docs/ops/WARMBLY-INBOUND.md plus the consent residual. */
export const NEXT_COMMAND = [
  "# Netlify production",
  `CONFENGE_INBOUND_WEBHOOK_URL=${CANONICAL_INBOUND_URL}`,
  "CONFENGE_INBOUND_WEBHOOK_SECRET=<shared>",
  "# Warmbly",
  "CONFENGE_AUTO_SEND_ENABLED=false",
  "# This shell, to read ops counters",
  "export OPS_TOKEN='<production ops token>'",
  "export CONFENGE_AUTO_SEND_EVIDENCE=OFF",
  "node scripts/site/money_asset_prod_proof.mjs https://confenge.com.br",
  "# Then a consented real visitor uses /ferramentas/diagnostico-defesa-margem/ → segunda leitura.",
  "# Do not invent a person. Do not send WhatsApp/email from this repo.",
].join("\n");

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

export function extractDiagnosticoSignals(html) {
  const text = String(html);
  const canonical = parseCanonicalHref(text);
  const robots = parseRobotsMeta(text);
  const ident = text.indexOf('id="identificacao"');
  const cta = text.indexOf('id="segunda-leitura"');
  return {
    surface: "diagnostico",
    title_ok: /Diagn[oó]stico de Defesa de Margem/i.test(text),
    utility_before_cta: ident > -1 && cta > -1 && ident < cta,
    cta_segunda_leitura: text.includes(CTA_COPY),
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

export function extractPillarSignals(html) {
  const text = String(html);
  const canonical = parseCanonicalHref(text);
  const robots = parseRobotsMeta(text);
  return {
    surface: "pillar",
    title_ok: /defesa t[eé]cnica e prote[cç][aã]o de margem/i.test(text),
    links_to_diagnostico: text.includes(MONEY_ASSET_PATH),
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

export function extractSitemapSignals(xml, { indexable = true } = {}) {
  const locs = sitemapLocUrls(xml);
  const hasAsset = locs.some((url) =>
    locMatches(url, "https://confenge.com.br/ferramentas/diagnostico-defesa-margem/"),
  );
  const hasPillar = locs.some((url) =>
    locMatches(url, "https://confenge.com.br/defesa-margem-contratos-publicos/"),
  );
  return {
    has_diagnostico_loc: hasAsset,
    has_pillar_loc: hasPillar,
    consistent_with_indexable: indexable ? hasAsset && hasPillar : !hasAsset,
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

export function classifyRealLoop(facts = {}) {
  const kind = facts.record_kind == null ? null : String(facts.record_kind);
  const leadId = facts.lead_id || facts.receipt_id || null;
  const missing = [];

  if (!facts.consented_real_contact) {
    missing.push({
      prerequisite: "consented_real_contact",
      status: "MISSING",
      note: "No consented real person used segunda leitura. Do not invent one.",
    });
  }
  if (!facts.inbound_url_set) {
    missing.push({
      prerequisite: "CONFENGE_INBOUND_WEBHOOK_URL",
      status: "UNSET",
      note: `Set on Netlify production to ${CANONICAL_INBOUND_URL}`,
    });
  }
  if (!facts.inbound_secret_set) {
    missing.push({
      prerequisite: "CONFENGE_INBOUND_WEBHOOK_SECRET",
      status: "UNSET",
      note: "Shared HMAC with Warmbly. Server env only.",
    });
  }
  if (!facts.ops_token_set) {
    missing.push({
      prerequisite: "OPS_TOKEN",
      status: "UNSET",
      note: "Required to read ops?action=inbound_handoff.",
    });
  }
  if (!facts.auto_send_off_evidenced) {
    missing.push({
      prerequisite: "CONFENGE_AUTO_SEND_ENABLED",
      status: "UNKNOWN",
      note: "Warmbly auto-send must be proven false before claiming INBOUND NOW.",
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
      next_command: NEXT_COMMAND,
      residual: [
        "consented real page→use→CTA→lead from /ferramentas/diagnostico-defesa-margem/",
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
      qualified_pipeline: false,
      outcome: "UNKNOWN",
      human_route_action: null,
      lead_id: leadId,
      record_kind: kind,
      reason: "No persist-first real lead_id with consent. Fail closed.",
      missing_prerequisites: missing,
      next_command: NEXT_COMMAND,
      residual: missing.map((row) => row.prerequisite),
    });
  }

  const outcome = facts.outcome || "UNKNOWN";
  const action = facts.human_route_action || null;
  const operatorEvidence = facts.operator_or_warmbly_evidence === true;
  const rejected = outcome === "REJECTED" || facts.real_rejection === true;
  const complete = Boolean(action || rejected || (outcome && outcome !== "UNKNOWN"));

  return stripPii({
    status: complete ? "PROVEN" : "UNKNOWN",
    commercial_event: complete,
    qualified_lead: operatorEvidence && kind === "real",
    qualified_pipeline: operatorEvidence && kind === "real" && outcome !== "UNKNOWN" && !rejected,
    outcome,
    human_route_action: action,
    lead_id: leadId,
    record_kind: kind,
    reason: complete
      ? "Real lead plus recorded action/outcome/rejection."
      : "Real lead persisted; action/outcome still UNKNOWN.",
    missing_prerequisites: complete ? missing.filter((row) => row.status !== "SET") : missing,
    next_command: complete && !missing.length ? null : NEXT_COMMAND,
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

export function buildReview(facts = {}) {
  const safe = stripPii(facts);
  const loop = classifyRealLoop(safe);
  const learning = decideLearning(safe, loop);
  const exit = decideExit(safe, loop);
  if (!LEARNING_TOKENS.includes(learning)) {
    throw new Error(`illegal learning token ${learning}`);
  }
  if (!EXIT_TOKENS.includes(exit)) {
    throw new Error(`illegal exit token ${exit}`);
  }
  if (loop.qualified_pipeline && !loop.qualified_lead) {
    throw new Error("pipeline cannot be asserted without qualified_lead evidence");
  }
  const review = stripPii({
    campaign: "WEB-011",
    vertical: "defesa-margem",
    asset: `https://confenge.com.br${MONEY_ASSET_PATH}`,
    pillar: `https://confenge.com.br${PILLAR_PATH}`,
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
