/* A browser estimate is never a charge. Every purchase uses a server quote. */
const ENDPOINT = '/api/web/project-orders';
const STORAGE_KEY = 'confenge.project-services.receipts.v1';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
const number = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
const $ = id => document.getElementById(id);
const form = typeof document === 'undefined' ? null : $('rp-service-form');

export function estimateProject(pricing, selection) {
  const area = Math.round(selection.areaM2 * 100);
  const days = selection.deadlineDays;
  if (!Number.isSafeInteger(area) || Math.abs(selection.areaM2 * 100 - area) > 0.000001 || area < pricing.areaMin * 100 || area > pricing.areaMax * 100 ||
      !Number.isInteger(days) || days < pricing.deadlineMin || days > pricing.deadlineMax) return null;
  const items = pricing.disciplines.filter(d => selection.disciplines.includes(d.id)).map(d => {
    const baseAmountCents = Math.max(d.minCents, Math.floor((area * d.rateCents + 50) / 100));
    const amountCents = Math.floor((baseAmountCents * (85 * days + 1350) + 50 * days) / (100 * days));
    return { id: d.id, title: d.title, baseAmountCents, amountCents };
  });
  return { items, amountCents: items.reduce((total, item) => total + item.amountCents, 0) };
}

export function paymentDestination(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.host === 'www.mercadopago.com.br' && url.pathname.startsWith('/checkout/') &&
      !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function message(node, text) {
  node.textContent = text || '';
  node.hidden = !text;
}

function listItems(node, items) {
  node.replaceChildren();
  for (const item of items) {
    const row = element('li');
    row.append(element('span', item.title), element('strong', money(item.amountCents)));
    node.append(row);
  }
}

function fact(node, label, value) {
  const row = element('div');
  row.append(element('dt', label), element('dd', value));
  node.append(row);
}

function requestError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function api(op, { method = 'GET', body, id, token } = {}) {
  const url = new URL(ENDPOINT, location.origin);
  url.searchParams.set('op', op);
  if (id) url.searchParams.set('id', id);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'same-origin', signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw requestError(typeof data.error === 'string' ? data.error : 'NETWORK_ERROR');
    return data;
  } catch (error) {
    if (error.code) throw error;
    throw requestError('NETWORK_ERROR');
  } finally { clearTimeout(timeout); }
}

function explain(error) {
  const copy = {
    OUTSIDE_SERVICE_SCOPE: 'Este caso precisa de uma proposta específica. Fale com a CONFENGE pelo formulário abaixo; nenhum pagamento foi iniciado.',
    INVALID_REQUEST: 'Confira os dados preenchidos, a área, as disciplinas e o prazo antes de continuar.',
    TERMS_REQUIRED: 'Leia as condições e marque os aceites antes de seguir para o pagamento.',
    QUOTE_CHANGED: 'As condições da oferta foram atualizadas. Revise novamente a contratação antes de pagar.',
    REQUEST_CONFLICT: 'Já existe uma tentativa de pedido com estes dados de acesso. Atualize sua situação ou procure o atendimento antes de iniciar outra compra.',
    PURCHASES_PAUSED: 'A contratação online está temporariamente pausada. Seu cálculo continua disponível e o atendimento pode orientar o próximo passo.',
    PAYMENT_UNAVAILABLE: 'O pagamento online está temporariamente indisponível. Seu cálculo continua disponível. Fale com a CONFENGE pelo formulário abaixo.',
    TOO_MANY_REQUESTS: 'Recebemos várias solicitações em sequência. Aguarde um minuto e tente novamente.',
    ORDER_NOT_FOUND: 'Não foi possível localizar o pedido com este arquivo de acesso. Confira o arquivo ou fale com o atendimento. Se acabou de iniciar o pedido, aguarde antes de tentar novamente.',
    STORAGE_UNAVAILABLE: 'Não foi possível guardar o acesso ao pedido nesta aba. Habilite o armazenamento do navegador ou use o atendimento. Nenhum pagamento foi iniciado.',
    NETWORK_ERROR: 'Não foi possível conferir a resposta do servidor. Se você iniciou um pedido, atualize a situação antes de tentar outra compra.',
  };
  return copy[error?.code] || 'Não foi possível concluir esta etapa. Tente novamente ou fale com a CONFENGE pelo atendimento.';
}

