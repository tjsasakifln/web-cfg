/**
 * Portao do contrato de comunicacao das ofertas (issue #338).
 *
 * Prova o contrato da #338 e cruza sua contagem com o registro integrado da #329:
 *  1. o contrato esta gravado como nao executado (state NOT_STARTED, reviews vazio);
 *  2. as oito lentes adversariais estao na ordem da issue, com criterio, e o portao
 *     de publicacao exige zero defeito bloqueante e zero material;
 *  3. a lista de linguagem proibida declara, entrada por entrada, se e verificavel
 *     por maquina, e as verificaveis sao termos curtos que um scanner casa;
 *  4. os criterios quantitativos tem limiar numerico ou booleano explicito;
 *  5. as excecoes de portao estao documentadas no proprio arquivo de dados;
 *  6. a lista verificavel roda ao vivo contra as paginas de dinheiro que ja existem
 *     em main e todo achado esta registrado no arquivo;
 *  7. nenhuma pagina de dinheiro publica Review nem AggregateRating;
 *  8. o arquivo de dados nao usa travessao.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  auditCopyContract,
  classifyOccurrence,
  deriveMoneyRoutes,
  explicitExclusionRanges,
  frozenRouteExemption,
  registeredNameRanges as auditRegisteredNameRanges,
} from "../../scripts/commercial/copy_contract_audit.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const DATA_REL = "data/commercial/copy-contract.v1.json";
const dataPath = path.join(root, DATA_REL);
const raw = fs.readFileSync(dataPath, "utf8");
const contract = JSON.parse(raw);
const registry = JSON.parse(fs.readFileSync(path.join(root, "data/commercial/deliverables-registry.v1.json"), "utf8"));

const results = [];
function assert(name, cond, detail) {
  if (cond) results.push({ name, ok: true });
  else {
    results.push({ name, ok: false, detail });
    console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
}

/* ---------- normalizacao publicada no proprio contrato ---------- */
function normalize(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script[^>]*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ");
}

/* ---------- 1. estado nao iniciado ---------- */
assert("state_not_started", contract.state === "NOT_STARTED", contract.state);
assert("reviews_empty", Array.isArray(contract.reviews) && contract.reviews.length === 0, contract.reviews);
assert(
  "adversarial_review_not_started",
  contract.adversarial_review_rule?.state === "NOT_STARTED",
  contract.adversarial_review_rule?.state,
);
assert(
  "human_protocol_not_started",
  contract.human_protocol?.state === "NOT_STARTED" &&
    Array.isArray(contract.human_protocol?.results) &&
    contract.human_protocol.results.length === 0,
  contract.human_protocol?.state,
);
assert(
  "differentiation_test_not_started",
  contract.differentiation_test?.state === "NOT_STARTED",
  contract.differentiation_test?.state,
);
const acceptanceById = new Map((contract.acceptance || []).map((item) => [item.id, item]));
assert("acceptance_has_nine_items", acceptanceById.size === 9, contract.acceptance?.length);
assert("machine_acceptance_measured", ["AC-01", "AC-08", "AC-09"].every((id) => acceptanceById.get(id)?.state === "MEASURED_PASS"), contract.acceptance);
assert("differentiation_acceptance_keeps_human_pending", acceptanceById.get("AC-05")?.state === "MACHINE_PRECHECK_PASS_HUMAN_PENDING", acceptanceById.get("AC-05"));
assert("human_acceptance_not_started", ["AC-02", "AC-03", "AC-04", "AC-06", "AC-07"].every((id) => acceptanceById.get(id)?.state === "NOT_STARTED"), contract.acceptance);
// nada declarado validado: nenhum estado do arquivo pode dizer que a revisao passou
const forbiddenStates = JSON.stringify(contract).match(/"state"\s*:\s*"(VALIDATED|PASSED|APPROVED|DONE)"/g);
assert("no_validated_state_anywhere", forbiddenStates === null, forbiddenStates);

