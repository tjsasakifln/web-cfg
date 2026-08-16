# URL map — SmartLic → CONFENGE (inventory v2)

Source of truth: `data/migrations/smartlic-url-map/inventory.v2.json`  
Loader: `scripts/legacy_equity/inventory.py`  
Builder: `scripts/legacy_equity/build_inventory.py`

## Actions

| Action | Count | Runtime |
|---|---:|---|
| `REDIRECT_301` | 11 | one-hop 301 to a live CONFENGE canonical |
| `HOLD_TARGET_NOT_READY` | 54 | 410, no Location; tests skipped with `skip_reason` |
| `RETIRE_410` | 1190 | 410, no Location |
| `MIGRATE` | 0 | none — this goal does not copy pages |
| `IGNORE_NONCANONICAL` | 0 | no distinct www/http/query rows in the GSC extract |
| `LEGAL_SECURITY_HOLD` | 0 | no legal/security hold evidenced |

Every priority URL (P0/P1, ready, or GSC clicks > 0) has exactly one action. No row 301s to `https://confenge.com.br/` or a parent hub as a dump.

## Families

- pSEO farms (`/fornecedores/{id}`, `/orgaos/{slug}`, `/cnpj/{cnpj}`, `/contratos/orgao/{cnpj}`, blog programmatic) → `RETIRE_410`.
- SaaS/auth/billing/account/product → `RETIRE_410` (CONFENGE is not a SmartLic successor product).
- TI persona / competitor-comparison editorial → `RETIRE_410` (outside ICP or no equivalent).
- Tender-howto hubs, PNCP how-tos, lei-14133 children that do not exist yet, glossary/Q&A hubs → `HOLD_TARGET_NOT_READY`.
- 11 already-equivalent #60 surfaces → `REDIRECT_301`.

Live GSC (2026-08-16) and backlinks remain **UNKNOWN**. The 2026-04-27 snapshot is the dated baseline.

## Query / fragment / slash

Allowlist only: `utm_*`, `jornada`, `origem`, `route_family`, `cta_id`, `asset_id`, `correlation_id`, `tema`. PII keys never persist. Fragments are not forwarded. Trailing slash on the legacy path is stripped except `/`. Host lowercase; path case preserved.
