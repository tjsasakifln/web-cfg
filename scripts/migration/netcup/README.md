# CONFENGE host-neutral HTTP/SEO contract

This directory converts the existing public-host sources into an executable,
fail-closed contract. It does not replace `_headers`, `_redirects`,
`netlify.toml`, `robots.txt`, the sitemaps, or the public release identity.

## Generated pack

Run:

```bash
npm run host-contract:render
```

The ignored build directory `build/netcup-host-contract/` contains:

| File | Nginx context / consumer |
|---|---|
| `contract.normalized.json` | Host-neutral, versioned normalized model |
| `contract.sha256` | SHA-256 binding for the normalized model |
| `headers.generated.conf` | Include once in Nginx `http {}`; defines header maps using the original request URI |
| `redirects.generated.conf` | Include in the canonical `server {}`; ordered host/path redirects, rewrites and 410 rules |
| `locations.generated.conf` | Include in the same `server {}` after `root`; Pretty URLs, custom 404, scoped content types and headers |
| `manifest.json` | Source hashes, output hashes, schema and host architecture version |

The infrastructure pack must include all three `.conf` files. It must not copy
or transcribe their rules. Dynamic `/.netlify/functions/*` routes deliberately
remain runtime-owned: the renderer never invents an upstream or `proxy_pass`.

Any unsupported selector, status, conditional redirect, placeholder, unsafe
query merge, duplicate or conflict exits with a nominal `HC_*` error. There is
no fallback output.

## Verification commands

```bash
npm run test:host-contract
npm run host-contract:nginx-test
```

The second command renders the pack, validates it with Nginx 1.27 and runs
containerized HTTP probes for Pretty URLs, `/obrigado`, 410/custom 404,
missing-asset cache, fragments/query strings, `/intranet` and legacy-host
canonization. Redirect responses retain 301/302 while their effective cache,
CSP, HSTS, X-Robots and security headers are sourced from the same normalized
`_headers` selectors as static responses. The same container then runs the full
production-cutover suite in HTTP pre-DNS Host-header mode, including release
SHA, artifact hash and host architecture identity.

### Origin parity

Set `NETCUP_ORIGIN_IP` to the candidate IP before using either pre-DNS mode.

Candidate by alternate base URL:

```bash
npm run host-contract:parity -- \
  --baseline https://confenge.com.br \
  --candidate https://candidate.example.net
```

HTTP before DNS, sending the production Host header to an origin IP:

```bash
npm run host-contract:parity -- \
  --candidate "http://$NETCUP_ORIGIN_IP" \
  --candidate-host confenge.com.br
```

HTTPS before DNS, only after a valid certificate exists:

```bash
npm run host-contract:parity -- \
  --candidate https://confenge.com.br \
  --candidate-resolve "$NETCUP_ORIGIN_IP"
```

The HTTPS mode invokes `curl --resolve`; certificate and hostname validation
remain enabled. `-k` and `--insecure` are never evidence.

Add runtime probes only when the candidate runtime exists:

```bash
npm run host-contract:parity -- \
  --candidate https://confenge.com.br \
  --candidate-resolve "$NETCUP_ORIGIN_IP" \
  --dynamic '/.netlify/functions/lead' \
  --dynamic '/.netlify/functions/ops?action=health'
```

### SEO adversarial and cutover identity

Build `_site` first, then bind candidate bodies to that artifact:

```bash
npm run build:site
npm run host-contract:seo -- \
  --candidate https://confenge.com.br \
  --candidate-resolve "$NETCUP_ORIGIN_IP" \
  --legacy https://confenge.netlify.app \
  --www https://www.confenge.com.br
```

Candidate release identity before DNS:

```bash
node scripts/site/test_production_cutover.mjs \
  --phase candidate \
  --base https://confenge.com.br \
  --resolve "$NETCUP_ORIGIN_IP" \
  --expected-sha "$EXPECTED_SHA" \
  --expected-artifact-hash "$EXPECTED_ARTIFACT_HASH" \
  --expected-host-architecture-version confenge-static-nginx/v1
```

In `candidate` and `live`, release SHA, artifact hash and host architecture are
mandatory. The architecture defaults to `confenge-static-nginx/v1`; the
artifact hash must come from the exact local `_site` build or the explicit
flag. The candidate pack must expose `host_architecture_version` in
`/.well-known/build-info.json` (the response-header fallback exists only for
staged integrations). The no-flag historical invocation is classified as
`baseline`, so it continues to validate the current live release without
claiming that the Netcup architecture has already been promoted.

If a runtime identity is applicable, add
`--expected-runtime-identity`, `--runtime-identity-path` and optionally
`--runtime-identity-field`. After DNS, rerun with `--phase live` and no
`--resolve`.
