import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createPortal } from "../portal/server.mjs";
import { digest, passwordHash } from "../portal/security.mjs";

test("portal keeps data private and persists requests, replies, and released documents", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "cfg-portal-"));
  const initial = "Initial fixture password";
  const activation = "independent activation value";
  const importToken = "independent initial import";
  writeFileSync(join(directory, "setup.json"), JSON.stringify({
    client: await passwordHash(initial),
    admin: await passwordHash(initial),
    adminActivation: digest(activation),
    importToken: digest(importToken),
    importExpiresAt: new Date(Date.now() + 60_000),
  }));
  let origin;
  let portal;
  const server = http.createServer((req, res) => portal.handle(req, res));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    portal?.close();
    rmSync(directory, { recursive: true, force: true });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
  portal = createPortal({ origin, directory });
  const call = (path, { method = "GET", cookie, json, headers = {}, body, sameOrigin = true } = {}) =>
    fetch(origin + "/api/portal" + path, {
      method,
      headers: { ...headers, ...(sameOrigin ? { Origin: origin } : {}),
        ...(cookie ? { Cookie: cookie } : {}), ...(json ? { "Content-Type": "application/json" } : {}) },
      body: json ? JSON.stringify(json) : body,
    });
  const login = (role, params = {}) => call("/login", { method: "POST", json: {
    role, username: role === "admin" ? "admincfg" : "EXTRA", password: initial, ...params,
  } });

  const page = await fetch(origin + "/area-do-cliente/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("x-robots-tag"), /noindex/);
  assert.match(page.headers.get("cache-control"), /no-store/);
  await page.text();
  const ui = await fetch(origin + "/api/portal/interface.css");
  assert.equal(ui.status, 200);
  assert.match(ui.headers.get("content-type"), /^text\/css/);
  assert.match(await ui.text(), /--focus-ring/);
  assert.equal((await call("/dashboard")).status, 401);
  assert.equal((await call("/login", { method: "POST", sameOrigin: false })).status, 403);
  assert.equal((await login("admin")).status, 401);
  assert.equal((await login("client", { username: " extra " })).status, 409);
  assert.equal((await login("client", { username: "wrong account" })).status, 401);
  const clientLogin = await login("client", { username: "extra", newPassword: "Client password fixture" });
  const adminLogin = await login("admin", { activationCode: activation, newPassword: "Admin password fixture" });
  assert.equal(clientLogin.status, 200);
  assert.equal(adminLogin.status, 200);
  const adminHeader = adminLogin.headers.get("set-cookie");
  assert.match(adminHeader, /HttpOnly; Secure; SameSite=Strict/);
  const admin = adminHeader.split(";", 1)[0];
  const client = clientLogin.headers.get("set-cookie").split(";", 1)[0];
  assert.equal((await login("admin", { activationCode: activation })).status, 401);
  assert.equal((await login("client")).status, 401);
  const repeatLogin = await login("client", { password: "Client password fixture" });
  assert.equal(repeatLogin.status, 200);
  assert.match(repeatLogin.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Strict/);

  const opportunityId = "00000000000000-1-000001/2026";
  const control = { rows: [{ id: opportunityId, object: "Obra de teste", group: "Propostas" }] };
  const importHeaders = { Authorization: "Bearer " + importToken };
  assert.equal((await call("/control", { method: "POST", cookie: client, json: control })).status, 403);
  assert.equal((await call("/control", { method: "POST", headers: importHeaders, json: control })).status, 200);
  assert.equal((await call("/finish-import", { method: "POST", headers: importHeaders })).status, 200);
  assert.equal((await call("/control", { method: "POST", headers: importHeaders, json: control })).status, 401);
  const ticket = await call("/tickets", {
    method: "POST", cookie: client, json: {
      category: "proposta", subject: "Solicitação de proposta", body: "Elaborar proposta.", opportunityId,
    },
  });
  assert.equal(ticket.status, 201);
  const { id } = await ticket.json();
  const thread = "/tickets/" + id;
  const adminDash = await (await call("/dashboard", { cookie: admin })).json();
  assert.equal(adminDash.tickets[0].unread, true);
  assert.match(adminDash.tools.postiz, /^https:\/\/postiz\./);
  assert.equal((await call(thread, { method: "PATCH", cookie: client, json: { status: "concluido" } })).status, 403);
  assert.equal((await call(thread, { method: "PATCH", cookie: admin, json: { status: "em_analise" } })).status, 200);
  assert.equal((await call(thread + "/messages", { method: "POST", cookie: admin, json: { body: "Recebida." } })).status, 201);

  const file = Buffer.from("%PDF-1.7\nFixture protegida\n");
  const doc = { method: "POST", headers: { "x-portal-filename": "proposta.pdf", "x-portal-ticket": id }, body: file };
  assert.equal((await call("/documents", { ...doc, cookie: client })).status, 403);
  const uploaded = await call("/documents", { ...doc, cookie: admin });
  assert.equal(uploaded.status, 201);
  const fileId = (await uploaded.json()).id;
  assert.equal((await (await call("/documents", { ...doc, cookie: admin })).json()).id, fileId);
  const filePath = "/documents/" + fileId;
  assert.equal((await call(filePath)).status, 401);
  const download = await call(filePath, { cookie: client });
  assert.match(download.headers.get("content-disposition"), /^attachment;/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), file);

  portal.close();
  portal = createPortal({ origin, directory });
  const clientDash = await (await call("/dashboard", { cookie: client })).json();
  assert.equal(clientDash.tools, undefined);
  assert.equal(clientDash.tickets[0].unread, true);
  assert.equal(clientDash.documents[0].opportunityId, opportunityId);
  const conversation = await (await call(thread, { cookie: client })).json();
  assert.equal(conversation.ticket.unread, false);
  assert.equal(conversation.ticket.status, "em_analise");
  assert.equal(conversation.messages[1].body, "Recebida.");
  assert.ok(readFileSync(join(directory, "portal.sqlite")).length);
  assert.equal((await call("/logout", { method: "POST", cookie: client })).status, 200);
  assert.equal((await call("/session", { cookie: client })).status, 401);
});
