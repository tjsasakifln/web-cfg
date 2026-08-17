/* MODULE analytics — BR-PRIV-01 no-PII analytics bus (SYS-03)
 * Runtime: assembled into /script.js. Do not load alone.
 */
(() => {
  const normalize = (value) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  /** Analytics bus — no PII. First-party collector + optional gtag/plausible. */
  // EVENT_CONTRACT_CLIENT_START — keep in lockstep with netlify/functions/lib/event-registry.json
  const EVENT_CONTRACT_SCHEMA_VERSION = '1.0.0';
  const EVENT_SOURCE = 'CONFENGE_WEB';
  const EVENT_PII_POLICY = 'aggregate_allowlist_empty';
  const AGGREGATE_PII_ALLOWLIST = [];
  const PII_PARAM_KEYS = new Set([
    'address', 'arquivo', 'attachment', 'cnpj', 'company', 'cpf',
    'document', 'documento', 'edital', 'email', 'empresa', 'endereco',
    'file', 'full_name', 'mensagem', 'message', 'message_body', 'name',
    'nome', 'phone', 'q', 'query', 'search_query', 'tel', 'telefone', 'whatsapp',
  ]);
  const EVENT_ALIASES = {
    qualified_scroll: 'scroll_depth',
    content_to_service_click: 'content_to_service',
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
  const ENVELOPE_ID_KEYS = { correlation_id: 1, idempotency_key: 1 };
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
  };
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

  const init = () => {
