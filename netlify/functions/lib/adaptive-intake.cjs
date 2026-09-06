/**
 * Minimal multi-vertical intake validation.
 *
 * Governance owns admission policy. This module only consumes an explicit
 * version/hash pin and maps public situation codes to the canonical nuclei.
 */
const crypto = require("crypto");
const authority = require("../data/adaptive-intake-authority.json");

const INTAKE_FLAG = "adaptive_intake";
const SOURCE = "CONFENGE_WEB";
const OTHER = "OTHER_NEEDS_CONTEXT";
const OTHER_NUCLEUS = "other_technical_need";
const DEFAULT_OFFER_CANDIDATE = "technical_triage_review";
const DEFAULT_SOURCE_ASSET = "technical_triage_v1";

const NUCLEI = Object.freeze({
  expert_evidence_assistance: {
    estagio: "pericia-assistencia-tecnica",
    jornada: "outro",
    location_material: false,
  },
  property_valuation: {
    estagio: "avaliacao-imoveis",
    jornada: "outro",
    location_material: true,
  },
  building_engineering_documentation: {
    estagio: "engenharia-edificacoes",
    jornada: "outro",
    location_material: true,
  },
  occupational_safety: {
    estagio: "seguranca-do-trabalho",
    jornada: "outro",
    location_material: true,
  },
  public_works_b2g: {
    estagio: "obras-publicas-b2g",
    jornada: "operacao",
    location_material: false,
  },
  [OTHER_NUCLEUS]: {
    estagio: "outra-demanda-tecnica",
    jornada: "outro",
    location_material: false,
  },
});

const NEEDS = Object.freeze({
  pericia_ou_disputa_tecnica: "expert_evidence_assistance",
  avaliacao_de_imovel: "property_valuation",
  obra_edificacao_ou_documentacao: "building_engineering_documentation",
  seguranca_do_trabalho: "occupational_safety",
  licitacao_obra_ou_contrato_publico: "public_works_b2g",
  outra_demanda_tecnica: OTHER_NUCLEUS,
});

const INTAKE_CONTEXTS = Object.freeze({
  quantities_budget: {
    need_code: "obra_edificacao_ou_documentacao",
    location_material: false,
  },
});

const PIN_KEYS = Object.freeze([
  "policy_id",
  "policy_version",
  "canonical_name",
  "policy_hash",
  "governance_source_sha",
  "intake_version",
  "source_asset_id",
  "offer_candidate_id",
  "outbound_eligible",
  "auto_send",
]);

const ATTRIBUTION_KEYS = Object.freeze([
  "landing_family",
  "landing_page",
  "landing_url",
  "origem",
  "route_family",
  "cta_id",
  "asset_id",
  "content_cluster",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "referrer",
  "correlation_id",
  "session_id",
  "source_origin_asset_id",
  "source_origin_route_family",
]);

const ALLOWED_KEYS = new Set([
  INTAKE_FLAG,
  "intake_mode",
  "form-name",
  "intake_version",
  "intake_contract_version",
  "intake_pin_hash",
  "contract_pin_hash",
  "need_code",
  "intake_context",
  "source_asset_id",
  "offer_candidate_id",
  "nome",
  "name",
  "email",
  "telefone",
  "whatsapp",
  "phone",
  "preferred_channel",
  "canal_preferido",
  "empresa",
  "organization",
  "location_city",
  "location_uf",
  "consentimento",
  "consent",
  "lgpd",
  "sensitive_docs_ack",
  "document_intent",
  "idempotency_key",
  "idempotencyKey",
  "turnstile_token",
  "cf-turnstile-response",
  "website",
  "company_site",
  ...ATTRIBUTION_KEYS,
]);

const FORBIDDEN_KEYS = new Set([
  "cpf", "cpf_cnpj", "rg", "processo", "process_number", "numero_processo",
  "processo_numero", "corpus", "prontuario", "empregados", "employee_list",
  "lista_empregados", "planta", "projeto_arquivo", "projeto_planta", "laudo",
  "relatorio_pericial", "relatorio", "demonstrativo_financeiro",
  "documento_financeiro", "conflict_parties", "conflict_party", "partes",
  "parte_contraria", "parties", "upload", "arquivo", "file", "files",
  "attachment", "mensagem", "message",
]);

const FORBIDDEN_KEY_RE =
  /cpf|prontuario|empregad|planta|laudo|relatorio|corpus|processo|conflict_part|parte_contraria|partes|demonstrativo|documento_financeiro|upload|arquivo|attachment/;