/* ---------- 2. oito lentes na ordem da issue, com criterio ---------- */
const EXPECTED_LENSES = [
  "fundador cético",
  "diretor financeiro",
  "engenheiro",
  "licitações",
  "jurídico",
  "comprador apressado",
  "acessibilidade e linguagem simples",
  "compliance",
];
const lenses = contract.adversarial_lenses;
assert("lenses_count_8", Array.isArray(lenses) && lenses.length === 8, lenses?.length);
EXPECTED_LENSES.forEach((expected, i) => {
  const lens = lenses?.[i];
  assert(
    `lens_${i + 1}_order_and_name`,
    lens && lens.order === i + 1 && lens.lens === expected,
    lens,
  );
  assert(
    `lens_${i + 1}_has_criterion`,
    lens && typeof lens.criterion === "string" && lens.criterion.trim().length > 0,
    lens?.criterion,
  );
});
const severities = contract.adversarial_review_rule?.defect_severities || [];
assert(
  "lens_severities",
  severities.length === 3 &&
    ["bloqueante", "material", "cosmético"].every((s) => severities.includes(s)),
  severities,
);
const perLens = contract.adversarial_review_rule?.per_lens_record || [];
assert(
  "lens_records_defect_fix_recheck",
  ["defeito", "correção", "rechecagem"].every((k) => perLens.includes(k)),
  perLens,
);
const gateThresholds = contract.adversarial_review_rule?.publish_gate_thresholds || {};
assert(
  "publish_gate_zero_blocking_zero_material",
  gateThresholds.max_blocking_defects === 0 && gateThresholds.max_material_defects === 0,
  gateThresholds,
);

/* ---------- 3. linguagem proibida: completa e declarada ---------- */
const forbidden = contract.forbidden_language_without_immediate_proof;
assert("forbidden_is_array", Array.isArray(forbidden) && forbidden.length > 0, forbidden?.length);
// os dez termos nomeados na issue precisam existir
const REQUIRED_TERMS = [
  "solução completa",
  "insights estratégicos",
  "inteligência de ponta",
  "excelência",
  "personalizado",
  "360°",
  "transformador",
  "garantia",
  "recupere",
  "vença",
];
const declaredTerms = forbidden.filter((f) => typeof f.term === "string").map((f) => f.term);
for (const t of REQUIRED_TERMS) {
  assert(`forbidden_term_present_${t}`, declaredTerms.includes(t), declaredTerms);
}
// as classes sem lista lexical na issue precisam existir como claim_pattern
const REQUIRED_PATTERNS = [
  "superlativo não demonstrado",
  "número financeiro inventado",
  "urgência falsa, escassez falsa ou desconto teatral",
  "depoimento, logo ou caso sem consentimento ou proveniência",
  "parágrafo intercambiável entre duas ofertas",
  "AI tells, tradução literal e nominalização burocrática",
  "promessa jurídica, regulatória, técnica ou financeira fora da competência",
];
const declaredPatterns = forbidden.filter((f) => typeof f.claim_pattern === "string").map((f) => f.claim_pattern);
for (const p of REQUIRED_PATTERNS) {
  assert(`forbidden_pattern_present_${p.slice(0, 24)}`, declaredPatterns.includes(p), declaredPatterns);
}
const ids = new Set();
for (const entry of forbidden) {
  assert(`forbidden_id_unique_${entry.id}`, typeof entry.id === "string" && !ids.has(entry.id), entry.id);
  ids.add(entry.id);
  assert(
    `forbidden_declares_machine_checkable_${entry.id}`,
    typeof entry.machine_checkable === "boolean",
    entry,
  );
  assert(
    `forbidden_has_source_${entry.id}`,
    typeof entry.source === "string" && entry.source.includes("#338"),
    entry.source,
  );
  if (entry.machine_checkable === false) {
    assert(
      `forbidden_human_entry_has_no_checker_${entry.id}`,
      entry.checker === null && typeof entry.claim_pattern === "string" && typeof entry.reviewed_by === "string",
      entry,
    );
    assert(`forbidden_human_entry_has_no_term_${entry.id}`, entry.term === undefined, entry);
  } else {
    assert(
      `forbidden_machine_entry_has_checker_${entry.id}`,
      entry.checker === "term_scan" || entry.checker === "corpus_duplicate_scan",
      entry,
    );
  }
}
// entradas verificaveis por scanner de termo: termo curto e padrao casavel
const termEntries = forbidden.filter((f) => f.checker === "term_scan");
assert("term_entries_count", termEntries.length === 14, termEntries.length);
for (const entry of termEntries) {
  assert(`term_entry_machine_checkable_${entry.id}`, entry.machine_checkable === true, entry);
  const term = entry.term;
  assert(
    `term_entry_is_short_phrase_${entry.id}`,
    typeof term === "string" && term.length > 0 && term.length <= 32 && term.trim().split(/\s+/).length <= 4,
    term,
  );
  let re = null;
  try {
    re = new RegExp(entry.pattern, "g");
  } catch (err) {
    re = null;
  }
  assert(`term_entry_pattern_compiles_${entry.id}`, re !== null, entry.pattern);
  // o padrao precisa casar o proprio termo normalizado: um scanner honesto encontra o que proibe
  if (re) {
    re.lastIndex = 0;
    assert(`term_entry_pattern_matches_own_term_${entry.id}`, re.test(normalize(term)), {
      term,
      pattern: entry.pattern,
    });
  }
  assert(
    `term_entry_declares_exemptions_${entry.id}`,
    Array.isArray(entry.exemption_ids) && entry.exemption_ids.length > 0,
    entry.exemption_ids,
  );
  // a issue proibe podera apenas em excesso e saiba mais apenas como unico significado:
  // a ocorrencia isolada vira observacao, nunca violacao, e nenhum limiar e inventado
  assert(
    `term_entry_declares_finding_kind_${entry.id}`,
    entry.finding_kind === "violation" || entry.finding_kind === "count_only",
    entry,
  );
  if (entry.finding_kind === "count_only") {
    assert(
      `term_entry_count_only_has_reason_${entry.id}`,
      typeof entry.count_only_reason === "string" && entry.count_only_reason.length > 40,
      entry,
    );
    assert(`term_entry_count_only_has_no_threshold_${entry.id}`, entry.threshold === undefined, entry);
  }
}
// a entrada de duplicidade agora roda sobre o corpus publicado e derivado do registro
const dup = forbidden.find((f) => f.checker === "corpus_duplicate_scan");
assert(
  "duplicate_entry_is_runnable",
  dup && dup.machine_checkable === true && dup.runnable_in_this_branch === true && fs.existsSync(path.join(root, dup.implemented_by)),
  dup,
);

