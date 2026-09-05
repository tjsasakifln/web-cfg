# Fragment 06 — protected decision interface

- **target_path:** Warmbly/Governance protected conflict register (not in `web-cfg`). Do not edit `netlify/functions/**` or create a parties database here.
- **operation:** consume
- **stable_key:** `CONFENGE_PUBLIC_CONFLICT_GATE/1.0.0` + `content_sha256` in `data/site/conflict-gate-contract.json`
- **dependency:** campaign 05 public contract; Governance #65 when that issue exists as store owner; Warmbly action plane; `source=CONFENGE_WEB`; `outbound_eligible=false`; `auto_send=false`
- **test:** producer publishes version/hash; consumer fixture pins both; missing or divergent pin fail-closed to `REVIEW_REQUIRED` or `UNKNOWN`, never `CLEAR`. `scripts/site/test_conflict_gate.py::test_divergent_version_hash_fail_closed_never_fallback`
- **rollback:** if the protected store is unavailable, pause corpus and surface `REVIEW_REQUIRED` / `UNKNOWN`. Never default to clearance.

## Payload (protected plane only)

Keys: `owner`, `timestamp`, `reason_class`, `matter_ref_protected`, `identity_role`, `valid_until`, `recheck_on`, `disclosure`, `receipt`, `policy_version`, `policy_hash`, `prior_clearance_invalidated`.

Do not copy this schema into a second authority. Do not place it in public analytics, query strings or logs.

Reason classes are the finite sanitized set in the contract. One hundred screenings reuse that set; they do not spawn one hundred schemas or one hundred public party records.

## Nuclei

`expert_evidence_assistance`, `property_valuation`, `building_engineering_documentation`, `occupational_safety`, `public_works_b2g`.
