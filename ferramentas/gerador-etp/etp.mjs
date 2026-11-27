import { createToolCredits } from '/assets/js/tool-credits.mjs';
import { extractAttachment } from './etp-attachments.mjs';

const apiPath = '/api/web/tool-credits';
const form = document.getElementById('etp-form');
const get = id => document.getElementById('etp-' + id);
const control = name => form.elements.namedItem(name);
const setStatus = message => { get('status').textContent = message; };
const tidy = value => String(value ?? '').normalize('NFC').trim();
const el = (tag, text, attrs = {}) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};
const field = (name, html) => { const label = el('label', name); label.append(html); return label; };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const now = () => Date.now();
const base = [
  ['I', 'Necessidade da contratação', true, 'Que problema precisa ser resolvido? Informe a situação atual, quem é afetado, o interesse público e a evidência disponível.'],
  ['II', 'Plano de Contratações Anual', false, 'O órgão elaborou PCA? Se sim, indique o exercício e a referência do objeto. Se não foi previsto ou não houve plano, explique a situação.'],
  ['III', 'Requisitos da contratação', false, 'O que a solução precisa atender e por quê? Informe qualidade, desempenho, prazo, restrições e critérios de sustentabilidade pertinentes.'],
  ['IV', 'Estimativa das quantidades', true, 'Indique itens, quantidades, unidades e período de referência. Use a memória e uma fonte para que a equipe consiga refazer a estimativa.'],
  ['V', 'Levantamento de mercado', false, 'Quais alternativas foram pesquisadas? Compare atendimento, custo e risco, explique a preferência e identifique as fontes.'],
  ['VI', 'Estimativa do valor da contratação', true, 'Informe o total estimado, os preços unitários referenciais, a data da referência, a origem dos valores e a memória de cálculo.'],
  ['VII', 'Solução como um todo', false, 'Descreva o que compõe a solução escolhida. Se pertinente, inclua implantação, operação, manutenção e assistência técnica.'],
  ['VIII', 'Parcelamento ou não da contratação', true, 'Justifique contratar junto ou em lotes, considerando competição, viabilidade, escala, dependências e custos de coordenação.'],
  ['XI', 'Contratações correlatas ou interdependentes', false, 'Indique contratações com objeto semelhante e, separadamente, as que são necessárias para esta solução funcionar. Explique os vínculos.'],
  ['X', 'Providências prévias da Administração', false, 'Que medidas precisam ocorrer antes da celebração? Inclua instalações, licenças, acessos ou capacitação de gestão e fiscalização se forem necessárias.'],
  ['XII', 'Impactos ambientais e mitigação', false, 'Que impactos são esperados? Identifique medidas de mitigação, consumo de recursos, descarte, reciclagem ou logística reversa quando cabível.'],
  ['IX', 'Resultados pretendidos', false, 'Que benefício se espera e como poderá ser medido? Informe economia, eficiência ou uso dos recursos, de preferência com uma referência inicial e uma meta.'],
  ['XIII', 'Posicionamento conclusivo', true, 'A contratação é adequada, inadequada ou viável com condicionantes? Registre a posição da equipe e as evidências que sustentam a conclusão.'],
];
const byId = new Map();
const sourceCards = new Map();
const sispRequired = new Set(['III', 'V', 'VII', 'IX']);
const validId = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const recoveryKey = 'confenge.etp.emissao.v1';
let cachedId;
try {
  const value = sessionStorage.getItem(recoveryKey);
  if (validId.test(value ?? '')) cachedId = value;
} catch { /* Browser storage is optional. */ }
let wallet;
let firebase;
let auth;
let visibleStep = 0;
let provisionedUid;
let busy = false;
let extracting = false;
let quote;
let requestId;
let draftKey;
let files;
let filesOwner;
let reviewedInterview = false;
let interviewContext;
// Set when the confirmation applies to a draft the server already prepared (no new drafting call).
let stagedId;
let sourceNonce = 0;