/* ---------- 4. criterios quantitativos com limiar explicito ---------- */
const qcs = contract.quantitative_quality_criteria;
assert("qc_count_9", Array.isArray(qcs) && qcs.length === 9, qcs?.length);
const QC_EXPECTED = {
  "QC-01": ["<=", 8],
  "QC-02": ["<=", 24],
  "QC-03": ["==", true],
  "QC-04": ["<=", 1],
  "QC-05": ["==", 320],
  "QC-06": ["==", true],
  "QC-07": ["==", 100],
  "QC-08": ["==", 0],
  "QC-09": ["==", 0],
};
for (const qc of qcs || []) {
  const expected = QC_EXPECTED[qc.id];
  assert(`qc_known_id_${qc.id}`, Boolean(expected), qc.id);
  if (!expected) continue;
  assert(
    `qc_threshold_explicit_${qc.id}`,
    typeof qc.threshold === "number" || typeof qc.threshold === "boolean",
    qc,
  );
  assert(`qc_operator_${qc.id}`, qc.operator === expected[0], qc);
  assert(`qc_threshold_from_issue_${qc.id}`, qc.threshold === expected[1], qc);
  assert(`qc_has_metric_${qc.id}`, typeof qc.metric === "string" && qc.metric.length > 0, qc);
  assert(
    `qc_enforcement_${qc.id}`,
    qc.enforcement === "bloqueante" || qc.enforcement === "heurística editorial",
    qc,
  );
}
// nenhum limiar inventado alem do que a issue publica
assert(
  "qc_ids_exactly_the_issue_list",
  JSON.stringify((qcs || []).map((q) => q.id)) === JSON.stringify(Object.keys(QC_EXPECTED)),
  (qcs || []).map((q) => q.id),
);
// protocolo humano: 20 participantes e metas 16/20, como a issue publica
assert("human_protocol_participants_20", contract.human_protocol?.icp_participants === 20, contract.human_protocol);
const hpTargets = contract.human_protocol?.targets || [];
assert("human_protocol_targets_4", hpTargets.length === 4, hpTargets.length);
assert(
  "human_protocol_denominator_20",
  hpTargets.every((t) => t.denominator === 20),
  hpTargets,
);
assert(
  "human_protocol_16_of_20",
  hpTargets.filter((t) => t.numerator === 16).length === 3 &&
    hpTargets.filter((t) => t.numerator === 0).length === 1,
  hpTargets,
);
// contrato por oferta: as 15 clausulas na ordem da issue
assert(
  "per_offer_contract_15_ordered",
  Array.isArray(contract.per_offer_contract) &&
    contract.per_offer_contract.length === 15 &&
    contract.per_offer_contract.every((c, i) => c.order === i + 1 && typeof c.requirement === "string"),
  contract.per_offer_contract?.length,
);
assert(
  "screen_structure_index_11_detail_12",
  contract.screen_structure?.index_entregas?.length === 11 &&
    contract.screen_structure?.offer_detail?.length === 12,
  {
    index: contract.screen_structure?.index_entregas?.length,
    detail: contract.screen_structure?.offer_detail?.length,
  },
);
// a referencia historica a 48 fica registrada, mas o registro canonico resolve o alvo em 54
assert(
  "differentiation_target_54",
  contract.differentiation_test?.target_count === 54 &&
    contract.differentiation_test?.contract_scope_count_in_issue_prose === 48 &&
    contract.differentiation_test?.count_discrepancy?.state === "RESOLVED_BY_CANONICAL_REGISTRY" &&
    registry.deliverables?.length === contract.differentiation_test?.target_count,
  contract.differentiation_test,
);
assert(
  "differentiation_scope_note_names_registry",
  typeof contract.differentiation_test?.scope_note === "string" &&
    contract.differentiation_test.scope_note.includes("deliverables-registry.v1.json"),
  contract.differentiation_test?.scope_note,
);
assert("differentiation_machine_precheck_54", contract.differentiation_test?.machine_precheck?.state === "MEASURED_PASS" && contract.differentiation_test.machine_precheck.unique_signatures === 54 && contract.differentiation_test.machine_precheck.human_equivalence_claimed === false, contract.differentiation_test?.machine_precheck);

