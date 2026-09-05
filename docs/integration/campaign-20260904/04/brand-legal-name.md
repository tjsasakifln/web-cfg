# Fragment — campaign 04 → shared brand data

- `campaign_id`: 04
- `target_path`: `data/site/brand.json`
- `operation`: merge
- `stable_key`: `brand.organization.legalName`
- `owner`: brand/copy contract (not campaign 04)
- `dependency`: `data/site/credential-registry.json` claims `org-legal-name`, `org-cnpj`, `org-cadastral-address`

## Why 04 did not edit brand.json

`brand.json` is global commercial identity. Campaign 04 owns the credential registry and the `/confianca/` + specialist projections. Writing legal name, CREA or address into `brand.json` would create a second source of truth and leak withheld CREA numbers into every page that consumes the brand contract.

## Suggested merge (only VERIFIED rows)

```json
{
  "organization": {
    "legalName": "Confenge Serviços de Desenhos Técnicos Ltda",
    "taxID": "52.407.089/0001-09",
    "addressRole": "cadastral_fiscal",
    "address": {
      "streetAddress": "Avenida Prefeito Osmar Cunha, 416, sala 1108",
      "addressLocality": "Florianópolis",
      "addressRegion": "SC",
      "postalCode": "88015-100",
      "addressCountry": "BR"
    }
  }
}
```

Do not add `jobTitle` “Engenheiro Civil e Engenheiro de Segurança do Trabalho”, CREA numbers, RNP or CPTEC until those registry rows leave `WITHHELD`.

## Test

Consumers of `brand.json` must keep visible/schema parity with the registry. A brand field whose claim is not projectable must not render.

## Rollback

Delete the merged keys. The credential registry remains the audit trail.
