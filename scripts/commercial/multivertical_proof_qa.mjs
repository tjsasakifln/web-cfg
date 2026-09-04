#!/usr/bin/env node

/**
 * Report-only proof-role contract and semantic QA for campaign 12
 * (issues #531/#534 generalized to the five nuclei).
 *
 * Does not mutate public HTML. Does not block CI. Does not invent client proof.
 * Working-tree bytes are never labeled HEAD or main.
 */

import childProcess from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  boundaryIds,
  classifyBlock,
  extractBlocks,
  normalize,
  sequenceFindings,
  visibleText,
} from "./value_first_copy_audit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTRACT_REL = "data/commercial/proof-role-contract.v2.json";
const FIXTURES_REL = "data/commercial/proof-qa-fixtures.v2.json";
const FAMILY_REL = "data/organic/public-family-registry.json";
const CLIENT_REGISTRY_REL = "data/site/permissioned-proof-registry.json";
const REAL_PROOF_REL = "data/commercial/real-proof-registry.v1.json";

export const PROOF_ROLES = [
  "artifact",
  "calculation",
  "source_provenance",
  "freshness",
  "method",
  "expertise",
  "credential",
  "permissioned_client_outcome",
  "boundary",
  "user_supplied_fact",
  "inference",
  "unknown",
];

export const CLAIM_MAP_FIELDS = [
  "claim_id",
  "nucleus",
  "claim",
  "proof_role",
  "source_owner",
  "as_of",
  "status",
  "placement_target",
  "boundary",
  "prohibited_inference",
  "revocation",
];

export const QA_LABELS = [
  "value_outcome",
  "mechanism",
  "artifact",
  "proof",
  "action",
  "limitation",
  "hype",
  "orphan_claim",
  "proof_mismatch",
  "caveat_removed",
  "defensive_repetition",
];

const HYPE_RE = /\b(?:revolucionari\w*|transformador\w*|lider\w*|complet\w*|excelen\w*|incomparavel|unico|melhor (?:perito|avaliador|do brasil)|numero (?:1|um)|acreditad\w*|homologad\w*)\b/;
const ANTI_CASE_RE = /\b(?:nao ha case|nenhum case|sem case|sem logo|sem review|nenhum publicado|resultados de clientes: nenhum|nao ha case, logo)\b/g;
const NOMEACAO_RE = /\b(?:perito (?:do|oficial)|nomead\w*|homologad\w*|acreditad\w*|certificado pelo tribunal)\b/;
const CPTEC_RE = /\bcptec\b/;
const CLIENT_OUTCOME_ATTEMPT_RE = /\b(?:cliente atendido|resultado observado|exito obtido|economia prometida|obra do cliente)\b/;
const PUBLISHABLE = new Set(["AUTHORIZED", "APPROVED", "PUBLISHED"]);
const PUBLIC_SKIP_PARTS = new Set([
  ".git",
  ".github",
  ".claude",
  ".netlify",
  ".pytest_cache",
  "_site",
  "data",
  "docs",
  "netlify",
  "node_modules",
  "ops",
  "scripts",
  "seo",
  "supabase",
  "tests",
]);

