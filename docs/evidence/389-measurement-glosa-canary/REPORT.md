# #389 — canário on-page de atraso na medição

## Decisão

`VALIDATE` no front `INBOUND_CORE`, com alavancas de customer, trust e revenue.
A única superfície pública alterada é
`/conteudos/atraso-na-medicao-obra-publica/`. Nenhuma URL foi criada, nenhuma
segunda página foi reescrita e não houve mudança de `robots`, canonical,
redirect ou sitemap.

## Por que esta URL

O baseline `seo/gsc-2026-08-09/Paginas.csv` registra 10 impressões, zero
cliques e posição 8,1 para a página. É a maior exposição observada do cluster
sem clique. Em contraste, `/conteudos/glosa-de-medicao-obra-publica/` já tinha
8 impressões, 1 clique e posição 4,0; e
`/conteudos/medicao-de-obra-publica-rejeitada/` tinha 6 impressões, 1 clique e
posição 5,5. Reescrever uma dessas páginas misturaria o experimento com um
owner que já capturava clique.

O ownership aplicado é estreito:

- owner informacional: `atraso_processamento_medicao`;
- consulta representativa: `atraso na medição obra pública`;
- negativas: glosa de medição, medição rejeitada, atraso físico do cronograma,
  prorrogação e culpa da Administração;
- owner comercial e destino: `/medicoes-glosas-obras-publicas/`;
- oferta aplicável: `Dossiê de Medição, Glosa e Pagamento` (#333).

## Honestidade do baseline

O snapshot histórico não oferece um join confiável de consulta, página, país e
dispositivo. A linha de página é observada; o país e o dispositivo da URL são
`UNKNOWN`. O export live redigido de 2026-08-24 não retornou a URL; como o GSC
retorna top rows, isso também é `UNKNOWN`, não zero. O contrato completo está
em `canary-contract.json` e impede transformar ausência em evidência.

## Mudança editorial

- title de 57 caracteres, específico à intenção de atraso na medição;
- H1 e primeira resposta distinguem medição, ateste, liquidação e pagamento;
- exemplo hipotético calculado separa R$ 78.000,00 sem controvérsia no exemplo
  e R$ 18.000,00 em conferência, sem afirmar crédito ou recuperação;
- `FACT | CALCULATION | INFERENCE | UNKNOWN` ficam visíveis;
- esses quatro nomes de classe são as únicas exceções de idioma, registradas
  uma a uma e apenas para esta rota; os demais rótulos ficam em português;
- seis documentos mínimos, cinco limites e fronteira jurídica explícita;
- fontes oficiais e data de consulta visíveis;
- autoria técnica continua ligada ao perfil verificável;
- o artigo possui uma única ponte comercial contextual, para
  `/medicoes-glosas-obras-publicas/`, sem WhatsApp direto ou promessa.
- a ponte é declarada como `service_transition` apenas para a rota do canário,
  owner #389; a regra ampla da família `/conteudos/` não foi relaxada.
- a rota representa sua própria família no Lighthouse, sem isenção de SEO; os
  valores demonstrativos também ampliam automaticamente a cobertura Axe.

O before/after nominal está em `serp-contract.json`; as capturas renderizadas
estão em `screenshots/`.

## Evidência exigida por AGENTS.md

- **Visitor job:** localizar a etapa que impede o processamento da medição e
  organizar uma cobrança verificável sem confundir medição com pagamento.
- **Hipótese de aquisição/conversão:** alinhar snippet e primeira resposta à
  intenção estreita deve elevar clique qualificado; uma ponte única deve tornar
  observável a passagem conteúdo → rota comercial.
- **Data owner/contract:** GSC versionado em `seo/`; fatos do caso continuam
  documentos do cliente. Não há novo contrato de dados nem ingestão.
- **Quality gates:** `npm run organic:run`, `npm run inbound:gates`, testes BOFU,
  HTML, SEO, copy e o contrato fail-closed deste canário.
- **Analytics:** `data-cta-position=inline`,
  `data-cta-id=canary-medicao-dossie`, asset editorial e journey `contrato`;
  source corporativo `CONFENGE_WEB`, sem PII em analytics.
- **Rollback:** restaurar somente o HTML do canário ao SHA-256 anterior
  `455200070af5d118d3f564a9cf74de643d24a1511f058b61c30c070dfc708f8a`
  e remover sua declaração route-exact; não alterar a família `/conteudos/`.
- **ADR afetado:** ADR-STRAT-002; a implementação permanece em
  `confenge.com.br` e não cruza autoridade de runtime.

Repetir o experimento cem vezes antes da janela criaria cem unidades de
trabalho e diluiria a leitura causal. Cem repetições só melhorariam o sistema
depois que ownership, CTR e passagem comercial forem observados e uma regra de
seleção reutilizável tiver sido validada.

## Gate humano e janela

A revisão de qualidade e as fontes foram verificadas no PR. Isso não equivale a
aprovação factual/editorial humana em nome do responsável técnico. O registro
`review.json` permanece `HUMAN_REQUIRED`; o merge exige um humano nomeado.

A segunda URL fica bloqueada até 28 dias completos após o deploy e uma decisão
explícita `KEEP | ADJUST | KILL`. Posição estável sem melhora de CTR, perda do
owner ou canibalização por sibling acionam revisão ou rollback URL-exato.
