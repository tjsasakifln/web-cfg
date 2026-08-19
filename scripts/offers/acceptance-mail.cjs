/**
 * Email the acceptance challenge. Never return the secret to the browser.
 */
const DEFAULT_FROM = "CONFENGE <tiago.sasaki@confenge.com.br>";

async function sendAcceptanceChallenge({ to, otp, magicLinkUrl, env = process.env, fetchImpl } = {}) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  if (!apiKey) return { ok: false, error: "email_not_configured" };
  const fetchFn = fetchImpl || fetch;
  const res = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.CONFENGE_ACCEPTANCE_FROM || DEFAULT_FROM,
      to: [to],
      subject: "CONFENGE — confirme o aceite do Diagnóstico B2G",
      text: [
        "Use o código abaixo para confirmar o aceite do Diagnóstico B2G (R$ 8.000).",
        "",
        `Código: ${otp}`,
        "",
        magicLinkUrl ? `Ou abra: ${magicLinkUrl}` : null,
        "",
        "Se você não pediu este aceite, ignore este e-mail.",
      ].filter(Boolean).join("\n"),
    }),
  });
  if (!res || !res.ok) {
    return { ok: false, error: "email_delivery_failed", status: res && res.status };
  }
  return { ok: true };
}

module.exports = { sendAcceptanceChallenge };
