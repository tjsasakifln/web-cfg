/**
 * Gate de nomes públicos de oferta (#343).
 *
 * Prova que `data/commercial/offer-naming.v1.json` é a autoridade de nome do rol
 * comercial: 54 entregáveis taxativos, 2 contêineres, 3 planos da Diretoria, cada
 * nome em pt-BR ligado a uma linha de valor não intercambiável, e continuidade
 * rastreável com o que já está publicado em `entregas/index.html`.
 *
 * Autossuficiente: lê o próprio JSON e apenas artefatos que já existem em main.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const SUITE = "offer-naming";

const results = [];
function assert(name, cond, detail) {
  if (cond) {
    results.push({ name, ok: true });
  } else {
    results.push({ name, ok: false, detail });
    console.error("FAIL", name, detail === undefined ? "" : detail);
  }
}

const dataPath = path.join(root, "data/commercial/offer-naming.v1.json");
const raw = fs.readFileSync(dataPath, "utf8");
const data = JSON.parse(raw);
const deliverableRegistry = JSON.parse(
  fs.readFileSync(path.join(root, "data/commercial/deliverables-registry.v1.json"), "utf8"),
);

const names = data.names || [];
const containers = data.containers || [];
const allOffers = [...names, ...containers];

/* ------------------------------------------------------------------ *
 * 1. Rol taxativo: 54 entregáveis, CFG-D01..CFG-D54, sem lacuna,
 *    sem duplicata, sem nome público repetido.
 * ------------------------------------------------------------------ */
assert("schema", data.schema === "confenge.offer-naming/1.0", data.schema);
assert("issue_ref", data.issue === "#343", data.issue);
assert("deliverable_count_54", names.length === 54, names.length);

const expectedIds = Array.from({ length: 54 }, (_, i) => `CFG-D${String(i + 1).padStart(2, "0")}`);
const actualIds = names.map((n) => n.deliverable_id);
assert("deliverable_ids_sequential_no_gap", JSON.stringify(actualIds) === JSON.stringify(expectedIds), {
  missing: expectedIds.filter((id) => !actualIds.includes(id)),
  unexpected: actualIds.filter((id) => !expectedIds.includes(id)),
});
assert("deliverable_ids_unique", new Set(actualIds).size === 54, 54 - new Set(actualIds).size);

const catalogNumbers = names.map((n) => n.catalog_number);
assert(
  "catalog_number_matches_id",
  names.every((n) => n.deliverable_id === `CFG-D${n.catalog_number}`),
  names.filter((n) => n.deliverable_id !== `CFG-D${n.catalog_number}`).map((n) => n.deliverable_id),
);
assert("catalog_numbers_unique", new Set(catalogNumbers).size === 54, 54 - new Set(catalogNumbers).size);

const publicNames = allOffers.map((o) => o.public_name_pt_br);
const dupNames = publicNames.filter((n, i) => publicNames.indexOf(n) !== i);
assert("public_names_unique", dupNames.length === 0, dupNames);
assert(
  "public_name_non_empty",
  allOffers.every((o) => typeof o.public_name_pt_br === "string" && o.public_name_pt_br.trim().length > 3),
  allOffers.filter((o) => !o.public_name_pt_br || o.public_name_pt_br.trim().length <= 3),
);

/* ------------------------------------------------------------------ *
 * 2. Convenção de nome da #343, transformada em asserções verificáveis.
 * ------------------------------------------------------------------ */

// 2.1 até oito palavras
const overLong = allOffers.filter((o) => o.public_name_pt_br.trim().split(/\s+/).length > 8);
assert("name_max_8_words", overLong.length === 0, overLong.map((o) => o.public_name_pt_br));

