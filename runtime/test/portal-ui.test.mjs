import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createPortal } from "../portal/server.mjs";
import { digest, passwordHash } from "../portal/security.mjs";

const fixtureInitial = "Fixture temporary password";
const fixturePassword = "Fixture definitive password";
const importToken = "Fixture import value";
const assets = new Map([
  ["/assets/portal/portal.js", ["text/javascript; charset=utf-8", "../../assets/portal/portal.js"]],
  ["/styles-tokens.css", ["text/css; charset=utf-8", "../../styles-tokens.css"]],
]);
const expectTimeout = { timeout: 5000 };

async function waitFor(locator) {
  await locator.waitFor({ state: "visible", ...expectTimeout });
  return locator;
}

async function setup(t) {
  const { chromium } = await import(process.env.PORTAL_PLAYWRIGHT_PACKAGE || "playwright");
  const directory = mkdtempSync(join(tmpdir(), "cfg-portal-ui-"));
  writeFileSync(join(directory, "setup.json"), JSON.stringify({
    client: await passwordHash(fixtureInitial),
    admin: await passwordHash(fixtureInitial),
    adminActivation: digest("fixture activation"),
    importToken: digest(importToken),
    importExpiresAt: new Date(Date.now() + 300_000),
  }));
  let portal;
  const server = http.createServer((req, res) => {
    const asset = assets.get(req.url.split("?")[0]);
    if (asset) {
      res.writeHead(200, { "Content-Type": asset[0] });
      return res.end(readFileSync(new URL(asset[1], import.meta.url)));
    }
    if (req.url === "/favicon.ico") {
      res.writeHead(204);
      return res.end();
    }
    return portal.handle(req, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  portal = createPortal({ directory, origin });
  let browser;
  t.after(async () => {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
    portal.close();
    rmSync(directory, { recursive: true, force: true });
  });
  browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: ["--no-sandbox"],
  });
  const call = (path, { method = "GET", cookie, json, headers = {}, body } = {}) =>
    fetch(origin + "/api/portal" + path, {
      method,
      headers: { ...headers, Origin: origin, ...(cookie ? { Cookie: cookie } : {}),
        ...(json ? { "Content-Type": "application/json" } : {}) },
      body: json ? JSON.stringify(json) : body,
    });
  const pageFor = (options = {}) => browser.newPage({ viewport: { width: 390, height: 844 }, ...options });
  return { origin, call, pageFor };
}

test("customer portal supports first access, a full request, opportunity and document workflows on mobile", { timeout: 60_000 }, async (t) => {
  const { origin, call, pageFor } = await setup(t);
  const rows = [{ id: "obra-1", object: "Reforma de São José", stage: "Proposta",
    status: "Publicado", agency: "Órgão de São José", url: "https://example.test/" },
  ...Array.from({ length: 21 }, (_, i) => ({ id: "other-" + i, object: "Outro serviço " + i, stage: "Análise" }))];
  const imported = await call("/control", { method: "POST",
    headers: { Authorization: "Bearer " + importToken }, json: { rows } });
  assert.equal(imported.status, 200);
  const uploaded = await call("/documents", { method: "POST",
    headers: { Authorization: "Bearer " + importToken, "x-portal-filename": "Revis%C3%A3o.pdf", "x-portal-title": "Revis%C3%A3o%20t%C3%A9cnica" },
    body: Buffer.from("%PDF-1.7\nFixture\n"),
  });
  assert.equal(uploaded.status, 201);
  const page = await pageFor();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const snap = async (name) => {
    if (process.env.PORTAL_QA_SCREENSHOTS) await page.screenshot({ path: join(process.env.PORTAL_QA_SCREENSHOTS, name + ".png"), fullPage: true });
  };
  const audit = async () => {
    if (!process.env.PORTAL_AXE_SOURCE) return;
    await page.evaluate(readFileSync(process.env.PORTAL_AXE_SOURCE, "utf8"));
    const violations = await page.evaluate(async () =>
      (await window.axe.run({ runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] })).violations.map(({ id, nodes }) =>
        [id, nodes.map(({ target }) => target)]));
    assert.deepEqual(violations, []);
  };
  const noOverflow = async () => assert.equal(await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.goto(origin + "/area-do-cliente/");
  await waitFor(page.getByRole("heading", { name: "Entre na sua conta" }));
  const help = page.getByRole("link", { name: "Falar com o suporte pelo WhatsApp" });
  assert.match(await help.getAttribute("href"), /^https:\/\/wa\.me\//);
  await waitFor(page.getByText("Entre com a senha temporária que você recebeu.", { exact: false }));
  await snap("portal-login-mobile");
  await audit();
  await page.getByRole("button", { name: "Mostrar senha", exact: true }).click();
  assert.equal(await page.getByLabel("Senha", { exact: true }).getAttribute("type"), "text");
  await page.getByRole("button", { name: "Ocultar senha", exact: true }).click();
  await page.getByLabel("Usuário").fill("extra");
  await page.getByLabel("Senha", { exact: true }).fill("senha incorreta de teste");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await waitFor(page.getByRole("alert").filter({ hasText: "Usuário ou senha incorretos" }));
  await page.getByLabel("Senha", { exact: true }).fill(fixtureInitial);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await waitFor(page.getByRole("heading", { name: "Crie sua senha definitiva" }));
  assert.equal(await page.getByLabel("Nova senha", { exact: true }).evaluate((element) => element === document.activeElement), true);
  await page.getByLabel("Nova senha", { exact: true }).fill(fixturePassword);
  await page.getByLabel("Confirme a nova senha", { exact: true }).fill("Fixture different password");
  await page.getByRole("button", { name: "Criar senha e entrar" }).click();
  await waitFor(page.getByRole("alert").filter({ hasText: "As duas senhas precisam ser iguais" }));
  await page.getByLabel("Confirme a nova senha", { exact: true }).fill(fixturePassword);
  await page.getByRole("button", { name: "Criar senha e entrar" }).click();
  await waitFor(page.getByRole("heading", { name: "O que você quer fazer?" }));
  await noOverflow();
  assert.doesNotMatch(await page.locator("#portal-view").innerText(), /^null$/m);
  await snap("portal-dashboard-mobile");
  await page.setViewportSize({ width: 1366, height: 900 });
  await snap("portal-dashboard-desktop");
  await audit();
  await page.setViewportSize({ width: 320, height: 740 });
  const nav = page.getByRole("navigation", { name: "Navegação do portal" });
  assert.equal(await nav.getByRole("link").count(), 4);
  await waitFor(nav.getByRole("link", { name: "Oportunidades" }));
  await noOverflow();

  const newRequest = page.getByRole("button", { name: "Nova solicitação", exact: true });
  await newRequest.click();
  let dialog = page.getByRole("dialog", { name: "Nova solicitação" });
  await waitFor(dialog);
  await page.keyboard.press("Escape");
  assert.equal(await dialog.count(), 0);
  assert.equal(await newRequest.evaluate((element) => element === document.activeElement), true);
  await newRequest.click();
  await dialog.getByLabel("Categoria").selectOption("documentos");
  await dialog.getByLabel("Assunto").fill("Revisão de documentos");
  await dialog.getByLabel("Detalhes").fill("Preciso conferir as pranchas.");
  let submitCount = 0;
  const countSubmit = async (route) => {
    if (route.request().method() === "POST") {
      submitCount++;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await route.continue();
  };
  await page.route("**/api/portal/tickets", countSubmit);
  await dialog.getByRole("button", { name: "Enviar solicitação" }).evaluate((node) => { node.click(); node.click(); });
  await waitFor(page.getByText("Solicitação enviada.", { exact: false }));
  assert.equal(submitCount, 1);
  await page.unroute("**/api/portal/tickets", countSubmit);
  const request = page.getByRole("button", { name: /Revisão de documentos/ });
  await request.click();
  dialog = page.getByRole("dialog", { name: "Revisão de documentos" });
  await waitFor(dialog.getByText("Preciso conferir as pranchas."));
  const text = dialog.getByLabel("Sua mensagem");
  await text.fill("Primeira linha\nSegunda linha");
  const blockSend = async (route) => route.abort("failed");
  await page.route("**/api/portal/tickets/*/messages", blockSend);
  await dialog.getByRole("button", { name: "Enviar mensagem" }).click();
  await waitFor(dialog.getByRole("alert").filter({ hasText: "Verifique sua conexão" }));
  assert.equal(await text.inputValue(), "Primeira linha\nSegunda linha");
  await page.unroute("**/api/portal/tickets/*/messages", blockSend);
  await dialog.getByRole("button", { name: "Enviar mensagem" }).click();
  await waitFor(dialog.getByText("Mensagem enviada."));
  await waitFor(dialog.getByText("Primeira linha Segunda linha"));
  await dialog.getByRole("button", { name: "Fechar" }).click();

  const adminLogin = await call("/login", { method: "POST", json: { role: "admin", username: "admincfg",
    password: fixtureInitial, activationCode: "fixture activation", newPassword: "Fixture admin password" } });
  assert.equal(adminLogin.status, 200);
  const cookie = adminLogin.headers.get("set-cookie").split(";")[0];
  const dashboard = await (await call("/dashboard", { cookie })).json();
  const thread = "/tickets/" + dashboard.tickets[0].id;
  assert.equal((await call(thread, { method: "PATCH", cookie, json: { status: "aguardando_cliente" } })).status, 200);
  assert.equal((await call(thread + "/messages", { method: "POST", cookie, json: { body: "Envie a referência." } })).status, 201);
  await page.getByRole("button", { name: "Atualizar dados" }).click();
  await waitFor(page.getByText("Dados atualizados."));
  await nav.getByRole("link", { name: "Início" }).click();
  await page.getByRole("button", { name: "1 solicitação aguarda sua resposta" }).click();
  assert.equal(await page.getByLabel("Status", { exact: true }).inputValue(), "aguardando_cliente");
  await request.click();
  await waitFor(page.getByText("A equipe aguarda sua resposta.", { exact: false }));
  await waitFor(page.getByText("Envie a referência."));
  await page.getByRole("button", { name: "Fechar" }).click();

  await nav.getByRole("link", { name: "Documentos" }).click();
  await page.getByRole("searchbox", { name: "Buscar documentos" }).fill("revisao");
  const downloadButton = await waitFor(page.getByRole("button", { name: "Baixar Revisão técnica" }));
  const [download] = await Promise.all([page.waitForEvent("download", expectTimeout), downloadButton.click()]);
  assert.equal(download.suggestedFilename(), "Revisão.pdf");
  await page.getByRole("searchbox", { name: "Buscar documentos" }).fill("não existe");
  await waitFor(page.getByText("Nenhum arquivo corresponde", { exact: false }));
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await waitFor(downloadButton);

  await nav.getByRole("link", { name: "Oportunidades" }).click();
  await waitFor(page.getByText("Exibindo 1–20 de 22"));
  await page.getByRole("button", { name: "Próxima" }).click();
  await waitFor(page.getByText("Exibindo 21–22 de 22"));
  await page.getByRole("searchbox", { name: "Buscar oportunidades" }).fill("sao jose");
  await waitFor(page.getByRole("heading", { name: "Reforma de São José" }));
  await noOverflow();
  await snap("portal-opportunity-mobile");
  await audit();
  await page.getByRole("button", { name: "Pedir proposta", exact: true }).click();
  await waitFor(page.getByText("Oportunidade vinculada — Reforma de São José"));
  await page.getByRole("button", { name: "Fechar" }).click();
  await page.goBack();
  await waitFor(page.getByRole("heading", { name: "Documentos", exact: true }));
  await page.goto(origin + "/area-do-cliente/#oportunidades");
  await waitFor(page.getByRole("heading", { name: "Oportunidades", exact: true }));

  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await waitFor(page.getByText("Você saiu da sua conta."));
  await page.getByLabel("Usuário").fill("extra");
  await page.getByLabel("Senha", { exact: true }).fill(fixturePassword);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await waitFor(page.getByRole("heading", { name: "Oportunidades", exact: true }));
  await page.context().clearCookies();
  await page.getByRole("button", { name: "Atualizar dados" }).click();
  await waitFor(page.getByText("Sua sessão terminou.", { exact: false }));
  assert.equal(await nav.count(), 0);
  assert.deepEqual(errors, []);
});

test("portal entry explains no JavaScript and recovers from an unavailable session check", { timeout: 30_000 }, async (t) => {
  const { origin, pageFor } = await setup(t);
  const noJs = await pageFor({ javaScriptEnabled: false });
  await noJs.goto(origin + "/area-do-cliente/");
  await waitFor(noJs.getByRole("heading", { name: "Área do cliente" }));
  const noScript = noJs.locator("noscript p");
  await waitFor(noScript);
  assert.match(await noScript.textContent(), /Ative o JavaScript no navegador/);
  const page = await pageFor();
  const unavailable = async (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ error: "portal_unavailable" }),
  });
  await page.route("**/api/portal/session", unavailable);
  await page.goto(origin + "/area-do-cliente/");
  await waitFor(page.getByRole("heading", { name: "Não foi possível verificar seu acesso" }));
  await page.unroute("**/api/portal/session", unavailable);
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await waitFor(page.getByRole("heading", { name: "Entre na sua conta" }));
});
