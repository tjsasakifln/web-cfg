# Runbook — publicação pós-aprovação (coorte Wave 1)

Executar **somente após** aprovação humana individual (`approve_cli.py` com checklist, hash e `--confirm`).  
Não usar CI, bot, tester ou agente como revisor. Não fazer approve em lote.

Coorte preparada: `docs/editorial/WAVE1-FIRST-COHORT.md`  
(`guia-checklist-aditivo`, `lei-item-novo-desconto`)

## Pré-condições

- [ ] `npm run editorial:truth` → `READY_FOR_NAMED_HUMAN_APPROVAL` ou estado coerente pós-approve
- [ ] Material hashes do pacote batem com `WAVE1-HUMAN-REVIEW-PACKET.json` e o registro atual
- [ ] Branch de trabalho limpa; sem force-push em `main`
- [ ] Decisão de canibalização **por página** registrada em nota do approve

---

## 1. Aprovação humana individual

Para cada página da coorte (uma de cada vez):

```bash
# Usar o comando exato da ficha em WAVE1-FIRST-COHORT.md / HUMAN-ACTION-NOW.md
python3 scripts/editorial/approve_cli.py \
  --reviewer "NOME_HUMANO_REAL" \
  --page-id PAGE_ID \
  --notes "..." \
  --sources ... \
  --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
  --material-hash HASH_ATUAL \
  --confirm \
  --indexable
```

Verificar após cada approve:

```bash
python3 -c "import json; r=json.load(open('data/editorial/EDITORIAL-REGISTRY.json'));
p=next(x for x in r['pages'] if x['page_id']=='PAGE_ID');
print(p['status'], (p.get('approval') or {}).get('HUMAN_APPROVED'), (p.get('approval') or {}).get('reviewer'))"
```

Esperado: `INDEXABLE` / `HUMAN_APPROVED=true` / reviewer = nome humano real (nunca Tiago forjado, nunca CI).

## 2. Aplicar decisão de canibalização

| page_id | Peer | Decisão típica |
|---------|------|----------------|
| `guia-checklist-aditivo` | `/conteudos/erro-de-projeto-gera-aditivo-obra-publica/` | Diferenciar; manter peer se intenção distinta |
| `lei-item-novo-desconto` | `/conteudos/desconto-da-proposta-em-item-novo-aditivo/` | 301 ou noindex peer; **proibido dual-index** |

Implementar redirects em `_redirects` e no contrato nginx/Netcup **só** quando a decisão humana estiver documentada na nota de approve.
Não inventar 301 “por padrão” sem escolha explícita.

`lei-limite-25-50` não pertence mais à coorte: o estado `MIGRATED` e o inventário legado fixam o 301 direto para a owner em `/conteudos/limite-aditivo-25-50-obra-publica/`.

## 3. Reconstruir o site

```bash
npm run editorial:build
npm run build:site
npm run editorial:test
npm run editorial:truth
```

Confirmar no relatório: `indexable_count` = número de páginas realmente aprovadas (coorte ⊆ aprovadas).

## 4. Validar robots, canonical e sitemap

```bash
npm run validate:seo
npm run pseo:validate
npm run pseo:audit
npm run audit:public-artifact
```

Checagens manuais mínimas por URL aprovada:

- `<meta name="robots" content="index,follow">` (ou equivalente sem noindex)
- `link rel="canonical"` aponta para a URL canônica escolhida
- `sitemap-editorial.xml` contém a loc aprovada
- `sitemap-jurisprudencia.xml` **não** contém `jur-sumula-260-art`
- `sitemap-inteligencia.xml` permanece sem massa Wave 1

## 5. Confirmar que somente aprovadas viraram `index,follow`

```bash
# Exemplo: listar Wave 1 indexáveis no artefato
grep -R "name=\"robots\"" lei-14133-obras guias-contratos-obras jurisprudencia-contratos-obras -n | head -50
```

- Páginas Wave 1 **não** aprovadas: `noindex,follow`
- `jur-sumula-260-art`: continua rejeitada / não indexável
- Pilotos inteligência: permanecem fora do índice de massa

## 6. Confirmar tratamento das páginas substituídas

Para cada peer com 301:

- regra em `_redirects` consumida pelo build e validada no contrato nginx/Netcup do artefato `_site`
- URL antiga não permanece `index,follow` sem canonical/redirect

Para peer com noindex:

- meta robots no HTML público
- remoção eventual do `sitemap.xml` principal se listada

## 7. Lista exata para Google Search Console

Gerar a lista das duas URLs aprovadas na coorte e da owner canônica da migração:

```
https://confenge.com.br/guias-contratos-obras/checklist-pedido-aditivo/
https://confenge.com.br/lei-14133-obras/preco-item-novo-desconto-proposta/
https://confenge.com.br/conteudos/limite-aditivo-25-50-obra-publica/
```

Ajustar à lista **real** pós-approve (`npm run editorial:release-approved` imprime `gsc_submit_candidates` quando houver aprovações válidas).
Nunca solicitar indexação da donor `/lei-14133-obras/limite-25-50-aditivo-obra/`; ela deve responder 301 direto para a owner.

Submissão humana no GSC:

1. URL Inspection → Request indexing (por URL)
2. Sitemaps → garantir `https://confenge.com.br/sitemap-index.xml` enviado
3. **Não** afirmar indexação instantânea

## 8. Smoke de produção

Após deploy (merge em `main` + promote Netcup):

```bash
npm run test:redirects:prod
npm run test:prod-build-info
# opcional, com token/ambiente seguro:
# npm run probe:lead:prod
curl -sI "https://confenge.com.br/conteudos/limite-aditivo-25-50-obra-publica/" | head
curl -sI "https://confenge.com.br/lei-14133-obras/limite-25-50-aditivo-obra/" | head
curl -s "https://confenge.com.br/.well-known/build-info.json"
```

Conferir:

- HTTP 200 na owner e nas duas páginas aprovadas
- HTTP 301 na donor, com `Location: /conteudos/limite-aditivo-25-50-obra-publica/` em um único hop
- `build-info.json` commit = deploy
- redirects de peers (se aplicados)

## 9. Baseline real (sem causalidade prematura)

Registrar **antes de atribuir ganho ao Wave 1** (planilha ou `data/revops/` nota datada):

| Métrica | Fonte | Valor baseline | Data |
|---------|-------|----------------|------|
| Impressões (URL/query) | GSC | _preencher_ | |
| Cliques | GSC | _preencher_ | |
| CTR | GSC | _preencher_ | |
| Posição média | GSC | _preencher_ | |
| Conversões **real-only** | ops/revops (excluir synthetic/qa/spam/internal) | _preencher_ | |

Proibido misturar probes sintéticos em pipeline comercial.

## 10. Acompanhar a coorte

- Janela mínima sugerida: 14–28 dias de GSC pós-indexação observada
- Comparar vs baseline da §9 **sem** declarar vitória por uma oscilação
- Se dual ranking peer+Wave1: reabrir canibalização (passo 2)
- Próxima coorte só após esta fechar com evidência, não por volume

---

## Comandos de liberação (quando houver aprovações válidas)

```bash
npm run editorial:release-approved
# esperado: actions reais de rebuild/sitemap somente com valid_human_approved > 0
# se zero: noop + blocked — correto
```

## O que este runbook não autoriza

- Aprovar páginas fora da primeira coorte de três itens
- Indexar `jur-sumula-260-art`
- Indexar pilotos / inteligência em massa
- Declarar tráfego/receita/leads sem export GSC/revops real
- Contornar branch protection ou gates CI vermelhos
