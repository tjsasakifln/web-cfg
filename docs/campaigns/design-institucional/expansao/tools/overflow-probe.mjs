import puppeteer from "puppeteer-core";
import { resolveChromePath } from "../../../../../scripts/site/resolve_chrome.mjs";
const url = process.argv[2]; const w = Number(process.argv[3] || 320);
const b = await puppeteer.launch({ executablePath: resolveChromePath(), headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: w, height: 700 });
await p.goto(url, { waitUntil: "networkidle0" });
const r = await p.evaluate(() => {
  const vw = document.documentElement.clientWidth; const out = [];
  document.querySelectorAll("body *").forEach((el) => { const r = el.getBoundingClientRect(); if (r.right > vw + 1 && r.width > 0) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join(".")}#${el.id} right=${Math.round(r.right)} w=${Math.round(r.width)}`); });
  return { sw: document.documentElement.scrollWidth, vw, out: out.slice(0, 12) };
});
console.log(JSON.stringify(r, null, 1)); await b.close();
