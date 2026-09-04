# Fragment — campaign 04 → global footer

- `campaign_id`: 04
- `target_path`: footer chrome in `scripts/pseo/html_shell.py` and static footers
- `operation`: project
- `stable_key`: `credential-registry.org-cadastral-address`
- `owner`: campaign 10 / shell
- `dependency`: registry claim `org-cadastral-address` (status `VERIFIED` as of 2026-09-04)

## Constraint

The registered address is cadastral/fiscal only. Footer copy, if added, must be:

> Endereço cadastral e fiscal: Avenida Prefeito Osmar Cunha, 416, sala 1108, Centro, Florianópolis/SC, CEP 88015-100. Atendimento online ou no local do cliente, mediante agendamento.

Forbidden in footer: opening hours, “visite”, “escritório aberto ao público”, map pin implying walk-in, LocalBusiness `openingHours`.

Campaign 04 already projects this on `/confianca/` and `/especialista/tiago-jun-sasaki/` JSON-LD `Organization.address` without `openingHours`.

## Test

Revoking `org-cadastral-address` must remove street address from footer in the same change as the owned pages.

## Rollback

Remove the footer line; keep “Atendimento nacional” if that remains the operating message.
