/**
 * Consumer of a project-review extract.
 * Classifies each row as one of four honest classes and refuses to turn
 * missing documents, unanswered checks or unverified geometry/norm into
 * project errors, risk grades or non-compliance conclusions.
 *
 * The canonical demonstrative source is owned by INB-06. This module does
 * not invent that proof.
 */

export const EXTRACT_CLASSES = Object.freeze({
  CONSTATACAO_SUSTENTADA: "constatacao_sustentada",
  INFORMACAO_FALTANTE: "informacao_faltante",
  RECOMENDACAO: "recomendacao",
  VERIFICACAO_NAO_REALIZADA: "verificacao_nao_realizada",
});

export const FORBIDDEN_CONCLUSIONS = Object.freeze([
  "risco",
  "nao_conformidade",
  "erro_do_projeto",
  "aprovado",
  "reprovado",
  "obra_segura",
  "conformidade_total",
]);

const UNANSWERED = new Set([
  "",
  "unanswered",
  "not_performed",
  "pending",
  "nao_realizada",
  "nao_respondido",
  null,
  undefined,
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function indexDocuments(documents) {
  const byId = new Map();
  for (const doc of asArray(documents)) {
    if (doc && doc.id) byId.set(String(doc.id), doc);
  }
  return byId;
}

function evidenceResolves(refs, documents) {
  const list = asArray(refs).filter(Boolean);
  if (list.length === 0) return false;
  return list.every((ref) => {
    const raw = String(ref);
    const docId = raw.split("#")[0];
    const doc = documents.get(docId);
    return Boolean(doc && doc.present !== false);
  });
}

function claimedForbiddenConclusion(item) {
  const candidates = [
    item.conclusion,
    item.severity,
    item.grade,
    item.class,
    item.claimed_class,
  ]
    .filter((value) => typeof value === "string")
    .map((value) => value.trim().toLowerCase().replace(/\s+/g, "_"));
  return candidates.find((value) => FORBIDDEN_CONCLUSIONS.includes(value)) || null;
}

function geometryOrNormUnverified(item, report) {
  const geometry =
    item.geometry_verified ?? report.geometry_verified ?? report.verifications?.geometry_verified;
  const norm = item.norm_verified ?? report.norm_verified ?? report.verifications?.norm_verified;
  return geometry !== true || norm !== true;
}

function classifyChecklist(raw) {
  const status = raw?.status;
  const unanswered = UNANSWERED.has(status);
  return {
    id: raw?.id || "checklist",
    kind: "checklist",
    class: EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA,
    document_id: raw?.document_id || null,
    document_revision: raw?.document_revision || null,
    element: raw?.prompt || raw?.element || null,
    finding_text: unanswered
      ? "Item de conferência ainda não realizado; não é erro do projeto."
      : raw?.finding_text || null,
    implication: null,
    missing_information: unanswered ? raw?.prompt || "conferência não respondida" : null,
    forwarding: "Manter como pergunta técnica até haver insumo e critério aplicável.",
    evidence_refs: [],
    concludes_noncompliance: false,
    concludes_risk: false,
    question_preserved: true,
    honesty_notes: unanswered
      ? ["unanswered_checklist_is_not_project_error"]
      : ["checklist_is_verification"],
  };
}

export function classifyItem(raw, documents, report = {}) {
  if (raw?.kind === "checklist" || raw?.type === "checklist") {
    return classifyChecklist(raw);
  }

  const notes = [];
  const document = raw?.document_id ? documents.get(String(raw.document_id)) : null;
  const documentMissing = !raw?.document_id || !document || document.present === false;
  const revisionDiverges =
    Boolean(raw?.document_revision) &&
    Boolean(document?.revision) &&
    String(raw.document_revision) !== String(document.revision);
  const refs = asArray(raw?.evidence_refs);
  const evidenceOk = evidenceResolves(refs, documents);
  const forbidden = claimedForbiddenConclusion(raw);
  const unverified = geometryOrNormUnverified(raw, report);
  const isRecommendation =
    raw?.kind === "recommendation" ||
    raw?.kind === "recomendacao" ||
    (!raw?.finding_text && Boolean(raw?.forwarding));

  let cls;
  let questionPreserved = false;

  if (documentMissing) {
    cls = EXTRACT_CLASSES.INFORMACAO_FALTANTE;
    notes.push("document_absent");
    questionPreserved = true;
  } else if (revisionDiverges) {
    cls = EXTRACT_CLASSES.INFORMACAO_FALTANTE;
    notes.push("revision_diverges");
    questionPreserved = true;
  } else if (raw?.finding_text && !evidenceOk) {
    cls = EXTRACT_CLASSES.INFORMACAO_FALTANTE;
    notes.push("evidence_not_referenced");
    questionPreserved = true;
  } else if (forbidden && (unverified || !evidenceOk)) {
    cls = EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA;
    notes.push("forbidden_conclusion_without_verified_basis");
    questionPreserved = true;
  } else if (unverified && raw?.requires_geometry_or_norm === true) {
    cls = EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA;
    notes.push("geometry_or_norm_not_verified");
    questionPreserved = true;
  } else if (isRecommendation) {
    cls = EXTRACT_CLASSES.RECOMENDACAO;
    notes.push("recommendation_not_finding");
  } else if (raw?.finding_text && evidenceOk && !documentMissing && !revisionDiverges) {
    cls = EXTRACT_CLASSES.CONSTATACAO_SUSTENTADA;
    notes.push("evidenced_finding");
  } else {
    cls = EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA;
    notes.push("verification_not_performed");
    questionPreserved = true;
  }

  return {
    id: raw?.id || null,
    kind: raw?.kind || "item",
    class: cls,
    document_id: raw?.document_id || null,
    document_revision: raw?.document_revision || document?.revision || null,
    document_name: document?.name || null,
    element: raw?.element || null,
    finding_text: cls === EXTRACT_CLASSES.CONSTATACAO_SUSTENTADA ? raw?.finding_text : raw?.finding_text || null,
    implication: raw?.implication || null,
    missing_information: raw?.missing_information || (documentMissing ? "documento ausente" : null),
    forwarding: raw?.forwarding || null,
    evidence_refs: refs,
    concludes_noncompliance: false,
    concludes_risk: false,
    question_preserved: questionPreserved,
    rejected_conclusion: forbidden,
    honesty_notes: notes,
  };
}

export function classifyExtract(report) {
  if (!report || typeof report !== "object") {
    throw new Error("report_required");
  }
  const documents = indexDocuments(report.documents || report.package?.documents || []);
  const items = asArray(report.items).map((item) => classifyItem(item, documents, report));
  const checklist = asArray(report.checklist).map((item) => classifyChecklist(item));
  const classified = [...items, ...checklist];
  return {
    schema: "confenge.project-review-extract/1.0",
    kind: report.kind || "demonstrative",
    source_campaign: report.source_campaign || null,
    founder_approved: false,
    not_client_work: true,
    package: report.package || null,
    items: classified,
    honesty: honestyReport(classified),
  };
}

export function honestyReport(items) {
  const classes = new Set(asArray(items).map((item) => item.class));
  const concludesRisk = asArray(items).some((item) => item.concludes_risk === true);
  const concludesNoncompliance = asArray(items).some((item) => item.concludes_noncompliance === true);
  const inventedError = asArray(items).some((item) =>
    FORBIDDEN_CONCLUSIONS.includes(item.class),
  );
  return {
    classes: [...classes],
    concludes_risk: concludesRisk,
    concludes_noncompliance: concludesNoncompliance,
    invented_project_error: inventedError,
    four_classes_present:
      classes.has(EXTRACT_CLASSES.CONSTATACAO_SUSTENTADA) &&
      classes.has(EXTRACT_CLASSES.INFORMACAO_FALTANTE) &&
      classes.has(EXTRACT_CLASSES.RECOMENDACAO) &&
      classes.has(EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA),
  };
}

export function assertHonestExtract(classified) {
  const honesty = classified.honesty || honestyReport(classified.items || classified);
  if (honesty.concludes_risk) {
    throw new Error("extract_concludes_risk_without_authority");
  }
  if (honesty.concludes_noncompliance) {
    throw new Error("extract_concludes_noncompliance_without_verified_basis");
  }
  if (honesty.invented_project_error) {
    throw new Error("extract_treats_gap_as_project_error");
  }
  return honesty;
}
