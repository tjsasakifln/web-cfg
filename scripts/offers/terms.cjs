/**
 * Immutable terms snapshot. Not published as legally validated counsel text.
 */
const crypto = require("crypto");
const { AUTHORITY } = require("./registry.cjs");

const TERMS_VERSION = AUTHORITY.terms_version;
const TERMS_STATUS = "PREVIEW_NOT_LEGAL_VALIDATION";

const TERMS_BODY = [
  "Snapshot CFG-TERMS-B2B-2026-08-17-v1.",
  "Preview comercial. Nao e texto juridico validado por advogado.",
  "Diagnostico: one-time, 10-15 dias uteis apos alinhamento e dados.",
  "Plano Mensal: mensal, sem minimo, aviso de 30 dias.",
  "Compromisso Semestral: 6 x R$ 15.000, maxPayments=6, aviso de 30 dias.",
  "Compromisso Anual: 12 x R$ 12.500, maxPayments=12, aviso de 30 dias.",
  "Capacidade Full: teto 50 slots, 1 slot padrao, hold 72h, reserva final apos pagamento confirmado.",
  "Inadimplencia (preview): multa 2% + juros simples 1%/mes pro rata die + IPCA; suspensao apos 10 dias e aviso de 2 dias uteis.",
  "Saida antecipada do Compromisso Semestral/Anual (preview, depende de aprovacao juridica): aviso 30 dias + recomposicao do desconto, com teto.",
].join("\n");

function termsHash(body = TERMS_BODY) {
  return crypto.createHash("sha256").update(body, "utf8").digest("hex");
}

const TERMS_HASH = termsHash();

function currentTerms() {
  return {
    terms_version: TERMS_VERSION,
    terms_hash: TERMS_HASH,
    status: TERMS_STATUS,
    legally_validated: false,
    body: TERMS_BODY,
  };
}

function acceptTerms({ actor, acceptedAt, evidence } = {}) {
  const now = acceptedAt || new Date().toISOString();
  return Object.freeze({
    terms_version: TERMS_VERSION,
    terms_hash: TERMS_HASH,
    accepted_at: now,
    actor: actor || "unknown",
    evidence: evidence || { method: "checkbox" },
    immutable: true,
    legally_validated: false,
  });
}

function isAcceptanceSnapshot(acceptance) {
  if (!acceptance || typeof acceptance !== "object") return false;
  return (
    acceptance.immutable === true
    && Boolean(acceptance.terms_version)
    && Boolean(acceptance.terms_hash)
    && Boolean(acceptance.accepted_at)
  );
}

function termsMatch(acceptance, expected) {
  if (!isAcceptanceSnapshot(acceptance)) return false;
  const live = expected || currentTerms();
  return (
    acceptance.terms_version === live.terms_version
    && acceptance.terms_hash === live.terms_hash
  );
}

function mutateAcceptance(acceptance, patch) {
  if (!acceptance || acceptance.immutable) {
    return { ok: false, error: "terms_immutable" };
  }
  return { ok: true, acceptance: { ...acceptance, ...patch } };
}

module.exports = {
  TERMS_VERSION,
  TERMS_HASH,
  TERMS_STATUS,
  TERMS_BODY,
  termsHash,
  currentTerms,
  acceptTerms,
  isAcceptanceSnapshot,
  termsMatch,
  mutateAcceptance,
};
