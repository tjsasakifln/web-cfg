import { createToolCredits } from '/assets/js/tool-credits.mjs';
import { extractAttachment } from './etp-attachments.mjs';
// The rules are a literal copy of the server's and use regex lookbehind. A browser without it (Safari before
// 16.4) cannot parse them, so they load here and the page says so instead of failing silently.
let localGaps, localPrivacyGaps, hasTotal, meaningful, restrictedValue, classifiedMoney, composeSheet;
try {
  ({ gaps: localGaps, privacyGaps: localPrivacyGaps, hasTotal, meaningful, restrictedValue, classifiedMoney } = await import('./etp-rules.mjs'));
  ({ composeSheet } = await import('./etp-sheet.mjs'));
} catch (error) {
  document.getElementById('etp-availability').textContent = 'Este navegador não abre a entrevista. Atualize-o ou use outro navegador; o roteiro e o exemplo abaixo continuam disponíveis.';
  throw error;
}
import { GROUPS, SECTIONS, OMISSION_EXAMPLE, example } from './etp-ui-data.mjs';

const apiPath = '/api/web/tool-credits';
const form = document.getElementById('etp-form');
const get = id => document.getElementById('etp-' + id);
const control = name => form.elements.namedItem(name);
const setStatus = message => { get('status').textContent = message; };
// Control characters pasted from office documents are refused by the server, so they never leave the page.
const tidy = value => String(value ?? '').normalize('NFC').replace(/[\u0000-\u0008\u000b\u000e-\u001f]/g, ' ').trim();
const el = (tag, text, attrs = {}) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};
const field = (name, html) => { const label = el('label', name); label.append(html); return label; };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const now = () => Date.now();
const byId = new Map();
const order = SECTIONS.map(([id]) => id);
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
// After an attempt to emit, every pending item shows its message, not only the ones already touched.
let revealAll = false;
let leaving = false;
let pending = [];
let awaitingSignIn = '';
// Any edit since the last issuance of this same draft; closing the tab would lose it.
let dirty = false;
// Texts the item table wrote last time, so a new application updates them together instead of contradicting them.
let lastSheet;
// Source IDs used earlier in this page, so a new excerpt does not inherit citations of a removed one.
const retiredSources = new Set();

// ---------------------------------------------------------------------------------------------- Itens do ETP

function addSection(id, title, required, prompt) {
  if (GROUPS[id]) get('items').append(el('h4', GROUPS[id], { class: 'etp-group' }));
  const box = el('details', '', { class: 'etp-q', id: 'etp-inciso-' + id, name: 'etp-q' });
  const summary = el('summary');
  const name = el('span', '', { class: 'etp-q-title' });
  name.append(el('span', id, { class: 'etp-q-id' }), document.createTextNode(' ' + title));
  const mark = el('abbr', '*', { title: 'obrigatório', class: 'etp-q-required' });
  const statusTag = el('span', '', { class: 'etp-chip' });
  summary.append(name, mark, statusTag);
  const body = el('div', '', { class: 'etp-q-body' });
  const help = el('p', prompt, { id: 'etp-hint-' + id, class: 'etp-question-help' });
  const ask = el('div', '', { class: 'etp-q-ask', hidden: '' });
  const omit = el('input', '', { name: id + '-omit', type: 'checkbox' });
  const omitWrap = el('label', '', { class: 'etp-check etp-omit' });
  omitWrap.append(omit, document.createTextNode('Este item não se aplica ao caso. Vou justificar.'));
  const gap = el('p', '', { id: 'etp-gap-' + id, class: 'etp-q-gap', hidden: '' });
  const answer = el('textarea', '', { name: id + '-text', rows: '4', maxlength: '1600', 'aria-describedby': `${help.id} ${gap.id}` });
  const answerName = el('span', 'Resposta');
  const answerWrap = el('label');
  const counter = el('small', '', { class: 'etp-count', 'aria-hidden': 'true' });
  answerWrap.append(answerName, answer);
  body.append(help, ask, omitWrap, answerWrap, counter);
  const row = { box, summary, statusTag, mark, help, ask, omit, omitWrap, answer, answerName, counter, gap, title, required, prompt, touched: false };
  // Compatibility with the request shape: status is derived from the omission toggle.
  Object.defineProperty(row, 'status', { get: () => ({ value: omit.checked ? 'omitted' : 'filled' }) });
  if (id === 'IV' || id === 'VI') {
    const group = el('div', '', { 'data-support': '' });
    row.calculation = el('textarea', '', { name: id + '-calculation', rows: '3', maxlength: '1200' });
    row.source = el('input', '', { name: id + '-source', maxlength: '360' });
    row.calculationWrap = field('Memória e critério de cálculo', row.calculation);
    const sourceText = el('span', 'Fonte que sustenta a estimativa');
    const sourceLabel = el('label');
    sourceLabel.append(sourceText, row.source);
    row.sourceText = sourceText;
    if (id === 'IV') group.append(sheet());
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
    for (const node of [row.calculation, row.source, row.unitPrices].filter(Boolean)) {
      node.addEventListener('input', () => reveal(row));
    }
  }
  body.append(gap);
  const next = el('button', 'Próximo item', { type: 'button', class: 'button button-secondary etp-next' });
  next.addEventListener('click', () => advance(id));
  body.append(el('div', '', { class: 'etp-q-nav' }));
  body.lastChild.append(next);
  row.next = next;
  box.append(summary, body);
  if (id === 'I') box.open = true;
  // Opening an item closes the one above it; keep the clicked title where it was instead of letting it jump away.
  summary.addEventListener('click', () => { row.anchorTop = summary.getBoundingClientRect().top; });
  box.addEventListener('toggle', () => {
    if (!box.open || row.anchorTop === undefined) return;
    const shift = summary.getBoundingClientRect().top - row.anchorTop;
    row.anchorTop = undefined;
    if (Math.abs(shift) > 1) scrollBy({ top: shift, behavior: 'instant' });
  });
  // Messages appear after a pause in typing. Revealing them on blur moved the next button under the pointer
  // between mousedown and click, so the first click on "Próximo item" or another item was lost.
  answer.addEventListener('input', () => reveal(row));
  // Toggling "não se aplica" flips the meaning of a text already written: it must be rewritten, not reused.
  answer.addEventListener('input', () => { row.review = undefined; });
  omit.addEventListener('input', () => {
    if (!tidy(answer.value)) return;
    row.touched = true;
    row.review = omit.checked ? 'Você marcou que o item não se aplica. Reescreva o texto como justificativa da ausência.'
      : 'Você desmarcou “não se aplica”. Troque a justificativa pelo conteúdo do item.';
  });
  get('items').append(box);
  byId.set(id, row);
}

