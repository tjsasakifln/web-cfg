# Next actions — BOFU-CORE

Maximum five. Frozen state **refuses** edit-now. Count: 5.

## 1. `gsc-live-overlay` — observe_only

Current mechanical state is LIVE_JOB_OK with core_ready_for_product_decisions=false (overlay gsc-live-overlay.v1.json, as_of 2026-08-17). last_sync.json is gitignored, not a committed missing_credentials file. PR #159 freeze-head historically recorded credential_failure. Do not treat historical CSV, SERP samples, non-BR geo, mixed device, or top-row gaps as BR TOP* or HTML authorization.

- authorizes_html_edit: `False`
- refs: pr-159, issue-128

## 2. `freeze-128` — observe_only

Keep the six #128 BOFU pillars FROZEN. Census and spec are allowed; do not recommend snippet/HTML edit-now before 2026-09-16.

- authorizes_html_edit: `False`
- earliest_safe_action_at: `2026-09-16`
- refs: issue-128

## 3. `origin-to-service-contract` — keep_owner

The versioned attribution contract owns origin→service; closed #153 is historical. This ledger does not reimplement analytics or edit script.js.

- authorizes_html_edit: `False`
- refs: issue-153, issue-128

## 4. `gap-155-blocked-156` — hold_gated

Closed #155 is historical NO_DEMAND_EVIDENCE; open #156 remains an external CONTENT_GAP. Neither is an existing page or current URL owner.

- authorizes_html_edit: `False`
- refs: issue-155, issue-156, issue-154

## 5. `historical-pr-roles` — do_not_duplicate

PR #157 closed unmerged and is not a BOFU family. PR #158 and PR #159 are historical merged implementations, not operational owners or live-rank claims.

- authorizes_html_edit: `False`
- refs: pr-157, pr-158, pr-159

## Stop

- Do not edit #128 HTML before 2026-09-16.
- Do not publish a #155/#156 landing from this slot.
- Do not treat top-row GSC evidence as comparable demand or rank.
