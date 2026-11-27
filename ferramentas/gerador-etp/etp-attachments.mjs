const MAX_FILE = 6 * 1024 * 1024;
const MAX_XML = 2 * 1024 * 1024;
const MAX_PREVIEW = 4_000;
const PDF_WORKER = '/ferramentas/medir-planta-pdf/workbench/app/assets/pdfTile.worker-Dv28ODaG.js';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const decoder = new TextDecoder();
const compact = text => text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').replace(/\r\n?/g, '\n').replace(/[\t ]+\n/g, '\n').trim();

function findZipEntry(buffer, wanted) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const uint16 = offset => view.getUint16(offset, true);
  const uint32 = offset => view.getUint32(offset, true);
  const invalid = () => new Error('Estrutura DOCX não reconhecida. Cole um trecho como alternativa.');
  let end = -1;
  for (let cursor = bytes.length - 22; cursor >= Math.max(0, bytes.length - 65_557); cursor--) {
    if (uint32(cursor) === 0x06054b50 && cursor + 22 + uint16(cursor + 20) === bytes.length) {
      end = cursor;
      break;
    }
  }
  if (end < 0 || uint16(end + 4) !== 0 || uint16(end + 6) !== 0 || uint16(end + 8) !== uint16(end + 10)) throw invalid();
  const entries = uint16(end + 10);
  const limit = uint32(end + 12) + uint32(end + 16);
  if (entries > 4_096 || limit !== end) throw invalid();
  let match;
  for (let cursor = uint32(end + 16), index = 0; index < entries; index++) {
    if (cursor + 46 > end || uint32(cursor) !== 0x02014b50) throw invalid();
    const nameLength = uint16(cursor + 28);
    const next = cursor + 46 + nameLength + uint16(cursor + 30) + uint16(cursor + 32);
    if (next > end) throw invalid();
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (name === wanted) {
      const method = uint16(cursor + 10);
      const length = uint32(cursor + 24);
      const packed = uint32(cursor + 20);
      const local = uint32(cursor + 42);
      if (match || length > MAX_XML || packed > MAX_FILE || ![0, 8].includes(method) || (uint16(cursor + 8) & 1) || local + 30 >= end || uint32(local) !== 0x04034b50) throw invalid();
      const nameEnd = local + 30 + uint16(local + 26);
      const dataStart = nameEnd + uint16(local + 28);
      if (dataStart + packed > uint32(end + 16) || decoder.decode(bytes.subarray(local + 30, nameEnd)) !== wanted) throw invalid();
      if (method === 0 && packed !== length) throw invalid();
      match = { method, length, data: bytes.subarray(dataStart, dataStart + packed) };
    }
    cursor = next;
  }
  if (!match) throw invalid();
  return match;
}

async function zipText({ method, data, length }) {
  if (method === 0) return decoder.decode(data);
  if (!globalThis.DecompressionStream) throw new Error('Este navegador não abriu o DOCX. Cole um trecho como alternativa.');
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const result = new Uint8Array(length);
  let written = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (written + value.byteLength > length) throw new Error('O DOCX ultrapassa o limite de leitura local.');
      result.set(value, written);
      written += value.byteLength;
    }
    if (written !== length) throw new Error('Não foi possível ler o DOCX. Cole um trecho como alternativa.');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return decoder.decode(result);
}

async function readDocx(file) {
  const xml = await zipText(findZipEntry(await file.arrayBuffer(), 'word/document.xml'));
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('O Word inclui marcação incompatível. Cole um trecho como alternativa.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.namespaceURI !== WORD_NS) throw new Error('O arquivo não tem texto DOCX reconhecível.');
  const lines = [];
  let size = 0;
  for (const paragraph of doc.getElementsByTagNameNS(WORD_NS, 'p')) {
    let line = '';
    for (const part of paragraph.getElementsByTagNameNS(WORD_NS, 't')) line += part.textContent;
    if (!line.trim()) continue;
    lines.push(line);
    size += line.length + 1;
    if (size > MAX_PREVIEW) break;
  }
  return { locator: 'Documento, trechos iniciais', draft: lines.join('\n') };
}

function pdfText(worker, { id, page, file, docKey, deadline }) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener('message', message);
      worker.removeEventListener('error', failed);
    };
    const message = event => {
      if (event.data?.reqId !== id) return;
      cleanup();
      if (event.data.type === 'pageText') resolve(event.data.text?.items || []);
      else if (/invalid page request/i.test(event.data.message || '')) resolve(null);
      else reject(new Error('O texto do PDF não pôde ser lido. Se houver senha ou digitalização, use um trecho transcrito.'));
    };
    const failed = () => {
      cleanup();
      reject(new Error('O leitor local de PDF não pôde ser aberto. Cole um trecho como alternativa.'));
    };
    const timer = setTimeout(failed, Math.max(0, deadline - Date.now()));
    worker.addEventListener('message', message);
    worker.addEventListener('error', failed);
    try { worker.postMessage({ type: 'pageText', reqId: id, data: file, docKey, pageNum: page, scale: 1 }); }
    catch { failed(); }
  });
}

async function readPdf(file, start) {
  const worker = new Worker(PDF_WORKER, { type: 'module', name: 'confenge-etp-leitura-pdf' });
  const deadline = Date.now() + 18_000;
  const docKey = 'etp-local';
  let draft = '';
  let last = start;
  try {
    for (let page = start; page < start + 8; page++) {
      const items = await pdfText(worker, { id: String(page), page, file, docKey, deadline });
      if (items === null) break;
      last = page;
      const content = items.map(item => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
      if (content) draft += (draft ? '\n\n' : '') + content;
      if (draft.length > MAX_PREVIEW) break;
    }
  } finally { worker.terminate(); }
  return { locator: last === start ? `Página ${start}` : `Páginas ${start} a ${last}`, draft };
}

export async function extractAttachment(file, firstPage = 1) {
  if (!file.size || file.size > MAX_FILE) throw new Error('Escolha arquivos não vazios de até 6 MB.');
  if (!Number.isInteger(firstPage) || firstPage < 1 || firstPage > 9_999) throw new Error('Informe uma página inicial entre 1 e 9.999.');
  const suffix = file.name.toLowerCase().split('.').at(-1);
  let extracted;
  if (suffix === 'pdf') extracted = await readPdf(file, firstPage);
  else if (suffix === 'docx') extracted = await readDocx(file);
  else if (['txt', 'md', 'csv'].includes(suffix)) extracted = { locator: 'Arquivo, trechos iniciais', draft: await file.slice(0, 20_000).text() };
  else throw new Error('Formato não aceito. Escolha PDF, DOCX, TXT, MD ou CSV.');
  const draft = compact(extracted.draft);
  if (!draft) throw new Error('Não encontrei texto nesse recorte. Confira a página inicial ou cole um trecho transcrito.');
  return { locator: extracted.locator, text: draft.slice(0, MAX_PREVIEW), truncated: draft.length > MAX_PREVIEW };
}
