/** Rendered quality gate for /entregas/, its analytics and static nav promotion. */
import fs from "fs";
import path from "path";
import { createServer } from "http";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";
import { footerMatches, proposalAnchorErrors } from "./acquisition_ui_contract.mjs";

// One primary card per published offer; the 54-item operational roll stays internal.
const EXPECTED_EXAMPLES = 8;

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const externalBase = process.argv[2];
const artifactRoot = path.join(root, "_site");
const siteRoot = !externalBase && fs.existsSync(path.join(artifactRoot, "index.html"))
  ? artifactRoot
  : root;
const port = 8795;
const widths = [320, 360, 390, 768, 900, 901, 1024, 1200, 1366, 1440, 1661];
const screenshotDir = String(process.env.DELIVERABLES_SCREENSHOT_DIR || "").trim();
const reportPath = String(process.env.DELIVERABLES_HUB_REPORT || "").trim();
const required = process.env.UI_GEOMETRY_REQUIRED === "1" || Boolean(process.env.CI);
const brand = JSON.parse(fs.readFileSync(path.join(root, "data/site/brand.json"), "utf8"));
const promotedNav = (brand.navigation?.desktop || []).map((item) => item.label);
const footerColumns = JSON.parse(fs.readFileSync(path.join(root, "data/site/public-ia-map.json"), "utf8")).footer.columns;
const legacyNav = ["Serviços", "Problemas que resolvemos", "Conteúdos", "Ferramentas", "Especialista"];
// 2026-09-16: the founder's capture decision (unlock-plan capture.authorization)
// released the six B2G pillars from the shell freeze; they are held to the
// promoted nav like every mutable route. Only pillars still frozen keep the
// legacy contract, derived from the same plan shell_nav reads.
const unlockPlan = JSON.parse(fs.readFileSync(path.join(root, "data/bofu-dominance/frozen-specs/unlock-plan.v1.json"), "utf8"));
const capturePillars = (unlockPlan.protected_pillars || []).map((slug) => `/${slug}/`);
const captureReleased = unlockPlan.capture?.authorization?.decision_state === "EXECUTE_NOW";
const frozenRoutes = captureReleased ? [] : capturePillars;
const releasedPillarRoutes = captureReleased ? capturePillars : [];
const mutableCanonicalRoutes = [
  "/",
  "/ferramentas/",
  "/casos/",
  "/inteligencia/valor-tipico-contratos-pavimentacao/",
  "/privacidade/",
  "/radar/nacional-obras-publicas/",
];

