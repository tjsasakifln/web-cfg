/**
 * A06-RECEBIMENTO-03 (campanha BOFU-FECHAMENTO-20260919): o protocolo humano
 * do QA de recebimento (g03-qa-protocolo.md) precisa apontar para a release
 * que o snapshot de prontidão citado mediu, nunca convidar a leitura do ops
 * com dados de contato (`pii=1`) e, quando um resultado de QA existir,
 * registrar a release em que foi executado.
 *
 * Offline (sempre):
 *   - cabeçalho: release/artifact/build == release.commit/artifact_hash/build_time
 *     do snapshot prontidao-operacional-<sha>.json citado na mesma pasta;
 *   - o texto não contém `pii=1`;
 *   - §6 nomeia a evidência com o sha da release e exige o campo release.commit;
 *   - cada g03-qa-resultado*.json existente traz release.commit igual ao do protocolo.
 * Com CHECK_LIVE=1 (GET público, sem segredo): o commit/artifact servidos em
 * https://confenge.com.br/.well-known/build-info.json precisam ser os do
 * cabeçalho — reprova quando o protocolo ficou para trás da produção.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dir = path.join(root, "docs/campaigns/design-institucional/fechamento/evidence/producao");
const protocolPath = path.join(dir, "g03-qa-protocolo.md");
const protocol = fs.readFileSync(protocolPath, "utf8");

let failed = 0;
function pass(name, detail = "") {
  console.log("PASS", name, detail);
}
function fail(name, detail) {
  console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
  failed += 1;
}

const header = /release `([0-9a-f]{7,40})` \(artifact `([0-9a-f]{6,64})…?`, build (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\)/.exec(protocol);
if (!header) fail("protocol_header_release_parseable", protocol.split("\n").slice(0, 4));
else pass("protocol_header_release_parseable", `release=${header[1]} artifact=${header[2]} build=${header[3]}`);
const shortSha = header ? header[1] : "";
const artifactPrefix = header ? header[2] : "";
const buildTime = header ? header[3] : "";

const snapshotRef = /`(prontidao-operacional-([0-9a-f]{7,40})\.json)`/.exec(protocol);
if (!snapshotRef) fail("protocol_cites_readiness_snapshot");
else pass("protocol_cites_readiness_snapshot", snapshotRef[1]);
let snapshot = null;
if (snapshotRef) {
  const snapshotPath = path.join(dir, snapshotRef[1]);
  if (!fs.existsSync(snapshotPath)) fail("readiness_snapshot_exists", snapshotPath);
  else {
    snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    pass("readiness_snapshot_exists", snapshotRef[1]);
  }
  if (snapshotRef[2] !== shortSha && !snapshotRef[2].startsWith(shortSha) && !shortSha.startsWith(snapshotRef[2])) {
    fail("readiness_snapshot_named_after_header_release", { snapshot: snapshotRef[2], header: shortSha });
  } else pass("readiness_snapshot_named_after_header_release");
}
if (snapshot) {
  const rel = snapshot.release || {};
  if (!String(rel.commit || "").startsWith(shortSha)) fail("snapshot_commit_matches_header", { snapshot: rel.commit, header: shortSha });
  else pass("snapshot_commit_matches_header", rel.commit);
  if (!String(rel.artifact_hash || "").startsWith(artifactPrefix)) fail("snapshot_artifact_matches_header", { snapshot: rel.artifact_hash, header: artifactPrefix });
  else pass("snapshot_artifact_matches_header");
  if (rel.build_time !== buildTime) fail("snapshot_build_time_matches_header", { snapshot: rel.build_time, header: buildTime });
  else pass("snapshot_build_time_matches_header");
  const served = snapshot["3_runtime_servido"] || {};
  const edge = served["edge_https://confenge.com.br/.well-known/build-info.json"] || {};
  if (edge.commit && edge.commit !== rel.commit) fail("snapshot_edge_commit_consistent", { edge: edge.commit, release: rel.commit });
  else pass("snapshot_edge_commit_consistent");
  // Evidence never carries contact data: only SET/UNSET for the runtime env.
  const envSection = JSON.stringify(snapshot["5_env_runtime"] || {});
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(envSection)) fail("snapshot_env_without_addresses");
  else pass("snapshot_env_without_addresses");
}

// Privacy: no step invites the contact-bearing projection.
if (/pii=1/.test(protocol)) {
  const lines = protocol.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => l.includes("pii=1")).map(([n]) => n);
  fail("protocol_never_uses_pii_1", `lines ${lines.join(",")}`);
} else pass("protocol_never_uses_pii_1");

// Evidence file is named after the release and must carry release.commit.
const evidenceName = new RegExp(`g03-qa-resultado-${shortSha}\\.json`);
if (!evidenceName.test(protocol)) fail("protocol_evidence_named_after_release", `expected g03-qa-resultado-${shortSha}.json in §6`);
else pass("protocol_evidence_named_after_release");
if (!/`release`[^\n]*\{commit/.test(protocol)) fail("protocol_evidence_requires_release_commit");
else pass("protocol_evidence_requires_release_commit");

// Refs carry the campaign date of the protocol (one protocol, one set of refs).
const refs = [...protocol.matchAll(/REF-[A-Z0-9]+-(\d{8})-[ABC]1/g)].map((m) => m[1]);
if (!refs.length || new Set(refs).size !== 1) fail("protocol_refs_single_campaign_date", refs);
else pass("protocol_refs_single_campaign_date", refs[0]);

// A recorded QA must state the release it ran on, and it must be this one.
for (const name of fs.readdirSync(dir).filter((n) => /^g03-qa-resultado.*\.json$/.test(n))) {
  const result = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  const commit = String(result.release?.commit || "");
  if (!commit) fail("qa_result_states_release", name);
  else if (!commit.startsWith(shortSha)) fail("qa_result_release_matches_protocol", { name, commit, protocol: shortSha });
  else pass("qa_result_release_matches_protocol", name);
}

// Optional live identity check (public GET, no secret, no probe).
if (process.env.CHECK_LIVE === "1") {
  const base = (process.env.BASE_URL || "https://confenge.com.br").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/.well-known/build-info.json`);
    const live = await res.json();
    if (res.status !== 200 || !String(live.commit || "").startsWith(shortSha)) {
      fail("live_build_info_matches_protocol", { http: res.status, live: live.commit, protocol: shortSha });
    } else pass("live_build_info_matches_protocol", live.commit);
    if (!String(live.artifact_hash || "").startsWith(artifactPrefix)) fail("live_artifact_matches_protocol", { live: live.artifact_hash, protocol: artifactPrefix });
    else pass("live_artifact_matches_protocol");
  } catch (error) {
    fail("live_build_info_reachable", String(error && error.message || error));
  }
}

if (failed) {
  console.error(`\n${failed} G03 protocol identity check(s) failed`);
  process.exit(1);
}
console.log("\nALL G03 protocol identity checks passed");
