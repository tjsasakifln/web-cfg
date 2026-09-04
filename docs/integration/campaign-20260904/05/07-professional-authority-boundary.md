# Fragment 07 — professional authority boundary (#581)

- **target_path:** specialist credential surfaces owned by campaign 04 / issue #581 (`data/site/proof.json` and specialist copy). Campaign 05 does not edit them.
- **operation:** observe / constrain
- **stable_key:** `CONFENGE_PUBLIC_CONFLICT_GATE/1.0.0` public projection forbids party, process, docket, órgão, employee, medical, lawyer and expert names
- **dependency:** #581 may publish CPTEC registration and work count with source/`as_of`/limits. It must not publish active-case identities. Conflict screening does not invent credentials.
- **test:** `/conflitos/` HTML + JSON-LD must not contain docket/party names. `scripts/site/test_conflict_gate.py::test_rendered_conflitos_covers_nuclei_min_data_and_fail_closed_copy`
- **rollback:** remove any credential or case claim from #581 without changing this gate; screening stays fail-closed.

Assistente técnico and perito do juízo are incompatible on the same or related matter (`incompatible_expert_roles` → `DECLINE`). Public copy on `/conflitos/` states the principle without naming cases.
