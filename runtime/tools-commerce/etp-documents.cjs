'use strict';

const { deflateRawSync } = require('node:zlib');

const PAGE = { width: 595.28, height: 841.89, left: 52, right: 52, top: 55, bottom: 58 };
const STYLES = {
  Title: { size: 22, leading: 28, after: 13, bold: true, ink: '0.11 0.17 0.23', color: '1C2B3B' },
  Subtitle: { size: 14, leading: 20, after: 11, bold: true, ink: '0.11 0.17 0.23', color: '1C2B3B' },
  Meta: { size: 10, leading: 15, after: 2, ink: '0.23 0.27 0.31', color: '3B4550' },
  Note: { size: 10, leading: 15, before: 7, after: 8, ink: '0.23 0.27 0.31', color: '3B4550' },
  Heading1: { size: 14, leading: 20, before: 14, after: 5, bold: true, ink: '0.11 0.17 0.23', color: '1C2B3B' },
  Heading2: { size: 11.5, leading: 17, before: 7, after: 4, bold: true, ink: '0.11 0.17 0.23', color: '1C2B3B' },
  Normal: { size: 11, leading: 16, after: 7, ink: '0.12 0.12 0.12', color: '1F1F1F' },
};

const clean = value => String(value ?? '').normalize('NFC')
  .replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|\p{Cs}/gu, '\uFFFD');
