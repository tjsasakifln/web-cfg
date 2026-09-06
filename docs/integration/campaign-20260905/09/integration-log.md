# MV-09 — registro de integração comercial multivertical

- Campanha: `CONFENGE_MV_CAMPAIGN=09`
- Estado de decisão: `EXECUTE_NOW`
- Frente: `INBOUND ENGINE + REVENUE NOW`
- Alavancas: receita, distribuição, dados, automação, confiança e cliente
- Tempo para evidência: gates da PR final e smoke do mesmo SHA em produção
- `INITIAL_MAIN_SHA`: `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`
- `ROLLBACK_SHA` inicial: `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`
- North Star: oportunidades comerciais qualificadas, não volume de páginas ou commits

## Pre-flight retomado em 2026-09-05

- Worktree único: `/home/tjsasakifln/code/confenge/.worktrees/web-cfg/mv-09-commercial-production-20260905`.
- Branch única: `integrate/mv-09-commercial-production-20260905`.
- Base contemporânea consumida: `origin/main@3552cf228424ebb8f34266f671fd80df43d0615c`, que contém a PR #612 mergeada e a autoridade Netcup.
- Issue owner: web-cfg #611, `P0 / EXECUTE_NOW`; frente `INBOUND ENGINE + REVENUE NOW`; evidência esperada na PR e, após o contrato externo, no release Netcup.
- Governance #172: merge `0074722ce66f16af06dd4799ee88064ea8a12fc1`, `policy_hash=sha256:405ac86064a90641b843352d21cd21703744115de9592558e100671d92276df7`.
- Warmbly #266: ainda aberto no HEAD observado `b78e3d8cf820c7e594aad9f15f587299fdaf6004`; sem prova de runtime live. Producer e publicação permanecem fail-closed.

### WRITE_SET desta retomada

- `/quantitativos-orcamento-obras/**` e assets route-local estritamente necessários;
- `triagem-tecnica/**`, `assets/js/adaptive-intake.js` e producer/adapter em `netlify/functions/**` necessários ao contrato MV-03;
- registros derivados de rota, sitemap, navegação, CTA, pSEO, interface coverage e baselines/hash recapturados pelos geradores canônicos;
- testes route-exact de jornada privada, intake/readback, privacidade, acessibilidade, canonical/sitemap e conservação B2G;
- `docs/integration/campaign-20260905/09/**`, `package.json` apenas se necessário para expor gates da integração.

### DO_NOT_TOUCH_SET

- `/compatibilizacao-revisao-projetos/`, `/inspecao-documentacao-edificacoes/`, money pages de perícias, avaliações e SST;
- `CFG-D55`, crawler, DataLake, identidade paralela, CRM, SMTP, outbound, preço, checkout ou SLA;
- contratos, preços, URLs, indexação e conteúdo substantivo B2G, salvo chrome compartilhado e hashes derivados sem mudança semântica;
- Netlify como autoridade de produção, DNS, secrets e configuração live de Warmbly/Governance;
- claims CREA/RNP, CPTEC, SST, case, capacidade de campo, ART automática, prazo, preço ou resultado sem prova.

## Fixed points finais consumidos pela MV-09

| Autoridade / donor | SHA ou hash consumido | Uso e disposição |
|---|---|---|
| web-cfg #612 | merge `3552cf228424ebb8f34266f671fd80df43d0615c` | `ADOPT`: base Netcup/runtime de produção; Netlify segue apenas preview. |
| web-cfg #607 | head `895005bb52de6c70817b98357b0bbc685efccde5` | `PARTIAL`: constituição, taxonomia, intent e gates; nenhuma oferta modelada foi promovida por inferência. |
| web-cfg #597 | head `830c222277b3a52fdfadf2a0bc95e91d24f8ac80` | `PARTIAL`: shell corporativa e hub; B2G preservada como vertical com acervo próprio. |
| web-cfg #605 | head `32fa6390f803493722ad34c5089b93c1331e9f6b` | `PARTIAL`: linguagem por trabalho e recorte de quantitativos/orçamento; as demais rotas candidatas continuam fechadas. |
| web-cfg #608 | head `9afe028895800228e20b11eed86abd02ee1ffa85` | `PARTIAL / ADOPT corrigido`: producer adaptativo, persistência, idempotência, readback e fallbacks; pin de produção permanece fail-closed. |
| web-cfg #610 | head `870500fcea63ad73e95bcd0145c286c2fe6cb378` | `PARTIAL`: copy de confiança e conflito sem expor motivo protegido ou criar nova autoridade factual. |
| web-cfg #606 | head `8066046cba697c598745070a50ef602db0390bc0` | `PARTIAL / WITHHELD`: conservação B2G adotada; `CFG-D55` e capacidade sem prova não foram publicados. |
| web-cfg #603 | head `e23d073d269d599c547d2b12bdc06baa615fc04f` | `ADOPT`: gate de linguagem direta, aplicado como situação → decisão/artefato → evidência/limite → próxima ação. |
| web-cfg #534 | body SHA-256 `c381fc3d053000bc1b061a4f4a49e75c721262e155252a3d910021f85b299722` | `ADOPT`: critério contemporâneo de linguagem pública; issue atualizada em `2026-09-06T00:23:48Z`. |
| Governance #172 | merge `0074722ce66f16af06dd4799ee88064ea8a12fc1`; policy `sha256:405ac86064a90641b843352d21cd21703744115de9592558e100671d92276df7` | `ADOPT`: política oficial mergeada e pinada nos testes/manifesto. |
| Warmbly #266 | head `b78e3d8cf820c7e594aad9f15f587299fdaf6004` | `READY, NOT LIVE`: checks verdes e mergeability `CLEAN`, mas PR ainda `OPEN` e sem SHA/runtime live; bloqueia somente a ativação do submit. |

