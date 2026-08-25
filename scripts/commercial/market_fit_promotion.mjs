/**
 * Avaliação fail-closed do portão PROMOTE do protocolo de market fit (#336).
 *
 * Regra única: um entregável só fica elegível à promoção quando TODAS as classes
 * de evidência exigidas pelo protocolo estão satisfeitas, cada uma pelo critério
 * numérico que o protocolo publica. Ausência de evidência, evidência de tipo
 * errado ou critério desconhecido reprovam. Nada é inferido.
 */

const UNKNOWN_KIND = "criterio_desconhecido";

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * @param {object} promoteGate  gates.PROMOTE do market-fit-protocol.v1.json
 * @param {object} evidence     contadores e booleanos observados por entregável
 * @returns {{eligible: boolean, unmet: Array, satisfied: Array, missing_classes: Array}}
 */
export function evaluatePromotion(promoteGate, evidence) {
  const unmet = [];
  const satisfied = [];

  if (!promoteGate || typeof promoteGate !== "object") {
    return { eligible: false, unmet: [{ id: "gate", reason: "portao_ausente" }], satisfied, missing_classes: [] };
  }
  const required = Array.isArray(promoteGate.required_evidence_classes)
    ? promoteGate.required_evidence_classes
    : [];
  const criteria = Array.isArray(promoteGate.criteria) ? promoteGate.criteria : [];
  if (required.length === 0 || criteria.length === 0) {
    return { eligible: false, unmet: [{ id: "gate", reason: "portao_vazio" }], satisfied, missing_classes: required };
  }

  const bag = evidence && typeof evidence === "object" ? evidence : {};
  const classesWithCriteria = new Set();

  for (const criterion of criteria) {
    const value = bag[criterion.field];
    classesWithCriteria.add(criterion.evidence_class);
    // Classe não exigida pelo protocolo não decide promoção.
    if (!required.includes(criterion.evidence_class)) continue;

    let ok = false;
    let reason = "";
    if (criterion.kind === "min_count") {
      ok = isFiniteNumber(value) && value >= criterion.min;
      reason = isFiniteNumber(value) ? `abaixo_do_limiar:${value}<${criterion.min}` : "evidencia_ausente";
    } else if (criterion.kind === "max_abs_pct") {
      ok = isFiniteNumber(value) && Math.abs(value) <= criterion.max_abs;
      reason = isFiniteNumber(value) ? `fora_da_tolerancia:${value}` : "evidencia_ausente";
    } else if (criterion.kind === "must_be_true") {
      ok = value === true;
      reason = value === undefined ? "evidencia_ausente" : "condicao_falsa";
    } else {
      ok = false;
      reason = UNKNOWN_KIND;
    }

    if (ok) satisfied.push({ id: criterion.id, evidence_class: criterion.evidence_class });
    else unmet.push({ id: criterion.id, evidence_class: criterion.evidence_class, reason });
  }

  // Uma classe exigida sem nenhum critério publicado não pode ser dada por satisfeita.
  const missingClasses = required.filter((cls) => !classesWithCriteria.has(cls));
  for (const cls of missingClasses) {
    unmet.push({ id: `classe:${cls}`, evidence_class: cls, reason: "classe_sem_criterio" });
  }

  return { eligible: unmet.length === 0, unmet, satisfied, missing_classes: missingClasses };
}

export default { evaluatePromotion };
