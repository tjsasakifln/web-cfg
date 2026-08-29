# Governança editorial por identidade material

A autorização de indexação não é um carimbo no commit atual. Para cada página, a decisão humana é identificada por:

```
approval.schema_version + page_id + material_hash + state + reviewer + reviewed_at
```

O `material_hash` cobre os campos editoriais materialmente revisáveis: URL, título, meta description, resposta direta, corpo, fontes, CTAs, dispositivos legais e arquétipo. O hash muda quando muda o material que o leitor vê ou o fundamento usado para a decisão.

## O que não invalida aprovação

Mudanças em documentação operacional, relatórios, screenshots, CI, merge commits e código sem efeito material sobre a página não alteram `material_hash`. `commit_sha` pode constar em relatórios para rastreabilidade, mas é informativo: não é comparado ao HEAD e não demanda commit de “pin”.

## O que invalida

Quando o material de uma página aprovada muda, `upsert_page` muda o estado para `REVIEW_REQUIRED`, remove a aprovação anterior e a exclui de sitemaps/indexação. `mark_indexable` e `indexable_pages` recusam uma aprovação sem schema, hash, revisor humano ou timestamp compatíveis.

## Coorte de release

Nesta release, somente `guia-checklist-aditivo` e `lei-item-novo-desconto` podem alcançar `INDEXABLE`. `lei-limite-25-50` está terminalmente `MIGRATED`; a fila restante fica noindex até uma coorte futura explicitamente definida.

Para atualizar um pacote após mudança material, rode `npm run editorial:build` e `npm run editorial:truth:write`, confira o diff do pacote e então abra o PR. Um commit docs-only posterior não exige nenhuma atualização do pacote.
