/**
 * Rendered layout findings shared by fixture tests and the public-route census.
 *
 * The static Python gate catches explicit bad markup. This helper deliberately
 * measures the computed DOM so CSS cannot turn otherwise-valid markup into an
 * inaccessible or commercially broken surface.
 */
export async function renderedLayoutFindings(page, options = {}) {
  const requirements = {
    requireStickyCta: options.requireStickyCta ?? true,
    requireCaptureForm: options.requireCaptureForm ?? true,
  };

  return page.evaluate(async ({ requireStickyCta, requireCaptureForm }) => {
    const findings = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth + 1) {
      findings.push(`horizontal_overflow ${root.scrollWidth}>${root.clientWidth}`);
    }

    const visible = (element) => {
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden"
          || style.visibility === "collapse" || Number(style.opacity) === 0) {
          return false;
        }
      }
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.clipPath === "none"
        && !element.closest("[hidden], [aria-hidden='true'], [inert], .honeypot")
        && box.width > 0 && box.height > 0;
    };

    const enabled = (element) => !element.matches(":disabled")
      && element.getAttribute("aria-disabled") !== "true";

    const actionable = (element) => {
      if (!visible(element) || !enabled(element)) return false;
      if (getComputedStyle(element).pointerEvents === "none") return false;
      if (element.matches("a, area")) {
        const href = (element.getAttribute("href") || "").trim();
        return href !== "" && href !== "#";
      }
      return element.matches("button, input[type='button'], input[type='submit'], input[type='image']");
    };

    for (const element of document.querySelectorAll("p, li, h1, h2, h3")) {
      if (!visible(element)) continue;
      if ((element.textContent || "").trim().length < 20) continue;
      const width = element.getBoundingClientRect().width;
      if (width <= 42) findings.push(`text_width_${Math.round(width)}px`);
    }

    for (const element of document.querySelectorAll("a[href]")) {
      if (!visible(element) || element.classList.contains("skip-link")) continue;
      const href = element.getAttribute("href") || "";
      const label = (element.textContent || "").trim().toLocaleLowerCase("pt-BR");
      if (href === "" || href === "#") findings.push("useless_anchor");
      if (["clique aqui", "click here", "saiba mais", "leia mais"].includes(label)) {
        findings.push("useless_anchor_text");
      }
    }

    // Smooth scrolling is asynchronous and would let the tight census loop
    // inspect the old geometry before the focused control arrives. Make focus
    // scrolling deterministic for the duration of this measurement, then put
    // the document's inline preference back exactly as it was.
    const priorScrollBehavior = root.style.getPropertyValue("scroll-behavior");
    const priorScrollPriority = root.style.getPropertyPriority("scroll-behavior");
    root.style.setProperty("scroll-behavior", "auto", "important");

    // A control below the fold is valid: keyboard focus scrolls it into view.
    // After focus, however, at least one of its rendered boxes must intersect
    // both axes of the viewport. This rejects fixed/absolute controls stranded
    // above the document as well as controls displaced horizontally.
    for (const element of document.querySelectorAll(
      "a[href], button, input:not([type='hidden']), select, textarea, summary, [tabindex]",
    )) {
      if (!visible(element) || element.tabIndex < 0) continue;
      // Skip links are intentionally outside the viewport until :focus. The
      // concurrent sitewide census runs most pages in background tabs, where
      // Chromium updates activeElement but deliberately does not apply :focus.
      // Their reveal-on-Tab contract is exercised in the foreground UI gate.
      if (element.classList.contains("skip-link")) continue;
      element.focus({ preventScroll: false });
      if (document.activeElement !== element) continue;
      let rects = [...element.getClientRects()];
      let intersectsViewport = rects.some(
        (rect) => rect.right > 0 && rect.left < window.innerWidth
          && rect.bottom > 0 && rect.top < window.innerHeight,
      );
      // Focus-triggered style and scroll updates can settle on the next task.
      // Yield only for a current miss; ordinary controls keep the census fast.
      if (!intersectsViewport) {
        await new Promise((resolveTimer) => setTimeout(resolveTimer, 0));
        rects = [...element.getClientRects()];
        intersectsViewport = rects.some(
          (rect) => rect.right > 0 && rect.left < window.innerWidth
            && rect.bottom > 0 && rect.top < window.innerHeight,
        );
      }
      if (!intersectsViewport) {
        const box = element.getBoundingClientRect();
        const label = [
          element.tagName.toLowerCase(),
          element.id ? `#${element.id}` : "",
          element.className ? `.${String(element.className).trim().replace(/\s+/g, ".")}` : "",
        ].join("");
        const target = element.getAttribute("href") || element.getAttribute("name") || "";
        const text = (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50);
        findings.push(
          `focus_offscreen ${label} target=${target!="" ? target : "<none>"} text=${JSON.stringify(text)} `
            + `left=${Math.round(box.left)} right=${Math.round(box.right)} `
            + `top=${Math.round(box.top)} bottom=${Math.round(box.bottom)}`,
        );
      }
    }
    if (priorScrollBehavior) {
      root.style.setProperty("scroll-behavior", priorScrollBehavior, priorScrollPriority);
    } else {
      root.style.removeProperty("scroll-behavior");
    }

    if (requireStickyCta) {
      const stickyRoots = [...document.querySelectorAll(".contact-float, .whatsapp-float")];
      const hasActionableSticky = stickyRoots.some((rootElement) => {
        const candidates = rootElement.matches("a, button, input")
          ? [rootElement]
          : [...rootElement.querySelectorAll("a, button, input")];
        return candidates.some(actionable);
      });
      if (!hasActionableSticky) findings.push("missing_sticky_cta");
    }

    if (requireCaptureForm) {
      const forms = [...document.querySelectorAll("form")];
      const captureForms = forms.filter((form) => {
        const action = form.getAttribute("action") || "";
        const persistent = /^\/\.netlify\/functions\/(?:lead|nurture|conversion-intake|offer-eligibility|correction)(?:\?|$)/.test(action);
        return persistent || form.hasAttribute("data-capture-form");
      });
      if (!forms.length) findings.push("missing_form");
      else if (!captureForms.length) findings.push("broken_form");
      else {
        const revealResultGatedCapture = (form) => {
          if (form.getAttribute("data-result-gated-capture") !== "true") return null;
          const selector = (form.getAttribute("data-result-source") || "").trim();
          let result = null;
          try { result = selector ? document.querySelector(selector) : null; } catch (_) { result = null; }
          const followsResult = result
            && Boolean(result.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING);
          if (!result || !result.hasAttribute("hidden") || !followsResult) return null;
          const hiddenAncestors = [];
          for (let current = form; current && current !== document.body; current = current.parentElement) {
            if (current.hasAttribute("hidden")) {
              hiddenAncestors.push(current);
              current.removeAttribute("hidden");
            }
          }
          if (!hiddenAncestors.length) return null;
          return () => hiddenAncestors.forEach((element) => element.setAttribute("hidden", ""));
        };
        const usableCapture = captureForms.some((form) => {
          let restore = null;
          if (!visible(form)) restore = revealResultGatedCapture(form);
          if (!visible(form)) {
            if (restore) restore();
            return false;
          }

          let usable = false;
          try {
            const dataControls = [...form.querySelectorAll(
              "input:not([type='hidden']):not([type='button']):not([type='submit']):not([type='image']), select, textarea",
            )];
            const hasUsableDataControl = dataControls.some(
              (control) => visible(control) && enabled(control)
                && (control.getAttribute("name") || "").trim() !== "",
            );
            if (!hasUsableDataControl) return false;

            const submitControls = [...form.querySelectorAll(
              "button:not([type]), button[type='submit'], input[type='submit'], input[type='image']",
            )].filter(enabled);
            const hasVisibleSubmit = submitControls.some(actionable);
            const hasReachableMultistepSubmit = submitControls.length > 0
              && [...form.querySelectorAll("[data-form-next]")].some(actionable);
            usable = hasVisibleSubmit || hasReachableMultistepSubmit;
          } finally {
            if (restore) restore();
          }
          return usable;
        });
        if (!usableCapture) findings.push("broken_form");
      }
    }

    return [...new Set(findings)];
  }, requirements);
}

