import { referralFirstTouch, validReferral } from './tool-referral.mjs';

const ENDPOINT = '/api/web/tool-credits';
const ORDER_KEY = 'confenge-tool-orders-v1';
const CREDIT_STYLES = '/assets/css/tool-credits.css?v=creditos4';
const localWallets = new Map();
// A page can host a tool wallet and the shared wallet simultaneously. These
// keys stay in memory and never enter analytics or browser storage.
const startedOrders = new Set(), confirmedOrders = new Set();
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const makeId = () => crypto.randomUUID();
const el = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
const btn = (text, fn) => { const n = el('button', text); n.type = 'button'; n.onclick = fn; return n; };
const googleMark = () => {
  const icon = el('span');
  icon.className = 'tool-credits__google-mark';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg viewBox="0 0 18 18" focusable="false"><path fill="#EA4335" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.703-1.567 2.684-3.874 2.684-6.615Z"/><path fill="#4285F4" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.585-5.036-3.71H.957v2.332A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.964 10.712A5.41 5.41 0 0 1 3.682 9c0-.594.102-1.171.282-1.712V4.956H.957A9 9 0 0 0 0 9c0 1.452.348 2.828.957 4.044l3.007-2.332Z"/><path fill="#34A853" d="M9 3.578c1.322 0 2.508.455 3.442 1.347l2.582-2.582C13.463.891 11.426 0 9 0A9 9 0 0 0 .957 4.956l3.007 2.332C4.672 5.163 6.656 3.578 9 3.578Z"/></svg>';
  return icon;
};
const AUTH_PROVIDER_DETAILS = Object.freeze({
  'google.com': { label: 'Google', className: 'google', create: firebase => new firebase.GoogleAuthProvider() },
  'linkedin.com': { label: 'LinkedIn', className: 'linkedin', create: firebase => new firebase.OAuthProvider('linkedin.com') },
  'apple.com': { label: 'Apple', className: 'apple', create: firebase => new firebase.OAuthProvider('apple.com') },
  'facebook.com': { label: 'Facebook', className: 'facebook', create: firebase => new firebase.FacebookAuthProvider() },
  'github.com': { label: 'GitHub', className: 'github', create: firebase => new firebase.GithubAuthProvider() },
  'microsoft.com': { label: 'Microsoft', className: 'microsoft', create: firebase => new firebase.OAuthProvider('microsoft.com') },
  'twitter.com': { label: 'X', className: 'x', create: firebase => new firebase.TwitterAuthProvider() },
  'yahoo.com': { label: 'Yahoo', className: 'yahoo', create: firebase => new firebase.OAuthProvider('yahoo.com') },
});
const message = e => ({
  AUTH_REQUIRED: 'Entre na sua conta para continuar.',
  ACCOUNT_LINK_REQUIRED: 'Este e-mail já está associado à sua carteira. Entre pelo método usado anteriormente para manter seus créditos.',
  EMAIL_UNVERIFIED: 'Este acesso não forneceu um e-mail confirmado. Entre com e-mail e senha ou escolha outro provedor.',
  NO_CREDITS: 'Você não tem créditos disponíveis.',
  ACCOUNT_BLOCKED: 'Esta conta está temporariamente bloqueada.',
  ACCOUNT_CHANGED: 'A conta de acesso mudou. Entre novamente na conta usada para esta exportação e retome o mesmo resultado.',
  EXPORT_PAUSED: 'As exportações estão temporariamente pausadas.',
  'auth/invalid-credential': 'E-mail ou senha incorretos. Confira os dados e tente novamente.',
  'auth/invalid-email': 'Confira o endereço de e-mail informado.',
  'auth/email-already-in-use': 'Este e-mail já possui uma conta. Entre ou redefina a senha.',
  'auth/weak-password': 'Escolha uma senha mais forte para criar a conta.',
  'auth/too-many-requests': 'Muitas tentativas seguidas. Tente novamente mais tarde.',
  'auth/network-request-failed': 'Sem conexão com o serviço de acesso. Confira a internet e tente novamente.',
  'auth/unauthorized-domain': 'Este endereço ainda não está autorizado para o login. Entre em contato com a CONFENGE.',
  'auth/popup-closed-by-user': 'A janela de acesso foi fechada antes da conclusão.',
  'auth/popup-blocked': 'O navegador bloqueou a janela de acesso. Permita pop-ups para confenge.com.br e tente novamente.',
  'auth/operation-not-allowed': 'Este provedor ainda não está disponível. Escolha outro método de acesso.',
  'auth/account-exists-with-different-credential': 'Já existe uma conta com este e-mail em outro método. Entre pelo método já usado para manter seus créditos na mesma conta.',
  'auth/credential-already-in-use': 'Esta identidade já está vinculada a outra conta.',
})[e?.error || e?.code] || e?.message || 'Não foi possível concluir agora.';
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

