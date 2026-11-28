'use strict';

// A página mostra pendências com ferramentas/gerador-etp/etp-rules.mjs antes de qualquer envio. Se a cópia local
// divergir de runtime/tools-commerce/etp-input.cjs, a pessoa veria "pronto" e receberia ETP_INCOMPLETE (ou o
// contrário). Este teste compara as duas implementações em entradas geradas a partir de casos difíceis.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { gaps, normalizeInput, privacyGaps } = require('../../runtime/tools-commerce/etp-input.cjs');

const root = join(__dirname, '..', '..');
const local = import('../../ferramentas/gerador-etp/etp-rules.mjs');

test('the browser copy of the gap rules is the literal server block', () => {
  const server = readFileSync(join(root, 'runtime/tools-commerce/etp-input.cjs'), 'utf8');
  const browser = readFileSync(join(root, 'ferramentas/gerador-etp/etp-rules.mjs'), 'utf8');
  const start = server.indexOf('function simple(text)');
  const end = server.indexOf('function scopeNote(input)');
  const copied = browser.slice(browser.indexOf('// --- início da cópia literal de etp-input.cjs ---\n') + 52, browser.indexOf('// --- fim da cópia literal ---'));
  assert.ok(start > 0 && end > start);
  assert.equal(copied.trim(), server.slice(start, end).trim(), 'copie o bloco de regras de etp-input.cjs para etp-rules.mjs');
});

const texts = {
  any: ['', '   ', 'não se aplica', 'N/A', 'a definir', 'teste', 'exemplo 1', 'lorem ipsum dolor', 'inaplicável', 'Justificado',
    'O ente não elaborou plano de contratação neste exercício.', 'Estimam-se 20 computadores para as mesas.',
    'A pesquisa comparou compra e locação [F1].', 'Ver [F3] para detalhes.', 'Valor total estimado: R$ 30.000,00.',
    'O valor estimado é de 450.000,00 para o período.', 'Custo de 2 milhões no exercício.', 'CPF 529.982.247-25 do gestor.',
    'Bearer ' + 'a'.repeat(30), 'Lote único para manter a garantia sob a mesma gestão.', '3 unidades no período anual.',
    'Contrato sigiloso reservado.', 'cinquenta mil reais', '120 m² de piso', '​Texto com­ caracteres invisíveis.\r\nSegunda linha.'],
  calc: ['', 'n/a', '20 postos multiplicados por um computador por posto.', '20 × 1.500 = 30.000', 'conta simples', 'Notebook: 40 un; Mouse: 40 un.'],
  source: ['', 'F1', 'f2', 'F5', 'Anexo A', 'fonte', 'vide planilha', 'Inventário nº 14, p. 2', 'https://exemplo.gov.br/doc.pdf', 'planilha.xlsx', 'Peça reservada NR-TESTE.'],
  prices: ['', 'Computador a R$ 1.500 por unidade.', '1.500/un', 'Notebook: R$ 4.500,00/un', 'barato', '12,50 ; 30,00'],
  ident: ['', 'Prefeitura Exemplo', 'teste', 'Órgão com R$ 10.000,00', 'Secretaria de Educação'],
};
const ids = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'XI', 'X', 'XII', 'IX', 'XIII'];

function rng(seed) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 2 ** 32; };
}

function sample(random) {
  const pick = list => list[Math.floor(random() * list.length)];
  const sphere = pick(['', 'municipal', 'estadual', 'distrital', 'federal']);
  const objectType = pick(['', 'bens', 'servicos', 'obras', 'tic']);
  const classified = random() < 0.25;
  const answers = Object.fromEntries(ids.map(id => {
    const entry = { status: random() < 0.2 ? 'omitted' : 'filled', text: pick(texts.any) };
    if (id === 'IV' || id === 'VI') entry.support = { calculation: pick(texts.calc), source: pick(texts.source) };
    if (id === 'VI') Object.assign(entry.support, { unitPrices: pick(texts.prices), classified });
    return [id, entry];
  }));
  const count = Math.floor(random() * 4);
  const sources = ['F1', 'F2', 'F3', 'F4', 'F5'].filter(() => random() < 0.5).slice(0, count).map(id => ({
    id, name: pick(['', 'Inventário', 'Documento sigiloso', 'teste', 'Pesquisa de preços']), locator: pick(['', 'p. 3']), text: pick(texts.any),
  }));
  return {
    identification: { organization: pick(texts.ident), unit: pick(['', 'Compras']), process: pick(['', '23/2026', 'CPF 529.982.247-25']), title: pick(texts.ident) },
    profile: { sphere, objectType, federalTransfer: random() < 0.3, sisp: random() < 0.4, localRule: pick(['', 'Decreto 10/2023', 'teto de R$ 1.000,00']) },
    answers, sources,
  };
}

