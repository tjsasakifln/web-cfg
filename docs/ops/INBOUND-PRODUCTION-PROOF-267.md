# Inbound production proof — issue #267

- Decision state: `EXECUTE_NOW`, partially evidenced
- Executive front: `REVENUE NOW`
- Leverage: revenue
- Evidence captured: 2026-08-24 03:05 UTC
- Workflow run: [32685188116](https://github.com/tjsasakifln/web-cfg/actions/runs/32685188116)
- Immutable artifact SHA-256: `98ab2bae579a350ee07624a1bac835162253f580014c6bfcd7f69b79428da1ac`

The authenticated, read-only probe now fails closed unless production reports
`SET/SET/READY`. Run 32685188116 passed that stronger contract. It also found
126 persisted records, zero delivered records and exactly one aggregate
`ELIGIBLE_REAL_NOT_CONFIGURED` candidate. No identifier or contact field is in
the artifact.

## Acceptance state

| Requirement | State | Evidence |
| --- | --- | --- |
| GitHub `OPS_TOKEN` available | PROVEN | authenticated workflow check |
| Netlify URL/secret and contract ready | PROVEN | `SET/SET/READY` |
| aggregate proof committed | PROVEN | `data/revops/inbound-proof-runs/inbound-issue-267-run-32685188116.json` |
| Warmbly automatic outbound disabled | OPEN | this repository cannot observe or control it |
| exactly one real record reconciled | OPEN | probe is read-only; no replay/drain occurred |
| delivered counter greater than zero | OPEN | current value is zero |
| consented real commercial contact | `MISSING` | never inferred from configuration |

The remaining external action must be explicit and bounded: verify Warmbly
auto-send is off, approve the single eligible record, requeue at limit 1,
reconcile one receipt to one action, then rerun this proof. Do not batch replay
and do not invent a person.

## Visitor job, analytics and rollback

The visitor job is to have a consented request reach one accountable commercial
action without triggering unsolicited outbound. No public page or analytics
event changes here; source remains `CONFENGE_WEB`, and Warmbly remains the
commercial-action owner. Rollback is the PR revert; production secrets are not
stored or rotated by this repository. ADR-STRAT-002 boundaries are unchanged.