function startStaticServer() {
  const mime = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "application/javascript", ".png": "image/png", ".jpg": "image/jpeg",
    ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json",
  };
  const server = createServer((request, response) => {
    let urlPath = decodeURIComponent((request.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const file = path.join(siteRoot, urlPath);
    if (!file.startsWith(siteRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404); response.end("not found"); return;
    }
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
    response.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

const server = externalBase ? null : await startStaticServer();
const base = externalBase || `http://127.0.0.1:${port}`;
let browser;
if (required && !externalBase && siteRoot !== artifactRoot) {
  console.error("DELIVERABLES_UI_ARTIFACT_MISSING run npm run build:site first");
  if (server) server.close();
  process.exit(2);
}
try {
  browser = await puppeteer.launch({
    executablePath: resolveChromePath(), headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"],
  });
} catch (error) {
  console.log("DELIVERABLES_UI_UNAVAILABLE", String(error?.message || error).slice(0, 240));
  if (server) server.close();
  process.exit(required ? 2 : 0);
}

const findings = [];
let failed = 0;
const page = await browser.newPage();

for (const width of widths) {
  const height = width <= 390 ? 844 : width === 768 ? 1024 : width === 1661 ? 939 : width === 1024 ? 768 : width === 1366 ? 768 : width === 1200 ? 800 : 900;
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const response = await page.goto(`${base}/entregas/`, { waitUntil: "networkidle0", timeout: 30000 });
  const metrics = await page.evaluate(() => {
    const lineCount = (element) => {
      if (!element) return 0;
      const range = document.createRange();
      range.selectNodeContents(element);
      const tops = [...range.getClientRects()]
        .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
        .map((rect) => Math.round(rect.top));
      return new Set(tops).size;
    };
    const visible = (element) => Boolean(
      element
      && getComputedStyle(element).display !== "none"
      && element.getBoundingClientRect().width > 0
      && element.getBoundingClientRect().height > 0,
    );
    const heroCtaElement = document.querySelector('.deliverables-hero .button-primary');
    const heroCta = heroCtaElement?.getBoundingClientRect();
    const firstReport = document.querySelector('[data-cta-id="deliverables-open-report"]')?.getBoundingClientRect();
    const decisionNav = document.querySelector(".offer-decision-nav");
    const decisionNavList = decisionNav?.querySelector("ol");
    const decisionNavBrokenWords = [];
    const decisionNavTextWidths = [];
    for (const link of decisionNav?.querySelectorAll("a") || []) {
      // Onda 2 da campanha 02 (2026-09-17): o indice pela decisao e um
      // page-index regrado (links em linha, sem caixa em grade); mede-se a
      // largura real do link e a altura do alvo de toque.
      decisionNavTextWidths.push(link.getBoundingClientRect().width);
      const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        // Include terminal punctuation in the measured range. Otherwise a
        // question mark can be stranded on its own visual line while the word
        // itself appears intact and the regression slips through the gate.
        for (const match of node.data.matchAll(/\p{L}{4,}[?!…]?/gu)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const tops = new Set([...range.getClientRects()]
            .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
            .map((rect) => Math.round(rect.top * 2) / 2));
          if (tops.size > 1) decisionNavBrokenWords.push(match[0]);
        }
      }
    }
    const firstOffer = document.querySelector("#entrega-01");
    const archetypes = [...document.querySelectorAll('main > [data-section-archetype]')]
      .map((element) => element.getAttribute('data-section-archetype'));
    const primaries = document.querySelectorAll('main .button-primary').length;
    const desktopProjects = document.querySelector('.desktop-nav [data-nav-group="projetos"] > summary')
      || document.querySelector('.desktop-nav a[href="/projetos/"]');
    const footerNavigation = [...document.querySelectorAll('footer .footer-links')].map((column) => ({
      heading: column.querySelector('strong')?.textContent?.trim() || "",
      links: [...column.querySelectorAll('a[href^="/"]')].map((link) => ({ label: link.textContent.trim(), href: link.getAttribute('href') })),
    }));
    const offerCards = [...document.querySelectorAll('article.vitrine-item[data-primary-offer="true"]')];
    const capabilityRows = [...document.querySelectorAll(".capability-item")];
    const engineeringGroups = [...document.querySelectorAll(".capability-group")];
    const intelligenceFooterLink = document.querySelector('footer a[href="/inteligencia/"]');
    const intelligenceFooterBox = intelligenceFooterLink?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      longestArchetypeRun: archetypes.reduce(
        (state, value) => {
          const run = value === state.previous ? state.run + 1 : 1;
          return { previous: value, run, best: Math.max(state.best, run) };
        },
        { previous: null, run: 0, best: 0 },
      ).best,
      primaries,
      h1Count: document.querySelectorAll("h1").length,
      h1Text: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || "",
      heroCtaHref: heroCtaElement?.getAttribute("href") || "",
      heroCtaTargetExists: Boolean(document.querySelector(heroCtaElement?.getAttribute("href") || "#missing-hero-target")),
      heroCtaVisible: Boolean(heroCta && heroCta.width > 0 && heroCta.height >= 44),
      heroCtaBottom: heroCta?.bottom || null,
      firstReportVisible: Boolean(firstReport && firstReport.width > 0 && firstReport.height >= 44),
      documentHeight: Math.round(document.documentElement.scrollHeight),
      intelligenceFooterLinkCount: document.querySelectorAll('footer a[href="/inteligencia/"]').length,
      intelligenceFooterLinkVisible: Boolean(intelligenceFooterBox && intelligenceFooterBox.width > 0 && intelligenceFooterBox.height > 0),
      intelligenceFooterLinkFontSize: intelligenceFooterLink
        ? Number.parseFloat(getComputedStyle(intelligenceFooterLink).fontSize)
        : 0,
      decisionNavTop: Math.round((decisionNav?.getBoundingClientRect().top || 0) + window.scrollY),
      // Correcao apos revisao (onda 2): a geometria de conversao do indice pela
      // decisao e medida em relacao a secao das ofertas (#enquadrar) e a
      // entrada do indice da pagina que leva ate ela, nao por um numero solto.
      offersSectionTop: Math.round((document.querySelector("#enquadrar")?.getBoundingClientRect().top || 0) + window.scrollY),
      pageIndexOffersLinkTop: Math.round((document.querySelector('.page-index a[href="#enquadrar"]')?.getBoundingClientRect().top || 0) + window.scrollY),
      decisionNavHeight: Math.round(decisionNav?.getBoundingClientRect().height || 0),
      decisionNavShortTargets: [...(decisionNav?.querySelectorAll("a") || [])]
        .filter((link) => link.getBoundingClientRect().height < 44).length,
      decisionNavOverflow: Boolean(decisionNavList && decisionNavList.scrollWidth > decisionNavList.clientWidth + 1),
      decisionNavBrokenWords,
      decisionNavMinTextWidth: decisionNavTextWidths.length
        ? Math.round(Math.min(...decisionNavTextWidths) * 10) / 10
        : 0,
      decisionNavFontSize: decisionNav
        ? Number.parseFloat(getComputedStyle(decisionNav.querySelector("a")).fontSize)
        : 0,
      firstOfferTop: Math.round((firstOffer?.getBoundingClientRect().top || 0) + window.scrollY),
      mainLinks: document.querySelectorAll("main a").length,
      offers: offerCards.map((card) => {
        const name = card.querySelector("h2");
        const price = card.querySelector(".vitrine-item__price strong");
        const facts = [...card.querySelectorAll(".vitrine-item__facts>div")];
        const essential = [
          card.querySelector(".vitrine-item__facts"),
          card.querySelector(".vitrine-item__credit"),
          card.querySelector(".vitrine-item__actions"),
          ...facts,
        ];
        return {
          id: card.getAttribute("data-deliverable-id") || "",
          state: card.getAttribute("data-public-state") || "",
          visible: visible(card),
          hiddenEssential: essential.filter((element) => !visible(element)).length,
          factLabels: facts.map((fact) => fact.querySelector("dt")?.textContent?.trim() || ""),
          nameWidth: Math.round(name?.getBoundingClientRect().width || 0),
          priceText: price?.textContent?.replace(/\s+/g, " ").trim() || "",
          priceLines: lineCount(price),
          exampleCtaHeight: Math.round(card.querySelector(".button")?.getBoundingClientRect().height || 0),
          analysisCtaHeight: Math.round(card.querySelector(".text-link")?.getBoundingClientRect().height || 0),
        };
      }),
      capabilityRoll: {
        rowCount: capabilityRows.length,
        stateCounts: capabilityRows.reduce((counts, row) => {
          const state = row.getAttribute("data-public-state") || "";
          counts[state] = (counts[state] || 0) + 1;
          return counts;
        }, {}),
        groups: engineeringGroups.length,
        substantiveGroups: engineeringGroups.filter((group) => (
          (group.querySelector("h3")?.textContent?.trim().length || 0) >= 12
          && (group.querySelector("p")?.textContent?.trim().length || 0) >= 80
          && /^\//.test(group.querySelector("a")?.getAttribute("href") || "")
        )).length,
        openGroups: document.querySelectorAll(".capability-group[open]").length,
        shortSummaries: [...document.querySelectorAll(".capability-group>summary")]
          .filter((summary) => summary.getBoundingClientRect().height < 44).length,
      },
      navProjects: desktopProjects?.textContent?.trim() || "",
      navCurrent: desktopProjects?.getAttribute("aria-current") || "",
      footerNavigation,
      emptyPlaceholders: document.querySelectorAll("[data-placeholder], .placeholder").length,
      overflowOffenders: [...document.querySelectorAll("body *")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return style.display !== "none" && style.position !== "fixed"
            && (rect.left < -1 || rect.right > window.innerWidth + 1);
        })
        .slice(0, 8)
        .map((element) => ({
          tag: element.tagName, className: String(element.className || "").slice(0, 100),
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
        })),
    };
  });
  const errors = [];
  if (!response || ![200, 304].includes(response.status())) errors.push(`http=${response?.status()}`);
  if (metrics.overflow) errors.push("document_overflow");
  const h1 = metrics.h1Text.toLocaleLowerCase("pt-BR");
  if (metrics.h1Count !== 1 || !h1.includes("entregas de engenharia") || !h1.includes("para que ele serve")) errors.push("hero_clarity");
  if (!metrics.heroCtaVisible || !metrics.heroCtaTargetExists || metrics.heroCtaHref !== "#servicos-e-entregas" ||
      (width <= 390 && metrics.heroCtaBottom > height)) errors.push("hero_cta");
  if (!metrics.firstReportVisible || metrics.offers.length !== EXPECTED_EXAMPLES) errors.push("published_offers");
  const expectedIds = Array.from({ length: EXPECTED_EXAMPLES }, (_, index) => `CFG-D${String(index + 1).padStart(2, "0")}`);
  if (JSON.stringify(metrics.offers.map(({ id }) => id)) !== JSON.stringify(expectedIds)) errors.push("published_offer_order");
  if (metrics.offers.some(({ state }) => state !== "PUBLISHED")) errors.push("published_offer_state");
  if (metrics.offers.some((offer) => !offer.visible || offer.hiddenEssential)) errors.push("published_offer_substance_hidden");
  const requiredFacts = ["Situação", "Decisão", "Informações necessárias", "Trabalho incluído", "Saída", "Prazo", "Quando a contagem começa"];
  if (metrics.offers.some(({ factLabels }) => !requiredFacts.every((label) => factLabels.includes(label)))) errors.push("published_offer_facts");
  const starvedName = metrics.offers.filter(({ nameWidth }) => nameWidth < 120);
  if (starvedName.length) errors.push(`offer_name_starved=${starvedName.map(({ nameWidth }) => nameWidth).join(",")}`);
  if (metrics.offers.some(({ exampleCtaHeight, analysisCtaHeight }) => exampleCtaHeight < 44 || analysisCtaHeight < 44)) {
    errors.push("published_offer_touch_targets");
  }
  // Price integrity remains a trust surface in the single primary representation.
  const priceShape = /^R\$ \d{1,3}(\.\d{3})*$/;
  const wrappedPrices = metrics.offers.filter(({ priceLines }) => priceLines !== 1);
  const brokenPrices = metrics.offers.filter(({ priceText }) => !priceShape.test(priceText));
  if (wrappedPrices.length) errors.push(`price_wrapped=${wrappedPrices.map(({ priceText, priceLines }) => `${priceText}/${priceLines}L`).join(",")}`);
  if (brokenPrices.length) errors.push(`price_text_corrupt=${brokenPrices.map(({ priceText }) => priceText).join(",")}`);
  const roll = metrics.capabilityRoll;
  if (roll.rowCount !== 0 || Object.keys(roll.stateCounts).length) errors.push(`internal_capability_leak=${roll.rowCount}`);
  if (roll.groups !== 5 || roll.substantiveGroups !== 5) errors.push(`engineering_groups=${roll.groups}/${roll.substantiveGroups}`);
  // #468 measured 13,098 px at 390 px with the same eight offers rendered three
  // times, later tightened to a 12,500 px budget. #527-#534 (2026-08-30) added four
  // value-first fields per card (value_outcome, value_created, artifact,
  // positive_proof) across all 8 published offers - real per-offer decision
  // substance, not repeated boilerplate (see entregas/index.html data-copy-role
  // blocks). That content measured 15,674 px at 390 px on this branch (stable
  // across repeated local runs), so the 12,500 px budget no longer reflects a
  // page carrying the same substance: the copy was reviewed for repetition and
  // found tight enough to keep, so the budget moves to the measurement instead of
  // being squeezed to fit the old number. #547 then added one distinct, explicit
  // unit -> Diagnosis -> recurring-direction ladder that was absent from the hub.
  // After removing redundant links and duplicate credit copy, the integrated
  // component measures 16,554 px at 390 px. 16,650 px keeps ~96 px (0.6%) of
  // rendering headroom while continuing to catch unrelated page-length drift.
  // The 2026-09-09 founder decision (EXECUTE_NOW) then replaced the eight
  // "Trabalho realizado" sentences: they described disorganization ("sem uma
  // fila comparável") instead of the comparison and prioritization actually
  // produced. Saying the work performed costs characters -- the mandated copy
  // grew 698 -> 960 chars across the eight offers. Two repetition passes ran
  // FIRST, cutting 254 chars by removing the shared three-verb scaffold and
  // restated clauses; only the founder's literal wording for offer 01 is kept
  // verbatim. What remains was reviewed and found substantive, so the budget
  // moves to the measurement rather than squeezing mandated copy back into the
  // old number -- the same rule applied at 12,500 -> 15,750 -> 16,650. The
  // integrated component now measures 16,791 px at 390 px; 16,890 px keeps
  // ~99 px (0.6%) of headroom and still catches unrelated page-length drift.
  // decisionNavTop improved to 1,206 px in the same run, so the taller page did
  // not push the decision nav toward its own 1,800 px limit.
  //
  // 2026-09-10, mesma regra: 16,890 -> 17,900. O orcamento anterior foi calibrado
  // quando a pagina anunciava TRES familias de engenharia. A campanha exige que
  // inspecao, pericia/avaliacao e seguranca do trabalho deixem de dividir um
  // bloco -- sao servicos distintos -- e cinco familias sao conteudo exigido, nao
  // enchimento. Para pagar o minimo possivel por isso, os cinco esquemas
  // ilustrativos ficam em divulgacao progressiva, com a identificacao visivel no
  // proprio summary, e o espacamento dos blocos foi comprimido ate 430 px. O
  // componente integrado mede 17,784 px a 390 px; 17,900 deixa 116 px (0,65%) de
  // folga, a mesma ordem de grandeza das calibracoes anteriores, e continua
  // pegando deriva de comprimento nao relacionada. decisionNavTop caiu para
  // 1,060 px na mesma medicao, longe do proprio limite de 1,800 px.
  // 2026-09-16 (design authority): 17900 -> 18600. The offer facts (dt/dd with
  // material conditions) moved from 12.8px two-column to 14px stacked rows on
  // phones so the labels stop breaking mid-word; no content was added.
  // 2026-09-17 (SALTO-INSTITUCIONAL-02, lote A, onda 2): 18600 -> 21700. A
  // pagina passou ao esqueleto de hub do piloto: cada oferta e uma linha
  // regrada com indice, rotulo | valor por criterio e filete entre criterios,
  // em vez do cartao com grade de tres colunas; os servicos ganharam indice e
  // linha propria; "Condicoes e limites" virou secao; o bloco escuro traz a
  // sequencia do envio. Nenhum campo foi acrescentado nem escondido.
  if (!metrics.intelligenceFooterLinkVisible || metrics.intelligenceFooterLinkFontSize < 14) {
    errors.push("authorized_footer_link_geometry");
  }
  if (metrics.intelligenceFooterLinkCount !== 1) errors.push("authorized_footer_link_count");
  // Geometria de conversao do indice pela decisao (correcao apos revisao,
  // onda 2): o indice e o primeiro bloco da secao das ofertas (#enquadrar),
  // logo depois da cabeca da secao, e a entrada "Analises com preco publicado"
  // do indice da pagina, na abertura, leva ate ele em um toque. O guarda
  // absoluto de 1800 px da composicao antiga (indice em caixa navy antes dos
  // servicos) foi substituido por dois invariantes relativos, que reprovam se
  // o indice se afastar da cabeca da secao ou se a entrada sair da abertura.
  // Medido a 390 px: indice a 346 px do topo de #enquadrar; entrada a 1439 px.
  if (width === 390 && metrics.decisionNavTop - metrics.offersSectionTop > 500) errors.push(`decision_nav_offset=${metrics.decisionNavTop - metrics.offersSectionTop}`);
  if (width === 390 && (!metrics.pageIndexOffersLinkTop || metrics.pageIndexOffersLinkTop > 1800)) errors.push(`page_index_offers_link_top=${metrics.pageIndexOffersLinkTop}`);
  if (width <= 360 && metrics.decisionNavHeight > 560) errors.push(`decision_nav_height=${metrics.decisionNavHeight}`);
  if (metrics.decisionNavShortTargets) errors.push(`decision_nav_touch_targets=${metrics.decisionNavShortTargets}`);
  if (metrics.decisionNavOverflow) errors.push("decision_nav_overflow");
  if (width === 320 && metrics.decisionNavMinTextWidth < 110) {
    errors.push(`decision_nav_text_width=${metrics.decisionNavMinTextWidth}`);
  }
  if (width <= 360 && metrics.decisionNavFontSize < 12.8) {
    errors.push(`decision_nav_font_size=${metrics.decisionNavFontSize}`);
  }
  if (metrics.decisionNavBrokenWords.length) {
    errors.push(`decision_nav_broken_words=${metrics.decisionNavBrokenWords.join(",")}`);
  }
  // 50 -> 54 na onda 2: o indice da pagina (quatro ancoras internas) e a
  // alternativa por e-mail do bloco escuro substituem o bloco "Onde comecar"
  // (tres ancoras) e o aside de fechamento; medido 52. Apos a revisao, o
  // e-mail contextual da abertura (slot svc-open__note do piloto) leva a 53,
  // e o teto acompanha o medido (53), sem folga sem explicacao.
  // 53 -> 58 em 2026-09-19 (campanha BOFU-FECHAMENTO, WS-C): a frente 03
  // ganha tres ancoras de destino (recebimento/entrega, reforma em
  // condominio, documentacao do construido), a frente 04 o link para a
  // avaliacao de imovel, a .contact-alt o WhatsApp contextual e o fechamento
  // o caminho para /servicos/. Medido 58 em todas as larguras; teto igual ao
  // medido.
  // 58 -> 62 em 2026-09-27 (campanha SST-CONVERSION-CORRECTION): a frente 05
  // preserva a entrada do hub e acrescenta as quatro compras BOFU exigidas
  // pelo contrato cross-site: elaborar PGR, revisar PGR, SST para obra e
  // terceirizar documentacao. Medido 62 em todas as larguras; teto igual ao
  // medido, sem folga implicita.
  if (metrics.mainLinks > 62) errors.push(`main_links=${metrics.mainLinks}`);
  if (metrics.longestArchetypeRun > 2) errors.push(`archetype_run=${metrics.longestArchetypeRun}`);
  // One primary leads to the progressive framing and the other submits the
  // terminal hand-raise added by #290; neither replaces a priced offer path.
  if (metrics.primaries > 2) errors.push(`primary_cta_overuse=${metrics.primaries}`);
  if (metrics.navProjects !== "Projetos" || !footerMatches(metrics.footerNavigation, footerColumns)) errors.push("nav_contract");
  if (metrics.emptyPlaceholders) errors.push("empty_placeholders");

  const mobileMenuVisible = await page.$eval('.menu-toggle', element => element.getClientRects().length > 0 && getComputedStyle(element).display !== 'none');
  if (mobileMenuVisible) {
    await page.click(".menu-toggle");
    await page.click('.mobile-nav [data-nav-group="projetos"] > summary');
    const mobile = await page.evaluate(() => {
      const menu = document.querySelector(".mobile-nav");
      const link = menu?.querySelector('a[data-nav-primary="true"][href="/projetos/"]');
      return {
        expanded: document.querySelector(".menu-toggle")?.getAttribute("aria-expanded"),
        linkVisible: Boolean(link && link.getBoundingClientRect().height >= 44),
        linkText: link?.getAttribute('data-nav-label') || "",
      };
    });
    if (mobile.expanded !== "true" || !mobile.linkVisible || mobile.linkText !== "Projetos") {
      errors.push("mobile_nav");
    }
    await page.click(".menu-toggle");
  }
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.mouse.move(1, 1);
    await page.screenshot({
      path: path.join(screenshotDir, `deliverables-${width}.png`),
      fullPage: width === 390 || width === 1440,
    });
  }
  findings.push({ route: "/entregas/", width, height, ...metrics, errors });
  if (errors.length) failed += 1;
}

