/**
 * Consumer of the private-project demonstrative for the review purchase page.
 *
 * Canonical sources:
 *   data/demonstrative/private-project-pilot/consumption.v1.json
 *   casos/demonstrativo-projeto-privado/data/revisao.csv
 *
 * Joins review_findings to coordination_findings and to revisao.csv.
 * Does not invent a second building, subtotals, risk grades or norm claims.
 * Public labels are translated; internal codes stay in data attributes.
 */
import { publicStateLabel } from "../../pos-inb-20260911/02/public_state.mjs";

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

export const EXTRACT_SLOT_START = "<!--pos-inb-02:review-extract-->";
export const EXTRACT_SLOT_END = "<!--/pos-inb-02:review-extract-->";

const CLASS_LABELS = Object.freeze({
  [EXTRACT_CLASSES.CONSTATACAO_SUSTENTADA]: "Constatação sustentada",
  [EXTRACT_CLASSES.INFORMACAO_FALTANTE]: "Informação faltante",
  [EXTRACT_CLASSES.RECOMENDACAO]: "Recomendação",
  [EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA]: "Verificação ainda não realizada",
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
    const stateLabel = publicStateLabel(cf.state);
    const evidence = cf.evidence_pt_br || row.basis;
    const implication = [evidence, stateLabel]
      .filter(Boolean)
      .map((part) => String(part).replace(/\.+$/, ""))
      .join(". ") + ".";
    items.push({
      ...row,
      kind: "finding",
      class: EXTRACT_CLASSES.CONSTATACAO_SUSTENTADA,
      element: elementIds.join(" "),
      implication: implication || null,
      public_state_label: stateLabel,
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function field(term, definition) {
  if (definition == null || definition === "") return "";
  return `<dt>${escapeHtml(term)}</dt><dd>${definition}</dd>`;
}

function itemTitle(item) {
  if (item.kind === "recommendation") {
    const origin = String(item.id || "").replace(/-acao$/, "") || item.related_finding_id || item.id;
    return `Ação de ${origin} no mesmo recorte`;
  }
  if (item.kind === "verification") {
    return "Norma de dimensionamento não examinada";
  }
  const doc = item.document_id || "";
  return `${item.id}${doc ? ` · ${doc}` : ""}`;
}

function itemRecommendation(item) {
  return item.forwarding || null;
}

function itemImplication(item) {
  if (item.implication) return item.implication;
  if (item.class === EXTRACT_CLASSES.INFORMACAO_FALTANTE) {
    return item.basis || item.missing_information || item.finding_text;
  }
  if (item.class === EXTRACT_CLASSES.VERIFICACAO_NAO_REALIZADA) {
    return item.finding_text || item.basis;
  }
  return item.basis;
}

export function renderExtractItemHtml(item) {
  const classLabel = CLASS_LABELS[item.class] || "Apontamento";
  const documentText = item.document_id
    ? (item.document_revision && !String(item.document_id).includes(String(item.document_revision))
      ? `${item.document_id} (extrato em ${item.document_revision})`
      : item.document_id)
    : item.document_revision || "";
  const constatacao = item.finding_text
    || (item.kind === "recommendation" ? item.forwarding : null)
    || item.basis;
  const implication = itemImplication(item);
  const recommendation = itemRecommendation(item);
  const element = item.element || (Array.isArray(item.element_ids) ? item.element_ids.join(" ") : "");
  return `<article class="rv-extract-item" data-extract-class="${escapeHtml(item.class)}" data-extract-id="${escapeHtml(item.id)}">
<p class="rv-class">${escapeHtml(classLabel)}</p>
<h3>${escapeHtml(itemTitle(item))}</h3>
<dl>
${field("Documento", escapeHtml(documentText || "Recorte demonstrativo"))}
${field("Constatação", escapeHtml(constatacao || ""))}
${field("Implicação", escapeHtml(implication || ""))}
${field("Recomendação", escapeHtml(recommendation || ""))}
${element ? field("Elementos no desenho", `<code>${escapeHtml(element)}</code>`) : ""}
</dl>
</article>`;
}

export function renderExtractHtml(classified) {
  assertHonestExtract(classified);
  const url = classified.package?.url || "/casos/demonstrativo-projeto-privado/";
  const csvHref = `${url}data/revisao.csv`;
  const proofId = classified.proof_id || "";
  const items = (classified.items || []).map((item) => renderExtractItemHtml(item)).join("\n");
  return `${EXTRACT_SLOT_START}<div class="rv-extract-slot" data-extract-kind="demonstrative" data-extract-canonical-source="inb-06" data-proof-id="${escapeHtml(proofId)}">
<p class="section-lead rv-note">Exemplo demonstrativo do <a href="${escapeHtml(url)}">recorte de banheiro</a> e do <a href="${escapeHtml(csvHref)}">arquivo de revisão</a>: não é trabalho de cliente e não é parecer para executar obra. Item de checklist não respondido e norma não examinada não viram erro do projeto.</p>
<div class="rv-extract">
${items}
</div>
</div>${EXTRACT_SLOT_END}`;
}

const EXTRACT_SLOT_RE = /<!--pos-inb-02:review-extract-->[\s\S]*?<!--\/pos-inb-02:review-extract-->/i;
const LEGACY_EXTRACT_RE = /<p class="section-lead rv-note"[^>]*>[\s\S]*?<div class="rv-extract">[\s\S]*?<\/div>\s*(?=<p>)/i;

export function injectReviewExtract(pageHtml, classified) {
  const fragment = renderExtractHtml(classified);
  if (EXTRACT_SLOT_RE.test(pageHtml)) {
    return pageHtml.replace(EXTRACT_SLOT_RE, fragment);
  }
  if (LEGACY_EXTRACT_RE.test(pageHtml)) {
    return pageHtml.replace(LEGACY_EXTRACT_RE, `${fragment}\n`);
  }
  throw new Error("page HTML is missing review extract slot");
}
