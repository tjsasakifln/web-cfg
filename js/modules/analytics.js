/* MODULE analytics — BR-PRIV-01 no-PII analytics bus (SYS-03)
 * Runtime: assembled into /script.js. Do not load alone.
 */
(() => {
  const normalize = (value) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  /** Analytics bus — no PII. First-party collector + optional gtag/plausible. */
  // EVENT_CONTRACT_CLIENT_START — keep in lockstep with netlify/functions/lib/event-registry.json
  const EVENT_CONTRACT_SCHEMA_VERSION = '1.2.0';
  const EVENT_SOURCE = 'CONFENGE_WEB';
  const EVENT_PII_POLICY = 'aggregate_allowlist_empty';
  const AGGREGATE_PII_ALLOWLIST = [];
  const PII_PARAM_PATTERN = /address|arquivo|attach|cnpj|company|cpf|document|edital|email|empresa|endereco|comment|description|field|file|text|name|nome|message|mensagem|note|phone|query|search|tel|whatsapp/;
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
    '/diagnostico-b2g-expansao/': 'diagnostico-b2g-expansao',
    '/ferramentas/diagnostico-defesa-margem/': 'diagnostico-defesa-margem',
  };
  const ORIGIN_PREFIXES = {
    '/conteudos/': 'editorial',
    '/lei-14133-obras/': 'editorial',
    '/jurisprudencia-contratos-obras/': 'editorial',
    '/guias-contratos-obras/': 'editorial',
    '/analises-contratos-publicos/': 'editorial',
    '/panorama-mercado-obras-publicas/': 'editorial',
    '/casos/': 'case',
    '/servicos-obras-publicas/': 'hub',
    '/problemas-que-resolvemos/': 'hub',
    '/inteligencia/': 'data',
    '/radar/': 'data',
    '/ferramentas/': 'tool',
  };
  const CHROME_PREFIXES = [
    '/especialista/', '/politica-editorial/', '/privacidade/', '/termos-de-uso/',
    '/correcoes/', '/uso-de-ia/', '/conflitos/', '/imprensa/',
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
    legal_article_view: 1, method_open: 1, offer_view: 1,
    organic_landing: 1, outbound_click: 1, page_view: 1, proof_expand: 1,
    pseo_related_page_click: 1, pseo_source_open: 1, pseo_table_interaction: 1,
    qualification_stage_select: 1, qualification_urgency_select: 1,
    scroll_depth: 1, service_page_view: 1, session_start: 1,
    tool_complete: 1, tool_copy: 1, tool_download: 1, tool_reset: 1, tool_start: 1,
    tool_to_content: 1, tool_to_form: 1, tool_to_offer: 1, tool_to_whatsapp: 1,
    tool_view: 1, web_vital: 1, whatsapp_click: 1, xray_complete: 1, xray_error: 1,
    xray_start: 1, xray_timeout: 1,
  };
  const OBSERVED_ONLY_EVENTS = { qualified_lead: 1, pipeline: 1 };
  const RETIRED_EVENTS = { conversion: 1, journey_nav_click: 1 };
  const ENVELOPE_ID_KEYS = {
    correlation_id: 1,
    idempotency_key: 1,
    event_id: 1,
    session_id: 1,
    sid: 1,
    lead_id: 1,
    opportunity_id: 1,
    proposal_id: 1,
    sale_id: 1,
  };
  const ENTITY_ID_PATTERNS = {
    session_id: /^sess-[0-9a-f]{27}$/i,
    sid: /^sess-[0-9a-f]{27}$/i,
    lead_id: /^(?:lead-[0-9a-f]{27}|[0-9a-f]{24})$/i,
    opportunity_id: /^opp-[0-9a-f]{28}$/i,
    proposal_id: /^prop-[0-9a-f]{27}$/i,
    sale_id: /^sale-[0-9a-f]{27}$/i,
  };
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
  const ANALYTICS_FLUSH_DELAY_MS = 30000;
  let analyticsFlushTimer = null;
  let volatileSessionId = '';
  const trackedEventIds = new Set();
  const sessionHexFromSeed = (seed) => {
    const text = String(seed || 'confenge-session');
    let out = '';
    for (let round = 0; out.length < 27; round += 1) {
      let hash = (0x811c9dc5 ^ round) >>> 0;
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      out += hash.toString(16).padStart(8, '0');
    }
    return out.slice(0, 27);
  };
  const newSessionSeed = () => {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
      }
    } catch (_) { /* fallback below */ }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  };
  const getSessionId = () => {
    try {
      let sid = sessionStorage.getItem('confenge_sid');
      if (!/^sess-[0-9a-f]{27}$/.test(String(sid || ''))) {
        sid = `sess-${sessionHexFromSeed(sid || newSessionSeed())}`;
        sessionStorage.setItem('confenge_sid', sid);
      }
      return sid;
    } catch (_) {
      if (!volatileSessionId) {
        volatileSessionId = `sess-${sessionHexFromSeed(newSessionSeed())}`;
      }
      return volatileSessionId;
    }
  };
  window.confengeSessionId = getSessionId;
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
    const url = '/api/web/collect';
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
    if (ENVELOPE_ID_KEYS[k]) {
      if (/^sess-[0-9a-f]{27}$/i.test(val)) return false;
      if (/^(?:lead-[0-9a-f]{27}|[0-9a-f]{24})$/i.test(val)) return false;
      if (/^opp-[0-9a-f]{28}$/i.test(val)) return false;
      if (/^(?:prop|sale)-[0-9a-f]{27}$/i.test(val)) return false;
      const direct = val.replace(/^(?:sess|lead|opp|prop|sale|evt)-/i, '');
      const compact = direct.replace(/[\s().-]/g, '');
      if (!/^\+?\d+$/.test(compact)) return false;
      const digits = compact.replace(/^\+/, '');
      if (digits.length === 10 || digits.length === 11 || digits.length === 14) return true;
      if ((compact.startsWith('+') || digits.startsWith('55')) && (digits.length === 12 || digits.length === 13)) {
        return true;
      }
      return false;
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) return false;
    if (val.startsWith('c-')) return false;
    if (/^(sess|lead|opp|prop|sale|evt)-/.test(val)) return false;
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
          console.info('[confenge:analytics:reject]', resolved.reason);
        }
        return;
      }
      if (AGGREGATE_PII_ALLOWLIST.length) return;
      if (resolved.canonical === 'lead_form_error' && params.validation_category && !/^(required|contact_format|rate_limited)$/.test(params.validation_category)) return;
      const safe = {};
      let invalidEntityId = false;
      Object.keys(params || {}).forEach((key) => {
        const val = params[key];
        if (val == null || val === '') return;
        const piiKey = String(key).toLowerCase();
        if (PII_PARAM_PATTERN.test(piiKey)) return;
        const entityPattern = ENTITY_ID_PATTERNS[piiKey];
        if (entityPattern && (typeof val !== 'string' || !entityPattern.test(val))) {
          invalidEntityId = true;
          return;
        }
        if (typeof val === 'string' && val.length > 180) return;
        if (looksLikePiiValue(val, key)) return;
        safe[key] = val;
      });
      if (invalidEntityId) return;
      safe.page_path = safe.page_path || (window.location.pathname || '/');
      safe.session_id = getSessionId();
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
      else if (!analyticsFlushTimer) {
        analyticsFlushTimer = setTimeout(flushAnalytics, ANALYTICS_FLUSH_DELAY_MS);
      }
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
  const whatsappProtocolFromEventId = (eventId) => {
    const compact = String(eventId || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
    return `CFG-WA-${compact.slice(-8).padStart(8, '0')}`;
  };
  const appendWhatsappProtocol = (el, eventId) => {
    if (!el || typeof el.getAttribute !== 'function' || typeof el.setAttribute !== 'function') return '';
    const href = String(el.getAttribute('href') || '');
    if (!/^https:\/\/(?:wa\.me|api\.whatsapp\.com)\//i.test(href)) return '';
    const split = href.indexOf('?');
    const base = split === -1 ? href : href.slice(0, split);
    const params = new URLSearchParams(split === -1 ? '' : href.slice(split + 1));
    const protocol = whatsappProtocolFromEventId(eventId);
    const cleanMessage = String(params.get('text') || '')
      .replace(/\s*Protocolo CONFENGE:\s*CFG-WA-[A-Z0-9]{8}\s*$/i, '')
      .trim();
    params.set('text', `${cleanMessage}${cleanMessage ? '\n' : ''}Protocolo CONFENGE: ${protocol}`);
    el.setAttribute('href', `${base}?${params.toString()}`);
    el.setAttribute('data-whatsapp-protocol', protocol);
    return protocol;
  };

  window.__CONFENGE_EVENT_CONTRACT.canonicalizeDestination = canonicalizeDestination;
  window.__CONFENGE_EVENT_CONTRACT.classifyTransition = classifyTransition;
  window.__CONFENGE_EVENT_CONTRACT.canonicalizePath = canonicalizePath;
  window.__CONFENGE_EVENT_CONTRACT.UNKNOWN_SERVICE = UNKNOWN_SERVICE;
  window.__CONFENGE_EVENT_CONTRACT.appendWhatsappProtocol = appendWhatsappProtocol;

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
