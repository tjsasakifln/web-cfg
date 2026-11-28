'use strict';

const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('node:crypto');
const { createConnection } = require('node:net');

const MAX_PDF_BYTES = 300 * 1024;
const ATTACHMENT_BODY_LIMIT = 420 * 1024;
const TICKET = /^[A-Za-z0-9_-]{43}$/;
const KEY_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function attachmentConfig(env = process.env) {
  if (env.MARKETPLACE_REPUTATION_ATTACHMENTS_ENABLED !== 'true') return null;
  const active = env.MARKETPLACE_REPUTATION_ATTACHMENT_ACTIVE_KEY || '';
  const scannerHost = env.MARKETPLACE_REPUTATION_CLAMD_HOST || '';
  const retentionDays = Number(env.MARKETPLACE_REPUTATION_ATTACHMENT_RETENTION_DAYS);
  if (!KEY_ID.test(active) || !/^[a-zA-Z0-9.-]{1,95}$/.test(scannerHost) ||
      !Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 180) return null;
  try {
    const stored = JSON.parse(env.MARKETPLACE_REPUTATION_ATTACHMENT_KEYS || '{}');
    const entries = Object.entries(stored);
    if (!entries.length || entries.length > 8 ||
        entries.some(([id, key]) => !KEY_ID.test(id) || typeof key !== 'string' || !TICKET.test(key))) return null;
    const keys = new Map(entries.map(([id, key]) => [id, Buffer.from(key, 'base64url')]));
    if ([...keys.values()].some(key => key.length !== 32) || !keys.has(active)) return null;
    return { active, keys, scannerHost, retentionDays };
  } catch { return null; }
}

function pdfBytes(encoded) {
  if (typeof encoded !== 'string' || !encoded.length || encoded.length > Math.ceil(MAX_PDF_BYTES / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > MAX_PDF_BYTES || bytes.toString('base64') !== encoded ||
      !/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(bytes.subarray(0, 10).toString('latin1')) ||
      !/%%EOF[ \t\r\n]*$/.test(bytes.subarray(-64).toString('latin1'))) return null;
  return bytes;
}

function scanPdf(bytes, host, port = 3310) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    let response = Buffer.alloc(0);
    const fail = () => {
      socket.destroy();
      reject(new Error('Document scanner unavailable'));
    };
    const deadline = setTimeout(fail, 5000);
    socket.once('connect', () => {
      const size = Buffer.alloc(4);
      size.writeUInt32BE(bytes.length);
      socket.write(Buffer.concat([Buffer.from('zINSTREAM\0'), size, bytes, Buffer.alloc(4)]));
    });
    socket.on('data', chunk => {
      if (response.length + chunk.length > 2048) return fail();
      response = Buffer.concat([response, chunk]);
      const terminator = response.indexOf(0);
      if (terminator < 0) return;
      const result = response.subarray(0, terminator).toString('utf8');
      if (result === 'stream: OK') resolve(true);
      else if (/^stream: [^\r\n]+ FOUND$/.test(result)) resolve(false);
      else return fail();
      socket.destroy();
    });
    socket.once('error', fail);
    socket.once('close', () => { clearTimeout(deadline); reject(new Error('Document scanner unavailable')); });
  });
}

function associatedData(seller, evidence, digest) {
  return Buffer.from(JSON.stringify(['confenge-evidence-v1', seller, evidence, digest]));
}

function sealPdf(bytes, config, seller, evidence) {
  const digest = sha256(bytes);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', config.keys.get(config.active), iv);
  cipher.setAAD(associatedData(seller, evidence, digest));
  const payload = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return { payload, iv, tag: cipher.getAuthTag(), sha256: digest, key_id: config.active, bytes: bytes.length };
}

function openPdf(row, config, seller, evidence) {
  const key = config.keys.get(row.key_id);
  if (!key) throw new Error('Document key unavailable');
  const decipher = createDecipheriv('aes-256-gcm', key, row.iv);
  decipher.setAAD(associatedData(seller, evidence, row.sha256));
  decipher.setAuthTag(row.tag);
  const bytes = Buffer.concat([decipher.update(row.payload), decipher.final()]);
  if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) throw new Error('Document integrity check failed');
  return bytes;
}

module.exports = { ATTACHMENT_BODY_LIMIT, MAX_PDF_BYTES, TICKET, attachmentConfig, openPdf, pdfBytes, scanPdf, sealPdf, sha256 };
