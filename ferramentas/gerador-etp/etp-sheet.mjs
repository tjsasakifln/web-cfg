// Tabela de itens do Gerador de ETP: a pessoa informa item, unidade, quantidade e preço unitário uma vez, e a
// ferramenta escreve a memória das quantidades (IV), os preços unitários, a memória e o total (VI).
// Funções puras: a página aplica o resultado nos campos e tests/tools-commerce/etp-rules.test.cjs confere que o
// texto gerado satisfaz as mesmas regras que o servidor aplica.
// A conta é feita em inteiros (BigInt): o número impresso na memória é exatamente o que gera o subtotal.

import { hasQuantity } from './etp-rules.mjs';

export const SHEET_LIMIT = 1200;
const QUANTITY_DECIMALS = 3;
const PRICE_DECIMALS = 4;

// Aceita a escrita brasileira (1.234,56 ou 1234,56) e o ponto decimal sem ambiguidade (12.5). Recusa separadores
// fora do lugar, como 19.90,00 ou 1.25.0, em vez de adivinhar a grandeza.
export function parseDecimal(value, maxDecimals = PRICE_DECIMALS, { currency = true } = {}) {
  const raw = String(value ?? '').trim();
  const text = currency ? raw.replace(/^R\$\s*/i, '') : raw;
  let whole, fraction = '';
  let match;
  if ((match = /^([1-9]\d{0,2}(?:\.\d{3})+|\d+)(?:,(\d+))?$/.exec(text))) {
    whole = match[1].replace(/\./g, ''); fraction = match[2] ?? '';
  } else if ((match = /^(\d+)\.(\d{1,2}|\d{4,})$/.exec(text))) {
    whole = match[1]; fraction = match[2];
  } else return { error: 'format' };
  if (fraction.length > maxDecimals) return { error: 'decimals' };
  const scaled = BigInt(whole + fraction.padEnd(maxDecimals, '0'));
  if (scaled <= 0n) return { error: 'zero' };
  return { scaled, decimals: maxDecimals, text: format(scaled, maxDecimals, fraction.length) };
}

export function parseNumber(value) {
  const parsed = parseDecimal(value, 6);
  return parsed.error ? NaN : Number(parsed.scaled) / 10 ** 6;
}

// Formata um inteiro escalonado em pt-BR, com milhar e ao menos `minDecimals` casas.
function format(scaled, decimals, minDecimals = 0) {
  const digits = scaled.toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  let fraction = digits.slice(digits.length - decimals).replace(/0+$/, '');
  if (fraction.length < minDecimals) fraction = fraction.padEnd(minDecimals, '0');
  return fraction ? `${whole},${fraction}` : whole;
}
const cents = scaled => 'R$ ' + format(scaled, 2, 2);
export const money = value => cents(BigInt(Math.round(value * 100)));
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

// rows: [{ item, unit, quantity, price }] como digitados. Retorna { error } ou os textos prontos.
export function composeSheet(rows, { classified = false } = {}) {
  const items = [];
  for (const [index, row] of rows.entries()) {
    const item = clean(row.item);
    const unit = clean(row.unit);
    const rawQuantity = clean(row.quantity);
    const rawPrice = clean(row.price);
    if (!item && !rawQuantity && !rawPrice) continue;
    const label = `Linha ${index + 1}`;
    if (!item) return { error: `${label}: informe o item.` };
    if (!unit) return { error: `${label}: informe a unidade, como un, m², kg ou mês.` };
    const amount = parseDecimal(rawQuantity, QUANTITY_DECIMALS, { currency: false });
    if (amount.error) return { error: amount.error === 'decimals' ? `${label}: use até três casas decimais na quantidade.` : `${label}: informe a quantidade em números, como 120 ou 1.250,5.` };
    // The server reads a quantity only as a number followed by a unit it recognises (not "ano", "dias" etc.).
    if (!hasQuantity(`${amount.text} ${unit}`)) return { error: `${label}: a unidade “${unit}” não é lida como unidade de medida. Use, por exemplo, un, m², mês ou serviço.` };
    let price;
    if (rawPrice) {
      price = parseDecimal(rawPrice, PRICE_DECIMALS);
      if (price.error) return { error: price.error === 'decimals' ? `${label}: use até quatro casas decimais no preço.` : `${label}: informe o preço unitário em números, como 1.250,00.` };
    }
    items.push({ item, unit, amount, price });
  }
  if (!items.length) return { error: 'Inclua ao menos um item com quantidade.' };
  const priced = !classified && items.every(row => row.price);
  const quantityMemo = 'Quantidades por item: ' + items.map(row => `${row.item}: ${row.amount.text} ${row.unit}`).join('; ') + '.';
  const parts = items.map(row => `${row.amount.text} ${row.unit} de ${row.item}`);
  const listed = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' e ' + parts.at(-1) : parts[0];
  const quantityText = `Estimam-se ${listed}, conforme a memória de cálculo.`;
  const result = { items: items.length, priced, quantityMemo, quantityText };
  if (priced) {
    // quantity × price has QUANTITY_DECIMALS + PRICE_DECIMALS places; round half up to cents.
    const shift = 10n ** BigInt(QUANTITY_DECIMALS + PRICE_DECIMALS - 2);
    const subtotal = row => (row.amount.scaled * row.price.scaled + shift / 2n) / shift;
    const totalCents = items.reduce((sum, row) => sum + subtotal(row), 0n);
    const unitPrice = row => 'R$ ' + format(row.price.scaled, PRICE_DECIMALS, 2);
    result.total = Number(totalCents) / 100;
    result.totalLabel = cents(totalCents);
    result.unitPrices = items.map(row => `${row.item}: ${unitPrice(row)}/${row.unit}`).join('; ') + '.';
    result.valueMemo = items.map(row => `${row.item}: ${row.amount.text} ${row.unit} × ${unitPrice(row)} = ${cents(subtotal(row))}`).join('; ') +
      `; total = ${cents(totalCents)}.`;
    result.totalText = `Valor total estimado: ${cents(totalCents)}.`;
  }
  const longest = Math.max(result.quantityMemo.length, result.unitPrices?.length ?? 0, result.valueMemo?.length ?? 0);
  if (longest > SHEET_LIMIT) return { error: 'A memória passou de 1.200 caracteres. Agrupe itens semelhantes em menos linhas.' };
  return result;
}