const UF = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
]);

function fail(error, message, status = 422) {
  return { ok: false, handled: true, status, error, message };
}

function stripControl(value) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(value, max) {
  const text = stripControl(value);
  return text.length > max ? text.slice(0, max) : text;
}

function truthy(value) {
  return value === true || ["true", "on", "1", "yes", "sim"].includes(String(value).toLowerCase());
}

function attributionToken(value) {
  const text = clamp(value, 80);
  const compactDigits = text.replace(/[\s()./+\-]/g, "");
  if (/@/.test(text) || /^\d{10,15}$/.test(compactDigits)) return "";
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/.test(text) ? text : "";
}

function isAdaptivePayload(data) {
  if (!data || typeof data !== "object") return false;
  const flag = data[INTAKE_FLAG] ?? data.intake_mode;
  if (flag === true || flag === "true" || flag === "1" || flag === "adaptive") return true;
  return clamp(data["form-name"], 80) === "triagem-tecnica"
    || Boolean(data.need_code || data.intake_version || data.intake_contract_version);
}

function canonicalPinMaterial(pin) {
  const out = {};
  for (const key of PIN_KEYS) out[key] = String((pin && pin[key]) || "");
  return JSON.stringify(out);
}

function pinHash(pin) {
  return crypto.createHash("sha256").update(canonicalPinMaterial(pin)).digest("hex");
}

function parsePin(raw) {
  if (raw == null || raw === "") return { ok: false, error: "pin_missing" };
  let pin = raw;
  if (typeof raw === "string") {
    try {
      pin = JSON.parse(raw);
    } catch {
      return { ok: false, error: "pin_invalid_json" };
    }
  }
  if (!pin || typeof pin !== "object" || Array.isArray(pin)) {
    return { ok: false, error: "pin_invalid" };
  }
  for (const key of PIN_KEYS) {
    if (pin[key] == null || (typeof pin[key] === "string" && !pin[key].trim())) {
      return { ok: false, error: "pin_incomplete", key };
    }
  }
  if (pin.policy_id !== "NET_NEW_INBOUND_HANDRAISER") {
    return { ok: false, error: "policy_id_unknown" };
  }
  if (pin.canonical_name !== `${pin.policy_id}/${pin.policy_version}`) {
    return { ok: false, error: "policy_version_mismatch" };
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(String(pin.policy_hash))) {
    return { ok: false, error: "policy_hash_invalid" };
  }
  if (!/^[0-9a-f]{40}$/.test(String(pin.governance_source_sha))) {
    return { ok: false, error: "governance_sha_invalid" };
  }
  if (pin.outbound_eligible !== false || pin.auto_send !== false) {
    return { ok: false, error: "unsafe_pin" };
  }
  return { ok: true, pin, hash: pinHash(pin) };
}

function loadPin(env = process.env) {
  const parsed = parsePin(env && env.ADAPTIVE_INTAKE_PIN_JSON);
  if (!parsed.ok) return parsed;

  // Synthetic fixtures may inject an explicit pin. Every deployed context stays
  // closed until MV-09 installs the reviewed final authority snapshot and proves
  // that Warmbly is running the same Governance revision/hash.
  const testOnly = env.NODE_ENV === "test"
    && !env.CONTEXT
    && !env.NETLIFY_CONTEXT
    && !env.CONFENGE_RUNTIME_PROFILE
    && !env.LEAD_STORE_PROFILE;
  if (testOnly) return parsed;
  if (authority.status !== "FINAL" || !authority.pin || !authority.contract_hashes) {
    return { ok: false, error: "governance_final_authority_missing" };
  }
  for (const key of PIN_KEYS) {
    if (parsed.pin[key] !== authority.pin[key]) {
      return { ok: false, error: "governance_authority_mismatch" };
    }
  }
  if (env.WARMBLY_GOVERNANCE_FINAL_SHA !== authority.governance_main_sha
      || env.WARMBLY_GOVERNANCE_FINAL_POLICY_HASH !== authority.contract_hashes.admission_policy) {
    return { ok: false, error: "warmbly_final_pin_unconfirmed" };
  }
  return parsed;
}

function enabledNuclei(env = process.env) {
  const raw = String((env && env.ADAPTIVE_INTAKE_NUCLEI) || "").trim();
  if (!raw) return new Set();
  return new Set(raw.split(",").map((item) => item.trim()).filter(Boolean));
}

