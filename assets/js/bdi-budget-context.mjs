// A single, short-lived rate stays in this tab. No project or account data travels.
export const BDI_CONTEXT_KEY = 'confenge.bdi-orcamento.v1';
export const BDI_CONTEXT_TTL_MS = 30 * 60 * 1000;

export function isBudgetBdiRate(rate) {
  return typeof rate === 'string' && /^(?:0|[1-9]\d{0,2})\.\d{4}$/.test(rate);
}

export function saveBdiContext(rate, {storage, now = Date.now()} = {}) {
  if (!isBudgetBdiRate(rate) || !Number.isSafeInteger(now) || now < 0) return false;
  try {
    const target = storage ?? globalThis.sessionStorage;
    const raw = JSON.stringify({rate, createdAt: now});
    target.setItem(BDI_CONTEXT_KEY, raw);
    return target.getItem(BDI_CONTEXT_KEY) === raw;
  } catch { return false; }
}

export function readBdiContext({storage, now = Date.now()} = {}) {
  try {
    const target = storage ?? globalThis.sessionStorage;
    const raw = target.getItem(BDI_CONTEXT_KEY);
    if (raw === null) return null;
    let value;
    try { value = typeof raw === 'string' && raw.length <= 160 ? JSON.parse(raw) : null; }
    catch { value = null; }
    if (!value || Array.isArray(value) || Object.keys(value).length !== 2 ||
        !Object.hasOwn(value, 'rate') || !Object.hasOwn(value, 'createdAt') ||
        !isBudgetBdiRate(value.rate) || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0 ||
        !Number.isSafeInteger(now) || now < value.createdAt || now - value.createdAt >= BDI_CONTEXT_TTL_MS) {
      target.removeItem(BDI_CONTEXT_KEY);
      return null;
    }
    return Object.freeze({rate: value.rate, createdAt: value.createdAt});
  } catch { return null; }
}

export function clearBdiContext({storage} = {}) {
  try {
    const target = storage ?? globalThis.sessionStorage;
    target.removeItem(BDI_CONTEXT_KEY);
    return target.getItem(BDI_CONTEXT_KEY) === null;
  } catch { return false; }
}
