/**
 * Gate fail-closed do registro de prova real (issue #328, sob o contrato de consentimento #249).
 *
 * O teste e autossuficiente: le o proprio JSON com fs, varre o HTML publicado do
 * repositorio e so cruza com artefatos que ja existem em main.
 *
 * Ele prova seis pontos:
 *
 *   A. o registro e o HTML publicado contam a mesma historia: zero prova
 *      publicada com o estado zero renderizado, ou N provas validas cada uma
 *      renderizada na superficie que o registro declara;
 *   B. a funcao que valida uma entrada e exercitada por fixtures sinteticas,
 *      dentro do proprio teste, sem colocar dado falso no arquivo do registro;
 *   C. nenhuma pagina publica carrega Review, AggregateRating ou microdata de nota;
 *   D. os exemplos sinteticos continuam rotulados e nao se misturam a prova real,
 *      e o gate reprova se um rotulo sintetico for removido;
 *   E. a auditoria declarada e a varredura real do disco concordam;
 *   F. o gate aceita zero prova valida, aceita N provas validas e reprova prova
 *      vencida ou sem autorizacao. Os tres estados sao testados aqui.
 *
 * O gate nao congela o zero: ele congela a coerencia entre registro e HTML.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { consumerSuitesForPath } from "../../scripts/site/affected_graph.mjs";
import {
  DEMONSTRATIVE_LABEL,
  REQUIRED_EVIDENCE_FIELDS,
  SYNTHETIC_LABEL,
  evaluateProofGate as shippedEvaluateProofGate,
  labelIntegrityProblems,
  surfaceToRelPath,
  validateEntry as shippedValidateEntry,
  validateRegistryShape as shippedValidateRegistryShape,
} from "../../scripts/commercial/real_proof_registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const NAME = "real-proof-registry";
const DATA_PATH = path.join(root, "data/commercial/real-proof-registry.v1.json");
const SELF_PATH = path.join(__dirname, "test_real_proof_registry.mjs");

const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail });
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
}
function assert(name, cond, detail) {
  if (cond) pass(name, detail);
  else fail(name, detail);
}
function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`${NAME}: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.error(`${NAME}: ${failed.length} check(s) failed`);
    process.exit(1);
  }
  process.exit(0);
}

assert("data_file_exists", fs.existsSync(DATA_PATH), DATA_PATH);
if (!fs.existsSync(DATA_PATH)) finish();
const raw = fs.readFileSync(DATA_PATH, "utf8");
let data = null;
try {
  data = JSON.parse(raw);
  pass("data_file_parses");
} catch (err) {
  fail("data_file_parses", String(err));
  finish();
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const filled = (v) => typeof v === "string" && v.trim().length > 0;
const filledList = (v, min) => Array.isArray(v) && v.length >= min && v.every(filled);

function filledDeep(v) {
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "boolean") return v === true;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.length > 0 && v.every(filledDeep);
  if (v && typeof v === "object") {
    const vals = Object.values(v);
    return vals.length > 0 && vals.every(filledDeep);
  }
  return false;
}

function walkStrings(node, at, out) {
  if (typeof node === "string") {
    out.push({ at, value: node });
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child, i) => walkStrings(child, `${at}[${i}]`, out));
    return out;
  }
  if (node && typeof node === "object") {
    for (const [key, child] of Object.entries(node)) walkStrings(child, `${at}.${key}`, out);
  }
  return out;
}
const allStrings = walkStrings(data, "$", []);

function walkKeys(node, out) {
  if (Array.isArray(node)) {
    node.forEach((child) => walkKeys(child, out));
    return out;
  }
  if (node && typeof node === "object") {
    for (const [key, child] of Object.entries(node)) {
      out.push(key);
      walkKeys(child, out);
    }
  }
  return out;
}
const allKeys = walkKeys(data, []);

/* ------------------------------------------------------------------ */
/* 1. identidade e estado do contrato                                  */
/* ------------------------------------------------------------------ */

assert("schema_is_real_proof_registry_1_0", data.schema === "confenge.real-proof-registry/1.0", data.schema);
assert("registry_version_frozen", data.registry_version === "CFG-REAL-PROOF-2026-08-24-v1", data.registry_version);
assert("issue_is_328", data.issue === "#328", data.issue);
assert(
  "state_is_an_allowed_registry_state",
  (data.gate?.allowed_registry_states ?? []).includes(data.state),
  data.state,
);
assert("consent_contract_is_249", data.consent_contract === "#249", data.consent_contract);
assert("entries_is_array", Array.isArray(data.entries), typeof data.entries);
assert(
  "entries_empty_only_while_state_requires_it",
  !(data.gate?.entries_must_be_empty_while_state_is ?? []).includes(data.state) ||
    (Array.isArray(data.entries) && data.entries.length === 0),
  [data.state, (data.entries ?? []).length],
);
assert(
  "blocked_state_listed_as_entries_must_be_empty",
  Array.isArray(data.gate?.entries_must_be_empty_while_state_is) &&
    data.gate.entries_must_be_empty_while_state_is.includes("BLOCKED_EXTERNAL"),
  data.gate?.entries_must_be_empty_while_state_is,
);
assert("gate_declares_itself_fail_closed", data.gate?.fail_closed === true, data.gate?.fail_closed);
assert("gate_id_matches_npm_script", data.gate?.id === "test:real-proof-registry", data.gate?.id);
assert("gate_command_matches_npm_script", data.gate?.command === "npm run test:real-proof-registry", data.gate?.command);
assert("gate_purpose_filled", filled(data.gate?.purpose_pt_br), data.gate?.purpose_pt_br);
assert("gate_blocked_state_rule_filled", filled(data.gate?.blocked_state_rule_pt_br), data.gate?.blocked_state_rule_pt_br);
assert("gate_declares_zero_state_rule", filled(data.gate?.honest_states_pt_br?.zero), data.gate?.honest_states_pt_br?.zero);
assert("gate_declares_many_state_rule", filled(data.gate?.honest_states_pt_br?.many), data.gate?.honest_states_pt_br?.many);
assert("gate_declares_invalid_state_rule", filled(data.gate?.honest_states_pt_br?.invalid), data.gate?.honest_states_pt_br?.invalid);
assert("gate_declares_rendered_state_surface", data.gate?.rendered_state_surface === "casos/index.html", data.gate?.rendered_state_surface);
assert("gate_declares_rendered_state_attribute", data.gate?.rendered_state_attribute === "data-proof-state", data.gate?.rendered_state_attribute);
assert(
  "gate_declares_rendered_state_values",
  JSON.stringify(data.gate?.rendered_state_values) === JSON.stringify(["none", "published"]),
  data.gate?.rendered_state_values,
);
assert("gate_declares_it_is_not_a_freeze", filled(data.gate?.not_a_freeze_pt_br), data.gate?.not_a_freeze_pt_br);

/* nenhuma chave de PII de cliente ou de prova social entra no registro, em
   qualquer estado: a autorizacao e o material vivem em armazenamento privado */
for (const forbidden of ["client_name", "cliente", "logo", "depoimento", "testimonial", "rating", "nota_do_cliente"]) {
  assert(`registry_has_no_key_${forbidden}`, !allKeys.includes(forbidden), forbidden);
}

/* ------------------------------------------------------------------ */
/* 2. os seis campos de consentimento, verbatim                        */
/* ------------------------------------------------------------------ */

const CONSENT_FIELDS = [
  "autorizacao_explicita_do_titular",
  "escopo_de_identificacao_e_reproducao",
  "aprovador_humano_nomeado",
  "evidencia_de_que_a_entrega_ocorreu",
  "fatos_afirmaveis_com_fonte",
  "regras_de_retencao_revisao_e_revogacao",
];
assert(
  "required_consent_fields_exact_six",
  JSON.stringify(data.required_consent_fields) === JSON.stringify(CONSENT_FIELDS),
  data.required_consent_fields,
);
for (const f of CONSENT_FIELDS) {
  assert(`consent_field_present_${f}`, (data.required_consent_fields ?? []).includes(f), f);
}
assert(
  "entry_schema_points_at_the_six_consent_fields",
  data.entry_schema?.required_consent_field_reference === "required_consent_fields",
  data.entry_schema?.required_consent_field_reference,
);

/* ------------------------------------------------------------------ */
/* 3. schema de entrada declarado                                      */
/* ------------------------------------------------------------------ */

