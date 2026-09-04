# Fragment: credential registry consumption

- target_path: credential registry owned by campaign 04
- operation: `consume` — home currently keeps already-shipped EESC-USP / public-administration lines; do not copy new credentials by hand
- stable_key: existing `data-credential` attributes on home; no new claims
- dependency: campaign 04
- test: `test_banned_empty_marketing_absent_from_home`; no “perito do TJSC”
- rollback: leave home proof lines as they were on BASE_SHA