function addSection(id, title, required, prompt) {
  const box = el('details', '', { class: 'etp-q', id: 'etp-inciso-' + id });
  const summary = el('summary', id + '. ' + title);
  const statusTag = el('small', '');
  summary.append(statusTag);
  const body = el('div');
  const help = el('p', prompt, { id: 'etp-hint-' + id, class: 'etp-question-help' });
  const status = el('select', '', { name: id + '-status' });
  status.append(el('option', 'Registrar conteúdo do item', { value: 'filled' }), el('option', 'Justificar a ausência deste item', { value: 'omitted' }));
  const answer = el('textarea', '', { name: id + '-text', rows: '4', maxlength: '1600', 'aria-describedby': help.id });
  const statusWrap = field('Como tratar este quesito?', status);
  const answerName = el('span', 'Resposta');
  const answerWrap = el('label');
  answerWrap.append(answerName, answer);
  body.append(help, statusWrap, answerWrap);
  const row = { box, summary, statusTag, help, status, statusWrap, answer, answerName, title, required, prompt };
  if (id === 'IV' || id === 'VI') {
    const group = el('div', '', { 'data-support': '' });
    row.calculation = el('textarea', '', { name: id + '-calculation', rows: '3', maxlength: '1200' });
    row.source = el('input', '', { name: id + '-source', maxlength: '360', placeholder: 'Ex.: Inventário n.º 14, p. 2; ou F1' });
    row.calculationWrap = field('Memória e critério de cálculo', row.calculation);
    const sourceText = el('span', 'Fonte que sustenta a estimativa');
    const sourceLabel = el('label');
    sourceLabel.append(sourceText, row.source);
    row.sourceText = sourceText;
    if (id === 'VI') {
      row.classified = el('input', '', { name: 'vi-classified', type: 'checkbox' });
      const classifiedLabel = el('label', '', { class: 'etp-check' });
      classifiedLabel.append(row.classified, document.createTextNode('O órgão optou motivadamente pelo sigilo do orçamento. Não enviar os valores.'));
      row.unitPrices = el('textarea', '', { name: id + '-prices', rows: '3', maxlength: '1200' });
      row.unitPricesWrap = field('Preços unitários referenciais e respectivas unidades', row.unitPrices);
      group.append(classifiedLabel, row.unitPricesWrap);
    }
    group.append(row.calculationWrap, sourceLabel);
    body.append(group);
  }
  box.append(summary, body);
  if (id === 'I') box.open = true;
  get('items').append(box);
  byId.set(id, row);
}

function activeProfile() {
  return {
    sphere: control('sphere').value,
    objectType: control('objectType').value,
    federalTransfer: control('sphere').value !== 'federal' && control('federalTransfer').checked,
    sisp: control('sphere').value === 'federal' && control('objectType').value === 'tic' && control('sisp').checked,
    localRule: tidy(control('localRule').value),
  };
}

function refreshContext() {
  const p = activeProfile();
  get('transfer').hidden = p.sphere === 'federal';
  get('sisp').hidden = p.sphere !== 'federal' || p.objectType !== 'tic';
  const explanations = ['Confira o regulamento e a forma de tramitação oficial do órgão.'];
  if (p.sphere === 'federal' || p.federalTransfer) explanations.push('Verifique a incidência da IN SEGES nº 58/2022 e o rito aplicável ao ETP Digital ou à ferramenta admitida no seu caso.');
  if (p.sisp) explanations.push('Para TIC no SISP, observe também o art. 11 da IN SGD/ME nº 94/2022. A entrevista pede detalhes de requisitos, alternativas, solução e resultados.');
  if (p.objectType === 'obras') explanations.push('Para obras e serviços de engenharia, reúna levantamentos, quantitativos, referência de preços, licenças e condicionantes.');
  get('scope').textContent = explanations.join(' ');
  for (const [id, row] of byId) {
    const required = row.required || (p.sisp && sispRequired.has(id));
    row.statusWrap.hidden = required;
    if (required) row.status.value = 'filled';
    const omitted = row.status.value === 'omitted';
    row.answerName.textContent = omitted ? 'Justificativa da ausência' : 'Resposta';
    let extra = '';
    if (id === 'III' && p.objectType === 'tic') extra = ' Em TIC, inclua requisitos de negócio, integração, segurança, portabilidade e padrões aplicáveis.';
    if (id === 'IV' && p.objectType === 'obras') extra = ' Identifique o levantamento, desenhos ou memórias usados e o método de medição.';
    if (id === 'V' && p.objectType === 'bens') extra = ' Quando compra e locação forem possíveis, compare custos e benefícios das duas formas.';
    if (id === 'V' && p.sisp) extra = ' Inclua soluções de outros órgãos, software disponível, padrões, alternativas descartadas e custos de ciclo de vida das opções viáveis, com memória e fontes.';
    if (id === 'VI' && p.objectType === 'obras') extra = ' Inclua base de custos, data-base, localidade, BDI e encargos cabíveis.';
    const classified = row.classified?.checked === true;
    if (classified) {
      row.help.textContent = 'Registre só a justificativa pública para o sigilo e a referência do anexo interno. Não inclua anexos nem valores monetários em nenhum campo deste ETP.';
      row.sourceText.textContent = 'Identificação institucional do anexo classificado';
      row.source.placeholder = 'Ex.: Anexo de orçamento nº 03';
    } else {
      row.help.textContent = omitted ? 'Explique por que este quesito não foi incluído. Um “não se aplica” sem fundamentação não é suficiente.' : row.prompt + extra;
      if (row.sourceText) row.sourceText.textContent = 'Fonte que sustenta a estimativa';
      if (row.source) row.source.placeholder = 'Ex.: Levantamento nº 14, p. 2, ou F1';
    }
    if (row.classified) row.calculationWrap.hidden = row.unitPricesWrap.hidden = classified;
    row.statusTag.textContent = tidy(row.answer.value) ? (omitted ? 'Justificativa registrada' : 'Resposta registrada') : (required ? 'Obrigatório neste caso' : 'A responder ou justificar');
  }
}