const taskDoors = JSON.parse(fs.readFileSync(path.join(root, "data/commercial/task-doors.v1.json"), "utf8"));
const familyRegistry = JSON.parse(fs.readFileSync(path.join(root, "data/organic/public-family-registry.json"), "utf8"));
const catalogHtml = fs.readFileSync(path.join(root, "entregas/index.html"), "utf8");
const derivedRoutes = deriveMoneyRoutes(registry, taskDoors, familyRegistry);
const derivedAudit = auditCopyContract({ contract, registry, taskDoors, familyRegistry, catalogHtml });
assert("copy_audit_is_registry_derived", contract.public_implementation?.manual_route_allowlist === false && contract.money_page_scan?.manual_route_allowlist === false, contract.public_implementation);
assert("copy_audit_covers_54", derivedAudit.metrics.deliverables === 54 && derivedAudit.metrics.titleless_unique === 54, derivedAudit.metrics);
assert("copy_audit_covers_810_clauses", derivedAudit.metrics.clauses_per_deliverable === 15 && derivedAudit.metrics.clause_instances === 810, derivedAudit.metrics);
assert(
  "copy_audit_810_clause_bodies_are_distinct",
  derivedAudit.metrics.clause_bodies_unique === 810 && derivedAudit.metrics.clause_body_duplicates === 0,
  derivedAudit.metrics,
);
assert("copy_audit_discovers_live_routes", derivedRoutes.length >= 20 && derivedAudit.metrics.routes_derived === derivedRoutes.length, derivedRoutes);
assert("copy_audit_zero_violations", derivedAudit.ok && derivedAudit.metrics.language_violations === 0 && derivedAudit.metrics.structured_social_proof_hits === 0, derivedAudit.problems);
assert(
  "copy_audit_live_measurement_is_reconciled",
  Object.entries(contract.money_page_scan.live_measurement || {}).every(([key, value]) => derivedAudit.metrics[key] === value),
  { recorded: contract.money_page_scan.live_measurement, live: derivedAudit.metrics },
);
assert("copy_audit_runner_exists", fs.existsSync(path.join(root, contract.public_implementation.audit_runner)), contract.public_implementation.audit_runner);
assert("copy_review_package_exists", fs.existsSync(path.join(root, contract.public_implementation.adversarial_review_package, "review.template.json")) && fs.existsSync(path.join(root, contract.public_implementation.adversarial_review_package, "differentiation.template.json")), contract.public_implementation.adversarial_review_package);

