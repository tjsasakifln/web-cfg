#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const HOST = "confenge.com.br";
export const ENDPOINT = "https://api.indexnow.org/indexnow";
export const KEY_PATH = path.join(ROOT, ".well-known", "indexnow-key.txt");

export function normalizeUrls(values) {
  const urls = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
  if (!urls.length) throw new Error("at least one changed canonical URL is required");
  if (urls.length > 10_000) throw new Error("IndexNow allows at most 10,000 URLs per request");
  for (const value of urls) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== HOST || url.search || url.hash) {
      throw new Error(`URL must be a parameter-free canonical HTTPS URL on ${HOST}: ${value}`);
    }
  }
  return urls;
}

export function buildPayload(values, key) {
  const cleanKey = String(key || "").trim();
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(cleanKey)) throw new Error("invalid IndexNow key");
  return {
    host: HOST,
    key: cleanKey,
    keyLocation: `https://${HOST}/${cleanKey}.txt`,
    urlList: normalizeUrls(values),
  };
}

export async function submitIndexNow(values, options = {}) {
  const key = options.key || fs.readFileSync(KEY_PATH, "utf8").trim();
  const payload = buildPayload(values, key);
  if (options.dryRun) return { ok: true, dry_run: true, payload };

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (![200, 202].includes(response.status)) {
    throw new Error(`IndexNow rejected the request (${response.status}): ${body.slice(0, 500)}`);
  }
  return { ok: true, dry_run: false, status: response.status, submitted: payload.urlList.length };
}

async function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const urls = argv.filter((value) => value !== "--dry-run");
  const result = await submitIndexNow(urls, { dryRun });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`INDEXNOW_ERROR ${error.message}\n`);
    process.exitCode = 1;
  });
}