O censo canônico de ações parte das `128` CTAs declaradas em `origin/main@3552cf2` e fecha em `131`, com `27` rotas de captura e zero problemas derivados. A repetição melhora o sistema: novas superfícies herdam família pública, perfil de próxima ação, privacidade, persistência e gate, sem inventário manual por página.

Estado máximo permitido neste fixed point: `READY_TO_PUBLISH_BLOCKED_BY_CROSS_REPO_CONTRACT`. A shell corporativa, os canais diretos e a rota privada estão prontos na PR, mas não serão mergeados nem publicados enquanto Warmbly #266 não estiver mergeada e o contrato não estiver provado no runtime consumidor. O endpoint de configuração adaptativa responde fail-closed e o botão de submit permanece bloqueado; WhatsApp, e-mail e telefone continuam visíveis e contextualizados na candidata, sem serem usados para contornar o bloqueio de release definido pelo #611.

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

Durante a execução, #604 foi mergeada por outra sessão e `origin/main` avançou para `470a5ffafeaf45a59649109742ce5885f9789328`. A branch MV-09 incorporou esse SHA por merge sem force-push. Os achados P1 acima passaram a ser dívida real de `main` e deverão ser corrigidos ou retirados na convergência final. Como havia FAIL material de conversão e somente MV-09 está autorizada a publicar, o release concorrente `33996397421` foi cancelado antes de pacote, stage ou promoção. Outro run autoritativo publicou posteriormente `470a5ffafeaf45a59649109742ce5885f9789328`; esse SHA passou a ser o baseline vivo e candidato a rollback da release final. A publicação não libera os achados da revisão de #604: a home continua B2G-exclusiva, `/servicos/` continua redirecionando para B2G e a ferramenta privada foi indexada antes da shell corporativa.

## Campanhas MV — decisões à medida que chegam a terminal

| Campanha | PR / HEAD observado | Disposição MV-09 | Motivo / arquivos usados |
|---|---|---|---|
| MV-01 | #607 / `895005bb52de6c70817b98357b0bbc685efccde5` | PARTIAL / ADOPT corrigido | Adotadas ADR-STRAT-002/004, constituição, taxonomia, matriz de intenção, contrato de página, catálogo modelado, validadores e testes. A projeção de preço foi tornada não autoritativa e fail-closed; CNPJ duplicado foi removido do catálogo; regra absoluta de ART na triagem foi condicionada. Nenhuma rota ou oferta modelada ganhou autorização de publicação. |
| MV-03 | #608 / `9afe028895800228e20b11eed86abd02ee1ffa85` | PARTIAL / ADOPT corrigido | Adotados HTML/CSS/JS de dois passos, producer, persistência, idempotência, receipt sem PII, readback e fallback real por WhatsApp/e-mail/telefone. O pin usa Governance #172 mergeada, mas a autoridade de produção continua `WITHHELD` por Warmbly #266; configuração e submit falham fechados. |
| MV-05 | #605 / `32fa6390f803493722ad34c5089b93c1331e9f6b` | PARTIAL | Pesquisa, copy por trabalho e matriz de intenção são donors. A MV-09 promoveu somente `/quantitativos-orcamento-obras/`, com escopo documental estreito, sem preço/SLA/case e com captura contextual. As outras rotas candidatas continuam retidas por oferta, capacidade ou credencial insuficiente. |
| MV-06 | #609 / `5a1e632744045ced0902547fc39218d7746c87fe` | PARTIAL / DEFER rotas | Pacote de pesquisa, limites e copy é donor. Perícia, avaliação e SST não foram promovidas: `offer_id` nulo, capacidades/credenciais WITHHELD, conflito/captura incompletos; SST ainda exige título e atribuição específicos. |
| MV-07 | #606 / `8066046cba697c598745070a50ef602db0390bc0` | PARTIAL / DEFER rota | Pesquisa legal, separação ente/licitante, matriz de aplicabilidade e contrato de conservação B2G são donors. Não criar `CFG-D55`: MV-01 canonizou `public_works_technical_procurement_planning`. Não promover a rota opcional, pois capacidade multidisciplinar/ART/RRT e captura compatível não estão provadas. |
| MV-02 | #610 / `870500fcea63ad73e95bcd0145c286c2fe6cb378` | PARTIAL | Adotar copy de confiança, caveat nacional e regras puras de conflito somente após retirar exposição de `reason_class`, impedir POST sem JavaScript e preservar o registry factual atual. O producer não provou pin SELECT-only de `extra-cli`; a PR também delegou a recaptura do sitemap à MV-09. |
| MV-08 | Warmbly #267 / `a4201f2ff3396f3e08030997563ec397b9627df2` | PARTIAL / BLOCKED | O mapping mantém oito landings B2G exatas, sete destinos privados retidos e SMTP/dispatch inalterados. Não integrar ainda: `INTELIGENCIA_PNCP` foi mapeado para uma landing de proposta específica sem message match; o resolver exportado por vertical também é ambíguo. Correção registrada na PR. |
| MV-04 | commit producer `68493f40d70b99a9d4f3afa8d84b08c9b37b23aa` | PARTIAL / ADOPT corrigido | Adotadas proposta de valor, chooser, hub corporativo e preservação B2G. A MV-09 publicou `/servicos/`, ativou a shell corporativa global, corrigiu razão social no schema, rota legada, escopo nacional e caminhos para loteamento, disputa trabalhista e planejamento público. O hash do canário #389 foi recapturado porque somente header/footer globais mudaram; o artigo e o contrato comercial permaneceram byte-equivalentes fora da shell. |

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