// --------------------------------------------------------------------------------- Tabela de itens (IV e VI)

const sheetRows = [];
let sheetUndo;
function sheetRow() {
  const tr = el('tr');
  // Only the first row carries the grey example, so later rows never look already filled.
  const hint = text => sheetRows.length ? {} : { placeholder: text };
  const cell = (label, attrs) => {
    const input = el('input', '', { 'aria-label': label, ...attrs });
    const td = el('td', '', { 'data-label': label.replace(' em reais', ' (R$)') }); td.append(input); tr.append(td); return input;
  };
  const row = {
    tr,
    item: cell('Item', { maxlength: '80', ...hint('Ex.: Notebook') }),
    unit: cell('Unidade', { maxlength: '16', ...hint('un') }),
    quantity: cell('Quantidade', { inputmode: 'decimal', maxlength: '16', ...hint('120') }),
    price: cell('Preço unitário em reais', { inputmode: 'decimal', maxlength: '20', ...hint('4.500,00') }),
  };
  const remove = el('button', '×', { type: 'button', class: 'etp-sheet-remove', 'aria-label': 'Remover linha' });
  remove.addEventListener('click', () => {
    // Focus stays in the table instead of falling back to the page.
    if (sheetRows.length === 1) {
      for (const key of ['item', 'unit', 'quantity', 'price']) row[key].value = '';
      row.item.focus();
    } else {
      const index = sheetRows.indexOf(row);
      sheetRows.splice(index, 1); tr.remove();
      sheetRows[Math.max(0, index - 1)].item.focus();
    }
    dirty = true;
    sheetPreview();
  });
  const td = el('td'); td.append(remove); tr.append(td);
  sheetRows.push(row);
  return row;
}
function sheetValues() {
  return sheetRows.map(row => Object.fromEntries(['item', 'unit', 'quantity', 'price'].map(key => [key, row[key].value])));
}
function sheetPreview() {
  const classified = byId.get('VI')?.classified?.checked === true;
  const result = composeSheet(sheetValues(), { classified });
  const blank = sheetValues().every(row => !Object.values(row).some(value => tidy(value)));
  get('sheet-total').textContent = blank ? '' : result.error ? result.error :
    result.priced ? `${result.items} item(ns) · total estimado ${result.totalLabel}` :
      classified ? `${result.items} item(ns). Orçamento sigiloso: os preços ficam só neste navegador.` :
        `${result.items} item(ns). Informe os preços unitários para calcular também o item VI.`;
}
function sheet() {
  const box = el('details', '', { class: 'etp-sheet', id: 'etp-sheet' });
  box.append(el('summary', 'Calcular pela tabela de itens (preenche os itens IV e VI)'));
  const intro = el('p', 'Informe cada item uma vez. A ferramenta escreve a memória das quantidades e, com os preços, os preços unitários, a memória de valor e o total do item VI.');
  const wrap = el('div', '', { class: 'etp-sheet-table' });
  const table = el('table');
  const head = el('tr');
  for (const label of ['Item', 'Unidade', 'Quantidade', 'Preço unitário (R$)', '']) head.append(el('th', label, { scope: 'col' }));
  const thead = el('thead'); thead.append(head);
  const tbody = el('tbody', '', { id: 'etp-sheet-rows' });
  table.append(thead, tbody);
  wrap.append(table);
  const add = el('button', 'Adicionar linha', { type: 'button', class: 'button button-secondary' });
  add.addEventListener('click', () => { const row = sheetRow(); tbody.append(row.tr); row.item.focus(); });
  const apply = el('button', 'Preencher IV e VI', { type: 'button', class: 'button button-primary', id: 'etp-sheet-apply' });
  apply.addEventListener('click', applySheet);
  const undo = el('button', 'Desfazer', { type: 'button', class: 'button button-secondary', id: 'etp-sheet-undo', hidden: '' });
  undo.addEventListener('click', undoSheet);
  const actions = el('div', '', { class: 'etp-actions' });
  actions.append(add, apply, undo);
  const total = el('p', '', { id: 'etp-sheet-total', role: 'status' });
  box.append(intro, wrap, total, actions);
  tbody.append(sheetRow().tr, sheetRow().tr);
  wrap.addEventListener('input', event => { event.stopPropagation(); dirty = true; sheetPreview(); });
  return box;
}
function applySheet() {
  const IV = byId.get('IV');
  const VI = byId.get('VI');
  const result = composeSheet(sheetValues(), { classified: VI.classified.checked });
  if (result.error) { get('sheet-total').textContent = result.error; return; }
  // A field is the table's to rewrite when it is empty or still holds exactly what the table wrote before.
  const ours = (node, key) => !tidy(node.value) || (lastSheet?.[key] !== undefined && node.value === lastSheet[key]);
  const plan = new Map([[IV.calculation, result.quantityMemo]]);
  const filled = ['memória do item IV'];
  const notes = [];
  if (ours(IV.answer, 'ivText')) plan.set(IV.answer, result.quantityText);
  else notes.push('O texto do item IV foi mantido: confira se as quantidades conferem com a tabela.');
  let freshVI;
  if (result.priced) {
    plan.set(VI.unitPrices, result.unitPrices).set(VI.calculation, result.valueMemo);
    freshVI = result.totalText + ' Os valores resultam dos preços unitários referenciais e das quantidades da memória.';
    const current = VI.answer.value;
    if (ours(VI.answer, 'viText')) plan.set(VI.answer, freshVI);
    else if (lastSheet?.totalText && current.includes(lastSheet.totalText)) plan.set(VI.answer, current.replace(lastSheet.totalText, result.totalText));
    else if (!hasTotal(tidy(current))) plan.set(VI.answer, tidy(current) + '\n' + result.totalText);
    else notes.push(`Confira o total escrito no item VI: a tabela soma ${result.totalLabel}.`);
    filled.push('preços, memória e total do item VI');
  } else if (lastSheet?.priced) {
    // Prices removed, or the estimate became classified: what the table wrote for VI no longer holds.
    for (const [node, key] of [[VI.unitPrices, 'unitPrices'], [VI.calculation, 'valueMemo'], [VI.answer, 'viText']]) {
      if (lastSheet[key] !== undefined && node.value === lastSheet[key]) plan.set(node, '');
    }
    if (!plan.has(VI.answer) && VI.answer.value.includes(lastSheet.totalText)) notes.push('Retire do item VI o total calculado antes.');
  }
  for (const [node, value] of plan) {
    if (value.length > node.maxLength) {
      get('sheet-total').textContent = `O texto ficaria com ${value.length} caracteres, acima do limite de ${node.maxLength.toLocaleString('pt-BR')} do campo. Resuma a resposta ou agrupe itens. Nada foi alterado.`;
      return;
    }
  }
  sheetUndo = { previous: lastSheet, fields: [...plan].map(([node, value]) => [node, node.value, value]) };
  for (const [node, value] of plan) node.value = value;
  lastSheet = { priced: result.priced, ivText: plan.get(IV.answer), viText: plan.get(VI.answer) === freshVI ? freshVI : undefined,
    totalText: result.totalText, unitPrices: result.unitPrices, valueMemo: result.valueMemo };
  get('sheet-undo').hidden = false;
  IV.touched = true; VI.touched = true;
  onDraftChange();
  const missingSource = [IV, ...(result.priced ? [VI] : [])].some(row => !tidy(row.source.value));
  get('sheet-total').textContent = `Preenchido: ${filled.join(' e ')}.` + (missingSource ? ' Falta indicar a fonte de cada estimativa.' : '') +
    (notes.length ? ' ' + notes.join(' ') : '');
}
function undoSheet() {
  // Only fields still holding what the table wrote go back; later edits by the person are kept.
  let kept = 0;
  for (const [node, before, after] of sheetUndo?.fields ?? []) {
    if (node.value === after) node.value = before; else kept += 1;
  }
  lastSheet = sheetUndo?.previous;
  sheetUndo = undefined;
  get('sheet-undo').hidden = true;
  onDraftChange();
  get('sheet-total').textContent = kept ? `Os campos voltaram ao que estava antes, exceto ${kept} que você editou depois.` : 'Os campos voltaram ao que estava antes.';
}