/**
 * Rendered hover-displacement findings: the "no hover lift" rule, measured.
 *
 * A static scan of styles.css cannot answer this. Several hover lifts in the
 * sheet were already dead — neutralised by a later declaration — so a regex for
 * `:hover{...translate` reproves rules the visitor never sees, while a lift
 * that survives everywhere except `prefers-reduced-motion` passes it. So drive
 * the real cascade instead: hover a representative of every distinct rendered
 * component, diff `getBoundingClientRect()` in document space, and report the
 * vertical displacement as `hover_lift <signature> <dy>px`.
 *
 * Horizontal nudges (a link arrow travelling toward its destination) are
 * directional affordance, not elevation, and are deliberately not measured.
 */
export const HOVER_PROBE_ATTRIBUTE = "data-hover-lift-probe";

export async function hoverLiftFindings(page, options = {}) {
  const tolerancePx = options.tolerancePx ?? 0.5;
  const sampleLimit = options.sampleLimit ?? 24;
  const settleMs = options.settleMs ?? 300;
  const attribute = HOVER_PROBE_ATTRIBUTE;

  // One probe per distinct tag+class signature: the cascade keys off classes,
  // so a second card of the same class cannot lift when the first does not.
  const signatures = await page.evaluate((max, attr) => {
    const classOf = (element) => {
      const raw = element.getAttribute("class") || "";
      const parts = raw.trim().split(/\s+/).filter(Boolean);
      return parts.length ? `.${parts.join(".")}` : "";
    };
    const visible = (element) => {
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden"
          || style.visibility === "collapse" || Number(style.opacity) === 0) {
          return false;
        }
      }
      if (element.closest("[hidden], [aria-hidden='true'], [inert], .honeypot")) return false;
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    const found = [];
    const seen = new Set();
    // The contact element is the one this rule exists for. A page with many
    // distinct card classes must never crowd it out of the sample.
    const candidates = [
      ...document.querySelectorAll(".whatsapp-float, .contact-float a, .contact-float button"),
      ...document.querySelectorAll(
        "a[href], button, summary, label, [class*='card'], [class*='path'],"
        + " [class*='item'], [class*='tile'], [class*='float']",
      ),
    ];
    for (const element of candidates) {
      if (found.length >= max) break;
      if (element.classList.contains("skip-link")) continue;
      if (!visible(element)) continue;
      const signature = `${element.tagName.toLowerCase()}${classOf(element)}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      element.setAttribute(attr, String(found.length));
      found.push(signature);
    }
    return found;
  }, sampleLimit, attribute);

  const findings = [];
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const geometry = (selector, wantHover) => page.evaluate((sel, hovered) => {
    const element = document.querySelector(sel);
    if (!element) return null;
    if (element.matches(":hover") !== hovered) return null;
    const box = element.getBoundingClientRect();
    return { top: box.top + window.scrollY, left: box.left + window.scrollX };
  }, selector, wantHover);

  for (let index = 0; index < signatures.length; index += 1) {
    const selector = `[${attribute}="${index}"]`;
    const handle = await page.$(selector);
    if (!handle) continue;
    try {
      // hover() scrolls the element into view first; both samples are taken
      // afterwards and in document space, so scrolling cannot fake or mask a
      // displacement.
      await handle.hover();
      await wait(settleMs);
      const hovered = await geometry(selector, true);
      // A probe the pointer cannot actually reach (covered by a sticky layer,
      // clipped by a scroller) carries no evidence either way — skip it rather
      // than invent a finding. A real lift stays reachable by definition.
      if (!hovered) continue;
      await page.mouse.move(1, 1);
      await wait(settleMs);
      const resting = await geometry(selector, false);
      if (!resting) continue;
      const dy = hovered.top - resting.top;
      if (Math.abs(dy) > tolerancePx) {
        findings.push(`hover_lift ${signatures[index]} ${dy.toFixed(1)}px`);
      }
    } finally {
      await handle.dispose();
    }
  }

  await page.evaluate((attr) => {
    for (const element of document.querySelectorAll(`[${attr}]`)) {
      element.removeAttribute(attr);
    }
  }, attribute);

  return [...new Set(findings)];
}
