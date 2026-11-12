// Local files pass only between the editor and its exact same-origin parent.
export const EXPORT_FORMATS = Object.freeze([
  'dwg', 'dxf', 'dwt', 'ifccad', 'ifcx', 'pdf', 'svg', 'csv', 'txt', 'json',
  'stl', 'step', 'stp', 'fbx', 'xlsx', 'ocg', 'dxex', 'zip', 'png', 'ocsfilter', 'ocslmap', 'ctb', 'stb',
]);
export const MAX_EXPORT_BYTES = 128 * 1024 * 1024;

export function exportRequest(data) {
  if (!data || data.type !== 'confenge-cad:export' ||
      typeof data.id !== 'string' || !/^[a-zA-Z0-9:_-]{1,128}$/.test(data.id)) {
    throw new Error('Solicitação de exportação inválida.');
  }
  if (typeof data.name !== 'string' || data.name.length > 512 || /[\u0000-\u001f\u007f]/.test(data.name)) {
    throw new Error('O nome do arquivo de saída é inválido.');
  }
  const name = data.name.split(/[\\/]/).pop().trim();
  const format = name.split('.').pop().toLowerCase();
  if (!name || name.startsWith('.') || !EXPORT_FORMATS.includes(format)) {
    throw new Error('O formato solicitado não está disponível nesta edição.');
  }
  let bytes;
  if (data.bytes instanceof ArrayBuffer) bytes = new Uint8Array(data.bytes);
  else if (ArrayBuffer.isView(data.bytes)) bytes = new Uint8Array(data.bytes.buffer, data.bytes.byteOffset, data.bytes.byteLength);
  else throw new Error('O editor não forneceu os dados do arquivo.');
  if (!bytes.byteLength || bytes.byteLength > MAX_EXPORT_BYTES) {
    throw new Error('A cópia deve conter dados e ter até 128 MiB.');
  }
  return { id: data.id, name, format, bytes };
}

export function currentDocument(state) {
  return state?.documents?.find(document => document.id === state.document_id && !document.start);
}

export function drawingWarnings(state) {
  const messages = [];
  if (Array.isArray(state?.missing_fonts) && state.missing_fonts.length) {
    messages.push('O desenho utiliza fontes que não estão disponíveis. Confira os textos antes de distribuir a cópia.');
  }
  if (Array.isArray(state?.xrefs)) {
    for (const reference of state.xrefs) {
      if (!['loaded', 'resolved', 'unloaded'].includes(String(reference.status).toLowerCase())) {
        messages.push('Confira a referência externa ' + String(reference.name || 'sem nome') + '.');
      }
    }
  }
  return messages;
}