// ------------------------------------------------------------------------------------ Contexto e verificação

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
    row.required_now = required;
    row.omitWrap.hidden = required;
    row.mark.hidden = !required;
    if (required && row.omit.checked) {
      row.omit.checked = false;
      row.touched = true;
      if (tidy(row.answer.value)) row.review = 'Este item passou a ser obrigatório para TIC no SISP. Troque a justificativa pelo conteúdo do item.';
    }
    const omitted = row.omit.checked;
    row.answerName.textContent = omitted ? 'Por que este item não se aplica?' : 'Resposta';
    row.answer.placeholder = omitted ? OMISSION_EXAMPLE : example(id, p.objectType);
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
      row.source.placeholder = 'Ex.: Anexo reservado nº 03';
      row.answer.placeholder = 'Ex.: O orçamento é mantido sob sigilo para preservar a competitividade, conforme decisão motivada nos autos.';
    } else {
      row.help.textContent = omitted ? 'Explique por que este quesito não foi incluído. Um “não se aplica” sem fundamentação não é suficiente.' : row.prompt + extra;
      if (row.sourceText) row.sourceText.textContent = 'Fonte que sustenta a estimativa';
      if (row.source) row.source.placeholder = 'Ex.: Inventário nº 14, p. 2; ou F1 para um documento de apoio';
    }
    if (row.calculation) row.calculation.placeholder = id === 'IV' ? 'Ex.: 10 notebooks por escola × 12 escolas = 120 unidades.' : 'Ex.: 120 un × R$ 4.500,00 = R$ 540.000,00.';
    if (row.unitPrices) row.unitPrices.placeholder = 'Ex.: Notebook: R$ 4.500,00/un.';
    if (row.classified) row.calculationWrap.hidden = row.unitPricesWrap.hidden = classified;
  }
  sheetPreview();
  refreshChecks();
}

