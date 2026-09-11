/**
 * Consumer of the interference register shown on
 * /compatibilizacao-projetos-engenharia/.
 *
 * Estado is a pure function of the finding plus the exact document revisions
 * it was conferred against. Detection does not resolve a pending adjustment.
 * Regenerating HTML does not change estado. A new document revision makes the
 * finding stale against that revision — it is not shown as conferred on it.
 */
import fs from "node:fs";
import path from "node:path";

export const OWNED_REGISTER_REL = "data/coordination/interference-register.v1.json";

export const INB06_CANDIDATE_RELS = Object.freeze([
  "docs/campaigns/inb-20260911/06/artifacts/interference-register.json",
  "data/coordination/overlays/inb06-demonstrative.json",
]);

export const PUBLIC_ESTADO = Object.freeze({
  pending_author_adjustment: "Registrada — ajuste pendente do autor",
  correction_proposed: "Correção proposta — aguarda aceite do autor",
  author_accepted: "Ajuste aceito pelo autor",
  stale_revision: "Não conferida contra a revisão atual",
});

const RESOLVED_RE = /corrigid|resolvid|encerrad|conclu[ií]d/i;

export function conferralState(finding, liveDocuments = []) {
  const conferred = Array.isArray(finding?.conferred_against) ? finding.conferred_against : [];
  const live = Array.isArray(liveDocuments) ? liveDocuments : [];
  for (const doc of conferred) {
    const current = live.find((row) => row.document_id === doc.document_id);
    if (!current) {
      return {
        stale: true,
        document_id: doc.document_id,
        conferred_revision: doc.revision,
        live_revision: null,
        reason: "missing_live_document",
      };
    }
    if (String(current.revision) !== String(doc.revision)) {
      return {
        stale: true,
        document_id: doc.document_id,
        conferred_revision: doc.revision,
        live_revision: current.revision,
        reason: "revision_changed",
      };
    }
  }
  return { stale: false };
}

function hasAuthorAcceptance(finding) {
  const acceptance = finding?.author_acceptance;
  return Boolean(acceptance && acceptance.accepted === true);
}

function correctionWasDesigned(finding) {
  return finding?.correction_designed === true;
}

/**
 * Display estado. Fail-closed: a record that claims "resolved" without
 * designed correction AND author acceptance still renders as pending.
 * Detection-only never promotes.
 */
export function displayEstado(finding, liveDocuments = []) {
  const conferral = conferralState(finding, liveDocuments);
  if (conferral.stale) {
    const liveBit = conferral.live_revision
      ? `${conferral.conferred_revision} → ${conferral.live_revision}`
      : String(conferral.conferred_revision || "");
    return {
      code: "stale_revision",
      label: PUBLIC_ESTADO.stale_revision,
      resolved: false,
      conferral,
      detail: `Documento ${conferral.document_id}, revisão ${liveBit}. O apontamento não foi conferido contra a revisão nova.`,
    };
  }

  const accepted = hasAuthorAcceptance(finding);
  const designed = correctionWasDesigned(finding);
  const claimed = String(finding?.correction_status || "pending");

  if (claimed === "resolved" && !(accepted && designed)) {
    return {
      code: "pending_author_adjustment",
      label: PUBLIC_ESTADO.pending_author_adjustment,
      resolved: false,
      conferral,
      withheld_invalid_resolution: true,
    };
  }
  if (accepted && designed) {
    return {
      code: "author_accepted",
      label: PUBLIC_ESTADO.author_accepted,
      resolved: true,
      conferral,
    };
  }
  if (designed && !accepted) {
    return {
      code: "correction_proposed",
      label: PUBLIC_ESTADO.correction_proposed,
      resolved: false,
      conferral,
    };
  }
  return {
    code: "pending_author_adjustment",
    label: PUBLIC_ESTADO.pending_author_adjustment,
    resolved: false,
    conferral,
  };
}

