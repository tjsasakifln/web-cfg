/**
 * Adaptive five-nucleus public intake — fail-closed field matrix and pin check.
 * Draft contract IDs are never a production fallback. A pin must be injected
 * (tests: ADAPTIVE_INTAKE_PIN_JSON). Missing/unknown version or hash fails closed.
 * Feature flag: ADAPTIVE_INTAKE_NUCLEI (comma-separated). Empty = new nuclei off.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const INTAKE_FLAG = "adaptive_intake";
const SOURCE = "CONFENGE_WEB";
const OTHER = "OTHER_NEEDS_CONTEXT";

const NUCLEI = Object.freeze({
  expert_evidence_assistance: {
    estagio: "pericia-assistencia-tecnica",
    jornada: "outro",
    branch: "claim_stage",
  },
  property_valuation: {
    estagio: "avaliacao-imoveis",
    jornada: "outro",
    branch: "valuation",
  },
  building_engineering_documentation: {
    estagio: "engenharia-edificacoes",
    jornada: "outro",
    branch: "buildings",
  },
  occupational_safety: {
    estagio: "seguranca-do-trabalho",
    jornada: "outro",
    branch: "sst",
  },
  public_works_b2g: {
    estagio: "obras-publicas-b2g",
    jornada: "operacao",
    branch: "b2g",
  },
});

const PIN_KEYS = [
  "taxonomy",
  "offer_catalog",
  "intake",
  "admission_policy",
  "handraiser_state",
  "meetcfg_context",
  "source_asset_id",
  "offer_candidate_id",
];

const ENUMS = Object.freeze({
  canal_preferido: new Set(["whatsapp", "email", "phone"]),
  pessoa_tipo: new Set(["pessoa", "empresa"]),
  decision_role: new Set(["decisor", "procurador", "assessor", OTHER]),
  city_class: new Set(["grande_florianopolis", "sc", "br", "unknown"]),
  site_class: new Set([
    "residencia",
    "comercial",
    "industrial",
    "condominio",
    "obra",
    "estabelecimento",
    "certame",
    "unknown",
  ]),
  urgency: new Set(["ate_48h", "ate_7d", "ate_30d", "planejamento", "unknown"]),
  why_now: new Set([
    "audiencia",
    "prazo_legal",
    "transacao",
    "sinistro",
    "licitacao",
    "saude_ocupacional",
    OTHER,
  ]),
  desired_decision: new Set([
    "parecer",
    "laudo",
    "assistencia",
    "orcamento",
    "documentacao",
    "sst",
    "b2g_triage",
    "unknown",
  ]),
  document_availability_class: new Set(["none", "partial", "organized", "unknown"]),
  conflict_status: new Set(["none", "unknown", "check_required"]),
  claim_stage: new Set(["pre_processo", "em_curso", "sentenca", "unknown", OTHER]),
  valuation_purpose: new Set(["disputa", "garantia", "negociacao", "patrimonio", "unknown", OTHER]),
  inspection_window: new Set(["this_week", "this_month", "later", "unknown"]),
  property_class: new Set(["residencial", "comercial", "industrial", "rural", "unknown"]),
  work_type: new Set(["reforma", "obra_nova", "regularizacao", "inspecao", "unknown", OTHER]),
  work_stage: new Set(["estudo", "projeto", "execucao", "concluida", "unknown"]),
  project_status: new Set(["inexistente", "parcial", "completo", "unknown"]),
  budget_class: new Set(["sem_orcamento", "parcial", "fechado", "unknown"]),
  bim_status: new Set(["nao", "parcial", "sim", "unknown"]),
  establishment_class: new Set(["industria", "comercio", "obra", "servico", "unknown", OTHER]),
  risk_class: new Set(["acidente", "documentacao", "litigio", "preventivo", "unknown"]),
  sst_doc_class: new Set(["none", "partial", "organized", "unknown"]),
  certame_stage: new Set(["edital", "proposta", "contrato", "execucao", "unknown"]),
  contract_relation: new Set(["licitante", "contratada", "subcontratada", "assessoria", "unknown"]),
  entity_class: new Set(["municipal", "estadual", "federal", "autarquia", "unknown"]),
});

const BRANCH_FIELDS = Object.freeze({
  expert_evidence_assistance: ["claim_stage"],
  property_valuation: ["valuation_purpose", "inspection_window", "property_class"],
  building_engineering_documentation: [
    "work_type",
    "work_stage",
    "project_status",
    "budget_class",
    "bim_status",
  ],
  occupational_safety: ["establishment_class", "risk_class", "sst_doc_class"],
  public_works_b2g: ["certame_stage", "contract_relation", "entity_class"],
});

const SHARED_REQUIRED = [
  "canal_preferido",
  "pessoa_tipo",
  "decision_role",
  "city_class",
  "site_class",
  "urgency",
  "why_now",
  "desired_decision",
  "document_availability_class",
  "conflict_status",
];

const FORBIDDEN_KEYS = new Set([
  "cpf",
  "cpf_cnpj",
  "rg",
  "processo",
  "process_number",
  "numero_processo",
  "processo_numero",
  "corpus",
  "prontuario",
  "empregados",
  "employee_list",
  "lista_empregados",
  "planta",
  "projeto_arquivo",
  "projeto_planta",
  "laudo",
  "relatorio_pericial",
  "relatorio",
  "demonstrativo_financeiro",
  "documento_financeiro",
  "conflict_parties",
  "conflict_party",
  "partes",
  "parte_contraria",
  "parties",
  "upload",
  "arquivo",
  "file",
  "files",
  "attachment",
]);

const FORBIDDEN_KEY_RE =
  /cpf|prontuario|empregad|planta|laudo|relatorio_pericial|corpus|processo_numero|numero_processo|conflict_part|parte_contraria|\bpartes\b|demonstrativo_financeiro|documento_financeiro/;

function fail(error, message, status = 422) {
  return { ok: false, handled: true, status, error, message };
}

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

function pickEnum(value, allowed) {
  const raw = clamp(value, 80);
  if (!raw) return "";
  if (raw === "outro") return OTHER;
  return allowed.has(raw) ? raw : "";
}

function isAdaptivePayload(data) {
  if (!data || typeof data !== "object") return false;
  const flag = data[INTAKE_FLAG] ?? data.intake_mode;
  if (flag === true || flag === "true" || flag === "1" || flag === "adaptive") return true;
  if (data.nucleus_id || data.intake_contract_version || data.intake_pin_hash) return true;
  return false;
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
    if (!String(pin[key] || "").trim()) return { ok: false, error: "pin_incomplete", key };
  }
  if (pin.not_runtime_fallback !== true && pin.schema !== "confenge.adaptive-intake-pin/test-only") {
    // Production pin is explicit JSON in env; test fixture sets the flag.
    // Either is acceptable as long as required keys exist.
  }
  return { ok: true, pin, hash: pinHash(pin) };
}

function committedPinPath(root) {
  return path.join(root || path.resolve(__dirname, "../../.."), "data/site/adaptive-intake-pin.json");
}

function loadCommittedPin(root) {
  const filePath = committedPinPath(root);
  if (!fs.existsSync(filePath)) return { ok: false, error: "pin_missing" };
  let pin;
  try {
    pin = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return { ok: false, error: "pin_invalid_json" };
  }
  if (pin && pin.not_runtime_fallback === true) {
    return { ok: false, error: "pin_draft_fixture" };
  }
  return parsePin(pin);
}

function loadPin(env = process.env, root) {
  const raw = env && env.ADAPTIVE_INTAKE_PIN_JSON;
  if (raw != null && String(raw).trim() !== "") return parsePin(raw);
  if (env && env.ADAPTIVE_INTAKE_DISABLE_COMMITTED_PIN === "1") {
    return { ok: false, error: "pin_missing" };
  }
  return loadCommittedPin(root);
}

function enabledNuclei(env = process.env) {
  const raw = String((env && env.ADAPTIVE_INTAKE_NUCLEI) || "").trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function rejectForbiddenKeys(data) {
  if (!data || typeof data !== "object") return null;
  for (const key of Object.keys(data)) {
    const lower = String(key).toLowerCase();
    if (FORBIDDEN_KEYS.has(lower) || FORBIDDEN_KEY_RE.test(lower)) {
      return fail(
        "sensitive_field_rejected",
        "Este formulário não recebe documentos, CPF, processo, prontuário ou partes em conflito.",
        422,
      );
    }
  }
  return null;
}

function rejectConflictParties(data) {
  if (!data || typeof data !== "object") return null;
  for (const key of Object.keys(data)) {
    const lower = String(key).toLowerCase();
    if (/conflict_part|parte_contraria|\bpartes\b|parties/.test(lower)) {
      return fail(
        "conflict_parties_rejected",
        "Partes em conflito não são aceitas neste canal. Use o caminho protegido posterior.",
        422,
      );
    }
  }
  const bait = String(data.conflict_detail || data.conflict_notes || data.mensagem || "");
  if (/parte[s]?\s+(contrária|contraria|adversa)/i.test(bait) && data[INTAKE_FLAG]) {
    return fail(
      "conflict_parties_rejected",
      "Partes em conflito não são aceitas neste canal.",
      422,
    );
  }
  return null;
}

function looksLikeProcessCorpus(value) {
  const text = String(value || "");
  if (text.length > 280) return true;
  if (/\b\d{7}-?\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/.test(text)) return true;
  if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(text)) return true;
  return false;
}

function otherNeedsContext(fields) {
  return Object.values(fields).some((v) => v === OTHER);
}

function deriveQualification(fields) {
  if (fields.conflict_status === "check_required") return "CONFLICT_CHECK_REQUIRED";
  if (otherNeedsContext(fields)) return "NEEDS_CONTEXT";
  if (fields.document_availability_class === "none") return "DOCUMENT_GAP";
  return "POTENTIAL_FIT";
}

function truthyAck(value) {
  return (
    value === true ||
    value === "true" ||
    value === "on" ||
    value === "1" ||
    value === "yes" ||
    value === "sim"
  );
}

/**
 * Validate adaptive payload. Not invoked for legacy B2G (no nucleus/contract fields).
 * @returns {{ handled: false } | { handled: true, ok: false, status: number, error: string, message: string } | { handled: true, ok: true, fields: object }}
 */
