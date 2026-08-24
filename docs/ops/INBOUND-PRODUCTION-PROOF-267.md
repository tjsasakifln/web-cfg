# Inbound production proof — issue #267

- Decision state: `EXECUTE_NOW`, partially evidenced
- Executive front: `REVENUE NOW`
- Leverage: revenue
- Evidence captured: 2026-08-24 03:05 UTC
- Workflow run: [32685188116](https://github.com/tjsasakifln/web-cfg/actions/runs/32685188116)
- Immutable artifact SHA-256: `98ab2bae579a350ee07624a1bac835162253f580014c6bfcd7f69b79428da1ac`

Run 32685188116 passed the authenticated `SET/SET/READY` contract. The immutable
artifact predates the non-secret canonical-destination fingerprint; current code
emits schema `confenge-inbound-counters-proof/1.2`, requires the textually exact
canonical destination, `WARMBLY_PRODUCTION_V1`, HTTP 200 and `body.ok=true`, and
fails closed before any authenticated request when `BASE_URL` is not exactly
`https://confenge.com.br`. A new deploy and authenticated run are required to
prove that stricter state. Future artifacts project only schema-closed aggregate
fields and allowlisted category keys; raw runtime objects and transport errors
are not persisted. The captured run also found 126 persisted records,
zero delivered records and exactly one aggregate
`ELIGIBLE_REAL_NOT_CONFIGURED` candidate. No identifier or contact field is in
the artifact.

## Acceptance state

| Requirement | State | Evidence |
| --- | --- | --- |
| GitHub `OPS_TOKEN` available | PROVEN | authenticated workflow check |
| Netlify URL/secret syntactically configured | PROVEN | `SET/SET/READY` |
| canonical Warmbly destination fingerprint | OPEN | current v1.2 code requires the exact URL and `WARMBLY_PRODUCTION_V1`; immutable v1.1 run predates the field |
| aggregate proof committed | PROVEN | `data/revops/inbound-proof-runs/inbound-issue-267-run-32685188116.json` |
| Warmbly automatic outbound disabled | OPEN | immutable run did not capture destination health; this repository does not control the setting |
| exactly one real record reconciled | OPEN | probe is read-only; no replay/drain occurred |
| delivered counter greater than zero | OPEN | current value is zero |
| consented real commercial contact | `MISSING` | never inferred from configuration |

The remaining external action must be explicit and bounded: deploy the stricter
fingerprint, rerun the authenticated proof, verify Warmbly auto-send is off,
approve the single eligible record, requeue at limit 1,
reconcile one receipt to one action, then rerun this proof. Do not batch replay
and do not invent a person.

## Visitor job, analytics and rollback

The visitor job is to have a consented request reach one accountable commercial
action without triggering unsolicited outbound. No public page or analytics
event changes here; source remains `CONFENGE_WEB`, and Warmbly remains the
commercial-action owner. Rollback is the PR revert; production secrets are not
stored or rotated by this repository. ADR-STRAT-002 boundaries are unchanged.
