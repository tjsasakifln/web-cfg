import { renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIAGNOSTIC_TIMEOUT_MS = 5000;

export function createBrowserEvidence(report, directory) {
  const path = join(directory, 'browser.json');
  let originalError;
  report.ok = false;
  report.status = 'running';
  const persist = () => {
    report.updatedAt = new Date().toISOString();
    try {
      // Synchronous replacement keeps partial checkpoints ordered and readers
      // see either the previous complete JSON document or the next one.
      writeFileSync(path + '.tmp', JSON.stringify(report, null, 2) + '\n');
      renameSync(path + '.tmp', path);
    } catch (error) {
      console.error('FreeCAD evidence persistence failed:', error);
      if (!originalError) throw error;
    }
  };
  const phase = name => {
    report.phase = name;
    console.log(`FreeCAD phase: ${name}`);
    persist();
  };
  const record = name => {
    report.checks.push(name);
    report.phase = `after-check-${report.checks.length}`;
    console.log(`FreeCAD: ${name}`);
    persist();
  };
  const fail = error => {
    if (!originalError) {
      originalError = error;
      report.failedPhase = report.phase;
      report.failure = String(error.stack || error);
    }
    report.ok = false;
    report.status = 'failed';
    // Emit and persist the original failure before any secondary CDP request.
    console.error(JSON.stringify({ failure: report.failure, phase: report.failedPhase }, null, 2));
    persist();
    return originalError;
  };
  const diagnosticFailure = (name, error) => {
    const entry = { action: name, error: String(error.stack || error) };
    (report.diagnosticErrors ||= []).push(entry);
    console.error('FreeCAD diagnostic failed:', JSON.stringify(entry));
    persist();
  };
  const diagnostic = async (name, action) => {
    if (!originalError) throw new Error('Secondary diagnostics require an original failure.');
    phase(`diagnostic:${name}`);
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(action),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Diagnostic ${name} exceeded ${DIAGNOSTIC_TIMEOUT_MS} ms.`)), DIAGNOSTIC_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      diagnosticFailure(name, error);
      return undefined;
    } finally {
      clearTimeout(timer);
      persist();
    }
  };
  const complete = () => {
    if (originalError) throw originalError;
    report.ok = true;
    report.status = 'passed';
    phase('completed');
  };
  phase('initializing');
  return { persist, phase, record, fail, diagnosticFailure, diagnostic, complete };
}