function validateAdaptiveIntake(data, options = {}) {
  if (!isAdaptivePayload(data)) return { handled: false };
  const env = options.env || process.env;
  const forbidden = rejectForbiddenKeys(data) || rejectConflictParties(data);
  if (forbidden) return forbidden;

  const nucleusId = clamp(data.nucleus_id, 80);
  if (!nucleusId || !NUCLEI[nucleusId]) {
    return fail("nucleus_unknown", "Informe um núcleo válido.");
  }
  const enabled = enabledNuclei(env);
  if (!enabled.has(nucleusId)) {
    return fail(
      "nucleus_not_enabled",
      "Este núcleo ainda não está disponível neste canal.",
      422,
    );
  }

  const pinResult = options.pin ? parsePin(options.pin) : loadPin(env);
  if (!pinResult.ok) {
    return fail("contract_pin_missing", "Contrato de captura não pinado. Ramo novo permanece fechado.");
  }
  const pin = pinResult.pin;
  const expectedHash = pinResult.hash;
  const submittedVersion = clamp(data.intake_contract_version || data.contract_version, 120);
  if (!submittedVersion) {
    return fail("contract_version_missing", "Versão de contrato ausente.");
  }
  if (submittedVersion !== pin.intake) {
    return fail("contract_version_unknown", "Versão de contrato desconhecida.");
  }
  const submittedHash = clamp(data.intake_pin_hash || data.contract_pin_hash, 64);
  if (submittedHash && submittedHash !== expectedHash) {
    return fail("contract_hash_mismatch", "Hash de contrato divergente.");
  }
  if (!submittedHash) {
    return fail("contract_hash_missing", "Hash de contrato ausente.");
  }

  if (data.mensagem || data.message) {
    if (looksLikeProcessCorpus(data.mensagem || data.message)) {
      return fail(
        "sensitive_free_text_rejected",
        "Não envie processo, laudo ou texto livre sensível neste passo.",
      );
    }
    return fail(
      "free_text_rejected",
      "O primeiro passo não aceita texto livre. Use as classes fechadas.",
    );
  }

  if (!truthyAck(data.sensitive_docs_ack)) {
    return fail(
      "sensitive_docs_ack_required",
      "Confirme que documentos sensíveis não serão enviados neste passo.",
      400,
    );
  }

  const fields = {
    nucleus_id: nucleusId,
    intake_contract_version: submittedVersion,
    intake_pin_hash: expectedHash,
    taxonomy_version: pin.taxonomy,
    offer_catalog_version: pin.offer_catalog,
    admission_policy_version: pin.admission_policy,
    handraiser_state_version: pin.handraiser_state,
    meetcfg_context_version: pin.meetcfg_context,
    offer_candidate_id: clamp(data.offer_candidate_id, 80) || pin.offer_candidate_id,
    source_asset_id: clamp(data.source_asset_id, 80) || pin.source_asset_id,
    landing_family: clamp(data.landing_family, 80) || "adaptive-intake",
    source: SOURCE,
    outbound_eligible: false,
    auto_send: false,
  };

  if (fields.offer_candidate_id !== pin.offer_candidate_id) {
    return fail("offer_candidate_unknown", "Oferta candidata desconhecida.");
  }
  if (fields.source_asset_id !== pin.source_asset_id) {
    return fail("source_asset_unknown", "Ativo de origem desconhecido.");
  }

  for (const key of SHARED_REQUIRED) {
    const picked = pickEnum(data[key], ENUMS[key]);
    if (!picked) {
      return fail("validation", `Informe ${key.replace(/_/g, " ")}.`, 400);
    }
    fields[key] = picked;
  }

  const branchKeys = BRANCH_FIELDS[nucleusId] || [];
  for (const key of branchKeys) {
    const picked = pickEnum(data[key], ENUMS[key]);
    if (!picked) {
      return fail("validation", `Informe ${key.replace(/_/g, " ")}.`, 400);
    }
    fields[key] = picked;
  }
  for (const [otherNucleus, keys] of Object.entries(BRANCH_FIELDS)) {
    if (otherNucleus === nucleusId) continue;
    for (const key of keys) {
      const raw = clamp(data[key], 80);
      if (raw) {
        return fail(
          "irrelevant_branch_rejected",
          "Campos de outro núcleo não são aceitos nesta submissão.",
        );
      }
    }
  }

  const conflictRef = clamp(data.conflict_reference, 80);
  if (conflictRef && !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(conflictRef)) {
    return fail("conflict_reference_invalid", "Referência de conflito inválida.");
  }
  fields.conflict_reference = conflictRef || null;
  if (fields.conflict_status === "check_required" && !fields.conflict_reference) {
    fields.conflict_reference = "pending_protected_path";
  }

  fields.qualification_state = deriveQualification(fields);
  const meta = NUCLEI[nucleusId];
  fields.estagio = clamp(data.estagio, 120) || meta.estagio;
  fields.jornada = meta.jornada;
  fields.urgencia_label = fields.urgency;
  return { handled: true, ok: true, fields, pin, pin_hash: expectedHash };
}

function publicAdaptiveSlice(fields) {
  if (!fields) return {};
  return {
    source: SOURCE,
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
    conflict_status: fields.conflict_status,
    urgency_category: fields.urgency,
    source: SOURCE,
  };
}

module.exports = {
  INTAKE_FLAG,
  SOURCE,
  OTHER,
  NUCLEI,
  BRANCH_FIELDS,
  ENUMS,
  FORBIDDEN_KEYS,
  isAdaptivePayload,
  pinHash,
  parsePin,
  loadPin,
  loadCommittedPin,
  committedPinPath,
  enabledNuclei,
  rejectForbiddenKeys,
  rejectConflictParties,
  validateAdaptiveIntake,
  publicAdaptiveSlice,
  redactedAnalyticsProps,
  deriveQualification,
  canonicalPinMaterial,
};
