const API = '/api/web/engineering-marketplace';
const TERMS_VERSION = 'marketplace-engenharia-v1';
const PAGE_SIZE = 12;
// This subset matches apps/engineering-marketplace/config/intents.json,
// derived from CONFENGE_PUBLIC_INTENT_MATRIX/1.0.0. It is not a separate
// catalogue or an automatic promise of professional scope.
const INTENTS = [
  ['projetar_revisar_compatibilizar', 'Projetos, revisão e compatibilização'],
  ['orcar_planejar_decidir', 'Orçamento e planejamento'],
  ['inspecionar_diagnosticar', 'Inspeção e diagnóstico'],
  ['receber_entregar_reformar', 'Vistorias e reformas'],
  ['documentar_as_built_regularizar', 'Documentação e as built'],
  ['avaliar_imovel', 'Avaliação de imóveis'],
  ['produzir_prova_tecnica', 'Perícias e assistência técnica'],
  ['organizar_sst', 'Segurança do trabalho'],
];
const INTENT_NAMES = new Map(INTENTS);
const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
const STATUS_LABELS = {
  requested: 'Aguardando proposta', quoted: 'Proposta recebida', accepted: 'Proposta aceita',
  paid: 'Pagamento confirmado', delivered: 'Entrega disponível', completed: 'Serviço concluído',
  cancelled: 'Cancelado', disputed: 'Em análise', refunded: 'Reembolsado',
};
const ERRORS = {
  AUTH_REQUIRED: 'Sua sessão terminou. Entre novamente para continuar.',
  ACTION_FORBIDDEN: 'Esta ação não está disponível para a sua conta ou para esta etapa do serviço.',
  INVALID_REQUEST: 'Confira os campos preenchidos e tente novamente.',
  INVALID_CONTENT_TYPE: 'Não foi possível enviar os dados. Recarregue a página e tente novamente.',
  INVALID_UPSTREAM_RESPONSE: 'Não foi possível confirmar a resposta. Atualize a página antes de continuar.',
  MARKETPLACE_UNAVAILABLE: 'O serviço está indisponível no momento. Tente novamente em alguns instantes.',
  TOO_MANY_REQUESTS: 'Houve muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente.',
  REQUEST_CONFLICT: 'Este registro mudou desde a última consulta. Atualize a lista e confira a versão mais recente antes de continuar.',
  NOT_FOUND: 'Este registro não está disponível. Atualize a consulta.',
  TERMS_REQUIRED: 'Leia e aceite os termos para continuar.',
  ORIGIN_FORBIDDEN: 'Reabra esta página pelo site da CONFENGE para continuar.',
  PAYMENTS_DISABLED: 'Os pagamentos online ainda não estão disponíveis.',
  PAYLOAD_TOO_LARGE: 'O texto enviado ultrapassou o tamanho permitido. Reduza o conteúdo e tente novamente.',
  ADDITIONAL_VERIFICATION_REQUIRED: 'Sua conta precisa de uma verificação adicional. Procure a equipe CONFENGE para concluir o acesso.',
  PROPOSAL_EXPIRED: 'O prazo desta proposta venceu. Solicite uma proposta atualizada antes de contratar.',
  COMMISSION_CHANGED: 'A comissão mudou desde a sua consulta. Recarregue esta página e confira as condições antes de enviar a proposta novamente.',
  PAYMENT_RECONCILIATION_REQUIRED: 'A tentativa de pagamento anterior precisa ser conferida. A equipe CONFENGE pode ajudar a confirmar a situação antes de uma nova cobrança.',
};
const $ = selector => document.querySelector(selector);
const state = { enabled: false, paymentsEnabled: false, commissionBps: null, authMode: 'login', session: { authenticated: false },
  epoch: 0, activeTab: 'search', query: '', offset: 0, searchSequence: 0, requestSequence: 0,
  profileSequence: 0, searchController: null, provider: null, pendingRequest: false, profileLoaded: false };

