/**
 * Pure helpers for INB-20260911 campaign 15 residual --strict-release.
 * POS-INB-20260911 campaign 09 owns this file. Not a second taxonomy.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const INB_SET = "INB-20260911";
export const POS_SET = "POS-INB-20260911";

export const PASS = "pass";
export const FAIL = "fail";
export const MISSING_DEPENDENCY = "MISSING_DEPENDENCY";
export const NOT_VERIFIED = "NOT_VERIFIED";
export const NOT_RUN = "NOT_RUN";

export const HARD_AT_RELEASE = "HARD_AT_RELEASE";
export const OPTIONAL_ENRICHMENT = "OPTIONAL_ENRICHMENT";
export const EXTERNAL_EVIDENCE = "EXTERNAL_EVIDENCE";

export const KNOWN_STATUS = new Set([PASS, FAIL, MISSING_DEPENDENCY, NOT_VERIFIED, NOT_RUN]);
export const KNOWN_LEVELS = new Set([HARD_AT_RELEASE, OPTIONAL_ENRICHMENT, EXTERNAL_EVIDENCE]);

export const LEGACY_CORE_IDS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"];
export const LEGACY_EXPANSION_IDS = ["11", "12", "13", "14"];
export const LEGACY_SUITE_IDS = ["15", "16"];
export const POS_CAMPAIGN_IDS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"];
export const POS_REQUIREMENTS = ["Q01", "Q02", "Q03", "Q04", "Q05", "Q06", "Q07", "Q08"];

const CORE_CAMPAIGN_IDS = new Set([...LEGACY_CORE_IDS, ...LEGACY_SUITE_IDS]);

export function splitIncluded(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function tokenLooksLikeRange(token) {
  return /^\d{2}-\d{2}$/.test(String(token || ""));
}

export function evaluateIncludedTokens(tokens, { expectedSet } = {}) {
  const list = Array.isArray(tokens) ? tokens : splitIncluded(tokens);
  const ranges = list.filter(tokenLooksLikeRange);
  if (ranges.length) {
    return {
      ok: false,
      error: "range_token_not_expanded",
      detail: `comma-separated only; ${ranges.join(",")} is not a range expansion`,
      tokens: list,
    };
  }
  if (expectedSet === INB_SET) {
    const unknown = list.filter((id) => !/^\d{2}$/.test(id));
    if (unknown.length) {
      return { ok: false, error: "unknown_campaign_id", tokens: unknown };
    }
  }
  return { ok: true, tokens: list };
}

export function parseManifestText(text, expectedSet) {
  if (text == null || String(text).trim() === "") {
    return { ok: false, error: "missing_manifest", campaign_set: null, campaigns: [], requirements: [] };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      error: "unreadable_manifest",
      detail: String(err && err.message),
      campaign_set: null,
      campaigns: [],
      requirements: [],
    };
  }
  const campaignSet = data.campaign_set || data.campaignSet || null;
  if (!campaignSet) {
    return { ok: false, error: "manifest_missing_campaign_set", campaign_set: null, campaigns: [], requirements: [] };
  }
  if (expectedSet && campaignSet !== expectedSet) {
    return {
      ok: false,
      error: "wrong_campaign_set",
      detail: `expected ${expectedSet}, got ${campaignSet}`,
      campaign_set: campaignSet,
      campaigns: Array.isArray(data.campaigns) ? data.campaigns : [],
      requirements: Array.isArray(data.requirements) ? data.requirements : [],
    };
  }
  const campaigns = Array.isArray(data.campaigns) ? data.campaigns.map(String) : [];
  const included = evaluateIncludedTokens(campaigns, { expectedSet: campaignSet });
  if (!included.ok) {
    return { ...included, campaign_set: campaignSet, campaigns, requirements: data.requirements || [] };
  }
  return {
    ok: true,
    campaign_set: campaignSet,
    campaigns,
    requirements: Array.isArray(data.requirements) ? data.requirements.map(String) : [],
    omit_demonstrativo_08: Boolean(data.omit_demonstrativo_08),
  };
}

export function readManifestFile(filePath, expectedSet) {
  if (!filePath) return { ok: false, error: "missing_manifest" };
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return { ok: false, error: "missing_manifest", path: filePath };
  }
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    return { ok: false, error: "unreadable_manifest", detail: String(err && err.message), path: filePath };
  }
  const parsed = parseManifestText(text, expectedSet);
  return { ...parsed, path: filePath };
}

export function isRealRepoRoot(root) {
  if (!root) return false;
  try {
    const pkg = path.join(root, "package.json");
    const agents = path.join(root, "AGENTS.md");
    if (!fs.existsSync(pkg) || !fs.existsSync(agents)) return false;
    const index = path.join(root, "index.html");
    const servicos = path.join(root, "servicos/index.html");
    return fs.existsSync(index) || fs.existsSync(servicos);
  } catch {
    return false;
  }
}

export function isCandidateMode(examinedKind, strictRelease) {
  if (strictRelease) return true;
  return examinedKind === "candidate" || examinedKind === "release";
}

export function resolveRoot({ rootArg, envRoot, inferred, mode, strictRelease }) {
  const candidateLike = isCandidateMode(mode, strictRelease);
  if (candidateLike) {
    const chosen = rootArg || null;
    if (!chosen) {
      return { ok: false, error: "missing_explicit_root", inferred: Boolean(inferred) };
    }
    const resolved = path.resolve(chosen);
    if (!isRealRepoRoot(resolved)) {
      return { ok: false, error: "root_not_repo", root: resolved, inferred: false };
    }
    return { ok: true, root: resolved, inferred: false };
  }
  const chosen = rootArg || envRoot || inferred;
  if (!chosen) return { ok: false, error: "missing_root" };
  return { ok: true, root: path.resolve(chosen), inferred: !rootArg && !envRoot };
}

export function isExternalEvidenceId(id) {
  const s = String(id || "");
  return /gsc|search.?console|perfil.?da.?empresa|google.?business/i.test(s);
}

export function publishedTopDirs(root) {
  const manifestPath = path.join(root, "seo/PUBLIC-ARTIFACT-MANIFEST.json");
  if (!fs.existsSync(manifestPath)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return new Set([...(data.top_dirs || []), ...(data.copied_dirs || [])]);
  } catch {
    return new Set();
  }
}

export function isPublishedRel(root, rel, url) {
  const tops = publishedTopDirs(root);
  const first = String(rel || "").split("/")[0];
  if (first && (tops.has(`${first}/`) || tops.has(first))) return true;
  const manifestPath = path.join(root, "seo/PUBLIC-ARTIFACT-MANIFEST.json");
  if (url && fs.existsSync(manifestPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const routes = data.html_routes || [];
      const normalized = String(url).endsWith("/") ? url : `${url}/`;
      if (routes.includes(normalized) || routes.includes(url)) return true;
    } catch {
      /* ignore */
    }
  }
  return Boolean(rel && fs.existsSync(path.join(root, rel)));
}

