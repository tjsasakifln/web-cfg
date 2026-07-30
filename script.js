(() => {
  const normalize = (value) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const init = () => {
    const toggle = document.querySelector('.menu-toggle');
    const menu = document.querySelector('.mobile-nav');
    const closeMenu = (returnFocus = false) => {
      if (!toggle || !menu) return;
      toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Abrir menu');
      menu.classList.remove('is-open'); document.body.classList.remove('menu-open'); if (returnFocus) toggle.focus();
    };
    if (toggle && menu) {
      toggle.addEventListener('click', () => toggle.getAttribute('aria-expanded') === 'true' ? closeMenu() : (toggle.setAttribute('aria-expanded','true'), toggle.setAttribute('aria-label','Fechar menu'), menu.classList.add('is-open'), document.body.classList.add('menu-open'), menu.querySelector('a')?.focus()));
      menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => closeMenu()));
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(true); });
      document.addEventListener('click', (event) => { if (toggle.getAttribute('aria-expanded') === 'true' && !menu.contains(event.target) && !toggle.contains(event.target)) closeMenu(); });
      window.addEventListener('resize', () => { if (window.innerWidth > 900) closeMenu(); }, { passive: true });
    }
    document.querySelectorAll('#year').forEach((el) => { el.textContent = new Date().getFullYear(); });
    const reveals = document.querySelectorAll('.reveal');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if ('IntersectionObserver' in window && !reducedMotion) {
      const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }), { threshold: .08, rootMargin: '0px 0px -35px' });
      reveals.forEach((el) => observer.observe(el));
    } else reveals.forEach((el) => el.classList.add('is-visible'));

    const search = document.getElementById('content-search');
    const items = [...document.querySelectorAll('[data-content-item]')];
    const count = document.getElementById('content-results');
    const filters = [...document.querySelectorAll('[data-filter]')];
    let activeFilter = 'all';
    const apply = () => {
      const q = normalize(search?.value || ''); let visible = 0;
      items.forEach((item) => {
        const matchesText = !q || normalize(item.dataset.search || item.textContent).includes(q);
        const matchesFilter = activeFilter === 'all' || item.dataset.priority === activeFilter;
        item.hidden = !(matchesText && matchesFilter); if (!item.hidden) visible += 1;
      });
      if (count) count.textContent = `${visible} conteúdo${visible === 1 ? '' : 's'} encontrado${visible === 1 ? '' : 's'}`;
    };
    search?.addEventListener('input', apply);
    filters.forEach((button) => button.addEventListener('click', () => { filters.forEach((b) => b.classList.remove('is-active')); button.classList.add('is-active'); activeFilter = button.dataset.filter || 'all'; apply(); }));

    // Lead attribution: ?tema= & ?origem= from article CTAs
    // Prefer real query string; also support legacy /#contato?tema=...
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = window.location.hash.includes('?')
      ? new URLSearchParams(window.location.hash.split('?')[1] || '')
      : new URLSearchParams();
    const tema = searchParams.get('tema') || hashParams.get('tema');
    const origem = searchParams.get('origem') || hashParams.get('origem');
    const mensagem = document.getElementById('mensagem');
    const form = document.querySelector('form[name="diagnostico-confenge"]');
    if (form && !form.querySelector('input[name="origem"]')) {
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'origem';
      hidden.value = origem || window.location.pathname || '/';
      form.appendChild(hidden);
    } else if (form) {
      const origemInput = form.querySelector('input[name="origem"]');
      if (origemInput && origem) origemInput.value = origem;
    }
    if (mensagem && tema && !mensagem.value) {
      mensagem.value = `Demanda relacionada a: ${tema}.\n\nContexto:\n`;
      mensagem.focus();
    }
    if (tema || origem || window.location.hash.startsWith('#contato')) {
      const contact = document.getElementById('contato');
      if (contact && (tema || origem)) {
        contact.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