// 2.2 seis anglicismos aposentados pela Acceptance da #343
const RETIRED_ANGLICISMS = [
  { label: "Go/No-Go", re: /\bgo\s*\/?\s*no[\s-]?go\b/i },
  { label: "Bid Room", re: /\bbid\s*room\b/i },
  { label: "Win/Loss", re: /\bwin\s*\/?\s*loss\b/i },
  { label: "post-mortem", re: /\bpost[\s-]?mortem\b/i },
  { label: "quantum", re: /\bquantum\b/i },
  { label: "in company", re: /\bin[\s-]?company\b/i },
];
for (const { label, re } of RETIRED_ANGLICISMS) {
  const hits = allOffers.filter((o) => re.test(o.public_name_pt_br));
  assert(`no_anglicism_${label.replace(/[^a-z]/gi, "_").toLowerCase()}`, hits.length === 0, hits.map((o) => o.public_name_pt_br));
}
// os planos da Diretoria também são nome público
const planNames = (containers.flatMap((c) => c.plans || [])).map((p) => p.public_name_pt_br);
assert(
  "plans_free_of_retired_anglicisms",
  planNames.every((n) => !RETIRED_ANGLICISMS.some(({ re }) => re.test(n))),
  planNames,
);
// "Flex" não pode ser nome público único (pode ficar como alias interno)
assert("flex_not_a_public_name", !publicNames.concat(planNames).some((n) => /\bflex\b/i.test(n)), publicNames.concat(planNames).filter((n) => /\bflex\b/i.test(n)));

// 2.3 sem superlativo nem valor autodeclarado.
// Elogio absoluto é proibido em qualquer posição: só pode qualificar a própria oferta.
const ABSOLUTE_PRAISE = /\b(melhor|líder|lider|definitiv[oa]|premium|exclusiv[oa]|garantid[oa]|infalív|imbatív|perfeit[oa]|revolucionári|inigualáv|ultimat[eo]|n[ºo°]\s*1)\b/i;
const praised = allOffers.filter((o) => ABSOLUTE_PRAISE.test(o.public_name_pt_br));
assert("no_self_declared_superlative", praised.length === 0, praised.map((o) => o.public_name_pt_br));
// Comparativo relativo (maior, top) só é aceito quando qualifica o objeto analisado,
// nunca a entrega: proibido nas duas primeiras palavras, que nomeiam a própria oferta.
const RELATIVE_QUALIFIER = /^(maior|top|super|mega|ultra)\b/i;
const selfQualified = allOffers.filter((o) =>
  o.public_name_pt_br.trim().split(/\s+/).slice(0, 2).some((w) => RELATIVE_QUALIFIER.test(w)),
);
assert("no_relative_qualifier_on_the_offer_head", selfQualified.length === 0, selfQualified.map((o) => o.public_name_pt_br));

// nome não pode prometer resultado (vitória, pagamento, pleito, absolvição)
const PROMISE = /\b(vitória|vitoria|ganhe|ganhar|vencer\s+sempre|absolvi|aprovação\s+garantid)\b/i;
const promising = allOffers.filter((o) => PROMISE.test(o.public_name_pt_br));
assert("no_outcome_promise_in_name", promising.length === 0, promising.map((o) => o.public_name_pt_br));

// 2.4 pt-BR: nenhum nome público pode ser inglês. Heurística verificável:
// o nome precisa conter pelo menos um marcador morfológico do português
// (preposição/artigo/acento) e nenhum stopword estritamente inglesa.
const PT_MARKER = /(^|\s)(de|da|do|das|dos|para|por|em|no|na|nos|nas|e|ou|com|ao|à|antes|sob|sem)(\s|$)|[áàâãéêíóôõúüç]/i;
const EN_STOPWORD = /(^|\s)(the|for|with|and|of|to|your|our|report|room|board|check|review|analysis|management|insight|market|deal|win|loss|score|tracker|dashboard|pipeline)(\s|$)/i;
const notPt = allOffers.filter((o) => !PT_MARKER.test(o.public_name_pt_br));
assert("names_read_as_pt_br", notPt.length === 0, notPt.map((o) => o.public_name_pt_br));
const englishy = allOffers.concat(containers.flatMap((c) => c.plans || [])).filter((o) => EN_STOPWORD.test(o.public_name_pt_br));
assert("names_free_of_english_stopwords", englishy.length === 0, englishy.map((o) => o.public_name_pt_br));

// 2.5 "B2G" não é pré-requisito para compreender nenhum nome público
const b2gNames = allOffers.concat(containers.flatMap((c) => c.plans || [])).filter((o) => /\bB2G\b/i.test(o.public_name_pt_br));
assert("b2g_not_required_to_understand_name", b2gNames.length === 0, b2gNames.map((o) => o.public_name_pt_br));

// 2.6 nome não pode ser apenas o formato ("Relatório", "Apresentação", "Planilha", "Painel")
const FORMAT_ONLY = /^(relatório|relatorio|apresentação|apresentacao|planilha|painel|documento|dossiê|dossie|estudo|análise|analise)$/i;
const formatOnly = allOffers.filter((o) => FORMAT_ONLY.test(o.public_name_pt_br.trim()));
assert("name_is_not_format_only", formatOnly.length === 0, formatOnly.map((o) => o.public_name_pt_br));

