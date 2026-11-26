export function createRecoveryMailer(env, fetchImpl = fetch) {
  const key = env.RESEND_API_KEY;
  if (!key) return null;
  const from = env.RESEND_FROM || "CONFENGE <ops@confenge.com.br>";
  return async ({ email, purpose, url, idempotencyKey }) => {
    const verify = purpose === "verify";
    const subject = verify ? "Confirme seu e-mail de recuperação | CONFENGE" : "Redefina sua senha | CONFENGE";
    const text = [
      verify ? "Confirme este endereço para recuperar o acesso à Área do Cliente da CONFENGE."
        : "Use o link abaixo para criar uma nova senha da Área do Cliente da CONFENGE.",
      "", url, "",
      "O link vale por 30 minutos e só pode ser usado uma vez.",
      "Se você não solicitou esta ação, ignore este e-mail.",
    ].join("\n");
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(6000),
      headers: {
        Authorization: "Bearer " + key, "Content-Type": "application/json",
        "Idempotency-Key": "portal-recovery/" + idempotencyKey,
      },
      body: JSON.stringify({ from, to: [email], subject, text }),
    });
    const status = response.status;
    await response.body?.cancel();
    if (!response.ok) throw new Error("mail_http_" + status);
  };
}
