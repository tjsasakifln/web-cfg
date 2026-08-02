/**
 * Unit test for netlify/functions/lead.cjs — drives the real handler.
 * Mocks fetch for ntfy + formsubmit; asserts receipt + delivery flags.
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

// 3) honeypot
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

// 4) valid lead with mocked ntfy success + formsubmit activation error
{
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body });
    if (String(url).includes("ntfy.sh")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: "ntfy-msg-test-001",
            event: "message",
            topic: "test",
          }),
      };
    }
    if (String(url).includes("formsubmit.co")) {
      return {
        ok: false,
        status: 403,
        text: async () =>
          JSON.stringify({
            success: "false",
            message: "This form needs Activation.",
          }),
      };
    }
    return { ok: false, status: 500, text: async () => "" };
  };
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
    if (data.journey !== "contrato" || data.delivered !== true) {
      console.error("FAIL: delivery flag", data);
      process.exit(1);
    }
    const ntfy = (data.delivery || []).find((d) => d.channel === "ntfy");
    if (!ntfy || ntfy.status !== "ok" || ntfy.message_id !== "ntfy-msg-test-001") {
      console.error("FAIL: ntfy delivery", data.delivery);
      process.exit(1);
    }
    if (JSON.stringify(data).includes("should not appear")) {
      console.error("FAIL: message leaked", data);
      process.exit(1);
    }
    if (!calls.some((c) => c.url.includes("ntfy.sh"))) {
      console.error("FAIL: ntfy not called", calls);
      process.exit(1);
    }
    console.log(
      "LEAD_FUNCTION_OK",
      JSON.stringify({
        receipt_id: data.receipt_id,
        journey: data.journey,
        delivered: data.delivered,
        ntfy_message_id: ntfy.message_id,
      }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}
