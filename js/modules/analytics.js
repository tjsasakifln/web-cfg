/* MODULE analytics — BR-PRIV-01 no-PII analytics bus (SYS-03)
 * Runtime: assembled into /script.js. Do not load alone.
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
