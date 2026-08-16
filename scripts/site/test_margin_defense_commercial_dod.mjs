/**
 * WEB-011 commercial DoD. Drives shipped HTML, shipped diagnoseMargin,
 * shipped lead.cjs / collect scrub, and the fail-closed review functions.
 * A synthetic persist must not become pipeline.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEARNING_TOKENS,
  EXIT_TOKENS,
  NEXT_COMMAND,
  PII_KEYS,
  blobHasPii,
  buildReview,
  classifyRealLoop,
  decideExit,
  decideLearning,
  extractDiagnosticoSignals,
  extractPillarSignals,
  extractSitemapSignals,
  parseCanonicalHref,
  stripPii,
} from "../money_asset/commercial_dod.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

function pass(name, detail) {
  console.log("PASS", name, detail || "");
}

const diagnosticoHtml = fs.readFileSync(
  path.join(root, "ferramentas/diagnostico-defesa-margem/index.html"),
  "utf8",
);
const pillarHtml = fs.readFileSync(
  path.join(root, "defesa-margem-contratos-publicos/index.html"),
  "utf8",
);
const sitemapXml = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
const factsPath = path.join(root, "docs/evidence/web-011/facts.v1.json");
const reviewPath = path.join(root, "docs/evidence/web-011/review.json");

// --- shipped page signals ---
{
  const page = extractDiagnosticoSignals(diagnosticoHtml);
  assert.equal(page.utility_before_cta, true);
  assert.equal(page.cta_segunda_leitura, true);
  assert.equal(page.visible_fonte, true);
  assert.equal(page.visible_as_of, true);
  assert.equal(page.visible_unknown, true);
  assert.equal(page.visible_reajuste, true);
  assert.equal(page.visible_reequilibrio, true);
  assert.equal(page.visible_medicao, true);
  assert.equal(page.canonical_host_confenge, true);
  assert.equal(page.robots_indexable, true);
  assert.equal(page.smartlic_present, false);
  assert.equal(
    parseCanonicalHref(diagnosticoHtml),
    "https://confenge.com.br/ferramentas/diagnostico-defesa-margem/",
  );
  pass("diagnostico_signals", {
    utility_before_cta: page.utility_before_cta,
    cta: page.cta_segunda_leitura,
  });
}

{
  const pillar = extractPillarSignals(pillarHtml);
  assert.equal(pillar.links_to_diagnostico, true);
  assert.equal(pillar.segunda_leitura_phrase, true);
  assert.equal(pillar.canonical_host_confenge, true);
  assert.equal(pillar.robots_indexable, true);
  assert.equal(pillar.smartlic_present, false);
  pass("pillar_signals", { canonical: pillar.canonical_href });
}

{
  const map = extractSitemapSignals(sitemapXml, { indexable: true });
  assert.equal(map.has_diagnostico_loc, true);
  assert.equal(map.has_pillar_loc, true);
  assert.equal(map.consistent_with_indexable, true);
  pass("sitemap_signals", map);
}

// --- shipped use path (diagnoseMargin on official export) ---
{
  const {
    diagnoseMargin,
    selectContract,
    MARGIN_DEFENSE_SCHEMA,
  } = require(path.join(root, "assets/js/diagnose-margin.cjs"));
  const snapshot = JSON.parse(
    fs.readFileSync(
      path.join(root, "data/extra-cli/public-read-margin-defense/1.0/margem-export.json"),
      "utf8",
    ),
  );
  const selected = selectContract(snapshot, "83102277000152-2-000626/2026");
  assert.equal(selected.ok, true);
  const diagnosis = diagnoseMargin(selected.record, snapshot);
  assert.equal(snapshot.schema, MARGIN_DEFENSE_SCHEMA);
  assert.ok(diagnosis.public_id.value);
  assert.equal(diagnosis.as_of.classification, "OFFICIAL");
  const families = Object.fromEntries(
    diagnosis.eventos_defesa_margem.map((e) => [e.family, e.classification]),
  );
  assert.equal(families.reajuste, "UNKNOWN");
  assert.equal(families.reequilibrio, "UNKNOWN");
  assert.equal(families.medicao, "UNKNOWN");
  pass("shipped_use_path", {
    public_id: diagnosis.public_id.value,
    unknown_count: diagnosis.unknown_count,
  });
}

// --- shipped lead persist + PII drop; synthetic ≠ pipeline ---
{
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-web-011-"));
  process.env.LEAD_STORE_DIR = storeDir;
  process.env.NODE_ENV = "test";
  delete process.env.NTFY_URL;
  delete process.env.NTFY_TOKEN;
  delete process.env.RESEND_API_KEY;
  delete process.env.OPS_WEBHOOK_URL;
  delete process.env.CONFENGE_INBOUND_WEBHOOK_URL;
  delete process.env.CONFENGE_INBOUND_WEBHOOK_SECRET;
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.LEAD_REQUIRE_TURNSTILE;

  const leadPath = path.join(root, "netlify/functions/lead.cjs");
  delete require.cache[require.resolve(leadPath)];
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/lead-core.cjs"))];
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/lead-store.cjs"))];
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/lead-delivery.cjs"))];
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/lead-rate-limit.cjs"))];
  const { handler, setStoreForTests } = require(leadPath);
  const { MemoryStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));
  const { _reset } = require(path.join(root, "netlify/functions/lib/lead-rate-limit.cjs"));
  const mem = new MemoryStore();
  setStoreForTests(mem);
  _reset();

  const payload = {
    nome: "SYNTHETIC-INBOUND",
    email: "qa-web-011@example.com",
    estagio: "synthetic probe — discard",
    jornada: "contrato",
    consentimento: "true",
    origem: "/ferramentas/diagnostico-defesa-margem/",
    landing_page: "/ferramentas/diagnostico-defesa-margem/",
    asset_id: "diagnostico-defesa-margem",
    route_family: "defesa-margem-diagnostico",
    public_contract_id: "83102277000152-2-000626/2026",
    public_id_slug: "md-8569b618",
    cta_id: "segunda-leitura-contrato",
    mensagem: "PII_MUST_NOT_LEAK",
    record_kind: "synthetic",
    test_mode: true,
    idempotency_key: "web-011-synth-001",
  };
  const created = await handler({
    httpMethod: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
      "user-agent": "confenge-web-011-test/1.0",
      "x-forwarded-for": "203.0.113.11",
    },
    body: JSON.stringify(payload),
  });
  const body = JSON.parse(created.body);
  assert.equal(created.statusCode, 201);
  assert.equal(body.ok, true);
  assert.ok(body.lead_id);
  assert.equal(blobHasPii(body), false);
  assert.ok(!JSON.stringify(body).includes("PII_MUST_NOT_LEAK"));
  assert.ok(!JSON.stringify(body).includes("qa-web-011@example.com"));
  assert.ok(!JSON.stringify(body).includes("SYNTHETIC-INBOUND"));
  const stored = await mem.get(body.lead_id);
  assert.equal(stored.source, "CONFENGE_WEB");
  assert.equal(stored.asset_id, "diagnostico-defesa-margem");

  const collect = require(path.join(root, "netlify/functions/collect.cjs"));
  const scrubbed = collect._scrubProps({
    asset_id: "diagnostico-defesa-margem",
    nome: "Alice",
    email: "alice@example.com",
    telefone: "48999999999",
    mensagem: "secreto",
    cnpj: "83102277000152",
  });
  for (const key of PII_KEYS) {
    assert.equal(scrubbed[key], undefined, `scrub leaked ${key}`);
  }

  const loop = classifyRealLoop({
    lead_id: body.lead_id,
    record_kind: stored.record_kind || "synthetic",
    email: payload.email,
    consented_real_contact: false,
    inbound_url_set: false,
    inbound_secret_set: false,
    ops_token_set: false,
    auto_send_off_evidenced: false,
  });
  assert.equal(loop.commercial_event, false);
  assert.equal(loop.qualified_lead, false);
  assert.equal(loop.qualified_pipeline, false);
  assert.equal(loop.status, "BLOCKED");
  assert.equal(loop.outcome, "UNKNOWN");
  assert.match(loop.next_command, /CONFENGE_INBOUND_WEBHOOK_URL=https:\/\/api\.confenge\.com\.br/);
  pass("synthetic_not_pipeline", { lead_id: body.lead_id, kind: stored.record_kind });
}

// --- decision table ---
{
  const blocked = classifyRealLoop({
    consented_real_contact: false,
    inbound_url_set: false,
    inbound_secret_set: false,
    ops_token_set: false,
    auto_send_off_evidenced: false,
  });
  assert.equal(decideLearning({}, blocked), "NEED_MORE_DATA");
  assert.equal(
    decideExit({ reduces_uncertainty: true, reduces_time_to_evidence: true }, blocked),
    "BLOCKED",
  );
  assert.equal(
    decideExit({ product_volume_only: true, reduces_uncertainty: false }, blocked),
    "NO_GO",
  );

  const won = classifyRealLoop({
    consented_real_contact: true,
    lead_id: "lead-real-1",
    record_kind: "real",
    outcome: "WON",
    human_route_action: "CALL",
    operator_or_warmbly_evidence: true,
    inbound_url_set: true,
    inbound_secret_set: true,
    ops_token_set: true,
    auto_send_off_evidenced: true,
    salvage: true,
    repeatable: true,
  });
  assert.equal(won.commercial_event, true);
  assert.equal(won.qualified_lead, true);
  assert.equal(decideLearning({ repeatable: true }, won), "REPEAT");
  assert.equal(decideExit({}, won), "READY");

  const changeFacts = {
    consented_real_contact: true,
    lead_id: "lead-real-2",
    record_kind: "real",
    outcome: "REJECTED",
    real_rejection: true,
    human_route_action: "MANUAL_OUTREACH",
    operator_or_warmbly_evidence: true,
    inbound_url_set: true,
    inbound_secret_set: true,
    ops_token_set: true,
    auto_send_off_evidenced: true,
    named_friction: "cta_requires_whatsapp_and_email",
    friction_requires_change: true,
    product_change_required: true,
    salvage: true,
  };
  const changed = classifyRealLoop(changeFacts);
  assert.equal(decideLearning(changeFacts, changed), "CHANGE");
  assert.equal(decideExit(changeFacts, changed), "ADJUST");

  const stopFacts = {
    consented_real_contact: true,
    lead_id: "lead-real-3",
    record_kind: "real",
    outcome: "REJECTED",
    real_rejection: true,
    human_route_action: "CALL",
    operator_or_warmbly_evidence: true,
    inbound_url_set: true,
    inbound_secret_set: true,
    ops_token_set: true,
    auto_send_off_evidenced: true,
    salvage: false,
  };
  assert.equal(decideLearning(stopFacts, classifyRealLoop(stopFacts)), "STOP");

  const pii = stripPii({
    nome: "Maria",
    email: "maria@example.com",
    telefone: "48999999999",
    mensagem: "segredo",
    cnpj: "83102277000152",
    lead_id: "abc",
    source: "CONFENGE_WEB",
  });
  for (const key of PII_KEYS) assert.equal(pii[key], undefined);
  assert.equal(pii.lead_id, "abc");
  assert.equal(pii.source, "CONFENGE_WEB");
  pass("decision_table", { tokens: LEARNING_TOKENS.join("|") });
}

// --- committed facts.v1 → review tokens ---
{
  const facts = JSON.parse(fs.readFileSync(factsPath, "utf8"));
  const review = buildReview(facts);
  const committed = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  assert.equal(review.learning, "NEED_MORE_DATA");
  assert.equal(review.exit, "BLOCKED");
  assert.equal(committed.learning, review.learning);
  assert.equal(committed.exit, review.exit);
  assert.deepEqual(committed.residual, review.residual);
  assert.ok(LEARNING_TOKENS.includes(review.learning));
  assert.ok(EXIT_TOKENS.includes(review.exit));
  assert.equal(review.real_loop.qualified_pipeline, false);
  assert.equal(review.real_loop.qualified_lead, false);
  assert.equal(review.real_loop.missing_prerequisites[0].prerequisite, "consented_real_contact");
  assert.equal(blobHasPii(review), false);
  assert.equal(review.next_command, NEXT_COMMAND);
  pass("committed_review", { learning: review.learning, exit: review.exit });
}

// --- CLI --facts --skip-live drives the same functions ---
{
  const tmp = path.join(os.tmpdir(), `web-011-review-${Date.now()}.json`);
  const ran = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts/money_asset/audit_commercial_dod.mjs"),
      "--facts",
      factsPath,
      "--skip-live",
      "--out",
      tmp,
    ],
    { encoding: "utf8" },
  );
  assert.equal(ran.status, 2, ran.stderr || ran.stdout);
  const cli = JSON.parse(fs.readFileSync(tmp, "utf8"));
  assert.equal(cli.review.learning, "NEED_MORE_DATA");
  assert.equal(cli.review.exit, "BLOCKED");
  assert.equal(cli.real_loop.prerequisite, "consented_real_contact");
  assert.equal(cli.review.real_loop.missing_prerequisites[0].prerequisite, "consented_real_contact");
  assert.match(cli.real_loop.next_command, /Do not invent a person/);
  assert.equal(blobHasPii(cli), false);
  pass("cli_facts_skip_live", { exit: cli.review.exit, status: ran.status });
}

console.log("MARGIN_DEFENSE_COMMERCIAL_DOD_OK");