const schema = data.entry_schema ?? {};
const CONSENT_SHAPES = {
  autorizacao_explicita_do_titular: "non_empty_string",
  escopo_de_identificacao_e_reproducao: "non_empty_string",
  aprovador_humano_nomeado: "non_empty_string",
  evidencia_de_que_a_entrega_ocorreu: "non_empty_string",
  fatos_afirmaveis_com_fonte: "non_empty_string_list",
  regras_de_retencao_revisao_e_revogacao: "non_empty_string",
};
const REQUIRED_ENTRY_FIELDS = [
  "entry_id",
  "state",
  "delivery_reference",
  "consent",
  "final_approval",
  "verifiable_evidence",
  "claims",
  "evidence",
  "distribution",
  "revocation",
];
assert(
  "entry_schema_required_fields_exact",
  JSON.stringify(schema.required_entry_fields) === JSON.stringify(REQUIRED_ENTRY_FIELDS),
  schema.required_entry_fields,
);
for (const f of REQUIRED_ENTRY_FIELDS) {
  assert(`entry_schema_requires_${f}`, (schema.required_entry_fields ?? []).includes(f), f);
}
assert(
  "consent_field_shapes_exact",
  JSON.stringify(schema.required_consent_field_shapes) === JSON.stringify(CONSENT_SHAPES),
  schema.required_consent_field_shapes,
);
assert(
  "entry_states_declared",
  JSON.stringify(schema.allowed_entry_states) ===
    JSON.stringify(["DRAFT", "PENDING_CLIENT_APPROVAL", "APPROVED", "PUBLISHED", "REVOKED"]),
  schema.allowed_entry_states,
);
assert(
  "final_approval_fields_declared",
  JSON.stringify(schema.required_final_approval_fields) ===
    JSON.stringify(["approver_name", "approver_role", "approved_at", "binding_kind", "binding_value"]),
  schema.required_final_approval_fields,
);
assert(
  "final_approval_binding_is_hash_or_version",
  JSON.stringify(schema.allowed_final_approval_binding_kinds) === JSON.stringify(["material_hash", "material_version"]),
  schema.allowed_final_approval_binding_kinds,
);
assert(
  "verifiable_evidence_fields_declared",
  JSON.stringify(schema.required_verifiable_evidence_fields) ===
    JSON.stringify(["kind", "reference", "within_authorized_scope"]),
  schema.required_verifiable_evidence_fields,
);
assert(
  "verifiable_evidence_kinds_declared",
  JSON.stringify(schema.allowed_verifiable_evidence_kinds) === JSON.stringify(["trecho", "captura_redigida", "checksum"]),
  schema.allowed_verifiable_evidence_kinds,
);
assert(
  "claim_fields_declared",
  JSON.stringify(schema.required_claim_fields) === JSON.stringify(["statement_pt_br", "evidence_grade", "source_pt_br"]),
  schema.required_claim_fields,
);
assert(
  "evidence_fields_declared",
  JSON.stringify(schema.required_evidence_fields) === JSON.stringify(REQUIRED_EVIDENCE_FIELDS),
  schema.required_evidence_fields,
);
for (const f of REQUIRED_EVIDENCE_FIELDS) {
  assert(`entry_schema_requires_evidence_${f}`, (schema.required_evidence_fields ?? []).includes(f), f);
}
assert(
  "evidence_fail_closed_codes_declared",
  JSON.stringify(schema.evidence_fail_closed) === JSON.stringify([
    "authorization_absent",
    "authorization_expired",
    "fonte_absent",
  ]),
  schema.evidence_fail_closed,
);
assert("calculation_method_field_declared", schema.calculation_method_field === "calculation_pt_br", schema.calculation_method_field);
assert(
  "revocation_fields_declared",
  JSON.stringify(schema.required_revocation_fields) === JSON.stringify(["channel", "removes"]),
  schema.required_revocation_fields,
);
const REVOCATION_TARGETS = ["conteudo_visivel", "schema", "cache", "sitemap", "referencias_internas"];
assert(
  "revocation_targets_declared",
  JSON.stringify(schema.revocation_must_remove) === JSON.stringify(REVOCATION_TARGETS),
  schema.revocation_must_remove,
);
for (const t of REVOCATION_TARGETS) {
  assert(`revocation_removes_${t}`, (schema.revocation_must_remove ?? []).includes(t), t);
}
assert("one_canary_maximum_declared", schema.max_published_entries === 1, schema.max_published_entries);
assert("entry_schema_rule_filled", filled(schema.rule_pt_br), schema.rule_pt_br);

/* ------------------------------------------------------------------ */
/* 4. vocabulario de evidencia e funil de medicao                      */
/* ------------------------------------------------------------------ */

const GRADES = ["FACT", "CALCULATION", "INFERENCE", "UNKNOWN"];
assert(
  "evidence_grades_exact",
  JSON.stringify(data.evidence_vocabulary?.grades) === JSON.stringify(GRADES),
  data.evidence_vocabulary?.grades,
);
for (const g of GRADES) {
  assert(`evidence_grade_declared_${g}`, (data.evidence_vocabulary?.grades ?? []).includes(g), g);
  assert(`evidence_grade_defined_${g}`, filled(data.evidence_vocabulary?.definitions_pt_br?.[g]), g);
}
assert(
  "unverifiable_result_is_unknown",
  data.evidence_vocabulary?.unverifiable_result_grade === "UNKNOWN",
  data.evidence_vocabulary?.unverifiable_result_grade,
);
assert("evidence_vocabulary_rule_filled", filled(data.evidence_vocabulary?.rule_pt_br), data.evidence_vocabulary?.rule_pt_br);
const normalizedEvidenceRule = String(data.evidence_vocabulary?.rule_pt_br ?? "")
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .toLowerCase();
for (const word of ["melhoria", "economia", "receita", "recupera", "vitoria", "satisfa"]) {
  assert(
    `evidence_rule_mentions_${word}`,
    normalizedEvidenceRule.includes(word),
    word,
  );
}

const funnel = data.measurement_funnel ?? {};
assert("funnel_state_not_started", funnel.state === "NOT_STARTED", funnel.state);
assert(
  "funnel_steps_exact",
  JSON.stringify(funnel.steps) === JSON.stringify(["view", "proof engagement", "qualified action"]),
  funnel.steps,
);
for (const step of ["view", "proof engagement", "qualified action"]) {
  assert(`funnel_step_declared_${step.replace(/\s/g, "_")}`, (funnel.steps ?? []).includes(step), step);
}
assert("funnel_observed_is_object", funnel.observed !== null && typeof funnel.observed === "object", typeof funnel.observed);
for (const key of ["view", "proof_engagement", "qualified_action"]) {
  assert(`funnel_observed_${key}_declared`, funnel.observed !== null && key in (funnel.observed ?? {}), key);
  assert(`funnel_observed_${key}_is_null`, (funnel.observed ?? {})[key] === null, (funnel.observed ?? {})[key]);
}
assert(
  "no_fabricated_engagement_number",
  Object.values(funnel.observed ?? {}).every((v) => v === null),
  funnel.observed,
);
assert("funnel_rule_filled", filled(funnel.rule_pt_br), funnel.rule_pt_br);
assert("funnel_pii_rule_filled", filled(funnel.pii_rule_pt_br), funnel.pii_rule_pt_br);
assert(
  "funnel_pii_rule_forbids_pii",
  /pessoal identific/i.test(String(funnel.pii_rule_pt_br ?? "")),
  funnel.pii_rule_pt_br,
);

/* ------------------------------------------------------------------ */
/* 5. kill rules e publication rules, verbatim                         */
/* ------------------------------------------------------------------ */

const PUBLICATION_RULES = [
  "publicar no máximo um canário; sem carrossel de logos, sem rating agregado, sem multiplicação de cases",
  "exemplos sintéticos permanecem rotulados e não se misturam visualmente à prova real",
  "resultado não verificável é declarado UNKNOWN, nunca preenchido com copy",
  "revogação retira conteúdo visível, schema, cache, sitemap e referências internas",
];
const KILL_RULES = [
  "sem consentimento: não publicar",
  "consentimento ambíguo: não publicar",
  "prova fraca ou sem diferença material: manter privada e não criar um segundo caso para compensar volume",
];
assert(
  "publication_rules_verbatim",
  JSON.stringify(data.publication_rules) === JSON.stringify(PUBLICATION_RULES),
  data.publication_rules,
);
for (const rule of PUBLICATION_RULES) {
  assert(`publication_rule_present_${PUBLICATION_RULES.indexOf(rule)}`, (data.publication_rules ?? []).includes(rule), rule);
}
assert("kill_rules_verbatim", JSON.stringify(data.kill_rules) === JSON.stringify(KILL_RULES), data.kill_rules);
for (const rule of KILL_RULES) {
  assert(`kill_rule_present_${KILL_RULES.indexOf(rule)}`, (data.kill_rules ?? []).includes(rule), rule);
}
const rulesBlob = [...PUBLICATION_RULES, ...KILL_RULES].join(" · ");
for (const needle of [
  "no máximo um canário",
  "sem carrossel de logos",
  "sem rating agregado",
  "sem multiplicação de cases",
  "UNKNOWN, nunca preenchido com copy",
  "revogação retira conteúdo visível",
  "sitemap",
  "referências internas",
  "sem consentimento: não publicar",
  "consentimento ambíguo: não publicar",
]) {
  assert(`rules_still_state_${needle.slice(0, 28).replace(/[^a-zA-Z]+/g, "_")}`, rulesBlob.includes(needle), needle);
}
assert(
  "forbidden_schema_types_verbatim",
  JSON.stringify(data.forbidden_schema_types_on_public_pages) === JSON.stringify(["Review", "AggregateRating"]),
  data.forbidden_schema_types_on_public_pages,
);

/* ------------------------------------------------------------------ */
/* 6. requisitos de desbloqueio                                        */
/* ------------------------------------------------------------------ */

assert(
  "unblock_requirements_has_seven_items",
  filledList(data.unblock_requirements_pt_br, 7) && data.unblock_requirements_pt_br.length === 7,
  data.unblock_requirements_pt_br?.length,
);
for (const needle of [
  "autorização explícita do titular",
  "escopo do que pode ser identificado",
  "aprovador humano nomeado",
  "evidência de que a entrega ocorreu",
  "fatos e resultados que podem ser afirmados, com fonte",
  "regras de retenção, revisão e revogação",
  "vinculada por hash ou versão",
]) {
  assert(
    `unblock_requirement_states_${needle.slice(0, 24).replace(/[^a-zA-Z]+/g, "_")}`,
    (data.unblock_requirements_pt_br ?? []).some((r) => r.includes(needle)),
    needle,
  );
}

/* ------------------------------------------------------------------ */
/* 7. nao duplicacao                                                   */
/* ------------------------------------------------------------------ */

