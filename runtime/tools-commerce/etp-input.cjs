'use strict';

const { check } = require('./policy.cjs');

const DIAGNOSIS = 'II. Diagnóstico da situação atual';
const PROSPECTING = 'III. Prospecção de soluções';
const SOLUTION = 'IV. Solução escolhida';

// A ordem da apresentação segue o modelo. O id preserva o inciso da Lei.
const SECTIONS = Object.freeze([
  ['I', 'Necessidade da contratação', DIAGNOSIS, true,
    'Qual é o problema, quem é afetado e por quê? Descreva a situação atual, o interesse público e as evidências. Comece pela necessidade, sem pressupor um fornecedor.'],
  ['II', 'Previsão no Plano de Contratações Anual', DIAGNOSIS, false,
    'O órgão elaborou PCA? Se sim, informe exercício, referência e alinhamento. Se a contratação não consta do plano, explique a situação e a providência. Se não houve PCA, registre a circunstância.'],
  ['III', 'Requisitos da contratação', DIAGNOSIS, false,
    'Quais requisitos são indispensáveis e por quê? Aponte desempenho, qualidade, sustentabilidade, prazos e restrições pertinentes. Se envolver TIC, detalhe necessidades de negócio, requisitos tecnológicos e padrões aplicáveis.'],
  ['IV', 'Estimativa das quantidades', DIAGNOSIS, true,
    'Informe itens, unidades, quantidades, período de referência, documentos e memória. Considere demandas relacionadas, estoque e economia de escala quando pertinentes.'],
  ['V', 'Levantamento de mercado', PROSPECTING, false,
    'Quais alternativas foram pesquisadas? Compare atendimento, custos, riscos e fontes. Quando compra e locação forem possíveis, compare ambas. Em TIC do SISP, documente também os padrões aplicáveis, as soluções de outros órgãos, as descartadas e o custo total de propriedade das viáveis, com memória e fontes.'],
  ['VI', 'Estimativa do valor da contratação', PROSPECTING, true,
    'Informe valor total, preços unitários referenciais, datas, fontes e cálculos. Em obras e serviços de engenharia, informe base de custos, data-base, localidade, BDI e encargos cabíveis. Se a Administração justificar orçamento sigiloso, identifique apenas o anexo mantido no órgão, sem enviar os dados protegidos.'],
  ['VII', 'Descrição da solução como um todo', SOLUTION, false,
    'Que solução foi escolhida e o que está incluído? Quando pertinente, descreva implantação, operação, manutenção e assistência técnica. Se a decisão for não contratar, informe o encaminhamento.'],
  ['VIII', 'Parcelamento ou não da contratação', SOLUTION, true,
    'A solução deve ser dividida em itens ou lotes? Fundamente considerando competitividade, viabilidade técnica, ganho de escala e custo de coordenação.'],
  ['XI', 'Contratações correlatas ou interdependentes', SOLUTION, false,
    'Quais contratações tratam de objeto semelhante e quais são necessárias para que a solução funcione? Indique objeto, vínculo, sequência e responsável, se conhecidos.'],
  ['X', 'Providências prévias da Administração', SOLUTION, false,
    'Que adaptações, licenças, autorizações ou capacitações serão necessárias antes da celebração? Indique responsável e prazo se forem conhecidos.'],
  ['XII', 'Impactos ambientais e medidas mitigadoras', SOLUTION, false,
    'Identifique impactos e medidas proporcionais. Considere consumo de energia e recursos, descarte, reciclagem e logística reversa, conforme o objeto.'],
  ['IX', 'Resultados pretendidos', SOLUTION, false,
    'Quais ganhos de economicidade, eficiência e uso de recursos se esperam? Se houver dados, informe linha de base, meta, prazo e como medir.'],
  ['XIII', 'Posicionamento conclusivo', SOLUTION, true,
    'A contratação é adequada, inadequada ou depende de uma condição? Indique a posição da equipe e a evidência técnica e econômica que a sustenta. Não trate condicionantes em aberto como decisões tomadas.'],
].map(([id, title, group, required, prompt]) => Object.freeze({ id, title, group, required, prompt })));

const LIMITS = Object.freeze({ organization: 180, unit: 180, process: 80, title: 240, localRule: 400,
  answer: 1600, calculation: 1200, source: 360, unitPrices: 1200,
  sourceName: 160, sourceLocator: 240, sourceText: 4000, sourceCount: 5, sourceTotal: 16000 });
