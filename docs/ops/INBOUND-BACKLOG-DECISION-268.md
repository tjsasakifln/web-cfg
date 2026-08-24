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
authorizes replay.

The cutoff is fail-closed: the candidate remains held, the approved subset is
zero, replay is one-at-a-time only, automatic messages are forbidden and every
non-selected record is preserved with its disposition. Merging this decision
does not execute or approve a replay.

Visitor job: a legitimate consented request should reach one accountable action
without old, synthetic, suppressed or ambiguous records producing contact. The
hypothesis is that a single reconciled canary can prove the pipe without risking
the backlog. Source remains `CONFENGE_WEB`; Warmbly owns commercial action; no
PII or invented qualified opportunity enters analytics.

Rollback is to stop after the current item, preserve the queue and revert the
approval/policy revision. One hundred replays would create 100 units of risk;
one reusable cutoff gate improves the system for every future queue. No public
surface or ADR-STRAT-002 boundary changes.
