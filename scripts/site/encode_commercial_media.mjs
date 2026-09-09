// Encode reviewed imagegen masters for the existing 1200x630 sharing slots.
// This changes size/encoding only; all image content is in the versioned PNG.
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import puppeteer from "puppeteer-core";

const root = path.resolve(new URL("../..", import.meta.url).pathname);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "data/site/commercial-media/source.json")));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  for (const asset of manifest.assets) {
    const source = fs.readFileSync(path.join(root, asset.source));
    const encoded = await page.evaluate(async (url) => {
      const img = new Image(); img.src = url; await img.decode();
      const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 630;
      canvas.getContext("2d").drawImage(img, 0, 0, 1200, 630);
      return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
    }, `data:image/png;base64,${source.toString("base64")}`);
    const output = Buffer.from(encoded, "base64");
    fs.writeFileSync(path.join(root, asset.target), output);
    console.log(JSON.stringify({ target: asset.target, bytes: output.length, sha256: createHash("sha256").update(output).digest("hex") }));
  }
} finally { await browser.close(); }