// Pending items by id, from the same rules the server applies. Nothing leaves the browser.
function refreshChecks() {
  const input = readInput();
  pending = withPageChecks(localGaps(input), input);
  const messages = new Map(pending.map(entry => [entry.id, entry.message]));
  let ready = 0;
  for (const [id, row] of byId) {
    const text = tidy(row.answer.value);
    // Support fields count as started work, so a problem typed there (a CPF, a value under secrecy) is shown too.
    const started = text || hasSupport(row);
    const message = messages.get(id);
    const omitted = row.omit.checked;
    const done = !message && text;
    if (done) ready += 1;
    const state = done ? 'ok' : message && started ? 'warn' : 'todo';
    row.box.dataset.state = state;
    row.statusTag.textContent = done ? (omitted ? 'Justificado' : 'Pronto') : started ? 'Falta detalhe' : row.required_now ? 'Obrigatório' : 'Responder ou justificar';
    const show = message && (revealAll || (row.touched && started));
    row.gap.hidden = !show;
    row.gap.textContent = show ? message : '';
    row.counter.textContent = row.answer.value.length > 1200 ? `${row.answer.value.length} de 1.600 caracteres` : '';
  }
  for (const [id, row] of byId) {
    const target = nextTarget(id);
    row.next.textContent = !target ? 'Ir para a emissão' : order.indexOf(target) > order.indexOf(id) ? 'Próximo item' : 'Ir ao item pendente';
  }
  const contextReady = !messages.has('identification') && !messages.has('profile');
  get('meter').value = ready;
  get('meter-text').textContent = ready === 13 ? '13 de 13 itens prontos' : `${ready} de 13 itens prontos`;
  form.querySelector('[data-done="0"]').textContent = contextReady && tidy(control('title').value) ? '✓' : '';
  form.querySelector('[data-done="1"]').textContent = ready === 13 ? '✓' : '';
  form.querySelector('[data-done="2"]').textContent = get('downloads').hidden || dirty ? '' : '✓';
  // A server list of missing points is dropped once none of those points is still pending here.
  if (lastFeedback?.gaps?.length && !pending.some(entry => lastFeedback.gaps.some(gap => gap.id === entry.id))) {
    feedback({ questions: lastFeedback.questions });
  }
  if (visibleStep === 2) refreshProgress();
}

// Checks the server makes outside gaps() (field and excerpt limits, unconfirmed excerpts) and page-only safeguards,
// so "Tudo pronto" never leads to a refusal after sign-in.
function withPageChecks(list, input) {
  const merged = new Map(list.map(entry => [entry.id, entry.message]));
  const add = (id, message) => merged.set(id, merged.has(id) ? `${merged.get(id)} ${message}` : message);
  const classified = input.answers.VI.support.classified;
  if (classified && hasTotal(input.answers.VI.text)) add('VI', 'Retire o valor do texto: com orçamento sigiloso, o item VI traz só a justificativa pública e a referência do anexo.');
  for (const [id, row] of byId) if (row.review) add(id, row.review);
  if (input.sources.reduce((sum, source) => sum + source.text.length, 0) > 16_000) add('profile', 'Reduza os trechos confirmados ao limite total de 16.000 caracteres.');
  if (!classified) for (const [id, card] of sourceCards) if (!card.include.checked && tidy(card.text.value)) add('profile', `Confirme a fonte ${id} ou remova-a.`);
  const known = ['identification', 'profile', ...byId.keys()];
  return [...merged].map(([id, message]) => ({ id, message })).sort((a, b) => known.indexOf(a.id) - known.indexOf(b.id));
}

const hasSupport = row => [row.calculation, row.source, row.unitPrices].some(node => node && !node.closest('[hidden]') && tidy(node.value));

function reveal(row) {
  clearTimeout(row.revealTimer);
  row.revealTimer = setTimeout(() => { row.touched = true; refreshChecks(); }, 900);
}

