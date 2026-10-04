// Local navigation only. Search text is neither stored nor transmitted.
(() => {
  const directory = document.querySelector('[data-opportunity-directory]');
  if (!directory) return;
  const cards = [...directory.querySelectorAll('[data-opportunity-card]')];
  const search = directory.querySelector('#opportunity-search');
  const state = directory.querySelector('#opportunity-state');
  const status = directory.querySelector('[data-opportunity-result]');
  const empty = directory.querySelector('[data-opportunity-empty]');
  const pageLabel = directory.querySelector('[data-opportunity-page]');
  const previous = directory.querySelector('[data-opportunity-prev]');
  const next = directory.querySelector('[data-opportunity-next]');
  const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  const texts = new Map(cards.map(card => [card, normalize(card.textContent)]));
  const pageSize = 24;
  let currentPage = 1;
  function render() {
    const terms = normalize(search.value).split(/\s+/).filter(Boolean);
    const matches = cards.filter(card => (state.value === 'all' || card.dataset.uf === state.value)
      && terms.every(term => texts.get(card).includes(term)));
    const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
    currentPage = Math.min(currentPage, pageCount);
    const visible = new Set(matches.slice((currentPage - 1) * pageSize, currentPage * pageSize));
    cards.forEach(card => { card.hidden = !visible.has(card); });
    empty.hidden = matches.length > 0;
    status.textContent = matches.length ? `Página ${currentPage} de ${pageCount} · ${matches.length} oportunidades encontradas · ${visible.size} nesta página.` : 'Nenhuma oportunidade encontrada.';
    pageLabel.textContent = `Página ${currentPage} de ${pageCount}`;
    previous.disabled = currentPage === 1;
    next.disabled = currentPage === pageCount;
  }
  for (const control of directory.querySelectorAll('[data-opportunity-controls]')) control.hidden = false;
  search.addEventListener('input', () => { currentPage = 1; render(); });
  state.addEventListener('change', () => { currentPage = 1; render(); });
  previous.addEventListener('click', () => { currentPage -= 1; render(); });
  next.addEventListener('click', () => { currentPage += 1; render(); });
  render();
})();
