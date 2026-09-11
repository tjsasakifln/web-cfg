/**
 * Pre-promotion qualification: the executable barrier between a candidate and
 * the visitors.
 *
 * Why this exists. In netcup-release runs 34400752543, 34422538162,
 * 34501989732, 34517284468 and 34532136335 the release was promoted FIRST and
 * verified afterwards, against https://confenge.com.br. Every one of those runs
 * discovered its defect with the candidate already live, and every one ended in
 * a rollback. Visitors were the debugging environment.
 *
 * This module inverts that order. A candidate is qualified while it is still a
 * candidate, the qualification is bound to an exact identity, and the promotion
 * step refuses to change `current` unless it can load a qualification that
 * matches the candidate in front of it.
 *
 * The barrier is deliberately fail-closed and deliberately dumb: it does not
 * re-derive anything, it compares. Evidence that is absent, unreadable, from a
 * different SHA, from a different artifact, from a different verifier, from a
 * previous run, or that records anything other than a passing measurement, does
 * not authorise a promotion.
 *
 * Usage:
 *   node scripts/site/release_qualification.mjs --emit    [options] --out=<path>
 *   node scripts/site/release_qualification.mjs --require [options] --record=<path>
 */
import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * The verifier's identity. A qualification proves something about a candidate
 * *as measured by a particular instrument*; changing the instrument invalidates
 * it. A moving label would not — this is a digest of the actual sources.
 */
export const VERIFIER_SOURCES = [
  "scripts/site/run_lighthouse.mjs",
  "scripts/site/lighthouse_measure_child.mjs",
  "scripts/site/lighthouse_infra.mjs",
  "scripts/site/lighthouse_thresholds.mjs",
  "scripts/site/lighthouse_payload.mjs",
  "scripts/site/runtime_lighthouse_acceptance.mjs",
];

export function verifierVersion(root = ROOT, sources = VERIFIER_SOURCES) {
  const digest = createHash("sha256");
  for (const relative of sources) {
    digest.update(relative);
    digest.update("\0");
    digest.update(readFileSync(join(root, relative)));
    digest.update("\0");
  }
  return digest.digest("hex");
}

/** Reads the identity the candidate itself carries. */
export function candidateIdentity(sitePath) {
  const identityPath = join(sitePath, ".well-known", "build-info.json");
  if (!existsSync(identityPath)) {
    throw new Error(`the candidate carries no identity at ${identityPath}`);
  }
  const identity = JSON.parse(readFileSync(identityPath, "utf8"));
  for (const field of ["commit", "artifact_hash", "manifest_hash"]) {
    if (!identity[field]) throw new Error(`the candidate identity is missing ${field}`);
  }
  return identity;
}

/**
 * Builds the qualification record. `terminal_state` is recorded truthfully
 * whatever it is: emitting is reporting, not approving. Only `verifyQualification`
 * decides whether a record authorises a promotion.
 */
export function buildQualification({
  releaseSha,
  identity,
  bundleDigest = null,
  verifier,
  runId,
  runAttempt,
  terminalState,
  acceptanceResult,
  base,
  toolchain = null,
  evidence = [],
  residualDifferences = [],
  generatedAt = new Date().toISOString(),
}) {
  return {
    schema: "CONFENGE_RELEASE_QUALIFICATION/1.0.0",
    release_sha: releaseSha,
    artifact_hash: identity.artifact_hash,
    manifest_hash: identity.manifest_hash,
    build_commit: identity.commit,
    bundle_digest: bundleDigest,
    verifier_version: verifier,
    run_id: String(runId),
    run_attempt: String(runAttempt),
    terminal_state: terminalState,
    acceptance_result: acceptanceResult,
    base,
    // The effective instrument identity. `stable` is a moving label, so the
    // resolution it produced is recorded here and compared before the public
    // verification runs.
    toolchain,
    evidence,
    // What this qualification does NOT prove, stated explicitly so nobody reads
    // it as edge acceptance. The candidate cannot be served through the real
    // nginx contract before the symlink swap (deploy/netcup/lib/release_control.py
    // smoke_candidate serves raw files on an ephemeral loopback port; the fixed
    // origin 127.0.0.1:8088 is rooted at `current`). These properties remain
    // measurable only after promotion, and the public acceptance still runs.
    residual_differences: residualDifferences,
    generated_at: generatedAt,
  };
}

/**
 * The refusal path. Returns every reason the record fails to authorise this
 * exact candidate, so a blocked promotion explains itself completely rather
 * than one reason at a time.
 */