function nextTarget(id) {
  const start = order.indexOf(id);
  const open = key => byId.get(key).box.dataset.state !== 'ok';
  return order.slice(start + 1).find(open) ?? order.slice(0, start).find(open);
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

function labelOf(id) {
  const row = byId.get(id);
  return row ? `${id}. ${row.title}` : id === 'identification' ? 'Contratação' : 'Contexto e documentos de apoio';
}

function gapList(entries, title) {
  const wrap = el('div');
  if (title) wrap.append(el('h4', title));
  const list = el('ul');
  for (const entry of entries) {
    const item = el('li');
    const target = el('a', labelOf(entry.id), { href: byId.has(entry.id) ? '#etp-inciso-' + entry.id : '#entrevista' });
    target.addEventListener('click', event => { event.preventDefault(); jumpTo(entry.id); });
    item.append(target, document.createTextNode(' · ' + String(entry.message ?? entry.question ?? 'Confira os dados fornecidos.')));
    if (entry.why) item.append(el('p', entry.why));
    list.append(item);
  }
  wrap.append(list);
  return wrap;
}

function refreshProgress() {
  const input = readInput();
  const host = get('progress');
  host.replaceChildren();
  const ready = 13 - new Set(pending.filter(entry => byId.has(entry.id)).map(entry => entry.id)).size;
  const total = input.sources.reduce((sum, source) => sum + source.text.length, 0);
  const sources = input.sources.length ? ` ${input.sources.length} documento(s) de apoio confirmado(s), ${total.toLocaleString('pt-BR')} de 16.000 caracteres.` : '';
  host.dataset.state = pending.length ? 'todo' : 'ok';
  if (!pending.length) {
    host.append(el('strong', 'Tudo pronto para a revisão e a emissão.'), el('p', `Os 13 itens estão preenchidos ou justificados.${sources}`));
    return;
  }
  host.append(el('strong', `Faltam ${pending.length} ponto(s) antes de emitir.`), el('p', `${ready} de 13 itens prontos.${sources} Clique em um ponto para ir direto ao campo.`));
  // Items not started are one line of shortcuts; detailed messages are kept for what was already written.
  const blank = pending.filter(entry => byId.has(entry.id) && !tidy(byId.get(entry.id).answer.value) && !hasSupport(byId.get(entry.id)));
  const detailed = pending.filter(entry => !blank.includes(entry));
  if (blank.length) {
    const line = el('p', 'Ainda sem resposta: ', { class: 'etp-blank' });
    blank.forEach((entry, index) => {
      const link = el('a', entry.id, { href: '#etp-inciso-' + entry.id, title: labelOf(entry.id) });
      link.addEventListener('click', event => { event.preventDefault(); jumpTo(entry.id); });
      line.append(...(index ? [document.createTextNode(' · ')] : []), link);
    });
    host.append(line);
  }
  if (detailed.length) host.append(gapList(detailed));
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
  if (focus) {
    const heading = form.querySelector(`[data-step="${step}"] h3`);
    heading?.focus({ preventScroll: true });
    form.scrollIntoView({ block: 'start' });
  }
}

function advance(id) {
  const row = byId.get(id);
  row.touched = true;
  refreshChecks();
  const target = nextTarget(id);
  if (!target) { row.box.open = false; go(2); return; }
  jumpTo(target);
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
  dirty = true;
  showQuote(undefined);
  stagedId = undefined;
  if (reviewedInterview && interviewContext !== contextOf(readInput())) reviewedInterview = false;
  refreshContext();
};

// --------------------------------------------------------------------------------------- Documentos de apoio

function addSource({ displayName = '', locator = '', text = '' } = {}) {
  const free = ['F1', 'F2', 'F3', 'F4', 'F5'].filter(key => !sourceCards.has(key));
  const id = free.find(key => !retiredSources.has(key)) ?? free[0];
  if (!id) { get('file-status').textContent = 'O limite é de cinco fontes. Remova uma para incluir outra.'; return; }
  const card = el('fieldset', '', { class: 'etp-source' });
  card.append(el('legend', `Fonte ${id}`));
  const name = el('input', '', { name: 'etp-source-name-' + id, maxlength: '160' });
  const place = el('input', '', { name: 'etp-source-location-' + id, maxlength: '240', placeholder: 'Ex.: pág. 3 ou identificador público do documento' });
  const content = el('textarea', '', { name: 'etp-source-text-' + id, maxlength: '4000', rows: '4' });
  const include = el('input', '', { name: 'etp-source-include-' + id, type: 'checkbox' });
  const includeLabel = el('label', '', { class: 'etp-check' });
  includeLabel.append(include, document.createTextNode(`Confirmo este trecho e autorizo sua inclusão. Para citá-lo, escreva [${id}] na resposta ou ${id} no campo de fonte dos itens IV e VI.`));
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
    sourceCards.delete(id); card.remove(); retiredSources.add(id); onDraftChange(); get('source-add').focus();
    const citing = [...byId].filter(([, item]) => item.answer.value.toUpperCase().includes(`[${id}]`) || tidy(item.source?.value).toUpperCase() === id).map(([key]) => key);
    get('file-status').textContent = citing.length ? `Os itens ${citing.join(', ')} citam ${id}. Revise essas referências.` : `Fonte ${id} removida.`;
  });
  get('sources').append(card);
  get('attach-box').open = true;
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

// ------------------------------------------------------------------------------ Conta, revisão e emissão

function activeUser(user) {
  if (!user || auth?.currentUser?.uid !== user.uid) throw Object.assign(new Error(), { error: 'ACCOUNT_CHANGED' });
}
function keepAttempt(id) {
  cachedId = id;
  try { sessionStorage.setItem(recoveryKey, id); } catch { /* No document data is stored. */ }
  get('recovery').hidden = false;
}

// `valid` is checked again after the token arrives: a consent withdrawn or an excerpt unconfirmed while the
// token was loading stops the request before anything is sent.
async function request(op, body, user, valid) {
  activeUser(user);
  const bearer = await user.getIdToken();
  activeUser(user);
  if (valid && !valid()) throw Object.assign(new Error(), { error: 'DRAFT_CHANGED' });
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

async function account({ provision = true, action = 'Revisar com IA e emitir' } = {}) {
  const user = auth?.currentUser;
  if (!user) {
    awaitingSignIn = action;
    await wallet.open();
    setStatus('Entre na sua conta e volte aqui. Suas respostas continuam nesta página.');
    return null;
  }
  if (!provision) return user;
  await user.reload();
  activeUser(user);
  if (!user.emailVerified) {
    await wallet.open('Confirme o e-mail da sua conta e volte à entrevista.');
    setStatus('A revisão por IA e a emissão exigem uma conta com e-mail confirmado. Suas respostas continuam nesta página.');
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
  const land = target => { target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'center' }); };
  if (row) {
    go(1, false);
    row.box.open = true;
    row.touched = true;
    refreshChecks();
    const empty = row.answer.value.trim() === '';
    const support = !empty && row.gap.textContent && [row.calculation, row.unitPrices, row.source].find(node => node && !node.closest('[hidden]') && !node.value.trim());
    land(support || row.answer);
    return;
  }
  go(0, false);
  // Each context problem points at its own control: the excerpt to confirm or fix, the title, the organisation.
  const cards = [...sourceCards.values()];
  const card = id === 'profile' ? cards.find(item => tidy(item.text.value) && !item.include.checked) ??
    cards.find(item => !meaningful(tidy(item.name.value)) || !meaningful(tidy(item.text.value))) ??
    (byId.get('VI').classified.checked ? cards[0] : undefined) : undefined;
  const classified = byId.get('VI').classified.checked;
  const flagged = name => { const value = tidy(control(name).value); return restrictedValue(value) || (classified && classifiedMoney(value)); };
  const target = card ? (!meaningful(tidy(card.name.value)) ? card.name : !meaningful(tidy(card.text.value)) ? card.text : card.include)
    : id === 'identification' ? ['title', 'organization', 'unit', 'process'].map(control).find(node => flagged(node.name) ||
      (['title', 'organization'].includes(node.name) && !meaningful(tidy(node.value)))) ?? control('title')
      : flagged('localRule') ? control('localRule') : form.querySelector('input[name="objectType"]:checked');
  // Open every collapsed panel around the field, such as the optional details or the attachments.
  for (let box = target.closest('details'); box; box = box.parentElement?.closest('details')) box.open = true;
  land(target);
}

