import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

const root = resolve(".");
const port = Number(process.env.SVG_INTERNAL_GEOMETRY_PORT || 8834);
const mime = { ".svg": "image/svg+xml" };

const internalDiagramContracts = [
  {
    asset: "/assets/project-practices/coordination.svg",
    labels: [{ id: "coordination-infrastructure-label", zoneSelector: "#coordination-infrastructure-card", margin: 10 }],
    negativeZoneMutation: "#coordination-infrastructure-card",
  },
  {
    asset: "/assets/project-practices/company.svg",
    labels: [{ id: "company-infrastructure-label", zoneSelector: "#company-infrastructure-card", margin: 10 }],
    negativeZoneMutation: "#company-infrastructure-card",
  },
  {
    asset: "/assets/project-practices/hero-coordinated-engineering.svg",
    labels: [{ id: "hero-coordination-label", zoneSelector: "#hero-coordination-card", margin: 10 }],
    negativeZoneMutation: "#hero-coordination-card",
  },
  {
    asset: "/assets/project-practices/building.svg",
    labels: [{ id: "building-technical-label", zone: { x: 500, y: 70, width: 115, height: 125 }, margin: 8 }],
    avoid: [{ label: "building-technical-label", selectors: ["#building-technical-route"], clearance: 4 }],
  },
  {
    asset: "/assets/project-practices/steel.svg",
    labels: [{ id: "steel-node-label", zone: { x: 350, y: 190, width: 60, height: 42 }, margin: 8 }],
    avoid: [{ label: "steel-node-label", selectors: ["#steel-frame", "#steel-bracing"], clearance: 4 }],
  },
  {
    asset: "/assets/project-practices/installations.svg",
    labels: [
      { id: "installation-reserve-label", zone: { x: 350, y: 70, width: 170, height: 25 }, margin: 5 },
      { id: "installation-crossing-label", zone: { x: 558, y: 208, width: 100, height: 41 }, margin: 7 },
      { id: "installation-equipment-label", zone: { x: 558, y: 318, width: 100, height: 35 }, margin: 7 },
      { id: "installation-access-label", zone: { x: 558, y: 356, width: 100, height: 41 }, margin: 7 },
    ],
    avoid: [
      { label: "installation-reserve-label", selectors: ["#installation-structure", "#installation-routes"], clearance: 3 },
      { label: "installation-crossing-label", selectors: ["#installation-structure", "#installation-routes"], clearance: 3 },
      { label: "installation-equipment-label", selectors: ["#installation-structure", "#installation-routes"], clearance: 3 },
      { label: "installation-access-label", selectors: ["#installation-structure", "#installation-routes"], clearance: 3 },
    ],
  },
];

