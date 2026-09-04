# Fragment — campaign 04 → campaign 10 (home / shell)

- `campaign_id`: 04
- `target_path`: `index.html` (home), global header/nav, global footer chrome
- `operation`: project
- `stable_key`: `credential-registry.org-legal-name` / `credential-registry.org-cnpj`
- `owner`: campaign 10 (information architecture / home / navigation)
- `dependency`: `data/site/credential-registry.json` + `scripts/site/credential_registry.py`
- `do_not_edit_in_04`: home, global nav, global footer, form

## What 04 already publishes on owned surfaces

`/confianca/` and `/especialista/tiago-jun-sasaki/` now project registry-backed identity:

- legal name `Confenge Serviços de Desenhos Técnicos Ltda`
- CNPJ `52.407.089/0001-09` with Receita Federal link
- cadastral/fiscal address (not a storefront)
- ART/NF wording qualified by scope/attribution
- Person jobTitle `Engenheiro Civil` (self-attested EESC-USP)

CREA-SC, RNP, SST title, CPTEC registration and work count remain `WITHHELD_PENDING_PRIMARY_EVIDENCE`.

## Suggested home/shell projection

When campaign 10 rebuilds the home and navigation:

1. Call `scripts.site.credential_registry.project(registry, surface)` or reuse allowed wording from the same registry. Do not copy strings by hand.
2. Home proof chips may add legal name + CNPJ only if those claims stay `VERIFIED`.
3. Do not add CREA, CPTEC, “perito do TJSC”, storefront hours, or client results.
4. Footer may keep CNPJ (already present) and may add “endereço cadastral e fiscal” only with the cadastral wording; never walk-in hours.
5. Revocation: flipping a claim to `WITHHELD`/`revoked=true` and re-projecting must drop it from home/footer in the same change.

## Test

- `python3 scripts/site/test_credential_registry.py`
- `python3 scripts/site/test_authority_contract.py` (home credentials stay a subset of proof + registry)

## Rollback

Set the claim `status` to `WITHHELD` in `data/site/credential-registry.json` and re-project. Do not leave a stale legal name or CREA number in home/nav/footer.