function git(args) {
  return childProcess.execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function readJsonFile(relative) {
  const bytes = fs.readFileSync(path.join(root, relative), "utf8");
  return { bytes, json: JSON.parse(bytes), origin: "working_tree", relative };
}

export function loadContract() {
  return readJsonFile(CONTRACT_REL).json;
}

export function loadFixtures() {
  return readJsonFile(FIXTURES_REL).json;
}

export function loadClientRegistry() {
  return readJsonFile(CLIENT_REGISTRY_REL).json;
}

export function loadRealProofRegistry() {
  return readJsonFile(REAL_PROOF_REL).json;
}

function assertRef(ref) {
  if (ref !== null && ref !== undefined && !/^[0-9a-f]{7,40}$/i.test(ref)) {
    throw new Error(`PROOF_QA_INVALID_REF: ${ref}`);
  }
}

/**
 * Provenance of the bytes actually analyzed.
 * Working-tree HTML/JSON is never labeled HEAD or main, even when the index is clean.
 */
export function resolveProvenance({
  ref = null,
  resolvedSha = null,
  statusPorcelain = null,
  headSha = null,
  surfaceOrigin = null,
} = {}) {
  const forbidden = new Set(["HEAD", "main", "origin/main"]);
  if (ref) {
    const sourceSha = resolvedSha || ref;
    const origin = surfaceOrigin || "git_object";
    if (origin !== "git_object") {
      throw new Error("PROOF_QA_REF_WITHOUT_GIT_OBJECT_BYTES");
    }
    return {
      source_kind: "git_object",
      source_ref: ref,
      source_sha: sourceSha,
      surface_origin: "git_object",
      labeled_as_head: false,
      labeled_as_main: false,
      index_head_sha: headSha || null,
    };
  }
  const dirty = Boolean(String(statusPorcelain || "").trim());
  return {
    source_kind: dirty ? "working_tree_dirty" : "working_tree",
    source_ref: null,
    source_sha: null,
    surface_origin: "working_tree",
    labeled_as_head: false,
    labeled_as_main: false,
    index_head_sha: headSha || null,
    forbidden_labels: [...forbidden],
  };
}

export function provenanceIsHonest(provenance) {
  const sha = String(provenance?.source_sha || "");
  const kind = String(provenance?.source_kind || "");
  const ref = String(provenance?.source_ref || "");
  const head = String(provenance?.index_head_sha || "");
  if (kind.startsWith("working_tree")) {
    if (sha === "HEAD" || sha === "main" || sha === "origin/main") return false;
    if (head && sha === head) return false;
    if (provenance.labeled_as_head || provenance.labeled_as_main) return false;
    if (provenance.surface_origin !== "working_tree") return false;
    return provenance.source_sha === null;
  }
  if (kind === "git_object") {
    return Boolean(sha) && provenance.surface_origin === "git_object" && !["HEAD", "main"].includes(ref === "HEAD" ? sha : "");
  }
  return false;
}

export function missingClaimMapFields(claim) {
  return CLAIM_MAP_FIELDS.filter((field) => {
    const value = claim?.[field];
    return value === undefined;
  });
}

export function evaluatePromotionCodes(claim) {
  const codes = [];
  const text = normalize(claim?.claim || "");
  const role = claim?.proof_role;
  const promotesTo = claim?.promotes_to;
  if (claim?.synthetic && (promotesTo === "permissioned_client_outcome" || CLIENT_OUTCOME_ATTEMPT_RE.test(text))) {
    codes.push("synthetic_artifact_not_outcome");
  }
  if ((claim?.public_source || role === "source_provenance") && (promotesTo === "permissioned_client_outcome" || /\bcliente atendido\b|\bcomprova o cliente\b|\bresultado obtido\b/.test(text))) {
    codes.push("public_source_not_client");
  }
  if (role === "credential" && NOMEACAO_RE.test(text)) {
    codes.push("credential_not_endorsement");
  }
  if (role === "credential" && CPTEC_RE.test(text) && NOMEACAO_RE.test(text)) {
    codes.push("cptec_registration_not_nomeacao");
  }
  if (role === "method" && (promotesTo === "permissioned_client_outcome" || /\bgarante resultado\b|\belimina acidentes\b|\beconomia prometida\b/.test(text))) {
    codes.push("method_not_result");
  }
  if (role === "unknown" && ["AUTHORIZED", "PUBLISHED", "APPROVED"].includes(claim?.status)) {
    codes.push("unknown_is_neither");
  }
  return [...new Set(codes)];
}

export function evaluateClientOutcomeRole(claim, registry) {
  if (claim?.proof_role !== "permissioned_client_outcome") {
    return { applicable: false, pass: true, fail_closed: false };
  }
  const records = Array.isArray(registry?.records) ? registry.records : [];
  const empty = records.length === 0 || registry?.state === "NO_APPROVED_CLIENT_PROOF" || registry?.approved_public_proof_count === 0;
  const attempting = Boolean(claim.publishable) || PUBLISHABLE.has(String(claim.status || ""));
  if (empty && attempting) {
    return {
      applicable: true,
      pass: false,
      fail_closed: true,
      code: "EMPTY_CLIENT_OUTCOME_FAIL_CLOSED",
      state: registry?.state || "NO_APPROVED_CLIENT_PROOF",
    };
  }
  if (empty && claim.status === "NO_APPROVED_CLIENT_PROOF") {
    return {
      applicable: true,
      pass: true,
      fail_closed: true,
      sentinel: true,
      publishable: false,
      state: "NO_APPROVED_CLIENT_PROOF",
    };
  }
  return {
    applicable: true,
    pass: !empty,
    fail_closed: true,
    state: registry?.state,
  };
}

export function evaluateUnknownRole(claim) {
  if (claim?.proof_role !== "unknown") return { applicable: false, neither: true };
  const attemptingPositive = PUBLISHABLE.has(String(claim.status || "")) || claim.publishable === true;
  const attemptingNegative = claim.status === "NEGATIVE_PROOF";
  return {
    applicable: true,
    neither: !attemptingPositive && !attemptingNegative && claim.status === "UNKNOWN",
    pass: !attemptingPositive && !attemptingNegative,
  };
}

export function evaluateRequiredCaveats({ html, requiredCaveats = [] }) {
  const ids = new Set(boundaryIds(html));
  const normalizedHtml = normalize(visibleText(html));
  const missing = [];
  for (const caveat of requiredCaveats) {
    const hasId = caveat.boundary_id ? ids.has(caveat.boundary_id) : true;
    const hasNeedle = caveat.needle ? normalizedHtml.includes(normalize(caveat.needle)) : true;
    if (!hasId || !hasNeedle) missing.push(caveat);
  }
  return {
    pass: missing.length === 0,
    missing,
    kind: "independent_truth_gate",
    independent_of_semantic_score: true,
  };
}

function antiCaseCount(text) {
  return [...normalize(text).matchAll(ANTI_CASE_RE)].length;
}

export function classifyQaBlock(block) {
  const classified = classifyBlock(block);
  const text = classified.normalized || normalize(classified.text);
  const hype = HYPE_RE.test(text)
    && !classified.roles.includes("artifact")
    && !classified.roles.includes("mechanism")
    && classified.primary !== "action";
  const roles = classified.roles.filter((role) => !(hype && (role === "value_outcome" || role === "proof")));
  return {
    ...classified,
    roles,
    hype,
    primary: hype && classified.primary === "value_outcome" ? "hype" : classified.primary,
    anti_case: antiCaseCount(text),
  };
}

function semanticScore(blocks) {
  const value = blocks.filter((block) => block.roles.includes("value_outcome") && !block.hype).length;
  const hype = blocks.filter((block) => block.hype).length;
  return {
    value_points: value,
    hype_points: 0,
    hype_blocks: hype,
    quality_score: null,
  };
}

export function evaluateClaimMap(claim, registry) {
  const missing = missingClaimMapFields(claim);
  const orphan = !claim?.proof_role;
  const unknownRole = claim?.proof_role && !PROOF_ROLES.includes(claim.proof_role);
  const promotions = evaluatePromotionCodes(claim);
  const client = evaluateClientOutcomeRole(claim, registry);
  const unknown = evaluateUnknownRole(claim);
  const mismatch = promotions.length > 0 || (client.applicable && !client.pass) || unknownRole;
  return {
    claim_id: claim?.claim_id || null,
    missing_fields: missing,
    orphan,
    unknown_role: unknownRole,
    promotion_codes: promotions,
    client_outcome: client,
    unknown,
    proof_mismatch: mismatch,
    pass: missing.length === 0 && !orphan && !unknownRole && promotions.length === 0 && client.pass && unknown.pass !== false,
  };
}

export function evaluateFixture(fixture, options) {
  return evaluateProofQaFixture(fixture, options);
}

export function evaluateProofQaFixture(fixture, { registry } = {}) {
  const clientRegistry = registry || loadClientRegistry();
  const blocks = extractBlocks(fixture.html || "").map(classifyQaBlock);
  const sequence = sequenceFindings(fixture.html || "", fixture.profile);
  const caveats = evaluateRequiredCaveats({
    html: fixture.html || "",
    requiredCaveats: fixture.required_caveats || [],
  });
  const claims = (fixture.claims || []).map((claim) => evaluateClaimMap(claim, clientRegistry));
  const qa = new Set();
  for (const block of blocks) {
    for (const role of block.roles) {
      if (["value_outcome", "mechanism", "artifact", "proof", "action", "limitation"].includes(role)) qa.add(role);
    }
    if (block.hype) qa.add("hype");
  }
  if (claims.some((claim) => claim.orphan)) qa.add("orphan_claim");
  if (claims.some((claim) => claim.proof_mismatch)) qa.add("proof_mismatch");
  if (!caveats.pass) qa.add("caveat_removed");
  const antiCase = blocks.reduce((total, block) => total + block.anti_case, 0);
  const valueBlocks = blocks.filter((block) => block.roles.includes("value_outcome") && !block.hype).length;
  const defensiveOpening = sequence.some((finding) => finding.kind === "defensive_opening");
  if (antiCase >= 2 && (defensiveOpening || antiCase > valueBlocks)) qa.add("defensive_repetition");
  const score = semanticScore(blocks);
  const observedRoles = [...new Set(blocks.flatMap((block) => block.roles))].sort();
  return {
    id: fixture.id,
    nucleus: fixture.nucleus || null,
    profile: fixture.profile,
    blocks,
    observed_roles: observedRoles,
    qa_labels: [...qa].sort(),
    defensive_opening: defensiveOpening,
    sequence_findings: sequence,
    boundary_ids: boundaryIds(fixture.html || ""),
    caveats,
    claims,
    metrics: {
      substantive_blocks: blocks.length,
      value_outcome_blocks: blocks.filter((block) => block.roles.includes("value_outcome")).length,
      artifact_blocks: blocks.filter((block) => block.roles.includes("artifact")).length,
      mechanism_blocks: blocks.filter((block) => block.roles.includes("mechanism")).length,
      proof_blocks: blocks.filter((block) => block.roles.includes("proof")).length,
      action_blocks: blocks.filter((block) => block.roles.includes("action")).length,
      limitation_blocks: blocks.filter((block) => block.roles.includes("limitation")).length,
      hype_blocks: blocks.filter((block) => block.hype).length,
      negation_occurrences: blocks.reduce((total, block) => total + (block.negations || 0), 0),
      anti_case_occurrences: antiCase,
    },
    semantic_score: score,
    independent_truth_gate: {
      caveat_removed: !caveats.pass,
      client_outcome_fail_closed: claims.some((claim) => claim.client_outcome.code === "EMPTY_CLIENT_OUTCOME_FAIL_CLOSED"),
      hides_behind_semantic_score: false,
    },
  };
}

function walkIndexHtml(directory, relative = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (PUBLIC_SKIP_PARTS.has(entry.name)) continue;
    const nextRelative = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...walkIndexHtml(path.join(directory, entry.name), nextRelative));
    else if (entry.name === "index.html") files.push(nextRelative);
  }
  return files;
}

