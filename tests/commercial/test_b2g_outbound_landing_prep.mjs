import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Byte-identical to /problemas-que-resolvemos/ on main dbf931d7b. The route is a
// generator output owned by the #611/#632 integration stream; this pin only proves
// this branch did not touch it.
const FALLBACK_HUB_SHA256 = "cdfb0bddea7a315f3f0dab4834041fde32b97888e0ee0ab0bfc290395e6db542";
// Warmbly successor head that separates INTELIGENCIA_PNCP from EDITAL_OU_PROPOSTA.
// This branch consumes the pinned registry audit only; it emits no new URL.
const WARMbly_PR_267_HEAD = "12c6463e6c919f40a95e1057584979c5f170a41d";

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
      { code: "INTELIGENCIA_PNCP", messageMatch: "ROUTED_ELSEWHERE" },
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
    { code: "INTELIGENCIA_PNCP", messageMatch: "ROUTED_ELSEWHERE" },
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

test("bid-room keeps the outbound decision anchor and the not-hire exclusions on separate, addressable elements", () => {
  const html = readFileSync(routeFile("/bid-room-licitacoes-obras/"), "utf8");
  const openTag = (attr) => {
    const tags = html.match(new RegExp(`<[a-zA-Z][a-zA-Z0-9]*\\b[^>]*\\b${attr}[^>]*>`, "g")) || [];
    assert.equal(tags.length, 1, `${attr} must appear on exactly one element`);
    return tags[0];
  };
  // The outbound fragment must resolve to the visible decision section, not to the
  // supplier-scope grid that sits inside the collapsed offer disclosure.
  const anchorTag = openTag('id="quando-nao-contratar"');
  assert.match(anchorTag, /data-outbound-match="EDITAL_OU_PROPOSTA"/);
  assert.doesNotMatch(anchorTag, /data-when-not-hire/);
  // The not-hire exclusions must still exist and must still be addressable on their
  // own element. Without this, deleting the whole block leaves every id-OR-attribute
  // gate in the repo green.
  const notHireTag = openTag('data-when-not-hire="1"');
  assert.match(notHireTag, /id="escopo-limites"/);
  assert.notEqual(anchorTag, notHireTag);
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
    FALLBACK_HUB_SHA256,
  );
});

test("before/after evidence covers only changed routes at the required viewports", () => {
  // 2026-09-05 evidence pinned base_sha 3552cf228 (retired). MV-09 (#615)
  // changed the shared header/footer shell of every route after that, so the
  // 09-05 PNGs no longer reflect the current before-state; 09-06 re-captures
  // both sides against the current base dbf931d7b with the same writer
  // primitives (puppeteer-core + resolveChromePath + networkidle0 navigation
  // at the exact fragment). The 09-05 directory is kept as history.
  const evidenceRoot = path.join(ROOT, "docs/qa/b2g-outbound-landing-prep-2026-09-06/screenshots");
  const manifest = JSON.parse(readFileSync(path.join(evidenceRoot, "manifest.json"), "utf8"));
  assert.equal(manifest.base_sha, "dbf931d7b4a1a9fc2aecd6ef84b3a2b7b1706f55");
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
