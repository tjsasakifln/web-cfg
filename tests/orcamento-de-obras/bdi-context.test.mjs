import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  BDI_CONTEXT_KEY, BDI_CONTEXT_TTL_MS, isBudgetBdiRate,
  saveBdiContext, readBdiContext, clearBdiContext,
} from '../../assets/js/bdi-budget-context.mjs';
import {calculateBdiRate} from '../../ferramentas/calculadora-bdi/vendor/precifica-bdi.js';
import {exemplo, validarPlanilha} from '../../ferramentas/orcamento-de-obras/orcamento.js';

const now = 1800000000000;
const draftKey = 'confenge.orcamento-de-obras.v2';
function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
}

test('a taxa calculada atravessa o contrato de quatro casas do orçamento sem transportar o projeto', () => {
  const storage = memoryStorage();
  const project = exemplo();
  storage.setItem(draftKey, JSON.stringify(project));
  const rate = calculateBdiRate({administration:'3', insurance:'0.5', risk:'1', guarantees:'0.5', financialExpenses:'1', profit:'7', taxes:'5'}).times(100).toFixed(4);
  assert.equal(rate, '19.4458');
  assert.equal(saveBdiContext(rate, {storage, now}), true);
  assert.deepEqual(JSON.parse(storage.getItem(BDI_CONTEXT_KEY)), {rate:'19.4458', createdAt:now});
  const received = readBdiContext({storage, now});
  assert.equal(validarPlanilha({...project, bdi:received.rate}).bdi, '19.4458');
  assert.deepEqual(JSON.parse(storage.getItem(draftKey)), project, 'offering a rate must not alter the saved budget');
});

test('limites do orçamento, precisão e formatos ambíguos falham antes da gravação', () => {
  for (const rate of ['0.0000', '999.9999']) {
    assert.equal(isBudgetBdiRate(rate), true);
    assert.doesNotThrow(() => validarPlanilha({...exemplo(), bdi:rate}));
  }
  const storage = memoryStorage();
  for (const rate of ['1000.0000', '-0.0000', '-1.0000', '1e2', '19,4458', '19.44580', '019.4458', '19.4458 ', 'NaN', 'Infinity', '19', '', 19.4458, null, {rate:'19.4458'}]) {
    assert.equal(isBudgetBdiRate(rate), false, String(rate));
    assert.equal(saveBdiContext(rate, {storage, now}), false, String(rate));
    assert.equal(storage.getItem(BDI_CONTEXT_KEY), null);
  }
});

test('contextos adulterados ou com dados extras são retirados sem tocar no rascunho', () => {
  const storage = memoryStorage();
  const draft = JSON.stringify(exemplo());
  storage.setItem(draftKey, draft);
  const bad = [
    '{broken', JSON.stringify(null), JSON.stringify(['19.4458', now]),
    JSON.stringify({rate:'19.4458'}), JSON.stringify({rate:'19.4458', createdAt:String(now)}),
    JSON.stringify({rate:'19.4458', createdAt:now, cost:'100000'}),
    JSON.stringify({rate:'19.4458', createdAt:now, name:'private-project'}),
    JSON.stringify({rate:'1000.0000', createdAt:now}),
    JSON.stringify({rate:'19.4458', createdAt:-1}),
    JSON.stringify({rate:'19.4458', createdAt:now + 0.5}),
    JSON.stringify({rate:'19.4458', createdAt:now, padding:'x'.repeat(200)}),
  ];
  for (const raw of bad) {
    storage.setItem(BDI_CONTEXT_KEY, raw);
    assert.equal(readBdiContext({storage, now}), null);
    assert.equal(storage.getItem(BDI_CONTEXT_KEY), null);
    assert.equal(storage.getItem(draftKey), draft);
  }
});

test('a oferta expira em trinta minutos e rejeita timestamps futuros ou relógios inválidos', () => {
  const storage = memoryStorage();
  assert.equal(BDI_CONTEXT_TTL_MS, 30 * 60 * 1000);
  saveBdiContext('19.4458', {storage, now});
  assert.equal(readBdiContext({storage, now:now + BDI_CONTEXT_TTL_MS - 1}).rate, '19.4458');
  assert.equal(readBdiContext({storage, now:now + BDI_CONTEXT_TTL_MS}), null);
  assert.equal(storage.getItem(BDI_CONTEXT_KEY), null);
  saveBdiContext('19.4458', {storage, now:now + 1});
  assert.equal(readBdiContext({storage, now}), null);
  for (const invalidNow of [-1, NaN, Infinity, now + 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(saveBdiContext('19.4458', {storage, now:invalidNow}), false);
  }
});

test('armazenamento negado ou gravação não persistida não confirma a transferência', () => {
  const denied = () => { throw new Error('storage denied'); };
  const storage = {getItem:denied, setItem:denied, removeItem:denied};
  assert.equal(saveBdiContext('19.4458', {storage, now}), false);
  assert.equal(readBdiContext({storage, now}), null);
  assert.equal(clearBdiContext({storage}), false);
  const silentlyRefused = {getItem:() => null, setItem:() => {}, removeItem:() => {}};
  assert.equal(saveBdiContext('19.4458', {storage:silentlyRefused, now}), false);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  try {
    Object.defineProperty(globalThis, 'sessionStorage', {configurable:true, get:denied});
    assert.equal(saveBdiContext('19.4458', {now}), false);
    assert.equal(readBdiContext({now}), null);
    assert.equal(clearBdiContext(), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor);
    else delete globalThis.sessionStorage;
  }
});

test('consumir ou descartar a taxa limpa apenas seu contexto e confirma a remoção', () => {
  const storage = memoryStorage();
  const draft = JSON.stringify(exemplo());
  storage.setItem(draftKey, draft);
  saveBdiContext('19.4458', {storage, now});
  assert.equal(clearBdiContext({storage}), true);
  assert.equal(readBdiContext({storage, now}), null);
  assert.equal(storage.getItem(draftKey), draft);
  const refused = {getItem:() => 'still-present', removeItem:() => {}};
  assert.equal(clearBdiContext({storage:refused}), false);
});
