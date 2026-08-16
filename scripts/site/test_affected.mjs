#!/usr/bin/env node
/**
 * Local affected-suite runner. Knows producers/consumers.
 * Does not replace merge-gate `npm test`. Fallback is full, never skip.
 *
 * Usage:
 *   npm run test:affected -- --base origin/main
 *   npm run test:affected -- --paths scripts/site/indexnow_submit.mjs
 *   npm run test:affected -- --select-only --paths robots.txt
 *   npm run test:affected -- --corpus --report /tmp/affected-vs-full.json
 */

import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ROOT,
  CORPUS_SHAS,
  inventoryCommand,
  inventorySuites,
  loadPackageScripts,
  omittedAgainstNecessary,
  extraAgainstNecessary,
  selectAffected,
} from "./affected_graph.mjs";

function printHelp() {
  process.stdout.write(`test:affected — local producer/consumer suite selector

Usage:
  node scripts/site/test_affected.mjs [options] [path ...]

Options:
  --base <ref>         Diff vs this git ref (default: origin/main)
  --paths <a,b,...>    Explicit changed paths (repeatable or comma-separated)
  --paths-file <file>  One path per line
  --select-only        Do not execute suites (print selection + why)
  --json               Print the JSON report to stdout
  --report <file>      Write JSON report
  --report-md <file>   Write Markdown report
  --corpus             Replay documented real-commit path lists (select-only)
  --help               This message

Fallback is full, never skip. Merge still requires npm test.
`);
}

function parseArgs(argv) {
  const opts = {
    base: "origin/main",
    paths: [],
    pathsFile: null,
    selectOnly: false,
    json: false,
    report: null,
    reportMd: null,
    corpus: false,
    help: false,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--select-only") opts.selectOnly = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--corpus") opts.corpus = true;
    else if (a === "--base") opts.base = argv[++i];
    else if (a === "--paths-file") opts.pathsFile = argv[++i];
    else if (a === "--report") opts.report = argv[++i];
    else if (a === "--report-md") opts.reportMd = argv[++i];
    else if (a === "--paths") {
      const raw = argv[++i] || "";
      opts.paths.push(...raw.split(",").map((s) => s.trim()).filter(Boolean));
    } else if (a.startsWith("--")) {
      throw new Error(`unknown flag ${a}`);
    } else {
      rest.push(a);
    }
  }
  opts.paths.push(...rest);
  return opts;
}

