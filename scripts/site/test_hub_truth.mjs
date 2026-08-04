import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hub = readFileSync(resolve(ROOT, "conteudos/index.html"), "utf8");
let fail = 0;
function ok(n, c, d=""){ if(c) console.log("PASS",n); else { console.error("FAIL",n,d); fail++; } }
ok("no_corrupted_p_R", !/<p R\s/i.test(hub));
ok("has_content_lead_22", /class="content-lead">\s*22 guias indexáveis/.test(hub));
ok("no_datalake", !/datalake/i.test(hub));
ok("no_false_evergreen_intel", !/publica páginas evergreen com agregados/i.test(hub));
ok("no_120_guias", !/120\s*guias/i.test(hub));
ok("numberOfItems_22", /"numberOfItems"\s*:\s*22/.test(hub));
ok("points_to_tools_or_radar", /\/ferramentas\/|\/radar\/nacional/.test(hub));
// remediate must not use partial class= capture
const rem = readFileSync(resolve(ROOT, "scripts/site/inbound_first_remediate.py"), "utf8");
ok("remediate_no_partial_attr_regex", !/\(class="content-lead">\)\(\[\^<\]\+\)/.test(rem));
ok("remediate_whole_lead_paragraph", /content-lead">\[\^<\]\*/.test(rem) || /content-lead">\[/.test(rem) || "content-lead\">[^<]*</p>" in rem);
if (fail) process.exit(1);
console.log("ALL hub truth checks passed");