// Keep the historical 390px ceiling and the GA component's separate budget.
// PR #836 adds only two credited navigation items: the 89px discovery bar
// and the 44px footer link plus its existing 10px grid gap. The base pSEO run
// 43225430844 measured 24285px without GA; run 43299220190 measured 24432px.
// Their 147px difference is 89 + 54 + 4px in the header. The header receives
// no credit: those 4px remain inside the unchanged historical 24300px ceiling.
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await page.goto(`${base}/entregas/`, { waitUntil: "networkidle0", timeout: 30000 });
const preferenceHeightGate = await page.evaluate(() => {
  const selector = "footer.site-footer > p#confenge-analytics-preference.footer-analytics-preference";
  const preference = document.querySelector(selector);
  const documentHeight = () => Math.round(document.documentElement.scrollHeight);
  const measure = () => {
    const style = preference ? getComputedStyle(preference) : null;
    const rect = preference?.getBoundingClientRect();
    const marginTop = style ? Number.parseFloat(style.marginTop) : Number.NaN;
    const marginBottom = style ? Number.parseFloat(style.marginBottom) : Number.NaN;
    const outer = rect && Number.isFinite(marginTop) && Number.isFinite(marginBottom)
      ? rect.height + marginTop + marginBottom : Number.NaN;
    const interactive = preference
      ? [...preference.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      : [];
    return {
      fullHeight: documentHeight(),
      preferenceOuterHeight: Math.round(outer * 100) / 100,
      normalizedHeight: Number.isFinite(outer) ? Math.round(documentHeight() - outer) : null,
      selectorCount: document.querySelectorAll(selector).length,
      idCount: document.querySelectorAll('#confenge-analytics-preference').length,
      directLastChild: Boolean(preference && preference.parentElement?.lastElementChild === preference),
      visible: Boolean(rect && rect.width > 0 && rect.height > 0 && style.visibility !== "hidden"
        && Number.parseFloat(style.opacity) > 0),
      display: style?.display || "",
      position: style?.position || "",
      float: style?.float || "",
      transform: style?.transform || "",
      marginTop,
      marginBottom,
      contentClipped: Boolean(preference && (preference.scrollHeight > preference.clientHeight + 1
        || preference.scrollWidth > preference.clientWidth + 1)),
      interactiveCount: interactive.length,
      buttonCount: preference?.querySelectorAll('button[type="button"]').length || 0,
      privacyLinkCount: preference?.querySelectorAll('a[href="/privacidade/"]').length || 0,
      defaultDenied: (() => {
        try { return localStorage.getItem("confenge_google_analytics_consent") !== "granted"; } catch { return true; }
      })(),
      interactiveTargets: interactive.map((element) => {
        const target = element.getBoundingClientRect();
        const host = preference?.getBoundingClientRect();
        const targetStyle = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(), type: element.getAttribute("type"), href: element.getAttribute("href"),
          width: Math.round(target.width * 100) / 100, height: Math.round(target.height * 100) / 100,
          visible: targetStyle.display !== 'none' && !['hidden', 'collapse'].includes(targetStyle.visibility)
            && Number.parseFloat(targetStyle.opacity) > 0,
          inside: Boolean(host && target.left >= host.left - 1 && target.right <= host.right + 1
            && target.top >= host.top - 1 && target.bottom <= host.bottom + 1),
        };
      }),
    };
  };
  const initialStyle = preference?.getAttribute("style");
  const baseline = measure();
  const main = document.querySelector("main");
  const mainHeight = () => main?.getBoundingClientRect().height ?? Number.NaN;
  const initialMainHeight = mainHeight();
  const restoreStyle = (element, style) => {
    if (!element) return;
    if (style === null) element.removeAttribute("style");
    else element.setAttribute("style", style);
  };
  const visibleInTree = (element) => {
    if (!element || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || ["hidden", "collapse"].includes(style.visibility)
        || Number.parseFloat(style.opacity) === 0) return false;
    }
    return true;
  };
  const identities = (links) => links.map((link) => [link.getAttribute("href"), link.textContent.trim()]);
  const discoveryLinks = [
    ["/cad/", "Editor DWG"], ["/bim/", "BIM e IFC"], ["/projetos-prontos/", "Projetos prontos"],
    ["/ferramentas/radar-mercado-publico/", "Radar público"], ["/empresa/", "A CONFENGE"],
  ];
  const projectsLinks = [
    ["/projetos-prontos/", "Projetos prontos"], ["/projetos/estruturas/", "Estruturas"],
    ["/projetos/instalacoes/", "Instalações"], ["/projetos/infraestrutura/", "Infraestrutura"],
    ["/projetos/coordenacao-multidisciplinar/", "Coordenação multidisciplinar"],
  ];
  // Fixed budgets, never taken from the current page's height or a mutation.
  const navigationDefinitions = [
    { name: "discovery", selector: ".nav-discovery-region", budget: 90 },
    { name: "footerReadyProjects", selector: 'footer.site-footer a[href="/projetos-prontos/"]', budget: 54 },
  ];
  const measureNavigation = () => {
    const fullHeight = documentHeight();
    const contentHeight = mainHeight();
    const components = navigationDefinitions.map(({ name, selector, budget }) => {
      const matches = [...document.querySelectorAll(selector)];
      const element = matches[0];
      const rect = element?.getBoundingClientRect();
      const style = element ? getComputedStyle(element) : null;
      const marginTop = style ? Number.parseFloat(style.marginTop) : Number.NaN;
      const marginBottom = style ? Number.parseFloat(style.marginBottom) : Number.NaN;
      const links = name === "discovery" ? [...(element?.querySelectorAll("a") || [])] : element ? [element] : [];
      const parent = element?.parentElement;
      const rowGap = name === "footerReadyProjects" && parent ? Number.parseFloat(getComputedStyle(parent).rowGap) : 0;
      const outerHeight = rect ? rect.height + marginTop + marginBottom : Number.NaN;
      const contribution = outerHeight + rowGap;
      const targets = links.map((link) => {
        const box = link.getBoundingClientRect();
        return {
          width: box.width, height: box.height, top: box.top,
          visible: visibleInTree(link),
          inside: Boolean(rect && box.left >= rect.left - 1 && box.right <= rect.right + 1
            && box.top >= rect.top - 1 && box.bottom <= rect.bottom + 1),
          clipped: link.scrollWidth > link.clientWidth + 1 || link.scrollHeight > link.clientHeight + 1,
        };
      });
      const discovery = name === "discovery";
      const checks = {
        identity: Boolean(matches.length === 1 && (discovery
          ? element?.matches('nav[aria-label="Acesso direto"]')
            && element.parentElement === document.body
            && element.previousElementSibling?.matches("header.site-header")
            && element.nextElementSibling?.matches("main#conteudo")
            && element.children.length === 1
            && element.firstElementChild.matches('.nav-discovery[data-nav-discovery="true"]')
            && document.querySelectorAll('[data-nav-discovery="true"]').length === 1
            && JSON.stringify(identities(links)) === JSON.stringify(discoveryLinks)
          : parent?.matches(".site-footer > .footer-top > .footer-links")
            && parent === document.querySelector("footer.site-footer .footer-links")
            && parent.firstElementChild?.matches("strong")
            && parent.firstElementChild.textContent.trim() === "Projetos"
            && element.previousElementSibling === parent.firstElementChild
            && JSON.stringify(identities([...parent.querySelectorAll(":scope > a")])) === JSON.stringify(projectsLinks))),
        geometry: visibleInTree(element) && style?.position === "static" && style.float === "none"
          && style.transform === "none" && marginTop === 0 && marginBottom === 0
          && (discovery ? style.display === "block" : getComputedStyle(parent).display === "grid" && rowGap === 10)
          && !(element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1),
        targets: targets.length === (discovery ? 5 : 1) && targets.every((target) => target.visible
          && target.width >= 44 && target.height >= 44 && target.inside && !target.clipped),
        budget: Number.isFinite(contribution) && contribution > 0 && contribution <= budget,
        rows: discovery ? new Set(targets.map((target) => Math.round(target.top))).size === 2 : rect?.height === 44,
      };
      const savedStyle = element?.getAttribute("style");
      if (element) element.style.display = "none";
      const hiddenHeight = documentHeight();
      const hiddenMainHeight = mainHeight();
      restoreStyle(element, savedStyle);
      const restoredHeight = documentHeight();
      const delta = fullHeight - hiddenHeight;
      checks.triangular = Number.isFinite(contribution) && Math.abs(delta - contribution) <= 1;
      checks.restored = restoredHeight === fullHeight;
      checks.mainPreserved = Number.isFinite(contentHeight) && hiddenMainHeight === contentHeight && mainHeight() === contentHeight;
      return { name, selector, budget, selectorCount: matches.length, outerHeight, rowGap, contribution,
        hiddenHeight, delta, restoredHeight, targets, checks, valid: Object.values(checks).every(Boolean) };
    });
    const elements = navigationDefinitions.map(({ selector }) => document.querySelector(selector));
    const savedStyles = elements.map((element) => element?.getAttribute("style"));
    for (const element of elements) if (element) element.style.display = "none";
    const hiddenTogetherHeight = documentHeight();
    const hiddenTogetherMainHeight = mainHeight();
    elements.forEach((element, index) => restoreStyle(element, savedStyles[index]));
    const totalContribution = components.reduce((total, component) => total + component.contribution, 0);
    const combinedChecks = {
      triangular: Number.isFinite(totalContribution) && Math.abs(fullHeight - hiddenTogetherHeight - totalContribution) <= 1,
      restored: documentHeight() === fullHeight,
      mainPreserved: document.querySelectorAll("main").length === 1 && Number.isFinite(contentHeight)
        && hiddenTogetherMainHeight === contentHeight && mainHeight() === contentHeight,
    };
    const valid = components.every((component) => component.valid) && Object.values(combinedChecks).every(Boolean);
    return { components, combinedChecks, hiddenTogetherHeight, totalContribution, mainHeight: contentHeight,
      valid, creditedHeight: valid ? totalContribution : 0 };
  };
  const navigation = measureNavigation();
  const navigationNegativeControls = {};
  for (const definition of navigationDefinitions) {
    const element = document.querySelector(definition.selector);
    if (!element) {
      navigationNegativeControls[`${definition.name}Growth`] = false;
      navigationNegativeControls[`${definition.name}Hidden`] = false;
      navigationNegativeControls[`${definition.name}Duplicate`] = false;
      continue;
    }
    const savedStyle = element.getAttribute("style");
    element.style.minHeight = `${definition.budget + 1}px`;
    const expanded = measureNavigation();
    navigationNegativeControls[`${definition.name}Growth`] = !expanded.valid && expanded.creditedHeight === 0
      && expanded.components.find(({ name }) => name === definition.name).contribution > definition.budget;
    restoreStyle(element, savedStyle);
    element.style.display = "none";
    const hidden = measureNavigation();
    navigationNegativeControls[`${definition.name}Hidden`] = !hidden.valid && hidden.creditedHeight === 0;
    restoreStyle(element, savedStyle);
    const duplicate = element.cloneNode(true);
    element.after(duplicate);
    const duplicated = measureNavigation();
    navigationNegativeControls[`${definition.name}Duplicate`] = !duplicated.valid && duplicated.creditedHeight === 0;
    duplicate.remove();
  }
  // Measured 113.86px on 2026-10-26, plus 16px of fixed rendering headroom.
  // Never derive the budget from the current run: that would accept growth.
  const componentBudget = 130;
  // Triangulate the contribution instead of trusting a subtraction alone.
  if (preference) preference.style.display = "none";
  const hiddenHeight = documentHeight();
  if (preference) {
    if (initialStyle === null) preference.removeAttribute("style");
    else preference.setAttribute("style", initialStyle);
  }
  const restoredHeight = documentHeight();
  const delta = baseline.fullHeight - hiddenHeight;
  const baselineChecks = {
    historical: baseline.normalizedHeight !== null && Math.round(baseline.fullHeight - baseline.preferenceOuterHeight - navigation.creditedHeight) <= 24300,
    component: componentBudget !== null && baseline.preferenceOuterHeight <= componentBudget,
    componentMaximum: componentBudget !== null && componentBudget <= 190,
    triangular: Number.isFinite(baseline.preferenceOuterHeight)
      && Math.abs(delta - baseline.preferenceOuterHeight) <= 1,
    restored: restoredHeight === baseline.fullHeight,
  };
  // Real DOM regressions: each mutation must trip its corresponding guard.
  let componentRegression = null;
  let historicalRegression = null;
  if (preference && componentBudget !== null) {
    preference.style.minHeight = `${Math.ceil(componentBudget) + 1}px`;
    const expanded = measure();
    componentRegression = expanded.preferenceOuterHeight > componentBudget;
    if (initialStyle === null) preference.removeAttribute("style");
    else preference.setAttribute("style", initialStyle);
  }
  if (preference) {
    const before = document.createElement("div");
    before.setAttribute("data-height-gate-probe", "true");
    const normalizedBaseline = baseline.fullHeight - baseline.preferenceOuterHeight - navigation.creditedHeight;
    const probeHeight = Math.max(1, Math.ceil(24301 - normalizedBaseline));
    before.style.cssText = `display:block; height:${probeHeight}px; min-height:${probeHeight}px; margin:0; padding:0; border:0; clear:both;`;
    // Grow actual hub content outside both credited navigation components.
    if (main) main.append(before);
    else preference.before(before);
    const expanded = measure();
    const expandedNavigation = measureNavigation();
    historicalRegression = Math.round(expanded.fullHeight - expanded.preferenceOuterHeight - expandedNavigation.creditedHeight) > 24300
      && expandedNavigation.creditedHeight === navigation.creditedHeight;
    before.remove();
  }
  const afterNegativeTests = measure();
  const restoredNavigation = measureNavigation();
  navigationNegativeControls.restored = afterNegativeTests.fullHeight === baseline.fullHeight
    && mainHeight() === initialMainHeight && restoredNavigation.creditedHeight === navigation.creditedHeight;
  return {
    ...baseline,
    componentBudget,
    hiddenHeight,
    delta,
    restoredHeight,
    baselineChecks,
    navigation,
    navigationNegativeControls,
    negativeControls: { componentRegression, historicalRegression, restored: afterNegativeTests.fullHeight === baseline.fullHeight },
  };
});
const preferenceHeightErrors = [];
if (preferenceHeightGate.selectorCount !== 1 || preferenceHeightGate.idCount !== 1 || !preferenceHeightGate.directLastChild) preferenceHeightErrors.push("preference_selector_or_position");
if (!preferenceHeightGate.visible || preferenceHeightGate.display !== "block" || preferenceHeightGate.position !== "static"
  || preferenceHeightGate.float !== "none" || preferenceHeightGate.transform !== "none"
  || !Number.isFinite(preferenceHeightGate.marginTop) || preferenceHeightGate.marginTop < 0
  || !Number.isFinite(preferenceHeightGate.marginBottom) || preferenceHeightGate.marginBottom < 0
  || preferenceHeightGate.contentClipped) preferenceHeightErrors.push("preference_geometry");
