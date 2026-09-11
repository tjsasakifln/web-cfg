import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  SENTINEL_PATHS,
  looksLikeHtmlError,
  normalizePublicUri,
  parsePublicCsv,
  run,
  sha256Bytes,
  validateArtifact,
  validateHttp,
  validateTarball,
} from "../../../scripts/site/verify_promised_public_resources.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const VERIFIER = path.join(REPO, "scripts/site/verify_promised_public_resources.mjs");

const QUANTITATIVOS = `# exemplo demonstrativo; revisao=R01
id;descricao;unidade;quantidade;elementos;prancha;formula;desconto;revisao
Q-PISO-01;Revestimento cerâmico de piso;m2;4.32;SL-01;PR-ARQ-R01;2.40*1.80;sem desconto;R01
`;
const ORCAMENTO = `# exemplo demonstrativo; revisao=R01
id;quantidade_id;servico;unidade;quantidade;preco_unitario;valor;classe_preco;elementos;revisao
ORC-PISO-01;Q-PISO-01;Revestimento cerâmico de piso;m2;4.32;85.00;367.20;hypothetical;SL-01;R01
ORC-SUBTOTAL;;Subtotal do recorte;BRL;;;367.20;hypothetical;;R01
`;
const COORDENACAO = `# exemplo demonstrativo; revisao=R01
id;tipo;estado;local;evidencia;encaminhamento;elementos;falha_comprovada;revisao
CF-GEO-01;geometric;resolved_in_R01;Parede leste;Sobreposição;Rebaixar verga;WN-01 B-01;true;R01
`;
const REVISAO = `# exemplo demonstrativo; revisao=R01
id;documento;constatacao;base;acao;tipo_conferencia;achado_relacionado;elementos;revisao
RF-01;PR-ARQ-R00;Verga invade viga;Conferência geométrica;Rebaixar verga;arithmetic_documental_coherence;CF-GEO-01;WN-01 B-01;R01
`;
const PAGE = `<html><body>
<a href="data/quantitativos.csv">Baixar quantitativos.csv</a>
<a href="data/orcamento.csv">Baixar orcamento.csv</a>
<a href="data/coordenacao.csv">Baixar coordenacao.csv</a>
<a href="data/revisao.csv">Baixar revisao.csv</a>
</body></html>`;
const DESCRIPTOR = {
  schema: "confenge.demonstrative-sample-descriptor/1.0",
  proof_id: "demo-private-project-pilot-2026-09",
  url: "/casos/demonstrativo-projeto-privado/",
  revision: "R01",
  quantity_rows: [{ id: "Q-PISO-01", unit: "m2", quantity: "4.32" }],
  budget_rows: [
    { id: "ORC-PISO-01", quantity_id: "Q-PISO-01", unit: "m2", quantity: "4.32", amount: "367.20" },
  ],
  budget_subtotal: "367.20",
  coordination_findings: [{ id: "CF-GEO-01", kind: "geometric", state: "resolved_in_R01" }],
  review_findings: [
    {
      id: "RF-01",
      document_ref: "PR-ARQ-R00",
      related_finding_id: "CF-GEO-01",
      check_kind: "arithmetic_documental_coherence",
    },
  ],
  assets: SENTINEL_PATHS.map((url) => ({
    id: path.basename(url),
    path: url.replace(/^\//, ""),
    url,
    type: "csv",
  })),
};

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function plant(root) {
  const site = path.join(root, "_site");
  write(path.join(site, "index.html"), "<html><body>home</body></html>");
  write(path.join(site, "404.html"), "<html>404</html>");
  write(path.join(site, "casos/demonstrativo-projeto-privado/index.html"), PAGE);
  write(path.join(site, "casos/demonstrativo-projeto-privado/data/quantitativos.csv"), QUANTITATIVOS);
  write(path.join(site, "casos/demonstrativo-projeto-privado/data/orcamento.csv"), ORCAMENTO);
  write(path.join(site, "casos/demonstrativo-projeto-privado/data/coordenacao.csv"), COORDENACAO);
  write(path.join(site, "casos/demonstrativo-projeto-privado/data/revisao.csv"), REVISAO);
  write(
    path.join(root, "data/demonstrative/private-project-pilot/consumption.v1.json"),
    `${JSON.stringify(DESCRIPTOR, null, 2)}\n`,
  );
  return site;
}

function packSite(site, tarball) {
  fs.mkdirSync(path.dirname(tarball), { recursive: true });
  const packed = spawnSync("tar", ["-czf", tarball, "-C", path.dirname(site), path.basename(site)], {
    encoding: "utf8",
  });
  assert.equal(packed.status, 0, packed.stderr);
}

test("normalizePublicUri refuses traversal and unsafe percent-escape", () => {
  const page = "/casos/demonstrativo-projeto-privado/";
  assert.equal(normalizePublicUri("data/quantitativos.csv", page), `${page}data/quantitativos.csv`);
  assert.equal(
    normalizePublicUri("/casos/demonstrativo-projeto-privado/data/orcamento.csv", page),
    "/casos/demonstrativo-projeto-privado/data/orcamento.csv",
  );
  assert.throws(() => normalizePublicUri("../data/quantitativos.csv", page), /traversal|unsafe/);
  assert.throws(() => normalizePublicUri("data/%2e%2e/secret.csv", page), /percent|unsafe|traversal/);
  assert.throws(() => normalizePublicUri("data/%2fetc%2fpasswd", page), /percent|unsafe/);
  assert.throws(() => normalizePublicUri("https://evil.example/x.csv", page), /external/);
});

test("CSV parser reads numbers/units and rejects HTML-as-csv", () => {
  const parsed = parsePublicCsv(Buffer.from(QUANTITATIVOS));
  assert.deepEqual(parsed.columns[0], "id");
  assert.equal(parsed.rows[0].quantidade, "4.32");
  assert.equal(parsed.rows[0].unidade, "m2");
  assert.equal(parsed.revisionFromComment, "R01");
  assert.equal(looksLikeHtmlError(Buffer.from("<!DOCTYPE html><html><title>404</title></html>")), true);
  assert.throws(
    () => parsePublicCsv(Buffer.from("<!DOCTYPE html><html>404</html>")),
    (err) => err.code === "html_error_body",
  );
  assert.throws(
    () => parsePublicCsv(Buffer.from("")),
    (err) => err.code === "empty_csv",
  );
});

test("artifact pass path unions page links, descriptor and sentinels", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pos-inb-03-pass-"));
  const site = plant(root);
  const report = validateArtifact({ artifactDir: site, sourceRoot: root });
  assert.equal(report.ok, true, JSON.stringify(report.findings, null, 2));
  const expected = new Set(report.expected.map((item) => item.path));
  for (const sentinel of SENTINEL_PATHS) {
    assert.equal(expected.has(sentinel), true, sentinel);
    const row = report.expected.find((item) => item.path === sentinel);
    assert.equal(row.origins.includes("sentinel"), true, row);
  }
});

