# CONFENGE market-capture operating system

**Status:** authoritative operating thesis  
**Date:** 2026-08-25  
**Architecture:** [ADR-STRAT-002](../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md)  
**Inbound execution:** [#61](https://github.com/tjsasakifln/web-cfg/issues/61)

## Corporate thesis and North Star

CONFENGE is a B2G intelligence company applied to engineering that monetizes
through high-value services. The corporate North Star is **Qualified Commercial
Opportunities**, connected to attributable pipeline and revenue — never leads,
emails, pages, impressions, commits or closed issues in isolation.

A QCO requires a valid account, a specific evidenced problem or opportunity, an
applicable offer, a why-now trigger and a plausible decision unit with a
defensible route. UNKNOWN remains UNKNOWN; WON requires human or documentary
evidence.

The category ambition is to make CONFENGE unavoidable to people interested in
AEC B2G and respected as a technical house, not another consultancy. That is
earned through original data, explicit methods, expert authorship/review,
correction history, permissioned proof and repeated third-party citation.

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
  contato, SLA, dispatch, ações e outcomes.
- **Governance / Control Center:** revisão, aprovação, supervisão, observabilidade,
  exceções, kill switches e decisões humanas.

Se uma função comercial continuaria necessária após substituir o site público,
ela não pertence ao `web-cfg`.

## Cinco frentes

1. **REVENUE NOW:** cohorts relevantes, decisão unitária ou em lote controlado,
   ação e outcome no owner comercial.
2. **INBOUND ENGINE:** `confenge.com.br`, catálogo 54/54, BOFU, prova e conversão.
3. **MARKET INTELLIGENCE MOAT:** fatos, eventos e contratos com proveniência.
4. **COMPOUNDING SYSTEM:** outcomes, prova permissionada, expansão e distribuição.
5. **SCALE / SUNSET:** automatizar fluxos comprovados e retirar legado por URL.

## Decisões atuais

- CONFENGE e `confenge.com.br` são a única marca e superfície pública.
- O catálogo comercial canônico tem **54 entregáveis e 2 contêineres**; planos e
  condições de contratação não criam produtos. #343 é a autoridade nominal.
- A operação outbound é uma esteira `extra-cli → Warmbly → Governance/Control
  Center`, não um experimento artesanal de um contato e não uma função do site.
- A operação pode preparar cohorts, enriquecer contatos, personalizar e validar
  mensagens automaticamente antes da revisão humana quando aplicável.
- Os controles inbound continuam fail-closed e independentes da evolução
  outbound.
- SmartLic é apenas doador/migração, sem marca, CTA ou runtime público.
- A primeira vertical inbound é defesa de margem: reajuste, reequilíbrio, BDI e
  eventos contratuais, com prova e conversion gate registrados em #60/#61.

## Medição executiva

- [Market Penetration Ledger: extra-cli #381](https://github.com/tjsasakifln/extra-cli/issues/381)
  possui o denominador ICP/reachability e combina estágios agregados sem criar
  outro CRM.
- [Commercial Latency: Warmbly #55](https://github.com/tjsasakifln/warmbly/issues/55)
  mede evento→detecção→QCO→ação→conversa→proposta→fechamento. SLA e ciclo
  operacional pertencem ao Warmbly; supervisão e exceções, a Governance.
- `web-cfg` mede aquisição, intenção, conversão e transporte do lead até o aceite
  do contrato externo. Não persiste acknowledgment/resolution comercial.

## Prioridades executáveis por owner

1. **web-cfg #60/#61/#267:** prova, conversão e transporte inbound de produção.
2. **web-cfg #327/#338/#343/#344:** compreensão em três segundos, copy 54/54,
   nomes e fronteiras comerciais.
3. **extra-cli:** entregar facts, identidade, proveniência e cohorts por contratos
   versionados, sem segundo DataLake no site.
4. **Warmbly #47/#55:** operar ações/outcomes e latência comercial.
5. **Governance #65:** supervisionar alertas, decisões, exceções e kill switches.

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
