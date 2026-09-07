/**
 * Resolve a Chrome/Chromium binary for puppeteer-core.
 * Prefers CHROME_PATH, then system browsers, then Playwright's cache.
 */
import { accessSync, constants, existsSync, readdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const NAMED = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/snap/bin/chromium",
];

function walkChrome(dir, depth = 0) {
  if (!dir || depth > 5 || !existsSync(dir)) return null;
  const linux = join(dir, "chrome-linux64", "chrome");
  const linuxOld = join(dir, "chrome-linux", "chrome");
  if (existsSync(linux)) return linux;
  if (existsSync(linuxOld)) return linuxOld;
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of names) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const hit = walkChrome(join(dir, name), depth + 1);
    if (hit) return hit;
  }
  return null;
}

let announced = "";

/** Record the binary a harness actually launched, once per process. */
function announce(path, source) {
  if (announced === path) return path;
  announced = path;
  // Which browser ran is evidence, not noise: site-ci resolves CHROME_PATH from
  // an unpinned setup-chrome and a later step installs a second Chromium, so a
  // failure is only reproducible if the log says which binary produced it.
  process.stderr.write(`chrome_resolved source=${source} path=${path}\n`);
  return path;
}

/**
 * An explicitly configured browser that cannot be launched is a configuration
 * error, not a reason to quietly run a different browser. Silently falling
 * through here made the binary under test depend on filesystem state: the same
 * commit could be measured on setup-chrome's Chrome or on the Playwright cache's
 * Chromium, and nothing in the log said which. CI fails closed; elsewhere the
 * fallback still happens but says so.
 */
function failConfigured(path, why) {
  const message = `CHROME_UNAVAILABLE chrome_configured_but_unusable: CHROME_PATH=${path} ${why}`;
  if (process.env.CI) throw new Error(message);
  process.stderr.write(`${message}; falling back to a discovered browser\n`);
}

export function resolveChromePath() {
  const env = String(process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || "").trim();
  if (env) {
    if (existsSync(env)) {
      try {
        accessSync(env, constants.X_OK);
        return announce(env, "env");
      } catch {
        failConfigured(env, "is not executable");
      }
    }
    failConfigured(env, "does not exist");
  }
  for (const p of NAMED) {
    if (existsSync(p)) return announce(p, "system");
  }
  const home = homedir();
  const cached =
    walkChrome(join(home, ".cache", "ms-playwright")) ||
    walkChrome(join(home, ".cache", "puppeteer"));
  if (cached) return announce(cached, "cache");
  throw new Error(
    "chrome_not_found: install Chromium (`npx playwright install chromium`) or set CHROME_PATH",
  );
}
