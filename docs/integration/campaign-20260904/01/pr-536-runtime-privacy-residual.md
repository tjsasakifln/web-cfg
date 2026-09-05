# Handoff — PR #536 runtime/privacy residual

CAMPAIGN_ID=01
SOURCE_PR=536
SOURCE_BRANCH=feat/issues-442-443-runtime-privacy
SOURCE_COMMIT=b2bc6b971016466675304fe41f5101a5fed659be
SOURCE_TREE=ef8cabe9bc85ef8920791a0c13b6450cbb3b43e4
AUDITED_MAIN_SHA=89b081a8676d8a0b30747dfcb1477f21d9ac4dfb
ABSORBED_BY=89b081a8676d8a0b30747dfcb1477f21d9ac4dfb (#586)
DECISION=PORT_RESIDUAL_VIA_HANDOFF
LCP_HOLD=YES
DO_NOT_IMPLEMENT_ON_CAMPAIGN_01=YES

## Intent

Keep the unique privacy/runtime hardening that `#586` did not absorb. Do not
merge PR `#536`. Do not rebase or force-push the source branch.

## Absorbed (do not replay)

`/ops/*` `Cache-Control: no-store, no-transform`; schedule-contract 2.1.0
storage-retention timer (disabled until gate); nginx `log_format
confenge_minimized`. Live production already serves the ops cache contract.

## Residual paths (unique vs current main)

| target_path | operation | stable_key | test | rollback | note |
| --- | --- | --- | --- | --- | --- |
| runtime/lib/adapter.mjs | port | request-id-admit-list | `node --test --test-concurrency=1 runtime/test/adapter.test.mjs` | leave unmerged | hexadecimal/UUID X-Request-Id; unknown_function route class; LCP HOLD |
| runtime/test/adapter.test.mjs | port | request-id-admit-tests | same adapter test | leave unmerged | accompanies adapter |
| netlify/functions/lib/lead-core.cjs | port | app-log-finite-classes | `node scripts/site/test_inbound_security.mjs` plus lead-function suite | leave unmerged | IP/PII redaction; do not dump request text |
| netlify/functions/lib/lead-store.cjs | port | lead-store-redaction | accompanies lead-core | leave unmerged | finite app-log classes |
| scripts/storage/retention.mjs | port | retention-apply-authority | `node scripts/storage/test_host_owned_storage.mjs` | leave unmerged | validateApplyAuthority; dry-run read-only already partly on main |
| scripts/storage/test_host_owned_storage.mjs | port | retention-apply-tests | same host-owned storage test | leave unmerged | accompanies retention.mjs |
| scripts/site/test_inbound_security.mjs | port | inbound-security-privacy | `node scripts/site/test_inbound_security.mjs` | leave unmerged | extra privacy probes |
| deploy/netcup/lib/release_control.py | do-not-replay | release-control-main-ahead | `python3 -m pytest deploy/netcup/tests/test_release_control.py -q` on current main | n/a not applied | main has a later 195-line delta; PR blob would regress |
| deploy/netcup/lib/schedule_gate.py | port | retention-authority-fds | `python3 -m pytest deploy/netcup/tests/test_release_control.py -q -k retention` after porting retention.mjs apply-authority | revert surgical argv/pass_fds hunk | unique vs main 89b081a: `run_retention` adds `--authority-fd/--lock-fd/--deploy-lock-fd/--release-root/--release-sha` and `pass_fds`; not in the #586 trio; depends on residual retention.mjs; LCP HOLD |
| deploy/netcup/package_release.py | do-not-replay | package-release-blob | `python3 -m pytest deploy/netcup/tests/test_release_control.py -q -k tarball` on current main | n/a do not apply PR blob | PR blob drops `scripts/live_intelligence` and `scripts/organic` already packaged on main (#584). Surgical later port of `capabilities.operational_privacy_retention` and `files_manifest_sha256` is allowed only onto current main, never by replaying this file |
| deploy/netcup/tests/test_release_control.py | do-not-replay | release-control-tests-blob | `python3 -m pytest deploy/netcup/tests/test_release_control.py -q` on current main | n/a do not apply PR blob | PR blob drops live-intel overlay tests already on main. Unique tests to port later: `test_pre_privacy_retention_release_remains_a_valid_rollback_target`, `test_capability_bearing_release_cannot_be_relabelled_as_legacy` |
| deploy/netcup/README.md | editorial | netcup-privacy-docs | read-back that #586 "Retention timer stays disabled until schedule-cutover.json authorizes storage-retention" heading remains | restore main README | unique PR headings `Minimized nginx request telemetry`, `Host-owned storage retention`, `#442/#443/#410 serial cutover`; do not overwrite the #586 timer-disabled note |
| docs/architecture/RUNTIME-AUTHORITY.md | editorial | runtime-authority-note | `rg` the one-line privacy note after edit | revert the line | 1 line |
| runtime/README.md | editorial | runtime-readme-note | `rg` the one-line privacy note after edit | revert the line | 1 line |

## Dependency

Issues `#442` (nginx/app logs), `#443` (retention apply), `#410` (ops CSP
canary). Goal 97 owns integration. Campaign 01 does not implement these files.

## Test

Replay against current main, then:

- `node --test --test-concurrency=1 runtime/test/adapter.test.mjs`
- `node scripts/storage/test_host_owned_storage.mjs`
- `node scripts/site/test_inbound_security.mjs`
- `python3 -m pytest deploy/netcup/tests/test_release_control.py -q -k retention` after any `schedule_gate.py` port
- required GitHub checks `site-ci` and `pSEO quality gates`
- LCP_HOLD_TRIGGER: `site-ci` step `Lighthouse local (_site)` must pass. Do not
  waive. Historical failure: job 99623938137 on `b2bc6b971016`.

## Rollback

Leave residual unmerged. `#586` trio stays. Source branch untouched.

## Destination

goal 97 or a later campaign explicitly authorized for runtime/privacy — not
campaign 01, not `#577`–`#585`.
