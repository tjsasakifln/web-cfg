import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  TRAIL_STEPS,
  injectSampleTrail,
  loadCanonicalExcerpt,
  missingRequiredInputs,
  trailStepText,
} from "../../../quantitativos-orcamento-obras/sample-trail.mjs";
import {
  CANONICAL_06_PATHS,
  assertHonestExtract,
  classifyExtract,
  injectReviewExtract,
} from "../../../scripts/campaigns/inb-20260911/05/project_review_extract.mjs";
import { composePurchaseProof } from "../../../scripts/campaigns/pos-inb-20260911/02/compose_purchase_proof.mjs";
import { publicStateLabel } from "../../../scripts/campaigns/pos-inb-20260911/02/public_state.mjs";
import {
  displayEstado,
  loadPublicRegister,
  renderFindingHtml,
} from "../../../scripts/coordination/interference_register.mjs";

const ROOT = path.resolve(".");
const QTY = path.join(ROOT, "quantitativos-orcamento-obras/index.html");
const REVIEW = path.join(ROOT, "revisao-tecnica-projetos-engenharia/index.html");
const COORD = path.join(ROOT, "compatibilizacao-projetos-engenharia/index.html");
const SOURCE = path.join(ROOT, "data/demonstrative/private-project-pilot/source.v1.json");
const CONSUMPTION = path.join(ROOT, CANONICAL_06_PATHS.consumption);

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function stripScripts(html) {
  return String(html).replace(/<script\b[\s\S]*?<\/script>/gi, " ");
}