const triggerSections = [...catalogHtml.matchAll(/(<section[^>]+data-copy-clause="observable_trigger"[^>]*>)([\s\S]*?)(<\/section>)/g)];
assert("duplicate_mutation_has_two_targets", triggerSections.length >= 2, triggerSections.length);
if (triggerSections.length >= 2) {
  const second = triggerSections[1];
  const mutatedCatalog = `${catalogHtml.slice(0, second.index)}${second[1]}${triggerSections[0][2]}${second[3]}${catalogHtml.slice(second.index + second[0].length)}`;
  const mutatedAudit = auditCopyContract({ contract, registry, taskDoors, familyRegistry, catalogHtml: mutatedCatalog });
  assert(
    "duplicate_clause_mutation_fails_closed",
    !mutatedAudit.ok && mutatedAudit.problems.some((problem) => problem.startsWith("duplicate_copy_clause:observable_trigger:")),
    mutatedAudit.problems,
  );
}

/* ---------- 5. excecoes de portao documentadas no proprio arquivo ---------- */
const exceptions = contract.gate_exceptions || [];
const exceptionById = new Map(exceptions.map((e) => [e.id, e]));
assert("gate_exceptions_present", exceptions.length >= 4, exceptions.length);
for (const e of exceptions) {
  assert(`gate_exception_has_rule_${e.id}`, typeof e.rule === "string" && e.rule.length > 20, e);
  assert(`gate_exception_has_scope_${e.id}`, typeof e.scope === "string" && e.scope.length > 0, e);
  assert(
    `gate_exception_declares_implementation_${e.id}`,
    typeof e.implemented_as === "string" ||
      (e.implemented_as === null && typeof e.not_implemented_reason === "string"),
    e,
  );
}
const negation = exceptionById.get("GX-01");
assert(
  "gx01_negation_window",
  negation &&
    negation.implemented_as === "explicit_negation_or_exclusion_structure" &&
    typeof negation.window_chars === "number" &&
    Array.isArray(negation.negation_markers) &&
    negation.negation_markers.includes("sem") &&
    negation.negation_markers.includes("nao"),
  negation,
);
const alias = exceptionById.get("GX-02");
assert(
  "gx02_previous_name_is_history_not_claim",
  alias && /hist[oó]rico/i.test(alias.rule) &&
    alias.implemented_as === "offer_naming_alias_join" &&
    alias.state === "IMPLEMENTED_NOT_EXERCISED",
  alias,
);
const guarantee = exceptionById.get("GX-03");
assert(
  "gx03_guarantee_promise_forms",
  guarantee &&
    guarantee.implemented_as === "guarantee_promise_forms" &&
    Array.isArray(guarantee.promise_forms) &&
    guarantee.promise_forms.includes("garantia de") &&
    guarantee.promise_forms.includes("garantimos") &&
    guarantee.market_institute_forms.includes("garantia de proposta") &&
    guarantee.market_institute_forms.includes("garantia contratual"),
  guarantee,
);
const registered = exceptionById.get("GX-04");
const fl360 = termEntries.find((entry) => entry.id === "FL-06");
assert(
  "gx04_registered_public_name",
  registered &&
    registered.implemented_as === "registered_public_name_prefix" &&
    Array.isArray(registered.registered_public_names) &&
    registered.registered_public_names.length > 0,
  registered,
);
const frozenRoute = exceptionById.get("GX-05");
const frozenHtml = fs.readFileSync(path.join(root, "diagnostico-b2g-360/index.html"), "utf8");
assert(
  "gx05_is_exact_hash_pinned_frozen_route",
  frozenRoute &&
    frozenRoute.implemented_as === "hash_pinned_frozen_route_occurrence" &&
    frozenRoute.route === "/diagnostico-b2g-360/" &&
    frozenRoute.forbidden_id === "FL-06" &&
    frozenRouteExemption(fl360, frozenRoute.route, frozenHtml, contract) === "hash_pinned_frozen_route" &&
    frozenRouteExemption(fl360, frozenRoute.route, `${frozenHtml}\n`, contract) === null,
  frozenRoute,
);
const registeredLeakText = normalize("Diagnóstico B2G 360° é o nome. Nesta página, 360° resolve tudo.");
const registeredLeakIndex = registeredLeakText.lastIndexOf("360°");
assert(
  "gx04_does_not_exempt_term_elsewhere_on_registered_route",
  classifyOccurrence(
    fl360,
    registeredLeakText,
    registeredLeakIndex,
    "360°",
    contract,
    auditRegisteredNameRanges(registeredLeakText, registered.registered_public_names),
  ) === null,
  registeredLeakText,
);
const flGuarantee = termEntries.find((entry) => entry.id === "FL-08");
const crossSentenceText = normalize("Não prometemos resultado. Garantimos vitória.");
const crossSentenceIndex = crossSentenceText.indexOf("garantimos");
assert(
  "gx01_negation_does_not_cross_sentence_boundary",
  classifyOccurrence(flGuarantee, crossSentenceText, crossSentenceIndex, "garantimos", contract, [], []) === null,
  crossSentenceText,
);
const exclusionHtml = "<section><h3>Não inclui</h3><ul><li>Garantia de vitória.</li></ul></section>";
const exclusionText = normalize(visibleText(exclusionHtml));
const exclusionIndex = exclusionText.indexOf("garantia");
assert(
  "gx01_recognizes_explicit_exclusion_structure",
  classifyOccurrence(
    flGuarantee,
    exclusionText,
    exclusionIndex,
    "garantia",
    contract,
    [],
    explicitExclusionRanges(exclusionHtml, exclusionText),
  ) === "explicit_exclusion",
  exclusionText,
);
// toda excecao citada por uma entrada proibida precisa existir
for (const entry of termEntries) {
  for (const exId of entry.exemption_ids) {
    assert(`exemption_id_resolves_${entry.id}_${exId}`, exceptionById.has(exId), exId);
  }
}
const precedence = contract.money_page_scan?.exemption_precedence || [];
assert(
  "exemption_precedence_declared",
  precedence.length === 4 && precedence.every((id) => exceptionById.has(id)),
  precedence,
);