function readInput() {
  return {
    identification: Object.fromEntries(['organization', 'unit', 'process', 'title'].map(name => [name, tidy(control(name).value)])),
    profile: activeProfile(),
    answers: Object.fromEntries([...byId].map(([id, row]) => {
      const entry = { status: row.status.value, text: tidy(row.answer.value) };
      if (row.source) entry.support = { calculation: row.classified?.checked ? '' : tidy(row.calculation.value), source: tidy(row.source.value) };
      if (row.classified) Object.assign(entry.support, { classified: row.classified.checked, unitPrices: row.classified.checked ? '' : tidy(row.unitPrices.value) });
      return [id, entry];
    })),
    sources: [...sourceCards].filter(([, row]) => row.include.checked).map(([id, row]) => ({
      id, name: tidy(row.name.value), locator: tidy(row.locator.value), text: tidy(row.text.value),
    })),
  };
}

function refreshProgress() {
  const input = readInput();
  const count = Object.values(input.answers).filter(row => row.text).length;
  const total = input.sources.reduce((sum, source) => sum + source.text.length, 0);
  get('progress').textContent = `${count} de 13 quesitos com resposta ou justificativa registrada. ${input.sources.length} fonte(s) confirmada(s), ${total.toLocaleString('pt-BR')} de 16.000 caracteres disponíveis em trechos.`;
}

function go(step, focus = true) {
  visibleStep = step;
  form.querySelectorAll('[data-step]').forEach(node => { node.hidden = Number(node.dataset.step) !== step; });
  // Attachments are read locally outside the form; they belong to the first step.
  get('attachments').hidden = form.hidden || step !== 0;
  form.querySelectorAll('.etp-steps [data-go]').forEach(node => {
    if (Number(node.dataset.go) === step) node.setAttribute('aria-current', 'step');
    else node.removeAttribute('aria-current');
  });
  if (step === 2) refreshProgress();
  if (focus) form.querySelector(`[data-step="${step}"] h3`)?.focus();
}
const showQuote = value => {
  quote = value;
  get('confirm').hidden = !quote;
  if (!quote) return;
  const bucketLabels = {
    free: 'Uma emissão de cortesia, se ainda disponível na confirmação.',
    promo: 'Um crédito promocional.',
    subscription: 'Um crédito da sua assinatura.',
    paid: 'Um crédito da sua carteira.',
    experiment: 'Uma emissão de benefício disponível na sua conta.',
  };
  get('quote').textContent = bucketLabels[quote.bucket] ?? 'Uma emissão será registrada na sua conta.';
  get('generate').focus();
};
const contextOf = input => JSON.stringify([input.identification, input.profile, input.answers.VI.support?.classified]);
const onDraftChange = () => {
  showQuote(undefined);
  stagedId = undefined;
  if (reviewedInterview && interviewContext !== contextOf(readInput())) reviewedInterview = false;
  refreshContext();
  if (visibleStep === 2) refreshProgress();
};

