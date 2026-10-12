import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SPECIALIZED_QA_CONTRACT,
  SPECIALIZED_QA_CONTEXT,
  SPECIALIZED_QA_CONTEXT_KEYS,
  SPECIALIZED_QA_CTA_SELECTOR,
  SPECIALIZED_QA_ENTRY_PATH,
  SPECIALIZED_QA_FORM_CTA_SELECTOR,
  SPECIALIZED_QA_SERVICE_PATH,
  captureSpecializedQaJourney,
  specializedQaContextSha256,
  specializedQaWireContextSha256,
  validateSpecializedQaJourney,
} from "./synthetic_contact_journey.mjs";

const require = createRequire(import.meta.url);
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const realRoot = realpathSync(root);
const probePath = resolve(root, "scripts/site/synthetic_lead_probe.mjs");
const inbound = require(resolve(root, "netlify/functions/lib/inbound-handoff.cjs"));
const SHA = "a".repeat(40);
const RECEIPT = "synthetic:fixture:specialized:0001";
const technicalHash = specializedQaContextSha256(SPECIALIZED_QA_CONTEXT);
const wireTechnicalHash = specializedQaWireContextSha256(SPECIALIZED_QA_CONTEXT);
const browserRequired = !process.argv.includes("--unit-only");
assert.match(technicalHash, /^[0-9a-f]{64}$/);

function resolvePublicRoot(raw = process.env.SITE_ROOT) {
  const configured = String(raw || ".").trim();
  if (!configured) throw new Error("site_root_empty");
  let candidate;
  try { candidate = realpathSync(resolve(root, configured)); } catch { throw new Error("site_root_unreadable"); }
  if (candidate !== realRoot && !candidate.startsWith(`${realRoot}${sep}`)) {
    throw new Error("site_root_outside_repo");
  }
  if (!statSync(candidate).isDirectory()) throw new Error("site_root_not_directory");
  for (const required of ["index.html", `servicos${sep}index.html`, "script.js"]) {
    let requiredPath;
    try { requiredPath = realpathSync(resolve(candidate, required)); } catch { throw new Error(`site_root_missing:${required}`); }
    if (
      !requiredPath.startsWith(`${candidate}${sep}`) ||
      !statSync(requiredPath).isFile()
    ) throw new Error(`site_root_invalid:${required}`);
  }
  return candidate;
}

assert.throws(() => resolvePublicRoot(".."), /site_root_outside_repo/);
const sourcePublicRoot = resolvePublicRoot();
const temp = mkdtempSync(resolve(tmpdir(), "confenge-specialized-proof-"));
let publicRoot = sourcePublicRoot;
const artifactMarker = "controlled-specialized-proof-artifact";
if (browserRequired) {
  publicRoot = resolve(temp, "selected-public-artifact");
  mkdirSync(publicRoot, { recursive: true });
  for (const relative of [
    "index.html", "script.js", "styles.css", "styles-hubs.css", "manifest.webmanifest",
    "assets", "servicos", "assistencia-tecnica-pericia-trabalhista",
  ]) {
    cpSync(resolve(sourcePublicRoot, relative), resolve(publicRoot, relative), { recursive: true });
  }
  const artifactHome = resolve(publicRoot, "index.html");
  const configuredHome = readFileSync(artifactHome, "utf8")
    .replace(
      /data-turnstile-sitekey="[^"]*"/,
      'data-turnstile-sitekey="1x00000000000000000000AA"',
    )
    .replace("</head>", `<meta name="qa-artifact-marker" content="${artifactMarker}"/></head>`);
  writeFileSync(artifactHome, configuredHome);
}

const exactRecord = {
  lead_id: RECEIPT,
  receipt_id: RECEIPT,
  received_at: "2026-10-11T12:00:00.000Z",
  record_kind: "synthetic",
  synthetic_probe_authenticated: true,
  next_action: "exclude_from_commercial",
  consentimento: true,
  nome: "SYNTHETIC-PROBE",
  email: "probe@example.com",
  mensagem: "synthetic probe do not contact",
  ...SPECIALIZED_QA_CONTEXT,
};

