/**
 * Contact context follows an explicit home-form choice while first-touch
 * provenance remains intact.  This runs the source assembly in a VM so a
 * pending script.js rebuild cannot hide a source regression.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = ["analytics", "nav", "offer-fit", "form"]
  .map((name) => fs.readFileSync(path.join(root, "js/modules", `${name}.js`), "utf8")
    .replace(/^\/\* MODULE[\s\S]*?\*\/\r?\n/, ""))
  .join("\n");

const laborTheme = "Assistência técnica trabalhista em SST";
const automaticMessage = (theme) => `Demanda relacionada a: ${theme}.\n\nContexto:\n`;
const servicesHtml = fs.readFileSync(path.join(root, "servicos/index.html"), "utf8");
const laborCtaTag = servicesHtml.match(/<a\b(?=[^>]*data-hub-link="servicos-sst-labor-assistance")[^>]*>/i)?.[0] || "";
const laborCtaAttrs = Object.fromEntries([...laborCtaTag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));

function boot({ search = "", stored = {}, storageDenied = false, stageValue = "perícia, assistência técnica ou avaliação", pathname = "/", hasForm = true, windowName = "", referrer = "https://confenge.com.br/servicos/", origin = "https://confenge.com.br" } = {}) {
  const fields = {};
  const listeners = new Map();
  const stage = {
    value: stageValue,
    options: [
      { value: "perícia, assistência técnica ou avaliação", dataset: { journey: "pericia" } },
      { value: "avaliação de imóvel", dataset: { journey: "avaliacao" } },
      { value: "quantitativos ou orçamento", dataset: { journey: "orcamento" } },
      { value: "contrato em execução", dataset: { journey: "contrato" } },
      { value: "problema urgente em contrato", dataset: { journey: "contrato" } },
    ],
    addEventListener(type, fn) { (listeners.get(`stage:${type}`) || listeners.set(`stage:${type}`, []).get(`stage:${type}`)).push(fn); },
    dispatchEvent(event) { for (const fn of listeners.get(`stage:${event.type}`) || []) fn(event); },
    get selectedIndex() { return this.options.findIndex((option) => option.value === this.value); },
  };
  const makeField = (name, value = "") => ({ name, type: "hidden", value, dataset: {} });
  Object.assign(fields, {
    jornada: makeField("jornada"),
    tema: makeField("tema"),
    origem: makeField("origem", "/"),
    landing_page: makeField("landing_page"),
    utm_source: makeField("utm_source"),
    utm_medium: makeField("utm_medium"),
    utm_campaign: makeField("utm_campaign"),
  });
  const message = { value: "", dataset: {}, focus() {}, setAttribute() {}, getAttribute() { return ""; } };
  const formAttrs = { name: "diagnostico-confenge", "data-form-multistep": "false" };
  const form = {
    dataset: {},
    querySelector(selector) {
      const s = String(selector);
      if (s === "#estagio") return stage;
      if (s === "#mensagem") return message;
      if (s === "#jornada-hidden, input[name=\"jornada\"]") return fields.jornada;
      const match = s.match(/^input\[name="([^"]+)"\]$/);
      return match ? fields[match[1]] || null : null;
    },
    querySelectorAll() { return []; },
    appendChild(element) { fields[element.name] = element; },
    addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, []).get(type)).push(fn); },
    dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); },
    getAttribute(name) { return formAttrs[name] || null; },
    setAttribute(name, value) { formAttrs[name] = String(value); },
    checkValidity: () => true,
  };
  const store = { ...stored };
  const sessionStorage = storageDenied ? {
    getItem() { throw new Error("storage denied"); },
    setItem() { throw new Error("storage denied"); },
    removeItem() { throw new Error("storage denied"); },
  } : {
    getItem: (key) => (Object.hasOwn(store, key) ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
  };
  const documentListeners = [];
  const document = {
    readyState: "complete",
    referrer,
    body: { dataset: {}, classList: { add() {}, remove() {} }, getAttribute: () => null },
    documentElement: { scrollHeight: 1000, style: {}, classList: { replace() {} } },
    querySelector(selector) { return hasForm && String(selector).startsWith("form[name=") ? form : null; },
    querySelectorAll: () => [],
    getElementById: (id) => (id === "mensagem" ? message : null),
    createElement: () => ({ name: "", type: "", value: "", dataset: {}, setAttribute(name, value) { this[name] = String(value); } }),
    addEventListener(type, fn) { documentListeners.push({ type, fn }); },
  };
  const window = {
    window: null,
    document,
    location: { pathname, search, hash: "", origin, hostname: new URL(origin).hostname, href: `${origin}${pathname}${search}` },
    name: windowName,
    sessionStorage,
    dataLayer: [],
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000099" },
    matchMedia: () => ({ matches: false }),
    addEventListener() {}, removeEventListener() {},
    innerHeight: 800, innerWidth: 1200, scrollY: 0,
    setTimeout: () => 0, clearTimeout() {},
  };
  window.window = window;
  vm.runInContext(source, vm.createContext({ window, document, sessionStorage, URLSearchParams, URL, Event: class { constructor(type) { this.type = type; } }, console }));
  const click = (dataset, href) => {
    const anchor = {
      dataset,
      closest: (selector) => (String(selector).includes("a[href]") ? anchor : null),
      getAttribute: (name) => (name === "href" ? href : null),
    };
    documentListeners.filter(({ type }) => type === "click").forEach(({ fn }) => fn({ target: anchor }));
  };
  return { fields, form, message, stage, store, sessionStorage, window, click };
}

function changeNeed(runtime, value) {
  runtime.stage.value = value;
  runtime.stage.dispatchEvent(new Event("change"));
}

const firstTouch = JSON.stringify({
  tema: laborTheme,
  jornada: "pericia",
  origem: "/servicos/",
  landing_url: "/servicos/",
  utm_source: "gsc",
  utm_medium: "organic",
  utm_campaign: "sst",
});

{
  const runtime = boot({ stored: { confenge_pseo_attribution: firstTouch } });
  assert.equal(runtime.message.value, automaticMessage(laborTheme));
  changeNeed(runtime, "avaliação de imóvel");
  assert.equal(runtime.fields.jornada.value, "avaliacao");
  assert.equal(runtime.fields.tema.value, "");
  assert.equal(runtime.message.value, "");
  const stored = JSON.parse(runtime.store.confenge_pseo_attribution);
  assert.equal(stored.tema, undefined);
  assert.equal(stored.jornada, undefined);
  assert.equal(stored.origem, "/servicos/");
  assert.equal(stored.landing_url, "/servicos/");
  assert.equal(stored.utm_source, "gsc");
}

{
  const runtime = boot({ stored: { confenge_pseo_attribution: firstTouch } });
  runtime.message.value = `${automaticMessage(laborTheme)}Caso descrito pelo visitante.`;
  changeNeed(runtime, "quantitativos ou orçamento");
  assert.equal(runtime.fields.jornada.value, "orcamento");
  assert.equal(runtime.fields.tema.value, "");
  assert.equal(runtime.message.value, "Caso descrito pelo visitante.");
  assert.doesNotMatch(runtime.message.value, /Assistência técnica trabalhista/);
}

{
  const contractTouch = JSON.stringify({
    tema: laborTheme,
    jornada: "contrato",
    origem: "/servicos/",
    landing_url: "/servicos/",
    utm_source: "gsc",
  });
  const runtime = boot({ stored: { confenge_pseo_attribution: contractTouch }, stageValue: "" });
  assert.equal(runtime.stage.value, "contrato em execução");
  changeNeed(runtime, "problema urgente em contrato");
  assert.equal(runtime.fields.jornada.value, "contrato");
  assert.equal(runtime.fields.tema.value, "");
  assert.equal(runtime.message.value, "");
}

{
  const prior = boot({ stored: { confenge_pseo_attribution: firstTouch } });
  changeNeed(prior, "avaliação de imóvel");
  const genericRevisit = boot({ stored: prior.store });
  assert.equal(genericRevisit.fields.tema.value, "");
  const specializedRevisit = boot({ search: "?tema=Documenta%C3%A7%C3%A3o+t%C3%A9cnica+de+SST&jornada=sst", stored: prior.store });
  assert.equal(specializedRevisit.fields.tema.value, "Documentação técnica de SST");
  assert.equal(specializedRevisit.fields.jornada.value, "sst");
}

{
  const runtime = boot({
    search: `?tema=${encodeURIComponent(laborTheme)}&jornada=pericia&utm_source=gsc`,
    storageDenied: true,
  });
  changeNeed(runtime, "avaliação de imóvel");
  assert.equal(runtime.fields.jornada.value, "avaliacao");
  assert.equal(runtime.fields.tema.value, "");
  assert.equal(runtime.message.value, "");
}

{
  // /servicos/ has no capture form. With storage denied, its canonical CTA
  // must still carry its approved public context to /#contato without a URL.
  const source = boot({ pathname: "/servicos/", hasForm: false, storageDenied: true });
  assert.equal(laborCtaAttrs.href, "/#contato");
  source.click({
    journey: laborCtaAttrs["data-journey"],
    routeFamily: laborCtaAttrs["data-route-family"],
    tema: laborCtaAttrs["data-tema"],
    origem: laborCtaAttrs["data-origem"],
    originUrl: laborCtaAttrs["data-origin-url"],
  }, laborCtaAttrs.href);
  assert.match(source.window.name, /^confenge:public-context:/);
  assert.equal(source.window.location.search, "");
  const carried = JSON.parse(source.window.name.slice("confenge:public-context:".length));
  assert.deepEqual(Object.keys(carried.context).sort(), ["jornada", "landing_url", "origem", "origin_url", "route_family", "tema"]);
  assert.equal(carried.source_origin, "https://confenge.com.br");
  assert.equal(carried.context.referrer, undefined);
  assert.equal(carried.context.utm_source, undefined);

  const destination = boot({ pathname: "/", storageDenied: true, windowName: source.window.name });
  assert.equal(destination.fields.jornada.value, "pericia");
  assert.equal(destination.fields.tema.value, laborTheme);
  assert.equal(destination.fields.origem.value, "/servicos/");
  assert.equal(destination.fields.landing_url.value, "/servicos/");
  assert.equal(destination.fields.landing_page.value, "/servicos/");
  assert.equal(destination.fields.route_family.value, "servicos-corporativos");
  assert.equal(destination.message.value, automaticMessage(laborTheme));
  assert.equal(destination.window.name, "");

  const prefix = "confenge:public-context:";
  const saved = JSON.parse(source.window.name.slice(prefix.length));
  const cases = [
    { name: "external_referrer", referrer: "https://example.invalid/servicos/", saved },
    { name: "absent_referrer", referrer: "", saved },
    { name: "wrong_source_path", referrer: "https://confenge.com.br/outra-rota/", saved },
    { name: "future_timestamp", referrer: "https://confenge.com.br/servicos/", saved: { ...saved, saved_at: Date.now() + 60 * 1000 } },
    { name: "expired_timestamp", referrer: "https://confenge.com.br/servicos/", saved: { ...saved, saved_at: Date.now() - (10 * 60 * 1000 + 1) } },
    { name: "http_origin", origin: "http://confenge.com.br", referrer: "https://confenge.com.br/servicos/", saved },
    { name: "www_origin", origin: "https://www.confenge.com.br", referrer: "https://confenge.com.br/servicos/", saved },
    { name: "port_origin", origin: "https://confenge.com.br:8443", referrer: "https://confenge.com.br/servicos/", saved },
  ];
  for (const invalid of cases) {
    const rejected = boot({
      pathname: "/",
      storageDenied: true,
      referrer: invalid.referrer,
      origin: invalid.origin,
      windowName: `${prefix}${JSON.stringify(invalid.saved)}`,
    });
    assert.equal(rejected.fields.tema.value, "", invalid.name);
    assert.equal(rejected.window.name, "", `${invalid.name}_cleared`);
  }
}

console.log("stale need context: source assembly checks passed");