async function diagramGeometry(page, contract) {
  return page.evaluate((spec) => {
    const labelBox = (id) => {
      const element = document.getElementById(id);
      if (!element) return null;
      const box = element.getBBox();
      return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.x + box.width, bottom: box.y + box.height };
    };
    const labels = (spec.labels || []).map(({ id, zone: explicitZone, zoneSelector, margin }) => {
      const box = labelBox(id);
      if (!box) return { id, missing: true };
      const zoneMatches = zoneSelector ? [...document.querySelectorAll(zoneSelector)] : [];
      if (zoneSelector && zoneMatches.length !== 1) return { id, missingZone: zoneSelector, zoneCount: zoneMatches.length };
      const measuredZone = zoneSelector ? zoneMatches[0].getBBox() : explicitZone;
      if (!measuredZone) return { id, missingZone: zoneSelector || "inline" };
      const zone = { x: measuredZone.x, y: measuredZone.y, width: measuredZone.width, height: measuredZone.height };
      const gaps = {
        left: box.x - zone.x,
        top: box.y - zone.y,
        right: zone.x + zone.width - box.right,
        bottom: zone.y + zone.height - box.bottom,
      };
      return { id, box, gaps, contained: Math.min(...Object.values(gaps)) >= margin };
    });
    const collisions = [];
    for (const rule of spec.avoid || []) {
      const label = document.getElementById(rule.label);
      if (!label) {
        collisions.push({ label: rule.label, missing: true });
        continue;
      }
      const box = label.getBBox();
      const candidates = new Set();
      for (const selector of rule.selectors) {
        const roots = [...document.querySelectorAll(selector)];
        if (roots.length !== 1) {
          collisions.push({ label: rule.label, missingShape: selector, shapeCount: roots.length });
          continue;
        }
        const root = roots[0];
        if (typeof root.getTotalLength === "function") candidates.add(root);
        for (const child of root.querySelectorAll("path,line,polyline,polygon,rect,circle,ellipse")) candidates.add(child);
      }
      if (candidates.size === 0) collisions.push({ label: rule.label, missingGeometry: true });
      for (const shape of candidates) {
        if (typeof shape.getTotalLength !== "function") continue;
        const stroke = Number.parseFloat(getComputedStyle(shape).strokeWidth) || 0;
        const pad = Number(rule.clearance || 0) + stroke / 2;
        const length = shape.getTotalLength();
        const step = Math.max(0.35, Math.min(1, length / 1500));
        let hit = null;
        for (let distance = 0; distance <= length; distance += step) {
          const point = shape.getPointAtLength(Math.min(distance, length));
          if (point.x >= box.x - pad && point.x <= box.x + box.width + pad && point.y >= box.y - pad && point.y <= box.y + box.height + pad) {
            hit = { x: point.x, y: point.y };
            break;
          }
        }
        if (hit) collisions.push({ label: rule.label, shape: shape.id || shape.tagName, hit });
      }
    }
    return { labels, collisions };
  }, contract);
}

