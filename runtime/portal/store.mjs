import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const ticketFields = `id, category, status, subject, opportunity_id AS opportunityId,
  updated_at AS updatedAt, max_message > CASE ? WHEN 'client' THEN read_client ELSE read_admin END AS unread`;
const docFields = `id, filename AS name, title, ticket_id AS ticketId, opportunity_id AS opportunityId,
  created_at AS createdAt, size`;

export function openPortalStore(directory) {
  const { DatabaseSync } = require("node:sqlite");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(directory, "portal.sqlite"));
  db.exec(`
    PRAGMA busy_timeout = 3000;
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS accounts (
      role TEXT PRIMARY KEY CHECK(role IN ('client','admin')), password TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, role TEXT NOT NULL REFERENCES accounts(role), expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY, category TEXT NOT NULL, status TEXT NOT NULL, subject TEXT NOT NULL,
      opportunity_id TEXT, updated_at TEXT NOT NULL,
      max_message INTEGER NOT NULL DEFAULT 0, read_client INTEGER NOT NULL DEFAULT 0,
      read_admin INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES tickets(id), role TEXT NOT NULL,
      body TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_ticket ON messages(ticket_id, id);
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, filename TEXT NOT NULL, title TEXT NOT NULL,
      ticket_id TEXT REFERENCES tickets(id), opportunity_id TEXT,
      created_at TEXT NOT NULL, size INTEGER NOT NULL, checksum TEXT NOT NULL, content BLOB NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS documents_dedup ON documents(checksum, filename, title,
      ifnull(ticket_id, ''), ifnull(opportunity_id, ''));
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS recovery_addresses (
      role TEXT PRIMARY KEY REFERENCES accounts(role), email TEXT NOT NULL, verified_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recovery_links (
      token_hash TEXT PRIMARY KEY, role TEXT NOT NULL REFERENCES accounts(role),
      purpose TEXT NOT NULL CHECK(purpose IN ('verify', 'reset')), email TEXT NOT NULL,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS recovery_links_rate ON recovery_links(role, purpose, created_at);
  `);

  const statement = (sql) => db.prepare(sql);
  const rows = (sql, ...args) => statement(sql).all(...args);
  const one = (sql, ...args) => statement(sql).get(...args);
  const write = (sql, ...args) => statement(sql).run(...args);

  function transaction(operation) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function appendMessage(id, role, body, now) {
    const { lastInsertRowid } = write(
      "INSERT INTO messages (ticket_id, role, body, created_at) VALUES (?, ?, ?, ?)", id, role, body, now,
    );
    const readField = role === "client" ? "read_client" : "read_admin";
    write(`UPDATE tickets SET max_message = ?, ${readField} = ?, updated_at = ? WHERE id = ?`,
      lastInsertRowid, lastInsertRowid, now, id);
  }

  return {
    close: () => db.close(),
    account: (role) => one("SELECT password FROM accounts WHERE role = ?", role),
    session: (token, now) => one("SELECT role FROM sessions WHERE token = ? AND expires_at > ?", token, now),
    login({ role, currentHash, newHash, token, now, expires }) {
      return transaction(() => {
        const account = one("SELECT password FROM accounts WHERE role = ?", role);
        if ((account?.password ?? null) !== currentHash) return false;
        if (newHash) {
          write("INSERT INTO accounts (role, password) VALUES (?, ?)", role, newHash);
        }
        write("DELETE FROM sessions WHERE expires_at <= ?", now);
        write("INSERT INTO sessions (token, role, expires_at) VALUES (?, ?, ?)", token, role, expires);
        return true;
      });
    },
    logout: (token) => write("DELETE FROM sessions WHERE token = ?", token),
    recoveryAddress: (role) => one("SELECT email FROM recovery_addresses WHERE role = ?", role)?.email || null,
    recoveryLink: (tokenHash, purpose, now) => one(`SELECT role FROM recovery_links WHERE token_hash = ? AND purpose = ? AND expires_at > ? AND revoked = 0`,
      tokenHash, purpose, now),
    issueRecoveryLink({ role, purpose, email, tokenHash, expectedPasswordHash, now, expires, windowMs, max, cooldownMs }) {
      return transaction(() => {
        if (one("SELECT password FROM accounts WHERE role = ?", role)?.password !== expectedPasswordHash) return false;
        if (purpose === "reset" && one("SELECT email FROM recovery_addresses WHERE role = ?", role)?.email !== email) return false;
        write("DELETE FROM recovery_links WHERE created_at <= ?", now - windowMs);
        const usage = one(`SELECT COUNT(*) AS count, MAX(created_at) AS latest FROM recovery_links
          WHERE role = ? AND purpose = ? AND created_at > ?`, role, purpose, now - windowMs);
        if (usage.count >= max || (usage.latest !== null && now - usage.latest < cooldownMs)) return false;
        if (purpose === "verify") write("UPDATE recovery_links SET revoked = 1 WHERE role = ? AND purpose = 'verify'", role);
        write(`INSERT INTO recovery_links (token_hash, role, purpose, email, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?)`, tokenHash, role, purpose, email, now, expires);
        return true;
      });
    },
    revokeRecoveryLink: (tokenHash) => write("UPDATE recovery_links SET revoked = 1 WHERE token_hash = ?", tokenHash),
    // Credential replacement and link/session revocation share one transaction.
    // Recovery rows do not store a copy or fingerprint of account credentials.
    consumeRecoveryLink({ tokenHash, purpose, now, expectedPasswordHash, newHash }) {
      return transaction(() => {
        const link = one(`SELECT role, email FROM recovery_links WHERE token_hash = ? AND purpose = ?
          AND expires_at > ? AND revoked = 0`, tokenHash, purpose, now);
        if (!link || one("SELECT password FROM accounts WHERE role = ?", link.role)?.password !== expectedPasswordHash) return false;
        if (purpose === "reset") {
          if (one("SELECT email FROM recovery_addresses WHERE role = ?", link.role)?.email !== link.email) return false;
          write("UPDATE accounts SET password = ? WHERE role = ?", newHash, link.role);
          write("DELETE FROM sessions WHERE role = ?", link.role);
        } else {
          write(`INSERT INTO recovery_addresses (role, email, verified_at) VALUES (?, ?, ?)
            ON CONFLICT(role) DO UPDATE SET email = excluded.email, verified_at = excluded.verified_at`,
            link.role, link.email, now);
        }
        write("UPDATE recovery_links SET revoked = 1 WHERE role = ?", link.role);
        return true;
      });
    },
    tickets: (role) => rows(`SELECT ${ticketFields} FROM tickets ORDER BY updated_at DESC, id`, role)
      .map((ticket) => ({ ...ticket, unread: Boolean(ticket.unread) })),
    ticket: (id) => one("SELECT id, category, status, opportunity_id AS opportunityId FROM tickets WHERE id = ?", id),
    openTicket(id, role) {
      return transaction(() => {
        const ticket = one(`SELECT ${ticketFields} FROM tickets WHERE id = ?`, role, id);
        if (!ticket) return null;
        const readField = role === "client" ? "read_client" : "read_admin";
        write(`UPDATE tickets SET ${readField} = max_message WHERE id = ?`, id);
        const messages = rows("SELECT role, body, created_at AS createdAt FROM messages WHERE ticket_id = ? ORDER BY id", id);
        return { ticket: { ...ticket, unread: false }, messages };
      });
    },
    createTicket(id, category, subject, body, opportunityId, now) {
      return transaction(() => {
        write(`INSERT INTO tickets (id, category, status, subject, opportunity_id, updated_at)
          VALUES (?, ?, 'aberto', ?, ?, ?)`, id, category, subject, opportunityId, now);
        appendMessage(id, "client", body, now);
      });
    },
    addMessage: (...args) => transaction(() => appendMessage(...args)),
    updateTicket(id, category, status, now) {
      return write("UPDATE tickets SET category = ?, status = ?, updated_at = ? WHERE id = ?", category, status, now, id);
    },
    documents: () => rows(`SELECT ${docFields} FROM documents ORDER BY created_at DESC, id`),
    document: (id) => one("SELECT filename, size, content FROM documents WHERE id = ?", id),
    addDocument({ id, filename, title, ticketId, opportunityId, now, checksum, content }) {
      return transaction(() => {
        const duplicate = one(`SELECT id FROM documents WHERE checksum = ? AND filename = ? AND title = ?
          AND ticket_id IS ? AND opportunity_id IS ?`, checksum, filename, title, ticketId, opportunityId);
        if (duplicate) return duplicate.id;
        write(`INSERT INTO documents (id, filename, title, ticket_id, opportunity_id, created_at, size, checksum, content)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, filename, title, ticketId, opportunityId, now,
        content.length, checksum, content);
        return id;
      });
    },
    setting: (key) => one("SELECT value FROM settings WHERE key = ?", key)?.value || null,
    setSetting: (key, value) => write(`INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT DO UPDATE SET value = excluded.value`, key, value),
  };
}
