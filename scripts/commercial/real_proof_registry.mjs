/**
 * Shipped fail-closed validator for confenge.real-proof-registry/1.0.
 *
 * Pure entry/registry validation is independent of HTML I/O so unauthorized,
 * expired and source-less fixtures can be exercised in tests without writing
 * them into the committed registry.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(HERE, "../..");
export const REGISTRY_REL = "data/commercial/real-proof-registry.v1.json";

export const REQUIRED_EVIDENCE_FIELDS = Object.freeze([
  "fonte",
  "autorizacao",
  "escopo_permitido",
  "anonimizacao",
  "baseline",
  "intervencao",
  "resultado_observavel",
  "limitacoes",
  "revisor",
  "expiracao",
]);

export const filled = (v) => typeof v === "string" && v.trim().length > 0;
export const filledList = (v, min) => Array.isArray(v) && v.length >= min && v.every(filled);

export function filledDeep(v) {
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "boolean") return v === true;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.length > 0 && v.every(filledDeep);
  if (v && typeof v === "object") {
    const vals = Object.values(v);
    return vals.length > 0 && vals.every(filledDeep);
  }
  return false;
}

export function loadRegistry(root = DEFAULT_ROOT) {
  const file = path.join(root, REGISTRY_REL);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parseExpiration(raw) {
  if (!filled(raw)) return null;
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T23:59:59Z`);
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) return null;
    return parsed;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) return null;
    return parsed;
  }
  return null;
}

export function validateEvidence(evidence, { now = Date.now(), requiredFields = REQUIRED_EVIDENCE_FIELDS } = {}) {
  const problems = [];
  const P = (code, detail) => problems.push(detail === undefined ? code : `${code}:${detail}`);
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    P("evidence_not_object");
    P("authorization_absent");
    P("fonte_absent");
    return problems;
  }
  for (const field of requiredFields) {
    if (!(field in evidence)) P("evidence_missing", field);
    else if (!filled(evidence[field])) P("evidence_empty", field);
  }
  if (!filled(evidence.autorizacao)) P("authorization_absent");
  if (!filled(evidence.fonte)) P("fonte_absent");
  if (filled(evidence.expiracao)) {
    const expires = parseExpiration(evidence.expiracao);
    if (!expires) P("evidence_expiracao_invalid");
    else if (expires.valueOf() <= now) P("authorization_expired");
  } else {
    P("authorization_expired");
  }
  return problems;
}

export function validateEntry(entry, options = {}) {
  const {
    schema,
    consentFields,
    grades,
    revocationTargets,
    root = DEFAULT_ROOT,
    now = Date.now(),
  } = options;
  const problems = [];
  const P = (code, detail) => problems.push(detail === undefined ? code : `${code}:${detail}`);
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    P("entry_not_object");
    return problems;
  }
  const requiredFields = schema.required_entry_fields ?? [];
  for (const f of requiredFields) {
    if (!(f in entry)) P("missing_field", f);
  }
  if (!filled(entry.entry_id)) P("empty_entry_id");
  if (!schema.allowed_entry_states.includes(entry.state)) P("bad_state", String(entry.state));
  if (!filled(entry.delivery_reference)) P("empty_delivery_reference");

  const consent = entry.consent;
  if (!consent || typeof consent !== "object" || Array.isArray(consent)) {
    P("consent_not_object");
  } else {
    for (const f of consentFields) {
      if (!(f in consent)) P("consent_missing", f);
      else {
        if (!filledDeep(consent[f])) P("consent_empty", f);
        const shape = schema.required_consent_field_shapes?.[f];
        if (shape === "non_empty_string" && !filled(consent[f])) P("consent_wrong_shape", f);
        if (shape === "non_empty_string_list" && !filledList(consent[f], 1)) P("consent_wrong_shape", f);
      }
    }
    for (const k of Object.keys(consent)) {
      if (!consentFields.includes(k)) P("consent_unknown_field", k);
    }
  }

  const fa = entry.final_approval;
  if (!fa || typeof fa !== "object" || Array.isArray(fa)) {
    P("final_approval_not_object");
  } else {
    for (const f of schema.required_final_approval_fields) {
      if (!(f in fa)) P("final_approval_missing", f);
      else if (!filled(fa[f])) P("final_approval_empty", f);
    }
    if (!schema.allowed_final_approval_binding_kinds.includes(fa.binding_kind)) {
      P("final_approval_binding_kind", String(fa.binding_kind));
    }
    if (filled(fa.binding_value) && fa.binding_value.trim().length < 8) P("final_approval_binding_value_too_short");
    if (filled(fa.approved_at)) {
      const parsed = new Date(`${fa.approved_at}T00:00:00Z`);
      const isCalendarDate = /^\d{4}-\d{2}-\d{2}$/.test(fa.approved_at) &&
        !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === fa.approved_at;
      if (!isCalendarDate) P("final_approval_invalid_date");
      else if (parsed.valueOf() > now) P("final_approval_future_date");
    }
    if (fa.binding_kind === "material_hash" && !/^sha256:[a-f0-9]{64}$/i.test(String(fa.binding_value ?? ""))) {
      P("final_approval_invalid_sha256");
    }
    if (fa.binding_kind === "material_version" && !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,}$/.test(String(fa.binding_value ?? ""))) {
      P("final_approval_invalid_version");
    }
    if (/\b(bot|ci|agent|automation|claude|robo)\b/i.test(String(fa.approver_name ?? ""))) {
      P("final_approval_non_human_approver");
    }
  }

  const ev = entry.verifiable_evidence;
  if (!Array.isArray(ev) || ev.length < 1) {
    P("verifiable_evidence_missing");
  } else {
    ev.forEach((e, i) => {
      if (!e || typeof e !== "object") {
        P(`evidence_${i}_not_object`);
        return;
      }
      for (const f of schema.required_verifiable_evidence_fields) {
        if (!(f in e)) P(`evidence_${i}_missing`, f);
      }
      if (!schema.allowed_verifiable_evidence_kinds.includes(e.kind)) P(`evidence_${i}_bad_kind`, String(e.kind));
      if (!filled(e.reference)) P(`evidence_${i}_empty_reference`);
      if (e.within_authorized_scope !== true) P(`evidence_${i}_out_of_scope`);
    });
  }

  const claims = entry.claims;
  const outcomeClaim = /\b(melhoria|economia|receita|recupera[cç][aã]o|vit[oó]ria|satisfa[cç][aã]o)\b/i;
  const unknownMarker = /\b(UNKNOWN|desconhecid[oa]|n[aã]o (?:foi|[ée]|pode ser) verificad[oa]?|n[aã]o pode ser medid[oa]|sem medi[cç][aã]o|sem evid[eê]ncia)\b/i;
  if (!Array.isArray(claims) || claims.length < 1) {
    P("claims_missing");
  } else {
    claims.forEach((c, i) => {
      if (!c || typeof c !== "object") {
        P(`claim_${i}_not_object`);
        return;
      }
      for (const f of schema.required_claim_fields) {
        if (!(f in c)) P(`claim_${i}_missing`, f);
      }
      if (!grades.includes(c.evidence_grade)) P(`claim_${i}_bad_grade`, String(c.evidence_grade));
      if (!filled(c.statement_pt_br)) P(`claim_${i}_empty_statement`);
      if (!filled(c.source_pt_br)) P(`claim_${i}_empty_source`);
      if (outcomeClaim.test(String(c.statement_pt_br ?? "")) && !["FACT", "CALCULATION"].includes(c.evidence_grade)) {
        P(`claim_${i}_outcome_requires_fact_or_calculation`);
      }
      if (c.evidence_grade === "CALCULATION" && !filled(c[schema.calculation_method_field])) {
        P(`claim_${i}_calculation_method_missing`);
      }
      if (c.evidence_grade === "INFERENCE" && !/\b(infer[eê]ncia|interpreta[cç][aã]o)\b/i.test(String(c.statement_pt_br ?? ""))) {
        P(`claim_${i}_inference_not_labelled`);
      }
      if (c.evidence_grade === "UNKNOWN") {
        if (/\d/.test(String(c.statement_pt_br ?? ""))) P(`claim_${i}_unknown_filled_with_number`);
        if (!unknownMarker.test(String(c.statement_pt_br ?? ""))) P(`claim_${i}_unknown_not_labelled`);
      }
    });
  }

  const evidenceFields = schema.required_evidence_fields ?? REQUIRED_EVIDENCE_FIELDS;
  for (const code of validateEvidence(entry.evidence, { now, requiredFields: evidenceFields })) {
    problems.push(code);
  }

  const dist = entry.distribution;
  if (!dist || typeof dist !== "object" || Array.isArray(dist)) {
    P("distribution_not_object");
  } else {
    if (dist.canary !== true) P("distribution_not_canary");
    if (!Array.isArray(dist.surfaces) || dist.surfaces.length < 1) P("distribution_no_surfaces");
    else for (const surface of dist.surfaces) {
      if (!/^\/(?:[a-z0-9-]+\/)*$/.test(String(surface))) P("distribution_bad_surface", String(surface));
      const slug = String(surface).replace(/^\/+|\/+$/g, "");
      const file = slug ? path.join(root, slug, "index.html") : path.join(root, "index.html");
      if (!fs.existsSync(file)) P("distribution_surface_missing", String(surface));
    }
    if (dist.logo_carousel === true) P("distribution_logo_carousel");
    if (dist.aggregate_rating === true) P("distribution_aggregate_rating");
    if (dist.review_schema === true) P("distribution_review_schema");
  }

  const rev = entry.revocation;
  if (!rev || typeof rev !== "object" || Array.isArray(rev)) {
    P("revocation_not_object");
  } else {
    for (const f of schema.required_revocation_fields) {
      if (!(f in rev)) P("revocation_missing", f);
    }
    if (!filled(rev.channel)) P("revocation_empty_channel");
    const removes = Array.isArray(rev.removes) ? rev.removes : [];
    for (const t of revocationTargets) {
      if (!removes.includes(t)) P("revocation_incomplete", t);
    }
  }
  return problems;
}

export function validateRegistryShape(reg, options = {}) {
  const { schema, gate, ...entryOptions } = options;
  const problems = [];
  const entries = Array.isArray(reg.entries) ? reg.entries : null;
  if (entries === null) return ["entries_not_array"];
  const allowedRegistryStates = gate?.allowed_registry_states ?? [];
  if (!allowedRegistryStates.includes(reg.state)) problems.push("bad_registry_state");
  const blockedStates = gate?.entries_must_be_empty_while_state_is ?? [];
  if (blockedStates.includes(reg.state) && entries.length > 0) problems.push("entries_present_while_blocked");
  const authorizedState = gate?.authorized_registry_state;
  const preAuthorizationStates = gate?.pre_authorization_entry_states ?? [];
  if (reg.state !== authorizedState && entries.some((entry) => entry && !preAuthorizationStates.includes(entry.state))) {
    problems.push("entry_state_requires_authorized_registry");
  }
  const published = entries.filter((e) => e && e.state === "PUBLISHED");
  if (published.length > schema.max_published_entries) problems.push("more_than_one_canary");
  const ids = entries.map((e) => e && e.entry_id);
  if (new Set(ids).size !== ids.length) problems.push("duplicate_entry_id");
  entries.forEach((e, i) => {
    for (const p of validateEntry(e, { schema, ...entryOptions })) problems.push(`entry_${i}.${p}`);
  });
  return problems;
}

/* ------------------------------------------------------------------ */
/* Rendered-surface contract                                           */
/*                                                                     */
/* The gate has to be honest in three directions, not one:             */
/*   - zero published proofs is a legitimate state, but only while the */
/*     public surface actually renders the "no published proof" state; */
/*   - N valid proofs is a legitimate state, and each one has to be    */
/*     rendered on the surface the registry says it is published on;   */
/*   - an expired or unauthorized proof fails, in any registry state.  */
/*                                                                     */
/* Everything below is pure: it takes a page map, never the disk, so   */
/* the three states can be exercised without committing a fixture.     */
/* ------------------------------------------------------------------ */

