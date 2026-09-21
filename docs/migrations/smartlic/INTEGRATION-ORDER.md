# Integration order — web-cfg#62 ↔ SmartLic#2115

Exact sequence. Do not invert. Do not merge or apply DNS from the implementer checkout.

1. **web-cfg pin.** Commit `data/migrations/smartlic-url-map/inventory.v2.json` (and the byte-identical `data/migration/smartlic-confenge/manifesto.v1.json`). Record SHA-256 `9e0679be0989768c2d374432427dcd6c37db9d46a5f05a640e9562e5a055785c`.
2. **SmartLic consume.** On `chore/redirect-bridge-2115`, copy those bytes to `bridge/manifest/manifesto.v1.json`, set `PINNED_SHA256` to that digest, set `PINNED_COMMIT` to the web-cfg commit that carries the file, regenerate `bridge/generated/`. Prior consume of `3c5a5b7a…` (PR #2135) is stale after the WEB-017 remapping.
3. **Human accept.** Review the 11 ready 301s and the HOLD fail-closed list. #62 and #2115 stay OPEN.
4. **Owner cutover.** Only after a named host (`$BRIDGE_PUBLIC_IPV4`) and ACME email exist. Commands live in `SmartLic/bridge/docs/CUTOVER.md`. This goal does not run them.
5. **Observe 28 days** from the first production 301 of this hash. Then review removal → #2111. Do not archive the SmartLic repo before that gate.

Rebuild: `python3 scripts/legacy_equity/build_inventory.py`  
Tests: `python3 -m pytest scripts/legacy_equity/tests scripts/migration/tests -q`