function rejectForbiddenKeys(data) {
  if (!data || typeof data !== "object") return null;
  for (const key of Object.keys(data)) {
    const normalized = String(key).toLowerCase();
    if (FORBIDDEN_KEYS.has(normalized) || FORBIDDEN_KEY_RE.test(normalized)) {
      return fail(
        "sensitive_field_rejected",
        "Não envie documentos, CPF, número de processo, dados de pessoas ou partes em conflito neste formulário.",
      );
    }
  }
  return null;
}

function rejectUnknownKeys(data) {
  for (const key of Object.keys(data || {})) {
    if (!ALLOWED_KEYS.has(key)) {
      return fail("unknown_field_rejected", "Este formulário aceita somente os campos indicados.");
    }
  }
  return null;
}

function rejectConflictParties(data) {
  if (!data || typeof data !== "object") return null;
  for (const key of Object.keys(data)) {
    if (/conflict_part|parte_contraria|\bpartes\b|parties/i.test(String(key))) {
      return fail(
        "conflict_parties_rejected",
        "Nomes de partes em conflito serão tratados somente em canal seguro, depois da triagem.",
      );
    }
  }
  return null;
}

function normalizeCity(value) {
  const city = clamp(value, 80);
  if (!city) return "";
  if (/[0-9@,;:/\\#|<>\[\]{}()"=+*&%$!?]/.test(city)) return "";
  return city;
}

function contactChannel(data) {
  const requested = clamp(data.preferred_channel || data.canal_preferido, 20).toLowerCase();
  if (!["whatsapp", "email", "phone"].includes(requested)) return "";
  const hasPhone = Boolean(clamp(data.telefone || data.whatsapp || data.phone, 40));
  const hasEmail = Boolean(clamp(data.email, 180));
  if (requested === "email" && !hasEmail) return "";
  if ((requested === "whatsapp" || requested === "phone") && !hasPhone) return "";
  return requested;
}

function deriveQualification(fields) {
  if (fields.nucleus_id === OTHER_NUCLEUS) return "NEEDS_CONTEXT";
  if (fields.conflict_status === "NOT_SCREENED" || fields.conflict_status === "UNKNOWN") {
    return "CONFLICT_CHECK_REQUIRED";
  }
  return "NEEDS_CONTEXT";
}

function validateAdaptiveIntake(data, options = {}) {
  if (!isAdaptivePayload(data)) return { handled: false };
  const env = options.env || process.env;
  const rejected = rejectForbiddenKeys(data) || rejectUnknownKeys(data) || rejectConflictParties(data);
  if (rejected) return rejected;

  const pinResult = options.pin ? parsePin(options.pin) : loadPin(env);
  if (!pinResult.ok) {
    return fail(
      "contract_pin_missing",
      "O recebimento pelo formulário está temporariamente indisponível. Use um dos canais de contato.",
      503,
    );
  }
  const pin = pinResult.pin;
  const submittedVersion = clamp(data.intake_version || data.intake_contract_version, 120);
  const submittedHash = clamp(data.intake_pin_hash || data.contract_pin_hash, 64);
  if (submittedVersion !== pin.intake_version) {
    return fail("contract_version_unknown", "A configuração deste formulário mudou. Recarregue a página.");
  }
  if (submittedHash !== pinResult.hash) {
    return fail("contract_hash_mismatch", "A configuração deste formulário mudou. Recarregue a página.");
  }
  const submittedAsset = clamp(data.source_asset_id || data.asset_id, 120);
  const submittedOffer = clamp(data.offer_candidate_id, 120);
  if (submittedAsset && submittedAsset !== pin.source_asset_id) {
    return fail("source_asset_unknown", "A origem deste formulário não corresponde à configuração ativa.");
  }
  if (submittedOffer && submittedOffer !== pin.offer_candidate_id) {
    return fail("offer_candidate_unknown", "A triagem solicitada não corresponde à configuração ativa.");
  }

  const needCode = clamp(data.need_code, 80);
  const nucleusId = NEEDS[needCode];
  if (!nucleusId || !NUCLEI[nucleusId]) {
    return fail("need_unknown", "Selecione a situação que mais se aproxima da sua demanda.", 400);
  }
  if (!enabledNuclei(env).has(nucleusId)) {
    return fail("nucleus_not_enabled", "Esta opção ainda não está disponível no formulário.", 503);
  }
  const intakeContext = clamp(data.intake_context, 80);
  const contextRule = intakeContext ? INTAKE_CONTEXTS[intakeContext] : null;
  if (intakeContext && (!contextRule || contextRule.need_code !== needCode)) {
    return fail("intake_context_mismatch", "O contexto desta triagem não corresponde à situação selecionada.", 422);
  }

  const channel = contactChannel(data);
  if (!channel) {
    return fail("contact_channel_mismatch", "Informe um canal de retorno válido: WhatsApp ou e-mail.", 400);
  }
  if (!truthy(data.sensitive_docs_ack)) {
    return fail(
      "sensitive_docs_ack_required",
      "Confirme que documentos e dados sensíveis serão enviados somente depois, em canal seguro.",
      400,
    );
  }

  const meta = NUCLEI[nucleusId];
  const cityRaw = clamp(data.location_city, 80);
  const ufRaw = clamp(data.location_uf, 2).toUpperCase();
  let city = null;
  let uf = null;
  const locationMaterial = contextRule
    ? contextRule.location_material
    : meta.location_material;
  if (locationMaterial) {
    city = normalizeCity(cityRaw);
    uf = UF.has(ufRaw) ? ufRaw : null;
    if (!city || !uf) {
      return fail("location_required", "Informe cidade e UF para avaliarmos a necessidade de vistoria.", 400);
    }
  } else if (cityRaw || ufRaw) {
    return fail("irrelevant_location_rejected", "Localização não é necessária para esta primeira triagem.");
  }

  const organization = clamp(data.empresa || data.organization, 180);
  const fields = {
    need_code: needCode,
    nucleus_id: nucleusId,
    intake_contract_version: pin.intake_version,
    intake_pin_hash: pinResult.hash,
    admission_policy_id: pin.policy_id,
    admission_policy_version: pin.canonical_name,
    admission_policy_hash: pin.policy_hash,
    governance_source_sha: pin.governance_source_sha,
    offer_candidate_id: pin.offer_candidate_id || DEFAULT_OFFER_CANDIDATE,
    source_asset_id: pin.source_asset_id || DEFAULT_SOURCE_ASSET,
    source_origin_asset_id: attributionToken(data.source_origin_asset_id),
    source_origin_route_family: attributionToken(data.source_origin_route_family),
    landing_family: clamp(data.landing_family || data.route_family, 80) || "triagem-tecnica",
    source: SOURCE,
    outbound_eligible: false,
    auto_send: false,
    pessoa_tipo: organization ? "COMPANY" : "PERSON",
    decision_role: "UNKNOWN",
    canal_preferido: channel,
    location_material: locationMaterial,
    city,
    uf,
    city_class: locationMaterial ? `${city}/${uf}` : "NOT_MATERIAL",
    site_class: "UNKNOWN",
    urgency: "UNKNOWN",
    why_now: "UNKNOWN",
    desired_decision: "UNKNOWN",
    document_availability_class: "UNKNOWN",
    conflict_status: "NOT_SCREENED",
    conflict_reference: null,
  };
  fields.qualification_state = deriveQualification(fields);
  fields.estagio = meta.estagio;
  fields.jornada = meta.jornada;
  fields.urgencia_label = fields.urgency;
  return { handled: true, ok: true, fields, pin, pin_hash: pinResult.hash };
}

function publicAdaptiveSlice(fields) {
  if (!fields) return {};
  return {
    source: SOURCE,
    need_code: fields.need_code,
    nucleus_id: fields.nucleus_id,
    qualification_state: fields.qualification_state,
    intake_contract_version: fields.intake_contract_version,
    conflict_status: fields.conflict_status,
  };
}

function redactedAnalyticsProps(fields) {
  if (!fields) return {};
  return {
    nucleus_id: fields.nucleus_id,
    landing_family: fields.landing_family,
    qualification_state: fields.qualification_state,
    location_required: fields.location_material,
    source: SOURCE,
  };
}

module.exports = {
  INTAKE_FLAG,
  SOURCE,
  OTHER,
  OTHER_NUCLEUS,
  NUCLEI,
  NEEDS,
  INTAKE_CONTEXTS,
  PIN_KEYS,
  FORBIDDEN_KEYS,
  isAdaptivePayload,
  pinHash,
  parsePin,
  loadPin,
  enabledNuclei,
  rejectForbiddenKeys,
  rejectConflictParties,
  validateAdaptiveIntake,
  publicAdaptiveSlice,
  redactedAnalyticsProps,
  deriveQualification,
  canonicalPinMaterial,
};
