# HUMAN ACTION NOW — Wave 1

Pacote curto para ato humano externo. **Não executar estes comandos como agente, CI, bot ou tester.**

- Commit: `dd6086205dba6f16a2c9ba0a85d0a3dceafb2cf0`
- Terminal: `READY_FOR_NAMED_HUMAN_APPROVAL`
- HUMAN_APPROVED=0
- INDEXABLE_WAVE1=0
- AWAITING_HUMAN=11
- REJECTED=1
- UI: https://confenge.com.br/ops/wave1-review.html

## Regras

- Aprovar somente com checklist completo, hash material e --confirm.
- Proibido approve-all / lote.
- Proibido registrar Tiago Sasaki sem ato humano externo real.
- Resolver canibalização antes de indexar qualquer par sobreposto.
- jur-sumula-260-art permanece REJECTED até dossiê completo.
- Proibido carimbar aprovação com identidade de Tiago (ou qualquer nome) sem ato humano real e auditável.
- Substitua `SEU_NOME_REAL` pelo nome do revisor humano externo.

## NÃO APROVAR (rejeitada)

- **`jur-sumula-260-art`** — REJECTED. Não indexar. Não rodar `approve_cli.py`. Aguarda dossiê completo.
  - preview: https://confenge.com.br/jurisprudencia-contratos-obras/tcu-sumula-260-art-obras/

## 11 páginas aguardando humano

### guia-checklist-aditivo

1. **Recomendação da máquina:** RECOMMEND_APPROVE (risk=low)
2. **Preview:** https://confenge.com.br/guias-contratos-obras/checklist-pedido-aditivo/
3. **Fontes:** lei-14133-art124, lei-14133-art125, lei-14133-planalto, agu-alteracoes-contratuais-2024
4. **Material hash:** `6d693bdf9d530603c30b633931c49be2fc6d358d299db74dd957652c32610824`
5. **Alerta de canibalização:** POSSIBLE_OVERLAP_REVIEW · peers: /conteudos/erro-de-projeto-gera-aditivo-obra-publica/ · humano escolhe canônica antes de index,follow
6. **Risco (resumo):** Dispositivos: art.124, art.125 · Conteúdo técnico-informativo; não substitui assessoria do caso concreto. · Ressalvas do packet: Conteúdo técnico-informativo; não substitui assessoria jurídica do caso concreto.
7. **Comando exato (humano nomeado real — não use nomes de agente/CI/bot):**

```bash
python3 scripts/editorial/approve_cli.py \
  --reviewer "SEU_NOME_REAL" \
  --page-id guia-checklist-aditivo \
  --notes "Revisão humana de guia-checklist-aditivo; fontes e material_hash conferidos; CTAs e naturalidade OK." \
  --sources lei-14133-art124,lei-14133-art125,lei-14133-planalto,agu-alteracoes-contratuais-2024 \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash 6d693bdf9d530603c30b633931c49be2fc6d358d299db74dd957652c32610824 \
  --confirm \
  --indexable
```

### guia-docs-reequilibrio

1. **Recomendação da máquina:** RECOMMEND_APPROVE (risk=low)
2. **Preview:** https://confenge.com.br/guias-contratos-obras/documentos-pedido-reequilibrio/
3. **Fontes:** lei-14133-art130-131, lei-14133-art136, lei-14133-planalto
4. **Material hash:** `31f1b2c6a085441f7d24423868d6fb8572a9d060faba2a0f62ba1ed5b0a6b1fa`
5. **Alerta de canibalização:** PEER_NOINDEX_OR_LOW_RISK · peers: /conteudos/documentos-reequilibrio-obra-publica/ · verificar peer robots antes de indexar Wave 1
6. **Risco (resumo):** Dispositivos: art.130, art.131 · Conteúdo técnico-informativo; não substitui assessoria do caso concreto. · Ressalvas do packet: Conteúdo técnico-informativo; não substitui assessoria jurídica do caso concreto.
7. **Comando exato (humano nomeado real — não use nomes de agente/CI/bot):**

```bash
python3 scripts/editorial/approve_cli.py \
  --reviewer "SEU_NOME_REAL" \
  --page-id guia-docs-reequilibrio \
  --notes "Revisão humana de guia-docs-reequilibrio; fontes e material_hash conferidos; CTAs e naturalidade OK." \
  --sources lei-14133-art130-131,lei-14133-art136,lei-14133-planalto \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash 31f1b2c6a085441f7d24423868d6fb8572a9d060faba2a0f62ba1ed5b0a6b1fa \
  --confirm \
  --indexable
```

### guia-glosa