const nd = data.non_duplication ?? {};
assert("non_duplication_consent_contract_is_249", nd.consent_contract_issue === "#249", nd.consent_contract_issue);
assert("non_duplication_executed_by_328", nd.executed_by_issue === "#328", nd.executed_by_issue);
assert(
  "non_duplication_lists_83_243_184",
  JSON.stringify(nd.not_restated_issues) === JSON.stringify(["#83", "#243", "#184"]),
  nd.not_restated_issues,
);
assert("non_duplication_reason_filled", filled(nd.reason_pt_br), nd.reason_pt_br);
/* as tres issues so podem ser citadas dentro do bloco de nao duplicacao */
for (const issue of ["#83", "#243", "#184"]) {
  const mentions = allStrings.filter((s) => s.value.includes(issue));
  assert(
    `issue_${issue.slice(1)}_only_inside_non_duplication`,
    mentions.every((m) => m.at.startsWith("$.non_duplication")),
    mentions.map((m) => m.at),
  );
}
/* e o registro nao reescreve o escopo delas */
for (const foreign of [
  "análise técnica editorial",
  "credenciais",
  "registros profissionais",
  "percepção do painel",
]) {
  const mentions = allStrings.filter((s) => s.value.toLowerCase().includes(foreign.toLowerCase()));
  assert(
    `foreign_scope_not_restated_${foreign.slice(0, 18).replace(/[^a-zA-Z]+/g, "_")}`,
    mentions.every((m) => m.at.startsWith("$.non_duplication")),
    mentions.map((m) => m.at),
  );
}
assert(
  "consent_contract_249_is_named",
  allStrings.some((s) => s.value === "#249"),
  "#249",
);

/* ------------------------------------------------------------------ */
/* 8. validador de entrada, exercitado por fixtures sinteticas         */
/*    (nenhum dado falso entra no arquivo do registro)                 */
/* ------------------------------------------------------------------ */

function validateEntry(entry) {
  return shippedValidateEntry(entry, {
    schema,
    consentFields: CONSENT_FIELDS,
    grades: GRADES,
    revocationTargets: REVOCATION_TARGETS,
    root,
  });
}

function validateRegistryShape(reg) {
  return shippedValidateRegistryShape(reg, {
    schema,
    consentFields: CONSENT_FIELDS,
    grades: GRADES,
    revocationTargets: REVOCATION_TARGETS,
    gate: data.gate,
    root,
  });
}

function evaluateProofGate(registry, pages, now) {
  return shippedEvaluateProofGate({
    registry,
    pages,
    schema,
    consentFields: CONSENT_FIELDS,
    grades: GRADES,
    revocationTargets: REVOCATION_TARGETS,
    gate: data.gate,
    root,
    ...(now === undefined ? {} : { now }),
  });
}

/* Uma prova valida e uma entrada que passa inteira no validador enviado:
   autorizada, com fonte, nao vencida. Tudo abaixo e derivado do registro
   committado, nunca de uma constante congelada em zero. */
const VALID_ENTRIES = (data.entries ?? []).filter((entry) => validateEntry(entry).length === 0);
const PUBLISHED_ENTRIES = VALID_ENTRIES.filter((entry) => entry.state === "PUBLISHED");
const PUBLISHED_SURFACES = new Set(
  PUBLISHED_ENTRIES.flatMap((entry) => (entry.distribution?.surfaces ?? []).map(surfaceToRelPath)),
);
assert(
  "every_committed_entry_is_valid",
  VALID_ENTRIES.length === (data.entries ?? []).length,
  (data.entries ?? []).filter((e) => validateEntry(e).length > 0).map((e) => [e?.entry_id, validateEntry(e)]),
);

/* fixture bem formada, sintetica, viva apenas dentro deste teste */
const WELL_FORMED = Object.freeze({
  entry_id: "fixture-sintetica-do-gate",
  state: "APPROVED",
  delivery_reference: "entrega-fixture-sintetica",
  consent: {
    autorizacao_explicita_do_titular: "autorizacao sintetica de fixture, registrada em recibo privado",
    escopo_de_identificacao_e_reproducao: "escopo sintetico: setor e problema, sem nome nem logotipo",
    aprovador_humano_nomeado: "Aprovadora Sintetica de Fixture",
    evidencia_de_que_a_entrega_ocorreu: "protocolo sintetico de entrega registrado em canal privado",
    fatos_afirmaveis_com_fonte: ["fato sintetico com fonte declarada no recibo privado"],
    regras_de_retencao_revisao_e_revogacao: "retencao sintetica de 12 meses, revisao semestral, revogacao imediata",
  },
  final_approval: {
    approver_name: "Aprovadora Sintetica de Fixture",
    approver_role: "diretora de contratos da fixture",
    approved_at: "2026-08-24",
    binding_kind: "material_hash",
    binding_value: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  },
  verifiable_evidence: [
    { kind: "checksum", reference: "sha256 do material sintetico da fixture", within_authorized_scope: true },
  ],
  claims: [
    { statement_pt_br: "o material sintetico foi entregue na data da fixture", evidence_grade: "FACT", source_pt_br: "protocolo sintetico" },
    { statement_pt_br: "o efeito comercial nao pode ser medido nesta fixture", evidence_grade: "UNKNOWN", source_pt_br: "sem medicao" },
  ],
  evidence: {
    fonte: "protocolo sintetico de entrega registrado em canal privado",
    autorizacao: "autorizacao sintetica de fixture, registrada em recibo privado",
    escopo_permitido: "setor e problema, sem nome nem logotipo",
    anonimizacao: "identidade e valores comerciais omitidos",
    baseline: "situacao anterior declarada no recibo privado da fixture",
    intervencao: "leitura tecnica documentada no material sintetico",
    resultado_observavel: "material sintetico entregue na data da fixture",
    limitacoes: "fixture de teste; nao e cliente, contrato ou resultado real",
    revisor: "Aprovadora Sintetica de Fixture",
    expiracao: "2028-08-24T00:00:00Z",
  },
  distribution: {
    canary: true,
    surfaces: ["/entregas/"],
    logo_carousel: false,
    aggregate_rating: false,
    review_schema: false,
  },
  revocation: {
    channel: "canal privado do titular da fixture",
    removes: [...REVOCATION_TARGETS],
  },
});

const clone = (o) => structuredClone(o);

assert("fixture_well_formed_entry_passes", validateEntry(clone(WELL_FORMED)).length === 0, validateEntry(clone(WELL_FORMED)));

{
  const missingAuth = clone(WELL_FORMED);
  missingAuth.evidence.autorizacao = "";
  const missingAuthProblems = validateEntry(missingAuth);
  assert("fixture_missing_authorization_fails", missingAuthProblems.includes("authorization_absent"), missingAuthProblems);

  const expired = clone(WELL_FORMED);
  expired.evidence.expiracao = "2020-01-01T00:00:00Z";
  const expiredProblems = validateEntry(expired);
  assert("fixture_expired_authorization_fails", expiredProblems.includes("authorization_expired"), expiredProblems);

  const missingFonte = clone(WELL_FORMED);
  missingFonte.evidence.fonte = "";
  const missingFonteProblems = validateEntry(missingFonte);
  assert("fixture_missing_fonte_fails", missingFonteProblems.includes("fonte_absent"), missingFonteProblems);

  const absentEvidence = clone(WELL_FORMED);
  delete absentEvidence.evidence;
  const absentProblems = validateEntry(absentEvidence);
  assert("fixture_absent_evidence_fails", absentProblems.includes("missing_field:evidence"), absentProblems);
  assert("fixture_absent_evidence_reports_authorization_absent", absentProblems.includes("authorization_absent"), absentProblems);
  assert("fixture_absent_evidence_reports_fonte_absent", absentProblems.includes("fonte_absent"), absentProblems);
}

/* fixture malformada canonica: objeto vazio reprova em bloco */
const EMPTY_ENTRY_PROBLEMS = validateEntry({});
assert("fixture_empty_entry_fails", EMPTY_ENTRY_PROBLEMS.length > 0, EMPTY_ENTRY_PROBLEMS.length);
for (const f of REQUIRED_ENTRY_FIELDS) {
  assert(`fixture_empty_entry_reports_missing_${f}`, EMPTY_ENTRY_PROBLEMS.includes(`missing_field:${f}`), f);
}
assert("fixture_null_entry_fails", validateEntry(null).includes("entry_not_object"), validateEntry(null));
assert("fixture_array_entry_fails", validateEntry([]).includes("entry_not_object"), validateEntry([]));
assert("fixture_string_entry_fails", validateEntry("caso do cliente").includes("entry_not_object"), validateEntry("x"));

/* cada um dos seis campos de consentimento, ausente e vazio */
for (const f of CONSENT_FIELDS) {
  const missing = clone(WELL_FORMED);
  delete missing.consent[f];
  const mp = validateEntry(missing);
  assert(`fixture_consent_missing_${f}_fails`, mp.includes(`consent_missing:${f}`), mp);
  assert(`fixture_consent_missing_${f}_is_the_only_problem`, mp.length === 1, mp);

  const emptyString = clone(WELL_FORMED);
  emptyString.consent[f] = "";
  assert(`fixture_consent_empty_string_${f}_fails`, validateEntry(emptyString).includes(`consent_empty:${f}`), f);

  const blank = clone(WELL_FORMED);
  blank.consent[f] = "   ";
  assert(`fixture_consent_blank_${f}_fails`, validateEntry(blank).includes(`consent_empty:${f}`), f);

  const nulled = clone(WELL_FORMED);
  nulled.consent[f] = null;
  assert(`fixture_consent_null_${f}_fails`, validateEntry(nulled).includes(`consent_empty:${f}`), f);

  const emptyArray = clone(WELL_FORMED);
  emptyArray.consent[f] = [];
  assert(`fixture_consent_empty_array_${f}_fails`, validateEntry(emptyArray).includes(`consent_empty:${f}`), f);

  const emptyObject = clone(WELL_FORMED);
  emptyObject.consent[f] = {};
  assert(`fixture_consent_empty_object_${f}_fails`, validateEntry(emptyObject).includes(`consent_empty:${f}`), f);

  const falseValue = clone(WELL_FORMED);
  falseValue.consent[f] = false;
  assert(`fixture_consent_false_${f}_fails`, validateEntry(falseValue).includes(`consent_empty:${f}`), f);

  const trueValue = clone(WELL_FORMED);
  trueValue.consent[f] = true;
  assert(`fixture_consent_true_${f}_fails`, validateEntry(trueValue).includes(`consent_wrong_shape:${f}`), f);

  const numericValue = clone(WELL_FORMED);
  numericValue.consent[f] = 1;
  assert(`fixture_consent_number_${f}_fails`, validateEntry(numericValue).includes(`consent_wrong_shape:${f}`), f);
}
{
  const noConsent = clone(WELL_FORMED);
  delete noConsent.consent;
  const p = validateEntry(noConsent);
  assert("fixture_consent_absent_fails", p.includes("missing_field:consent") && p.includes("consent_not_object"), p);
  const smuggled = clone(WELL_FORMED);
  smuggled.consent.consentimento_verbal = "aceite verbal em conversa";
  assert(
    "fixture_consent_extra_field_fails",
    validateEntry(smuggled).includes("consent_unknown_field:consentimento_verbal"),
    validateEntry(smuggled),
  );
}

