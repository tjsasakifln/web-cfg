// Account and order data stay in this authenticated area, outside analytics.
// The server's availability and product approvals control every purchase.
const ENDPOINT = '/api/web/project-orders';
const CONTACT = '/projetos-prontos/#contato-projetos';
const TERMS = '/projetos-prontos/condicoes/';
const MONEY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DATE = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const STATES = Object.freeze({ creating: 'Aguardando confirmação do pedido', pending: 'Aguardando pagamento', paid: 'Pagamento confirmado', failed: 'Pagamento recusado', cancelled: 'Pedido cancelado', refunded: 'Pagamento reembolsado', review: 'Em conferência' });
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const textNode = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const link = (text, href, className) => { const node = textNode('a', text, className); node.href = href; return node; };
const button = (text, action, primary = false) => { const node = textNode('button', text, primary ? 'pp-button' : 'po-button'); node.type = 'button'; if (action) node.addEventListener('click', action); return node; };
const dateText = value => { const d = new Date(value); return value && Number.isFinite(d.getTime()) ? DATE.format(d) : 'Ainda não registrado'; };
const centsText = value => Number.isSafeInteger(value) && value >= 0 ? MONEY.format(value / 100) : 'Valor indisponível';
const supplierShape = supplier => supplier && typeof supplier.legalName === 'string' && supplier.legalName.trim() && supplier.registrationType === 'CNPJ' && typeof supplier.registration === 'string' && /^[A-Z0-9]{12}\d{2}$/.test(supplier.registration) && typeof supplier.email === 'string' && /^[^\s@]+@[^\s@]+$/.test(supplier.email) && /^\+55\d{10,11}$/.test(supplier.phone || '') && supplier.address?.country === 'BR' && ['street','number','neighborhood','city'].every(key => typeof supplier.address[key] === 'string' && supplier.address[key].trim()) && /^[A-Z]{2}$/.test(supplier.address.state || '') && /^\d{8}$/.test(supplier.address.postalCode || '');
const supplierRows = supplier => {
  if (!supplierShape(supplier)) return [];
  const address = supplier.address, registration = supplier.registration.replace(/^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  return [['Nome empresarial', supplier.legalName], ['CNPJ', registration], ['Endereço', [address.street, address.number, address.complement, address.neighborhood, `${address.city}/${address.state}`, `CEP ${address.postalCode.replace(/^(\d{5})(\d{3})$/, '$1-$2')}`, 'Brasil'].filter(Boolean).join(', ')], ['E-mail', supplier.email], ['Telefone', supplier.phone]];
};
const publicProduct = product => product && typeof product.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(product.id) && typeof product.title === 'string' && typeof product.version === 'string' && Number.isSafeInteger(product.amountCents) && product.amountCents > 0 && product.currency === 'BRL' && typeof product.terms?.version === 'string' && /^[a-f0-9]{64}$/i.test(product.terms?.sha256 || '') && typeof product.terms?.text === 'string' && product.terms.text.trim().length > 0 && supplierShape(product.terms.supplier);
const orderShape = order => order && UUID.test(order.id || '') && typeof order.productId === 'string' && typeof order.title === 'string' && Number.isSafeInteger(order.amountCents) && order.currency === 'BRL' && Object.hasOwn(STATES, order.status);
const safeCheckout = value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && ['www.mercadopago.com.br', 'mercadopago.com.br', 'www.mercadopago.com'].includes(url.hostname) ? url.href : null; } catch { return null; } };
const knownError = error => ({
  AUTH_REQUIRED: 'Entre na sua conta para continuar.', EMAIL_UNVERIFIED: 'Confirme seu e-mail antes de continuar.',
  PURCHASES_DISABLED: 'As novas compras estão pausadas. Você pode consultar seus pedidos e falar com a equipe.',
  PRODUCT_UNAVAILABLE: 'Este projeto não está disponível para compra. Consulte a equipe.',
  PRODUCT_VERSION_CHANGED: 'As condições deste projeto mudaram. Atualize a página e confira a versão disponível.',
  PROJECT_VERSION_CHANGED: 'As condições deste projeto mudaram. Atualize a página e confira a versão disponível.',
  PROJECT_PURCHASES_PAUSED: 'As novas compras estão pausadas. Você pode consultar seus pedidos e falar com a equipe.',
  PROJECT_UNAVAILABLE: 'Este projeto não está disponível para compra. Consulte a equipe.',
  PROJECT_TERMS_REQUIRED: 'Confira e aceite as condições da versão atual antes de continuar.',
  FEATURE_DISABLED: 'Esta área está indisponível no momento. Use o atendimento abaixo.',
  DELIVERY_PAUSED: 'A entrega está temporariamente indisponível. Solicite atendimento para este pedido.',
  DELIVERY_UNAVAILABLE: 'Não foi possível disponibilizar o arquivo. Solicite atendimento para este pedido.',
  TOO_MANY_REQUESTS: 'Houve muitas tentativas. Aguarde um minuto antes de tentar novamente.',
  ORDER_LIMIT: 'Não foi possível abrir outro pedido agora. Consulte seus pedidos ou fale com o atendimento.',
  SUPPORT_LIMIT: 'Há solicitações recentes para este pedido. Aguarde o atendimento ou entre em contato pelo e-mail abaixo.',
  REQUEST_CONFLICT: 'Esta tentativa já está vinculada a outras condições. Consulte seus pedidos antes de iniciar uma nova compra.',
  PROJECT_COMMERCE_UNAVAILABLE: 'Esta área está temporariamente indisponível. Tente novamente ou use o atendimento abaixo.',
  TERMS_MISMATCH: 'As condições de contratação mudaram. Atualize a página e leia a nova versão antes de continuar.',
  PAYMENT_NOT_CONFIRMED: 'O pagamento ainda não foi confirmado. Atualize a situação do pedido depois de pagar.',
  ORDER_NOT_FOUND: 'Não foi possível localizar este pedido na sua conta.',
  DOWNLOAD_UNAVAILABLE: 'O arquivo ainda não está disponível. Solicite atendimento para este pedido.',
  'auth/invalid-credential': 'Não foi possível entrar com os dados informados. Confira o e-mail e a senha.',
  'auth/wrong-password': 'Não foi possível entrar com os dados informados. Confira o e-mail e a senha.',
  'auth/user-not-found': 'Não foi possível entrar com os dados informados. Confira o e-mail e a senha.',
  'auth/email-already-in-use': 'Não foi possível criar esta conta. Tente entrar ou redefinir a senha.',
  'auth/weak-password': 'Escolha uma senha com pelo menos seis caracteres.',
  'auth/invalid-email': 'Informe um e-mail válido.',
  'auth/too-many-requests': 'Houve muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',
  'auth/network-request-failed': 'A conexão falhou. Verifique sua conexão e tente novamente.',
})[error?.error || error?.code] || 'Não foi possível concluir agora. Tente novamente ou use o atendimento abaixo.';