// The hash is present only for the exact authenticated synthetic fixture and
// is recoverable from the exact bytes handed to fetch. Real or near-matching
// records cannot opt into the proof field.
{
  const payload = inbound.mapLeadToInboundV1(exactRecord);
  assert.deepEqual(Object.keys(payload).sort(), [
    "asset_id", "consent", "created_at", "cta_id", "email", "journey",
    "landing_url", "lead_id", "message", "name", "receipt_id", "record_kind",
    "route_family", "source", "synthetic",
  ].sort(), "specialized proof must preserve the existing Warmbly v1 keyset");
  assert.equal(Object.keys(payload).some((key) => key.startsWith("qa_") || key.includes("technical_context")), false);
  assert.equal(
    inbound.qaTechnicalContextSha256FromSerializedPayload(JSON.stringify(payload)),
    wireTechnicalHash,
  );
  const themeMutated = { ...payload, message: payload.message.replace(SPECIALIZED_QA_CONTEXT.tema, "valor divergente") };
  const originMutated = { ...payload, message: payload.message.replace("assistencia-tecnica-pericia-trabalhista", "outra-familia") };
  const themeDropped = { ...payload, message: payload.message.replace(`; tema=${SPECIALIZED_QA_CONTEXT.tema}`, "") };
  const originDropped = { ...payload, message: payload.message.replace("; família de rota de origem=assistencia-tecnica-pericia-trabalhista", "") };
  const arbitraryQualification = { ...payload, message: payload.message.replace(". synthetic", "; urgencia=agora. synthetic") };
  assert.equal(inbound.qaTechnicalContextSha256FromSerializedPayload(JSON.stringify(themeMutated)), null);
  assert.equal(inbound.qaTechnicalContextSha256FromSerializedPayload(JSON.stringify(originMutated)), null);
  assert.equal(inbound.qaTechnicalContextSha256FromSerializedPayload(JSON.stringify(themeDropped)), null);
  assert.equal(inbound.qaTechnicalContextSha256FromSerializedPayload(JSON.stringify(originDropped)), null);
  assert.equal(inbound.qaTechnicalContextSha256FromSerializedPayload(JSON.stringify(arbitraryQualification)), null);
  const persistedOriginMismatch = { ...exactRecord, origem: "/outra-origem/" };
  const originMismatchPayload = inbound.mapLeadToInboundV1(persistedOriginMismatch);
  assert.equal(JSON.stringify(originMismatchPayload), JSON.stringify(payload));
  assert.equal(
    inbound.qaTechnicalContextSha256FromSerializedPayload(JSON.stringify(originMismatchPayload)),
    wireTechnicalHash,
  );
  assert.equal(inbound.specializedQaWireTechnicalContextSha256(persistedOriginMismatch), null);

  let wire = null;
  inbound.setFetchForTests(async (_url, init) => {
    wire = String(init.body);
    return { ok: true, status: 201, json: async () => ({ receipt_id: RECEIPT, duplicate: false }) };
  });
  const result = await inbound.postSignedInbound(payload, {
    env: {
      NODE_ENV: "production",
      CONFENGE_INBOUND_WEBHOOK_URL: "https://api.confenge.com.br/api/v1/webhooks/confenge/inbound",
      CONFENGE_INBOUND_WEBHOOK_SECRET: "fixture-secret-at-least-32-characters",
    },
  });
  inbound.setFetchForTests(null);
  assert.equal(Object.hasOwn(JSON.parse(wire), "qa_technical_context_sha256"), false);
  assert.equal(result.technical_context_sha256, wireTechnicalHash);
  assert.equal(inbound.applyAttempt({}, result).technical_context_sha256, wireTechnicalHash);
  console.log("PASS specialized_hash_is_bound_to_serialized_synthetic_handoff_only");
}

