# Keyed live canary (NOT executed in this wave)

Producer extra-cli#436 is deployed (`8e15f94f…`). The unkeyed live canary
already returned aggregate `UNKNOWN` (correct). Remaining producer residual is
Portal da Transparencia API key proof, not a new contract.

web-cfg does not store or fetch that key.

## Exact command (future; do not run here)

From a machine that already has the Portal API key in the **extra-cli**
environment (never commit the key; never copy it into web-cfg):

```bash
# 1) extra-cli: produce a live envelope (repo extra-cli, SHA 8e15f94f or later main)
cd /path/to/extra-cli
python3 -m scripts.public_integrity live \
  --cnpj "$VALID_CNPJ" \
  --out artifacts/public-integrity/keyed-live-payload.json

# 2) Redact queried_cnpj before any web-cfg commit
python3 - <<'PY'
import json
from pathlib import Path
from scripts.public_integrity.hashing import attach_hash
p = Path("artifacts/public-integrity/keyed-live-payload.json")
body = json.loads(p.read_text())
body["queried_cnpj"] = "[REDACTED_CNPJ]"
for rec in body.get("records") or []:
    rec["original"] = {}
p.write_text(json.dumps(attach_hash(body), ensure_ascii=False, indent=2, sort_keys=True) + "\n")
print(body["aggregate_state"], body["content_hash"])
PY

# 3) web-cfg: consume the envelope in-process (flag still default false; no deploy)
cd /path/to/web-cfg
PUBLIC_INTEGRITY_PREPARE=1 NODE_ENV=test node --input-type=module - <<'JS'
import { createRequire } from "module";
import fs from "fs";
const require = createRequire(import.meta.url);
const { consumeEnvelope } = require("./scripts/public_integrity_consumer/consume.cjs");
const { mapPublicView } = require("./scripts/public_integrity_consumer/map.cjs");
const raw = JSON.parse(fs.readFileSync(process.env.ENVELOPE || "artifacts/public-integrity/keyed-live-payload.json", "utf8"));
const consumed = consumeEnvelope(raw);
const view = mapPublicView(consumed);
if (view.aggregate_state === "NO_MATCH_CONFIRMED" && !consumed.ok) process.exit(2);
if (!view.sources.every((s) => s.source_id && s.status && s.as_of !== undefined)) process.exit(3);
console.log(JSON.stringify({ ok: consumed.ok, aggregate_state: view.aggregate_state, coverage_class: view.coverage_class }, null, 2));
JS
```

Pass `ENVELOPE=/absolute/path/to/keyed-live-payload.json` when the file is not
in the extra-cli default path.

Success for the canary is a fail-closed public view (`MATCHES_FOUND` |
`NO_MATCH_CONFIRMED` | `PARTIAL` | `UNKNOWN`) with source, coverage and `as_of`
on every card. `NO_MATCH_CONFIRMED` remains illegal on transport failure.

Do not flip `PUBLIC_INTEGRITY_CONSUMER` to true, do not add the URL to a
sitemap, and do not merge a live INDEX change in that canary unless a later
goal authorizes it.