1. **Recomendação da máquina:** RECOMMEND_APPROVE (risk=low)
2. **Preview:** https://confenge.com.br/guias-contratos-obras/contestar-glosa-medicao/
3. **Fontes:** lei-14133-art141-143, lei-14133-planalto
4. **Material hash:** `f69bcafc8f7556ecaad49fc1a2eee538f373726f4fc950af2a221af6289cf350`
5. **Alerta de canibalização:** POSSIBLE_OVERLAP_REVIEW · peers: /conteudos/glosa-de-medicao-obra-publica/ · humano escolhe canônica antes de index,follow
6. **Risco (resumo):** Dispositivos: art.143 · Conteúdo técnico-informativo; não substitui assessoria do caso concreto. · Ressalvas do packet: Conteúdo técnico-informativo; não substitui assessoria jurídica do caso concreto.
7. **Comando exato (humano nomeado real — não use nomes de agente/CI/bot):**

```bash
python3 scripts/editorial/approve_cli.py \
  --reviewer "SEU_NOME_REAL" \
  --page-id guia-glosa \
  --notes "Revisão humana de guia-glosa; fontes e material_hash conferidos; CTAs e naturalidade OK." \
  --sources lei-14133-art141-143,lei-14133-planalto \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash f69bcafc8f7556ecaad49fc1a2eee538f373726f4fc950af2a221af6289cf350 \
  --confirm \
  --indexable
```

### guia-notificacao-atraso

1. **Recomendação da máquina:** RECOMMEND_APPROVE (risk=low)
2. **Preview:** https://confenge.com.br/guias-contratos-obras/responder-notificacao-atraso/
3. **Fontes:** lei-14133-art115, lei-14133-planalto
4. **Material hash:** `688321dceae242bc1c212fe2ae86fd21d8ba4aeea3c3a26ac49f7d3a211eab11`
5. **Alerta de canibalização:** BLOCKED_UNTIL_HUMAN_CHOOSES_CANONICAL · peers: /conteudos/resposta-notificacao-atraso-obra-publica/ · manter peer; Wave 1 noindex
6. **Risco (resumo):** Dispositivos: art.115, art.155 · Conteúdo técnico-informativo; não substitui assessoria do caso concreto. · Ressalvas do packet: Conteúdo técnico-informativo; não substitui assessoria jurídica do caso concreto.
7. **Comando exato (humano nomeado real — não use nomes de agente/CI/bot):**

```bash
python3 scripts/editorial/approve_cli.py \
  --reviewer "SEU_NOME_REAL" \
  --page-id guia-notificacao-atraso \
  --notes "Revisão humana de guia-notificacao-atraso; fontes e material_hash conferidos; CTAs e naturalidade OK." \
  --sources lei-14133-art115,lei-14133-planalto \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash 688321dceae242bc1c212fe2ae86fd21d8ba4aeea3c3a26ac49f7d3a211eab11 \
  --confirm \
  --indexable
```

### lei-art124-alteracao-obra

1. **Recomendação da máquina:** RECOMMEND_APPROVE (risk=low)
2. **Preview:** https://confenge.com.br/lei-14133-obras/art-124-alteracao-contratual-obra/
3. **Fontes:** lei-14133-art124, lei-14133-art125, lei-14133-art126-132, lei-14133-planalto, agu-alteracoes-contratuais-2024
4. **Material hash:** `07caf5f73084efe74e78e3ee4da3827403fd22fee7a6c4613e36f693a2306b30`
5. **Alerta de canibalização:** POSSIBLE_OVERLAP_REVIEW · peers: /conteudos/erro-de-projeto-gera-aditivo-obra-publica/ · humano escolhe canônica antes de index,follow
6. **Risco (resumo):** Dispositivos: art.124, art.125, art.126 · Conteúdo técnico-informativo; não substitui assessoria do caso concreto. · Ressalvas do packet: Conteúdo técnico-informativo; não substitui assessoria jurídica do caso concreto.
7. **Comando exato (humano nomeado real — não use nomes de agente/CI/bot):**

```bash
python3 scripts/editorial/approve_cli.py \
  --reviewer "SEU_NOME_REAL" \
  --page-id lei-art124-alteracao-obra \
  --notes "Revisão humana de lei-art124-alteracao-obra; fontes e material_hash conferidos; CTAs e naturalidade OK." \
  --sources lei-14133-art124,lei-14133-art125,lei-14133-art126-132,lei-14133-planalto,agu-alteracoes-contratuais-2024 \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash 07caf5f73084efe74e78e3ee4da3827403fd22fee7a6c4613e36f693a2306b30 \
  --confirm \
  --indexable
```

### lei-atraso-administracao