test("sentinels still fail after links and files are deleted", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pos-inb-03-sentinel-"));
  const site = plant(root);
  write(path.join(site, "casos/demonstrativo-projeto-privado/index.html"), "<html><body>sem links</body></html>");
  for (const sentinel of SENTINEL_PATHS) {
    fs.unlinkSync(path.join(site, sentinel.slice(1)));
  }
  const report = validateArtifact({ artifactDir: site, sourceRoot: root });
  assert.equal(report.ok, false);
  assert.equal(
    report.findings.some((item) => item.code === "missing_promised_resource"),
    true,
    report.findings,
  );
});

test("private csv extension in the artifact is refused", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pos-inb-03-private-"));
  const site = plant(root);
  write(path.join(site, "casos/demonstrativo-projeto-privado/data/secret-leads.csv"), "email;phone\na@b.c;1\n");
  const report = validateArtifact({ artifactDir: site, sourceRoot: root });
  assert.equal(report.ok, false);
  assert.equal(report.findings.some((item) => item.code === "private_csv"), true, report.findings);
});

test("tarball hashes match the gated artifact and missing member is refused", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pos-inb-03-tar-"));
  const site = plant(root);
  const tarball = path.join(root, "release.tar.gz");
  packSite(site, tarball);
  const pass = validateTarball({ artifactDir: site, tarball, sourceRoot: root });
  assert.equal(pass.ok, true, JSON.stringify(pass.findings, null, 2));
  for (const resource of pass.resources) {
    const artifactBytes = fs.readFileSync(path.join(site, resource.path.slice(1)));
    assert.equal(resource.sha256, sha256Bytes(artifactBytes));
  }
  const broken = path.join(root, "broken.tar.gz");
  const extract = path.join(root, "mutate");
  fs.mkdirSync(extract);
  spawnSync("tar", ["-xzf", tarball, "-C", extract], { stdio: "ignore" });
  fs.unlinkSync(path.join(extract, "_site/casos/demonstrativo-projeto-privado/data/revisao.csv"));
  packSite(path.join(extract, "_site"), broken);
  const missing = validateTarball({ artifactDir: site, tarball: broken, sourceRoot: root });
  assert.equal(missing.ok, false);
  assert.equal(missing.findings.some((item) => item.code === "missing_promised_resource"), true);
});