/* ---------- 6. varredura viva das paginas de dinheiro ---------- */
const scan = contract.money_page_scan;
const pages = scan?.pages || [];
const REQUIRED_PAGES = [
  "entregas/index.html",
  "servicos-obras-publicas/index.html",
  "problemas-que-resolvemos/index.html",
  "diagnostico-b2g-expansao/index.html",
];
for (const p of REQUIRED_PAGES) assert(`scan_covers_${p}`, pages.includes(p), pages);
const caseDirs = fs
  .readdirSync(path.join(root, "casos"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith("modelo-"))
  .map((d) => `casos/${d.name}/index.html`)
  .sort();
assert("eight_case_models_on_disk", caseDirs.length === 8, caseDirs);
for (const p of caseDirs) assert(`scan_covers_${p}`, pages.includes(p), pages);
assert("scan_page_count", pages.length === 12, pages.length);

const negationMarkers = negation?.negation_markers || [];
const negationWindow = negation?.window_chars || 0;
const negationRe = new RegExp(`\\b(${negationMarkers.map((m) => m.replace(/\s/g, "\\s")).join("|")})\\b`);
const promiseForms = guarantee?.promise_forms || [];
const registeredNames = (registered?.registered_public_names || []).map(normalize);

function registeredNameRanges(normText) {
  const ranges = [];
  for (const name of registeredNames) {
    let i = 0;
    while ((i = normText.indexOf(name, i)) !== -1) {
      ranges.push([i, i + name.length]);
      i += name.length;
    }
  }
  return ranges;
}

function classify(entry, normText, index, matched, ranges) {
  const exemptionIds = entry.exemption_ids || [];
  if (exemptionIds.includes("GX-04") && ranges.some(([a, b]) => index >= a && index < b)) return "GX-04";
  if (exemptionIds.includes("GX-03")) {
    const tail = normText.slice(index, index + matched.length + 4);
    const instituteTail = normText.slice(index, index + matched.length + 24);
    const isMarketInstitute = (guarantee?.market_institute_forms || []).some((form) => instituteTail.startsWith(normalize(form)));
    const isPromiseForm =
      promiseForms.some((f) => normalize(f) === matched) ||
      promiseForms.some((f) => normalize(f) === tail.slice(0, normalize(f).length));
    if (isMarketInstitute) return "GX-03";
    if (!isPromiseForm) return "GX-03";
  }
  if (exemptionIds.includes("GX-01")) {
    const before = normText.slice(Math.max(0, index - negationWindow), index);
    if (negationRe.test(before)) return "GX-01";
  }
  return null;
}

const liveBoundaries = new Map(); // `${page}|${forbiddenId}` -> {total, byExemption}
const liveViolations = [];
const liveObservations = [];
for (const rel of pages) {
  const abs = path.join(root, rel);
  assert(`page_exists_${rel}`, fs.existsSync(abs), abs);
  if (!fs.existsSync(abs)) continue;
  const html = fs.readFileSync(abs, "utf8");
  const normText = normalize(visibleText(html));
  const ranges = registeredNameRanges(normText);
  for (const entry of termEntries) {
    const re = new RegExp(entry.pattern, "g");
    let m;
    while ((m = re.exec(normText)) !== null) {
      const exemption = classify(entry, normText, m.index, m[0], ranges);
      if (exemption) {
        const key = `${rel}|${entry.id}`;
        if (!liveBoundaries.has(key)) liveBoundaries.set(key, { total: 0, byExemption: {} });
        const bucket = liveBoundaries.get(key);
        bucket.total += 1;
        bucket.byExemption[exemption] = (bucket.byExemption[exemption] || 0) + 1;
      } else {
        const finding = {
          page: rel,
          forbidden_id: entry.id,
          matched: m[0],
          context: visibleText(html).slice(Math.max(0, m.index - 70), m.index + 90),
        };
        if (entry.finding_kind === "count_only") liveObservations.push(finding);
        else liveViolations.push(finding);
      }
    }
  }
}

// toda violacao viva precisa estar registrada como achado datado com state MEASURED_FAIL
const recordedViolations = scan?.violations || [];
for (const rec of recordedViolations) {
  assert(
    `recorded_violation_is_dated_measured_fail_${rec.id || rec.page}`,
    rec.state === "MEASURED_FAIL" && typeof rec.measured_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rec.measured_at),
    rec,
  );
}
for (const v of liveViolations) {
  const registered = recordedViolations.some(
    (rec) => rec.page === v.page && rec.forbidden_id === v.forbidden_id,
  );
  assert(`live_violation_is_registered_${v.page}_${v.forbidden_id}`, registered, v);
}
// e o inverso: nao se registra violacao que nao existe mais
for (const rec of recordedViolations) {
  assert(
    `recorded_violation_still_live_${rec.id || rec.page}`,
    liveViolations.some((v) => v.page === rec.page && v.forbidden_id === rec.forbidden_id),
    rec,
  );
}
// observacoes tambem precisam estar registradas, nos dois sentidos
const recordedObservations = scan?.observations || [];
for (const o of liveObservations) {
  assert(
    `live_observation_is_registered_${o.page}_${o.forbidden_id}`,
    recordedObservations.some((rec) => rec.page === o.page && rec.forbidden_id === o.forbidden_id),
    o,
  );
}
for (const rec of recordedObservations) {
  assert(
    `recorded_observation_still_live_${rec.id || rec.page}`,
    liveObservations.some((o) => o.page === rec.page && o.forbidden_id === rec.forbidden_id),
    rec,
  );
}
assert(
  "scan_declares_finding_kinds",
  scan?.finding_kinds?.violation && scan?.finding_kinds?.count_only,
  scan?.finding_kinds,
);
assert(
  "scan_state_matches_violations",
  (liveViolations.length === 0 && scan?.state === "MEASURED_PASS") ||
    (liveViolations.length > 0 && scan?.state === "MEASURED_FAIL"),
  { live: liveViolations.length, state: scan?.state },
);
assert(
  "scan_is_dated",
  typeof scan?.measured_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(scan.measured_at),
  scan?.measured_at,
);

