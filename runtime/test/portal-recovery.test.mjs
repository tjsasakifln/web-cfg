import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createPortal } from "../portal/server.mjs";
import { createRecoveryMailer } from "../portal/recovery-mail.mjs";
import { digest, passwordHash } from "../portal/security.mjs";
import { DatabaseSync } from "node:sqlite";

test("recovery requires a confirmed address, sends generic public responses, expires, and revokes sessions on one-time use", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "cfg-recovery-"));
  const temporary = "Fixture temporary passphrase";
  const original = "Fixture original password";
  const next = "Fixture changed password";
  const another = "Fixture rejected password";
  const activation = "Fixture admin activation";
  const mailbox = "fixture@example.test";
  writeFileSync(join(directory, "setup.json"), JSON.stringify({
    client: await passwordHash(temporary), admin: await passwordHash(temporary), adminActivation: digest(activation),
  }));
  let portal;
  let time = Date.now();
  const delivery = [];
  const server = http.createServer((req, res) => portal.handle(req, res));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    portal?.close();
    rmSync(directory, { recursive: true, force: true });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  portal = createPortal({ origin, directory, clock: () => time, deliverRecovery: async (mail) => { delivery.push(mail); } });
  const call = (path, json, cookie, requestOrigin = origin) => fetch(origin + "/api/portal" + path, {
    method: json ? "POST" : "GET",
    headers: { Origin: requestOrigin, ...(json ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    ...(json ? { body: JSON.stringify(json) } : {}),
  });
  const cookieFor = (response) => response.headers.get("set-cookie").split(";")[0];
  const tokenFor = (mail) => new URL(mail.url).hash.split("=")[1];
  const start = await call("/login", { role: "client", username: "extra", password: temporary, newPassword: original });
  assert.equal(start.status, 200);
  const cookie = cookieFor(start);
  const anotherSession = cookieFor(await call("/login", { role: "client", username: "extra", password: original }));
  const adminCookie = cookieFor(await call("/login", {
    role: "admin", username: "admincfg", password: temporary, newPassword: original, activationCode: activation,
  }));

  assert.equal((await call("/recovery/email", { email: mailbox, password: original })).status, 401);
  assert.equal((await call("/recovery/email", { email: mailbox, password: original }, adminCookie)).status, 403);
  assert.equal((await call("/recovery/email", { email: mailbox, password: "Fixture wrong password" }, cookie)).status, 401);
  assert.equal((await call("/recovery/request", { email: mailbox }, null, "https://other.example")).status, 403);
  const before = await call("/recovery/request", { email: mailbox });
  assert.equal(before.status, 202);
  const generic = await before.json();
  assert.deepEqual(generic, { ok: true });
  assert.equal(delivery.length, 0);

  assert.equal((await call("/recovery/email", { email: "fixture@EXAMPLE.TEST", password: original }, cookie)).status, 202);
  assert.match(delivery[0].url, /\/area-do-cliente\/#confirmar-email=[\w-]{43}$/);
  assert.equal(delivery[0].email, mailbox);
  const verifyToken = tokenFor(delivery[0]);
  const db = new DatabaseSync(join(directory, "portal.sqlite"), { readOnly: true });
  try {
    const record = db.prepare("SELECT token_hash FROM recovery_links").get();
    assert.equal(record.token_hash, digest(verifyToken));
    assert.notEqual(record.token_hash, verifyToken);
    const columns = db.prepare("PRAGMA table_info(recovery_links)").all().map((column) => column.name);
    assert.ok(columns.every((name) => !/password|credential/.test(name)));
  } finally { db.close(); }
  assert.equal((await call("/recovery/reset", { token: verifyToken, newPassword: another })).status, 410);
  assert.equal((await call("/recovery/email", { email: mailbox, password: original }, cookie)).status, 429);
  assert.deepEqual((await (await call("/dashboard", null, cookie)).json()).recovery, { available: true, email: null });
  assert.equal((await call("/recovery/confirm", { token: verifyToken })).status, 200);
  assert.equal((await call("/recovery/confirm", { token: verifyToken })).status, 410);
  assert.deepEqual((await (await call("/dashboard", null, cookie)).json()).recovery, { available: true, email: "f•••@example.test" });

  const unknown = await call("/recovery/request", { email: "other@example.test" });
  assert.equal(unknown.status, 202);
  assert.deepEqual(await unknown.json(), generic);
  assert.equal(delivery.length, 1);
  const requested = await call("/recovery/request", { email: mailbox });
  assert.equal(requested.status, 202);
  assert.deepEqual(await requested.json(), generic);
  assert.match(requested.headers.get("cache-control"), /no-store/);
  assert.match(delivery[1].url, /\/area-do-cliente\/#redefinir-senha=[\w-]{43}$/);
  assert.deepEqual(await (await call("/recovery/request", { email: mailbox })).json(), generic);
  assert.equal(delivery.length, 2);
  time += 30 * 60 * 1000;
  assert.equal((await call("/recovery/reset", { token: tokenFor(delivery[1]), newPassword: next })).status, 410);
  await call("/recovery/request", { email: mailbox });
  const resetToken = tokenFor(delivery[2]);
  time += 60_001;
  await call("/recovery/request", { email: mailbox });
  const parallelLink = tokenFor(delivery[3]);
  assert.equal((await call("/recovery/reset", { token: resetToken, newPassword: "too short" })).status, 422);
  const concurrent = await Promise.all([
    call("/recovery/reset", { token: resetToken, newPassword: next }),
    call("/recovery/reset", { token: resetToken, newPassword: next }),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 410]);
  assert.equal((await call("/recovery/reset", { token: parallelLink, newPassword: another })).status, 410);
  assert.equal((await call("/session", null, cookie)).status, 401);
  assert.equal((await call("/session", null, anotherSession)).status, 401);
  assert.equal((await call("/session", null, adminCookie)).status, 200);
  assert.equal((await call("/login", { role: "client", username: "extra", password: original })).status, 401);
  assert.equal((await call("/login", { role: "client", username: "extra", password: next })).status, 200);
});

test("recovery mail uses the configured transactional sender without embedding credentials", async () => {
  let sent;
  assert.equal(createRecoveryMailer({}), null);
  const deliver = createRecoveryMailer({ RESEND_API_KEY: "fixture_key", RESEND_FROM: "CONFENGE <portal@example.test>" }, async (url, options) => {
    sent = { url, headers: options.headers, body: JSON.parse(options.body) };
    return new Response("{}", { status: 200 });
  });
  const url = "https://confenge.com.br/area-do-cliente/#redefinir-senha=fixture";
  await deliver({ email: "fixture@example.test", purpose: "reset", url, idempotencyKey: "hash-fixture" });
  assert.equal(sent.url, "https://api.resend.com/emails");
  assert.equal(sent.headers["Idempotency-Key"], "portal-recovery/hash-fixture");
  assert.equal(sent.body.from, "CONFENGE <portal@example.test>");
  assert.deepEqual(sent.body.to, ["fixture@example.test"]);
  assert.ok(sent.body.text.includes(url));
  assert.ok(!JSON.stringify(sent.body).includes("fixture_key"));
  assert.equal(sent.body.html, undefined);
});
