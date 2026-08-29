# Netcup atomic release (public production)

Status: `PRODUCTION_PUBLIC_RUNTIME / NETCUP_NGINX_NODE_V2`

This directory is the production release path for `confenge.com.br`. Public
traffic already answers on this VPS (`Server: nginx`,
`X-Confenge-Host-Architecture-Version: confenge-nginx-node/v2`). The
authoritative record is `docs/architecture/RUNTIME-AUTHORITY.md`.

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
  RUNTIME-AUTHORITY records the production host as nginx/Netcup.
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
sudo install -d -o confenge-deploy -g confenge-deploy -m 0750 \
  /opt/confenge-web /opt/confenge-web/incoming /opt/confenge-web/releases \
  /opt/confenge-web/locks /opt/confenge-web/evidence \
  /opt/confenge-web/state /opt/confenge-web/shared
sudo install -d -o root -g root -m 0755 /opt/confenge-web/bin /opt/confenge-web/lib
sudo install -d -o confenge-deploy -g confenge-deploy -m 0700 /var/lib/confenge-web
sudo install -d -o root -g confenge-deploy -m 0750 /etc/confenge-web
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
sudo install -o root -g confenge-deploy -m 0640 /secure/confenge/netcup-runtime.env /etc/confenge-web/runtime.env
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

## Rollback and pruning

Rollback targets an existing, fully verified SHA and uses the same candidate
smoke, atomic swap, nginx validation and live identity check as promotion. A
failed rollback restores the link it found. `prune-releases --keep 5` preserves
`current`, `rollback` and five additional newest releases; it never removes the
current release during deploy. Incoming packages and persistent data are not
pruned by this command. Lead recovery is documented in `docs/ops/ROLLBACK.md`.