/* aprovacao final vinculada por hash ou versao */
for (const f of ["approver_name", "approver_role", "approved_at", "binding_kind", "binding_value"]) {
  const missing = clone(WELL_FORMED);
  delete missing.final_approval[f];
  assert(`fixture_final_approval_missing_${f}_fails`, validateEntry(missing).some((p) => p.startsWith("final_approval_")), f);
  const empty = clone(WELL_FORMED);
  empty.final_approval[f] = "";
  assert(`fixture_final_approval_empty_${f}_fails`, validateEntry(empty).includes(`final_approval_empty:${f}`), f);
}
{
  const noApproval = clone(WELL_FORMED);
  delete noApproval.final_approval;
  const p = validateEntry(noApproval);
  assert("fixture_final_approval_absent_fails", p.includes("missing_field:final_approval"), p);

  const badBinding = clone(WELL_FORMED);
  badBinding.final_approval.binding_kind = "aceite_verbal";
  assert(
    "fixture_final_approval_verbal_binding_fails",
    validateEntry(badBinding).includes("final_approval_binding_kind:aceite_verbal"),
    validateEntry(badBinding),
  );

  const shortBinding = clone(WELL_FORMED);
  shortBinding.final_approval.binding_value = "v1";
  assert(
    "fixture_final_approval_short_binding_fails",
    validateEntry(shortBinding).includes("final_approval_binding_value_too_short"),
    validateEntry(shortBinding),
  );

  const invalidDate = clone(WELL_FORMED);
  invalidDate.final_approval.approved_at = "2026-02-31";
  assert(
    "fixture_final_approval_invalid_calendar_date_fails",
    validateEntry(invalidDate).includes("final_approval_invalid_date"),
    validateEntry(invalidDate),
  );

  const fakeHash = clone(WELL_FORMED);
  fakeHash.final_approval.binding_value = "sha256:not-a-real-digest";
  assert(
    "fixture_final_approval_fake_hash_fails",
    validateEntry(fakeHash).includes("final_approval_invalid_sha256"),
    validateEntry(fakeHash),
  );

  const versionBinding = clone(WELL_FORMED);
  versionBinding.final_approval.binding_kind = "material_version";
  versionBinding.final_approval.binding_value = "material-v1.0.0-2026-08-24";
  assert("fixture_final_approval_version_binding_passes", validateEntry(versionBinding).length === 0, validateEntry(versionBinding));

  for (const robot of ["CI bot", "agent runner", "Claude", "automation pipeline", "robo de aprovacao"]) {
    const nonHuman = clone(WELL_FORMED);
    nonHuman.final_approval.approver_name = robot;
    assert(
      `fixture_final_approval_non_human_${robot.replace(/[^a-zA-Z]+/g, "_")}_fails`,
      validateEntry(nonHuman).includes("final_approval_non_human_approver"),
      robot,
    );
  }
}

/* evidencia verificavel */
{
  const noEvidence = clone(WELL_FORMED);
  noEvidence.verifiable_evidence = [];
  assert("fixture_no_evidence_fails", validateEntry(noEvidence).includes("verifiable_evidence_missing"), validateEntry(noEvidence));

  const badKind = clone(WELL_FORMED);
  badKind.verifiable_evidence[0].kind = "conversa";
  assert("fixture_evidence_bad_kind_fails", validateEntry(badKind).includes("evidence_0_bad_kind:conversa"), validateEntry(badKind));

  const outOfScope = clone(WELL_FORMED);
  outOfScope.verifiable_evidence[0].within_authorized_scope = false;
  assert("fixture_evidence_out_of_scope_fails", validateEntry(outOfScope).includes("evidence_0_out_of_scope"), validateEntry(outOfScope));

  const emptyRef = clone(WELL_FORMED);
  emptyRef.verifiable_evidence[0].reference = "";
  assert("fixture_evidence_empty_reference_fails", validateEntry(emptyRef).includes("evidence_0_empty_reference"), validateEntry(emptyRef));

  for (const kind of ["trecho", "captura_redigida", "checksum"]) {
    const ok = clone(WELL_FORMED);
    ok.verifiable_evidence[0].kind = kind;
    assert(`fixture_evidence_kind_${kind}_passes`, validateEntry(ok).length === 0, kind);
  }
}

/* afirmacoes graduadas */
{
  const noClaims = clone(WELL_FORMED);
  noClaims.claims = [];
  assert("fixture_no_claims_fails", validateEntry(noClaims).includes("claims_missing"), validateEntry(noClaims));

  const ungraded = clone(WELL_FORMED);
  delete ungraded.claims[0].evidence_grade;
  const up = validateEntry(ungraded);
  assert("fixture_claim_without_grade_fails", up.includes("claim_0_missing:evidence_grade"), up);

  const badGrade = clone(WELL_FORMED);
  badGrade.claims[0].evidence_grade = "RESULTADO";
  assert("fixture_claim_bad_grade_fails", validateEntry(badGrade).includes("claim_0_bad_grade:RESULTADO"), validateEntry(badGrade));

  const noSource = clone(WELL_FORMED);
  noSource.claims[0].source_pt_br = "";
  assert("fixture_claim_without_source_fails", validateEntry(noSource).includes("claim_0_empty_source"), validateEntry(noSource));

  const unknownFilled = clone(WELL_FORMED);
  unknownFilled.claims[1].statement_pt_br = "economia de 18% na margem do contrato";
  assert(
    "fixture_unknown_claim_filled_with_number_fails",
    validateEntry(unknownFilled).includes("claim_1_unknown_filled_with_number"),
    validateEntry(unknownFilled),
  );

  const outcomeAsInference = clone(WELL_FORMED);
  outcomeAsInference.claims = [{
    statement_pt_br: "inferência de economia para o cliente",
    evidence_grade: "INFERENCE",
    source_pt_br: "fonte sintética",
  }];
  assert(
    "fixture_outcome_as_inference_fails",
    validateEntry(outcomeAsInference).includes("claim_0_outcome_requires_fact_or_calculation"),
    validateEntry(outcomeAsInference),
  );

  const calculationWithoutMethod = clone(WELL_FORMED);
  calculationWithoutMethod.claims = [{
    statement_pt_br: "economia calculada de 10 por cento",
    evidence_grade: "CALCULATION",
    source_pt_br: "dados sintéticos",
  }];
  assert(
    "fixture_calculation_without_method_fails",
    validateEntry(calculationWithoutMethod).includes("claim_0_calculation_method_missing"),
    validateEntry(calculationWithoutMethod),
  );

  for (const grade of GRADES) {
    const ok = clone(WELL_FORMED);
    const statementByGrade = {
      FACT: "afirmacao sintetica da fixture",
      CALCULATION: "economia calculada a partir da fixture",
      INFERENCE: "inferência sintética claramente rotulada",
      UNKNOWN: "resultado desconhecido por falta de medição",
    };
    ok.claims = [{ statement_pt_br: statementByGrade[grade], evidence_grade: grade, source_pt_br: "fonte sintetica" }];
    if (grade === "CALCULATION") ok.claims[0].calculation_pt_br = "subtração explícita entre dois valores sintéticos declarados";
    assert(`fixture_claim_grade_${grade}_passes`, validateEntry(ok).length === 0, grade);
  }
}

/* distribuicao em canario unico */
{
  const carousel = clone(WELL_FORMED);
  carousel.distribution.logo_carousel = true;
  assert("fixture_logo_carousel_fails", validateEntry(carousel).includes("distribution_logo_carousel"), validateEntry(carousel));

  const rating = clone(WELL_FORMED);
  rating.distribution.aggregate_rating = true;
  assert("fixture_aggregate_rating_fails", validateEntry(rating).includes("distribution_aggregate_rating"), validateEntry(rating));

  const reviewSchema = clone(WELL_FORMED);
  reviewSchema.distribution.review_schema = true;
  assert("fixture_review_schema_fails", validateEntry(reviewSchema).includes("distribution_review_schema"), validateEntry(reviewSchema));

  const notCanary = clone(WELL_FORMED);
  notCanary.distribution.canary = false;
  assert("fixture_not_canary_fails", validateEntry(notCanary).includes("distribution_not_canary"), validateEntry(notCanary));

  const noSurfaces = clone(WELL_FORMED);
  noSurfaces.distribution.surfaces = [];
  assert("fixture_no_surfaces_fails", validateEntry(noSurfaces).includes("distribution_no_surfaces"), validateEntry(noSurfaces));

  const missingSurface = clone(WELL_FORMED);
  missingSurface.distribution.surfaces = ["/rota-inexistente-do-gate/"];
  assert(
    "fixture_missing_distribution_surface_fails",
    validateEntry(missingSurface).includes("distribution_surface_missing:/rota-inexistente-do-gate/"),
    validateEntry(missingSurface),
  );
}

