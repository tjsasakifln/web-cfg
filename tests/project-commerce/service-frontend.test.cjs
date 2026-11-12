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
