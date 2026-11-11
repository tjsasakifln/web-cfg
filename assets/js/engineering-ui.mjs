import {exportToolResult} from './tool-credits.mjs';

export const byId = id => document.getElementById(id);
export function number(value, label = 'Valor', min = -Infinity, max = Infinity) {
  const s = String(value).trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s)) throw Error(label + ': informe um número válido, sem separador de milhar.');
  const n = Number(s);
  if (!Number.isFinite(n) || n < min || n > max) throw Error(label + ': valor fora do intervalo permitido.');
  return n;
}
export function csv(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let s = value == null ? '' : String(value);
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  }).join(';')).join('\r\n');
}
export function download(name, content, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], {type}));
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function exportResult(toolId, format, name, content, type) {
  return exportToolResult({toolId, format, content, deliver: () => download(name, content, type)});
}
export function table(target, headings, rows) {
  const el = typeof target === 'string' ? byId(target) : target;
  const table = document.createElement('table');
  const thead = document.createElement('thead'), tr = document.createElement('tr');
  headings.forEach(h => {const th = document.createElement('th'); th.scope = 'col'; th.textContent = h; tr.append(th);});
  thead.append(tr); table.append(thead); const tbody = document.createElement('tbody');
  rows.forEach(row => {const tr = document.createElement('tr'); row.forEach(value => {const td = document.createElement('td'); td.textContent = value == null ? '' : String(value); tr.append(td);}); tbody.append(tr);});
  table.append(tbody); el.replaceChildren(table);
}
export const format = (value, digits = 4) => Number(value).toLocaleString('pt-BR', {maximumFractionDigits: digits});
export function message(text, bad = false) {
  const el = byId('estado'); el.textContent = text; el.classList.toggle('is-error', bad);
}
export function catchAction(action) {
  return async event => {try {await action(event);} catch(error) {message(error.message || 'Não foi possível concluir a operação.', true);}};
}
