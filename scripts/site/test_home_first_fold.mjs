import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
// HOME_FIRST_FOLD_ROOT exists so the gate can be pointed at a throwaway copy of the
// site (adversarial run: break the fold on purpose and prove the gate reproves).
// CI and `npm run test:ui` never set it, so the default stays the repository itself.
const ROOT = resolve(process.env.HOME_FIRST_FOLD_ROOT || REPO_ROOT);
const PORT = Number(process.env.HOME_FIRST_FOLD_PORT || 8794);
const CLEARANCE_PX = 8;
const MIN_TAP_TARGET_PX = 44;
const MIN_CTA_CONTRAST = 4.5;
const PRIMARY_CTA_PATH_PREFIX = "/servicos/";
// Semantic concepts, not frozen sentences. The fold may be rewritten, but it
// must still name the corporate scope, concrete work/output and real trust.
const CONTENT_CONCEPTS = [
  {
    id: "categoria_corporativa",
    label: "categoria corporativa",
    terms: ["engenharia"],
    minMatches: 1,
  },
  {
    id: "escopo_publico_privado",
    label: "obras públicas e privadas",
    terms: ["públic", "privad"],
    minMatches: 2,
  },
  {
    id: "trabalho_executado",
    label: "trabalho de engenharia concreto",
    terms: [
      "elaboração", "revisão", "compatibilização", "quantitativos",
      "orçamentos", "perícias", "análises técnicas",
    ],
    minMatches: 3,
  },
  {
    id: "entregas_tangiveis",
    label: "entregas técnicas tangíveis",
    terms: [
      "plantas", "detalhes", "memórias de cálculo", "planilhas",
      "laudos", "pareceres", "relatórios",
    ],
    minMatches: 3,
  },
  {
    id: "utilidade_pratica",
    label: "utilidade prática",
    terms: ["obra", "decisão", "contratar", "coordenar", "orçar", "executar"],
    minMatches: 2,
  },
  {
    id: "confianca_verificavel",
    label: "fundamento verificável de confiança",
    // Regra substituida (campanha 2026-09-10): "metodo" e "limites" saem da
    // lista de candidatos. Eram o enquadramento metodo-primeiro que a campanha
    // declara defeito, e serviam como atalho: uma dobra que so dissesse
    // "metodo e limites publicados" satisfazia o conceito de confianca sem
    // trazer um unico fato conferivel. Ficam apenas credenciais e identidade
    // verificaveis, que e o que sustenta confianca de verdade.
    terms: ["eesc-usp", "cnpj", "crea", "art", "engenheiro responsável"],
    minMatches: 2,
  },
];

// Casamento por palavra inteira: "art" nao pode ser satisfeito por "partes",
// "quarta" ou "cartorio", senao o conceito de confianca vira atalho lexical.
function termPresent(text, term) {
  const escaped = String(term).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu").test(text);
}

function conceptResults(text, concepts = CONTENT_CONCEPTS) {
  const normalized = String(text || "").toLowerCase();
  return concepts.map((concept) => {
    const matched = concept.terms.filter((term) => normalized.includes(term.toLowerCase()));
    return { ...concept, matched, ok: matched.length >= concept.minMatches };
  });
}

