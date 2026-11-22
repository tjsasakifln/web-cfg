import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openPortalStore } from "./store.mjs";
import {
  accounts, digest, equalDigest, getSessionToken, isPasswordHash, passwordHash,
  randomToken, sessionCookie, sessionLifetime, verifyPassword,
} from "./security.mjs";

const api = "/api/portal";
const pages = new Set(["/area-do-cliente/", "/portal-interno/"]);
const portalHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const pageHeaders = {
  ...portalHeaders,
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
const categories = new Set(["proposta", "documentos", "habilitacao", "orcamento", "contrato", "outro"]);
const statuses = new Set(["aberto", "em_analise", "aguardando_cliente", "concluido"]);
const fileTypes = {
  pdf: "application/pdf",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};
const maxFile = 20 * 1024 * 1024;
const loginWindow = 10 * 60 * 1000;

class PortalError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
  }
}

function fail(status, code) {
  throw new PortalError(status, code);
}

function send(res, status, value, extra = {}) {
  res.writeHead(status, { ...portalHeaders, "Content-Type": "application/json; charset=utf-8", ...extra });
  res.end(JSON.stringify(value));
}

function cleanText(value, max, required = true) {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    fail(422, "invalid_field");
  }
  return value.trim();
}

function optionalText(value, max) {
  return value == null ? "" : cleanText(value, max, false);
}

