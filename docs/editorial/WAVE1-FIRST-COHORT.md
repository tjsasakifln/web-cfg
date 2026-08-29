# Primeira coorte editorial — checkpoint humano

**Estado:** duas páginas com aprovação humana válida permanecem `INDEXABLE`. O antigo donor `lei-limite-25-50` está terminalmente `MIGRATED`, sem elegibilidade para nova aprovação.

O único pacote operacional atual é [HUMAN-ACTION-NOW.md](HUMAN-ACTION-NOW.md). Ele traz hashes v3, fontes, comandos individuais e links do deploy preview. Não reutilize hashes, comandos ou URLs de produção de versões anteriores deste documento.

## Alvo de revisão

- Preview obrigatório: `https://deploy-preview-54--confenge.netlify.app`
- Evidência dinâmica: `/.well-known/build-info.json` e `/.well-known/editorial-review-packet.json`
- Produção não é um alvo válido enquanto a PR não estiver mesclada.
- `commit_sha` em relatórios é apenas rastreabilidade; a decisão exige material hash, fontes exatas e evidência do preview.

## Páginas elegíveis

| page_id | Preview | Risco de canibalização |
|---|---|---|
| `guia-checklist-aditivo` | `/guias-contratos-obras/checklist-pedido-aditivo/` | Parcial: distinguir o checklist transversal do peer sobre erro de projeto. |
| `lei-item-novo-desconto` | `/lei-14133-obras/preco-item-novo-desconto-proposta/` | Alto: escolher uma canônica versus `/conteudos/desconto-da-proposta-em-item-novo-aditivo/`; não dual-indexar. |

## Política de release

- Apenas estes dois IDs podem permanecer ou voltar a receber `--indexable`.
- As outras oito páginas permanecem `EDITORIAL_REVIEWED` e `noindex,follow`.
- `lei-limite-25-50` permanece `MIGRATED`, com canonical e 301 direto para `/conteudos/limite-aditivo-25-50-obra-publica/`.
- `jur-sumula-260-art` continua `REJECTED`.
- Uma aprovação é individual. Release parcial é reportado como parcial, nunca como “coorte publicada”.
- Qualquer mudança material remove a aprovação e marca `REVIEW_REQUIRED`.

Após um commit não material, use o comando de reconfirmação do preview em `HUMAN-ACTION-NOW.md`; ele atualiza somente a prova do preview e não cria aprovação.
