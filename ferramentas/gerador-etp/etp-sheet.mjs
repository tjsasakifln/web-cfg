// Tabela de itens do Gerador de ETP: a pessoa informa item, unidade, quantidade e preço unitário uma vez, e a
// ferramenta escreve a memória das quantidades (IV), os preços unitários, a memória e o total (VI).
// Funções puras: a página aplica o resultado nos campos e tests/tools-commerce/etp-rules.test.cjs confere que o
// texto gerado satisfaz as mesmas regras que o servidor aplica.

export const SHEET_LIMIT = 1200;

export function parseNumber(value) {
  let text = String(value ?? '').replace(/R\$|\s| /gi, '');
  if (!text || !/^[\d.,]+$/.test(text)) return NaN;
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  else if ((text.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(text)) text = text.replace(/\./g, '');
  const number = Number(text);
  return Number.isFinite(number) ? number : NaN;
}

const quantity = value => value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
export const money = value => 'R$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, ' ');
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

// rows: [{ item, unit, quantity, price }] como digitados. Retorna { error } ou os textos prontos.
export function composeSheet(rows, { classified = false } = {}) {
  const items = [];
  for (const [index, row] of rows.entries()) {
    const item = clean(row.item);
    const unit = clean(row.unit) || 'un';
    const rawQuantity = clean(row.quantity);
    const rawPrice = clean(row.price);
    if (!item && !rawQuantity && !rawPrice) continue;
    const label = `Linha ${index + 1}`;
    if (!item) return { error: `${label}: informe o item.` };
    const amount = parseNumber(rawQuantity);
    if (!(amount > 0)) return { error: `${label}: informe a quantidade em números.` };
    const price = rawPrice ? parseNumber(rawPrice) : NaN;
    if (rawPrice && !(price > 0)) return { error: `${label}: informe o preço unitário em números, como 1.250,00.` };
    items.push({ item, unit, amount, price });
  }
  if (!items.length) return { error: 'Inclua ao menos um item com quantidade.' };
  const priced = !classified && items.every(row => row.price > 0);
  const quantityMemo = 'Quantidades por item: ' + items.map(row => `${row.item}: ${quantity(row.amount)} ${row.unit}`).join('; ') + '.';
  const parts = items.map(row => `${quantity(row.amount)} ${row.unit} de ${row.item}`);
  const listed = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' e ' + parts.at(-1) : parts[0];
  const quantityText = `Estimam-se ${listed}, conforme a memória de cálculo.`;
  const result = { items: items.length, priced, quantityMemo, quantityText };
  if (priced) {
    const total = items.reduce((sum, row) => sum + Math.round(row.amount * row.price * 100), 0) / 100;
    result.total = total;
    result.unitPrices = items.map(row => `${row.item}: ${money(row.price)}/${row.unit}`).join('; ') + '.';
    result.valueMemo = items.map(row => `${row.item}: ${quantity(row.amount)} ${row.unit} × ${money(row.price)} = ${money(Math.round(row.amount * row.price * 100) / 100)}`).join('; ') +
      `; total = ${money(total)}.`;
    result.totalText = `Valor total estimado: ${money(total)}.`;
  }
  const longest = Math.max(result.quantityMemo.length, result.unitPrices?.length ?? 0, result.valueMemo?.length ?? 0);
  if (longest > SHEET_LIMIT) return { error: 'A memória passou de 1.200 caracteres. Agrupe itens semelhantes em menos linhas.' };
  return result;
}