class ApiError extends Error {
  constructor(code, status) { super(ERRORS[code] || 'Não foi possível concluir a ação. Tente novamente.'); this.code = code; this.status = status; }
}
class FormError extends Error {}
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined && text !== null) element.textContent = String(text);
  if (className) element.className = className;
  return element;
}
function button(text, handler, className = 'button button-secondary') {
  const element = node('button', text, className); element.type = 'button';
  element.addEventListener('click', handler); return element;
}
function status(element, message = '', tone = 'info') {
  element.textContent = message; element.hidden = !message; element.dataset.tone = tone;
}
function notice(message, tone = 'success') { status($('#market-notice'), message, tone); }
function errorMessage(error) {
  if (error instanceof ApiError || error instanceof FormError) return error.message;
  return error?.name === 'AbortError' ? 'A consulta demorou mais que o esperado. Tente novamente.' : 'Não foi possível concluir a ação. Verifique sua conexão e tente novamente.';
}
async function api(op, { method = 'GET', body, params = {}, signal } = {}) {
  const url = new URL(API, window.location.origin); url.searchParams.set('op', op);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 15_000);
  try {
    const response = await fetch(url, { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      signal: controller.signal, headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!/^application\/json\b/i.test(response.headers.get('content-type') || '')) throw new ApiError('INVALID_UPSTREAM_RESPONSE', response.status);
    const result = await response.json();
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new ApiError('INVALID_UPSTREAM_RESPONSE', 502);
    if (!response.ok || result.error) throw new ApiError(result.error || (response.status === 401 ? 'AUTH_REQUIRED' : 'MARKETPLACE_UNAVAILABLE'), response.status);
    return result;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
async function busy(container, task) {
  if (container.dataset.busy === 'true') return;
  container.dataset.busy = 'true'; container.setAttribute('aria-busy', 'true');
  const controls = [...(container.matches('button,input,select,textarea,fieldset') ? [container] : []), ...container.querySelectorAll('button,input,select,textarea,fieldset')];
  const previous = controls.map(control => [control, control.disabled]);
  controls.forEach(control => { control.disabled = true; });
  try { return await task(); }
  finally {
    previous.forEach(([control, disabled]) => { if (control.isConnected) control.disabled = disabled; });
    container.removeAttribute('aria-busy'); delete container.dataset.busy;
  }
}
function expireSession(error) {
  if (!(error instanceof ApiError) || error.code !== 'AUTH_REQUIRED') return;
  setSession({ authenticated: false }); openTab('account'); notice(error.message, 'error');
}
function wireForm(form, task) {
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!state.enabled || form.dataset.busy === 'true' || !form.reportValidity()) return;
    const values = new FormData(form);
    const output = form.querySelector('[data-form-status]');
    status(output, 'Enviando…');
    void busy(form, async () => {
      try { await task(values, output); }
      catch (error) { status(output, errorMessage(error), 'error'); expireSession(error); }
    });
  });
}
function textValue(values, key) { return String(values.get(key) || '').trim(); }
function httpsUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 2048) return null;
  try { const parsed = new URL(value); return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : null; }
  catch { return null; }
}
function externalLink(text, value) {
  const href = httpsUrl(value); if (!href) return null;
  const link = node('a', text); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer'; return link;
}
function money(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) return 'Valor não disponível';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
function editableMoney(cents) {
  return Number.isSafeInteger(cents) && cents > 0 ? `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}` : '';
}
function parseMoney(value) {
  const normalized = String(value).trim().replace(/^R\$\s*/, '');
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(normalized)) throw new FormError('Informe o valor em reais, por exemplo 2.500,00.');
  const [whole, fraction = ''] = normalized.replaceAll('.', '').split(',');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents < 1000n || cents > 100_000_000n) throw new FormError('Informe um valor entre R$ 10,00 e R$ 1.000.000,00.');
  return Number(cents);
}
function commissionLabel(bps) { return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(bps / 100)}%`; }
function quoteAmounts(cents, bps) {
  const fee = Number(BigInt(cents) * BigInt(bps) / 10000n);
  return `Comissão CONFENGE: ${money(fee)} (${commissionLabel(bps)}). Valor do profissional após essa comissão: ${money(cents - fee)}, antes de outras tarifas e tributos aplicáveis.`;
}
function dateLabel(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return 'Não informado';
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.valueOf()) ? 'Não informado' : new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
}
function requireDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new FormError('Informe uma data válida para o prazo da proposta.');
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new FormError('Informe uma data válida para o prazo da proposta.');
  return value;
}
function ratingLabel(provider) {
  if (!Number.isSafeInteger(provider.review_count) || provider.review_count <= 0 || !Number.isFinite(provider.rating) || provider.rating < 1 || provider.rating > 5) return 'Ainda sem avaliações';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(provider.rating)} de 5 · ${provider.review_count} ${provider.review_count === 1 ? 'avaliação' : 'avaliações'}`;
}
function locationLabel(profile = {}) { return [profile.city, profile.uf].filter(value => typeof value === 'string' && value).join(', ') || 'Local de atendimento não informado'; }
function modalityLabel(profile = {}) {
  return (Array.isArray(profile.modalities) ? profile.modalities : []).filter(value => ['remoto', 'presencial'].includes(value)).map(value => value === 'remoto' ? 'Remoto' : 'Presencial').join(' e ');
}
function empty(container, title, message, withContact = true) {
  const box = node('div', null, 'market-empty');
  if (title) box.append(node('h3', title)); box.append(node('p', message));
  if (withContact) { const paragraph = node('p'); const link = node('a', 'Converse com a CONFENGE sobre o seu projeto'); link.href = '/triagem-tecnica/'; paragraph.append(link); box.append(paragraph); }
  container.append(box);
}
function openTab(name, focus = false) {
  if (!['search','account','requests'].includes(name)) return;
  state.activeTab = name;
  for (const tab of document.querySelectorAll('[data-market-tab]')) {
    const active = tab.dataset.marketTab === name;
    tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    if (active && focus) tab.focus();
  }
  if (name === 'requests') void loadRequests();
  if (name === 'account' && state.session.authenticated && state.session.role === 'provider' && !state.profileLoaded) void loadProfile();
}
function setSession(session) {
  state.epoch += 1; state.requestSequence += 1; state.profileSequence += 1;
  state.session = session?.authenticated === true ? session : { authenticated: false };
  state.profileLoaded = false;
  $('#market-request-list').replaceChildren();
  $('#market-profile-form').reset(); $('#market-profile-form > fieldset').disabled = true;
  $('#market-password').value = '';
  $('#market-account-name').textContent = ''; $('#market-account-email').textContent = '';
  status($('#market-requests-status')); status($('#market-profile-load-status'));
  if (!state.session.authenticated) {
    $('#market-request-form').reset(); $('#market-account-view').hidden = true; $('#market-auth-view').hidden = false;
    for (const input of $('#market-auth-form').querySelectorAll('input:not([type=radio]):not([type=checkbox])')) input.value = '';
    $('#market-auth-form input[name=consent]').checked = false;
  }
  renderSession();
}
function renderSession() {
  const session = state.session, authenticated = session.authenticated;
  $('#market-auth-view').hidden = authenticated;
  $('#market-account-view').hidden = !authenticated;
  $('#market-requests-signin').hidden = authenticated;
  $('#market-refresh-requests').hidden = !authenticated;
  $('#market-request-form').hidden = !authenticated || session.role !== 'customer';
  $('#market-request-signin').hidden = authenticated && session.role === 'customer';
  if (!authenticated) return;
  const provider = session.role === 'provider';
  $('#market-account-role').textContent = provider ? 'Conta profissional' : 'Conta de cliente';
  $('#market-account-name').textContent = provider ? (session.seller?.name || 'Seu perfil profissional') : [session.user?.first_name, session.user?.last_name].filter(Boolean).join(' ') || 'Sua conta';
  $('#market-account-email').textContent = session.user?.email || '';
  $('#market-profile-section').hidden = !provider;
  $('#market-customer-summary').hidden = provider;
  $('#market-requests-intro').textContent = provider ? 'Responda aos pedidos, envie propostas e registre suas entregas.' : 'Confira suas propostas, pagamentos e entregas.';
  const sellers = Array.isArray(session.sellers) ? session.sellers : [];
  $('#market-seller-select-form').hidden = !provider || sellers.length < 2;
  const select = $('#market-seller-select'); select.replaceChildren();
  for (const seller of sellers) { const option = node('option', seller.name); option.value = seller.id; option.selected = seller.id === session.seller?.id; select.append(option); }
  $('#market-connect').disabled = !state.paymentsEnabled || !session.seller;
  status($('#market-connect-status'), state.paymentsEnabled ? '' : 'A configuração de recebimentos ainda não está disponível.');
  if (provider && !session.seller) status($('#market-profile-load-status'), sellers.length > 1 ? 'Escolha acima o perfil que deseja usar.' : 'Não foi possível localizar seu perfil. Entre novamente ou procure a equipe CONFENGE.', 'error');
}
function configureAuth(mode = state.authMode) {
  state.authMode = mode; const register = mode === 'register';
  const provider = $('#market-auth-form input[name=role]:checked').value === 'provider';
  $('#market-mode-login').setAttribute('aria-pressed', String(!register)); $('#market-mode-register').setAttribute('aria-pressed', String(register));
  $('#market-auth-heading').textContent = register ? 'Crie sua conta' : 'Entre para continuar';
  $('#market-auth-submit').textContent = register ? 'Criar conta' : 'Entrar';
  $('#market-register-fields').hidden = !register;
  for (const input of $('#market-register-fields').querySelectorAll('input')) { const active = register && (input.name !== 'name' || provider); input.disabled = !active; input.required = active; }
  $('#market-register-name').hidden = !register || !provider;
  $('#market-register-consent').hidden = !register;
  const consent = $('#market-register-consent input'); consent.disabled = !register; consent.required = register;
  $('#market-password').minLength = register ? 12 : 1; $('#market-password').autocomplete = register ? 'new-password' : 'current-password';
  $('#market-password-hint').hidden = !register;
  status($('#market-auth-form [data-form-status]'));
}

