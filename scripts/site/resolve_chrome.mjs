/**
 * Resolve a Chrome/Chromium binary for puppeteer-core.
 * Prefers CHROME_PATH, then system browsers, then Playwright's cache.
 */
import { existsSync, readdirSync } from "fs";
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

export function resolveChromePath() {
  const env = String(process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || "").trim();
  if (env && existsSync(env)) return env;
  for (const p of NAMED) {
    if (existsSync(p)) return p;
  }
  const home = homedir();
  const cached =
    walkChrome(join(home, ".cache", "ms-playwright")) ||
    walkChrome(join(home, ".cache", "puppeteer"));
  if (cached) return cached;
  throw new Error(
    "chrome_not_found: install Chromium (`npx playwright install chromium`) or set CHROME_PATH",
  );
}
