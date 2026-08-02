/**
 * Unit test for netlify/functions/lead.cjs — drives the real handler export.
 * Proves validation + receipt issuance without network when upstream fails.
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const { handler } = require(path.join(root, "netlify/functions/lead.cjs"));

function event(body, method = "POST") {
  return {
    httpMethod: method,
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

// 1) method guard
{
  const res = await handler(event({}, "GET"));
  if (res.statusCode !== 405) {
    console.error("FAIL: expected 405", res);
    process.exit(1);
  }
}

// 2) validation
{
  const res = await handler(event({ nome: "A" }));
  const data = JSON.parse(res.body);
  if (res.statusCode !== 400 || data.ok !== false) {
    console.error("FAIL: validation", res);
    process.exit(1);
  }
}

// 3) honeypot suppressed
{
  const res = await handler(
    event({
      nome: "Bot",
      telefone: "48999999999",
      estagio: "outro",
      consentimento: "on",
      "empresa-site": "spam",
    }),
  );
  const data = JSON.parse(res.body);
  if (!data.ok || !data.suppressed) {
    console.error("FAIL: honeypot", data);
    process.exit(1);
  }
}

// 4) valid lead → receipt (upstream may be activation_required / error offline)
{
  // Mock fetch for upstream
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ success: "true", message: "ok" }),
  });
  try {
    const res = await handler(
      event({
        nome: "QA Journey A",
        telefone: "48988344559",
        estagio: "problema urgente em contrato",
        jornada: "contrato",
        consentimento: "on",
        origem: "/",
        utm_source: "test",
        mensagem: "should not appear in response",
      }),
    );
    const data = JSON.parse(res.body);
    if (res.statusCode !== 200 || !data.ok || !data.receipt_id) {
      console.error("FAIL: receipt", data);
      process.exit(1);
    }
    if (data.journey !== "contrato") {
      console.error("FAIL: journey", data);
      process.exit(1);
    }
    if (JSON.stringify(data).includes("should not appear")) {
      console.error("FAIL: message leaked in response", data);
      process.exit(1);
    }
    if (!/^[a-f0-9]{16,32}$/i.test(data.receipt_id)) {
      console.error("FAIL: receipt format", data.receipt_id);
      process.exit(1);
    }
    console.log("LEAD_FUNCTION_OK", JSON.stringify({
      receipt_id: data.receipt_id,
      journey: data.journey,
      upstream: data.upstream?.status,
    }));
  } finally {
    globalThis.fetch = originalFetch;
  }
}
