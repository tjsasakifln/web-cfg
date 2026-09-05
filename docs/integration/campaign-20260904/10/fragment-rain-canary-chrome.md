# Fragment: #127 rain-canary chrome re-approval

- target_path: `conteudos/chuva-prorrogacao-prazo-obra-publica/index.html`
- operation: `skip` in `scripts/site/shell_nav.py` `HASH_PINNED_SHELL_FILES` until a new hash-bound approval is recorded
- stable_key: `data/editorial/striking-distance-noindex.v1.json` approval `material_hash=sha256:45b162b336413029c9aa5ccbdaed9857b6029a4c98c97142d2e3158a568fa6bd` (issue #127)
- dependency: editorial owner; do not edit the decisions file from campaign 10
- test: `test_hash_pinned_rain_canary_keeps_approved_material`; `python3 -m pytest scripts/editorial/tests -q`
- rollback: file restored to BASE_SHA `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`; chrome sync must not touch it
