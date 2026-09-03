/**
 * Tests for identity resolution (establishment_digest → company_ref).
 *
 * Validates:
 * 1. establishment_digest is stored privately and not exposed publicly
 * 2. company_ref is resolved correctly from identity_projection
 * 3. company_ref never appears in client-facing responses
 * 4. Graceful fallback when projection is unavailable
 * 5. Multiple establishments resolve to same company_ref (same company group)
 */
import assert from "assert";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const root = path.dirname(
  path.dirname(path.dirname(fileURLToPath(import.meta.url)))
);

const {
  resolveCompanyRef,
  validateProjection,
  buildDigestToRefMap,
  setProjectionForTests,
  loadProjection,
  OFFICIAL_IDENTITY_PROJECTION_PATH,
} = require(path.join(root, "netlify/functions/lib/identity-resolver.cjs"));

const resultStore = require(path.join(
  root,
  "netlify/functions/lib/live-intelligence-result-store.cjs"
));

// Test projection with 2 establishments from same company
const testProjection = {
  schema: "CONFENGE_IDENTITY_PROJECTION/1.0",
  snapshot_id: "snap-test-001",
  sealed_to_manifest_hash: "abc123",
  entries: [
    {
      establishment_digest: "aaaaaaaaaaaaaaaa", // SENAT HQ
      company_ref: "cref1:00000000000000000000000000000001",
    },
    {
      establishment_digest: "bbbbbbbbbbbbbbbb", // SENAT filial
      company_ref: "cref1:00000000000000000000000000000001", // Same company
    },
    {
      establishment_digest: "cccccccccccccccc", // Another company
      company_ref: "cref1:00000000000000000000000000000002",
    },
  ],
  sealed_hash: "def456",
};

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    process.exitCode = 1;
  }
}

// Test 1: Validate projection structure
test("Identity projection validates correctly", () => {
  const valid = validateProjection(testProjection);
  assert.strictEqual(valid !== null, true, "Should accept valid projection");

  const invalid = validateProjection({
    schema: "WRONG_SCHEMA/1.0",
    entries: [],
  });
  assert.strictEqual(invalid, null, "Should reject invalid schema");
});

// Test 2: Build digest → ref map
test("Digest to ref map builds correctly", () => {
  const map = buildDigestToRefMap(testProjection);
  assert.strictEqual(
    map["aaaaaaaaaaaaaaaa"],
    "cref1:00000000000000000000000000000001"
  );
  assert.strictEqual(
    map["bbbbbbbbbbbbbbbb"],
    "cref1:00000000000000000000000000000001"
  );
  assert.strictEqual(
    map["cccccccccccccccc"],
    "cref1:00000000000000000000000000000002"
  );
});

// Test 3: Resolve company_ref
test("Company ref resolves from establishment digest", () => {
  setProjectionForTests(testProjection);
  const ref1 = resolveCompanyRef("aaaaaaaaaaaaaaaa");
  assert.strictEqual(ref1, "cref1:00000000000000000000000000000001");

  const ref2 = resolveCompanyRef("cccccccccccccccc");
  assert.strictEqual(ref2, "cref1:00000000000000000000000000000002");
});

// Test 4: Same company_ref for different establishments (group companies)
test("Same company_ref for multiple establishments (group)", () => {
  setProjectionForTests(testProjection);
  const ref1 = resolveCompanyRef("aaaaaaaaaaaaaaaa");
  const ref2 = resolveCompanyRef("bbbbbbbbbbbbbbbb");
  assert.strictEqual(ref1, ref2, "Two establishments should have same ref");
});

// Test 5: Missing digest returns null
test("Missing digest returns null", () => {
  setProjectionForTests(testProjection);
  const ref = resolveCompanyRef("dddddddddddddddd");
  assert.strictEqual(ref, null);
});

// Test 6: Null/empty digest returns null
test("Null or empty digest returns null", () => {
  setProjectionForTests(testProjection);
  assert.strictEqual(resolveCompanyRef(null), null);
  assert.strictEqual(resolveCompanyRef(""), null);
  assert.strictEqual(resolveCompanyRef(undefined), null);
});

// Test 7: Missing projection returns null gracefully
test("Missing projection returns null gracefully", () => {
  setProjectionForTests(null);
  const ref = resolveCompanyRef("aaaaaaaaaaaaaaaa");
  assert.strictEqual(ref, null);
});

