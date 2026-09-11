/**
 * Independent CORE_QA_SUITE harness. Results are pass, fail,
 * MISSING_DEPENDENCY, NOT_VERIFIED or NOT_RUN — never a silent skip
 * or a fabricated PASS. POS-09 residual: dedicated_route is not
 * blanket-optional; overlay hashes file contents; unknown levels fail closed.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  classifyDependencyLevel,
  isPublicationRequired as publicationRequired,
  overlayContentHash,
  summarize,
  HARD_AT_RELEASE as HARD,
  OPTIONAL_ENRICHMENT as OPTIONAL,
  EXTERNAL_EVIDENCE as EXTERNAL,
  PASS as P,
  FAIL as F,
  MISSING_DEPENDENCY as MD,
  NOT_VERIFIED as NV,
  NOT_RUN as NR,
  KNOWN_STATUS,
} from "./strict.mjs";

export const PASS = P;
export const FAIL = F;
export const MISSING_DEPENDENCY = MD;
export const NOT_VERIFIED = NV;
export const NOT_RUN = NR;

export const HARD_AT_RELEASE = HARD;
export const OPTIONAL_ENRICHMENT = OPTIONAL;
export const EXTERNAL_EVIDENCE = EXTERNAL;

export const SEVERITY = Object.freeze({
  EXPOSURE: "exposicao/seguranca/veracidade/recebimento",
  JOURNEY: "quebra_jornada/indexacao",
  IMPROVEMENT: "melhoria_nao_bloqueante",
});

export function dependencyLevel(row, context = {}) {
  return classifyDependencyLevel(row, context);
}

export function isPublicationRequired(row, context = {}) {
  return publicationRequired(row, context);
}

export function nowIso() {
  return new Date().toISOString();
}

export function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function sha256Text(text) {
  return createHash("sha256").update(String(text)).digest("hex");
}

export function git(root, args, extra = {}) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...extra,
  }).trim();
}

export function subjectSha(root) {
  try {
    return git(root, ["rev-parse", "HEAD"]);
  } catch {
    return null;
  }
}

export function overlayHash(root) {
  return overlayContentHash(root);
}

export function createReport({ root, examinedKind, overlays }) {
  const sha = subjectSha(root);
  return {
    schema: "confenge.inbound-core-qa-suite/1.0",
    campaign_id: "15",
    prompt_version: "2.0.0",
    release_unit: "CORE_QA_SUITE",
    examined_kind: examinedKind,
    candidate_sha: sha,
    overlay_hashes: overlays || null,
    started_at: nowIso(),
    finished_at: null,
    results: [],
    findings: [],
    matrix: { core: [], expansion: [], journeys: [] },
    mutations: [],
    environment: {
      node: process.version,
      platform: process.platform,
      cwd: root,
      chrome: null,
    },
  };
}

export function record(report, item) {
  const status = KNOWN_STATUS.has(item.status) ? item.status : FAIL;
  const row = {
    id: item.id,
    subject: item.subject || null,
    campaign: item.campaign || null,
    status,
    severity: item.severity || null,
    owner: item.owner || null,
    path: item.path || null,
    url: item.url || null,
    sha: item.sha || report.candidate_sha,
    steps: item.steps || [],
    expected: item.expected || null,
    observed: item.observed || null,
    impact: item.impact || null,
    evidence: item.evidence || null,
    detail: item.detail || null,
    dependency_level:
      item.dependency_level ||
      classifyDependencyLevel({ ...item, status }, { root: report.environment?.cwd }),
  };
  if (!KNOWN_STATUS.has(item.status)) {
    row.detail = {
      ...(typeof row.detail === "object" && row.detail ? row.detail : {}),
      invalid_status: item.status,
    };
  }
  report.results.push(row);
  const tag =
    row.status === FAIL
      ? "FAIL"
      : row.status === MISSING_DEPENDENCY
        ? "MISSING_DEPENDENCY"
        : row.status === NOT_VERIFIED
          ? "NOT_VERIFIED"
          : row.status === NOT_RUN
            ? "NOT_RUN"
            : "PASS";
  const extra = row.detail ? ` ${typeof row.detail === "string" ? row.detail : JSON.stringify(row.detail)}` : "";
  console.log(tag, row.id, extra);
  if (row.status === FAIL) {
    report.findings.push({
      name: row.id,
      severity: row.severity || SEVERITY.JOURNEY,
      url: row.url,
      arquivo: row.path,
      sha: row.sha,
      passos: row.steps,
      esperado: row.expected,
      observado: row.observed,
      impacto: row.impact,
      evidencia: row.evidence,
      dono: row.owner,
    });
  }
  return row;
}

export function finish(report, { strictRelease = false, mode = null } = {}) {
  report.finished_at = nowIso();
  const examinedKind = mode || report.examined_kind || "baseline";
  report.summary = summarize(report, { strictRelease, mode: examinedKind });
  return report;
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function routeToFile(route) {
  if (route === "/") return "index.html";
  const trimmed = route.replace(/^\//, "").replace(/\/$/, "");
  return `${trimmed}/index.html`;
}

export function fileToRoute(rel) {
  const posix = rel.split(path.sep).join("/");
  if (posix === "index.html") return "/";
  if (posix.endsWith("/index.html")) return `/${posix.slice(0, -"index.html".length)}`;
  return `/${posix}`;
}

export function existsInRoot(root, rel) {
  return fs.existsSync(path.join(root, rel));
}