const xml = value => clean(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

function documentBlocks({ identification: id, sections, sources = [], scopeNote = '' }) {
  const blocks = [];
  const add = (style, value, keep = false) => {
    const text = clean(value).trim();
    if (text) blocks.push({ style, text, keep });
  };
  add('Title', 'Estudo Técnico Preliminar', true);
  add('Subtitle', id.title, true);
  add('Heading1', 'I. Informações gerais', true);
  if (id.organization) add('Meta', `Órgão ou entidade: ${id.organization}`);
  if (id.unit) add('Meta', `Unidade: ${id.unit}`);
  if (id.process) add('Meta', `Processo ou referência: ${id.process}`);
  add('Meta', 'Equipe de planejamento: __________________________________________');
  add('Note', scopeNote);
  let group;
  for (const section of sections) {
    if (section.group && section.group !== group) {
      group = section.group;
      add('Heading1', group, true);
    }
    add('Heading2', section.id ? section.id + '. ' + section.title : section.title, true);
    for (const paragraph of section.paragraphs) add('Normal', paragraph);
  }
  if (sources.length) {
    add('Heading1', 'Referências e documentos de apoio', true);
    for (const source of sources) {
      const reference = [source.name, source.locator].filter(Boolean).join(' · ');
      if (reference) add('Normal', `${source.id ? `[${source.id}] ` : ''}${reference}`);
    }
  }
  return blocks;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  for (let bit = 0; bit < 8; bit++) i = (i & 1 ? 0xedb88320 : 0) ^ (i >>> 1);
  return i >>> 0;
});
const crc32 = data => {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

// Minimal deterministic ZIP container for the Office Open XML package.
function zip(entries) {
  const local = [], directory = [];
  let offset = 0;
  for (const [path, contents] of Object.entries(entries)) {
    const name = Buffer.from(path), data = Buffer.from(contents), compressed = deflateRawSync(data);
    const checksum = crc32(data);
    const record = Buffer.alloc(30), central = Buffer.alloc(46);
    record.writeUInt32LE(0x04034b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(0x800, 6);
    record.writeUInt16LE(8, 8);
    record.writeUInt16LE(0x21, 12); // 1980-01-01, the earliest DOS date.
    record.writeUInt32LE(checksum, 14);
    record.writeUInt32LE(compressed.length, 18);
    record.writeUInt32LE(data.length, 22);
    record.writeUInt16LE(name.length, 26);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    record.copy(central, 6, 4, 28);
    central.writeUInt32LE(offset, 42);
    local.push(record, name, compressed);
    directory.push(central, name);
    offset += record.length + name.length + compressed.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(directory.length / 2, 8);
  end.writeUInt16LE(directory.length / 2, 10);
  end.writeUInt32LE(directory.reduce((size, part) => size + part.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...directory, end]);
}

const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rels = 'http://schemas.openxmlformats.org/package/2006/relationships';
const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const run = value => '<w:r>' + clean(value).split(/([\t\n])/).map(part => part === '\n' ? '<w:br/>' :
  part === '\t' ? '<w:tab/>' : `<w:t xml:space="preserve">${xml(part)}</w:t>`).join('') + '</w:r>';

function docxFor(blocks) {
  const styles = Object.entries(STYLES).map(([id, s]) => {
    const heading = id === 'Heading1' || id === 'Heading2';
    const base = id === 'Normal' ? '' : '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>';
    return `<w:style w:type="paragraph" w:styleId="${id}"${id === 'Normal' ? ' w:default="1"' : ''}>` +
      `<w:name w:val="${heading ? `heading ${id.at(-1)}` : id}"/>${base}${heading ? '<w:qFormat/>' : ''}` +
      `<w:pPr>${heading ? '<w:keepNext/><w:keepLines/>' : ''}<w:widowControl/>` +
      `<w:spacing w:before="${20 * (s.before || 0)}" w:after="${20 * s.after}" w:line="${20 * s.leading}" w:lineRule="exact"/>` +
      (heading ? `<w:outlineLvl w:val="${Number(id.at(-1)) - 1}"/>` : '') + '</w:pPr>' +
      `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>` +
      `${s.bold ? '<w:b/>' : ''}<w:color w:val="${s.color}"/><w:sz w:val="${s.size * 2}"/><w:szCs w:val="${s.size * 2}"/><w:lang w:val="pt-BR"/></w:rPr></w:style>`;
  }).join('');
  const paras = blocks.map(({ style, text, keep }) => `<w:p><w:pPr><w:pStyle w:val="${style}"/>${keep ? '<w:keepNext/>' : ''}</w:pPr>${run(text)}</w:p>`).join('');
  return zip({
    '[Content_Types].xml': declaration + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      ['document', 'styles', 'footer'].map((type, i) => `<Override PartName="/word/${['document', 'styles', 'footer1'][i]}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${type}${type === 'document' ? '.main' : ''}+xml"/>`).join('') + '</Types>',
    '_rels/.rels': declaration + `<Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/_rels/document.xml.rels': declaration + `<Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${office}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${office}/footer" Target="footer1.xml"/></Relationships>`,
    'word/styles.xml': declaration + `<w:styles xmlns:w="${word}">${styles}</w:styles>`,
    'word/document.xml': declaration + `<w:document xmlns:w="${word}" xmlns:r="${office}"><w:body>${paras}` +
      '<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1100" w:right="1040" w:bottom="1160" w:left="1040" w:header="520" w:footer="540" w:gutter="0"/>' +
      '</w:sectPr></w:body></w:document>',
    'word/footer1.xml': declaration + `<w:ftr xmlns:w="${word}"><w:p><w:pPr><w:jc w:val="right"/></w:pPr>` + run('Página ') +
      '<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>' + run(' de ') +
      '<w:fldSimple w:instr="NUMPAGES"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>',
  });
}

const codeWinAnsi = new Map(Array.from('€\u0000‚ƒ„…†‡ˆ‰Š‹Œ\u0000Ž\u0000\u0000‘’“”•–—˜™š›œ\u0000žŸ', (c, i) => [c, 0x80 + i]).filter(([c]) => c !== '\u0000'));
const replacePdf = { '\u2212': '-', '\u202F': ' ', '\u2009': ' ', '\u2002': ' ', '\u2003': ' ', '\u2010': '-', '\u2011': '-', '≤': '<=', '≥': '>=', '→': '->', '✓': '[sim]' };
const winByte = c => {
  const code = c.codePointAt(0);
  if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) return code;
  return codeWinAnsi.get(c);
};
function pdfText(value) {
  return Array.from(value.replace(/\t/g, '    '), c => {
    if (winByte(c) !== undefined || c === '\n') return c;
    if (Object.hasOwn(replacePdf, c)) return replacePdf[c];
    // Editable DOCX retains full Unicode. Preserve a readable trace in legacy PDF fonts.
    return `[U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}]`;
  }).join('');
}

const widthRegular = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const widthBold = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
function glyphWidth(c, bold) {
  const base = c.normalize('NFD')[0]?.charCodeAt(0);
  if (base >= 32 && base <= 126) return (bold ? widthBold : widthRegular)[base - 32];
  if (c === '\u00a0') return 278;
  return 1000; // Conservative for the few remaining WinAnsi glyphs.
}
function wrap(value, style) {
  const max = Math.floor((PAGE.width - PAGE.left - PAGE.right) * 1000 / style.size);
  return pdfText(value).split('\n').flatMap(line => {
    let row = '', width = 0, spaceAt = -1, beforeSpace = 0;
    const lines = [];
    for (const c of line.replace(/[ \u00a0]+/g, ' ').trim()) {
      const glyph = glyphWidth(c, style.bold);
      if (width + glyph > max && row) {
        if (c === ' ') { lines.push(row); row = ''; width = 0; spaceAt = -1; continue; }
        if (spaceAt >= 0) {
          lines.push(row.slice(0, spaceAt));
          row = row.slice(spaceAt + 1);
          width -= beforeSpace + glyphWidth(' ', style.bold);
        } else {
          lines.push(row); row = ''; width = 0;
        }
        spaceAt = -1;
      }
      if (c === ' ') { spaceAt = row.length; beforeSpace = width; }
      row += c; width += glyph;
    }
    lines.push(row.trimEnd());
    return lines;
  });
}

const hex = value => Buffer.from(Array.from(value, winByte)).toString('hex');
const textOp = (text, st, x, y) => `BT /${st.bold ? 'F2' : 'F1'} ${st.size} Tf ${st.ink} rg 1 0 0 1 ${x} ${y.toFixed(2)} Tm <${hex(text)}> Tj ET\n`;

function layout(blocks) {
  const pages = [];
  const styles = blocks.map(item => STYLES[item.style]);
  const allLines = blocks.map(({ text }, i) => wrap(text, styles[i]));
  let page, y;
  const nextPage = () => { page = []; pages.push(page); y = PAGE.height - PAGE.top; };
  nextPage();
  for (const [i, block] of blocks.entries()) {
    const st = styles[i], lines = allLines[i];
    let before = page.length ? st.before || 0 : 0;
    if (page.length && block.keep) {
      let need = before + lines.length * st.leading + st.after;
      let j = i + 1;
      while (blocks[j]?.keep) {
        need += (styles[j].before || 0) + allLines[j].length * styles[j].leading + styles[j].after;
        j++;
      }
      if (blocks[j]) need += (styles[j].before || 0) + Math.min(2, allLines[j].length) * styles[j].leading;
      if (y - need < PAGE.bottom && need <= PAGE.height - PAGE.top - PAGE.bottom) {
        nextPage(); before = 0;
      }
    } else if (page.length && lines.length > 1 && y - before - 2 * st.leading < PAGE.bottom) {
      nextPage(); before = 0;
    }
    y -= before;
    for (const line of lines) {
      if (y - st.leading < PAGE.bottom) nextPage();
      if (line) page.push(textOp(line, st, PAGE.left, y - st.size));
      y -= st.leading;
    }
    y -= st.after;
  }
  return pages;
}

function pdfFor(blocks) {
  const pages = layout(blocks);
  const ids = pages.map((_, i) => 5 + i * 2);
  const objects = [null,
    '<< /Type /Catalog /Pages 2 0 R /Lang (pt-BR) >>',
    `<< /Type /Pages /Kids [${ids.map(i => `${i} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  for (const [i, parts] of pages.entries()) {
    const footer = `Página ${i + 1} de ${pages.length}`;
    const footerWidth = Array.from(footer).reduce((w, c) => w + glyphWidth(c, false), 0) * 0.009;
    const content = parts.join('') + `0.83 0.86 0.88 RG 0.5 w ${PAGE.left} 46 m ${PAGE.width - PAGE.right} 46 l S\n` +
      textOp(footer, { size: 9, ink: '0.23 0.27 0.31' }, (PAGE.width - PAGE.right - footerWidth).toFixed(2), 32);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${ids[i] + 1} 0 R >>`,
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`);
  }
  const output = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = ['0000000000 65535 f \n'];
  let offset = output[0].length;
  for (let i = 1; i < objects.length; i++) {
    const part = Buffer.from(`${i} 0 obj\n${objects[i]}\nendobj\n`);
    offsets.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    output.push(part); offset += part.length;
  }
  output.push(Buffer.from(`xref\n0 ${objects.length}\n${offsets.join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
  return Buffer.concat(output);
}

function renderEtp(doc) {
  const blocks = documentBlocks(doc);
  return { docx: docxFor(blocks), pdf: pdfFor(blocks) };
}

module.exports = { renderEtp };
