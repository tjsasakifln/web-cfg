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
    const currentYear = String(new Date().getFullYear());
    document.querySelectorAll('#year').forEach((element) => {
      if (element.textContent !== currentYear) element.textContent = currentYear;
    });

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

    // Contract-size proof selector — deliberate user control, never autorotates.
    document.querySelectorAll('[data-evidence-selector]').forEach((selector) => {
      const tabs = [...selector.querySelectorAll('[data-evidence-tab]')];
      const panels = [...selector.querySelectorAll('[data-evidence-panel]')];
      if (!tabs.length || tabs.length !== panels.length) return;

      const activateEvidence = (id, moveFocus = false) => {
        tabs.forEach((tab) => {
          const active = tab.getAttribute('data-evidence-tab') === id;
          tab.classList.toggle('is-active', active);
          tab.setAttribute('aria-selected', active ? 'true' : 'false');
          tab.setAttribute('tabindex', active ? '0' : '-1');
          if (active && moveFocus) tab.focus();
        });
        panels.forEach((panel) => {
          const active = panel.getAttribute('data-evidence-panel') === id;
          panel.classList.toggle('is-active', active);
          panel.hidden = !active;
        });
      };

      selector.setAttribute('data-enhanced', 'true');
      const initialTab = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true') || tabs[0];
      activateEvidence(initialTab.getAttribute('data-evidence-tab'));
      tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => {
          activateEvidence(tab.getAttribute('data-evidence-tab'));
        });
        tab.addEventListener('keydown', (event) => {
          let nextIndex = index;
          if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
          else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
          else if (event.key === 'Home') nextIndex = 0;
          else if (event.key === 'End') nextIndex = tabs.length - 1;
          else return;
          event.preventDefault();
          activateEvidence(tabs[nextIndex].getAttribute('data-evidence-tab'), true);
        });
      });
    });

    const reveals = document.querySelectorAll('.reveal');
    if (reveals.length) scheduleIdle(() => {
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
      'jornada', 'tema', 'snap',
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
          if (!PSEO_ATTR_KEYS.includes(k) && k !== 'saved_at') return;
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
    const jornada = searchParams.get('jornada') || hashParams.get('jornada');
    if (jornada) {
      const j = sanitizeAttr(jornada, 'jornada');
      if (j) fromUrl.jornada = j;
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
    const DATASET_TO_ATTR = {
      tema: 'tema',
      origem: 'origem',
      journey: 'jornada',
      pseoPageId: 'pseo_page_id',
      pageType: 'page_type',
      segmentKey: 'segment_key',
      segment: 'segment',
      region: 'region',
      agencyId: 'agency_id',
      intent: 'intent',
      originUrl: 'origin_url',
      landingUrl: 'landing_url',
      routeFamily: 'route_family',
      ctaId: 'cta_id',
      assetId: 'asset_id',
      correlationId: 'correlation_id',
      utmSource: 'utm_source',
      utmMedium: 'utm_medium',
      utmCampaign: 'utm_campaign',
      utmContent: 'utm_content',
      utmTerm: 'utm_term',
      analysisId: 'analysis_id',
      evidencePackVersion: 'evidence_pack_version',
      assetFamily: 'asset_family',
      queryClass: 'query_class',
      ctaPosition: 'cta_position',
      snap: 'snap',
    };
    document.addEventListener('click', (event) => {
      const a = event.target && event.target.closest && event.target.closest('a[href]');
      if (!a || !a.dataset) return;
      const next = { ...readStoredPseo() };
      let wrote = false;
      Object.keys(DATASET_TO_ATTR).forEach((camel) => {
        const raw = a.dataset[camel];
        if (!raw) return;
        const key = DATASET_TO_ATTR[camel];
        const s = sanitizeAttr(raw, key);
        if (!s) return;
        next[key] = s;
        wrote = true;
      });
      if (wrote) writeStoredPseo(next);
    }, true);
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
    const applyJourneyToForm = (journeyId, forceStage = false) => {
      if (!form || !journeyId) return;
      const j = JOURNEY_ACTIONS[journeyId] ? journeyId : 'operacao';
      ensureHidden('jornada', j, true);
      if (form.getAttribute('data-receipt-required') === 'true') {
        form.setAttribute('data-success-destination', JOURNEY_ACTIONS[j] || '/obrigado');
      } else {
        form.setAttribute('action', JOURNEY_ACTIONS[j] || '/obrigado');
      }
      const stage = form.querySelector('#estagio');
      if (stage && (forceStage || !stage.value)) {
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
      const journeyParam = searchParams.get('jornada') || hashParams.get('jornada')
        || storedPseo.jornada || storedPseo.journey;
      if (journeyParam) applyJourneyToForm(journeyParam);
    }
    if (mensagem && (tema || storedPseo.tema) && !mensagem.value) {
      const t = tema || storedPseo.tema;
      mensagem.value = `Demanda relacionada a: ${t}.\n\nContexto:\n`;
      mensagem.focus();
    }
    // #182 — fragment landings must reveal the target under the sticky header.
    // Home sections defer their layout with content-visibility (#185), so the
    // document keeps growing while the jump runs and the browser settles on a
    // stale offset (the contact form ended up ~2 viewports below the fold on a
    // 390px screen). Re-align until the layout stops moving; manual input wins.
    const scrollRoot = document.documentElement;
    const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Progressive enhancement: without these the plain fragment jump stands.
    const canRealign = !!scrollRoot
      && typeof window.requestAnimationFrame === 'function'
      && typeof window.getComputedStyle === 'function'
      && typeof window.scrollTo === 'function';
    const measurable = (el) => canRealign && el && typeof el.getBoundingClientRect === 'function';
    const anchorOffsetFor = (el) => {
      const margin = parseFloat(window.getComputedStyle(el).scrollMarginTop) || 0;
      const padding = parseFloat(window.getComputedStyle(scrollRoot).scrollPaddingTop) || 0;
      return Math.max(margin, padding);
    };
    const anchorTargetY = (el) => {
      const wanted = el.getBoundingClientRect().top + window.scrollY - anchorOffsetFor(el);
      const limit = Math.max(0, scrollRoot.scrollHeight - window.innerHeight);
      return Math.round(Math.min(Math.max(wanted, 0), limit));
    };
    const jumpTo = (y) => {
      const style = scrollRoot.style;
      const previous = style ? style.scrollBehavior : '';
      if (style) style.scrollBehavior = 'auto';
      window.scrollTo(0, y);
      if (style) style.scrollBehavior = previous;
    };
    let anchorRun = 0;
    let cancelActiveAnchor = null;
    const beginAnchorLifecycle = () => {
      // A new fragment navigation supersedes every phase of the previous one,
      // including the native smooth-scroll phase before correction begins.
      if (typeof cancelActiveAnchor === 'function') cancelActiveAnchor();
      const run = (anchorRun += 1);
      const inputs = ['wheel', 'touchstart', 'keydown'];
      let cleaned = false;
      let cancel = null;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        inputs.forEach((type) => window.removeEventListener(type, cancel));
        if (cancelActiveAnchor === cancel) cancelActiveAnchor = null;
      };
      cancel = () => {
        if (run !== anchorRun) { cleanup(); return; }
        anchorRun += 1;
        // Stop a native smooth scroll at its current position. The default
        // wheel/key/touch action then continues from there and wins.
        jumpTo(window.scrollY);
        cleanup();
      };
      inputs.forEach((type) => window.addEventListener(type, cancel, { passive: true }));
      cancelActiveAnchor = cancel;
      return {
        active: () => run === anchorRun,
        cleanup,
        complete: (onComplete) => {
          if (run !== anchorRun) { cleanup(); return false; }
          anchorRun += 1;
          cleanup();
          if (typeof onComplete === 'function') onComplete();
          return true;
        },
      };
    };
    const settleAnchor = (target, onArrive, lifecycle) => {
      const cycle = lifecycle || beginAnchorLifecycle();
      if (!measurable(target)) {
        cycle.complete(onArrive);
        return;
      }
      const startedAt = Date.now();
      let stable = 0;
      const finish = (arrived) => {
        cycle.complete(arrived ? onArrive : null);
      };
      const step = () => {
        if (!cycle.active()) { cycle.cleanup(); return; }
        const y = anchorTargetY(target);
        if (Math.abs(window.scrollY - y) > 2) { jumpTo(y); stable = 0; } else stable += 1;
        if (stable >= 4) { finish(true); return; }
        if (Date.now() - startedAt > 2500) { finish(false); return; }
        window.requestAnimationFrame(step);
      };
      window.requestAnimationFrame(step);
    };
    const afterScrollSettles = (lifecycle, fn) => {
      const startedAt = Date.now();
      let last = window.scrollY;
      let still = 0;
      const watch = () => {
        if (!lifecycle.active()) { lifecycle.cleanup(); return; }
        if (window.scrollY === last) still += 1;
        else { still = 0; last = window.scrollY; }
        if (still >= 3 || Date.now() - startedAt > 1500) { fn(lifecycle); return; }
        window.requestAnimationFrame(watch);
      };
      window.requestAnimationFrame(watch);
    };
    // Focus the landing zone so the keyboard continues from the form, not from
    // the WhatsApp/e-mail alternatives that precede it in the DOM.
    const focusAnchor = (el) => {
      if (!el || typeof el.focus !== 'function' || typeof el.setAttribute !== 'function') return;
      if (el.contains && el.contains(document.activeElement)) return;
      const hadTabindex = el.hasAttribute('tabindex');
      if (!hadTabindex) el.setAttribute('tabindex', '-1');
      try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
      if (!hadTabindex) {
        el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true });
      }
    };
    let formArrivalTracked = false;
    const trackAnchorArrival = (target) => {
      const form = target && (target.id === 'formulario-contato'
        ? target
        : target.querySelector && target.querySelector('#formulario-contato'));
      if (!form || formArrivalTracked) return;
      formArrivalTracked = true;
      // No PII: position and device only. Distinct from the CTA click
      // (cta_click) and from the first keystroke (lead_form_start).
      track('cta_view', {
        page_path: window.location.pathname || '/',
        cta_position: 'contact_form',
        cta_id: 'formulario-contato',
        device_context: window.matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop',
      });
    };
    const goToAnchor = (target, smooth) => {
      if (!target) return;
      const arrive = () => trackAnchorArrival(target);
      if (!measurable(target)) {
        if (typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({
            behavior: smooth && !reducedMotion() ? 'smooth' : 'auto',
            block: 'start',
          });
        }
        arrive();
        return;
      }
      const lifecycle = beginAnchorLifecycle();
      if (smooth && !reducedMotion()) {
        window.scrollTo({ top: anchorTargetY(target), left: 0, behavior: 'smooth' });
        afterScrollSettles(lifecycle, (cycle) => settleAnchor(target, arrive, cycle));
        return;
      }
      settleAnchor(target, arrive, lifecycle);
    };
    const anchorFromHash = (hash) => {
      const raw = String(hash || '').replace(/^#/, '');
      if (!raw) return null;
      let id = raw;
      try { id = decodeURIComponent(raw); } catch (_) { id = raw; }
      return document.getElementById(id) || document.getElementById(raw);
    };
    const samePage = (pathname) => {
      const normalize = (p) => String(p || '/').replace(/index\.html$/, '');
      return normalize(pathname) === normalize(window.location.pathname);
    };
    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target && event.target.closest && event.target.closest('a[href]');
      if (!link || link.hasAttribute('download') || link.getAttribute('target') === '_blank') return;
      const href = link.getAttribute('href') || '';
      if (href.indexOf('#') === -1) return;
      let url;
      try { url = new URL(href, window.location.href); } catch (_) { return; }
      if (url.origin !== window.location.origin || !samePage(url.pathname)
        || url.search !== window.location.search) return;
      const target = anchorFromHash(url.hash);
      if (!target) return;
      event.preventDefault();
      if (window.location.hash !== url.hash) {
        try { window.history.pushState(null, '', url.hash); } catch (_) { window.location.hash = url.hash; }
      }
      focusAnchor(target);
      goToAnchor(target, true);
    });
    window.addEventListener('popstate', () => {
      if (typeof cancelActiveAnchor === 'function') cancelActiveAnchor();
      const target = anchorFromHash(window.location.hash);
      if (target) goToAnchor(target, false);
    });

    let anchoredOnLoad = false;
    if (tema || origem || fromUrl.pseo_page_id || storedPseo.pseo_page_id
      || window.location.hash.startsWith('#contato')
      || searchParams.get('jornada')) {
      const contact = document.getElementById('formulario-contato')
        || document.getElementById('contato');
      if (contact && (tema || origem || fromUrl.pseo_page_id || storedPseo.pseo_page_id
        || searchParams.get('jornada') || window.location.hash.startsWith('#contato'))) {
        anchoredOnLoad = true;
        goToAnchor(contact, true);
      }
    }
    if (!anchoredOnLoad) {
      // The browser already jumped to the fragment; realign once the deferred
      // sections above it have rendered and stopped changing the document.
      const landed = anchorFromHash(window.location.hash);
      if (landed) settleAnchor(landed, () => trackAnchorArrival(landed));
    }

    // Journey preselect from CTA links
    document.querySelectorAll('[data-set-journey]').forEach((el) => {
      el.addEventListener('click', () => {
        applyJourneyToForm(el.getAttribute('data-set-journey'), true);
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
        const whatsappAttrs = attrsFromEl(el);
        const whatsappProtocol = appendWhatsappProtocol(el, eventId);
        track('whatsapp_click', {
          ...base,
          correlation_id: whatsappProtocol,
          cta_label: label || 'whatsapp',
          destination_type: 'whatsapp',
          journey: el.getAttribute('data-journey') || form?.querySelector('#jornada-hidden')?.value || editorialJourney || '',
          content_type: isEditorial ? (editorialType || 'editorial') : undefined,
          topic: isEditorial ? editorialTopic.slice(0, 120) : undefined,
          asset_id: whatsappAttrs.asset_id,
          route_family: whatsappAttrs.route_family,
          cta_id: whatsappAttrs.cta_id,
          cta_kind: el.getAttribute('data-cta-kind') || '',
          offer_id: el.getAttribute('data-offer-id') || '',
          next_action_id: el.getAttribute('data-next-action-id') || '',
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
        cta_kind: el.getAttribute('data-cta-kind') || '',
        next_action_id: el.getAttribute('data-next-action-id') || '',
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