/**
 * Absence is never rewritten to PASS.
 * Live GSC stays EXTERNAL_EVIDENCE / NOT_VERIFIED.
 * A published public dependency is HARD_AT_RELEASE even if historically called expansion.
 * `.dedicated_route` is NOT a blanket optional classifier.
 * Unknown level or campaign fails closed as HARD_AT_RELEASE.
 */
export function classifyDependencyLevel(row, context = {}) {
  const explicit = row?.dependency_level;
  if (explicit) {
    if (KNOWN_LEVELS.has(explicit)) return explicit;
    return HARD_AT_RELEASE;
  }
  const id = String(row?.id || "");
  if (isExternalEvidenceId(id)) return EXTERNAL_EVIDENCE;
  const rel = row?.path || null;
  const url = row?.url || null;
  const root = context.root;
  if (root && isPublishedRel(root, rel, url)) return HARD_AT_RELEASE;
  if (context.published === true) return HARD_AT_RELEASE;
  const campaign = String(row?.campaign || "");
  if (CORE_CAMPAIGN_IDS.has(campaign)) return HARD_AT_RELEASE;
  if (row?.optional_unpublished_expansion === true) return OPTIONAL_ENRICHMENT;
  return HARD_AT_RELEASE;
}

export function isPublicationRequired(row, context = {}) {
  return classifyDependencyLevel(row, context) === HARD_AT_RELEASE;
}