export function assertHonestEstado(estado) {
  if (!estado || estado.resolved === true && estado.code !== "author_accepted") {
    throw new Error("resolved_without_author_acceptance");
  }
  if (estado.code !== "author_accepted" && RESOLVED_RE.test(estado.label || "")) {
    throw new Error("pending_label_looks_resolved");
  }
  return true;
}

export function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function loadPublicRegister(rootDir) {
  const root = rootDir || process.cwd();
  for (const rel of INB06_CANDIDATE_RELS) {
    const candidate = path.join(root, rel);
    if (fs.existsSync(candidate)) {
      const record = loadJson(candidate);
      return { ...record, loaded_from: rel, source: record.source || "inb06" };
    }
  }
  const owned = path.join(root, OWNED_REGISTER_REL);
  const record = loadJson(owned);
  return { ...record, loaded_from: OWNED_REGISTER_REL };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderFindingHtml(record, liveDocuments) {
  const finding = record.finding;
  const docs = liveDocuments || record.live_documents || [];
  const estado = displayEstado(finding, docs);
  assertHonestEstado(estado);
  const elements = (finding.location?.elements || [])
    .map((el) => `<li><strong>${escapeHtml(el.name)}</strong> (${escapeHtml(el.discipline)})</li>`)
    .join("");
  const compared = (finding.compared_documents || [])
    .map((doc) => `<li>${escapeHtml(doc.title)} — ${escapeHtml(doc.document_id)}, revisão ${escapeHtml(doc.revision)}${doc.dated ? `, ${escapeHtml(doc.dated)}` : ""}</li>`)
    .join("");
  const sourceNote = record.source === "inb06"
    ? "Registro do piloto técnico conferido."
    : escapeHtml(record.public_label || "Exemplo demonstrativo. Não é obra de cliente.");
  const staleNote = estado.code === "stale_revision"
    ? `<p class="coord-finding-stale">${escapeHtml(estado.detail)}</p>`
    : "";
  return `<article class="coord-finding" data-finding-id="${escapeHtml(finding.id)}" data-finding-type="${escapeHtml(finding.type)}" data-estado="${escapeHtml(estado.code)}" data-resolved="${estado.resolved ? "true" : "false"}" data-detection="${escapeHtml(finding.detection || "")}">
<p class="coord-finding-kicker">${sourceNote}</p>
<h3>${escapeHtml(finding.id)} · ${escapeHtml(finding.type_label || finding.type)}</h3>
<dl class="coord-finding-dl">
<dt>Localização</dt>
<dd>${escapeHtml(finding.location?.space)}, eixo ${escapeHtml(finding.location?.axis)}, cota ${escapeHtml(finding.location?.elevation)}</dd>
<dt>Elementos</dt>
<dd><ul>${elements}</ul></dd>
<dt>Interface</dt>
<dd>${escapeHtml(finding.description)}</dd>
<dt>Documentos e revisões comparados</dt>
<dd><ul>${compared}</ul></dd>
<dt>Evidência</dt>
<dd>${escapeHtml(finding.evidence)}</dd>
<dt>Possível consequência</dt>
<dd>${escapeHtml(finding.possible_consequence)}</dd>
<dt>Encaminhamento</dt>
<dd>${escapeHtml(finding.forwarding?.action)} Responsável pelo ajuste: ${escapeHtml(finding.forwarding?.adjustment_owner_role)}. Papel de quem registra: ${escapeHtml(finding.forwarding?.coordinator_role)}.</dd>
<dt>Estado</dt>
<dd><strong data-estado-label="${escapeHtml(estado.code)}">${escapeHtml(estado.label)}</strong></dd>
</dl>
${staleNote}
</article>`;
}

export function renderTypeCatalogHtml(record) {
  const items = (record.type_catalog || [])
    .map((row) => `<article class="coord-card" data-finding-type="${escapeHtml(row.type)}"><h3>${escapeHtml(row.label)}</h3><p>${escapeHtml(row.definition)}</p></article>`)
    .join("");
  return `<div class="coord-grid">${items}</div>`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain && process.argv.includes("--render-finding")) {
  const record = loadPublicRegister(process.cwd());
  process.stdout.write(renderFindingHtml(record));
}