test("HTTP verifier requires MIME and CSV body, not status 200 alone", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pos-inb-03-http-"));
  const site = plant(root);
  const passServer = await listen(site);
  try {
    const first = await validateHttp({
      artifactDir: site,
      sourceRoot: root,
      httpBase: passServer.base,
      allowHosts: ["127.0.0.1"],
    });
    assert.equal(first.ok, true, JSON.stringify(first.findings, null, 2));
    const second = await validateHttp({
      artifactDir: site,
      sourceRoot: root,
      httpBase: passServer.base,
      allowHosts: ["127.0.0.1"],
    });
    assert.equal(second.ok, true, JSON.stringify(second.findings, null, 2));
    assert.deepEqual(
      first.resources.map((item) => item.sha256),
      second.resources.map((item) => item.sha256),
    );
  } finally {
    await passServer.close();
  }

  const html404 = fs.readFileSync(path.join(site, "404.html"));
  const poison = await listen(site, {
    "/casos/demonstrativo-projeto-privado/data/quantitativos.csv": {
      status: 200,
      contentType: "text/csv; charset=utf-8",
      body: html404,
    },
  });
  try {
    const report = await validateHttp({
      artifactDir: site,
      sourceRoot: root,
      httpBase: poison.base,
      allowHosts: ["127.0.0.1"],
    });
    assert.equal(report.ok, false, JSON.stringify(report.findings, null, 2));
    assert.equal(report.findings.some((item) => item.code === "html_error_body"), true, report.findings);
  } finally {
    await poison.close();
  }
});

test("CLI refuses escape path and private csv name", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pos-inb-03-cli-"));
  const site = plant(root);
  write(
    path.join(site, "casos/demonstrativo-projeto-privado/index.html"),
    `${PAGE}<a href="data/%2e%2e/%2e%2e/etc/passwd">escape</a>`,
  );
  const report = await run([
    "--mode",
    "artifact",
    "--artifact",
    site,
    "--source-root",
    root,
  ]);
  assert.equal(report.ok, false);
  assert.equal(
    report.findings.some((item) => ["unsafe_page_href", "unsafe_percent_escape", "traversal"].includes(item.code)),
    true,
    report.findings,
  );
});

test("shipped CLI entry refuses a missing sentinel in a real artifact", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pos-inb-03-cli2-"));
  const site = plant(root);
  fs.unlinkSync(path.join(site, "casos/demonstrativo-projeto-privado/data/orcamento.csv"));
  const proc = spawnSync("node", [VERIFIER, "--mode", "artifact", "--artifact", site, "--source-root", root], {
    encoding: "utf8",
  });
  assert.notEqual(proc.status, 0);
  const payload = JSON.parse(proc.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.findings.some((item) => item.code === "missing_promised_resource"), true);
});

function listen(root, overrides = {}) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (overrides[urlPath]) {
        const override = overrides[urlPath];
        res.writeHead(override.status, { "Content-Type": override.contentType });
        res.end(override.body);
        return;
      }
      const full = path.join(root, urlPath.replace(/^\//, ""));
      if (!full.startsWith(root) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<html>404</html>");
        return;
      }
      const type = full.endsWith(".csv") ? "text/csv; charset=utf-8" : "text/html; charset=utf-8";
      res.writeHead(200, { "Content-Type": type });
      res.end(fs.readFileSync(full));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
