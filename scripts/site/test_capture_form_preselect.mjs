/**
 * BOFU-FECHAMENTO-20260919 — FAMILIAS-PUBLICAS-01(3) e A-08 (hashNeeds).
 *
 *  PUBLICAS-01(3): um CTA da propria pagina (p. ex. "Registrar no formulário"
 *  do bloco do orgao em /servicos-obras-publicas/) pre-seleciona o evento do
 *  formulario de captura via data-contract-event, no mesmo padrao do click
 *  listener DATASET_TO_ATTR do bundle. <select>: so valores que existem como
 *  <option>; hidden: valor gravado (data-estagio); nada persiste entre rotas.
 *
 *  A-08: hashNeeds em assets/js/adaptive-intake.js so pode apontar para
 *  need_codes do vocabulario fechado do servidor (NEEDS em
 *  netlify/functions/lib/adaptive-intake.cjs). O servidor mapeia projeto,
 *  quantitativos e compatibilizacao para obra_edificacao_ou_documentacao via
 *  INTAKE_CONTEXTS; inventar um need de projeto no cliente reprovaria no POST.
 *
 *   node scripts/site/test_capture_form_preselect.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");

let failed = 0;
const expect = (name, cond, detail = "") => {
  if (cond) console.log("PASS", name, detail);
  else { console.error("FAIL", name, detail); failed += 1; }
};

function control(name, tag, value, options) {
  const el = {
    tagName: tag,
    name,
    type: tag === "INPUT" ? "hidden" : "",
    value,
    options: (options || []).map((v) => ({ value: v })),
    events: [],
    dispatchEvent(event) { this.events.push(event && event.type); },
  };
  return el;
}

function loadHub({ contractOptions, withEstagioHidden = true, estagioSelectOptions = null, search = "", hash = "", pathname = "/servicos-obras-publicas/", initialStore = {} }) {
  const fields = {
    contract_event: control("contract_event", "SELECT", "", contractOptions),
    estagio: estagioSelectOptions
      ? control("estagio", "SELECT", estagioSelectOptions[0], estagioSelectOptions)
      : (withEstagioHidden ? control("estagio", "INPUT", "contract-defense-products") : null),
    jornada: control("jornada", "INPUT", "contrato"),
  };
  const hidden = {};
  const form = {
    querySelector(sel) {
      const s = String(sel);
      const m = s.match(/^input\[name="([^"]+)"\]$/);
      if (m) return hidden[m[1]] || (fields[m[1]] && fields[m[1]].tagName === "INPUT" ? fields[m[1]] : null);
      const f = s.match(/^select\[name="([^"]+)"\], input\[type="hidden"\]\[name="\1"\]$/);
      if (f) return fields[f[1]] || null;
      const hiddenOnly = s.match(/^input\[type="hidden"\]\[name="([^"]+)"\]$/);
      if (hiddenOnly) return fields[hiddenOnly[1]] && fields[hiddenOnly[1]].tagName === "INPUT" ? fields[hiddenOnly[1]] : null;
      if (s === "#estagio") return fields.estagio;
      if (s === "#jornada-hidden") return fields.jornada;
      return null;
    },
    querySelectorAll: () => [],
    appendChild(el) { if (el && el.name) hidden[el.name] = el; },
    getAttribute: (n) => (n === "name" ? "diagnostico-confenge" : n === "data-receipt-required" ? "true" : null),
    setAttribute() {},
    addEventListener() {},
    dataset: {},
  };
  const docListeners = [];
  const document = {
    readyState: "complete",
    querySelector: (sel) => (String(sel).includes("diagnostico-") ? form : null),
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: (tag) => ({ tagName: String(tag).toUpperCase(), type: "", name: "", value: "", setAttribute() {}, appendChild() {} }),
    documentElement: { scrollHeight: 2000, style: {} },
    addEventListener: (type, fn, opts) => { docListeners.push({ type, fn, opts }); },
    body: { classList: { remove() {}, add() {} }, dataset: {}, getAttribute: () => null },
    referrer: "",
  };
  const store = { ...initialStore };
  const sessionStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const windowObj = {
    dataLayer: [],
    matchMedia: () => ({ matches: false }),
    location: { pathname, search, hash, href: `https://confenge.com.br${pathname}${search}${hash}` },
    document,
    addEventListener: () => {},
    innerHeight: 800,
    scrollY: 0,
    sessionStorage,
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000099" },
  };
  windowObj.window = windowObj;
  const sandbox = { window: windowObj, document, console, URLSearchParams, URL, sessionStorage, Event: class { constructor(type) { this.type = type; } } };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  const clicks = docListeners.filter((l) => l.type === "click").map((l) => l.fn);
  const click = (dataset, href = "#captura-contrato") => {
    const anchor = { href, dataset, closest(sel) { return String(sel).includes("a[href]") ? this : null; }, getAttribute: (n) => (n === "href" ? href : null) };
    clicks.forEach((fn) => fn({ target: anchor }));
  };
  return { fields, store, click, clicks };
}

// --- PUBLICAS-01(3) ----------------------------------------------------------
{
  const hub = loadHub({ contractOptions: ["", "risco_margem", "medicao_glosa_pagamento", "outro", "planejamento_contratacao"] });
  expect("hub_click_listener_registered", hub.clicks.length > 0, String(hub.clicks.length));
  hub.click({ contractEvent: "planejamento_contratacao" });
  expect("contract_event_preselected_from_cta", hub.fields.contract_event.value === "planejamento_contratacao", hub.fields.contract_event.value);
  expect("contract_event_change_dispatched", hub.fields.contract_event.events.includes("change"), hub.fields.contract_event.events.join(","));
  expect("estagio_untouched_without_data_estagio", hub.fields.estagio.value === "contract-defense-products", hub.fields.estagio.value);
  // Estagio estruturado pelo mesmo CTA (hidden), sem inventar jornada nova.
  hub.click({ contractEvent: "planejamento_contratacao", estagio: "planejamento-contratacao-publica" });
  expect("estagio_hidden_written_from_cta", hub.fields.estagio.value === "planejamento-contratacao-publica", hub.fields.estagio.value);
  // Sem 'change' no hidden: o ouvinte de #estagio reclassificaria a jornada
  // declarada no HTML (contrato -> outro), contra a decisao C1.
  expect("estagio_hidden_no_change_event", hub.fields.estagio.events.length === 0, hub.fields.estagio.events.join(","));
  expect("jornada_hidden_not_rewritten_by_field_preselect", hub.fields.jornada.value === "contrato", hub.fields.jornada.value);
  // Valor que nao existe como <option> nunca entra no select.
  hub.click({ contractEvent: "evento_inventado" });
  expect("unknown_option_rejected", hub.fields.contract_event.value === "planejamento_contratacao", hub.fields.contract_event.value);
  // O campo de formulario nao vira atribuicao de sessao.
  const stored = JSON.parse(hub.store.confenge_pseo_attribution || "{}");
  expect("contract_event_not_persisted_as_attribution", !("contract_event" in stored) && !("estagio" in stored), Object.keys(stored).join(","));
}
{
  // Home: #estagio e um <select> ligado ao resolvedor de situacao. Um CTA
  // com data-estagio NAO pode selecionar nem disparar 'change' nele (isso
  // reclassificaria a jornada escolhida pelo visitante); so o hidden dos
  // hubs/pilares recebe o valor.
  const home = loadHub({
    contractOptions: ["", "outro"],
    estagioSelectOptions: ["obra ou imóvel para inspecionar ou documentar", "planejamento-contratacao-publica"],
  });
  home.click({ estagio: "planejamento-contratacao-publica" });
  expect("home_estagio_select_not_preselected_by_cta", home.fields.estagio.value === "obra ou imóvel para inspecionar ou documentar", home.fields.estagio.value);
  expect("home_estagio_select_no_change_event", home.fields.estagio.events.length === 0, home.fields.estagio.events.join(","));
}
{
  // Formulario de hoje (sem a option do orgao): o CTA nao forca nada.
  const legacy = loadHub({ contractOptions: ["", "risco_margem", "outro"] });
  legacy.click({ contractEvent: "planejamento_contratacao" });
  expect("missing_option_leaves_select_empty", legacy.fields.contract_event.value === "", legacy.fields.contract_event.value);
}

// --- PUBLICAS-02: CTA de outra rota (data-contract-event -> sessionStorage) ------
{
  // Home: clique num link canonico (sem query string) para o hub com o evento em data-*.
  const home = loadHub({ contractOptions: ["", "outro"], pathname: "/", estagioSelectOptions: ["x"] });
  home.click({ contractEvent: "planejamento_contratacao" }, "/servicos-obras-publicas/#captura-contrato");
  const saved = JSON.parse(home.store.confenge_form_preselect || "null");
  expect("cross_route_preselect_saved_on_click", Boolean(saved) && saved.path === "/servicos-obras-publicas/" && saved.contract_event === "planejamento_contratacao", JSON.stringify(saved));
  expect("cross_route_preselect_not_in_attribution", !("contract_event" in JSON.parse(home.store.confenge_pseo_attribution || "{}")));
  // Chegada ao hub: o evento e aplicado e o registro apagado.
  const hub = loadHub({ contractOptions: ["", "risco_margem", "outro", "planejamento_contratacao"], initialStore: { confenge_form_preselect: JSON.stringify(saved) } });
  expect("contract_event_preselected_on_arrival", hub.fields.contract_event.value === "planejamento_contratacao", hub.fields.contract_event.value);
  expect("arrival_change_dispatched", hub.fields.contract_event.events.includes("change"), hub.fields.contract_event.events.join(","));
  expect("preselect_record_consumed", !("confenge_form_preselect" in hub.store), Object.keys(hub.store).join(","));
  // Rota diferente da alvo: descartado sem aplicar.
  const other = loadHub({ contractOptions: ["", "planejamento_contratacao"], pathname: "/defesa-margem-contratos-publicos/", initialStore: { confenge_form_preselect: JSON.stringify(saved) } });
  expect("preselect_ignored_on_other_route", other.fields.contract_event.value === "" && !("confenge_form_preselect" in other.store), other.fields.contract_event.value);
  // Registro velho (>30 min) descartado.
  const stale = loadHub({ contractOptions: ["", "planejamento_contratacao"], initialStore: { confenge_form_preselect: JSON.stringify({ ...saved, saved_at: 1 }) } });
  expect("preselect_stale_discarded", stale.fields.contract_event.value === "", stale.fields.contract_event.value);
  // Valor fora do allowlist de options ou fora do padrao de token nunca entra.
  const bogus = loadHub({ contractOptions: ["", "risco_margem"], initialStore: { confenge_form_preselect: JSON.stringify({ ...saved, contract_event: "<script>x" }) } });
  expect("preselect_non_token_rejected", bogus.fields.contract_event.value === "", bogus.fields.contract_event.value);
  // Clique local (mesma rota) nao grava registro entre rotas.
  const local = loadHub({ contractOptions: ["", "planejamento_contratacao"] });
  local.click({ contractEvent: "planejamento_contratacao" }, "#captura-contrato");
  expect("same_route_click_does_not_persist", !("confenge_form_preselect" in local.store), Object.keys(local.store).join(","));
}

// --- A-08: hashNeeds ⊆ NEEDS do servidor ---------------------------------------
{
  const intakeSrc = fs.readFileSync(path.join(root, "assets/js/adaptive-intake.js"), "utf8");
  const match = intakeSrc.match(/var hashNeeds = (\{[\s\S]*?\});/);
  expect("hash_needs_declared", Boolean(match));
  const hashNeeds = match ? vm.runInNewContext(`(${match[1]})`) : {};
  const serverSrc = fs.readFileSync(path.join(root, "netlify/functions/lib/adaptive-intake.cjs"), "utf8");
  const needsMatch = serverSrc.match(/const NEEDS = Object\.freeze\((\{[\s\S]*?\})\);/);
  expect("server_needs_declared", Boolean(needsMatch));
  const serverNeeds = needsMatch ? Object.keys(vm.runInNewContext(`(${needsMatch[1]})`, { OTHER_NUCLEUS: "other" })) : [];
  for (const [hash, need] of Object.entries(hashNeeds)) {
    expect(`hash_need_in_server_vocabulary_${hash}`, serverNeeds.includes(need), need);
  }
  const contexts = serverSrc.match(/const INTAKE_CONTEXTS = Object\.freeze\((\{[\s\S]*?\n\})\);/);
  const intakeContexts = contexts ? vm.runInNewContext(`(${contexts[1]})`) : {};
  const projectNeeds = new Set(Object.values(intakeContexts).map((row) => row.need_code));
  expect("server_project_contexts_share_building_need", projectNeeds.size === 1 && projectNeeds.has("obra_edificacao_ou_documentacao"), [...projectNeeds].join(","));
  expect("hash_projetos_matches_server_project_contexts", projectNeeds.has(hashNeeds.projetos), hashNeeds.projetos);
  const serverModule = require(path.join(root, "netlify/functions/lib/adaptive-intake.cjs"));
  if (serverModule && serverModule.NEEDS) {
    expect("hash_needs_resolve_to_nuclei", Object.values(hashNeeds).every((need) => Boolean(serverModule.NEEDS[need])));
  }
}

if (failed) {
  console.error("FAILED", failed);
  process.exit(1);
}
console.log("ALL capture_form_preselect checks passed");