function isIndexable(html) {
  const tag = String(html).match(/<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/i)?.[0];
  if (!tag) return true;
  const content = tag.match(/\bcontent=["']([^"']*)["']/i)?.[1] || "";
  return !/\bnoindex\b/i.test(content);
}

function gitShow(ref, relative) {
  try {
    return git(["show", `${ref}:${relative}`]);
  } catch (error) {
    const err = new Error(`PROOF_QA_MISSING_AT_REF: ${relative} not in ${ref}`);
    err.cause = error;
    throw err;
  }
}

function readAnalyzedJson(relative, ref = null) {
  if (ref) {
    const bytes = gitShow(ref, relative);
    return { bytes, json: JSON.parse(bytes), origin: "git_object", relative };
  }
  return readJsonFile(relative);
}

export function reusableRouteCensus({ ref = null } = {}) {
  assertRef(ref);
  const familyBytes = ref ? gitShow(ref, FAMILY_REL) : fs.readFileSync(path.join(root, FAMILY_REL), "utf8");
  const familyRegistry = JSON.parse(familyBytes);
  const files = ref
    ? git(["ls-tree", "-r", "--name-only", ref]).split(/\r?\n/).filter((relative) => relative === "index.html" || relative.endsWith("/index.html"))
      .filter((relative) => !relative.split("/").some((part) => PUBLIC_SKIP_PARTS.has(part)))
    : walkIndexHtml(root);
  let indexable = 0;
  for (const relative of files) {
    const html = ref ? gitShow(ref, relative) : fs.readFileSync(path.join(root, relative), "utf8");
    if (isIndexable(html)) indexable += 1;
  }
  return {
    public_authority: FAMILY_REL,
    manual_route_allowlist: false,
    families: (familyRegistry.families || []).length,
    published_index_html: files.length,
    published_indexable_routes: indexable,
    reusable: indexable >= 50,
    html_application: "DEFERRED",
  };
}

