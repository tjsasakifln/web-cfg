#!/usr/bin/env node
/**
 * POS-INB-10 composition tests. Drive shipped files and functions, not a reimplementation.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { finish } from "../../inb_20260911/15/lib/harness.mjs";
import { HARD_AT_RELEASE, MISSING_DEPENDENCY, PASS } from "../../inb_20260911/15/lib/harness.mjs";
import { buildCanonicalDestinationMap } from "../../../../scripts/site/build_canonical_destination_map.mjs";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const readiness = require(path.join(root, "assets/js/private-project-technical-readiness.cjs"));

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

{
  const pos = JSON.parse(read("tests/campaigns/pos_inb_20260911/10/manifests/pos-nucleo.json"));
  const inb = JSON.parse(read("tests/campaigns/pos_inb_20260911/10/manifests/inb-regression.json"));
  assert.equal(pos.campaign_set, "POS-INB-20260911");
  assert.equal(inb.campaign_set, "INB-20260911");
  assert.notEqual(pos.campaign_set, inb.campaign_set);
  assert.deepEqual(pos.campaigns, ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]);
  assert.equal(inb.campaigns.includes("15"), true);
  assert.equal(inb.campaigns.includes("01-15"), false);
  const split = String("01-15").split(",").filter(Boolean);
  assert.deepEqual(split, ["01-15"]);
  assert.equal(split.length === 15, false);
}

{
  const empty = finish({ results: [] }, { strictRelease: true });
  assert.equal(empty.summary.exit_code, 1);
  assert.equal(empty.summary.empty_suite, true);
  const requiredMissing = finish(
    {
      results: [
        {
          id: "journey.orcamento-privado-sem-licitacao",
          campaign: "03",
          status: MISSING_DEPENDENCY,
          dependency_level: HARD_AT_RELEASE,
        },
      ],
    },
    { strictRelease: true },
  );
  assert.equal(requiredMissing.summary.exit_code, 1);
  assert.equal(requiredMissing.summary.publication_required_missing, 1);
  const optional = finish(
    {
      results: [
        {
          id: "expansion.optional",
          campaign: "12",
          status: MISSING_DEPENDENCY,
          dependency_level: "OPTIONAL_ENRICHMENT",
        },
      ],
    },
    { strictRelease: true },
  );
  assert.equal(optional.summary.exit_code, 0);
  const green = finish({ results: [{ id: "ok", campaign: "03", status: PASS }] }, { strictRelease: true });
  assert.equal(green.summary.exit_code, 0);
}

{
  const wrapper = path.join(root, "tests/campaigns/pos_inb_20260911/10/run_strict.mjs");
  const bogus = path.join(here, "manifests/range-token.json");
  fs.writeFileSync(
    bogus,
    `${JSON.stringify({ campaign_set: "INB-20260911", campaigns: ["01-15"] }, null, 2)}\n`,
  );
  const range = spawnSync(process.execPath, [wrapper, "--root", root, "--manifest", bogus], {
    encoding: "utf8",
  });
  assert.notEqual(range.status, 0);
  assert.match(range.stderr, /range_token_not_expanded/);
  fs.unlinkSync(bogus);

  const missing = spawnSync(process.execPath, [wrapper, "--root", root], { encoding: "utf8" });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /missing_manifest/);
}

{
  const csvs = [
    "casos/demonstrativo-projeto-privado/data/coordenacao.csv",
    "casos/demonstrativo-projeto-privado/data/orcamento.csv",
    "casos/demonstrativo-projeto-privado/data/quantitativos.csv",
    "casos/demonstrativo-projeto-privado/data/revisao.csv",
  ];
  for (const rel of csvs) {
    const buf = fs.readFileSync(path.join(root, rel));
    assert.ok(buf.length > 0, rel);
    assert.ok(buf.includes(Buffer.from(";")), rel);
    assert.equal(sha256(buf).length, 64);
  }
}

{
  const purchase = JSON.parse(read("data/bofu-dominance/core/purchase-route-map.v1.json"));
  const map = buildCanonicalDestinationMap(purchase);
  const shipped = JSON.parse(read("data/site/canonical-destination-map.v1.json"));
  assert.deepEqual(shipped.by_offer_id, map.by_offer_id);
  assert.deepEqual(shipped.shared_offer_ids, map.shared_offer_ids);
  assert.equal(
    Object.prototype.hasOwnProperty.call(shipped.by_offer_id, "complementary_engineering_project_review"),
    false,
  );
  const qty = readiness.resolveCommercialDestination("quantity_takeoff_budgeting", shipped);
  const compat = readiness.resolveCommercialDestination("bim_coordination_clash_register", shipped);
  const revisaoBare = readiness.resolveCommercialDestination(
    "complementary_engineering_project_review",
    shipped,
  );
  const revisao = readiness.resolveCommercialDestination(
    {
      offer_id: "complementary_engineering_project_review",
      purchase_id: "revisao-tecnica-projetos",
    },
    shipped,
  );
  assert.equal(qty.present, true);
  assert.equal(qty.href, "/quantitativos-orcamento-obras/");
  assert.equal(compat.present, true);
  assert.equal(compat.href, "/compatibilizacao-projetos-engenharia/");
  assert.equal(revisaoBare.present, false);
  assert.equal(revisao.present, true);
  assert.equal(revisao.href, "/revisao-tecnica-projetos-engenharia/");
  assert.equal(shipped.by_purchase_id["projetos-complementares"].path, "/projetos-complementares-engenharia/");
  const script = read("script.js");
  assert.doesNotMatch(script, /ConfengeCanonicalDestinationMap/);
  const landingMap = read("ferramentas/prontidao-tecnica-obra-privada/index.html");
  assert.match(landingMap, /id="pptr-destination-map"/);
  assert.match(landingMap, /compatibilizacao-projetos-engenharia/);
  assert.match(landingMap, /revisao-tecnica-projetos-engenharia/);
  assert.match(landingMap, /shared_offer_ids/);
  assert.doesNotMatch(
    landingMap.match(/id="pptr-destination-map">([^<]+)</)[1],
    /"by_offer_id":\{[^}]*complementary_engineering_project_review/,
  );
}

{
  const landing = read("quantitativos-orcamento-obras/index.html");
  assert.doesNotMatch(landing, /quando o demonstrativo canônico da CONFENGE estiver publicado/);
  assert.match(landing, /data-sample-trail-state="canonical"/);
  assert.match(landing, /casos\/demonstrativo-projeto-privado/);
  const excerptRel = "casos/demonstrativo-projeto-privado/excerpt-quantitativo.v1.json";
  assert.equal(fs.existsSync(path.join(root, excerptRel)), true);
  const excerpt = JSON.parse(read(excerptRel));
  assert.equal(excerpt.status, undefined);
  assert.equal(excerpt.schema, "confenge.quantity-takeoff-excerpt/1.0");
  assert.match(String(excerpt.source || ""), /demonstrativo-projeto-privado/);
}

{
  const html = read("revisao-tecnica-projetos-engenharia/index.html");
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || html;
  assert.doesNotMatch(main, /\bSELECT\b/);
  assert.doesNotMatch(main, /resolved_in_R01/);
  assert.doesNotMatch(main, /aprovado pelo fundador/i);
  assert.match(main, /demonstrativo/);
}

{
  const catalog = JSON.parse(read("data/distribution/partner-reference-kits.v1.json"));
  const html = read("parcerias-engenharia/index.html");
  for (const kit of catalog.kits) {
    assert.notEqual(kit.destination.path, "/servicos/#servico-projeto", kit.id);
  }
  assert.doesNotMatch(html, /href="\/servicos\/#servico-projeto"/);
  const dests = catalog.kits.map((k) => k.destination.path);
  assert.equal(dests.includes("/revisao-tecnica-projetos-engenharia/") || dests.includes("/compatibilizacao-projetos-engenharia/"), true);
  assert.equal(dests.includes("/projetos-complementares-engenharia/"), true);
  assert.equal(dests.includes("/quantitativos-orcamento-obras/"), true);
}

{
  const extract = read("scripts/campaigns/inb-20260911/05/project_review_extract.mjs");
  const readinessApp = read("ferramentas/prontidao-tecnica-obra-privada/app.js");
  const readinessHtml = read("ferramentas/prontidao-tecnica-obra-privada/index.html");
  const partner = read("scripts/distribution/partner_reference.mjs");
  const resources = read("scripts/pseo/public_artifact.py");
  assert.match(extract, /revisao\.csv/);
  assert.match(readinessApp, /resolveCommercialDestination/);
  assert.match(readinessHtml, /pptr-destination-map/);
  assert.match(readinessHtml, /compatibilizacao-projetos-engenharia/);
  assert.match(readinessHtml, /revisao-tecnica-projetos-engenharia/);
  assert.doesNotMatch(readinessApp, /ConfengeCanonicalDestinationMap/);
  assert.match(partner, /KIT_CATALOG_REL/);
  assert.match(resources, /is_authorized_public_nested_data_dir/);
  const complementary = read("projetos-complementares-engenharia/index.html");
  const howToHire = read("conteudos/como-contratar-projetos-complementares/index.html");
  assert.match(complementary, /href="\/servicos\/#servico-projeto"/);
  assert.match(howToHire, /href="\/servicos\/#servico-projeto"/);
  assert.doesNotMatch(complementary, /\bhubs?\b/i);
  assert.doesNotMatch(howToHire, /\bhubs?\b/i);
  const services = read("servicos/index.html");
  for (const id of ["servico-projeto", "servico-diagnostico", "servico-pericia", "servico-sst"]) {
    const start = services.indexOf(`id="${id}"`);
    assert.notEqual(start, -1, id);
    const slice = services.slice(start, start + 2500);
    assert.match(slice, /href="\/triagem-tecnica\//, id);
  }
}

console.log("OK pos-inb-20260911-10 composition");
