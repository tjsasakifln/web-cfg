import assert from "node:assert/strict";
import fs from "node:fs";

import { buildPayload, KEY_PATH, normalizeUrls } from "./indexnow_submit.mjs";

const key = fs.readFileSync(KEY_PATH, "utf8").trim();
const payload = buildPayload(
  [
    "https://confenge.com.br/",
    "https://confenge.com.br/ferramentas/checklist-reequilibrio/",
    "https://confenge.com.br/",
  ],
  key,
);

assert.equal(payload.host, "confenge.com.br");
assert.equal(payload.key, key);
assert.equal(payload.keyLocation, `https://confenge.com.br/.well-known/indexnow-key.txt`);
assert.deepEqual(payload.urlList, [
  "https://confenge.com.br/",
  "https://confenge.com.br/ferramentas/checklist-reequilibrio/",
]);
assert.throws(() => normalizeUrls(["https://smartlic.tech/"]), /canonical HTTPS URL/);
assert.throws(() => normalizeUrls(["https://confenge.com.br/?email=x@example.com"]), /canonical HTTPS URL/);
assert.throws(() => normalizeUrls(["https://confenge.com.br/#contato"]), /canonical HTTPS URL/);
assert.throws(() => normalizeUrls([]), /at least one/);
assert.throws(
  () => normalizeUrls(Array.from({ length: 10_001 }, (_, i) => `https://confenge.com.br/p${i}/`)),
  /at most 10,000/,
);

console.log("INDEXNOW_OK");
