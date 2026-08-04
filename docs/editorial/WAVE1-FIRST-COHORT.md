# Wave 1 — primeira coorte controlada (≤3 páginas)

**Status:** preparada para decisão humana — **não aprovada, não indexada, não publicada em massa.**

**Pacote de origem:** `docs/editorial/HUMAN-ACTION-NOW.md`  
**Identidade de revisão:** `schema_version + page_id + material_hash`; `commit_sha` é somente rastreabilidade.  
**Fonte de demanda:** export GSC `seo/gsc-2026-07-30/` + `data/revops/gsc/insights_latest.json` (as_of ~2026-07-30).  
**Proibições:** autoaprovação; revisor CI/bot/agente; batch approve; inventar cliques/receita/ranking.

## Critérios objetivos de seleção

| Critério | Como medido |
|----------|-------------|
| Intenção comercial | cluster/offer GSC (`aditivos`, `defesa-margem`) ou CTA de dossiê |
| Demanda observada | impressões/cliques GSC no peer indexável ou query relacionada |
| Risco jurídico/editorial | machine `risk=low`; sem jurisprudência incompleta |
| Diferenciação material | packet `material_difference` + checklist/norma vs peer narrativo |
| Canibalização | peers explícitos; decisão humana obrigatória antes de `index,follow` |
| Ligação ferramenta/CTA | ferramenta gratuita e/ou CTA WhatsApp/email no packet |
| Dúvida concreta do ICP | `question_answered` operacional (limites, checklist, preço item novo) |
| Sem promessa indevida | caveats técnico-informativos; sem garantia de resultado jurídico |

## Não selecionadas (e por quê) — amostra

| page_id | Motivo de adiamento |
|---------|---------------------|
| `jur-sumula-260-art` | **REJECTED** — dossiê oficial incompleto |
| `lei-reequilibrio-reajuste` | zero hit GSC query/peer neste export |
| `guia-glosa` / `guia-docs-reequilibrio` | peer sem linha GSC no export; coorte 2 |
| Demais Wave 1 | demandam canibalização e/ou menos evidência no export de 2026-07-30 |

## Candidata 1 — `lei-limite-25-50`

| Campo | Valor |
|-------|--------|
| **Página** | `/lei-14133-obras/limite-25-50-aditivo-obra/` |
| **page_id** | `lei-limite-25-50` |
| **Consulta / intenção** | Limite de 25% e 50% no art. 125 — o que conta no aditivo de obra (`limite aditivo 25 50`) |
| **Evidência de demanda** | Peer indexável `/conteudos/limite-aditivo-25-50-obra-publica/`: **24 impressões, 0 cliques, posição 17** (GSC páginas 2026-07-30). Cluster `aditivos` em insights (`commercial_investigation` / offer `defesa-margem`). Query relacionada `aditivos obra pública`: 5 imp, pos 66.2. |
| **Página canibalizante** | `/conteudos/limite-aditivo-25-50-obra-publica/` |
| **Decisão recomendada** | **Substituir com redirect 301** do peer legado → Wave 1 **ou** consolidar conteúdo no Wave 1 e noindex o peer — **não dual-index**. Packet: `BLOCKED_UNTIL_HUMAN_CHOOSES_CANONICAL`. |
| **Fonte jurídica** | `lei-14133-art125`, `lei-14133-art124`, `lei-14133-art126-132`, `lei-14133-planalto`, `agu-alteracoes-contratuais-2024` |
| **Principal risco** | Canibalização com peer já rankeando; interpretação de o que entra na base do % sem assessoria do caso |
| **CTA adequado** | Validar saldo percentual do contrato; WhatsApp/email do packet; ferramenta `/ferramentas/limite-acrescimos-supressoes/` |
| **Material hash** | `eddf3f499ffeab0c382bc340f777e61db2ec38b25ce6e8dfec1da5354804f68f` |
| **Comando exato (humano)** | Ver bloco abaixo |
| **Verificações pós-aprovação** | robots `index,follow` só nesta URL; peer tratado (301 ou noindex); sitemap-editorial contém a URL; ferramenta ainda noindex se política atual; GSC URL inspection da canônica |

```bash
ALLOW_HUMAN_APPROVAL=1 python3 scripts/editorial/approve_cli.py \
  --reviewer "Tiago Sasaki" \
  --page-id lei-limite-25-50 \
  --notes "Revisão humana de lei-limite-25-50; fontes art.125 e material_hash conferidos; canibalização com /conteudos/limite-aditivo-25-50-obra-publica/ decidida; CTAs OK." \
  --sources lei-14133-art125,lei-14133-art124,lei-14133-art126-132,lei-14133-planalto,agu-alteracoes-contratuais-2024 \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash eddf3f499ffeab0c382bc340f777e61db2ec38b25ce6e8dfec1da5354804f68f \
  --confirm \
  --indexable
```

## Candidata 2 — `guia-checklist-aditivo`

