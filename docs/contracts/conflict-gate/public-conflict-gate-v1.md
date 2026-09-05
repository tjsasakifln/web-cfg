# CONFENGE_PUBLIC_CONFLICT_GATE / 1.0.0

Public conflict-screening contract owned by `web-cfg` campaign 05 / issue #585.
Machine record: `data/site/conflict-gate-contract.json`.

This is an operational conservative screening policy. It is not a legal opinion
that private activity is compatible with public office. A change of role,
duties, internal rule or interpretation reopens the assessment.

## Planes

| Plane | What it may contain | Owner |
| --- | --- | --- |
| Public policy | Principles, nuclei coverage, min first-step, neutral status, next step | `web-cfg` `/conflitos/` |
| Protected decision | owner, timestamp, reason class, matter ref, identity/role, validity, disclosure, receipt, policy version | Governance / Warmbly (not implemented here) |
| Case evidence | parties, process, contract, órgão, employees, medical, lawyers, experts, detailed motive | Protected register only |

`web-cfg` does not store parties or cases.

## Statuses

`CLEAR` · `CLEAR_WITH_DISCLOSURE` · `REVIEW_REQUIRED` · `DECLINE` · `UNKNOWN`

`UNKNOWN` and protected-path unavailability never become `CLEAR`.
Rollback returns `REVIEW_REQUIRED`, never `CLEAR`.

## Public projection keys

`status`, `next_step`, `policy_version`, `corpus_suspended`, `public_readback`

No reason class, party, process or motive on this plane.

## Hash

`content_sha256` of the JSON record, excluding the hash field itself. Missing
or divergent version/hash fail closed. Draft taxonomy/catalog/intake IDs are
pins for tests and fragments; they are not a runtime fallback.

## Shipped engine

`scripts.site.conflict_gate.evaluate_conflict`
