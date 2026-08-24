/**
 * Radar Decisório de Licitações AEC (R$ 599) - purchase parameters at the
 * moment of purchase (issue #266).
 *
 * Drives the shipped modules and the shipped HTML. Not a reimplementation.
 *
 * Proves:
 *  - required fields are refused server-side, not only in the browser;
 *  - the record is correlatable to the payment through
 *    `cfg:{offer_id}:{correlation_id}` in Asaas `externalReference`;
 *  - a persistence failure BLOCKS progression to payment (fail-closed);
 *  - no personal datum reaches analytics or the public response;
 *  - the public copy states the 48 business-hour clock and refuses to promise
 *    a number of opportunities, before payment.
 */
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

process.env.NODE_ENV = "test";
process.env.LEAD_ALLOW_MEMORY_FALLBACK = "1";
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.LEAD_REQUIRE_TURNSTILE;

function pass(name) {
  console.log("PASS", name);
}
function fail(name, detail) {
  console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
  process.exitCode = 1;
  throw new Error(`FAIL: ${name}`);
}
function assert(name, cond, detail) {
  if (cond) pass(name);
  else fail(name, detail);
}

const radar = require(path.join(root, "netlify/functions/lib/radar-params.cjs"));
const policy = require(path.join(root, "scripts/offers/external-reference.cjs"));
const leadCore = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));

const PAGE_ROUTE = "comercial/radar-decisorio/index.html";
const page = fs.readFileSync(path.join(root, PAGE_ROUTE), "utf8");
const modelPage = fs.readFileSync(
  path.join(root, "casos/modelo-relatorio-inteligencia-licitacoes/index.html"),
  "utf8",
);
const publicRadarPage = fs.readFileSync(
  path.join(root, "radar/nacional-obras-publicas/index.html"),
  "utf8",
);

const VALID_PARAMS = {
  cnpj: "11222333000181",
  radar_recorte: "cidade_base",
  radar_uf: "SC",
  radar_cidade_base: "Florianópolis",
  radar_raio_km: "200",
  radar_segmentos: ["edificacoes-publicas", "pavimentacao-infraestrutura-viaria"],
  radar_acervo_tecnico:
    "Reforma de escola municipal com CAT, 1.800 m2, 2024, prefeitura de Palhoça.",
  radar_email_entrega: "financeiro@construtora-exemplo.com.br",
};

const BASE_LEAD = {
  nome: "Ana Souza",
  estagio: radar.RADAR_ESTAGIO,
  jornada: "edital",
  consentimento: true,
  offer_id: radar.RADAR_OFFER_ID,
  ...VALID_PARAMS,
};

/* ------------------------------------------------------------------ */
/* 1. externalReference policy: cfg:{offer_id}:{correlation_id}        */
/* ------------------------------------------------------------------ */

{
  const correlationId = radar.correlationIdFor("idk:radar-1");
  const built = policy.buildExternalReference(radar.RADAR_OFFER_ID, correlationId);
  assert("external_reference_built", built.ok, built);
  assert(
    "external_reference_three_segments",
    built.external_reference === `cfg:${radar.RADAR_OFFER_ID}:${correlationId}`,
    built.external_reference,
  );
  const parsed = policy.parseExternalReference(built.external_reference);
  assert(
    "external_reference_round_trip",
    parsed.ok && parsed.offer_id === radar.RADAR_OFFER_ID && parsed.correlation_id === correlationId,
    parsed,
  );
  assert(
    "external_reference_never_empty",
    !policy.isPolicyCompliant("") && !policy.isPolicyCompliant(null),
    "empty reference must be refused",
  );
  assert(
    "external_reference_two_segments_refused",
    !policy.isPolicyCompliant("cfg:abc123"),
    "the legacy two-segment shape cannot be reconciled to an offer",
  );
  assert(
    "external_reference_builder_rejects_overlong_offer",
    !policy.buildExternalReference("a".repeat(121), correlationId).ok,
    "an overlong offer id must fail instead of being silently truncated",
  );
  assert(
    "external_reference_builder_rejects_overlong_correlation",
    !policy.buildExternalReference(radar.RADAR_OFFER_ID, "b".repeat(61)).ok,
    "an overlong correlation id must fail instead of being silently truncated",
  );
  assert(
    "external_reference_parser_rejects_overlong_input",
    !policy.parseExternalReference(`cfg:${"a".repeat(120)}:${"b".repeat(61)}`).ok,
    "the parser must not accept a truncated prefix of an overlong reference",
  );
  assert(
    "correlation_id_deterministic",
    radar.correlationIdFor("idk:radar-1") === correlationId
      && radar.correlationIdFor("idk:radar-2") !== correlationId,
    "same idempotency key must converge, different keys must not collide",
  );
}

