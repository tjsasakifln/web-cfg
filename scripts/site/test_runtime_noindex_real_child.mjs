import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const chromePath = process.env.CHROME_PATH;
if (!chromePath) throw new Error("CHROME_PATH is required for the real-child counterproof");
const route = "/oportunidades/fixture-noindex/";
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oportunidade pública — ficha factual</title><meta name="description" content="Ficha factual de oportunidade pública para análise técnica."><meta name="robots" content="noindex,nofollow"><link rel="canonical" href="https://confenge.com.br${route}"></head><body><main><h1>Oportunidade pública</h1><p>Consulte os dados oficiais e valide escopo, prazo e habilitação antes de decidir.</p><a href="https://www.gov.br/">Fonte oficial</a></main></body></html>`;
const server = createServer((request, response) => {
  response.statusCode = request.url === route ? 200 : 404;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(request.url === route ? html : "not found");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const fixtureDir = mkdtempSync(join(tmpdir(), "confenge-real-noindex-child-"));
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const specPath = join(fixtureDir, "spec.json");
  const outcomePath = join(fixtureDir, "outcome.json");
  const lhrPath = join(fixtureDir, "lhr.json");
  writeFileSync(specPath, JSON.stringify({
    url: `${origin}${route}`, path: route, slug: "fixture-noindex", run: 1, attempt: 1,
    out_json: lhrPath, base: origin, form_factor: "mobile",
    viewport: { width: 390, height: 844, device_scale_factor: 1 },
    runtime_mode: true, seo_exempt: true, chrome_path: chromePath,
  }));
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(ROOT, "scripts/site/lighthouse_measure_child.mjs"), specPath, outcomePath], {
      cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  assert.equal(result.code, 0, result.stderr);
  const outcome = JSON.parse(readFileSync(outcomePath, "utf8"));
  assert.equal(outcome.outcome, "MEASURED", JSON.stringify(outcome));
  assert.ok(outcome.row.seo < 100, `raw SEO unexpectedly did not reflect noindex: ${outcome.row.seo}`);
  assert.equal(outcome.row.seo_without_crawlability, 100);
  assert.ok(outcome.row.accessibility >= 95);
  assert.ok(outcome.row.best_practices >= 95);
  const evidencePath = process.argv[2];
  if (evidencePath) writeFileSync(evidencePath, JSON.stringify({
    schema: "confenge.runtime-noindex-real-child/v1",
    generated_at: new Date().toISOString(),
    chrome_path: chromePath,
    route,
    raw_seo: outcome.row.seo,
    seo_without_crawlability: outcome.row.seo_without_crawlability,
    accessibility: outcome.row.accessibility,
    best_practices: outcome.row.best_practices,
    outcome: outcome.outcome,
  }, null, 2));
  console.log(`RUNTIME_NOINDEX_REAL_CHILD_OK raw=${outcome.row.seo} adjusted=${outcome.row.seo_without_crawlability}`);
} finally {
  await new Promise((resolve) => server.close(resolve));
  rmSync(fixtureDir, { recursive: true, force: true });
}
