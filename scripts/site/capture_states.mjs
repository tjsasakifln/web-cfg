/**
 * Capture states, viewport table and evidence manifest for the headless harness.
 *
 * The screenshot harness used to be able to record exactly one state: first
 * fold, JavaScript on, motion as the machine reports it. Three states the
 * public contracts already promise were therefore unprovable — the full page
 * below the fold, the JavaScript-off journey, and `prefers-reduced-motion`.
 *
 * Every knob here is additive and read from the environment, so a run with no
 * capture variables set produces byte-identical filenames and the same
 * `manifest.json` name it produced before:
 *
 *   CAPTURE_FULLPAGE=1        capture the whole document, not the first fold
 *   CAPTURE_JS=off            render with script execution disabled
 *   CAPTURE_MOTION=reduced    render under prefers-reduced-motion: reduce
 *
 * They combine. A run with all three writes `home-390x844--fullpage_js-off_
 * motion-reduced.png`, so one directory can hold the whole matrix without a
 * state overwriting another state's evidence.
 */
import { createHash } from "crypto";
import { readFileSync, realpathSync, statSync } from "fs";
import { tmpdir } from "os";
import { resolve, sep } from "path";

/** The sweep the harness has always run when CAPTURE_VIEWPORTS is unset. */
export const DEFAULT_VIEWPORTS = Object.freeze([
  [320, 568],
  [360, 800],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1440, 1000],
  [1920, 1080],
].map((pair) => Object.freeze(pair)));

/**
 * The five viewports the #494 design-direction protocol compares on.
 *
 * Three come from the protocol itself (mobile, tablet, desktop). The two
 * laptop widths come from the first-fold contract, which pins 1366x768 and the
 * observed 1363x936 in tests/commercial/test_first_fold_contract.mjs. The
 * default sweep contains neither, so before this preset the protocol could not
 * be captured at all.
 */
export const PROTOCOL_VIEWPORTS = Object.freeze([
  [390, 844],
  [768, 1024],
  [1366, 768],
  [1363, 936],
  [1440, 1000],
].map((pair) => Object.freeze(pair)));

export const VIEWPORT_PRESETS = Object.freeze({
  default: DEFAULT_VIEWPORTS,
  protocol: PROTOCOL_VIEWPORTS,
});

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["", "0", "false", "no", "off"]);

function parseFlag(raw, name) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (TRUTHY.has(value)) return true;
  if (FALSY.has(value)) return false;
  throw new Error(`${name} accepts only 1/0 (true/false, yes/no, on/off): ${value}`);
}

function parsePair(token) {
  const match = /^(\d+)\s*[xX]\s*(\d+)$/.exec(token);
  const width = match ? Number.parseInt(match[1], 10) : Number.NaN;
  const height = match ? Number.parseInt(match[2], 10) : Number.NaN;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`CAPTURE_VIEWPORTS holds an unusable pair: ${token}`);
  }
  return [width, height];
}

/**
 * Resolve the viewport table from CAPTURE_VIEWPORTS.
 *
 * Accepts explicit `WxH` pairs, the preset names in VIEWPORT_PRESETS, and any
 * mix of the two (`protocol,1920x1080`). Order is preserved and duplicates are
 * dropped so a preset plus an overlapping pair does not capture twice.
 */
