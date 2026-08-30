# Netcup atomic release (public production)

Status: `PRODUCTION_PUBLIC_RUNTIME / NETCUP_NGINX_NODE_V2`

This directory is the production release path for `confenge.com.br`. Public
traffic enters through the Cloudflare proxy (`Server: cloudflare`) and reaches
this VPS as the origin
(`X-Confenge-Host-Architecture-Version: confenge-nginx-node/v2`). The
authoritative record is `docs/architecture/RUNTIME-AUTHORITY.md`.

The apex A and `www` CNAME must remain **Proxied** in Cloudflare. DNS-only
delivery exposes the remote origin to every visitor and was proven to add
multi-second connection/TTFB variance from Brazil even while loopback nginx
answered in under 1 ms. The active `Public HTML edge cache` Cache Rule caches
only GET/HEAD directory-style public pages for 5 minutes. It excludes `/ops/`,
`/intranet/`, `/.netlify/` and `/api/`; health/runtime JSON also stays dynamic
because those paths do not end in `/`. Browser caching still follows the origin
headers, so an edge purge is not required to clear a visitor's browser. A
release can remain visible at an edge for at most the five-minute TTL.

Every successful push to `main` now runs the full release chain automatically:
site gates, immutable package, stage verification and atomic promotion. Manual
`package_only`, `stage_verify` and `promote` dispatches remain available for
diagnosis and recovery, and require the exact observed `main` SHA to prevent a
moving-branch race.

Stage (`stage_verify`) still does not swap `current`. Promotion remains behind
the GitHub environment `netcup-production` and
`NETCUP_CUTOVER_AUTHORIZED=CONFENGE_NETCUP_CUTOVER_APPROVED`. This README does
not create that variable, does not change DNS, and does not dispatch a release.

## Decision and operating evidence

- Decision: `EXECUTE_NOW` (P0).
- Executive front: INBOUND ENGINE / SCALE-SUNSET.
- Leverage: automation and trust.
- Time to evidence: a matching fixture of the runtime-authority gate plus
  read-only live identity (`build-info` SHA versus `origin/main`).
- Visitor job: receive the approved CONFENGE public artifact from the host that
  already serves production.
- Acquisition/conversion hypothesis: release integrity removes deployment
  drift and makes conversion availability recoverable without a second public
  host.
- Data owner/contract: unchanged. `extra-cli` remains the SELECT-only fact and
  provenance owner; Warmbly remains the commercial-action owner.
- Analytics: none added; evidence contains SHA, artifact hash, CI URL and
  operation status, never lead PII.
- After 100 repetitions: packaging, verification, evidence and rollback stay
  constant-time; the system gains a release history instead of 100 manual
  deployment procedures.
- ADR affected: ADR-STRAT-002 remains the canonical-surface decision;
  RUNTIME-AUTHORITY records Cloudflare as the public edge and nginx/Netcup as
  the production origin.
- Rollback: atomic `current` symlink restoration via
  `/opt/confenge-web/bin/rollback <FULL_SHA>`. See `docs/ops/ROLLBACK.md`.

## Chain and invariants

```text
push to main (or exact-SHA manual dispatch)
  -> reusable site-ci gates and its single build
  -> _site + portable runtime + generated nginx contract named by FULL_SHA
  -> deterministic deploy tar + detached SHA-256 manifest
  -> GitHub build-provenance attestation
  -> SSH upload to /opt/confenge-web/incoming/.upload-FULL_SHA-RUN_ID-ATTEMPT
  -> checksum validation + atomic adoption as incoming/FULL_SHA
  -> stage-release + verify-release (no current change)
  -> explicit promote gate
  -> promote-release (atomic current swap)
  -> /opt/confenge-web/evidence/deploy.ndjson
  -> rollback FULL_SHA
```

`/.well-known/build-info.json` remains the static build identity.
`/.well-known/runtime-info.json` is the runtime identity and binds the same full
git SHA, public artifact SHA-256 and detached release-bundle SHA-256 plus the
runtime, storage and host-architecture contract versions. The deploy tarball's
SHA-256 is detached because a file cannot contain its own digest without a
circular hash.

The VPS never runs `npm`, builds the site, edits a release, changes DNS, or
touches any other vhost. Every release is a real directory at
`/opt/confenge-web/releases/<FULL_SHA>` containing `_site/`, runtime and handler
closure, release/file manifests, generated nginx snippets, contract versions
and stage/verify/promote/rollback scripts. Persistent records live in the
mode-0700 `/var/lib/confenge-web`; controls and evidence live outside releases.

