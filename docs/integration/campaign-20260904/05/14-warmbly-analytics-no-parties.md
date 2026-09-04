# Fragment 14 — Warmbly / analytics: no parties

- **target_path:** analytics event contract and Warmbly inbound (`netlify/functions/lib/event-contract.cjs`, Warmbly ingest). Campaign 05 does not edit lead runtime or analytics modules.
- **operation:** constrain
- **stable_key:** public projection keys of `CONFENGE_PUBLIC_CONFLICT_GATE/1.0.0`; `source=CONFENGE_WEB`
- **dependency:** existing PII strip in `admitEvent`; `outbound_eligible=false`; `auto_send=false`
- **test:** public projection + event payload must fail a PII/party scan. `scripts/site/test_conflict_gate.py::test_one_hundred_screenings_reuse_reason_classes_without_party_leak` and `npm run test:privacy`
- **rollback:** drop conflict events rather than send party fields. A missing pin is `SKIPPED`/`BLOCKED`, never a permissive analytics fallback.

Allowlisted public conflict event props, if any event is emitted later: `conflict_status`, `conflict_policy_version`, `corpus_suspended`. Forbidden: reason class detail, matter ref, party, process, órgão, employee, medical, lawyer, expert names.

One hundred screenings produce one hundred receipts on the protected plane and a finite reason-class set. They must not produce one hundred public party records.
