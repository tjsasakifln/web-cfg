import lighthouse from "lighthouse";
import { launch as launchChrome } from "chrome-launcher";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const BASE = "http://127.0.0.1:8765";
const CHROME_PATH = process.env.CHROME_PATH;

async function run(path, run) {
  const profileDir = mkdtempSync(join(tmpdir(), "confenge-lh-confianca-"));
  let chrome = null;
  try {
    chrome = await launchChrome({
      chromePath: CHROME_PATH,
      chromeFlags: [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        `--user-data-dir=${profileDir}`,
      ],
    });
    const url = `${BASE}${path}`;
    const runnerResult = await lighthouse(url, {
      port: chrome.port,
      hostname: "127.0.0.1",
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      formFactor: "mobile",
      screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2, disabled: false },
      maxWaitForLoad: 45000,
    });
    const cats = runnerResult.lhr.categories || {};
    const audits = runnerResult.lhr.audits || {};
    console.log(JSON.stringify({
      path, run,
      performance: Math.round((cats.performance?.score || 0) * 100),
      accessibility: Math.round((cats.accessibility?.score || 0) * 100),
      best_practices: Math.round((cats["best-practices"]?.score || 0) * 100),
      seo: Math.round((cats.seo?.score || 0) * 100),
      lcp_ms: audits["largest-contentful-paint"]?.numericValue,
      cls: audits["cumulative-layout-shift"]?.numericValue,
      tbt_ms: audits["total-blocking-time"]?.numericValue,
    }));
  } finally {
    if (chrome) await chrome.kill();
    rmSync(profileDir, { recursive: true, force: true });
  }
}

for (let i = 1; i <= 3; i++) {
  await run("/confianca/", i);
}
