/**
 * Independent CORE_QA_SUITE harness. Results are pass, fail, or
 * MISSING_DEPENDENCY — never a silent skip or a fabricated PASS.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const PASS = "pass";
export const FAIL = "fail";
export const MISSING_DEPENDENCY = "MISSING_DEPENDENCY";

export const SEVERITY = Object.freeze({
  EXPOSURE: "exposicao/seguranca/veracidade/recebimento",
  JOURNEY: "quebra_jornada/indexacao",
  IMPROVEMENT: "melhoria_nao_bloqueante",
});

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
  return git(root, ["rev-parse", "HEAD"]);
}

export function overlayHash(root) {
  const staged = git(root, ["diff", "HEAD", "--stat"]);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"]);
  if (!staged && !untracked) return null;
  return sha256Text(`${staged}\n${untracked}`);
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
  const row = {
    id: item.id,
    subject: item.subject || null,
    campaign: item.campaign || null,
    status: item.status,
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
  };
  report.results.push(row);
  const tag =
    row.status === FAIL ? "FAIL" : row.status === MISSING_DEPENDENCY ? "MISSING_DEPENDENCY" : "PASS";
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

export function finish(report) {
  report.finished_at = nowIso();
  const productFails = report.results.filter((r) => r.status === FAIL).length;
  const missing = report.results.filter((r) => r.status === MISSING_DEPENDENCY).length;
  const passes = report.results.filter((r) => r.status === PASS).length;
  report.summary = {
    pass: passes,
    fail: productFails,
    MISSING_DEPENDENCY: missing,
    exit_code: productFails > 0 ? 1 : 0,
  };
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