## One-time host provisioning (do not run from a docs PR)

Review paths on the target first. The dedicated account owns release data, not
the root-owned control scripts:

```sh
sudo groupadd --system confenge-web
sudo useradd --system --gid confenge-web --home-dir /opt/confenge-web \
  --create-home --shell /bin/bash confenge-deploy
sudo install -d -o confenge-deploy -g confenge-web -m 0750 \
  /opt/confenge-web /opt/confenge-web/incoming /opt/confenge-web/releases \
  /opt/confenge-web/locks /opt/confenge-web/evidence \
  /opt/confenge-web/state /opt/confenge-web/shared
sudo install -d -o root -g root -m 0755 /opt/confenge-web/bin /opt/confenge-web/lib
sudo install -d -o confenge-deploy -g confenge-web -m 0700 /var/lib/confenge-web
sudo install -d -o root -g confenge-web -m 0750 /etc/confenge-web
sudo install -d -o confenge-deploy -g confenge-web -m 0700 /opt/confenge-web/.ssh
sudo install -o confenge-deploy -g confenge-web -m 0600 \
  /secure/confenge/netcup-deploy-key.pub /opt/confenge-web/.ssh/authorized_keys
sudo install -o root -g root -m 0755 deploy/netcup/bin/stage-release /opt/confenge-web/bin/stage-release
sudo install -o root -g root -m 0755 deploy/netcup/bin/verify-release /opt/confenge-web/bin/verify-release
sudo install -o root -g root -m 0755 deploy/netcup/bin/promote-release /opt/confenge-web/bin/promote-release
sudo install -o root -g root -m 0755 deploy/netcup/bin/rollback /opt/confenge-web/bin/rollback
sudo install -o root -g root -m 0755 deploy/netcup/bin/prune-releases /opt/confenge-web/bin/prune-releases
sudo install -o root -g root -m 0755 deploy/netcup/bin/run-runtime /opt/confenge-web/bin/run-runtime
sudo install -o root -g root -m 0755 deploy/netcup/bin/run-schedule /opt/confenge-web/bin/run-schedule
sudo install -o root -g root -m 0644 deploy/netcup/lib/release_control.py /opt/confenge-web/lib/release_control.py
sudo install -o root -g root -m 0644 deploy/netcup/lib/runtime_launcher.py /opt/confenge-web/lib/runtime_launcher.py
sudo install -o root -g root -m 0644 deploy/netcup/lib/schedule_gate.py /opt/confenge-web/lib/schedule_gate.py
sudo install -o root -g root -m 0644 deploy/netcup/runtime/confenge-web-runtime.service /etc/systemd/system/confenge-web-runtime.service
sudo install -o root -g confenge-web -m 0640 /secure/confenge/netcup-runtime.env /etc/confenge-web/runtime.env
sudo systemctl daemon-reload
sudo systemctl enable confenge-web-runtime.service
```

Before loading GitHub secrets, verify that sshd is listening on the configured
port, the dedicated key logs in as `confenge-deploy`, and that account can write
`/opt/confenge-web/incoming`. Do not put a root SSH key in GitHub Actions.

The control uses only nginx validation and a controlled reload. Reload is
mandatory after every promote, rollback and automatic restoration because
nginx parses the generated header/redirect/location includes at configuration
load time; swapping `current` alone changes the static root but not those parsed
policies:

```text
# /etc/sudoers.d/confenge-web-release (validate with visudo -cf)
confenge-deploy ALL=(root) NOPASSWD: /usr/sbin/nginx -t
confenge-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl reload nginx
confenge-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart confenge-web-runtime.service
```

The packaged `nginx/confenge-web-http.conf` and
`nginx/confenge-web-origin.conf` are loopback-only wrappers around five
immutable generated snippets. The public vhost
`nginx/confenge-web-public.conf` listens on 80/443 for
`confenge.com.br` and `www.confenge.com.br` and follows
`/opt/confenge-web/current`. Release commands never copy a hand-transcribed
`_headers`/`_redirects` contract into `/etc/nginx` and never edit or reload
unrelated vhosts.

### Minimized nginx request telemetry

The CONFENGE vhosts use `confenge_minimized`. It records finite route, method,
status, content and upstream classes plus byte/latency aggregates. It never
records a client/forwarded address, user agent, referer, cookie, query string,
free-form URI or request identifier. nginx request error logs cannot be
custom-redacted, so the CONFENGE server blocks send them to `/dev/null`; failed
config tests, reloads and service health remain visible through systemd and the
release evidence. This scope does not alter unrelated nginx vhosts.

