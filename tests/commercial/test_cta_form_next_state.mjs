/** Sitewide CTA/form next-state contract for issue #532. */

import assert from "node:assert/strict";
import fs from "node:fs";
import { buildInventory } from "../../scripts/commercial/cta_form_next_state_audit.mjs";

const report = buildInventory();

assert.equal(report.schema, "confenge.cta-form-next-state-inventory/1.0");
assert.equal(report.coverage.manual_route_allowlist, false);
assert.equal(report.coverage.active_capture_routes, 26);
assert.equal(report.coverage.declared_ctas, report.contract.expected_declared_ctas, `declared CTAs: ${report.coverage.declared_ctas}`);
assert.equal(report.coverage.problems.length, 0, JSON.stringify(report.coverage.problems));
assert.deepEqual(report.coverage.protected_routes_with_capture, []);

assert.equal(report.contract.schema, "confenge.cta-form-next-state/1.0");
assert.equal(report.contract.source, "CONFENGE_WEB");
assert.deepEqual(report.contract.analytics_pii_allowlist, []);
assert.equal(report.contract.executive_front, "Revenue, Conversion, Automation");
assert.ok(report.contract.time_to_evidence.length >= 24);
assert.ok(report.contract.leverage.includes("revenue"));
assert.ok(report.contract.leverage.includes("automation"));

const forms = report.surfaces.flatMap((surface) => surface.forms.map((form) => ({
  route: surface.route,
  ...form,
})));
assert.equal(forms.length, 26);
for (const form of forms) {
  assert.equal(form.form_contract, "next-state/v1", `${form.route}: form contract`);
  assert.ok(report.contract.allowed_stages.includes(form.stage), `${form.route}: ${form.stage}`);
  assert.ok(report.contract.allowed_commitments.includes(form.commitment), `${form.route}: ${form.commitment}`);
  assert.ok(form.profile, `${form.route}: profile`);
  assert.ok(form.current_label, `${form.route}: current label`);
  assert.doesNotMatch(form.current_label, /^(?:Enviar|Quero)\b/i, `${form.route}: generic submit`);
  assert.ok(form.useful_next_state.length >= 32, `${form.route}: useful next state`);
  assert.ok(form.actual_receipt.length >= 16, `${form.route}: actual receipt`);
  assert.ok(form.pre_form_value.length >= 32, `${form.route}: pre-form value`);
  assert.ok(form.field_purpose.visible_text.length >= 32, `${form.route}: field purpose`);
  assert.ok(form.field_purpose.required.length > 0, `${form.route}: required fields`);
  assert.ok(form.boundary.length >= 24, `${form.route}: boundary`);
  assert.match(form.boundary, /retenção.*730 dias/i, `${form.route}: retention`);
  assert.equal(form.privacy_link_visible, true, `${form.route}: privacy link`);
  assert.deepEqual(form.event_semantics, [
    "lead_form_start",
    "lead_form_submit",
    "lead_form_success",
    "lead_persisted",
  ], `${form.route}: events`);
  assert.ok(form.runtime_states.initial, `${form.route}: initial`);
  assert.ok(form.runtime_states.validation_error, `${form.route}: validation`);
  assert.ok(form.runtime_states.turnstile_error, `${form.route}: Turnstile`);
  assert.ok(form.runtime_states.loading, `${form.route}: loading`);
  assert.ok(form.runtime_states.error, `${form.route}: error`);
  assert.ok(form.runtime_states.success, `${form.route}: success`);
  assert.ok(form.runtime_states.receipt, `${form.route}: receipt`);
  assert.equal(form.turnstile_ready, true, `${form.route}: Turnstile ready`);
  assert.equal(form.receipt_required, true, `${form.route}: receipt/idempotency`);
  assert.equal(form.contact_constraints_ready, true, `${form.route}: #542 contact constraints`);
  assert.ok(["parallel_talk_path", "form_only"].includes(form.form_whatsapp_relationship), `${form.route}: WhatsApp relation`);
  if (form.runtime_profile === "shared_lead_form_v1") {
    assert.equal(form.shared_runtime_selectors_ready, true, `${form.route}: shared runtime selectors`);
    assert.equal(form.shared_runtime_journey_ready, true, `${form.route}: journey selector`);
  }
  if (form.runtime_profile === "adaptive_intake_standalone_v1") {
    assert.equal(form.standalone_runtime_ready, true, `${form.route}: standalone runtime`);
  }
}

