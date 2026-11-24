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
const exportTerms = [...document.querySelectorAll('[data-tool-export-terms]')];
let wallet;
const sharedWallet = async () => {
  const { createToolCredits } = await import('/assets/js/tool-credits.mjs');
  wallet ??= createToolCredits({ toolId: 'modela-memoria', shared: true });
  return wallet;
};
const openWallet = async (packageId) => {
  try {
    const options = typeof packageId === 'string' ? { packageId } : undefined;
    if (!await (await sharedWallet()).open(options)) throw new Error('wallet unavailable');
    if (walletStatus) walletStatus.textContent = '';
    return true;
  } catch {
    if (walletStatus) walletStatus.textContent = 'A conta de créditos está indisponível. Tente novamente.';
    return false;
  }
};
const pricing = document.querySelector('[data-credit-packages]');
const pricingStatus = document.querySelector('[data-credit-pricing-status]');
const pricingNote = document.querySelector('[data-credit-pricing-note]');
const publicIntro = document.querySelector('[data-public-export-intro]');
const pricingUnavailable = (message) => {
  if (pricing) { pricing.replaceChildren(); pricing.hidden = true; }
  if (pricingStatus) pricingStatus.textContent = message;
  if (pricingNote) pricingNote.hidden = true;
};
const renderPricing = config => {
  if (!pricing) return;
  const available = config?.enabled === true && config.sharedExportsEnabled === true
    && Array.isArray(config.tools) && config.tools.includes('modela-memoria');
  if (!available) {
    pricingUnavailable('A conta de créditos está temporariamente indisponível. Continue experimentando as ferramentas e tente novamente mais tarde.');
    return;
  }
  if ((config.purchasesEnabled !== true && !config.plans?.pro) || config.exportsPaused === true) {
    pricingUnavailable(config.exportsPaused === true
      ? 'As exportações estão temporariamente pausadas. Você pode continuar experimentando as ferramentas.'
      : 'Novas compras estão temporariamente indisponíveis. Consulte sua conta para ver o saldo e as exportações disponíveis.');
    return;
  }
  const packs = (Array.isArray(config.packages) ? config.packages : []).filter(pack =>
    /^creditos-(1|3|5|10|25|50)$/.test(pack.id) &&
    Number.isSafeInteger(pack.credits) && pack.credits > 0 &&
    pack.id === `creditos-${pack.credits}` && Number.isSafeInteger(pack.amountCents) && pack.amountCents > 0
  ).sort((a, b) => a.credits - b.credits);
  if (!packs.length || new Set(packs.map(pack => pack.id)).size !== packs.length) {
    pricingUnavailable('Não foi possível consultar os preços agora. Tente novamente ou confira os pacotes na sua conta.');
    return;
  }
  const brl = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
  const nodes = (config.purchasesEnabled===true?packs:[]).map(pack => {
    const card = document.createElement('li');
    const heading = document.createElement('h4');
    heading.textContent = `${pack.credits} ${pack.credits === 1 ? 'crédito' : 'créditos'}`;
    const total = document.createElement('p');
    total.className = 'ts-credit-total'; total.textContent = brl(pack.amountCents);
    const unit = document.createElement('p');
    unit.className = 'ts-credit-unit';
    unit.textContent = pack.credits === 1 ? 'Uma exportação de resultado.'
      : `${brl(pack.amountCents / pack.credits)} por exportação, em média.`;
    const action = document.createElement('button');
    action.type = 'button'; action.className = 'ts-credit-choose';
    action.textContent = `Escolher ${pack.credits} ${pack.credits === 1 ? 'crédito' : 'créditos'}`;
    action.dataset.packageId = pack.id;
    action.dataset.eventName = 'cta_click';
    action.dataset.ctaId = `tool-pack-${pack.id}`;
    action.dataset.ctaPosition = 'tool_pricing';
    action.addEventListener('click', async () => {
      action.disabled = true;
      try {
        if (!await openWallet(pack.id) && pricingStatus) {
          pricingStatus.textContent = 'Não foi possível abrir a conta. Seu pagamento não foi iniciado. Tente novamente.';
        }
      } finally { action.disabled = false; }
    });
    card.append(heading, total, unit, action);
    return card;
  });
  const pro=config.plans?.pro;
  if(pro && Number.isSafeInteger(pro.amountCents) && Number.isSafeInteger(pro.credits) && pro.credits>0) {
    const card=document.createElement('li'), title=document.createElement('h4'), price=document.createElement('strong'),
      description=document.createElement('p'), action=document.createElement('button');
    title.textContent='Confenge Pro';price.className='ts-credit-total';price.textContent=brl(pro.amountCents)+' / mês';
    description.textContent=pro.credits+' exportações por ciclo pago. '+(pro.savingPercent>0?'Economize '+pro.savingPercent+'% frente ao crédito unitário. ':'')+'Renovação automática, sem fidelidade. Cancelamento pela conta.';
    action.type='button';action.className='ts-credit-choose';action.textContent='Conhecer Confenge Pro';
    action.addEventListener('click',()=>openWallet());
    card.append(title,price,description,action);nodes.unshift(card);
  }
  pricing.replaceChildren(...nodes); pricing.hidden = false;
  if (pricingStatus) pricingStatus.textContent = config.plans?.pro ? (config.purchasesEnabled?'Confenge Free: comece sem cartão. Escolha créditos avulsos ou uma assinatura mensal.':'Confenge Free: comece sem cartão. A assinatura mensal está disponível; compras avulsas estão temporariamente pausadas.') : 'Pacotes de créditos avulsos. O preço abaixo é o total da compra.';
  if (pricingNote) pricingNote.hidden = false;
  // A view is observed only when the prices enter the viewport. No search text,
  // account identity, input file or payment identifier enters public analytics.
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      try { window.confengeTrack?.('tool_commerce_step', { step: 'pricing_view', tool_id: 'shared-wallet' }); } catch {}
    });
    observer.observe(pricing);
  }
};
const openSharedReferral = async (entry = referralEntries[0]) => {
  try { if (await (await sharedWallet()).openReferral()) return; } catch {}
  const status = entry?.querySelector('[role="status"]') ??
    entry?.closest('.tool-share')?.querySelector('.tool-share-status');
  if (status) status.textContent = 'A conta de créditos está indisponível. Tente novamente.';
};
const returning = location.hash === '#meus-creditos';
const returningToReferral = walletButton && location.hash === '#programa-indicacao';
if (returning) {
  // Confirm the order through the account. Redirect query values are not payment facts.
  try { history.replaceState(history.state, '', location.pathname + location.hash); } catch {}
}