async function readBody(req, limit) {
  if (Number(req.headers["content-length"] || 0) > limit) {
    req.resume();
    fail(413, "body_too_large");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) {
      req.resume();
      fail(413, "body_too_large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

async function readJson(req, limit = 16 * 1024) {
  if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json") {
    fail(415, "json_required");
  }
  const body = await readBody(req, limit);
  let data;
  try { data = JSON.parse(body.toString("utf8")); } catch { fail(400, "invalid_json"); }
  if (!data || typeof data !== "object" || Array.isArray(data)) fail(400, "invalid_json");
  return data;
}

function header(req, name) {
  const value = req.headers["x-portal-" + name];
  try { return value ? decodeURIComponent(value) : ""; } catch { fail(422, "invalid_field"); }
}

function cleanFileName(value) {
  const filename = cleanText(value, 180);
  if (/[\\/\r\n]/.test(filename) || !/\.[A-Za-z]+$/.test(filename)) fail(422, "invalid_filename");
  return filename;
}

const extension = (filename) => filename.split(".").at(-1).toLowerCase();

function validateFile(content, ext) {
  const prefix = content.subarray(0, 5).toString("ascii");
  if (!content.length || (ext === "pdf" && prefix !== "%PDF-")
    || (["zip", "docx", "xlsx"].includes(ext) && (content.length < 4 || content.readUInt32LE(0) !== 0x04034b50))) {
    fail(422, "invalid_file");
  }
}

function attachment(filename) {
  const safeAscii = filename.normalize("NFKD").replace(/[^a-zA-Z0-9._ -]+/g, "_");
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename).replace(
    /['()*]/g, (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase(),
  )}`;
}

function optionalId(value) {
  const id = optionalText(value, 96);
  if (!id) return null;
  if (!/^[A-Za-z0-9._:/|-]+$/.test(id)) fail(422, "invalid_id");
  return id;
}

function httpsUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { /* Invalid or non-HTTPS links are omitted. */ }
  return "";
}

function controlSnapshot(data, now) {
  if (!Array.isArray(data.rows) || !data.rows.length || data.rows.length > 5000) fail(422, "invalid_control");
  const seen = new Set();
  const rows = data.rows.map((row) => {
    if (!row || typeof row !== "object") fail(422, "invalid_control");
    const id = optionalId(row.id);
    if (!id) fail(422, "invalid_id");
    const date = optionalText(row.date, 50);
    const group = optionalText(row.group, 80) || "Propostas";
    const key = JSON.stringify([group, id]);
    if (seen.has(key)) fail(422, "duplicate_opportunity");
    seen.add(key);
    return {
      id, object: cleanText(row.object, 800), agency: optionalText(row.agency, 350),
      location: optionalText(row.location, 180), number: optionalText(row.number, 180),
      date, value: optionalText(row.value == null ? "" : String(row.value), 90),
      status: optionalText(row.status, 320), stage: optionalText(row.stage, 320),
      url: httpsUrl(optionalText(row.url, 1100)), group,
    };
  });
  let sourceUpdatedAt = null;
  if (data.sourceUpdatedAt) {
    const sourceTime = Date.parse(cleanText(data.sourceUpdatedAt, 50));
    if (!Number.isFinite(sourceTime)) fail(422, "invalid_control");
    sourceUpdatedAt = new Date(sourceTime).toISOString();
  }
  return { updatedAt: new Date(now).toISOString(), sourceUpdatedAt, rows };
}

export function isPortalRoute(url = "") {
  const path = url.split("?", 1)[0];
  return pages.has(path) || path.startsWith(api + "/") || path === api;
}

export function createPortal({
  directory, origin = "https://confenge.com.br", logger = () => {},
} = {}) {
  let store;
  let shell;
  let interfaceStyle;
  let loginJobs = 0;
  let globalAttempts = 0;
  let resetAt = 0;
  let uploadActive = false;
  const attempts = new Map();
  const getStore = () => {
    if (!directory) fail(503, "portal_unavailable");
    return store ||= openPortalStore(directory);
  };
  const getSetup = () => {
    if (!directory) return {};
    try { return JSON.parse(readFileSync(join(directory, "setup.json"), "utf8")); }
    catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  };

  async function login(req, res, now) {
    if (now >= resetAt) {
      resetAt = now + loginWindow;
      globalAttempts = 0;
      attempts.clear();
    }
    const ip = req.headers["x-real-ip"] || req.socket.remoteAddress;
    const peerAttempts = (attempts.get(ip) || 0) + 1;
    if (peerAttempts > 20 || globalAttempts >= 240 || loginJobs >= 3) {
      fail(429, "too_many_attempts");
    }
    attempts.set(ip, peerAttempts);
    globalAttempts++;
    loginJobs++;
    try {
      const { role, username, password, activationCode, newPassword } = await readJson(req);
      if (typeof role !== "string" || !Object.hasOwn(accounts, role) || typeof username !== "string"
        || typeof password !== "string" || !password || password.length > 256) {
        fail(401, "invalid_credentials");
      }
      const db = getStore();
      const existing = db.account(role);
      const setup = existing ? null : getSetup();
      const initialHash = setup?.[role];
      if (!existing && !isPasswordHash(initialHash)) fail(503, "portal_unavailable");
      const matches = await verifyPassword(password, existing?.password || initialHash);
      if (!matches || username !== accounts[role]
        || (!existing && role === "admin" && !equalDigest(activationCode, setup.adminActivation))) {
        fail(401, "invalid_credentials");
      }
      let newHash;
      if (!existing) {
        if (newPassword == null || newPassword === "") fail(409, "password_change_required");
        if (typeof newPassword !== "string" || newPassword.length < 14 || newPassword.length > 256
          || newPassword.trim().length < 14 || newPassword === password) {
          fail(422, "invalid_new_password");
        }
        newHash = await passwordHash(newPassword);
      }
      const token = randomToken();
      if (!db.login({ role, currentHash: existing?.password ?? null, newHash, token: digest(token),
        now, expires: now + sessionLifetime * 1000 })) fail(409, "retry_login");
      const oldToken = getSessionToken(req);
      if (oldToken) db.logout(digest(oldToken));
      return send(res, 200, { role, username: accounts[role] }, { "Set-Cookie": sessionCookie(token) });
    } finally {
      loginJobs--;
    }
  }

  function validateOpportunity(db, opportunityId) {
    if (opportunityId && !JSON.parse(db.setting("control") || "null")?.rows.some((row) => row.id === opportunityId)) {
      fail(422, "unknown_opportunity");
    }
  }

  async function upload(req, res, db, now) {
    if (uploadActive) fail(429, "upload_in_progress");
    const filename = cleanFileName(header(req, "filename"));
    const ext = extension(filename);
    if (!Object.hasOwn(fileTypes, ext)) fail(415, "unsupported_file");
    const title = optionalText(header(req, "title"), 220) || filename;
    const ticketId = optionalId(header(req, "ticket"));
    const ticket = ticketId ? db.ticket(ticketId) : null;
    if (ticketId && !ticket) fail(404, "ticket_not_found");
    const opportunityId = optionalId(header(req, "opportunity")) || ticket?.opportunityId || null;
    if (opportunityId !== ticket?.opportunityId) validateOpportunity(db, opportunityId);
    uploadActive = true;
    try {
      const content = await readBody(req, maxFile);
      validateFile(content, ext);
      const id = db.addDocument({ id: randomUUID(), filename, title, ticketId, opportunityId,
        now: new Date(now).toISOString(), checksum: digest(content), content });
      return send(res, 201, { id });
    } finally {
      uploadActive = false;
    }
  }

  const handle = async (req, res) => {
    try {
      const path = req.url.split("?", 1)[0];
      const { method } = req;
      if (pages.has(path)) {
        if (!["GET", "HEAD"].includes(method)) fail(405, "method_not_allowed");
        shell ||= readFileSync(new URL("./shell.html.template", import.meta.url), "utf8");
        res.writeHead(200, pageHeaders);
        return res.end(method === "HEAD" ? undefined : shell);
      }
      const op = path.slice(api.length);
      if (op === "/interface.css" && ["GET", "HEAD"].includes(method)) {
        interfaceStyle ||= readFileSync(new URL("./interface.css.template", import.meta.url), "utf8");
        res.writeHead(200, { ...portalHeaders, "Content-Type": "text/css; charset=utf-8" });
        return res.end(method === "HEAD" ? undefined : interfaceStyle);
      }
      if (!["GET", "HEAD"].includes(method) && req.headers.origin !== origin) fail(403, "invalid_origin");
      const now = Date.now();
      if (op === "/login" && method === "POST") return await login(req, res, now);

      const db = getStore();
      const token = getSessionToken(req);
      const role = token ? db.session(digest(token), now)?.role : null;
      const importAction = method === "POST" && ["/control", "/documents", "/finish-import"].includes(op);
      const authorization = req.headers.authorization || "";
      const setup = authorization.startsWith("Bearer ") && importAction ? getSetup() : {};
      const seed = importAction && !db.setting("import_closed") && now < Date.parse(setup.importExpiresAt)
        && equalDigest(authorization.slice(7), setup.importToken);
      if (!role && !seed) fail(401, "login_required");

      if (op === "/session" && method === "GET") return send(res, 200, { role, username: accounts[role] });
      if (op === "/logout" && method === "POST") {
        db.logout(digest(token));
        return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
      }
      if (op === "/dashboard" && method === "GET") {
        const data = { tickets: db.tickets(role), documents: db.documents(), control: JSON.parse(db.setting("control") || "null") };
        if (role === "admin") data.tools = { twenty: "https://gestao.confenge.com.br", postiz: "https://postiz.confenge.com.br" };
        return send(res, 200, data);
      }
      if (op === "/control" && method === "POST") {
        if (role !== "admin" && !seed) fail(403, "forbidden");
        const snapshot = controlSnapshot(await readJson(req, 2 * 1024 * 1024), now);
        const previous = JSON.parse(db.setting("control") || "null");
        if (previous?.sourceUpdatedAt && snapshot.sourceUpdatedAt && snapshot.sourceUpdatedAt < previous.sourceUpdatedAt) {
          fail(409, "stale_control");
        }
        db.setSetting("control", JSON.stringify(snapshot));
        return send(res, 200, { updatedAt: snapshot.updatedAt, count: snapshot.rows.length });
      }
      if (op === "/finish-import" && seed) {
        db.setSetting("import_closed", new Date(now).toISOString());
        return send(res, 200, { ok: true, documents: db.documents().length,
          rows: JSON.parse(db.setting("control") || "null")?.rows.length || 0 });
      }
      if (op === "/documents" && method === "POST") {
        if (role !== "admin" && !seed) fail(403, "forbidden");
        return await upload(req, res, db, now);
      }
      const documentMatch = /^\/documents\/([a-f0-9-]{36})$/.exec(op);
      if (documentMatch && method === "GET") {
        const document = db.document(documentMatch[1]);
        if (!document) fail(404, "document_not_found");
        res.writeHead(200, { ...portalHeaders, "Content-Type": fileTypes[extension(document.filename)],
          "Content-Length": document.size, "Content-Disposition": attachment(document.filename),
          "Content-Security-Policy": "sandbox; default-src 'none'" });
        return res.end(document.content);
      }
      const timestamp = new Date(now).toISOString();
      if (op === "/tickets" && method === "POST") {
        if (role !== "client") fail(403, "forbidden");
        const { category, subject, body, opportunityId } = await readJson(req);
        if (!categories.has(category)) fail(422, "invalid_category");
        const id = randomUUID();
        const linked = optionalId(opportunityId);
        validateOpportunity(db, linked);
        db.createTicket(id, category, cleanText(subject, 200), cleanText(body, 5000), linked, timestamp);
        return send(res, 201, { id });
      }
      const ticketMatch = /^\/tickets\/([a-f0-9-]{36})(\/messages)?$/.exec(op);
      if (ticketMatch) {
        const [, id, messages] = ticketMatch;
        const ticket = db.ticket(id);
        if (!ticket) fail(404, "ticket_not_found");
        if (!messages && method === "GET") return send(res, 200, db.openTicket(id, role));
        if (!messages && method === "PATCH") {
          if (role !== "admin") fail(403, "forbidden");
          const data = await readJson(req);
          const current = db.ticket(id);
          const category = data.category ?? current.category;
          const status = data.status ?? current.status;
          if (!categories.has(category) || !statuses.has(status)) fail(422, "invalid_status");
          db.updateTicket(id, category, status, timestamp);
          return send(res, 200, { ok: true });
        }
        if (messages && method === "POST") {
          const data = await readJson(req);
          db.addMessage(id, role, cleanText(data.body, 5000), timestamp);
          return send(res, 201, { ok: true });
        }
      }
      fail(404, "not_found");
    } catch (error) {
      if (!(error instanceof PortalError)) {
        logger("error", "portal_failed", { error_code: error.code || error.name });
      }
      if (!res.headersSent) return send(res, error.status || 500, { error: error.status ? error.message : "portal_unavailable" });
      res.destroy();
    }
  };
  return { handle, close: () => store?.close() };
}
