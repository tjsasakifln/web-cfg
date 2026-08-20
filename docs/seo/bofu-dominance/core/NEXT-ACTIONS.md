# Next actions — BOFU-CORE

Maximum five. Frozen state **refuses** edit-now. Count: 5.

## 1. `gsc-credentials` — NEEDS_EXTERNAL_ACTION

Set GSC_CREDENTIALS_JSON (or client secrets+token) and GSC_SITE_URL. Until then gsc_live_state=BLOCKED_CREDENTIAL_FAILURE. Do not treat historical CSV, redacted snapshots or SERP samples as live.

- authorizes_html_edit: `False`
- refs: pr-159, issue-128

## 2. `freeze-128` — observe_only

Keep the six #128 BOFU pillars FROZEN. Census and spec are allowed; do not recommend snippet/HTML edit-now before 2026-09-16.

- authorizes_html_edit: `False`
- earliest_safe_action_at: `2026-09-16`
- refs: issue-128

## 3. `origin-to-service-153` — keep_owner

#153 owns the origin→service transition with destination_service_id. This ledger does not reimplement analytics or edit script.js.

- authorizes_html_edit: `False`
- refs: issue-153, issue-128

## 4. `gated-155-156` — hold_gated

#155 bid-readiness and #156 partner-integrity enter as GATED, not as existing pages. Do not ship HTML. #156 stays blocked on extra-cli#436.

- authorizes_html_edit: `False`
- refs: issue-155, issue-156, issue-154

## 5. `prs-157-159-roles` — do_not_duplicate

PR #157 is one contract-analysis canary, not a BOFU family. PR #158 is the Data Desk kit, not a second target registry. PR #159 is an observability candidate to merge, not live GSC on main.

- authorizes_html_edit: `False`
- refs: pr-157, pr-158, pr-159

## Stop

- Do not edit #128 HTML before 2026-09-16.
- Do not publish #155/#156 landings from this slot.
- Do not merge this PR as if GSC were live.

