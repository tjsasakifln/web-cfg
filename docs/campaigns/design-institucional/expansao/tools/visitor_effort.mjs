// Esforço do visitante, mesmo método para base e candidato (aceite 2026-09-18; v2 G04-09).
//   node docs/campaigns/design-institucional/expansao/tools/visitor_effort.mjs --base http://127.0.0.1:8791 --label main --out saida.json /  /servicos/ ...
// Por rota e viewport (390x844, 1440x1000): altura total materializada, prosa visível (chars de
// p/li/dt/dd/h*/figcaption fora de SVG), anotações de desenho (texto dentro de <svg> inline) e das
// pranchas (texto do SVG fonte referenciado por <img src=/pranchas/*.svg>), primeira navegação
// (botão/link primário para outra rota) separada do primeiro contato (wa.me/mailto/tel/submit/
// âncora de captura, excluindo controle fixo), quantas ações acionáveis (união, comparável com o
// contacts_count antigo), e se a ação dominante (primeiro controle em fluxo abaixo do cabeçalho)
// está inteira na primeira tela. Comparar só base e candidato medidos com a mesma versão.
import { writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "../../../../../scripts/site/resolve_chrome.mjs";
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const BASE = opt("--base"); const LABEL = opt("--label", "x"); const OUT = opt("--out", `visitor-effort-${LABEL}.json`);
const ROUTES = argv.filter((a, i) => a.startsWith("/") && !argv[i - 1]?.startsWith("--"));
const b = await puppeteer.launch({ executablePath: resolveChromePath(), headless: true, args: ["--no-sandbox"] });
const rows = [];
for (const route of ROUTES) for (const [w, h] of [[390, 844], [1440, 1000]]) {
  const p = await b.newPage(); await p.setCacheEnabled(false); await p.setViewport({ width: w, height: h });
  await p.goto(BASE + route, { waitUntil: "networkidle0", timeout: 60000 });
  const r = await p.evaluate(async (vh) => {
    document.documentElement.style.scrollBehavior = "auto";
    document.querySelectorAll("*").forEach((el) => { const cs = getComputedStyle(el); if (cs.contentVisibility && cs.contentVisibility !== "visible") el.style.contentVisibility = "visible"; });
    document.querySelectorAll("img[loading=lazy]").forEach((i) => { i.loading = "eager"; });
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
    window.scrollTo(0, document.body.scrollHeight); await new Promise((r) => setTimeout(r, 200)); window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 100));
    const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const main = document.querySelector("main") || document.body;
    let prose = 0, proseNodes = 0;
    for (const el of main.querySelectorAll("p,li,dt,dd,h1,h2,h3,h4,figcaption,summary,label,td,th")) { if (el.closest("svg") || !vis(el)) continue; if ([...el.querySelectorAll("p,li,dt,dd,h1,h2,h3,h4,figcaption,summary,label,td,th")].some(vis)) continue; const t = el.innerText.replace(/\s+/g, " ").trim(); prose += t.length; if (t) proseNodes++; }
    let drawing = 0; for (const t of document.querySelectorAll("svg text")) drawing += (t.textContent || "").trim().length;
    // Pranchas como <img src=".svg">: o texto vive no SVG externo; lê-se o fonte referenciado (mesma origem).
    // 'picture img' (foto do responsável) não é prancha e sai da contagem.
    const plateImgs = [...document.querySelectorAll('img[src*="/pranchas/"]')].filter(vis);
    const plateSources = [...new Set(plateImgs.map((i) => i.currentSrc || i.src))];
    let plateChars = 0; let platesUnreadable = 0;
    for (const u of plateSources) { try { const s = await (await fetch(u, { cache: "no-store" })).text(); const doc = new DOMParser().parseFromString(s, "image/svg+xml"); for (const t of doc.querySelectorAll("text")) plateChars += (t.textContent || "").replace(/\s+/g, " ").trim().length; } catch (_) { platesUnreadable += 1; } }
    const imgs = plateImgs.length;
    // Contato = canal direto (wa.me/mailto/tel) ou entrada no formulário (submit, âncora de captura).
    // Navegação = botão/link primário que leva a outra rota (ex.: /servicos/, /triagem-tecnica/) ou a âncora não-captura.
    const CONTACT_SEL = 'a[href^="https://wa.me"], a[href^="mailto:"], a[href^="tel:"], form button[type=submit], a[href*="#contato"], a[href*="#triagem"], a[href*="#captura"], a[href*="#pedido"]';
    const NAV_SEL = 'a.button-primary, a.button';
    const rect = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), text: (el.innerText || el.value || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 60), href: (el.getAttribute("href") || "form").slice(0, 60) }; };
    const isFixed = (el) => getComputedStyle(el).position === "fixed" || el.classList.contains("whatsapp-float");
    // Só o cabeçalho do site (header.site-header/.site-head, header-cta): <header> também marca herói e section-head.
    const inHeader = (el) => !!el.closest("header.site-header, .site-head") || el.classList.contains("header-cta");
    const contactEls = [...document.querySelectorAll(CONTACT_SEL)].filter(vis);
    const contacts = contactEls.map(rect).sort((a, b) => a.top - b.top);
    const navEls = [...document.querySelectorAll(NAV_SEL)].filter((el) => vis(el) && !el.matches(CONTACT_SEL));
    const navs = navEls.map(rect).sort((a, b) => a.top - b.top);
    // União = mesma população que a ferramenta original media (actions_count ≙ contacts_count antigo).
    const actionEls = [...contactEls, ...navEls];
    const actions = actionEls.map(rect).sort((a, b) => a.top - b.top);
    const contactsInFlow = contactEls.filter((el) => !isFixed(el)).map(rect).sort((a, b) => a.top - b.top);
    const header = document.querySelector("header.site-header, .site-head, header")?.getBoundingClientRect().height || 0;
    const first = contactsInFlow[0] || null;
    const floatEl = contactEls.find(isFixed);
    // Ação dominante = primeiro controle em fluxo abaixo do cabeçalho (nem fixo, nem header-cta).
    const dominant = actionEls.filter((el) => !isFixed(el) && !inHeader(el)).map(rect).filter((c) => c.top >= header).sort((a, b) => a.top - b.top)[0] || null;
    const primaryInFold = dominant ? dominant.bottom <= vh : false;
    const h1 = document.querySelector("h1")?.innerText.replace(/\s+/g, " ").trim().slice(0, 120);
    return { height: document.documentElement.scrollHeight, prose_chars: prose, prose_nodes: proseNodes, drawing_chars: drawing, plate_chars: plateChars, plate_sources: plateSources.map((u) => new URL(u).pathname), plates_unreadable: platesUnreadable, plates_visible: imgs, first_action: actions[0] || null, first_nav: navs[0] || null, first_contact: first, first_contact_float: floatEl ? rect(floatEl) : null, dominant_action: dominant, actions_count: actions.length, contacts_count: contacts.length, navs_count: navs.length, primary_in_fold: primaryInFold, header_h: Math.round(header), h1 };
  }, h);
  rows.push({ route, viewport: `${w}x${h}`, ...r });
  console.log(JSON.stringify(rows[rows.length - 1]));
  await p.close();
}
await b.close();
writeFileSync(OUT, JSON.stringify({ base: BASE, label: LABEL, measured_at: new Date().toISOString(), method_version: "v2-g04-09", method: "fontes carregadas; content-visibility materializado; imagens lazy carregadas; prosa = innerText de p/li/dt/dd/h1-4/figcaption/summary/label/td/th visíveis dentro de <main>, folhas (sem SVG); anotações = texto dentro de <svg> inline (drawing_chars) e texto do SVG fonte das pranchas <img src=/pranchas/*.svg> lido via fetch + DOMParser (plate_chars); plates_visible sem 'picture img'; ação = controle acionável visível na união (botão/link primário OU canal) = população da ferramenta original (actions_count ≙ contacts_count antigo); navegação (first_nav) = botão/link primário que leva a outra rota ou âncora não-captura; contato (first_contact) = canal direto (wa.me/mailto/tel/submit/âncora de captura), inclusive link de prosa, excluindo controle position:fixed (whatsapp-float, reportado em first_contact_float); primary_in_fold = ação dominante (primeiro controle em fluxo abaixo do cabeçalho, sem header-cta nem fixo) inteira na primeira tela; comparar só medições da mesma method_version", rows }, null, 1) + "\n");