export const SYNTHETIC_LABEL = "DADOS SINTÉTICOS";
export const DEMONSTRATIVE_LABEL = "DEMONSTRATIVO";
export const DEMONSTRATIVE_PERMISSION_ATTR = 'data-permission-class="demonstrativo"';
export const CONSENTED_PERMISSION_ATTR = 'data-permission-class="consented"';
export const REAL_PROOF_ID_ATTR = "data-real-proof-id";
export const PROOF_STATE_NONE = "none";
export const PROOF_STATE_PUBLISHED = "published";
export const PROOF_STATE_SURFACE = "casos/index.html";

const NOT_A_CLIENT_RESULT =
  /N[ÃA]O [ÉE] (?:RESULTADO DE CLIENTE|CASE|CASO CONFENGE)/i;
const SYNTHETIC_PROSE = /sint[ée]tic/i;
const HYPOTHETICAL_PROSE = /hipot[ée]tic/i;
const PROOF_STATE_BLOCK = /<section[^>]*\bdata-proof-state="([^"]*)"[^>]*>([\s\S]*?)<\/section>/i;
const NO_PROOF_YET = /\b(?:zero|nenhum[a]?)\b/i;

export function surfaceToRelPath(surface) {
  const slug = String(surface ?? "").replace(/^\/+|\/+$/g, "");
  return slug ? `${slug}/index.html` : "index.html";
}

