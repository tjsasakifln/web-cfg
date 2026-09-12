/**
 * Real-tree mutations. Each case copies shipped files, changes bytes, and
 * invokes the same POS-09 gate command. A fabricated summary object is not
 * this gate.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CSVS, CSV_DIR, DEMO_PAGE, EXCERPT_ITEM_ID, GENERIC_HUB, KITS_JSON, ORCAMENTO_PAGE, PRONTIDAO_PAGE, SLIM_COPY_PATHS } from "./matrix.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const suiteRepo = path.resolve(here, "../../../..");
const runner = path.join(here, "run.mjs");
const posManifest = path.join(here, "fixtures/pos-manifest.json");

function copySlim(srcRoot, destRoot) {
  fs.mkdirSync(destRoot, { recursive: true });
  for (const rel of SLIM_COPY_PATHS) {
    const from = path.join(srcRoot, rel);
    if (!fs.existsSync(from)) continue;
    const to = path.join(destRoot, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
  }
}

function runGate(root, reportPath, port) {
  const result = spawnSync(
    process.execPath,
    [
      runner,
      "--strict-release",
      "--examined-kind",
      "candidate",
      "--manifest",
      posManifest,
      "--root",
      root,
      "--report",
      reportPath,
      "--http-port",
      String(port),
    ],
    {
      cwd: suiteRepo,
      encoding: "utf8",
      timeout: 120000,
      env: {
        ...process.env,
        NODE_ENV: "test",
        LEAD_STORE_DIR: path.join(root, ".lead-store"),
        POS09_HTTP_PORT: String(port),
      },
    },
  );
  fs.writeFileSync(`${reportPath}.stdout.log`, result.stdout || "");
  fs.writeFileSync(`${reportPath}.stderr.log`, result.stderr || "");
  let report = null;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch {
    report = null;
  }
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    report,
    reportExit: report?.summary?.exit_code ?? null,
  };
}

function rowStatus(report, id) {
  return (report?.results || []).find((r) => r.id === id)?.status || null;
}

function mutationRow(id, { controlPass, mutationDetected, detail, processExit, reportExit }) {
  return {
    id,
    control: controlPass ? "pass" : "fail",
    mutation: mutationDetected ? "fail" : "pass",
    detected: Boolean(mutationDetected),
    process_exit: processExit,
    report_exit: reportExit,
    exit_code_matches_process: processExit === reportExit,
    detail,
  };
}

export async function runMutations(srcRoot, options = {}) {
  const scratch = options.scratch || process.env.POS09_SCRATCH || path.join(os.tmpdir(), "pos09-mutations");
  fs.mkdirSync(scratch, { recursive: true });
  const reportsDir = path.join(scratch, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const controlDir = path.join(scratch, "control");
  fs.rmSync(controlDir, { recursive: true, force: true });
  copySlim(srcRoot, controlDir);
  let port = Number(process.env.POS09_MUTATION_PORT || 18101);
  const controlReport = path.join(reportsDir, "control.json");
  const control = runGate(controlDir, controlReport, port);
  port += 1;
  const rows = [];

  function mutate(id, apply, probe) {
    const dir = path.join(scratch, id);
    fs.rmSync(dir, { recursive: true, force: true });
    copySlim(srcRoot, dir);
    apply(dir);
    const reportPath = path.join(reportsDir, `${id}.json`);
    const mutated = runGate(dir, reportPath, port);
    port += 2;
    const processExit = mutated.status;
    const reportExit = mutated.reportExit;
    const detected = probe(control, mutated);
    rows.push(
      mutationRow(id, {
        controlPass: true,
        mutationDetected: detected && processExit !== 0 && reportExit === processExit,
        processExit,
        reportExit,
        detail: {
          controlExit: control.status,
          mutationExit: processExit,
          reportExit,
          probe: detected,
          stderr: (mutated.stderr || "").slice(-800),
        },
      }),
    );
  }

  for (const csv of CSVS) {
    mutate(`delete_csv_${csv.id}`, (dir) => {
      const file = path.join(dir, CSV_DIR, csv.file);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      const page = path.join(dir, DEMO_PAGE);
      if (fs.existsSync(page)) {
        const html = fs.readFileSync(page, "utf8").replaceAll(`href="data/${csv.file}"`, 'href="#"');
        fs.writeFileSync(page, html);
      }
    }, (ctrl, mut) => rowStatus(mut.report, `Q01.source.${csv.file}`) === "fail");
  }

  mutate("csv_html_200_body", (dir) => {
    const file = path.join(dir, CSV_DIR, "quantitativos.csv");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "<!DOCTYPE html><html><body>ok</body></html>\n");
  }, (ctrl, mut) => rowStatus(mut.report, "Q01.http.body.quantitativos.csv") === "fail");

  mutate("wipe_excerpt", (dir) => {
    const page = path.join(dir, ORCAMENTO_PAGE);
    if (!fs.existsSync(page)) return;
    let html = fs.readFileSync(page, "utf8");
    const csvPath = path.join(dir, CSV_DIR, "quantitativos.csv");
    const csv = fs.existsSync(csvPath) ? fs.readFileSync(csvPath, "utf8") : "";
    const qtyLine = csv.split(/\r?\n/).find((line) => line.startsWith(`${EXCERPT_ITEM_ID};`));
    const qty = qtyLine ? qtyLine.split(";")[3] : null;
    if (qty) {
      const localized = String(qty).replace(".", ",");
      const short = localized.replace(/0+$/, "").replace(/,$/, "");
      html = html.split(qty).join("").split(localized).join("");
      if (short && short !== localized) html = html.split(short).join("");
    }
    html = html.replace(/data-trail-quantity="[^"]*"/g, 'data-trail-quantity=""');
    html = html.replace(/data-trail-item-quantity="[^"]*"/g, 'data-trail-item-quantity=""');
    if (!html.includes("awaiting-canonical-excerpt")) {
      html = html.replace("<main", '<div data-sample-trail-state="awaiting-canonical-excerpt"></div><main');
    }
    fs.writeFileSync(page, html);
  }, (ctrl, mut) => rowStatus(mut.report, "Q02.excerpt.not_awaiting") === "fail" || rowStatus(mut.report, "Q02.excerpt.numeric") === "fail");

  mutate("remove_revisao_map", (dir) => {
    const page = path.join(dir, PRONTIDAO_PAGE);
    if (!fs.existsSync(page)) return;
    const html = fs.readFileSync(page, "utf8").replace(
      /id="pptr-destination-map">[^<]+/,
      'id="pptr-destination-map">{"schema":"confenge.canonical-destination-map/1.0","by_offer_id":{}}',
    );
    fs.writeFileSync(page, html);
  }, (ctrl, mut) => rowStatus(mut.report, "Q03.map.revisao") === "fail");

  mutate("kit_generic_hub", (dir) => {
    const file = path.join(dir, KITS_JSON);
    if (!fs.existsSync(file)) return;
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const kit of data.kits || []) {
      if (kit.destination) kit.destination.path = GENERIC_HUB;
    }
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  }, (ctrl, mut) =>
    ["orcamento-quantitativos", "revisao-tecnica", "compatibilizacao-interfaces", "elaboracao-complementar"].some(
      (id) => rowStatus(mut.report, `Q05.kit.${id}`) === "fail",
    ),
  );

  mutate("leak_public_label", (dir) => {
    const page = path.join(dir, ORCAMENTO_PAGE);
    if (!fs.existsSync(page)) return;
    const html = fs.readFileSync(page, "utf8").replace(
      "</h1>",
      "</h1><p>SELECT resolved_in_R01 aprovação pelo fundador</p>",
    );
    fs.writeFileSync(page, html);
  }, (ctrl, mut) => (mut.report?.results || []).some((r) => String(r.id).startsWith("Q04.public.") && r.status === "fail"));

  mutate("receipt_before_persist", (dir) => {
    const file = path.join(dir, "netlify/functions/lead.cjs");
    if (!fs.existsSync(file)) return;
    const src = fs.readFileSync(file, "utf8");
    const next = src.replace(
      "exports.handler = async (event) => {",
      `exports.handler = async (event) => {\n  return { statusCode: 201, headers: {}, body: JSON.stringify({ ok: true, lead_id: "lead-unpersisted-receipt", status: "persisted" }) };`,
    );
    fs.writeFileSync(file, next);
  }, (ctrl, mut) => rowStatus(mut.report, "Q06.persist_before_receipt") === "fail");

  rows.unshift({
    id: "control_unmutated",
    control: control.status === 0 ? "pass" : "fail",
    mutation: "n/a",
    detected: true,
    process_exit: control.status,
    report_exit: control.reportExit,
    exit_code_matches_process: control.status === control.reportExit,
    detail: {
      fail: control.report?.summary?.fail,
      findings: (control.report?.findings || []).map((f) => f.name),
    },
  });

  return rows;
}
