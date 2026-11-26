'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SECTIONS, LIMITS, normalizeInput, gaps, privacyGaps, scopeNote } = require('../../runtime/tools-commerce/etp-input.cjs');

const fixture = () => ({
  identification: { organization: 'Município Exemplo', unit: 'Manutenção', process: '', title: 'Reposição de luminárias prediais' },
  profile: { sphere: 'municipal', objectType: 'bens', federalTransfer: false, sisp: false, localRule: '' },
  answers: {
    I: { status: 'filled', text: 'Há instalações públicas com iluminação inoperante, o que afeta a circulação de usuários.' },
    II: { status: 'omitted', text: 'O órgão ainda não elaborou o Plano de Contratações Anual do exercício.' },
    III: { status: 'filled', text: 'As luminárias precisam ser compatíveis com os soquetes e a alimentação existentes.' },
    IV: { status: 'filled', text: 'Serão adquiridas 40 unidades.', support: { calculation: 'Foram contados os pontos de iluminação inoperantes em cada prédio.', source: 'f1' } },
    V: { status: 'filled', text: 'O reparo individual e a substituição foram comparados, conforme seção de custos.' },
    VI: { status: 'filled', text: 'O valor total de referência é de R$ 2.000,00.', support: { calculation: 'Multiplicaram-se as 40 unidades pelo valor unitário referencial.', source: 'Pesquisa de preços 4/2026, item A', unitPrices: 'Luminária A: R$ 50,00 por unidade.', classified: false } },
    VII: { status: 'filled', text: 'Recomenda-se entrega em almoxarifado central e instalação pela equipe própria.' },
    VIII: { status: 'filled', text: 'Item único, o objeto é homogêneo e não há serviços acessórios.' },
    IX: { status: 'filled', text: 'Pretende-se restabelecer o funcionamento de todos os pontos verificados.' },
    X: { status: 'filled', text: 'Reservar espaço para recebimento e prever equipe de instalação.' },
    XI: { status: 'omitted', text: 'A unidade verificou o histórico e constatou que o estoque não depende de outra contratação.' },
    XII: { status: 'filled', text: 'Encaminhar as unidades substituídas a reciclador autorizado.' },
    XIII: { status: 'filled', text: 'A solução é adequada se confirmada a compatibilidade elétrica dos itens pela equipe técnica.' },
  },
  sources: [{ id: 'F1', name: 'Vistoria.pdf', locator: 'p. 2', text: 'A vistoria apurou 40 luminárias inoperantes.' }],
});

test('mapa cobre os treze incisos na ordem do modelo e os cinco mínimos nacionais', () => {
  assert.deepEqual(SECTIONS.map(({ id }) => id), ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'XI', 'X', 'XII', 'IX', 'XIII']);
  assert.deepEqual(SECTIONS.filter(section => section.required).map(({ id }) => id), ['I', 'IV', 'VI', 'VIII', 'XIII']);
  assert.deepEqual([...new Set(SECTIONS.map(({ group }) => group))].map(group => group.split('.')[0]), ['2', '3', '4']);
});

test('normalização canônica, invariável à ordem de chaves e documentos, sem perder Unicode', () => {
  const input = fixture();
  input.identification.organization = '  Munici\u0301pio Exemplo  ';
  input.sources.unshift({ id: 'F3', name: 'Contratos', text: 'Parágrafo 1\r\nParágrafo 2', locator: '' });
  const canonical = normalizeInput(input);
  const reverse = row => Object.fromEntries(Object.entries(row).reverse());
  const reordered = reverse({ ...input, identification: reverse(input.identification), profile: reverse(input.profile),
    answers: reverse(Object.fromEntries(Object.entries(input.answers).map(([id, answer]) => [id, reverse(answer)]))), sources: [...input.sources].reverse() });
  assert.equal(JSON.stringify(normalizeInput(reordered)), JSON.stringify(canonical));
  assert.deepEqual(normalizeInput(canonical), canonical);
  assert.equal(canonical.identification.organization, 'Município Exemplo');
  assert.equal(canonical.answers.IV.support.source, 'F1');
  assert.equal(canonical.sources[1].text, 'Parágrafo 1\nParágrafo 2');
  assert.equal(input.sources[0].id, 'F3');
});