function carriesRealProofMarker(html, markers) {
  return markers.some((mk) => String(html).includes(mk));
}

/**
 * A demonstrative or synthetic artifact must never be readable as a real
 * engagement. `kind` is "model" (synthetic dataset page), "demonstrative"
 * (method page with hypothetical numbers) or "real" (an authorized client
 * proof). Losing the label is a failure, not a cosmetic regression.
 */
export function labelIntegrityProblems(html, kind, options = {}) {
  const { markers = [] } = options;
  const problems = [];
  const P = (code) => problems.push(code);
  const page = String(html ?? "");
  if (!page.trim()) return ["page_empty"];
  const hasSynthetic = page.includes(SYNTHETIC_LABEL);
  const hasDemonstrative = page.includes(DEMONSTRATIVE_LABEL);
  const hasDemonstrativeClass = page.includes(DEMONSTRATIVE_PERMISSION_ATTR);
  const hasConsentedClass = page.includes(CONSENTED_PERMISSION_ATTR);
  const hasRealMarker = carriesRealProofMarker(page, markers);

  if (kind === "model") {
    if (!hasSynthetic) P("synthetic_label_absent");
    if (!SYNTHETIC_PROSE.test(page)) P("synthetic_prose_absent");
    if (!hasDemonstrative) P("demonstrative_label_absent");
    if (!hasDemonstrativeClass) P("demonstrative_permission_class_absent");
    if (!NOT_A_CLIENT_RESULT.test(page)) P("client_result_disclaimer_absent");
    if (hasRealMarker) P("synthetic_page_carries_real_proof_marker");
    if (hasConsentedClass) P("synthetic_page_declares_consented_class");
    return problems;
  }
  if (kind === "demonstrative") {
    if (!hasDemonstrative) P("demonstrative_label_absent");
    if (!hasDemonstrativeClass) P("demonstrative_permission_class_absent");
    if (!NOT_A_CLIENT_RESULT.test(page)) P("client_result_disclaimer_absent");
    if (!SYNTHETIC_PROSE.test(page) && !HYPOTHETICAL_PROSE.test(page)) P("hypothetical_prose_absent");
    if (hasRealMarker) P("demonstrative_page_carries_real_proof_marker");
    if (hasConsentedClass) P("demonstrative_page_declares_consented_class");
    return problems;
  }
  if (kind === "real") {
    if (!hasConsentedClass) P("consented_permission_class_absent");
    if (!page.includes(REAL_PROOF_ID_ATTR)) P("real_proof_id_absent");
    if (hasSynthetic) P("real_proof_mixed_with_synthetic_label");
    if (hasDemonstrativeClass) P("real_proof_mixed_with_demonstrative_class");
    return problems;
  }
  return ["unknown_label_kind"];
}