/* ------------------------------------------------------------------ */
/* 1a. Automatic idempotency includes the complete order              */
/* ------------------------------------------------------------------ */

{
  const realNow = Date.now;
  Date.now = () => Date.UTC(2026, 7, 24, 3, 0, 0);
  const first = leadCore.validateAndNormalize({ ...BASE_LEAD });
  const reordered = leadCore.validateAndNormalize({
    ...BASE_LEAD,
    radar_segmentos: [...VALID_PARAMS.radar_segmentos].reverse(),
  });
  const changed = leadCore.validateAndNormalize({
    ...BASE_LEAD,
    radar_raio_km: "250",
  });
  assert(
    "auto_idempotency_same_order_is_stable",
    first.ok && leadCore.idempotencyKeyFor(first.lead) === leadCore.idempotencyKeyFor(first.lead),
    "a retry of the same normalized order must converge",
  );
  assert(
    "auto_idempotency_ignores_segment_order",
    reordered.ok
      && leadCore.idempotencyKeyFor(first.lead) === leadCore.idempotencyKeyFor(reordered.lead),
    "checkbox order is not order identity",
  );
  assert(
    "auto_idempotency_changes_with_order_parameters",
    changed.ok
      && leadCore.idempotencyKeyFor(first.lead) !== leadCore.idempotencyKeyFor(changed.lead),
    "a changed purchase configuration must persist as a distinct order",
  );
  assert(
    "explicit_idempotency_remains_authoritative",
    leadCore.idempotencyKeyFor(first.lead, "radar-explicit")
      === leadCore.idempotencyKeyFor(changed.lead, "radar-explicit"),
    "an explicit retry key intentionally identifies the same request",
  );
  Date.now = realNow;
}

/* ------------------------------------------------------------------ */
/* 2. Production provider now emits the policy shape                   */
/* ------------------------------------------------------------------ */