if (preferenceHeightGate.interactiveCount !== 3 || preferenceHeightGate.buttonCount !== 2 || preferenceHeightGate.privacyLinkCount !== 1
  || !preferenceHeightGate.defaultDenied
  || preferenceHeightGate.interactiveTargets.some((target) => target.width < 44 || target.height < 44 || !target.inside || !target.visible)) preferenceHeightErrors.push("preference_interactions");
const validPreferenceContribution = preferenceHeightErrors.length === 0
  && preferenceHeightGate.baselineChecks.component && preferenceHeightGate.baselineChecks.triangular
  && preferenceHeightGate.baselineChecks.restored;
preferenceHeightGate.creditedPreferenceHeight = validPreferenceContribution ? preferenceHeightGate.preferenceOuterHeight : 0;
for (const component of preferenceHeightGate.navigation.components) {
  for (const [name, passed] of Object.entries(component.checks)) if (!passed) preferenceHeightErrors.push(`navigation_${component.name}_${name}`);
}
for (const [name, passed] of Object.entries(preferenceHeightGate.navigation.combinedChecks)) if (!passed) preferenceHeightErrors.push(`navigation_combined_${name}`);
const navigationControlsPassed = Object.values(preferenceHeightGate.navigationNegativeControls).every(Boolean);
if (!navigationControlsPassed) preferenceHeightErrors.push("navigation_negative_controls");
preferenceHeightGate.creditedNavigationHeight = preferenceHeightGate.navigation.valid && navigationControlsPassed
  ? preferenceHeightGate.navigation.creditedHeight : 0;
