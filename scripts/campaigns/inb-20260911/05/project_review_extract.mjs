/**
 * SELECT-only consumer of the INB-06 private-project demonstrative.
 *
 * Canonical sources (owned by campaign 06):
 *   data/demonstrative/private-project-pilot/consumption.v1.json
 *   casos/demonstrativo-projeto-privado/data/revisao.csv
 *
 * Joins review_findings to coordination_findings and to revisao.csv.
 * Does not invent a second building, subtotals, risk grades or norm claims.
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

export const CANONICAL_06_PATHS = Object.freeze({
  consumption: "data/demonstrative/private-project-pilot/consumption.v1.json",
  revisaoCsv: "casos/demonstrativo-projeto-privado/data/revisao.csv",
  fixtureConsumption: "tests/fixtures/inb05/consumption.v1.json",
  fixtureCsv: "tests/fixtures/inb05/revisao.csv",
  sourceSha: "399a32c415171ccc9e26cae565ecf83f9ecd4c92",
});

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

const NORM_UNEXAMINED = /norma n[aã]o examinada|sem exame de norma/i;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function indexById(list, key = "id") {
  const map = new Map();
  for (const item of asArray(list)) {
    if (item && item[key]) map.set(String(item[key]), item);
  }
  return map;
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ";") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

export function parseRevisaoCsv(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    header.forEach((key, index) => {
      row[key] = cells[index] ?? "";
    });
    row.elementos = String(row.elementos || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return row;
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

function classifyChecklist(raw) {
  const status = raw?.status;
  const unanswered = UNANSWERED.has(status);
  return {
    id: raw?.id || "checklist",
    kind: "checklist",
    class: EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA,
    document_id: raw?.document_id || raw?.documento || null,
    document_revision: raw?.document_revision || raw?.revisao || null,
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

function rowFrom06(rf, csv, cf) {
  return {
    id: rf.id,
    document_id: csv?.documento || rf.document_ref || null,
    document_revision: csv?.revisao || null,
    element_ids: asArray(rf.element_ids).length
      ? asArray(rf.element_ids)
      : asArray(csv?.elementos),
    finding_text: csv?.constatacao || rf.finding_pt_br || null,
    basis: csv?.base || rf.basis_pt_br || null,
    forwarding: csv?.acao || rf.action_pt_br || null,
    related_finding_id: rf.related_finding_id || csv?.achado_relacionado || null,
    check_kind: rf.check_kind || csv?.tipo_conferencia || null,
    coordination: cf || null,
  };
}

function classify06Finding(rf, { elements, findings, csvById, consumption }) {
  const csv = csvById.get(rf.id);
  const cf = findings.get(rf.related_finding_id);
  const row = rowFrom06(rf, csv, cf);
  const notes = [];
  const elementIds = row.element_ids;
  const elementsOk = elementIds.length > 0 && elementIds.every((id) => elements.has(id));
  const relatedOk = Boolean(cf);
  const packageRevision = consumption.revision || null;
  const revisionDiverges =
    Boolean(row.document_revision) &&
    Boolean(packageRevision) &&
    String(row.document_revision) !== String(packageRevision);
  const forbidden = claimedForbiddenConclusion(rf);
  const items = [];

  if (!relatedOk) {
    notes.push("evidence_not_referenced");
    items.push({
      ...row,
      kind: "finding",
      class: EXTRACT_CLASSES.INFORMACAO_FALTANTE,
      element: elementIds.join(" "),
      missing_information: `achado relacionado ${rf.related_finding_id || "ausente"} não referenciado`,
      concludes_noncompliance: false,
      concludes_risk: false,
      question_preserved: true,
      rejected_conclusion: forbidden,
      honesty_notes: notes,
    });
    return items;
  }

  if (!elementsOk) {
    notes.push("document_absent");
    items.push({
      ...row,
      kind: "finding",
      class: EXTRACT_CLASSES.INFORMACAO_FALTANTE,
      element: elementIds.join(" "),
      missing_information: "elemento ou documento ausente no recorte",
      concludes_noncompliance: false,
      concludes_risk: false,
      question_preserved: true,
      rejected_conclusion: forbidden,
      honesty_notes: notes,
    });
    return items;
  }

  if (revisionDiverges) {
    notes.push("revision_diverges");
    items.push({
      ...row,
      kind: "finding",
      class: EXTRACT_CLASSES.INFORMACAO_FALTANTE,
      element: elementIds.join(" "),
      missing_information: `revisão ${row.document_revision} diverge da revisão do recorte ${packageRevision}`,
      concludes_noncompliance: false,
      concludes_risk: false,
      question_preserved: true,
      rejected_conclusion: forbidden,
      honesty_notes: notes,
    });
    return items;
  }

  const missingInfo =
    cf.kind === "missing_information" || cf.proven_failure === false;
  const evidencedGeometry = cf.kind === "geometric" && cf.proven_failure === true;

  if (forbidden && !evidencedGeometry) {
    items.push({
      ...row,
      kind: "finding",
      class: EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA,
      element: elementIds.join(" "),
      concludes_noncompliance: false,
      concludes_risk: false,
      question_preserved: true,
      rejected_conclusion: forbidden,
      honesty_notes: ["forbidden_conclusion_without_verified_basis"],
    });
    return items;
  }

  if (missingInfo) {
    items.push({
      ...row,
      kind: "finding",
      class: EXTRACT_CLASSES.INFORMACAO_FALTANTE,
      element: elementIds.join(" "),
      missing_information: row.finding_text,
      concludes_noncompliance: false,
      concludes_risk: false,
      question_preserved: true,
      rejected_conclusion: forbidden,
      honesty_notes: ["missing_information_is_not_proven_failure"],
    });
  } else if (evidencedGeometry) {
    items.push({
      ...row,
      kind: "finding",
      class: EXTRACT_CLASSES.CONSTATACAO_SUSTENTADA,
      element: elementIds.join(" "),
      implication: cf.state ? `estado no recorte: ${cf.state}` : null,
      concludes_noncompliance: false,
      concludes_risk: false,
      question_preserved: false,
      rejected_conclusion: forbidden,
      honesty_notes: ["evidenced_finding"],
    });
  } else {
    items.push({
      ...row,
      kind: "finding",
      class: EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA,
      element: elementIds.join(" "),
      concludes_noncompliance: false,
      concludes_risk: false,
      question_preserved: true,
      rejected_conclusion: forbidden,
      honesty_notes: ["verification_not_performed"],
    });
  }

  if (row.forwarding && evidencedGeometry) {
    items.push({
      id: `${rf.id}-acao`,
      kind: "recommendation",
      class: EXTRACT_CLASSES.RECOMENDACAO,
      document_id: row.document_id,
      document_revision: row.document_revision,
      element: elementIds.join(" "),
      finding_text: null,
      basis: row.basis,
      forwarding: row.forwarding,
      related_finding_id: row.related_finding_id,
      concludes_noncompliance: false,
      concludes_risk: false,
      question_preserved: false,
      honesty_notes: ["recommendation_from_06_action"],
    });
  }

  if (NORM_UNEXAMINED.test(row.basis || "")) {
    items.push({
      id: `${rf.id}-norma`,
      kind: "verification",
      class: EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA,
      document_id: row.document_id,
      document_revision: row.document_revision,
      element: elementIds.join(" "),
      finding_text: row.basis,
      forwarding:
        "Manter a pergunta técnica: qual critério normativo, se algum, se aplica a este recorte? Sem norma examinada, não se conclui risco nem não conformidade.",
      related_finding_id: row.related_finding_id,
      concludes_noncompliance: false,
      concludes_risk: false,
      question_preserved: true,
      honesty_notes: ["geometry_or_norm_not_verified"],
    });
  }

  return items;
}

export function classifyExtract(report, options = {}) {
  if (!report || typeof report !== "object") {
    throw new Error("report_required");
  }
  const revisaoRows = options.revisaoRows
    || (options.revisaoCsv ? parseRevisaoCsv(options.revisaoCsv) : []);
  if (Array.isArray(report.review_findings)) {
    const elements = indexById(report.elements);
    const findings = indexById(report.coordination_findings);
    const csvById = indexById(revisaoRows);
    const items = report.review_findings.flatMap((rf) =>
      classify06Finding(rf, { elements, findings, csvById, consumption: report }),
    );
    const checklist = asArray(report.checklist).map((item) => classifyChecklist(item));
    const classified = [...items, ...checklist];
    return {
      schema: "confenge.project-review-extract/1.0",
      kind: report.origin || "demonstrative",
      source_campaign: "06",
      proof_id: report.proof_id || null,
      founder_approved: false,
      not_client_work: true,
      package: {
        revision: report.revision || null,
        url: report.url || null,
        label: report.label_pt_br || null,
      },
      named_totals: report.named_totals || null,
      items: classified,
      honesty: honestyReport(classified),
    };
  }
  throw new Error("review_findings_required");
}

export function honestyReport(items) {
  const classes = new Set(asArray(items).map((item) => item.class));
  const concludesRisk = asArray(items).some((item) => item.concludes_risk === true);
  const concludesNoncompliance = asArray(items).some(
    (item) => item.concludes_noncompliance === true,
  );
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

export function classifyItem(raw, _documents, report = {}) {
  if (raw?.kind === "checklist" || raw?.type === "checklist") {
    return classifyChecklist(raw);
  }
  const consumption = {
    revision: report.revision || raw.document_revision,
    elements: report.elements || [],
    coordination_findings: report.coordination_findings || [],
    review_findings: [
      {
        id: raw.id,
        document_ref: raw.document_id || raw.document_ref,
        related_finding_id: raw.related_finding_id,
        check_kind: raw.check_kind,
        element_ids: raw.element_ids || [],
        finding_pt_br: raw.finding_text,
        basis_pt_br: raw.basis,
        action_pt_br: raw.forwarding,
        conclusion: raw.conclusion,
      },
    ],
    checklist: [],
  };
  if (Array.isArray(report.elements)) consumption.elements = report.elements;
  if (Array.isArray(report.coordination_findings)) {
    consumption.coordination_findings = report.coordination_findings;
  }
  const classified = classifyExtract(consumption, {
    revisaoRows: raw.csv_row ? [raw.csv_row] : [],
  });
  return classified.items[0];
}
