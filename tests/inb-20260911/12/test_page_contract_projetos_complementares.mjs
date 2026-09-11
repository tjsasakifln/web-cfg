/**
 * Exclusive HTML contract for INB-12 complementary-engineering elaboration.
 * Reads shipped landing and decision-content HTML. Does not re-implement the pages.
 */
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const NAME = "page-contract-projetos-complementares-elaboracao";

const LANDING_REL = "projetos-complementares-engenharia/index.html";
const CONTENT_REL = "conteudos/como-contratar-projetos-complementares/index.html";
const ASSETS = [
  "assets/projetos-complementares-engenharia/pacote-entrega.svg",
  "assets/projetos-complementares-engenharia/interfaces-versoes.svg",
  "assets/conteudos/como-contratar-projetos-complementares.svg",
];

const EM_DASH = String.fromCharCode(8212);
const EN_DASH = String.fromCharCode(8211);

const results = [];
function pushAssert(bucket, name, cond, detail) {
  if (cond) bucket.push({ name, ok: true });
  else {
    bucket.push({ name, ok: false, detail: String(detail).slice(0, 400) });
    const tag = bucket === results ? "FAIL" : "CONTRAPROVA_FAIL";
    console.error(tag, name, String(detail).slice(0, 400));
  }
}
function assert(name, cond, detail) {
  pushAssert(results, name, cond, detail);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function textFromHtml(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script[^>]*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function mainOf(html) {
  return html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
}

function hrefsOf(html) {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
}

function routeExists(href) {
  const raw = href.split("#")[0].split("?")[0];
  if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("https://wa.me/")) return true;
  if (raw.startsWith("https://") && !raw.includes("confenge.com.br")) return true;
  const local = raw.replace(/^https:\/\/confenge\.com\.br/, "");
  if (!local.startsWith("/")) return false;
  const rel = local.replace(/^\//, "").replace(/\/$/, "");
  const asFile = path.join(root, rel, "index.html");
  const asExact = path.join(root, rel);
  return fs.existsSync(asFile) || fs.existsSync(asExact);
}

function landingContractOpts() {
  return {
    canonical: "https://confenge.com.br/projetos-complementares-engenharia/",
    must: [
      "elaboração",
      "finalidade",
      "fase",
      "insumos",
      "disciplina",
      "interfaces",
      "formatos",
      "responsável",
      "autoria arquitetônica permanece",
      "não oferecemos autoria arquitetônica",
      "assinatura retroativa",
      "software e modelos são método",
      "consulta com mais de uma disciplina",
      "não cria pacote irrestrito",
      "nem equipe já contratada",
      "esta página vende elaboração",
      "não revisão nem parceria",
    ],
    mustNot: [
      "não estamos prontos",
      "sem capacidade",
      "gap",
      "núcleo interno",
      "withheld",
      "habilitação irrestrita",
      "assinamos projeto alheio",
    ],
    requiredHrefs: [
      "/servicos/#servico-projeto",
      "/entregas/",
      "/quantitativos-orcamento-obras/",
      "/triagem-tecnica/",
      "/conteudos/como-contratar-projetos-complementares/",
      "/especialista/tiago-jun-sasaki/",
      "/confianca/",
      "/uso-de-ia/",
    ],
    requiredSrc: [
      "/assets/projetos-complementares-engenharia/pacote-entrega.svg",
      "/assets/projetos-complementares-engenharia/interfaces-versoes.svg",
    ],
  };
}

function assertPageContract(label, html, opts, bucket = results) {
  const a = (name, cond, detail) => pushAssert(bucket, name, cond, detail);
  const main = mainOf(html);
  const text = textFromHtml(main);
  const lower = text.toLowerCase();

  a(`${label}_has_main`, main.length > 400, main.length);
  a(`${label}_no_em_dash`, !html.includes(EM_DASH) && !html.includes(EN_DASH), "travessao no HTML");
  a(`${label}_canonical`, html.includes(`rel="canonical"`) && html.includes(opts.canonical), html.match(/rel="canonical"[^>]*>/)?.[0]);
  a(
    `${label}_indexable`,
    /<meta\b[^>]*name="robots"[^>]*content="index,follow/i.test(html) ||
      /<meta\b[^>]*content="index,follow[^"]*"[^>]*name="robots"/i.test(html),
    "robots",
  );
  a(`${label}_intent`, html.includes('data-intent-family="projetar_revisar_compatibilizar"') || label === "content", html.match(/data-intent-family="[^"]+"/)?.[0]);
  a(`${label}_offer`, html.includes('data-offer-id="complementary_engineering_project_review"') || label === "content", html.match(/data-offer-id="[^"]+"/)?.[0]);

  for (const term of opts.must) {
    a(`${label}_has_${term.slice(0, 40).replace(/\s+/g, "_")}`, lower.includes(term.toLowerCase()), term);
  }
  for (const term of opts.mustNot) {
    a(`${label}_forbids_${term.slice(0, 40).replace(/\s+/g, "_")}`, !lower.includes(term.toLowerCase()), term);
  }

  const priceHits = [...text.matchAll(/R\$\s*[\d.]+/g)].map((m) => m[0]);
  const commercialPrice = priceHits.filter((hit) => !/R\$\s*700/.test(hit));
  a(`${label}_no_price_amount`, commercialPrice.length === 0, priceHits.join(","));
  a(`${label}_no_discount_offer`, !/\bdesconto de\b|\bdescontos?\s+\d/i.test(text), "desconto ofertado");
  a(`${label}_no_fixed_rounds`, !/\b\d+\s+revis[oõ]es?\s+inclu/i.test(text), "numero de revisoes");
  a(`${label}_no_fixed_deadline`, !/\b\d+\s+dias?\s+[uú]teis\b/i.test(text), "prazo fixo");
  a(`${label}_cta_elaboration`, /Solicitar proposta de elaboração/i.test(main), "cta principal");
  a(`${label}_incomplete_ok`, /incompleta? não impede/i.test(text) || /incompleta não impede/i.test(text) || /incompleta não impede o pedido/i.test(text) || /Documentação inicial incompleta não impede/i.test(text), "contexto incompleto");
  a(`${label}_optional_material`, /material disponível é opcional/i.test(text), "material opcional");
  a(`${label}_no_dead_form`, !/data-adaptive-intake-form/.test(html), "formulario morto");
  a(`${label}_no_upload`, !/name="(?:mensagem|arquivo|upload|endereco|cpf|processo)"/i.test(html), "upload no primeiro contato");

  const hrefs = hrefsOf(main);
  for (const href of opts.requiredHrefs) {
    a(`${label}_href_${href}`, hrefs.includes(href), href);
    a(`${label}_href_exists_${href}`, routeExists(href), href);
  }
  for (const href of hrefs) {
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("https://wa.me/")) continue;
    if (href.startsWith("http") && !href.includes("confenge.com.br")) continue;
    a(`${label}_live_href_${href.slice(0, 60)}`, routeExists(href), href);
  }

  for (const src of opts.requiredSrc || []) {
    a(`${label}_src_${src}`, html.includes(`src="${src}"`), src);
    const disk = path.join(root, src.replace(/^\//, ""));
    a(`${label}_asset_on_disk_${path.basename(src)}`, fs.existsSync(disk) && fs.statSync(disk).size > 200, disk);
  }
}

function runShipped() {
  const landing = read(LANDING_REL);
  const content = read(CONTENT_REL);

  assert("landing_file", landing.length > 1000, landing.length);
  assert("content_file", content.length > 1000, content.length);
  assert("test_file_no_em_dash", !fs.readFileSync(fileURLToPath(import.meta.url), "utf8").includes(EM_DASH), "teste");

  for (const rel of ASSETS) {
    const p = path.join(root, rel);
    assert(`asset_exists_${path.basename(rel)}`, fs.existsSync(p) && fs.statSync(p).size > 200, p);
  }

  assertPageContract("landing", landing, landingContractOpts());

  assert("landing_purchase_attr", landing.includes('data-purchase="elaboracao"'), "purchase");
  assert("landing_whatsapp", /data-fallback-channel="whatsapp"/.test(landing), "whatsapp");
  assert("landing_email", /data-fallback-channel="email"/.test(landing), "email");
  assert("landing_phone", /data-fallback-channel="phone"/.test(landing), "phone");
  assert("landing_three_channels", (landing.match(/data-fallback-channel=/g) || []).length === 3, "canais");
  assert("landing_cta_fragment", landing.includes('href="#escopo-projeto"'), "cta local");
  assert("landing_no_utm", !/[?&]utm_/i.test(landing), "utm");
  assert("landing_js_not_required", /Solicitar proposta de elaboração/.test(mainOf(landing)) && /data-fallback-channel="whatsapp"/.test(mainOf(landing)), "sem JS");
  assert("landing_no_usurp_authorship", /autoria arquitetônica permanece com o autor de origem/i.test(textFromHtml(mainOf(landing))), "autoria");
  assert("landing_distinguishes_revisao", /data-purchase="revisao"/.test(landing) && /Revisão de projeto existente/.test(landing), "revisao");
  assert("landing_distinguishes_compat", /data-purchase="compatibilizacao"/.test(landing) && /Compatibilização entre disciplinas/.test(landing), "compat");
  assert("landing_distinguishes_parceria", /data-purchase="parceria"/.test(landing) && /Colaboração contínua/.test(landing), "parceria");
  assert("landing_hub_servicos", landing.includes('href="/servicos/#servico-projeto"'), "hub 09");
  assert("landing_schematic_not_dimensioning", /Não representa cliente, obra executada nem dimensionamento concluído/i.test(landing), "esquema");
  assert("landing_denies_forbidden_promises", /Não oferecemos autoria arquitetônica[\s\S]{0,280}obra segura[\s\S]{0,80}êxito jurídico[\s\S]{0,80}conformidade total/i.test(textFromHtml(mainOf(landing))), "promessas negadas");

  assertPageContract("content", content, {
    canonical: "https://confenge.com.br/conteudos/como-contratar-projetos-complementares/",
    must: [
      "preparar",
      "insumos",
      "interfaces",
      "proposta",
      "material disponível é opcional",
      "documentação inicial incompleta não impede",
      "esta não é a página de revisão",
    ],
    mustNot: [
      "não estamos prontos",
      "sem capacidade",
      "gap",
      "habilitação irrestrita",
    ],
    requiredHrefs: [
      "/projetos-complementares-engenharia/",
      "/projetos-complementares-engenharia/#escopo-projeto",
      "/servicos/#servico-projeto",
      "/entregas/",
      "/triagem-tecnica/",
    ],
    requiredSrc: [
      "/assets/conteudos/como-contratar-projetos-complementares.svg",
    ],
  });

  assert("content_different_job", /pergunta diferente da página de serviço/i.test(textFromHtml(mainOf(content))), "job distinto");
  assert("content_whatsapp", /wa\.me\/5548988344559/.test(mainOf(content)), "whatsapp no main");
  assert("content_no_utm", !/[?&]utm_/i.test(content), "utm");
}

function runContraprova() {
  const original = read(LANDING_REL);
  const needle = "Elaboramos a documentação de engenharia complementar a partir da arquitetura e dos insumos que você já tem.";
  const payload = "Oferecemos assinatura retroativa de projeto de terceiro e habilitação irrestrita de todas as disciplinas.";
  assert("contraprova_needle_in_shipped", original.includes(needle), "sentenca alvo ausente na landing enviada");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "inb12-contraprova-"));
  const tmpFile = path.join(tmpDir, "index.html");
  try {
    const mutated = original.replace(needle, payload);
    assert("contraprova_mutated_differs", mutated !== original, "mutacao nao aplicada");
    fs.writeFileSync(tmpFile, mutated, "utf8");
    const fromDisk = fs.readFileSync(tmpFile, "utf8");
    assert("contraprova_temp_roundtrip", fromDisk === mutated && fromDisk.includes(payload), tmpFile);

    const mutatedBucket = [];
    assertPageContract("mutated", fromDisk, landingContractOpts(), mutatedBucket);
    const mutatedFails = mutatedBucket.filter((r) => !r.ok);
    const forbidsUnrestricted = mutatedFails.find((r) => /forbids_habilit/i.test(r.name));
    const forbidsAlheio = mutatedFails.find((r) => /forbids_assinamos_projeto_alheio/i.test(r.name));
    assert(
      "contraprova_contract_fails_on_temp",
      Boolean(forbidsUnrestricted),
      mutatedFails.map((r) => r.name).join(",") || "nenhuma falha do contrato na copia mutada",
    );
    assert(
      "contraprova_isolated_to_mustNot",
      Boolean(forbidsUnrestricted) && !forbidsAlheio,
      "a mutacao deve quebrar habilitacao irrestrita e nao o restante do mustNot",
    );
    assert("contraprova_shipped_file_untouched", read(LANDING_REL) === original, LANDING_REL);

    const restoredBucket = [];
    assertPageContract("restored", read(LANDING_REL), landingContractOpts(), restoredBucket);
    const restoredFails = restoredBucket.filter((r) => !r.ok);
    assert(
      "contraprova_restore_contract_pass",
      restoredFails.length === 0,
      restoredFails.map((r) => r.name).join(","),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runShipped();
runContraprova();

const failed = results.filter((r) => !r.ok);
const passed = results.filter((r) => r.ok);
console.log(`${NAME} ${passed.length}/${results.length} ok`);
if (failed.length) {
  console.error(`${NAME} FAILED ${failed.length}`);
  process.exit(1);
}
console.log(`PASS ${NAME}`);
process.exit(0);