preferenceHeightGate.normalizedHeight = Math.round(preferenceHeightGate.fullHeight - preferenceHeightGate.creditedPreferenceHeight - preferenceHeightGate.creditedNavigationHeight);
preferenceHeightGate.baselineChecks.historical = preferenceHeightGate.normalizedHeight <= 24300;
for (const [name, passed] of Object.entries(preferenceHeightGate.baselineChecks)) if (!passed) preferenceHeightErrors.push(`preference_${name}`);
if (!preferenceHeightGate.negativeControls.componentRegression || !preferenceHeightGate.negativeControls.historicalRegression
  || !preferenceHeightGate.negativeControls.restored) preferenceHeightErrors.push("preference_negative_controls");
findings.push({ route: "/entregas/", check: "footer_analytics_preference_height", ...preferenceHeightGate, errors: preferenceHeightErrors });
if (preferenceHeightErrors.length) failed += 1;
if (screenshotDir) {
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.mouse.move(1, 1);
  const footer = await page.$("footer.site-footer");
  if (!footer) throw new Error("deliverables_footer_missing_for_review");
  const original = await page.evaluate(() => {
    const footer = document.querySelector("footer.site-footer").getBoundingClientRect();
    const header = document.querySelector("header.site-header").getBoundingClientRect();
    return { footerWidth: footer.width, footerHeight: footer.height, headerHeight: header.height };
  });
  // Only the capture uses a taller viewport. Keep the entire footer below
  // the sticky header without hiding either element or changing its CSS.
  const captureHeight = Math.ceil(original.footerHeight + original.headerHeight + 2);
  await page.setViewport({ width: 390, height: captureHeight, deviceScaleFactor: 1 });
  await page.evaluate(async () => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const framing = await page.evaluate(() => {
    const footer = document.querySelector("footer.site-footer").getBoundingClientRect();
    const header = document.querySelector("header.site-header").getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      footer: { width: footer.width, height: footer.height, top: footer.top, bottom: footer.bottom, left: footer.left, right: footer.right },
      headerBottom: header.bottom,
    };
  });
  const captureErrors = [];
  if (framing.viewportWidth !== 390 || Math.abs(framing.footer.width - original.footerWidth) > 1
    || Math.abs(framing.footer.height - original.footerHeight) > 1) captureErrors.push("footer_capture_geometry_changed");
  if (framing.footer.top < framing.headerBottom + 0.5 || framing.footer.top < 0
    || framing.footer.bottom > framing.viewportHeight || framing.footer.left < 0
    || framing.footer.right > framing.viewportWidth) captureErrors.push("footer_capture_obscured_or_outside_viewport");
  findings.push({ route: "/entregas/", check: "footer_review_capture", original, ...framing, errors: captureErrors });
  if (captureErrors.length) failed += 1;
  else await footer.screenshot({ path: path.join(screenshotDir, "footer-mobile-390.png") });
}

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await page.goto(`${base}/entregas/`, { waitUntil: "networkidle0", timeout: 30000 });
const catalogLazyBefore = await page.evaluate(() => performance.getEntriesByType("resource")
  .map((entry) => entry.name)
  .filter((name) => name.endsWith("/entregas/catalog-data.js") || name.endsWith("/entregas/catalog.js")));
