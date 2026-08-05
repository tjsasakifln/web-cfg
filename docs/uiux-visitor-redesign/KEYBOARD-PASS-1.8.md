# Manual keyboard pass — multi-step form (Story 1.8)

**Date:** 2026-08-05  
**Surfaces:** home contact form (`data-form-multistep`), tools diagnosis CTAs

## Checklist

| Step | Result |
|------|--------|
| Tab to nome / email / telefone / estagio | Focus ring visible (`:focus-visible`) |
| Advance with “Continuar” after invalid step 1 | Focus moves to first `.is-invalid` / `:invalid` |
| Advance after valid step 1 | Focus moves to step heading or first step-2 field |
| Back to step 1 | Focus returns to step-1 control |
| Submit invalid | Focus to invalid control; status region updated |
| Tools diagnosis | Single primary commercial CTA (`button-primary`) per major result view |

## Automation

- `npm run test:form-funnel`
- `npm run audit:axe` / `npm run test:ui`
- Focus helpers in `script.js` / `js/modules/form.js` (`firstInvalid`, step heading `tabindex=-1`)
