import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hub = readFileSync(resolve(ROOT, "conteudos/index.html"), "utf8");

function robotsOf(html) {
  const m =
    html.match(/name=["']robots["'][^>]*content=["']([^"']+)/i) ||
    html.match(/content=["']([^"']+)["'][^>]*name=["']robots["']/i);
  return (m ? m[1] : "MISSING").toLowerCase();
}

function countIndexableConteudos() {
  const folder = resolve(ROOT, "conteudos");
  let count = 0;
  for (const name of readdirSync(folder)) {
    const path = join(folder, name, "index.html");
    if (!existsSync(path)) continue;
    const robots = robotsOf(readFileSync(path, "utf8"));
    if (!robots.includes("noindex")) count += 1;
  }
  return count;
}

const expected = countIndexableConteudos();
let fail = 0;
function ok(n, c, d = "") {
  if (c) console.log("PASS", n);
  else {
    console.error("FAIL", n, d);
    fail += 1;
  }
}

ok("no_corrupted_p_R", !/<p R\s/i.test(hub));
ok(
  `has_content_lead_${expected}`,
  new RegExp(`class="content-lead">\\s*${expected} guias indexáveis`).test(hub),
  `expected ${expected} guias indexáveis in content-lead`,
);
ok("no_datalake", !/datalake/i.test(hub));
ok("no_false_evergreen_intel", !/publica páginas evergreen com agregados/i.test(hub));
ok("no_120_guias", !/120\s*guias/i.test(hub));
ok(
  `numberOfItems_${expected}`,
  new RegExp(`"numberOfItems"\\s*:\\s*${expected}`).test(hub),
  `expected numberOfItems ${expected}`,
);
ok("points_to_tools_or_radar", /\/ferramentas\/|\/radar\/nacional/.test(hub));
// remediate must not use partial class= capture
const rem = readFileSync(resolve(ROOT, "scripts/site/inbound_first_remediate.py"), "utf8");
ok("remediate_no_partial_attr_regex", !/\(class="content-lead">\)\(\[\^<\]\+\)/.test(rem));
ok(
  "remediate_whole_lead_paragraph",
  /content-lead">\[\^<\]\*/.test(rem) ||
    /content-lead">\[/.test(rem) ||
    'content-lead">[^<]*</p>' in rem,
);
if (fail) process.exit(1);
console.log("ALL hub truth checks passed", { expected_indexable: expected });
