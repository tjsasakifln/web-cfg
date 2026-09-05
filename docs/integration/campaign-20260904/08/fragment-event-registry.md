# Fragment — measurement contract (campaign 13 / goal 97)

- target_path: `netlify/functions/lib/event-registry.json`
- operation: reuse existing `lead_form_*` / `lead_persisted`. Optional allowlist addition of closed IDs: `nucleus_id`, `landing_family`, `qualification_state`, `conflict_status`
- stable_key: `lead_form_submit.property_allowlist`
- dependency: campaign 08 emitter already sends those IDs; analytics.js drops PII keys
- test: `npm run test:analytics` and `node scripts/site/test_adaptive_intake.mjs`
- rollback: emitters keep working; unknown props are ignored
- do not invent new event names