The operational owner is `runtime Netcup/nginx`. Logs are root-owned, group
readable only by `adm` (`0640`), rotated daily, compressed and deleted after at
most 14 days. This is an operational minimization ceiling, not an assertion of
legal basis. Install or update the reviewed files only during the #442 cutover:

```sh
sudo touch /var/log/nginx/confenge-web-access.log /var/log/nginx/confenge-web-origin-access.log
sudo chown root:adm /var/log/nginx/confenge-web-access.log /var/log/nginx/confenge-web-origin-access.log
sudo chmod 0640 /var/log/nginx/confenge-web-access.log /var/log/nginx/confenge-web-origin-access.log
sudo install -o root -g root -m 0644 /opt/confenge-web/current/nginx/confenge-web-http.conf /etc/nginx/conf.d/confenge-web-http.conf
sudo install -o root -g root -m 0644 /opt/confenge-web/current/nginx/confenge-web-origin.conf /etc/nginx/sites-available/confenge-web-origin.conf
sudo install -o root -g root -m 0644 /opt/confenge-web/current/nginx/confenge-web-public.conf /etc/nginx/sites-available/confenge.com.br
sudo install -o root -g root -m 0644 /opt/confenge-web/current/nginx/confenge-web-logrotate /etc/logrotate.d/confenge-web
sudo nginx -t
sudo systemctl reload nginx
sudo logrotate --debug /etc/logrotate.d/confenge-web
```

Do not attach log samples to a GitHub issue or PR. Post-cutover proof is
aggregate-only: confirm file owner/mode, inspect the active nginx configuration
for `confenge_minimized`, and use field names/counts rather than request rows.
The rollback is the previous validated vhost plus `nginx -t` and reload; if
availability forces that rollback, #442 remains an open privacy incident. Use
the same four `install` commands against the exact previous release directory,
then run `nginx -t` before reload; never fall back to an unversioned copy.

Use a dedicated SSH key and pin the server host key after comparing its
fingerprint through an independent trusted channel. Never accept `ssh-keyscan`
output as trusted without that comparison.

## GitHub environments and secrets

Create environments and load values from protected local files so values do
not enter shell history. These are the exact commands; the referenced files are
not part of this repository:

```sh
gh api --method PUT repos/tjsasakifln/web-cfg/environments/netcup-stage \
  -F 'deployment_branch_policy[protected_branches]=true' \
  -F 'deployment_branch_policy[custom_branch_policies]=false'
gh api --method PUT repos/tjsasakifln/web-cfg/environments/netcup-production \
  -F 'deployment_branch_policy[protected_branches]=true' \
  -F 'deployment_branch_policy[custom_branch_policies]=false'

gh secret set NETCUP_DEPLOY_HOST --repo tjsasakifln/web-cfg --env netcup-stage < /secure/confenge/netcup-host.txt
gh secret set NETCUP_DEPLOY_USER --repo tjsasakifln/web-cfg --env netcup-stage < /secure/confenge/netcup-user.txt
gh secret set NETCUP_SSH_PRIVATE_KEY --repo tjsasakifln/web-cfg --env netcup-stage < /secure/confenge/netcup-deploy-key
gh secret set NETCUP_SSH_KNOWN_HOSTS --repo tjsasakifln/web-cfg --env netcup-stage < /secure/confenge/netcup-known-hosts
gh variable set NETCUP_DEPLOY_PORT --repo tjsasakifln/web-cfg --env netcup-stage --body 2222

gh secret set NETCUP_DEPLOY_HOST --repo tjsasakifln/web-cfg --env netcup-production < /secure/confenge/netcup-host.txt
gh secret set NETCUP_DEPLOY_USER --repo tjsasakifln/web-cfg --env netcup-production < /secure/confenge/netcup-user.txt
gh secret set NETCUP_SSH_PRIVATE_KEY --repo tjsasakifln/web-cfg --env netcup-production < /secure/confenge/netcup-deploy-key
gh secret set NETCUP_SSH_KNOWN_HOSTS --repo tjsasakifln/web-cfg --env netcup-production < /secure/confenge/netcup-known-hosts
gh variable set NETCUP_DEPLOY_PORT --repo tjsasakifln/web-cfg --env netcup-production --body 2222
```

Restrict both environments to protected branches. With `main` protected by its
required checks, this lets the repository synchronize automatically without
granting a deploy credential to contributors or agents. Adding an environment
reviewer intentionally changes the flow from automatic to approval-paused.