if (walletButton || referralEntries.length || exportTerms.length) {
  fetch('/api/web/tool-credits?op=config', { headers: { Accept: 'application/json' } })
    .then(response => response.ok ? response.json() : null)
    .then(config => {
      renderPricing(config);
      const sharedEnabled = config?.enabled === true && config.sharedExportsEnabled === true
        && Array.isArray(config.tools) && config.tools.includes('modela-memoria');
      const modelaEnabled = isModela && config?.enabled === true
        && Array.isArray(config.tools) && config.tools.includes('modela-memoria');
      if (sharedEnabled || modelaEnabled) {
        const single = config.packages?.find(pack => pack.credits === 1
          && Number.isSafeInteger(pack.amountCents) && pack.amountCents > 0);
        const price = single && new Intl.NumberFormat('pt-BR', {
          style: 'currency', currency: 'BRL',
        }).format(single.amountCents / 100);
        const copy = config.exportsPaused === true
          ? 'Use a ferramenta gratuitamente. As exportações por créditos estão temporariamente pausadas.'
          : 'Use a ferramenta gratuitamente. Cada conta verificada tem 2 exportações de cortesia por mês; as seguintes usam 1 crédito.'
            + (publicIntro ? ' As cortesias renovam todo mês, não acumulam e são compartilhadas entre as ferramentas.' : '')
            + (config.purchasesEnabled === true
              ? (price ? ` Crédito avulso: ${price}. Há pacotes na carteira.` : '')
              : ' Novas compras estão temporariamente indisponíveis.');
        for (const notice of exportTerms) {
          notice.querySelector('[data-tool-export-copy]').textContent = copy;
          notice.hidden = false;
          const access = notice.querySelector('[data-tool-export-wallet]');
          access.href = '/ferramentas/#meus-creditos';
          access.textContent = 'Minha conta e créditos';
          access.target = '_blank';
          access.rel = 'noopener';
          access.addEventListener('click', async event => {
            // Isolated BIM pages use the existing central account handoff.
            if (globalThis.crossOriginIsolated === true) return;
            event.preventDefault();
            if (isModela) { document.getElementById('tool-credits').click(); return; }
            if (!await openWallet()) {
              let status = notice.querySelector('[role="status"]');
              if (!status) { status = document.createElement('span'); status.setAttribute('role', 'status'); notice.append(status); }
              status.textContent = ' A conta de créditos está indisponível. Tente novamente.';
            }
          });
          if (config.purchasesEnabled === true && config.exportsPaused !== true) {
            const offer = document.createElement('span');
            offer.className = 'tool-referral-summary';
            const heading = document.createElement('strong');
            heading.textContent = 'Ganhe 1 crédito cortesia por indicação.';
            const link = document.createElement('a');
            const isolated = globalThis.crossOriginIsolated === true;
            link.href = isModela && !isolated ? '#programa-indicacao' : '/ferramentas/#programa-indicacao';
            if (isolated) {
              link.target = '_blank';
              link.rel = 'noopener';
            }
            link.textContent = 'Pegar meu link de indicação';
            const status = document.createElement('span');
            status.setAttribute('role', 'status');
            offer.append(heading, ' Quando o indicado fizer a primeira exportação paga, use o crédito para exportar sem pagar. ', link, status);
            link.addEventListener('click', event => {
              if (isolated) return;
              event.preventDefault();
              if (isModela) referralEntries[0]?.querySelector('a')?.click();
              else openSharedReferral(offer);
            });
            notice.append(offer);
          }
        }
      }
      if (publicIntro && !sharedEnabled) {
        publicIntro.querySelector('[data-tool-export-copy]').textContent =
          'Experimente as ferramentas gratuitamente. A emissão por créditos está temporariamente indisponível.';
        publicIntro.querySelector('[data-tool-export-wallet]').hidden = true;
      }
      if (walletButton && sharedEnabled) {
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
    }).catch(() => {
      pricingUnavailable('Não foi possível consultar os preços agora. Atualize a página ou tente novamente mais tarde.');
      if (publicIntro) {
        publicIntro.querySelector('[data-tool-export-copy]').textContent =
          'Experimente as ferramentas gratuitamente. Não foi possível consultar a disponibilidade de exportação agora.';
        publicIntro.querySelector('[data-tool-export-wallet]').hidden = true;
      }
    });
}

const simplify = (value) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const search = document.querySelector('[data-tool-search]');
if (search) {
  const input = search.querySelector('input');
  const format = search.querySelector('#ts-format');
  const clear = search.querySelector('[data-search-clear]');
  const status = document.querySelector('[data-search-status]');
  const groups = [...document.querySelectorAll('[data-group]')].map((group) => ({
    group,
    expanded: false,
    more: group.querySelector('[data-show-more]'),
    jump: document.querySelector('.ts-jumps a[href="#' + group.id + '"]'),
    cards: [...group.querySelectorAll('[data-tool-card]')].map((card) => ({
      card, text: simplify(card.textContent + ' ' + card.dataset.toolKeywords + ' ' + (card.dataset.toolFormat || '') +
        (/\bXLSX\b/.test(card.dataset.toolFormat || '') ? ' excel' : '')),
      formats: ((card.dataset.toolFormat || '').toUpperCase().match(/[A-Z]+[0-9]*/g) || [])
        .map(value => value.replace(/\d+$/, '')),
    })),
  }));
  const filter = () => {
    const tokens = simplify(input.value).trim().split(/\s+/).filter(Boolean);
    const chosenFormat = format?.value || '';
    const filtered = tokens.length > 0 || Boolean(chosenFormat);
    let total = 0;
    for (const item of groups) {
      const { group, jump, cards, more, expanded } = item;
      let count = 0;
      for (const { card, text, formats } of cards) {
        const match = tokens.every(token => text.includes(token)) && (!chosenFormat || formats.includes(chosenFormat));
        card.hidden = !match || Boolean(more && !filtered && !expanded && count >= 6);
        count += Number(match);
      }
      if (more) {
        more.hidden = filtered || expanded || count <= 6;
        more.textContent = `Ver mais ${Math.max(0, count - 6)} opções deste grupo`;
      }
      group.hidden = count === 0;
      if (jump) jump.hidden = count === 0;
      total += count;
    }
    clear.hidden = !input.value && !chosenFormat;
    status.textContent = !filtered ? '' : total === 0
      ? 'Nenhuma ferramenta encontrada. Tente outro termo, como IFC, foto ou aditivo.'
      : total === 1 ? '1 ferramenta encontrada.' : total + ' ferramentas encontradas.';
  };
  input.addEventListener('input', filter);
  input.addEventListener('search', filter);
  format?.addEventListener('change', filter);
  clear.addEventListener('click', () => {
    input.value = '';
    if (format) format.value = '';
    filter();
    input.focus();
  });
  search.hidden = false;
  for (const item of groups) item.more?.addEventListener('click', () => {
    const next = item.cards.find(({ card }) => card.hidden);
    item.expanded = true;
    filter();
    next?.card.querySelector('.ts-card-action')?.focus();
  });
  const exposeTarget = () => {
    const target = document.getElementById(location.hash.slice(1));
    const group = groups.find(item => item.cards.some(({ card }) => card === target));
    if (!group) return;
    group.expanded = true;
    input.value = '';
    if (format) format.value = '';
    filter();
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  };
  filter();
  exposeTarget();
  window.addEventListener('hashchange', exposeTarget);

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
