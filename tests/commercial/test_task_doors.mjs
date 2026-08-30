/**
 * Gate da arquitetura de navegação por tarefa (issue #335).
 *
 * Prova, contra o proprio JSON e contra artefatos ja publicados em main,
 * que o rol taxativo de 54 entregaveis tem contagem inequivoca:
 * sete portas, uniao exata de 01 a 54, uma unica aparicao primaria por item,
 * disclosure progressiva onde a tela passa de seis opcoes, encontrabilidade
 * declarada e nenhuma das oito entregas atuais removida.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const DATA_REL = "data/commercial/task-doors.v1.json";
const dataPath = path.join(root, DATA_REL);
const raw = fs.readFileSync(dataPath, "utf8");
const doc = JSON.parse(raw);

const results = [];
function assert(name, cond, detail) {
  results.push({ name, ok: Boolean(cond), detail });
  if (!cond) console.error("FAIL", name, JSON.stringify(detail));
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ------------------------------------------------------------------ *
 * Fonte: secao "Arquitetura primaria por tarefa" da issue #335.
 * Os numeros de item sao transcritos da issue, nao derivados do JSON.
 * ------------------------------------------------------------------ */
const ISSUE_DOORS = [
  { door: "GROW", order: 1, count: 12, items: ["01","02","03","04","05","06","07","08","09","10","11","45"] },
  { door: "QUALIFY", order: 2, count: 8, items: ["12","13","14","15","26","30","43","44"] },
  { door: "PROPOSE", order: 3, count: 11, items: ["16","27","28","29","39","49","50","51","52","53","54"] },
  { door: "START", order: 4, count: 3, items: ["33","34","35"] },
  { door: "PROTECT", order: 5, count: 11, items: ["17","18","19","20","21","22","23","25","40","41","42"] },
  { door: "CLOSE", order: 6, count: 5, items: ["31","32","36","37","38"] },
  { door: "CAPABILITY", order: 7, count: 4, items: ["24","46","47","48"] },
];
const ISSUE_COUNTS = ISSUE_DOORS.map((d) => d.count);
const MAX_OPTIONS = 6;
const CATALOG_SIZE = 54;

/* 1. Identidade do documento -------------------------------------- */
assert("schema_id", doc.schema === "confenge.commercial.task_doors.v1", doc.schema);
assert("implementation_contract_v2", doc.version === "2.0.0", doc.version);
assert("source_issue_335", doc.source_issue === 335, doc.source_issue);
assert("parent_issue_329", doc.parent_issue === 329, doc.parent_issue);
assert("decision_state_not_validated", doc.decision_state === "VALIDATE", doc.decision_state);

/* 2. Sete portas, ordem 1 a 7 sem lacuna nem repeticao ------------- */
const doors = Array.isArray(doc.doors) ? doc.doors : [];
assert("seven_doors", doors.length === 7, doors.length);
assert(
  "door_ids_match_issue",
  eq(doors.map((d) => d.door), ISSUE_DOORS.map((d) => d.door)),
  doors.map((d) => d.door),
);
const orders = doors.map((d) => d.order);
assert("orders_are_1_to_7", eq([...orders].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]), orders);
assert("orders_unique", new Set(orders).size === orders.length, orders);
assert("orders_follow_array_position", orders.every((o, i) => o === i + 1), orders);

/* 3. Uniao dos membros: exatamente 01 a 54, uma vez cada ----------- */
const allItems = [];
for (const d of doors) for (const m of d.members || []) allItems.push(m.item);
const expectedItems = Array.from({ length: CATALOG_SIZE }, (_, i) => String(i + 1).padStart(2, "0"));
const unique = new Set(allItems);
const duplicates = allItems.filter((it, i) => allItems.indexOf(it) !== i);
const missing = expectedItems.filter((it) => !unique.has(it));
const extra = [...unique].filter((it) => !expectedItems.includes(it));
assert("union_size_54", allItems.length === CATALOG_SIZE, allItems.length);
assert("no_duplicate_primary_placement", duplicates.length === 0, duplicates);
assert("no_missing_item", missing.length === 0, missing);
assert("no_item_outside_01_54", extra.length === 0, extra);
assert("all_items_two_digit_padded", allItems.every((it) => /^[0-9]{2}$/.test(it)), allItems.filter((it) => !/^[0-9]{2}$/.test(it)));
assert("catalog_deliverable_count_54", doc.catalog.deliverable_count === CATALOG_SIZE, doc.catalog.deliverable_count);
assert("catalog_bounds_01_54", doc.catalog.item_id_first === "01" && doc.catalog.item_id_last === "54", [doc.catalog.item_id_first, doc.catalog.item_id_last]);