function addSource({ displayName = '', locator = '', text = '' } = {}) {
  const id = ['F1', 'F2', 'F3', 'F4', 'F5'].find(key => !sourceCards.has(key));
  if (!id) { get('file-status').textContent = 'O limite é de cinco fontes. Remova uma para incluir outra.'; return; }
  const card = el('fieldset', '', { class: 'etp-source' });
  card.append(el('legend', `Fonte ${id}`));
  const name = el('input', '', { name: 'etp-source-name-' + id, maxlength: '160' });
  const place = el('input', '', { name: 'etp-source-location-' + id, maxlength: '240', placeholder: 'Ex.: pág. 3 ou identificador público do documento' });
  const content = el('textarea', '', { name: 'etp-source-text-' + id, maxlength: '4000', rows: '4' });
  const include = el('input', '', { name: 'etp-source-include-' + id, type: 'checkbox' });
  const includeLabel = el('label', '', { class: 'etp-check' });
  includeLabel.append(include, document.createTextNode('Confirmo este trecho e autorizo sua inclusão no processamento.'));
  const remove = el('button', `Remover ${id}`, { class: 'etp-source-remove', type: 'button' });
  name.value = displayName.slice(0, 160);
  place.value = locator.slice(0, 240);
  content.value = text.slice(0, 4_000);
  sourceCards.set(id, { card, name, locator: place, text: content, include });
  const row = el('div', '', { class: 'etp-fields' });
  row.append(field('Nome público ou título curto', name), field('Página, referência ou seção', place));
  card.append(row, field('Trecho para conferência', content), includeLabel, remove);
  [name, place, content].forEach(node => node.addEventListener('input', () => { include.checked = false; }));
  remove.addEventListener('click', () => {
    sourceCards.delete(id); card.remove(); onDraftChange(); get('source-add').focus();
  });
  get('sources').append(card);
  onDraftChange();
  return id;
}

async function importFiles() {
  const list = Array.from(get('file').files ?? []);
  get('file').value = '';
  if (!list.length || extracting) return;
  extracting = true; get('file').disabled = true;
  const token = ++sourceNonce;
  const log = [];
  try {
    for (const [index, file] of list.entries()) {
      if (sourceCards.size >= 5) { log.push('O limite de cinco fontes foi alcançado.'); break; }
      get('file-status').textContent = `Lendo arquivo ${index + 1} de ${list.length} neste navegador.`;
      try {
        const { locator, text, truncated } = await extractAttachment(file, Number(get('page').value));
        if (token !== sourceNonce) return;
        const id = addSource({ displayName: file.name, locator, text });
        if (id) log.push(truncated ? `${id} contém um recorte. Você pode editá-lo antes de confirmar.` : `Revise a fonte ${id} antes de confirmar.`);
      } catch (error) {
        log.push(`Arquivo ${index + 1}: ${error.message}`);
      }
    }
  } finally {
    get('file-status').textContent = log.join(' ');
    get('file').disabled = false;
    extracting = false;
  }
}

function activeUser(user) {
  if (!user || auth?.currentUser?.uid !== user.uid) throw Object.assign(new Error(), { error: 'ACCOUNT_CHANGED' });
}
function keepAttempt(id) {
  cachedId = id;
  try { sessionStorage.setItem(recoveryKey, id); } catch { /* No document data is stored. */ }
  get('recovery').hidden = false;
}

async function request(op, body, user) {
  activeUser(user);
  const bearer = await user.getIdToken();
  activeUser(user);
  const response = await fetch(apiPath + '?op=' + op, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(26_000),
  });
  const data = await response.json().catch(() => ({}));
  activeUser(user);
  if (!response.ok) throw Object.assign(new Error(), { data, error: data.error || 'ETP_REQUEST_FAILED', status: response.status });
  return data;
}

async function account({ provision = true } = {}) {
  const user = auth?.currentUser;
  if (!user) {
    await wallet.open();
    setStatus('Entre na sua conta e volte à entrevista para continuar.');
    return null;
  }
  if (!provision) return user;
  await user.reload();
  activeUser(user);
  if (!user.emailVerified) {
    await wallet.open('Confirme o e-mail da sua conta e volte à entrevista.');
    setStatus('A entrevista com o serviço de redação exige uma conta com e-mail confirmado.');
    return null;
  }
  if (provisionedUid !== user.uid) {
    // The wallet's provisioning carries a saved first-touch referral; a bare account call would lose it.
    await wallet.provision(user);
    activeUser(user);
    provisionedUid = user.uid;
  }
  return user;
}