| Campo | Valor |
|-------|--------|
| **Página** | `/guias-contratos-obras/checklist-pedido-aditivo/` |
| **page_id** | `guia-checklist-aditivo` |
| **Consulta / intenção** | Checklist operacional de pedido de aditivo (`checklist aditivo obra` / cluster aditivos) |
| **Evidência de demanda** | Query `aditivos obra pública`: **5 impressões, pos 66.2** (oportunidade de relevância). Peer `/conteudos/erro-de-projeto-gera-aditivo-obra-publica/`: **3 impressões, pos 2.33**. Machine `RECOMMEND_APPROVE` risk=low. |
| **Página canibalizante** | `/conteudos/erro-de-projeto-gera-aditivo-obra-publica/` (overlap parcial — erro de projeto vs checklist genérico) |
| **Decisão recomendada** | **Diferenciar**: manter peer para “erro de projeto → aditivo”; Wave 1 como checklist transversal. Link cruzado; **não** redirecionar o peer sem revisão de intenção. Packet: `POSSIBLE_OVERLAP_REVIEW`. |
| **Fonte jurídica** | `lei-14133-art124`, `lei-14133-art125`, `lei-14133-planalto`, `agu-alteracoes-contratuais-2024` |
| **Principal risco** | Checklist parecer “template jurídico” — reforçar que não substitui assessoria |
| **CTA adequado** | Validar dossiê de aditivo com CONFENGE (packet); jornada operação |
| **Material hash** | `95dce781b83d92b76f91ab1a24ef88159e9ce591cbb64b9acf8b2b13c753233d` |
| **Comando exato (humano)** | Ver bloco abaixo |
| **Verificações pós-aprovação** | robots; peer permanece com intenção distinta; sitemap; âncoras internas sem language backstage |

```bash
ALLOW_HUMAN_APPROVAL=1 python3 scripts/editorial/approve_cli.py \
  --reviewer "Tiago Sasaki" \
  --page-id guia-checklist-aditivo \
  --notes "Revisão humana de guia-checklist-aditivo; fontes e material_hash conferidos; canibalização com peer erro-de-projeto diferenciada por intenção; CTAs OK." \
  --sources lei-14133-art124,lei-14133-art125,lei-14133-planalto,agu-alteracoes-contratuais-2024 \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash 95dce781b83d92b76f91ab1a24ef88159e9ce591cbb64b9acf8b2b13c753233d \
  --confirm \
  --indexable
```

## Candidata 3 — `lei-item-novo-desconto`

| Campo | Valor |
|-------|--------|
| **Página** | `/lei-14133-obras/preco-item-novo-desconto-proposta/` |
| **page_id** | `lei-item-novo-desconto` |
| **Consulta / intenção** | Formar preço de item novo no aditivo preservando desconto da proposta |
| **Evidência de demanda** | Peer `/conteudos/desconto-da-proposta-em-item-novo-aditivo/`: **4 impressões, 1 clique, posição 7** (único peer da coorte com clique no export). Alinha a `aditivos obra pública` e offer `defesa-margem` / pricing. |
| **Página canibalizante** | `/conteudos/desconto-da-proposta-em-item-novo-aditivo/` |
| **Decisão recomendada** | **Substituir ou consolidar** — packet `BLOCKED_UNTIL_HUMAN_CHOOSES_CANONICAL` / dual-index proibido. Preferência: Wave 1 canônica (fontes oficiais + material_hash) + 301 do peer **ou** noindex peer após diff de conteúdo. |
| **Fonte jurídica** | `lei-14133-art126-132`, `lei-14133-art124`, `lei-14133-planalto`, `agu-alteracoes-contratuais-2024`, `sinapi-caixa` |
| **Principal risco** | Interpretação de desconto/SINAPI no caso concreto; canibalização forte com peer |
| **CTA adequado** | Revisar formação de preço do item novo (packet) |
| **Material hash** | `e1be1bd592734840cc4d01567f9cbb03962ca394c9e984b3245759c5e475fe4b` |
| **Comando exato (humano)** | Ver bloco abaixo |
| **Verificações pós-aprovação** | uma canônica indexável; peer 301/noindex; sitemap; sem dual ranking |

```bash
ALLOW_HUMAN_APPROVAL=1 python3 scripts/editorial/approve_cli.py \
  --reviewer "Tiago Sasaki" \
  --page-id lei-item-novo-desconto \
  --notes "Revisão humana de lei-item-novo-desconto; fontes e material_hash conferidos; canônica escolhida vs peer desconto-item-novo; CTAs OK." \
  --sources lei-14133-art126-132,lei-14133-art124,lei-14133-planalto,agu-alteracoes-contratuais-2024,sinapi-caixa \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash e1be1bd592734840cc4d01567f9cbb03962ca394c9e984b3245759c5e475fe4b \
  --confirm \
  --indexable
```

## Resumo da coorte

| # | page_id | Demanda (export) | Canibalização | Ação humana pré-index |
|---|---------|------------------|---------------|------------------------|
| 1 | `lei-limite-25-50` | peer 24 imp @17 | forte | escolher canônica / 301 |
| 2 | `guia-checklist-aditivo` | query aditivos 5 imp; peer 3 imp | parcial | diferenciar intenções |
| 3 | `lei-item-novo-desconto` | peer 4 imp / 1 click @7 | forte | escolher canônica / 301 |

**Contagem:** 3 candidatas. **Autoaprovação:** 0. **Publicação em massa:** não.  
**Próximo artefato:** `docs/editorial/WAVE1-POST-APPROVAL-RUNBOOK.md`.
