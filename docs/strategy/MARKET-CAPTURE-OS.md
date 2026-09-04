# CONFENGE market-capture operating system

**Status:** authoritative operating thesis

**Date:** 2026-08-25

**Amended:** 2026-09-04 (#577 / #578)

**Architecture:** [ADR-STRAT-002](../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md)

**Taxonomy:** `CONFENGE_CORPORATE_TAXONOMY/1.0.0-draft.20260904`
(`data/corporate/taxonomy.v1.json`)

**Inbound execution:** [#61](https://github.com/tjsasakifln/web-cfg/issues/61)

## Corporate thesis and North Star

CONFENGE is the umbrella public brand for Engineering, Expert Evidence and
Technical Intelligence. It monetizes through high-value technical services with
ART and invoice when the act and professional attribution allow it. B2G / public
works is a protected specialist vertical, not the corporate category.

The corporate North Star is **Qualified Commercial Opportunities**, segmented by
taxonomy `nucleus_id` and connected to attributable proposal and revenue — never
leads, emails, pages, impressions, commits or closed issues in isolation.

A QCO requires a valid account, a specific evidenced problem or opportunity, an
applicable offer, a why-now trigger and a plausible decision unit with a
defensible route. UNKNOWN remains UNKNOWN; WON requires human or documentary
evidence.

The category ambition is to make CONFENGE unavoidable to people who need a
documented technical decision — expert evidence, valuation, building
documentation, occupational safety or public-works contracts — and respected as
a technical house, not another consultancy. That is earned through original data,
explicit methods, expert authorship/review, correction history, permissioned
proof and repeated third-party citation.

## Canonical nuclei

The architecture reads one taxonomy. Do not encode a second list in Python, JS,
navigation or schema.

1. `expert_evidence_assistance` — Perícias e Assistência Técnica
2. `property_valuation` — Avaliações de Imóveis
3. `building_engineering_documentation` — Engenharia de Edificações e Documentação
4. `occupational_safety` — Segurança do Trabalho
5. `public_works_b2g` — Obras Públicas e B2G (protected, published)

Adding a nucleus, offer, route, location or proof follows the rules in
ADR-STRAT-002 and in the taxonomy `addition_rules`. The 100th record uses the
same schema.

## Two distinct revenue paths

Inbound and outbound share commercial owners after handoff, but they do not
share acquisition mechanics or gates.

```text
INBOUND
confenge.com.br → tráfego → intenção → lead CONFENGE_WEB
→ transporte fail-closed → Warmbly → ação → pipeline → receita

OUTBOUND
dados/eventos públicos → extra-cli adquire, normaliza, identifica e enriquece
→ cohort/contatos plausíveis → Warmbly enfileira, personaliza, valida e despacha
→ Governance/Control Center revisa, aprova ou intervém quando aplicável
→ ação/outcome → aprendizado operacional
```

Emails funcionais plausíveis podem compor a operação outbound quando não existe
email pessoal comprovável, sempre sob os controles, compliance e kill switches
do sistema proprietário. Isso não autoriza envio pelo `web-cfg`.

## Autoridade por domínio

- **web-cfg:** única superfície pública CONFENGE; aquisição inbound, SEO/BOFU,
  conteúdo, ofertas, UX/UI, captura, analytics públicos e contrato mínimo de
  entrega de lead com `source=CONFENGE_WEB`.
- **extra-cli:** aquisição/normalização de dados públicos, identidade,
  proveniência, enrichment, matéria-prima comercial e contratos SELECT-only.
- **Warmbly:** leads, enrichment operacional, cohorts, filas, cadência, estado de
  contato, SLA, dispatch, ações, proposta, cobrança e outcomes.
- **Governance / Control Center:** revisão, aprovação, supervisão, observabilidade,
  exceções, kill switches e decisões humanas.
- **Meetcfg:** consumidor de contexto já aceito; não é superfície pública.

Se uma função comercial continuaria necessária após substituir o site público,
ela não pertence ao `web-cfg`.

## Cinco frentes

1. **REVENUE NOW:** cohorts relevantes, decisão unitária ou em lote controlado,
   ação e outcome no owner comercial.
2. **INBOUND ENGINE:** `confenge.com.br`, catálogo vigente, BOFU, prova, conversão
   e expansão pelos núcleos da taxonomia sem canibalizar B2G.
3. **MARKET INTELLIGENCE MOAT:** fatos, eventos e contratos com proveniência.
4. **COMPOUNDING SYSTEM:** outcomes, prova permissionada, expansão e distribuição.
5. **SCALE / SUNSET:** automatizar fluxos comprovados e retirar legado por URL.

## Decisões atuais

- CONFENGE e `confenge.com.br` são a única marca e superfície pública.
- A categoria corporativa é Engenharia, Perícias e Inteligência Técnica.
  Obras públicas / B2G permanece vertical protegida, com rotas e catálogo atuais.
- O catálogo comercial canônico tem **54 entregáveis e 2 contêineres** no
  vertical B2G; planos e condições de contratação não criam produtos. #343 é a
  autoridade nominal desse catálogo. Novas ofertas de outros núcleos entram pelo
  mesmo catálogo, referenciando um `nucleus_id` existente.
- A operação outbound é uma esteira `extra-cli → Warmbly → Governance/Control
  Center`, não um experimento artesanal de um contato e não uma função do site.
- A operação pode preparar cohorts, enriquecer contatos, personalizar e validar
  mensagens automaticamente antes da revisão humana quando aplicável.
- Os controles inbound continuam fail-closed e independentes da evolução
  outbound.
- SmartLic é apenas doador/migração, sem marca, CTA ou runtime público.
- A primeira vertical inbound publicada continua sendo defesa de margem e
  contratos de obras públicas, com prova e conversion gate registrados em
  #60/#61. Isso não impede a publicação posterior dos demais núcleos.

## Medição executiva

- [Market Penetration Ledger: extra-cli #381](https://github.com/tjsasakifln/extra-cli/issues/381)
  possui o denominador ICP/reachability e combina estágios agregados sem criar
  outro CRM.
- [Commercial Latency: Warmbly #55](https://github.com/tjsasakifln/warmbly/issues/55)
  mede evento→detecção→QCO→ação→conversa→proposta→fechamento. SLA e ciclo
  operacional pertencem ao Warmbly; supervisão e exceções, a Governance.
- `web-cfg` mede aquisição, intenção, conversão e transporte do lead até o aceite
  do contrato externo, com recorte por `nucleus_id`. Não persiste
  acknowledgment/resolution comercial.

## Prioridades executáveis por owner

1. **web-cfg #577/#578:** taxonomia canônica, tese corporativa e guards.
2. **web-cfg #60/#61/#267:** prova, conversão e transporte inbound de produção,
   sem regressão B2G.
3. **web-cfg #327/#338/#343/#344:** compreensão em três segundos, copy 54/54,
   nomes e fronteiras comerciais do vertical publicado.
4. **extra-cli:** entregar facts, identidade, proveniência e cohorts por contratos
   versionados, sem segundo DataLake no site.
5. **Warmbly #47/#55:** operar ações/outcomes e latência comercial.
6. **Governance #65:** supervisionar alertas, decisões, exceções e kill switches.

## Stop doing

- Não ressuscitar abordagem founder-led um-a-um como estratégia atual.
- Não construir CRM, sales-ops, SLA, fila, cadência, dispatch ou Control Center
  paralelo no `web-cfg`.
- Não usar evolução outbound para afrouxar a captura inbound fail-closed.
- Não criar páginas por keyword, dashboards, portais, DataLake, identidade ou
  orquestração duplicada sem evidência de utilidade e alavancagem.
- Não preservar trabalho por sunk cost; manter apenas residual real, owner certo
  e decisão EXECUTE/VALIDATE/DEFER/SUNSET/SUPERSEDED explícita.
- Não inventar TAM, outcome, SLA, WON, expansão ou atribuição causal.
- Não tratar B2G como única categoria corporativa, nem apagar o vertical B2G
  para anunciar os demais núcleos.
- Não criar sub-marca, domínio ou formulário paralelo por núcleo.
