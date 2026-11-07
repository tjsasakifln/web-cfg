/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file — errors carry a `code`; the hub words them. */
/**
 * handoff.js (hub) — hand a file to an app window without uploading it (H.5, H.6, C.7). Writes the same IndexedDB
 * record the apps' own handoff.js reads (canonical: bimcraft/dev/handoff.js, owner `bim`): database "cadcraft-handoff",
 * store "files", key = a lower-case UUID, value {file, name, from, at}. The receiving app opens
 * `apps/<slug>/index.html?handoff=<id>`, takes the record (read + delete) and opens the file as if it were dropped.
 * Kept as the hub's own small writer (the hub never imports an app's folder); `test/test-hub.mjs` checks the two
 * formats still agree.
 */

export const DB = 'cadcraft-handoff';
export const STORE = 'files';
export const MAX_AGE_MS = 10 * 60 * 1000;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const newHandoffId = () => globalThis.crypto.randomUUID().toLowerCase();

function openDb(factory) {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(Object.assign(new Error('storage refused'), { code: 'storage' }));
  });
}

/** Store `file` (a File or Blob with a name) for the app window that opens with ?handoff=<id>. */
export async function putHandoff(id, file, from = 'studio', factory = globalThis.indexedDB) {
  if (!ID_RE.test(id)) throw new Error('bad handoff id');
  const db = await openDb(factory);
  try {
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      const s = t.objectStore(STORE);
      const old = Date.now() - MAX_AGE_MS;
      const c = s.openCursor();
      c.onsuccess = () => { const cur = c.result; if (!cur) return; if (!(cur.value && cur.value.at > old)) cur.delete(); cur.continue(); };
      s.put({ file, name: file.name, from: String(from || ''), at: Date.now() }, id);
      t.oncomplete = () => resolve();
      t.onerror = t.onabort = () => reject(Object.assign(new Error((t.error && t.error.message) || 'storage failed'), { code: 'storage' }));
    });
  } finally { db.close(); }
}

/** Take (read and delete) the record under `id`, or null (none, too old, malformed id). Same format the apps' handoff.js read;
 *  EG.78 (drag between apps): the window's drag module takes what another app's window put there. */
export async function takeHandoff(id, factory = globalThis.indexedDB, { waitMs = 0 } = {}) {
  const key = String(id || '').toLowerCase();
  if (!ID_RE.test(key)) return null;
  const until = Date.now() + waitMs;
  for (;;) {   // the source writes the file while the drag is on: wait a little for it
    const got = await takeOnce(key, factory);
    if (got || Date.now() >= until) return got;
    await new Promise((r) => setTimeout(r, 120));
  }
}

async function takeOnce(key, factory) {
  const db = await openDb(factory);
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      const s = t.objectStore(STORE);
      const r = s.get(key);
      let rec = null;
      r.onsuccess = () => { rec = r.result || null; if (rec) s.delete(key); };
      t.oncomplete = () => resolve(rec && rec.file && Date.now() - rec.at <= MAX_AGE_MS ? { file: rec.file, from: rec.from || '' } : null);
      t.onerror = t.onabort = () => reject(Object.assign(new Error((t.error && t.error.message) || 'storage failed'), { code: 'storage' }));
    });
  } finally { db.close(); }
}

/** Remove a record nobody took (the drag ended with no drop). */
export async function dropHandoff(id, factory = globalThis.indexedDB) {
  const key = String(id || '').toLowerCase();
  if (!ID_RE.test(key)) return;
  const db = await openDb(factory);
  try { await new Promise((resolve) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(key); t.oncomplete = t.onerror = t.onabort = () => resolve(); }); } finally { db.close(); }
}
