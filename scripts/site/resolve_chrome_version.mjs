import { PUPPETEER_REVISIONS } from "puppeteer-core";

const version = PUPPETEER_REVISIONS.chrome;

if (typeof version !== "string" || !/^\d+\.\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Unsupported Puppeteer Chrome revision: ${String(version)}`);
}

console.log(`version=${version}`);
