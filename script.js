/* CONFENGE public site JS — modular assembly (SYS-03).
 * Source modules: js/modules/analytics.js, nav.js, form.js
 * Rebuild: node scripts/site/build_script_modules.mjs --write
 */
(() => {
  const normalize = (value) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  /** Analytics bus — no PII. First-party collector + optional gtag/plausible. */
  const PII_PARAM_KEYS = new Set([
    'nome', 'name', 'email', 'telefone', 'phone', 'tel', 'whatsapp',
    'mensagem', 'message', 'message_body', 'empresa', 'company',
    'documento', 'document', 'attachment', 'file', 'arquivo',
    'cpf', 'cnpj', 'address', 'endereco', 'full_name',
  ]);
  const analyticsQueue = [];
  let analyticsFlushTimer = null;
  const getSessionId = () => {
    try {
      let sid = sessionStorage.getItem('confenge_sid');
      if (!sid) {
        sid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem('confenge_sid', sid);
      }
      return sid.slice(0, 32);
    } catch (_) {
      return 'anon';
    }
  };
  const flushAnalytics = () => {
    analyticsFlushTimer = null;
    if (!analyticsQueue.length || typeof window.fetch !== 'function') return;
    const batch = analyticsQueue.splice(0, 25);
    const body = JSON.stringify({
      events: batch.map((e) => ({
        event: e.eventName,
        props: e.safe,
        path: e.safe.page_path || window.location.pathname || '/',
        sid: getSessionId(),
      })),
    });
    const url = '/.netlify/functions/collect';
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(url, blob)) return;
      }
    } catch (_) { /* fall through */ }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      keepalive: true,
    }).catch(() => { /* never break UX */ });
  };
  const track = (eventName, params = {}) => {
    try {
      const safe = {};
      Object.keys(params || {}).forEach((key) => {
        const val = params[key];
        if (val == null || val === '') return;
        // Drop known PII field names even if caller passes them by mistake
        if (PII_PARAM_KEYS.has(String(key).toLowerCase())) return;
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
      analyticsQueue.push({ eventName, safe });
      if (analyticsQueue.length >= 10) flushAnalytics();
      else if (!analyticsFlushTimer) analyticsFlushTimer = setTimeout(flushAnalytics, 2000);
      if (window.CONFENGE_DEBUG_ANALYTICS) {
        // eslint-disable-next-line no-console
        console.info('[confenge:analytics]', eventName, safe);
      }
    } catch (_) {
      /* analytics must never break UX */
    }
  };
  // Flush on page hide
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushAnalytics();
    });
    window.addEventListener('pagehide', flushAnalytics);
  } catch (_) { /* ignore */ }

  /** Field Core Web Vitals (LCP, INP, CLS, TTFB) — anonymous aggregates only */
  const reportVital = (metric, value, rating) => {
    if (!Number.isFinite(value)) return;
    track('web_vital', {
      metric: String(metric).toLowerCase(),
      value: Math.round(value * 1000) / 1000,
      rating: rating || undefined,
      nav: (performance.getEntriesByType && performance.getEntriesByType('navigation')[0] || {}).type || 'nav',
    });
  };
  try {
    if (typeof PerformanceObserver !== 'undefined') {
      // LCP
      try {
        const po = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) reportVital('lcp', last.startTime);
        });
        po.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (_) { /* unsupported */ }
      // CLS
      try {
        let cls = 0;
        const po = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (!e.hadRecentInput) cls += e.value;
          }
          reportVital('cls', cls);
        });
        po.observe({ type: 'layout-shift', buffered: true });
      } catch (_) { /* unsupported */ }
      // INP (event timing)
      try {
        let worst = 0;
        const po = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            const d = e.duration || 0;
            if (d > worst) {
              worst = d;
              reportVital('inp', worst);
            }
          }
        });
        po.observe({ type: 'event', buffered: true, durationThreshold: 16 });
      } catch (_) { /* unsupported */ }
    }
    // TTFB
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav && nav.responseStart) reportVital('ttfb', nav.responseStart);
    } catch (_) { /* ignore */ }
  } catch (_) { /* never break */ }

  const clusterFromPath = (path) => {
    const p = path || '';
    if (p.includes('/diretoria-b2g')) return 'offer-diretoria-b2g';
    if (p.includes('/diagnostico-b2g-360')) return 'offer-diagnostico-b2g';
    if (p.includes('/bid-room-licitacoes-obras')) return 'offer-bid-room';
    if (p.includes('/defesa-margem-contratos-publicos')) return 'offer-contract-defense';
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
    if (p.includes('/inteligencia') || p.includes('/radar')) return 'pseo';
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

    // Journey rail progressive enhancement — all stages remain in the DOM for no-JS
    document.querySelectorAll('[data-journey-enhance]').forEach((rail) => {
      const tabs = [...rail.querySelectorAll('[data-journey-tab]')];
      const panels = [...rail.querySelectorAll('[data-journey-panel]')];
      if (!tabs.length || !panels.length) return;
      rail.setAttribute('data-enhanced', 'true');
      const activate = (id) => {
        tabs.forEach((t) => t.classList.toggle('is-active', t.getAttribute('data-journey-tab') === id));
        panels.forEach((p) => p.classList.toggle('is-active', p.getAttribute('data-journey-panel') === id));
      };
      tabs.forEach((tab) => {
        tab.addEventListener('click', (event) => {
          const id = tab.getAttribute('data-journey-tab');
          if (!id) return;
          event.preventDefault();
          activate(id);
          const panel = rail.querySelector(`[data-journey-panel="${id}"]`);
          if (panel && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        });
      });
    });

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

    // Lead attribution: ?tema= & ?origem= + pSEO context (URL → sessionStorage)
    const searchParams = new URLSearchParams((window.location && window.location.search) || '');
    const hashParams = window.location.hash.includes('?')
      ? new URLSearchParams(window.location.hash.split('?')[1] || '')
      : new URLSearchParams();
    const PSEO_ATTR_KEYS = [
      'pseo_page_id', 'page_type', 'archetype', 'segment', 'region',
      'agency_id', 'intent', 'source_run_id', 'dataset_hash', 'cta_position',
      'origem', 'origin_url', 'landing_url',
      'route_family', 'cta_id', 'asset_id', 'correlation_id', 'referrer',
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    ];
    const ROUTE_FAMILY_BY_PREFIX = [
      ['/defesa-margem-contratos-publicos/', 'margin-defense'],
      ['/reequilibrio-obras-publicas/', 'reequilibrio'],
      ['/aditivos-obras-publicas/', 'aditivos'],
      ['/medicoes-glosas-obras-publicas/', 'medicoes-glosas'],
      ['/atrasos-prorrogacao-obras-publicas/', 'atrasos'],
      ['/conteudos/matriz-de-riscos-reequilibrio-economico-financeiro/', 'matriz-riscos'],
      ['/conteudos/atraso-pagamento-contrato-publico-suspender/', 'atraso-pagamento'],
      ['/conteudos/bdi-diferenciado-obra-publica/', 'bdi'],
    ];
    const routeFamilyFromPath = (pathname) => {
      const p = String(pathname || '/');
      const hit = ROUTE_FAMILY_BY_PREFIX.find(([prefix]) => p === prefix || p.startsWith(prefix));
      return hit ? hit[1] : '';
    };
    const newCorrelationId = () => {
      try {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
          return window.crypto.randomUUID();
        }
      } catch (_) { /* ignore */ }
      return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    };
    const PSEO_STORAGE_KEY = 'confenge_pseo_attribution';
    const isUuidLike = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    const isPhoneLike = (s) => {
      const compact = String(s || '').replace(/[\s()-]/g, '');
      return /^\+?\d{10,15}$/.test(compact);
    };
    const sanitizeAttr = (val, key) => {
      if (val == null) return '';
      const s = String(val).slice(0, 180);
      if (!s) return '';
      if (/@/.test(s)) return '';
      // correlation ids / UUIDs are not PII — UUID last group is 12 hex digits
      if (key === 'correlation_id' || isUuidLike(s) || s.startsWith('c-')) return s;
      if (isPhoneLike(s)) return '';
      return s;
    };
    const firstNonEmpty = (key, ...vals) => {
      for (const val of vals) {
        const s = sanitizeAttr(val, key);
        if (s) return s;
      }
      return '';
    };
    const readStoredPseo = () => {
      try {
        const raw = sessionStorage.getItem(PSEO_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_) { return {}; }
    };
    const writeStoredPseo = (obj) => {
      try {
        const clean = {};
        Object.keys(obj || {}).forEach((k) => {
          if (!PSEO_ATTR_KEYS.includes(k) && k !== 'tema' && k !== 'saved_at') return;
          const v = sanitizeAttr(obj[k], k);
          if (v) clean[k] = v;
        });
        if (Object.keys(clean).length) {
          clean.saved_at = String(Date.now());
          sessionStorage.setItem(PSEO_STORAGE_KEY, JSON.stringify(clean));
        }
      } catch (_) { /* private mode */ }
    };
    // Capture attribution from URL into sessionStorage (survives home form landing).
    // Only allowlisted keys persist — arbitrary query params are dropped.
    // First-touch: empty values on the current page must not wipe a stored landing/family.
    const storedPrior = readStoredPseo();
    const fromUrl = {};
    PSEO_ATTR_KEYS.forEach((name) => {
      const v = searchParams.get(name) || hashParams.get(name);
      if (v) {
        const s = sanitizeAttr(v, name);
        if (s) fromUrl[name] = s;
      }
    });
    const tema = searchParams.get('tema') || hashParams.get('tema');
    if (tema) {
      const t = sanitizeAttr(tema, 'tema');
      if (t) fromUrl.tema = t;
    }
    const bodyDs = (document.body && document.body.dataset) || {};
    const pathFamily = routeFamilyFromPath(window.location.pathname || '/');
    const currentFamily = firstNonEmpty('route_family', fromUrl.route_family, bodyDs.routeFamily, pathFamily);
    if (currentFamily) fromUrl.route_family = currentFamily;
    else if (storedPrior.route_family) fromUrl.route_family = storedPrior.route_family;
    const currentAsset = firstNonEmpty('asset_id', fromUrl.asset_id, bodyDs.assetId);
    if (currentAsset) fromUrl.asset_id = currentAsset;
    else if (storedPrior.asset_id) fromUrl.asset_id = storedPrior.asset_id;
    const currentCta = firstNonEmpty('cta_id', fromUrl.cta_id, bodyDs.ctaId);
    if (currentCta) fromUrl.cta_id = currentCta;
    else if (storedPrior.cta_id) fromUrl.cta_id = storedPrior.cta_id;
    fromUrl.landing_url = firstNonEmpty(
      'landing_url',
      fromUrl.landing_url,
      storedPrior.landing_url,
      window.location.pathname || '/',
    );
    if (!fromUrl.origin_url && fromUrl.origem) fromUrl.origin_url = fromUrl.origem;
    fromUrl.correlation_id = firstNonEmpty(
      'correlation_id',
      fromUrl.correlation_id,
      storedPrior.correlation_id,
      newCorrelationId(),
    );
    if (!fromUrl.referrer) {
      try { fromUrl.referrer = sanitizeAttr(document.referrer || '', 'referrer'); } catch (_) { /* ignore */ }
    }
    writeStoredPseo({ ...storedPrior, ...fromUrl });
    window.confengeAttribution = {
      ALLOWLIST: PSEO_ATTR_KEYS.slice(),
      sanitize: sanitizeAttr,
      pickFromSearch: (search) => {
        const params = new URLSearchParams(search || '');
        const out = {};
        PSEO_ATTR_KEYS.forEach((name) => {
          const v = params.get(name);
          if (v) {
            const s = sanitizeAttr(v);
            if (s) out[name] = s;
          }
        });
        return out;
      },
      routeFamilyFromPath,
    };
    const storedPseo = readStoredPseo();
    const origem = fromUrl.origem || storedPseo.origem
      || searchParams.get('origem') || hashParams.get('origem');
    const mensagem = document.getElementById('mensagem');
    const form = document.querySelector('form[name="diagnostico-b2g"], form[name="diagnostico-confenge"]');
    const ensureHidden = (fname, fval, force = false) => {
      if (!form || fval == null || fval === '') return;
      let input = form.querySelector(`input[name="${fname}"]`);
      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden';
        input.name = fname;
        form.appendChild(input);
      }
      if (force || !input.value) input.value = String(fval).slice(0, 180);
    };
    const JOURNEY_ACTIONS = {
      contrato: '/obrigado-contrato',
      edital: '/obrigado-edital',
      operacao: '/obrigado-operacao',
    };
    const stageToJourney = (stageVal) => {
      const s = (stageVal || '').toLowerCase();
      if (s.includes('edital') || s.includes('proposta')) return 'edital';
      if (s.includes('contrato') || s.includes('urgente') || s.includes('glosa') || s.includes('execução') || s.includes('execucao')) return 'contrato';
      if (s.includes('operação') || s.includes('operacao') || s.includes('oportunidade') || s.includes('estrutur')) return 'operacao';
      return 'operacao';
    };
    const applyJourneyToForm = (journeyId) => {
      if (!form || !journeyId) return;
      const j = JOURNEY_ACTIONS[journeyId] ? journeyId : 'operacao';
      ensureHidden('jornada', j, true);
      form.setAttribute('action', JOURNEY_ACTIONS[j] || '/obrigado');
      const stage = form.querySelector('#estagio');
      if (stage && !stage.value) {
        const opt = [...stage.options].find((o) => o.getAttribute('data-journey') === j);
        if (opt) stage.value = opt.value;
      }
    };
    if (form) {
      ensureHidden('origem', origem || storedPseo.origem || window.location.pathname || '/');
      ensureHidden('landing_page', sessionStorage.getItem('confenge_landing') || window.location.pathname || '/', true);
      ensureHidden('utm_source', searchParams.get('utm_source') || sessionStorage.getItem('utm_source') || '');
      ensureHidden('utm_medium', searchParams.get('utm_medium') || sessionStorage.getItem('utm_medium') || '');
      ensureHidden('utm_campaign', searchParams.get('utm_campaign') || sessionStorage.getItem('utm_campaign') || '');
      ['utm_source', 'utm_medium', 'utm_campaign'].forEach((k) => {
        const v = searchParams.get(k);
        if (v) {
          try { sessionStorage.setItem(k, sanitizeAttr(v)); } catch (_) { /* private */ }
        }
      });
      try {
        if (!sessionStorage.getItem('confenge_landing')) {
          sessionStorage.setItem('confenge_landing', window.location.pathname || '/');
        }
      } catch (_) { /* private */ }
      PSEO_ATTR_KEYS.forEach((name) => {
        const val = fromUrl[name] || storedPseo[name];
        if (val) ensureHidden(name, val);
      });
      const journeyParam = searchParams.get('jornada') || hashParams.get('jornada');
      if (journeyParam) applyJourneyToForm(journeyParam);
    }
    if (mensagem && (tema || storedPseo.tema) && !mensagem.value) {
      const t = tema || storedPseo.tema;
      mensagem.value = `Demanda relacionada a: ${t}.\n\nContexto:\n`;
      mensagem.focus();
    }
    if (tema || origem || fromUrl.pseo_page_id || storedPseo.pseo_page_id
      || window.location.hash.startsWith('#contato')
      || searchParams.get('jornada')) {
      const contact = document.getElementById('contato');
      if (contact && (tema || origem || fromUrl.pseo_page_id || storedPseo.pseo_page_id
        || searchParams.get('jornada') || window.location.hash.startsWith('#contato'))) {
        contact.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    // Journey preselect from CTA links
    document.querySelectorAll('[data-set-journey]').forEach((el) => {
      el.addEventListener('click', () => {
        applyJourneyToForm(el.getAttribute('data-set-journey'));
      });
    });

    const pagePath = window.location.pathname || '/';
    const defaultCluster = clusterFromPath(pagePath);
    const deviceContext = window.matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop';

    // Service / offer page view
    if (document.body?.getAttribute('data-content-cluster') === 'offer'
      || /\/(diretoria-b2g|diagnostico-b2g-360|bid-room|defesa-margem|medicoes-glosas|aditivos|reequilibrio|auditoria-orcamento|diagnostico-pre|defesa-tecnica|acompanhamento|atrasos)/.test(pagePath)) {
      track('service_page_view', {
        page_path: pagePath,
        content_cluster: defaultCluster,
        device_context: deviceContext,
        offer_id: document.body?.getAttribute('data-offer-id') || '',
        journey: document.body?.getAttribute('data-journey') || '',
      });
    }

    // Editorial / legal / guide / case-law page views (Wave 1 inbound)
    const editorialType = document.body?.getAttribute('data-content-type') || '';
    const editorialTopic = document.body?.getAttribute('data-editorial-topic')
      || document.body?.getAttribute('data-topic') || '';
    const editorialJourney = document.body?.getAttribute('data-journey') || '';
    if (editorialType && editorialType !== 'hub') {
      const viewByType = {
        lei_14133: 'legal_article_view',
        jurisprudencia: 'case_law_page_view',
        guia: 'checklist_view',
        inteligencia: 'data_insight_view',
      };
      const viewName = viewByType[editorialType] || 'editorial_page_view';
      track(viewName, {
        page_path: pagePath,
        content_type: editorialType,
        topic: editorialTopic.slice(0, 120),
        journey: editorialJourney,
        device_context: deviceContext,
      });
      track('editorial_page_view', {
        page_path: pagePath,
        content_type: editorialType,
        topic: editorialTopic.slice(0, 120),
        journey: editorialJourney,
        device_context: deviceContext,
      });
    } else if (/\/(lei-14133-obras|jurisprudencia-contratos-obras|guias-contratos-obras)\//.test(pagePath)) {
      track('editorial_page_view', {
        page_path: pagePath,
        content_type: editorialType || 'editorial',
        topic: editorialTopic.slice(0, 120),
        journey: editorialJourney,
        device_context: deviceContext,
      });
    }

    // WhatsApp clicks
    document.querySelectorAll('a[href*="wa.me"]').forEach((link) => {
      link.addEventListener('click', () => {
        const position = link.getAttribute('data-cta-position')
          || (link.classList.contains('whatsapp-float') ? 'float' : 'inline');
        const label = (link.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        const isEditorial = !!(editorialType || /\/(lei-14133-obras|jurisprudencia-contratos-obras|guias-contratos-obras|inteligencia)\//.test(pagePath));
        track('whatsapp_click', {
          page_path: pagePath,
          content_cluster: link.getAttribute('data-content-cluster') || defaultCluster,
          cta_position: position,
          cta_label: label || 'whatsapp',
          device_context: deviceContext,
          destination_type: 'whatsapp',
          journey: link.getAttribute('data-journey') || form?.querySelector('#jornada-hidden')?.value || editorialJourney || '',
        });
        if (isEditorial) {
          track(editorialType === 'inteligencia' ? 'pseo_whatsapp_click' : 'editorial_whatsapp_click', {
            page_path: pagePath,
            content_type: editorialType || 'editorial',
            topic: editorialTopic.slice(0, 120),
            cta_position: position,
            journey: editorialJourney,
            device_context: deviceContext,
          });
        }
      });
    });

    // Email clicks
    document.querySelectorAll('a[href^="mailto:"]').forEach((link) => {
      link.addEventListener('click', () => {
        const isEditorial = !!(editorialType || /\/(lei-14133-obras|jurisprudencia-contratos-obras|guias-contratos-obras|inteligencia)\//.test(pagePath));
        track('email_click', {
          page_path: pagePath,
          content_cluster: defaultCluster,
          cta_position: link.getAttribute('data-cta-position') || 'inline',
          device_context: deviceContext,
          destination_type: 'email',
        });
        if (isEditorial) {
          track(editorialType === 'inteligencia' ? 'pseo_email_click' : 'editorial_email_click', {
            page_path: pagePath,
            content_type: editorialType || 'editorial',
            topic: editorialTopic.slice(0, 120),
            cta_position: link.getAttribute('data-cta-position') || 'inline',
            journey: editorialJourney,
            device_context: deviceContext,
          });
        }
      });
    });

    // Content → service / commercial CTAs
    document.querySelectorAll('a[href]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (!href.startsWith('/')) return;
      const isOffer = /\/(diretoria-b2g|diagnostico-b2g-360|bid-room-licitacoes-obras|defesa-margem-contratos-publicos)\/?/.test(href);
      const isService = /\/(auditoria-orcamento-licitacao|medicoes-glosas-obras-publicas|aditivos-obras-publicas|reequilibrio-obras-publicas|atrasos-prorrogacao-obras-publicas|defesa-tecnica-contratos-publicos|diagnostico-pre-licitacao|acompanhamento-contratos-obras)\/?/.test(href);
      const isContact = href.includes('#contato') || href.startsWith('/?tema=');
      if (!isService && !isContact && !isOffer) return;
      link.addEventListener('click', () => {
        const eventName = isContact
          ? 'service_cta_click'
          : (isOffer ? 'offer_cta_click' : 'content_to_service_click');
        track(eventName, {
          page_path: pagePath,
          content_cluster: link.getAttribute('data-content-cluster') || defaultCluster,
          cta_position: link.getAttribute('data-cta-position') || 'inline',
          cta_label: (link.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          device_context: deviceContext,
          destination_type: isContact ? 'form' : (isOffer ? 'offer' : 'service'),
          offer_id: link.getAttribute('data-offer-id') || '',
          source_page_type: document.body?.getAttribute('data-content-cluster') || defaultCluster,
        });
      });
    });

    // Named commercial CTA events (hero / final / diagnostic)
    document.querySelectorAll('[data-event-name]').forEach((el) => {
      el.addEventListener('click', () => {
        const eventName = el.getAttribute('data-event-name');
        const allowed = {
          diagnostic_cta_click: 1,
          critical_decision_cta_click: 1,
          offer_cta_click: 1,
          offer_view: 1,
          proof_expand: 1,
          comparison_view: 1,
          cta_click: 1,
        };
        if (!eventName || !allowed[eventName]) return;
        track(eventName, {
          page_path: pagePath,
          content_cluster: el.getAttribute('data-content-cluster') || defaultCluster,
          cta_position: el.getAttribute('data-cta-position') || 'inline',
          cta_label: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          device_context: deviceContext,
          offer_id: el.getAttribute('data-offer-id')
            || document.body?.getAttribute('data-offer-id')
            || '',
          source_page_type: document.body?.getAttribute('data-content-cluster') || defaultCluster,
          asset_id: el.getAttribute('data-asset-id')
            || document.body?.getAttribute('data-asset-id')
            || '',
          route_family: el.getAttribute('data-route-family')
            || document.body?.getAttribute('data-route-family')
            || '',
          cta_id: el.getAttribute('data-cta-id')
            || el.closest?.('[data-cta-id]')?.getAttribute('data-cta-id')
            || '',
        });
      });
    });

    // Offer page view + comparison section view (once)
    if (document.body?.getAttribute('data-offer-id')) {
      track('offer_view', {
        page_path: pagePath,
        content_cluster: defaultCluster,
        device_context: deviceContext,
        offer_id: document.body.getAttribute('data-offer-id'),
        source_page_type: 'offer',
      });
    }
    const comparison = document.querySelector('[data-comparison-view]');
    if (comparison && 'IntersectionObserver' in window) {
      const compObs = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          track('comparison_view', {
            page_path: pagePath,
            content_cluster: defaultCluster,
            device_context: deviceContext,
            cta_position: 'comparison',
          });
          compObs.disconnect();
        });
      }, { threshold: 0.35 });
      compObs.observe(comparison);
    }

    // Form funnel (multi-step progressive enhancement)
    if (form) {
      let formStarted = false;

      let formStep = 1;
      const multi = form.getAttribute('data-form-multistep') === 'true';
      const step1 = form.querySelector('[data-form-step="1"]');
      const step2 = form.querySelector('[data-form-step="2"]');
      const statusEl = form.querySelector('.form-status');
      const emailEl = form.querySelector('#email');
      const phoneEl = form.querySelector('#telefone');
      const estagioEl = form.querySelector('#estagio');
      const urgenciaEl = form.querySelector('#urgencia');
      const nomeEl = form.querySelector('#nome');

      const showFormStatus = (msg, kind) => {
        if (!statusEl) return;
        statusEl.hidden = !msg;
        statusEl.textContent = msg || '';
        statusEl.classList.toggle('is-error', kind === 'error');
        statusEl.classList.toggle('is-ok', kind === 'ok');
      };
      const markStart = () => {
        if (formStarted) return;
        formStarted = true;
        track('lead_form_start', {
          page_path: pagePath,
          content_cluster: defaultCluster,
          device_context: deviceContext,
          destination_type: 'form',
          journey: form.querySelector('#jornada-hidden')?.value || stageToJourney(estagioEl?.value) || '',
        });
      };
      form.querySelectorAll('input, select, textarea').forEach((el) => {
        el.addEventListener('focus', markStart, { once: true });
      });

      const setStep = (n) => {
        formStep = n;
        if (step1) step1.classList.toggle('is-active', n === 1);
        if (step2) step2.classList.toggle('is-active', n === 2);
        form.querySelectorAll('[data-step-indicator]').forEach((ind) => {
          const sn = Number(ind.getAttribute('data-step-indicator'));
          ind.classList.toggle('is-active', sn === n);
          ind.classList.toggle('is-done', sn < n);
        });
        const stepHeading = form.querySelector(`[data-form-step="${n}"] h2, [data-form-step="${n}"] h3, [data-form-step="${n}"] [data-step-heading]`);
        const focusTarget = stepHeading
          || (n === 2
            ? form.querySelector('#empresa') || form.querySelector('#urgencia')
            : nomeEl);
        if (focusTarget) {
          if (stepHeading && !focusTarget.hasAttribute('tabindex')) focusTarget.setAttribute('tabindex', '-1');
          try { focusTarget.focus({ preventScroll: false }); } catch (_) { focusTarget.focus(); }
        }
      };

      const clearContactValidity = () => {
        emailEl?.setCustomValidity('');
        phoneEl?.setCustomValidity('');
        emailEl?.classList.remove('is-invalid');
        phoneEl?.classList.remove('is-invalid');
      };
      const requireEmailOrPhone = () => {
        clearContactValidity();
        const email = (emailEl?.value || '').trim();
        const phone = (phoneEl?.value || '').trim();
        if (email || phone) return true;
        const msg = 'Informe e-mail ou WhatsApp para retorno.';
        if (emailEl) {
          emailEl.setCustomValidity(msg);
          emailEl.classList.add('is-invalid');
        }
        if (phoneEl) {
          phoneEl.setCustomValidity(msg);
          phoneEl.classList.add('is-invalid');
        }
        showFormStatus(msg, 'error');
        return false;
      };
      const validateStep1 = () => {
        markStart();
        let ok = true;
        if (nomeEl && !(nomeEl.value || '').trim()) {
          nomeEl.setCustomValidity('Informe seu nome.');
          nomeEl.classList.add('is-invalid');
          ok = false;
        } else {
          nomeEl?.setCustomValidity('');
          nomeEl?.classList.remove('is-invalid');
        }
        if (!requireEmailOrPhone()) ok = false;
        if (estagioEl && !estagioEl.value) {
          estagioEl.setCustomValidity('Selecione o tipo de necessidade.');
          estagioEl.classList.add('is-invalid');
          ok = false;
        } else {
          estagioEl?.setCustomValidity('');
          estagioEl?.classList.remove('is-invalid');
        }
        if (!ok) {
          form.reportValidity();
          const firstInvalid = form.querySelector('.is-invalid, :invalid');
          const errSummary = form.querySelector('[data-form-error-summary], #form-status, [role="alert"]');
          if (firstInvalid && typeof firstInvalid.focus === 'function') {
            try { firstInvalid.focus({ preventScroll: false }); } catch (_) { firstInvalid.focus(); }
            if (typeof firstInvalid.scrollIntoView === 'function') {
              firstInvalid.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
          } else if (errSummary && typeof errSummary.focus === 'function') {
            if (!errSummary.hasAttribute('tabindex')) errSummary.setAttribute('tabindex', '-1');
            try { errSummary.focus({ preventScroll: false }); } catch (_) { errSummary.focus(); }
          }
          track('lead_form_error', {
            page_path: pagePath,
            content_cluster: defaultCluster,
            device_context: deviceContext,
            destination_type: 'form',
            form_step: 1,
          });
          return false;
        }
        showFormStatus('', '');
        const j = stageToJourney(estagioEl?.value);
        applyJourneyToForm(j);
        return true;
      };

      estagioEl?.addEventListener('change', () => {
        const v = (estagioEl.value || '').slice(0, 80);
        if (!v) return;
        const j = stageToJourney(v);
        applyJourneyToForm(j);
        track('qualification_stage_select', {
          page_path: pagePath,
          content_cluster: defaultCluster,
          device_context: deviceContext,
          stage_category: v,
          journey: j,
        });
      });
      urgenciaEl?.addEventListener('change', () => {
        const v = (urgenciaEl.value || '').slice(0, 80);
        if (!v) return;
        track('qualification_urgency_select', {
          page_path: pagePath,
          content_cluster: defaultCluster,
          device_context: deviceContext,
          urgency_category: v,
          journey: form.querySelector('#jornada-hidden')?.value || '',
        });
      });
      emailEl?.addEventListener('input', () => { clearContactValidity(); showFormStatus('', ''); });
      phoneEl?.addEventListener('input', () => { clearContactValidity(); showFormStatus('', ''); });

      form.querySelectorAll('[data-form-next]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!validateStep1()) return;
          if (multi) {
            setStep(2);
            track('lead_form_step', {
              page_path: pagePath,
              content_cluster: defaultCluster,
              device_context: deviceContext,
              form_step: 2,
              journey: form.querySelector('#jornada-hidden')?.value || stageToJourney(estagioEl?.value),
              stage_category: (estagioEl?.value || '').slice(0, 80),
            });
          }
        });
      });
      form.querySelectorAll('[data-form-back]').forEach((btn) => {
        btn.addEventListener('click', () => {
          setStep(1);
          track('lead_form_step', {
            page_path: pagePath,
            content_cluster: defaultCluster,
            device_context: deviceContext,
            form_step: 1,
            journey: form.querySelector('#jornada-hidden')?.value || '',
          });
        });
      });

      form.addEventListener('submit', (event) => {
        if (multi && formStep < 2) {
          // allow no-js full submit; with js require step 2 visible
          if (step2 && !step2.classList.contains('is-active')) {
            event.preventDefault();
            if (validateStep1()) setStep(2);
            return;
          }
        }
        if (!requireEmailOrPhone() || !form.checkValidity()) {
          event.preventDefault();
          form.reportValidity();
          track('lead_form_error', {
            page_path: pagePath,
            content_cluster: defaultCluster,
            device_context: deviceContext,
            destination_type: 'form',
            form_step: formStep,
          });
          return;
        }
        const journey = form.querySelector('#jornada-hidden')?.value
          || stageToJourney(estagioEl?.value);
        applyJourneyToForm(journey);
        showFormStatus('', '');
        const assetId = (form.querySelector('[name="asset_id"]')?.value || '').slice(0, 80);
        const routeFamily = (form.querySelector('[name="route_family"]')?.value || '').slice(0, 80);
        const publicSlug = (form.querySelector('[name="public_id_slug"]')?.value || '').slice(0, 80);
        const ctaId = (form.querySelector('[name="cta_id"]')?.value || '').slice(0, 80);
        track('lead_form_submit', {
          page_path: pagePath,
          content_cluster: defaultCluster,
          device_context: deviceContext,
          destination_type: 'form',
          stage_category: (estagioEl?.value || '').slice(0, 80),
          urgency_category: (urgenciaEl?.value || '').slice(0, 80),
          journey: journey || '',
          cta_label: (estagioEl?.value || '').slice(0, 80),
        });
        if (assetId) {
          track('cta_click', {
            page_path: pagePath,
            route_family: routeFamily,
            asset_id: assetId,
            cta_id: ctaId,
          });
        }

        // Progressive enhancement: POST to production lead function (receipt-bearing),
        // then FormSubmit/Netlify Forms, then WhatsApp operational fallback.
        if (typeof window.fetch === 'function' && form.getAttribute('data-ajax') !== 'false') {
          event.preventDefault();
          const dest = JOURNEY_ACTIONS[journey] || form.getAttribute('action') || '/obrigado';
          const fd = new FormData(form);
          if (!fd.get('form-name')) fd.set('form-name', form.getAttribute('name') || 'diagnostico-b2g');
          if (!fd.get('jornada')) fd.set('jornada', journey || '');
          const payload = {};
          fd.forEach((val, key) => { payload[key] = String(val); });
          const submitBtn = form.querySelector('[type="submit"]');
          if (submitBtn) submitBtn.disabled = true;
          showFormStatus('Enviando…', 'ok');
          const finishOk = (receipt) => {
            const protocol = (receipt && (receipt.lead_id || receipt.receipt_id))
              ? String(receipt.lead_id || receipt.receipt_id).slice(0, 32)
              : '';
            track('lead_form_success', {
              page_path: pagePath,
              content_cluster: defaultCluster,
              device_context: deviceContext,
              destination_type: 'form',
              journey: journey || '',
              receipt_id: protocol,
            });
            track('lead_persisted', {
              page_path: pagePath,
              content_cluster: defaultCluster,
              journey: journey || '',
              conversion: 'lead_persisted',
            });
            track('lead_created', {
              page_path: pagePath,
              route_family: routeFamily,
              asset_id: assetId,
              public_id_slug: publicSlug,
              source: 'CONFENGE_WEB',
            });
            try {
              if (protocol) sessionStorage.setItem('confenge_last_receipt', protocol);
            } catch (_) { /* private mode */ }
            const q = protocol
              ? `${dest}${dest.includes('?') ? '&' : '?'}receipt=${encodeURIComponent(protocol)}`
              : dest;
            flushAnalytics();
            window.location.assign(q);
          };
          const finishFallback = (reason) => {
            const stage = (estagioEl?.value || '').slice(0, 80);
            const msg = encodeURIComponent(
              `Olá, Tiago. Tentei enviar pelo formulário do site (${stage || journey || 'contato'}) e preciso de retorno. Protocolo local indisponível.`,
            );
            showFormStatus(
              'Não foi possível registrar no servidor. Use o WhatsApp para não perder o contato — o protocolo só aparece após gravação confirmada.',
              'error',
            );
            track('lead_form_backend_error', {
              page_path: pagePath,
              content_cluster: defaultCluster,
              device_context: deviceContext,
              destination_type: 'form_fallback_whatsapp',
              journey: journey || '',
              error_code: String(reason || 'unknown').slice(0, 40),
            });
            const wa = document.createElement('a');
            wa.href = `https://wa.me/5548988344559?text=${msg}`;
            wa.target = '_blank';
            wa.rel = 'noopener';
            wa.className = 'button button-primary';
            wa.textContent = 'Continuar pelo WhatsApp (fallback)';
            if (statusEl && !statusEl.querySelector('[data-wa-fallback]')) {
              wa.setAttribute('data-wa-fallback', '1');
              statusEl.appendChild(document.createElement('br'));
              statusEl.appendChild(wa);
            }
          };
          // Idempotency key for double-submit protection (server-side)
          try {
            payload.idempotency_key = payload.idempotency_key
              || `fe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
          } catch (_) { /* ignore */ }
          // Attribution already injected into hidden fields; ensure landing
          if (!payload.landing_page) payload.landing_page = pagePath;
          // Turnstile token if widget present
          const turnstileInput = form.querySelector('[name="cf-turnstile-response"]');
          if (turnstileInput && turnstileInput.value) {
            payload.turnstile_token = turnstileInput.value;
            payload['cf-turnstile-response'] = turnstileInput.value;
          }
          const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const timeoutId = controller ? setTimeout(() => controller.abort(), 15000) : null;
          fetch('/.netlify/functions/lead', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'Idempotency-Key': payload.idempotency_key || '',
            },
            body: JSON.stringify(payload),
            signal: controller ? controller.signal : undefined,
          }).then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if ((res.status === 201 || res.status === 200) && data && data.ok && (data.lead_id || data.receipt_id)) {
              finishOk(data);
              return;
            }
            if (res.status === 429) {
              showFormStatus('Muitas tentativas. Aguarde um minuto e tente de novo.', 'error');
              track('lead_form_error', {
                page_path: pagePath,
                journey: journey || '',
                error_code: 'rate_limited',
              });
              return;
            }
            throw new Error(data.error || `lead_http_${res.status}`);
          }).catch((err) => {
            finishFallback(err && err.name === 'AbortError' ? 'timeout' : (err && err.message) || 'network');
          }).finally(() => {
            if (timeoutId) clearTimeout(timeoutId);
            if (submitBtn) submitBtn.disabled = false;
          });
        }
      });
      form.addEventListener('invalid', () => {
        track('lead_form_error', {
          page_path: pagePath,
          content_cluster: defaultCluster,
          device_context: deviceContext,
          destination_type: 'form',
          form_step: formStep,
        });
      }, true);
      // Exposes readiness for deterministic UI verification after all handlers bind.
      form.dataset.formReady = 'true';
    }

    // Thank-you page: real form success (Netlify redirect target)
    if (typeof document.body?.getAttribute === 'function'
      && document.body.getAttribute('data-lead-success') === '1') {
      track('lead_form_success', {
        page_path: pagePath,
        content_cluster: defaultCluster,
        device_context: deviceContext,
        destination_type: 'form',
        journey: document.body.getAttribute('data-journey') || '',
      });
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

    // pSEO intelligence pages + home form with stored attribution
    const pseoRoot = document.body;
    const isPseoPage = !!(pseoRoot && (pseoRoot.getAttribute('data-pseo-page-id')
      || pseoRoot.getAttribute('data-pseo-page-type')
      || pagePath.includes('/inteligencia/')
      || pagePath.includes('/radar/')));
    const storedAttr = readStoredPseo();
    const hasPseoContext = isPseoPage
      || !!(storedAttr.pseo_page_id || storedAttr.page_type || fromUrl.pseo_page_id);

    const pseoBase = {
      page_path: pagePath,
      content_cluster: 'pseo',
      page_type: (pseoRoot && pseoRoot.getAttribute('data-pseo-page-type'))
        || storedAttr.page_type || fromUrl.page_type || 'unknown',
      pseo_page_id: (pseoRoot && pseoRoot.getAttribute('data-pseo-page-id'))
        || storedAttr.pseo_page_id || fromUrl.pseo_page_id || '',
      device_context: deviceContext,
      archetype: storedAttr.archetype || fromUrl.archetype || '',
      segment: storedAttr.segment || fromUrl.segment || '',
      region: storedAttr.region || fromUrl.region || '',
      intent: storedAttr.intent || fromUrl.intent || '',
      source_run_id: storedAttr.source_run_id || fromUrl.source_run_id || '',
      dataset_hash: storedAttr.dataset_hash || fromUrl.dataset_hash || '',
    };

    // Persist body-level pSEO markers when on a leaf page
    if (isPseoPage && pseoRoot) {
      const bodyAttr = {
        pseo_page_id: pseoRoot.getAttribute('data-pseo-page-id') || '',
        page_type: pseoRoot.getAttribute('data-pseo-page-type') || '',
        origem: pagePath,
        origin_url: pagePath,
      };
      writeStoredPseo({ ...storedAttr, ...bodyAttr });
    }

    if (hasPseoContext) {
      // Prefill hidden fields (home form after CTA or native pSEO form)
      if (form) {
        PSEO_ATTR_KEYS.forEach((name) => {
          const fromBody = name === 'pseo_page_id'
            ? (pseoRoot && pseoRoot.getAttribute('data-pseo-page-id'))
            : (name === 'page_type' ? (pseoRoot && pseoRoot.getAttribute('data-pseo-page-type')) : null);
          const val = fromUrl[name] || storedAttr[name] || fromBody;
          if (val) ensureHidden(name, val);
        });
      }
      document.querySelectorAll('[data-pseo-event]').forEach((el) => {
        el.addEventListener('click', () => {
          const eventName = el.getAttribute('data-pseo-event') || 'pseo_cta_click';
          const allowed = {
            pseo_cta_click: 1,
            pseo_table_interaction: 1,
            pseo_source_open: 1,
            pseo_related_page_click: 1,
            pseo_form_start: 1,
            pseo_form_submit: 1,
            pseo_whatsapp_click: 1,
          };
          if (!allowed[eventName]) return;
          // Persist CTA click context before navigation
          const ctaPos = el.getAttribute('data-cta-position') || 'inline';
          writeStoredPseo({
            ...readStoredPseo(),
            ...pseoBase,
            cta_position: ctaPos,
            origem: pseoBase.pseo_page_id ? pagePath : (storedAttr.origem || pagePath),
          });
          track(eventName, {
            page_path: pseoBase.page_path,
            content_cluster: 'pseo',
            page_type: pseoBase.page_type,
            pseo_page_id: pseoBase.pseo_page_id,
            device_context: deviceContext,
            cta_position: ctaPos,
            destination_type: (el.getAttribute('href') || '').includes('wa.me') ? 'whatsapp' : 'link',
          });
        });
      });
      document.querySelectorAll('[data-pseo-table]').forEach((table) => {
        table.addEventListener('click', () => {
          track('pseo_table_interaction', {
            page_path: pseoBase.page_path,
            content_cluster: 'pseo',
            page_type: pseoBase.page_type,
            pseo_page_id: pseoBase.pseo_page_id,
            device_context: deviceContext,
            cta_position: 'table',
          });
        }, { once: true });
      });
      document.querySelectorAll('a[href*="wa.me"]').forEach((link) => {
        link.addEventListener('click', () => {
          track('pseo_whatsapp_click', {
            page_path: pseoBase.page_path,
            content_cluster: 'pseo',
            page_type: pseoBase.page_type,
            pseo_page_id: pseoBase.pseo_page_id,
            device_context: deviceContext,
            cta_position: link.getAttribute('data-cta-position') || 'inline',
            destination_type: 'whatsapp',
          });
        });
      });
      // Form start/submit on home OR pSEO when attribution present — not pathname-bound
      if (form && (pseoBase.pseo_page_id || storedAttr.pseo_page_id || fromUrl.pseo_page_id)) {
        let pseoFormStarted = false;
        const markPseoStart = () => {
          if (pseoFormStarted) return;
          pseoFormStarted = true;
          track('pseo_form_start', {
            page_path: pagePath,
            content_cluster: 'pseo',
            page_type: pseoBase.page_type,
            pseo_page_id: pseoBase.pseo_page_id || storedAttr.pseo_page_id,
            device_context: deviceContext,
            destination_type: 'form',
            source_run_id: pseoBase.source_run_id || storedAttr.source_run_id || '',
            dataset_hash: pseoBase.dataset_hash || storedAttr.dataset_hash || '',
          });
        };
        form.querySelectorAll('input, select, textarea').forEach((el) => {
          el.addEventListener('focus', markPseoStart, { once: true });
        });
        form.addEventListener('submit', () => {
          if (form.checkValidity()) {
            track('pseo_form_submit', {
              page_path: pagePath,
              content_cluster: 'pseo',
              page_type: pseoBase.page_type,
              pseo_page_id: pseoBase.pseo_page_id || storedAttr.pseo_page_id,
              device_context: deviceContext,
              destination_type: 'form',
              cta_label: (form.querySelector('#necessidade')?.value || '').slice(0, 80),
              source_run_id: pseoBase.source_run_id || storedAttr.source_run_id || '',
              dataset_hash: pseoBase.dataset_hash || storedAttr.dataset_hash || '',
            });
          }
        });
      }
    }
  };

  window.confengeTrack = track;

  /** Optional Cloudflare Turnstile — only loads when a public sitekey is present. */
  const initTurnstile = () => {
    try {
      const slot = document.getElementById('turnstile-slot');
      if (!slot) return;
      const key = (
        slot.getAttribute('data-turnstile-sitekey')
        || window.CONFENGE_TURNSTILE_SITEKEY
        || document.querySelector('meta[name="turnstile-sitekey"]')?.getAttribute('content')
        || ''
      ).trim();
      if (!key || key === 'SITEKEY' || key.length < 10) return;
      slot.hidden = false;
      const widget = slot.querySelector('.cf-turnstile');
      if (widget) widget.setAttribute('data-sitekey', key);
      if (document.querySelector('script[data-confenge-turnstile]')) return;
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      s.defer = true;
      s.setAttribute('data-confenge-turnstile', '1');
      document.head.appendChild(s);
    } catch (_) { /* optional anti-abuse */ }
  };

  const safeInit = () => {
    try {
      init();
      initTurnstile();
      // Session + page view (no PII)
      try {
        const path = window.location.pathname || '/';
        if (!sessionStorage.getItem('confenge_session_logged')) {
          sessionStorage.setItem('confenge_session_logged', '1');
          track('session_start', {
            page_path: path,
            content_cluster: clusterFromPath(path),
            landing_page: path,
          });
        }
        track('page_view', {
          page_path: path,
          content_cluster: clusterFromPath(path),
          referrer_host: (() => {
            try { return document.referrer ? new URL(document.referrer).hostname.slice(0, 80) : ''; } catch (_) { return ''; }
          })(),
        });
        if (document.body && document.body.getAttribute('data-lead-success') === '1') {
          track('confirmation_view', {
            page_path: path,
            journey: document.body.getAttribute('data-journey') || '',
            conversion: 'confirmation',
          });
        }
        document.querySelectorAll('[data-copy-email]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const email = btn.getAttribute('data-copy-email') || 'tiago.sasaki@confenge.com.br';
            try {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(email);
              } else {
                const ta = document.createElement('textarea');
                ta.value = email;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
              }
              const prev = btn.textContent;
              btn.textContent = 'Copiado';
              setTimeout(() => { btn.textContent = prev; }, 1500);
              track('email_click', { page_path: path, destination_type: 'copy_email' });
            } catch (_) { /* ignore */ }
          });
        });
      } catch (_) { /* ignore */ }
    } catch (err) {
      if (window.CONFENGE_DEBUG_ANALYTICS) console.error('[confenge:init]', err);
    }
  };
  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeInit, { once: true });
  } else if (typeof document !== 'undefined') {
    safeInit();
  }
})();
