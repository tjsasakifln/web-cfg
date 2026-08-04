# Ação humana obrigatória — primeira coorte editorial

**Estado do sistema:** pronto apenas para revisão humana individual. Nenhuma decisão local, CI, bot ou agente vale como aprovação.

A identidade de decisão é `schema_version + page_id + material_hash + estado + revisor + timestamp`. O `commit_sha` dos relatórios é rastreabilidade; não é um gatilho e não exige “repin”.

Antes de rodar cada comando, Tiago deve revisar a página, conferir as fontes e decidir a canônica quando existir sobreposição. Execute cada comando separadamente, no clone atualizado e fora de CI.

## Limite de 25% e 50% no art. 125: o que conta no aditivo de obra

- URL: https://confenge.com.br/lei-14133-obras/limite-25-50-aditivo-obra/
- Intenção: Limite de 25% e 50% no art. 125 em aditivo de obra
- Evidência de demanda: Peer /conteudos/limite-aditivo-25-50-obra-publica/ teve 24 impressões, 0 cliques e posição 17 no export GSC de 2026-07-30; a query relacionada 'aditivos obra pública' teve 5 impressões.
- Concorrente interno: `/conteudos/limite-aditivo-25-50-obra-publica/`
- Risco de canibalização: alto: definir uma única canônica antes de indexar; 301 ou noindex do peer somente após decisão humana.
- Hash material atual: `eddf3f499ffeab0c382bc340f777e61db2ec38b25ce6e8dfec1da5354804f68f`

```bash
ALLOW_HUMAN_APPROVAL=1 python3 scripts/editorial/approve_cli.py \
  --reviewer "Tiago Sasaki" \
  --page-id lei-limite-25-50 \
  --notes "Revisão humana de lei-limite-25-50; fontes, conteúdo material e decisão de canibalização conferidos." \
  --sources lei-14133-art125,lei-14133-art124,lei-14133-art126-132,lei-14133-planalto,agu-alteracoes-contratuais-2024 \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash eddf3f499ffeab0c382bc340f777e61db2ec38b25ce6e8dfec1da5354804f68f \
  --confirm \
  --indexable
```

## Checklist de pedido de aditivo em obra pública

- URL: https://confenge.com.br/guias-contratos-obras/checklist-pedido-aditivo/
- Intenção: Checklist operacional para protocolar pedido de aditivo de obra
- Evidência de demanda: A query 'aditivos obra pública' teve 5 impressões; o peer /conteudos/erro-de-projeto-gera-aditivo-obra-publica/ teve 3 impressões e posição 2,33 no export GSC de 2026-07-30.
- Concorrente interno: `/conteudos/erro-de-projeto-gera-aditivo-obra-publica/`
- Risco de canibalização: parcial: diferenciar intenção (erro de projeto versus checklist transversal) e manter linkagem contextual.
- Hash material atual: `95dce781b83d92b76f91ab1a24ef88159e9ce591cbb64b9acf8b2b13c753233d`

```bash
ALLOW_HUMAN_APPROVAL=1 python3 scripts/editorial/approve_cli.py \
  --reviewer "Tiago Sasaki" \
  --page-id guia-checklist-aditivo \
  --notes "Revisão humana de guia-checklist-aditivo; fontes, conteúdo material e decisão de canibalização conferidos." \
  --sources lei-14133-art124,lei-14133-art125,lei-14133-planalto,agu-alteracoes-contratuais-2024 \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash 95dce781b83d92b76f91ab1a24ef88159e9ce591cbb64b9acf8b2b13c753233d \
  --confirm \
  --indexable
```

## Item novo no aditivo: como formar preço e preservar o desconto da proposta

- URL: https://confenge.com.br/lei-14133-obras/preco-item-novo-desconto-proposta/
- Intenção: Preço de item novo em aditivo e preservação do desconto da proposta
- Evidência de demanda: Peer /conteudos/desconto-da-proposta-em-item-novo-aditivo/ teve 4 impressões, 1 clique e posição 7 no export GSC de 2026-07-30.
- Concorrente interno: `/conteudos/desconto-da-proposta-em-item-novo-aditivo/`
- Risco de canibalização: alto: escolher canônica e impedir dual-index antes da publicação.
- Hash material atual: `e1be1bd592734840cc4d01567f9cbb03962ca394c9e984b3245759c5e475fe4b`

```bash
ALLOW_HUMAN_APPROVAL=1 python3 scripts/editorial/approve_cli.py \
  --reviewer "Tiago Sasaki" \
  --page-id lei-item-novo-desconto \
  --notes "Revisão humana de lei-item-novo-desconto; fontes, conteúdo material e decisão de canibalização conferidos." \
  --sources lei-14133-art126-132,lei-14133-art124,lei-14133-planalto,agu-alteracoes-contratuais-2024,sinapi-caixa \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash e1be1bd592734840cc4d01567f9cbb03962ca394c9e984b3245759c5e475fe4b \
  --confirm \
  --indexable
```

Fora desta lista, as outras 8 páginas editoriais continuam aguardando outra coorte e não podem receber `--indexable`. `jur-sumula-260-art` permanece REJECTED.
