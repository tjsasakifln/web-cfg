# Home two-door router — before / after (REV-01)

Sources of truth: `data/site/public-ia-map.json`, `data/site/brand.json`,
`scripts/site/public_ia.py`, `scripts/site/shell_nav.py`. Chrome is rewritten
with `python3 scripts/site/shell_nav.py --write`. Home body is committed HTML.

## First fold

| | Before | After |
| --- | --- | --- |
| Eyebrow | Engenharia, Perícias e Inteligência Técnica | unchanged |
| H1 | Decisão técnica documentada, com responsável e data. | unchanged |
| Primary CTA | Registrar situação para triagem → `#formulario-contato` | unchanged |
| Secondary CTA | Ver edital, contrato ou operação → `#jornadas` | Diagnóstico de prontidão técnica → `/ferramentas/prontidao-tecnica-obra-privada/` |

Private buyer finds the diagnostic in the hero. B2G buyer finds the hub in the
header and in the two-door block immediately below.

## Navigation

Header destinations (≤5, real pages):

| Before | After |
| --- | --- |
| Obras públicas | Obra privada → diagnostic |
| Edital e proposta | Obras públicas → `/servicos-obras-publicas/` |
| Contrato sob pressão | Biblioteca |
| Biblioteca | |

CTA remains Analisar meu caso → `/#formulario-contato`.

Footer Núcleos now starts with Obra privada + Obras públicas. Edital and
contrato remain as B2G conservation links, not as the whole chrome.

B2G child routes highlight Obras públicas. The private diagnostic highlights
Obra privada.

## Two public doors

1. **Obras e engenharia privada** — diagnostic of technical readiness
   (`/ferramentas/prontidao-tecnica-obra-privada/`).
2. **Obras públicas** — hub already published (`/servicos-obras-publicas/`),
   with edital, contrato sob pressão and operação recorrente summarized on
   home and fully kept on the hub.

Perícias, avaliações and SST stay as triage demands. They are not presented as
finished verticals.

## Form

Home form `id="formulario-contato"` stays. Name is `diagnostico-confenge`
(corporate triage). Required `nucleus_id` for the five taxonomy IDs.
`faixa_contrato`, `risco_em_jogo` and certame/contract situation live in
`data-nucleus-branch="public_works_b2g"` and only enable when that nucleus is
selected (`js/modules/form.js` `applyNucleusBranch`).

B2G pages keep `name="diagnostico-b2g"` (example:
`ferramentas/diagnostico-defesa-margem/`).

WhatsApp/e-mail prefill on home is a technical situation, not “contrato público”.

## Internal language

Removed from public home and from the diagnostic after-result band: canário,
campanha 09, asset ID as copy, schema, ação terminal, oferta candidata,
payload dump, auto-send. Transport still uses hidden fields.
