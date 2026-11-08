const { check, mac } = require('./policy.cjs');

const schema = 'confenge.modela.memoria/v1';
const modelFields = ['point', 'targetScale', 'logFeatures', 'estimand', 'originalIntervalsValidated', 'meanCI',
  'predictionInterval', 'coefficients', 'r2', 'adjustedR2', 'n', 'k', 'fPValue', 'precision', 'amplitude', 'items',
  'diagnostics', 'issues', 'extrapolation', 'usedRows', 'excludedRows', 'residuals', 'normative', 'value', 'unit',
  'modelHash', 'sourceRevision'];
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const exact = (o, keys) => isObject(o) && Object.keys(o).every(k => keys.includes(k));
const finite = x => typeof x === 'number' && Number.isFinite(x);
const rowId = x => typeof x === 'string' && /^(?:[1-9]\d{0,3}|10000)$/.test(x);
const column = x => typeof x === 'string' && x.trim().length && x.length <= 500;

function modelaReport(payload, identityKey) {
  const requireReport = ok => check(ok, 'INVALID_REPORT', 422);
  requireReport(exact(payload, ['exemplo_ficticio', 'parametros', 'resultado']) && typeof payload.exemplo_ficticio === 'boolean');
  const { parametros: p, resultado: r } = payload;
  requireReport(exact(p, ['target', 'features', 'subject', 'unit', 'targetScale', 'logFeatures']) && column(p.target));
  requireReport(Array.isArray(p.features) && p.features.length >= 1 && p.features.length <= 25 && p.features.every(column));
  requireReport(new Set(p.features).size === p.features.length && exact(p.subject, p.features) && p.features.every(k => finite(p.subject[k])));
  requireReport(['BRL', 'BRL/m²'].includes(p.unit) && ['identity', 'log'].includes(p.targetScale));
  requireReport(Array.isArray(p.logFeatures) && p.logFeatures.length <= p.features.length && p.logFeatures.every(k => p.features.includes(k)));
  requireReport(exact(r, modelFields) && finite(r.point) && r.unit === p.unit && r.targetScale === p.targetScale);
  requireReport(Number.isInteger(r.n) && r.n >= 1 && r.n <= 10000 && r.k === p.features.length);
  requireReport(Array.isArray(r.coefficients) && r.coefficients.length === r.k + 1 && r.coefficients.every(c =>
    exact(c, ['name', 'value', 'p']) && column(c.name) && finite(c.value) && (c.p === null || finite(c.p))));
  requireReport(Array.isArray(r.usedRows) && r.usedRows.length === r.n && r.usedRows.every(rowId));
  requireReport(Array.isArray(r.excludedRows) && r.excludedRows.length + r.n <= 10000 && r.excludedRows.every(rowId));
  requireReport(Array.isArray(r.residuals) && r.residuals.length === r.n && r.residuals.every((x, i) =>
    exact(x, ['id', 'observed', 'predicted', 'residual', 'cook', 'leverage']) && x.id === r.usedRows[i] &&
    [x.observed, x.predicted, x.residual].every(finite) && [x.cook, x.leverage].every(v => v === null || finite(v))));

  // Canonicalise once before the transaction. Bounded, acyclic JSON from the HTTP
  // request; never persist or log the work. Reject arbitrary nested raw rows.
  let nodes = 0;
  function canonical(value, depth = 0) {
    requireReport(++nodes <= 150000 && depth <= 12);
    if (value === null || typeof value === 'boolean' || finite(value)) return value;
    if (typeof value === 'string') { requireReport(value.length <= 4096); return value; }
    if (Array.isArray(value)) { requireReport(value.length <= 10000); return value.map(v => canonical(v, depth + 1)); }
    requireReport(isObject(value) && Object.keys(value).length <= 100);
    return Object.fromEntries(Object.keys(value).sort().map(key => {
      requireReport(!['__proto__', 'constructor', 'prototype', 'rows', 'rawRows'].includes(key) && key.length <= 500);
      return [key, canonical(value[key], depth + 1)];
    }));
  }
  const content = JSON.stringify(canonical({ programa: 'Modela Pro', ...payload }));
  const digest = mac(identityKey, schema, content);
  return { digest, render(event) {
    const header = { esquema: schema, emissao: event.exportId, emitido_em: new Date(event.at).toISOString(),
      origem: 'Modela Pro — CONFENGE', selo: mac(identityKey, 'modela-issue', `${event.exportId}:${digest}`) };
    return `${JSON.stringify(header).slice(0, -1)},"memoria":${content}}\n`;
  } };
}

module.exports = { modelaReport };