1. **Recomendação da máquina:** RECOMMEND_APPROVE (risk=low)
2. **Preview:** https://confenge.com.br/lei-14133-obras/atraso-imputavel-administracao/
3. **Fontes:** lei-14133-art115, lei-14133-planalto, lei-14133-art130-131
4. **Material hash:** `29023ca69d9d846fe8fa17563016af6c9c3f3aeb98a4f66e1f7992e52e94dda4`
5. **Alerta de canibalização:** BLOCKED_UNTIL_HUMAN_CHOOSES_CANONICAL · peers: /conteudos/atraso-obra-culpa-administracao/ · manter peer indexável até decisão humana
6. **Risco (resumo):** Dispositivos: art.115, art.124, art.130 · Conteúdo técnico-informativo; não substitui assessoria do caso concreto. · Ressalvas do packet: Conteúdo técnico-informativo; não substitui assessoria jurídica do caso concreto.
7. **Comando exato (humano nomeado real — não use nomes de agente/CI/bot):**

```bash
python3 scripts/editorial/approve_cli.py \
  --reviewer "SEU_NOME_REAL" \
  --page-id lei-atraso-administracao \
  --notes "Revisão humana de lei-atraso-administracao; fontes e material_hash conferidos; CTAs e naturalidade OK." \
  --sources lei-14133-art115,lei-14133-planalto,lei-14133-art130-131 \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash 29023ca69d9d846fe8fa17563016af6c9c3f3aeb98a4f66e1f7992e52e94dda4 \
  --confirm \
  --indexable
```

### lei-item-novo-desconto

1. **Recomendação da máquina:** RECOMMEND_APPROVE (risk=low)
2. **Preview:** https://confenge.com.br/lei-14133-obras/preco-item-novo-desconto-proposta/
3. **Fontes:** lei-14133-art126-132, lei-14133-art124, lei-14133-planalto, agu-alteracoes-contratuais-2024, sinapi-caixa
4. **Material hash:** `4c39b0ca89a6cd3ae34003efea5b5e56c248c702db7bdbd34c0e0f28543ae28c`
5. **Alerta de canibalização:** BLOCKED_UNTIL_HUMAN_CHOOSES_CANONICAL · peers: /conteudos/desconto-da-proposta-em-item-novo-aditivo/ · diferenciar intenção ou consolidar — dual-index proibido
6. **Risco (resumo):** Dispositivos: art.127, art.124, art.125 · Conteúdo técnico-informativo; não substitui assessoria do caso concreto. · Ressalvas do packet: Conteúdo técnico-informativo; não substitui assessoria jurídica do caso concreto.
7. **Comando exato (humano nomeado real — não use nomes de agente/CI/bot):**

```bash
python3 scripts/editorial/approve_cli.py \
  --reviewer "SEU_NOME_REAL" \
  --page-id lei-item-novo-desconto \
  --notes "Revisão humana de lei-item-novo-desconto; fontes e material_hash conferidos; CTAs e naturalidade OK." \
  --sources lei-14133-art126-132,lei-14133-art124,lei-14133-planalto,agu-alteracoes-contratuais-2024,sinapi-caixa \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash 4c39b0ca89a6cd3ae34003efea5b5e56c248c702db7bdbd34c0e0f28543ae28c \
  --confirm \
  --indexable
```

### lei-limite-25-50

1. **Recomendação da máquina:** RECOMMEND_APPROVE (risk=low)
2. **Preview:** https://confenge.com.br/lei-14133-obras/limite-25-50-aditivo-obra/
3. **Fontes:** lei-14133-art125, lei-14133-art124, lei-14133-art126-132, lei-14133-planalto, agu-alteracoes-contratuais-2024
4. **Material hash:** `c86f6e0dea8011c697990d419d13accfc4960775ab16132400d81529cf345465`
5. **Alerta de canibalização:** BLOCKED_UNTIL_HUMAN_CHOOSES_CANONICAL · peers: /conteudos/limite-aditivo-25-50-obra-publica/ · diferenciar_ou_substituir_com_redirect — Wave 1 permanece noindex
6. **Risco (resumo):** Dispositivos: art.125, art.124, art.126 · Conteúdo técnico-informativo; não substitui assessoria do caso concreto. · Ressalvas do packet: Conteúdo técnico-informativo; não substitui assessoria jurídica do caso concreto.
7. **Comando exato (humano nomeado real — não use nomes de agente/CI/bot):**

```bash
python3 scripts/editorial/approve_cli.py \
  --reviewer "SEU_NOME_REAL" \
  --page-id lei-limite-25-50 \
  --notes "Revisão humana de lei-limite-25-50; fontes e material_hash conferidos; CTAs e naturalidade OK." \
  --sources lei-14133-art125,lei-14133-art124,lei-14133-art126-132,lei-14133-planalto,agu-alteracoes-contratuais-2024 \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash c86f6e0dea8011c697990d419d13accfc4960775ab16132400d81529cf345465 \
  --confirm \
  --indexable
```

### lei-parcela-incontroversa

