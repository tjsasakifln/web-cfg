/**
 * Inject demonstrative extracts into the three priority purchase pages.
 *
 * Precondition: source.v1.json, consumption.v1.json and the four public CSVs
 * exist. Missing required input fails closed; it does not publish a
 * future-promise placeholder.
 *
 * Campaign 10 hook (do not edit package.json here):
 *   python3 -m scripts.demonstrative.private_project.generate
 *   node scripts/campaigns/pos-inb-20260911/02/compose_purchase_proof.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertRequiredInputs,
  injectSampleTrail,
  loadCanonicalExcerpt,
} from "../../../../quantitativos-orcamento-obras/sample-trail.mjs";
import {
  CANONICAL_06_PATHS,
  assertHonestExtract,
  classifyExtract,
  injectReviewExtract,
  parseRevisaoCsv,
} from "../../inb-20260911/05/project_review_extract.mjs";
import {
  injectCoordinationRegister,
  loadPublicRegister,
} from "../../../coordination/interference_register.mjs";

export const PURCHASE_RELS = Object.freeze({
  quantitativos: "quantitativos-orcamento-obras/index.html",
  revisao: "revisao-tecnica-projetos-engenharia/index.html",
  compatibilizacao: "compatibilizacao-projetos-engenharia/index.html",
});

function resolveRoot(argv = process.argv.slice(2), cwd = process.cwd()) {
  const idx = argv.indexOf("--root");
  if (idx >= 0 && argv[idx + 1]) return path.resolve(argv[idx + 1]);
  return path.resolve(cwd);
}

export function composePurchaseProof(rootDir) {
  const root = path.resolve(rootDir);
  assertRequiredInputs(root);

  const excerpt = loadCanonicalExcerpt(root);
  const consumption = JSON.parse(
    fs.readFileSync(path.join(root, CANONICAL_06_PATHS.consumption), "utf8"),
  );
  const revisaoCsv = fs.readFileSync(path.join(root, CANONICAL_06_PATHS.revisaoCsv), "utf8");
  const classified = classifyExtract(consumption, {
    revisaoCsv,
    revisaoRows: parseRevisaoCsv(revisaoCsv),
  });
  assertHonestExtract(classified);
  const register = loadPublicRegister(root);

  const qtyPath = path.join(root, PURCHASE_RELS.quantitativos);
  const rvPath = path.join(root, PURCHASE_RELS.revisao);
  const coordPath = path.join(root, PURCHASE_RELS.compatibilizacao);
  for (const filePath of [qtyPath, rvPath, coordPath]) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`required_purchase_html_missing:${path.relative(root, filePath)}`);
    }
  }

  const qtyHtml = injectSampleTrail(fs.readFileSync(qtyPath, "utf8"), excerpt);
  const rvHtml = injectReviewExtract(fs.readFileSync(rvPath, "utf8"), classified);
  const coordHtml = injectCoordinationRegister(fs.readFileSync(coordPath, "utf8"), register);

  fs.writeFileSync(qtyPath, qtyHtml);
  fs.writeFileSync(rvPath, rvHtml);
  fs.writeFileSync(coordPath, coordHtml);

  return {
    excerpt_quantity: excerpt.quantity.value,
    excerpt_item: excerpt.spreadsheet_item.code,
    review_items: classified.items.map((item) => item.id),
    coord_finding: register.finding.id,
    coord_estado: register.finding.provider_state,
    written: Object.values(PURCHASE_RELS),
  };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const result = composePurchaseProof(resolveRoot());
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message || error}\n`);
    process.exit(1);
  }
}