const zeroCounts = {
  visitor: 0, cta_triggered: 0, form_started: 0, lead_persisted: 0, contacted: 0,
  qualified: 0, meeting: 0, proposal: 0, won: 0, lost: 0,
};
let created = false;
let postCount = 0;
let postedBody = null;
let injectAutoPost = false;
let injectDuplicateTechnical = false;
let injectUnknownExternal = false;
let browserMutationHits = 0;

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function staticFile(pathname, res) {
  const clean = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const candidate = resolve(publicRoot, `.${decodeURIComponent(clean)}`);
  if (!candidate.startsWith(`${publicRoot}${sep}`)) return false;
  try {
    const file = realpathSync(candidate);
    if (!file.startsWith(`${publicRoot}${sep}`)) return false;
    if (!statSync(file).isFile()) return false;
    const type = {
      ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml",
      ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp",
    }[extname(file)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    let body = readFileSync(file);
    if (injectAutoPost && pathname === "/") {
      body = Buffer.from(
        body.toString("utf8").replace("</body>", '<script>fetch("/browser-auto-post",{method:"POST",body:"forbidden"})</script></body>'),
        "utf8",
      );
    }
    if (injectDuplicateTechnical && pathname === "/") {
      body = Buffer.from(
        body.toString("utf8").replace(
          '<input name="asset_id" type="hidden" value="home-institutional"/>',
          '<input name="asset_id" type="hidden" value="home-institutional"/><input name="asset_id" type="hidden" value=""/>',
        ),
        "utf8",
      );
    }
    if (injectUnknownExternal && pathname === "/servicos/") {
      body = Buffer.from(
        body.toString("utf8").replace("</head>", '<script src="https://example.invalid/qa.js"></script></head>'),
        "utf8",
      );
    }
    res.end(body);
    return true;
  } catch { return false; }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/browser-auto-post") {
    browserMutationHits += 1;
    return json(res, 204, {});
  }
  if (url.pathname === "/.well-known/build-info.json") return json(res, 200, { commit: SHA });
  if (url.pathname === "/.netlify/functions/ops") {
    const action = url.searchParams.get("action");
    if (action === "funnel") return json(res, 200, { ok: true, commercial_only: true, funnel: { counts: zeroCounts, pipeline_value: 0, revenue: 0 } });
    if (action === "system_health") return json(res, 200, { ok: true, counts_by_kind: { synthetic: created ? 6 : 5 } });
    if (action === "weekly_report") return json(res, 200, { ok: true, commercial_only: true, leads_total: 0, leads_new_7d: 0, leads_excluded_non_real: created ? 6 : 5, system_health: { pipeline_real: 0, revenue_real: 0 } });
    if (action === "inbound_handoff") {
      const requested = url.searchParams.get("lead_id");
      return json(res, 200, {
        ok: true,
        configuration: { contract: "READY", destination_fingerprint: "WARMBLY_PRODUCTION_V1" },
        safety_gate: { ok: true, contract: "READY", auto_send_off: true, dispatch_attempted: false },
        receipt: created && requested === RECEIPT ? {
          lead_id: RECEIPT,
          record_kind: "synthetic",
          authenticated_probe: true,
          source: "CONFENGE_WEB",
          next_action: "exclude_from_commercial",
          asset_id: SPECIALIZED_QA_CONTEXT.asset_id,
          cta_id: SPECIALIZED_QA_CONTEXT.cta_id,
          route_family: SPECIALIZED_QA_CONTEXT.route_family,
          technical_context: { ...SPECIALIZED_QA_CONTEXT },
          technical_context_sha256: technicalHash,
          handoff: {
            status: "DELIVERED", attempts: 1, technical_context_sha256: wireTechnicalHash,
            downstream: { http: 201, duplicate: false, downstream_receipt: RECEIPT },
          },
          delivery: { qa_email_status: "ok", qa_email_provider_id: "re_fixture_001" },
        } : null,
      });
    }
  }
  if (url.pathname === "/.netlify/functions/lead" && req.method === "POST") {
    postCount += 1;
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      postedBody = JSON.parse(raw);
      if (!created) {
        created = true;
        json(res, 201, { ok: true, lead_id: RECEIPT, notify_status: "skipped", email_status: "skipped" });
      } else {
        json(res, 200, { ok: true, lead_id: RECEIPT, idempotent: true, notify_status: "skipped", email_status: "skipped" });
      }
    });
    return;
  }
  if (staticFile(url.pathname, res)) return;
  json(res, 404, { ok: false });
});

