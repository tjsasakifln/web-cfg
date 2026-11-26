const ETP_TOOL = 'gerador-etp';
const ETP_FORMAT = 'bundle';
const ETP_MAX_BODY = 100 * 1024;
const ETP_MAX_VARIABLE_CENTS = 85;
const ETP_OPERATIONS = Object.freeze(['etp-interview', 'etp-prepare', 'etp-generate', 'etp-result']);
const ETP_STATES = 'etpJobs';
const ETP_EXPORT_READY = 'staged';
const retentionMs = 24 * 60 * 60 * 1000;

function etpSettings(env, cfg) {
  const budgetMicros = Number(env.CONFENGE_ETP_MONTHLY_BUDGET_USD_CENTS) * 10000;
  const key = String(env.OPENAI_API_KEY || '');
  const requested = env.CONFENGE_ETP_ENABLED === '1';
  const enabled = cfg.mode !== 'off' && cfg.sharedExportsEnabled === true && !cfg.exportsPaused && requested && /^sk-[A-Za-z0-9_-]{20,240}$/.test(key) &&
    Number.isSafeInteger(budgetMicros) && budgetMicros >= 100000 && budgetMicros <= 200000000 &&
    (cfg.mode !== 'live' || env.CONFENGE_ETP_RETENTION_READY === '1');
  return { enabled, key, budgetMicros };
}
module.exports = { ETP_TOOL, ETP_FORMAT, ETP_MAX_BODY, ETP_MAX_VARIABLE_CENTS, ETP_OPERATIONS, ETP_STATES, ETP_EXPORT_READY, retentionMs, etpSettings };
