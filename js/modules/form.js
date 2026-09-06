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
      const faixaContratoEl = form.querySelector('#faixa_contrato');
      const riscoEmJogoEl = form.querySelector('#risco_em_jogo');
      const frequenciaEl = form.querySelector('#frequencia');
      const maturidadeEl = form.querySelector('#maturidade_documental');
      const capacidadeEl = form.querySelector('#capacidade_interna');
      const offerFitHintEl = form.querySelector('[data-offer-fit-hint]');
      const b2gFieldGroup = form.querySelector('[data-field-group="obra-publica"]');
      const offerFitDefaultHint = offerFitHintEl ? offerFitHintEl.textContent : '';
      const b2gFieldsApply = () => {
        const nucleus = (estagioEl?.selectedOptions?.[0]?.getAttribute('data-nucleus') || '').trim();
        // No choice yet is the no-JS shape: the group stays as the document
        // shipped it, explained by its own hint.
        return !nucleus || nucleus === 'public_works_b2g';
      };
      // The same decision, applied to reading the answers -- not only to showing
      // the fields. While a non-public nucleus is selected the preserved DOM
      // values are not answers about THIS need: they are what the visitor said
      // about a different one, kept only so switching back restores them.
      // Reading them anyway is what reported a perícia lead with public-contract
      // bands and classified it 'diretoria'.
      const b2gAnswer = (el) => (b2gFieldsApply() ? (el?.value || '') : '');
      const urgencyToBand = (raw) => {
        const v = (raw || '').trim();
        if (v === 'até 48 horas') return 'ate_48h';
        if (v === 'até 7 dias') return 'ate_7d';
        if (v === 'até 30 dias') return 'ate_30d';
        if (v === 'planejamento sem prazo imediato') return 'planejamento';
        return 'unknown';
      };
      const readOfferFitInput = () => ({
        ticket_band: b2gAnswer(faixaContratoEl).trim() || 'unknown',
        risk_band: b2gAnswer(riscoEmJogoEl).trim() || 'unknown',
        frequency: b2gAnswer(frequenciaEl).trim() || 'unknown',
        // Urgency is a general field, outside the public-works group: it applies
        // to any need and is read unconditionally.
        urgency: urgencyToBand(urgenciaEl?.value),
        document_maturity: b2gAnswer(maturidadeEl).trim() || 'unknown',
        internal_capacity: b2gAnswer(capacidadeEl).trim() || 'unknown',
      });
      const updateOfferFitHint = () => {
        if (!offerFitHintEl || typeof window.confengeRouteOfferFit !== 'function') return;
        // The ladder these bands route into is the public-works one. Routing a
        // perícia, a valuation, occupational safety or a private site through
        // it recommends a priced B2G dossiê for a need it does not cover.
        if (!b2gFieldsApply()) { offerFitHintEl.textContent = offerFitDefaultHint; return; }
        const routed = window.confengeRouteOfferFit(readOfferFitInput());
        if (!routed || !routed.public_next) return;
        offerFitHintEl.textContent = routed.public_next;
      };
      // faixa_contrato, risco_em_jogo, frequencia, maturidade_documental and
      // capacidade_interna describe a public contract. Once the visitor says
      // the need is something else, they stop applying: left enabled they file
      // that lead under a contract band it never chose. Disabling excludes them
      // from FormData while keeping the values in the DOM, so switching back to
      // a public need restores what the visitor had already answered. Without
      // JavaScript nothing runs and the group renders as shipped, optional and
      // explained by its own hint.
      const syncB2gFieldGroup = (refreshHint) => {
        if (!b2gFieldGroup) return;
        const applies = b2gFieldsApply();
        b2gFieldGroup.hidden = !applies;
        b2gFieldGroup.querySelectorAll('input, select, textarea').forEach((el) => {
          el.disabled = !applies;
        });
        if (refreshHint) updateOfferFitHint();
      };
      // On load nothing has been answered, so the hint must stay the shipped
      // sentence. Routing all-unknown input would recommend a priced offer
      // before the visitor said anything.
      syncB2gFieldGroup(false);
      const receiptRequired = form.getAttribute('data-receipt-required') === 'true';

      const receiptStorageKey = () => {
        const asset = (form.querySelector('[name="asset_id"]')?.value || 'form').slice(0, 80);
        const cta = (form.querySelector('[name="cta_id"]')?.value || 'submit').slice(0, 80);
        return `confenge_idem:${pagePath}:${asset}:${cta}`;
      };
      const newIdempotencyKey = () => {
        try {
          if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return `fe-${window.crypto.randomUUID()}`;
          }
          if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
            const bytes = new Uint32Array(4);
            window.crypto.getRandomValues(bytes);
            return `fe-${Array.from(bytes, (n) => n.toString(36)).join('-')}`;
          }
        } catch (_) { /* fallback below */ }
        return `fe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      };
      const ensureReceiptIdempotency = () => {
        if (!receiptRequired) return '';
        const input = form.querySelector('[name="idempotency_key"]');
        let key = (input?.value || '').trim();
        try {
          key = key || sessionStorage.getItem(receiptStorageKey()) || '';
        } catch (_) { /* private mode */ }
        key = key || newIdempotencyKey();
        ensureHidden('idempotency_key', key, true);
        try { sessionStorage.setItem(receiptStorageKey(), key); } catch (_) { /* private mode */ }
        return key;
      };
      ensureReceiptIdempotency();

      const showFormStatus = (msg, kind) => {
        if (!statusEl) return;
        if (!statusEl.id) statusEl.id = 'form-status';
        statusEl.hidden = !msg;
        statusEl.textContent = msg || '';
        if (statusEl.classList && typeof statusEl.classList.toggle === 'function') {
          statusEl.classList.toggle('is-error', kind === 'error');
          statusEl.classList.toggle('is-ok', kind === 'ok');
        }
        if (typeof statusEl.setAttribute === 'function') {
          statusEl.setAttribute('role', kind === 'error' && msg ? 'alert' : 'status');
        }
      };
      const safeSuccessDestination = (candidate) => {
        switch (candidate) {
          case '/obrigado-contrato': return '/obrigado-contrato';
          case '/obrigado-edital': return '/obrigado-edital';
          case '/obrigado-operacao': return '/obrigado-operacao';
          default: return '/obrigado';
        }
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

      const setControlInvalid = (el, invalid, message) => {
        if (!el) return;
        if (el.classList && typeof el.classList.toggle === 'function') {
          el.classList.toggle('is-invalid', !!invalid);
        } else if (invalid) {
          el.classList?.add?.('is-invalid');
        } else {
          el.classList?.remove?.('is-invalid');
        }
        if (invalid) {
          if (typeof el.setAttribute === 'function') el.setAttribute('aria-invalid', 'true');
        } else if (typeof el.removeAttribute === 'function') {
          el.removeAttribute('aria-invalid');
        }
        if (typeof el.setCustomValidity === 'function') {
          el.setCustomValidity(invalid && message ? message : '');
        }
      };
      const contactHintEl = form.querySelector('#contato-hint');
      if (statusEl && !statusEl.id) statusEl.id = 'form-status';
      const applyContactDescribedBy = (invalid) => {
        const ids = [];
        if (contactHintEl?.id) ids.push(contactHintEl.id);
        if (invalid && statusEl?.id) ids.push(statusEl.id);
        const value = ids.join(' ');
        [emailEl, phoneEl].forEach((el) => {
          if (!el) return;
          if (value && typeof el.setAttribute === 'function') el.setAttribute('aria-describedby', value);
          else if (!value && typeof el.removeAttribute === 'function') el.removeAttribute('aria-describedby');
        });
      };
      const isVisibleBox = (el) => {
        if (!el || typeof el.getBoundingClientRect !== 'function') return false;
        const r = el.getBoundingClientRect();
        const cs = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
        if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0)) return false;
        return r.width > 0 && r.height > 0;
      };
      const boxFullyInViewport = (el) => {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight || 0;
        const vw = window.innerWidth || 0;
        return r.top >= -1 && r.left >= -1 && r.bottom <= vh + 1 && r.right <= vw + 1;
      };
      const withInstantScroll = (fn) => {
        const root = document.documentElement;
        const style = root && root.style;
        const prev = style ? style.scrollBehavior : '';
        if (style) style.scrollBehavior = 'auto';
        try { fn(); } finally { if (style) style.scrollBehavior = prev; }
      };
      const revealStep = (n) => {
        const panel = form.querySelector(`[data-form-step="${n}"]`);
        if (!panel || !panel.classList.contains('is-active')) return;
        const heading = panel.querySelector('legend, h2, h3, [data-step-heading]');
        const scrollTarget = heading || panel;
        withInstantScroll(() => {
          if (scrollTarget && typeof scrollTarget.scrollIntoView === 'function') {
            try { scrollTarget.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' }); }
            catch (_) { scrollTarget.scrollIntoView(true); }
          }
        });
        if (heading && !heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        const visibleControl = [...panel.querySelectorAll('input:not([type="hidden"]):not([tabindex="-1"]), select, textarea, button')]
          .find((el) => isVisibleBox(el) && !el.disabled && el.getAttribute('aria-hidden') !== 'true');
        const focusTarget = (heading && isVisibleBox(heading)) ? heading : (visibleControl || heading);
        if (focusTarget && typeof focusTarget.focus === 'function') {
          try { focusTarget.focus({ preventScroll: true }); } catch (_) { focusTarget.focus(); }
          if (!boxFullyInViewport(focusTarget)) {
            withInstantScroll(() => {
              try { focusTarget.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); }
              catch (_) { focusTarget.scrollIntoView(true); }
            });
          }
        }
      };
      const afterLayout = (fn) => {
        void form.offsetHeight;
        const run = () => {
          void form.offsetHeight;
          fn();
        };
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => requestAnimationFrame(run));
        } else {
          setTimeout(run, 0);
        }
      };
      const setStep = (n) => {
        formStep = n;
        if (step1) step1.classList.toggle('is-active', n === 1);
        if (step2) step2.classList.toggle('is-active', n === 2);
        form.querySelectorAll('[data-step-indicator]').forEach((ind) => {
          const sn = Number(ind.getAttribute('data-step-indicator'));
          ind.classList.toggle('is-active', sn === n);
          ind.classList.toggle('is-done', sn < n);
        });
        afterLayout(() => revealStep(n));
      };

      const clearContactValidity = () => {
        // Empty optional channel must not stay aria-invalid after the group is satisfied.
        setControlInvalid(emailEl, false);
        setControlInvalid(phoneEl, false);
        applyContactDescribedBy(false);
      };
      const requireEmailOrPhone = () => {
        const email = (emailEl?.value || '').trim();
        const phone = (phoneEl?.value || '').trim();
        if (email || phone) {
          clearContactValidity();
          return true;
        }
        const msg = 'Informe e-mail ou WhatsApp para retorno.';
        // One validity group, one summary — not two native field errors.
        setControlInvalid(emailEl, true);
        setControlInvalid(phoneEl, true);
        showFormStatus(msg, 'error');
        applyContactDescribedBy(true);
        return false;
      };
      // Finite aggregate only: never disclose a field, value, native message, or token.
      const validationCategory = () => {
        const contactHasFormatError = [emailEl, phoneEl].some((el) => {
          const value = String(el?.value || '').trim();
          if (!value) return false;
          if (el?.validity && typeof el.validity.valid === 'boolean') return !el.validity.valid;
          return typeof el?.checkValidity === 'function' && !el.checkValidity();
        });
        return contactHasFormatError ? 'contact_format' : 'required';
      };
      const validateStep1 = () => {
        markStart();
        let ok = true;
        if (nomeEl && !(nomeEl.value || '').trim()) {
          setControlInvalid(nomeEl, true, 'Informe seu nome.');
          ok = false;
        } else {
          setControlInvalid(nomeEl, false);
        }
        if (!requireEmailOrPhone()) ok = false;
        if (estagioEl && !estagioEl.value) {
          setControlInvalid(estagioEl, true, 'Selecione o tipo de necessidade.');
          ok = false;
        } else {
          setControlInvalid(estagioEl, false);
        }
        if (!ok) {
          form.reportValidity();
          const firstInvalid = form.querySelector('.is-invalid, :invalid');
          const errSummary = form.querySelector('[data-form-error-summary], #form-status, [role="alert"]');
          withInstantScroll(() => {
            if (firstInvalid && typeof firstInvalid.focus === 'function') {
              try { firstInvalid.focus({ preventScroll: true }); } catch (_) { firstInvalid.focus(); }
              if (typeof firstInvalid.scrollIntoView === 'function') {
                try { firstInvalid.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }
                catch (_) { firstInvalid.scrollIntoView(true); }
              }
            } else if (errSummary && typeof errSummary.focus === 'function') {
              if (!errSummary.hasAttribute('tabindex')) errSummary.setAttribute('tabindex', '-1');
              try { errSummary.focus({ preventScroll: true }); } catch (_) { errSummary.focus(); }
            }
          });
          track('lead_form_error', {
            page_path: pagePath,
            content_cluster: defaultCluster,
            device_context: deviceContext,
            destination_type: 'form',
            form_step: 1,
            validation_category: validationCategory(),
          });
          return false;
        }
        showFormStatus('', '');
        const j = stageToJourney(estagioEl?.value);
        applyJourneyToForm(j);
        return true;
      };

      estagioEl?.addEventListener('change', () => {
        syncB2gFieldGroup(true);
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
        updateOfferFitHint();
      });
      [faixaContratoEl, riscoEmJogoEl, frequenciaEl, maturidadeEl, capacidadeEl].forEach((el) => {
        el?.addEventListener('change', updateOfferFitHint);
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
            validation_category: validationCategory(),
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
        // Outside public_works_b2g the matrix has nothing to say, so it is not
        // consulted. All-unknown input is NOT the way to express that: the
        // router answers 'diagnostico' to it. null is the contract this code
        // already uses for "no routing" (see updateOfferFitHint), and it lands
        // as the empty next_step_category an unanswered form already emits --
        // absence of classification, never 'nao_indicado', which would claim an
        // economic disqualification nobody assessed.
        const routed = b2gFieldsApply() && typeof window.confengeRouteOfferFit === 'function'
          ? window.confengeRouteOfferFit(readOfferFitInput())
          : null;
        track('lead_form_submit', {
          page_path: pagePath,
          content_cluster: defaultCluster,
          device_context: deviceContext,
          destination_type: 'form',
          stage_category: (estagioEl?.value || '').slice(0, 80),
          urgency_category: (urgenciaEl?.value || '').slice(0, 80),
          journey: journey || '',
          cta_label: (estagioEl?.value || '').slice(0, 80),
          route_family: routeFamily,
          asset_id: assetId,
          cta_id: ctaId,
          ticket_band_category: b2gAnswer(faixaContratoEl).slice(0, 40),
          risk_band_category: b2gAnswer(riscoEmJogoEl).slice(0, 40),
          frequency_category: b2gAnswer(frequenciaEl).slice(0, 40),
          docs_category: b2gAnswer(maturidadeEl).slice(0, 40),
          capacity_category: b2gAnswer(capacidadeEl).slice(0, 40),
          next_step_category: (routed?.next_step || '').slice(0, 40),
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
          const dest = safeSuccessDestination(
            form.getAttribute('data-success-destination') || JOURNEY_ACTIONS[journey],
          );
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
              route_family: routeFamily,
              asset_id: assetId,
              cta_id: ctaId,
            });
            track('lead_persisted', {
              page_path: pagePath,
              lead_id: protocol,
              content_cluster: defaultCluster,
              journey: journey || '',
              route_family: routeFamily,
              asset_id: assetId,
              cta_id: ctaId,
              public_id_slug: publicSlug,
              source: 'CONFENGE_WEB',
            });
            try {
              if (protocol) sessionStorage.setItem('confenge_last_receipt', protocol);
              if (receiptRequired) sessionStorage.removeItem(receiptStorageKey());
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
          payload.idempotency_key = payload.idempotency_key
            || ensureReceiptIdempotency()
            || `fe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
          // Attribution already injected into hidden fields; ensure landing
          if (!payload.landing_page) payload.landing_page = pagePath;
          // Turnstile token if widget present
          const turnstileInput = form.querySelector('[name="cf-turnstile-response"]');
          if (turnstileInput && turnstileInput.value) {
            payload.turnstile_token = turnstileInput.value;
            payload['cf-turnstile-response'] = turnstileInput.value;
          }
          const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const configuredTimeout = Number(form.getAttribute('data-submit-timeout-ms') || 15000);
          const submitTimeout = Number.isFinite(configuredTimeout)
            ? Math.min(30000, Math.max(1000, configuredTimeout))
            : 15000;
          const timeoutId = controller ? setTimeout(() => controller.abort(), submitTimeout) : null;
          fetch('/api/web/lead', {
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
                validation_category: 'rate_limited',
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
          validation_category: validationCategory(),
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
      if (document.querySelector('script[data-confenge-turnstile]')) return;
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
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      s.defer = true;
      s.setAttribute('data-confenge-turnstile', '1');
      document.head.appendChild(s);
    } catch (_) { /* optional anti-abuse */ }
  };

  /** Load the challenge when the visitor can submit, not on first paint. */
  const scheduleTurnstile = () => {
    const slot = document.getElementById('turnstile-slot');
    if (!slot) return;
    const form = slot.closest('form');
    const start = () => initTurnstile();
    if (form) {
      form.addEventListener('focusin', start, { once: true });
      form.addEventListener('pointerdown', start, { once: true });
    }
    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          io.disconnect();
          start();
        }
      }, { rootMargin: '320px 0px' });
      io.observe(form || slot);
    }
  };

  const safeInit = () => {
    try {
      init();
      scheduleTurnstile();
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