function visible(html) {
  return stripScripts(html)
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function copyTree(relPaths, destRoot) {
  for (const rel of relPaths) {
    const from = path.join(ROOT, rel);
    const to = path.join(destRoot, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to);
  }
}

test("shipped quantitativos trail is complete, matches consumption and needs no JS", () => {
  const html = read(QTY);
  const withoutJs = stripScripts(html);
  const excerpt = loadCanonicalExcerpt(ROOT);
  const consumption = JSON.parse(read(CONSUMPTION));
  assert.equal(excerpt.schema, "confenge.quantity-takeoff-excerpt/1.0");
  assert.match(withoutJs, /id="qty-sample-trail"/);
  assert.match(withoutJs, /data-sample-trail-state="canonical"/);
  assert.equal(withoutJs.includes("awaiting-canonical-excerpt"), false);
  assert.equal(
    withoutJs.includes("Os números conferíveis desta trilha entram aqui quando o demonstrativo canônico"),
    false,
  );
  for (const step of TRAIL_STEPS) {
    assert.notEqual(trailStepText(withoutJs, step), "", `missing ${step}`);
  }
  const qtyRow = consumption.quantity_rows.find((row) => row.id === excerpt.quantity_id);
  assert.ok(qtyRow);
  assert.equal(Number(qtyRow.quantity), Number(excerpt.quantity.value));
  const formatted = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(
    excerpt.quantity.value,
  );
  assert.match(trailStepText(withoutJs, "quantity"), new RegExp(formatted.replace(".", "\\.")));
  assert.match(trailStepText(withoutJs, "spreadsheet_item"), new RegExp(excerpt.spreadsheet_item.code));
  assert.match(trailStepText(withoutJs, "element"), /W-02|Localização no desenho|PR-ARQ/);
  assert.match(trailStepText(withoutJs, "calculation"), /sum\(length\*height\)|desconto|WN-01/i);
  assert.match(trailStepText(withoutJs, "review_reference"), /RF-01/);
  assert.match(withoutJs, /href="\/casos\/demonstrativo-projeto-privado\//);
  assert.match(visible(withoutJs), /não é preço da CONFENGE|não é SINAPI real/i);
  assert.doesNotMatch(visible(withoutJs), /SELECT do demonstrativo|aprovado pelo fundador|resolved_in_R01/);
});

test("shipped revisão extract is Portuguese, without SELECT, founder or raw resolved_in_R01", () => {
  const html = read(REVIEW);
  const withoutJs = stripScripts(html);
  const text = visible(withoutJs);
  assert.match(withoutJs, /data-extract-kind="demonstrative"/);
  assert.match(withoutJs, /data-proof-id="demo-private-project-pilot-2026-09"/);
  assert.match(text, /Constatação/);
  assert.match(text, /Documento/);
  assert.match(text, /Implicação/);
  assert.match(text, /Recomendação/);
  assert.match(text, /Corrigido na revisão R01/);
  assert.match(text, /Pedido de informação|não declara vão livre/i);
  assert.doesNotMatch(text, /SELECT do demonstrativo/);
  assert.doesNotMatch(text, /aprovado pelo fundador/);
  assert.doesNotMatch(text, /resolved_in_R01/);
  assert.doesNotMatch(text, /\baprovado\b/);
  assert.match(withoutJs, /href="\/casos\/demonstrativo-projeto-privado\//);
  const consumption = JSON.parse(read(CONSUMPTION));
  const csv = read(path.join(ROOT, CANONICAL_06_PATHS.revisaoCsv));
  const classified = classifyExtract(consumption, { revisaoCsv: csv });
  assertHonestExtract(classified);
  const rf1 = classified.items.find((item) => item.id === "RF-01");
  assert.match(rf1.implication || "", /Corrigido na revisão R01/);
  assert.equal((rf1.implication || "").includes("resolved_in_R01"), false);
});

test("shipped compatibilização shows interference, forwarding, state and keeps missing info as pedido", () => {
  const html = read(COORD);
  const withoutJs = stripScripts(html);
  const geo = withoutJs.match(/data-finding-id="CF-GEO-01"[\s\S]*?<\/article>/)?.[0] || "";
  const info = withoutJs.match(/data-finding-id="CF-INFO-01"[\s\S]*?<\/article>/)?.[0] || "";
  assert.match(geo, /Interferência geométrica/);
  assert.match(visible(geo), /sobreposição|eixo Z|WN-01|B-01/);
  assert.match(visible(geo), /Encaminhar ao autor|encaminh/i);
  assert.match(visible(geo), /Corrigido na revisão R01/);
  assert.match(geo, /data-resolved="false"/);
  assert.doesNotMatch(visible(geo), /certifica[çc][aã]o de segurança|validação estrutural|obra segura|aprovado/);
  assert.match(info, /Pedido de informação|pedido de informação/);
  assert.match(visible(info), /vão livre interno|diâmetros/);
  assert.match(info, /data-estado="information_requested"/);
  assert.doesNotMatch(visible(withoutJs), /resolved_in_R01|SELECT do demonstrativo|aprovado pelo fundador/);
});

test("mutating a source dimension makes the derived trail diverge", () => {
  const original = JSON.parse(read(SOURCE));
  const mutated = structuredClone(original);
  const window = mutated.elements.find((el) => el.id === "WN-01");
  window.height_by_revision.R01 = "0.50";
  const script = `
import json, sys
from pathlib import Path
sys.path.insert(0, ${JSON.stringify(ROOT)})
from scripts.demonstrative.private_project.derive import derive, build_sample_trail
source = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
mutated = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
a = build_sample_trail(derive(source))
b = build_sample_trail(derive(mutated))
print(json.dumps({"a": a["quantity"]["value"], "b": b["quantity"]["value"], "formula_a": a["calculation"]["formula"], "memory_b": b["calculation"]["memory"]}))
`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pos-inb-02-mut-"));
  const srcA = path.join(tmp, "a.json");
  const srcB = path.join(tmp, "b.json");
  fs.writeFileSync(srcA, JSON.stringify(original));
  fs.writeFileSync(srcB, JSON.stringify(mutated));
  const py = spawnSync("python3", ["-c", script, srcA, srcB], { encoding: "utf8", cwd: ROOT });
  assert.equal(py.status, 0, py.stderr || py.stdout);
  const payload = JSON.parse(py.stdout);
  assert.notEqual(payload.a, payload.b);
  assert.match(String(payload.memory_b), /0,40|0.40|0,50|WN-01/);
});

test("removing the required source makes generate fail on a real copy", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pos-inb-02-nosrc-"));
  copyTree(
    [
      "data/demonstrative/private-project-pilot/source.v1.json",
      "data/demonstrative/private-project-pilot/consumption.v1.json",
      "scripts/demonstrative/private_project/generate.py",
      "scripts/demonstrative/private_project/derive.py",
      "scripts/demonstrative/private_project/render.py",
      "scripts/demonstrative/private_project/__init__.py",
    ],
    tmp,
  );
  fs.unlinkSync(path.join(tmp, "data/demonstrative/private-project-pilot/source.v1.json"));
  const py = spawnSync("python3", ["-m", "scripts.demonstrative.private_project.generate", "--root", tmp], {
    encoding: "utf8",
    cwd: ROOT,
  });
  assert.notEqual(py.status, 0);
  assert.match(`${py.stderr}\n${py.stdout}`, /No such file|FileNotFound|source/i);
});

test("removing a required CSV makes compose fail on a real copy", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pos-inb-02-miss-"));
  copyTree(
    [
      "data/demonstrative/private-project-pilot/source.v1.json",
      "data/demonstrative/private-project-pilot/consumption.v1.json",
      "casos/demonstrativo-projeto-privado/data/quantitativos.csv",
      "casos/demonstrativo-projeto-privado/data/orcamento.csv",
      "casos/demonstrativo-projeto-privado/data/revisao.csv",
      "casos/demonstrativo-projeto-privado/data/coordenacao.csv",
      "quantitativos-orcamento-obras/index.html",
      "revisao-tecnica-projetos-engenharia/index.html",
      "compatibilizacao-projetos-engenharia/index.html",
    ],
    tmp,
  );
  fs.unlinkSync(path.join(tmp, "casos/demonstrativo-projeto-privado/data/quantitativos.csv"));
  assert.equal(missingRequiredInputs(tmp).length > 0, true);
  assert.throws(() => composePurchaseProof(tmp), /required_demonstrative_input_missing/);
});

test("unpublished status code is not printed and is not mapped to aprovado", () => {
  assert.equal(publicStateLabel("unpublished_ok_to_build_v9"), null);
  assert.equal(publicStateLabel("resolved_in_R01"), "Corrigido na revisão R01");
  assert.doesNotMatch(publicStateLabel("resolved_in_R01"), /aprovado/i);
  const record = loadPublicRegister(ROOT);
  const finding = structuredClone(record.finding);
  finding.provider_state = "unpublished_ok_to_build_v9";
  const estado = displayEstado(finding, record.live_documents);
  assert.equal(estado.resolved, false);
  assert.doesNotMatch(estado.label || "", /unpublished_ok_to_build_v9/);
  assert.doesNotMatch(estado.label || "", /aprovado/i);
  const rendered = renderFindingHtml({ ...record, finding }, record.live_documents);
  assert.doesNotMatch(visible(rendered), /unpublished_ok_to_build_v9/);
  assert.doesNotMatch(visible(rendered), /\baprovado\b/i);
});

test("two compose runs on identical inputs produce identical purchase HTML", () => {
  const before = {
    qty: read(QTY),
    review: read(REVIEW),
    coord: read(COORD),
  };
  composePurchaseProof(ROOT);
  const mid = {
    qty: read(QTY),
    review: read(REVIEW),
    coord: read(COORD),
  };
  composePurchaseProof(ROOT);
  const after = {
    qty: read(QTY),
    review: read(REVIEW),
    coord: read(COORD),
  };
  assert.equal(mid.qty, after.qty);
  assert.equal(mid.review, after.review);
  assert.equal(mid.coord, after.coord);
  assert.match(after.qty, /data-sample-trail-state="canonical"/);
  assert.equal(before.qty.includes("awaiting-canonical-excerpt") && after.qty.includes("awaiting-canonical-excerpt"), false);
});

test("inject refuses a missing excerpt instead of publishing a placeholder", () => {
  assert.throws(() => injectSampleTrail(read(QTY), null), /canonical_excerpt_required/);
});

test("review inject round-trip keeps four honest classes", () => {
  const consumption = JSON.parse(read(CONSUMPTION));
  const csv = read(path.join(ROOT, CANONICAL_06_PATHS.revisaoCsv));
  const classified = classifyExtract(consumption, { revisaoCsv: csv });
  const injected = injectReviewExtract(read(REVIEW), classified);
  assert.match(injected, /data-extract-class="constatacao_sustentada"/);
  assert.match(injected, /data-extract-class="informacao_faltante"/);
  assert.match(injected, /data-extract-class="recomendacao"/);
  assert.match(injected, /data-extract-class="verificacao_nao_realizada"/);
  assert.doesNotMatch(visible(injected), /SELECT do demonstrativo|aprovado pelo fundador|resolved_in_R01/);
});