/* 4. Contagens por porta iguais as publicadas na issue ------------- */
const counts = doors.map((d) => (d.members || []).length);
assert("per_door_counts_match_issue", eq(counts, ISSUE_COUNTS), { counts, expected: ISSUE_COUNTS });
assert("counts_sum_54", counts.reduce((a, b) => a + b, 0) === CATALOG_SIZE, counts);
assert(
  "declared_member_count_matches_array",
  doors.every((d) => d.member_count === (d.members || []).length),
  doors.map((d) => [d.door, d.member_count, (d.members || []).length]),
);
for (const spec of ISSUE_DOORS) {
  const found = doors.find((d) => d.door === spec.door);
  assert(
    `membership_${spec.door.toLowerCase()}`,
    found && eq([...found.members.map((m) => m.item)].sort(), [...spec.items].sort()),
    found ? found.members.map((m) => m.item) : null,
  );
  assert(`order_${spec.door.toLowerCase()}`, found && found.order === spec.order, found && found.order);
}

/* 5. Crosswalk item <-> deliverable_id da familia ------------------ */
const badCrosswalk = [];
for (const d of doors) {
  for (const m of d.members || []) {
    if (m.deliverable_id !== `${doc.catalog.deliverable_id_prefix}${m.item}`) badCrosswalk.push(m);
  }
}
assert("item_to_deliverable_id_crosswalk", badCrosswalk.length === 0, badCrosswalk);
const ids = allItems.map((it) => `${doc.catalog.deliverable_id_prefix}${it}`);
assert("deliverable_ids_unique", new Set(ids).size === CATALOG_SIZE, ids.length);

/* 6. Disclosure progressiva acima de seis opcoes ------------------- */
for (const d of doors) {
  const n = (d.members || []).length;
  const pd = d.progressive_disclosure || {};
  assert(
    `disclosure_flag_${d.door.toLowerCase()}`,
    pd.required === n > MAX_OPTIONS,
    { door: d.door, members: n, required: pd.required },
  );
  if (n > MAX_OPTIONS) {
    const subs = pd.subgroups || [];
    assert(`disclosure_has_subgroups_${d.door.toLowerCase()}`, subs.length >= 2, subs.length);
    const subItems = subs.flatMap((s) => s.items || []);
    assert(
      `subgroups_partition_${d.door.toLowerCase()}`,
      eq([...subItems].sort(), [...d.members.map((m) => m.item)].sort()) && new Set(subItems).size === subItems.length,
      subItems,
    );
    assert(
      `subgroup_screen_limit_${d.door.toLowerCase()}`,
      subs.every((s) => (s.items || []).length >= 1 && s.items.length <= MAX_OPTIONS),
      subs.map((s) => [s.subgroup_id, (s.items || []).length]),
    );
    assert(
      `subgroup_decisive_difference_${d.door.toLowerCase()}`,
      subs.every((s) => typeof s.label_pt_br === "string" && s.label_pt_br.length > 3
        && typeof s.decisive_difference_pt_br === "string" && s.decisive_difference_pt_br.length > 20),
      subs.map((s) => s.subgroup_id),
    );
    assert(
      `subgroup_ids_unique_${d.door.toLowerCase()}`,
      new Set(subs.map((s) => s.subgroup_id)).size === subs.length,
      subs.map((s) => s.subgroup_id),
    );
  } else {
    assert(`no_subgroup_needed_${d.door.toLowerCase()}`, (pd.subgroups || []).length === 0, pd.subgroups);
  }
}
assert("max_options_per_screen_is_6", doc.interaction_rules.max_options_per_screen === MAX_OPTIONS, doc.interaction_rules.max_options_per_screen);
assert("stage_selector_exemption_declared", doc.interaction_rules.stage_selector_exempt === true
  && typeof doc.interaction_rules.max_options_scope_pt_br === "string"
  && doc.interaction_rules.max_options_scope_pt_br.length > 40, doc.interaction_rules.max_options_scope_pt_br);

