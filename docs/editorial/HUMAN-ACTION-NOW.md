# Ação humana obrigatória — primeira coorte editorial

**Estado:** pronto apenas para revisão humana individual. Nenhum agente, CI ou bot aprova páginas, publica URLs ou faz merge.

A aprovação vale para o conteúdo material canônico, as fontes exatas e o deploy preview, não para uma URL de produção nem para um SHA meramente informativo.

## Antes de cada decisão

1. Atualize a branch do PR e execute `npm run editorial:preview -- --expected-head "$(git rev-parse HEAD)"`.
2. Confirme HTTP 200 e o mesmo SHA em [https://deploy-preview-54--confenge.netlify.app/.well-known/build-info.json](https://deploy-preview-54--confenge.netlify.app/.well-known/build-info.json) e no [runtime packet](https://deploy-preview-54--confenge.netlify.app/.well-known/editorial-review-packet.json).
3. Revise a URL de preview, as fontes e a decisão de canibalização da página abaixo.
4. Rode somente um comando de aprovação por vez, fora de CI. O CLI volta a verificar o preview antes de gravar qualquer decisão.

## Checklist de pedido de aditivo em obra pública

- Preview: https://deploy-preview-54--confenge.netlify.app/guias-contratos-obras/checklist-pedido-aditivo/
- Material hash v3: `01fd7f0e60bb058fe3e09851a62f7f43b97167f244445a9d5161bff39b589885`
- Fontes a conferir: `lei-14133-art124,lei-14133-art125,lei-14133-art126-132,lei-14133-planalto,agu-alteracoes-contratuais-2024`
- Concorrente interno: `/conteudos/erro-de-projeto-gera-aditivo-obra-publica/`
- Risco de canibalização: parcial: diferenciar intenção (erro de projeto versus checklist transversal) e manter linkagem contextual.

```bash
ALLOW_HUMAN_APPROVAL=1 python3 scripts/editorial/approve_cli.py \
  --reviewer "<nome humano real>" \
  --page-id guia-checklist-aditivo \
  --notes "<notas concretas da revisão humana, com ao menos 20 caracteres>" \
  --sources lei-14133-art124,lei-14133-art125,lei-14133-art126-132,lei-14133-planalto,agu-alteracoes-contratuais-2024 \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash 01fd7f0e60bb058fe3e09851a62f7f43b97167f244445a9d5161bff39b589885 \
  --preview-base-url https://deploy-preview-54--confenge.netlify.app \
  --confirm \
  --indexable
```

## Item novo no aditivo: preço e relação proposta/orçamento-base

- Preview: https://deploy-preview-54--confenge.netlify.app/lei-14133-obras/preco-item-novo-desconto-proposta/
- Material hash v3: `06e13499819375cfcee2bb59499c3d02d49d2c03b3639ab0fa195ddedf205a0f`
- Fontes a conferir: `lei-14133-art126-132,lei-14133-art124,lei-14133-planalto,agu-alteracoes-contratuais-2024,sinapi-caixa`
- Concorrente interno: `/conteudos/desconto-da-proposta-em-item-novo-aditivo/`
- Risco de canibalização: alto: escolher canônica e impedir dual-index antes da publicação.

```bash
ALLOW_HUMAN_APPROVAL=1 python3 scripts/editorial/approve_cli.py \
  --reviewer "<nome humano real>" \
  --page-id lei-item-novo-desconto \
  --notes "<notas concretas da revisão humana, com ao menos 20 caracteres>" \
  --sources lei-14133-art126-132,lei-14133-art124,lei-14133-planalto,agu-alteracoes-contratuais-2024,sinapi-caixa \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash 06e13499819375cfcee2bb59499c3d02d49d2c03b3639ab0fa195ddedf205a0f \
  --preview-base-url https://deploy-preview-54--confenge.netlify.app \
  --confirm \
  --indexable
```

As outras 8 páginas seguem `EDITORIAL_REVIEWED` e noindex; `jur-sumula-260-art` segue `REJECTED`. Após um commit não material, confirme e registre o novo preview com `python3 scripts/editorial/preview.py --reconfirm-approval --page-id PAGE_ID --expected-head "$(git rev-parse HEAD)"`; esse comando não cria aprovação. Qualquer mudança material remove a aprovação e retorna a página para `REVIEW_REQUIRED`.
