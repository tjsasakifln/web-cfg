/**
 * Gates for the headless capture harness states (#507).
 *
 * Two layers:
 *   1. hermetic, always runs — viewport table, state resolution, filenames,
 *      manifest shape and the durable-output refusal;
 *   2. browser-backed — proves each state actually changes what Chrome renders,
 *      isolated and combined. Skipped when no Chrome is resolvable, unless
 *      CAPTURE_BROWSER_REQUIRED=1 or CI, matching test_ui_geometry.mjs.
 *
 * Usage: node --test scripts/site/test_capture_states.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { inflateSync } from "zlib";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  DEFAULT_VIEWPORTS,
  MANIFEST_SCHEMA_VERSION,
  PROTOCOL_VIEWPORTS,
  applyCaptureState,
  assertDurableOutDir,
  buildManifest,
  captureFileName,
  captureRecord,
  manifestFileName,
  prepareFullPageCapture,
  resolveCaptureState,
  resolveViewports,
  sha256OfFile,
  verifyFullPageCapture,
} from "./capture_states.mjs";
import { resolveChromePath } from "./resolve_chrome.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const key = ([w, h]) => `${w}x${h}`;

/* ------------------------------------------------------------------ */
/* 1. viewport table                                                    */
/* ------------------------------------------------------------------ */

test("unset CAPTURE_VIEWPORTS keeps the historic default sweep", () => {
  assert.deepEqual(resolveViewports({}).map(key), DEFAULT_VIEWPORTS.map(key));
  assert.deepEqual(resolveViewports({ CAPTURE_VIEWPORTS: "" }).map(key), DEFAULT_VIEWPORTS.map(key));
});

test("the protocol preset exposes the five #494 viewports including both laptops", () => {
  const got = resolveViewports({ CAPTURE_VIEWPORTS: "protocol" }).map(key);
  assert.equal(got.length, 5);
  for (const required of ["390x844", "768x1024", "1366x768", "1363x936", "1440x1000"]) {
    assert.ok(got.includes(required), `protocol preset missing ${required}: ${got}`);
  }
});

test("the two laptop viewports the first-fold contract pins are unreachable by default", () => {
  // The gap #507 closes: the default sweep has neither laptop width, so the
  // preset is the only thing that makes the protocol capturable.
  const fallback = resolveViewports({}).map(key);
  assert.ok(!fallback.includes("1366x768"));
  assert.ok(!fallback.includes("1363x936"));
});

test("presets and explicit pairs mix, in order, without duplicates", () => {
  const got = resolveViewports({ CAPTURE_VIEWPORTS: "protocol,1920x1080,390x844" }).map(key);
  assert.deepEqual(got, [
    "390x844",
    "768x1024",
    "1366x768",
    "1363x936",
    "1440x1000",
    "1920x1080",
  ]);
});