/* 7. Rotulo publico e pergunta de decisao por tarefa --------------- */
const INTERNAL_JARGON = ["departamento", "setor interno", "squad", "backlog", "registry", "organograma", "cfg-d", "pipeline interno", "sprint"];
for (const d of doors) {
  const label = d.public_label_pt_br || "";
  const question = d.decision_question_pt_br || "";
  assert(`label_present_${d.door.toLowerCase()}`, label.length >= 12, label);
  assert(`question_is_question_${d.door.toLowerCase()}`, question.trim().endsWith("?"), question);
  assert(`question_length_${d.door.toLowerCase()}`, question.length >= 25, question.length);
  const blob = `${label} ${question}`.toLowerCase();
  assert(
    `no_internal_jargon_${d.door.toLowerCase()}`,
    !INTERNAL_JARGON.some((w) => blob.includes(w)),
    INTERNAL_JARGON.filter((w) => blob.includes(w)),
  );
  assert(`label_not_equal_door_id_${d.door.toLowerCase()}`, label.toUpperCase() !== d.door, label);
}
assert("labels_unique", new Set(doors.map((d) => d.public_label_pt_br)).size === 7, doors.map((d) => d.public_label_pt_br));
assert("questions_unique", new Set(doors.map((d) => d.decision_question_pt_br)).size === 7, "questions");

/* 8. Encontrabilidade exigida pela issue --------------------------- */
const f = doc.findability || {};
const idx = f.numbered_index || {};
assert("index_numbered", idx.numbered === true, idx.numbered);
assert("index_searchable", idx.searchable === true, idx.searchable);
assert("index_keyboard_accessible", idx.keyboard_accessible === true, idx.keyboard_accessible);
assert("index_two_views", eq(idx.views, ["por_tarefa", "alfabetica"]), idx.views);
assert("index_count_derived_from_registry", idx.count_derived_from_registry === true, idx.count_derived_from_registry);
assert(
  "index_per_item_fields",
  ["deep_link", "public_state", "price"].every((k) => (idx.per_item_fields_required || []).includes(k)),
  idx.per_item_fields_required,
);
assert("index_route_is_canonical_deliverables", idx.route === "/entregas/", idx.route);
assert("deep_link_required_per_item", f.deep_link && f.deep_link.required_per_item === true, f.deep_link);
assert("deep_link_pattern_is_stable", f.deep_link && f.deep_link.pattern === "#entrega-{NN}", f.deep_link);
const sec = f.secondary_access || {};
assert("secondary_access_label", sec.label_pt_br === "Registrar a decisão na mesa", sec.label_pt_br);
assert("secondary_access_on_first_fold", sec.location === "primeira_dobra" && sec.target === "captura_entregas", sec);
assert("secondary_access_without_js", sec.requires_javascript === false, sec.requires_javascript);
assert("first_fold_secondary_matches_findability", doc.first_fold.secondary_access_label_pt_br === sec.label_pt_br, doc.first_fold.secondary_access_label_pt_br);
assert("first_fold_primary_cta", doc.first_fold.cta_primary_label_pt_br === "Encontrar a entrega certa", doc.first_fold.cta_primary_label_pt_br);
assert("first_fold_viewports", eq(doc.first_fold.viewports, ["390x844", "1366x768"]) && doc.first_fold.no_scroll_required === true, doc.first_fold.viewports);
const un = f.unmapped_request || {};
assert("unmapped_falls_back_to_item_48", un.fallback_item === "48", un.fallback_item);
assert("unmapped_fallback_id_matches", un.fallback_deliverable_id === "CFG-D48", un.fallback_deliverable_id);
const capability = doors.find((d) => d.door === "CAPABILITY");
assert("item_48_is_a_primary_member", capability && capability.members.some((m) => m.item === "48"), capability && capability.members.map((m) => m.item));
assert("unmapped_refusal_allowed", un.refusal_allowed === true, un.refusal_allowed);
assert("unmapped_statement_explicit", typeof un.statement_pt_br === "string" && un.statement_pt_br.includes("48") && /recusad/i.test(un.statement_pt_br), un.statement_pt_br);
assert(
  "no_offer_only_in_form_footer_chat",
  ["formulario", "rodape", "conversa"].every((k) => (f.no_offer_exists_only_in || []).includes(k)),
  f.no_offer_exists_only_in,
);
const sd = f.state_display_rule || {};
assert("blocked_validate_never_buyable", eq(sd.states_not_purchasable, ["BLOCKED", "VALIDATE"]) && sd.never_presented_as_buyable === true && sd.requires_explanation === true, sd);