### Revisão independente de MV-03 / #608 e dependências

- P1: web enviaria `CONFENGE_WEB_INTAKE/2.1.0-mv03.20260905`, enquanto Warmbly #266 aceita `2.0.0-draft.20260904`; toda submissão seria recusada.
- P1: o consumer converte `PHONE` em `WHATSAPP` e registra opt-in de WhatsApp, ampliando consentimento de canal indevidamente.
- P1: o readback Warmbly não implementa o schema fechado exigido por Governance #172; o teste web usava resposta mockada.
- P1: o envelope web acrescenta campos não aceitos pelo schema fechado da Governance; falta um wrapper protegido versionado.
- P1: replay da mesma idempotency key com payload diferente pode retornar sucesso do registro anterior antes do consumer.
- P2: `other_technical_need` foi tratado como sexto núcleo, contrariando a taxonomia de cinco; deve ser intenção `NEEDS_CONTEXT`.
- Resultado após correção semântica: Governance #172 foi mergeada e pinada; o producer web foi portado com envelope protegido, minimização, idempotência vinculada ao payload, receipt opaco e readback correlacionado. Warmbly #266 continua aberta, portanto a configuração pública e o submit permanecem `WITHHELD`. Os canais alternativos são a ação real desta release e não autorizam outbound/SMTP.

### Revisão independente de MV-06 / #609

- P1 de promoção: as três famílias propõem `capture_form`, mas os candidatos contêm somente WhatsApp/e-mail e não há submit adaptativo ativável.
- P1 de promoção: todos os `offer_id` continuam nulos/blocked e as ofertas correspondentes estão `MODEL_ONLY` ou `WITHHELD_PROOF`.
- P1: SST não tem título/registro/atribuição publicável; perícia e avaliação também não exibem prova profissional suficiente para money pages.
- O pacote continua noindex fora do artefato público. Pesquisa, limites, copy condicional e capturas podem orientar uma rodada posterior.

### Revisão independente de MV-02 / #610

- P1: `confengeEvaluateConflict` exportava `decision`/`inner.reason_class`, embora o contrato declare que motivo pertence à camada protegida.
- P1: com JavaScript desligado, o formulário de conflitos fazia POST de respostas sensíveis e do honeypot para a própria rota.
- P1: o registry se declarava projeção SELECT-only sem contrato, versão, record key ou hash de `extra-cli`; claims continuavam localmente owned.
- P2: “Responsável” podia ser lido como responsável técnico, quando a fonte prova apenas sócio/quem conduz e o CREA segue WITHHELD.
- P2: `recheck_after` não retirava claim vencido; somente `expires_at` fechava a projeção.
- Resultado: não adotar o registry novo. Portar apenas copy e lógica de conflitos corrigida, mantendo CREA/RNP/CPTEC/SST WITHHELD e wording nacional condicionado.

### Revisão independente de MV-08 / Warmbly #267

