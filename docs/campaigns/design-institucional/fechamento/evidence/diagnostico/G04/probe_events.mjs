// Sonda read-only: carrega rotas do checkout (servidor estático local), clica em controles com
// preventDefault e registra o que entra em window.dataLayer. Não envia nada a produção.
import { writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "/home/tjsasakifln/code/confenge/.worktrees/pos-redesign-20260918/scripts/site/resolve_chrome.mjs";
const BASE = process.argv[2]; const OUT = process.argv[3];
const CASES = [
  ["/", 'a.header-cta[href="/triagem-tecnica/"]', "header Solicitar proposta"],
  ["/", 'a[data-cta-position="hero"][href="/servicos/"]', "hero Ver serviços por situação"],
  ["/", 'a[data-cta-position="hero"][href="/triagem-tecnica/"]', "hero Descrever a minha situação"],
  ["/", 'a[data-cta-id="home-private-quantities-budget"]', "situação Ver quantitativos"],
  ["/", 'a[data-cta-position="corporate_triage"][href="#contato"]', "corporate_triage #contato"],
  ["/", 'a[data-cta-position="corporate_triage"][href^="https://wa.me"]', "corporate_triage whatsapp"],
  ["/", 'a[data-cta-position="corporate_triage"][href^="mailto:"]', "corporate_triage mailto"],
  ["/", 'a[data-event-name="critical_decision_cta_click"]', "contact critical_decision wa.me"],
  ["/servicos/", 'a[data-cta-id="services-private-quantities-budget"]', "hub → quantitativos"],
  ["/servicos/", 'a.button-secondary[href="/triagem-tecnica/"]', "hub Solicitar proposta secundário"],
  ["/quantitativos-orcamento-obras/", 'a[data-cta-id="frame-quantities-budget-hero"]', "hero #triagem-quantitativos"],
  ["/quantitativos-orcamento-obras/", 'a[data-cta-id="quantities-budget-alternative-whatsapp"]', "alt whatsapp"],
  ["/quantitativos-orcamento-obras/", 'a[data-cta-id="quantities-budget-alternative-email"]', "alt mailto"],
  ["/quantitativos-orcamento-obras/", 'a[data-cta-id="quantities-budget-alternative-phone"]', "alt tel"],
  ["/compatibilizacao-projetos-engenharia/", 'a[data-cta-id="frame-coordination-clash-hero"]', "hero #pedido"],
  ["/compatibilizacao-projetos-engenharia/", 'a[data-cta-id="coordination-trust-proof"]', "→ /confianca/"],
  ["/medicoes-glosas-obras-publicas/", 'a[data-cta-position="pillar_hero"][href="#captura-pilar"]', "pilar hero #captura"],
  ["/medicoes-glosas-obras-publicas/", 'a[data-cta-position="pillar_hero"][href^="https://wa.me"]', "pilar hero whatsapp"],
  ["/medicoes-glosas-obras-publicas/", 'a[data-cta-id="diagnosticar-contrato"]', "→ ferramenta"],
  ["/medicoes-glosas-obras-publicas/", 'a[data-cta-position="pillar_bridge"]', "→ /diretoria-b2g/"],
  ["/entregas/", 'a[data-cta-id="deliverables-hero-compare"]', "hero #servicos-e-entregas"],
  ["/entregas/", 'a[data-cta-id="deliverables-hero-capture"]', "hero #captura-entregas"],
  ["/entregas/", 'a[data-cta-id="deliverables-open-relatorio-executivo"]', "→ /casos/"],
  ["/entregas/", 'a[data-cta-id="deliverables-final-bundle"]', "→ /diagnostico-b2g-expansao/"],
  ["/triagem-tecnica/", 'a[data-cta-id="technical-triage-alternative-whatsapp"]', "triagem whatsapp"],
  ["/triagem-tecnica/", 'a[data-cta-id="technical-triage-alternative-email"]', "triagem mailto"],
  ["/triagem-tecnica/", 'a[data-cta-id="technical-triage-alternative-phone"]', "triagem tel"],
];
const b = await puppeteer.launch({ executablePath: resolveChromePath(), headless: true, args: ["--no-sandbox"] });
const rows = [];
for (const [route, sel, label] of CASES) {
  const p = await b.newPage();
  await p.setRequestInterception(true);
  p.on("request", (r) => { const u = r.url(); if (u.startsWith(BASE)) r.continue(); else r.abort(); });
  await p.goto(BASE + route, { waitUntil: "networkidle0", timeout: 60000 });
  const r = await p.evaluate(async (sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const before = (window.dataLayer || []).length;
    el.addEventListener("click", (e) => e.preventDefault(), { capture: true });
    el.click();
    await new Promise((r) => setTimeout(r, 50));
    const after = (window.dataLayer || []).slice(before).map((e) => {
      const o = {}; for (const k of ["event","cta_position","cta_id","cta_kind","destination_type","alias_from","consent","destination_path","route_family","asset_id"]) if (e[k] !== undefined) o[k] = e[k]; return o; });
    return { found: true, text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60), href: (el.getAttribute("href") || "").slice(0, 50), attrs: { event_name: el.getAttribute("data-event-name"), cta_position: el.getAttribute("data-cta-position"), cta_id: el.getAttribute("data-cta-id") }, emitted: after };
  }, sel);
  rows.push({ route, label, selector: sel, ...r });
  console.log(JSON.stringify(rows.at(-1)));
  await p.close();
}
await b.close();
writeFileSync(OUT, JSON.stringify({ base: BASE, measured_at: new Date().toISOString(), method: "servidor estático do checkout; clique com preventDefault; diff de window.dataLayer; requisições externas abortadas", rows }, null, 1) + "\n");