/* 9. Faixa de preco geral ----------------------------------------- */
const pb = doc.price_band || {};
assert("price_band_currency", pb.currency === "BRL", pb.currency);
assert("price_band_min_599", pb.min_brl === 599, pb.min_brl);
assert("price_band_max_39800", pb.max_brl === 39800, pb.max_brl);
assert("price_band_display_matches", typeof pb.display_pt_br === "string" && pb.display_pt_br.includes("599") && pb.display_pt_br.includes("39.800"), pb.display_pt_br);
assert("price_band_recurrence_disclosed", pb.recurrence_disclosure_required === true, pb.recurrence_disclosure_required);
const vitrine = doc.public_vitrine || {};
assert("public_vitrine_count_8", vitrine.count === 8, vitrine.count);
assert("public_vitrine_band_599_3750", vitrine.min_brl === 599 && vitrine.max_brl === 3750 && vitrine.price_band_display_pt_br === "R$ 599 a R$ 3.750", vitrine);
assert("public_vitrine_has_no_filters", vitrine.filters === false, vitrine.filters);
assert("public_vitrine_primary_fields", eq(vitrine.primary_card_fields_pt_br, ["situação", "decisão", "entrada", "objeto e limite", "saída", "SLA", "preço", "pacote e crédito"]), vitrine.primary_card_fields_pt_br);

/* 10. Enquadramento, recomendacao, filtros e comparacao ------------ */
const ir = doc.interaction_rules;
assert("framing_three_steps", (ir.framing_steps || []).length === 3, (ir.framing_steps || []).length);
assert("framing_steps_are_questions", ir.framing_steps.every((s) => String(s.question_pt_br).trim().endsWith("?")), ir.framing_steps.map((s) => s.question_pt_br));
assert("framing_step1_has_seven_doors", ir.framing_steps[0].option_count === doors.length && ir.framing_steps[0].option_count === 7, ir.framing_steps[0]);
assert("framing_step_options_match_count", ir.framing_steps.every((s) => !s.options_pt_br || s.options_pt_br.length === s.option_count), ir.framing_steps.map((s) => s.option_count));
const ro = ir.recommendation_output || {};
assert("recommendation_one_plus_two", ro.primary_max === 1 && ro.alternatives_max === 2, ro);
assert("recommendation_human_review", ro.human_review_required === true && ro.automatic_fit_promised === false, ro);
assert("recommendation_fields", (ro.fields_required_pt_br || []).length === 5, ro.fields_required_pt_br);
const fl = ir.filters || {};
assert("filter_dimensions", eq(fl.dimensions, ["tarefa", "objeto", "urgencia_segura", "preco", "contratacao", "estado"]), fl.dimensions);
assert("filters_progressive_enhancement", fl.progressive_enhancement === true && fl.works_without_javascript === true, fl);
assert("filters_url_state_and_clear", fl.url_preserves_state === true && fl.clear_filters_always_visible === true, fl);
assert("filters_no_silent_empty", fl.empty_result_requires_guidance === true, fl.empty_result_requires_guidance);
const cp = ir.comparison || {};
assert("comparison_two_to_four", cp.min_selection === 2 && cp.max_selection === 4, cp);
assert("comparison_nine_columns", (cp.columns_pt_br || []).length === 9, cp.columns_pt_br);
assert("comparison_deep_link", cp.deep_link_reproduces_selection === true, cp.deep_link_reproduces_selection);
assert("comparison_mobile_not_horizontal_table", cp.mobile_layout === "blocos_empilhados_por_criterio", cp.mobile_layout);
assert("eight_current_comparison_still_owned_by_295", cp.eight_current_comparison_owner === "#295", cp.eight_current_comparison_owner);