function jumpTo(id) {
  const row = byId.get(id);
  if (row) {
    go(1, false); row.box.open = true; row.answer.focus(); return;
  }
  go(0, false);
  (id === 'identification' ? control('organization') : control('sphere')).focus();
}
function feedback({ gaps = [], questions = [] } = {}) {
  const host = get('gaps');
  host.replaceChildren();
  for (const [title, data] of [['O que falta conferir', gaps], ['Perguntas para melhorar o ETP', questions]]) {
    if (!Array.isArray(data) || !data.length) continue;
    host.append(el('h4', title));
    const list = el('ul');
    for (const entry of data) {
      const row = byId.get(entry?.id);
      const context = row ? `${entry.id}. ${row.title}` : entry?.id === 'identification' ? 'Identificação' : 'Contexto e fontes';
      const item = el('li');
      const target = el('a', context, { href: row ? '#' + row.box.id : '#entrevista' });
      target.addEventListener('click', event => { event.preventDefault(); jumpTo(entry.id); });
      item.append(target, document.createTextNode(' · ' + String(entry.message ?? entry.question ?? 'Confira os dados fornecidos.')));
      if (entry.why) item.append(el('p', entry.why));
      list.append(item);
    }
    host.append(list);
  }
  host.hidden = !host.childElementCount;
}

function errorMessage(code) {
  return ({
    ETP_PRIVATE_INPUT: 'Remova os dados identificados antes de enviar.',
    ETP_INTERVIEW_REQUIRED: 'A entrevista precisa ser refeita para o contexto atual. Use “Conferir crédito” para retomar.',
    ETP_INCOMPLETE: 'Preencha ou justifique os itens apontados e confira novamente. Nenhum crédito foi usado.',
    NO_CREDITS: 'Não há crédito disponível para o Gerador de ETP nesta conta. Consulte a conta e os créditos.',
    EMAIL_UNVERIFIED: 'Confirme o e-mail da sua conta para continuar.',
    AUTH_REQUIRED: 'Entre na sua conta para continuar.',
    ACCOUNT_CHANGED: 'A conta foi alterada. Entre na conta usada para a emissão e tente novamente.',
    ACCOUNT_BLOCKED: 'A conta não está liberada para emitir.',
    ETP_DAILY_LIMIT: 'O limite de processamento da conta foi alcançado hoje.',
    TOO_MANY_REQUESTS: 'Muitas consultas em sequência. Aguarde um pouco e tente novamente.',
    ETP_RETRY_LIMIT: 'As tentativas para esta emissão acabaram. Não houve débito por tentativa malsucedida.',
    ETP_ACTIVE_REQUEST: 'Já há uma emissão em processamento nesta conta. Aguarde e consulte a tentativa existente antes de iniciar outra.',
    ETP_CONTEXT_TOO_LARGE: 'O contexto ultrapassou o limite de processamento. Preserve os dados essenciais e reduza ou remova os trechos repetidos.',
    ETP_BUDGET_PAUSED: 'A redação atingiu o limite de processamento. Nenhum crédito foi usado nesta tentativa.',
    ETP_PROVIDER_UNAVAILABLE: 'O serviço de redação não respondeu. Nenhum crédito foi usado. Tente novamente.',
    ETP_PROVIDER_RESPONSE: 'A redação não retornou uma minuta verificável. Nenhum crédito foi usado.',
    ETP_UNSUPPORTED_FACT: 'A redação trouxe um número, uma norma ou uma informação que não está nas suas respostas, e foi descartada. Nenhum crédito foi usado. Tente de novo.',
    ETP_INTERRUPTED: 'O processamento foi interrompido. Se possível, retome a mesma emissão.',
    ETP_EXPIRED: 'O prazo de recuperação desta emissão terminou.',
    REQUEST_CONFLICT: 'Os dados da entrevista mudaram desde a emissão. Consulte a tentativa anterior ou confira os dados para uma nova emissão.',
    EXPORT_CONFIRMATION_REQUIRED: 'O benefício ou saldo mudou. Confira novamente o crédito e confirme.',
    EXPORT_CONFIRMATION_CHANGED: 'O benefício ou saldo mudou. Confira novamente o crédito e confirme.',
    FEATURE_DISABLED: 'O processamento está indisponível no momento. O roteiro abaixo segue disponível.',
    OPERATION_LIMIT: 'O limite diário de emissões do seu plano foi alcançado. A emissão poderá ser feita amanhã ou com outro crédito da carteira.',
    ETP_ARTIFACT_NOT_READY: 'Os arquivos desta emissão ainda não estão prontos. Consulte a emissão em instantes.',
    ETP_ARTIFACT_FAILED: 'Não foi possível abrir os arquivos desta emissão. Nenhum crédito novo foi usado. Fale com a CONFENGE para recuperar a emissão.',
  })[code] || 'Não consegui concluir a consulta. Tente novamente ou use “Consultar emissão” se já iniciou a redação.';
}