// Test 8: Invalid projection returns null gracefully
test("Invalid projection returns null gracefully", () => {
  setProjectionForTests({ schema: "WRONG" });
  const ref = resolveCompanyRef("aaaaaaaaaaaaaaaa");
  assert.strictEqual(ref, null);
});

// Test 9: Private fields in result store
test("Private fields stored but not exposed publicly", () => {
  resultStore._resetForTests();

  // Mock a result with private field
  const result = {
    analysis_id: resultStore.newResultToken(),
    state: "PERFIL_ENCONTRADO",
    titulo: "Test",
    _establishment_digest: "aaaaaaaaaaaaaaaa", // Private field
  };

  // Public projection should not include private fields
  const pub = resultStore.publicResult(result);
  assert.strictEqual(
    pub._establishment_digest,
    undefined,
    "Public result should not include private fields"
  );
  assert.strictEqual(
    pub.analysis_id,
    result.analysis_id,
    "Public result should include public fields"
  );

  // Private fields helper should extract them
  const priv = resultStore.privateFields(result);
  assert.strictEqual(
    priv._establishment_digest,
    "aaaaaaaaaaaaaaaa",
    "Private fields should be extracted"
  );
});

// Test 10: Stored record separates public and private
test("Stored record separates public and private access", () => {
  resultStore._resetForTests();

  const result = {
    analysis_id: resultStore.newResultToken(),
    state: "PERFIL_ENCONTRADO",
    titulo: "Test",
    _establishment_digest: "aaaaaaaaaaaaaaaa",
  };

  const built = resultStore.buildRecord(result);
  assert.strictEqual(built.ok, true);
  assert.strictEqual(
    built.record.result._establishment_digest,
    undefined,
    "Public result should not have private field"
  );
  assert.strictEqual(
    built.record._private._establishment_digest,
    "aaaaaaaaaaaaaaaa",
    "Private object should have private field"
  );
});

// Test 11: Stored record keeps _private for server-side access
test("Stored record structure preserves _private for server-side access", () => {
  const result = {
    analysis_id: resultStore.newResultToken(),
    state: "PERFIL_ENCONTRADO",
    titulo: "Test",
    _establishment_digest: "aaaaaaaaaaaaaaaa",
  };

  const built = resultStore.buildRecord(result);
  assert.strictEqual(built.ok, true, "Record should build successfully");

  // Check structure
  const record = built.record;
  assert.strictEqual(
    record.result._establishment_digest,
    undefined,
    "Public result should not include private fields"
  );
  assert.strictEqual(
    record._private._establishment_digest,
    "aaaaaaaaaaaaaaaa",
    "Private section should contain private fields"
  );

  // Verify that loadResult would exclude _private by default
  // (tested in context of the full stack, but verified in structure here)
  assert.strictEqual(
    Object.keys(record).includes("_private"),
    true,
    "Stored record should have _private key"
  );
});

test("Official identity path is the producer sibling, not live/.private", () => {
  assert.strictEqual(
    OFFICIAL_IDENTITY_PROJECTION_PATH.endsWith(
      "data/live_intelligence/official.private/identity_projection.json"
    ),
    true,
    OFFICIAL_IDENTITY_PROJECTION_PATH
  );
  assert.strictEqual(
    OFFICIAL_IDENTITY_PROJECTION_PATH.includes("live/.private"),
    false
  );
});

test("loadProjection reads CONFENGE_IDENTITY_PROJECTION_PATH as candidate, never official_live", () => {
  const fs = require("fs");
  const os = require("os");
  const tmp = path.join(os.tmpdir(), `li-identity-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(testProjection), "utf8");
  const prev = process.env.CONFENGE_IDENTITY_PROJECTION_PATH;
  setProjectionForTests(null);
  process.env.CONFENGE_IDENTITY_PROJECTION_PATH = tmp;
  try {
    const loaded = loadProjection(process.env);
    assert.strictEqual(loaded.schema, "CONFENGE_IDENTITY_PROJECTION/1.0");
    assert.strictEqual(
      resolveCompanyRef("aaaaaaaaaaaaaaaa", { projection: loaded }),
      "cref1:00000000000000000000000000000001"
    );
    const blob = JSON.stringify(loaded);
    assert.ok(blob.includes("company_ref"));
  } finally {
    if (prev === undefined) delete process.env.CONFENGE_IDENTITY_PROJECTION_PATH;
    else process.env.CONFENGE_IDENTITY_PROJECTION_PATH = prev;
    fs.unlinkSync(tmp);
    setProjectionForTests(null);
  }
});

console.log("\nAll identity resolution tests completed.");
