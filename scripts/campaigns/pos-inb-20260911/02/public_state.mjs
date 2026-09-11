/**
 * Presentation labels for internal demonstrative states.
 *
 * IDs and contract codes stay stable. Only the public string is translated.
 * Unknown codes are not printed and are never mapped to "aprovado".
 */

export const PUBLIC_STATE_LABELS = Object.freeze({
  resolved_in_R01: "Corrigido na revisão R01",
  information_requested: "Pedido de informação",
  pending_author_adjustment: "Registrada, ajuste pendente do autor",
  correction_proposed: "Correção proposta, aguarda aceite do autor",
  author_accepted: "Ajuste aceito pelo autor",
  stale_revision: "Não conferida contra a revisão atual",
  corrected_in_revision: "Corrigido na revisão R01",
  detected: "Registrada",
  pending: "Ajuste pendente",
});

const APPROVED_RE = /\baprovad/i;

export function publicStateLabel(code) {
  if (code == null || code === "") return null;
  const key = String(code);
  if (!Object.prototype.hasOwnProperty.call(PUBLIC_STATE_LABELS, key)) {
    return null;
  }
  const label = PUBLIC_STATE_LABELS[key];
  assertNotMappedToApproved(key, label);
  return label;
}

export function isKnownPublicState(code) {
  if (code == null || code === "") return false;
  return Object.prototype.hasOwnProperty.call(PUBLIC_STATE_LABELS, String(code));
}

export function assertNotMappedToApproved(code, label) {
  const text = String(label || "");
  if (APPROVED_RE.test(text)) {
    throw new Error(`public_state_must_not_map_to_aprovado:${code}`);
  }
  return text;
}

export function presentState(code) {
  const label = publicStateLabel(code);
  if (label) return { code: String(code), label, known: true };
  return { code: String(code || ""), label: null, known: false };
}
