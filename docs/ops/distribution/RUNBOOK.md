# Earned Distribution — runbook (Lane A, issue #66)

**Status:** VALIDATE · process exists · no live send  
**Proof asset:** Radar Nacional de Obras Públicas  
**Canonical:** https://confenge.com.br/radar/nacional-obras-publicas/  
**Registry:** `data/distribution/assets/radar-nacional-obras-publicas.v1.json`  
**Owner:** Tiago Sasaki  
**Decision state:** VALIDATE · front: compounding / distribution + trust  
**Time to first evidence:** after one human send and one *observed* mention, link, reuse, or assisted QCO. Until then every outcome stays `UNKNOWN`.

This is Lane A only. Lanes B–D (Proof Engine, Partner Distribution, Customer Expansion) remain open. This runbook does **not** close #66.

## What the system does

```text
python3 -m scripts.distribution prepare
```

The entry point reads the versioned registry, applies kill gates, audits the inherited PR #25 kit, and prints a prepare report. It does not send mail, fire a webhook, open SMTP, or contact anyone. `auto_send` is `false`. The system prepares; a human decides and, if at all, sends.

Cadence: founder runs prepare before any outreach week, picks **at most one** eligible target, personalizes a single message from the live citation URL, sends only if the angle still fits, then records the outcome on the registry row. No bulk. No weekly spray quota.

## Kill gates

| Gate | Rule |
| --- | --- |
| Ativo sem utilidade | não distribuir |
| Target sem fit | não contatar |
| Ausência de resposta | não é failure causal; outcome permanece `UNKNOWN` |
| Contagem de alvos / backlinks | **não** é KPI |

Utility fails closed on `NEEDS_DATA`, `do_not_index`, `press_allowed: false`, missing canonical/citation link, or invented national contract stats. PR #73 (`EDIÇÃO ZERO`, preview, `NEEDS_DATA`, “não disparar imprensa”) is **not** this proof asset and must stay blocked.

## Allowed outcomes

`contacted/manual` · `mentioned` · `linked` · `reused` · `partner intro` · `assisted lead` · `UNKNOWN`

Unobserved mentions, links, reuse, leads and pipeline stay `UNKNOWN`. Do not mint success from silence.

## Metrics (only when observable)

- qualified mentions
- relevant referring domains
- reuse
- branded/direct lift
- assisted QCO/pipeline

Not metrics: contact-list size, “backlink target count”, messages sent, pages published.

## Citation primitives (already on the live Radar)

Do not restyle the site. Point at what already exists:

- stable citation link: `/radar/nacional-obras-publicas/`
- quotable stat: amostra GSC `seo/gsc-2026-07-30` (ex.: 88 impressões / 0 cliques em SINAPI desonerado) — **não** volume nacional de contratos
- chart card: tabelas HTML da seção 2
- source/method block: seção 1
- safe downloads: `gsc-demand-sample.json` e `radar-nacional.pdf` (sem PII)

## Inherited packs

`data/distribution/radar-outreach-kit.json` (PR #25) is an audited source. Prepare maps its rows through the fit gate. It is not a second contact farm. Generic desks, LinkedIn labels, government portals and regional syndicates without a published UF recorte stay do-not-contact.

## Human send rule

1. Run prepare.
2. If utility is BLOCK, stop.
3. Choose one eligible row or none.
4. Personalize. Send yourself. Never automate.
5. Write the outcome token (or leave `UNKNOWN`) plus source and date.
6. A non-reply is not a loss reason.

No partner portal. No CRM. No auto-send.
