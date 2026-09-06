import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WARMbly_PR_267_HEAD = "a4201f2ff3396f3e08030997563ec397b9627df2";

const destinations = [
  { route: "/aditivos-obras-publicas/", anchor: "metodo", state: "FROZEN_MEASUREMENT" },
  { route: "/medicoes-glosas-obras-publicas/", anchor: "metodo", state: "FROZEN_MEASUREMENT" },
  { route: "/reequilibrio-obras-publicas/", anchor: "metodo", state: "FROZEN_MEASUREMENT" },
  { route: "/auditoria-orcamento-licitacao/", anchor: "metodo", state: "FROZEN_MEASUREMENT" },
  {
    route: "/bid-room-licitacoes-obras/",
    anchor: "quando-nao-contratar",
    claim: "EDITAL_OU_PROPOSTA",
    serviceCodes: [
      { code: "APOIO_LICITACAO", messageMatch: "SUPPORTED" },
      { code: "INTELIGENCIA_PNCP", messageMatch: "UPSTREAM_BLOCKED" },
    ],
    state: "MUTABLE_NOW",
  },
  {
    route: "/atrasos-prorrogacao-obras-publicas/",
    anchor: "metodo",
    claim: "ATRASO_PRORROGACAO_OU_ENCERRAMENTO",
    state: "MUTABLE_NOW",
  },
  {
    route: "/acompanhamento-contratos-obras/",
    anchor: "metodo",
    claim: "CARTEIRA_OU_ROTINA_CONTRATUAL",
    state: "MUTABLE_NOW",
  },
  { route: "/problemas-que-resolvemos/", anchor: "", state: "NEEDS_OWNER" },
];

const roleOrder = ["situation", "consequence", "work", "artifact", "proof", "next-step", "boundary"];