let lastFeedback;
function feedback({ gaps = [], questions = [] } = {}) {
  lastFeedback = { gaps, questions };
  const host = get('gaps');
  host.replaceChildren();
  for (const row of byId.values()) { row.ask.hidden = true; row.ask.replaceChildren(); }
  for (const [title, data] of [['O que falta conferir', gaps], ['Perguntas da revisão por IA', questions]]) {
    if (!Array.isArray(data) || !data.length) continue;
    host.append(gapList(data, title));
  }
  // Each question also waits inside its own item, so the answer is written next to it.
  for (const entry of Array.isArray(questions) ? questions : []) {
    const row = byId.get(entry?.id);
    if (!row) continue;
    row.ask.hidden = false;
    row.ask.append(el('strong', 'Pergunta da revisão por IA'), el('p', String(entry.question ?? '')));
    if (entry.why) row.ask.append(el('small', String(entry.why)));
  }
  host.hidden = !host.childElementCount;
}

function errorMessage(code) {
  return ({
    ETP_PRIVATE_INPUT: 'Remova os dados identificados antes de enviar.',
    INVALID_ETP_INPUT: 'O servidor recusou um campo acima do limite ou com caracteres inválidos. Revise o texto colado mais recentemente.',
    DRAFT_CHANGED: 'As respostas ou a autorização mudaram antes do envio. Nada foi enviado; confira e tente de novo.',
    ETP_INTERVIEW_REQUIRED: 'A revisão precisa ser refeita para o contexto atual. Use “Revisar com IA e emitir” para retomar.',
    ETP_INCOMPLETE: 'Preencha ou justifique os itens apontados e tente de novo. Nenhum crédito foi usado.',
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
    ETP_UNSUPPORTED_FACT: 'A conferência automática barrou na minuta um número, uma norma ou uma informação que não está nas suas respostas. Nenhum crédito foi usado. Tente de novo.',
    ETP_INTERRUPTED: 'O processamento foi interrompido. Se possível, retome a mesma emissão.',
    ETP_EXPIRED: 'O prazo de recuperação desta emissão terminou.',
    REQUEST_CONFLICT: 'Os dados da entrevista mudaram desde a emissão. Consulte a tentativa anterior ou revise os dados para uma nova emissão.',
    EXPORT_CONFIRMATION_REQUIRED: 'O benefício ou saldo mudou. Confira novamente o crédito e confirme.',
    EXPORT_CONFIRMATION_CHANGED: 'O benefício ou saldo mudou. Confira novamente o crédito e confirme.',
    FEATURE_DISABLED: 'O processamento está indisponível no momento. O roteiro abaixo segue disponível.',
    OPERATION_LIMIT: 'O limite diário de emissões do seu plano foi alcançado. A emissão poderá ser feita amanhã ou com outro crédito da carteira.',
    ETP_ARTIFACT_NOT_READY: 'Os arquivos desta emissão ainda não estão prontos. Consulte a emissão em instantes.',
    ETP_ARTIFACT_FAILED: 'Não foi possível abrir os arquivos desta emissão. Nenhum crédito novo foi usado. Fale com a CONFENGE para recuperar a emissão.',
  })[code] || 'Não consegui concluir a consulta. Tente novamente ou use “Recuperar emissão” se já iniciou a redação.';
}

function ensureShare(input) {
  const privacy = localPrivacyGaps(input);
  if (privacy.length) {
    feedback({ gaps: privacy });
    setStatus('Remova os dados apontados antes de enviar. Nada foi enviado.');
    get('gaps').setAttribute('tabindex', '-1'); get('gaps').focus();
    return false;
  }
  if (!input.answers.VI.support.classified && [...sourceCards.values()].some(row => !row.include.checked && tidy(row.text.value))) {
    setStatus('Confirme os trechos que quer usar ou remova os que não devem participar da redação.');
    jumpTo('profile'); return false;
  }
  if (input.sources.reduce((sum, source) => sum + source.text.length, 0) > 16_000) {
    setStatus('Reduza os trechos confirmados para o limite total de 16.000 caracteres.');
    jumpTo('profile'); return false;
  }
  if (!control('consent').checked) {
    setStatus('Marque a autorização para enviar as respostas e os trechos confirmados.');
    control('consent').focus(); return false;
  }
  return true;
}

