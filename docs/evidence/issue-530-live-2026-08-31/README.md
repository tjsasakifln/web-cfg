# Issue #530 — validação live residual das oito entregas

## Decisão

`DEFECT` nas nove rotas. Conteúdo-base, geometria, schema, atribuição,
JS-off e acessibilidade passaram; a escada de valor não passou:

1. CFG-D01 contradiz o contrato canônico de crédito;
2. hub e oito modelos não apresentam a passagem para direção recorrente dentro
   da escada — `/diretoria-b2g/` aparece apenas no chrome/footer.

A #530 não deve ser fechada. O residual concreto pertence à #547. A captura
full-page permanece `DEFERRED_BY_540`; nenhuma imagem full-page foi usada como
prova de produto.

- decisão de mercado: `VALIDATE_LIVE → EXECUTE_NOW` por defeito reproduzido;
- frente executiva: Revenue, Conversion e Trust;
- alavancas: receita, confiança e automação;
- tempo até evidência: imediato, no SHA live exato;
- North Star protegida:
  `visita high-intent → CTA → receipt CONFENGE_WEB → oportunidade qualificada`.

## Autoridade observada

- `origin/main`: `81c600b7c26dcc606d3a03e648ecd9820d9c1c37`;
- build e runtime antes e depois do audit: mesmo SHA;
- artefato público antes e depois:
  `f8df6acb623d204218cae25109316f15f15d67d8123d34956e5608649d829347`;
- runtime validado contra `RUNTIME-AUTHORITY.md`: produção,
  `netcup-production`, `confenge-nginx-node/v2`;
- audit: `2026-08-31T15:43:34.328Z` a `2026-08-31T15:45:53.667Z`.

O relatório estruturado, inclusive hashes SHA-256 das 55 capturas, está em
[`report.json`](report.json). As imagens em [`screenshots/`](screenshots/) são
somente first-fold ou segmentos de viewport após scroll controlado. Formulários
ficaram vazios e nenhum submit foi executado.

## Resultado por rota

| ID | Rota | Resultado | Motivo residual | Full-page |
|---|---|---|---|---|
| HUB | `/entregas/` | `DEFECT` | direção recorrente ausente da escada | `DEFERRED_BY_540` |
| CFG-D01 | `/casos/modelo-relatorio-inteligencia-licitacoes/` | `DEFECT` | crédito contraditório; diagnóstico sem link/âncora de R$ 8.000; direção recorrente ausente | `DEFERRED_BY_540` |
| CFG-D02 | `/casos/modelo-base-quantitativa-canonica/` | `DEFECT` | direção recorrente ausente da escada | `DEFERRED_BY_540` |
| CFG-D03 | `/casos/modelo-apresentacao-executiva-resultados/` | `DEFECT` | direção recorrente ausente da escada | `DEFERRED_BY_540` |
| CFG-D04 | `/casos/modelo-mapa-compradores-publicos/` | `DEFECT` | direção recorrente ausente da escada | `DEFERRED_BY_540` |
| CFG-D05 | `/casos/modelo-contratos-vincendos-relicitacao/` | `DEFECT` | direção recorrente ausente da escada | `DEFERRED_BY_540` |
| CFG-D06 | `/casos/modelo-mapeamento-concorrentes-publicos/` | `DEFECT` | direção recorrente ausente da escada | `DEFERRED_BY_540` |
| CFG-D07 | `/casos/modelo-painel-precos-obras-publicas/` | `DEFECT` | direção recorrente ausente da escada | `DEFERRED_BY_540` |
| CFG-D08 | `/casos/modelo-relatorio-executivo-consolidado/` | `DEFECT` | direção recorrente ausente da escada | `DEFERRED_BY_540` |

## Defeito 1 — crédito contraditório em CFG-D01

- severity: `HIGH`;
- owner: #547;
- reprodução:
  1. em `/entregas/`, CFG-D01 diz “Relatório avulso, à parte e fora do
     Diagnóstico; é o único sem o crédito de 60 dias”;
  2. em CFG-D01, antes do formulário escrito, a página diz “O valor volta como
     crédito se o Diagnóstico [...] for contratado em até 60 dias”;
  3. `page-contract-eight.v1.json` confirma
     `unit_01_in_package=false` e `unit_01_generates_credit=false`;
- arquivo provável:
  `casos/modelo-relatorio-inteligencia-licitacoes/index.html`, com regressão a
  fixar em `tests/commercial/test_page_contract_eight.mjs`;
- evidência sem valores de formulário:
  [hub/CFG-D01](screenshots/entregas-1366x768-first-offer.png) e
  [formulário CFG-D01 vazio](screenshots/casos_modelo-relatorio-inteligencia-licitacoes-1366x768-form.png).

