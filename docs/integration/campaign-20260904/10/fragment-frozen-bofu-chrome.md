# Fragment: frozen BOFU chrome

- target_path: `FROZEN_SHELL_FILES` (hashes until 2026-09-16)
- operation: `skip` — campaign 10 does not rewrite frozen money-page header/footer. Those pages keep the pre-campaign-10 labels.
- stable_key: `scripts/bofu_dominance/frozen_specs/constants.py` `FORBIDDEN_RELATIVE_PATHS`
- dependency: freeze lift after 2026-09-16 or evidential close
- test: `test_frozen_bofu_pages_were_not_rewritten_by_this_campaign`
- rollback: none; freeze already isolates those bytes