/* 11. Nenhum item atual removido: cruzamento com entregas/index.html */
const legacy = doc.legacy_eight_preserved || {};
const entregasPath = path.join(root, legacy.source_file || "entregas/index.html");
assert("entregas_page_exists", fs.existsSync(entregasPath), entregasPath);
const entregas = fs.existsSync(entregasPath) ? fs.readFileSync(entregasPath, "utf8") : "";
assert("legacy_has_eight_items", (legacy.items || []).length === 8, (legacy.items || []).length);
assert("legacy_removal_forbidden", legacy.removal_allowed === false, legacy.removal_allowed);
assert("legacy_items_are_01_to_08", eq((legacy.items || []).map((i) => i.item), ["01","02","03","04","05","06","07","08"]), (legacy.items || []).map((i) => i.item));
for (const item of legacy.items || []) {
  assert(
    `legacy_${item.item}_still_on_page`,
    entregas.includes(item.public_name),
    item.public_name,
  );
  assert(
    `legacy_${item.item}_anchor_present`,
    entregas.includes(`id="${item.heading_id}"`),
    item.heading_id,
  );
  const owner = doors.find((d) => d.members.some((m) => m.item === item.item));
  assert(`legacy_${item.item}_has_a_door`, Boolean(owner), owner && owner.door);
  assert(
    `legacy_${item.item}_crosswalk`,
    item.deliverable_id === `${doc.catalog.deliverable_id_prefix}${item.item}`,
    item.deliverable_id,
  );
}
assert("legacy_names_unique", new Set((legacy.items || []).map((i) => i.public_name)).size === 8, "legacy names");

