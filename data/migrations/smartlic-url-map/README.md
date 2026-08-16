# smartlic-url-map v2

Hash-pinned decision table for web-cfg#62 / SmartLic#2115.

| File | Role |
|---|---|
| `inventory.v2.json` | source of truth (1255 URLs, six actions) |
| `inventory.v2.sha256` | SHA-256 of the inventory bytes |
| `execute-set.v2.json` | compiled 11 ready 301s + HOLD fail-closed list + default 410 |

`data/migration/smartlic-confenge/manifesto.v1.json` is written with **identical bytes** so the SmartLic bridge vendors one pin. Rebuild only through `python3 scripts/legacy_equity/build_inventory.py`.
