'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { inflateRawSync } = require('node:zlib');
const { renderEtp } = require('../../runtime/tools-commerce/etp-documents.cjs');

const fixture = {
  identification: { organization: 'Órgão Municipal de Educação', unit: 'Manutenção & Serviços',
    process: 'ADM/2026/42', title: 'Reforma da escola pública <A>' },
  scopeNote: 'Minuta para revisão pela equipe de planejamento.',
  sections: [
    { id: 'I', title: 'Inciso I. Necessidade da contratação', group: 'II. Diagnóstico da situação atual',
      paragraphs: ['O forro apresenta infiltração. A contratação preserva a saúde e a segurança de 42 estudantes.\nIsto é uma nova linha.'] },
    { id: 'IV', title: 'Inciso IV. Estimativa das quantidades', group: 'II. Diagnóstico da situação atual',
      paragraphs: ['Área medida: 72 m². Fonte: [F1].'] },
    { id: 'XIII', title: 'Inciso XIII. Posicionamento conclusivo', group: 'IV. Solução escolhida',
      paragraphs: ['Posicionamento da equipe: adequado, condicionado à revisão das medições.'] },
  ],
  sources: [{ id: 'F1', name: 'Memória de cálculo.pdf', locator: 'p. 4, quadro de medição' }],
};

function unzipXml(zip) {
  const entries = new Map();
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(zip.readUInt16LE(offset + 8), 8);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const compressed = zip.readUInt32LE(offset + 18);
    const plain = zip.readUInt32LE(offset + 22);
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString();
    const pos = offset + 30 + nameLength + extraLength;
    const contents = inflateRawSync(zip.subarray(pos, pos + compressed));
    assert.equal(contents.length, plain);
    entries.set(name, contents.toString());
    offset = pos + compressed;
  }
  assert.equal(zip.readUInt32LE(offset), 0x02014b50);
  return entries;
}

function xref(pdf) {
  const data = pdf.toString('latin1');
  const from = Number(data.match(/startxref\n(\d+)\n%%EOF/)[1]);
  const [label, range, , ...lines] = data.slice(from).split('\n');
  assert.equal(label, 'xref');
  lines.slice(0, Number(range.split(' ')[1]) - 1).forEach((line, i) => {
    const from = Number(line.slice(0, 10));
    assert.ok(data.startsWith(`${i + 1} 0 obj\n`, from));
  });
  return data;
}

const pdfReader = spawnSync('pdftotext', ['-v']).status === 0;

test('renderEtp cria DOCX editável e PDF com as mesmas seções, fontes e identificação neutra', () => {
  const { docx, pdf } = renderEtp(fixture);
  const parts = unzipXml(docx);
  assert.equal(parts.size, 6);
  const main = parts.get('word/document.xml');
  assert.match(main, /I\. Informações gerais/);
  assert.match(main, /Equipe de planejamento/);
  assert.match(main, /Órgão Municipal de Educação/);
  assert.match(main, /Manutenção &amp; Serviços/);
  assert.match(main, /Reforma da escola pública &lt;A&gt;/);
  assert.match(main, /<w:br\/>/);
  assert.match(main, /Área medida: 72 m²/);
  assert.match(main, /Memória de cálculo\.pdf · p\. 4, quadro de medição/);
  assert.equal(main.match(/II\. Diagnóstico da situação atual/g).length, 1);
  assert.doesNotMatch(main, /SGPe|Confenge/iu);
  assert.match(parts.get('word/footer1.xml'), /w:instr="NUMPAGES"/);
  assert.match(parts.get('word/styles.xml'), /w:lang w:val="pt-BR"/);
  assert.match(xref(pdf), /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.deepEqual(renderEtp(fixture), { docx, pdf });
});

test('renderEtp preserva acentos e pagina conteúdo extenso sem cortar os dados', { skip: !pdfReader }, () => {
  const doc = structuredClone(fixture);
  doc.sections[0].paragraphs.push(...Array.from({ length: 70 }, (_, i) =>
    `Registro de medição ${i + 1}. A análise da situação exige considerar a contratação, a manutenção e o público atendido.`));
  doc.sources[0].locator = 'https://dominio.exemplo/documentos/' + 'X'.repeat(230);
  const { pdf } = renderEtp(doc);
  const out = spawnSync('pdftotext', ['-layout', '-', '-'], { input: pdf });
  assert.equal(out.status, 0, out.stderr.toString());
  const text = out.stdout.toString();
  assert.match(text, /Área medida: 72 m²/);
  assert.match(text, /Página 1 de [2-9]/);
  assert.match(text, /Registro de medição 70\./);
  assert.match(text, /Memória de cálculo\.pdf/);
  assert.equal((text.match(/X{2,}/g) || []).join('').length, 230);
  assert.equal(text.match(/II\. Diagnóstico da situação atual/g).length, 1);
});

test('renderEtp não leva campos omitidos, metadados privados nem XML de entrada para a saída', () => {
  const doc = structuredClone(fixture);
  delete doc.identification.process;
  doc.identification.internal = 'internal-token';
  doc.sections[0].paragraphs = ['<w:p> & programa\u0007', 'Escola 桜'];
  doc.sections[0].privateModel = 'internal-model';
  const { docx, pdf } = renderEtp(doc);
  const main = unzipXml(docx).get('word/document.xml');
  assert.match(main, /&lt;w:p&gt; &amp; programa�/);
  assert.match(main, /Escola 桜/);
  assert.doesNotMatch(main, /internal-token|internal-model|Processo ou referência/);
  assert.match(xref(pdf), /5b552b363835435d/);
});
