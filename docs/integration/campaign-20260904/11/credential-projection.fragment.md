# Fragment: credential projection

- `target_path`: credential registry owned by #243 / #581 (campaign 04). Not copied here.
- `operation`: `project_when_ratified`
- `stable_key`: `grande-florianopolis-hub.credentials`
- `depends_on`: ratified credential record with source class, `as_of`, recheck path. Founder rule: contract address is cadastral, not storefront.
- `teste`: after projection, visible copy and JSON-LD parity for legal name / identifiers; still no `LocalBusiness` storefront, `openingHours`, `hasMap` or walk-in copy. Campaign 11 tests currently **fail** if CNPJ, CREA, RNP, CPTEC, ART numbers or the cadastral street are present in the hub HTML.
- `rollback`: strip projected fields from this route in one release; keep the fail-closed placeholders already in the hub.

This campaign publishes placeholders only: ART/NF when the act and attribution require them; no numbers.
