'use strict';

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const test = require('node:test');
const {
  MAX_PDF_BYTES, attachmentConfig, openPdf, pdfBytes, sealPdf,
} = require('../config/reputation-files.cjs');

const document = Buffer.from('%PDF-1.5\nTest fixture\n%%EOF\n');
const key = () => randomBytes(32).toString('base64url');
const oldKey = key();
const newKey = key();
const settings = {
  MARKETPLACE_REPUTATION_ATTACHMENTS_ENABLED: 'true',
  MARKETPLACE_REPUTATION_CLAMD_HOST: 'clamav',
  MARKETPLACE_REPUTATION_ATTACHMENT_RETENTION_DAYS: '40',
  MARKETPLACE_REPUTATION_ATTACHMENT_ACTIVE_KEY: 'key-1',
  MARKETPLACE_REPUTATION_ATTACHMENT_KEYS: JSON.stringify({ 'key-1': oldKey, 'key-2': newKey }),
};

test('attachment configuration remains off unless private keys, retention and a scanner are configured', () => {
  assert.equal(attachmentConfig({}), null);
  for (const change of [
    { MARKETPLACE_REPUTATION_ATTACHMENT_KEYS: '{}' },
    { MARKETPLACE_REPUTATION_ATTACHMENT_ACTIVE_KEY: 'missing' },
    { MARKETPLACE_REPUTATION_ATTACHMENT_RETENTION_DAYS: '0' },
    { MARKETPLACE_REPUTATION_CLAMD_HOST: 'https://external.example' },
  ]) assert.equal(attachmentConfig({ ...settings, ...change }), null);
  assert.equal(attachmentConfig(settings).retentionDays, 40);
});

test('file intake accepts bounded canonical PDF encoding and rejects malformed, fake or oversized data', () => {
  assert.deepEqual(pdfBytes(document.toString('base64')), document);
  assert.equal(pdfBytes('data:application/pdf;base64,' + document.toString('base64')), null);
  assert.equal(pdfBytes(Buffer.from('<html>not a PDF</html>').toString('base64')), null);
  assert.equal(pdfBytes(Buffer.from('%PDF-1.5\nTruncated').toString('base64')), null);
  const oversized = Buffer.concat([Buffer.from('%PDF-1.5\n'), Buffer.alloc(MAX_PDF_BYTES), Buffer.from('%%EOF')]);
  assert.equal(pdfBytes(oversized.toString('base64')), null);
});

test('authenticated encryption forbids cross-owner moves and accepts existing ciphertext across key rotation', () => {
  const initial = attachmentConfig(settings);
  const sealed = sealPdf(document, initial, 'seller-a', 'evidence-a');
  assert.notDeepEqual(sealed.payload, document);
  assert.notDeepEqual(sealPdf(document, initial, 'seller-a', 'evidence-a').iv, sealed.iv);
  const rotated = attachmentConfig({ ...settings, MARKETPLACE_REPUTATION_ATTACHMENT_ACTIVE_KEY: 'key-2' });
  assert.deepEqual(openPdf(sealed, rotated, 'seller-a', 'evidence-a'), document);
  assert.throws(() => openPdf(sealed, rotated, 'seller-b', 'evidence-a'));
  assert.throws(() => openPdf(sealed, rotated, 'seller-a', 'evidence-b'));
  const corrupted = Buffer.from(sealed.payload);
  corrupted[0] ^= 1;
  assert.throws(() => openPdf({ ...sealed, payload: corrupted }, rotated, 'seller-a', 'evidence-a'));
});