function ensureShare(input) {
  if (!control('consent').checked) {
    setStatus('Leia e confirme a autorização para enviar as respostas e trechos autorizados.');
    control('consent').focus(); return false;
  }
  if (input.answers.VI.support.classified && input.sources.length) {
    setStatus('Desmarque os trechos anexados. A emissão com orçamento classificado usa apenas a referência do anexo mantido pelo órgão.');
    jumpTo('profile'); return false;
  }
  if (!input.answers.VI.support.classified && [...sourceCards.values()].some(row => !row.include.checked && tidy(row.text.value))) {
    setStatus('Confirme os trechos que quer usar ou remova os que não devem participar da redação.');
    jumpTo('profile'); return false;
  }
  if (input.sources.reduce((sum, source) => sum + source.text.length, 0) > 16_000) {
    setStatus('Reduza os trechos confirmados para o limite total de 16.000 caracteres.');
    jumpTo('profile'); return false;
  }
  return true;
}
const protectedRun = action => async () => {
  if (busy) return;
  busy = true;
  form.setAttribute('aria-busy', 'true');
  const buttons = ['interview', 'prepare', 'generate', 'resume'].map(get);
  buttons.forEach(button => { button.disabled = true; });
  try { await action(); }
  catch (error) {
    if (Array.isArray(error.data?.gaps)) { go(2, false); feedback(error.data); get('status').focus(); }
    if (error.error === 'ETP_INTERVIEW_REQUIRED') reviewedInterview = false;
    if (error.error === 'ETP_EXPIRED') showQuote(undefined);
    // A request that can no longer be retried must not be reused by the next attempt.
    if (error.error === 'ETP_RETRY_LIMIT' || error.error === 'ETP_EXPIRED') { requestId = undefined; draftKey = undefined; }
    setStatus(errorMessage(error.error));
  } finally {
    busy = false;
    form.removeAttribute('aria-busy');
    buttons.forEach(button => { button.disabled = false; });
  }
};

async function interview(input, user) {
  const before = JSON.stringify(input);
  if (!control('consent').checked || before !== JSON.stringify(readInput())) {
    setStatus('As respostas ou a autorização mudaram. Confira novamente antes de enviar.');
    return false;
  }
  setStatus('A entrevista está analisando suas respostas e trechos confirmados.');
  const result = await request('etp-interview', { input, consent: true }, user);
  if (before !== JSON.stringify(readInput()) || !control('consent').checked) {
    setStatus('As respostas mudaram durante a consulta. Revise antes de pedir novas perguntas.'); return false;
  }
  feedback(result);
  reviewedInterview = true;
  interviewContext = contextOf(input);
  const pending = result.gaps?.length > 0 || result.questions?.length > 0;
  if (pending) { go(2, false); get('gaps').setAttribute('tabindex', '-1'); get('gaps').focus(); }
  setStatus(pending ? 'Confira as perguntas e os pontos pendentes. Quando estiver pronto, volte a conferir o crédito.' : 'A entrevista não apontou novos pontos. Confira o crédito para emitir.');
  return !pending;
}

const reviewInterview = protectedRun(async () => {
  const input = readInput();
  if (!ensureShare(input)) return;
  const user = await account(); if (user) await interview(input, user);
});

