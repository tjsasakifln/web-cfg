'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readOffer, quote, publicPricing } = require('../../runtime/project-commerce/service-policy.cjs');
const load = () => import('../../assets/js/ready-project-services.mjs');
const pricing = publicPricing(readOffer());
const selected = { areaM2: 100, deadlineDays: 90, disciplines: ['arquitetura'], floors: 1,
  buildingType: 'new-residential', terrain: 'flat-or-gentle' };

test('visitor sees the advertised minimum and the actual priority surcharge', async () => {
  const { estimateProject } = await load();
  for (const [days, expected] of [[90, 149000], [60, 160175], [45, 171350], [30, 193700], [15, 260750]]) {
    assert.equal(estimateProject(pricing, { ...selected, deadlineDays: days }).amountCents, expected);
  }
  assert.equal(estimateProject(pricing, { ...selected, areaM2: 50 }).amountCents, 149000, 'minimum protects a smaller project');
  assert.equal(estimateProject(pricing, { ...selected, disciplines: ['eletrica'] }).amountCents, 69000);
  assert.equal(estimateProject(pricing, { ...selected, disciplines: ['arquitetura', 'estrutura', 'eletrica', 'hidrossanitario'] }).amountCents, 416000);
});

test('all deadlines are monotonic and the browser agrees with server cents for fractional areas', async () => {
  const { estimateProject } = await load();
  for (const areaM2 of [50, 99.99, 100, 100.01, 113.37, 199.99, 250]) {
    let previous = Infinity;
    for (let deadlineDays = 15; deadlineDays <= 90; deadlineDays++) {
      const selection = { ...selected, areaM2, deadlineDays, disciplines: ['arquitetura', 'estrutura', 'eletrica', 'hidrossanitario'] };
      const estimate = estimateProject(pricing, selection);
      const authoritative = quote(selection, readOffer());
      assert.equal(estimate.amountCents, authoritative.amountCents, `${areaM2}m2 / ${deadlineDays}days`);
      assert(estimate.amountCents <= previous, 'a longer deadline cannot cost more');
      previous = estimate.amountCents;
    }
  }
});

test('the calculator does not offer impossible area/deadline input as an amount', async () => {
  const { estimateProject } = await load();
  for (const patch of [{ areaM2: NaN }, { areaM2: 49 }, { areaM2: 251 }, { deadlineDays: 14 }, { deadlineDays: 91 }, { deadlineDays: 30.5 }]) {
    assert.equal(estimateProject(pricing, { ...selected, ...patch }), null);
  }
});

test('payment navigation is restricted to the exact HTTPS Mercado Pago host', async () => {
  const { paymentDestination } = await load();
  assert.equal(paymentDestination('https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=example'), 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=example');
  for (const url of ['https://mercadopago.com.br.attacker.example/pay', 'https://mercadopago.com.br@attacker.example/pay',
    'https://attacker.example/mercadopago.com.br', 'http://www.mercadopago.com.br/pay', 'javascript:alert(1)',
    'https://www.mercadopago.com.br:8443/pay', '//www.mercadopago.com.br/pay', 'https://sandbox.mercadopago.com.br/pay']) {
    assert.equal(paymentDestination(url), '', url);
  }
});

test('receipt restoration returns an independent credential and never trusts a cached payment claim', async () => {
  const { receiptFromStore } = await load();
  const id = '123e4567-e89b-42d3-a456-426614174000';
  const token = 'A'.repeat(43);
  const record = Object.freeze({ id, receiptToken: token, lastStatus: 'paid', checkoutUrl: 'https://attacker.example' });
  const records = Object.freeze({ active: id, [id]: record });
  const restored = receiptFromStore(records);
  assert.deepEqual(restored, { id, receiptToken: token });
  assert.notEqual(restored, record, 'a recovered credential cannot retain the stored object as its mutable receiver');
  restored.lastStatus = 'pending';
  assert.equal(record.lastStatus, 'paid', 'updating the active receipt leaves the input object untouched');
  assert.deepEqual(receiptFromStore(records, id.toUpperCase()), { id, receiptToken: token });
  assert.deepEqual(receiptFromStore(records, 'invalid-return-id'), { id, receiptToken: token });
  assert.equal(receiptFromStore(records, '123e4567-e89b-42d3-a456-426614174001'), null,
    'a valid return id for another order cannot silently recover the active order');
});

test('receipt restoration rejects inherited objects, prototype names and mismatched order identifiers', async () => {
  const { receiptFromStore } = await load();
  const id = '123e4567-e89b-42d3-a456-426614174000';
  const record = { id, receiptToken: 'A'.repeat(43) };
  for (const active of ['__proto__', 'constructor', 'prototype']) {
    const records = JSON.parse(JSON.stringify({ active, [active]: record }));
    assert.equal(receiptFromStore(records), null, 'a named object property is not an order identifier');
  }
  assert.equal(receiptFromStore(Object.assign(Object.create({ [id]: record }), { active: id })), null,
    'the receipt itself must be an owned record');
  assert.equal(receiptFromStore(Object.assign(Object.create({ active: id }), { [id]: record })), null,
    'the active selection cannot be inherited');
  assert.equal(receiptFromStore({ active: id, [id]: Object.create(record) }), null,
    'inherited credential fields do not authorize restoration');
  assert.equal(receiptFromStore({ active: id, [id]: { ...record, id: '123e4567-e89b-42d3-a456-426614174001' } }), null,
    'a stored key cannot alias another order');
  assert.equal(Object.hasOwn(Object.prototype, 'lastStatus'), false);
  assert.equal(Object.hasOwn(Object.prototype, 'createdAt'), false);
});

test('published prices and the browser seed use the same server-owned offer version', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../projetos-prontos/index.html'), 'utf8');
  const json = /<script type="application\/json" id="rp-pricing">([^<]+)<\/script>/.exec(html);
  assert(json, 'a public price seed is needed before the API responds');
  const seed = JSON.parse(json[1]);
  assert.equal(seed.version, pricing.version);
  assert.deepEqual(seed.disciplines, pricing.disciplines);
  assert.match(html, /data-capture-form/);
  assert.match(html, /id="formulario-contato"/);
  assert.match(html, /id="rp-pay-button" disabled/);
  assert.doesNotMatch(html, /Nenhum modelo está disponível para compra/);
});