export function verifyQualification({ record, expected }) {
  const refusals = [];
  if (!record || typeof record !== "object") {
    return { ok: false, refusals: ["no qualification record was provided"] };
  }
  if (record.schema !== "CONFENGE_RELEASE_QUALIFICATION/1.0.0") {
    refusals.push(`unknown qualification schema ${JSON.stringify(record.schema)}`);
  }

  const bind = (field, expectedValue, label) => {
    if (expectedValue === null || expectedValue === undefined) return;
    if (record[field] !== expectedValue) {
      refusals.push(
        `${label} does not match the candidate: qualification has ${JSON.stringify(record[field])}, candidate is ${JSON.stringify(expectedValue)}`,
      );
    }
  };

  bind("release_sha", expected.releaseSha, "release SHA");
  bind("artifact_hash", expected.artifactHash, "artifact hash");
  bind("manifest_hash", expected.manifestHash, "manifest hash");
  bind("verifier_version", expected.verifierVersion, "verifier version");
  if (expected.bundleDigest) bind("bundle_digest", expected.bundleDigest, "bundle digest");

  // A qualification from an earlier run described an earlier attempt at this
  // release. It is not evidence about this one.
  //
  // `run_attempt` is recorded but deliberately NOT bound. Binding it would make
  // GitHub's "Re-run failed jobs" unusable: after a transient SSH or API error
  // the successful `qualify` job does not re-run, the attempt counter advances,
  // and the record could never match again — removing the bounded recovery path
  // this release process depends on. Within one run, over one immutable
  // artifact, `run_id` already supplies the freshness guarantee.
  if (expected.runId !== null && expected.runId !== undefined) {
    bind("run_id", String(expected.runId), "workflow run");
  }

  // Nothing unknown is a pass.
  if (record.terminal_state !== "MEASURED_PASS") {
    refusals.push(
      `the qualification records ${JSON.stringify(record.terminal_state)}; only MEASURED_PASS authorises a promotion`,
    );
  }
  if (record.acceptance_result && record.acceptance_result !== "PASSED") {
    refusals.push(`the acceptance recorded ${JSON.stringify(record.acceptance_result)}`);
  }
  if (!Array.isArray(record.evidence) || record.evidence.length === 0) {
    refusals.push("the qualification cites no evidence");
  }

  return { ok: refusals.length === 0, refusals };
}

export function loadRecord(path) {
  if (!existsSync(path)) {
    return { record: null, error: `no qualification record at ${path}` };
  }
  try {
    return { record: JSON.parse(readFileSync(path, "utf8")), error: null };
  } catch (error) {
    return { record: null, error: `the qualification record could not be read: ${String(error?.message || error)}` };
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function main(argv) {
  const flag = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") || "";
  const has = (name) => argv.includes(`--${name}`);

  const sitePath = resolve(flag("site") || join(ROOT, "_site"));
  const releaseSha = flag("sha");
  if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
    console.error("RELEASE_QUALIFICATION_BLOCKED: --sha=<40 lowercase hex> is required");
    return 2;
  }

  if (has("emit")) {
    const outPath = flag("out");
    if (!outPath) {
      console.error("RELEASE_QUALIFICATION_BLOCKED: --out=<path> is required to emit");
      return 2;
    }
    const identity = candidateIdentity(sitePath);
    if (identity.commit !== releaseSha) {
      console.error(
        `RELEASE_QUALIFICATION_BLOCKED: the candidate carries ${identity.commit}, not ${releaseSha}`,
      );
      return 1;
    }
    const record = buildQualification({
      releaseSha,
      identity,
      bundleDigest: flag("bundle-digest") || null,
      verifier: verifierVersion(),
      runId: flag("run-id") || "unknown",
      runAttempt: flag("run-attempt") || "unknown",
      terminalState: flag("terminal-state") || "INVALID_OR_INCOMPLETE",
      acceptanceResult: flag("acceptance-result") || null,
      base: flag("base") || null,
      toolchain: flag("toolchain") || null,
      evidence: flag("evidence").split(",").map((v) => v.trim()).filter(Boolean),
      residualDifferences: flag("residual").split(";").map((v) => v.trim()).filter(Boolean),
    });
    writeFileSync(outPath, JSON.stringify(record, null, 2));
    console.log(`RELEASE_QUALIFICATION_EMITTED ${record.release_sha} ${record.terminal_state} -> ${outPath}`);
    return 0;
  }

  if (has("require")) {
    const recordPath = flag("record");
    if (!recordPath) {
      console.error("RELEASE_QUALIFICATION_BLOCKED: --record=<path> is required");
      return 2;
    }
    const { record, error } = loadRecord(recordPath);
    if (error) {
      console.error(`RELEASE_QUALIFICATION_BLOCKED: ${error}`);
      return 1;
    }
    let identity = null;
    try {
      identity = candidateIdentity(sitePath);
    } catch (identityError) {
      console.error(`RELEASE_QUALIFICATION_BLOCKED: ${String(identityError?.message || identityError)}`);
      return 1;
    }
    let verifier = null;
    try {
      verifier = verifierVersion();
    } catch (verifierError) {
      // A barrier that dies without its own diagnostic is an operability
      // defect: the release is blocked and the log says only "ENOENT".
      console.error(
        `RELEASE_QUALIFICATION_BLOCKED: the verifier could not be identified: ${String(verifierError?.message || verifierError)}`,
      );
      return 1;
    }
    const { ok, refusals } = verifyQualification({
      record,
      expected: {
        releaseSha,
        artifactHash: identity.artifact_hash,
        manifestHash: identity.manifest_hash,
        verifierVersion: verifier,
        bundleDigest: flag("bundle-digest") || null,
        runId: flag("run-id") || null,
      },
    });
    if (!ok) {
      console.error("RELEASE_QUALIFICATION_BLOCKED: this candidate is not qualified for promotion");
      for (const refusal of refusals) console.error(`  - ${refusal}`);
      return 1;
    }
    console.log(
      `RELEASE_QUALIFICATION_OK ${record.release_sha} verifier=${record.verifier_version.slice(0, 12)} run=${record.run_id}/${record.run_attempt}`,
    );
    return 0;
  }

  console.error("usage: release_qualification.mjs --emit|--require [options]");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}