export function resolveViewports(env = process.env) {
  const tokens = String(env.CAPTURE_VIEWPORTS || "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) return DEFAULT_VIEWPORTS.map(([w, h]) => [w, h]);
  const out = [];
  const seen = new Set();
  for (const token of tokens) {
    const preset = VIEWPORT_PRESETS[token.toLowerCase()];
    const pairs = preset ? preset.map(([w, h]) => [w, h]) : [parsePair(token)];
    for (const [width, height] of pairs) {
      const key = `${width}x${height}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([width, height]);
    }
  }
  return out;
}

/**
 * Resolve the render state from CAPTURE_FULLPAGE / CAPTURE_JS / CAPTURE_MOTION.
 *
 * With none of them set the state is `default`, and `suffix` is empty so the
 * filenames are exactly the ones the harness wrote before these keys existed.
 */
export function resolveCaptureState(env = process.env) {
  const fullPage = parseFlag(env.CAPTURE_FULLPAGE, "CAPTURE_FULLPAGE");

  const jsRaw = String(env.CAPTURE_JS ?? "").trim().toLowerCase();
  if (jsRaw && jsRaw !== "on" && jsRaw !== "off") {
    throw new Error(`CAPTURE_JS accepts only "on" or "off": ${jsRaw}`);
  }
  const javascript = jsRaw === "off" ? "off" : "on";

  const motionRaw = String(env.CAPTURE_MOTION ?? "").trim().toLowerCase();
  if (motionRaw && motionRaw !== "system" && motionRaw !== "reduced") {
    throw new Error(`CAPTURE_MOTION accepts only "system" or "reduced": ${motionRaw}`);
  }
  const motion = motionRaw === "reduced" ? "reduced" : "system";

  const parts = [];
  if (fullPage) parts.push("fullpage");
  if (javascript === "off") parts.push("js-off");
  if (motion === "reduced") parts.push("motion-reduced");
  const id = parts.length ? parts.join("_") : "default";
  return Object.freeze({
    id,
    isDefault: parts.length === 0,
    suffix: parts.length ? `--${id}` : "",
    fullPage,
    javascript,
    motion,
  });
}

/** Page screenshot filename. Identical to the historic name in the default state. */
export function captureFileName({ slug, width, height, state, componentIndex = null }) {
  const stem = componentIndex === null
    ? `${slug}-${width}x${height}`
    : `${slug}-component-${componentIndex}-${width}x${height}`;
  return `${stem}${state.suffix}.png`;
}

/** One manifest per state, so a matrix run does not overwrite its own evidence. */
export function manifestFileName(state) {
  return state.isDefault ? "manifest.json" : `manifest-${state.id}.json`;
}

const EPHEMERAL_ROOTS = ["/tmp", "/var/tmp", "/dev/shm"];

function ephemeralRoots() {
  const roots = new Set(EPHEMERAL_ROOTS);
  try {
    roots.add(realpathSync(tmpdir()));
  } catch {
    roots.add(tmpdir());
  }
  return [...roots].filter(Boolean).map((root) => resolve(root));
}

/**
 * A baseline that lives in the temp directory is not a baseline.
 *
 * #494 recorded exactly that failure: the comparison baseline sat in /tmp and
 * was gone before the comparison. Refuse the ephemeral roots unless a caller
 * says out loud that this run is throwaway.
 */
export function assertDurableOutDir(outDir, env = process.env) {
  const target = resolve(outDir);
  if (parseFlag(env.CAPTURE_ALLOW_EPHEMERAL, "CAPTURE_ALLOW_EPHEMERAL")) return target;
  for (const root of ephemeralRoots()) {
    if (target === root || target.startsWith(root + sep)) {
      throw new Error(
        `CAPTURE_OUTPUT_EPHEMERAL: ${target} is under ${root}; evidence written there is gone `
          + "before it can be compared. Pass a versioned directory, or set "
          + "CAPTURE_ALLOW_EPHEMERAL=1 to accept a throwaway run.",
      );
    }
  }
  return target;
}

/**
 * Put one Puppeteer page into the requested state before navigation.
 *
 * `page.evaluate` keeps working with script execution disabled, so the capture
 * scaffolding (scroll behaviour, disclosure opening, chrome hiding) still runs
 * in the JS-off state while the page's own scripts stay inert — which is the
 * state the JS-off promise is actually about.
 */
export async function applyCaptureState(page, state) {
  await page.setJavaScriptEnabled(state.javascript !== "off");
  await page.emulateMediaFeatures(
    state.motion === "reduced" ? [{ name: "prefers-reduced-motion", value: "reduce" }] : [],
  );
}

export function sha256OfFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Describe one written file for the manifest: route, viewport, state and hash. */
export function captureRecord({ file, path, route, slug, width, height, state, selector = null, componentIndex = null }) {
  return {
    file,
    route,
    slug,
    viewport: `${width}x${height}`,
    width,
    height,
    kind: componentIndex === null ? "page" : "component",
    ...(componentIndex === null ? {} : { component_index: componentIndex, selector }),
    state: state.id,
    fullpage: state.fullPage,
    javascript: state.javascript,
    motion: state.motion,
    bytes: statSync(path).size,
    sha256: sha256OfFile(path),
  };
}

export const MANIFEST_SCHEMA_VERSION = "2.0.0";

/**
 * The durable manifest: which commit, which day, which route, which viewport,
 * which state, and the hash of every file the run produced.
 */
export function buildManifest({
  capturedAt,
  commitSha,
  treeDirty,
  baseUrl,
  outputDir,
  routes,
  viewports,
  state,
  captures,
}) {
  return {
    schema_version: MANIFEST_SCHEMA_VERSION,
    captured_at: capturedAt,
    commit_sha: commitSha,
    tree_dirty: Boolean(treeDirty),
    base_url: baseUrl,
    output_dir: outputDir,
    state: {
      id: state.id,
      fullpage: state.fullPage,
      javascript: state.javascript,
      motion: state.motion,
    },
    routes: [...routes],
    viewports: viewports.map(([w, h]) => `${w}x${h}`),
    files: captures.map((entry) => entry.file),
    captures,
  };
}