const IDS = SECTIONS.map(section => section.id);
const SPHERES = ['municipal', 'estadual', 'distrital', 'federal'];
const OBJECTS = ['bens', 'servicos', 'obras', 'tic'];
const SISP_FILL = new Set(['III', 'V', 'VII', 'IX']);
const CV = 'INVALID_ETP_INPUT';
const valid = value => check(value, CV, 422);

function record(value, allowed, optional = true) {
  if (value === undefined && optional) return {};
  valid(value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
    Object.keys(value).every(key => allowed.includes(key)));
  return value;
}

function bounded(value, length) {
  if (value === undefined) return '';
  valid(typeof value === 'string' && value.length <= length);
  const clean = value.normalize('NFC').replace(/\r\n?|\f/g, '\n').trim();
  valid(clean.length <= length && !/[\u0000-\u0008\u000b\u000e-\u001f\ufffe\uffff\p{Cs}]/u.test(clean));
  return clean;
}

function option(value, allowed, otherwise = '') {
  if (value === undefined) return otherwise;
  valid(allowed.includes(value));
  return value;
}

function flag(value) {
  valid(value === undefined || typeof value === 'boolean');
  return value === true;
}

function normalizeInput(input) {
  const root = record(input, ['identification', 'profile', 'answers', 'sources'], false);
  const ident = record(root.identification, ['organization', 'unit', 'process', 'title']);
  const profile = record(root.profile, ['sphere', 'objectType', 'federalTransfer', 'sisp', 'localRule']);
  const answers = record(root.answers, IDS);
  const sources = root.sources === undefined ? [] : root.sources;
  valid(Array.isArray(sources) && sources.length <= LIMITS.sourceCount);
  const normalizedSources = Array.from(sources, source => {
    const row = record(source, ['id', 'name', 'locator', 'text'], false);
    valid(typeof row.id === 'string' && /^F[1-5]$/.test(row.id));
    return { id: row.id, name: bounded(row.name, LIMITS.sourceName), locator: bounded(row.locator, LIMITS.sourceLocator),
      text: bounded(row.text, LIMITS.sourceText) };
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  valid(new Set(normalizedSources.map(source => source.id)).size === normalizedSources.length &&
    normalizedSources.reduce((chars, source) => chars + source.text.length, 0) <= LIMITS.sourceTotal);
  return {
    identification: { organization: bounded(ident.organization, LIMITS.organization), unit: bounded(ident.unit, LIMITS.unit),
      process: bounded(ident.process, LIMITS.process), title: bounded(ident.title, LIMITS.title) },
    profile: { sphere: option(profile.sphere, ['', ...SPHERES]), objectType: option(profile.objectType, ['', ...OBJECTS]),
      federalTransfer: flag(profile.federalTransfer), sisp: flag(profile.sisp), localRule: bounded(profile.localRule, LIMITS.localRule) },
    answers: Object.fromEntries(IDS.map(id => {
      const supports = id === 'IV' || id === 'VI';
      const answer = record(answers[id], supports ? ['status', 'text', 'support'] : ['status', 'text']);
      const canon = { status: option(answer.status, ['filled', 'omitted'], 'filled'), text: bounded(answer.text, LIMITS.answer) };
      if (supports) {
        const estimate = id === 'VI';
        const support = record(answer.support, estimate ? ['calculation', 'source', 'unitPrices', 'classified'] : ['calculation', 'source']);
        const ref = bounded(support.source, LIMITS.source);
        canon.support = { calculation: bounded(support.calculation, LIMITS.calculation), source: /^f[1-5]$/i.test(ref) ? ref.toUpperCase() : ref };
        if (estimate) Object.assign(canon.support, { unitPrices: bounded(support.unitPrices, LIMITS.unitPrices), classified: flag(support.classified) });
      }
      return [id, canon];
    })),
    sources: normalizedSources,
  };
}

function simple(text) {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '').replace(/[.!?;,:]+$/g, '').trim().replace(/\s+/g, ' ');
}

const PLACEHOLDER = /^(?:[-–—]+|n\s*[/.-]?\s*[ad]|nulo|null|undefined|nao (?:s[eê] aplica|se aplica neste caso|informado|disponivel|ha|sei|definido)|pendente|a (?:definir|preencher|confirmar|validar|apurar|estimar|informar)|ainda nao (?:definido|estimado|sabemos|apurado)|sem (?:dados|informacao)|[x_]+)$/i;
const GENERIC_OMISSION = /^(?:inaplicavel|dispensad[oa]|nenhum[a]?|nao e necessari[oa]|nao foi (?:feito|realizado|informado|possivel)|sem (?:aplicacao|justificativa|informacoes)|por nao se aplicar|nao (?:e aplicavel|se aplica ao objeto|se aplica a contratacao|ha dados|houve)|nada a declarar|justificado|item dispensado)$/i;
const TEST_WORDS = new Set(['teste', 'test', 'foo', 'bar', 'asdf', 'abc', 'exemplo', 'placeholder', 'dummy', 'tbd', 'todo', 'preencher', 'xxxx', 'informar']);
function testStub(text) {
  if (/^lorem ipsum\b/.test(text)) return true;
  const tokens = text.replace(/\.(?:pdf|docx?|txt|csv)$/i, '').split(/[\s_.,/()\[\]-]+/u).filter(Boolean);
  return TEST_WORDS.has(tokens[0]) && tokens.every(token => TEST_WORDS.has(token) || /^\d+$/.test(token));
}
function meaningful(text) {
  if (!text || !/[\p{L}\p{N}]/u.test(text)) return false;
  const clean = simple(text);
  return !PLACEHOLDER.test(clean) && !testStub(clean);
}
const justification = text => meaningful(text) && !GENERIC_OMISSION.test(simple(text)) && /[\p{L}\p{N}]+\s+[\p{L}\p{N}]+/u.test(text);

const QUANTITY_STOP = new Set(['a', 'ao', 'aos', 'as', 'ano', 'ano-base', 'anos', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'entre',
  'estimad', 'estimada', 'estimado', 'este', 'foi', 'foram', 'na', 'nas', 'neste', 'no', 'nos', 'o', 'os', 'ou', 'p', 'pag', 'pagina', 'para', 'pela',
  'pelas', 'pelo', 'pelos', 'por', 'que', 'sao', 'se', 'sem', 'serao', 'vezes', 'vide']);
const quantityUnit = /(?:^|(?<=[\s:(=;|,]))\d+(?:[.,]\d+)*\s*(?:[|;:=]\s*)?([\p{L}%][\p{L}\p{N}²³%/-]*)(?=$|[\s.,;:)=|])/igu;
function hasQuantity(text) {
  return [...text.matchAll(quantityUnit)].some(match => !QUANTITY_STOP.has(simple(match[1]))) ||
    /(?:^|[\s;(])(?:m[²³23]|kg|km|kWh|L|unidades?|un\.?|diárias|horas)\s*[:=|]\s*\d/imu.test(text);
}

function explicitMoney(text) {
  return /(?:R\$|US\$|C\$|\b(?:BRL|USD|EUR|GBP|JPY)|[$€£¥])\s*[:=]?\s*\d|\d[\d.,]*\s*(?:mil |milh(?:ão|ões) de )?(?:reais|dólares|euros|ienes)\b/i.test(text) ||
    /\b(?:valor|preço|custo|orçamento|montante)(?:\s+(?:total|unitári[oa]|estimad[oa]|referencial|previst[oa]|global|anual|mensal|máxim[oa])){0,3}(?:(?:\s+(?:é|foi|será|de|em|igual a)(?=\s)){1,3}|\s*[:=])\s*\d/iu.test(text) ||
    /\b(?:zero|um|uma|dois|duas|três|quatro|cinco|seis|sete|oito|nove|dez|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|mil|milhão|milhões)\s+(?:mil |milh(?:ão|ões) de |de )?(?:reais|dólares|euros|ienes)\b/iu.test(text);
}

function hasUnitPrices(text) {
  return meaningful(text) && (explicitMoney(text) || /(?:^|[\s=:|;])\d+(?:[.,]\d+)*\s*\/\s*\p{L}/u.test(text) ||
    /(?:^|[\s=:|;])\d+(?:\.\d{3})*,\d{2,6}(?=$|[\s;|])/u.test(text));
}

const hasTotal = text => meaningful(text) && (explicitMoney(text) || /^\d+(?:\.\d{3})*,\d{2,6}$/.test(text) ||
  /\b(?:valor total|valor estimado|total estimado)\s*[:=]?\s+\d+(?:[.,]\d+)*/iu.test(text));
const hasCalculation = text => meaningful(text) && ((text.match(/\p{L}{2,}/gu)?.length || 0) >= 3 ||
  /[\p{L}\d][\s\d.,)]*(?:[×+÷*/=]|\s-\s)\s*[\p{L}\d(]/u.test(text));
const hasSource = text => meaningful(text) && /\p{L}/u.test(text) &&
  (/^(?:[Aa]nexo|[Pp]lanilha|[Dd]ocumento)\s+[A-Z]\.?$/.test(text) ||
    ((/\d/.test(text) || /^https?:\/\//i.test(text) || /\.[a-z]{2,5}$/i.test(text) || /\p{L}{2,}\s+\p{L}{2,}/u.test(text)) &&
      !/^(?:(?:vide|ver|conforme)\s+)?(?:o |a |os |as )?(?:fonte|documentos?|anexos?|pesquisa|planilha|cotação|cotações|orçamento)(?:\s+[a-z])?\.?$/i.test(text)));

function validCpf(value) {
  const digits = value.replace(/\D/g, '').split('').map(Number);
  if (digits.length !== 11 || digits.every(digit => digit === digits[0])) return false;
  const digitAt = count => (digits.slice(0, count).reduce((total, digit, index) => total + digit * (count + 1 - index), 0) * 10 % 11) % 10;
  return digitAt(9) === digits[9] && digitAt(10) === digits[10];
}

function restrictedValue(text) {
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{28,}|\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}/i.test(text)) return true;
  if (/(?:[?&](?:access_token|client_secret|sig|signature|token)=)[A-Za-z0-9_-]{16,}/i.test(text)) return true;
  return Array.from(text.matchAll(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\bCPF\s*(?:n[º°.]?\s*)?[:=]?\s*(\d{11})\b/gi))
    .some(match => validCpf(match[1] || match[0]));
}

function byId() {
  const entries = new Map();
  return {
    add(id, message) { entries.set(id, [...new Set([...(entries.get(id) || []), message])]); },
    results() { return [...entries].map(([id, messages]) => ({ id, message: messages.join(' ') })); },
  };
}

function privacyGaps(input) {
  const value = normalizeInput(input);
  const result = byId();
  const estimate = value.answers.VI;
  const classified = estimate.support.classified;
  const redact = 'Remova o CPF, a credencial ou o dado de acesso identificado antes de enviar.';
  if (Object.values(value.identification).some(restrictedValue)) result.add('identification', redact);
  if (classified && Object.values(value.identification).some(explicitMoney)) result.add('identification', 'Remova dados monetários da identificação. Este orçamento será tratado em separado.');
  if (restrictedValue(value.profile.localRule) || value.sources.some(source => [source.name, source.locator, source.text].some(restrictedValue))) {
    result.add('profile', 'Revise as normas informadas e os documentos de apoio. ' + redact);
  }
  if (classified && explicitMoney(value.profile.localRule)) result.add('profile', 'Remova dados monetários das informações regulamentares. Este orçamento será tratado em separado.');
  if (classified && value.sources.length) result.add('profile', 'Nesta emissão com orçamento sigiloso, remova todos os anexos antes de continuar.');
  if (value.sources.some(source => /^(?:\[(?:sigiloso|restrito|secreto)\]|(?:documento |anexo )?(?:sigiloso|restrito|secreto)\b)|\((?:sigiloso|restrito|secreto)\)/i.test(source.name))) {
    result.add('profile', 'Remova documentos identificados como sigilosos, restritos ou secretos. Use somente referências autorizadas e públicas.');
  }
  for (const [id, answer] of Object.entries(value.answers)) {
    const fields = [answer.text, ...(answer.support ? Object.values(answer.support).filter(field => typeof field === 'string') : [])];
    if (fields.some(restrictedValue)) result.add(id, redact);
    if (classified && id !== 'VI' && fields.some(explicitMoney)) result.add(id, 'Remova dados monetários deste item. Este orçamento será tratado em separado.');
  }
  if (classified && (estimate.support.unitPrices || estimate.support.calculation || [estimate.text, estimate.support.source].some(explicitMoney))) {
    result.add('VI', 'Não inclua valores, preços unitários ou memória no orçamento sigiloso. Informe apenas a justificativa pública e a referência do anexo mantido no órgão.');
  }
  if (classified && /^F[1-5]$|\[F\d+\]/i.test(estimate.support.source)) {
    result.add('VI', 'Referencie o anexo classificado pelo número ou código institucional. Não anexe esse documento.');
  }
  return result.results();
}

function gaps(input) {
  const value = normalizeInput(input);
  const result = byId();
  for (const { id, message } of privacyGaps(value)) result.add(id, message);
  if (!meaningful(value.identification.organization) || !meaningful(value.identification.title)) {
    result.add('identification', 'Informe o órgão ou a entidade e um título que identifique a demanda.');
  }
  if (!value.profile.sphere || !value.profile.objectType) result.add('profile', 'Indique a esfera e o tipo do objeto da contratação.');
  const sisp = value.profile.sphere === 'federal' && value.profile.objectType === 'tic' && value.profile.sisp;
  if (value.profile.sisp && !sisp) result.add('profile', 'Confirme o enquadramento no SISP apenas para contratação de TIC federal.');
  if (value.profile.federalTransfer && value.profile.sphere === 'federal') result.add('profile', 'A opção de transferência voluntária da União se destina ao ente recebedor estadual, distrital ou municipal.');
  if (value.sources.some(source => !meaningful(source.name) || !meaningful(source.text))) {
    result.add('profile', 'Identifique cada documento de apoio e inclua apenas um trecho útil ou remova o anexo vazio.');
  }
  const tracked = new Set(value.sources.filter(source => meaningful(source.name) && meaningful(source.text)).map(source => source.id));
  const repeated = new Map();
  for (const [id, { text }] of Object.entries(value.answers)) {
    if (!meaningful(text)) continue;
    const comparable = simple(text).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    repeated.set(comparable, [...(repeated.get(comparable) || []), id]);
  }
  const requiredIds = new Set(SECTIONS.filter(section => section.required).map(section => section.id));
  const duplicates = new Set([...repeated.values()].filter(matches => matches.length >= 3 ||
    matches.filter(id => requiredIds.has(id)).length >= 2).flat());
  for (const { id, required } of SECTIONS) {
    const { status, text, support } = value.answers[id];
    if (duplicates.has(id)) result.add(id, 'A mesma resposta foi usada em quesitos distintos. Detalhe a informação específica deste item.');
    const references = Array.from(text.matchAll(/\[(F\d+)\]/gi), match => match[1].toUpperCase());
    if (support && /^F\d+$/i.test(support.source)) references.push(support.source.toUpperCase());
    if (references.some(ref => !tracked.has(ref))) result.add(id, 'A resposta aponta para uma fonte inexistente ou incompleta. Corrija a referência ou inclua a fonte.');
    if (status === 'omitted') {
      if (required || (sisp && SISP_FILL.has(id))) result.add(id, 'Este item precisa de conteúdo para o perfil informado.');
      else if (!justification(text)) result.add(id, 'Explique por que este item foi omitido no seu caso. Evite apenas “não se aplica”.');
      continue;
    }
    if (!meaningful(text)) result.add(id, 'Responda a este item ou, quando permitido, justifique a omissão.');
    if (id === 'IV' || id === 'VI') {
      if (!hasSource(support.source)) {
        result.add(id, support.classified ? 'Identifique o anexo classificado mantido sob guarda do órgão.' : 'Identifique a fonte de apoio (documento, pesquisa, base ou anexo).');
      }
      if (!support.classified && !hasCalculation(support.calculation)) result.add(id, 'Informe a memória e o critério de cálculo.');
      if (id === 'IV' && !hasQuantity(text + '\n' + support.calculation)) result.add(id, 'Indique a quantidade estimada em números e a unidade.');
      if (id === 'VI' && !support.classified && !hasUnitPrices(support.unitPrices)) {
        result.add(id, 'Informe os valores unitários referenciais utilizados.');
      }
      if (id === 'VI' && !support.classified && !hasTotal(text)) result.add(id, 'Informe o valor total estimado para a contratação.');
      if (support.classified && !justification(text)) result.add(id, 'Justifique resumidamente por que o orçamento foi mantido sob sigilo.');
    }
  }
  return result.results();
}

function scopeNote(input) {
  const { profile } = normalizeInput(input);
  const notes = ['Minuta com base no art. 18 da Lei nº 14.133/2021. Confira o enquadramento, a regulamentação e o rito oficial do seu órgão antes de usar.'];
  if (profile.sphere === 'federal' || profile.federalTransfer) {
    notes.push('Confirme a incidência da IN SEGES nº 58/2022 no seu caso. Quando aplicável, observe as regras do ETP Digital ou da ferramenta própria do ente recebedor, conforme o art. 4º. Esta exportação não substitui a tramitação oficial.');
  }
  if (profile.sisp && profile.sphere === 'federal' && profile.objectType === 'tic') {
    notes.push('Para TIC no SISP, confirme o atendimento ao art. 11 da IN SGD/ME nº 94/2022, incluindo a comparação de soluções, os custos de ciclo de vida e a aprovação pelas instâncias competentes.');
  }
  if (profile.objectType === 'obras') notes.push('O art. 18, § 3º, não dispensa o ETP. Se o caso permitir especificação em termo de referência ou projeto básico, motive a ausência de prejuízo para a aferição de desempenho e qualidade.');
  return notes.join(' ');
}

module.exports = { SECTIONS, LIMITS, normalizeInput, gaps, privacyGaps, scopeNote, containsExplicitMoney: explicitMoney };
