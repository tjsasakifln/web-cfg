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

| target_path | operation | stable_key | note |
| --- | --- | --- | --- |
| runtime/lib/adapter.mjs | port-after-LCP | request-id-admit-list | hexadecimal/UUID X-Request-Id; unknown_function route class |
| runtime/test/adapter.test.mjs | port-after-LCP | request-id-admit-tests | accompanies adapter |
| netlify/functions/lib/lead-core.cjs | port-after-LCP | app-log-finite-classes | IP/PII redaction; do not dump request text |
| netlify/functions/lib/lead-store.cjs | port-after-LCP | lead-store-redaction | accompanies lead-core |
| scripts/storage/retention.mjs | port-after-LCP | retention-apply-authority | validateApplyAuthority; dry-run read-only already partly on main |
| scripts/storage/test_host_owned_storage.mjs | port-after-LCP | retention-apply-tests | accompanies retention.mjs |
| scripts/site/test_inbound_security.mjs | port-after-LCP | inbound-security-privacy | extra privacy probes |
| deploy/netcup/lib/release_control.py | do-not-replay | release-control-main-ahead | main has a later 195-line delta; PR blob would regress |
| docs/architecture/RUNTIME-AUTHORITY.md | editorial-one-liner | runtime-authority-note | 1 line |
| runtime/README.md | editorial-one-liner | runtime-readme-note | 1 line |

## Dependency

Issues `#442` (nginx/app logs), `#443` (retention apply), `#410` (ops CSP
canary). Goal 97 owns integration. Campaign 01 does not implement these files.

## Test

Replay against current main, then:

- `node --test --test-concurrency=1 runtime/test/adapter.test.mjs`
- `node scripts/storage/test_host_owned_storage.mjs`
- `node scripts/site/test_inbound_security.mjs`
- required GitHub checks `site-ci` and `pSEO quality gates`
- LCP_HOLD_TRIGGER: `site-ci` step `Lighthouse local (_site)` must pass. Do not
  waive. Historical failure: job 99623938137 on `b2bc6b971016`.

## Rollback

Leave residual unmerged. `#586` trio stays. Source branch untouched.

## Destination

goal 97 or a later campaign explicitly authorized for runtime/privacy — not
campaign 01, not `#577`–`#585`.
