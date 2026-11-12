/**
 * Maintain demonstrative extracts and the commercial service presentation.
 * The professional presentation keeps educational extracts in /casos/.
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

export function preserveProfessionalPresentation(html, requiredHref) {
  if (!/<section\b[^>]*data-commercial-presentation="technical-scope"/.test(html)) return false;
  const links = [...html.matchAll(/<a\b(?=[^>]*data-demonstrative-resource=)[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  if (!links.some((link) => link[1] === requiredHref && /Exemplo demonstrativo/i.test(link[2]))) {
    throw new Error(`required_demonstrative_resource_missing:${requiredHref}`);
  }
  return true;
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

  const qtyCurrent = fs.readFileSync(qtyPath, "utf8");
  const rvCurrent = fs.readFileSync(rvPath, "utf8");
  const coordCurrent = fs.readFileSync(coordPath, "utf8");
  const qtyHtml = preserveProfessionalPresentation(qtyCurrent, "/casos/demonstrativo-projeto-privado/#quantitativos") ? qtyCurrent : injectSampleTrail(qtyCurrent, excerpt);
  const rvHtml = preserveProfessionalPresentation(rvCurrent, "/casos/demonstrativo-projeto-privado/#revisao") ? rvCurrent : injectReviewExtract(rvCurrent, classified);
  const coordHtml = preserveProfessionalPresentation(coordCurrent, "/casos/demonstrativo-projeto-privado/#compatibilizacao") ? coordCurrent : injectCoordinationRegister(coordCurrent, register);

  const written = [];
  for (const [file, current, rendered] of [[qtyPath, qtyCurrent, qtyHtml], [rvPath, rvCurrent, rvHtml], [coordPath, coordCurrent, coordHtml]]) {
    if (current !== rendered) {
      fs.writeFileSync(file, rendered);
      written.push(path.relative(root, file));
    }
  }

  return {
    excerpt_quantity: excerpt.quantity.value,
    excerpt_item: excerpt.spreadsheet_item.code,
    review_items: classified.items.map((item) => item.id),
    coord_finding: register.finding.id,
    coord_estado: register.finding.provider_state,
    written,
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
