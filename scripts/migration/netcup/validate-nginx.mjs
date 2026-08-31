#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
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
const wrapperConfig = join(scratch, "nginx-wrappers.conf");
const testCertificate = join(scratch, "fullchain.pem");
const testCertificateKey = join(scratch, "privkey.pem");
const syntaxContainer = `confenge-host-contract-syntax-${process.pid}`;
const wrapperSyntaxContainer = `confenge-host-wrappers-syntax-${process.pid}`;
const wrapperE2eContainer = `confenge-host-wrappers-e2e-${process.pid}`;
const e2eContainer = `confenge-host-contract-e2e-${process.pid}`;
let container = null;
let wrapperContainer = null;

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
  include /contract/runtime-upstream.generated.conf;
  server {
    listen 8080;
    server_name confenge.com.br confenge.netlify.app;
    root /site;
    add_header X-Confenge-Host-Architecture-Version "${contract.hostArchitectureVersion}" always;
    include /contract/redirects.generated.conf;
    include /contract/runtime-locations.generated.conf;
    include /contract/locations.generated.conf;
  }
  # Test-only loopback runtime stub. The generated upstream must reach this
  # exact canonical port; the public server still controls the route allowlist.
  server {
    listen 18100;
    location / { return 204; }
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

  // The generated contract alone cannot prove that the checked-in http/server
  // wrappers parse. Assemble those exact files with only absolute host paths
  // redirected to read-only test mounts and an ephemeral test certificate.
  const normalizeWrapper = (name) => readFileSync(
    resolve(ROOT, "deploy/netcup/nginx", name),
    "utf8",
  )
    .replaceAll("/opt/confenge-web/current/nginx/generated/", "/contract/")
    .replaceAll("/opt/confenge-web/current/_site", "/site")
    .replaceAll("/etc/letsencrypt/live/confenge.com.br/fullchain.pem", "/test/fullchain.pem")
    .replaceAll("/etc/letsencrypt/live/confenge.com.br/privkey.pem", "/test/privkey.pem");
  writeFileSync(
    wrapperConfig,
    `events {}
http {
  include /etc/nginx/mime.types;
${normalizeWrapper("confenge-web-http.conf")}
${normalizeWrapper("confenge-web-origin.conf")}
${normalizeWrapper("confenge-web-public.conf")}
}
`,
    "utf8",
  );
  execFileSync(
    "openssl",
    [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
      "-subj", "/CN=confenge-nginx-contract.invalid",
      "-keyout", testCertificateKey,
      "-out", testCertificate,
    ],
    { stdio: "ignore", timeout: 30_000 },
  );
  execFileSync(
    "docker",
    [
      "run",
      "--name",
      wrapperSyntaxContainer,
      "--volume",
      `${wrapperConfig}:/etc/nginx/nginx.conf:ro`,
      "--volume",
      `${output}:/contract:ro`,
      "--volume",
      `${resolve(ROOT, "_site")}:/site:ro`,
      "--volume",
      `${scratch}:/test:ro`,
      "nginx:1.27-alpine",
      "nginx",
      "-t",
    ],
    { stdio: "inherit", timeout: 120_000 },
  );
  console.log("NGINX_CHECKED_IN_WRAPPERS_SYNTAX_OK");

  wrapperContainer = execFileSync(
    "docker",
    [
      "run",
      "--detach",
      "--rm",
      "--name",
      wrapperE2eContainer,
      "--publish",
      "127.0.0.1::80",
      "--volume",
      `${wrapperConfig}:/etc/nginx/nginx.conf:ro`,
      "--volume",
      `${output}:/contract:ro`,
      "--volume",
      `${resolve(ROOT, "_site")}:/site:ro`,
      "--volume",
      `${scratch}:/test:ro`,
      "nginx:1.27-alpine",
    ],
    { encoding: "utf8", timeout: 120_000 },
  ).trim();
  const wrapperBinding = execFileSync("docker", ["port", wrapperContainer, "80/tcp"], { encoding: "utf8" }).trim();
  const wrapperPort = wrapperBinding.match(/:(\d+)$/)?.[1];
  if (!wrapperPort) throw new Error(`cannot determine nginx wrapper test port from ${wrapperBinding}`);
  const privacyClient = createOriginClient({
    label: "nginx-wrapper-public-privacy",
    baseUrl: `http://127.0.0.1:${wrapperPort}`,
    hostHeader: "confenge.com.br",
  });
  let wrapperReady = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await privacyClient.request("/");
      wrapperReady = response.status === 301;
      if (wrapperReady) break;
    } catch {
      await new Promise((done) => setTimeout(done, 50));
    }
  }
  if (!wrapperReady) throw new Error("nginx wrapper test container did not become ready");
  const piiMarkers = [
    "private.person@example.com",
    "198.51.100.49",
    "privacy-canary-user-agent/1",
    "5511988887766",
    "privacy-canary-referer-442",
    "privacy-canary-cookie-442",
  ];
  const privacyPath = `/privacy-canary/${encodeURIComponent(piiMarkers[0])}?phone=${piiMarkers[3]}`;
  const privacyHeaders = {
    "User-Agent": piiMarkers[2],
    "X-Forwarded-For": piiMarkers[1],
    "X-Request-Id": piiMarkers[0],
    Referer: `https://outside.invalid/${piiMarkers[4]}?email=${encodeURIComponent(piiMarkers[0])}`,
    Cookie: `__Host-session=${piiMarkers[5]}`,
  };
  const publicPrivacyResponse = await privacyClient.request(privacyPath, { extraHeaders: privacyHeaders });
  assertProbe("public_minimized_log_probe_status", publicPrivacyResponse.status === 301, `status=${publicPrivacyResponse.status}`);
  // The candidate origin is deliberately bound to loopback inside the host.
  // Exercise that exact boundary from inside the container rather than
  // weakening the checked-in bind address for a test-only published port.
  execFileSync(
    "docker",
    [
      "exec",
      wrapperContainer,
      "wget",
      "-q",
      "-O",
      "/dev/null",
      "--header",
      "Host: confenge.com.br",
      "--header",
      `User-Agent: ${piiMarkers[2]}`,
      "--header",
      `X-Forwarded-For: ${piiMarkers[1]}`,
      "--header",
      `X-Request-Id: ${piiMarkers[0]}`,
      "--header",
      `Referer: ${privacyHeaders.Referer}`,
      "--header",
      `Cookie: ${privacyHeaders.Cookie}`,
      `http://127.0.0.1:8088/?uri=${encodeURIComponent(piiMarkers[0])}&phone=${piiMarkers[3]}`,
    ],
    { stdio: "ignore", timeout: 30_000 },
  );
  assertProbe("origin_minimized_log_probe_status", true, "loopback request failed");
  execFileSync("docker", ["kill", "--signal", "USR1", wrapperContainer], { stdio: "ignore", timeout: 30_000 });
  await new Promise((done) => setTimeout(done, 100));
  const allowedLogKeys = [
    "bytes",
    "content_class",
    "method_class",
    "request_seconds",
    "route_class",
    "status",
    "status_class",
    "ts",
    "upstream_class",
    "upstream_seconds",
  ];
  for (const [label, logPath] of [
    ["public", "/var/log/nginx/confenge-web-access.log"],
    ["origin", "/var/log/nginx/confenge-web-origin-access.log"],
  ]) {
    const privacyLog = execFileSync(
      "docker",
      ["exec", wrapperContainer, "cat", logPath],
      { encoding: "utf8", timeout: 30_000 },
    );
    assertProbe(
      `${label}_minimized_log_no_raw_pii`,
      piiMarkers.every((marker) => !privacyLog.includes(marker)),
      `${logPath} contained a raw privacy canary`,
    );
    const privacyLogLines = privacyLog.trim().split("\n").filter(Boolean);
    assertProbe(`${label}_minimized_log_emitted`, privacyLogLines.length >= 1, `lines=${privacyLogLines.length}`);
    for (const line of privacyLogLines) {
      assertProbe(
        `${label}_minimized_log_schema`,
        JSON.stringify(Object.keys(JSON.parse(line)).sort()) === JSON.stringify(allowedLogKeys),
        line,
      );
    }
  }
  const nginxLogs = spawnSync("docker", ["logs", wrapperContainer], {
    encoding: "utf8",
    timeout: 30_000,
  });
  if (nginxLogs.error) throw nginxLogs.error;
  if (nginxLogs.status !== 0) throw new Error(`docker logs failed: ${nginxLogs.stderr || nginxLogs.stdout}`);
  const nginxProcessLog = `${nginxLogs.stdout || ""}\n${nginxLogs.stderr || ""}`;
  assertProbe(
    "nginx_error_stream_no_raw_pii",
    piiMarkers.every((marker) => !nginxProcessLog.includes(marker)),
    "nginx stdout/stderr contained a raw privacy canary",
  );

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

  const ops = await client.request("/ops/");
  const opsCacheControl = String(ops.headers["cache-control"] || "").toLowerCase();
  assertProbe("ops_200", ops.status === 200, `status=${ops.status}`);
  assertProbe(
    "ops_cache_no_store_no_transform",
    opsCacheControl.split(",").map((token) => token.trim()).includes("no-store") &&
      opsCacheControl.split(",").map((token) => token.trim()).includes("no-transform"),
    `cache-control=${opsCacheControl}`,
  );

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

  for (const path of ["/healthz", "/.well-known/runtime-info.json", "/api/web/lead", "/.netlify/functions/lead"]) {
    const response = await client.request(path);
    assertProbe(`runtime_allowlist_${path}`, response.status === 204, `status=${response.status}`);
  }
  for (const path of ["/api/web/search-observation-tick", "/.netlify/functions/search-observation-tick", "/api/web/not-a-handler"]) {
    const response = await client.request(path);
    assertProbe(`runtime_denied_${path}`, response.status === 404, `status=${response.status}`);
  }

  const fragment = await client.request("/contato?host_contract=1");
  assertProbe("fragment_redirect_301", fragment.status === 301, `status=${fragment.status}`);
  assertProbe("fragment_query_before_hash", fragment.headers.location === "/?host_contract=1#contato", `location=${fragment.headers.location}`);
  const servicos = await client.request("/servicos");
  assertProbe("servicos_hub_301", servicos.status === 301, `status=${servicos.status}`);
  assertProbe(
    "servicos_hub_target",
    /servicos-obras-publicas/.test(servicos.headers.location || ""),
    `location=${servicos.headers.location}`
  );

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
  if (wrapperContainer) {
    try {
      execFileSync("docker", ["rm", "--force", wrapperContainer], { stdio: "ignore", timeout: 30_000 });
    } catch {
      // The --rm container may already have exited; cleanup is best effort for this exact container id.
    }
  }
  if (container) {
    try {
      execFileSync("docker", ["rm", "--force", container], { stdio: "ignore", timeout: 30_000 });
    } catch {
      // The --rm container may already have exited; cleanup is best effort for this exact container id.
    }
  }
  for (const name of [syntaxContainer, wrapperSyntaxContainer, wrapperE2eContainer, e2eContainer]) {
    try {
      execFileSync("docker", ["rm", "--force", name], { stdio: "ignore", timeout: 30_000 });
    } catch {
      // Successful --rm or a container that never started leaves nothing to clean.
    }
  }
  rmSync(scratch, { recursive: true, force: true });
}