function gitLines(args) {
  try {
    const out = execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (err) {
    const msg = err.stderr || err.message || String(err);
    throw new Error(`git ${args.join(" ")} failed: ${msg}`.trim());
  }
}

export function changedPathsFromGit(base) {
  const names = new Set();
  const tries = [
    ["diff", "--name-only", "--diff-filter=ACMRT", `${base}...HEAD`],
    ["diff", "--name-only", "--diff-filter=ACMRT", base],
    ["diff", "--name-only", "--diff-filter=ACMRT"],
    ["diff", "--name-only", "--cached", "--diff-filter=ACMRT"],
    ["ls-files", "--others", "--exclude-standard"],
  ];
  for (const args of tries) {
    try {
      for (const p of gitLines(args)) names.add(p);
    } catch {
      // keep going; later tries may still work
    }
  }
  return [...names].sort();
}

export function pathsForCommit(sha) {
  return gitLines(["diff-tree", "--no-commit-id", "--name-only", "-r", sha]);
}

function loadPathsFile(file) {
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (!existsSync(abs)) throw new Error(`paths file missing: ${abs}`);
  return readFileSync(abs, "utf8")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function runSuite(suiteId, scripts) {
  const cmd = inventoryCommand(suiteId, scripts);
  const started = nowMs();
  const result = spawnSync("bash", ["-lc", cmd], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
  });
  return {
    id: suiteId,
    exit_code: result.status == null ? 1 : result.status,
    duration_ms: nowMs() - started,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function renderMd(report) {
  const lines = [];
  lines.push("# test:affected report");
  lines.push("");
  lines.push(`- mode: \`${report.mode}\``);
  lines.push(`- fallback: \`${report.fallback}\`${report.fallback_reason ? ` — ${report.fallback_reason}` : ""}`);
  lines.push(`- risk: \`${report.risk.level}\``);
  lines.push(`- selected: **${report.selected.length}** / ${report.inventory_count}`);
  lines.push(`- duration_ms.total: ${report.duration_ms.total}`);
  lines.push(`- merge: full \`npm test\` remains required`);
  lines.push("");
  lines.push("## Selection");
  lines.push("");
  for (const s of report.selected) {
    const dur = report.duration_ms.suites[s.id];
    const durBit = dur == null ? "" : ` (${dur} ms)`;
    lines.push(`- \`${s.id}\`${durBit}: ${s.why}`);
  }
  if (!report.selected.length) lines.push("- _(none)_");
  lines.push("");
  lines.push("## Skipped (local only)");
  lines.push("");
  for (const id of report.skipped) lines.push(`- \`${id}\``);
  if (!report.skipped.length) lines.push("- _(none — full set)_");
  lines.push("");
  if (report.unknown_paths.length) {
    lines.push("## Unknown paths (promoted full)");
    lines.push("");
    for (const p of report.unknown_paths) lines.push(`- \`${p}\``);
    lines.push("");
  }
  if (report.promote.length) {
    lines.push("## Promote-full hits");
    lines.push("");
    for (const h of report.promote) lines.push(`- \`${h.id}\` \`${h.path}\`: ${h.reason}`);
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

function printHuman(report) {
  const lines = [];
  lines.push(`test:affected mode=${report.mode} fallback=${report.fallback} risk=${report.risk.level}`);
  if (report.fallback_reason) lines.push(`reason: ${report.fallback_reason}`);
  lines.push(`paths: ${report.paths.length}  selected: ${report.selected.length}/${report.inventory_count}`);
  for (const s of report.selected) {
    lines.push(`SELECT ${s.id}`);
    lines.push(`  why: ${s.why}`);
  }
  if (report.skipped.length) {
    lines.push(`SKIP (local only; merge still full): ${report.skipped.join(", ")}`);
  }
  lines.push(`duration_ms.total=${report.duration_ms.total}`);
  process.stdout.write(lines.join("\n") + "\n");
}

function buildReport({ mode, opts, paths, selection, duration, runs }) {
  const suiteDur = {};
  if (runs) {
    for (const r of runs) suiteDur[r.id] = r.duration_ms;
  }
  return {
    ok: !runs || runs.every((r) => r.exit_code === 0),
    mode,
    base: opts.base,
    paths,
    inventory_count: selection.inventory.length,
    inventory: selection.inventory,
    selected: selection.selected,
    selected_ids: selection.selected_ids,
    skipped: selection.skipped,
    fallback: selection.fallback,
    fallback_reason: selection.fallback_reason,
    promote: selection.promote,
    unknown_paths: selection.unknown_paths,
    risk: selection.risk,
    duration_ms: {
      select: duration.select,
      suites: suiteDur,
      total: duration.total,
    },
    runs: runs
      ? runs.map((r) => ({
          id: r.id,
          exit_code: r.exit_code,
          duration_ms: r.duration_ms,
        }))
      : [],
    merge_gate: {
      npm_test_required: true,
      test_affected_is_local_only: true,
    },
  };
}

export function replayCorpus(shas = CORPUS_SHAS) {
  const rows = [];
  let omitted_total = 0;
  for (const row of shas) {
    const paths = pathsForCommit(row.sha);
    const selected = selectAffected(paths);
    const necessary = selectAffected(paths);
    const omitted = omittedAgainstNecessary(selected.selected_ids, necessary.selected_ids);
    const extra = extraAgainstNecessary(selected.selected_ids, necessary.selected_ids);
    omitted_total += omitted.length;
    rows.push({
      sha: row.sha,
      subject: row.subject,
      path_count: paths.length,
      paths,
      selected: selected.selected_ids,
      necessary: necessary.selected_ids,
      extra,
      omitted,
      fallback: selected.fallback,
      fallback_reason: selected.fallback_reason,
      risk: selected.risk.level,
      promote: selected.promote,
      unknown_paths: selected.unknown_paths,
      duration_ms: { select: null, suites: {}, total: null },
    });
  }
  return {
    ok: omitted_total === 0,
    oracle: "mapped-necessity ∪ promote-full (same shipped selector; omit must be empty)",
    corpus_size: rows.length,
    omitted_total,
    rows,
    risk: {
      level: omitted_total === 0 ? "corpus-fn-0" : "corpus-fn-nonzero",
      false_negative_oracle: "mapped-necessity ∪ promote-full",
      notes: [
        "over-select allowed",
        "did not re-execute npm test on historical SHAs",
        "merge still requires npm test",
      ],
    },
  };
}

function writeReports(opts, payload) {
  if (opts.report) {
    const abs = path.isAbsolute(opts.report) ? opts.report : path.join(process.cwd(), opts.report);
    writeFileSync(abs, JSON.stringify(payload, null, 2) + "\n", "utf8");
  }
  if (opts.reportMd) {
    const abs = path.isAbsolute(opts.reportMd)
      ? opts.reportMd
      : path.join(process.cwd(), opts.reportMd);
    const md = payload.rows ? corpusMd(payload) : renderMd(payload);
    writeFileSync(abs, md, "utf8");
  }
}

function corpusMd(payload) {
  const lines = [
    "# affected vs full (corpus)",
    "",
    `- omitted_total: **${payload.omitted_total}**`,
    `- corpus_size: ${payload.corpus_size}`,
    `- oracle: ${payload.oracle}`,
    "",
    "| sha | subject | paths | selected | fallback | omitted |",
    "|---|---|---:|---:|---|---|",
  ];
  for (const r of payload.rows) {
    lines.push(
      `| \`${r.sha.slice(0, 8)}\` | ${r.subject.replace(/\|/g, "/")} | ${r.path_count} | ${r.selected.length} | ${r.fallback} | ${r.omitted.length ? r.omitted.join(", ") : "∅"} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    printHelp();
    return 0;
  }

  if (opts.corpus) {
    const t0 = nowMs();
    const payload = replayCorpus();
    payload.duration_ms = { select: nowMs() - t0, suites: {}, total: nowMs() - t0 };
    writeReports(opts, payload);
    if (opts.json) process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    else {
      process.stdout.write(
        `test:affected corpus omitted_total=${payload.omitted_total} rows=${payload.corpus_size} risk=${payload.risk.level}\n`,
      );
      for (const r of payload.rows) {
        process.stdout.write(
          `${r.sha.slice(0, 8)} selected=${r.selected.length} fallback=${r.fallback} omitted=${r.omitted.length}\n`,
        );
      }
    }
    return payload.ok ? 0 : 1;
  }

  const scripts = loadPackageScripts();
  inventorySuites(scripts);

  let paths = [...opts.paths];
  if (opts.pathsFile) paths.push(...loadPathsFile(opts.pathsFile));
  if (!paths.length) paths = changedPathsFromGit(opts.base);

  const tSelect0 = nowMs();
  const selection = selectAffected(paths, scripts);
  const selectMs = nowMs() - tSelect0;

  const mode = opts.selectOnly || process.env.TEST_AFFECTED_SELECT_ONLY === "1" ? "select-only" : "run";
  let runs = [];
  if (mode === "run") {
    const toRun = selection.selected_ids.length ? selection.selected_ids : [];
    if (!toRun.length && !paths.length) {
      process.stderr.write("test:affected: no changed paths; nothing selected (merge still requires npm test)\n");
    }
    for (const id of toRun) {
      const r = runSuite(id, scripts);
      runs.push(r);
      if (r.stdout) process.stdout.write(r.stdout);
      if (r.stderr) process.stderr.write(r.stderr);
      if (r.exit_code !== 0) {
        process.stderr.write(`test:affected: suite ${id} exited ${r.exit_code}\n`);
        break;
      }
    }
  }
  const totalMs = nowMs() - tSelect0;

  const report = buildReport({
    mode,
    opts,
    paths,
    selection,
    duration: { select: selectMs, total: totalMs },
    runs: mode === "run" ? runs : null,
  });

  writeReports(opts, report);
  if (opts.json) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  else printHuman(report);

  if (mode === "run" && runs.some((r) => r.exit_code !== 0)) return 1;
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main());
  } catch (err) {
    process.stderr.write(`test:affected FAIL: ${err.message || err}\n`);
    process.exit(1);
  }
}