const catalogErrors = [];
if (catalogLazyBefore.length) catalogErrors.push("catalog_scripts_loaded");
const catalogBoot = await page.evaluate(() => ({
  enhanced: document.body.classList.contains("catalog-enhanced"),
  dataSchema: window.CONFENGE_CATALOG_DATA?.schema || "",
  dataCount: window.CONFENGE_CATALOG_DATA?.items?.length || 0,
  filterPresent: Boolean(document.querySelector("[data-catalog-filters]")),
  cards: document.querySelectorAll("article.vitrine-item").length,
  backlogCards: document.querySelectorAll("article.catalog-item").length,
  capabilityRows: document.querySelectorAll(".capability-item").length,
  capabilityGroups: document.querySelectorAll(".capability-group").length,
}));
if (catalogBoot.enhanced || catalogBoot.filterPresent || catalogBoot.dataCount) catalogErrors.push("catalog_not_retired");
if (
  catalogBoot.cards !== EXPECTED_EXAMPLES
  || catalogBoot.backlogCards !== 0
  || catalogBoot.capabilityRows !== 0
  || catalogBoot.capabilityGroups !== 5
) catalogErrors.push("catalog_data_contract");
const frameKeyboard = await page.evaluate(() => {
  const first = document.querySelector(".offer-decision-nav a");
  first?.focus();
  return { href: first?.getAttribute("href") || "", active: document.activeElement === first };
});
if (frameKeyboard.href !== "#entrega-01" || !frameKeyboard.active) catalogErrors.push("frame_keyboard");
findings.push({ route: "/entregas/", check: "public_vitrine", catalogLazyBefore, catalogBoot, frameKeyboard, errors: catalogErrors });
if (catalogErrors.length) failed += 1;

