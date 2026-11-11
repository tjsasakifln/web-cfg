// Keep numbers numeric and model-supplied text literal when opened in spreadsheets.
export function celulaCsv(value) {
  let text = String(value ?? '');
  if (typeof value !== 'number' && (/^[\s\u0000-\u001f\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text))) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function gerarCsv(rows) {
  return '\uFEFF' + rows.map(row => row.map(celulaCsv).join(';')).join('\r\n') + '\r\n';
}