Promotion also stays behind a repository-owner kill switch. Only an authorized
operator may set:

```sh
gh variable set NETCUP_CUTOVER_AUTHORIZED \
  --repo tjsasakifln/web-cfg \
  --env netcup-production \
  --body CONFENGE_NETCUP_CUTOVER_APPROVED
```

Interrupted rsync runs remain outside the immutable SHA path. A successful
retry validates the exact three-file envelope and atomically adopts it as
`incoming/<FULL_SHA>`; a divergent pre-existing envelope is refused.

Absent secrets produce a named failure. The workflow has no password, key,
known-host or hostname fallback and never uses `StrictHostKeyChecking=no`.

## Operation

Safe runs that do not swap public `current`:

```sh
sha=$(gh api repos/tjsasakifln/web-cfg/git/ref/heads/main --jq .object.sha)
gh workflow run netcup-release.yml --repo tjsasakifln/web-cfg --ref main -f operation=package_only -f expected_sha="$sha"
gh workflow run netcup-release.yml --repo tjsasakifln/web-cfg --ref main -f operation=stage_verify -f expected_sha="$sha"
```

`stage_verify` uploads and validates but does not modify `current`; therefore it
cannot change production traffic. An authorized dispatch may choose
`operation=promote` with the same `expected_sha`. Under normal operation no
dispatch is needed: a push to protected `main` promotes that event's exact SHA.
The workflow and host both serialize deploys.

Host commands (full SHA only):

```text
/opt/confenge-web/bin/stage-release <FULL_SHA>
/opt/confenge-web/bin/verify-release <FULL_SHA>
CONFENGE_LOCAL_ORIGIN=http://127.0.0.1:8088 /opt/confenge-web/bin/promote-release <FULL_SHA>
CONFENGE_LOCAL_ORIGIN=http://127.0.0.1:8088 /opt/confenge-web/bin/rollback <FULL_SHA>
/opt/confenge-web/bin/prune-releases --keep 5
```

Promotion validates manifest, detached package checksum, internal file hashes,
public identity, generated host/runtime contracts, Node 22 inventory and a
candidate loopback server before swapping `current`. After the atomic swap it
restarts and validates the portable runtime identity, runs `nginx -t`, performs
the controlled nginx reload, and checks the
loopback live identity. Any failure restores the previous symlink, restarts the
previous runtime, reloads its generated contract and revalidates it. No promote
or rollback requires a manual nginx edit.

Verify the GitHub attestation after downloading a release candidate:

```sh
gh attestation verify confenge-web-<FULL_SHA>.tar.gz --repo tjsasakifln/web-cfg
sha256sum --check confenge-web-<FULL_SHA>.tar.gz.sha256
```

Evidence is append-only at `/opt/confenge-web/evidence/deploy.ndjson`. Keep the
GitHub run URL, attestation and the final `PROMOTED` or `ROLLED_BACK` record in
the change evidence.

Public verification must see `Server: cloudflare` together with
`X-Confenge-Host-Architecture-Version: confenge-nginx-node/v2`. The first proves
the edge is not bypassed; the second proves the response still came from the
declared Netcup origin. `cf-cache-status: HIT` is expected for a warmed public
HTML URL, while operational and runtime endpoints must remain `DYNAMIC`.

## Schedules

The package carries disabled-by-default systemd templates and a schedule
contract. Packaging does not install a unit, create a cron entry, enable a
timer, or create `shared/schedule-cutover.json`.

Production HTTP is `confenge-web-runtime.service`. RevOps jobs that already hit
live HTTPS (`revops-scheduled.yml`) remain the operational GitHub scheduler.

The leftover Netlify scheduled function declared in `netlify.toml` is not the
public production plane. Do not enable the host timer while that leftover
executor cannot be proven disabled:

```sh
test ! -e /opt/confenge-web/shared/schedule-cutover.json
systemctl is-enabled confenge-web-search-observation.timer 2>&1 | grep -Eq 'disabled|not-found'
```

Only an authorized later change may first disable and verify the corresponding
leftover Netlify schedule, install the reviewed units from the promoted runtime,
and create a reviewed JSON gate that binds the current full SHA, the specific
job and evidence `legacy_executor.netlify_search_observation_disabled=true`.
Only then may it run:

```sh
sudo systemctl enable --now confenge-web-search-observation.timer
```

If the leftover scheduler cannot be proven disabled, stop: the activation gate
must remain absent. This is the explicit proof against double execution.

### Host-owned storage retention

