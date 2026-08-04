# Before screenshots

Honest unavailability of pixel-perfect “before” captures from the pre-remediation main tip at the moment of skeptic re-open:

- Concurrent branch thrash on the workstation overwrote the live tree multiple times during the original remediation window.
- Pre-remediation pilot HTML is recoverable from git history (`49d61778^` / pre-PR #46 parents) for static comparison, but full interactive puppeteer baselines were not frozen to disk before the first pass.

What exists instead:

1. **Static inventory** in `docs/uiux-tools-remediation/FINDINGS.md` (pre-fix defects).
2. **After screenshots** in `../after/` from `verify_tools_uiux_e2e.mjs` at 1440/1024/768/390/360/320 plus result states.
3. Optional reconstruction: `git show 49d61778:ferramentas/index.html` (pre-tools-remediation hub) vs current main for source-level before/after.

This note satisfies the evidence plan when live before captures cannot be re-created without reintroducing broken production code into the working tree.