1. **Recomendação da máquina:** RECOMMEND_APPROVE (risk=low)
2. **Preview:** https://confenge.com.br/lei-14133-obras/parcela-incontroversa-medicao-pagamento/
3. **Fontes:** lei-14133-art141-143, lei-14133-planalto
4. **Material hash:** `eea0bca5985695d3613b79422d1a7067c3abbb355507de7168a11dd3dae76cca`
5. **Alerta de canibalização:** PEER_NOINDEX_OR_LOW_RISK · peers: /conteudos/parcela-incontroversa-medicao-contrato-publico/ · OK se peer noindex
6. **Risco (resumo):** Dispositivos: art.143, art.141 · Conteúdo técnico-informativo; não substitui assessoria do caso concreto. · Ressalvas do packet: Conteúdo técnico-informativo; não substitui assessoria jurídica do caso concreto.
7. **Comando exato (humano nomeado real — não use nomes de agente/CI/bot):**

```bash
python3 scripts/editorial/approve_cli.py \
  --reviewer "SEU_NOME_REAL" \
  --page-id lei-parcela-incontroversa \
  --notes "Revisão humana de lei-parcela-incontroversa; fontes e material_hash conferidos; CTAs e naturalidade OK." \
  --sources lei-14133-art141-143,lei-14133-planalto \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash eea0bca5985695d3613b79422d1a7067c3abbb355507de7168a11dd3dae76cca \
  --confirm \
  --indexable
```

### lei-reequilibrio-reajuste

1. **Recomendação da máquina:** RECOMMEND_APPROVE (risk=low)
2. **Preview:** https://confenge.com.br/lei-14133-obras/reequilibrio-reajuste-repactuacao/
3. **Fontes:** lei-14133-art130-131, lei-14133-art136, lei-14133-planalto
4. **Material hash:** `0d2647d1bfcb957abf9ffc6c296598edbc0757c76aeb51d60f4c44f74a149223`
5. **Alerta de canibalização:** NO_KNOWN_INDEXABLE_OVERLAP · peers: (nenhum) · indexação bloqueada até aprovação humana individual
6. **Risco (resumo):** Dispositivos: art.130, art.131, art.136 · Conteúdo técnico-informativo; não substitui assessoria do caso concreto. · Ressalvas do packet: Conteúdo técnico-informativo; não substitui assessoria jurídica do caso concreto.
7. **Comando exato (humano nomeado real — não use nomes de agente/CI/bot):**

```bash
python3 scripts/editorial/approve_cli.py \
  --reviewer "SEU_NOME_REAL" \
  --page-id lei-reequilibrio-reajuste \
  --notes "Revisão humana de lei-reequilibrio-reajuste; fontes e material_hash conferidos; CTAs e naturalidade OK." \
  --sources lei-14133-art130-131,lei-14133-art136,lei-14133-planalto \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash 0d2647d1bfcb957abf9ffc6c296598edbc0757c76aeb51d60f4c44f74a149223 \
  --confirm \
  --indexable
```

### lei-servico-sem-aditivo

1. **Recomendação da máquina:** RECOMMEND_APPROVE (risk=low)
2. **Preview:** https://confenge.com.br/lei-14133-obras/servico-executado-sem-termo-aditivo/
3. **Fontes:** lei-14133-art124, lei-14133-art126-132, lei-14133-planalto, agu-alteracoes-contratuais-2024
4. **Material hash:** `4151ac67b83031339c3d708faaea24737b269ec1b697ea1b5ebc6c10042e5392`
5. **Alerta de canibalização:** PEER_ALREADY_NOINDEX_OR_CONSOLIDATED · peers: /conteudos/servico-executado-sem-termo-aditivo/ · manter Wave 1 noindex até aprovação; peer noindex
6. **Risco (resumo):** Dispositivos: art.124, art.132, art.125 · Conteúdo técnico-informativo; não substitui assessoria do caso concreto. · Ressalvas do packet: Conteúdo técnico-informativo; não substitui assessoria jurídica do caso concreto.
7. **Comando exato (humano nomeado real — não use nomes de agente/CI/bot):**

```bash
python3 scripts/editorial/approve_cli.py \
  --reviewer "SEU_NOME_REAL" \
  --page-id lei-servico-sem-aditivo \
  --notes "Revisão humana de lei-servico-sem-aditivo; fontes e material_hash conferidos; CTAs e naturalidade OK." \
  --sources lei-14133-art124,lei-14133-art126-132,lei-14133-planalto,agu-alteracoes-contratuais-2024 \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash 4151ac67b83031339c3d708faaea24737b269ec1b697ea1b5ebc6c10042e5392 \
  --confirm \
  --indexable
```

## Depois das aprovações humanas válidas

```bash
npm run editorial:release-approved
```

Com zero aprovações humanas, `release-approved` é noop seguro (verificado nesta execução).
