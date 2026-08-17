/**
 * Redact secrets and PII before any log or HTTP response.
 */
const SECRET_KEY = /access_token|authorization|asaas-access-token|api[_-]?key|admin[_-]?token|webhook[_-]?token|secret|password|bearer/i;
const PII_KEY = /^(email|cpf|cnpj|cpfcnpj|phone|telefone|mobilephone|nome|name|representante|customerdata|creditcard|cardnumber)$/i;
const SECRET_VALUE = /\$aact_(hmlg|prod)_[A-Za-z0-9]+/g;
const EMAIL_VALUE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const DOC_VALUE = /\b\d{11}\b|\b\d{14}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;

function redactString(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(SECRET_VALUE, "[REDACTED]")
    .replace(EMAIL_VALUE, "[REDACTED]")
    .replace(DOC_VALUE, "[REDACTED]");
}

function redactProviderPayload(input, depth = 0) {
  if (input == null) return input;
  if (depth > 8) return "[REDACTED]";
  if (typeof input === "string") return redactString(input);
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (Array.isArray(input)) return input.map((item) => redactProviderPayload(item, depth + 1));
  if (typeof input !== "object") return String(input);
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (SECRET_KEY.test(key) || PII_KEY.test(key)) {
      out[key] = value == null || value === "" ? value : "[REDACTED]";
      continue;
    }
    out[key] = redactProviderPayload(value, depth + 1);
  }
  return out;
}

function containsSecret(text, secrets = []) {
  const raw = String(text || "");
  if (SECRET_VALUE.test(raw)) return true;
  for (const secret of secrets) {
    if (secret && String(secret).length >= 4 && raw.includes(String(secret))) return true;
  }
  return false;
}

module.exports = {
  redactProviderPayload,
  redactString,
  containsSecret,
};
