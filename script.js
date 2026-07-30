(() => {
  const normalize = (value) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  /** Decoupled analytics bus — no PII; ready for GA4/Plausible later. */
  const track = (eventName, params = {}) => {
    try {
      const safe = {};
      Object.keys(params || {}).forEach((key) => {
        const val = params[key];
        if (val == null || val === '') return;
        // Never send free-text that may contain email/phone/name
        if (typeof val === 'string' && val.length > 180) return;
        if (typeof val === 'string' && /@|\+?\d{8,}/.test(val)) return;
        safe[key] = val;
      });
      safe.page_path = safe.page_path || (window.location.pathname || '/');
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: eventName, ...safe });
      if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, safe);
      }
      if (typeof window.plausible === 'function') {
        window.plausible(eventName, { props: safe });
      }
      if (window.CONFENGE_DEBUG_ANALYTICS) {
        // eslint-disable-next-line no-console
        console.info('[confenge:analytics]', eventName, safe);
      }
    } catch (_) {
      /* analytics must never break UX */
    }
  };

  const clusterFromPath = (path) => {
    const p = path || '';
    if (p.includes('/medicoes-glosas') || /medicao|glosa|pagamento|parcela-incontroversa|fiscal-nao-assina/.test(p)) return 'medicoes-pagamentos';
    if (p.includes('/aditivos') || /aditivo|demolicao|servico-nao-previsto|item-novo|jogo-de-planilha/.test(p)) return 'aditivos';
    if (p.includes('/reequilibrio') || /reequilibrio|reajuste|repactuacao|curva-abc-reequilibrio/.test(p)) return 'reequilibrio';
    if (p.includes('/defesa-tecnica') || /sancao|multa|impedimento|extincao|rescisao|defesa/.test(p)) return 'defesa-sancoes';
    if (p.includes('/acompanhamento') || /pleito|diario-de-obra|gestao-contrato|comunicacao-fiscal/.test(p)) return 'gestao-pleitos';
    if (p.includes('/atrasos-prorrogacao') || /atraso|prorrogacao|paralisacao|cronograma|chuva/.test(p)) return 'atrasos-prorrogacao';
    if (p.includes('/diagnostico-pre') || /edital|matriz-de-riscos|habilitacao|proposta|visita-tecnica|consorcio/.test(p)) return 'edital-proposta';
    if (p.includes('/auditoria-orcamento') || /sinapi|sicro|bdi|orcamento|composicao|exequibilidade|mobilizacao|administracao-local|desagio|curva-abc-orcamento/.test(p)) return 'orcamento-bdi';
    if (p === '/' || p === '') return 'home';
    if (p.includes('/conteudos')) return 'conteudos';
    return 'other';
  };

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
    let lastSearchTerm = '';
    const apply = () => {
      const q = normalize(search?.value || ''); let visible = 0;
      items.forEach((item) => {
        const matchesText = !q || normalize(item.dataset.search || item.textContent).includes(q);
        const matchesFilter = activeFilter === 'all' || item.dataset.priority === activeFilter;
        item.hidden = !(matchesText && matchesFilter); if (!item.hidden) visible += 1;
      });
      if (count) count.textContent = `${visible} conteúdo${visible === 1 ? '' : 's'} encontrado${visible === 1 ? '' : 's'}`;
      if (search && q && q !== lastSearchTerm && q.length >= 3) {
        lastSearchTerm = q;
        track('internal_search', {
          content_cluster: 'conteudos',
          // hash length only — do not send raw query (may be sensitive)
          query_len: q.length,
          results_count: visible,
        });
      }
    };
    search?.addEventListener('input', apply);
    filters.forEach((button) => button.addEventListener('click', () => { filters.forEach((b) => b.classList.remove('is-active')); button.classList.add('is-active'); activeFilter = button.dataset.filter || 'all'; apply(); }));

    // Lead attribution: ?tema= & ?origem= from article CTAs
    const searchParams = new URLSearchParams((window.location && window.location.search) || '');
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

    const pagePath = window.location.pathname || '/';
    const defaultCluster = clusterFromPath(pagePath);
    const deviceContext = window.matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop';

    // WhatsApp clicks
    document.querySelectorAll('a[href*="wa.me"]').forEach((link) => {
      link.addEventListener('click', () => {
        const position = link.getAttribute('data-cta-position')
          || (link.classList.contains('whatsapp-float') ? 'float' : 'inline');
        const label = (link.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        track('whatsapp_click', {
          page_path: pagePath,
          content_cluster: link.getAttribute('data-content-cluster') || defaultCluster,
          cta_position: position,
          cta_label: label || 'whatsapp',
          device_context: deviceContext,
          destination_type: 'whatsapp',
        });
      });
    });

    // Content → service / commercial CTAs
    document.querySelectorAll('a[href]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (!href.startsWith('/')) return;
      const isService = /\/(auditoria-orcamento-licitacao|medicoes-glosas-obras-publicas|aditivos-obras-publicas|reequilibrio-obras-publicas|atrasos-prorrogacao-obras-publicas|defesa-tecnica-contratos-publicos|diagnostico-pre-licitacao|acompanhamento-contratos-obras)\/?/.test(href);
      const isContact = href.includes('#contato') || href.startsWith('/?tema=');
      if (!isService && !isContact) return;
      link.addEventListener('click', () => {
        const eventName = isContact ? 'service_cta_click' : 'content_to_service_click';
        track(eventName, {
          page_path: pagePath,
          content_cluster: link.getAttribute('data-content-cluster') || defaultCluster,
          cta_position: link.getAttribute('data-cta-position') || 'inline',
          cta_label: (link.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          device_context: deviceContext,
          destination_type: isContact ? 'form' : 'service',
        });
      });
    });

    // Form funnel
    if (form) {
      let formStarted = false;
      const markStart = () => {
        if (formStarted) return;
        formStarted = true;
        track('lead_form_start', {
          page_path: pagePath,
          content_cluster: defaultCluster,
          device_context: deviceContext,
          destination_type: 'form',
        });
      };
      form.querySelectorAll('input, select, textarea').forEach((el) => {
        el.addEventListener('focus', markStart, { once: true });
      });
      form.addEventListener('submit', (event) => {
        if (!form.checkValidity()) {
          track('lead_form_error', {
            page_path: pagePath,
            content_cluster: defaultCluster,
            device_context: deviceContext,
            destination_type: 'form',
          });
          return;
        }
        track('lead_form_submit', {
          page_path: pagePath,
          content_cluster: defaultCluster,
          device_context: deviceContext,
          destination_type: 'form',
          // necessidade is a controlled select — safe enum-like value
          cta_label: (form.querySelector('#necessidade')?.value || '').slice(0, 80),
        });
      });
      form.addEventListener('invalid', () => {
        track('lead_form_error', {
          page_path: pagePath,
          content_cluster: defaultCluster,
          device_context: deviceContext,
          destination_type: 'form',
        });
      }, true);
    }

    // Qualified scroll (once at 50% and 75%)
    const scrollMarks = { 50: false, 75: false };
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const pct = Math.round((window.scrollY / scrollable) * 100);
      [50, 75].forEach((mark) => {
        if (pct >= mark && !scrollMarks[mark]) {
          scrollMarks[mark] = true;
          track('qualified_scroll', {
            page_path: pagePath,
            content_cluster: defaultCluster,
            cta_position: `scroll_${mark}`,
            device_context: deviceContext,
          });
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  };

  window.confengeTrack = track;

  const safeInit = () => {
    try { init(); } catch (err) {
      if (window.CONFENGE_DEBUG_ANALYTICS) console.error('[confenge:init]', err);
    }
  };
  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeInit, { once: true });
  } else if (typeof document !== 'undefined') {
    safeInit();
  }
})();