O mesmo trecho de CFG-D01 menciona o Diagnóstico sem link, sem R$ 8.000 e sem
explicar que esta unidade fica fora do crédito. É o mesmo residual contratual,
não uma terceira iniciativa.

## Defeito 2 — direção recorrente ausente da escada

- severity: `MEDIUM`;
- owner: #547;
- afetadas: as nove rotas;
- reprodução: inspecionar o conteúdo de escada dentro de `<main>`.
  `/diretoria-b2g/` só existe no cabeçalho/rodapé nas nove rotas, sem trigger,
  escopo ou regra para escolher direção recorrente. A lacuna adicional do
  Diagnóstico em CFG-D01 está registrada no defeito 1;
- arquivos prováveis:
  `data/commercial/page-contract-eight.v1.json`,
  `scripts/commercial/render_public_catalog.mjs` e
  `scripts/commercial/render_eight_offer_contracts.mjs`;
- evidência: flags `recurring_direction_context=false` por rota em
  [`report.json`](report.json) e a
  [navegação decisória do hub](screenshots/entregas-1366x768-decision-nav.png).

## O que passou nas nove rotas

- HTTP 200, canonical exato e identidade live/main antes e depois;
- IDs/estados exatos das 54 capacidades contra o registry:
  8 `PUBLISHED`, 44 `VALIDATE`, 2 `BLOCKED`;
- nomes, preços, objeto, saída, decisão, trabalho comprimido, artefato em uso,
  prova inspecionável e âncora de preço;
- disclosure sintético em quatro papéis distintos por modelo: primeira leitura,
  artefato, boundary contratual e structured data; no hub: first-fold, ItemList,
  card e CTA de inspeção;
- CTA/form/options comparados campo a campo com o HTML canônico do mesmo SHA,
  `source=CONFENGE_WEB`, consentimento requerido e ação
  `/.netlify/functions/lead`;
- `CollectionPage + ItemList(8) + BreadcrumbList` no hub e
  `WebPage + Report + BreadcrumbList` nos modelos;
- zero `Offer` no contrato contemporâneo. Qualquer aparecimento passa a falhar
  fechado até atualização explícita do contrato;
- 390×844 e 1366×768 sem overflow horizontal, CTAs primários de pelo menos
  44 px, controles rotulados, tabelas com caption/scope e zero violação axe
  `critical`/`serious`;
- dez paradas de teclado por rota no mobile: 10/10 dentro do viewport após
  estabilizar a rolagem suave, 10/10 com outline/box-shadow real e skip link em
  primeiro lugar;
- JS-off em 390×844 preservando fatos, preço, disclosure, formulário,
  canonical, schema e layout;
- 48 destinos same-origin verificados, zero 4xx/5xx.

## Comandos reproduzidos

```sh
git fetch origin --prune
node scripts/site/runtime_authority.mjs --live
npm run audit:deliverables-live -- \
  --base=https://confenge.com.br \
  --out=docs/evidence/issue-530-live-2026-08-31
npm run test:deliverables-registry
npm run test:page-contract-eight
npm run test:value-first-copy
npm run test:public-offer-truth
npm run test:deliverables-hub
npm run test:deliverable-models
npm run test:report-model
npm run test:commercial-contract-consistency
npm run test:attribution
npm run inbound:gates
```

O audit live encerra com código 1 porque os dois defeitos acima são
reproduzíveis. Os demais gates passaram: 3.639/3.639 checks do catálogo,
664/664 do contrato das oito, 65/65 de value-first, 133/133 de verdade pública,
167 testes do hub/modelos, 521/521 de consistência, atribuição verde e
`inbound:gates` com zero erro. Isso demonstra por que o novo probe live é
necessário: os gates antigos não comparam a promessa de crédito cruzada nem a
escada completa.

## Hipótese, owners e rollback

O visitor job é escolher a unidade pelo problema/decisão, entender o artefato e
o trabalho removido, comparar o preço e avançar com contexto atribuível. A
hipótese é que essa clareza melhora progressão útil e qualidade da oportunidade;
não afirma WTP, ROI ou uplift causal. WTP continua em #336 e pricing em #341.

`web-cfg` é owner da projeção pública; #547 recebe os dois resíduos. #528
exclui explicitamente o hub e os modelos, enquanto #531/#532 não cobrem
crédito/escada. Nenhum
contrato `extra-cli`, dado, identidade, variável de measurement window ou rota
protegida foi modificado. A observabilidade permanece sem PII e o handoff
continua `CONFENGE_WEB`.

Rollback desta PR: reverter apenas o script, a entrada de `package.json` e este
diretório de evidência. Não há mudança pública para desfazer. ADR-STRAT-002,
RUNTIME-AUTHORITY e MARKET-CAPTURE-OS não mudam; esta prova confirma suas
fronteiras.
