# CONFENGE conversion / SEO remediation result

Date: 2026-08-02  
Baseline main SHA (pre-change): `90cebc457fbb9a8d6c74c7483ef944651c30d401`  
Production host: https://confenge.com.br

## Implemented

1. **Homepage** — conventional category first (“Consultoria para licitações e contratos de obras públicas”); three buyer journeys (A contract / B edital / C operação B2G); lean seven-block narrative; proprietary labels explained in Portuguese.
2. **Forms** — two-step progressive disclosure (name + WhatsApp/email + need type → optional context); UTM/landing/jornada hiddens; journey-specific confirmation pages; WhatsApp document handoff (no multi-file upload on static form).
3. **Analytics** — funnel events without PII field names; automated `test:analytics` + `test:form-funnel`.
4. **Offer pages** — journey-aligned CTAs and near-CTA proof blocks from verified claims only.
5. **Content** — removed mechanical generic phrases from 116 `/conteudos/` pages; disposition map in `seo/content-disposition-2026-08-02.md`.
6. **Release** — git clean/smudge filters disabled; public `/.well-known/build-info.json` from deploy/CI commit env.

## Before → after (selected)

| Surface | Before | After |
| --- | --- | --- |
| Hero category | Diretoria B2G fracionada first | Consultoria para licitações e contratos… |
| CTAs | Single “Diagnosticar operação B2G” | Three journey CTAs + hierarchy |
| Form | All fields required up front | Step 1 essential / step 2 optional |
| Confirmations | One `/obrigado` | + contrato / edital / operação |
| build-info | 404 | Emitted at build |
| Git release filters | clean/smudge PLACEHOLDER | no-op |

## PENDING_FIELD_DATA

- Field Core Web Vitals (CrUX)
- Search Console ranking / click deltas
- Production conversion rate after cutover
- Full editorial rewrite of 97 library articles marked `reescrever`

## Production verification (external)

- Deploy commit (build-info): see `/.well-known/build-info.json` on confenge.com.br
- Homepage category + three journey CTAs: HTTP 200 observed live
- Journey confirmations `/obrigado-contrato|edital|operacao`: HTTP 200, data-lead-success present
- Netlify Forms bare POST returned **HTTP 404** (empty body) at verification time — form feature may be unregistered on the site; shipped JS falls back to WhatsApp + confirmation page
- WhatsApp deep links with contextual prefill: present on home and journey confirmations

## Limits

- Secure multi-file upload not on Netlify form; WhatsApp path documented on confirmations.
- pSEO leaf pages remain under editorial containment (zero publish while gate rejects).
- Form receipt proof requires live Netlify Forms notification after deploy.


## CI / deploy identity

- Latest main commit: see `git rev-parse HEAD`
- site-ci: green on Lighthouse Node API runner
- Public build-info: `https://confenge.com.br/.well-known/build-info.json`