const adaptivePage = fs.readFileSync("triagem-tecnica/index.html", "utf8");
const adaptiveRuntime = fs.readFileSync("assets/js/adaptive-intake.js", "utf8");
assert.match(adaptivePage, /data-next-state-profile=["']adaptive_triage["']/);
assert.match(adaptivePage, /data-runtime-profile=["']adaptive_intake_standalone_v1["']/);
assert.match(adaptivePage, /data-form-boundary/);
assert.match(adaptiveRuntime, /track\(["']lead_form_submit["']\)/);
assert.match(adaptiveRuntime, /track\(["']lead_form_start["']\)/);
assert.match(adaptiveRuntime, /track\(["']lead_form_success["']\)/);
assert.match(adaptiveRuntime, /track\(["']lead_persisted["']\)/);

const actions = report.surfaces.flatMap((surface) => surface.actions.map((action) => ({
  route: surface.route,
  ...action,
})));
assert.equal(actions.length, report.coverage.declared_ctas);
for (const action of actions) {
  assert.ok(report.contract.allowed_stages.includes(action.stage), `${action.route}: CTA stage`);
  assert.ok(report.contract.allowed_commitments.includes(action.commitment), `${action.route}: CTA commitment`);
  assert.ok(action.current_label, `${action.route}: CTA label`);
  assert.ok(action.useful_next_state.length >= 16, `${action.route}: CTA next state`);
  assert.ok(action.actual_receipt.length >= 12, `${action.route}: CTA receipt`);
  assert.equal(action.field_purpose, "not_applicable");
  assert.ok(action.boundary.length >= 20, `${action.route}: CTA boundary`);
  assert.ok(action.event_semantics.length > 0, `${action.route}: CTA events`);
  assert.doesNotMatch(
    action.current_label,
    /^(?:Analisar meu caso|Analisar este cenário|Análise inicial|Analisar meu contrato|Conversar pelo WhatsApp|Enviar pelo WhatsApp|Enviar dados pelo formulário|Falar com Tiago|Conheça nossas entregas)$/i,
    `${action.route}: generic CTA`,
  );
  if (action.event_semantics.includes("cta_view")) {
    assert.match(action.href, /#formulario-contato/, `${action.route}: cta_view only exists for home form arrival`);
  }
}

const diagnosticInline = fs.readFileSync("diagnostico-b2g-expansao/index.html", "utf8");
assert.match(diagnosticInline, /Idempotency-Key/);
assert.match(diagnosticInline, /cf-turnstile-response/);
assert.match(diagnosticInline, /turnstile_token/);
assert.match(diagnosticInline, /anti_abuse/);
assert.match(diagnosticInline, /sessionStorage\.removeItem/);
assert.match(diagnosticInline, /window\.confengeTrack/);
assert.match(diagnosticInline, /lead_form_start/);
assert.match(diagnosticInline, /lead_form_submit/);
assert.match(diagnosticInline, /lead_form_success/);
assert.match(diagnosticInline, /lead_persisted/);
assert.match(diagnosticInline, /Protocolo CONFENGE:/);
assert.match(diagnosticInline, /turnstile[^"']*(?:failed|error)|validação de segurança/i);

const radarInline = fs.readFileSync("comercial/radar-decisorio/index.html", "utf8");
assert.match(radarInline, /Idempotency-Key/);
assert.match(radarInline, /cf-turnstile-response/);
assert.match(radarInline, /turnstile_token/);
assert.match(radarInline, /anti_abuse/);
assert.match(radarInline, /sessionStorage\.removeItem/);
assert.match(radarInline, /window\.confengeTrack/);
assert.match(radarInline, /lead_form_start/);
assert.match(radarInline, /lead_form_submit/);
assert.match(radarInline, /lead_form_success/);
assert.match(radarInline, /lead_persisted/);
assert.match(radarInline, /validação de segurança/i);
assert.doesNotMatch(radarInline, />Registrar parâmetros e abrir o pagamento</);

const eight = JSON.parse(fs.readFileSync("data/commercial/page-contract-eight.v1.json", "utf8"));
for (const item of eight.deliverables) {
  const html = fs.readFileSync(item.file, "utf8");
  const actionAnchors = [...html.matchAll(/<a\b([^>]*\bdata-next-action-id=["'][^"']+["'][^>]*)>([\s\S]*?)<\/a>/gi)];
  assert.equal(actionAnchors.length, 5, `${item.route}: primary action census`);
  for (const anchor of actionAnchors) {
    const label = anchor[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const position = anchor[1].match(/\bdata-cta-position=["']([^"']+)["']/i)?.[1] || "";
    if (/<span\b/i.test(anchor[2]) || position === "report_header") {
      assert.match(label, /^Configurar pedido\b/i, `${item.route}: ${position}: ${label}`);
    }
    else assert.match(label, new RegExp(item.value_first.cta_configure, "i"), `${item.route}: ${label}`);
    assert.doesNotMatch(label, /^Quero\b/i, `${item.route}: generic desire label`);
    const href = anchor[1].match(/\bhref=["']([^"']+)["']/i)?.[1] || "";
    const aria = anchor[1].match(/\baria-label=["']([^"']+)["']/i)?.[1] || "";
    if (href.startsWith("/")) assert.doesNotMatch(aria, /WhatsApp/i, `${item.route}: internal action aria`);
  }
  const phone = html.match(/<input\b(?=[^>]*\bname=["']telefone["'])[^>]*>/i)?.[0] || "";
  assert.match(phone, /\bstyle=["'][^"']*min-height:\s*44px/i, `${item.route}: WhatsApp touch target`);
}

const homePhone = fs.readFileSync("index.html", "utf8").match(/<input\b(?=[^>]*\bname=["']telefone["'])[^>]*>/i)?.[0] || "";
assert.doesNotMatch(homePhone, /\bstyle=["'][^"']*min-height:/i, "home must use existing CSS without inline payload");

const radarForm = report.surfaces.find((surface) => surface.route === "/comercial/radar-decisorio/")?.forms[0];
assert.ok(radarForm.field_purpose.required.includes("radar_segmentos"));
assert.ok(radarForm.field_purpose.required.includes("radar_cidade_base_when_city_base"));
assert.ok(radarForm.field_purpose.required.includes("radar_raio_km_when_city_base"));
assert.ok(!radarForm.field_purpose.optional.includes("radar_segmentos"));

for (const file of [
  "acompanhamento-contratos-obras/index.html",
  "atrasos-prorrogacao-obras-publicas/index.html",
  "defesa-tecnica-contratos-publicos/index.html",
]) {
  assert.doesNotMatch(fs.readFileSync(file, "utf8"), />\s*Enviar dados para análise\s*</i, `${file}: hero CTA`);
}
assert.doesNotMatch(fs.readFileSync("diretoria-b2g/index.html", "utf8"), />\s*Falar sobre minha operação\s*</i);
const homeMain = fs.readFileSync("index.html", "utf8").match(/<main\b[\s\S]*?<\/main>/i)?.[0] || "";
assert.doesNotMatch(homeMain, />\s*Analisar meu caso\s*(?:<svg[\s\S]*?)?<\/a>/i);

const liveProbe = fs.readFileSync("scripts/site/inbound_capture_surface_probe.mjs", "utf8");
assert.match(liveProbe, /lead_endpoint_bound:[^\n]*\/api\/web\/lead/);
const evidenceHarness = fs.readFileSync("scripts/site/capture_issue_532_form_states.mjs", "utf8");
assert.match(evidenceHarness, /error:\s*["']anti_abuse["']/);

const recordedInventory = JSON.parse(fs.readFileSync("docs/commercial/cta-form-next-state-inventory.json", "utf8"));
assert.deepEqual(recordedInventory, report, "recorded CTA/form inventory must match the derived worktree census");

const evidenceRoot = "docs/uiux-evidence/issue-532-cta-form-next-state";
const evidence = JSON.parse(fs.readFileSync(`${evidenceRoot}/manifest.json`, "utf8"));
assert.equal(evidence.schema, "confenge.issue-532-form-state-evidence/1.0");
assert.equal(evidence.synthetic_pii_only, true);
assert.deepEqual(evidence.routes, ["/", "/servicos-obras-publicas/"]);
assert.deepEqual(evidence.states, ["initial", "validation-error", "turnstile-error", "submit-loading", "success-receipt"]);
assert.deepEqual(evidence.viewports, [{ width: 390, height: 844 }, { width: 1366, height: 768 }]);
assert.equal(evidence.captures.length, 20);
for (const capture of evidence.captures) {
  const image = fs.readFileSync(`${evidenceRoot}/${capture.file}`);
  assert.ok(image.length > 10_000, `${capture.file}: material screenshot`);
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${capture.file}: PNG signature`);
}

console.log(`cta-form-next-state: derived_routes=${report.coverage.active_capture_routes} forms=${forms.length}`);