function examplesFromEvaluations(evaluations) {
  const pick = (id) => evaluations.find((item) => item.id === id);
  return {
    benefit_with_sem: pick("benefit_with_sem")?.qa_labels || [],
    hype_is_not_value: pick("hype_is_not_value")?.qa_labels || [],
    orphan_claim: pick("orphan_claim")?.qa_labels || [],
    proof_mismatch: pick("proof_mismatch")?.qa_labels || [],
    required_caveat_removed: pick("required_caveat_removed")?.independent_truth_gate || null,
    empty_client_outcome: pick("empty_client_outcome_fail_closed")?.independent_truth_gate || null,
  };
}

export function buildReport({
  ref = null,
  fixturesOnly = true,
  includeCensus = false,
  surfaceHtml = null,
  statusPorcelain = null,
  headSha = null,
} = {}) {
  if (ref && surfaceHtml) {
    throw new Error("PROOF_QA_REF_AND_WORKING_TREE_HTML_MUTUALLY_EXCLUSIVE");
  }

  let resolvedSha = null;
  let gitStatus = statusPorcelain;
  let gitHead = headSha;
  if (ref) {
    assertRef(ref);
    resolvedSha = git(["rev-parse", "--verify", ref]).trim();
  } else {
    gitHead = gitHead || git(["rev-parse", "HEAD"]).trim();
    gitStatus = gitStatus === null ? git(["status", "--porcelain"]) : gitStatus;
  }

  const contractRecord = readAnalyzedJson(CONTRACT_REL, resolvedSha);
  const fixturesRecord = readAnalyzedJson(FIXTURES_REL, resolvedSha);
  const registryRecord = readAnalyzedJson(CLIENT_REGISTRY_REL, resolvedSha);
  const contract = contractRecord.json;
  const fixtures = fixturesRecord.json;
  const registry = registryRecord.json;
  const realProof = loadRealProofRegistry();

  const provenance = resolveProvenance({
    ref: resolvedSha,
    resolvedSha,
    statusPorcelain: gitStatus,
    headSha: gitHead || resolvedSha,
    surfaceOrigin: resolvedSha ? "git_object" : "working_tree",
  });

  if (surfaceHtml) {
    provenance.source_kind = "working_tree_dirty";
    provenance.source_sha = null;
    provenance.source_ref = null;
    provenance.surface_origin = "working_tree";
    provenance.labeled_as_head = false;
    provenance.labeled_as_main = false;
  }

  const evaluations = fixtures.fixtures.map((fixture) => evaluateProofQaFixture(fixture, { registry }));
  const nuclei = [...new Set(evaluations.map((item) => item.nucleus).filter(Boolean))].sort();
  const census = includeCensus
    ? reusableRouteCensus({ ref: ref ? resolvedSha : null })
    : { skipped: true, reusable: true, public_authority: FAMILY_REL };

  const report = {
    schema: "confenge.multivertical-proof-qa-report/2.0",
    contract_version: contract.contract_version,
    classifier_version: contract.semantic_qa.classifier_version,
    campaign_id: 12,
    mode: contract.semantic_qa.mode,
    ci_blocking: false,
    future_ratchet: "ITERATE",
    decision: "ITERATE",
    decision_reason: contract.semantic_qa.decision_reason,
    measured_on: contract.as_of,
    provenance,
    analyzed_inputs: [
      { path: CONTRACT_REL, origin: contractRecord.origin, sha256: sha256(contractRecord.bytes) },
      { path: FIXTURES_REL, origin: fixturesRecord.origin, sha256: sha256(fixturesRecord.bytes) },
      { path: CLIENT_REGISTRY_REL, origin: registryRecord.origin, sha256: sha256(registryRecord.bytes) },
    ],
    corpus: {
      state: fixtures.annotation.human_review_state,
      identified_human_corpus: false,
      agent_or_llm_self_label_as_human: "FORBIDDEN",
      fixture_count: fixtures.fixtures.length,
      annotation_protocol: contract.human_review.protocol,
    },
    client_outcome: {
      registry_state: registry.state,
      approved_public_proof_count: registry.approved_public_proof_count,
      real_proof_policy: realProof.canonical_proof?.policy || null,
      fail_closed: true,
      no_approved_client_proof: registry.state === "NO_APPROVED_CLIENT_PROOF",
    },
    nuclei_covered: nuclei,
    proof_roles: PROOF_ROLES,
    claim_map_fields: CLAIM_MAP_FIELDS,
    qa_labels: QA_LABELS,
    coverage: census,
    fixtures: evaluations.map((item) => ({
      id: item.id,
      nucleus: item.nucleus,
      qa_labels: item.qa_labels,
      defensive_opening: item.defensive_opening,
      caveat_gate_pass: item.caveats.pass,
      client_outcome_fail_closed: item.independent_truth_gate.client_outcome_fail_closed,
      promotion_codes: [...new Set(item.claims.flatMap((claim) => claim.promotion_codes))],
      semantic_score: item.semantic_score,
      independent_truth_gate: item.independent_truth_gate,
    })),
    error_matrix: contract.error_matrix,
    examples: examplesFromEvaluations(evaluations),
    interpretation: {
      quality_score: null,
      universal_ratio: null,
      human_persuasion_claimed: false,
      human_annotation_claimed: false,
      hype_does_not_improve_score: true,
      benefit_with_sem_is_value: true,
      word_count_is_not_persuasion_gate: true,
      note: "Report-only. No ratchet. Fixtures are not human annotation.",
    },
    fixtures_only: fixturesOnly,
  };

  if (!provenanceIsHonest(report.provenance)) {
    throw new Error("PROOF_QA_DISHONEST_PROVENANCE");
  }
  return report;
}

function cliValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rawRef = cliValue("--ref");
  const writeTo = cliValue("--write");
  const fixturesOnly = !hasFlag("--with-html-census") || hasFlag("--fixtures-only");
  const includeCensus = hasFlag("--with-html-census") || hasFlag("--census");
  let ref = null;
  if (rawRef) {
    ref = git(["rev-parse", "--verify", rawRef]).trim();
  }
  const report = buildReport({
    ref,
    fixturesOnly: true,
    includeCensus,
  });
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (writeTo) {
    const absolute = path.resolve(root, writeTo);
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error(`PROOF_QA_REPORT_OUTSIDE_ROOT: ${absolute}`);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, text);
    console.log(`MULTIVERTICAL_PROOF_QA_REPORT_WRITTEN fixtures=${report.fixtures.length} path=${path.relative(root, absolute)}`);
  } else {
    process.stdout.write(text);
  }
}
