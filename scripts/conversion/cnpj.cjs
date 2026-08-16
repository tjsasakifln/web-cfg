/**
 * Server-side CNPJ normalize + validate. Pure. No I/O.
 */
const crypto = require("crypto");

const WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function onlyDigits(raw) {
  return String(raw == null ? "" : raw).replace(/\D/g, "");
}

function normalizeCnpj(raw) {
  const d = onlyDigits(raw);
  return d.length === 14 ? d : "";
}

function checkDigit(digits, weights) {
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) {
    sum += Number(digits[i]) * weights[i];
  }
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

function isValidCnpj(raw) {
  const d = onlyDigits(raw);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  if (checkDigit(d, WEIGHTS_1) !== Number(d[12])) return false;
  if (checkDigit(d, WEIGHTS_2) !== Number(d[13])) return false;
  return true;
}

function validateCnpj(raw) {
  const normalized = normalizeCnpj(raw);
  if (!normalized) {
    return { ok: false, error: "cnpj_invalid", message: "Informe um CNPJ com 14 digitos." };
  }
  if (!isValidCnpj(normalized)) {
    return { ok: false, error: "cnpj_invalid", message: "CNPJ invalido. Confira os digitos." };
  }
  return { ok: true, cnpj: normalized };
}

function hashCnpj(cnpj, salt = "confenge-conversion") {
  const n = normalizeCnpj(cnpj);
  if (!n) return "";
  return crypto.createHash("sha256").update(`${salt}|${n}`).digest("hex").slice(0, 16);
}

function maskCnpj(cnpj) {
  const n = normalizeCnpj(cnpj);
  if (!n) return "";
  return `********/${n.slice(8, 12)}-${n.slice(12)}`;
}

function cnpjNeedles(cnpj) {
  const n = normalizeCnpj(cnpj);
  if (!n) return [];
  return [
    n,
    `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`,
    n.slice(0, 8),
  ];
}

function containsCnpj(text, cnpj) {
  const raw = String(text == null ? "" : text);
  const n = normalizeCnpj(cnpj);
  if (!n) return false;
  const compact = raw.replace(/\D/g, "");
  if (compact.includes(n)) return true;
  const formatted = `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
  return raw.includes(formatted);
}

function assertNoCnpjInUrl(url, cnpj) {
  if (containsCnpj(url, cnpj)) {
    return { ok: false, error: "cnpj_in_url" };
  }
  try {
    const u = new URL(url, "https://confenge.com.br");
    for (const [k, v] of u.searchParams.entries()) {
      if (/cnpj/i.test(k) || containsCnpj(v, cnpj)) {
        return { ok: false, error: "cnpj_in_query", key: k };
      }
    }
  } catch {
    /* relative path without host */
    if (/[?&]cnpj=/i.test(String(url || ""))) {
      return { ok: false, error: "cnpj_in_query" };
    }
  }
  return { ok: true };
}

module.exports = {
  onlyDigits,
  normalizeCnpj,
  isValidCnpj,
  validateCnpj,
  hashCnpj,
  maskCnpj,
  cnpjNeedles,
  containsCnpj,
  assertNoCnpjInUrl,
};