const counterproof = {
  generic_hero_is_rejected: conceptResults(
    "Engenharia com solução personalizada. Solicite uma proposta.",
  ).some((concept) => !concept.ok),
  obsolete_fragment_is_not_a_service_destination: !"#situacoes".startsWith(
    PRIMARY_CTA_PATH_PREFIX,
  ),
};
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1366, height: 768 },
];
const MIME = {
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

const server = createServer((req, res) => {
  let pathname = decodeURIComponent((req.url || "/").split("?")[0]);
  if (pathname.endsWith("/")) pathname += "index.html";
  const file = join(ROOT, pathname);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((resolveReady) => server.listen(PORT, "127.0.0.1", resolveReady));

const browser = await puppeteer.launch({
  executablePath: resolveChromePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
const failures = [];
const reports = [];

try {
  for (const viewport of VIEWPORTS) {
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${PORT}/`, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    const report = await page.evaluate((clearance) => {
      const selectors = {
        category: ".hero-eyebrow",
        h1: "#hero-title",
        promise: ".hero-lead",
        proof: ".hero-proof",
        chooserPath: ".hero-secondary",
        primaryCta: ".hero .button-primary",
      };
      const boxes = Object.fromEntries(
        Object.entries(selectors).map(([name, selector]) => {
          const element = document.querySelector(selector);
          if (!element) return [name, null];
          const rect = element.getBoundingClientRect();
          return [name, {
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          }];
        }),
      );
      const required = Object.entries(boxes);
      const fullyVisible = required.every(([, box]) =>
        box && box.width > 0 && box.height > 0 && box.top >= 0 && box.bottom <= innerHeight - clearance
      );
      return {
        viewport: `${innerWidth}x${innerHeight}`,
        clearance,
        boxes,
        fullyVisible: Boolean(fullyVisible),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    }, CLEARANCE_PX);

    // ---- THREE_SECOND_FOLD -------------------------------------------------
    // Presence, visibility and hierarchy only. No aesthetic or persuasion score:
    // message quality stays with adversarial human/agentic review.
    const threeSecond = await page.evaluate((config) => {
      const inFold = (rect) => rect.width > 0 && rect.height > 0
        && rect.top >= 0 && rect.bottom <= innerHeight;
      const isRendered = (element) => {
        const style = getComputedStyle(element);
        return style.display !== "none"
          && style.visibility !== "hidden"
          && Number(style.opacity) !== 0;
      };
      const boxOf = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      };
      const parseColor = (value) => {
        const match = String(value || "").match(/rgba?\(([^)]+)\)/);
        if (!match) return null;
        const parts = match[1].split(/[,/\s]+/).filter(Boolean).map(Number);
        if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
      };
      const composite = (fg, bg) => ({
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1,
      });
      const relativeLuminance = ({ r, g, b }) => {
        const channel = (raw) => {
          const c = raw / 255;
          return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const contrastRatio = (a, b) => {
        const la = relativeLuminance(a);
        const lb = relativeLuminance(b);
        const light = Math.max(la, lb);
        const dark = Math.min(la, lb);
        return (light + 0.05) / (dark + 0.05);
      };
      const resolveBackground = (element) => {
        let node = element;
        while (node) {
          const parsed = parseColor(getComputedStyle(node).backgroundColor);
          if (parsed && parsed.a > 0) {
            if (parsed.a >= 1) return parsed;
            const behind = node.parentElement ? resolveBackground(node.parentElement) : { r: 255, g: 255, b: 255, a: 1 };
            return composite(parsed, behind);
          }
          node = node.parentElement;
        }
        return { r: 255, g: 255, b: 255, a: 1 };
      };

      const problems = [];

      // 1. Brand mark rendered inside the fold.
      const brandImage = document.querySelector(".site-header .brand img");
      const brand = brandImage && isRendered(brandImage)
        ? { present: true, box: boxOf(brandImage), inFold: inFold(brandImage.getBoundingClientRect()) }
        : { present: false, box: null, inFold: false };
      if (!brand.present) problems.push("brand: .site-header .brand img is missing or not rendered");
      else if (!(brand.box.width > 0 && brand.box.height > 0)) problems.push("brand: logo has a zero-sized box");
      else if (!brand.inFold) problems.push(`brand: logo is outside the fold (top=${brand.box.top} bottom=${brand.box.bottom} innerHeight=${innerHeight})`);

      // 2. Exactly one primary action visible in the fold, inside <main>.
      const candidates = Array.from(
        document.querySelectorAll("main a.button-primary, main button.button-primary"),
      );
      const visiblePrimary = candidates.filter((element) =>
        isRendered(element) && inFold(element.getBoundingClientRect()),
      );
      const primaryActions = {
        candidates_in_main: candidates.length,
        visible_in_fold: visiblePrimary.length,
        items: visiblePrimary.map((element) => ({
          tag: element.tagName.toLowerCase(),
          text: (element.innerText || "").trim().replace(/\s+/g, " "),
          href: element.getAttribute("href"),
          box: boxOf(element),
        })),
      };
      if (visiblePrimary.length !== 1) {
        problems.push(
          `primary_action: expected exactly 1 visible primary action inside <main> in the fold, found ${visiblePrimary.length}`
          + (visiblePrimary.length ? ` (${primaryActions.items.map((i) => `"${i.text}"`).join(", ")})` : ""),
        );
      }

      // 3. Primary CTA target and tap-target height.
      const cta = visiblePrimary[0] || null;
      let ctaReport = null;
      if (cta) {
        const href = cta.getAttribute("href") || "";
        const box = boxOf(cta);
        ctaReport = {
          href,
          text: (cta.innerText || "").trim().replace(/\s+/g, " "),
          box,
          href_ok: href.startsWith(config.hrefPrefix),
          height_ok: box.height >= config.minTapTarget,
        };
        if (!ctaReport.href_ok) problems.push(`primary_cta: href "${href}" does not lead to a service explanation under "${config.hrefPrefix}"`);
        if (!ctaReport.height_ok) problems.push(`primary_cta: height ${box.height}px is below the ${config.minTapTarget}px tap target`);
      } else {
        problems.push("primary_cta: no primary action visible in the fold to inspect");
      }

      // 4. Typographic hierarchy.
      const h1 = document.querySelector("#hero-title");
      const lead = document.querySelector(".hero-lead");
      const eyebrow = document.querySelector(".hero-eyebrow");
      const sizeOf = (element) => (element ? parseFloat(getComputedStyle(element).fontSize) : null);
      const hierarchy = {
        h1_px: sizeOf(h1),
        lead_px: sizeOf(lead),
        eyebrow_px: sizeOf(eyebrow),
        h1_is_largest_in_fold: null,
        larger_than_h1: [],
      };
      if (hierarchy.h1_px === null || hierarchy.lead_px === null || hierarchy.eyebrow_px === null) {
        problems.push("hierarchy: #hero-title, .hero-lead or .hero-eyebrow is missing");
      } else {
        if (!(hierarchy.h1_px > hierarchy.lead_px)) {
          problems.push(`hierarchy: #hero-title (${hierarchy.h1_px}px) must be larger than .hero-lead (${hierarchy.lead_px}px)`);
        }
        if (!(hierarchy.lead_px >= hierarchy.eyebrow_px)) {
          problems.push(`hierarchy: .hero-lead (${hierarchy.lead_px}px) must not be smaller than .hero-eyebrow (${hierarchy.eyebrow_px}px)`);
        }
      }
      if (h1) {
        const hasOwnText = (element) => Array.from(element.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0,
        );
        const offenders = [];
        for (const element of document.body.querySelectorAll("*")) {
          if (element === h1 || h1.contains(element) || element.contains(h1)) continue;
          if (!hasOwnText(element) || !isRendered(element)) continue;
          if (!inFold(element.getBoundingClientRect())) continue;
          const size = parseFloat(getComputedStyle(element).fontSize);
          if (size > hierarchy.h1_px) {
            offenders.push({
              selector: element.tagName.toLowerCase() + (element.className && typeof element.className === "string" ? `.${element.className.trim().split(/\s+/).join(".")}` : ""),
              font_size_px: size,
              text: (element.innerText || "").trim().replace(/\s+/g, " ").slice(0, 60),
            });
          }
        }
        hierarchy.larger_than_h1 = offenders;
        hierarchy.h1_is_largest_in_fold = offenders.length === 0;
        if (offenders.length) {
          problems.push(
            `hierarchy: #hero-title (${hierarchy.h1_px}px) is not the largest text in the fold; larger: `
            + offenders.map((o) => `${o.selector} @ ${o.font_size_px}px`).join(", "),
          );
        }
      }

      // 5. Content tokens present in the text actually rendered inside the fold.
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const chunks = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue;
        const parent = node.parentElement;
        if (!parent || !isRendered(parent)) continue;
        if (parent.closest("script, style, template, [hidden], [aria-hidden='true']")) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = Array.from(range.getClientRects());
        const visibleHere = rects.some((rect) => inFold(rect));
        if (visibleHere) chunks.push(node.textContent);
      }
      const foldText = chunks.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
      const concepts = config.concepts.map((concept) => {
        const matched = concept.terms.filter((term) => termPresent(foldText, term));
        return {
          id: concept.id,
          label: concept.label,
          terms: concept.terms,
          min_matches: concept.minMatches,
          matched,
          ok: matched.length >= concept.minMatches,
        };
      });
      for (const concept of concepts) {
        if (!concept.ok) {
          problems.push(
            `content_concept: ${concept.label} matched ${concept.matched.length}/${concept.min_matches}`
            + ` concepts (candidates: ${concept.terms.join(" | ")})`,
          );
        }
      }

      // 6. WCAG contrast of the primary CTA.
      let contrast = null;
      if (cta) {
        const style = getComputedStyle(cta);
        const fg = parseColor(style.color);
        const bg = resolveBackground(cta);
        if (!fg) {
          problems.push(`cta_contrast: unable to parse computed color "${style.color}"`);
        } else {
          const foreground = fg.a >= 1 ? fg : composite(fg, bg);
          const ratio = Math.round(contrastRatio(foreground, bg) * 100) / 100;
          contrast = {
            color: style.color,
            background_color: style.backgroundColor,
            resolved_background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
            ratio,
            min: config.minContrast,
            ok: ratio >= config.minContrast,
          };
          if (!contrast.ok) {
            problems.push(`cta_contrast: ratio ${ratio}:1 is below the required ${config.minContrast}:1`);
          }
        }
      }

      return {
        viewport: `${innerWidth}x${innerHeight}`,
        brand,
        primary_actions: primaryActions,
        primary_cta: ctaReport,
        hierarchy,
        fold_text_chars: foldText.length,
        content_concepts: concepts,
        cta_contrast: contrast,
        ok: problems.length === 0,
        problems,
      };
    }, {
      hrefPrefix: PRIMARY_CTA_PATH_PREFIX,
      minTapTarget: MIN_TAP_TARGET_PX,
      minContrast: MIN_CTA_CONTRAST,
      concepts: CONTENT_CONCEPTS,
    });

    report.three_second = threeSecond;
    const destinationHref = threeSecond.primary_cta?.href || "";
    let destination = {
      href: destinationHref,
      http_ok: false,
      engineering_heading: false,
      service_sections: 0,
      explained_deliveries: 0,
      contextual_contact: false,
      ok: false,
    };
    if (destinationHref.startsWith(PRIMARY_CTA_PATH_PREFIX)) {
      const response = await page.goto(`http://127.0.0.1:${PORT}${destinationHref}`, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });
      const renderedDestination = await page.evaluate(() => {
        const main = document.querySelector("main");
        const heading = (main?.querySelector("h1")?.textContent || "").toLowerCase();
        return {
          engineering_heading: heading.includes("engenharia"),
          service_sections: main?.querySelectorAll(".corporate-service-row").length || 0,
          explained_deliveries: main?.querySelectorAll(".corporate-service-row .service-output").length || 0,
          contextual_contact: Boolean(main?.querySelector(
            'a[href^="/triagem-tecnica/"], a[href^="https://wa.me/"]',
          )),
        };
      });
      destination = {
        href: destinationHref,
        http_ok: Boolean(response?.ok()),
        ...renderedDestination,
        ok: Boolean(
          response?.ok()
          && renderedDestination.engineering_heading
          && renderedDestination.service_sections >= 4
          && renderedDestination.explained_deliveries >= 4
          && renderedDestination.contextual_contact
        ),
      };
    }
    report.primary_destination = destination;
    reports.push(report);
    if (!report.fullyVisible) failures.push(`${report.viewport}: first-fold elements are not fully visible`);
    if (report.horizontalOverflow) failures.push(`${report.viewport}: horizontal overflow`);
    for (const problem of threeSecond.problems) {
      failures.push(`${report.viewport}: THREE_SECOND_FOLD ${problem}`);
    }
    if (!destination.ok) {
      failures.push(
        `${report.viewport}: PRIMARY_DESTINATION does not explain engineering services and contextual contact: `
        + JSON.stringify(destination),
      );
    }
  }
} finally {
  await browser.close();
  server.close();
}

for (const [name, bites] of Object.entries(counterproof)) {
  if (!bites) failures.push(`COUNTERPROOF ${name} did not make the gate bite`);
}

console.log(JSON.stringify({
  gate: "HOME_FIRST_FOLD",
  root: ROOT,
  clearance_px: CLEARANCE_PX,
  three_second_rules: {
    scope: "presence, visibility and hierarchy only — never message quality",
    min_tap_target_px: MIN_TAP_TARGET_PX,
    min_cta_contrast: MIN_CTA_CONTRAST,
    primary_cta_path_prefix: PRIMARY_CTA_PATH_PREFIX,
    content_concepts: CONTENT_CONCEPTS,
    destination_contract: {
      min_service_sections: 4,
      min_explained_deliveries: 4,
      contextual_contact_required: true,
    },
  },
  counterproof,
  reports,
}, null, 2));
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("HOME_FIRST_FOLD_OK");
