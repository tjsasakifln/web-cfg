import { referralFirstTouch } from '/assets/js/tool-referral.mjs';

// Personal codes exist only in the verified-account flow. Public sharing
// always uses the authored tool URL (never location.href or form values).
referralFirstTouch();

const walletButton = document.getElementById('meus-creditos');
// The ordinary share URL is public. A personal reward link is generated only
// by a verified account, and is advertised only while paid use is available.
const referralEntries = [...document.querySelectorAll('[data-referral-entry]')];
const isModela = document.getElementById('tool-credits') !== null;
const walletStatus = document.getElementById('meus-creditos-status');
let wallet;
const sharedWallet = async () => {
  const { createToolCredits } = await import('/assets/js/tool-credits.mjs');
  wallet ??= createToolCredits({ toolId: 'modela-memoria', shared: true });
  return wallet;
};
const openWallet = async () => {
  try {
    if (!await (await sharedWallet()).open()) throw new Error('wallet unavailable');
    if (walletStatus) walletStatus.textContent = '';
  } catch {
    if (walletStatus) walletStatus.textContent = 'A conta de créditos está indisponível. Tente novamente.';
  }
};
const openSharedReferral = async (entry = referralEntries[0]) => {
  try { if (await (await sharedWallet()).openReferral()) return; } catch {}
  const status = entry?.closest('.tool-share')?.querySelector('.tool-share-status');
  if (status) status.textContent = 'A conta de créditos está indisponível. Tente novamente.';
};
const returning = location.hash === '#meus-creditos';
const returningToReferral = walletButton && location.hash === '#programa-indicacao';
if (returning) {
  // Confirm the order through the account. Redirect query values are not payment facts.
  try { history.replaceState(history.state, '', location.pathname + location.hash); } catch {}
}

if (walletButton || referralEntries.length) {
  fetch('/api/web/tool-credits?op=config', { headers: { Accept: 'application/json' } })
    .then(response => response.ok ? response.json() : null)
    .then(config => {
      if (walletButton && config?.enabled === true && config.sharedExportsEnabled === true) {
        walletButton.hidden = false;
        walletButton.addEventListener('click', openWallet);
        if (returning) openWallet();
      }
      if (config?.enabled === true && config?.purchasesEnabled === true &&
          Array.isArray(config.tools) && config.tools.includes('modela-memoria')) {
        const sharedReferralEnabled = config.sharedExportsEnabled === true && !isModela;
        referralEntries.forEach(entry => {
          if (!isModela && !sharedReferralEnabled) return;
          entry.hidden = false;
          if (!sharedReferralEnabled) return;
          entry.querySelector('a[href$="#programa-indicacao"]')?.addEventListener('click', (event) => {
            event.preventDefault();
            openSharedReferral(entry);
          });
        });
        if (sharedReferralEnabled && returningToReferral) openSharedReferral();
      }
    }).catch(() => {});
}

const simplify = (value) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const search = document.querySelector('[data-tool-search]');
if (search) {
  const input = search.querySelector('input');
  const clear = search.querySelector('[data-search-clear]');
  const status = document.querySelector('[data-search-status]');
  const groups = [...document.querySelectorAll('[data-group]')].map((group) => ({
    group,
    jump: document.querySelector('.ts-jumps a[href="#' + group.id + '"]'),
    cards: [...group.querySelectorAll('[data-tool-card]')].map((card) => ({
      card, text: simplify(card.textContent + ' ' + card.dataset.toolKeywords),
    })),
  }));
  const filter = () => {
    const tokens = simplify(input.value).trim().split(/\s+/).filter(Boolean);
    let total = 0;
    for (const { group, jump, cards } of groups) {
      let count = 0;
      for (const { card, text } of cards) {
        const match = tokens.every(token => text.includes(token));
        card.hidden = !match;
        count += Number(match);
      }
      group.hidden = count === 0;
      if (jump) jump.hidden = count === 0;
      total += count;
    }
    clear.hidden = !input.value;
    status.textContent = !tokens.length ? '' : total === 0
      ? 'Nenhuma ferramenta encontrada. Tente outro termo, como IFC, foto ou aditivo.'
      : total === 1 ? '1 ferramenta encontrada.' : total + ' ferramentas encontradas.';
  };
  input.addEventListener('input', filter);
  input.addEventListener('search', filter);
  clear.addEventListener('click', () => {
    input.value = '';
    filter();
    input.focus();
  });
  search.hidden = false;
  filter();

  document.addEventListener('keydown', (event) => {
    const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (event.key !== '/' || editing || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    input.focus();
  });
}

const groupLinks = [...document.querySelectorAll('[data-group-link]')];
if (groupLinks.length && 'IntersectionObserver' in window) {
  const linksByGroup = new Map(groupLinks.map((link) => [link.dataset.groupLink, link]));
  const markCurrent = (id) => {
    for (const [group, link] of linksByGroup) {
      if (group === id) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  };
  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting && !entry.target.hidden)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) markCurrent(visible.target.id);
  }, { rootMargin: '-18% 0px -64% 0px', threshold: [0, .08, .2] });
  document.querySelectorAll('[data-group]').forEach((group) => observer.observe(group));
}

for (const panel of document.querySelectorAll('[data-tool-share]')) {
  const copy = panel.querySelector('[data-share-copy]');
  const native = panel.querySelector('[data-share-native]');
  const field = panel.querySelector('[data-share-url]');
  const status = panel.querySelector('[role="status"]');
  const url = field.value;
  const manual = () => {
    field.parentElement.hidden = false;
    field.focus();
    field.select();
    status.textContent = 'Selecione e copie o endereço da ferramenta.';
  };
  copy.hidden = false;
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = 'Link copiado.';
    } catch {
      manual();
    }
  });
  if (typeof navigator.share === 'function') {
    native.hidden = false;
    native.addEventListener('click', async () => {
      try {
        await navigator.share({ title: panel.dataset.shareTitle, url });
      } catch (error) {
        if (error?.name !== 'AbortError') manual();
      }
    });
  }
}


for (const button of document.querySelectorAll('[data-card-share]')) {
  const card = button.closest('[data-tool-card]');
  const status = card.querySelector('[role="status"]');
  const { shareUrl: url, shareTitle: title } = button.dataset;
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      status.textContent = 'Link copiado.';
    } catch (error) {
      if (error?.name === 'AbortError') return;
      let field = card.querySelector('.ts-card-share-url');
      if (!field) {
        field = document.createElement('input');
        field.type = 'text';
        field.className = 'ts-card-share-url';
        field.setAttribute('aria-label', 'Link de ' + title);
        field.readOnly = true;
        field.value = url;
        status.after(field);
      }
      status.textContent = 'Selecione e copie o link.';
      field.focus();
      field.select();
    }
  });
}