function field(label, id, type = 'text') {
  const wrapper = textNode('div', undefined, 'po-field'), caption = textNode('label', label), input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  caption.htmlFor = id; input.id = id; input.name = id; if (type !== 'textarea') input.type = type;
  wrapper.append(caption, input); return { wrapper, input };
}
function details(title, content) { const container = textNode('details', undefined, 'po-details'); container.append(textNode('summary', title), content); return container; }
function summaryRows(rows) { const list = textNode('dl', undefined, 'po-meta'); for (const [label, value] of rows) { const item = document.createElement('div'); item.append(textNode('dt', label), textNode('dd', value)); list.append(item); } return list; }
function saveBlob(blob, filename) { const url = URL.createObjectURL(blob), anchor = link('Baixar', url); anchor.download = filename; anchor.hidden = true; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); }

export function createProjectOrders({ root = document.getElementById('project-orders-app'), notice = document.getElementById('project-orders-notice'), fetchImpl = (...args) => fetch(...args), loadAuth = () => import('/assets/tools-commerce/firebase-auth.mjs') } = {}) {
  if (!root || !notice) return null;
  let config, sdk, auth, generation = 0, authBusy = false, unsubscribe;
  const attempts = new Map();
  const showNotice = (text = '', error = false) => { notice.textContent = text; notice.dataset.error = String(error); };
  const panel = (title, focus = false) => { const section = textNode('section', undefined, 'po-panel'), heading = textNode('h2', title); heading.tabIndex = -1; section.append(heading); root.append(section); if (focus) heading.focus({ preventScroll: true }); return section; };
  const startView = () => { generation++; root.replaceChildren(); root.setAttribute('aria-busy', 'false'); };
  const busy = (host, value) => { host.setAttribute('aria-busy', String(value)); host.querySelectorAll('button,input,select,textarea').forEach(item => { item.disabled = value; }); };
  const request = async (op, { method = 'GET', body, id, authenticated = true, binary = false } = {}) => {
    const headers = { Accept: binary ? 'application/zip' : 'application/json' };
    const requestUser = authenticated ? auth?.currentUser : null;
    const checkAccount = () => { if (authenticated && (!requestUser || auth?.currentUser?.uid !== requestUser.uid)) throw { error: 'AUTH_REQUIRED' }; };
    if (authenticated) { checkAccount(); headers.Authorization = `Bearer ${await requestUser.getIdToken()}`; checkAccount(); }
    if (body) headers['Content-Type'] = 'application/json';
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), binary ? 60000 : 20000);
    try {
      const response = await fetchImpl(`${ENDPOINT}?op=${encodeURIComponent(op)}${id ? `&id=${encodeURIComponent(id)}` : ''}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: controller.signal, cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
      if (binary && response.ok) {
        if (!(response.headers.get('content-type') || '').toLowerCase().startsWith('application/zip')) throw new Error('Unexpected delivery type');
        const blob = await response.blob(); checkAccount(); return { blob, disposition: response.headers.get('content-disposition') };
      }
      const data = await response.json().catch(() => ({})); checkAccount(); if (!response.ok) throw Object.assign(new Error('Request failed'), data, { status: response.status }); return data;
    } finally { clearTimeout(timer); }
  };
  const noPurchases = (failed = false) => {
    startView(); const section = panel(failed ? 'Esta área está temporariamente indisponível' : 'Compras online ainda não disponíveis');
    section.append(textNode('p', failed ? 'Não conseguimos consultar esta área agora. Tente novamente ou fale com a equipe.' : 'As compras online ainda não estão disponíveis. Consulte a equipe sobre o projeto para o seu terreno.'));
    const actions = textNode('div', undefined, 'po-actions'); actions.append(link('Consultar disponibilidade', CONTACT, 'pp-button')); if (failed) actions.append(button('Tentar novamente', () => initialize())); section.append(actions);
  };
  const action = async (host, fn) => { busy(host, true); try { await fn(); } catch (error) { showNotice(knownError(error), true); } finally { if (host.isConnected) busy(host, false); } };
  const authView = (focus = false) => {
    startView(); const section = panel('Entre para acessar seus pedidos', focus);
    section.append(textNode('p', 'Use seu e-mail e sua senha. Para comprar ou receber arquivos, o e-mail precisa estar confirmado.'));
    const form = textNode('form', undefined, 'po-form'), email = field('E-mail', 'project-email', 'email'), password = field('Senha', 'project-password', 'password');
    email.input.required = true; email.input.autocomplete = 'email'; email.input.maxLength = 254;
    password.input.required = true; password.input.autocomplete = 'current-password'; password.input.minLength = 6; password.input.maxLength = 128;
    const actions = textNode('div', undefined, 'po-actions'), login = button('Entrar', null, true); login.type = 'submit';
    const create = button('Criar conta', () => { if (!form.reportValidity()) return; const address = email.input.value.trim(), secret = password.input.value; void action(form, async () => {
      authBusy = true; try { const result = await sdk.createUserWithEmailAndPassword(auth, address, secret); await sdk.sendEmailVerification(result.user); showNotice('Conta criada. Enviamos uma mensagem para você confirmar o e-mail.'); } finally { authBusy = false; await render(true); }
    }); });
    const reset = button('Esqueci a senha', () => { if (!email.input.reportValidity()) return; void action(form, async () => { await sdk.sendPasswordResetEmail(auth, email.input.value.trim()); showNotice('Solicitação recebida. Se houver uma conta para esse e-mail, você receberá as instruções de recuperação.'); }); });
    actions.append(login, create, reset); form.append(email.wrapper, password.wrapper, actions);
    form.addEventListener('submit', event => { event.preventDefault(); if (!form.reportValidity()) return; const address = email.input.value.trim(), secret = password.input.value; void action(form, async () => {
      authBusy = true; try { await sdk.signInWithEmailAndPassword(auth, address, secret); showNotice('Acesso realizado.'); } finally { authBusy = false; await render(true); }
    }); });
    section.append(form, textNode('p', 'Criar uma conta não inscreve você em comunicações promocionais.', 'po-support-note'));
  };
  const verificationView = (focus = false) => {
    startView(); const section = panel('Confirme seu e-mail', focus), user = auth.currentUser;
    section.append(textNode('p', user?.email ? `Abra a mensagem de confirmação enviada para ${user.email}. Depois, volte a esta página.` : 'Seu acesso precisa de um e-mail confirmado. Entre com e-mail e senha.'));
    const actions = textNode('div', undefined, 'po-actions');
    actions.append(button('Já confirmei meu e-mail', () => action(section, async () => { await user.reload(); await user.getIdToken(true); if (!user.emailVerified) showNotice('A confirmação ainda não foi reconhecida. Abra o link recebido por e-mail e tente novamente.', true); else showNotice('E-mail confirmado.'); await render(true); }), true));
    actions.append(button('Reenviar confirmação', () => action(section, async () => { await sdk.sendEmailVerification(user); showNotice('Enviamos uma nova mensagem de confirmação.'); })), button('Sair', () => action(section, async () => { showNotice(); await sdk.signOut(auth); })));
    section.append(actions);
  };
  const attemptKey = product => `confenge-project-request:${auth.currentUser.uid}:${product.id}:${product.version}:${product.terms.sha256}`;
  const attemptId = product => { const key = attemptKey(product); let id = attempts.get(key); try { id ||= sessionStorage.getItem(key); } catch {} if (!UUID.test(id || '')) id = crypto.randomUUID(); attempts.set(key, id); try { sessionStorage.setItem(key, id); } catch {} return id; };
  const clearAttempt = product => { const key = attemptKey(product); attempts.delete(key); try { sessionStorage.removeItem(key); } catch {} };
  const productView = (product, existingOrders = []) => {
    const section = panel(product.title); section.dataset.productId = product.id;
    section.append(textNode('p', product.description || ''), textNode('p', centsText(product.amountCents), 'po-price'), textNode('p', `Versão ${product.version}. Licença e documentos conforme as condições abaixo.`));
    const specifications = [];
    if (Number.isFinite(product.areaM2)) specifications.push(['Área construída', `${new Intl.NumberFormat('pt-BR').format(product.areaM2)} m²`]);
    if (Number.isSafeInteger(product.floors)) specifications.push(['Pavimentos', String(product.floors)]);
    if (typeof product.dimensions === 'string') specifications.push(['Dimensões consideradas', product.dimensions]);
    if (typeof product.deliveryTime === 'string') specifications.push(['Disponibilização', product.deliveryTime]);
    if (specifications.length) section.append(summaryRows(specifications));
    const scope = document.createElement('div');
    for (const [label, values] of [['Ambientes', product.programme], ['Documentos', product.documents], ['Formatos', product.formats], ['Incluído', product.included], ['Não incluído', product.excluded]]) {
      if (!Array.isArray(values) || !values.length || !values.every(value => typeof value === 'string')) continue;
      scope.append(textNode('h3', label)); const list = document.createElement('ul'); values.forEach(value => list.append(textNode('li', value))); scope.append(list);
    }
    for (const [label, value] of [['Condições do terreno', product.terrainConditions], ['Licença', product.license], ['Nova implantação', product.reuseRule], ['Correções', product.corrections], ['Alterações', product.changes], ['Responsabilidades', product.responsibilities], ['Atendimento', product.support]]) {
      if (typeof value === 'string' && value) scope.append(textNode('h3', label), textNode('p', value));
    }
    if (scope.childNodes.length) section.append(details('Conferir o escopo e os arquivos incluídos', scope));
    const supplier = textNode('section', undefined, 'po-supplier'); supplier.append(textNode('h3', 'Fornecedor'), summaryRows(supplierRows(product.terms.supplier))); section.append(supplier);
    section.append(details('Ler as condições desta compra', textNode('div', product.terms.text, 'po-terms')));
    const activeOrder = existingOrders.find(order => order.productId === product.id && ['creating', 'pending', 'review'].includes(order.status));
    if (activeOrder) {
      section.append(textNode('p', 'Você já tem uma solicitação em andamento para este projeto. Confira a situação do pedido antes de iniciar outra compra.'));
      section.append(link('Consultar pedido em andamento', `#project-order-${activeOrder.id}`, 'po-button'));
      return section;
    }
    const form = document.createElement('form'), row = textNode('div', undefined, 'po-choice'), check = document.createElement('input'), label = document.createElement('label');
    check.type = 'checkbox'; check.required = true; check.id = `project-accept-${product.id}`; label.htmlFor = check.id; label.textContent = `Li e aceito as condições de aquisição, versão ${product.terms.version}, e o escopo desta licença.`; row.append(check, label);
    const submit = button('Continuar para o pagamento', null, true); submit.type = 'submit'; const actions = textNode('div', undefined, 'po-actions'); actions.append(submit); form.append(row, actions);
    form.addEventListener('submit', event => { event.preventDefault(); if (!form.reportValidity()) return; void action(form, async () => {
      let order;
      try { order = await request('orders', { method: 'POST', body: { productId: product.id, productVersion: product.version, requestId: attemptId(product), termsVersion: product.terms.version, termsHash: product.terms.sha256, acceptedTerms: true } }); }
      catch (error) { showNotice(error?.status >= 400 && error.status < 500 ? knownError(error) : 'Não recebemos a confirmação do pedido. Atualize seus pedidos antes de tentar novamente. A nova tentativa nesta página preserva a mesma solicitação.', true); return; }
      if (!orderShape(order)) { showNotice('A confirmação recebida está incompleta. Atualize seus pedidos ou solicite atendimento antes de iniciar outra compra.', true); return; }
      if (!['review', 'creating'].includes(order.status)) clearAttempt(product);
      showNotice(order.status === 'review' || order.status === 'creating' ? 'A solicitação está em conferência. Aguarde a confirmação do pedido antes de pagar.' : 'Pedido registrado. Consulte as instruções e a situação abaixo.'); await render(true, order.id);
    }); });
    section.append(form); return section;
  };
  const paymentView = order => {
    const payment = order.payment; if (order.status !== 'pending' || !payment) return null;
    const box = textNode('section', undefined, 'po-payment'); box.append(textNode('h3', 'Pagamento por Pix'));
    box.append(textNode('p', 'Use o QR Code ou o código Pix abaixo. Depois de pagar, atualize a situação do pedido. Os arquivos ficam disponíveis quando o pagamento for confirmado.'));
    if (typeof payment.qrImage === 'string' && /^[A-Za-z0-9+/=]+$/.test(payment.qrImage) && payment.qrImage.length < 2000000) { const img = document.createElement('img'); img.className = 'po-qr'; img.width = 220; img.height = 220; img.alt = 'QR Code Pix deste pedido'; img.src = `data:image/png;base64,${payment.qrImage}`; box.append(img); }
    if (typeof payment.qrCode === 'string' && payment.qrCode.length <= 10000) {
      const code = field('Código Pix para copiar', `pix-${order.id}`, 'textarea'); code.input.value = payment.qrCode; code.input.readOnly = true; box.append(code.wrapper);
      box.append(button('Copiar código Pix', async () => { try { await navigator.clipboard.writeText(payment.qrCode); showNotice('Código Pix copiado. Confira o valor e o recebedor no aplicativo do banco antes de confirmar.'); } catch { code.input.focus(); code.input.select(); showNotice('Selecione e copie o código Pix acima.'); } }));
    }
    const checkout = safeCheckout(payment.checkoutUrl); if (checkout) { const destination = link('Abrir pagamento no Mercado Pago', checkout, 'po-button'); destination.target = '_blank'; destination.rel = 'noopener noreferrer'; box.append(destination); }
    if (payment.expiresAt) box.append(textNode('p', `Validade do pagamento: ${dateText(payment.expiresAt)}.`, 'po-support-note'));
    return box;
  };
  const download = (order, host) => action(host, async () => {
    const delivery = await request('download', { id: order.id, binary: true });
    if (!delivery.blob.size) throw new Error('Empty delivery');
    const safeName = `${order.productId}-${order.deliveryVersion || order.productVersion}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0,120);
    saveBlob(delivery.blob, `confenge-projeto-${safeName}.zip`); showNotice('Arquivo preparado para download. Confira a pasta de downloads do seu navegador.');
  });
  const supportView = order => {
    const form = textNode('form', undefined, 'po-form'), kindBox = textNode('div', undefined, 'po-field'), kindLabel = textNode('label', 'Como podemos ajudar?'), kind = document.createElement('select');
    kind.id = `support-kind-${order.id}`; kindLabel.htmlFor = kind.id; for (const [value, title] of [['support','Dúvida ou problema com o pedido'],['cancellation','Solicitar cancelamento ou exercer arrependimento']]) { const option = textNode('option', title); option.value = value; kind.append(option); } kindBox.append(kindLabel, kind);
    const message = field('Mensagem (opcional para solicitar cancelamento)', `support-message-${order.id}`, 'textarea'); message.input.maxLength = 2000;
    message.input.required = true; kind.addEventListener('change', () => { message.input.required = kind.value !== 'cancellation'; });
    const help = textNode('p', 'A solicitação será registrada para atendimento. O protocolo não significa que o pagamento já foi devolvido. Seus direitos legais permanecem preservados.', 'po-support-note'); help.id = `support-help-${order.id}`; form.setAttribute('aria-describedby', help.id);
    const submit = button('Enviar solicitação', null, true); submit.type = 'submit'; form.append(kindBox, message.wrapper, help, submit); let requestId = crypto.randomUUID(), lastPayload = '';
    form.addEventListener('submit', event => { event.preventDefault(); if (!form.reportValidity()) return; const payloadKey = `${kind.value}:${message.input.value.trim()}`; if (lastPayload && lastPayload !== payloadKey) requestId = crypto.randomUUID(); lastPayload = payloadKey; void action(form, async () => {
      const receipt = await request('support', { method:'POST', body: { orderId: order.id, requestId, kind: kind.value, message: message.input.value.trim() } });
      if (receipt?.ok !== true || typeof receipt.receiptId !== 'string' || !receipt.receiptId || !['received', 'resolved'].includes(receipt.status)) throw new Error('Receipt missing');
      showNotice(receipt.status === 'resolved' ? `Sua solicitação já foi registrada e tratada. Protocolo ${receipt.receiptId}. Consulte a situação financeira do pedido abaixo.` : `${kind.value === 'cancellation' ? 'Solicitação de cancelamento' : 'Solicitação de atendimento'} recebida. Protocolo ${receipt.receiptId}. ${kind.value === 'cancellation' ? 'O reembolso ainda não está confirmado.' : 'A equipe dará continuidade pelo contato da sua conta.'}`);
      await render(true, order.id);
    }); });
    return details('Atendimento e cancelamento', form);
  };
  const orderView = (order, selected) => {
    const item = textNode('li'), card = textNode('article', undefined, 'po-panel'); card.dataset.orderId = order.id; const title = textNode('h3', order.title); title.tabIndex = -1; title.id = `project-order-${order.id}`; card.append(title);
    const state = textNode('span', STATES[order.status], 'po-state'); state.dataset.status = order.status; card.append(state);
    card.append(summaryRows([['Pedido',order.id],['Valor',centsText(order.amountCents)],['Solicitado em',dateText(order.createdAt)],['Versão adquirida',order.productVersion || order.deliveryVersion || 'A conferir']]));
    if (order.paidAt) card.append(textNode('p', `Pagamento confirmado em ${dateText(order.paidAt)}.`));
    if (order.refundedAt) card.append(textNode('p', `Reembolso confirmado em ${dateText(order.refundedAt)}.`));
    if (order.status === 'review' || order.status === 'creating') card.append(textNode('p', 'A equipe está conferindo este pedido. Aguarde a confirmação antes de fazer um novo pagamento.'));
    const payment = paymentView(order); if (payment) card.append(payment);
    const actions = textNode('div', undefined, 'po-actions'); actions.append(button('Atualizar situação', () => action(card, async () => {
      const updated = await request('order', { id: order.id }); if (!orderShape(updated)) throw new Error('Invalid order'); showNotice(`Situação consultada: ${STATES[updated.status]}.`); await render(true, order.id);
    })));
    if (order.status === 'paid' && order.deliveryAvailable === true) actions.append(button('Baixar arquivos do projeto', () => download(order, card), true));
    if (order.status === 'paid' && order.deliveryAvailable !== true) card.append(textNode('p', 'Pagamento confirmado. A entrega ainda não está disponível. Use o atendimento deste pedido para solicitar ajuda.'));
    card.append(actions);
    const terms = order.terms?.text || order.termsText;
    if (typeof terms === 'string' && terms) {
      const contract = textNode('div'); contract.append(textNode('p', `Condições aceitas: versão ${order.termsVersion}.`));
      if (supplierShape(order.terms?.supplier)) contract.append(summaryRows(supplierRows(order.terms.supplier)));
      contract.append(textNode('div', terms, 'po-terms'));
      contract.append(button('Salvar dados e condições do pedido', () => {
        const body = `CONFENGE\nPedido: ${order.id}\nProjeto: ${order.title}\nVersão: ${order.productVersion}\nValor: ${centsText(order.amountCents)}\nSolicitado: ${dateText(order.createdAt)}\nAceite das condições: ${dateText(order.termsAcceptedAt)}\nSituação consultada: ${STATES[order.status]}\nCondições: ${order.termsVersion}\nSHA-256 das condições: ${order.termsHash}\n\n${terms}\n\nAtendimento: tiago.sasaki@confenge.com.br\n`;
        saveBlob(new Blob([body], {type:'text/plain;charset=utf-8'}), `confenge-pedido-${order.id}.txt`);
      })); card.append(details('Documentos da contratação', contract));
    } else card.append(link('Condições de contratação e atendimento', TERMS));
    card.append(supportView(order));
    if (Array.isArray(order.requests) && order.requests.length) { const history = textNode('ul', undefined, 'po-receipts'); for (const receipt of order.requests) { if (typeof receipt.receiptId !== 'string') continue; history.append(textNode('li', `${receipt.kind === 'cancellation' ? 'Solicitação de cancelamento' : 'Solicitação de atendimento'} recebida em ${dateText(receipt.createdAt)}. Protocolo ${receipt.receiptId}.${receipt.status === 'resolved' ? ` Tratada em ${dateText(receipt.resolvedAt)}. Consulte a situação financeira do pedido acima.` : ' Em atendimento.'}`)); } card.append(details('Solicitações registradas', history)); }
    item.append(card); if (selected) requestAnimationFrame(() => { if (title.isConnected) title.focus({preventScroll:false}); }); return item;
  };
  const render = async (focus = false, selectedOrder = null) => {
    if (!auth?.currentUser) return authView(focus);
    if (auth.currentUser.emailVerified !== true) return verificationView(focus);
    startView(); const currentGeneration = generation, uid = auth.currentUser.uid, account = panel('Sua conta', focus); account.append(textNode('p', auth.currentUser.email || 'Conta autenticada'));
    const actions = textNode('div', undefined, 'po-actions'); actions.append(button('Atualizar pedidos', () => action(account, async () => { showNotice(); await render(true); })), button('Sair', () => action(account, async () => { showNotice(); await sdk.signOut(auth); }))); account.append(actions);
    const ordersSection = panel('Seus pedidos'), loading = textNode('p','Consultando pedidos...'); ordersSection.append(loading); ordersSection.setAttribute('aria-busy','true');
    if (config.purchasesEnabled !== true) { const paused = panel('Novas compras pausadas'); paused.append(textNode('p','Você pode consultar os pedidos existentes e solicitar atendimento. Para uma nova contratação, consulte a equipe.'),link('Consultar disponibilidade',CONTACT)); }
    try {
      const result = await request('orders'); if (generation !== currentGeneration || auth.currentUser?.uid !== uid) return;
      if (!Array.isArray(result.orders) || !result.orders.every(orderShape)) throw new Error('Invalid orders');
      loading.remove(); const list = textNode('ul', undefined, 'po-order-list'); if (result.orders.length) { result.orders.forEach(order => list.append(orderView(order, order.id === selectedOrder))); ordersSection.append(list); } else ordersSection.append(textNode('p','Nenhum pedido registrado nesta conta.'));
      if (config.purchasesEnabled === true) { const products = Array.isArray(config.products) ? config.products.filter(publicProduct) : []; if (products.length) products.forEach(product => productView(product, result.orders)); else { const none = panel('Disponibilidade de projetos'); none.append(textNode('p','Não há um projeto disponível para nova compra neste momento.'),link('Consultar disponibilidade',CONTACT)); } }
    } catch (error) { if (generation !== currentGeneration) return; loading.textContent = 'Não foi possível consultar seus pedidos. Atualize a consulta ou fale com o atendimento.'; showNotice(knownError(error),true); }
    finally { if (generation === currentGeneration) ordersSection.setAttribute('aria-busy','false'); }
  };
  const initialize = async () => {
    root.setAttribute('aria-busy','true'); showNotice();
    try {
      config = await request('config',{authenticated:false});
      if (config.enabled !== true) return noPurchases();
      if (!config.firebase?.apiKey || !config.firebase?.projectId || !config.firebase?.appId) throw new Error('Missing account configuration');
      sdk = await loadAuth(); const name = 'confenge-projects', previous = sdk.getApps().find(app => app.name === name);
      if (previous) auth = sdk.getAuth(previous); else { const app = sdk.initializeApp(config.firebase,name); auth = sdk.initializeAuth(app,{persistence:sdk.browserLocalPersistence});
        if (config.authEmulator && config.mode === 'emulator' && ['localhost','127.0.0.1','[::1]'].includes(location.hostname)) { const emulator = new URL(config.authEmulator); if (emulator.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(emulator.hostname)) throw new Error('Invalid emulator'); sdk.connectAuthEmulator(auth,emulator.href,{disableWarnings:true}); }
      }
      await auth.authStateReady?.(); unsubscribe?.(); unsubscribe = sdk.onAuthStateChanged(auth,()=>{if(!authBusy) void render();}); await render();
    } catch { noPurchases(true); }
    finally { root.setAttribute('aria-busy','false'); }
  };
  return { initialize, destroy() { generation++; unsubscribe?.(); root.replaceChildren(); } };
}

const application = typeof document !== 'undefined' ? createProjectOrders() : null;
if (application) void application.initialize();
