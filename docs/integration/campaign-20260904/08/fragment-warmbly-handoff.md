# Fragment — Warmbly inbound (campaign 07 / goal 97)

- target_path: Warmbly `confenge.inbound.v1` (not edited here)
- operation: consume closed classes folded into existing `message` (`nucleo=`, `oferta_candidata=`, `qualificacao=`, `conflito=`). Do not add a parallel schema in web-cfg
- stable_key: `source=CONFENGE_WEB`
- dependency: invariants `outbound_eligible=false` `auto_send=false` stored on the lead record; Warmbly must not auto-send
- test: `node scripts/site/test_inbound_handoff.mjs` plus adaptive mapper assertions
- rollback: omit adaptive keys from `message`; B2G fold remains
- conflict parties never on query string or analytics
