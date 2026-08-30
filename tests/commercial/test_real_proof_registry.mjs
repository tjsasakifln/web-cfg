import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateProofGate,
  labelIntegrityProblems,
  loadAuditConfig,
  loadCanonicalRegistry,
  readPublicPages,
  unregisteredClientClaimProblems,
} from "../../scripts/commercial/real_proof_registry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const config = loadAuditConfig(root);
const registry = loadCanonicalRegistry(root);
const pages = readPublicPages(root, config);
const explicitLabelPattern = config.synthetic_surfaces.explicit_label_pattern;

const canonical = spawnSync("python3", ["scripts/site/permissioned_proof.py"], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(canonical.status, 0, `${canonical.stdout}\n${canonical.stderr}`);
assert.equal(config.canonical_proof.registry, "data/site/permissioned-proof-registry.json");
assert.equal(config.canonical_proof.records_pointer, "/records");
assert.equal(config.canonical_proof.other_editable_proof_record_registries, "FORBIDDEN");
assert.equal(Object.hasOwn(config, "entries"), false, "audit manifest must not duplicate proof records");
assert.equal(config.addressable_trust.score, 10);
assert.equal(config.addressable_trust.scale, 10);
assert.equal(
  config.addressable_trust.allowed_residual_when_empty,
  "BLOCKED_EXTERNAL:FIRST_PERMISSIONED_CUSTOMER_PROOF",
);
assert.equal(registry.records.length, 0, "zero permissioned proof is an honest valid state");
assert.equal(registry.next_test.status, "BLOCKED_EXTERNAL:FIRST_PERMISSIONED_CUSTOMER_PROOF");
assert.equal(registry.next_test.blocker, "BLOCKED_EXTERNAL:FIRST_PERMISSIONED_CUSTOMER_PROOF");
assert.ok(pages.size >= config.public_scan_scope.minimum_pages_expected, `public page floor: ${pages.size}`);

const liveProblems = evaluateProofGate({ config, registry, pages });
assert.deepEqual(liveProblems, [], liveProblems.join("\n"));

const modelPages = config.synthetic_surfaces.model_pages;
for (const rel of modelPages) {
  const html = pages.get(rel);
  assert.deepEqual(labelIntegrityProblems(html, "model", explicitLabelPattern), [], rel);
  assert.ok(
    labelIntegrityProblems(html.replace(/<title>[\s\S]*?<\/title>/i, "<title>Modelo</title>"), "model", explicitLabelPattern).includes(
      "title_label_absent",
    ),
    rel,
  );
  assert.ok(
    labelIntegrityProblems(html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, "<h1>Modelo</h1>"), "model", explicitLabelPattern).includes(
      "h1_label_absent",
    ),
    rel,
  );
  assert.ok(
    labelIntegrityProblems(
      html.replace(/\sdata-permission-class=["']demonstrativo["']/i, ""),
      "model",
      explicitLabelPattern,
    ).includes("card_label_absent"),
    rel,
  );
}

const libraryRel = config.synthetic_surfaces.library_index;
const library = pages.get(libraryRel);
assert.deepEqual(labelIntegrityProblems(library, "library", explicitLabelPattern), []);
assert.ok(
  labelIntegrityProblems(library.replace("DADOS SINTÉTICOS", "EXEMPLO"), "library", explicitLabelPattern).some((code) =>
    code.startsWith("library_card_label_absent"),
  ),
);
const unlabelledCta = library.replace(
  /<a\b[^>]*href=["'](\/casos\/modelo-[^"']+)["'][^>]*>[\s\S]*?<\/a>/i,
  '<a href="$1">Abrir entrega</a>',
);
assert.ok(
  labelIntegrityProblems(unlabelledCta, "library", explicitLabelPattern).some((code) =>
    code.startsWith("library_relevant_cta_unlabelled"),
  ),
);

const injectedClaim = new Map(pages);
injectedClaim.set(
  "index.html",
  `${pages.get("index.html")}<p>A construtora Horizonte economizou 20% após contratar a CONFENGE.</p>`,
);
const claimProblems = evaluateProofGate({ config, registry, pages: injectedClaim });
assert.ok(
  claimProblems.some((code) => code.startsWith("unregistered_client_result_claim:index.html")),
  claimProblems.join("\n"),
);
assert.ok(unregisteredClientClaimProblems("<p>A cliente recuperou R$ 50 mil.</p>", "fixture.html").length > 0);
assert.ok(unregisteredClientClaimProblems("<p>A cliente teve economia de 20%.</p>", "fixture.html").length > 0);
assert.ok(unregisteredClientClaimProblems("<p>A empresa ficou com margem 15% maior.</p>", "fixture.html").length > 0);
assert.deepEqual(unregisteredClientClaimProblems("<p>Não há resultado de cliente publicado.</p>", "fixture.html"), []);
assert.deepEqual(
  unregisteredClientClaimProblems(
    "<script>A empresa ficou com margem 15% maior.</script\t\n ignored>",
    "fixture.html",
  ),
  [],
  "script content with parser-tolerated trailing end-tag text is not visitor-visible copy",
);
assert.deepEqual(
  unregisteredClientClaimProblems(
    "<style>A empresa ficou com margem 15% maior.</style\t ignored>",
    "fixture.html",
  ),
  [],
  "style content with parser-tolerated trailing end-tag text is not visitor-visible copy",
);

const injectedDemoClaim = new Map(pages);
const demoRel = modelPages[1];
injectedDemoClaim.set(
  demoRel,
  `${pages.get(demoRel)}<p>A construtora Horizonte economizou 20% após contratar a CONFENGE.</p>`,
);
assert.ok(
  evaluateProofGate({ config, registry, pages: injectedDemoClaim }).some((code) =>
    code.startsWith(`unregistered_client_result_claim:${demoRel}`),
  ),
  "demonstrative surfaces must not bypass unregistered client-result scanning",
);

const authorizedBlock = '<body data-proof-id="proof-ok"><p data-proof-field="outcome">A cliente economizou 20%.</p></body>';
const authorization = { proofId: "proof-ok", publicFields: ["outcome"] };
assert.deepEqual(unregisteredClientClaimProblems(authorizedBlock, "casos/proof-ok/index.html", authorization), []);
assert.ok(
  unregisteredClientClaimProblems(
    `${authorizedBlock}<p>A cliente recuperou R$ 50 mil.</p>`,
    "casos/proof-ok/index.html",
    authorization,
  ).length > 0,
  "a valid proof marker must not authorize an adjacent unscoped claim",
);

const orphan = new Map(pages);
orphan.set("index.html", `${pages.get("index.html")}<div data-proof-id="inventado"></div>`);
assert.ok(
  evaluateProofGate({ config, registry, pages: orphan }).includes("orphan_real_proof_marker:index.html:inventado"),
);

const missingState = new Map(pages);
missingState.set(
  "casos/index.html",
  pages.get("casos/index.html").replace(/\sdata-proof-state="none"/, ""),
);
assert.ok(
  evaluateProofGate({ config, registry, pages: missingState }).includes(
    "proof_state_block_missing:casos/index.html",
  ),
);

const forbiddenSchema = new Map(pages);
forbiddenSchema.set(
  "index.html",
  `${pages.get("index.html")}<script type="application/ld+json">{"@context":"https://schema.org","@type":"Review"}</script>`,
);
assert.ok(
  evaluateProofGate({ config, registry, pages: forbiddenSchema }).includes(
    "forbidden_schema_type:index.html:Review",
  ),
);

for (const rel of [...modelPages, ...config.synthetic_surfaces.demonstrative_pages, libraryRel]) {
  const html = pages.get(rel);
  assert.ok(html && !/data-proof-id=/i.test(html), `synthetic surface mixed with real proof: ${rel}`);
}

const unlabelledInlineCard = new Map(pages);
unlabelledInlineCard.set("index.html", pages.get("index.html").replace("EXEMPLO SINTÉTICO · NÃO É RESULTADO DE CLIENTE", "PRIMEIRO EXEMPLO PUBLICADO"));
assert.ok(
  evaluateProofGate({ config, registry, pages: unlabelledInlineCard }).includes("inline_synthetic_card_unlabelled:index.html"),
);

const publicBlob = [...pages.values()].join("\n");
assert.equal(/itemprop=["'](?:ratingValue|aggregateRating|reviewBody)["']/i.test(publicBlob), false);
assert.equal(/(?:logo-carousel|client-logo-wall|testimonial-carousel)/i.test(publicBlob), false);
assert.ok(fs.existsSync(path.join(root, "docs/ops/proof-collection-kit/README.md")));

console.log(`real-proof-registry: canonical_records=${registry.records.length} public_pages=${pages.size} problems=0`);
