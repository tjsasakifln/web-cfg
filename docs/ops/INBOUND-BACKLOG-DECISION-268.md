# Inbound backlog decision — issue #268

Decision: **DEFER replay until #267 reconciles one receipt to one action, Warmbly
auto-send is proven off and a human approves the exact single-item subset.**

The authenticated aggregate snapshot from workflow run
[32685188116](https://github.com/tjsasakifln/web-cfg/actions/runs/32685188116)
supersedes the issue opening count of 124 with a dated total of 126. It contains
67 synthetic, 12 QA, 45 missing classification and 2 real records. Commercial
eligibility is 79 DNC/suppressed, 46 with another blocker and exactly 1 real
candidate skipped because transport was not configured. All 126 fall in the
2026-08 window and report explicit consent, but aggregate consent alone never
authorizes replay. The proof did not export the acquisition origin, so that
axis is honestly recorded as `UNKNOWN=126`; `CONFENGE_WEB` is downstream
attribution, not evidence of the original acquisition source.

The cutoff is fail-closed in runtime: the candidate remains held and the
approved subset is zero, so both requeue and any scheduled drain of a backlog
row are blocked before mutation. The three dispositions in the decision are
aggregate policy buckets only; this snapshot does not claim that each stored
row was individually marked with a new reason. Existing rows are not deleted.
Merging this decision does not execute or approve a replay.

Decision v1 is a frozen DEFER snapshot with canonical SHA-256
`f8e89e749ff52df862b3724b7df61d2469c71c55190ec3bfeb9e16fc1bec71b6`.
It cannot be edited into EXECUTE. A future single-case execution requires a
separate versioned authority that references this digest, proves #267 has
reconciled one receipt to one action, records owner approval, re-probes Warmbly
auto-send off, binds the approved `lead_id`/`receipt_id` pair through a
non-reversible SHA-256 digest, expires within 24 hours, enforces age at most 30
days and caps both requeue and backlog drain at exactly one. The raw identifiers
never enter the authority artifact or analytics.

Visitor job: a legitimate consented request should reach one accountable action
without old, synthetic, suppressed or ambiguous records producing contact. The
hypothesis is that a single reconciled canary can prove the pipe without risking
the backlog. Source remains `CONFENGE_WEB`; Warmbly owns commercial action; no
PII or invented qualified opportunity enters analytics.

Rollback is to stop after the current item, preserve the queue and revert the
approval/policy revision. One hundred replays would create 100 units of risk;
one reusable cutoff gate improves the system for every future queue. No public
surface or ADR-STRAT-002 boundary changes.