// O baseline preservado precisa continuar íntegro, mas não funciona como allowlist:
// o audit derivado acima é a autoridade para todas as rotas e contagens vivas.
const recordedBoundaries = scan?.boundaries || [];
const recordedByKey = new Map(recordedBoundaries.map((b) => [`${b.page}|${b.forbidden_id}`, b]));
assert(
  "boundary_keys_unique",
  recordedByKey.size === recordedBoundaries.length,
  recordedBoundaries.length,
);
for (const [key, rec] of recordedByKey) {
  assert(
    `historical_boundary_has_positive_measurement_${key}`,
    Number.isInteger(rec.occurrences) && rec.occurrences > 0 && Object.values(rec.by_exemption || {}).every((count) => Number.isInteger(count) && count > 0),
    rec,
  );
  assert(
    `historical_boundary_has_evidence_${key}`,
    typeof rec.evidence === "string" && rec.evidence.length > 20,
    rec.evidence,
  );
}
// a varredura precisa ter encontrado alguma coisa: um portao que nao ve nada nao prova nada
assert("scan_found_occurrences", liveBoundaries.size > 0, liveBoundaries.size);
// nenhum termo isolado do nucleo da issue pode aparecer sem excecao
assert("no_unexempted_forbidden_term", liveViolations.length === 0, liveViolations.slice(0, 5));

