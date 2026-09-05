# MV-09 — registro de integração comercial multivertical

- Campanha: `CONFENGE_MV_CAMPAIGN=09`
- Estado de decisão: `EXECUTE_NOW`
- Frente: `INBOUND ENGINE + REVENUE NOW`
- Alavancas: receita, distribuição, dados, automação, confiança e cliente
- Tempo para evidência: gates da PR final e smoke do mesmo SHA em produção
- `INITIAL_MAIN_SHA`: `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`
- `ROLLBACK_SHA` inicial: `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`
- North Star: oportunidades comerciais qualificadas, não volume de páginas ou commits

## Baseline revalidada em 2026-09-05

- `origin/main`, build-info e runtime-info live apontavam para o mesmo SHA inicial.
- `https://confenge.com.br/` era exclusivamente B2G no título, hero, navegação, schema e CTAs.
- `/servicos/` respondia `301` para `/servicos-obras-publicas/`.
- `/confianca/` e `/especialista/tiago-jun-sasaki/` existiam e eram canônicos, mas a apresentação permanecia B2G-cêntrica.
- `/servicos-obras-publicas/` permanecia canônico, indexável e com captura fail-closed.
- `/.well-known/build-info.json`, `/.well-known/runtime-info.json`, `/healthz` e `/ready` estavam saudáveis.
- `node scripts/site/runtime_authority.mjs --live` passou sem divergência.
- `npm ci` concluiu sem vulnerabilidades conhecidas. A máquina local usa Node 24, enquanto o ambiente canônico usa Node 22. O build inicial passou; a suíte inicial avançou até o gate browser e parou apenas por Chrome ausente.

## Política de donors — snapshot inicial

| PR | Disposição | Motivo / delta elegível |
|---|---|---|
| #590 | PARTIAL | Taxonomia corporativa, validadores e testes são bons doadores; reconciliar com MV-01 e com a ADR atual. |
| #591 | REJECT | DAG/pins de dependência não pertencem ao critical path comercial. |
| #592 | PARTIAL | Contrato/gate de papéis de prova pode reforçar claims; não é superfície do visitante. |
| #593 | REJECT | Hub local noindex, checks vermelhos e fora do critical path. |
| #594 | PARTIAL | Catálogo multivertical e limites são bons doadores; reconciliar com MV-01. |
| #595 | PARTIAL | Gate de conflito pode ser portado após revisão de autoridade/formulário. |
| #596 | PARTIAL | Biblioteca de intake somente com pin externo provado e fallback funcional. |
| #597 | PARTIAL | Fonte da shell corporativa, sem merge amplo nem reescrita massiva de rotas B2G. |
| #598 | PARTIAL | Motor privado somente depois das money pages e após corrigir falso positivo/nomes de artefatos. |
| #599 | PARTIAL | Claims estritamente provados; não adotar registry de identidade local como autoridade canônica. |
| #600 | DEFER | Pesquisa/medição não bloqueia a release. |
| #601 | SUPERSEDE | Composto draft amplo; usar somente donors atômicos revisados. |
| #602 | DEFER | Issue de apoio/complementação de projetos, não PR donor terminal. |
| #603 | ADOPT | Gate de linguagem pública direta, sujeito a reconciliação do delta final. |
| #604 | PARTIAL | Não mergear inteiro: quatro achados P1/P2 na revisão independente; ver abaixo. |

## Revisão independente de #604

### Standards

- P1: registry local de credenciais/identidade conflita com a autoridade de fatos e identidade de `extra-cli`.
- P1: `/triagem-tecnica/` declara captura persistida como ação terminal, mas o submit está `WITHHELD` e não há fallback WhatsApp/e-mail na própria rota.
- P1: expansão privada/multivertical atravessa a antiga decisão B2G sem atualizar a ADR no mesmo delta.
- Julgamento: motor readiness duplicado em `.js`/`.cjs`; campos de intake formam um data clump entre store/core/handoff.

### Spec

- P1: estágio de planejamento marca domínios ainda não aplicáveis como `EVIDENCE_PRESENT`, inflando `present_count` sem evidência declarada.
- P1: a ferramenta é indexada antes das money pages e leva prioritariamente à triagem withheld sem fallback.
- P2: o artefato calculado para fechar a lacuna não é renderizado; a UI expõe ID interno em inglês.
- P2: claim operacional de atendimento é agrupado como `VERIFIED` por fonte cadastral, quando deveria ser separado como autodeclaração.

## Dependências externas revalidadas

- Warmbly PR #265 foi mergeada no commit `e6b39887` e preserva o consumer inbound-only, sem envio SMTP.
- O pin final comum MV-03 ainda não estava publicado no snapshot inicial; submit adaptativo permanece bloqueado até prova atual.
- MV-08 ainda não tinha delta/PR terminal no snapshot inicial.

## Mudança concorrente em `main`