/* revogacao completa */
for (const target of REVOCATION_TARGETS) {
  const partial = clone(WELL_FORMED);
  partial.revocation.removes = REVOCATION_TARGETS.filter((t) => t !== target);
  assert(`fixture_revocation_without_${target}_fails`, validateEntry(partial).includes(`revocation_incomplete:${target}`), target);
}
{
  const noChannel = clone(WELL_FORMED);
  noChannel.revocation.channel = "";
  assert("fixture_revocation_without_channel_fails", validateEntry(noChannel).includes("revocation_empty_channel"), validateEntry(noChannel));
}

/* estado da entrada */
for (const state of schema.allowed_entry_states ?? []) {
  const ok = clone(WELL_FORMED);
  ok.state = state;
  assert(`fixture_entry_state_${state}_passes`, validateEntry(ok).length === 0, state);
}
for (const state of ["CASE", "SUCESSO", "PUBLICADO", "", null]) {
  const bad = clone(WELL_FORMED);
  bad.state = state;
  assert(`fixture_entry_state_${String(state)}_fails`, validateEntry(bad).some((p) => p.startsWith("bad_state")), String(state));
}

/* forma do registro inteiro */
assert("registry_shape_valid_today", validateRegistryShape(data).length === 0, validateRegistryShape(data));
{
  const blockedWithEntry = { state: "BLOCKED_EXTERNAL", entries: [clone(WELL_FORMED)] };
  assert(
    "simulated_entry_while_blocked_fails",
    validateRegistryShape(blockedWithEntry).includes("entries_present_while_blocked"),
    validateRegistryShape(blockedWithEntry),
  );
  const authorizedWithGoodEntry = { state: "AUTHORIZED", entries: [clone(WELL_FORMED)] };
  assert(
    "simulated_authorized_with_valid_entry_passes",
    validateRegistryShape(authorizedWithGoodEntry).length === 0,
    validateRegistryShape(authorizedWithGoodEntry),
  );
  const preparingDraft = clone(WELL_FORMED);
  preparingDraft.state = "DRAFT";
  assert(
    "simulated_prepare_only_with_draft_passes",
    validateRegistryShape({ state: "PREPARE_ONLY", entries: [preparingDraft] }).length === 0,
    validateRegistryShape({ state: "PREPARE_ONLY", entries: [preparingDraft] }),
  );
  assert(
    "simulated_prepare_only_with_approved_entry_fails",
    validateRegistryShape({ state: "PREPARE_ONLY", entries: [clone(WELL_FORMED)] }).includes("entry_state_requires_authorized_registry"),
    validateRegistryShape({ state: "PREPARE_ONLY", entries: [clone(WELL_FORMED)] }),
  );
  assert(
    "simulated_unknown_registry_state_fails",
    validateRegistryShape({ state: "LIVE", entries: [] }).includes("bad_registry_state"),
    validateRegistryShape({ state: "LIVE", entries: [] }),
  );
  const bare = clone(WELL_FORMED);
  bare.consent = {};
  const authorizedWithBadEntry = { state: "AUTHORIZED", entries: [bare] };
  assert(
    "simulated_authorized_with_consentless_entry_fails",
    validateRegistryShape(authorizedWithBadEntry).some((p) => p.startsWith("entry_0.consent_missing")),
    validateRegistryShape(authorizedWithBadEntry),
  );
  const two = clone(WELL_FORMED);
  two.entry_id = "fixture-sintetica-do-gate-2";
  two.state = "PUBLISHED";
  const one = clone(WELL_FORMED);
  one.state = "PUBLISHED";
  assert(
    "simulated_two_canaries_fail",
    validateRegistryShape({ state: "AUTHORIZED", entries: [one, two] }).includes("more_than_one_canary"),
    "two published entries",
  );
  assert(
    "simulated_duplicate_entry_id_fails",
    validateRegistryShape({ state: "AUTHORIZED", entries: [clone(WELL_FORMED), clone(WELL_FORMED)] }).includes("duplicate_entry_id"),
    "duplicate ids",
  );
  assert("simulated_entries_not_array_fails", validateRegistryShape({ state: "AUTHORIZED", entries: {} }).includes("entries_not_array"), "not array");
}

/* ------------------------------------------------------------------ */
/* 9. varredura real do HTML publicado                                 */
/* ------------------------------------------------------------------ */

const scanScope = data.public_scan_scope ?? {};
const EXCLUDED = scanScope.excluded_path_prefixes ?? [];
assert("scan_scope_excludes_declared", filledList(EXCLUDED, 5), EXCLUDED);
// `.claude/` and `.worktrees/` hold agent worktrees and sibling checkouts. They
// are not published, and treating them as public pages made this gate reprove
// 299 times locally while CI, which clones fresh, stayed green.
for (const prefix of [".git/", "docs/", "node_modules/", "scripts/", "tests/", "_site/", ".claude/", ".worktrees/"]) {
  assert(`scan_scope_excludes_${prefix.replace(/[^a-zA-Z]+/g, "_")}`, EXCLUDED.includes(prefix), prefix);
}

function isExcluded(rel) {
  return EXCLUDED.some((p) => `${rel}/`.startsWith(p));
}
function walkHtml(dir, out) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(root, abs).split(path.sep).join("/");
    if (isExcluded(rel)) continue;
    if (e.isDirectory()) walkHtml(abs, out);
    else if (e.isFile() && e.name.endsWith(".html")) out.push(rel);
  }
  return out;
}
const publicPages = walkHtml(root, []).sort();
assert(
  "public_pages_found_above_floor",
  publicPages.length >= (scanScope.minimum_pages_expected ?? 200),
  publicPages.length,
);
assert("public_pages_include_home", publicPages.includes("index.html"), "index.html");
assert("public_pages_include_entregas", publicPages.includes("entregas/index.html"), "entregas/index.html");
assert("public_pages_include_casos_index", publicPages.includes("casos/index.html"), "casos/index.html");

function collectTypes(node, out) {
  if (Array.isArray(node)) {
    node.forEach((n) => collectTypes(n, out));
    return out;
  }
  if (node && typeof node === "object") {
    const t = node["@type"];
    if (typeof t === "string") out.push(t);
    else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") out.push(x);
    for (const v of Object.values(node)) collectTypes(v, out);
  }
  return out;
}
function collectJsonKeys(node, out) {
  if (Array.isArray(node)) {
    node.forEach((n) => collectJsonKeys(n, out));
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      out.push(k);
      collectJsonKeys(v, out);
    }
  }
  return out;
}

const LD_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const scan = {
  review_types: 0,
  aggregate_rating_types: 0,
  rating_microdata: 0,
  review_property_keys: 0,
  aggregate_rating_property_keys: 0,
  rating_value_keys: 0,
  ld_blocks: 0,
  logo_walls: 0,
  testimonial_blocks: 0,
  real_proof_markers: 0,
};
const offenders = [];
const REAL_PROOF_MARKERS = data.real_proof_block_markers ?? [];
const FORBIDDEN_MARKERS = data.forbidden_social_proof_markers ?? [];
const pageText = new Map();