test('bloqueia atributos imprevistos, rótulos nulos, status inválido e tipos desviantes em todos os níveis', () => {
  const examples = [null, [], { extra: false }, { identification: { organization: null } }, { profile: { sphere: 'local' } },
    { profile: { sisp: 'true' } }, { answers: { I: { status: 'partial' } } }, { answers: { I: { text: ['texto'] } } },
    { answers: { IV: { support: { classified: true } } } }, { answers: { VI: { support: null } } },
    { sources: [{ id: 'F1', name: 'Vistoria.pdf', file: 'bytes' }] }, { sources: [{ id: 'F6', name: 'Outro' }] },
    { sources: [{ id: 'F1' }, { id: 'F1' }] }, { identification: { title: 'ok\u0000' } },
    JSON.parse('{"profile":{"__proto__":{}}}')];
  for (const value of examples) assert.throws(() => normalizeInput(value), /INVALID_ETP_INPUT/);
});

test('limita tamanho individual e agregado, sem aceitar textos grandes formados só por espaços', () => {
  assert.throws(() => normalizeInput({ answers: { IV: { text: ' '.repeat(LIMITS.answer + 1) } } }), /INVALID_ETP_INPUT/);
  assert.throws(() => normalizeInput({ sources: [{ id: 'F1', text: 'x'.repeat(LIMITS.sourceText + 1) }] }), /INVALID_ETP_INPUT/);
  const docs = Array.from({ length: 5 }, (_, index) => ({ id: `F${index + 1}`, name: 'Fonte', text: 'a'.repeat(LIMITS.sourceText) }));
  assert.equal(normalizeInput({ sources: docs.slice(0, 4) }).sources.length, 4);
  assert.throws(() => normalizeInput({ sources: docs }), /INVALID_ETP_INPUT/);
});

test('aceita omissões motivadas nos incisos secundários e conclusão condicionada', () => {
  assert.deepEqual(gaps(fixture()), []);
  const input = fixture();
  input.answers.II.text = 'Não se aplica.';
  input.answers.III = { status: 'omitted', text: 'Item dispensado.' };
  input.answers.VIII = { status: 'omitted', text: 'A equipe deliberou pelo lote único.' };
  assert.deepEqual(gaps(input).map(({ id }) => id), ['II', 'III', 'VIII']);
});

test('exige indícios materiais nos incisos IV e VI e detecta remissão inexistente', () => {
  const input = fixture();
  input.answers.IV = { status: 'filled', text: 'A quantidade estimada é suficiente.', support: { source: 'F2' } };
  input.answers.VI = { status: 'filled', text: 'Valor a confirmar.', support: { calculation: 'A definir', unitPrices: 'A definir', source: '' } };
  input.answers.XI.text = 'Conforme [F5], houve revisão dos registros sem encontrar contratos vinculados.';
  const issues = gaps(input);
  assert.match(issues.find(({ id }) => id === 'IV').message, /fonte inexistente.*memória.*quantidade/i);
  assert.match(issues.find(({ id }) => id === 'VI').message, /fonte de apoio.*memória.*unitários.*total/i);
  assert.match(issues.find(({ id }) => id === 'XI').message, /fonte inexistente/i);
});

test('orçamento classificado aceita somente motivação e referência pública', () => {
  const input = fixture();
  input.sources = [];
  input.answers.IV.support.source = 'Vistoria de manutenção nº 12/2026';
  input.answers.VI = { status: 'filled', text: 'O órgão manteve sob sigilo a planilha para não prejudicar a negociação.',
    support: { source: 'Anexo 7 do processo 112/2026, mantido sob guarda do órgão.', classified: true } };
  assert.deepEqual(gaps(input), []);
  input.answers.VI.support.source = 'F1';
  input.answers.VI.support.calculation = '10 vezes 150';
  assert.match(privacyGaps(input)[0].message, /Não inclua valores.*Não anexe/i);
  input.answers.VI.support.calculation = '';
  input.answers.VI.support.source = 'Anexo 7';
  input.answers.VI.text += ' O total estimado é de R$ 150,00.';
  assert.match(privacyGaps(input)[0].message, /Não inclua valores/i);
});

test('orçamento classificado impede anexos e valores explícitos em qualquer campo', () => {
  const input = fixture();
  input.answers.VI = { status: 'filled', text: 'A Administração decidiu tratar os preços do objeto em anexo separado, para preservar a negociação.',
    support: { source: 'Anexo 12, p. 2, sob guarda do órgão.', classified: true } };
  input.answers.V.text = 'O custo total é de 457.680,50.';
  input.answers.IX.text = 'Economia estimada de duzentos mil reais.';
  input.answers.X.text = 'Total de 40 unidades com 8% de perdas.';
  input.identification.title += ' R$ 1.000,00';
  assert.deepEqual(privacyGaps(input).map(({ id }) => id), ['identification', 'profile', 'V', 'IX']);
});

