/* CONFENGE public site JS — modular assembly (SYS-03).
 * Source modules: js/modules/analytics.js, nav.js, form.js
 * Rebuild: node scripts/site/build_script_modules.mjs --write
 */
/* MODULE analytics — BR-PRIV-01 no-PII analytics bus (SYS-03)
 * Runtime: assembled into /script.js. Do not load alone.
 */
(() => {
  const normalize = (value) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  /** Analytics bus — no PII. First-party collector + optional gtag/plausible. */
  // EVENT_CONTRACT_CLIENT_START — keep in lockstep with netlify/functions/lib/event-registry.json
  const EVENT_CONTRACT_SCHEMA_VERSION = '1.1.0';
  const EVENT_SOURCE = 'CONFENGE_WEB';
  const EVENT_PII_POLICY = 'aggregate_allowlist_empty';
  const AGGREGATE_PII_ALLOWLIST = [];
  const PII_PARAM_KEYS = new Set([
    'address', 'arquivo', 'attachment', 'cnpj', 'company', 'cpf',
    'document', 'documento', 'edital', 'email', 'empresa', 'endereco',
    'file', 'full_name', 'mensagem', 'message', 'message_body', 'name',
    'nome', 'phone', 'q', 'query', 'search_query', 'tel', 'telefone', 'whatsapp',
  ]);
  const UNKNOWN_SERVICE = 'UNKNOWN_SERVICE';
  const CANONICAL_DESTINATIONS = {
    '/auditoria-orcamento-licitacao/': 'auditoria-orcamento-licitacao',
    '/medicoes-glosas-obras-publicas/': 'medicoes-glosas-obras-publicas',
    '/aditivos-obras-publicas/': 'aditivos-obras-publicas',
    '/reequilibrio-obras-publicas/': 'reequilibrio-obras-publicas',
    '/atrasos-prorrogacao-obras-publicas/': 'atrasos-prorrogacao-obras-publicas',
    '/defesa-tecnica-contratos-publicos/': 'defesa-tecnica-contratos-publicos',
    '/diagnostico-pre-licitacao/': 'diagnostico-pre-licitacao',
    '/acompanhamento-contratos-obras/': 'acompanhamento-contratos-obras',
    '/diretoria-b2g/': 'diretoria-b2g',
    '/diagnostico-b2g-360/': 'diagnostico-b2g-360',
    '/bid-room-licitacoes-obras/': 'bid-room-licitacoes-obras',
    '/defesa-margem-contratos-publicos/': 'defesa-margem-contratos-publicos',
    '/ferramentas/diagnostico-defesa-margem/': 'diagnostico-defesa-margem',
  };
  const ORIGIN_PREFIXES = {
    '/conteudos/': 'editorial',
    '/lei-14133-obras/': 'editorial',
    '/jurisprudencia-contratos-obras/': 'editorial',
    '/guias-contratos-obras/': 'editorial',
    '/analises-contratos-publicos/': 'editorial',
    '/inteligencia/': 'data',
    '/radar/': 'data',
    '/ferramentas/': 'tool',
  };
  const CHROME_PREFIXES = [
    '/especialista/', '/politica-editorial/', '/privacidade/', '/termos-de-uso/',
    '/correcoes/', '/uso-de-ia/', '/conflitos/', '/imprensa/', '/casos/',
    '/nurture/', '/ops/', '/comercial/', '/obrigado',
  ];
  const EVENT_ALIASES = {
    qualified_scroll: 'scroll_depth',
    content_to_service_click: 'content_to_service',
    service_view: 'service_page_view',
    service_cta: 'cta_click',
    service_cta_click: 'cta_click',
    offer_cta_click: 'cta_click',
    diagnostic_cta_click: 'cta_click',
    critical_decision_cta_click: 'cta_click',
    pseo_cta_click: 'cta_click',
    pseo_whatsapp_click: 'whatsapp_click',
    editorial_whatsapp_click: 'whatsapp_click',
    pseo_email_click: 'email_click',
    editorial_email_click: 'email_click',
    pseo_form_start: 'lead_form_start',
    form_start: 'lead_form_start',
    pseo_form_submit: 'lead_form_submit',
    pseo_to_service: 'content_to_service',
    tool_use: 'tool_start',
    tool_result: 'tool_complete',
    lead_created: 'lead_persisted',
  };
  const EVENT_CTA_KIND = {
    service_cta_click: 'service',
    offer_cta_click: 'offer',
    diagnostic_cta_click: 'diagnostic',
    critical_decision_cta_click: 'critical_decision',
    pseo_cta_click: 'pseo',
  };
  const ADMITTED_EVENTS = {
    analysis_click: 1, answer_view: 1, asset_view: 1, case_law_page_view: 1,
    checklist_view: 1, comparison_view: 1, confirmation_view: 1, content_to_service: 1,
    contract_analyzed: 1, contract_selected: 1, correction_open: 1, cta_click: 1,
    cta_view: 1, data_insight_view: 1, editorial_page_view: 1, email_click: 1,
    evidence_drilldown: 1, field_abandonment: 1, handraise_complete: 1, internal_search: 1,
    lead_form_backend_error: 1, lead_form_error: 1, lead_form_start: 1, lead_form_step: 1,
    lead_form_submit: 1, lead_form_success: 1, lead_persisted: 1, lead_receipt_correlated: 1,
    legal_article_view: 1, method_open: 1, nurture_opt_in: 1, offer_view: 1,
    organic_landing: 1, outbound_click: 1, page_view: 1, proof_expand: 1,
    pseo_related_page_click: 1, pseo_source_open: 1, pseo_table_interaction: 1,
    qualification_stage_select: 1, qualification_urgency_select: 1,
    return_visit: 1, scroll_depth: 1, service_page_view: 1, session_start: 1,
    tool_complete: 1, tool_copy: 1, tool_download: 1, tool_reset: 1, tool_start: 1,
    tool_to_content: 1, tool_to_form: 1, tool_to_offer: 1, tool_to_whatsapp: 1,
    tool_view: 1, web_vital: 1, whatsapp_click: 1, xray_complete: 1, xray_error: 1,
    xray_start: 1, xray_timeout: 1,
  };
  const OBSERVED_ONLY_EVENTS = { qualified_lead: 1, pipeline: 1 };
  const RETIRED_EVENTS = { conversion: 1, journey_nav_click: 1 };
  const ENVELOPE_ID_KEYS = { correlation_id: 1, idempotency_key: 1, event_id: 1 };
  // EVENT_CONTRACT_CLIENT_END
  window.__CONFENGE_EVENT_CONTRACT = {
    schema_version: EVENT_CONTRACT_SCHEMA_VERSION,
    source: EVENT_SOURCE,
    pii_policy: EVENT_PII_POLICY,
    aggregate_pii_allowlist: AGGREGATE_PII_ALLOWLIST,
    admitted: ADMITTED_EVENTS,
    observed_only: OBSERVED_ONLY_EVENTS,
    aliases: EVENT_ALIASES,
    retired: RETIRED_EVENTS,
    unknown_service: UNKNOWN_SERVICE,
    destinations: CANONICAL_DESTINATIONS,
    origin_prefixes: ORIGIN_PREFIXES,
  };
  const analyticsQueue = [];
  let analyticsFlushTimer = null;
  const trackedEventIds = new Set();
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
  const resolveTrackedName = (raw) => {
    const name = String(raw || '').slice(0, 64);
    if (!name) return { ok: false, reason: 'empty_name' };
    if (name.startsWith('custom_') || RETIRED_EVENTS[name]) {
      return { ok: false, reason: name.startsWith('custom_') ? 'custom_prefix_forbidden' : 'retired', name };
    }
    const canonical = EVENT_ALIASES[name] || name;
    if (OBSERVED_ONLY_EVENTS[canonical] || OBSERVED_ONLY_EVENTS[name]) {
      return { ok: false, reason: 'observed_owner_only', name };
    }
    if (!ADMITTED_EVENTS[canonical]) return { ok: false, reason: 'unknown_event', name };
    return { ok: true, original: name, canonical };
  };
  const looksLikePiiValue = (val, key) => {
    if (typeof val !== 'string' || !val) return false;
    if (/@/.test(val)) return true;
    const k = String(key || '').toLowerCase();
    if (ENVELOPE_ID_KEYS[k]) return false;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) return false;
    if (val.startsWith('c-')) return false;
    // Public PII filter needle kept for validate_seo; envelope ids already returned.
    if (/@|\+?\d{8,}/.test(val)) return true;
    const compact = val.replace(/[\s()-]/g, '');
    if (/^\+?\d{10,15}$/.test(compact)) return true;
    if (/^\d{14}$/.test(val.trim())) return true;
    return false;
  };
  const track = (eventName, params = {}) => {
    try {
      const resolved = resolveTrackedName(eventName);
      if (!resolved.ok) {
        if (window.CONFENGE_DEBUG_ANALYTICS) {
          // eslint-disable-next-line no-console
          console.info('[confenge:analytics:reject]', eventName, resolved.reason);
        }
        return;
      }
      if (AGGREGATE_PII_ALLOWLIST.length) return;
      const safe = {};
      Object.keys(params || {}).forEach((key) => {
        const val = params[key];
        if (val == null || val === '') return;
        // Drop known PII field names even if caller passes them by mistake
        if (PII_PARAM_KEYS.has(String(key).toLowerCase())) return;
        if (typeof val === 'string' && val.length > 180) return;
        if (looksLikePiiValue(val, key)) return;
        safe[key] = val;
      });
      safe.page_path = safe.page_path || (window.location.pathname || '/');
      safe.source = EVENT_SOURCE;
      safe.schema_version = EVENT_CONTRACT_SCHEMA_VERSION;
      safe.pii_policy = EVENT_PII_POLICY;
      if (!safe.consent) safe.consent = 'not_required';
      if (EVENT_CTA_KIND[resolved.original] && !safe.cta_kind) {
        safe.cta_kind = EVENT_CTA_KIND[resolved.original];
      }
      if (resolved.original !== resolved.canonical) safe.alias_from = resolved.original;
      if (safe.event_id) {
        const eid = String(safe.event_id).slice(0, 80);
        if (trackedEventIds.has(eid)) return;
        trackedEventIds.add(eid);
        if (trackedEventIds.size > 400) {
          const first = trackedEventIds.values().next().value;
          trackedEventIds.delete(first);
        }
        safe.event_id = eid;
      }
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: resolved.canonical, ...safe });
      if (typeof window.gtag === 'function') {
        window.gtag('event', resolved.canonical, safe);
      }
      if (typeof window.plausible === 'function') {
        window.plausible(resolved.canonical, { props: safe });
      }
      analyticsQueue.push({ eventName: resolved.canonical, safe });
      if (analyticsQueue.length >= 10) flushAnalytics();
      else if (!analyticsFlushTimer) analyticsFlushTimer = setTimeout(flushAnalytics, 2000);
      if (window.CONFENGE_DEBUG_ANALYTICS) {
        // eslint-disable-next-line no-console
        console.info('[confenge:analytics]', resolved.canonical, safe);
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

  const canonicalizePath = (value) => {
    let s = String(value || '').trim();
    if (!s) return '';
    s = s.replace(/^https?:\/\/[^/?#]+/i, '');
    s = s.replace(/^\/\/[^/?#]+/, '');
    const cut = s.search(/[?#]/);
    if (cut !== -1) s = s.slice(0, cut);
    if (!s.startsWith('/')) s = `/${s}`;
    s = s.replace(/\/{2,}/g, '/');
    if (s.length > 1 && !s.endsWith('/')) s += '/';
    return s.slice(0, 180);
  };
  const hostFromHref = (href) => {
    const raw = String(href || '').trim();
    const m = raw.match(/^https?:\/\/([^/?#]+)/i) || raw.match(/^\/\/([^/?#]+)/);
    return m ? String(m[1]).toLowerCase().replace(/:\d+$/, '') : '';
  };
  const isConfengeHost = (host) => {
    if (!host) return true;
    const h = String(host).toLowerCase();
    return h === 'confenge.com.br' || h === 'www.confenge.com.br' || h === 'localhost' || h === '127.0.0.1';
  };
  const originFamilyFromPath = (path) => {
    const p = canonicalizePath(path);
    const entries = Object.keys(ORIGIN_PREFIXES).sort((a, b) => b.length - a.length);
    for (let i = 0; i < entries.length; i += 1) {
      const prefix = entries[i];
      if (p === prefix || p.startsWith(prefix)) return ORIGIN_PREFIXES[prefix];
    }
    return null;
  };
  const isChromePath = (path) => {
    const p = canonicalizePath(path);
    if (!p || p === '/') return true;
    for (let i = 0; i < CHROME_PREFIXES.length; i += 1) {
      const prefix = CHROME_PREFIXES[i];
      if (p === prefix || p.startsWith(prefix)) return true;
    }
    return false;
  };
  const assetIdFromPath = (path) => {
    const segs = canonicalizePath(path).split('/').filter(Boolean);
    return segs.length ? segs[segs.length - 1].slice(0, 80) : '';
  };
  const canonicalizeDestination = (href) => {
    const raw = String(href || '').trim();
    if (!raw) return { kind: 'empty', path: '' };
    const lower = raw.toLowerCase();
    if (lower.startsWith('mailto:')) return { kind: 'email', path: '' };
    if (lower.startsWith('tel:') || lower.startsWith('sms:')) return { kind: 'tel', path: '' };
    if (/wa\.me|whatsapp\.com/i.test(raw)) return { kind: 'whatsapp', path: '' };
    const host = hostFromHref(raw);
    if (host && !isConfengeHost(host)) return { kind: 'external', path: '' };
    const path = canonicalizePath(raw.startsWith('/') || /^https?:/i.test(raw) || raw.startsWith('//') ? raw : `/${raw}`);
    if (!path) return { kind: 'empty', path: '' };
    if (looksLikePiiValue(path, 'destination_path')) return { kind: 'pii', path: '' };
    return { kind: 'internal', path };
  };
  const classifyTransition = (input) => {
    const href = input && input.href != null ? String(input.href) : '';
    const originPath = canonicalizePath((input && (input.origin_path || input.originPath)) || '');
    const attrs = (input && (input.attributes || input.attrs)) || {};
    const family = originFamilyFromPath(originPath);
    const dest = canonicalizeDestination(href);
    if (dest.kind === 'whatsapp') return { kind: 'whatsapp', event: 'whatsapp_click' };
    if (dest.kind === 'email') return { kind: 'email', event: 'email_click' };
    if (dest.kind === 'tel' || dest.kind === 'external') {
      return { kind: dest.kind, event: 'outbound_click' };
    }
    if (dest.kind === 'pii' || dest.kind === 'empty') return { kind: dest.kind, event: null };
    if (/#contato/.test(href) || /^\/\?tema=/.test(href)) return { kind: 'contact', event: 'cta_click' };
    if (!family) return { kind: 'not_transition', event: null, origin_family: null, origin_path: originPath };
    const knownId = Object.prototype.hasOwnProperty.call(CANONICAL_DESTINATIONS, dest.path)
      ? CANONICAL_DESTINATIONS[dest.path]
      : null;
    const destFamily = originFamilyFromPath(dest.path);
    if (!knownId && (destFamily || isChromePath(dest.path))) {
      return { kind: 'not_transition', event: null, origin_family: family, origin_path: originPath };
    }
    return {
      kind: 'transition',
      event: 'content_to_service',
      origin_family: family,
      origin_path: originPath,
      source_path: originPath,
      source_asset_id: String(attrs.source_asset_id || attrs.asset_id || '').slice(0, 80) || assetIdFromPath(originPath),
      source_asset_family: String(attrs.source_asset_family || attrs.asset_family || '').slice(0, 80) || family,
      destination_path: dest.path,
      destination_service_id: knownId || UNKNOWN_SERVICE,
      cta_id: String(attrs.cta_id || '').slice(0, 80) || 'unspecified',
      route_family: String(attrs.route_family || '').slice(0, 80) || 'unspecified',
    };
  };
  const makeEventId = () => {
    const sid = getSessionId().replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'anon';
    return `e-${sid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  };

  window.__CONFENGE_EVENT_CONTRACT.canonicalizeDestination = canonicalizeDestination;
  window.__CONFENGE_EVENT_CONTRACT.classifyTransition = classifyTransition;
  window.__CONFENGE_EVENT_CONTRACT.canonicalizePath = canonicalizePath;
  window.__CONFENGE_EVENT_CONTRACT.UNKNOWN_SERVICE = UNKNOWN_SERVICE;

  // Decorative reveal only. Never throw: missing window.setTimeout must not abort form/analytics.
  const scheduleIdle = (fn) => {
    const run = () => { try { fn(); } catch (_) { /* non-critical */ } };
    try {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 2500 });
        return;
      }
    } catch (_) { /* ignore */ }
    const later = (typeof window.setTimeout === 'function' && window.setTimeout)
      || (typeof setTimeout === 'function' && setTimeout);
    if (typeof later === 'function') {
      later(run, 1);
      return;
    }
    run();
  };

  const init = () => {

/* MODULE nav — header / mobile navigation (SYS-03)
 * Runtime: assembled into /script.js. Do not load alone.
 */
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
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          closeMenu(true);
          return;
        }
        if (event.key !== 'Tab' || toggle.getAttribute('aria-expanded') !== 'true') return;
        const focusable = [toggle, ...menu.querySelectorAll('a[href], button:not([disabled])')]
          .filter((element) => element.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
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

    scheduleIdle(() => {
      const reveals = document.querySelectorAll('.reveal');
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if ('IntersectionObserver' in window && !reducedMotion) {
        const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }), { threshold: .08, rootMargin: '0px 0px -35px' });
        reveals.forEach((el) => observer.observe(el));
      } else reveals.forEach((el) => el.classList.add('is-visible'));
    });

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
      'analysis_id', 'evidence_pack_version', 'asset_family', 'query_class',
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
      ['/analises-contratos-publicos/', 'analise-tecnica-contrato'],
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
    const currentAnalysis = firstNonEmpty('analysis_id', fromUrl.analysis_id, bodyDs.analysisId);
    if (currentAnalysis) fromUrl.analysis_id = currentAnalysis;
    else if (storedPrior.analysis_id) fromUrl.analysis_id = storedPrior.analysis_id;
    const currentPack = firstNonEmpty(
      'evidence_pack_version',
      fromUrl.evidence_pack_version,
      bodyDs.evidencePackVersion,
    );
    if (currentPack) fromUrl.evidence_pack_version = currentPack;
    else if (storedPrior.evidence_pack_version) fromUrl.evidence_pack_version = storedPrior.evidence_pack_version;
    const currentAssetFamily = firstNonEmpty('asset_family', fromUrl.asset_family, bodyDs.assetFamily);
    if (currentAssetFamily) fromUrl.asset_family = currentAssetFamily;
    else if (storedPrior.asset_family) fromUrl.asset_family = storedPrior.asset_family;
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

    const namedAllowed = {
      diagnostic_cta_click: 1,
      critical_decision_cta_click: 1,
      offer_cta_click: 1,
      offer_view: 1,
      proof_expand: 1,
      comparison_view: 1,
      cta_click: 1,
    };
    const attrsFromEl = (el) => ({
      source_asset_id: el.getAttribute('data-asset-id')
        || document.body?.getAttribute('data-asset-id')
        || '',
      source_asset_family: el.getAttribute('data-asset-family')
        || document.body?.getAttribute('data-asset-family')
        || '',
      route_family: el.getAttribute('data-route-family')
        || document.body?.getAttribute('data-route-family')
        || '',
      cta_id: el.getAttribute('data-cta-id')
        || el.closest?.('[data-cta-id]')?.getAttribute('data-cta-id')
        || '',
      asset_id: el.getAttribute('data-asset-id')
        || document.body?.getAttribute('data-asset-id')
        || '',
      asset_family: el.getAttribute('data-asset-family')
        || document.body?.getAttribute('data-asset-family')
        || '',
    });
    const handleTrackedClick = (el, domEvent) => {
      if (domEvent && domEvent.__confengeTracked) return;
      if (domEvent) domEvent.__confengeTracked = true;
      const href = el.getAttribute('href') || '';
      const eventId = (domEvent && domEvent.__confengeEventId) || makeEventId();
      if (domEvent) domEvent.__confengeEventId = eventId;
      const isEditorial = !!(editorialType || /\/(lei-14133-obras|jurisprudencia-contratos-obras|guias-contratos-obras|inteligencia)\//.test(pagePath));
      const position = el.getAttribute('data-cta-position')
        || (el.classList && el.classList.contains('whatsapp-float') ? 'float' : 'inline');
      const label = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const classified = classifyTransition({
        href,
        origin_path: pagePath,
        attributes: attrsFromEl(el),
      });
      const base = {
        page_path: pagePath,
        content_cluster: el.getAttribute('data-content-cluster') || defaultCluster,
        cta_position: position,
        device_context: deviceContext,
        event_id: eventId,
        correlation_id: fromUrl.correlation_id || '',
      };
      if (classified.kind === 'whatsapp') {
        track('whatsapp_click', {
          ...base,
          cta_label: label || 'whatsapp',
          destination_type: 'whatsapp',
          journey: el.getAttribute('data-journey') || form?.querySelector('#jornada-hidden')?.value || editorialJourney || '',
          content_type: isEditorial ? (editorialType || 'editorial') : undefined,
          topic: isEditorial ? editorialTopic.slice(0, 120) : undefined,
        });
        return;
      }
      if (classified.kind === 'email') {
        track('email_click', {
          ...base,
          destination_type: 'email',
          content_type: isEditorial ? (editorialType || 'editorial') : undefined,
          topic: isEditorial ? editorialTopic.slice(0, 120) : undefined,
          journey: isEditorial ? editorialJourney : undefined,
        });
        return;
      }
      if (classified.kind === 'tel' || classified.kind === 'external') {
        track('outbound_click', {
          ...base,
          destination_type: classified.kind,
        });
        return;
      }
      if (classified.kind === 'contact') {
        track('service_cta_click', {
          ...base,
          cta_label: label,
          destination_type: 'form',
          offer_id: el.getAttribute('data-offer-id') || '',
          source_page_type: document.body?.getAttribute('data-content-cluster') || defaultCluster,
          cta_id: attrsFromEl(el).cta_id,
          route_family: attrsFromEl(el).route_family,
        });
        return;
      }
      if (classified.kind === 'transition') {
        track('content_to_service', {
          ...base,
          cta_label: label,
          destination_type: classified.destination_service_id === UNKNOWN_SERVICE ? 'unknown' : 'service',
          source_page_type: document.body?.getAttribute('data-content-cluster') || defaultCluster,
          offer_id: el.getAttribute('data-offer-id') || '',
          source_path: classified.source_path,
          source_asset_id: classified.source_asset_id,
          source_asset_family: classified.source_asset_family,
          destination_path: classified.destination_path,
          destination_service_id: classified.destination_service_id,
          cta_id: classified.cta_id,
          route_family: classified.route_family,
          asset_id: classified.source_asset_id,
          asset_family: classified.source_asset_family,
        });
        return;
      }
      const eventName = el.getAttribute('data-event-name');
      if (!eventName || !namedAllowed[eventName]) return;
      const namedAttrs = attrsFromEl(el);
      track(eventName, {
        ...base,
        cta_label: label,
        offer_id: el.getAttribute('data-offer-id')
          || document.body?.getAttribute('data-offer-id')
          || '',
        source_page_type: document.body?.getAttribute('data-content-cluster') || defaultCluster,
        asset_id: namedAttrs.asset_id,
        route_family: namedAttrs.route_family,
        cta_id: namedAttrs.cta_id,
      });
    };

    document.querySelectorAll('a[href*="wa.me"]').forEach((link) => {
      link.addEventListener('click', (evt) => handleTrackedClick(link, evt));
    });
    document.querySelectorAll('a[href^="mailto:"]').forEach((link) => {
      link.addEventListener('click', (evt) => handleTrackedClick(link, evt));
    });
    document.querySelectorAll('a[href^="tel:"], a[href^="sms:"]').forEach((link) => {
      link.addEventListener('click', (evt) => handleTrackedClick(link, evt));
    });
    document.querySelectorAll('a[href]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (!href || href.startsWith('#')) return;
      link.addEventListener('click', (evt) => handleTrackedClick(link, evt));
    });
    document.querySelectorAll('[data-event-name]').forEach((el) => {
      el.addEventListener('click', (evt) => handleTrackedClick(el, evt));
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

/* MODULE form — multi-step lead form + focus (SYS-03 / UX-15)
 * Runtime: assembled into /script.js. Do not load alone.
 */
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
            pseo_table_interaction: 1,
            pseo_source_open: 1,
            pseo_related_page_click: 1,
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
      // pSEO WhatsApp / form start / form submit are aliases of whatsapp_click /
      // lead_form_start / lead_form_submit. Do not dual-emit; attribution stays
      // on the canonical events and hidden fields.
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