test("an unusable viewport pair is refused, not silently dropped", () => {
  for (const bad of ["1366", "0x768", "widexhigh", "1366x0", "-1x10"]) {
    assert.throws(
      () => resolveViewports({ CAPTURE_VIEWPORTS: bad }),
      /unusable pair/,
      `accepted ${bad}`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* 2. state resolution, isolated and combined                           */
/* ------------------------------------------------------------------ */

test("no capture key set is the default state, byte-identical filenames", () => {
  const state = resolveCaptureState({});
  assert.equal(state.id, "default");
  assert.equal(state.isDefault, true);
  assert.equal(state.suffix, "");
  assert.equal(state.fullPage, false);
  assert.equal(state.javascript, "on");
  assert.equal(state.motion, "system");
  assert.equal(captureFileName({ slug: "home", width: 390, height: 844, state }), "home-390x844.png");
  assert.equal(
    captureFileName({ slug: "conteudos", width: 390, height: 844, state, componentIndex: 1 }),
    "conteudos-component-1-390x844.png",
  );
  assert.equal(manifestFileName(state), "manifest.json");
});

test("CAPTURE_FULLPAGE alone", () => {
  const state = resolveCaptureState({ CAPTURE_FULLPAGE: "1" });
  assert.equal(state.id, "fullpage");
  assert.equal(state.fullPage, true);
  assert.equal(state.javascript, "on");
  assert.equal(state.motion, "system");
  assert.equal(captureFileName({ slug: "home", width: 390, height: 844, state }), "home-390x844--fullpage.png");
  assert.equal(manifestFileName(state), "manifest-fullpage.json");
});

test("CAPTURE_JS=off alone", () => {
  const state = resolveCaptureState({ CAPTURE_JS: "off" });
  assert.equal(state.id, "js-off");
  assert.equal(state.javascript, "off");
  assert.equal(state.fullPage, false);
  assert.equal(state.motion, "system");
  assert.equal(captureFileName({ slug: "home", width: 390, height: 844, state }), "home-390x844--js-off.png");
});

test("CAPTURE_MOTION=reduced alone", () => {
  const state = resolveCaptureState({ CAPTURE_MOTION: "reduced" });
  assert.equal(state.id, "motion-reduced");
  assert.equal(state.motion, "reduced");
  assert.equal(state.fullPage, false);
  assert.equal(state.javascript, "on");
  assert.equal(
    captureFileName({ slug: "home", width: 390, height: 844, state }),
    "home-390x844--motion-reduced.png",
  );
});

test("the three keys combine into one deterministic state id", () => {
  const state = resolveCaptureState({
    CAPTURE_FULLPAGE: "1",
    CAPTURE_JS: "off",
    CAPTURE_MOTION: "reduced",
  });
  assert.equal(state.id, "fullpage_js-off_motion-reduced");
  assert.equal(state.fullPage, true);
  assert.equal(state.javascript, "off");
  assert.equal(state.motion, "reduced");
  assert.equal(manifestFileName(state), "manifest-fullpage_js-off_motion-reduced.json");
});

test("every state pair produces a distinct filename and a distinct manifest", () => {
  const envs = [
    {},
    { CAPTURE_FULLPAGE: "1" },
    { CAPTURE_JS: "off" },
    { CAPTURE_MOTION: "reduced" },
    { CAPTURE_FULLPAGE: "1", CAPTURE_JS: "off" },
    { CAPTURE_FULLPAGE: "1", CAPTURE_MOTION: "reduced" },
    { CAPTURE_JS: "off", CAPTURE_MOTION: "reduced" },
    { CAPTURE_FULLPAGE: "1", CAPTURE_JS: "off", CAPTURE_MOTION: "reduced" },
  ];
  const states = envs.map((env) => resolveCaptureState(env));
  const files = states.map((state) => captureFileName({ slug: "home", width: 390, height: 844, state }));
  const manifests = states.map(manifestFileName);
  assert.equal(new Set(files).size, envs.length, `collision: ${files}`);
  assert.equal(new Set(manifests).size, envs.length, `collision: ${manifests}`);
});

test("off-shaped values turn the keys off rather than on", () => {
  assert.equal(resolveCaptureState({ CAPTURE_FULLPAGE: "0" }).id, "default");
  assert.equal(resolveCaptureState({ CAPTURE_FULLPAGE: "false" }).id, "default");
  assert.equal(resolveCaptureState({ CAPTURE_JS: "on" }).id, "default");
  assert.equal(resolveCaptureState({ CAPTURE_MOTION: "system" }).id, "default");
});

test("a misspelled state value fails closed instead of capturing the wrong state", () => {
  assert.throws(() => resolveCaptureState({ CAPTURE_JS: "disabled" }), /CAPTURE_JS/);
  assert.throws(() => resolveCaptureState({ CAPTURE_MOTION: "reduce" }), /CAPTURE_MOTION/);
  assert.throws(() => resolveCaptureState({ CAPTURE_FULLPAGE: "maybe" }), /CAPTURE_FULLPAGE/);
});

/* ------------------------------------------------------------------ */
/* 3. durable output                                                    */
/* ------------------------------------------------------------------ */

test("a baseline directory under the temp root is refused", () => {
  assert.throws(
    () => assertDurableOutDir(join(tmpdir(), "uiux-baseline"), {}),
    /CAPTURE_OUTPUT_EPHEMERAL/,
  );
  assert.throws(() => assertDurableOutDir("/tmp/baseline", {}), /CAPTURE_OUTPUT_EPHEMERAL/);
});

test("a versioned directory is accepted, and the escape hatch is explicit", () => {
  const durable = join(ROOT, "docs/uiux-evidence/after");
  assert.equal(assertDurableOutDir(durable, {}), resolve(durable));
  assert.equal(
    assertDurableOutDir("/tmp/baseline", { CAPTURE_ALLOW_EPHEMERAL: "1" }),
    resolve("/tmp/baseline"),
  );
});

/* ------------------------------------------------------------------ */
/* 4. manifest shape: SHA, date, route, viewport, state, per-file hash   */
/* ------------------------------------------------------------------ */

test("the manifest carries commit, date, route, viewport, state and a hash per file", () => {
  const dir = mkdtempSync(join(tmpdir(), "capture-manifest-"));
  try {
    const state = resolveCaptureState({ CAPTURE_FULLPAGE: "1", CAPTURE_MOTION: "reduced" });
    const name = captureFileName({ slug: "home", width: 1366, height: 768, state });
    const path = join(dir, name);
    const bytes = Buffer.alloc(32);
    Buffer.from("89504e470d0a1a0a", "hex").copy(bytes);
    bytes.writeUInt32BE(1366, 16);
    bytes.writeUInt32BE(2000, 20);
    writeFileSync(path, bytes);

    const record = captureRecord({
      file: name,
      path,
      route: "/",
      slug: "home",
      width: 1366,
      height: 768,
      state,
      layout: {
        strategy: "content-visibility-visible/v1",
        materialized_elements: 2,
        initial_scroll_height: 2300,
        scroll_height: 2000,
        scroll_height_samples: [2000, 2000, 2000],
        observed_scroll_heights: [2000, 2000, 2000],
        post_screenshot_scroll_height_samples: [2000, 2000, 2000],
      },
    });
    assert.equal(record.file, "home-1366x768--fullpage_motion-reduced.png");
    assert.equal(record.route, "/");
    assert.equal(record.viewport, "1366x768");
    assert.equal(record.width, 1366);
    assert.equal(record.height, 768);
    assert.equal(record.kind, "page");
    assert.equal(record.state, "fullpage_motion-reduced");
    assert.equal(record.fullpage, true);
    assert.equal(record.javascript, "on");
    assert.equal(record.motion, "reduced");
    assert.equal(record.bytes, bytes.length);
    assert.equal(record.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(record.sha256, sha256OfFile(path));

    const componentPath = join(dir, "conteudos-component-1-1366x768--fullpage_motion-reduced.png");
    writeFileSync(componentPath, Buffer.from("component"));
    const componentRecord = captureRecord({
      file: "conteudos-component-1-1366x768--fullpage_motion-reduced.png",
      path: componentPath,
      route: "/conteudos/",
      slug: "conteudos",
      width: 1366,
      height: 768,
      state,
      selector: ".content-directory-item",
      componentIndex: 1,
    });
    assert.equal(componentRecord.kind, "component");
    assert.equal(componentRecord.selector, ".content-directory-item");
    assert.equal(componentRecord.component_index, 1);

    const manifest = buildManifest({
      capturedAt: "2026-08-30T12:00:00.000Z",
      commitSha: "b4cafc4fe0a005c3769a7b6acde882ff1f9d65d8",
      treeDirty: false,
      baseUrl: "http://127.0.0.1:8792",
      outputDir: "docs/uiux-evidence/after",
      routes: ["/", "/conteudos/"],
      viewports: resolveViewports({ CAPTURE_VIEWPORTS: "protocol" }),
      state,
      captures: [record, componentRecord],
      browserVersion: "Chrome/140.0.0.0",
    });

    assert.equal(manifest.schema_version, MANIFEST_SCHEMA_VERSION);
    assert.equal(manifest.captured_at, "2026-08-30T12:00:00.000Z");
    assert.equal(manifest.commit_sha, "b4cafc4fe0a005c3769a7b6acde882ff1f9d65d8");
    assert.equal(manifest.tree_dirty, false);
    assert.equal(manifest.capture_runtime.browser_version, "Chrome/140.0.0.0");
    assert.equal(
      manifest.capture_runtime.fullpage_preparation.strategy,
      "content-visibility-visible/v1",
    );
    assert.equal(manifest.output_dir, "docs/uiux-evidence/after");
    assert.deepEqual(manifest.routes, ["/", "/conteudos/"]);
    assert.deepEqual(manifest.viewports, [
      "390x844",
      "768x1024",
      "1366x768",
      "1363x936",
      "1440x1000",
    ]);
    assert.deepEqual(manifest.state, {
      id: "fullpage_motion-reduced",
      fullpage: true,
      javascript: "on",
      motion: "reduced",
    });
    // Back-compat: the flat file list the previous manifest exposed.
    assert.deepEqual(manifest.files, [record.file, componentRecord.file]);
    assert.equal(manifest.captures.length, 2);
    assert.equal(manifest.captures[0].layout.scroll_height, 2000);
    for (const entry of manifest.captures) {
      assert.match(entry.sha256, /^[0-9a-f]{64}$/);
      assert.ok(entry.route && entry.viewport && entry.state);
    }
    // The manifest must round-trip as JSON; it is the durable artifact.
    assert.deepEqual(JSON.parse(JSON.stringify(manifest)), manifest);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("full-page records fail closed without stable layout evidence", () => {
  const state = resolveCaptureState({ CAPTURE_FULLPAGE: "1" });
  const base = {
    file: "probe.png",
    path: "/does/not/need/to/exist.png",
    route: "/",
    slug: "home",
    width: 400,
    height: 300,
    state,
  };
  assert.throws(() => captureRecord(base), /CAPTURE_LAYOUT_EVIDENCE_MISSING/);
  assert.throws(
    () => captureRecord({
      ...base,
      layout: {
        strategy: "content-visibility-visible/v1",
        materialized_elements: 1,
        scroll_height: 1200,
        scroll_height_samples: [1200, 1201, 1200],
        post_screenshot_scroll_height_samples: [1200, 1200, 1200],
      },
    }),
    /CAPTURE_LAYOUT_EVIDENCE_UNSTABLE/,
  );
});

test("a manifest refuses to omit the browser version", () => {
  assert.throws(
    () => buildManifest({
      capturedAt: "2026-08-31T12:00:00.000Z",
      commitSha: "81c600b7c26dcc606d3a03e648ecd9820d9c1c37",
      treeDirty: false,
      baseUrl: "http://127.0.0.1:8792",
      outputDir: "docs/uiux-evidence/after",
      routes: ["/"],
      viewports: [[400, 300]],
      state: resolveCaptureState({}),
      captures: [],
    }),
    /CAPTURE_BROWSER_VERSION_MISSING/,
  );
});

test("the versioned #540 report proves the measured before/after contract", () => {
  const report = JSON.parse(readFileSync(
    join(ROOT, "docs/evidence/issue-540-fullpage-capture/report.json"),
    "utf8",
  ));
  assert.equal(report.issue, 540);
  assert.equal(report.before.commit_sha, "81c600b7c26dcc606d3a03e648ecd9820d9c1c37");
  assert.equal(report.before.fresh_run_scroll_height_instability_reproduced, false);
  assert.equal(report.before.materialization_path_scroll_height_instability_reproduced, true);
  assert.ok(Math.max(...report.before.largest_near_white_bands_px) > 128);
  assert.ok(Math.max(...report.after.largest_near_white_bands_px) <= 128);
  assert.equal(new Set(report.after.stable_scroll_heights).size, 1);
  assert.equal(new Set(report.after.png_heights).size, 1);
  assert.equal(new Set(report.after.png_sha256).size, 1);
  assert.equal(report.after.manifest_tree_dirty, false);
  assert.equal(report.acceptance.public_css_or_html_changed, false);
  assert.equal(report.historical_comparability.directly_comparable, false);
});

/* ------------------------------------------------------------------ */
/* 5. browser-backed: each state changes what Chrome actually renders    */
/* ------------------------------------------------------------------ */

const browserRequired = process.env.CAPTURE_BROWSER_REQUIRED === "1" || Boolean(process.env.CI);
let chromePath = null;
let chromeError = "";
try {
  chromePath = resolveChromePath();
} catch (error) {
  chromeError = String(error?.message || error).slice(0, 200);
}

test("a Chrome binary is available when the browser layer is required", { skip: !browserRequired }, () => {
  assert.ok(chromePath, `CAPTURE_BROWSER_UNAVAILABLE ${chromeError}`);
});

const skipBrowser = chromePath ? false : `CAPTURE_BROWSER_UNAVAILABLE ${chromeError}`;

const FIXTURE = `<!doctype html><html><head><style>
  body { margin: 0; background: #fff; }
  #probe { color: rgb(9, 8, 7); }
  @media (prefers-reduced-motion: reduce) { #probe { color: rgb(1, 2, 3); } }
  .below-fold { content-visibility: auto; contain-intrinsic-size: 900px; }
  .below-fold > div { height: 400px; background: #eee; }
</style></head><body>
  <p id="js-state">no-js</p>
  <p id="probe">motion probe</p>
  <section class="below-fold"><div>one</div></section>
  <section class="below-fold"><div>two</div></section>
  <section class="below-fold"><div>three</div></section>
  <section class="below-fold"><div>four</div></section>
  <section class="below-fold"><div>five</div></section>
  <script>document.getElementById('js-state').textContent = 'js-ran';</script>
</body></html>`;

const pngHeight = (buffer) => buffer.readUInt32BE(20);

function largestNearWhiteBand(buffer) {
  assert.equal(buffer[24], 8, "fixture screenshot must be 8-bit PNG");
  assert.equal(buffer[25], 2, "fixture screenshot must be RGB PNG");
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const idat = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const name = buffer.toString("ascii", offset + 4, offset + 8);
    if (name === "IDAT") idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bytesPerPixel = 3;
  const stride = width * bytesPerPixel;
  let position = 0;
  let previous = Buffer.alloc(stride);
  let largest = 0;
  let current = 0;
  const paeth = (left, above, upperLeft) => {
    const estimate = left + above - upperLeft;
    const leftDistance = Math.abs(estimate - left);
    const aboveDistance = Math.abs(estimate - above);
    const upperLeftDistance = Math.abs(estimate - upperLeft);
    if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
    return aboveDistance <= upperLeftDistance ? above : upperLeft;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[position];
    position += 1;
    const scanline = raw.subarray(position, position + stride);
    position += stride;
    const row = Buffer.allocUnsafe(stride);
    let nearWhitePixels = 0;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const above = previous[x];
      const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      const predictor = filter === 0
        ? 0
        : filter === 1
          ? left
          : filter === 2
            ? above
            : filter === 3
              ? Math.floor((left + above) / 2)
              : paeth(left, above, upperLeft);
      row[x] = (scanline[x] + predictor) & 0xff;
    }
    for (let x = 0; x < stride; x += bytesPerPixel) {
      if (row[x] >= 250 && row[x + 1] >= 250 && row[x + 2] >= 250) nearWhitePixels += 1;
    }
    current = nearWhitePixels / width >= 0.995 ? current + 1 : 0;
    largest = Math.max(largest, current);
    previous = row;
  }
  return largest;
}

// One browser for the whole file; a fresh page per state so no emulation leaks
// from one state into the next.
let sharedBrowser = null;

async function renderUnder(env) {
  const state = resolveCaptureState(env);
  if (!sharedBrowser) {
    const { default: puppeteer } = await import("puppeteer-core");
    sharedBrowser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu"],
    });
  }
  const page = await sharedBrowser.newPage();
  try {
    await applyCaptureState(page, state);
    await page.setViewport({ width: 400, height: 300, deviceScaleFactor: 1 });
    await page.setContent(FIXTURE, { waitUntil: "networkidle0" });
    let layout = await prepareFullPageCapture(page, state);
    const shot = await page.screenshot({ fullPage: state.fullPage });
    layout = await verifyFullPageCapture(page, state, layout);
    const jsState = await page.evaluate(() => document.getElementById("js-state").textContent);
    const probeColor = await page.evaluate(
      () => getComputedStyle(document.getElementById("probe")).color,
    );
    return {
      state,
      height: pngHeight(shot),
      largestNearWhiteBand: state.fullPage ? largestNearWhiteBand(shot) : null,
      jsState,
      probeColor,
      layout,
    };
  } finally {
    await page.close();
  }
}

test.after(async () => {
  if (sharedBrowser) await sharedBrowser.close();
});

test("default state renders first fold, JS on, motion as reported", { skip: skipBrowser }, async () => {
  const got = await renderUnder({});
  assert.equal(got.height, 300);
  assert.equal(got.jsState, "js-ran");
  assert.equal(got.probeColor, "rgb(9, 8, 7)");
});

test("CAPTURE_FULLPAGE=1 captures below the fold", { skip: skipBrowser }, async () => {
  const got = await renderUnder({ CAPTURE_FULLPAGE: "1" });
  assert.ok(got.height > 1500, `expected a full-document capture, got ${got.height}px`);
  assert.equal(got.layout.strategy, "content-visibility-visible/v1");
  assert.equal(got.layout.materialized_elements, 5);
  assert.equal(new Set(got.layout.scroll_height_samples).size, 1);
  assert.equal(got.height, got.layout.scroll_height);
  assert.ok(
    got.largestNearWhiteBand <= 128,
    `artificial near-white band is ${got.largestNearWhiteBand}px`,
  );
  assert.deepEqual(
    got.layout.post_screenshot_scroll_height_samples,
    got.layout.scroll_height_samples,
  );
  assert.equal(got.jsState, "js-ran");
  assert.equal(got.probeColor, "rgb(9, 8, 7)");
});

test("consecutive full-page preparations converge to the same geometry", { skip: skipBrowser }, async () => {
  const first = await renderUnder({ CAPTURE_FULLPAGE: "1" });
  const second = await renderUnder({ CAPTURE_FULLPAGE: "1" });
  assert.equal(first.layout.scroll_height, second.layout.scroll_height);
  assert.equal(first.height, second.height);
  assert.deepEqual(first.layout.scroll_height_samples, second.layout.scroll_height_samples);
});

test("CAPTURE_JS=off renders the no-script state", { skip: skipBrowser }, async () => {
  const got = await renderUnder({ CAPTURE_JS: "off" });
  assert.equal(got.jsState, "no-js");
  assert.equal(got.height, 300);
});

test("CAPTURE_MOTION=reduced renders the reduced-motion state", { skip: skipBrowser }, async () => {
  const got = await renderUnder({ CAPTURE_MOTION: "reduced" });
  assert.equal(got.probeColor, "rgb(1, 2, 3)");
  assert.equal(got.jsState, "js-ran");
  assert.equal(got.height, 300);
});

test("the three states combine in one render", { skip: skipBrowser }, async () => {
  const got = await renderUnder({
    CAPTURE_FULLPAGE: "1",
    CAPTURE_JS: "off",
    CAPTURE_MOTION: "reduced",
  });
  assert.equal(got.state.id, "fullpage_js-off_motion-reduced");
  assert.ok(got.height > 1500, `expected a full-document capture, got ${got.height}px`);
  assert.equal(got.layout.strategy, "content-visibility-visible/v1");
  assert.equal(new Set(got.layout.scroll_height_samples).size, 1);
  assert.equal(got.jsState, "no-js");
  assert.equal(got.probeColor, "rgb(1, 2, 3)");
});