test('bloqueia texto de teste e datas soltas nos campos de cálculo', () => {
  const input = fixture();
  input.identification.organization = 'teste';
  input.identification.title = 'teste 2026';
  input.sources[0].name = 'teste.pdf';
  for (const answer of Object.values(input.answers)) answer.text = 'lorem ipsum teste';
  input.answers.IV.text = 'teste 2026';
  input.answers.IV.support = { calculation: 'lorem ipsum', source: 'teste' };
  input.answers.VI.text = 'teste 2026';
  input.answers.VI.support = { calculation: 'lorem ipsum', source: 'teste', unitPrices: 'teste 2026', classified: false };
  assert.equal(gaps(input).length, 15);
  const dateOnly = fixture();
  dateOnly.answers.IV.text = 'A aquisição foi programada em 2026 para atender o orçamento.';
  dateOnly.answers.IV.support.calculation = 'A apuração segue o processo de 2026.';
  dateOnly.answers.VI.support.unitPrices = 'Luminária em 2026';
  assert.deepEqual(gaps(dateOnly).map(({ id }) => id), ['IV', 'VI']);
});

test('bloqueia preenchimento repetido, sem impedir unidade incomum ou memória como fórmula', () => {
  const input = fixture();
  input.answers.IV.text = 'Serão dimensionadas 2,5 h/auditoria.';
  input.answers.IV.support.calculation = '5 ÷ 2';
  input.answers.IV.support.source = 'Anexo A';
  input.answers.VI.text = '1.250,00';
  input.answers.VI.support.unitPrices = 'Hora de auditoria 500,00/h';
  input.answers.VI.support.calculation = '2,5 × 500 = 1.250';
  assert.deepEqual(gaps(input), []);
  input.answers.I.text = input.answers.VIII.text = input.answers.VII.text = 'O objeto contratado atende ao interesse público.';
  assert.deepEqual(gaps(input).map(({ id }) => id), ['I', 'VII', 'VIII']);
});

test('detecta credencial e CPF, sem confundir CNPJ ou número de processo', () => {
  const input = fixture();
  input.identification.process = '08012.000181/2012-30';
  input.answers.V.text = 'Usada a comparação pública com CNPJ 00.000.000/0001-91.';
  assert.deepEqual(privacyGaps(input), []);
  input.sources[0].text = 'Em documento preenchido, CPF: 11144477735.';
  input.answers.V.text += ' Bearer ' + 'x'.repeat(30);
  const issues = privacyGaps(input);
  assert.deepEqual(issues.map(({ id }) => id), ['profile', 'V']);
  assert.doesNotMatch(JSON.stringify(issues), /11144477735|x{30}/);
});

test('fonte rotulada como sigilosa não é transmitida na entrevista', () => {
  const input = fixture();
  input.sources[0].name = 'Anexo sigiloso.pdf';
  assert.match(privacyGaps(input)[0].message, /Remova documentos/i);
  assert.deepEqual(privacyGaps({}), []);
  assert.equal(gaps({}).length, 15);
});

test('perfis de transferência federal, engenharia e TIC do SISP não são universalizados', () => {
  const input = fixture();
  assert.doesNotMatch(scopeNote(input), /IN SEGES|IN SGD|ETP Digital/);
  input.profile.federalTransfer = true;
  input.profile.objectType = 'obras';
  assert.match(scopeNote(input), /IN SEGES nº 58\/2022/);
  assert.match(scopeNote(input), /não dispensa o ETP/);
  assert.doesNotMatch(scopeNote(input), /IN SGD/);
  input.profile = { sphere: 'federal', objectType: 'tic', sisp: true };
  assert.match(scopeNote(input), /art\. 11 da IN SGD\/ME nº 94\/2022/);
  input.answers.V = { status: 'omitted', text: 'A equipe dispensou a análise comparativa.' };
  assert.match(gaps(input).find(({ id }) => id === 'V').message, /precisa de conteúdo/i);
  input.profile.sphere = 'estadual';
  assert.match(gaps(input).find(({ id }) => id === 'profile').message, /apenas para contratação de TIC federal/i);
  assert.doesNotMatch(scopeNote(input), /IN SGD/);
});