// 2.7 siglas: só BDI e SICAF (cadastro nomeado do ICP) podem aparecer em caixa alta
const ALLOWED_ACRONYMS = new Set(["BDI", "SICAF"]);
const strayAcronyms = [];
for (const o of allOffers) {
  for (const token of o.public_name_pt_br.split(/[\s,]+/)) {
    const bare = token.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (bare.length >= 2 && bare === bare.toUpperCase() && /[A-Z]{2,}/.test(bare) && !ALLOWED_ACRONYMS.has(bare)) {
      strayAcronyms.push(`${o.public_name_pt_br} :: ${bare}`);
    }
  }
}
assert("only_declared_acronyms_in_names", strayAcronyms.length === 0, strayAcronyms);

// 2.8 a convenção declarada no arquivo tem de bater com a #343
assert("convention_language_pt_br", data.convention && data.convention.language === "pt-BR", data.convention && data.convention.language);
assert("convention_max_words_8", data.convention && data.convention.max_words === 8, data.convention && data.convention.max_words);
assert("convention_has_10_rules", Array.isArray(data.convention && data.convention.rules) && data.convention.rules.length === 10, data.convention && data.convention.rules && data.convention.rules.length);
const forbidden = data.forbidden_name_patterns || [];
assert(
  "forbidden_patterns_list_the_six_anglicisms",
  RETIRED_ANGLICISMS.every(({ label }) => forbidden.some((f) => f.toLowerCase().includes(label.toLowerCase()))),
  forbidden,
);

/* ------------------------------------------------------------------ *
 * 3. Linha de valor própria e não intercambiável.
 * ------------------------------------------------------------------ */
const valueLines = allOffers.map((o) => o.value_line);
assert(
  "every_offer_has_value_line",
  valueLines.every((v) => typeof v === "string" && v.trim().length >= 30),
  allOffers.filter((o) => !o.value_line || o.value_line.trim().length < 30).map((o) => o.public_name_pt_br),
);
const dupLines = valueLines.filter((v, i) => valueLines.indexOf(v) !== i);
assert("value_lines_unique", dupLines.length === 0, dupLines);
// não intercambiável também no nível normalizado (caixa/pontuação não contam como diferença)
const normalized = valueLines.map((v) => v.toLowerCase().replace(/[^a-zà-ÿ0-9]+/g, " ").trim());
const dupNormalized = normalized.filter((v, i) => normalized.indexOf(v) !== i);
assert("value_lines_unique_normalized", dupNormalized.length === 0, dupNormalized);
// a linha de valor descreve a entrega, não repete o nome
const echoing = allOffers.filter((o) => o.value_line.trim().toLowerCase() === o.public_name_pt_br.trim().toLowerCase());
assert("value_line_is_not_the_name", echoing.length === 0, echoing.map((o) => o.public_name_pt_br));
// nenhuma linha de valor promete vitória, pagamento, pleito ou absolvição
const VALUE_PROMISE = /\b(garante|garantia de (vitória|vitoria|pagamento|ganho)|assegura o pagamento|vence a licitação|absolvição)\b/i;
const promisingLines = allOffers.filter((o) => VALUE_PROMISE.test(o.value_line));
assert("value_line_promises_no_outcome", promisingLines.length === 0, promisingLines.map((o) => o.public_name_pt_br));

/* ------------------------------------------------------------------ *
 * 4 e 5. Continuidade: o que está publicado hoje continua publicado e
 *        continua rastreável no registry.
 * ------------------------------------------------------------------ */
const entregasHtml = fs.readFileSync(path.join(root, "entregas/index.html"), "utf8");
const publishedNames = (data.published_surface && data.published_surface.published_names) || [];
assert("published_surface_declares_8_names", publishedNames.length === 8, publishedNames.length);
assert(
  "published_surface_path_is_entregas",
  data.published_surface && data.published_surface.path === "entregas/index.html",
  data.published_surface && data.published_surface.path,
);

// 5. esta PR não renomeia nada: os oito nomes continuam no HTML publicado
const missingOnPage = publishedNames.filter((n) => !entregasHtml.includes(n));
assert("published_names_still_on_page", missingOnPage.length === 0, missingOnPage);