// Each phase is shown as a working panel so a wait never looks like a frozen page.
let workingTimer;
function working(title, detail) {
  clearInterval(workingTimer);
  const panel = get('working');
  if (!title) { panel.hidden = true; return; }
  const started = now();
  get('working-title').textContent = title;
  const tick = () => {
    const seconds = Math.floor((now() - started) / 1000);
    get('working-step').textContent = detail + (seconds >= 5 ? ` ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '');
  };
  tick();
  workingTimer = setInterval(tick, 1000);
  panel.hidden = false;
  panel.scrollIntoView({ block: 'nearest' });
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
    // Without credit the next step is the wallet itself, not a message to go and find it.
    if (error.error === 'NO_CREDITS') wallet?.open().catch(() => {});
  } finally {
    working();
    busy = false;
    form.removeAttribute('aria-busy');
    buttons.forEach(button => { button.disabled = false; });
    // A quote shown while the buttons were disabled could not take focus then.
    if (quote && !get('confirm').hidden) { get('generate').focus({ preventScroll: true }); get('confirm').scrollIntoView({ block: 'nearest' }); }
    else if (visibleStep === 2 && get('status').textContent && get('downloads').hidden) get('status').scrollIntoView({ block: 'nearest' });
  }
};

// Missing items are shown at once, without account, network or credit.
function locallyReady() {
  refreshChecks();
  if (!pending.length) return true;
  revealAll = true;
  refreshChecks();
  go(2, false);
  get('progress').setAttribute('tabindex', '-1');
  get('progress').focus();
  setStatus(`Faltam ${pending.length} ponto(s). Nada foi enviado e nenhum crédito foi usado.`);
  return false;
}

async function interview(input, user, { forEmission = false } = {}) {
  const before = JSON.stringify(input);
  if (!control('consent').checked || before !== JSON.stringify(readInput())) {
    setStatus('As respostas ou a autorização mudaram. Confira novamente antes de enviar.');
    return false;
  }
  working('Revisando suas respostas', 'A IA procura lacunas e conflitos nos itens. Leva alguns segundos.');
  setStatus('A revisão por IA está analisando suas respostas e trechos confirmados.');
  const result = await request('etp-interview', { input, consent: true }, user, () => control('consent').checked && before === JSON.stringify(readInput()));
  working();
  if (before !== JSON.stringify(readInput()) || !control('consent').checked) {
    setStatus('As respostas mudaram durante a consulta. Revise antes de pedir novas perguntas.'); return false;
  }
  feedback(result);
  reviewedInterview = true;
  interviewContext = contextOf(input);
  const open = result.gaps?.length > 0 || result.questions?.length > 0;
  if (open) { go(2, false); get('gaps').setAttribute('tabindex', '-1'); get('gaps').focus(); }
  setStatus(open ? 'A revisão sugeriu melhorias. Cada pergunta também aparece no item correspondente. Responda o que fizer sentido e clique de novo em “Revisar com IA e emitir”.' : forEmission ? 'A revisão não apontou novos pontos. Conferindo o crédito para emitir.' : 'A revisão não apontou novos pontos. Quando quiser, clique em “Revisar com IA e emitir”.');
  return !open;
}

const reviewInterview = protectedRun(async () => {
  const input = readInput();
  if (!ensureShare(input)) return;
  const user = await account({ action: 'Só pedir sugestões da IA' }); if (user) await interview(input, user);
});

const prepare = protectedRun(async () => {
  if (!locallyReady()) return;
  const input = readInput();
  if (!ensureShare(input)) return;
  const user = await account(); if (!user) return;
  if (!reviewedInterview && !await interview(input, user, { forEmission: true })) return;
  const identity = JSON.stringify(input);
  if (identity !== JSON.stringify(readInput()) || !control('consent').checked) return;
  if (!requestId || identity !== draftKey) { requestId = crypto.randomUUID(); draftKey = identity; }
  setStatus('Conferindo o crédito e os quesitos da emissão.');
  const result = await request('etp-prepare', { input, requestId, consent: true }, user, () => control('consent').checked && identity === JSON.stringify(readInput()));
  if (identity !== JSON.stringify(readInput()) || !control('consent').checked) return;
  feedback();
  if (result.quote?.recovery) { await consult(requestId, user); return; }
  if (!result.quote || typeof result.quote.token !== 'string') throw new Error();
  setStatus('Confira a condição da emissão e confirme.');
  // This quote belongs to the draft on the page, never to an issuance recovered earlier.
  stagedId = undefined;
  showQuote(result.quote);
});

function ready(data, user) {
  activeUser(user);
  if (!data.files?.docx || !data.files?.pdf) throw new Error();
  files = data.files; filesOwner = user.uid;
  // Only the issuance of the draft now on the page settles it; recovering another one does not.
  if (draftKey && JSON.stringify(readInput()) === draftKey) dirty = false;
  const end = new Date(data.expiresAt);
  get('expiry').textContent = Number.isNaN(end.valueOf()) ? 'Baixe seus arquivos agora e guarde-os com o processo.' : `Recuperação nesta conta até ${end.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })} (horário de Brasília). Guarde os dois arquivos com o processo.`;
  working();
  get('downloads').hidden = false;
  refreshChecks();
  setStatus('Os dois arquivos estão disponíveis. Não há outro débito para baixá-los.');
  get('downloads').scrollIntoView({ block: 'center' });
  get('download-title').focus({ preventScroll: true });
}

async function consult(id, user, { recovering = false } = {}) {
  let initial = true;
  const deadline = now() + 118_000;
  if (recovering) working('Consultando a emissão', 'Buscando os arquivos desta emissão na sua conta.');
  else working('Redigindo seu ETP', 'A IA redige os itens e a ferramenta monta o Word e o PDF. Esta página acompanha por até dois minutos; depois, use “Recuperar emissão”.');
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
      working();
      stagedId = id;
      go(2, false);
      showQuote(again.quote);
      setStatus('Os arquivos estão preparados. Confira a condição da emissão e confirme para liberar o download.');
      return;
    }
    if (data.status === 'failed') {
      working();
      setStatus(errorMessage(data.error) + (data.retryable ? ' Se os dados estiverem nesta página, revise e emita de novo para retomar.' : ' O servidor não permite outra tentativa nesta emissão.'));
      return;
    }
    if (data.status === 'missing') { working(); setStatus('Não encontrei esta emissão na conta atual. Verifique se entrou com a mesma conta.'); return; }
    if (data.status !== 'working') throw new Error();
    if (recovering) { recovering = false; working('Redigindo seu ETP', 'A redação desta emissão ainda está em andamento. Esta página acompanha por até dois minutos.'); }
    setStatus('A redação está em andamento. Você pode manter a página aberta ou recuperar a mesma emissão depois, com a mesma conta.');
  } while (now() < deadline);
  working();
  setStatus('A redação ainda está em andamento. Use “Recuperar emissão” para baixar os arquivos quando estiverem prontos.');
}

const generate = protectedRun(async () => {
  if (stagedId) {
    const user = await account({ action: 'Confirmar e gerar ETP' }); if (!user) return;
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
  const user = await account({ action: 'Confirmar e gerar ETP' }); if (!user) return;
  const id = requestId;
  const authorization = quote?.token;
  if (!authorization || JSON.stringify(readInput()) !== draftKey || !control('consent').checked) return;
  showQuote(undefined);
  files = undefined; filesOwner = undefined; get('downloads').hidden = true;
  working('Redigindo seu ETP', 'Iniciando a redação. A emissão só é concluída depois que Word e PDF forem preparados.');
  setStatus('Iniciando a redação. A emissão só é concluída depois que Word e PDF forem preparados.');
  try {
    const data = await request('etp-generate', { input, requestId: id, consent: true, authorization }, user,
      () => control('consent').checked && JSON.stringify(readInput()) === draftKey);
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
  const user = await account({ provision: false, action: 'Recuperar emissão' }); if (!user) return;
  setStatus('Consultando as emissões recentes desta conta.');
  // The account's own list survives closed tabs and other browsers; the tab pointer is only a preference.
  const { items = [] } = await request('etp-recent', {}, user);
  let pick = items.find(item => item.requestId === cachedId && item.status !== 'failed');
  // The list holds only the latest issuances: the one started in this tab is asked for directly before giving up on it.
  if (!pick && cachedId && !items.some(item => item.requestId === cachedId)) {
    const own = await request('etp-result', { requestId: cachedId }, user);
    if (['ready', 'confirm', 'working'].includes(own.status)) pick = { requestId: cachedId };
  }
  pick ||= items.find(item => item.status === 'ready' || item.status === 'confirm' || item.status === 'working');
  if (!pick) { setStatus('Não há emissão recuperável nesta conta nas últimas 24 horas.'); return; }
  keepAttempt(pick.requestId);
  await consult(pick.requestId, user, { recovering: true });
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
        leaving = true;
        location.reload();
        return;
      }
      if (user && awaitingSignIn) {
        setStatus(user.emailVerified ? `Conta conectada. Feche a janela da conta e clique de novo em “${awaitingSignIn}”. Suas respostas continuam aqui.`
          : `Conta conectada. Confirme o e-mail pelo link enviado e depois clique de novo em “${awaitingSignIn}”. Suas respostas continuam aqui.`);
        awaitingSignIn = '';
      }
      if (previousUid !== user?.uid) {
        provisionedUid = undefined; showQuote(undefined); files = undefined; filesOwner = undefined;
        get('downloads').hidden = true; previousUid = user?.uid;
      }
    });
    if (enabled) get('availability').textContent = 'Preencha sem cadastro. A conta CONFENGE verificada só é pedida na revisão por IA e na emissão.';
    get('wallet').hidden = false;
    get('recovery').hidden = false;
    form.hidden = !enabled;
    get('attachments').hidden = !enabled || visibleStep !== 0;
  } catch { get('availability').textContent = 'Não foi possível abrir a entrevista agora. Recarregue a página para tentar novamente ou use o roteiro abaixo.'; }
}

SECTIONS.forEach(args => addSection(...args));
refreshContext();
form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('input', onDraftChange);
document.querySelectorAll('#entrevista [data-go]').forEach(button => button.addEventListener('click', () => go(Number(button.dataset.go))));
// Excerpts live outside the form; editing them must invalidate a quote like any other answer.
get('attachments').addEventListener('input', event => { if (event.target !== get('page')) onDraftChange(); });
get('file').addEventListener('change', importFiles);
get('source-add').addEventListener('click', () => { const id = addSource(); if (id) sourceCards.get(id).name.focus(); });
get('wallet').addEventListener('click', () => wallet.open().catch(() => setStatus('Não foi possível abrir a carteira. Tente novamente.')));
get('interview').addEventListener('click', reviewInterview);
get('prepare').addEventListener('click', prepare);
get('generate').addEventListener('click', generate);
get('resume').addEventListener('click', resume);
get('docx').addEventListener('click', () => download('docx'));
get('pdf').addEventListener('click', () => download('pdf'));
// The hero button lands on the first question, ready to type.
document.querySelectorAll('a[href="#entrevista"]').forEach(link => link.addEventListener('click', () => {
  if (form.hidden) return;
  // Only when the person has not moved on in the meantime.
  setTimeout(() => {
    if (document.activeElement !== link && document.activeElement !== document.body) return;
    go(0, false); control('title').focus({ preventScroll: true });
  }, 350);
}));
// Answers are deliberately not stored in the browser, so closing the tab would lose them.
addEventListener('beforeunload', event => {
  if (!leaving && !form.hidden && dirty) event.preventDefault();
});
void start();