function readRecords() {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function validReceipt(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.hasOwn(value, 'id') && typeof value.id === 'string' && UUID.test(value.id) &&
    Object.hasOwn(value, 'receiptToken') && typeof value.receiptToken === 'string' && TOKEN.test(value.receiptToken);
}

export function receiptFromStore(records, requestedId = '') {
  if (!records || typeof records !== 'object' || Array.isArray(records)) return null;
  const id = typeof requestedId === 'string' && UUID.test(requestedId) ? requestedId.toLowerCase() :
    Object.hasOwn(records, 'active') ? records.active : '';
  if (typeof id !== 'string' || !UUID.test(id) || !Object.hasOwn(records, id)) return null;
  const record = records[id];
  if (!validReceipt(record) || record.id.toLowerCase() !== id.toLowerCase()) return null;
  // Restore only an owned credential, never an inherited receiver or a cached
  // payment claim. The status is independently fetched from the server.
  return { id: record.id.toLowerCase(), receiptToken: record.receiptToken };
}

function saveRecord(record, active = true) {
  if (!validReceipt(record)) throw requestError('STORAGE_UNAVAILABLE');
  try {
    const records = readRecords();
    records[record.id] = record;
    if (active) records.active = record.id;
    const saved = JSON.stringify(records);
    if (saved.length > 500000) throw new Error('Storage full');
    sessionStorage.setItem(STORAGE_KEY, saved);
    const readback = readRecords()[record.id];
    if (readback?.receiptToken !== record.receiptToken) throw new Error('Storage unavailable');
  } catch { throw requestError('STORAGE_UNAVAILABLE'); }
}

function generateReceipt() {
  if (!window.crypto?.getRandomValues || !window.crypto?.randomUUID) throw requestError('STORAGE_UNAVAILABLE');
  const bytes = window.crypto.getRandomValues(new Uint8Array(32));
  const receiptToken = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { id: window.crypto.randomUUID(), receiptToken };
}

if (form) {
  let pricing;
  try { pricing = JSON.parse($('rp-pricing').textContent); } catch { pricing = null; }
  let config = null;
  let configRequest = null;
  let proposalContext = '';
  let confirmed = null;
  let confirmedSelection = '';
  let quoteSequence = 0;
  let busy = false;
  let currentRecord = null;
  let currentOrder = null;
  let checkoutAttempt = null;
  let supportAttempt = null;
  let polling = false;
  let importBusy = false;
  let supportBusy = false;
  let orderSequence = 0;

  const select = () => ({
    areaM2: Number($('rp-area').value), deadlineDays: Number($('rp-deadline').value),
    disciplines: [...form.querySelectorAll('input[name="disciplines"]:checked')].map(input => input.value),
    floors: Number($('rp-floors').value), buildingType: $('rp-building-type').value, terrain: $('rp-terrain').value,
  });
  const sameSelection = () => confirmed && confirmedSelection === JSON.stringify(select());

  function eligibility(selection) {
    if (!pricing) return { kind: 'config', message: 'Clique em revisar para consultar as condições da contratação.' };
    if (!$('rp-area').value.trim() || !Number.isFinite(selection.areaM2)) {
      return { kind: 'input', field: 'rp-area', message: 'Informe a área construída total para continuar.' };
    }
    const conditions = [];
    if (selection.areaM2 < pricing.areaMin || selection.areaM2 > pricing.areaMax) conditions.push(`área fora de ${pricing.areaMin} a ${pricing.areaMax} m²`);
    if (![1, 2].includes(selection.floors)) conditions.push('outro número de pavimentos');
    if (selection.buildingType !== 'new-residential') conditions.push('reforma ou outro tipo de obra');
    if (selection.terrain === 'other') conditions.push('terreno inclinado, com contenções ou ainda não definido');
    if (conditions.length) return { kind: 'scope', message: `Sua seleção inclui: ${conditions.join('; ')}. Vamos preparar uma proposta para essas condições. Continue no botão abaixo.` };
    if (!selection.disciplines.length) return { kind: 'input', field: 'rp-arquitetura', message: 'Selecione ao menos uma disciplina para calcular seu projeto.' };
    if (!selection.terrain) return { kind: 'input', field: 'rp-terrain', message: 'Selecione as condições do terreno para revisar a contratação.' };
    if (!$('rp-area').validity.valid) return { kind: 'input', field: 'rp-area', message: 'Informe a área com até duas casas decimais, entre 50 e 250 m².' };
    return null;
  }

  function updateActions() {
    const issue = eligibility(select());
    const needsReview = !sameSelection();
    $('rp-review-button').disabled = busy;
    $('rp-pay-button').disabled = busy || (!needsReview && !config?.purchasesEnabled);
    $('rp-new-order').disabled = busy || polling || importBusy;
    if (!busy) {
      $('rp-review-button').textContent = issue?.kind === 'scope' ? 'Solicitar proposta para meu caso' : 'Revisar minha contratação';
      $('rp-pay-button').textContent = needsReview ? 'Atualizar resumo' : 'Criar pedido para pagar';
    }
  }

  function renderEstimate() {
    if (!pricing) { updateActions(); return; }
    const selection = select();
    const issue = eligibility(selection);
    const needsProposal = issue?.kind === 'scope';
    const all = estimateProject(pricing, { ...selection, disciplines: pricing.disciplines.map(d => d.id) });
    const selected = estimateProject(pricing, selection);
    $('rp-deadline-output').textContent = `${selection.deadlineDays} dias`;
    $('rp-deadline').setAttribute('aria-valuetext', `${selection.deadlineDays} dias corridos`);
    $('rp-summary-area').textContent = Number.isFinite(selection.areaM2) ? `${number(selection.areaM2)} m²` : 'Informe a área';
    $('rp-summary-deadline').previousElementSibling.textContent = needsProposal ? 'Prazo desejado' : 'Prazo de elaboração';
    $('rp-summary-deadline').textContent = `${selection.deadlineDays} dias corridos`;
    for (const button of form.querySelectorAll('[data-deadline]')) button.setAttribute('aria-pressed', String(Number(button.dataset.deadline) === selection.deadlineDays));
    for (const node of form.querySelectorAll('[data-discipline-price]')) {
      const item = all?.items.find(item => item.id === node.dataset.disciplinePrice);
      node.textContent = needsProposal ? 'Sob proposta' : item ? money(item.amountCents) : 'Sob consulta';
    }
    if (needsProposal) {
      $('rp-summary-items').replaceChildren(...pricing.disciplines.filter(d => selection.disciplines.includes(d.id)).map(d => element('li', d.title)));
    } else listItems($('rp-summary-items'), selected?.items || []);
    $('rp-total').textContent = needsProposal ? 'Sob proposta' : selected && selection.disciplines.length ? money(selected.amountCents) : 'Selecione seu projeto';
    const saving = selected ? selected.amountCents - selected.items.reduce((total, item) => total + item.baseAmountCents, 0) : 0;
    $('rp-savings').textContent = needsProposal ? 'O valor e o prazo serão definidos na proposta para o seu caso.' : saving > 0 ? `Com 90 dias, este projeto fica ${money(saving)} mais econômico.` :
      selected?.items.length ? 'Você escolheu o menor valor desta faixa de prazo.' : 'O total é a soma das disciplinas escolhidas.';
    $('rp-included-note').hidden = needsProposal;
    $('rp-payment-availability').hidden = needsProposal;
    message($('rp-eligibility'), issue?.message);
    updateActions();
  }

  function invalidate() {
    quoteSequence++;
    confirmed = null;
    confirmedSelection = '';
    $('rp-accept-terms').checked = false;
    message($('rp-review-message'), '');
    if (!$('rp-purchase-details').hidden) {
      message($('rp-checkout-message'), 'Você alterou a configuração. Clique em “Atualizar resumo” abaixo para conferir as novas condições antes de pagar.');
      $('rp-confirmed-summary').replaceChildren(element('p', 'Configuração alterada. O resumo precisa ser atualizado.', 'rp-hint'));
    }
    renderEstimate();
  }

  function renderConfirmed(quote) {
    const container = $('rp-confirmed-summary');
    const facts = element('dl', undefined, 'rp-summary-facts');
    fact(facts, 'Área construída', `${number(quote.areaM2)} m²`);
    fact(facts, 'Prazo', `${quote.deadlineDays} dias corridos`);
    const items = element('ul', undefined, 'rp-summary-items');
    listItems(items, quote.items);
    const total = element('p', 'Total ', 'rp-confirmed-total');
    total.append(element('strong', money(quote.amountCents)));
    const note = element('p', 'Elaboração sob encomenda. Um prazo único para todas as disciplinas. Lista de insumos em até 2 dias úteis após pagamento. Com pagamento confirmado e documentos completos, o prazo começa até o terceiro dia útil; o aviso por escrito registra o início e a data final. Inclui ART ou RRT de projeto e duas rodadas de ajustes. Sem taxas, levantamentos em campo ou aprovação administrativa.', 'rp-small');
    container.replaceChildren(facts, items, total, note);
    $('rp-terms-text').textContent = config.terms.text;
    const supplier = config.supplier;
    if (supplier?.legalName && supplier?.registration) {
      const text = `${supplier.legalName} · CNPJ ${supplier.registration}.${supplier.address ? ` Endereço cadastral e fiscal: ${supplier.address}.` : ''}${supplier.serviceLocation ? ` ${supplier.serviceLocation}` : ''}`;
      for (const node of document.querySelectorAll('[data-project-supplier]')) node.textContent = text;
    }
  }

  function loadConfig() {
    if (configRequest) return configRequest;
    configRequest = (async () => {
      try {
        const result = await api('service-config');
        if (!result.pricing || !Array.isArray(result.pricing.disciplines) || !result.terms?.text || !/^[a-f0-9]{64}$/.test(result.terms.sha256 || '')) throw requestError('PAYMENT_UNAVAILABLE');
        config = result;
        pricing = result.pricing;
        $('rp-payment-availability').textContent = result.purchasesEnabled ?
          'Pagamento pelo Mercado Pago. Confira as condições antes de confirmar.' :
          'Pagamento online temporariamente indisponível. Você pode calcular, revisar o escopo e falar com a CONFENGE.';
      } catch {
        config = null;
        $('rp-payment-availability').textContent = 'Não foi possível conferir o pagamento online. Clique em “Revisar minha contratação” para tentar novamente.';
      }
      renderEstimate();
    })().finally(() => { configRequest = null; });
    return configRequest;
  }

  function requestProposal() {
    const selection = select();
    const option = id => $(id).selectedOptions[0]?.textContent || 'Não informado';
    const context = ['Solicitação de proposta pelo simulador.',
      `Área construída: ${number(selection.areaM2)} m².`, `Pavimentos: ${option('rp-floors')}.`,
      `Tipo de obra: ${option('rp-building-type')}.`, `Terreno: ${option('rp-terrain')}.`,
      `Disciplinas: ${pricing.disciplines.filter(d => selection.disciplines.includes(d.id)).map(d => d.title).join(', ') || 'A definir'}.`,
      `Prazo desejado: ${selection.deadlineDays} dias.`].join('\n');
    const reference = $('mensagem');
    const previous = reference.value;
    const value = proposalContext && previous.includes(proposalContext) ? previous.replace(proposalContext, context) :
      previous.trim() ? `${context}\n\n${previous}` : context;
    if (value.length <= reference.maxLength) { reference.value = value; proposalContext = context; }
    $('project_kind').value = 'custom';
    reference.closest('details').open = true;
    $('nome').focus({ preventScroll: true });
    $('nome').scrollIntoView({ behavior: 'auto', block: 'center' });
  }

  function guideSelection(issue) {
    message($('rp-eligibility'), issue.message);
    if (issue.kind === 'scope') requestProposal();
    else if (issue.field) {
      $(issue.field).focus({ preventScroll: true });
      $(issue.field).scrollIntoView({ behavior: 'auto', block: 'center' });
    }
  }

  function showReviewError(text) {
    message($('rp-review-message'), text);
    if (!$('rp-purchase-details').hidden) message($('rp-checkout-message'), text);
  }

  async function review() {
    if (busy) return;
    const selection = select();
    const issue = eligibility(selection);
    message($('rp-review-message'), '');
    if (issue && issue.kind !== 'config') { guideSelection(issue); return; }
    const sequence = ++quoteSequence;
    confirmed = null;
    confirmedSelection = '';
    $('rp-accept-terms').checked = false;
    busy = true;
    $('rp-review-button').textContent = 'Conferindo o resumo...';
    updateActions();
    try {
      if (!config?.purchasesEnabled) await loadConfig();
      if (!config) { showReviewError('A consulta do pagamento não respondeu. Tente revisar novamente ou use o atendimento abaixo.'); return; }
      if (sequence !== quoteSequence || JSON.stringify(selection) !== JSON.stringify(select())) return;
      const currentIssue = eligibility(selection);
      if (currentIssue) { guideSelection(currentIssue); return; }
      const result = await api('service-quote', { method: 'POST', body: selection });
      if (sequence !== quoteSequence || JSON.stringify(selection) !== JSON.stringify(select())) return;
      if (!Array.isArray(result.items) || !Number.isSafeInteger(result.amountCents) || result.amountCents <= 0 || result.currency !== 'BRL' ||
          result.items.length !== selection.disciplines.length || new Set(result.items.map(item => item.id)).size !== result.items.length ||
          result.items.some(item => !selection.disciplines.includes(item.id) || !Number.isSafeInteger(item.amountCents) || item.amountCents <= 0) ||
          result.items.reduce((total, item) => total + item.amountCents, 0) !== result.amountCents ||
          !/^[a-f0-9]{64}$/.test(result.quoteHash || '') ||
          result.termsHash !== config.terms.sha256 || result.termsVersion !== config.terms.version || result.pricingVersion !== config.pricing.version) {
        await loadConfig();
        throw requestError('QUOTE_CHANGED');
      }
      confirmed = result;
      confirmedSelection = JSON.stringify(selection);
      $('rp-accept-terms').checked = false;
      renderConfirmed(result);
      $('rp-purchase-details').hidden = false;
      message($('rp-checkout-message'), config.purchasesEnabled ? '' : 'Seu resumo está disponível. O pagamento online está temporariamente indisponível; fale com a CONFENGE para contratar.');
      $('rp-purchase-title').focus({ preventScroll: true });
      $('rp-purchase-details').scrollIntoView({ behavior: 'auto', block: 'start' });
    } catch (error) {
      showReviewError(explain(error));
      if (error.code === 'QUOTE_CHANGED') { confirmed = null; confirmedSelection = ''; $('rp-accept-terms').checked = false; }
    }
    finally { busy = false; updateActions(); }
  }

  function selectedReference() {
    const parts = [];
    if ($('rp-condominium').value) parts.push(`Condomínio: ${$('rp-condominium').value}.`);
    if ($('rp-lot-measures').value.trim()) parts.push(`Medidas informadas: ${$('rp-lot-measures').value.trim()}.`);
    if ($('rp-reference').value.trim()) parts.push($('rp-reference').value.trim());
    return parts.join('\n');
  }

  function validOrder(order, id) {
    return order && order.id === id && UUID.test(order.id) && typeof order.status === 'string' &&
      Array.isArray(order.items) && order.items.length > 0 && Number.isSafeInteger(order.amountCents) && order.amountCents > 0 &&
      order.items.every(item => typeof item.title === 'string' && Number.isSafeInteger(item.amountCents) && item.amountCents > 0) &&
      order.amountCents === order.items.reduce((total, item) => total + item.amountCents, 0);
  }

  function renderOrder(order, record, focus = false) {
    if (!validOrder(order, record.id)) throw requestError('NETWORK_ERROR');
    if (currentRecord?.id !== record.id) {
      supportAttempt = null;
      $('rp-support-message').value = '';
      $('rp-support-kind').value = 'support';
      $('rp-support-message').required = true;
      $('rp-support-message-hint').textContent = '(obrigatória para atendimento)';
    }
    $('rp-support-status').textContent = '';
    currentRecord = { id: record.id, receiptToken: record.receiptToken,
      lastStatus: order.status, createdAt: order.createdAt };
    currentOrder = order;
    saveRecord(currentRecord);
    $('pedido').hidden = false;
    const statuses = {
      creating: 'Pedido em conferência. Aguarde antes de tentar outra compra.',
      pending: 'Pedido registrado. Pagamento ainda não confirmado.',
      paid: 'Pagamento confirmado pelo Mercado Pago.',
      failed: 'Esta tentativa não foi concluída. Você pode tentar contratar novamente.',
      cancelled: 'Pedido cancelado pelo provedor.',
      refunded: 'Devolução integral confirmada pelo Mercado Pago.',
      review: 'O pedido precisa de conferência. O atendimento vai orientar os próximos passos.',
    };
    $('rp-order-state').textContent = statuses[order.status] || 'O pedido está em conferência.';
    const facts = $('rp-order-facts');
    facts.replaceChildren();
    fact(facts, 'Número do pedido', order.id);
    if (Number.isFinite(order.areaM2)) fact(facts, 'Área construída', `${number(order.areaM2)} m²`);
    fact(facts, 'Prazo contratado', `${order.deadlineDays} dias corridos após início confirmado`);
    fact(facts, 'Valor do pedido', money(order.amountCents));
    if (order.createdAt && !Number.isNaN(new Date(order.createdAt).valueOf())) {
      fact(facts, 'Pedido registrado em', new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(order.createdAt)));
    }
    fact(facts, 'Condições aceitas', order.termsVersion || 'Conforme pedido');
    listItems($('rp-order-items'), order.items);
    $('rp-order-next').textContent = order.status === 'paid' ?
      'Em até 2 dias úteis após o pagamento, a equipe envia a lista específica de insumos. Em até 3 dias úteis de cada envio, confirma o início ou aponta as pendências específicas. Com pagamento confirmado e documentos completos, o prazo começa até o terceiro dia útil após o recebimento completo; o aviso por escrito registra o início e a data final. Um único prazo cobre todas as disciplinas do pedido.' :
      order.status === 'pending' ? 'Salve seu acesso ao pedido e siga ao Mercado Pago. Ao voltar, atualize a situação. O retorno à página, sozinho, não confirma pagamento.' :
        order.status === 'failed' ? 'Clique em “Tentar contratar novamente” para conferir seus dados e iniciar uma nova tentativa. O registro desta tentativa continua disponível no seu arquivo de acesso.' :
        order.status === 'refunded' ? 'O provedor confirmou a devolução integral. O prazo para o crédito aparecer depende do meio de pagamento utilizado.' :
          'Guarde o número do pedido e use o atendimento abaixo. Não repita a compra enquanto a situação estiver em conferência.';
    const target = order.status === 'pending' ? paymentDestination(order.checkoutUrl) : '';
    $('rp-order-pay').hidden = !target;
    if (target) $('rp-order-pay').href = target; else $('rp-order-pay').removeAttribute('href');
    $('rp-order-download').disabled = false;
    $('rp-order-refresh').disabled = false;
    $('rp-order-support').hidden = false;
    $('rp-new-order').hidden = !['paid', 'failed', 'cancelled', 'refunded'].includes(order.status);
    $('rp-new-order').textContent = order.status === 'failed' ? 'Tentar contratar novamente' : 'Contratar outra disciplina';
    $('rp-order-terms-text').textContent = order.terms?.text || 'As condições deste pedido podem ser solicitadas pelo atendimento, com o número do pedido.';
    $('rp-order-contact').href = `mailto:tiago.sasaki@confenge.com.br?subject=${encodeURIComponent(`Atendimento do pedido residencial ${order.id}`)}`;
    if (order.requests?.length) {
      const latest = order.requests[order.requests.length - 1];
      if (typeof latest.id === 'string') $('rp-support-status').textContent = `Solicitação registrada. Protocolo: ${latest.id}. O registro não confirma estorno.`;
    }
    if (focus) { $('rp-order-title').focus({ preventScroll: true }); $('pedido').scrollIntoView({ behavior: 'auto', block: 'start' }); }
  }

  async function refreshOrder(record = currentRecord, focus = false) {
    if (!validReceipt(record) || polling || busy || importBusy) return;
    const sequence = ++orderSequence;
    polling = true;
    updateActions();
    $('pedido').hidden = false;
    $('rp-order-refresh').disabled = true;
    $('rp-order-state').textContent = 'Conferindo a situação do pedido...';
    try {
      const result = await api('service-status', { id: record.id, token: record.receiptToken });
      if (sequence !== orderSequence) return;
      renderOrder(result, record, focus);
    } catch (error) {
      if (sequence !== orderSequence) return;
      $('rp-order-state').textContent = explain(error);
      $('rp-order-pay').hidden = true;
      $('rp-order-pay').removeAttribute('href');
      if (!currentOrder) $('rp-order-support').hidden = true;
    } finally { polling = false; $('rp-order-refresh').disabled = importBusy; updateActions(); }
  }

  async function checkout(event) {
    event.preventDefault();
    if (busy || importBusy) return;
    if (!sameSelection()) { await review(); return; }
    if (!form.reportValidity()) return;
    if (!config?.purchasesEnabled) { message($('rp-checkout-message'), explain(requestError('PAYMENT_UNAVAILABLE'))); return; }
    if (currentRecord && currentOrder && !['paid', 'failed', 'cancelled', 'refunded'].includes(currentOrder.status)) {
      message($('rp-checkout-message'), 'Você já iniciou um pedido nesta aba. Confira a situação abaixo antes de tentar outra compra.');
      await refreshOrder(currentRecord, true);
      return;
    }
    busy = true;
    orderSequence++;
    updateActions();
    $('rp-pay-button').textContent = 'Registrando seu pedido...';
    try {
      const base = { ...select(), name: $('rp-customer-name').value.trim(), email: $('rp-customer-email').value.trim(),
        phone: $('rp-customer-phone').value.trim(), city: $('rp-customer-city').value.trim(), state: $('rp-customer-state').value,
        reference: selectedReference(), acceptedTerms: $('rp-accept-terms').checked, consent: $('rp-accept-privacy').checked,
        pricingVersion: confirmed.pricingVersion, termsVersion: confirmed.termsVersion, termsHash: confirmed.termsHash,
        quoteHash: confirmed.quoteHash };
      if (!checkoutAttempt || checkoutAttempt.fingerprint !== JSON.stringify(base)) {
        if (checkoutAttempt && currentOrder) throw requestError('REQUEST_CONFLICT');
        // After an interrupted response, retry the same opaque request id.
        // A pre-creation failure may require corrected buyer data. Preserve
        // the same credential and let the server decide whether an earlier
        // request was persisted; a local fingerprint cannot establish that.
        const recovered = Boolean(currentRecord && !currentOrder);
        const receipt = checkoutAttempt?.receipt || (recovered ? currentRecord : generateReceipt());
        checkoutAttempt = { fingerprint: JSON.stringify(base), receipt, uncertain: Boolean(checkoutAttempt?.uncertain || recovered),
          body: { ...base, requestId: receipt.id, receiptToken: receipt.receiptToken } };
      }
      saveRecord(checkoutAttempt.receipt);
      const result = await api('service-checkout', { method: 'POST', body: checkoutAttempt.body });
      renderOrder(result, checkoutAttempt.receipt, true);
      message($('rp-checkout-message'), result.status === 'paid' ? 'Pagamento confirmado. Consulte abaixo os próximos passos e salve seu acesso ao pedido.' : result.status === 'pending' ?
        'Pedido registrado. Você pode salvar seu acesso e seguir para o Mercado Pago no botão abaixo.' :
        result.status === 'failed' ? 'Esta tentativa não foi concluída. Use “Tentar contratar novamente” abaixo para continuar.' :
        'O pedido foi registrado e está em conferência. Consulte sua situação antes de iniciar outra compra.');
      $('rp-accept-terms').checked = false;
    } catch (error) {
      const rejectedBeforeCreation = ['INVALID_REQUEST', 'INVALID_CONTENT_TYPE', 'TERMS_REQUIRED', 'OUTSIDE_SERVICE_SCOPE', 'QUOTE_CHANGED'].includes(error.code);
      if (checkoutAttempt && rejectedBeforeCreation && !checkoutAttempt.uncertain) {
        // An initial definitive validation refusal did not create an order.
        // Keep the credential after any earlier uncertain response, however.
        const records = readRecords();
        delete records[checkoutAttempt.receipt.id];
        if (records.active === checkoutAttempt.receipt.id) delete records.active;
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { /* Preserve the on-screen correction path. */ }
        checkoutAttempt = null;
      } else if (checkoutAttempt && !rejectedBeforeCreation) checkoutAttempt.uncertain = true;
      if (checkoutAttempt && ['NETWORK_ERROR', 'REQUEST_CONFLICT'].includes(error.code)) {
        currentRecord = checkoutAttempt.receipt;
        $('pedido').hidden = false;
        $('rp-order-state').textContent = 'Não foi possível confirmar a resposta. Use “Atualizar situação” antes de tentar outra compra.';
        $('rp-order-support').hidden = true;
        $('rp-order-download').disabled = false;
      }
      if (error.code === 'QUOTE_CHANGED') { invalidate(); await loadConfig(); }
      message($('rp-checkout-message'), explain(error));
    } finally { busy = false; $('rp-pay-button').textContent = 'Criar pedido para pagar'; updateActions(); }
  }

  function downloadAccess() {
    if (!validReceipt(currentRecord) || polling || importBusy) return;
    const receipt = { schema: 'confenge.project-service-receipt/1', id: currentRecord.id, receiptToken: currentRecord.receiptToken };
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = element('a');
    anchor.href = url;
    anchor.download = `confenge-acesso-pedido-${currentRecord.id}.json`;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function restoreAccess() {
    const file = $('rp-restore-file').files?.[0];
    if (!file || importBusy) return;
    if (busy) { $('rp-restore-message').textContent = 'Aguarde a conclusão da etapa atual antes de recuperar outro pedido.'; return; }
    const sequence = ++orderSequence;
    importBusy = true;
    updateActions();
    $('rp-restore-message').textContent = 'Conferindo o acesso ao pedido...';
    try {
      if (file.size > 16384) throw requestError('INVALID_REQUEST');
      const value = JSON.parse(await file.text());
      if (value.schema !== 'confenge.project-service-receipt/1' || !validReceipt(value) ||
          Object.keys(value).some(key => !['schema', 'id', 'receiptToken'].includes(key))) throw requestError('INVALID_REQUEST');
      const receipt = { id: value.id.toLowerCase(), receiptToken: value.receiptToken };
      const result = await api('service-status', { id: receipt.id, token: receipt.receiptToken });
      if (sequence !== orderSequence) return;
      if (!validOrder(result, receipt.id)) throw requestError('NETWORK_ERROR');
      saveRecord(receipt);
      renderOrder(result, receipt, true);
      $('rp-restore-message').textContent = 'Acesso recuperado. A situação do pedido está abaixo.';
    } catch (error) { $('rp-restore-message').textContent = error.code ? explain(error) : 'Este arquivo não é um acesso de pedido válido. Selecione o arquivo recebido ao contratar.'; }
    finally { importBusy = false; $('rp-restore-file').value = ''; $('rp-order-refresh').disabled = polling; updateActions(); }
  }

  async function requestSupport(event) {
    event.preventDefault();
    const supportForm = $('rp-support-form');
    if (!validReceipt(currentRecord) || !currentOrder || importBusy || polling || supportBusy || !supportForm.reportValidity()) return;
    const requestOrderId = currentRecord.id;
    supportBusy = true;
    const base = { orderId: currentRecord.id, kind: $('rp-support-kind').value, message: $('rp-support-message').value.trim() };
    const fingerprint = JSON.stringify(base);
    if (!supportAttempt || supportAttempt.fingerprint !== fingerprint) supportAttempt = { fingerprint, body: { ...base, requestId: crypto.randomUUID() } };
    $('rp-support-submit').disabled = true;
    $('rp-support-status').textContent = 'Registrando sua solicitação...';
    try {
      const receipt = await api('service-support', { method: 'POST', body: supportAttempt.body, token: currentRecord.receiptToken });
      if (currentRecord?.id !== requestOrderId) return;
      if (receipt.status !== 'received' || typeof receipt.id !== 'string') throw requestError('NETWORK_ERROR');
      $('rp-support-status').textContent = `Solicitação registrada. Protocolo: ${receipt.id}. A equipe dará continuidade ao atendimento.${base.kind === 'cancellation' ? ' O registro não confirma o estorno; ele depende do processamento pelo provedor.' : ''}`;
    } catch (error) { if (currentRecord?.id === requestOrderId) $('rp-support-status').textContent = explain(error); }
    finally { supportBusy = false; $('rp-support-submit').disabled = false; }
  }

  function printSummary(kind) {
    const className = kind === 'order' ? 'rp-print-order' : 'rp-print-review';
    const terms = kind === 'order' ? $('rp-order-terms') : document.querySelector('.rp-purchase-details .rp-accepted-terms');
    const wasOpen = terms?.open;
    if (terms) terms.open = true;
    document.body.classList.add(className);
    const restore = () => { document.body.classList.remove(className); if (terms) terms.open = wasOpen; };
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
    restore();
  }

  for (const node of form.querySelectorAll('#rp-config-fields input, #rp-config-fields select, input[name="disciplines"]')) node.addEventListener('input', invalidate);
  for (const button of form.querySelectorAll('[data-deadline]')) button.addEventListener('click', () => { $('rp-deadline').value = button.dataset.deadline; invalidate(); });
  for (const link of document.querySelectorAll('[data-select-discipline]')) link.addEventListener('click', () => {
    const requested = link.dataset.selectDiscipline;
    for (const input of form.querySelectorAll('input[name="disciplines"]')) input.checked = input.value === requested;
    invalidate();
  });
  $('rp-review-button').addEventListener('click', review);
  $('rp-print-summary').addEventListener('click', () => printSummary('review'));
  $('rp-order-print').addEventListener('click', () => printSummary('order'));
  $('rp-order-download').addEventListener('click', downloadAccess);
  $('rp-new-order').addEventListener('click', () => {
    if (busy || polling || importBusy) return;
    if (!currentOrder || !['paid', 'failed', 'cancelled', 'refunded'].includes(currentOrder.status)) return;
    // A new purchase or retry is deliberate and only follows a settled state.
    // Previous receipts remain in this tab's private store.
    const records = readRecords();
    delete records.active;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { return; }
    orderSequence++;
    currentRecord = null;
    currentOrder = null;
    checkoutAttempt = null;
    supportAttempt = null;
    $('pedido').hidden = true;
    $('rp-purchase-details').hidden = true;
    invalidate();
    message($('rp-review-message'), 'Escolha as disciplinas do novo pedido e revise o total antes de contratar. O acesso ao pedido anterior continua no arquivo que você salvou.');
    $('monte-seu-projeto').scrollIntoView({ block: 'start', behavior: 'auto' });
    $('rp-area').focus({ preventScroll: true });
  });
  $('rp-order-refresh').addEventListener('click', () => refreshOrder());
  $('rp-restore-file').addEventListener('change', restoreAccess);
  $('rp-support-form').addEventListener('submit', requestSupport);
  $('rp-support-kind').addEventListener('change', () => {
    const cancellation = $('rp-support-kind').value === 'cancellation';
    $('rp-support-message').required = !cancellation;
    $('rp-support-message-hint').textContent = cancellation ? '(opcional para cancelamento)' : '(obrigatória para atendimento)';
  });
  form.addEventListener('submit', checkout);
  $('rp-config-fields').disabled = false;
  $('rp-discipline-fields').disabled = false;
  renderEstimate();
  loadConfig();

  // The only value accepted from the return URL is an opaque order id.
  // Browser/provider success flags cannot change payment state.
  const requestedId = new URL(location.href).searchParams.get('pedido');
  const records = readRecords();
  const restored = receiptFromStore(records, requestedId);
  if (restored) {
    currentRecord = restored;
    refreshOrder(currentRecord, Boolean(requestedId));
  } else if (UUID.test(requestedId || '')) {
    $('rp-restore-details').open = true;
    $('rp-restore-message').textContent = 'Para consultar este pedido, abra o arquivo de acesso que você salvou ao contratar ou retorne à aba original. O retorno do Mercado Pago não comprova pagamento.';
    $('rp-restore-details').scrollIntoView({ block: 'center', behavior: 'auto' });
  }
}