{
  const src = fs.readFileSync(
    path.join(root, "scripts/offers/providers/asaas-production.cjs"),
    "utf8",
  );
  assert(
    "production_uses_policy_module",
    src.includes('require("../external-reference.cjs")') && src.includes("buildExternalReference("),
    "production checkout must build externalReference through the policy module",
  );
  assert(
    "production_drops_two_segment_reference",
    !/const externalReference = `cfg:\$\{crypto/.test(src),
    "the two-segment digest reference must be gone",
  );
}

/* ------------------------------------------------------------------ */
/* 3. Server-side validation of the required fields                    */
/* ------------------------------------------------------------------ */

const NEGATIVES = [
  ["missing_cnpj", { cnpj: "" }, "radar_cnpj_invalid"],
  ["invalid_cnpj", { cnpj: "11111111111111" }, "radar_cnpj_invalid"],
  ["missing_recorte", { radar_recorte: "" }, "radar_recorte_invalid"],
  ["unknown_recorte", { radar_recorte: "continente" }, "radar_recorte_invalid"],
  ["missing_uf", { radar_uf: "" }, "radar_uf_invalid"],
  ["unknown_uf", { radar_uf: "XX" }, "radar_uf_invalid"],
  ["missing_city_on_city_cut", { radar_cidade_base: "" }, "radar_cidade_base_required"],
  ["missing_radius_on_city_cut", { radar_raio_km: "" }, "radar_raio_km_required"],
  ["radius_out_of_range", { radar_raio_km: "5" }, "radar_raio_km_out_of_range"],
  ["missing_segments", { radar_segmentos: [] }, "radar_segmentos_required"],
  ["segment_off_vocabulary", { radar_segmentos: ["pontes-metalicas"] }, "radar_segmento_unknown"],
  ["short_portfolio", { radar_acervo_tecnico: "obras" }, "radar_acervo_tecnico_required"],
  ["missing_delivery_email", { radar_email_entrega: "" }, "radar_email_entrega_invalid"],
  ["invalid_delivery_email", { radar_email_entrega: "nao-e-email" }, "radar_email_entrega_invalid"],
];

for (const [name, patch, expected] of NEGATIVES) {
  const result = leadCore.validateAndNormalize({ ...BASE_LEAD, ...patch });
  assert(
    `server_rejects_${name}`,
    result.ok === false && result.error === expected,
    { expected, got: result },
  );
}

{
  const ok = leadCore.validateAndNormalize({ ...BASE_LEAD });
  assert("server_accepts_complete_submission", ok.ok === true, ok);
  assert("normalized_params_present", Boolean(ok.lead && ok.lead.radar_params), ok.lead);
  assert(
    "normalized_offer_identity",
    ok.lead.radar_params.offer_id === radar.RADAR_OFFER_ID
      && ok.lead.radar_params.amount_cents === radar.RADAR_AMOUNT_CENTS,
    ok.lead.radar_params,
  );
  assert(
    "delivery_clock_starts_at_form_submit",
    ok.lead.radar_params.delivery_clock.business_hours === 48
      && ok.lead.radar_params.delivery_clock.starts_at === "form_submitted"
      && ok.lead.radar_params.delivery_clock.never_starts_at === "payment_confirmed",
    ok.lead.radar_params.delivery_clock,
  );
  assert(
    "opportunity_count_not_promised",
    ok.lead.radar_params.opportunity_count_promised === false
      && ok.lead.radar_params.opportunity_count_rule ===
        "published_availability_in_scope_at_search_time",
    ok.lead.radar_params,
  );

  const uf = leadCore.validateAndNormalize({
    ...BASE_LEAD,
    radar_recorte: "uf",
    radar_cidade_base: "",
    radar_raio_km: "",
  });
  assert("uf_cut_needs_no_radius", uf.ok === true && uf.lead.radar_params.raio_km === null, uf);

  const wrongOffer = leadCore.validateAndNormalize({
    ...BASE_LEAD,
    offer_id: "CFG-DIAG-EXP-v1",
  });
  assert(
    "radar_offer_mismatch_blocked",
    wrongOffer.ok === false && wrongOffer.error === "radar_offer_mismatch",
    wrongOffer,
  );

  const wrongPrice = leadCore.validateAndNormalize({ ...BASE_LEAD, amount_cents: 1 });
  assert(
    "radar_price_tamper_blocked",
    wrongPrice.ok === false && wrongPrice.error === "price_mismatch",
    wrongPrice,
  );
}

/* ------------------------------------------------------------------ */
/* 4. No PII in the analytics projection                               */
/* ------------------------------------------------------------------ */

{
  const validated = leadCore.validateAndNormalize({ ...BASE_LEAD });
  const shape = radar.analyticsShape(validated.lead.radar_params);
  const serialized = JSON.stringify(shape);
  for (const secret of [
    VALID_PARAMS.cnpj,
    VALID_PARAMS.radar_email_entrega,
    VALID_PARAMS.radar_acervo_tecnico,
    VALID_PARAMS.radar_cidade_base,
    BASE_LEAD.nome,
  ]) {
    if (serialized.includes(secret)) fail("analytics_shape_has_pii", secret);
  }
  pass("analytics_shape_has_no_pii");
  assert(
    "analytics_shape_keeps_measurable_dimensions",
    shape.recorte === "cidade_base" && shape.uf === "SC" && shape.raio_km === 200
      && shape.segmentos.length === 2 && shape.acervo_tecnico_len > 0,
    shape,
  );
}

/* ------------------------------------------------------------------ */
/* 5. End to end through the shipped lead function                     */
/* ------------------------------------------------------------------ */

function freshLeadFunction() {
  const leadPath = path.join(root, "netlify/functions/lead.cjs");
  delete require.cache[require.resolve(leadPath)];
  return require(leadPath);
}

function leadEvent(body) {
  return {
    httpMethod: "POST",
    headers: { "content-type": "application/json", origin: "https://confenge.com.br" },
    body: JSON.stringify(body),
  };
}

let happyPathReference = null;

{
  const leadFn = freshLeadFunction();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-radar-"));
  process.env.LEAD_STORE_DIR = dir;
  const res = await leadFn.handler(
    leadEvent({ ...BASE_LEAD, idempotency_key: "radar-e2e-1" }),
  );
  const body = JSON.parse(res.body || "{}");
  assert("e2e_persisted", res.statusCode === 201 && body.ok === true, { status: res.statusCode, body });
  assert("e2e_returns_correlation", Boolean(body.correlation_id), body);
  const parsed = policy.parseExternalReference(body.external_reference);
  assert(
    "e2e_external_reference_policy",
    parsed.ok && parsed.offer_id === radar.RADAR_OFFER_ID
      && parsed.correlation_id === body.correlation_id,
    body,
  );
  assert(
    "e2e_announces_48_business_hours",
    body.delivery_business_hours === 48 && body.delivery_clock_starts_at === "form_submitted",
    body,
  );
  happyPathReference = body.external_reference;

  const serialized = JSON.stringify(body);
  for (const secret of [
    VALID_PARAMS.cnpj,
    VALID_PARAMS.radar_email_entrega,
    VALID_PARAMS.radar_acervo_tecnico,
    BASE_LEAD.nome,
  ]) {
    if (serialized.includes(secret)) fail("public_response_has_pii", secret);
  }
  pass("public_response_has_no_pii");

  // Retry with the same idempotency key must reconcile to the same payment.
  const again = JSON.parse(
    (await leadFn.handler(leadEvent({ ...BASE_LEAD, idempotency_key: "radar-e2e-1" }))).body || "{}",
  );
  assert(
    "e2e_retry_same_correlation",
    again.ok === true && again.external_reference === happyPathReference,
    { first: happyPathReference, again },
  );

  // The durable record carries the parameters and the reference.
  const stored = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      } catch {
        return null;
      }
    })
    .filter((rec) => rec && rec.radar_params);
  assert(
    "record_carries_params_and_reference",
    stored.length >= 1 && stored[0].external_reference === happyPathReference
      && stored[0].radar_params.cnpj === VALID_PARAMS.cnpj
      && stored[0].radar_params.email_entrega === VALID_PARAMS.radar_email_entrega,
    stored[0] ? { external_reference: stored[0].external_reference } : stored,
  );
}

/* ------------------------------------------------------------------ */
/* 6. Fail-closed: a persistence failure blocks the payment step       */
/* ------------------------------------------------------------------ */

{
  const leadFn = freshLeadFunction();
  leadFn.setStoreForTests({
    async getByIdempotency() { return null; },
    async get() { return null; },
    async put() { throw new Error("store_down"); },
    async update() { return null; },
  });
  const res = await leadFn.handler(
    leadEvent({ ...BASE_LEAD, idempotency_key: "radar-store-down" }),
  );
  leadFn.setStoreForTests(null);
  const body = JSON.parse(res.body || "{}");
  assert("persist_failure_is_5xx", res.statusCode >= 500, { status: res.statusCode, body });
  assert("persist_failure_not_ok", body.ok !== true, body);
  assert(
    "persist_failure_emits_no_payment_correlation",
    !body.correlation_id && !body.external_reference,
    body,
  );
}

{
  // Store unavailable altogether: still no payment correlation.
  const leadFn = freshLeadFunction();
  leadFn.setStoreForTests(null);
  const previous = process.env.LEAD_STORE_DIR;
  process.env.LEAD_STORE_DIR = previous;
  const invalid = leadCore.validateAndNormalize({ ...BASE_LEAD, radar_acervo_tecnico: "x" });
  assert(
    "invalid_submission_never_reaches_persist",
    invalid.ok === false && invalid.error === "radar_acervo_tecnico_required",
    invalid,
  );
}

/* ------------------------------------------------------------------ */
/* 7. Shipped page contract                                            */
/* ------------------------------------------------------------------ */

{
  assert("page_is_noindex", /content="noindex,nofollow"\s+name="robots"/.test(page), "robots");
  assert("page_posts_to_lead", page.includes("/.netlify/functions/lead"), "lead endpoint");
  assert(
    "page_declares_radar_stage",
    page.includes(`value="${radar.RADAR_ESTAGIO}"`) && page.includes(`value="${radar.RADAR_OFFER_ID}"`),
    "stage/offer hidden fields",
  );

  for (const field of [
    'name="cnpj"',
    'name="radar_recorte"',
    'name="radar_uf"',
    'name="radar_cidade_base"',
    'name="radar_raio_km"',
    'name="radar_segmentos"',
    'name="radar_acervo_tecnico"',
    'name="radar_email_entrega"',
    'name="consentimento"',
  ]) {
    if (!page.includes(field)) fail("page_missing_field", field);
  }
  pass("page_collects_every_required_field");

  for (const segment of radar.SEGMENT_IDS) {
    if (!page.includes(`value="${segment}"`)) fail("page_missing_segment", segment);
  }
  pass("page_uses_published_segment_vocabulary");

  assert("page_states_48_business_hours", page.includes("48 horas úteis"), "48h copy");
  assert(
    "page_states_clock_starts_at_form",
    page.includes("começa no envio deste formulário"),
    "clock origin copy",
  );
  assert(
    "page_refuses_to_promise_a_count",
    page.includes("Não é prometida") && page.includes("editais vigentes compatíveis"),
    "no-quantity-promise copy",
  );

  const paymentSection = page.slice(page.indexOf("data-radar-payment-step"));
  assert(
    "payment_step_ships_hidden",
    /<section[^>]*\shidden\s+data-radar-payment-step/.test(page),
    "the payment step must be hidden in the served HTML",
  );
  assert(
    "payment_step_opens_only_from_server_reference",
    page.includes("payload.external_reference")
      && page.includes("if (!payload.ok || !payload.external_reference)")
      && page.includes("externalReferenceShape.test(String(externalReference))"),
    "the browser must not open the payment step without a persisted reference",
  );
  assert(
    "payment_step_shows_the_reference",
    paymentSection.includes("data-radar-reference"),
    "reference placeholder",
  );
  assert(
    "payment_handoff_carries_the_server_reference",
    page.includes('paymentUrl.searchParams.set("text"')
      && page.includes('"\\nReferência do pedido: " + externalReference'),
    "the commercial handoff must carry the exact persisted order reference",
  );
  assert("page_has_no_em_dash", !page.includes("—"), "em dash");
  assert(
    "page_carries_no_asaas_url",
    !/asaas\.com|2inumo70747k90a2/i.test(page),
    "no provider URL or payment link id may be hardcoded in public HTML",
  );
  const purchaseCtas = modelPage.match(
    /data-cta-id="report-599-[^"]+"[^>]+href="\/comercial\/radar-decisorio\/"/g,
  ) || [];
  assert(
    "all_priced_model_ctas_enter_fail_closed_form",
    purchaseCtas.length === 5,
    `expected 5 purchase CTAs to enter the parameter form, found ${purchaseCtas.length}`,
  );
  assert(
    "public_radar_has_terminal_order_action",
    publicRadarPage.includes('href="/comercial/radar-decisorio/"')
      && publicRadarPage.includes('data-next-action-id="contratar_relatorio_inteligencia_599"'),
    "the public Radar must expose a normalized terminal action into the order flow",
  );
}

/* ------------------------------------------------------------------ */
/* 8. No personal datum from the form may enter git                    */
/* ------------------------------------------------------------------ */

{
  const tracked = [
    "comercial/radar-decisorio/index.html",
    "netlify/functions/lib/radar-params.cjs",
    "scripts/offers/external-reference.cjs",
    "netlify/functions/lead.cjs",
    PAGE_ROUTE,
  ];
  const forbidden = [/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/, /[\w.+-]+@(?!confenge\.com\.br)[\w-]+\.[\w.]+/];
  for (const rel of tracked) {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      // The provider CNPJ of CONFENGE itself is public identity, not lead PII,
      // and an all-zero input mask is a placeholder, not a company.
      if (line.includes("52.407.089/0001-09")) continue;
      if (line.includes("00.000.000/0000-00")) continue;
      for (const rule of forbidden) {
        if (rule.test(line)) {
          fail("pii_in_git", `${rel}:${i + 1}`);
        }
      }
    }
  }
  pass("no_lead_pii_in_shipped_sources");
}

if (process.exitCode) process.exit(1);
console.log("radar_decisorio_params passed");