// e cada nome publicado é alcançável pelo registry, como canônico ou como alias
const aliasIndex = new Map();
for (const o of allOffers) {
  for (const a of o.aliases || []) {
    aliasIndex.set(a, o.public_name_pt_br);
  }
}
const canonicalSet = new Set(publicNames);
const untraceable = publishedNames.filter((n) => !canonicalSet.has(n) && !aliasIndex.has(n));
assert("published_names_traceable_in_registry", untraceable.length === 0, untraceable);

// 4. renomeação não silenciosa: se o canônico difere do publicado, o publicado é alias
const silentRenames = publishedNames.filter((n) => !canonicalSet.has(n) && aliasIndex.get(n) === undefined);
assert("rename_is_never_silent", silentRenames.length === 0, silentRenames);
const renamedPairs = publishedNames.filter((n) => !canonicalSet.has(n));
assert("renames_carry_the_published_name_as_alias", renamedPairs.every((n) => aliasIndex.has(n)), renamedPairs.filter((n) => !aliasIndex.has(n)));

// alias nunca colide com um nome canônico de outra oferta
const aliasCollisions = [...aliasIndex.entries()].filter(([alias, owner]) => canonicalSet.has(alias) && alias !== owner);
assert("alias_does_not_shadow_another_canonical", aliasCollisions.length === 0, aliasCollisions);
// alias nunca é duplicado entre ofertas diferentes
const allAliases = allOffers.flatMap((o) => o.aliases || []);
const dupAliases = allAliases.filter((a, i) => allAliases.indexOf(a) !== i);
assert("aliases_unique_across_offers", dupAliases.length === 0, dupAliases);

// as oito ofertas publicadas são exatamente CFG-D01..CFG-D08 (a trilha de expansão)
const ownersOfPublished = publishedNames.map((n) => (canonicalSet.has(n) ? n : aliasIndex.get(n)));
const publishedIds = names.filter((n) => ownersOfPublished.includes(n.public_name_pt_br)).map((n) => n.deliverable_id);
assert("published_eight_map_to_d01_d08", JSON.stringify(publishedIds.sort()) === JSON.stringify(expectedIds.slice(0, 8)), publishedIds);

/* ------------------------------------------------------------------ *
 * 6. Contêineres e planos: semântica clara, sem inflar a contagem.
 * ------------------------------------------------------------------ */
assert("container_count_2", containers.length === 2, containers.length);
const containerIds = containers.map((c) => c.container_id);
assert("container_ids_expected", JSON.stringify(containerIds) === JSON.stringify(["expansion_package", "diretoria_fracionada"]), containerIds);
assert(
  "containers_have_name_and_value_line",
  containers.every((c) => c.public_name_pt_br && typeof c.value_line === "string" && c.value_line.trim().length >= 30),
  containers.map((c) => c.public_name_pt_br),
);
// contêiner não é entregável: nenhum contêiner carrega deliverable_id
assert("containers_are_not_deliverables", containers.every((c) => c.deliverable_id === undefined), containerIds);

const diretoria = containers.find((c) => c.container_id === "diretoria_fracionada");
const plans = (diretoria && diretoria.plans) || [];
assert("diretoria_has_3_plans", plans.length === 3, plans.length);
assert(
  "diretoria_plan_names_pt_br",
  JSON.stringify(plans.map((p) => p.public_name_pt_br)) === JSON.stringify(["Plano Mensal", "Compromisso Semestral", "Compromisso Anual"]),
  plans.map((p) => p.public_name_pt_br),
);
// planos são condições de contratação, não produtos: não entram na contagem de entregáveis
assert("plans_are_not_deliverables", plans.every((p) => p.deliverable_id === undefined), plans.map((p) => p.plan_id));
assert("plans_do_not_inflate_deliverable_count", names.length + containers.length + plans.length === 59 && names.length === 54, {
  deliverables: names.length,
  containers: containers.length,
  plans: plans.length,
});