Durante a execução, #604 foi mergeada por outra sessão e `origin/main` avançou para `470a5ffafeaf45a59649109742ce5885f9789328`. A branch MV-09 incorporou esse SHA por merge sem force-push. Os achados P1 acima passaram a ser dívida real de `main` e deverão ser corrigidos ou retirados na convergência final. Como havia FAIL material de conversão e somente MV-09 está autorizada a publicar, o release concorrente `33996397421` foi cancelado antes de pacote, stage ou promoção. A produção permaneceu no SHA inicial; nenhum rollback foi necessário.

## Campanhas MV — decisões à medida que chegam a terminal

| Campanha | PR / HEAD observado | Disposição MV-09 | Motivo / arquivos usados |
|---|---|---|---|
| MV-01 | #607 / `895005bb52de6c70817b98357b0bbc685efccde5` | PARTIAL / ADOPT corrigido | Adotadas ADR-STRAT-002/004, constituição, taxonomia, matriz de intenção, contrato de página, catálogo modelado, validadores e testes. A projeção de preço foi tornada não autoritativa e fail-closed; CNPJ duplicado foi removido do catálogo; regra absoluta de ART na triagem foi condicionada. Nenhuma rota ou oferta modelada ganhou autorização de publicação. |
| MV-05 | #605 / `32fa6390f803493722ad34c5089b93c1331e9f6b` | PARTIAL | Pesquisa, copy por trabalho e matriz de intenção são donors. Nenhuma das quatro rotas candidatas tem aprovação de oferta/capacidade suficiente; o fragmento de captura conflita com o contrato ativo. A primeira execução de pSEO também revelou impacto global de CSS, corrigido no commit final do producer. Não promover páginas sem nova evidência. |
| MV-07 | #606 / `8066046cba697c598745070a50ef602db0390bc0` | PARTIAL / DEFER rota | Pesquisa legal, separação ente/licitante, matriz de aplicabilidade e contrato de conservação B2G são donors. Não criar `CFG-D55`: MV-01 canonizou `public_works_technical_procurement_planning`. Não promover a rota opcional, pois capacidade multidisciplinar/ART/RRT e captura compatível não estão provadas. |

### Revisão independente de MV-05 / #605

#### Standards

- P1: `capture.fragment.json` pede o campo `source`, rejeitado pelo allowlist atual; a fonte deve ser normalizada no servidor.
- P1: o formulário ativo sobrescreve os IDs route-specific por um único pin global, perdendo contexto de próxima ação.
- P1: o pacote afirmou que a ADR B2G antiga não mudava, embora a expansão privada atravesse essa decisão.
- Julgamento: a tupla rota/família/asset/oferta/CTA/decisão está duplicada em várias projeções.

#### Spec

- P1: nenhuma rota está promotable sem confirmação escrita de delivery, atribuição/ART/campo conforme o caso.
- P1: o fragmento não é compatível com o intake atual e poderia rejeitar ou reclassificar submissões.
- P1: o primeiro HEAD `7b1e348d…` falhou pSEO por `border_radius` e `gradient`; o producer publicou `32fa6390…` para corrigir o orçamento, sujeito aos checks atualizados.
- Sem scope creep material: IA por trabalho, ausência de doorway por persona, exemplos sintéticos e wording nacional condicional estão alinhados.

### Revisão independente de MV-01 / #607

#### Standards

- P1 corrigido na integração: o arquivo local de preço se declarava autoridade executável, embora governança seja owner de política/aprovação. Foi renomeado para `CONFENGE_PRICE_GATE_PROJECTION/1.0.0`, com `authority_pin=null`, estado `UNAVAILABLE` e default `DENY`.
- P2 corrigido: a triagem dizia categoricamente que ART não se aplicava. A regra agora depende do conteúdo contratado, das atribuições e da orientação do Crea competente.

#### Spec

- P2 corrigido: o CNPJ literal repetido em 18 ofertas criava cópias de identidade fora da autoridade canônica; foi removido de cada `invoice_nf`.
- Taxonomia, ADR, matriz, contrato de página e catálogo B2G por referência foram adotados. Ofertas continuam `MODEL_ONLY`/`WITHHELD`, sem inferência de publicação.

### Revisão independente de MV-07 / #606

#### Standards e Spec

- P1: a família candidata exigia `capture_form`, mas o intake observado estava `WITHHELD` e os campos propostos não pertenciam ao contrato aceito. Sem fallback funcional na rota, não há ação terminal publicável.
- P1: o fragmento propunha `CFG-D55`, em conflito com o offer ID canônico da MV-01; a mutação foi rejeitada.
- P1: a copy assumia produção multidisciplinar, campo e ART/RRT sem prova nominal/capacidade aprovada. A rota permanece candidata e fora do sitemap/runtime.

## Regra de integração

Cada campanha MV-01..08 será registrada como `ADOPT | PARTIAL | SUPERSEDE | REJECT`, com SHA, arquivos portados, testes e justificativa. Candidatos só serão promovidos preservando conteúdo/hash/intenção; qualquer alteração material será descrita neste arquivo.

O teste de cem repetições exige que taxonomia, roteamento, gates e artefatos sejam reutilizáveis. Uma expansão que apenas crie cem páginas ou cem operações manuais não será promovida.