async function loadProviders(offset = 0) {
  if (!state.enabled) return;
  const sequence = ++state.searchSequence; state.searchController?.abort(); state.searchController = new AbortController();
  state.query = $('#market-query').value.trim(); state.offset = offset;
  $('#market-search-form').setAttribute('aria-busy', 'true'); $('#market-search-form button').disabled = true;
  $('#market-provider-list').replaceChildren(); $('#market-pagination').replaceChildren(); $('#market-result-count').textContent = '';
  status($('#market-search-status'), 'Buscando profissionais…');
  try {
    const result = await api('providers', { params: { q: state.query, limit: PAGE_SIZE, offset }, signal: state.searchController.signal });
    if (sequence !== state.searchSequence) return;
    if (!Array.isArray(result.providers) || !Number.isSafeInteger(result.count) || result.count < 0) throw new ApiError('INVALID_UPSTREAM_RESPONSE', 502);
    status($('#market-search-status'));
    $('#market-result-count').textContent = result.count === 1 ? '1 profissional encontrado' : `${result.count.toLocaleString('pt-BR')} profissionais encontrados`;
    if (!result.providers.length) empty($('#market-provider-list'), 'Nenhum perfil neste recorte', state.query ? 'Tente outra especialidade ou um termo mais amplo.' : 'Ainda não há perfis disponíveis para consulta.');
    for (const provider of result.providers) renderProviderCard(provider);
    if (offset > 0 || offset + PAGE_SIZE < result.count) {
      const previous = button('Anterior', () => void loadProviders(Math.max(0, offset - PAGE_SIZE))); previous.disabled = offset === 0;
      const next = button('Próxima', () => void loadProviders(offset + PAGE_SIZE)); next.disabled = offset + PAGE_SIZE >= result.count;
      $('#market-pagination').append(previous, node('span', `Página ${Math.floor(offset / PAGE_SIZE) + 1} de ${Math.max(1, Math.ceil(result.count / PAGE_SIZE))}`), next);
    }
  } catch (error) { if (sequence === state.searchSequence) status($('#market-search-status'), errorMessage(error), 'error'); }
  finally { if (sequence === state.searchSequence) { $('#market-search-form').removeAttribute('aria-busy'); $('#market-search-form button').disabled = false; } }
}
function renderProviderCard(provider) {
  if (!provider || typeof provider.id !== 'string' || typeof provider.name !== 'string') return;
  const card = node('article', null, 'market-provider-card');
  const details = node('div'); details.append(node('h3', provider.name), node('p', [locationLabel(provider.profile), modalityLabel(provider.profile)].filter(Boolean).join(' · '), 'market-small'));
  if (provider.description) details.append(node('p', provider.description.length > 240 ? `${provider.description.slice(0, 237)}…` : provider.description));
  const list = node('ul', null, 'market-specialty-list');
  for (const value of provider.profile?.specialties || []) if (INTENT_NAMES.has(value)) list.append(node('li', INTENT_NAMES.get(value)));
  if (list.children.length) details.append(list);
  const actions = node('div', null, 'market-provider-actions'); actions.append(node('span', ratingLabel(provider), 'market-rating'), button('Ver perfil', event => void showProvider(provider.id, event.currentTarget)));
  card.append(details, actions); $('#market-provider-list').append(card);
}
async function showProvider(id, trigger) {
  await busy(trigger, async () => {
    status($('#market-search-status'), 'Abrindo perfil…');
    try {
      const data = await api('provider', { params: { id } });
      if (!data.provider || data.provider.id !== id) throw new ApiError('INVALID_UPSTREAM_RESPONSE', 502);
      state.provider = data.provider; renderProviderDetail(data.provider);
      $('#market-search-view').hidden = true; $('#market-provider-view').hidden = false; $('#market-request-entry').hidden = true;
      status($('#market-search-status')); $('#market-provider-name').focus();
    } catch (error) { status($('#market-search-status'), errorMessage(error), 'error'); }
  });
}
function renderProviderDetail(provider) {
  const detail = $('#market-provider-detail'); detail.replaceChildren();
  const title = node('h2', provider.name); title.id = 'market-provider-name'; title.tabIndex = -1;
  detail.append(title, node('p', ratingLabel(provider), 'market-rating'));
  if (provider.description) detail.append(node('p', provider.description, 'market-description'));
  const facts = node('dl', null, 'market-profile-facts');
  const rows = [['Local', locationLabel(provider.profile)], ['Atendimento', modalityLabel(provider.profile) || 'A combinar na proposta']];
  const specialties = (provider.profile?.specialties || []).map(id => INTENT_NAMES.get(id)).filter(Boolean);
  if (specialties.length) rows.push(['Áreas de atuação', specialties.join('; ')]);
  if (provider.profile?.registration) rows.push(['Registro informado', [provider.profile.registration_board, provider.profile.registration].filter(Boolean).join(' ')]);
  for (const [label, value] of rows) facts.append(node('dt', label), node('dd', value));
  detail.append(facts);
  const links = node('div', null, 'market-profile-links');
  for (const [label, value] of [['Site profissional', provider.website_url], ['Ver portfólio', provider.profile?.portfolio_url]]) { const link = externalLink(label, value); if (link) links.append(link); }
  if (links.children.length) detail.append(links);
  detail.append(node('h3', 'Avaliações de serviços contratados'));
  const reviews = (Array.isArray(provider.reviews) ? provider.reviews : []).filter(review => Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5);
  if (!reviews.length) detail.append(node('p', 'Ainda não há avaliações publicadas.', 'market-small'));
  else {
    const list = node('ul', null, 'market-review-list');
    for (const review of reviews) { const item = node('li'); item.append(node('strong', `${review.rating} de 5`)); if (review.created_at) item.append(node('span', ` · ${dateLabel(review.created_at)}`, 'market-small')); if (review.note) item.append(node('p', review.note)); list.append(item); }
    detail.append(list);
  }
}
function startRequest() {
  if (!state.provider) return;
  state.pendingRequest = true; $('#market-request-entry').hidden = false;
  $('#market-request-recipient').textContent = `Pedido destinado a ${state.provider.name}.`;
  const specialtyIds = new Set(Array.isArray(state.provider.profile?.specialties) ? state.provider.profile.specialties : []);
  const selectedIntent = $('#market-request-intent').value;
  const blank = node('option', 'Selecione'); blank.value = ''; $('#market-request-intent').replaceChildren(blank);
  for (const [value, text] of INTENTS) if (specialtyIds.has(value)) {
    const option = node('option', text); option.value = value; option.selected = value === selectedIntent; $('#market-request-intent').append(option);
  }
  renderSession();
  if (state.session.authenticated && state.session.role === 'provider') {
    $('#market-request-signin p').textContent = 'Você está em uma conta profissional. Entre com uma conta de cliente para pedir uma proposta.';
    $('#market-request-login').textContent = 'Acessar minha conta';
  } else { $('#market-request-signin p').textContent = 'Entre como cliente para enviar o pedido e acompanhar a resposta do profissional.'; $('#market-request-login').textContent = 'Entrar ou criar conta'; }
  $('#market-request-entry').scrollIntoView({ block: 'start', behavior: 'auto' });
}
async function loadProfile() {
  const session = state.session;
  if (!state.enabled || !session.authenticated || session.role !== 'provider' || !session.seller) return;
  const epoch = state.epoch, sequence = ++state.profileSequence;
  status($('#market-profile-load-status'), 'Carregando seu perfil…'); $('#market-profile-form > fieldset').disabled = true;
  try {
    const data = await api('vendor-profile');
    if (epoch !== state.epoch || sequence !== state.profileSequence) return;
    if (!data.provider || data.provider.id !== session.seller.id) throw new ApiError('INVALID_UPSTREAM_RESPONSE', 502);
    populateProfile(data.provider); state.profileLoaded = true; $('#market-profile-form > fieldset').disabled = false; status($('#market-profile-load-status'));
  } catch (error) { if (epoch !== state.epoch || sequence !== state.profileSequence) return; status($('#market-profile-load-status'), errorMessage(error), 'error'); expireSession(error); }
}
function populateProfile(provider) {
  const form = $('#market-profile-form'), profile = provider.profile || {};
  for (const key of ['name','description','website_url','phone']) form.elements.namedItem(key).value = provider[key] || '';
  for (const key of ['city','uf','registration','registration_board','portfolio_url']) form.elements.namedItem(key).value = profile[key] || (key === 'registration_board' ? 'CREA' : '');
  for (const key of ['modalities','specialties']) for (const input of form.querySelectorAll(`input[name="${key}"]`)) input.checked = Array.isArray(profile[key]) && profile[key].includes(input.value);
  form.elements.namedItem('consent').checked = false;
  showProfileVisibility(provider);
}
function showProfileVisibility(provider) {
  status($('#market-profile-visibility'), provider.verified === true ? 'Seu perfil está disponível para consulta na busca.' : provider.verified === false ? 'Seu perfil está aguardando a conferência dos dados profissionais para aparecer na busca.' : 'A publicação do perfil depende da conferência dos dados profissionais.');
}
async function loadRequests() {
  const epoch = state.epoch, sequence = ++state.requestSequence;
  $('#market-request-list').replaceChildren(); status($('#market-requests-status'));
  renderSession();
  if (!state.enabled || !state.session.authenticated) return;
  if (state.session.role === 'provider' && !state.session.seller) { status($('#market-requests-status'), 'Selecione o perfil profissional na sua conta para consultar os pedidos.'); return; }
  status($('#market-requests-status'), 'Carregando contratações…');
  try {
    const data = await api('requests');
    if (epoch !== state.epoch || sequence !== state.requestSequence) return;
    if (!Array.isArray(data.requests)) throw new ApiError('INVALID_UPSTREAM_RESPONSE', 502);
    status($('#market-requests-status'));
    if (!data.requests.length) empty($('#market-request-list'), 'Nenhuma contratação por enquanto', state.session.role === 'provider' ? 'Os pedidos enviados ao seu perfil aparecerão aqui.' : 'Escolha um profissional e envie o primeiro pedido de proposta.', false);
    for (const request of data.requests) renderRequest(request);
    if (Number.isSafeInteger(data.count) && data.count > data.requests.length) status($('#market-requests-status'), `Exibindo ${data.requests.length} de ${data.count} contratações. Procure a equipe CONFENGE para consultar registros anteriores.`);
  } catch (error) { if (epoch !== state.epoch || sequence !== state.requestSequence) return; status($('#market-requests-status'), errorMessage(error), 'error'); expireSession(error); }
}
function inputField(labelText, name, { type = 'text', required = true, value = '', maxLength, minLength, placeholder, rows } = {}) {
  const label = node('label', labelText); const input = node(rows ? 'textarea' : 'input');
  if (!rows) input.type = type; else input.rows = rows;
  input.name = name; input.required = required; input.value = value;
  if (maxLength) input.maxLength = maxLength; if (minLength) input.minLength = minLength; if (placeholder) input.placeholder = placeholder;
  label.append(input); return label;
}
function consentField(text) { const label = node('label', null, 'market-check'); const input = node('input'); input.type = 'checkbox'; input.name = 'confirmed'; input.required = true; label.append(input, node('span', text)); return label; }
function requestForm(card, request, action, heading, label, fields, payload) {
  const section = node('section', null, 'market-request-action'); section.append(node('h4', heading));
  const form = node('form', null, 'market-form'); form.method = 'post'; form.action = API; form.dataset.action = action; form.dataset.requestId = request.id;
  const fieldset = node('fieldset'); for (const field of fields) fieldset.append(field);
  const submit = node('button', label, 'button button-primary'); submit.type = 'submit'; fieldset.append(submit);
  const output = node('p', null, 'market-status'); output.dataset.formStatus = ''; output.setAttribute('role', 'status'); output.setAttribute('aria-live', 'polite'); output.hidden = true;
  form.append(fieldset, output); section.append(form); card.append(section);
  wireForm(form, async (values, result) => {
    const epoch = state.epoch;
    const extras = payload(values);
    await api('request-action', { method: 'POST', body: { id: request.id, action, ...extras } });
    if (epoch !== state.epoch) return;
    status(result, 'Alteração confirmada.', 'success'); notice({ quote: 'Proposta enviada. O cliente poderá conferir e aceitar.', accept: 'Proposta aceita. Confira a etapa de pagamento na contratação.', deliver: 'Entrega registrada. O cliente poderá conferir o serviço.', complete: 'Conclusão registrada. Você já pode avaliar o serviço.', cancel: 'Cancelamento registrado.', review: 'Avaliação registrada. Obrigado por compartilhar sua experiência.' }[action]);
    await loadRequests();
  });
  return form;
}
function proposalProvider(request) {
  const provider = request.proposal?.provider;
  return provider && provider.id === request.seller_id && typeof provider.name === 'string' && provider.name.trim()
    && ['CREA','CAU'].includes(provider.registration_board) && typeof provider.registration === 'string' && provider.registration.trim() ? provider : null;
}
function renderRequest(request) {
  if (!request || typeof request.id !== 'string') return;
  const card = node('article', null, 'market-request-card'); card.dataset.requestId = request.id;
  const header = node('header'); header.append(node('h3', request.title || 'Solicitação de serviço'), node('span', STATUS_LABELS[request.status] || 'Consultar situação', 'market-state')); card.append(header);
  card.append(node('p', `Protocolo ${request.id}${Number.isSafeInteger(request.revision) ? ` · Revisão ${request.revision}` : ''}`, 'market-request-reference'));
  card.append(node('p', [INTENT_NAMES.get(request.intent_family), request.location, request.created_at ? `Enviado em ${dateLabel(request.created_at)}` : null].filter(Boolean).join(' · '), 'market-request-meta'));
  const details = node('details'); details.append(node('summary', 'Ver pedido original'), node('p', request.description || 'Descrição não disponível.')); card.append(details);
  const providerAtQuote = proposalProvider(request);
  if (!providerAtQuote) {
    const who = node('div', null, 'market-request-provider');
    if (typeof request.seller_id === 'string') who.append(button('Consultar perfil do prestador', event => {
      openTab('search', true); $('#market-search-view').hidden = false; $('#market-provider-view').hidden = true;
      void showProvider(request.seller_id, event.currentTarget);
    }, 'market-text-button'));
    else who.append(node('p', 'Identificação do profissional não disponível.', 'market-request-reference'));
    card.append(who);
  }
  if (request.proposal) {
    const proposal = node('section', null, 'market-proposal'); proposal.append(node('h4', 'Proposta'));
    if (providerAtQuote) {
      const identity = node('dl', null, 'market-profile-facts market-contract-identity');
      identity.append(node('dt', 'Profissional da proposta'), node('dd', providerAtQuote.name), node('dt', 'Registro informado'), node('dd', `${providerAtQuote.registration_board} ${providerAtQuote.registration}`)); proposal.append(identity);
    }
    proposal.append(node('p', money(request.proposal.amount_cents), 'market-price'), node('p', `Prazo: ${dateLabel(request.proposal.deadline)}`), node('p', request.proposal.scope || 'Escopo não disponível.')); card.append(proposal);
    const fee = request.proposal.fee_cents, amount = request.proposal.amount_cents, bps = request.proposal.commission_bps;
    if (state.session.role === 'provider' && Number.isSafeInteger(amount) && Number.isSafeInteger(fee) && fee >= 0 && fee <= amount && Number.isInteger(bps) && bps >= 0 && bps <= 5000) {
      proposal.append(node('p', `Comissão CONFENGE prevista nesta proposta: ${money(fee)} (${commissionLabel(bps)}). Valor do profissional após essa comissão: ${money(amount - fee)}, antes de outras tarifas e tributos aplicáveis.`, 'market-small'));
    }
  }
  if (request.delivery?.note) { const delivery = node('section', null, 'market-proposal'); delivery.append(node('h4', 'Entrega do profissional'), node('p', request.delivery.note)); card.append(delivery); }
  if (request.review) { const review = node('section', null, 'market-proposal'); review.append(node('h4', state.session.role === 'provider' ? 'Avaliação do cliente' : 'Sua avaliação'), node('p', `${request.review.rating} de 5`)); if (request.review.note) review.append(node('p', request.review.note)); card.append(review); }
  const provider = state.session.role === 'provider';
  if (provider && ['requested','quoted'].includes(request.status)) {
    if (state.commissionBps === null) card.append(node('p', 'O envio de propostas estará disponível após a definição das condições comerciais. Converse com a equipe CONFENGE para continuar.', 'market-status'));
    else {
      const expectedCommissionBps = state.commissionBps;
      const amount = inputField('Valor total (R$)', 'amount', { value: editableMoney(request.proposal?.amount_cents), placeholder: '2.500,00', maxLength: 20 }); amount.querySelector('input').inputMode = 'decimal';
      const commission = node('p', null, 'market-small'); commission.setAttribute('aria-live', 'polite');
      const updateCommission = () => { try { commission.textContent = quoteAmounts(parseMoney(amount.querySelector('input').value), expectedCommissionBps); } catch { commission.textContent = `A comissão CONFENGE é de ${commissionLabel(expectedCommissionBps)} sobre o valor total. Preencha o valor para conferir a parcela do profissional. Outras tarifas e tributos podem ser aplicáveis.`; } };
      amount.querySelector('input').addEventListener('input', updateCommission); updateCommission();
      const deadline = inputField('Data prevista de entrega', 'deadline', { type: 'date', value: request.proposal?.deadline?.slice(0, 10) || '' }); deadline.querySelector('input').min = new Date().toISOString().slice(0, 10);
      requestForm(card, request, 'quote', request.status === 'quoted' ? 'Atualizar a proposta' : 'Preparar proposta', request.status === 'quoted' ? 'Enviar proposta atualizada' : 'Enviar proposta', [amount, commission,
        inputField('Escopo, entregáveis e condições', 'scope', { value: request.proposal?.scope || '', rows: 5, minLength: 30, maxLength: 6000 }), deadline,
        consentField(`Concordo com o escopo, o valor e o prazo desta proposta e com a comissão CONFENGE de ${commissionLabel(expectedCommissionBps)}.`)],
        values => ({ amount_cents: parseMoney(textValue(values, 'amount')), scope: textValue(values, 'scope'), deadline: requireDate(textValue(values, 'deadline')), expected_commission_bps: expectedCommissionBps }));
    }
  }
  if (!provider && request.status === 'quoted') {
    const revision = request.revision;
    if (!providerAtQuote || !Number.isSafeInteger(revision) || revision < 0 || !Number.isSafeInteger(request.proposal?.amount_cents) || !request.proposal?.scope || !request.proposal?.deadline) card.append(node('p', 'Atualize a contratação para conferir a proposta completa, com a identificação e o registro do profissional, antes do aceite.', 'market-status'));
    else requestForm(card, request, 'accept', 'Aceitar esta proposta', 'Aceitar proposta', [consentField('Li e concordo com o escopo, o valor, o prazo e as condições desta proposta.')], () => ({ revision }));
  }
  if (!provider && request.status === 'accepted') {
    const area = node('section', null, 'market-request-action'); area.append(node('h4', 'Pagamento do serviço'));
    const output = node('p', null, 'market-status'); output.setAttribute('role','status'); output.hidden = true;
    if (state.paymentsEnabled) { const pay = button('Continuar para o pagamento', event => void redirectPayment('checkout', { id: request.id }, event.currentTarget, output), 'button button-primary'); area.append(node('p', 'Confira o valor no ambiente de pagamento. A confirmação aparecerá nesta contratação após o processamento.'), node('p', 'A parcela do profissional é encaminhada após a cobrança, sem aguardar a conclusão do serviço. O crédito em conta bancária segue os prazos do parceiro de pagamentos.', 'market-small'), pay, output); }
    else area.append(node('p', 'O pagamento online ainda não está disponível. Sua proposta aceita permanece registrada.'));
    card.append(area);
  }
  if (provider && request.status === 'paid') requestForm(card, request, 'deliver', 'Registrar a entrega', 'Enviar entrega ao cliente', [inputField('O que foi entregue e como acessar os arquivos', 'note', { rows: 4, minLength: 10, maxLength: 1000, placeholder: 'Descreva a entrega e informe o endereço de acesso aos documentos, quando houver.' })], values => ({ note: textValue(values, 'note') }));
  if (!provider && request.status === 'delivered') requestForm(card, request, 'complete', 'Conferência da entrega', 'Confirmar conclusão do serviço', [consentField('Conferi a entrega e confirmo a conclusão do serviço contratado.')], () => ({}));
  if (!provider && request.status === 'completed' && !request.review) {
    const label = node('label', 'Como você avalia este serviço?'); const select = node('select'); select.name = 'rating'; select.required = true;
    const blank = node('option', 'Selecione uma nota'); blank.value = ''; select.append(blank);
    for (const [value, text] of [[5,'5 · Excelente'],[4,'4 · Bom'],[3,'3 · Regular'],[2,'2 · Ruim'],[1,'1 · Muito ruim']]) { const option = node('option', text); option.value = String(value); select.append(option); }
    label.append(select);
    requestForm(card, request, 'review', 'Avalie o serviço concluído', 'Enviar avaliação', [label, node('p', 'Seu comentário ficará público no perfil do profissional. Conte como foi o serviço e evite dados de contato, endereços e informações pessoais.', 'market-small'), inputField('Seu comentário', 'note', { rows: 3, minLength: 10, maxLength: 300 })], values => ({ rating: Number(values.get('rating')), note: textValue(values, 'note') }));
  }
  if (['requested','quoted','accepted'].includes(request.status) && !request.payment) {
    const cancel = node('details'); cancel.append(node('summary', 'Cancelar esta solicitação'));
    requestForm(cancel, request, 'cancel', 'Cancelamento', 'Confirmar cancelamento', [consentField('Confirmo o cancelamento desta solicitação de serviço.')], () => ({})); card.append(cancel);
  }
  if (['paid','delivered','disputed'].includes(request.status) || (request.status === 'accepted' && request.payment)) { const paragraph = node('p', 'Precisa tratar uma revisão, cancelamento ou desacordo? ', 'market-small'); const link = node('a', 'Converse com a equipe CONFENGE.'); link.href = '/triagem-tecnica/'; paragraph.append(link); card.append(paragraph); }
  $('#market-request-list').append(card);
}
async function redirectPayment(op, body, trigger, output) {
  if (!state.paymentsEnabled) { status(output, ERRORS.PAYMENTS_DISABLED, 'error'); return; }
  const epoch = state.epoch;
  let blockRetry = false;
  await busy(trigger, async () => {
    status(output, op === 'checkout' ? 'Preparando o pagamento…' : 'Preparando a configuração de recebimentos…');
    try {
      const result = await api(op, { method: 'POST', body });
      if (epoch !== state.epoch) return;
      const destination = new URL(result.url);
      if (destination.protocol !== 'https:' || destination.username || destination.password || destination.port || destination.hostname !== (op === 'checkout' ? 'checkout.stripe.com' : 'connect.stripe.com')) throw new ApiError('INVALID_UPSTREAM_RESPONSE', 502);
      window.location.assign(destination.href);
    } catch (error) {
      status(output, errorMessage(error), 'error'); expireSession(error);
      if (error.code === 'PAYMENT_RECONCILIATION_REQUIRED') {
        blockRetry = true; const link = node('a', ' Falar com a equipe CONFENGE.'); link.href = '/triagem-tecnica/'; output.append(link);
      }
    }
  });
  if (blockRetry && trigger.isConnected) { trigger.disabled = true; trigger.textContent = 'Pagamento em conferência'; }
}
async function bootstrap() {
  $('#market-retry').disabled = true; $('#market-workbench').hidden = true; $('#market-availability').hidden = false; $('#market-unavailable-actions').hidden = true;
  $('#market-availability-message').textContent = 'Verificando a disponibilidade dos cadastros e contratações…';
  try {
    const config = await api('config');
    state.enabled = config.enabled === true && (!config.terms_version || config.terms_version === TERMS_VERSION);
    state.paymentsEnabled = state.enabled && config.paymentsEnabled === true;
    state.commissionBps = Number.isInteger(config.commission_bps) && config.commission_bps >= 0 && config.commission_bps <= 5000 ? config.commission_bps : null;
    if (!state.enabled) throw new ApiError('MARKETPLACE_UNAVAILABLE', 503);
    $('#market-provider-entry').disabled = false; $('#market-availability').hidden = true; $('#market-workbench').hidden = false;
    try { setSession(await api('session')); }
    catch (error) { setSession({ authenticated: false }); if (error.code !== 'AUTH_REQUIRED') notice('Não foi possível consultar sua conta. Você pode tentar entrar novamente.', 'error'); }
    await loadProviders(0); openTab(state.activeTab);
    const result = new URLSearchParams(window.location.search).get('payment');
    if (result === 'return' || result === 'success') { notice('Você voltou do pagamento. Consulte a situação atual da contratação.'); openTab('requests'); }
    else if (result === 'cancel') { notice('O pagamento não foi concluído nesta visita. Confira a contratação antes de tentar novamente.', 'info'); openTab('requests'); }
    else if (window.location.hash === '#minha-conta') openTab('account');
    // Returning from a payment provider never changes the service/payment state.
  } catch {
    state.enabled = false; state.paymentsEnabled = false; state.commissionBps = null; $('#market-provider-entry').disabled = true; $('#market-workbench').hidden = true;
    $('#market-availability-message').textContent = 'O cadastro e as contratações ainda não estão disponíveis nesta página. Para conversar sobre o seu projeto, solicite atendimento à equipe CONFENGE.';
    $('#market-unavailable-actions').hidden = false;
  } finally { $('#market-retry').disabled = false; }
}

