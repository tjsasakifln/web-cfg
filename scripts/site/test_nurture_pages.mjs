import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import vm from "node:vm";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const shellPages = [
  "nurture/index.html",
  "nurture/sair/index.html",
  "casos/index.html",
  "casos/aditivo-art125-demonstrativo/index.html",
  "casos/medicao-glosa-demonstrativo/index.html",
  "imprensa/index.html",
  "ferramentas/index.html",
  "ferramentas/limite-acrescimos-supressoes/index.html",
  "ferramentas/checklist-reequilibrio/index.html",
  "ferramentas/matriz-atraso-obra/index.html",
  "radar/nacional-obras-publicas/index.html",
];

const pages = [
  ...shellPages,
  "data/nurture/tracks.json",
  "netlify/functions/nurture.cjs",
  "netlify/functions/lib/nurture-core.cjs",
];

let fail = 0;
for (const rel of pages) {
  if (!existsSync(resolve(ROOT, rel))) {
    console.error("FAIL missing", rel);
    fail++;
  } else console.log("PASS exists", rel);
}

const tracks = JSON.parse(readFileSync(resolve(ROOT, "data/nurture/tracks.json"), "utf8"));
for (const id of ["contrato", "edital", "operacao"]) {
  const n = tracks.tracks[id]?.messages?.length;
  if (n !== 5) {
    console.error("FAIL messages", id, n);
    fail++;
  } else console.log("PASS messages", id, n);
}

const caseHtml = readFileSync(resolve(ROOT, "casos/aditivo-art125-demonstrativo/index.html"), "utf8");
if (!/DEMONSTRATIVO|NÃO É CASE/i.test(caseHtml)) {
  console.error("FAIL case label");
  fail++;
} else console.log("PASS case_demo_label");
if (/economia de R\$\s*[0-9]|nosso cliente ganhou/i.test(caseHtml)) {
  console.error("FAIL fake client claim");
  fail++;
} else console.log("PASS no_fake_client_claims");

const sm = readFileSync(resolve(ROOT, "sitemap.xml"), "utf8");
for (const u of ["/nurture/", "/casos/", "/imprensa/"]) {
  if (!sm.includes(u)) {
    console.error("FAIL sitemap", u);
    fail++;
  } else console.log("PASS sitemap", u);
}

// Brand shell: logo image + full footer, no text-logo stub chrome
for (const rel of shellPages) {
  const html = readFileSync(resolve(ROOT, rel), "utf8");
  const checks = [
    ['class="brand"', "brand_logo_class"],
    ["logo-confenge-500-f8a83f6d.png", "header_logo_asset"],
    ["footer-top", "footer_top"],
    ["logo-confenge-white-500-1677038e.png", "footer_logo_asset"],
    ["52.407.089/0001-09", "cnpj"],
    ["desktop-nav", "desktop_nav"],
  ];
  for (const [needle, name] of checks) {
    if (!html.includes(needle)) {
      console.error("FAIL shell", rel, name);
      fail++;
    }
  }
  if (html.includes('class="logo"') || html.includes("nav-desktop")) {
    console.error("FAIL legacy_light_chrome", rel);
    fail++;
  } else console.log("PASS brand_shell", rel);
}

// Nurture landing must communicate real track value
const nurture = readFileSync(resolve(ROOT, "nurture/index.html"), "utf8");
const valueMarkers = [
  ["art. 125", "track_contrato_art125"],
  ["Glosa", "track_contrato_glosa"],
  ["Operação de Proposta para Licitação Crítica", "track_edital_offer"],
  ["Decisão de participar", "track_edital_decidir"],
  ["Diretoria Fracionada para o Mercado Público", "track_operacao_diretoria"],
  // 2026-09-08: a trava exigia o literal "double opt-in" na landing. O termo
  // é jargão de operação de e-mail marketing em inglês e estava no olho da
  // página, então a asserção obrigava o próprio defeito de redação. A
  // propriedade protegida era outra: a página precisa declarar que o
  // cadastro só vale depois de o visitante confirmar o e-mail. É isso que
  // passa a ser verificado, em português e com a confirmação explícita.
  ["Confirme o e-mail", "confirmacao_de_email"],
  ["link de confirmação", "confirmacao_explicita"],
  ["nurture-form", "subscribe_form"],
  ['rel="author" href="/especialista/tiago-jun-sasaki/"', "responsavel_vinculado"],
  ['href="/confianca/"', "fontes_metodo_limites_vinculados"],
];
for (const [needle, name] of valueMarkers) {
  if (!nurture.includes(needle)) {
    console.error("FAIL nurture_value", name);
    fail++;
  } else console.log("PASS nurture_value", name);
}

for (const leak of ["score honesto", "feeling", "Hub:", "E-mail corporativo", "j.error", "err.message"]) {
  if (nurture.includes(leak)) {
    console.error("FAIL nurture_internal_or_excluding_copy", leak);
    fail++;
  } else console.log("PASS nurture_public_copy", leak);
}

// Synthetic browser contract: exercise recoverable failures without making a
// network request or sending an email. Hostile server/exception details must
// never be copied into the visitor status region.
const inline = nurture.match(/<script>\s*(document\.getElementById\('nurture-form'\)[\s\S]*?)<\/script>/)?.[1];
if (!inline) {
  console.error("FAIL nurture_inline_handler_missing");
  fail++;
} else {
  async function exerciseFailure(fetchImpl, valid = true) {
    let submit;
    const button = { disabled: false };
    const elements = {
      "nurture-form": {
        addEventListener(_name, handler) { submit = handler; },
        querySelector() { return button; },
        checkValidity() { return valid; },
        reportValidity() {},
      },
      status: { hidden: true, textContent: "" },
      email: { value: "pessoa@example.com" },
      track: { value: "contrato" },
      consent: { checked: true },
    };
    vm.runInNewContext(inline, {
      document: { getElementById(id) { return elements[id]; } },
      fetch: fetchImpl,
      JSON,
    });
    await submit({ preventDefault() {}, currentTarget: elements["nurture-form"] });
    return { status: elements.status, button };
  }

  const invalid = await exerciseFailure(async () => ({
    ok: false,
    status: 400,
    async json() { return { error: "private_validation_detail" }; },
  }));
  const offline = await exerciseFailure(async () => {
    throw new Error("private_network_detail");
  });
  let invalidFetchCalled = false;
  const localInvalid = await exerciseFailure(async () => {
    invalidFetchCalled = true;
    throw new Error("must_not_fetch");
  }, false);
  for (const [name, result, secret] of [
    ["invalid", invalid, "private_validation_detail"],
    ["offline", offline, "private_network_detail"],
  ]) {
    if (result.status.hidden || result.button.disabled || result.status.textContent.includes(secret)) {
      console.error("FAIL nurture_recoverable_error", name, result);
      fail++;
    } else console.log("PASS nurture_recoverable_error", name);
  }
  if (invalidFetchCalled || localInvalid.button.disabled || !/Revise os campos/.test(localInvalid.status.textContent)) {
    console.error("FAIL nurture_local_validation", localInvalid);
    fail++;
  } else console.log("PASS nurture_local_validation");
}

if (fail) process.exit(1);
console.log("ALL nurture/cases/press structure checks passed");