- P2 material para continuidade comercial: `INTELIGENCIA_PNCP` era colapsado em `EDITAL_OU_PROPOSTA` e apontava para o Bid Room, sem corresponder à promessa de inteligência de mercado/PNCP.
- P2: `CommercialDestinationForVertical(B2G)` retornava silenciosamente a primeira de oito rotas, embora a API pareça route-exact.
- As oito rotas B2G ativas responderam 200, self-canonical e com âncoras válidas. Sete superfícies privadas permanecem `NOT_ACTIVATED`/`WITHHELD`.
- A PR não toca scheduler, SMTP, eligibility ou dispatch; `SMTP_DELTA=0` e dispatch permanece pausado. Checks ficaram verdes, mas o erro de message match impede a adoção integral neste fixed point.

## Regra de integração

Cada campanha MV-01..08 será registrada como `ADOPT | PARTIAL | SUPERSEDE | REJECT`, com SHA, arquivos portados, testes e justificativa. Candidatos só serão promovidos preservando conteúdo/hash/intenção; qualquer alteração material será descrita neste arquivo.

O teste de cem repetições exige que taxonomia, roteamento, gates e artefatos sejam reutilizáveis. Uma expansão que apenas crie cem páginas ou cem operações manuais não será promovida.

## Decisões do red-team de receita

- A ferramenta de prontidão privada de #604 permanece acessível e útil antes do contato, mas foi retirada do sitemap, marcada `noindex,follow` e não ocupa home/nav. Disposição: `PARTIAL`, pois não antecede money pages nem se apresenta como SaaS substituto.
- O shell compartilhado agora sincroniza também a descrição institucional do rodapé. Copy B2G permanece apenas em rotas/conteúdo B2G; páginas corporativas usam a tese guarda-chuva.
- A citação religiosa antes injetada em todo artefato foi removida. Ela não cumpria trabalho de aquisição, confiança técnica ou conversão para um público nacional heterogêneo e criava conteúdo público ausente das fontes das páginas.
- GitHub não ocupa posição de prova no primeiro percurso. Uso de IA permanece transparente na política própria, sem dominar hero, navegação ou confiança.
- A integração de MV-04 é `PARTIAL / ADOPT corrigido`: o commit fixo foi usado como donor, mas ativação, `/servicos/`, schema, triagem, wording nacional, footer e gates foram corrigidos na MV-09. O producer não publicou uma PR terminal apta à integração integral.
- A integração de MV-05 é `PARTIAL`: somente o recorte de quantitativos e orçamento foi promovido. O conteúdo foi preservado em intenção, mas ligado ao registry, sitemap, IA, artefato público e contrato central de próxima ação; os rótulos genéricos de canal foram especializados após o red-team.

Matriz final de canonical: `docs/integration/campaign-20260905/09/intent-canonical-matrix.md`. Simulação dos doze visitantes: `docs/integration/campaign-20260905/09/revenue-red-team.md`.

## Evidência final da candidata

- Build público: `79` URLs no sitemap, `79` indexáveis, `0` erros e `0` warnings; hash do artefato `64e3c69261a0f810d46c230a9392abb7c91b356d8e5e2d1d288d1f1077686ef5` e hash do manifesto `d41a5cb18fdeac79c16e73a5ce8fa9ff7b16a1571217598a1abc4e8f3e94c76b` no build de `1b43a4bf13f457ae1748526a24e896cc7da9859b`.
- Cobertura: `254` rotas públicas, `58` rotas de risco em dois viewports, `29` rotas com captura, `39` famílias Lighthouse e `42` representantes; nenhum bloqueio axe na cunha em móvel ou desktop.
- Lighthouse completo e isolado: `PASS`; home `3/3`, performance mínima `99`, TBT p75 `88 ms`, long task máximo `138 ms`, CLS máximo `0`. A cunha marcou performance `100`, acessibilidade `100`, best practices `96`, SEO `100`, LCP `1.359 s`, TBT `0` e CLS `0`.
- B2G: `/diretoria-b2g/` e `/diagnostico-b2g-expansao/` marcaram `100/100/100/100` nas três repetições; `/servicos-obras-publicas/` marcou performance e SEO `100`.
- Jornada browser: `23/23` checks aprovados; CTA route-local, três fallbacks, submit indisponível sob configuração `503`, retry idempotente, attribution preservada, allowlist UTM e analytics sem PII. Capturas e relatório estão em `evidence/after/`.
- Gates adicionais: `knowledge-funnel 14/14`, contrato de host Netcup `22/22`, intake `16/16`, próxima ação `27/27`, sitemap graph `29/29`, handoff `26/26`, runtime authority `29/29`, SEO/privacy/brand/copy/inbound gates aprovados.
- Warmbly #266 revalidada no HEAD `b78e3d8cf820c7e594aad9f15f587299fdaf6004`: `OPEN`, mergeável e checks verdes, sem merge SHA e sem evidência de runtime live. Este é o único bloqueio real de publicação; não há evidência comercial observada nesta sessão.