test('local and server gap lists are identical over generated drafts', async () => {
  const { gaps: localGaps } = await local;
  const random = rng(18);
  for (let index = 0; index < 4000; index += 1) {
    const input = sample(random);
    assert.deepEqual(localGaps(input), gaps(normalizeInput(input)), JSON.stringify(input));
  }
});

test('a complete draft has no local gap, and the local check names the same first missing item', async () => {
  const { gaps: localGaps } = await local;
  const input = sample(rng(3));
  for (const id of ids) input.answers[id] = { status: 'filled', text: `Resposta específica do item ${id} com fatos verificáveis.` };
  input.identification = { organization: 'Prefeitura Exemplo', title: 'Aquisição de computadores', unit: '', process: '' };
  input.profile = { sphere: 'municipal', objectType: 'bens', federalTransfer: false, sisp: false, localRule: '' };
  input.sources = [];
  input.answers.IV = { status: 'filled', text: 'Estimam-se 20 computadores.', support: { calculation: '20 postos com um computador cada.', source: 'Inventário nº 4' } };
  input.answers.VI = { status: 'filled', text: 'Valor total estimado: R$ 30.000,00.', support: { calculation: '20 × R$ 1.500,00 = R$ 30.000,00', source: 'Pesquisa nº 2', unitPrices: 'Computador: R$ 1.500,00/un', classified: false } };
  assert.deepEqual(localGaps(input), []);
  assert.deepEqual(gaps(normalizeInput(input)), []);
});

