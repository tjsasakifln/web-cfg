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