`storage-retention` is the only canonical retention scheduler. It has no legacy
executor, but remains disabled and fail-closed until the shared gate binds the
current full SHA and sets `jobs.storage-retention=true`. The daily timer runs at
03:20 `America/Sao_Paulo` with a stable delay of up to 45 minutes and catches up
after downtime. The runner takes a non-blocking exclusive lock at
`/opt/confenge-web/shared/storage-retention.lock`; a concurrent timer, generic
unit or manual invocation fails instead of overlapping.

The retention command validates the complete store and lead idempotency indexes
under the host writer lock before applying. Any governed record with a missing
or malformed retention timestamp blocks all planned deletes. Suppressions and
indexes for retained leads are preserved. stdout is aggregate JSON only;
failures mark the unit failed and the `OnFailure` unit emits a `user.alert`
journal event without record keys or payloads.

This P1 is `EXECUTE_NOW`, front `SCALE / SUNSET`, with automation and trust
leverage. Time to evidence is one timer window after authorized activation.
One hundred executions improve the system through bounded, observable policy
enforcement; they do not create one hundred manual cleanup tasks. It does not
claim a QCO or revenue outcome.

After the exact release is promoted, install the versioned units and runner,
but do not enable the timer yet:

```sh
sudo install -o root -g root -m 0755 /opt/confenge-web/current/ops/bin/run-schedule /opt/confenge-web/bin/run-schedule
sudo install -o root -g root -m 0644 /opt/confenge-web/current/ops/lib/schedule_gate.py /opt/confenge-web/lib/schedule_gate.py
sudo install -o root -g root -m 0644 /opt/confenge-web/current/schedules/confenge-web-retention.service /etc/systemd/system/confenge-web-retention.service
sudo install -o root -g root -m 0644 /opt/confenge-web/current/schedules/confenge-web-retention.timer /etc/systemd/system/confenge-web-retention.timer
sudo install -o root -g root -m 0644 /opt/confenge-web/current/schedules/confenge-web-retention-alert@.service /etc/systemd/system/confenge-web-retention-alert@.service
sudo systemctl daemon-reload
systemctl is-enabled confenge-web-retention.timer 2>&1 | grep -Eq 'disabled|not-found'
```

Run the aggregate dry-run from the promoted immutable release before creating
the gate. Review `malformed_retention`, `expired`, `suppressions_preserved` and
`indexes_preserved`; do not print or copy stored records:

```sh
sudo -u confenge-deploy node /opt/confenge-web/current/scripts/storage/retention.mjs --store /var/lib/confenge-web
```

The reviewed gate must be a root-reviewed regular file (never a symlink) with
the current 40-character SHA and the exact job authorization. Creating it and
enabling the timer are privileged live changes deliberately left outside an
automatic promotion:

```json
{
  "schema": "confenge.schedule-cutover/v1",
  "authorized_release_sha": "FULL_SHA",
  "jobs": {
    "storage-retention": true
  }
}
```

Write that JSON to a protected reviewed file, substitute the promoted full SHA,
then install it without relaxing ownership or mode before enabling the timer:

```sh
sudo install -o root -g confenge-web -m 0640 /secure/confenge/schedule-cutover.json /opt/confenge-web/shared/schedule-cutover.json
sudo systemctl enable --now confenge-web-retention.timer
```

After authorized activation, capture only unit/timer state and aggregate job
output from the journal:

```sh
systemctl is-enabled confenge-web-retention.timer
systemctl is-active confenge-web-retention.timer
systemctl list-timers confenge-web-retention.timer --no-pager
systemctl show confenge-web-retention.service -p Result -p ExecMainStatus -p ExecMainStartTimestamp -p ExecMainExitTimestamp
journalctl -u confenge-web-retention.service --since today --output=json --no-pager
```

Rollback disables only `confenge-web-retention.timer` and removes that job's
authorization from the gate. It must not delete or restore the host-owned store
and must not create a cron replacement. Run
`sudo systemctl disable --now confenge-web-retention.timer`, install a reviewed
`0640 root:confenge-web` gate with `storage-retention` omitted (preserving any
independently authorized job), then confirm the timer is inactive.

## Rollback and pruning

Rollback targets an existing, fully verified SHA and uses the same candidate
smoke, atomic swap, nginx validation and live identity check as promotion. A
failed rollback restores the link it found. `prune-releases --keep 5` preserves
`current`, `rollback` and five additional newest releases; it never removes the
current release during deploy. Incoming packages and persistent data are not
pruned by this command. Lead recovery is documented in `docs/ops/ROLLBACK.md`.
