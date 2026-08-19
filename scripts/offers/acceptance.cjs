/**
 * Electronic acceptance before production checkout. Append-only records.
 */
const crypto = require("crypto");
const { validateCnpj } = require("../conversion/cnpj.cjs");
const {
  PINNED_LEGAL_HASH,
  APPROVED_OFFER,
  APPROVED_AMOUNT_CENTS,
  TERMS_VERSION,
  safeEqual,
} = require("./providers/config-production.cjs");

const PRIVACY_VERSION = "CFG-LEGAL-PRIVACY-LEADS-FOUNDER-v1";
const SCOPE_VERSION = "CFG-DIAG-EXP-v1";

const REQUIRED_DECLARATIONS = Object.freeze({
  li_e_aceito_os_termos: "li e aceito os termos",
  declaro_possuir_poderes_para_contratar: "declaro possuir poderes para contratar",
  reconheco_obrigacao_de_meio: "reconheço que o serviço é obrigação de meio",
  confirmo_contratacao_b2b_atividade_economica: "confirmo contratação B2B para atividade econômica",
});

function digitsCnpj(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function hashAcceptance(record) {
  const material = JSON.stringify({
    cnpj: record.cnpj,
    representative_name: record.representative_name,
    representative_role: record.representative_role,
    email: record.email,
    timestamp_utc: record.timestamp_utc,
    terms_version: record.terms_version,
    terms_hash: record.terms_hash,
    amount_cents: record.amount_cents,
    declarations: record.declarations,
  });
  return `sha256:${crypto.createHash("sha256").update(material).digest("hex")}`;
}

function assertDeclarations(input) {
  const got = input && input.declarations ? input.declarations : {};
  for (const [key, text] of Object.entries(REQUIRED_DECLARATIONS)) {
    if (got[key] !== true && got[key] !== text) {
      return { ok: false, error: "declaration_missing", field: key };
    }
  }
  if (got.lgpd_generic_consent === true) {
    return { ok: false, error: "generic_lgpd_consent_forbidden" };
  }
  return { ok: true };
}

function requestAcceptance(input = {}, deps = {}) {
  const checked = validateCnpj(input.cnpj);
  if (!checked.ok) return { ok: false, error: checked.error || "cnpj_invalid", statusCode: 422 };
  const name = String(input.representative_name || "").trim();
  const role = String(input.representative_role || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  if (!name || !role || !email || !email.includes("@")) {
    return { ok: false, error: "representante_incomplete", statusCode: 422 };
  }
  if (input.personal_or_consumer === true || input.natural_person === true || input.minor === true) {
    return { ok: false, error: "eligibility_manual_review", statusCode: 422 };
  }
  const decls = assertDeclarations(input);
  if (!decls.ok) return { ...decls, statusCode: 422 };
  if (input.offer_id && input.offer_id !== APPROVED_OFFER) {
    return { ok: false, error: "offer_not_approved", statusCode: 422 };
  }
  if (input.amount_cents != null && Number(input.amount_cents) !== APPROVED_AMOUNT_CENTS) {
    return { ok: false, error: "price_tamper", statusCode: 422 };
  }
  if (input.terms_version && input.terms_version !== TERMS_VERSION) {
    return { ok: false, error: "terms_version_mismatch", statusCode: 422 };
  }
  const legalHash = String(input.legal_authority_hash || deps.legalHash || "").trim();
  if (legalHash && !safeEqual(legalHash, PINNED_LEGAL_HASH)) {
    return { ok: false, error: "legal_hash_mismatch", statusCode: 422 };
  }

  const otp = deps.otp || String(crypto.randomInt(100000, 999999));
  const magicLinkToken = deps.magicLinkToken || crypto.randomBytes(24).toString("hex");
  const pendingId = `pend_${crypto.randomBytes(8).toString("hex")}`;
  if (magicLinkToken === pendingId) {
    return { ok: false, error: "challenge_collision", statusCode: 500 };
  }
  const pending = {
    kind: "acceptance_pending",
    pending_id: pendingId,
    cnpj: checked.cnpj,
    representative_name: name,
    representative_role: role,
    email,
    offer_id: APPROVED_OFFER,
    amount_cents: APPROVED_AMOUNT_CENTS,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    scope_version: SCOPE_VERSION,
    legal_authority_hash: PINNED_LEGAL_HASH,
    declarations: { ...REQUIRED_DECLARATIONS },
    otp_hash: crypto.createHash("sha256").update(otp).digest("hex"),
    magic_link_hash: crypto.createHash("sha256").update(magicLinkToken).digest("hex"),
    created_at: (deps.clock && deps.clock.now ? deps.clock.now() : new Date()).toISOString(),
  };
  return {
    ok: true,
    pending,
    challenge: { otp, magic_link_token: magicLinkToken },
    otp_for_test: deps.exposeOtp === true ? otp : undefined,
  };
}

async function confirmAcceptance(store, input = {}, deps = {}) {
  if (!store) return { ok: false, error: "store_unavailable", statusCode: 503 };
  const pendingId = String(input.pending_id || "");
  const pending = await store.get(`acceptance-pending:${pendingId}`);
  if (!pending || pending.kind !== "acceptance_pending") {
    return { ok: false, error: "acceptance_pending_missing", statusCode: 404 };
  }
  const otpProvided = String(input.otp || "").trim();
  const magicProvided = String(input.magic_link_token || "").trim();
  const otpOk = Boolean(otpProvided) && safeEqual(
    crypto.createHash("sha256").update(otpProvided).digest("hex"),
    pending.otp_hash,
  );
  const magicOk = Boolean(magicProvided)
    && magicProvided !== pending.pending_id
    && pending.magic_link_hash
    && safeEqual(
      crypto.createHash("sha256").update(magicProvided).digest("hex"),
      pending.magic_link_hash,
    );
  if (!otpOk && !magicOk) {
    return { ok: false, error: "email_confirmation_failed", statusCode: 401 };
  }
  const now = deps.clock && deps.clock.now ? deps.clock.now() : new Date();
  const acceptanceId = `acc_${crypto.createHash("sha256").update(`${pending.cnpj}|${now.toISOString()}|${pending.pending_id}`).digest("hex").slice(0, 20)}`;
  const record = {
    kind: "acceptance",
    acceptance_id: acceptanceId,
    cnpj: pending.cnpj,
    representative_name: pending.representative_name,
    representative_role: pending.representative_role,
    email: pending.email,
    timestamp_utc: now.toISOString(),
    timezone: "America/Sao_Paulo",
    ip: input.ip || null,
    user_agent: input.user_agent || null,
    offer_version: "v1",
    scope_version: pending.scope_version,
    terms_version: pending.terms_version,
    privacy_version: pending.privacy_version,
    offer_hash: PINNED_LEGAL_HASH,
    scope_hash: PINNED_LEGAL_HASH,
    terms_hash: PINNED_LEGAL_HASH,
    privacy_hash: PINNED_LEGAL_HASH,
    amount_cents: APPROVED_AMOUNT_CENTS,
    correlation_id: input.correlation_id || acceptanceId,
    declarations: pending.declarations,
    declaration_text_exact: Object.values(REQUIRED_DECLARATIONS).join(" | "),
    email_confirmation_evidence: input.magic_link_token ? "magic_link" : "otp",
    legal_authority_hash: PINNED_LEGAL_HASH,
    immutable: true,
  };
  record.record_hash = hashAcceptance(record);
  const inserted = await store.putIfAbsent(`acceptance:${acceptanceId}`, record);
  await store.put(`acceptance-cnpj:${digitsCnpj(pending.cnpj)}`, { acceptance_id: acceptanceId });
  return { ok: true, acceptance: inserted.value || record };
}

async function requireValidAcceptance(store, acceptanceId, { cnpj, amount_cents, offer_id } = {}) {
  if (!acceptanceId) return { ok: false, error: "acceptance_missing", statusCode: 422 };
  const record = await store.get(`acceptance:${acceptanceId}`);
  if (!record || record.kind !== "acceptance" || record.immutable !== true) {
    return { ok: false, error: "acceptance_missing", statusCode: 422 };
  }
  if (cnpj && digitsCnpj(cnpj) !== digitsCnpj(record.cnpj)) {
    return { ok: false, error: "acceptance_cnpj_mismatch", statusCode: 422 };
  }
  if (amount_cents != null && Number(amount_cents) !== record.amount_cents) {
    return { ok: false, error: "price_tamper", statusCode: 422 };
  }
  if (offer_id && offer_id !== record.offer_id && offer_id !== APPROVED_OFFER) {
    return { ok: false, error: "offer_not_approved", statusCode: 422 };
  }
  if (record.legal_authority_hash !== PINNED_LEGAL_HASH || record.terms_version !== TERMS_VERSION) {
    return { ok: false, error: "terms_changed_after_acceptance", statusCode: 422 };
  }
  return { ok: true, acceptance: record };
}

module.exports = {
  REQUIRED_DECLARATIONS,
  PRIVACY_VERSION,
  SCOPE_VERSION,
  requestAcceptance,
  confirmAcceptance,
  requireValidAcceptance,
  hashAcceptance,
};