const prepare = protectedRun(async () => {
  const input = readInput();
  if (!ensureShare(input)) return;
  const user = await account(); if (!user) return;
  if (!reviewedInterview && !await interview(input, user)) return;
  const identity = JSON.stringify(input);
  if (identity !== JSON.stringify(readInput()) || !control('consent').checked) return;
  if (!requestId || identity !== draftKey) { requestId = crypto.randomUUID(); draftKey = identity; }
  setStatus('Conferindo o crédito e os quesitos da emissão.');
  const result = await request('etp-prepare', { input, requestId, consent: true }, user);
  if (identity !== JSON.stringify(readInput()) || !control('consent').checked) return;
  feedback();
  if (result.quote?.recovery) { await consult(requestId, user); return; }
  if (!result.quote || typeof result.quote.token !== 'string') throw new Error();
  setStatus('Confira a condição da emissão antes de confirmar.');
  showQuote(result.quote);
});

function ready(data, user) {
  activeUser(user);
  if (!data.files?.docx || !data.files?.pdf) throw new Error();
  files = data.files; filesOwner = user.uid;
  const end = new Date(data.expiresAt);
  get('expiry').textContent = Number.isNaN(end.valueOf()) ? 'Baixe seus arquivos agora e guarde-os com o processo.' : `Recuperação nesta conta até ${end.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })} (horário de Brasília). Guarde os dois arquivos com o processo.`;
  get('downloads').hidden = false;
  setStatus('Os dois arquivos estão disponíveis. Não há outro débito para baixá-los.');
  get('download-title').focus();
}

async function consult(id, user) {
  let initial = true;
  const deadline = now() + 118_000;
  do {
    if (!initial) await sleep(5_000);
    initial = false;
    const data = await request('etp-result', { requestId: id }, user);
    if (data.status === 'ready') { ready(data, user); return; }
    if (data.status === 'confirm') {
      // The server keeps the prepared draft; confirming needs only a fresh quote, not the original form.
      const again = await request('etp-requote', { requestId: id }, user);
      if (again.status === 'ready') continue;
      if (!again.quote || typeof again.quote.token !== 'string') throw new Error();
      stagedId = id;
      showQuote(again.quote);
      setStatus('Os arquivos estão preparados. Confira a condição da emissão e confirme para liberar o download.');
      return;
    }
    if (data.status === 'failed') {
      setStatus(errorMessage(data.error) + (data.retryable ? ' Se os dados estiverem nesta página, confira o crédito para retomar.' : ' O servidor não permite outra tentativa nesta emissão.'));
      return;
    }
    if (data.status === 'missing') { setStatus('Não encontrei esta emissão na conta atual. Verifique se entrou com a mesma conta.'); return; }
    if (data.status !== 'working') throw new Error();
    setStatus('A redação está em andamento. Você pode manter a página aberta ou consultar a mesma emissão neste navegador.');
  } while (now() < deadline);
  setStatus('A redação ainda está em andamento. Use “Consultar emissão” para saber quando os arquivos estiverem prontos.');
}

const generate = protectedRun(async () => {
  if (stagedId) {
    const user = await account(); if (!user) return;
    const id = stagedId, authorization = quote?.token;
    if (!authorization) return;
    showQuote(undefined); stagedId = undefined;
    setStatus('Confirmando a emissão dos arquivos já preparados.');
    const data = await request('etp-confirm', { requestId: id, authorization }, user);
    if (data.status === 'confirm') { setStatus(errorMessage(data.error || 'EXPORT_CONFIRMATION_CHANGED')); return; }
    keepAttempt(id);
    await consult(id, user);
    return;
  }
  const input = readInput();
  if (!ensureShare(input) || JSON.stringify(input) !== draftKey || !quote || !requestId) return;
  const user = await account(); if (!user) return;
  const id = requestId;
  const authorization = quote?.token;
  if (!authorization || JSON.stringify(readInput()) !== draftKey || !control('consent').checked) return;
  showQuote(undefined);
  files = undefined; filesOwner = undefined; get('downloads').hidden = true;
  setStatus('Iniciando a redação. A emissão só é concluída depois que Word e PDF forem preparados.');
  try {
    const data = await request('etp-generate', { input, requestId: id, consent: true, authorization }, user);
    if (data.status === 'confirm') { setStatus(errorMessage(data.error || 'EXPORT_CONFIRMATION_CHANGED')); return; }
    // Only an accepted request replaces the recovery pointer; a refused one never hides an earlier issuance.
    keepAttempt(id);
  } catch (error) {
    if (error.error || error.status) throw error;
    keepAttempt(id);
    setStatus('A resposta foi interrompida. Consultando a mesma emissão, sem abrir um novo pedido.');
  }
  await consult(id, user);
});