for (const [value, text] of INTENTS) {
  const option = node('option', text); option.value = value; $('#market-request-intent').append(option);
  const label = node('label'); const input = node('input'); input.type = 'checkbox'; input.name = 'specialties'; input.value = value; label.append(input, node('span', text)); $('#market-specialties').append(label);
}
for (const uf of UFS) { const option = node('option', uf); option.value = uf; $('#market-profile-uf').append(option); }
for (const tab of document.querySelectorAll('[data-market-tab]')) tab.addEventListener('click', () => openTab(tab.dataset.marketTab));
$('.market-tabs').addEventListener('keydown', event => {
  const tabs = [...document.querySelectorAll('[data-market-tab]')], current = tabs.indexOf(document.activeElement);
  if (current < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  openTab(tabs[next].dataset.marketTab, true);
});
for (const trigger of document.querySelectorAll('[data-market-open]')) trigger.addEventListener('click', () => openTab(trigger.dataset.marketOpen, true));
$('#market-provider-entry').addEventListener('click', () => { if (!state.session.authenticated) { $('#market-auth-form input[value=provider]').checked = true; configureAuth('register'); } openTab('account', true); });
$('#market-mode-login').addEventListener('click', () => configureAuth('login'));
$('#market-mode-register').addEventListener('click', () => configureAuth('register'));
for (const role of document.querySelectorAll('#market-auth-form input[name=role]')) role.addEventListener('change', () => configureAuth());
$('#market-retry').addEventListener('click', () => void bootstrap());
$('#market-search-form').addEventListener('submit', event => { event.preventDefault(); if (state.enabled) void loadProviders(0); });
$('#market-back-search').addEventListener('click', () => { $('#market-provider-view').hidden = true; $('#market-search-view').hidden = false; state.pendingRequest = false; $('#market-query').focus(); });
$('#market-request-start').addEventListener('click', startRequest);
$('#market-request-login').addEventListener('click', () => { if (!state.session.authenticated) { $('#market-auth-form input[value=customer]').checked = true; configureAuth(); } openTab('account', true); });
$('#market-refresh-requests').addEventListener('click', event => void busy(event.currentTarget, loadRequests));
$('#market-connect').addEventListener('click', event => void redirectPayment('connect', {}, event.currentTarget, $('#market-connect-status')));
$('#market-logout').addEventListener('click', event => {
  void busy(event.currentTarget, async () => { try { await api('logout', { method: 'POST', body: {} }); setSession({ authenticated: false }); notice('Você saiu da conta.'); configureAuth('login'); } catch (error) { notice(errorMessage(error), 'error'); } });
});
wireForm($('#market-auth-form'), async (values, output) => {
  const body = { role: textValue(values, 'role'), email: textValue(values, 'email'), password: String(values.get('password') || '') };
  if (state.authMode === 'register') Object.assign(body, { first_name: textValue(values, 'first_name'), last_name: textValue(values, 'last_name'), ...(body.role === 'provider' ? { name: textValue(values, 'name') } : {}), consent: values.get('consent') === 'on', terms_version: TERMS_VERSION });
  let data;
  try { data = await api(state.authMode, { method: 'POST', body }); }
  catch (error) { if (error.code === 'AUTH_REQUIRED') throw new FormError('Não foi possível confirmar o acesso. Confira o tipo de conta, o e-mail e a senha.'); throw error; }
  if (!data.authenticated) throw new ApiError('INVALID_UPSTREAM_RESPONSE', 502);
  setSession(data); status(output); notice('Acesso confirmado.');
  if (state.pendingRequest && data.role === 'customer') { openTab('search'); startRequest(); }
  else openTab('account');
});
wireForm($('#market-seller-select-form'), async (values, output) => { const session = await api('select-seller', { method: 'POST', body: { seller_id: textValue(values, 'seller_id') } }); setSession(session); status(output, 'Perfil selecionado.', 'success'); await loadProfile(); });
wireForm($('#market-profile-form'), async (values, output) => {
  const modalities = values.getAll('modalities').map(String), specialties = values.getAll('specialties').map(String);
  if (!modalities.length) throw new FormError('Escolha pelo menos uma forma de atendimento.');
  if (!specialties.length) throw new FormError('Escolha pelo menos uma área de atuação.');
  if (specialties.length > 8) throw new FormError('Escolha até oito áreas que representem sua atuação profissional.');
  for (const key of ['website_url','portfolio_url']) if (textValue(values, key) && !httpsUrl(textValue(values, key))) throw new FormError('Informe um endereço completo começando por https:// para o site e o portfólio.');
  const epoch = state.epoch;
  const data = await api('vendor-profile', { method: 'POST', body: { name: textValue(values, 'name'), description: textValue(values, 'description'), phone: textValue(values, 'phone'), website_url: textValue(values, 'website_url'),
    profile: { city: textValue(values, 'city'), uf: textValue(values, 'uf'), registration: textValue(values, 'registration'), registration_board: textValue(values, 'registration_board'), modalities, specialties, portfolio_url: textValue(values, 'portfolio_url') }, consent: values.get('consent') === 'on', terms_version: TERMS_VERSION } });
  if (epoch !== state.epoch) return;
  if (!data.provider) throw new ApiError('INVALID_UPSTREAM_RESPONSE', 502);
  state.session.seller = data.provider; $('#market-account-name').textContent = data.provider.name;
  showProfileVisibility(data.provider);
  status(output, 'Perfil salvo. A publicação segue a conferência dos dados profissionais.', 'success');
});
wireForm($('#market-request-form'), async (values, output) => {
  if (!state.provider || state.session.role !== 'customer') throw new ApiError('ACTION_FORBIDDEN', 403);
  const epoch = state.epoch;
  await api('request', { method: 'POST', body: { seller_id: state.provider.id, title: textValue(values, 'title'), description: textValue(values, 'description'), location: textValue(values, 'location'), intent_family: textValue(values, 'intent_family'), consent: values.get('consent') === 'on', terms_version: TERMS_VERSION } });
  if (epoch !== state.epoch) return;
  status(output); $('#market-request-form').reset(); state.pendingRequest = false;
  notice('Pedido de proposta enviado. A resposta aparecerá em Contratações.'); openTab('requests', true);
});
configureAuth(); void bootstrap();