function routeFile(route) {
  return path.join(ROOT, route.slice(1), "index.html");
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function anchorSection(html, anchor) {
  const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = html.match(new RegExp(`\\bid=["']${escaped}["']`, "gi")) || [];
  assert.equal(matches.length, 1, `#${anchor} must resolve exactly once`);
  const section = html.match(new RegExp(`<section\\b[^>]*\\bid=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/section>`, "i"));
  assert.ok(section, `#${anchor} must target a visible section`);
  return section[0];
}

test("Warmbly #267 audit stays finite and records all ACTIVE B2G destinations", () => {
  assert.equal(WARMbly_PR_267_HEAD.length, 40);
  assert.equal(destinations.length, 8);
  assert.equal(new Set(destinations.map(({ route, anchor }) => `${route}#${anchor}`)).size, 8);
  assert.deepEqual(
    Object.fromEntries(
      ["FROZEN_MEASUREMENT", "MUTABLE_NOW", "COVERED_GOOD", "NEEDS_OWNER"].map((state) => [
        state,
        destinations.filter((destination) => destination.state === state).length,
      ]),
    ),
    { FROZEN_MEASUREMENT: 4, MUTABLE_NOW: 3, COVERED_GOOD: 0, NEEDS_OWNER: 1 },
  );
  const tender = destinations.find(({ route }) => route === "/bid-room-licitacoes-obras/");
  assert.deepEqual(tender.serviceCodes, [
    { code: "APOIO_LICITACAO", messageMatch: "SUPPORTED" },
    { code: "INTELIGENCIA_PNCP", messageMatch: "UPSTREAM_BLOCKED" },
  ]);
});

test("mutable outbound anchors answer the email in the required decision sequence", () => {
  for (const destination of destinations.filter(({ state }) => state === "MUTABLE_NOW")) {
    const html = readFileSync(routeFile(destination.route), "utf8");
    assert.match(
      html,
      new RegExp(`<link[^>]+href=["']https://confenge\\.com\\.br${destination.route}["'][^>]+rel=["']canonical["']|<link[^>]+rel=["']canonical["'][^>]+href=["']https://confenge\\.com\\.br${destination.route}["']`, "i"),
      `${destination.route} keeps its local canonical`,
    );

    const section = anchorSection(html, destination.anchor);
    assert.match(section, new RegExp(`data-outbound-match=["']${destination.claim}["']`));
    let cursor = -1;
    for (const role of roleOrder) {
      const position = section.indexOf(`data-message-role="${role}"`);
      assert.ok(position > cursor, `${destination.route} must place ${role} after the prior role`);
      cursor = position;
    }
    assert.match(section, /data-message-role="proof"[\s\S]*?<a\b[^>]+href="\//);
    assert.match(section, /data-message-role="next-step"[\s\S]*?data-cta-id="outbound-[^"]+-next-step"[\s\S]*?data-event-name="cta_click"[\s\S]*?href="#captura-pilar"/);
    assert.match(section, /data-message-role="boundary"/);

    const visible = section.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    assert.doesNotMatch(visible, /\b(?:ICP|lead|CTA|handoff|pipeline|QCO|TOFU|MOFU|BOFU|SKU|rollback)\b/i);
  }
});

test("route-local next steps enter the existing PII-free click contract", () => {
  const nav = readFileSync(path.join(ROOT, "js/modules/nav.js"), "utf8");
  assert.match(nav, /document\.querySelectorAll\('\[data-event-name\]'\)/);
  assert.match(nav, /track\(eventName,/);
  for (const destination of destinations.filter(({ state }) => state === "MUTABLE_NOW")) {
    const section = anchorSection(readFileSync(routeFile(destination.route), "utf8"), destination.anchor);
    assert.match(section, /data-event-name="cta_click"/);
    assert.match(section, /data-cta-id="outbound-[^"]+-next-step"/);
    assert.doesNotMatch(section, /<(?:input|textarea|select)\b/i);
  }
});

test("measurement-frozen ACTIVE destinations remain byte-identical to the current freeze authority", () => {
  const freeze = JSON.parse(readFileSync(path.join(ROOT, "data/bofu-dominance/frozen-specs/hashes.json"), "utf8"));
  for (const destination of destinations.filter(({ state }) => state === "FROZEN_MEASUREMENT")) {
    const relative = `${destination.route.slice(1)}index.html`;
    assert.equal(sha256(path.join(ROOT, relative)), freeze.forbidden[relative], relative);
  }
});

test("fallback hub remains untouched pending its generator/integration owner", () => {
  assert.equal(
    sha256(routeFile("/problemas-que-resolvemos/")),
    "116af5b91d7878c9d131e079a93c6b945309cc8e9fb49e2a0f09be59094fe20d",
  );
});

test("before/after evidence covers only changed routes at the required viewports", () => {
  const evidenceRoot = path.join(ROOT, "docs/qa/b2g-outbound-landing-prep-2026-09-05/screenshots");
  const manifest = JSON.parse(readFileSync(path.join(evidenceRoot, "manifest.json"), "utf8"));
  assert.equal(manifest.base_sha, "3552cf228424ebb8f34266f671fd80df43d0615c");
  assert.equal(manifest.warmbly_pr_267_head, WARMbly_PR_267_HEAD);
  assert.deepEqual(manifest.viewports, [{ width: 390, height: 844 }, { width: 1366, height: 768 }]);
  assert.deepEqual(
    manifest.routes.map(({ route }) => route),
    destinations.filter(({ state }) => state === "MUTABLE_NOW").map(({ route, anchor }) => `${route}#${anchor}`),
  );

  for (const entry of manifest.routes) {
    const slug = entry.route.split("/")[1];
    const source = routeFile(`/${slug}/`);
    assert.equal(sha256(source), entry.source_sha256_after, `${slug} source matches after captures`);
    for (const state of ["before", "after"]) {
      for (const viewport of manifest.viewports) {
        const key = `${viewport.width}x${viewport.height}`;
        const file = path.join(evidenceRoot, state, `${slug}-${key}.png`);
        const png = readFileSync(file);
        assert.equal(createHash("sha256").update(png).digest("hex"), entry[state][key], `${state}/${slug}-${key}`);
        assert.equal(png.readUInt32BE(16), viewport.width, `${state}/${slug}-${key} width`);
        assert.equal(png.readUInt32BE(20), viewport.height, `${state}/${slug}-${key} height`);
      }
    }
  }
});