const noScriptPage = await browser.newPage();
await noScriptPage.setJavaScriptEnabled(false);
await noScriptPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await noScriptPage.goto(`${base}/entregas/`, { waitUntil: "networkidle0", timeout: 30000 });
const noScriptCatalog = await noScriptPage.evaluate(() => ({
  cards: document.querySelectorAll("article.vitrine-item").length,
  visibleCards: [...document.querySelectorAll("article.vitrine-item")].filter((card) => getComputedStyle(card).display !== "none").length,
  backlogCards: document.querySelectorAll("article.catalog-item").length,
  capabilityRows: document.querySelectorAll(".capability-item").length,
  capabilityGroups: document.querySelectorAll(".capability-group").length,
  decisionNav: Boolean(document.querySelector(".offer-decision-nav")),
  essentialFactSets: [...document.querySelectorAll("article.vitrine-item")]
    .map((card) => [...card.querySelectorAll(".vitrine-item__facts dt")].map((dt) => dt.textContent.trim())),
  filters: Boolean(document.querySelector("[data-catalog-filters]")),
}));
const noScriptErrors = [];
if (
  noScriptCatalog.cards !== EXPECTED_EXAMPLES
  || noScriptCatalog.visibleCards !== EXPECTED_EXAMPLES
  || noScriptCatalog.backlogCards !== 0
  || noScriptCatalog.capabilityRows !== 0
  || noScriptCatalog.capabilityGroups !== 5
) {
  noScriptErrors.push("catalog_noscript_content");
}
const noScriptFactLabels = ["Situação", "Decisão", "Informações necessárias", "Trabalho incluído", "Saída", "Prazo", "Quando a contagem começa"];
if (
  !noScriptCatalog.decisionNav
  || noScriptCatalog.essentialFactSets.some((labels) => !noScriptFactLabels.every((label) => labels.includes(label)))
) {
  noScriptErrors.push("catalog_noscript_decision_content");
}
if (noScriptCatalog.filters) noScriptErrors.push("catalog_noscript_controls");
findings.push({ route: "/entregas/", check: "catalog_noscript", noScriptCatalog, errors: noScriptErrors });
if (noScriptErrors.length) failed += 1;
await noScriptPage.close();