function exportNotice(text, { receipt, retry, referral } = {}) {
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
  if (referral) notice.append(btn('Indique e ganhe créditos', referral));
  notice.append(btn('Fechar', () => notice.remove()));
  document.body.append(notice);
}

/** Prints only the prepared text, never the mutable calculator underneath. */
export async function printToolResultSnapshot(content, { assertCurrent = () => {} } = {}) {
  const text = typeof content === 'string' ? content : content instanceof Blob ? await content.text() : '';
  if (!text) throw new Error('O resultado está vazio.');
  assertCurrent();
  loadStyles();
  const frame = el('iframe');
  frame.className = 'tool-credits__print-frame';
  frame.title = 'Impressão do resultado preparado';
  frame.setAttribute('aria-hidden', 'true');
  frame.src = 'about:blank';
  document.body.append(frame);
  const doc = frame.contentDocument, printWindow = frame.contentWindow;
  let expiry;
  const remove = () => { clearTimeout(expiry); frame.remove(); };
  try {
    if (!doc || !printWindow) throw new Error('Não foi possível preparar a impressão.');
    doc.title = 'CONFENGE | Resultado da ferramenta';
    doc.documentElement.lang = 'pt-BR';
    doc.body.className = 'tool-credits__print-document';
    const heading = doc.createElement('h1'); heading.textContent = 'CONFENGE';
    const prepared = doc.createElement('pre');
    prepared.className = 'tool-credits__print-text';
    prepared.textContent = text;
    doc.body.replaceChildren(heading, prepared);
    const stylesheet = doc.createElement('link');
    stylesheet.rel = 'stylesheet'; stylesheet.href = CREDIT_STYLES;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Não foi possível preparar a impressão.')), 10000);
      stylesheet.onload = () => { clearTimeout(timeout); resolve(); };
      stylesheet.onerror = () => { clearTimeout(timeout); reject(new Error('Não foi possível preparar a impressão.')); };
      doc.head.append(stylesheet);
    });
    assertCurrent();
    printWindow.addEventListener('afterprint', remove, { once: true });
    printWindow.focus();
    printWindow.print();
    // Some embedded browsers do not send afterprint. The private snapshot is
    // still temporary and never written to storage or an external window.
    if (frame.isConnected) expiry = setTimeout(remove, 120000);
  } catch (error) { remove(); throw error; }
}