// planos e contêiner de expansão ficam ancorados no catálogo congelado que já existe em main
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data/offers/catalog.snapshot.json"), "utf8"));
const catalogById = new Map(catalog.offers.map((o) => [o.offer_id, o]));
const expansion = containers.find((c) => c.container_id === "expansion_package");
assert("expansion_anchored_in_catalog", catalogById.has(expansion.catalog_offer_id), expansion.catalog_offer_id);
assert("plans_anchored_in_catalog", plans.every((p) => catalogById.has(p.catalog_offer_id)), plans.map((p) => p.catalog_offer_id));
// renomear não altera preço: os termos declarados batem com o catálogo congelado
const EXPECTED_PLAN_TERMS = {
  "CFG-DIRB2G-FLEX-v1": { cents: 2000000, maxPayments: null },
  "CFG-DIRB2G-180-v1": { cents: 1500000, maxPayments: 6 },
  "CFG-DIRB2G-365-v1": { cents: 1250000, maxPayments: 12 },
};
for (const p of plans) {
  const offer = catalogById.get(p.catalog_offer_id);
  const expected = EXPECTED_PLAN_TERMS[p.catalog_offer_id];
  assert(
    `plan_price_unchanged_${p.plan_id}`,
    Boolean(offer && expected) && offer.amount_cents === expected.cents && (offer.max_payments ?? null) === expected.maxPayments,
    offer,
  );
  const brl = (expected.cents / 100).toLocaleString("pt-BR");
  assert(`plan_terms_match_catalog_${p.plan_id}`, p.terms.includes(brl), { terms: p.terms, brl });
}
// o alias do contêiner preserva o nome comercial hoje faturado
assert(
  "expansion_alias_keeps_billed_name",
  (expansion.aliases || []).some((a) => catalogById.get(expansion.catalog_offer_id).public_name.includes(a)),
  { aliases: expansion.aliases, billed: catalogById.get(expansion.catalog_offer_id).public_name },
);

/* ------------------------------------------------------------------ *
 * 7. Sem travessão em nenhum campo.
 * ------------------------------------------------------------------ */
const DASHES = ["—", "–", "‒", "―"];
const dashHits = DASHES.filter((d) => raw.includes(d));
assert("no_dash_anywhere_in_file", dashHits.length === 0, dashHits.map((d) => `U+${d.codePointAt(0).toString(16).toUpperCase()}`));
const fieldDashHits = [];
(function walk(node, trail) {
  if (typeof node === "string") {
    if (DASHES.some((d) => node.includes(d))) fieldDashHits.push(trail);
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${trail}[${i}]`));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) walk(v, trail ? `${trail}.${k}` : k);
  }
})(data, "");
assert("no_dash_in_any_field", fieldDashHits.length === 0, fieldDashHits);

/* ------------------------------------------------------------------ *
 * 8. Nada é declarado validado, nada é inventado.
 * ------------------------------------------------------------------ */
assert("human_test_not_started", data.human_test && data.human_test.state === "NOT_STARTED", data.human_test && data.human_test.state);
assert("human_test_evidence_empty", Array.isArray(data.human_test && data.human_test.evidence) && data.human_test.evidence.length === 0, data.human_test && data.human_test.evidence);
assert("effective_at_null_until_rename_executes", data.effective_at === null, data.effective_at);
assert(
  "decision_question_uses_canonical_join",
  /deliverables-registry\.v1\.json/.test(data.field_mapping?.decision_question || ""),
  data.field_mapping?.decision_question,
);
const canonicalById = new Map(deliverableRegistry.deliverables.map((entry) => [entry.deliverable_id, entry]));
assert(
  "deliverable_questions_resolve_54_of_54",
  names.every((offer) => {
    const canonical = canonicalById.get(offer.deliverable_id);
    return canonical &&
      canonical.public_name_pt_br === offer.public_name_pt_br &&
      typeof canonical.decision_question === "string" &&
      canonical.decision_question.trim().endsWith("?") &&
      !("decision_question" in offer);
  }),
  names.filter((offer) => {
    const canonical = canonicalById.get(offer.deliverable_id);
    return !canonical || canonical.public_name_pt_br !== offer.public_name_pt_br ||
      typeof canonical.decision_question !== "string" || !canonical.decision_question.trim().endsWith("?") ||
      "decision_question" in offer;
  }).map((offer) => offer.deliverable_id),
);
assert(
  "container_questions_remain_unfabricated",
  containers.every((container) => container.decision_question === null),
  containers.map((container) => container.decision_question),
);
assert(
  "no_url_change_declared",
  allOffers.every((o) => o.public_slug === null && Array.isArray(o.redirects) && o.redirects.length === 0),
  allOffers.filter((o) => o.public_slug !== null || (o.redirects || []).length).map((o) => o.public_name_pt_br),
);

const failed = results.filter((r) => !r.ok);
console.log(`${SUITE}: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(JSON.stringify({ ok: false, failed: failed.length, results: failed }, null, 2));
  process.exit(1);
}
