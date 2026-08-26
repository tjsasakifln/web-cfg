#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { writeRenderedContract } from "./lib/nginx.mjs";
import { createOriginClient } from "./lib/origin-client.mjs";

const ROOT = resolve(new URL("../../..", import.meta.url).pathname);
const output = resolve(ROOT, "build/netcup-host-contract");
const scratch = mkdtempSync(join(tmpdir(), "confenge-nginx-test-"));
const config = join(scratch, "nginx.conf");
const syntaxContainer = `confenge-host-contract-syntax-${process.pid}`;
const e2eContainer = `confenge-host-contract-e2e-${process.pid}`;
let container = null;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertProbe(name, condition, detail) {
  if (!condition) throw new Error(`${name}: ${detail}`);
  console.log(`PASS ${name}`);
}

try {
  const { contract } = writeRenderedContract({ root: ROOT, outputDir: output });
  const globalHeaders = Object.fromEntries(
    contract.headers
      .find((rule) => rule.match === "global")
      .headers.map((header) => [header.name.toLowerCase(), header.value]),
  );
  writeFileSync(
    config,
    `events {}
http {
  include /etc/nginx/mime.types;
  include /contract/headers.generated.conf;
  server {
    listen 8080;
    server_name confenge.com.br confenge.netlify.app;
    root /site;
    add_header X-Confenge-Host-Architecture-Version "${contract.hostArchitectureVersion}" always;
    include /contract/redirects.generated.conf;
    include /contract/locations.generated.conf;
  }
}
`,
    "utf8",
  );
  execFileSync(
    "docker",
    [
      "run",
      "--name",
      syntaxContainer,
      "--volume",
      `${config}:/etc/nginx/nginx.conf:ro`,
      "--volume",
      `${output}:/contract:ro`,
      "--volume",
      `${resolve(ROOT, "_site")}:/site:ro`,
      "nginx:1.27-alpine",
      "nginx",
      "-t",
    ],
    { stdio: "inherit", timeout: 120_000 },
  );
  console.log("NGINX_HOST_CONTRACT_SYNTAX_OK");

  container = execFileSync(
    "docker",
    [
      "run",
      "--detach",
      "--rm",
      "--name",
      e2eContainer,
      "--publish",
      "127.0.0.1::8080",
      "--volume",
      `${config}:/etc/nginx/nginx.conf:ro`,
      "--volume",
      `${output}:/contract:ro`,
      "--volume",
      `${resolve(ROOT, "_site")}:/site:ro`,
      "nginx:1.27-alpine",
    ],
    { encoding: "utf8", timeout: 120_000 },
  ).trim();
  const binding = execFileSync("docker", ["port", container, "8080/tcp"], { encoding: "utf8" }).trim();
  const port = binding.match(/:(\d+)$/)?.[1];
  if (!port) throw new Error(`cannot determine nginx test port from ${binding}`);
  const client = createOriginClient({
    label: "nginx-e2e",
    baseUrl: `http://127.0.0.1:${port}`,
    hostHeader: "confenge.com.br",
  });
  let ready = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await client.request("/");
      ready = response.status === 200;
      if (ready) break;
    } catch {
      await new Promise((done) => setTimeout(done, 50));
    }
  }
  if (!ready) throw new Error("nginx test container did not become ready");

  const obrigado = await client.request("/obrigado?host_contract=1");
  assertProbe("obrigado_200", obrigado.status === 200, `status=${obrigado.status}`);
  assertProbe(
    "obrigado_body",
    sha256(obrigado.body) === sha256(readFileSync(resolve(ROOT, "_site/obrigado.html"))),
    `candidate=${sha256(obrigado.body)}`,
  );
  assertProbe("obrigado_noindex", /noindex/i.test(obrigado.headers["x-robots-tag"] || ""), JSON.stringify(obrigado.headers));

  const intranet = await client.request("/intranet?host_contract=1");
  assertProbe("intranet_302", intranet.status === 302, `status=${intranet.status}`);
  assertProbe(
    "intranet_location_query",
    intranet.headers.location === "https://ops.confenge.com.br/?host_contract=1",
    `location=${intranet.headers.location}`,
  );

  for (const path of ["/vision", "/__host_contract_missing__"]) {
    const response = await client.request(path);
    const expectedStatus = path === "/vision" ? 410 : 404;
    assertProbe(`${path}_status`, response.status === expectedStatus, `status=${response.status}`);
    assertProbe(
      `${path}_custom_body`,
      sha256(response.body) === sha256(readFileSync(resolve(ROOT, "_site/404.html"))),
      `candidate=${sha256(response.body)}`,
    );
  }

  const missingAsset = await client.request("/assets/__host_contract_missing__.css");
  assertProbe("missing_asset_404", missingAsset.status === 404, `status=${missingAsset.status}`);
  assertProbe("missing_asset_cache", /max-age=3600/.test(missingAsset.headers["cache-control"] || ""), `cache=${missingAsset.headers["cache-control"]}`);
  assertProbe("missing_asset_not_404_path_noindex", !missingAsset.headers["x-robots-tag"], `x-robots=${missingAsset.headers["x-robots-tag"]}`);

  const fragment = await client.request("/servicos?host_contract=1");
  assertProbe("fragment_redirect_301", fragment.status === 301, `status=${fragment.status}`);
  assertProbe("fragment_query_before_hash", fragment.headers.location === "/?host_contract=1#como-atuamos", `location=${fragment.headers.location}`);

  const pretty = await client.request("/diretoria-b2g");
  assertProbe("pretty_url", pretty.status === 301 && /\/diretoria-b2g\/$/.test(pretty.headers.location || ""), `status=${pretty.status} location=${pretty.headers.location}`);
  const prettyQuery = await client.request("/diretoria-b2g?host_contract=1");
  assertProbe("pretty_url_query", prettyQuery.status === 301 && prettyQuery.headers.location === "/diretoria-b2g/?host_contract=1", `status=${prettyQuery.status} location=${prettyQuery.headers.location}`);

  const legacy = createOriginClient({
    label: "nginx-legacy-host",
    baseUrl: `http://127.0.0.1:${port}`,
    hostHeader: "confenge.netlify.app",
  });
  const legacyResponse = await legacy.request("/deep/path?host_contract=1");
  assertProbe("legacy_host_canonical", legacyResponse.status === 301 && legacyResponse.headers.location === "https://confenge.com.br/deep/path?host_contract=1", `status=${legacyResponse.status} location=${legacyResponse.headers.location}`);
  assertProbe("legacy_host_redirect_content_type", /^text\/plain/i.test(legacyResponse.headers["content-type"] || ""), `content-type=${legacyResponse.headers["content-type"]}`);
  assertProbe("legacy_host_redirect_hsts", legacyResponse.headers["strict-transport-security"] === globalHeaders["strict-transport-security"], `hsts=${legacyResponse.headers["strict-transport-security"]}`);
  assertProbe("legacy_host_redirect_cache", legacyResponse.headers["cache-control"] === globalHeaders["cache-control"], `cache=${legacyResponse.headers["cache-control"]}`);
  assertProbe("legacy_host_redirect_csp", legacyResponse.headers["content-security-policy"] === globalHeaders["content-security-policy"], `csp=${legacyResponse.headers["content-security-policy"]}`);
  execFileSync(
    process.execPath,
    [
      resolve(ROOT, "scripts/site/test_production_cutover.mjs"),
      "--phase",
      "candidate",
      "--base",
      `http://127.0.0.1:${port}`,
      "--host",
      "confenge.com.br",
      "--expected-host-architecture-version",
      contract.hostArchitectureVersion,
    ],
    { stdio: "inherit", timeout: 120_000 },
  );
  console.log("PRODUCTION_CUTOVER_HTTP_HOST_MODE_OK");
  console.log("NGINX_HOST_CONTRACT_E2E_OK");
} finally {
  if (container) {
    try {
      execFileSync("docker", ["rm", "--force", container], { stdio: "ignore", timeout: 30_000 });
    } catch {
      // The --rm container may already have exited; cleanup is best effort for this exact container id.
    }
  }
  for (const name of [syntaxContainer, e2eContainer]) {
    try {
      execFileSync("docker", ["rm", "--force", name], { stdio: "ignore", timeout: 30_000 });
    } catch {
      // Successful --rm or a container that never started leaves nothing to clean.
    }
  }
  rmSync(scratch, { recursive: true, force: true });
}