test('the item table writes IV and VI texts that the server accepts, and keeps prices out of a classified estimate', async () => {
  const { composeSheet, parseNumber } = await import('../../ferramentas/gerador-etp/etp-sheet.mjs');
  assert.equal(parseNumber('R$ 4.500,00'), 4500);
  assert.equal(parseNumber(' R$ 4.500,00 '), 4500);
  assert.equal(parseNumber('1.250'), 1250);
  assert.equal(parseNumber('12,5'), 12.5);
  assert.ok(Number.isNaN(parseNumber('dez')));
  // Misplaced separators are refused instead of silently changing the magnitude.
  for (const wrong of ['19.90,00', '1.25.0', '1,234.56', '1234.500', '0.125', '12.50,00', '12 5,00', '1 2', '1R$2', '12R$', 'R$ R$ 12']) {
    assert.ok(Number.isNaN(parseNumber(wrong)), wrong);
  }
  assert.equal(parseNumber('12.5'), 12.5);
  // The printed operands reproduce each subtotal exactly (decimal arithmetic, half up to cents).
  const exact = composeSheet([{ item: 'Cópia', unit: 'un', quantity: '3', price: '0,335' }, { item: 'Papel', unit: 'un', quantity: '0,5', price: '2,01' }]);
  assert.equal(exact.valueMemo, 'Cópia: 3 un × R$ 0,335 = R$ 1,01; Papel: 0,5 un × R$ 2,01 = R$ 1,01; total = R$ 2,02.');
  assert.match(composeSheet([{ item: 'Areia', unit: 't', quantity: '0,0004', price: '1.000,00' }]).error, /três casas/);
  assert.match(composeSheet([{ item: 'Seguro', unit: 'ano', quantity: '1', price: '9.000,00' }]).error, /unidade “ano”/);
  assert.match(composeSheet([{ item: 'Notebook', unit: 'un', quantity: 'dez' }]).error, /quantidade/);
  assert.match(composeSheet([{ item: 'Notebook', unit: 'un', quantity: 'R$ 3' }]).error, /quantidade/);
  assert.match(composeSheet([{ item: 'Notebook', unit: 'un', quantity: '3', price: '12 5,00' }]).error, /preço unitário/);
  assert.match(composeSheet([{ item: 'Notebook', quantity: '3' }]).error, /informe a unidade/);
  assert.match(composeSheet([{ item: '', unit: '', quantity: '', price: '' }]).error, /ao menos um item/);
  const sheet = composeSheet([
    { item: 'Notebook', unit: 'un', quantity: '120', price: '4.500,00' },
    { item: 'Cobertura', unit: 'm²', quantity: '1.250,5', price: 'R$ 87,90' },
    { item: '', unit: '', quantity: '', price: '' },
  ]);
  assert.equal(sheet.items, 2);
  assert.equal(sheet.total, 540000 + 109918.95);
  assert.equal(sheet.totalText, 'Valor total estimado: R$ 649.918,95.');
  const answers = Object.fromEntries(ids.map(id => [id, { status: 'filled', text: `Resposta específica do item ${id} com fatos verificáveis.` }]));
  answers.IV = { status: 'filled', text: sheet.quantityText, support: { calculation: sheet.quantityMemo, source: 'Inventário nº 4' } };
  answers.VI = { status: 'filled', text: sheet.totalText, support: { calculation: sheet.valueMemo, source: 'Pesquisa de preços nº 2', unitPrices: sheet.unitPrices, classified: false } };
  const input = {
    identification: { organization: 'Prefeitura Exemplo', title: 'Aquisição de computadores', unit: '', process: '' },
    profile: { sphere: 'municipal', objectType: 'bens', federalTransfer: false, sisp: false, localRule: '' }, answers, sources: [],
  };
  assert.deepEqual(gaps(normalizeInput(input)), []);
  const reserved = composeSheet([{ item: 'Notebook', unit: 'un', quantity: '120', price: '4.500,00' }], { classified: true });
  assert.equal(reserved.priced, false);
  assert.equal(reserved.unitPrices, undefined);
  assert.equal(reserved.total, undefined);
  answers.IV.support.calculation = reserved.quantityMemo;
  answers.IV.text = reserved.quantityText;
  answers.VI = { status: 'filled', text: 'O orçamento é mantido sob sigilo para preservar a competitividade da disputa.', support: { calculation: '', source: 'Anexo reservado nº 3', unitPrices: '', classified: true } };
  assert.deepEqual(gaps(normalizeInput(input)), []);
});

test('classified amounts in VI are refused for both review and issuance', async () => {
  const { gaps: localGaps, privacyGaps: localPrivacyGaps } = await local;
  const answers = Object.fromEntries(ids.map(id => [id, { status: 'filled', text: `Resposta específica do item ${id} com fatos verificáveis.` }]));
  answers.IV = { status: 'filled', text: 'Estimam-se 20 computadores, total de 20 postos.', support: { calculation: '20 postos com um computador cada.', source: 'Inventário nº 4' } };
  answers.VI = { status: 'filled', text: 'Total estimado: 275,00.', support: { calculation: '', source: 'Anexo reservado nº 03', unitPrices: '', classified: true } };
  const input = {
    identification: { organization: 'Prefeitura Exemplo', title: 'Aquisição de computadores', unit: '', process: '' },
    profile: { sphere: 'municipal', objectType: 'bens', federalTransfer: false, sisp: false, localRule: '' }, answers, sources: [],
  };
  const server = gaps(normalizeInput(input));
  assert.deepEqual(server.map(entry => entry.id), ['VI']);
  assert.deepEqual(localGaps(input), server);
  for (const text of ['Total estimado: 275,00.', '275,00']) {
    answers.VI.text = text;
    const privacy = privacyGaps(input);
    assert.deepEqual(privacy.map(entry => entry.id), ['VI']);
    assert.deepEqual(localPrivacyGaps(input), privacy);
  }
  answers.VI.text = 'O orçamento é mantido sob sigilo para preservar a competitividade da disputa.';
  assert.deepEqual(privacyGaps(input), []);
  assert.deepEqual(localPrivacyGaps(input), []);
});
