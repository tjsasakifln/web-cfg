import { referralFirstTouch } from '/assets/js/tool-referral.mjs';

// Personal codes exist only in the verified-account flow. Public sharing
// always uses the authored tool URL (never location.href or form values).
referralFirstTouch();

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
