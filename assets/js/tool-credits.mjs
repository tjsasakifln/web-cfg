import { referralFirstTouch, validReferral } from './tool-referral.mjs';

const ENDPOINT = '/api/web/tool-credits';
const ORDER_KEY = 'confenge-tool-orders-v1';
const CREDIT_STYLES = '/assets/css/tool-credits.css?v=creditos2';
const localWallets = new Map();
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const makeId = () => crypto.randomUUID();
const el = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
const btn = (text, fn) => { const n = el('button', text); n.type = 'button'; n.onclick = fn; return n; };
const message = e => ({ AUTH_REQUIRED: 'Entre na sua conta para continuar.', EMAIL_UNVERIFIED: 'Confirme seu e-mail para continuar.', NO_CREDITS: 'Você não tem créditos disponíveis.', ACCOUNT_BLOCKED: 'Esta conta está temporariamente bloqueada.', EXPORT_PAUSED: 'As exportações estão temporariamente pausadas.' })[e?.error || e?.code] || e?.message || 'Não foi possível concluir agora.';
const asJson = async r => { const body = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(body.error || 'Falha na conexão.'), body, { status: r.status }); return body; };
const getStore = (key, fallback = {}) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const setStore = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

function loadStyles() {
  if (document.querySelector(`link[href="${CREDIT_STYLES}"]`)) return;
  const previous = document.querySelector('link[href="/assets/css/tool-credits.css"]');
  if (previous) { previous.href = CREDIT_STYLES; return; }
  const link = el('link');
  link.rel = 'stylesheet';
  link.href = CREDIT_STYLES;
  document.head.append(link);
}