const resume = protectedRun(async () => {
  const user = await account({ provision: false }); if (!user) return;
  setStatus('Consultando as emissões recentes desta conta.');
  // The account's own list survives closed tabs and other browsers; the tab pointer is only a preference.
  const { items = [] } = await request('etp-recent', {}, user);
  const pick = items.find(item => item.requestId === cachedId && item.status !== 'failed') ||
    items.find(item => item.status === 'ready' || item.status === 'confirm' || item.status === 'working');
  if (!pick) { setStatus('Não há emissão recuperável nesta conta nas últimas 24 horas.'); return; }
  keepAttempt(pick.requestId);
  await consult(pick.requestId, user);
});

function download(type) {
  if (!files || filesOwner !== auth?.currentUser?.uid) return;
  const data = files[type];
  const mime = type === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (typeof data !== 'string' || data.length > 720_000) return;
  try {
    const bytes = Uint8Array.from(atob(data), ch => ch.charCodeAt(0));
    const valid = type === 'pdf' ? new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-' : bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4;
    if (!valid) throw new Error();
    const href = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const anchor = el('a', '', { href, download: 'estudo-tecnico-preliminar.' + type });
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 30_000);
  } catch { setStatus('O arquivo não abriu. Consulte a mesma emissão antes de tentar baixar novamente.'); }
}

async function start() {
  try {
    const response = await fetch(apiPath + '?op=config', { headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    const data = await response.json();
    const enabled = response.ok && data.etpEnabled === true;
    if (!enabled) {
      get('availability').textContent = 'A geração de arquivos está indisponível no momento. Você pode consultar o roteiro e o exemplo abaixo.';
      if (data.enabled !== true) return;
    }
    wallet = createToolCredits({ toolId: enabled ? 'gerador-etp' : 'modela-memoria', shared: enabled });
    if (!await wallet.ready()) throw new Error();
    firebase = await import('/assets/tools-commerce/firebase-auth.mjs');
    const app = firebase.getApps().find(entry => entry.name === 'confenge-tools');
    if (!app) throw new Error();
    auth = firebase.getAuth(app);
    await auth.authStateReady?.();
    let previousUid = auth.currentUser?.uid;
    firebase.onAuthStateChanged(auth, user => {
      // Leaving or switching a signed-in account must not hand its draft, excerpts or approvals to the next
      // person on a shared computer. The anonymous draft before the first sign-in is kept.
      if (previousUid && previousUid !== user?.uid) {
        try { sessionStorage.removeItem(recoveryKey); } catch { /* nothing stored */ }
        location.reload();
        return;
      }
      if (previousUid !== user?.uid) {
        provisionedUid = undefined; showQuote(undefined); files = undefined; filesOwner = undefined;
        get('downloads').hidden = true; previousUid = user?.uid;
      }
    });
    if (enabled) get('availability').textContent = 'Comece sem entrar. Para enviar os dados e emitir o documento, use uma conta CONFENGE verificada.';
    get('wallet').hidden = false;
    get('recovery').hidden = false;
    form.hidden = !enabled;
    get('attachments').hidden = !enabled || visibleStep !== 0;
  } catch { get('availability').textContent = 'Não foi possível abrir a entrevista agora. Recarregue a página para tentar novamente ou use o roteiro abaixo.'; }
}

base.forEach(args => addSection(...args));
refreshContext();
form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('input', onDraftChange);
document.querySelectorAll('#entrevista [data-go]').forEach(button => button.addEventListener('click', () => go(Number(button.dataset.go))));
// Excerpts live outside the form; editing them must invalidate a quote like any other answer.
get('attachments').addEventListener('input', onDraftChange);
get('file').addEventListener('change', importFiles);
get('source-add').addEventListener('click', () => { const id = addSource(); if (id) sourceCards.get(id).name.focus(); });
get('wallet').addEventListener('click', () => wallet.open().catch(() => setStatus('Não foi possível abrir a carteira. Tente novamente.')));
get('interview').addEventListener('click', reviewInterview);
get('prepare').addEventListener('click', prepare);
get('generate').addEventListener('click', generate);
get('resume').addEventListener('click', resume);
get('docx').addEventListener('click', () => download('docx'));
get('pdf').addEventListener('click', () => download('pdf'));
void start();