function runProbe(base, fixturePath) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [probePath, base], {
      env: {
        ...process.env,
        LEAD_PROBE_SECRET: "probe-fixture-secret-at-least-32-characters",
        OPS_TOKEN: "ops-fixture-token-at-least-16",
        EXPECTED_SHA: SHA,
        PROBE_VERIFY_EMAIL: "1",
        PROBE_PAGE_PATH: "/",
        PROBE_BROWSER_CONTEXT_FILE: fixturePath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolveRun({ code, stdout, stderr }));
  });
}

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  let journey;
  if (browserRequired) {
    const selectedHome = await fetch(`${base}/`).then((response) => response.text());
    assert.match(selectedHome, new RegExp(artifactMarker));
    assert.doesNotMatch(readFileSync(resolve(sourcePublicRoot, "index.html"), "utf8"), new RegExp(artifactMarker));
    console.log("PASS SITE_ROOT_artifact_is_selected_without_mutating_source_tree");

    injectUnknownExternal = true;
    await assert.rejects(
      captureSpecializedQaJourney(base, SHA),
      /browser_external_request_forbidden/,
    );
    injectUnknownExternal = false;
    console.log("PASS unknown_external_get_remains_blocked");

    injectAutoPost = true;
    await assert.rejects(
      captureSpecializedQaJourney(base, SHA),
      /browser_mutation_forbidden/,
    );
    assert.equal(browserMutationHits, 0, "Chromium must abort mutation before it reaches the server");
    injectAutoPost = false;
    console.log("PASS browser_mutation_is_aborted_before_network_and_blocks_fixture");

    injectDuplicateTechnical = true;
    await assert.rejects(
      captureSpecializedQaJourney(base, SHA),
      /duplicate_technical_field:asset_id/,
    );
    injectDuplicateTechnical = false;
    console.log("PASS duplicate_empty_formdata_field_blocks_browser_fixture");

    journey = await captureSpecializedQaJourney(base, SHA);
  } else {
    journey = {
      ok: true,
      contract: SPECIALIZED_QA_CONTRACT,
      live_sha: SHA,
      entry_path: SPECIALIZED_QA_ENTRY_PATH,
      cta_selector: SPECIALIZED_QA_CTA_SELECTOR,
      service_path: SPECIALIZED_QA_SERVICE_PATH,
      form_cta_selector: SPECIALIZED_QA_FORM_CTA_SELECTOR,
      target_path: "/",
      target_hash: "#contato",
      public_query: "",
      post_requests: 0,
      mutation_requests: 0,
      external_requests: 0,
      analytics_requests_blocked: 0,
      captcha_sitekey_configured: true,
      captcha_loader_present: true,
      captcha_widget_requests_blocked: 1,
      context: { ...SPECIALIZED_QA_CONTEXT },
      context_sha256: technicalHash,
    };
    console.log("PASS specialized_browser_checks_deferred_until_required_step");
  }
  assert.equal(validateSpecializedQaJourney(journey, SHA).ok, true);
  assert.deepEqual(journey.context, SPECIALIZED_QA_CONTEXT);
  assert.deepEqual(Object.keys(journey.context), SPECIALIZED_QA_CONTEXT_KEYS);
  assert.equal(journey.post_requests, 0);
  assert.equal(journey.captcha_sitekey_configured, true);
  assert.equal(journey.captcha_loader_present, true);
  assert.equal(journey.captcha_widget_requests_blocked, 1);
  const missingCaptchaAttempt = validateSpecializedQaJourney({
    ...journey,
    captcha_widget_requests_blocked: 0,
  }, SHA);
  assert.equal(missingCaptchaAttempt.reason, "browser_fixture_route_mismatch");
  assert.deepEqual(missingCaptchaAttempt.invalid_fields, ["captcha_widget_requests_blocked"]);
  console.log(browserRequired
    ? "PASS fixed_browser_journey_captures_only_literal_technical_context"
    : "PASS literal_technical_fixture_contract_validates_without_browser");

  const mismatchPath = resolve(temp, "mismatch.json");
  writeFileSync(mismatchPath, JSON.stringify({ ...journey, context: { ...journey.context, tema: "valor divergente" } }));
  const mismatch = await runProbe(base, mismatchPath);
  assert.equal(mismatch.code, 1, mismatch.stdout || mismatch.stderr);
  assert.equal(JSON.parse(mismatch.stdout).reason, "browser_fixture_context_mismatch");
  assert.equal(postCount, 0, "fixture mismatch must block before the lead POST");
  console.log("PASS browser_fixture_mismatch_blocks_before_post");

  const exactPath = resolve(temp, "exact.json");
  writeFileSync(exactPath, JSON.stringify(journey));
  const ready = await runProbe(base, exactPath);
  assert.equal(ready.code, 0, ready.stdout || ready.stderr);
  const proof = JSON.parse(ready.stdout);
  assert.equal(proof.state, "TRANSPORT_READY");
  assert.equal(proof.checks.specialized_context_persisted, true);
  assert.equal(proof.checks.specialized_persisted_and_handoff_hashes_match_scopes, true);
  assert.equal(postCount, 2);
  assert.deepEqual(
    Object.fromEntries(SPECIALIZED_QA_CONTEXT_KEYS.map((key) => [key, postedBody[key] ?? null])),
    SPECIALIZED_QA_CONTEXT,
  );
  for (const key of ["nome", "email", "telefone", "mensagem"]) {
    assert.equal(Object.hasOwn(journey.context, key), false, `browser fixture must exclude ${key}`);
  }
  assert.equal(postedBody.nome, "SYNTHETIC-PROBE");
  assert.equal(postedBody.email, "probe@example.com");
  assert.equal(postedBody.mensagem, "synthetic probe do not contact");
  console.log("PASS persisted_and_wire_context_match_their_distinct_projections_without_browser_pii");
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
  rmSync(temp, { recursive: true, force: true });
}