/* ---------- 7. sem prova social estruturada ---------- */
const bannedTypes = contract.structured_data_ban?.forbidden_types || [];
assert(
  "structured_data_ban_declared",
  bannedTypes.includes("Review") && bannedTypes.includes("AggregateRating"),
  bannedTypes,
);
let socialProofHits = 0;
for (const rel of pages) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) continue;
  const html = fs.readFileSync(abs, "utf8");
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script[^>]*>/gi)];
  const types = [];
  for (const block of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(block[1]);
    } catch (err) {
      assert(`ld_json_parses_${rel}`, false, String(err));
      continue;
    }
    const stack = [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) stack.push(...node);
      else if (node && typeof node === "object") {
        const t = node["@type"];
        if (typeof t === "string") types.push(t);
        else if (Array.isArray(t)) types.push(...t);
        stack.push(...Object.values(node));
      }
    }
  }
  const hits = types.filter((t) => bannedTypes.includes(t));
  socialProofHits += hits.length;
  assert(`no_social_proof_schema_${rel}`, hits.length === 0, hits);
  // a prova social tambem nao pode entrar por texto solto de microdado
  assert(
    `no_social_proof_microdata_${rel}`,
    !/itemtype=["'][^"']*schema\.org\/(Review|AggregateRating)/i.test(html),
    rel,
  );
}
assert(
  "structured_data_check_matches_measurement",
  scan?.structured_data_check?.occurrences === socialProofHits &&
    scan.structured_data_check.state === (socialProofHits === 0 ? "MEASURED_PASS" : "MEASURED_FAIL"),
  { recorded: scan?.structured_data_check, live: socialProofHits },
);

/* ---------- 8. sem travessao e sem promessa de entrega no proprio arquivo ---------- */
const EM_DASH = String.fromCharCode(0x2014);
assert("no_em_dash_in_contract", !raw.includes(EM_DASH), "travessao encontrado");
assert(
  "declares_remaining_human_work",
  Array.isArray(contract.not_delivered_by_this_pr) &&
    contract.not_delivered_by_this_pr.length >= 4 &&
    contract.not_delivered_by_this_pr.some((s) =>
      /revisão adversarial[\s\S]*não foi executada/i.test(s),
    ),
  contract.not_delivered_by_this_pr,
);

const failed = results.filter((r) => !r.ok);
console.log(`copy-contract: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(JSON.stringify({ failed: failed.length, results: failed }, null, 2));
  process.exit(1);
}