/* 12. Superficie progressiva publicada ---------------------------- */
const catalogScriptPath = path.join(root, "entregas/catalog.js");
const catalogLoaderPath = path.join(root, "entregas/catalog-bootstrap.js");
const catalogDataPath = path.join(root, "entregas/catalog-data.js");
const catalogStylePath = path.join(root, "entregas/styles.css");
const catalogScript = fs.readFileSync(catalogScriptPath, "utf8");
const catalogLoader = fs.readFileSync(catalogLoaderPath, "utf8");
const catalogDataScript = fs.readFileSync(catalogDataPath, "utf8");
const catalogDataMatch = /^window\.CONFENGE_CATALOG_DATA=(\{.*\});\s*$/.exec(catalogDataScript);
const catalogData = catalogDataMatch ? JSON.parse(catalogDataMatch[1]) : null;
const catalogStyle = fs.readFileSync(catalogStylePath, "utf8");
const implementation = doc.public_implementation || {};
assert("implementation_route", implementation.route === "/entregas/", implementation.route);
assert("implementation_artifacts_exist", [implementation.renderer, implementation.client_loader, implementation.client_script, implementation.client_data_asset, implementation.stylesheet].every((file) => fs.existsSync(path.join(root, file))), implementation);
assert("implementation_declares_no_retired_stylesheet", implementation.client_stylesheet === undefined && !fs.existsSync(path.join(root, "entregas/catalog.css")), implementation.client_stylesheet);
assert("implementation_counts_and_steps", implementation.published_offer_count === 8 && implementation.capability_roll_count === 54 && implementation.capability_group_count === 7 && implementation.primary_representation_per_offer === 1 && implementation.framing_steps === 1, implementation);
assert("implementation_has_no_public_filters", eq(implementation.filter_dimensions, []) && implementation.alphabetical_view === false, implementation.filter_dimensions);
assert("implementation_uses_native_progressive_disclosure", implementation.progressive_disclosure === "native_details_by_task", implementation.progressive_disclosure);
assert("implementation_has_one_complete_primary_card", implementation.comparison?.mode === "single_primary_card" && implementation.comparison?.duplicated_representation === false && implementation.comparison?.mobile_hides_essential_fields === false, implementation.comparison);
assert("implementation_fail_closed", implementation.terminal_capture === true && implementation.human_validation === "NOT_STARTED", implementation);
assert("implementation_no_new_analytics_dimensions", implementation.new_analytics_dimensions === false, implementation.new_analytics_dimensions);
assert("hero_decision_h1", entregas.includes("8 ofertas publicadas") && entregas.includes("Escolha pela decisão que está na mesa"), "hero");
assert("hero_synthetic_disclosure", entregas.includes("exemplos sintéticos de resultados de clientes"), "synthetic disclosure");
assert("hero_public_price_band", entregas.includes("R$ 599 a R$ 3.750") && !entregas.includes("R$ 39.800"), "price range");
assert("hero_primary_and_secondary_access", entregas.includes(">Encontrar a entrega certa ") && entregas.includes(">Registrar a decisão na mesa</a>"), "hero actions");
assert("public_vitrine_has_8_cards", (entregas.match(/<article class="vitrine-item/g) || []).length === 8, (entregas.match(/<article class="vitrine-item/g) || []).length);
assert("public_vitrine_has_published_deep_links", ["01","02","03","04","05","06","07","08"].every((item) => entregas.includes(`id="entrega-${item}"`)), "deep links");
assert("public_vitrine_omits_backlog_deep_links", expectedItems.slice(8).every((item) => !entregas.includes(`id="entrega-${item}"`)), "backlog deep links");
assert("public_page_has_no_filter_chrome", !entregas.includes("data-filter=") && !entregas.includes("data-catalog-filters"), "filters");
const primaryOfferHtml = entregas.match(/<div class="vitrine-items">([\s\S]*?)<dl class="compare-ladder-figures">/)?.[1] || "";
assert("public_page_has_one_complete_primary_representation", !entregas.includes('id="comparar"') && (primaryOfferHtml.match(/data-primary-offer="true"/g) || []).length === 8 && ["Situação", "Decisão", "Entrada", "Objeto e limite", "Saída", "SLA"].every((label) => (primaryOfferHtml.match(new RegExp(`<dt>${label}<\\/dt>`, "g")) || []).length === 8), "primary cards");
assert("public_page_separates_capability_states", entregas.includes("54 capacidades do rol taxativo") && entregas.includes("44 em validação") && entregas.includes("2 bloqueadas") && !primaryOfferHtml.includes("Em validação"), "state separation");
assert("public_role_has_exact_census", (entregas.match(/data-capability-id="CFG-D\d{2}"/g) || []).length === 54 && (entregas.match(/class="capability-item capability-item--validate"/g) || []).length === 44 && (entregas.match(/class="capability-item capability-item--blocked"/g) || []).length === 2, "capability census");
assert("catalog_data_has_exact_schema", catalogData?.schema === "confenge.public-deliverable-catalog/1.1", catalogData?.schema);
assert("catalog_data_has_declared_fields", eq(catalogData?.fields, ["id", "name", "trigger", "decision", "unit", "input", "inputKinds", "inputCount", "decisionBusinessDays", "output", "sla", "price", "exclusion", "stepUp", "publicState", "contractHtml"]), catalogData?.fields);
assert("catalog_data_has_54_records", catalogData?.items?.length === CATALOG_SIZE, catalogData?.items?.length);
const catalogRecords = new Map((catalogData?.items || []).map((row) => [row[0], Object.fromEntries(catalogData.fields.map((field, index) => [field, row[index]]))]));
assert("catalog_data_ids_are_unique", catalogRecords.size === CATALOG_SIZE, catalogRecords.size);
assert("catalog_data_covers_internal_ids", expectedItems.every((item) => catalogRecords.has(`CFG-D${item}`)), "internal data join");
assert("public_html_joins_only_published_ids", ["01","02","03","04","05","06","07","08"].every((item) => entregas.includes(`data-deliverable-id="CFG-D${item}"`)), "published data-deliverable-id");
assert("catalog_data_exposes_comparison_dimensions", [...catalogRecords.values()].every((record) => ["trigger", "decision", "unit", "input", "output", "sla", "price", "exclusion", "stepUp"].every((field) => typeof record[field] === "string" && record[field].trim())), "comparison dimensions");
assert("catalog_data_exposes_framing_dimensions", [...catalogRecords.values()].every((record) => Array.isArray(record.inputKinds) && record.inputKinds.every((kind) => ["edital", "planilha", "documentos", "cronograma", "dados"].includes(kind)) && Number.isInteger(record.inputCount) && record.inputCount > 0 && (record.decisionBusinessDays === "" || (Number.isInteger(record.decisionBusinessDays) && record.decisionBusinessDays > 0))), "framing dimensions");
assert("catalog_data_exposes_54_complete_copy_contracts", [...catalogRecords.values()].every((record) => typeof record.contractHtml === "string" && (record.contractHtml.match(/data-copy-clause=/g) || []).length === 15), "copy contracts");
assert("public_page_does_not_load_backlog_catalog_js", !entregas.includes("/entregas/catalog-bootstrap.js") && !entregas.includes('src="/entregas/catalog-data.js"') && !entregas.includes('src="/entregas/catalog.js"'), "no public catalog js");
assert("catalog_data_and_behavior_are_lazy", catalogLoader.indexOf('data.src = "/entregas/catalog-data.js"') < catalogLoader.indexOf('behavior.src = "/entregas/catalog.js"'), "lazy script order");
assert("catalog_lazy_load_has_proximity_and_anchor_paths", catalogLoader.includes("IntersectionObserver") && catalogLoader.includes('rootMargin: "1200px 0px"') && catalogLoader.includes('a[href^="#"]') && catalogLoader.includes("location.hash"), "lazy activation");
assert("catalog_behavior_validates_exact_data_shape", catalogScript.includes("EXPECTED_FIELDS") && catalogScript.includes("payload.fields.length !== EXPECTED_FIELDS.length") && catalogScript.includes("payload.items.length !== cards.length") && catalogScript.includes("records.size !== cards.length"), "fail-closed client data");
assert("catalog_behavior_validates_exact_copy_contract", catalogScript.includes("EXPECTED_CONTRACT_CLAUSES") && catalogScript.includes("hasExactContract(row[15])") && catalogScript.includes("javascript:"), "fail-closed copy contract");
assert("catalog_contracts_hydrate_only_on_disclosure", catalogScript.includes('details.addEventListener("toggle"') && catalogScript.includes("hydrateContract(details)") && catalogScript.includes("recordFor(card)?.contractHtml"), "lazy copy contract");
assert("catalog_base_html_omits_deferred_contract_markup", !entregas.includes("data-copy-contract-id") && !entregas.includes("data-copy-clause"), "compact initial HTML");
assert("public_page_does_not_block_on_catalog_css", !entregas.includes("/entregas/catalog.css") && !catalogLoader.includes("catalog.css"), "catalog css");
assert("script_has_no_network_or_analytics_sink", !/(fetch\s*\(|XMLHttpRequest|sendBeacon|dataLayer\.push)/.test(catalogScript), "client script");
assert("loader_has_no_data_or_analytics_sink", !/(fetch\s*\(|XMLHttpRequest|sendBeacon|dataLayer\.push)/.test(catalogLoader), "client loader");
assert("style_uses_stacked_mobile_comparison", catalogStyle.includes(".vitrine-item__facts{display:block}") && catalogStyle.includes(".vitrine-item__facts>div{display:grid;grid-template-columns:78px minmax(0,1fr)"), "mobile comparison");
assert("base_style_excludes_progressive_catalog", !catalogStyle.includes(".catalog-recommendation__items") && !catalogStyle.includes(".catalog-compare-tray"), "blocking CSS boundary");

/* 13. Conteineres fora da contagem 01 a 54 ------------------------- */
const containers = doc.containers || [];
assert("two_containers", containers.length === 2 && doc.catalog.container_count === 2, containers.length);
assert("containers_not_counted", containers.every((c) => c.counted_in_01_54 === false), containers.map((c) => c.counted_in_01_54));
assert(
  "container_routes_exist_in_repo",
  containers.every((c) => typeof c.route === "string" && fs.existsSync(path.join(root, c.route.replace(/^\/|\/$/g, ""), "index.html"))),
  containers.map((c) => c.route),
);
assert(
  "diretoria_is_step_up_container",
  containers.some((c) => c.role === "step_up" && c.public_name_pt_br === "Diretoria Fracionada para o Mercado Público"),
  containers.map((c) => [c.container_id, c.role]),
);
assert("container_ids_unique", new Set(containers.map((c) => c.container_id)).size === 2, containers.map((c) => c.container_id));

/* 14. Nada declarado validado ------------------------------------- */
const hr = doc.human_research || {};
assert("research_not_started", hr.state === "NOT_STARTED", hr.state);
assert("research_no_sessions_yet", hr.sessions_completed === 0 && hr.sessions_planned === 20, hr);
assert("research_evidence_empty", Array.isArray(hr.evidence) && hr.evidence.length === 0, hr.evidence);
assert("research_ten_tasks", (hr.tasks_pt_br || []).length === 10, (hr.tasks_pt_br || []).length);
assert("research_targets_unobserved", (hr.targets || []).length === 7 && hr.targets.every((t) => t.observed === null), hr.targets);
assert("research_rejects_synthetic_user", hr.synthetic_user_accepted === false, hr.synthetic_user_accepted);
assert("research_failure_never_deletes_offer", /nunca apaga oferta/i.test(hr.failure_policy_pt_br || ""), hr.failure_policy_pt_br);

/* 15. Escopo declarado do que a mudanca nao entrega ---------------- */
const nd = doc.not_delivered_by_this_change_pt_br || [];
assert("not_delivered_declared", nd.length >= 3, nd.length);
assert("not_delivered_rejects_automatic_fit", nd.some((s) => /tela/i.test(s) && /não declara adequação automática/i.test(s)), nd);
assert("not_delivered_says_no_human_sessions", nd.some((s) => /sess(ã|a)o|sessões|sessoes/i.test(s)), nd);

/* 16. Divergencia 48 vs 54 registrada ------------------------------ */
assert(
  "prose_divergence_recorded",
  typeof doc.catalog.prose_divergence_note_pt_br === "string"
    && doc.catalog.prose_divergence_note_pt_br.includes("48")
    && doc.catalog.prose_divergence_note_pt_br.includes("54"),
  doc.catalog.prose_divergence_note_pt_br,
);

/* 17. Sem travessao ------------------------------------------------ */
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
assert("no_em_dash_in_data", !raw.includes(EM_DASH), "U+2014");
assert("no_en_dash_in_data", !raw.includes(EN_DASH), "U+2013");
const selfSource = fs.readFileSync(fileURLToPath(import.meta.url), "utf8");
assert("no_em_dash_in_test", !selfSource.includes(EM_DASH), "U+2014");

const failed = results.filter((r) => !r.ok);
console.log(`task-doors: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(JSON.stringify({ failed: failed.map((r) => ({ name: r.name, detail: r.detail })) }, null, 2));
  process.exit(1);
}