function asPageMap(pages) {
  if (pages instanceof Map) return pages;
  return new Map(Object.entries(pages ?? {}));
}

/**
 * Full gate: registry shape, per-entry validity, and the rendered surface.
 * Returns [] only when the registry and the HTML tell the reader the same
 * story: zero published proof and an honest zero state, or N valid proofs
 * each rendered where the registry says it is published.
 */
export function evaluateProofGate(options = {}) {
  const { registry, pages, now = Date.now(), ...entryOptions } = options;
  const problems = [];
  const P = (code, detail) => problems.push(detail === undefined ? code : `${code}:${detail}`);

  for (const p of validateRegistryShape(registry ?? {}, { ...entryOptions, now })) P("registry", p);

  const entries = Array.isArray(registry?.entries) ? registry.entries : [];
  const markers = registry?.real_proof_block_markers ?? [];
  const pageMap = asPageMap(pages);

  const evaluated = entries.map((entry) => ({
    entry,
    id: entry && typeof entry === "object" ? String(entry.entry_id ?? "") : "",
    problems: validateEntry(entry, { ...entryOptions, now }),
  }));

  for (const row of evaluated) {
    if (row.problems.length === 0) continue;
    const label = row.id || "(sem entry_id)";
    if (row.problems.includes("authorization_expired")) P("proof_expired", label);
    if (row.problems.includes("authorization_absent")) P("proof_unauthorized", label);
    if (row.problems.includes("fonte_absent")) P("proof_without_source", label);
    P("proof_invalid", label);
  }

  const valid = evaluated.filter((row) => row.problems.length === 0);
  const published = valid.filter((row) => row.entry?.state === "PUBLISHED");
  const publishedIds = new Set(published.map((row) => row.id));

  const declaredSurfaces = new Map();
  for (const row of published) {
    for (const surface of row.entry?.distribution?.surfaces ?? []) {
      declaredSurfaces.set(surfaceToRelPath(surface), row.id);
    }
  }

  for (const [rel, id] of declaredSurfaces) {
    const html = pageMap.get(rel);
    if (html === undefined) {
      P("published_proof_surface_missing", rel);
      continue;
    }
    if (!html.includes(`${REAL_PROOF_ID_ATTR}="${id}"`)) P("published_proof_not_rendered", `${rel}|${id}`);
    for (const code of labelIntegrityProblems(html, "real", { markers })) P("published_proof_label", `${rel}|${code}`);
  }

  for (const [rel, html] of pageMap) {
    const idOnPage = /data-real-proof-id="([^"]*)"/.exec(html)?.[1];
    const marked = carriesRealProofMarker(html, markers);
    if (marked && !declaredSurfaces.has(rel)) P("real_proof_block_without_valid_entry", rel);
    if (idOnPage !== undefined && !publishedIds.has(idOnPage)) P("real_proof_id_not_published", `${rel}|${idOnPage}`);
    if (marked && (html.includes(SYNTHETIC_LABEL) || html.includes(DEMONSTRATIVE_PERMISSION_ATTR))) {
      P("real_proof_mixed_with_synthetic", rel);
    }
  }

  const surfaceHtml = pageMap.get(PROOF_STATE_SURFACE);
  if (surfaceHtml === undefined) {
    P("proof_state_surface_missing", PROOF_STATE_SURFACE);
  } else {
    const block = PROOF_STATE_BLOCK.exec(surfaceHtml);
    if (!block) P("proof_state_block_missing", PROOF_STATE_SURFACE);
    else {
      const [, state, body] = block;
      if (published.length === 0) {
        if (state !== PROOF_STATE_NONE) P("zero_proof_state_not_declared", state);
        else if (!NO_PROOF_YET.test(body)) P("zero_proof_state_not_rendered", PROOF_STATE_SURFACE);
      } else if (state !== PROOF_STATE_PUBLISHED) {
        P("published_proof_state_not_declared", state);
      }
    }
  }

  return problems;
}