/** Fail-closed export entitlement UI with consent-aware aggregate referral measurement. */
export function createToolCredits({ toolId, root = document.body, fetchImpl = fetch, shared = false } = {}) {
  if (!toolId) throw new Error('toolId is required');
  let config, firebase, auth, account, dialog, init, provisionedUid, opening, renderVersion = 0, pollTimer;
  let preferredFlow = 'pix';
  let referralFocusPending = false, referralPanelTracked = false;
  let pendingExport, selectedPackageId;
  referralFirstTouch();
  const referralDestination = toolId === 'modela-memoria' && !shared
    ? { url: '/avaliacao-imoveis-urbanos/inferencia/', kind: 'modela', label: 'Modela Pro' }
    : { url: '/ferramentas/', kind: 'catalog', label: 'catálogo de ferramentas' };
  const measure = (event, props = {}) => {
    if (!shared && toolId !== 'modela-memoria') return;
    try { window.confengeTrack?.(event, { tool_id: shared ? 'shared-wallet' : toolId, destination_kind: referralDestination.kind, ...props }); } catch {}
  };
  const commerceStep = (step, props = {}) => {
    try { window.confengeTrack?.('tool_commerce_step', {
      step, tool_id: shared && toolId === 'modela-memoria' ? 'shared-wallet' : toolId, ...props,
    }); } catch {}
  };
  const packageProps = id => config?.packages?.some(pack => pack.id === id && pack.id === `creditos-${pack.credits}`)
    ? { package_id: id } : {};
  const url = (op, more = '') => `${ENDPOINT}?op=${encodeURIComponent(op)}${more}`;
  const ready = async () => {
    if (init) return init;
    init = (async () => {
      const response = await fetchImpl(url('config'), { headers: { Accept: 'application/json' } });
      if (response.status === 404 && !shared) return false;
      const parsed = await asJson(response);
      if (parsed.enabled === false) return false;
      // Shared exports cross tool boundaries and must be explicitly enabled.
      // A partial/legacy config that omits the flag is never permission to use
      // a shared wallet or prompt for its account flow.
      if (shared && parsed.sharedExportsEnabled !== true) return false;
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
        // A prepared result stays only in this page and cannot follow an
        // already identified visitor into another account.
        if (pendingExport?.uid && pendingExport.uid !== auth.currentUser?.uid && !pendingExport.recovery) pendingExport = undefined;
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
  const requireUser = user => {
    if (!user) throw { error: 'AUTH_REQUIRED' };
    if (auth?.currentUser !== user || auth.currentUser.uid !== user.uid) throw { error: 'ACCOUNT_CHANGED', status: 409 };
    return user;
  };
  const token = async user => {
    requireUser(user);
    const value = await user.getIdToken();
    requireUser(user);
    return value;
  };
  const authorizedFetch = async (op, options = {}, extra = '', user = auth?.currentUser, onSend) => {
    const bearer = await token(user);
    requireUser(user);
    onSend?.();
    const response = await fetchImpl(url(op, extra), { ...options, headers: { Accept: 'application/json', Authorization: `Bearer ${bearer}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    requireUser(user);
    return response;
  };
  const api = async (op, options = {}, extra = '', user = auth?.currentUser, onSend) => {
    const response = await authorizedFetch(op, options, extra, user, onSend);
    const data = await asJson(response);
    requireUser(user);
    return data;
  };
  const provision = async (user = auth?.currentUser) => {
    requireUser(user);
    await user.reload();
    requireUser(user);
    if (!user.emailVerified) throw { error: 'EMAIL_UNVERIFIED' };
    await user.getIdToken(true);
    requireUser(user);
    if (provisionedUid !== user.uid) {
      const referralCode = referralFirstTouch();
      const provisioned = await api('account', { method: 'POST', body: JSON.stringify(referralCode ? { referralCode } : {}) }, '', user);
      requireUser(user);
      account = provisioned;
      provisionedUid = user.uid;
    }
    return account;
  };
  const refresh = async () => {
    const user = auth?.currentUser;
    await provision(user);
    requireUser(user);
    const refreshed = await api('account', {}, '', user);
    requireUser(user);
    account = refreshed;
    return account;
  };
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
  const configuredProviders = () => Object.entries(AUTH_PROVIDER_DETAILS)
    .filter(([id]) => Array.isArray(config?.authProviders) && config.authProviders.includes(id));
  const authView = (host, notice) => {
    const layout = el('div'); layout.className = 'tool-credits__auth-layout';
    const intro = el('section'); intro.className = 'tool-credits__auth-intro';
    const brand = el('a'); brand.className = 'tool-credits__auth-brand'; brand.href = '/ferramentas/';
    brand.setAttribute('aria-label', 'CONFENGE, catálogo de ferramentas');
    const logo = el('img'); logo.src = '/assets/logo-confenge-white-500-1677038e.png';
    logo.alt = 'CONFENGE'; logo.width = 224; logo.height = 58; brand.append(logo);
    const eyebrow = el('span', 'FERRAMENTAS CONFENGE'); eyebrow.className = 'tool-credits__auth-eyebrow';
    intro.append(brand, eyebrow,
      el('h2', 'Sua primeira exportação é grátis'),
      el('p', 'Experimente as ferramentas, confira seu resultado e leve o primeiro arquivo sem pagar.'));
    const benefits = el('ul'); benefits.className = 'tool-credits__auth-benefits';
    for (const benefit of [
      'Uma exportação de cortesia por conta verificada.',
      'A cortesia e os créditos são compartilhados entre as ferramentas.',
      'Depois, cada nova exportação usa 1 crédito.',
    ]) benefits.append(el('li', benefit));
    intro.append(benefits);

    const panel = el('section'); panel.className = 'tool-credits__auth-panel';
    panel.append(el('h3', 'Entre na sua conta'),
      el('p', 'Use o Google para entrar em poucos cliques ou escolha o acesso por e-mail.'));
    if (pendingExport) {
      const pending = el('p', 'Seu resultado está pronto nesta página. Após entrar, você poderá concluir a exportação.');
      pending.className = 'tool-credits__auth-pending';
      panel.append(pending);
    }
    note(panel, notice);
    const authContent = el('div'); authContent.className = 'tool-credits__auth-content';
    const feedback = el('p'); feedback.className = 'tool-credits__auth-error';
    feedback.setAttribute('role', 'alert'); feedback.tabIndex = -1; feedback.hidden = true;
    const authError = error => {
      const code = error?.code || error?.error;
      if (typeof code === 'string' && code.startsWith('auth/')) {
        const known = message(error);
        return known === error?.message
          ? 'Não foi possível concluir o acesso. Verifique os dados ou tente outro método.'
          : known;
      }
      return message(error);
    };
    const perform = async (action, success) => {
      feedback.hidden = true;
      setBusy(authContent, true);
      try { await action(); await render(success); }
      catch (error) {
        setBusy(authContent, false);
        feedback.textContent = authError(error);
        feedback.hidden = false;
        feedback.focus({ preventScroll: true });
      }
    };
    const providers = configuredProviders();
    const isolated = globalThis.crossOriginIsolated === true;
    const social = el('section'); social.className = 'tool-credits__social';
    social.setAttribute('aria-label', 'Acesso com contas existentes');
    if (isolated && providers.length) {
      social.append(el('p', 'Para entrar com Google ou outro provedor, abra sua carteira central.'));
      const central = el('a', 'Abrir carteira central');
      central.className = 'tool-credits__central-wallet';
      central.href = '/ferramentas/#meus-creditos';
      central.target = '_blank'; central.rel = 'noopener noreferrer';
      social.append(central);
    } else {
      for (const [, detail] of providers) {
        const access = btn('Continuar com ' + detail.label,
          () => perform(() => firebase.signInWithPopup(auth, detail.create(firebase), firebase.browserPopupRedirectResolver), 'Conta acessada.'));
        access.className = 'tool-credits__provider tool-credits__provider--' + detail.className;
        access.setAttribute('aria-label', 'Continuar com ' + detail.label);
        if (detail.className === 'google') access.prepend(googleMark());
        social.append(access);
      }
    }
    if (social.childElementCount) authContent.append(social);

    const emailAccess = el('details'); emailAccess.className = 'tool-credits__auth-email';
    if (!providers.length) emailAccess.open = true;
    const summary = el('summary', 'Prefiro entrar com e-mail');
    emailAccess.append(summary);
    const form = el('form'), email = el('input'), password = el('input');
    email.type = 'email'; email.name = 'email'; email.required = true;
    email.autocomplete = 'email'; email.placeholder = 'voce@empresa.com.br';
    password.type = 'password'; password.name = 'password'; password.required = true;
    password.minLength = 6; password.autocomplete = 'current-password';
    for (const [labelText, field] of [['E-mail', email], ['Senha', password]]) {
      const label = el('label', labelText); label.append(field); form.append(label);
    }
    let creating = false;
    const submit = btn('Entrar com e-mail'); submit.type = 'submit';
    submit.className = 'tool-credits__auth-submit';
    const actions = el('div'); actions.className = 'tool-credits__auth-actions';
    const changeMode = btn('Criar uma conta', () => {
      creating = !creating;
      password.autocomplete = creating ? 'new-password' : 'current-password';
      submit.textContent = creating ? 'Criar conta grátis' : 'Entrar com e-mail';
      changeMode.textContent = creating ? 'Já tenho conta' : 'Criar uma conta';
      reset.hidden = creating;
      feedback.hidden = true;
    });
    changeMode.className = 'tool-credits__auth-helper';
    const reset = btn('Esqueci a senha', () => perform(async () => {
      if (!email.value.trim()) throw new Error('Informe seu e-mail para redefinir a senha.');
      await firebase.sendPasswordResetEmail(auth, email.value.trim());
    }, 'Se houver uma conta para este e-mail, você receberá instruções de recuperação.'));
    reset.className = 'tool-credits__auth-helper';
    actions.append(changeMode, reset);
    form.append(submit, actions);
    form.onsubmit = event => {
      event.preventDefault();
      if (creating) {
        perform(async () => {
          const created = await firebase.createUserWithEmailAndPassword(auth, email.value.trim(), password.value);
          await firebase.sendEmailVerification(created.user);
        }, 'Conta criada. Confirme seu e-mail para ativá-la.');
      } else {
        perform(() => firebase.signInWithEmailAndPassword(auth, email.value.trim(), password.value), 'Conta acessada.');
      }
    };
    emailAccess.append(form);
    authContent.append(emailAccess);
    panel.append(feedback, authContent);
    const legal = el('p'); legal.className = 'tool-credits__auth-legal';
    legal.append('Sua conta é usada para gerenciar as exportações. Consulte os ');
    for (const [text, href] of [
      ['Termos de uso', '/termos-de-uso/#creditos-ferramentas'],
      ['Política de privacidade', '/privacidade/'],
    ]) {
      const link = el('a', text); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      if (legal.querySelector('a')) legal.append(' e ');
      legal.append(link);
    }
    legal.append('.');
    panel.append(legal);
    layout.append(intro, panel);
    host.append(layout);
  };
  const verifyView = (host, notice) => {
    const user = auth.currentUser;
    const hasEmail = typeof user?.email === 'string' && user.email.length > 0;
    host.append(el('h2', hasEmail ? 'Confirme seu e-mail' : 'E-mail não confirmado'));
    host.append(el('p', hasEmail
      ? `Abra a mensagem enviada para ${user.email} e volte aqui.`
      : 'Este provedor não forneceu um e-mail para guardar créditos. Escolha outro método de acesso.'));
    note(host, notice);
    if (hasEmail) host.append(btn('Já confirmei', () => render()), btn('Reenviar confirmação', async () => { try { await firebase.sendEmailVerification(user); render('Confirmação reenviada.'); } catch (e) { render(message(e)); } }));
    host.append(btn(hasEmail ? 'Sair' : 'Escolher outro método', () => firebase.signOut(auth)));
  };
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
    if (pendingExport && (!pendingExport.uid || pendingExport.uid === auth.currentUser?.uid)) {
      pendingExport.uid ||= auth.currentUser?.uid;
      const resume = el('section');
      resume.className = 'tool-credits__resume';
      resume.append(el('h3', 'Concluir sua exportação'), el('p', amount > 0
        ? 'O resultado preparado continua nesta página. Confirme abaixo para baixar o arquivo.'
        : 'O resultado preparado continua nesta página. Após a confirmação do pagamento, conclua a exportação aqui.'));
      const continueExport = btn(account?.freeAvailable ? 'Concluir exportação grátis' : 'Concluir exportação por 1 crédito', async () => {
        const pending = pendingExport;
        const user = auth.currentUser;
        if (!pending || pending.uid !== user?.uid) return;
        // Returning to the result is a separate, explicit action. Neither
        // login nor a confirmed payment authorizes a debit or a download.
        dialog.close();
        try { await pending.resume(user); } catch { /* the export path displays its own recovery state */ }
      });
      continueExport.dataset.resumeExport = '';
      continueExport.disabled = amount < 1 || account?.blocked || config.exportsPaused === true;
      resume.append(continueExport);
      host.append(resume);
    }
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
      const selected = config.packages?.find(pack => pack.id === selectedPackageId);
      if (selected) section.append(el('p', `Pacote escolhido: ${selected.credits} crédito${selected.credits === 1 ? '' : 's'} por ${BRL.format(selected.amountCents / 100)}. Confira a forma de pagamento e os termos antes de comprar.`));
      for (const pack of config.packages || []) {
        const unit = BRL.format(pack.amountCents / pack.credits / 100);
        const quantity = `${pack.credits} crédito${pack.credits === 1 ? '' : 's'}`;
        const price = BRL.format(pack.amountCents / 100);
        const choice = btn('', () => createOrder(pack.id, accepted.checked, paymentMethod.value || 'pix'));
        choice.dataset.packageId = pack.id;
        choice.setAttribute('aria-label', `Comprar ${quantity} por ${price}. ${unit} por crédito.`);
        choice.append(el('span', quantity), el('strong', price), el('small', `${unit} por crédito`));
        if (pack.id === selectedPackageId) choice.append(el('small', 'Pacote escolhido'));
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
    dialog.classList.toggle('tool-credits--auth', !user);
    const version = ++renderVersion;
    if (!user) return authView(host, notice); try { await user.reload(); } catch (error) { notice = message(error); } if (version !== renderVersion) return;
    if (!user.emailVerified) return verifyView(host, notice);
    try { await refresh(); } catch (error) { notice = message(error); } if (version !== renderVersion) return; accountView(host, notice);
  };
  const createOrder = async (packageId, accepted, paymentFlow) => {
    selectedPackageId = packageId;
    if (!accepted) return render('Confirme que leu os termos para continuar.');
    const key = orderKey(), store = getStore(key);
    const attempt = `${config.termsVersion}:${paymentFlow}:${packageId}`;
    const requestId = store.creating?.[attempt] || makeId();
    store.creating = { ...(store.creating || {}), [attempt]: requestId }; setStore(key, store);
    if (dialog) setBusy(dialog.querySelector('.tool-credits__content'), true);
    try {
      const order = await api('orders', { method: 'POST', body: JSON.stringify({ packageId, requestId, termsVersion: config.termsVersion, paymentFlow }) });
      delete store.creating[attempt]; setStore(key, store);
      if (key === orderKey()) {
        const measurementKey = `${key}:${order.id}`;
        if (!startedOrders.has(measurementKey)) {
          startedOrders.add(measurementKey);
          commerceStep('order_started', { payment_flow: paymentFlow, ...packageProps(packageId) });
        }
        saveOrder(order); showOrder(order);
      }
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
      const measurementKey = `${key}:${order.id}`;
      if (order.status === 'paid' && !confirmedOrders.has(measurementKey)) {
        confirmedOrders.add(measurementKey);
        commerceStep('payment_confirmed', { ...packageProps(order.packageId),
          ...(['pix', 'checkout'].includes(order.paymentFlow) ? { payment_flow: order.paymentFlow } : {}) });
      }
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
  const open = async options => {
    if (opening) return opening;
    opening = (async () => {
      if (!await ready()) return false;
      const notice = typeof options === 'string' ? options : options?.notice;
      if (typeof options?.packageId === 'string' && config.packages?.some(pack => pack.id === options.packageId)) selectedPackageId = options.packageId;
      ensure();
      if (!dialog.open) {
        dialog.showModal();
        commerceStep('wallet_view');
        if (!auth.currentUser) commerceStep('auth_required');
      }
      await render(typeof notice === 'string' ? notice : undefined);
      return true;
    })();
    try { return await opening; } finally { opening = undefined; }
  };
  const openReferral = async () => {
    if (!await ready() || !config?.purchasesEnabled) return false;
    referralFocusPending = true;
    return open(auth?.currentUser ? undefined : 'Entre ou crie sua conta para acessar seu link pessoal de indicação.');
  };
  const attempts = new Map();
  const preparedResults = new WeakMap();
  let exporting = false, interrupted;
  async function deliverLocal(result, expectedUser = auth?.currentUser) {
    if (exporting) return false;
    if (interrupted && interrupted.result !== result) {
      exportNotice('Há uma emissão pendente nesta página. Retome-a antes de exportar outro resultado.',
        { retry: () => deliverLocal(interrupted.result) });
      return false;
    }
    let prepared = preparedResults.get(result);
    if (!prepared) {
      const { format, content, deliver } = result;
      prepared = Object.freeze({ format, deliver, file: typeof content === 'string' ? new Blob([content]) : content });
      preparedResults.set(result, prepared);
    }
    const { format, file, deliver } = prepared;
    exporting = true;
    let key, ownerUid, started = false;
    try {
      if (!await ready()) { await deliver(); return true; }
      const user = expectedUser || auth.currentUser;
      ownerUid = user?.uid;
      requireUser(user);
      if (interrupted && interrupted.uid !== user.uid) throw { error: 'ACCOUNT_CHANGED', status: 409 };
      await provision(user);
      requireUser(user);
      if (!(file instanceof Blob) || !file.size) throw new Error('O resultado está vazio.');
      const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
      requireUser(user);
      key = `confenge-export-v1:${user.uid}:${toolId}:${format}:${sha256}:${file.size}`;
      let requestId = attempts.get(key);
      try { requestId ||= sessionStorage.getItem(key); } catch { /* storage is optional */ }
      if (!requestId) {
        if (!window.confirm('Exportar este resultado por um crédito? A primeira exportação da conta é cortesia. O arquivo fica no seu dispositivo.')) return false;
        requestId = makeId();
        attempts.set(key, requestId);
        try { sessionStorage.setItem(key, requestId); } catch { /* storage is optional */ }
      }
      const receipt = await api('export-local', { method: 'POST',
        body: JSON.stringify({ toolId, requestId, payload: { format, bytes: file.size, sha256 } }) }, '', user, () => { started = true; });
      if (receipt.schema !== 'confenge.tools.emission/v1' || receipt.toolId !== toolId ||
          receipt.format !== format || receipt.bytes !== file.size || receipt.sha256 !== sha256 ||
          !/^[0-9a-f]{64}$/.test(receipt.id || '') || !/^[0-9a-f]{64}$/.test(receipt.proof || '')) {
        throw new Error('Comprovante indisponível. Tente novamente.');
      }
      requireUser(user);
      await deliver(receipt, () => requireUser(user));
      requireUser(user);
      pendingExport = undefined;
      preparedResults.delete(result);
      commerceStep('export_delivered');
      interrupted = undefined;
      attempts.delete(key);
      try { sessionStorage.removeItem(key); } catch { /* storage is optional */ }
      exportNotice('Exportação autorizada. O comprovante identifica este resultado.', {
        receipt,
        ...(config.purchasesEnabled ? { referral: () => openReferral() } : {}),
      });
      return true;
    } catch (error) {
      if (['AUTH_REQUIRED', 'EMAIL_UNVERIFIED', 'NO_CREDITS'].includes(error.error)) {
        if (!ownerUid || ownerUid === auth.currentUser?.uid) pendingExport = { uid: ownerUid, resume: user => deliverLocal(result, user) };
        if (error.error === 'NO_CREDITS') commerceStep('credits_required');
      } else commerceStep('export_failed');
      if (started && (!error.status || error.status >= 500 || error.error === 'ACCOUNT_CHANGED')) {
        interrupted ??= { result, uid: ownerUid };
        exportNotice('A exportação foi interrompida. Retome o mesmo resultado para evitar outro débito.',
          { retry: () => deliverLocal(result) });
        return false;
      }
      if (error.error === 'ACCOUNT_CHANGED') {
        if (!interrupted) { pendingExport = undefined; preparedResults.delete(result); }
        exportNotice(message(error), interrupted ? { retry: () => deliverLocal(interrupted.result) } : {});
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

  async function exportReport({ payload, requestId = makeId(), deliver } = {}, expectedUser = auth?.currentUser,
    preparedBody = JSON.stringify({ toolId, requestId, payload })) {
    if (!await ready()) return null;
    const user = expectedUser || auth.currentUser;
    const ownerUid = user?.uid;
    let started = false;
    const resume = nextUser => {
      if (ownerUid && nextUser?.uid !== ownerUid) { exportNotice(message({error:'ACCOUNT_CHANGED'})); return false; }
      return exportReport({ payload, requestId, deliver }, nextUser, preparedBody);
    };
    try {
      requireUser(user);
      await provision(user);
      const response = await authorizedFetch('export', { method: 'POST', body: preparedBody }, '', user, () => { started = true; });
      if (!response.ok) throw Object.assign(new Error(), await response.json().catch(() => ({})), { status: response.status });
      if (!/^attachment;/i.test(response.headers.get('Content-Disposition') || '')) throw new Error('Arquivo indisponível. Tente novamente.');
      const blob = await response.blob();
      requireUser(user);
      if (typeof deliver === 'function') {
        await deliver(blob);
        requireUser(user);
        pendingExport = undefined;
        commerceStep('export_delivered');
      }
      return blob;
    } catch (error) {
      if (['AUTH_REQUIRED', 'EMAIL_UNVERIFIED', 'NO_CREDITS'].includes(error.error)) {
        if (typeof deliver === 'function' && (!ownerUid || ownerUid === auth.currentUser?.uid)) {
          pendingExport = { uid: ownerUid, resume };
        }
        if (error.error === 'NO_CREDITS') commerceStep('credits_required');
      } else commerceStep('export_failed');
      if (error.error === 'ACCOUNT_CHANGED') {
        if (started && typeof deliver === 'function') {
          pendingExport = { uid: ownerUid, resume, recovery: true };
          exportNotice(message(error), { retry: async () => { try { await resume(auth.currentUser); } catch {} } });
        } else exportNotice(message(error));
        throw error;
      }
      try { await open(message(error)); } catch {}
      throw error;
    }
  }
  return { ready, open, openReferral, deliverLocal, exportReport };
}

/** Authorizes the tool's normal delivery after its local generator has succeeded. */
export function exportToolResult(result) {
  const { toolId } = result;
  if (!localWallets.has(toolId)) localWallets.set(toolId, createToolCredits({ toolId, shared: true }));
  // Preserve the caller's result identity so its own retry action can resume
  // an interrupted emission. A different result remains blocked by the wallet.
  return localWallets.get(toolId).deliverLocal(result);
}
