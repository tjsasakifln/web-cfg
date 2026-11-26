import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { intelligenceView } from "../portal/intelligence.mjs";
import { createPortal } from "../portal/server.mjs";
import { digest, passwordHash } from "../portal/security.mjs";

const fixtureInitial = "Fixture temporary password";
const fixturePassword = "Fixture definitive password";
const importToken = "Fixture import value";
const assets = new Map([
  ["/assets/portal/portal.js", ["text/javascript; charset=utf-8", "../../assets/portal/portal.js"]],
  ["/assets/portal/intelligence.js", ["text/javascript; charset=utf-8", "../../assets/portal/intelligence.js"]],
  ["/assets/archivo-var-latin-b19be0f7.woff2", ["font/woff2", "../../assets/archivo-var-latin-b19be0f7.woff2"]],
  ["/assets/logo-confenge-white-500-1677038e.png", ["image/png", "../../assets/logo-confenge-white-500-1677038e.png"]],
  ["/styles-tokens.css", ["text/css; charset=utf-8", "../../styles-tokens.css"]],
]);
const expectTimeout = { timeout: 5000 };

async function waitFor(locator) {
  await locator.waitFor({ state: "visible", ...expectTimeout });
  return locator;
}

async function setup(t, { readIntelligence } = {}) {
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
  const mail = [];
  portal = createPortal({ directory, origin, readIntelligence, deliverRecovery: async (message) => { mail.push(message); } });
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
  return { origin, call, pageFor, mail };
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
  const noOverflow = async () => {
    const layout = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const scrollWidth = document.documentElement.scrollWidth;
      if (scrollWidth <= width) return { width, scrollWidth, protruding: [] };
      return { width, scrollWidth, protruding: [...document.querySelectorAll("main *")]
        .filter((node) => node.getBoundingClientRect().right > width + 1)
        .slice(0, 12).map((node) => [node.tagName, node.className, Math.round(node.getBoundingClientRect().right)]) };
    });
    assert.ok(layout.scrollWidth <= layout.width, JSON.stringify(layout));
  };
  await page.goto(origin + "/area-do-cliente/");
  await waitFor(page.getByRole("heading", { name: "Entre na sua conta" }));
  const help = page.getByRole("link", { name: "Falar com o suporte pelo WhatsApp" });
  assert.match(await help.getAttribute("href"), /^https:\/\/wa\.me\//);
  const firstAccess = page.getByText("Primeiro acesso", { exact: true });
  await firstAccess.click();
  await waitFor(page.getByText("Entre com a senha temporária que você recebeu.", { exact: false }));
  await firstAccess.click();
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
  assert.equal(await nav.getByRole("link").count(), 5);
  await waitFor(nav.getByRole("link", { name: "Inteligência" }));
  await waitFor(nav.getByRole("link", { name: "Oportunidades" }));
  await noOverflow();
  await nav.evaluate((node) => {
    node.style.fontFamily = '"DejaVu Sans", sans-serif';
    node.querySelectorAll("a").forEach((link) => { link.style.fontSize = "16px"; });
  });
  await noOverflow();
  await nav.evaluate((node) => {
    node.style.removeProperty("font-family");
    node.querySelectorAll("a").forEach((link) => link.style.removeProperty("font-size"));
  });

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

test("client can confirm a recovery email and reset a forgotten password from a second device", { timeout: 40_000 }, async (t) => {
  const { origin, call, pageFor, mail } = await setup(t);
  const recoveryEmail = "portal@example.test";
  const resetPassword = "Fixture reset password";
  assert.equal((await call("/login", { method: "POST", json: {
    role: "client", username: "extra", password: fixtureInitial, newPassword: fixturePassword,
  } })).status, 200);
  const desktop = await pageFor({ viewport: { width: 1366, height: 900 } });
  await desktop.goto(origin + "/area-do-cliente/");
  await desktop.getByLabel("Usuário").fill("extra");
  await desktop.getByLabel("Senha", { exact: true }).fill(fixturePassword);
  await desktop.getByRole("button", { name: "Entrar", exact: true }).click();
  await desktop.getByRole("button", { name: "Configurar e-mail de recuperação" }).click();
  const register = desktop.getByRole("dialog", { name: "E-mail de recuperação" });
  await register.getByLabel("Seu e-mail de recuperação", { exact: true }).fill(recoveryEmail);
  await register.getByLabel("Sua senha atual", { exact: true }).fill(fixturePassword);
  await register.getByRole("button", { name: "Enviar confirmação" }).click();
  await waitFor(register.getByText("Abra o link enviado ao e-mail informado", { exact: false }));
  assert.equal(mail[0].purpose, "verify");
  await register.getByRole("button", { name: "Concluir" }).click();

  const phone = await pageFor();
  await phone.goto(mail[0].url);
  await phone.getByRole("button", { name: "Confirmar meu e-mail" }).click();
  await waitFor(phone.getByRole("heading", { name: "E-mail de recuperação confirmado" }));
  assert.equal(new URL(phone.url()).hash, "");
  await phone.getByRole("button", { name: "Voltar à Área do Cliente" }).click();
  await phone.getByRole("button", { name: "Esqueci minha senha" }).click();
  await phone.getByLabel("E-mail de recuperação cadastrado").fill(recoveryEmail);
  await phone.getByRole("button", { name: "Enviar link de recuperação" }).click();
  await waitFor(phone.getByRole("heading", { name: "Confira sua caixa de entrada" }));
  assert.equal(mail[1].purpose, "reset");

  await phone.goto(mail[1].url);
  await waitFor(phone.getByRole("heading", { name: "Redefinir senha", exact: true }));
  await phone.getByLabel("Nova senha", { exact: true }).fill(resetPassword);
  await phone.getByLabel("Confirme a nova senha", { exact: true }).fill(resetPassword);
  await phone.getByRole("button", { name: "Salvar nova senha" }).click();
  await waitFor(phone.getByRole("heading", { name: "Senha atualizada" }));
  assert.equal(new URL(phone.url()).hash, "");
  if (process.env.PORTAL_QA_SCREENSHOTS) await phone.screenshot({ path: join(process.env.PORTAL_QA_SCREENSHOTS, "portal-reset-success.png"), fullPage: true });
  await desktop.getByRole("button", { name: "Atualizar dados" }).click();
  await waitFor(desktop.getByText("Sua sessão terminou.", { exact: false }));
  await phone.getByRole("button", { name: "Entrar", exact: true }).click();
  await phone.getByLabel("Usuário").fill("extra");
  await phone.getByLabel("Senha", { exact: true }).fill(resetPassword);
  await phone.getByRole("button", { name: "Entrar", exact: true }).click();
  await waitFor(phone.getByRole("heading", { name: "O que você quer fazer?" }));
  await phone.getByRole("button", { name: "E-mail de recuperação", exact: true }).click();
  await waitFor(phone.getByText("E-mail confirmado — p•••@example.test.", { exact: false }));
});

test("Extra mobile intelligence separates confirmed notices, pending coverage and contract evidence", { timeout: 40_000 }, async (t) => {
  const asOf = Date.now() - 60_000;
  const instant = (offset) => new Date(asOf + offset).toISOString();
  const proof = { kind: "edital", url: "https://pncp.gov.br/app/editais/1", sha256: "a".repeat(64), locator: "p. 2" };
  const meta = { scanned: 3, unreviewed: 1, truncated: true, windowStart: "2024-01-01", windowEnd: "2030-01-01" };
  const row = {
    kind: "notice", key: "notice:a", title: "Reforma localizada em São José",
    buyer: "Órgão de exemplo", buyerKey: "org:1", family: "edificacoes", physicalWork: true,
    officialUrl: proof.url, scopeEvidence: proof,
    execution: { basis: "all_execution_sites", sites: [{ code: "4216602", evidence: proof }] },
    notice: { state: "open", closesAt: instant(3_600_000), opensAt: instant(-86_400_000), statusVerifiedAt: instant(-1), evidence: proof },
  };
  const fixture = {
    schema: "confenge.extra-intelligence/v1", producer: "extra-cli", scope: "extra-sc-sao-jose-200/v1",
    mode: "OFFICIAL_LIVE", generatedAt: instant(0), sourceCut: instant(-1), coverage: { notices: meta, contracts: meta },
    records: [row, { ...row, key: "notice:b", officialUrl: proof.url + "/other", title: "Registro bloqueado",
      execution: { basis: "buyer_city", sites: [{ code: "4216602", evidence: proof }] } }],
  };
  const { origin, call, pageFor } = await setup(t, { readIntelligence: (opts) => intelligenceView(fixture, opts) });
  assert.equal((await call("/login", { method: "POST", json: {
    role: "client", username: "extra", password: fixtureInitial, newPassword: fixturePassword,
  } })).status, 200);
  const page = await pageFor({ viewport: { width: 320, height: 850 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/area-do-cliente/#inteligencia");
  await page.getByLabel("Usuário").fill("extra");
  await page.getByLabel("Senha", { exact: true }).fill(fixturePassword);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await waitFor(page.getByRole("heading", { name: "Onde investir tempo nesta semana?" }));
  await waitFor(page.getByText("Reforma localizada em São José"));
  assert.equal(await page.getByText("Registro bloqueado").count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.getByRole("button", { name: "Abrir ficha" }).click();
  await waitFor(page.getByRole("heading", { name: row.title }));
  await waitFor(page.getByRole("link", { name: "Documento de origem" }));
  await page.getByRole("button", { name: "Voltar à lista" }).click();
  await page.getByText("Cobertura e registros em verificação").click();
  await waitFor(page.getByText("Local da execução não comprovado: 1."));
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar em CSV" }).click()]);
  assert.equal(file.suggestedFilename(), "confenge-extra-decidir.csv");
  await page.getByRole("button", { name: "Preparar proposta" }).click();
  await waitFor(page.getByText("Nenhum registro confirmado neste recorte.", { exact: false }));
  await page.getByRole("link", { name: "Início", exact: true }).click();
  await waitFor(page.getByRole("heading", { name: "O que você quer fazer?" }));
  assert.equal(await page.locator(".app--extra-intelligence").count(), 0);
  assert.deepEqual(errors, []);
});

test("login, recovery and workspace share the CONFENGE masthead and fit compact mobile", { timeout: 35_000 }, async (t) => {
  const { origin, call, pageFor } = await setup(t);
  assert.equal((await call("/login", { method: "POST", json: {
    role: "client", username: "extra", password: fixtureInitial, newPassword: fixturePassword,
  } })).status, 200);
  const page = await pageFor({ viewport: { width: 320, height: 568 } });
  const expectBrand = async () => {
    const brand = page.locator(".portal-masthead:visible");
    assert.equal(await brand.count(), 1);
    await waitFor(brand.getByRole("img", { name: "CONFENGE" }));
    const computed = await brand.evaluate((header) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--navy-900)";
      header.append(probe);
      const result = {
        color: getComputedStyle(header).backgroundColor,
        brandToken: getComputedStyle(probe).color,
        font: getComputedStyle(document.body).fontFamily,
        scrolls: document.documentElement.scrollWidth > innerWidth,
        imageLoaded: header.querySelector("img").naturalWidth > 0,
      };
      probe.remove();
      return result;
    });
    assert.equal(computed.color, computed.brandToken);
    assert.match(computed.font, /Archivo Var/);
    assert.equal(computed.scrolls, false);
    assert.equal(computed.imageLoaded, true);
  };
  await page.goto(origin + "/area-do-cliente/");
  const entry = await waitFor(page.getByRole("button", { name: "Entrar", exact: true }));
  await page.evaluate(() => document.fonts.ready);
  await expectBrand();
  const box = await entry.boundingBox();
  assert(box.y + box.height < 568, "the primary login action is in the first viewport");
  const firstAccess = page.locator(".access-guide details");
  assert.equal(await firstAccess.getAttribute("open"), null);
  await page.getByText("Primeiro acesso", { exact: true }).click();
  await waitFor(page.getByText("Entre com a senha temporária", { exact: false }));
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await waitFor(page.getByRole("heading", { name: "Recuperar acesso" }));
  await expectBrand();
  await page.getByRole("button", { name: "Voltar ao login" }).click();
  await page.getByLabel("Usuário").fill("extra");
  await page.getByLabel("Senha", { exact: true }).fill(fixturePassword);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await waitFor(page.getByRole("link", { name: "Inteligência" }));
  await expectBrand();
  assert.equal(await page.getByRole("navigation", { name: "Navegação do portal" }).getByRole("link").count(), 5);
  await page.getByRole("link", { name: "Inteligência" }).click();
  await waitFor(page.getByRole("heading", { name: "Radar de licitações da Extra" }));
  await expectBrand();
  await page.getByRole("button", { name: "Sair" }).click();
  await waitFor(page.getByRole("heading", { name: "Entre na sua conta" }));
  await expectBrand();
});