export function overlayContentHash(root) {
  let porcelain;
  try {
    porcelain = spawnSync("git", ["-C", root, "status", "--porcelain", "-uall"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
  if (porcelain.status !== 0) return null;
  const lines = String(porcelain.stdout || "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);
  if (!lines.length) return null;
  const hash = createHash("sha256");
  const entries = lines
    .map((line) => {
      const rel = line.slice(3).replace(/^"/, "").replace(/"$/, "");
      return { line, rel };
    })
    .sort((a, b) => a.rel.localeCompare(b.rel));
  for (const entry of entries) {
    hash.update(entry.rel);
    hash.update("\0");
    const full = path.join(root, entry.rel);
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        hash.update(fs.readFileSync(full));
      } else {
        hash.update("deleted-or-dir");
      }
    } catch {
      hash.update("unreadable");
    }
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function probeChrome() {
  const envBins = [process.env.CHROME_PATH, process.env.GOOGLE_CHROME_BIN, process.env.CHROMIUM_PATH].filter(Boolean);
  const wellKnown = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];
  const names = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"];
  const candidates = [...envBins, ...wellKnown];
  for (const name of names) {
    const which = spawnSync("which", [name], { encoding: "utf8" });
    if (which.status === 0 && which.stdout.trim()) candidates.push(which.stdout.trim());
  }
  const seen = new Set();
  for (const bin of candidates) {
    if (!bin || seen.has(bin)) continue;
    seen.add(bin);
    if (!fs.existsSync(bin)) continue;
    const version = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 8000 });
    if (version.status === 0 && String(version.stdout || version.stderr || "").trim()) {
      return {
        available: true,
        binary: bin,
        version: String(version.stdout || version.stderr).trim(),
        puppeteer_import: false,
      };
    }
  }
  return {
    available: false,
    binary: null,
    version: null,
    puppeteer_import: false,
    reason: "chrome_binary_not_found",
  };
}

export function emptiness(report) {
  const results = Array.isArray(report?.results) ? report.results : [];
  const requirementIds = new Set(
    results.map((r) => String(r.id || "").split(".")[0]).filter((id) => /^Q\d{2}$/.test(id) || /^\d{2}$/.test(id)),
  );
  return {
    result_count: results.length,
    requirement_count: requirementIds.size,
    empty: results.length === 0,
  };
}

export function summarize(report, { strictRelease = false, mode = "baseline" } = {}) {
  const results = Array.isArray(report.results) ? report.results : [];
  const productFails = results.filter((r) => r.status === FAIL).length;
  const missingRows = results.filter((r) => r.status === MISSING_DEPENDENCY);
  const passes = results.filter((r) => r.status === PASS).length;
  const notVerified = results.filter((r) => r.status === NOT_VERIFIED).length;
  const notRun = results.filter((r) => r.status === NOT_RUN).length;
  const context = { root: report.environment?.cwd };
  const publicationRequiredMissingRows = missingRows.filter((r) => isPublicationRequired(r, context));
  const counts = emptiness(report);
  const candidateLike = isCandidateMode(mode, strictRelease);
  let exitCode = 0;
  if (productFails > 0) exitCode = 1;
  if (candidateLike && publicationRequiredMissingRows.length > 0) exitCode = 1;
  if (candidateLike && counts.empty) exitCode = 1;
  if (report.fatal) exitCode = 1;
  if (report.mutation_detection_ok === false) exitCode = 1;
  return {
    pass: passes,
    fail: productFails,
    MISSING_DEPENDENCY: missingRows.length,
    NOT_VERIFIED: notVerified,
    NOT_RUN: notRun,
    publication_required_missing: publicationRequiredMissingRows.length,
    optional_or_external_missing: missingRows.length - publicationRequiredMissingRows.length,
    strict_release: Boolean(strictRelease),
    examined_kind: mode,
    result_count: counts.result_count,
    requirement_count: counts.requirement_count,
    empty_suite: counts.empty,
    publication_required_missing_ids: publicationRequiredMissingRows.map((r) => r.id),
    exit_code: exitCode,
  };
}
