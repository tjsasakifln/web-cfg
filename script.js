(() => {
  const normalize = (value) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  /** Decoupled analytics bus — no PII; ready for GA4/Plausible later. */
  const PII_PARAM_KEYS = new Set([
    'nome', 'name', 'email', 'telefone', 'phone', 'tel', 'whatsapp',
    'mensagem', 'message', 'message_body', 'empresa', 'company',
    'documento', 'document', 'attachment', 'file', 'arquivo',
    'cpf', 'cnpj', 'address', 'endereco', 'full_name',
  ]);
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
    ];
    const PSEO_STORAGE_KEY = 'confenge_pseo_attribution';
    const sanitizeAttr = (val) => {
      if (val == null) return '';
      const s = String(val).slice(0, 180);
      // block PII-looking values from attribution store
      if (/@|\+?\d{10,}/.test(s)) return '';
      return s;
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
          const v = sanitizeAttr(obj[k]);
          if (v) clean[k] = v;
        });
        if (Object.keys(clean).length) {
          clean.saved_at = String(Date.now());
          sessionStorage.setItem(PSEO_STORAGE_KEY, JSON.stringify(clean));
        }
      } catch (_) { /* private mode */ }
    };
    // Capture attribution from URL into sessionStorage (survives home form landing)
    const fromUrl = {};
    PSEO_ATTR_KEYS.forEach((name) => {
      const v = searchParams.get(name) || hashParams.get(name);
      if (v) fromUrl[name] = sanitizeAttr(v);
    });
    const tema = searchParams.get('tema') || hashParams.get('tema');
    if (tema) fromUrl.tema = sanitizeAttr(tema);
    if (fromUrl.pseo_page_id || fromUrl.origem || fromUrl.page_type) {
      fromUrl.landing_url = sanitizeAttr(window.location.pathname || '/');
      if (!fromUrl.origin_url && fromUrl.origem) fromUrl.origin_url = fromUrl.origem;
      writeStoredPseo({ ...readStoredPseo(), ...fromUrl });
    }
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
          journey: link.getAttribute('data-journey') || form?.querySelector('#jornada-hidden')?.value || '',
        });
      });
    });

    // Email clicks
    document.querySelectorAll('a[href^="mailto:"]').forEach((link) => {
      link.addEventListener('click', () => {
        track('email_click', {
          page_path: pagePath,
          content_cluster: defaultCluster,
          cta_position: link.getAttribute('data-cta-position') || 'inline',
          device_context: deviceContext,
          destination_type: 'email',
        });
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
        const focusTarget = n === 2
          ? form.querySelector('#empresa') || form.querySelector('#urgencia')
          : nomeEl;
        focusTarget?.focus();
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
