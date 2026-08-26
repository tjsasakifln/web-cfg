# CONFENGE portable HTTP runtime

Status: PORTABLE_RUNTIME_READY / STORAGE_AND_EDGE_PENDING

- Decision state: EXECUTE_NOW
- Executive front: PORTABILIDADE DO RUNTIME
- Priority: P0
- Time to evidence: one independent PR, with local HTTP and process-lifecycle proof
- Leverage: automation, trust, distribution and revenue protection

This directory makes the dynamic web-cfg handlers executable as a private Node
22 HTTP process without Netlify CLI or the Netlify Functions hosting runtime.
It does not perform a cutover. Netlify remains the current public authority until
a later, explicit URL-level edge decision is approved and executed.

## Architectural outcome

    visitor
      |
      v
    confenge.com.br nginx
      |-- static route ----------> immutable _site/
      |
      |-- dynamic allowlist -----> 127.0.0.1:8787
                                     |
                                     |-- HTTP-to-handler adapter
                                     |-- existing netlify/functions/*.cjs
                                     |-- existing validation/auth/store/handoff
                                     |
                                     +-- no CRM, outbound queue, approval or dispatch

The portable process:

- discovers every top-level CommonJS handler instead of maintaining a short
  hand-written function list;
- exposes every non-scheduled handler at both the legacy Netlify URL and the
  host-neutral /api/web alias;
- calls the existing handler export, preserving business validation,
  consent, idempotency, rate limiting, auth, logging, persistence and inbound
  transport in their current owners;
- keeps the scheduled-only handler off the public HTTP router and invokes it
  through the portable scheduler command;
- serves no static files. The _site/ artifact remains independently deployable.

No SmartLic surface, public runtime, brand, CTA or URL is introduced. No CRM,
outbound queue, approval, commercial cadence, dispatch or outcome ownership is
moved from Warmbly or Governance.

## Authority and market-capture evidence

Visitor job: submit a CONFENGE request, first-party measurement event,
correction, nurture consent or allowed offer/ops request without depending on a
Netlify Functions execution environment.

Acquisition/conversion hypothesis: retaining every current URL while replacing
only the execution transport removes a hosting lock-in failure mode without
changing conversion copy, forms, attribution or terminal actions.

Data owner and contract:

- web-cfg owns public capture, minimum persistence and inbound transport;
- extra-cli remains owner of canonical facts, identity and provenance;
- Warmbly remains owner of action, cadence, pipeline and outcomes;
- Governance remains owner of internal intervention and infrastructure;
- source remains CONFENGE_WEB and this adapter adds no analytics payload.

Affected decisions: ADR-STRAT-002, RUNTIME-AUTHORITY and MARKET-CAPTURE-OS are
respected but not changed. This PR creates a reversible target capability; it
does not change the recorded public host, DNS, service manager or cutover
authority.

If repeated 100 times, new compatible handlers are discovered and routed by the
same adapter and the same gates. This improves the system instead of creating
100 per-function wrappers.

## Automatic inventory

Generate or validate the inventory from tracked consumers:

    npm run runtime:inventory
    node runtime/inventory.mjs --check

The scanner reads every file below netlify/functions, loads every top-level
handler, finds legacy/canonical route references and direct module consumers,
then classifies frontend, workflow/schedule, probe/test and ops usage.

Main baseline inventory: 34 files, comprising 14 function entrypoints, 19
support libraries and one bundled data file.

Function entrypoints:

| Function | Automatically observed use | Portable contract | Disposition |
|---|---|---|---|
| asaas-webhook | external/ops production callback documentation and tests | both HTTP aliases | operational |
| asaas-webhook-sandbox | sandbox probes/tests | both HTTP aliases | test or legacy only |
| collect | frontend analytics, ops and tests | both HTTP aliases | public runtime |
| conversion-intake | frontend pilot alias | both HTTP aliases | public runtime |
| correction | public correction form and tests | both HTTP aliases | public runtime |
| lead | frontend, scheduled probes, ops and tests | both HTTP aliases | public runtime |
| market-answer-intake | generated frontend journey and conversion tests | both HTTP aliases | public runtime |
| nurture | public page, scheduled workflow, ops and tests | both HTTP aliases | public runtime |
| offer-checkout | ops/evidence/tests; public checkout remains disabled | both HTTP aliases | operational, flag-off |
| offer-checkout-sandbox | sandbox probes/tests | both HTTP aliases | test or legacy only |
| offer-eligibility | pilot frontend | both HTTP aliases | public runtime |
| offer-terms-accept | tests/documentation, no current frontend caller | both HTTP aliases | test or legacy only |
| ops | ops page, workflows, probes and tests | both HTTP aliases | authenticated operational runtime |
| search-observation-tick | Netlify schedule in netlify.toml | scheduler command only | scheduled |

All files under netlify/functions:

    netlify/functions/asaas-webhook-sandbox.cjs
    netlify/functions/asaas-webhook.cjs
    netlify/functions/collect.cjs
    netlify/functions/conversion-intake.cjs
    netlify/functions/correction.cjs
    netlify/functions/data/gsc-insights.json
    netlify/functions/lead.cjs
    netlify/functions/lib/analytics-agg.cjs
    netlify/functions/lib/commercial-event.cjs
    netlify/functions/lib/correction-core.cjs
    netlify/functions/lib/event-contract.cjs
    netlify/functions/lib/event-registry.json
    netlify/functions/lib/gsc-history.cjs
    netlify/functions/lib/inbound-backlog-policy.cjs
    netlify/functions/lib/inbound-handoff.cjs
    netlify/functions/lib/lead-core.cjs
    netlify/functions/lib/lead-delivery.cjs
    netlify/functions/lib/lead-rate-limit.cjs
    netlify/functions/lib/lead-stages.cjs
    netlify/functions/lib/lead-store.cjs
    netlify/functions/lib/nurture-core.cjs
    netlify/functions/lib/nurture-rate-limit.cjs
    netlify/functions/lib/radar-params.cjs
    netlify/functions/lib/record-kind.cjs
    netlify/functions/lib/search-observation.cjs
    netlify/functions/lib/source-to-service.cjs
    netlify/functions/market-answer-intake.cjs
    netlify/functions/nurture.cjs
    netlify/functions/offer-checkout-sandbox.cjs
    netlify/functions/offer-checkout.cjs
    netlify/functions/offer-eligibility.cjs
    netlify/functions/offer-terms-accept.cjs
    netlify/functions/ops.cjs
    netlify/functions/search-observation-tick.cjs

## Route map and deprecation

For every non-scheduled function named NAME:

| Current route | Portable route | Status |
|---|---|---|
| /.netlify/functions/NAME | /.netlify/functions/NAME | compatibility alias, unchanged |
| /.netlify/functions/NAME | /api/web/NAME | host-neutral canonical alias |

The legacy alias is deprecated for new consumers but has no invented removal
date. It can be removed only after the automatic inventory reports zero
consumers and a separate edge/parity PR approves the URL-level decision.
No script.js or HTML route is changed in this PR.

search-observation-tick is intentionally absent from HTTP routing. Netlify
documents scheduled functions as schedule/manual-invoke only rather than a
production URL contract. Its portable entrypoint is:

    node runtime/schedule.mjs search-observation-tick

## HTTP adapter contract

The adapter maps:

- method to event.httpMethod;
- the raw UTF-8 body to event.body with isBase64Encoded=false;
- the last query value to queryStringParameters and all values to
  multiValueQueryStringParameters;
- normalized request headers to event.headers;
- pathname, raw URL and raw query to their explicit event fields;
- a trusted client address to requestContext.identity.sourceIp and headers used
  by the existing clientIp helpers.

The default proxy policy trusts forwarded client headers only from loopback.
RUNTIME_TRUST_PROXY=none strips inbound Forwarded, X-Forwarded-For, X-Real-IP,
Client-IP and the Netlify client-IP compatibility header. Container networks can
add explicit IPv4 CIDRs with RUNTIME_TRUST_PROXY_CIDRS. Invalid CIDRs refuse
startup.

The transport enforces a global byte ceiling and valid JSON framing when the
media type is application/json or +json. This is an explicit transport guard;
semantic parsing and all business validation remain in each existing handler.

Handler status, relevant end-to-end headers, multi-value headers, cookies, body
and base64 responses are propagated. Hop-by-hop headers are not forwarded.
Exceptions and timeouts become bounded JSON errors without stack, body, query,
header, path value, token or secret logging.

## Health, readiness and identity

GET /healthz proves only that the process can answer. It does not claim storage,
Warmbly, Resend, Asaas or any other dependency is healthy.

GET /ready re-evaluates local requirements. In production any failed check
prevents the process from binding at all. Non-production can bind while
readiness is false to support diagnosis.

GET /runtime-identity returns only:

- full release SHA;
- build timestamp;
- portable runtime version and Node version;
- selected storage backend name;
- environment and profile;
- runtime contract version.

It never returns environment keys, tokens, credentials, filesystem paths or PII.

Production startup requires:

- Node 22;
- a full 40- or 64-character release SHA;
- an explicit valid build timestamp;
- safe bind configuration;
- valid transport limits and JSON guard;
- exactly one storage backend, currently the file backend for portable mode;
- absolute readable/writable/executable LEAD_STORE_DIR and
  CORRECTION_STORE_DIR paths;
- the existing lead production policy to pass;
- OPS_TOKEN or REVOPS_TOKEN of at least 16 characters;
- NURTURE_TOKEN_SECRET of at least 32 characters;
- configured RESEND_API_KEY;
- all discovered handlers to load.

The existing lead production policy additionally requires origin and Turnstile
guards plus the private IP hash salt. The runtime calls that policy rather than
duplicating it.

## Environment variables

Portable process:

| Variable | Default | Meaning |
|---|---|---|
| RUNTIME_HOST | 127.0.0.1 | bind address |
| RUNTIME_PORT | 8787 | bind port |
| RUNTIME_PROFILE | local or portable-production | non-secret identity label |
| RUNTIME_RELEASE_SHA | local git SHA outside production | full release SHA; required in production |
| RUNTIME_BUILD_TIMESTAMP | process start outside production | ISO timestamp; required in production |
| RUNTIME_MAX_BODY_BYTES | 524288 | global transport ceiling |
| RUNTIME_REQUEST_TIMEOUT_MS | 30000 | request receive timeout |
| RUNTIME_HANDLER_TIMEOUT_MS | 25000 | handler response timeout |
| RUNTIME_HEADERS_TIMEOUT_MS | 10000 | header timeout |
| RUNTIME_KEEP_ALIVE_TIMEOUT_MS | 5000 | idle keep-alive timeout |
| RUNTIME_SHUTDOWN_GRACE_MS | 30000 | graceful drain ceiling |
| RUNTIME_TRUST_PROXY | loopback | loopback or none |
| RUNTIME_TRUST_PROXY_CIDRS | empty | explicit trusted IPv4 container CIDRs |
| RUNTIME_ALLOW_PUBLIC_BIND | empty | must be 1 for an intentional non-loopback production bind |
| RUNTIME_VALIDATE_JSON | 1 | must remain enabled in production |

Existing handler requirements used by portable production:

| Variable | Purpose |
|---|---|
| NODE_ENV=production | activates fail-closed profile |
| LEAD_STORE_DIR | current non-Netlify durable backend selection |
| CORRECTION_STORE_DIR | current correction persistence path |
| LEAD_REQUIRE_ORIGIN=1 | existing origin guard |
| LEAD_REQUIRE_TURNSTILE=1 | existing anti-abuse guard |
| TURNSTILE_SECRET_KEY | existing Turnstile server secret |
| IP_HASH_SALT | existing private hash salt, at least 32 characters |
| OPS_TOKEN or REVOPS_TOKEN | existing ops authorization |
| NURTURE_TOKEN_SECRET | existing sealed unsubscribe token secret |
| RESEND_API_KEY | existing lead/nurture delivery provider |

Optional business integrations keep their existing names and semantics,
including CONFENGE_INBOUND_WEBHOOK_URL, CONFENGE_INBOUND_WEBHOOK_SECRET,
CONFENGE_INBOUND_ALLOWED_HOSTS, notification settings, NURTURE_STORE_DIR,
RESEND_FROM and the currently flag-off Asaas variables. See .env.example and
docs/ops/ENV-VARS.md. No environment value is copied into runtime identity or
adapter logs.

RUNTIME_FUNCTIONS_DIR exists only for non-production adapter/lifecycle tests.
Production refuses an override.

## Scheduled execution

The only schedule declared by Netlify on main is:

| Function | Existing cron | Existing timezone | Portable equivalent |
|---|---|---|---|
| search-observation-tick | 30 11 * * * | UTC | same cron, scheduler timezone explicitly UTC, command below |

    cd /opt/confenge-web/current
    /usr/bin/env node runtime/schedule.mjs search-observation-tick

Netlify's official schedule documentation states that its cron expressions run
in UTC:
https://docs.netlify.com/build/functions/scheduled-functions/

Manual and scheduled execution use that same command and call the same shipped
handler. The command emits only status/aggregate metadata and exits nonzero when
the handler fails.

The existing GitHub Actions daily 15 11 * * * UTC, weekly 0 12 * * 1 UTC and
nurture jobs are not Netlify schedules. They call the current legacy HTTP URLs,
which remain valid through nginx, so no workflow change is required in this PR.
At cutover time, the Netlify schedule and any replacement timer must never run
concurrently; enabling/disabling timers belongs to the later edge/infra change.

## Local commands without Netlify CLI

Use Node 22. Keep storage outside the repository:

    RUNTIME_LOCAL_STORE="$(mktemp -d)"
    mkdir -p "$RUNTIME_LOCAL_STORE/leads" "$RUNTIME_LOCAL_STORE/corrections"
    export NODE_ENV=development
    export LEAD_STORE_DIR="$RUNTIME_LOCAL_STORE/leads"
    export CORRECTION_STORE_DIR="$RUNTIME_LOCAL_STORE/corrections"
    export LEAD_PROBE_SECRET="local-probe-secret-change-me"
    npm run runtime:start

In another terminal:

    curl -fsS http://127.0.0.1:8787/healthz
    curl -fsS http://127.0.0.1:8787/ready
    curl -fsS http://127.0.0.1:8787/runtime-identity
    node scripts/site/synthetic_lead_probe.mjs \
      http://127.0.0.1:8787 \
      local-probe-secret-change-me

Build and serve the static artifact separately:

    npm run build:site
    python3 -m http.server 8765 --bind 127.0.0.1 --directory _site

That Python server does not proxy dynamic URLs. For an integrated browser test,
use a local nginx with the routing contract below.

## nginx routing contract

Illustrative configuration only; this PR does not edit or deploy Governance or
host configuration:

    upstream confenge_web_runtime {
        server 127.0.0.1:8787;
        keepalive 16;
    }

    server {
        listen 127.0.0.1:8080;
        root /opt/confenge-web/current/_site;
        client_max_body_size 512k;

        location ~ ^/(healthz|ready|runtime-identity)$ {
            proxy_pass http://confenge_web_runtime;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-For $remote_addr;
            proxy_set_header X-Real-IP $remote_addr;
        }

        location ~ ^/(?:\.netlify/functions|api/web)/[a-z0-9][a-z0-9-]*$ {
            proxy_pass http://confenge_web_runtime;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-For $remote_addr;
            proxy_set_header X-Real-IP $remote_addr;
        }

        location / {
            try_files $uri $uri/ $uri.html =404;
        }
    }

X-Forwarded-For is intentionally replaced with the nginx-observed address
instead of accepting a visitor-supplied chain.

## Tests and parity evidence

    npm run test:runtime
    npm run runtime:inventory -- --check
    npm test

The Node built-in test suite proves:

- all 14 entrypoints load, with current consumers classified automatically;
- all 13 HTTP handlers execute through both aliases;
- direct handler versus portable HTTP parity for status, semantically relevant
  headers and normalized body using fixtures derived from the existing lead,
  analytics, conversion, correction and offer tests;
- scheduled handler direct versus portable scheduler parity;
- explicit method, raw body, query, headers and trusted/untrusted client-IP
  semantics;
- 404, 413 and malformed JSON behavior;
- bounded handler timeout behavior while the underlying invocation remains
  tracked for shutdown;
- production startup refusal with missing critical configuration;
- secret-free runtime identity and request logs;
- real SIGTERM drain of an in-flight request before process exit, plus nonzero
  forced exit when the configured grace period is exhausted.

The parity exception is nominal and intentional: search-observation-tick has no
HTTP path because the existing Netlify schedule has no public production URL.
It is compared through direct handler and portable schedule-command paths.

## Risks, rollback and remaining Netlify dependencies

Risks:

- the existing file persistence adapters and their concurrency/durability
  hardening belong to goal 02 and are not changed here;
- edge TLS, nginx/systemd/container ownership, headers and redirects are pending;
- activating an external timer before disabling the Netlify schedule would
  duplicate search-observation work;
- optional checkout/webhook routes retain their existing flag/auth contracts and
  must not be enabled merely because they are portable;
- handler work cannot be forcibly cancelled safely after an HTTP timeout; it is
  tracked and drained during graceful shutdown until the configured deadline.

Rollback before cutover: revert this PR or stop the unused private process.
Existing functions, URLs, static artifact and Netlify deployment are untouched.

Rollback after a future cutover: restore the prior exact nginx locations and
known-good deployment target. Never blanket-redirect dynamic or legacy URLs to
the home page.

What still depends on Netlify after this PR:

- current production hosting and DNS authority;
- current execution of Netlify Functions until a later edge cutover;
- the current search-observation Netlify schedule until a replacement timer is
  explicitly activated;
- Netlify Blobs code paths and package remain for current production
  compatibility, although portable production readiness selects file storage;
- _headers, _redirects and Netlify build/publication parity;
- any storage and edge work assigned to goals 02 and 05.

No claim that Netlify has been removed is made.

## PARALLEL_MERGE_TOUCHPOINTS

- package.json only: four runtime commands. Workflow wiring is intentionally
  left to goal 03.
- No changes to netlify/functions/lib/lead-store.cjs or any persistence adapter.
- No changes to .github/workflows, _headers, _redirects, public HTML/script.js or
  Governance files.