for (const rel of publicPages) {
  const html = fs.readFileSync(path.join(root, rel), "utf8");
  pageText.set(rel, html);
  const types = [];
  const keys = [];
  let parseFailures = 0;
  LD_RE.lastIndex = 0;
  let m;
  while ((m = LD_RE.exec(html)) !== null) {
    scan.ld_blocks += 1;
    try {
      const parsed = JSON.parse(m[1]);
      collectTypes(parsed, types);
      collectJsonKeys(parsed, keys);
    } catch {
      parseFailures += 1;
    }
  }
  assert(`ldjson_parses_${rel}`, parseFailures === 0, rel);

  const reviewTypes = types.filter((t) => t === "Review");
  const aggTypes = types.filter((t) => t === "AggregateRating");
  scan.review_types += reviewTypes.length;
  scan.aggregate_rating_types += aggTypes.length;
  scan.review_property_keys += keys.filter((k) => k === "review" || k === "reviews").length;
  scan.aggregate_rating_property_keys += keys.filter((k) => k === "aggregateRating").length;
  scan.rating_value_keys += keys.filter((k) => k === "ratingValue" || k === "reviewCount" || k === "ratingCount").length;
  assert(`no_review_schema_${rel}`, reviewTypes.length === 0, rel);
  assert(`no_aggregate_rating_schema_${rel}`, aggTypes.length === 0, rel);
  assert(
    `no_review_or_rating_property_${rel}`,
    !keys.some((k) => k === "review" || k === "reviews" || k === "aggregateRating" || k === "ratingValue" || k === "reviewCount" || k === "ratingCount"),
    rel,
  );

  const microdata =
    /itemprop\s*=\s*["']ratingValue["']/i.test(html) ||
    /itemprop\s*=\s*["']aggregateRating["']/i.test(html) ||
    /itemprop\s*=\s*["']reviewBody["']/i.test(html) ||
    /itemprop\s*=\s*["']reviewRating["']/i.test(html) ||
    /itemtype\s*=\s*["'][^"']*schema\.org\/Review["']/i.test(html) ||
    /itemtype\s*=\s*["'][^"']*schema\.org\/AggregateRating["']/i.test(html);
  if (microdata) {
    scan.rating_microdata += 1;
    offenders.push([rel, "rating microdata"]);
  }
  assert(`no_rating_microdata_${rel}`, !microdata, rel);

  const marker = REAL_PROOF_MARKERS.find((mk) => html.includes(mk));
  if (marker) {
    scan.real_proof_markers += 1;
    if (!PUBLISHED_SURFACES.has(rel)) offenders.push([rel, `real proof marker ${marker} without a valid published entry`]);
  }
  assert(
    `real_proof_block_only_on_published_surface_${rel}`,
    marker === undefined || PUBLISHED_SURFACES.has(rel),
    marker ?? rel,
  );

  if (/logo-carousel|carrossel-de-logos|client-logo-wall/i.test(html)) {
    scan.logo_walls += 1;
    offenders.push([rel, "logo wall"]);
  }
  if (/testimonial-carousel/i.test(html) || /class\s*=\s*["'][^"']*\btestimonial[a-z-]*\b/i.test(html)) {
    scan.testimonial_blocks += 1;
    offenders.push([rel, "testimonial block"]);
  }
}

assert("scan_found_ldjson_blocks", scan.ld_blocks > 100, scan.ld_blocks);
assert("scan_zero_review_types", scan.review_types === 0, scan.review_types);
assert("scan_zero_aggregate_rating_types", scan.aggregate_rating_types === 0, scan.aggregate_rating_types);
assert("scan_zero_review_property_keys", scan.review_property_keys === 0, scan.review_property_keys);
assert("scan_zero_aggregate_rating_property_keys", scan.aggregate_rating_property_keys === 0, scan.aggregate_rating_property_keys);
assert("scan_zero_rating_value_keys", scan.rating_value_keys === 0, scan.rating_value_keys);
assert("scan_zero_rating_microdata", scan.rating_microdata === 0, scan.rating_microdata);
assert("scan_zero_logo_walls", scan.logo_walls === 0, scan.logo_walls);
assert("scan_zero_testimonial_blocks", scan.testimonial_blocks === 0, scan.testimonial_blocks);
assert(
  "scan_real_proof_markers_match_published_entries",
  scan.real_proof_markers === PUBLISHED_SURFACES.size,
  [scan.real_proof_markers, PUBLISHED_SURFACES.size],
);
assert("scan_reports_no_offender", offenders.length === 0, offenders.slice(0, 10));

assert("forbidden_markers_declared", filledList(FORBIDDEN_MARKERS, 5), FORBIDDEN_MARKERS);
for (const mk of FORBIDDEN_MARKERS) {
  const hits = publicPages.filter((rel) => pageText.get(rel).includes(mk));
  assert(`forbidden_marker_absent_${mk.replace(/[^a-zA-Z]+/g, "_")}`, hits.length === 0, hits.slice(0, 5));
}
assert("real_proof_markers_declared", filledList(REAL_PROOF_MARKERS, 4), REAL_PROOF_MARKERS);
for (const mk of REAL_PROOF_MARKERS) {
  const hits = publicPages.filter((rel) => pageText.get(rel).includes(mk) && !PUBLISHED_SURFACES.has(rel));
  assert(`real_proof_marker_only_on_published_surface_${mk.replace(/[^a-zA-Z]+/g, "_")}`, hits.length === 0, hits.slice(0, 5));
}

/* ------------------------------------------------------------------ */
/* 10. a auditoria declarada concorda com o disco                      */
/* ------------------------------------------------------------------ */

const audit = data.audit_2026_08_24 ?? {};
for (const key of ["reviews", "aggregate_ratings", "client_logos", "testimonials", "approved_client_cases"]) {
  assert(`audit_declares_${key}`, key in audit, key);
  assert(`audit_${key}_is_a_count`, Number.isInteger(audit[key]) && audit[key] >= 0, audit[key]);
}
/* review, rating agregado, mural de logos e depoimento continuam proibidos por
   politica em qualquer estado do registro; isto nao e um congelamento do zero,
   e a proibicao estrutural declarada em forbidden_schema_types_on_public_pages */
for (const key of ["reviews", "aggregate_ratings", "client_logos", "testimonials"]) {
  assert(`audit_${key}_is_zero_by_policy`, audit[key] === 0, audit[key]);
}
assert("audit_reviews_agrees_with_scan", audit.reviews === scan.review_types + scan.review_property_keys, [audit.reviews, scan.review_types, scan.review_property_keys]);
assert(
  "audit_aggregate_ratings_agrees_with_scan",
  audit.aggregate_ratings === scan.aggregate_rating_types + scan.aggregate_rating_property_keys + scan.rating_microdata,
  [audit.aggregate_ratings, scan.aggregate_rating_types, scan.aggregate_rating_property_keys, scan.rating_microdata],
);
assert("audit_client_logos_agrees_with_scan", audit.client_logos === scan.logo_walls, [audit.client_logos, scan.logo_walls]);
assert("audit_testimonials_agrees_with_scan", audit.testimonials === scan.testimonial_blocks, [audit.testimonials, scan.testimonial_blocks]);
assert("audit_approved_cases_agrees_with_entries", audit.approved_client_cases === (data.entries ?? []).length, [
  audit.approved_client_cases,
  (data.entries ?? []).length,
]);
assert("scan_scope_expects_zero_reviews", scanScope.expected_review_schema_hits === 0, scanScope.expected_review_schema_hits);
assert("scan_scope_expects_zero_aggregate_ratings", scanScope.expected_aggregate_rating_hits === 0, scanScope.expected_aggregate_rating_hits);
assert("scan_scope_expects_zero_rating_microdata", scanScope.expected_rating_microdata_hits === 0, scanScope.expected_rating_microdata_hits);
assert("scan_scope_rule_filled", filled(scanScope.rule_pt_br), scanScope.rule_pt_br);

/* ------------------------------------------------------------------ */
/* 11. os outros dois registros de main concordam em zero              */
/* ------------------------------------------------------------------ */

const cross = data.cross_contracts ?? {};
assert("cross_contract_permissioned_declared", cross.permissioned_proof_registry === "data/site/permissioned-proof-registry.json", cross.permissioned_proof_registry);
assert("cross_contract_cases_declared", cross.cases_registry === "data/site/cases.json", cross.cases_registry);
assert("cross_contract_rule_filled", filled(cross.rule_pt_br), cross.rule_pt_br);

const permPath = path.join(root, cross.permissioned_proof_registry ?? "");
assert("permissioned_proof_registry_exists", fs.existsSync(permPath), permPath);
if (fs.existsSync(permPath)) {
  const perm = JSON.parse(fs.readFileSync(permPath, "utf8"));
  const permPublished = (perm.records ?? []).filter((r) => r && r.state === "PUBLISHED");
  assert(
    "permissioned_registry_count_matches_its_records",
    perm.approved_public_proof_count === permPublished.length,
    [perm.approved_public_proof_count, permPublished.length],
  );
  assert(
    "permissioned_registry_state_matches_its_count",
    (perm.state === "NO_APPROVED_CLIENT_PROOF") === (permPublished.length === 0),
    [perm.state, permPublished.length],
  );
  assert(
    "permissioned_registry_agrees_with_real_proof_registry",
    permPublished.length === PUBLISHED_ENTRIES.length,
    [permPublished.length, PUBLISHED_ENTRIES.length],
  );
}
const casesPath = path.join(root, cross.cases_registry ?? "");
assert("cases_registry_exists", fs.existsSync(casesPath), casesPath);
if (fs.existsSync(casesPath)) {
  const cases = JSON.parse(fs.readFileSync(casesPath, "utf8"));
  assert(
    "cases_registry_agrees_with_real_proof_registry",
    Array.isArray(cases.cases) && cases.cases.length === PUBLISHED_ENTRIES.length,
    [(cases.cases ?? []).length, PUBLISHED_ENTRIES.length],
  );
  assert(
    "cases_registry_surfaces_demonstrative_unless_published",
    (cases.published_surfaces ?? []).every(
      (s) =>
        (s.permission_class === "demonstrativo" && s.client_authorized === false) ||
        (s.permission_class === "consented" && s.client_authorized === true && PUBLISHED_SURFACES.has(surfaceToRelPath(s.path))),
    ),
    cases.published_surfaces,
  );
}

/* ------------------------------------------------------------------ */
/* 12. exemplos sinteticos continuam rotulados                         */
/* ------------------------------------------------------------------ */

const synth = data.synthetic_surfaces ?? {};
const LABEL = synth.synthetic_label_pt_br;
assert("synthetic_label_declared", LABEL === "DADOS SINTÉTICOS", LABEL);
assert("demonstrative_label_declared", synth.demonstrative_label_pt_br === "DEMONSTRATIVO", synth.demonstrative_label_pt_br);
assert("demonstrative_permission_class_declared", synth.demonstrative_permission_class === "demonstrativo", synth.demonstrative_permission_class);
assert("synthetic_library_index_declared", synth.library_index === "entregas/index.html", synth.library_index);
assert("synthetic_rule_filled", filled(synth.rule_pt_br), synth.rule_pt_br);

const MODEL_PAGES = synth.model_pages ?? [];
assert("eight_model_pages_declared", Array.isArray(MODEL_PAGES) && MODEL_PAGES.length === 8, MODEL_PAGES.length);
const modelsOnDisk = publicPages.filter((p) => p.startsWith("casos/modelo-"));
assert(
  "declared_model_pages_match_disk",
  JSON.stringify([...MODEL_PAGES].sort()) === JSON.stringify(modelsOnDisk),
  { declared: MODEL_PAGES, disk: modelsOnDisk },
);
for (const rel of MODEL_PAGES) {
  const abs = path.join(root, rel);
  assert(`model_page_exists_${rel}`, fs.existsSync(abs), rel);
  if (!fs.existsSync(abs)) continue;
  const html = pageText.get(rel) ?? fs.readFileSync(abs, "utf8");
  assert(`model_page_carries_synthetic_label_${rel}`, html.includes(LABEL), rel);
  assert(`model_page_says_synthetic_in_prose_${rel}`, /sint[eé]tic/i.test(html), rel);
  const modelPermissionClasses = [...html.matchAll(/data-permission-class="([^"]*)"/g)].map((match) => match[1]);
  assert(
    `model_page_permission_class_never_claims_real_proof_${rel}`,
    modelPermissionClasses.every((permissionClass) => permissionClass === "demonstrativo"),
    modelPermissionClasses,
  );
  assert(`model_page_has_no_real_proof_marker_${rel}`, !REAL_PROOF_MARKERS.some((mk) => html.includes(mk)), rel);
  assert(
    `model_page_does_not_mix_real_proof_with_synthetic_${rel}`,
    html.includes(LABEL) && !REAL_PROOF_MARKERS.some((mk) => html.includes(mk)),
    rel,
  );
}

const libraryHtml = pageText.get(synth.library_index) ?? "";
assert("library_index_read", libraryHtml.length > 0, synth.library_index);
const labelCount = libraryHtml.split(LABEL).length - 1;
assert("library_index_labels_every_model", labelCount >= MODEL_PAGES.length, labelCount);
assert("library_index_has_no_real_proof_marker", !REAL_PROOF_MARKERS.some((mk) => libraryHtml.includes(mk)), synth.library_index);

const DEMO_PAGES = synth.demonstrative_pages ?? [];
assert("demonstrative_pages_declared", filledList(DEMO_PAGES, 3), DEMO_PAGES);
{
  const hub = pageText.get("casos/index.html") ?? "";
  assert("casos_hub_splits_exemplos_de_entrega", /Exemplos de entrega/i.test(hub), "Exemplos de entrega");
  assert("casos_hub_splits_resultados_de_clientes", /Resultados de clientes/i.test(hub), "Resultados de clientes");
  assert("casos_hub_h1_labelled_demonstrativo", /<h1>[^<]*demonstrativo/i.test(hub), hub.slice(0, 400));
  const trust = pageText.get("confianca/index.html") ?? fs.readFileSync(path.join(root, "confianca/index.html"), "utf8");
  assert("trust_surface_exists", trust.length > 0, "confianca/index.html");
  assert("trust_surface_has_no_review_schema", !/"Review"|"AggregateRating"/.test(trust), "trust");
}
for (const rel of DEMO_PAGES) {
  const abs = path.join(root, rel);
  assert(`demonstrative_page_exists_${rel}`, fs.existsSync(abs), rel);
  if (!fs.existsSync(abs)) continue;
  const html = pageText.get(rel) ?? fs.readFileSync(abs, "utf8");
  assert(`demonstrative_page_labelled_${rel}`, html.includes(synth.demonstrative_label_pt_br), rel);
  assert(`demonstrative_page_permission_class_${rel}`, html.includes('data-permission-class="demonstrativo"'), rel);
  assert(`demonstrative_page_has_no_real_proof_marker_${rel}`, !REAL_PROOF_MARKERS.some((mk) => html.includes(mk)), rel);
}

/* "consented" so aparece numa superficie que uma entrada valida e publicada
   declara; qualquer outra pagina publica segue restrita a "demonstrativo" */
for (const rel of publicPages) {
  const html = pageText.get(rel);
  const classes = [...html.matchAll(/data-permission-class="([^"]*)"/g)].map((mm) => mm[1]);
  assert(
    `permission_class_matches_registry_${rel}`,
    classes.every((c) => c === "demonstrativo" || (c === "consented" && PUBLISHED_SURFACES.has(rel))),
    classes,
  );
}

/* ------------------------------------------------------------------ */
/* 12b. integridade de rotulo: perder o rotulo reprova                  */
/*                                                                     */
/* Nao basta o rotulo existir hoje. O teste abaixo remove o rotulo de   */
/* cada artefato sintetico e demonstrativo e exige que o gate reprove;  */
/* se o gate ficar verde com o rotulo removido, ele nao protege nada.   */
/* ------------------------------------------------------------------ */

const LABEL_OPTS = { markers: REAL_PROOF_MARKERS };

for (const rel of MODEL_PAGES) {
  const html = pageText.get(rel);
  if (html === undefined) continue;
  assert(`label_integrity_model_${rel}`, labelIntegrityProblems(html, "model", LABEL_OPTS).length === 0, labelIntegrityProblems(html, "model", LABEL_OPTS));
  assert(
    `label_integrity_model_fails_without_synthetic_label_${rel}`,
    labelIntegrityProblems(html.split(SYNTHETIC_LABEL).join(""), "model", LABEL_OPTS).includes("synthetic_label_absent"),
    rel,
  );
  assert(
    `label_integrity_model_fails_without_permission_class_${rel}`,
    labelIntegrityProblems(html.split('data-permission-class="demonstrativo"').join(""), "model", LABEL_OPTS).includes(
      "demonstrative_permission_class_absent",
    ),
    rel,
  );
  assert(
    `label_integrity_model_fails_when_marked_as_real_${rel}`,
    labelIntegrityProblems(`${html}<div data-real-proof-id="x"></div>`, "model", LABEL_OPTS).includes(
      "synthetic_page_carries_real_proof_marker",
    ),
    rel,
  );
}

for (const rel of DEMO_PAGES) {
  const html = pageText.get(rel);
  if (html === undefined) continue;
  assert(
    `label_integrity_demonstrative_${rel}`,
    labelIntegrityProblems(html, "demonstrative", LABEL_OPTS).length === 0,
    labelIntegrityProblems(html, "demonstrative", LABEL_OPTS),
  );
  assert(
    `label_integrity_demonstrative_fails_without_label_${rel}`,
    labelIntegrityProblems(html.split(DEMONSTRATIVE_LABEL).join("Exemplo"), "demonstrative", LABEL_OPTS).includes(
      "demonstrative_label_absent",
    ),
    rel,
  );
  assert(
    `label_integrity_demonstrative_fails_without_disclaimer_${rel}`,
    labelIntegrityProblems(
      html.replace(/N[ÃA]O [ÉE] (?:RESULTADO DE CLIENTE|CASE|CASO CONFENGE)/gi, "exemplo"),
      "demonstrative",
      LABEL_OPTS,
    ).includes("client_result_disclaimer_absent"),
    rel,
  );
  assert(
    `label_integrity_demonstrative_fails_when_consented_${rel}`,
    labelIntegrityProblems(`${html}<div data-permission-class="consented"></div>`, "demonstrative", LABEL_OPTS).includes(
      "demonstrative_page_declares_consented_class",
    ),
    rel,
  );
}

/* um bloco de prova real nao pode carregar rotulo sintetico */
assert(
  "label_integrity_real_rejects_synthetic_mix",
  labelIntegrityProblems(
    `<div data-permission-class="consented" data-real-proof-id="p1">${SYNTHETIC_LABEL}</div>`,
    "real",
    LABEL_OPTS,
  ).includes("real_proof_mixed_with_synthetic_label"),
  "mixed",
);
assert(
  "label_integrity_real_requires_consented_class",
  labelIntegrityProblems('<div data-real-proof-id="p1">prova</div>', "real", LABEL_OPTS).includes(
    "consented_permission_class_absent",
  ),
  "no class",
);

/* ------------------------------------------------------------------ */
/* 12c. os tres estados honestos do gate de prova                      */
/*                                                                     */
/*   (a) zero prova valida, com o estado zero renderizado    -> PASSA   */
/*   (b) N provas validas, cada uma renderizada na superficie -> PASSA  */
/*   (c) prova vencida ou sem autorizacao                     -> REPROVA*/
/*                                                                     */
/* As fixturas vivem so aqui dentro. Nenhum cliente, prova, fonte ou   */
/* resultado falso entra em arquivo committado.                        */
/* ------------------------------------------------------------------ */

const livePages = new Map(pageText);

/* (a) zero: o registro committado, contra o HTML committado */
assert("gate_state_a_zero_proof_passes", evaluateProofGate(data, livePages).length === 0, evaluateProofGate(data, livePages));
assert(
  "gate_state_a_zero_proof_has_no_published_entry",
  PUBLISHED_ENTRIES.length === 0 || PUBLISHED_SURFACES.size > 0,
  [PUBLISHED_ENTRIES.length, PUBLISHED_SURFACES.size],
);
{
  const hubWithoutState = new Map(livePages);
  hubWithoutState.set("casos/index.html", (livePages.get("casos/index.html") ?? "").replace(/ data-proof-state="[^"]*"/, ""));
  assert(
    "gate_state_a_fails_without_declared_zero_state",
    evaluateProofGate(data, hubWithoutState).includes("proof_state_block_missing:casos/index.html"),
    evaluateProofGate(data, hubWithoutState),
  );
  const hubWithoutCopy = new Map(livePages);
  hubWithoutCopy.set(
    "casos/index.html",
    (livePages.get("casos/index.html") ?? "").replace(
      /(<section[^>]*data-proof-state="none"[^>]*>)[\s\S]*?(<\/section>)/i,
      "$1<h2 id=\"resultados-clientes\">Resultados de clientes</h2>$2",
    ),
  );
  assert(
    "gate_state_a_fails_without_visible_zero_copy",
    evaluateProofGate(data, hubWithoutCopy).includes("zero_proof_state_not_rendered:casos/index.html"),
    evaluateProofGate(data, hubWithoutCopy),
  );
  const orphan = new Map(livePages);
  orphan.set("entregas/index.html", `${livePages.get("entregas/index.html") ?? ""}<div data-real-proof-id="inventado"></div>`);
  const orphanProblems = evaluateProofGate(data, orphan);
  assert("gate_state_a_fails_on_orphan_proof_block", orphanProblems.includes("real_proof_block_without_valid_entry:entregas/index.html"), orphanProblems);
  assert(
    "gate_state_a_fails_on_proof_id_not_in_registry",
    orphanProblems.includes("real_proof_id_not_published:entregas/index.html|inventado"),
    orphanProblems,
  );
}

/* (b) N provas validas: uma publicada no canario e outras aprovadas */
const PROOF_SURFACE = "/confianca/";
const PROOF_SURFACE_REL = surfaceToRelPath(PROOF_SURFACE);
function proofFixture(id, state, surfaces) {
  const entry = clone(WELL_FORMED);
  entry.entry_id = id;
  entry.state = state;
  entry.distribution.surfaces = surfaces;
  return entry;
}
function renderProofBlock(id) {
  return `<section data-proof-class="real" data-permission-class="consented" data-real-proof-id="${id}"><h2>Resultado de cliente autorizado</h2><p>Fixture de teste.</p></section>`;
}
function hubWithPublishedProof(ids) {
  const hub = livePages.get("casos/index.html") ?? "";
  return hub.replace(
    /(<section[^>]*)data-proof-state="none"([^>]*>)([\s\S]*?)(<\/section>)/i,
    (_all, head, tail, body, close) =>
      `${head}data-proof-state="published"${tail}<h2 id="resultados-clientes">Resultados de clientes</h2><p>${ids.length} prova(s) publicada(s).</p>${close}`,
  );
}
{
  const published = proofFixture("fixture-prova-publicada", "PUBLISHED", [PROOF_SURFACE]);
  const approvedA = proofFixture("fixture-prova-aprovada-a", "APPROVED", ["/entregas/"]);
  const approvedB = proofFixture("fixture-prova-aprovada-b", "APPROVED", ["/entregas/"]);
  const registryN = { ...data, state: "AUTHORIZED", entries: [published, approvedA, approvedB] };
  const pagesN = new Map(livePages);
  pagesN.set(PROOF_SURFACE_REL, `<html><body>${renderProofBlock(published.entry_id)}</body></html>`);
  pagesN.set("casos/index.html", hubWithPublishedProof([published.entry_id]));
  assert("gate_state_b_three_valid_proofs_pass", evaluateProofGate(registryN, pagesN).length === 0, evaluateProofGate(registryN, pagesN));

  const oneRegistry = { ...data, state: "AUTHORIZED", entries: [published] };
  assert("gate_state_b_one_valid_proof_passes", evaluateProofGate(oneRegistry, pagesN).length === 0, evaluateProofGate(oneRegistry, pagesN));

  const notRendered = new Map(pagesN);
  notRendered.set(PROOF_SURFACE_REL, "<html><body><p>sem bloco de prova</p></body></html>");
  assert(
    "gate_state_b_fails_when_published_proof_is_not_rendered",
    evaluateProofGate(oneRegistry, notRendered).some((p) => p.startsWith("published_proof_not_rendered:")),
    evaluateProofGate(oneRegistry, notRendered),
  );

  const stillZero = new Map(pagesN);
  stillZero.set("casos/index.html", livePages.get("casos/index.html") ?? "");
  assert(
    "gate_state_b_fails_when_surface_still_declares_zero",
    evaluateProofGate(oneRegistry, stillZero).includes("published_proof_state_not_declared:none"),
    evaluateProofGate(oneRegistry, stillZero),
  );

  const mixed = new Map(pagesN);
  mixed.set(PROOF_SURFACE_REL, `<html><body>${SYNTHETIC_LABEL}${renderProofBlock(published.entry_id)}</body></html>`);
  assert(
    "gate_state_b_fails_when_real_proof_mixes_with_synthetic",
    evaluateProofGate(oneRegistry, mixed).includes(`real_proof_mixed_with_synthetic:${PROOF_SURFACE_REL}`),
    evaluateProofGate(oneRegistry, mixed),
  );

  /* (c) prova vencida e prova sem autorizacao reprovam em qualquer estado */
  const expired = proofFixture("fixture-prova-vencida", "PUBLISHED", [PROOF_SURFACE]);
  expired.evidence.expiracao = "2020-01-01T00:00:00Z";
  const expiredPages = new Map(pagesN);
  expiredPages.set(PROOF_SURFACE_REL, `<html><body>${renderProofBlock(expired.entry_id)}</body></html>`);
  const expiredProblems = evaluateProofGate({ ...data, state: "AUTHORIZED", entries: [expired] }, expiredPages);
  assert("gate_state_c_expired_proof_fails", expiredProblems.includes("proof_expired:fixture-prova-vencida"), expiredProblems);
  assert(
    "gate_state_c_expired_proof_is_not_treated_as_published",
    expiredProblems.includes("real_proof_id_not_published:confianca/index.html|fixture-prova-vencida"),
    expiredProblems,
  );

  const unauthorized = proofFixture("fixture-prova-sem-autorizacao", "PUBLISHED", [PROOF_SURFACE]);
  unauthorized.evidence.autorizacao = "";
  const unauthorizedPages = new Map(pagesN);
  unauthorizedPages.set(PROOF_SURFACE_REL, `<html><body>${renderProofBlock(unauthorized.entry_id)}</body></html>`);
  const unauthorizedProblems = evaluateProofGate({ ...data, state: "AUTHORIZED", entries: [unauthorized] }, unauthorizedPages);
  assert(
    "gate_state_c_unauthorized_proof_fails",
    unauthorizedProblems.includes("proof_unauthorized:fixture-prova-sem-autorizacao"),
    unauthorizedProblems,
  );

  const sourceless = proofFixture("fixture-prova-sem-fonte", "PUBLISHED", [PROOF_SURFACE]);
  sourceless.evidence.fonte = "";
  const sourcelessProblems = evaluateProofGate({ ...data, state: "AUTHORIZED", entries: [sourceless] }, pagesN);
  assert(
    "gate_state_c_sourceless_proof_fails",
    sourcelessProblems.includes("proof_without_source:fixture-prova-sem-fonte"),
    sourcelessProblems,
  );

  /* uma prova valida hoje reprova depois de vencer: o relogio e um argumento */
  const nearExpiry = proofFixture("fixture-prova-que-vence", "PUBLISHED", [PROOF_SURFACE]);
  nearExpiry.evidence.expiracao = "2027-01-01T00:00:00Z";
  const nearPages = new Map(pagesN);
  nearPages.set(PROOF_SURFACE_REL, `<html><body>${renderProofBlock(nearExpiry.entry_id)}</body></html>`);
  const nearRegistry = { ...data, state: "AUTHORIZED", entries: [nearExpiry] };
  assert(
    "gate_clock_before_expiry_passes",
    evaluateProofGate(nearRegistry, nearPages, Date.parse("2026-12-01T00:00:00Z")).length === 0,
    evaluateProofGate(nearRegistry, nearPages, Date.parse("2026-12-01T00:00:00Z")),
  );
  assert(
    "gate_clock_after_expiry_fails",
    evaluateProofGate(nearRegistry, nearPages, Date.parse("2027-06-01T00:00:00Z")).includes("proof_expired:fixture-prova-que-vence"),
    evaluateProofGate(nearRegistry, nearPages, Date.parse("2027-06-01T00:00:00Z")),
  );
}

/* ------------------------------------------------------------------ */
/* 13. higiene tipografica                                             */
/* ------------------------------------------------------------------ */

const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);
assert("no_em_dash_in_data_file", !raw.includes(EM_DASH), raw.indexOf(EM_DASH));
assert("no_en_dash_in_data_file", !raw.includes(EN_DASH), raw.indexOf(EN_DASH));
const selfRaw = fs.readFileSync(SELF_PATH, "utf8");
assert("no_em_dash_in_test_file", !selfRaw.includes(EM_DASH), selfRaw.indexOf(EM_DASH));
assert("no_en_dash_in_test_file", !selfRaw.includes(EN_DASH), selfRaw.indexOf(EN_DASH));
assert("data_file_ends_with_newline", raw.endsWith("\n"), raw.slice(-3));

/* ------------------------------------------------------------------ */
/* 14. o gate esta ligado no CI e no selector                          */
/* ------------------------------------------------------------------ */

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert(
  "npm_script_registered",
  pkg.scripts?.["test:real-proof-registry"] === "node tests/commercial/test_real_proof_registry.mjs",
  pkg.scripts?.["test:real-proof-registry"],
);
assert("npm_test_runs_this_gate", String(pkg.scripts?.test ?? "").includes("npm run test:real-proof-registry"), "npm test");
const ci = fs.readFileSync(path.join(root, ".github/workflows/site-ci.yml"), "utf8");
assert("site_ci_runs_this_gate", ci.includes("npm run test:real-proof-registry"), "site-ci.yml");
const ciAfter = ci.indexOf("npm run test:real-proof-registry");
const ciMarketFit = ci.indexOf("npm run test:market-fit-protocol");
assert("site_ci_places_gate_after_market_fit", ciMarketFit >= 0 && ciAfter > ciMarketFit, [ciMarketFit, ciAfter]);
const graph = fs.readFileSync(path.join(root, "scripts/site/affected_graph.mjs"), "utf8");
assert("affected_graph_declares_gate", graph.includes('"test:real-proof-registry"'), "affected_graph.mjs");
assert("affected_graph_declares_registry_producer", graph.includes("data/commercial/real-proof-registry.v1.json"), "producer");
assert("affected_graph_declares_shipped_validator_producer", graph.includes("scripts/commercial/real_proof_registry.mjs"), "producer");
assert("affected_graph_declares_test_producer", graph.includes("tests/commercial/test_real_proof_registry.mjs"), "producer");
assert(
  "test_drives_shipped_validator",
  selfRaw.includes('from "../../scripts/commercial/real_proof_registry.mjs"'),
  "import",
);
assert(
  "affected_public_html_selects_real_proof_gate",
  consumerSuitesForPath("conteudos/fixture-public-surface/index.html").some((entry) => entry.id === "test:real-proof-registry"),
  "conteudos/fixture-public-surface/index.html",
);

/* ------------------------------------------------------------------ */

finish();