function exportNotice(text, { receipt, retry } = {}) {
  loadStyles();
  document.querySelector('.tool-credits__export-notice')?.remove();
  const notice = el('aside');
  notice.className = 'tool-credits__export-notice';
  const description = el('p', text);
  description.setAttribute('role', 'status');
  notice.append(description);
  if (receipt) notice.append(btn('Baixar comprovante', () => {
    const file = new Blob([JSON.stringify(receipt, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = el('a');
    link.href = url;
    link.download = 'confenge-comprovante-exportacao.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }));
  if (retry) notice.append(btn('Retomar exportação', retry));
  notice.append(btn('Fechar', () => notice.remove()));
  document.body.append(notice);
}

/** Fail-closed export entitlement UI with consent-aware aggregate referral measurement. */
export function createToolCredits({ toolId, root = document.body, fetchImpl = fetch, shared = false } = {}) {
  if (!toolId) throw new Error('toolId is required');
  let config, firebase, auth, account, dialog, init, provisionedUid, opening, renderVersion = 0, pollTimer;
  let preferredFlow = 'pix';
  let referralFocusPending = false, referralPanelTracked = false;
  referralFirstTouch();
  const referralDestination = toolId === 'modela-memoria' && !shared
    ? { url: '/avaliacao-imoveis-urbanos/inferencia/', kind: 'modela', label: 'Modela Pro' }
    : { url: '/ferramentas/', kind: 'catalog', label: 'catálogo de ferramentas' };
  const measure = (event, props = {}) => {
    if (!shared && toolId !== 'modela-memoria') return;
    try { window.confengeTrack?.(event, { tool_id: shared ? 'shared-wallet' : toolId, destination_kind: referralDestination.kind, ...props }); } catch {}
  };
  const url = (op, more = '') => `${ENDPOINT}?op=${encodeURIComponent(op)}${more}`;
  const ready = async () => {
    if (init) return init;
    init = (async () => {
      const response = await fetchImpl(url('config'), { headers: { Accept: 'application/json' } });
      if (response.status === 404 && !shared) return false;
      const parsed = await asJson(response);
      if (parsed.enabled === false) return false;
      if (shared && parsed.sharedExportsEnabled === false) return false;
      if (parsed.enabled !== true || !Array.isArray(parsed.tools) || !parsed.tools.includes(toolId) || !parsed.firebase?.apiKey) throw new Error('Configuração de créditos indisponível.');
      config = parsed; firebase = await import('/assets/tools-commerce/firebase-auth.mjs');
      const name = 'confenge-tools';
      const existing = firebase.getApps().find(app => app.name === name);
      if (existing) auth = firebase.getAuth(existing);
      else {
        const app = firebase.initializeApp(config.firebase, name);
        auth = firebase.initializeAuth(app, { persistence: firebase.browserLocalPersistence });
        if (config.authEmulator) firebase.connectAuthEmulator(auth, config.authEmulator, { disableWarnings: true });
      }
      await auth.authStateReady?.();
      firebase.onAuthStateChanged(auth, () => {
        clearTimeout(pollTimer);
        account = undefined;
        provisionedUid = undefined;
        preferredFlow = 'pix';
        if (dialog?.open) render();
      });
      return true;
    })();
    try {
      const available = await init;
      if (shared && !available) init = undefined;
      return available;
    } catch (error) { init = undefined; throw error; }
  };
  const token = async () => { if (!auth?.currentUser) throw { error: 'AUTH_REQUIRED' }; return auth.currentUser.getIdToken(); };
  const api = async (op, options = {}, extra = '') => {
    const response = await fetchImpl(url(op, extra), { ...options, headers: { Accept: 'application/json', Authorization: `Bearer ${await token()}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    return asJson(response);
  };
  const provision = async () => {
    const user = auth.currentUser; if (!user) throw { error: 'AUTH_REQUIRED' }; await user.reload();
    if (!user.emailVerified) throw { error: 'EMAIL_UNVERIFIED' }; await user.getIdToken(true);
    if (provisionedUid !== user.uid) {
      const referralCode = referralFirstTouch();
      account = await api('account', { method: 'POST', body: JSON.stringify(referralCode ? { referralCode } : {}) });
      provisionedUid = user.uid;
    }
    return account;
  };
  const refresh = async () => { await provision(); account = await api('account'); return account; };
  const orderKey = () => `${ORDER_KEY}:${auth?.currentUser?.uid || 'anonymous'}`;
  const cleanOrders = all => Object.fromEntries(Object.entries(all).filter(([, value]) => value?.at > Date.now() - 2 * 864e5 || value?.creating));
  const saveOrder = order => { const all = cleanOrders(getStore(orderKey())); all[order.id] = { id: order.id, status: order.status, at: Date.now() }; setStore(orderKey(), all); };
  const dropOrder = id => { const all = getStore(orderKey()); delete all[id]; setStore(orderKey(), all); };
  const preserveDialogFocus = host => {
    if (dialog?.open && host.contains(document.activeElement)) {
      dialog.querySelector('.tool-credits__close').focus({ preventScroll: true });
    }
  };
  const setBusy = (host, busy) => {
    if (busy) preserveDialogFocus(host);
    host.querySelectorAll('button,input,select').forEach(node => { node.disabled = busy; });
  };
  const note = (host, text) => { if (text) { const n = el('p', text); n.className = 'tool-credits__notice'; n.setAttribute('role', 'status'); n.setAttribute('aria-live', 'polite'); host.append(n); } };
  const authView = (host, notice) => {
    host.append(el('h2', 'Seu primeiro uso completo é gratuito'), el('p', 'Entre para guardar seus créditos e exportações.')); note(host, notice);
    const form = el('form'), email = el('input'), password = el('input'); email.type = 'email'; email.required = true; email.autocomplete = 'email'; password.type = 'password'; password.required = true; password.minLength = 6; password.autocomplete = 'current-password';
    for (const [text, field] of [['E-mail', email], ['Senha', password]]) { const label = el('label', text); label.append(field); form.append(label); }
    const login = btn('Entrar'); login.type = 'submit';
    form.append(login, btn('Criar conta', async () => { setBusy(form, true); try { const created = await firebase.createUserWithEmailAndPassword(auth, email.value, password.value); await firebase.sendEmailVerification(created.user); render('Conta criada. Confirme seu e-mail para ativá-la.'); } catch (e) { render(message(e)); } }), btn('Esqueci a senha', async () => { setBusy(form, true); try { if (!email.value) throw new Error('Informe seu e-mail para redefinir a senha.'); await firebase.sendPasswordResetEmail(auth, email.value); render('Enviamos o link para redefinir a senha.'); } catch (e) { render(message(e)); } }));
    form.onsubmit = async event => { event.preventDefault(); setBusy(form, true); try { await firebase.signInWithEmailAndPassword(auth, email.value, password.value); render('Conta acessada.'); } catch (e) { render(message(e)); } }; host.append(form);
  };
  const verifyView = (host, notice) => { host.append(el('h2', 'Confirme seu e-mail'), el('p', `Abra a mensagem enviada para ${auth.currentUser.email || 'seu e-mail'} e volte aqui.`)); note(host, notice); host.append(btn('Já confirmei', () => render()), btn('Reenviar confirmação', async () => { try { await firebase.sendEmailVerification(auth.currentUser); render('Confirmação reenviada.'); } catch (e) { render(message(e)); } }), btn('Sair', () => firebase.signOut(auth))); };
  const shareView = host => {
    if (!config.purchasesEnabled || account?.blocked || !validReferral(account?.referralCode)) return;
    const section = el('section'); section.id = 'tool-credits-referral'; section.tabIndex = -1; section.setAttribute('aria-labelledby', 'tool-credits-referral-title');
    const title = el('h3', 'Indique e ganhe créditos'); title.id = 'tool-credits-referral-title';
    section.append(title,
      el('p', `Compartilhe seu link pessoal para o ${referralDestination.label}. Você recebe 1 crédito cortesia quando uma nova conta indicada e verificada fizer a primeira exportação paga. Limite de 10 cortesias por mês.`),
      el('p', 'O primeiro link de indicação válido aberto nesse navegador fica atribuído por 30 dias e precisa estar ativo ao confirmar a nova conta. A indicação vale para contas novas com e-mail diferente do indicador. Estorno do pagamento que gerou a recompensa cancela a cortesia conforme os termos.'));
    const link = new URL(referralDestination.url, 'https://confenge.com.br'); link.searchParams.set('ref', account.referralCode);
    const linkText = link.href;
    const text = `Veja o ${referralDestination.label} da CONFENGE: ${linkText}. Posso receber um crédito cortesia se você fizer a primeira exportação paga.`;
    const input = el('input'); input.readOnly = true; input.value = linkText; input.setAttribute('aria-label', 'Seu link pessoal de indicação');
    const feedback = el('p'); feedback.className = 'tool-credits__notice'; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.hidden = true;
    const report = (channel, outcome, status) => { feedback.hidden = false; feedback.textContent = status; measure('tool_referral_action', { share_channel: channel, action_outcome: outcome }); };
    const external = (channel, destination) => {
      const popup = window.open('about:blank', '_blank');
      if (!popup) {
        input.focus(); input.select();
        report(channel, 'blocked', 'O navegador bloqueou a nova janela. Copie o link abaixo para compartilhar.');
        return;
      }
      try {
        popup.opener = null;
        const navigation = popup.document.createElement('a');
        navigation.href = destination;
        navigation.referrerPolicy = 'no-referrer';
        popup.document.body.append(navigation);
        navigation.click();
        report(channel, 'success', 'Abrimos a opção de compartilhamento em uma nova janela.');
      } catch {
        popup.close();
        input.focus(); input.select();
        report(channel, 'failure', 'Não foi possível abrir a nova janela. Copie o link abaixo para compartilhar.');
      }
    };
    section.append(btn('Copiar link pessoal', async () => {
      try { await navigator.clipboard.writeText(linkText); report('copy', 'success', 'Link pessoal copiado.'); }
      catch { input.focus(); input.select(); report('copy', 'failure', 'Não foi possível copiar automaticamente. O link está selecionado para você copiar.'); }
    }),
    btn('Compartilhar no LinkedIn', () => external('linkedin', `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(linkText)}`)),
    btn('Compartilhar no WhatsApp', () => external('whatsapp', `https://wa.me/?text=${encodeURIComponent(text)}`)));
    if (navigator.share) section.append(btn('Mais opções de compartilhamento', async () => {
      try { await navigator.share({ title: `Ferramenta CONFENGE — ${referralDestination.label}`, text }); report('native', 'success', 'Compartilhamento concluído.'); }
      catch (error) { report('native', error?.name === 'AbortError' ? 'cancelled' : 'failure', error?.name === 'AbortError' ? 'Compartilhamento cancelado.' : 'Não foi possível abrir as opções de compartilhamento.'); }
    }));
    const disclosure = el('p'); const terms = el('a', 'Consulte as regras completas'); terms.href = '/termos-de-uso/#creditos-ferramentas'; disclosure.append('Ao divulgar, informe que você pode receber uma cortesia se houver uso pago. ', terms, '.');
    section.append(disclosure, input, feedback); host.append(section);
    if (!referralPanelTracked) { referralPanelTracked = true; measure('tool_referral_panel_view'); }
    if (referralFocusPending) { referralFocusPending = false; requestAnimationFrame(() => section.focus()); }
  };
  const accountView = (host, notice) => {
    host.append(el('h2', 'Créditos de exportação'));
    const amount = (account?.paid || 0) + (account?.promo || 0) + (account?.freeAvailable ? 1 : 0);
    const balance = amount === 1 ? '1 crédito disponível' : `${amount} créditos disponíveis`;
    const courtesy = (account?.promo || 0) + Number(Boolean(account?.freeAvailable));
    const summary = el('div');
    summary.className = 'tool-credits__balance';
    summary.append(el('strong', balance));
    if (courtesy) summary.append(el('span', `${courtesy} de cortesia`));
    if (config.sharedExportsEnabled) summary.append(el('p', 'Use o mesmo saldo em qualquer ferramenta com exportação por créditos.'));
    host.append(summary);
    note(host, notice);
    const section = el('section'); section.append(el('h3', config.checkoutEnabled ? 'Comprar créditos' : 'Comprar por Pix'));
    if (account?.blocked) section.append(el('p', 'Sua conta está em análise. Fale com a CONFENGE pelo contato nos termos.'));
    else if (!config.purchasesEnabled) section.append(el('p', 'As compras ainda não estão disponíveis.'));
    else {
      const paymentMethod = el('select');
      if (config.checkoutEnabled) {
        for (const [value, text] of [['pix', 'Pix (preferencial)'], ['checkout', 'Outros meios no Mercado Pago']]) {
          const option = el('option', text);
          option.value = value;
          paymentMethod.append(option);
        }
        paymentMethod.value = preferredFlow;
        paymentMethod.onchange = () => { preferredFlow = paymentMethod.value; };
        const label = el('label', 'Forma de pagamento');
        label.append(paymentMethod);
        section.append(label, el('p', 'Na página de pagamento do Mercado Pago, você verá as opções disponíveis para sua compra.'));
      }
      const accepted = el('input'), termsLabel = el('label'), cards = el('div');
      accepted.type = 'checkbox';
      termsLabel.append(accepted, ' Li e aceito os termos aplicáveis.');
      cards.className = 'tool-credits__packs';
      for (const pack of config.packages || []) {
        const unit = BRL.format(pack.amountCents / pack.credits / 100);
        const quantity = `${pack.credits} crédito${pack.credits === 1 ? '' : 's'}`;
        const price = BRL.format(pack.amountCents / 100);
        const choice = btn('', () => createOrder(pack.id, accepted.checked, paymentMethod.value || 'pix'));
        choice.setAttribute('aria-label', `Comprar ${quantity} por ${price}. ${unit} por crédito.`);
        choice.append(el('span', quantity), el('strong', price), el('small', `${unit} por crédito`));
        cards.append(choice);
      }
      section.append(termsLabel, cards);
    }
    host.append(section); const legal = el('p'); const terms = el('a', 'Termos de uso'); terms.href = '/termos-de-uso/#creditos-ferramentas'; const privacy = el('a', 'Política de privacidade'); privacy.href = '/privacidade/'; legal.append('Consulte os ', terms, ' e a ', privacy, '. Créditos comprados não expiram.'); host.append(legal); shareView(host);
    const previous = [...(account?.recentOrders || []), ...Object.values(getStore(orderKey())).filter(item => item?.id)].filter((item, index, all) => all.findIndex(x => x.id === item.id) === index);
    if (previous.length) { const recent = el('section'); recent.append(el('h3', 'Pagamentos recentes')); for (const item of previous) recent.append(btn(`Consultar pedido ${item.id}`, () => checkOrder(item.id))); host.append(recent); } host.append(btn('Sair', () => firebase.signOut(auth)));
  };
  const render = async notice => {
    if (!dialog) return;
    const host = dialog.querySelector('.tool-credits__content');
    preserveDialogFocus(host);
    host.replaceChildren();
    const user = auth?.currentUser;
    const version = ++renderVersion;
    if (!user) return authView(host, notice); try { await user.reload(); } catch (error) { notice = message(error); } if (version !== renderVersion) return;
    if (!user.emailVerified) return verifyView(host, notice);
    try { await refresh(); } catch (error) { notice = message(error); } if (version !== renderVersion) return; accountView(host, notice);
  };
  const createOrder = async (packageId, accepted, paymentFlow) => {
    if (!accepted) return render('Confirme que leu os termos para continuar.');
    const key = orderKey(), store = getStore(key);
    const attempt = `${config.termsVersion}:${paymentFlow}:${packageId}`;
    const requestId = store.creating?.[attempt] || makeId();
    store.creating = { ...(store.creating || {}), [attempt]: requestId }; setStore(key, store);
    if (dialog) setBusy(dialog.querySelector('.tool-credits__content'), true);
    try {
      const order = await api('orders', { method: 'POST', body: JSON.stringify({ packageId, requestId, termsVersion: config.termsVersion, paymentFlow }) });
      delete store.creating[attempt]; setStore(key, store);
      if (key === orderKey()) { saveOrder(order); showOrder(order); }
    } catch (e) { if (key === orderKey()) render(`${message(e)} Você pode tentar novamente; a identificação do pedido será preservada.`); }
  };
  const checkOrder = async (id, remaining = 15) => {
    const key = orderKey();
    try {
      const order = await api('order', {}, `&id=${encodeURIComponent(id)}`);
      if (key === orderKey() && dialog?.open) { saveOrder(order); showOrder(order, remaining); }
    } catch (e) { if (key === orderKey() && dialog?.open) render(message(e)); }
  };
  const showOrder = async (order, remaining = 15) => {
    clearTimeout(pollTimer);
    const key = orderKey();
    if (['paid', 'failed', 'review', 'reversed'].includes(order.status)) {
      dropOrder(order.id);
      return render(order.status === 'paid' ? 'Pagamento confirmado. Seus créditos foram atualizados.' : order.status === 'review' ? 'Pedido em análise. Consulte os termos para falar com a CONFENGE.' : order.status === 'reversed' ? 'Pagamento estornado.' : 'Não foi possível concluir este pagamento.');
    }
    const checkout = order.paymentFlow === 'checkout';
    await render(order.status === 'creating' ? 'Preparando o pagamento.' : 'Aguardando o pagamento.');
    if (!dialog?.open || key !== orderKey()) return;
    const host = dialog.querySelector('.tool-credits__content'), section = el('section');
    section.className = 'tool-credits__payment';
    section.append(el('h3', checkout ? 'Pague no Mercado Pago' : 'Pague por Pix'));
    if (order.qrImage) {
      const img = el('img'); img.src = `data:image/png;base64,${order.qrImage}`; img.alt = 'QR Code Pix'; section.append(img);
    }
    if (order.qrCode) {
      const code = el('textarea'); code.readOnly = true; code.value = order.qrCode; code.setAttribute('aria-label', 'Pix copia e cola');
      section.append(code, btn('Copiar Pix', async () => { try { await navigator.clipboard.writeText(order.qrCode); note(section, 'Código Pix copiado.'); } catch { code.focus(); code.select(); } }));
    }
    if (order.checkoutUrl?.startsWith('https://www.mercadopago.com.br/')) {
      section.append(btn(checkout ? 'Abrir pagamento no Mercado Pago' : 'Abrir Pix no Mercado Pago',
        () => window.open(order.checkoutUrl, '_blank', 'noopener,noreferrer')));
    }
    section.append(btn('Atualizar pagamento', () => checkOrder(order.id)));
    host.prepend(section);
    if (remaining > 0) pollTimer = setTimeout(() => checkOrder(order.id, remaining - 1), 8000);
  };
  const ensure = () => { if (dialog) return; loadStyles(); dialog = el('dialog'); dialog.className = 'tool-credits'; dialog.setAttribute('aria-label', 'Créditos CONFENGE'); const close = btn('×', () => dialog.close()); close.className = 'tool-credits__close'; close.setAttribute('aria-label', 'Fechar'); const content = el('div'); content.className = 'tool-credits__content'; dialog.append(close, content); dialog.addEventListener('close', () => clearTimeout(pollTimer)); dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); }); root.append(dialog); };
  const open = async notice => { if (opening) return opening; opening = (async () => { if (!await ready()) return false; ensure(); if (!dialog.open) dialog.showModal(); await render(notice); return true; })(); try { return await opening; } finally { opening = undefined; } };
  const openReferral = async () => {
    if (!await ready() || !config?.purchasesEnabled) return false;
    referralFocusPending = true;
    return open(auth?.currentUser ? undefined : 'Entre ou crie sua conta para acessar seu link pessoal de indicação.');
  };
  const attempts = new Map();
  let exporting = false, interrupted;
  async function deliverLocal(result) {
    if (exporting) return false;
    if (interrupted && interrupted.result !== result) {
      exportNotice('Há uma emissão pendente nesta página. Retome-a antes de exportar outro resultado.',
        { retry: () => deliverLocal(interrupted.result) });
      return false;
    }
    const { format, content, deliver } = result;
    exporting = true;
    let key, ownerUid, started = false;
    try {
      if (!await ready()) { await deliver(); return true; }
      await provision();
      const user = auth.currentUser;
      if (interrupted && interrupted.uid !== user?.uid) throw { error: 'AUTH_REQUIRED' };
      ownerUid = user?.uid;
      const file = typeof content === 'string' ? new Blob([content]) : content;
      if (!(file instanceof Blob) || !file.size) throw new Error('O resultado está vazio.');
      const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
      if (auth.currentUser !== user) throw { error: 'AUTH_REQUIRED' };
      key = `confenge-export-v1:${user.uid}:${toolId}:${format}:${sha256}:${file.size}`;
      let requestId = attempts.get(key);
      try { requestId ||= sessionStorage.getItem(key); } catch { /* storage is optional */ }
      if (!requestId) {
        if (!window.confirm('Exportar este resultado por um crédito? A primeira exportação da conta é cortesia. O arquivo fica no seu dispositivo.')) return false;
        requestId = makeId();
        attempts.set(key, requestId);
        try { sessionStorage.setItem(key, requestId); } catch { /* storage is optional */ }
      }
      started = true;
      const receipt = await api('export-local', { method: 'POST',
        body: JSON.stringify({ toolId, requestId, payload: { format, bytes: file.size, sha256 } }) });
      if (receipt.schema !== 'confenge.tools.emission/v1' || receipt.toolId !== toolId ||
          receipt.format !== format || receipt.bytes !== file.size || receipt.sha256 !== sha256 ||
          !/^[0-9a-f]{64}$/.test(receipt.id || '') || !/^[0-9a-f]{64}$/.test(receipt.proof || '')) {
        throw new Error('Comprovante indisponível. Tente novamente.');
      }
      await deliver(receipt);
      interrupted = undefined;
      attempts.delete(key);
      try { sessionStorage.removeItem(key); } catch { /* storage is optional */ }
      exportNotice('Exportação autorizada. O comprovante identifica este resultado.', { receipt });
      return true;
    } catch (error) {
      if (started && (!error.status || error.status >= 500)) {
        interrupted ??= { result, uid: ownerUid };
        exportNotice('A exportação foi interrompida. Retome o mesmo resultado para evitar outro débito.',
          { retry: () => deliverLocal(result) });
        return false;
      }
      if (started && ['NO_CREDITS', 'ACCOUNT_BLOCKED', 'REQUEST_CONFLICT'].includes(error.error)) {
        interrupted = undefined;
        attempts.delete(key);
        try { sessionStorage.removeItem(key); } catch { /* storage is optional */ }
      }
      try { if (await open(message(error))) return false; } catch { /* also show failures before login */ }
      exportNotice('Não foi possível autorizar a exportação. Tente novamente no mesmo resultado.');
      return false;
    } finally { exporting = false; }
  }

  return { ready, open, openReferral, deliverLocal, async exportReport({ payload, requestId = makeId() } = {}) {
    if (!await ready()) return null;
    try {
      await provision();
      const response = await fetchImpl(url('export'), { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ toolId, requestId, payload }) });
      if (!response.ok) throw Object.assign(new Error(), await response.json().catch(() => ({})));
      if (!/^attachment;/i.test(response.headers.get('Content-Disposition') || '')) throw new Error('Arquivo indisponível. Tente novamente.');
      return response.blob();
    } catch (error) { try { await open(message(error)); } catch {} throw error; }
  } };
}

/** Authorizes the tool's normal delivery after its local generator has succeeded. */
export function exportToolResult({ toolId, format, content, deliver }) {
  if (!localWallets.has(toolId)) localWallets.set(toolId, createToolCredits({ toolId, shared: true }));
  return localWallets.get(toolId).deliverLocal({ format, content, deliver });
}