async function assertInternalDiagramGeometry(page) {
  let checks = 0;
  for (const contract of internalDiagramContracts) {
    await page.goto(`http://127.0.0.1:${port}${contract.asset}`, { waitUntil: "networkidle0", timeout: 30000 });
    const result = await diagramGeometry(page, contract);
    assert.ok(result.labels.every((label) => !label.missing && label.contained), `${contract.asset}: rótulo fora da zona segura ${JSON.stringify(result.labels)}`);
    assert.deepEqual(result.collisions, [], `${contract.asset}: texto colide com traço técnico ${JSON.stringify(result.collisions)}`);
    checks += result.labels.length + (contract.avoid || []).length;
    if (contract.negativeZoneMutation) {
      await page.$eval(contract.negativeZoneMutation, (zone) => zone.setAttribute("width", "24"));
      const movedZone = await diagramGeometry(page, contract);
      assert.ok(movedZone.labels.some((label) => !label.contained), `${contract.asset}: caixa reduzida deveria reprovar contenção`);
      checks += 1;
    }
    if (contract.asset.endsWith("/steel.svg") || contract.asset.endsWith("/installations.svg")) {
      const selector = contract.asset.endsWith("/steel.svg") ? "#steel-bracing" : "#installation-structure";
      await page.$eval(selector, (shape) => shape.remove());
      const missingShape = await diagramGeometry(page, contract);
      assert.ok(missingShape.collisions.some((row) => row.missingShape === selector), `${contract.asset}: traço ausente deveria reprovar`);
      checks += 1;
    }
  }

  const legacyFixtures = [
    {
      name: "coordination-card-overflow",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 520"><style>.t{font:700 15px Arial}</style><rect x="484" y="318" width="164" height="94"/><text class="t" id="legacy" x="517" y="356">INFRAESTRUTURA</text></svg>',
      contract: { labels: [{ id: "legacy", zone: { x: 484, y: 318, width: 164, height: 94 }, margin: 0 }] },
      failure: "containment",
    },
    {
      name: "company-card-overflow",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 520"><style>.t{font:700 13px Arial}</style><rect x="70" y="360" width="150" height="75"/><text class="t" id="legacy" x="103" y="393">INFRAESTRUTURA</text></svg>',
      contract: { labels: [{ id: "legacy", zone: { x: 70, y: 360, width: 150, height: 75 }, margin: 0 }] },
      failure: "containment",
    },
    {
      name: "hero-card-overflow",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 760"><rect x="465" y="218" width="300" height="366"/><text id="legacy" x="500" y="260" font-family="Arial" font-size="13" font-weight="700" letter-spacing="1.5">COORDENAÇÃO MULTIDISCIPLINAR</text></svg>',
      contract: { labels: [{ id: "legacy", zone: { x: 465, y: 218, width: 300, height: 366 }, margin: 0 }] },
      failure: "containment",
    },
    {
      name: "building-route-crossing",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 520"><path id="legacy-line" d="M170 170H570V242H315V365H575" fill="none" stroke="#2d6f2d" stroke-width="6"/><text id="legacy" x="525" y="220" font-family="Arial" font-size="13" font-weight="700">ZONA TÉCNICA</text></svg>',
      contract: { avoid: [{ label: "legacy", selectors: ["#legacy-line"], clearance: 0 }] },
      failure: "collision",
    },
    {
      name: "steel-brace-crossing",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 520"><path id="legacy-line" d="M135 100l245 150 245-150M135 420l245-170 245 170" fill="none" stroke="#2d6f2d" stroke-width="5"/><text id="legacy" x="398" y="238" font-family="Arial" font-size="13" font-weight="700">NÓ</text></svg>',
      contract: { avoid: [{ label: "legacy", selectors: ["#legacy-line"], clearance: 0 }] },
      failure: "collision",
    },
    {
      name: "installations-label-crossings",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 520"><g id="legacy-lines" fill="none" stroke="#071a31" stroke-width="3"><path d="M538 105H558V412H538zM658 105H678V412H658z"/><line x1="112" y1="126" x2="528" y2="126"/><line x1="112" y1="376" x2="528" y2="376"/></g><g font-family="Arial" font-size="11" font-weight="700"><text id="legacy-reserve" x="358" y="126">RESERVA ESTRUTURAL</text><text id="legacy-crossing" x="478" y="219">CRUZAMENTO COORDENADO</text><text id="legacy-equipment" x="503" y="378">EQUIPAMENTO</text><text id="legacy-access" x="528" y="394">ACESSO DE MANUTENÇÃO</text></g></svg>',
      contract: { avoid: [
        { label: "legacy-reserve", selectors: ["#legacy-lines"], clearance: 0 },
        { label: "legacy-crossing", selectors: ["#legacy-lines"], clearance: 0 },
        { label: "legacy-equipment", selectors: ["#legacy-lines"], clearance: 0 },
        { label: "legacy-access", selectors: ["#legacy-lines"], clearance: 0 },
      ] },
      failure: "collision",
      expectedCollisionLabels: ["legacy-reserve", "legacy-crossing", "legacy-equipment", "legacy-access"],
    },
  ];
  for (const fixture of legacyFixtures) {
    await page.goto(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(fixture.svg)}`);
    const result = await diagramGeometry(page, fixture.contract);
    if (fixture.failure === "containment") assert.ok(result.labels.some((label) => !label.contained), `${fixture.name}: versão antiga deveria falhar contenção`);
    else {
      const expected = fixture.expectedCollisionLabels || fixture.contract.avoid.map((rule) => rule.label);
      for (const label of expected) assert.ok(result.collisions.some((row) => row.label === label && !row.missingShape), `${fixture.name}: versão antiga deveria reproduzir colisão de ${label}`);
    }
    checks += 1;
  }
  return checks;
}

const server = createServer((request, response) => {
  const url = decodeURIComponent((request.url || "/").split("?")[0]);
  const file = join(root, url);
  if (!file.startsWith(`${root}${sep}`) || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404);
    response.end("not found");
    return;
  }
  response.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
  response.end(readFileSync(file));
});

await new Promise((done) => server.listen(port, "127.0.0.1", done));
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), headless: true, args: ["--no-sandbox", "--disable-gpu"] });
let checked = 0;
try {
  const page = await browser.newPage();
  checked = await assertInternalDiagramGeometry(page);
  await page.close();
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
console.log(`OK SVG internal geometry: ${checked} checks; assets ${internalDiagramContracts.length}; legacy negative controls 6`);
