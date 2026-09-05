# Fragment: #127 rain-canary chrome re-approval

- target_path: hash-pinned editorial canaries skipped by `HASH_PINNED_SHELL_FILES` (`chuva-prorrogacao-prazo-obra-publica` #127; `atraso-na-medicao-obra-publica` and frozen siblings #389)
- operation: `skip` in `scripts/site/shell_nav.py` until a new hash-bound approval is recorded
- stable_key: #127 `material_hash=sha256:45b162b3…`; #389 `after_sha256=bc604a66…`
- dependency: editorial owner; do not edit the decisions file from campaign 10
- test: `test_hash_pinned_rain_canary_keeps_approved_material`; `python3 -m pytest scripts/editorial/tests -q`
- rollback: file restored to BASE_SHA `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`; chrome sync must not touch it
