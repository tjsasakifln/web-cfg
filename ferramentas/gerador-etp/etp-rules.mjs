// Verificação local do Gerador de ETP: as mesmas regras de runtime/tools-commerce/etp-input.cjs (gaps), executadas
// no navegador para mostrar o que falta enquanto a pessoa preenche, sem conta, rede ou crédito.
// O servidor continua sendo a autoridade. tests/tools-commerce/etp-rules.test.cjs compara as duas implementações;
// ao mudar uma regra lá, copie-a aqui (o bloco entre os marcadores é cópia literal).

const SECTIONS = [['I', true], ['II', false], ['III', false], ['IV', true], ['V', false], ['VI', true], ['VII', false],
  ['VIII', true], ['XI', false], ['X', false], ['XII', false], ['IX', false], ['XIII', true]].map(([id, required]) => ({ id, required }));
const IDS = SECTIONS.map(section => section.id);
const SISP_FILL = new Set(['III', 'V', 'VII', 'IX']);

const clean = value => typeof value !== 'string' ? '' : value.normalize('NFC').replace(/\r\n?|\f/g, '\n')
  .replace(/[\u00ad\u200b-\u200d\u2060\ufeff\u0080-\u009f]/g, '').trim();

// Mesma forma canônica de normalizeInput, sem rejeitar: a página só monta entradas válidas.
function normalizeInput(input) {
  if (input?.normalized === true) return input;
  const ident = input?.identification ?? {};
  const profile = input?.profile ?? {};
  const answers = input?.answers ?? {};
  return {
    normalized: true,
    identification: Object.fromEntries(['organization', 'unit', 'process', 'title'].map(key => [key, clean(ident[key])])),
    profile: { sphere: profile.sphere || '', objectType: profile.objectType || '', federalTransfer: profile.federalTransfer === true,
      sisp: profile.sisp === true, localRule: clean(profile.localRule) },
    answers: Object.fromEntries(IDS.map(id => {
      const answer = answers[id] ?? {};
      const canon = { status: answer.status === 'omitted' ? 'omitted' : 'filled', text: clean(answer.text) };
      if (id === 'IV' || id === 'VI') {
        const support = answer.support ?? {};
        const ref = clean(support.source);
        canon.support = { calculation: clean(support.calculation), source: /^f[1-5]$/i.test(ref) ? ref.toUpperCase() : ref };
        if (id === 'VI') Object.assign(canon.support, { unitPrices: clean(support.unitPrices), classified: support.classified === true });
      }
      return [id, canon];
    })),
    sources: (Array.isArray(input?.sources) ? input.sources : []).map(source => ({ id: source.id, name: clean(source.name),
      locator: clean(source.locator), text: clean(source.text) })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  };
}

// --- início da cópia literal de etp-input.cjs ---
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
    /\b(?:zero|um|uma|dois|duas|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil|milhão|milhões|bilhão|bilhões)\s+(?:mil |milh(?:ão|ões) de |bilh(?:ão|ões) de |de )?(?:reais|dólares|euros|ienes)\b/iu.test(text) ||
    // Brazilian amounts written without a currency sign, such as 450.000,00 or 1.234,5.
    /(?:^|[^\d.,])\d{1,3}(?:\.\d{3})+,\d{2}(?![\d,%])(?!\s*(?:m[²³23]?|km|kg|t|l|h|un|und|unidades?|horas?)\b)/u.test(text);
}

// Classified mode also refuses magnitudes and value wording that a total or a gap check would not need.
function classifiedMoney(text) {
  return explicitMoney(text) ||
    /\b\d+(?:[.,]\d+)?\s*(?:mil|milh(?:ão|ões)|bilh(?:ão|ões)|mi|bi)\b(?!\s+(?:de\s+)?(?:m[²³23]?|metros?|km|quilômetros?|kg|quilos?|toneladas?|litros?|unidades?|habitantes|pessoas|alunos|pacientes|atendimentos|horas?|dias|acessos|usuários|itens|peças|folhas|cópias|páginas)\b)/iu.test(text) ||
    /\b(?:teto|despesa|gasto|dotação|custo|valor|orçamento|montante|preço)\b[^.;\n]{0,40}?\b\d[\d.,]*\s*(?:mil|milh(?:ão|ões)|bilh(?:ão|ões))?\b/iu.test(text) ||
    // A total written with cents, such as "Total estimado: 275,00", is money even without a currency sign.
    /\b(?:sub)?total\b[^.;\n]{0,40}?\b\d[\d.]*,\d{2}(?![\d,%])(?!\s*(?:m[²³23]?|km|kg|t|l|h|un|und|unidades?|horas?)\b)/iu.test(text);
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
  if (classified && Object.values(value.identification).some(classifiedMoney)) result.add('identification', 'Remova dados monetários da identificação. Este orçamento será tratado em separado.');
  if (restrictedValue(value.profile.localRule) || value.sources.some(source => [source.name, source.locator, source.text].some(restrictedValue))) {
    result.add('profile', 'Revise as normas informadas e os documentos de apoio. ' + redact);
  }
  if (classified && classifiedMoney(value.profile.localRule)) result.add('profile', 'Remova dados monetários das informações regulamentares. Este orçamento será tratado em separado.');
  if (classified && value.sources.length) result.add('profile', 'Nesta emissão com orçamento sigiloso, remova todos os anexos antes de continuar.');
  if (value.sources.some(source => /(?:sigilos|restrit|secret|confidencia|classificad|reservad)/i.test(simple(source.name)))) {
    result.add('profile', 'Remova documentos identificados como sigilosos, restritos ou secretos. Use somente referências autorizadas e públicas.');
  }
  for (const [id, answer] of Object.entries(value.answers)) {
    const fields = [answer.text, ...(answer.support ? Object.values(answer.support).filter(field => typeof field === 'string') : [])];
    if (fields.some(restrictedValue)) result.add(id, redact);
    if (classified && id !== 'VI' && fields.some(classifiedMoney)) result.add(id, 'Remova dados monetários deste item. Este orçamento será tratado em separado.');
  }
  if (classified && (estimate.support.unitPrices || estimate.support.calculation || hasTotal(estimate.text) || [estimate.text, estimate.support.source].some(classifiedMoney))) {
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
// --- fim da cópia literal ---

export { gaps, privacyGaps, meaningful, hasQuantity, hasUnitPrices, hasTotal, hasCalculation, hasSource, restrictedValue, classifiedMoney };