// The header must always offer a commercial path. .header-cta was hidden from
// 1240px down while .menu-toggle only appeared at 900px, so every width between
// 901 and 1240 showed navigation with no call to action and no menu either.
for (const width of [390, 901, 960, 1000, 1120, 1240, 1366, 1661]) {
  await page.setViewport({ width, height: 800, deviceScaleFactor: 1 });
  await page.goto(`${base}/`, { waitUntil: "networkidle0", timeout: 30000 });
  const header = await page.evaluate(() => {
    const visible = (element) => Boolean(element && getComputedStyle(element).display !== "none"
      && element.getBoundingClientRect().width > 0);
    const cta = document.querySelector(".header-cta");
    const inner = document.querySelector(".header-inner");
    return {
      ctaVisible: visible(cta),
      navVisible: visible(document.querySelector(".desktop-nav")),
      toggleVisible: visible(document.querySelector(".menu-toggle")),
      ctaOverflowsHeader: Boolean(visible(cta) && inner
        && cta.getBoundingClientRect().right > inner.getBoundingClientRect().right + 1),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  const errors = [];
  // The opened mobile menu carries the CTA when the responsive toggle replaces
  // the desktop navigation. Observe that state instead of assuming a breakpoint.
  if (header.navVisible && !header.ctaVisible) errors.push("header_cta_missing");
  if (!header.navVisible && !header.toggleVisible) errors.push("header_nav_unreachable");
  if (header.ctaOverflowsHeader) errors.push("header_cta_overflows");
  if (header.overflow) errors.push("document_overflow");
  findings.push({ route: "/", check: "header_commercial_path", width, ...header, errors });
  if (errors.length) failed += 1;
}

for (const { route, expectedNav } of [
  ...mutableCanonicalRoutes.map((route) => ({ route, expectedNav: promotedNav })),
  ...releasedPillarRoutes.map((route) => ({ route, expectedNav: promotedNav })),
  ...frozenRoutes.map((route) => ({ route, expectedNav: legacyNav })),
]) {
  await page.setViewport({ width: 1024, height: 900, deviceScaleFactor: 1 });
  const response = await page.goto(`${base}${route}`, { waitUntil: "networkidle0", timeout: 30000 });
  const metrics = await page.evaluate((currentRoute) => {
    const grouped = Boolean(document.querySelector('.desktop-nav .nav-group'));
    const nav = [...document.querySelectorAll(grouped ? '.desktop-nav [data-nav-primary="true"]' : '.desktop-nav a')].map((a) => ({
      text: a.getAttribute('data-nav-label') || a.textContent?.trim(), href: a.getAttribute("href"),
    }));
    return {
      route: currentRoute,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      nav,
      navLabels: nav.map(({ text }) => text),
      corporateProjectsPath: currentRoute === "/"
        ? Boolean(document.querySelector('main a[href="/projetos/"]'))
        : null,
      sections: currentRoute === "/" ? document.querySelectorAll("main > section").length : null,
    };
  }, route);
  const errors = [];
  if (!response || ![200, 304].includes(response.status())) errors.push(`http=${response?.status()}`);
  if (metrics.overflow) errors.push("document_overflow");
  if (JSON.stringify(metrics.navLabels) !== JSON.stringify(expectedNav)) {
    errors.push(`nav_order=${JSON.stringify(metrics.navLabels)}`);
  }
  if (expectedNav === promotedNav) {
    if (metrics.nav.filter(({ href }) => href === "/projetos/").length !== 1) errors.push("projects_nav_missing");
    if (metrics.nav.filter(({ href }) => href === "/ferramentas/").length !== 1) errors.push("tools_nav_count");
    if (metrics.nav.some(({ text }) => text === "Entregas")) errors.push("entregas_still_in_header");
  } else {
    if (metrics.nav.some(({ text }) => text === "Entregas")) errors.push("frozen_nav_mutated");
    if (metrics.nav.filter(({ href }) => href === "/ferramentas/").length !== 1) errors.push("frozen_tools_missing");
  }
  // VALOR-IMEDIATO-20260914: a home tem entre 5 e 8 blocos narrativos (a
  // contagem exata era numero magico e impedia retirar secoes genéricas); o
  // caminho de descoberta de projetos continua acessível na home.
  if (route === "/" && (!metrics.corporateProjectsPath || metrics.sections < 5 || metrics.sections > 8)) {
    errors.push(`home_projects_path_contract sections=${metrics.sections}`);
  }
  if (route === "/" && screenshotDir) {
    const situations = await page.$('#situacoes');
    if (situations) await situations.screenshot({ path: path.join(screenshotDir, "home-situations.png") });
  }
  findings.push({ ...metrics, errors });
  if (errors.length) failed += 1;
}

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await page.goto(`${base}/entregas/`, { waitUntil: "networkidle0", timeout: 30000 });
await page.evaluate(() => {
  const target = document.querySelector('[data-cta-id="deliverables-open-report"]');
  target?.addEventListener("click", (event) => event.preventDefault(), { capture: true });
});
await page.click('[data-cta-id="deliverables-open-report"]');
const analytics = await page.evaluate(() => {
  const events = (window.dataLayer || []).filter(({ event }) => event === "cta_click");
  const event = events.at(-1) || null;
  const piiKeys = ["email", "phone", "cnpj", "document", "nome", "empresa", "query"];
  const hasPiiKey = Boolean(event && piiKeys.some((key) => Object.prototype.hasOwnProperty.call(event, key)));
  const hasPiiValue = Boolean(event && Object.values(event).some((value) => {
    if (typeof value !== "string") return false;
    if (value.includes("@")) return true;
    return /^\d{10,15}$/.test(value.replace(/[\s()+-]/g, ""));
  }));
  return { count: events.length, event, hasPiiKey, hasPiiValue };
});
if (
  analytics.count !== 1
  || analytics.event?.cta_id !== "deliverables-open-report"
  || analytics.event?.asset_id !== "entregas-exemplos-hub"
  || analytics.event?.source !== "CONFENGE_WEB"
  || analytics.event?.page_path !== "/entregas/"
  || analytics.hasPiiKey
  || analytics.hasPiiValue
) {
  failed += 1;
  findings.push({ route: "/entregas/", check: "analytics", analytics, errors: ["analytics_contract"] });
} else {
  findings.push({ route: "/entregas/", check: "analytics", analytics, errors: [] });
}
// POS-REDESIGN-FECHAMENTO-20260918 (G04-02): each in-page anchor CTA of the two
// private purchase routes emits exactly one cta_click with its own cta_id and
// the same route_family/asset_id the route's contact channels carry, so intent
// and channel stay attributable inside one route (analytics-agg groups by them).
const ANCHOR_CTA_CASES = [
  {
    route: "/quantitativos-orcamento-obras/",
    route_family: "private-engineering-quantities-budget",
    asset_id: "private_quantities_budget_route_v1",
    href: "#triagem-quantitativos",
    ctas: ["quantitativos-orcamento-obras-hero-proposal"],
  },
  {
    route: "/compatibilizacao-projetos-engenharia/",
    route_family: "engineering-projects-coordination-clash",
    asset_id: "engineering_coordination_clash_route_v1",
    href: "#pedido-compatibilizacao",
    ctas: ["compatibilizacao-projetos-engenharia-hero-proposal"],
  },
];
for (const ctaCase of ANCHOR_CTA_CASES) {
  for (const ctaId of ctaCase.ctas) {
    await page.goto(`${base}${ctaCase.route}`, { waitUntil: "networkidle0", timeout: 30000 });
    const before = await page.evaluate(() => (window.dataLayer || []).length);
    const actual = await page.evaluate((id) => {
      const targets = document.querySelectorAll(`[data-cta-id="${id}"]`);
      const target = targets[0];
      const href = target?.getAttribute("href") || "";
      target?.addEventListener("click", (event) => event.preventDefault(), { capture: true });
      return { count: targets.length, href, targetCount: href.startsWith("#") ? document.querySelectorAll(`[id="${href.slice(1)}"]`).length : 0,
        position: target?.getAttribute("data-cta-position"), family: target?.getAttribute("data-route-family"), asset: target?.getAttribute("data-asset-id") };
    }, ctaId);
    const errors = [];
    let emitted = null;
    if (actual.count !== 1) {
      errors.push("anchor_cta_missing");
    } else {
      await page.click(`[data-cta-id="${ctaId}"]`);
      emitted = await page.evaluate((start) => {
        const added = (window.dataLayer || []).slice(start);
        const clicks = added.filter(({ event }) => event === "cta_click");
        const piiKeys = ["email", "phone", "cnpj", "document", "nome", "empresa", "query"];
        return {
          count: clicks.length,
          event: clicks[0] || null,
          hasPiiKey: clicks.some((event) => piiKeys.some((key) => Object.prototype.hasOwnProperty.call(event, key))),
          hasPiiValue: clicks.some((event) => Object.values(event).some((value) => typeof value === "string" && (value.includes("@") || /^\d{10,15}$/.test(value.replace(/[\s()+-]/g, ""))))),
        };
      }, before);
      if (emitted.count !== 1) errors.push(`cta_click_count=${emitted.count}`);
      if (emitted.event?.cta_id !== ctaId) errors.push("cta_id_mismatch");
      if (emitted.event?.route_family !== ctaCase.route_family) errors.push("route_family_mismatch");
      if (emitted.event?.asset_id !== ctaCase.asset_id) errors.push("asset_id_mismatch");
      if (emitted.event?.page_path !== ctaCase.route) errors.push("page_path_mismatch");
      if (emitted.hasPiiKey) errors.push("pii_key");
    }
    errors.push(...proposalAnchorErrors(actual, { ...ctaCase, id: ctaId }, emitted));
    if (errors.length) failed += 1;
    findings.push({ route: ctaCase.route, check: "anchor_cta_click", cta_id: ctaId, actual, analytics: emitted, errors });
  }
}
await page.goto(`${base}/entregas/`, { waitUntil: "networkidle0", timeout: 30000 });
await page.addScriptTag({ content: axeSource });
const axe = await page.evaluate(async () => {
  const result = await window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
  });
  return result.violations.map(({ id, impact, nodes }) => ({
    id, impact, nodes: nodes.map(({ target, html, failureSummary }) => ({ target, html, failureSummary })),
  }));
});
const hardAxe = axe.filter(({ impact }) => impact === "critical" || impact === "serious");
if (hardAxe.length) failed += 1;

await browser.close();
if (server) server.close();
const report = { ok: failed === 0, generated_at: new Date().toISOString(), findings, axe, hardAxe };
if (reportPath) {
  const output = path.resolve(reportPath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
console.log("DELIVERABLES_HUB_UI", JSON.stringify(report));
// Let the structured report drain when stdout is a CI pipe before exiting.
if (failed) process.exitCode = 1;
