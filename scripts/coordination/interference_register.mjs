/**
 * Consumer of INB-06 coordination findings on
 * /compatibilizacao-projetos-engenharia/.
 *
 * Estado is a pure function of the finding plus the exact document revisions
 * it was conferred against. Detection does not resolve a pending adjustment.
 * 06's provider_state "resolved_in_R01" is a later piloto revision, not
 * conferral against R01. Regenerating HTML does not change estado.
 */
import fs from "node:fs";
import path from "node:path";

export const OWNED_REGISTER_REL = "data/coordination/interference-register.v1.json";

export const INB06_CANDIDATE_RELS = Object.freeze([
  "data/demonstrative/private-project-pilot/consumption.v1.json",
]);

export const PUBLIC_ESTADO = Object.freeze({
  pending_author_adjustment: "Registrada — ajuste pendente do autor",
  correction_proposed: "Correção proposta — aguarda aceite do autor",
  author_accepted: "Ajuste aceito pelo autor",
  stale_revision: "Não conferida contra a revisão atual",
  information_requested: "Informação pedida — ajuste pendente do autor",
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
 * Display estado. Fail-closed: provider_state resolved_in_R01 does not
 * resolve a finding conferred against R00. Detection-only never promotes.
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
  const providerState = String(finding?.provider_state || "");

  if ((claimed === "resolved" || providerState === "resolved_in_R01") && !(accepted && designed)) {
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
  if (providerState === "information_requested" || finding?.type === "requirement_incompatibility") {
    return {
      code: "information_requested",
      label: PUBLIC_ESTADO.information_requested,
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
  if (!estado || (estado.resolved === true && estado.code !== "author_accepted")) {
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

/**
 * Map INB-06 consumption.v1.json onto the register contract.
 * Conferral is R00. resolved_in_R01 is not copied as correction_status.
 */
export function mapInb06Consumption(consumption, extras = {}) {
  if (!consumption || consumption.schema !== "confenge.demonstrative-sample-descriptor/1.0") {
    throw new Error("not_inb06_consumption");
  }
  const geo = (consumption.coordination_findings || []).find((row) => row.id === "CF-GEO-01");
  const info = (consumption.coordination_findings || []).find((row) => row.id === "CF-INFO-01");
  if (!geo) throw new Error("missing_CF-GEO-01");
  const totals = consumption.named_totals || {};
  const overlap = totals.r00_overlap_m || "0.10";
  const headR00 = totals.window_head_r00_m || "2.30";
  const soffit = totals.beam_soffit_m || "2.20";
  return {
    schema: "confenge.interference-register/1.0",
    source: "inb06",
    provider_campaign: "06",
    provider_path: extras.provider_path || "data/demonstrative/private-project-pilot/consumption.v1.json",
    proof_id: consumption.proof_id,
    piloto_url: consumption.url || "/casos/demonstrativo-projeto-privado/",
    piloto_finding_href: `${consumption.url || "/casos/demonstrativo-projeto-privado/"}#CF-GEO-01`,
    public_label: "Exemplo demonstrativo do piloto técnico. Não é obra de cliente.",
    finding: {
      id: "CF-GEO-01",
      type: "geometric_interference",
      type_label: "Interferência geométrica",
      location: {
        space: "Parede leste W-02 do recorte de banheiro demonstrativo",
        axis: "leste",
        elevation: `verga WN-01 ${headR00} m / fundo B-01 ${soffit} m`,
        elements: [
          { id: "WN-01", discipline: "arquitetônico", name: "Janela WN-01 na parede leste W-02" },
          { id: "B-01", discipline: "estrutural", name: "Viga B-01 no mesmo alinhamento leste" },
          { id: "W-02", discipline: "arquitetônico", name: "Parede leste W-02" },
        ],
      },
      description: `No estado original R00 a verga da janela WN-01 está em ${headR00} m e o fundo da viga B-01 em ${soffit} m: sobreposição de ${overlap} m no eixo Z.`,
      evidence: "Elevação leste do recorte demonstrativo em R00: faixas Z de WN-01 e B-01 se cruzam. A conferência é geométrica, sem exame de dimensionamento da viga.",
      possible_consequence: "Na execução a viga pode ser cortada ou o vão da janela reduzido sem o autor redesenhar a verga.",
      compared_documents: [
        { document_id: "PR-ARQ", discipline: "arquitetônico", title: "Arquitetônico — planta e elevação leste", revision: "R00" },
        { document_id: "PR-EST", discipline: "estrutural", title: "Estrutural — viga B-01", revision: "R00" },
      ],
      conferred_against: [
        { document_id: "PR-ARQ", revision: "R00" },
        { document_id: "PR-EST", revision: "R00" },
      ],
      detection: "detected",
      correction_designed: false,
      correction_status: "pending",
      author_acceptance: { accepted: false, by: null, at: null },
      provider_state: geo.state,
      forwarding: {
        action: "Encaminhar ao autor do recorte arquitetônico demonstrativo: avaliar rebaixar a verga e manter B-01 na cota original.",
        adjustment_owner_role: "autor do recorte arquitetônico demonstrativo",
        coordinator_role: "registrar, localizar e encaminhar; não projetar a correção neste recorte",
      },
    },
    secondary_findings: info
      ? [
          {
            id: "CF-INFO-01",
            type: "requirement_incompatibility",
            type_label: "Incompatibilidade de requisitos",
            location: {
              space: "Poço hidrossanitário HS-01 na parede oeste W-04",
              axis: "oeste",
              elevation: null,
              elements: [
                { id: "HS-01", discipline: "hidrossanitário", name: "Poço HS-01" },
                { id: "W-04", discipline: "arquitetônico", name: "Parede oeste W-04" },
              ],
            },
            description: "O recorte declara o contorno externo 0,40 m × 0,40 m e deixa em branco vão livre interno e diâmetros de tubulação.",
            evidence: "Campo do recorte vazio. Ausência de informação, não conformidade com norma não examinada.",
            possible_consequence: "Dimensionar ou furar o poço sem o vão e os diâmetros declarados.",
            compared_documents: [
              { document_id: "PR-HID", discipline: "hidrossanitário", title: "Hidrossanitário — poço HS-01", revision: "R00" },
            ],
            conferred_against: [{ document_id: "PR-HID", revision: "R00" }],
            detection: "detected",
            correction_designed: false,
            correction_status: "pending",
            author_acceptance: { accepted: false, by: null, at: null },
            provider_state: info.state,
            forwarding: {
              action: "Pedir ao projetista hidrossanitário de origem as dimensões internas e os diâmetros. Enquanto esses dados não chegam, o item permanece pedido de informação, não falha comprovada.",
              adjustment_owner_role: "projetista hidrossanitário de origem",
              coordinator_role: "registrar o pedido de informação; não converter a lacuna em falha comprovada",
            },
          },
        ]
      : [],
    live_documents: [
      { document_id: "PR-ARQ", revision: "R00" },
      { document_id: "PR-EST", revision: "R00" },
      { document_id: "PR-HID", revision: "R00" },
    ],
  };
}

export function loadPublicRegister(rootDir) {
  const root = rootDir || process.cwd();
  for (const rel of INB06_CANDIDATE_RELS) {
    const candidate = path.join(root, rel);
    if (fs.existsSync(candidate)) {
      const raw = loadJson(candidate);
      if (raw.schema === "confenge.demonstrative-sample-descriptor/1.0") {
        return { ...mapInb06Consumption(raw, { provider_path: rel }), loaded_from: rel };
      }
      return { ...raw, loaded_from: rel, source: raw.source || "inb06" };
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
  const pilotoHref = record.piloto_finding_href || record.piloto_url || "/casos/demonstrativo-projeto-privado/#CF-GEO-01";
  const sourceNote = record.source === "inb06"
    ? `Exemplo demonstrativo do <a href="${escapeHtml(pilotoHref)}">piloto técnico</a>. Não é obra de cliente. Conferência presa a R00.`
    : escapeHtml(record.public_label || "Exemplo demonstrativo. Não é obra de cliente.");
  const staleNote = estado.code === "stale_revision"
    ? `<p class="coord-finding-stale">${escapeHtml(estado.detail)}</p>`
    : "";
  return `<article class="coord-finding" data-finding-id="${escapeHtml(finding.id)}" data-finding-type="${escapeHtml(finding.type)}" data-estado="${escapeHtml(estado.code)}" data-resolved="${estado.resolved ? "true" : "false"}" data-detection="${escapeHtml(finding.detection || "")}">
<p class="coord-finding-kicker">${sourceNote}</p>
<h3>${escapeHtml(finding.id)} · ${escapeHtml(finding.type_label || finding.type)}</h3>
<dl class="coord-finding-dl">
<dt>Localização</dt>
<dd>${escapeHtml(finding.location?.space)}${finding.location?.axis ? `, eixo ${escapeHtml(finding.location.axis)}` : ""}${finding.location?.elevation ? `, ${escapeHtml(finding.location.elevation)}` : ""}</dd>
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

export function renderSecondaryFindingHtml(record, finding, liveDocuments) {
  return renderFindingHtml({ ...record, finding, piloto_finding_href: `${record.piloto_url || "/casos/demonstrativo-projeto-privado/"}#${finding.id}` }, liveDocuments);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain && process.argv.includes("--render-finding")) {
  const record = loadPublicRegister(process.cwd());
  process.stdout.write(renderFindingHtml(record));
}
