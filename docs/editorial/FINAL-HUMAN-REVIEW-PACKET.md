# FINAL HUMAN REVIEW PACKET — Wave 1

**Generated:** 2026-08-02T19:14:01Z

## Princípio

Não procure justificativas para aprovar. Procure razões para reprovar.
A autorização para auditar **não** equivale à revisão humana nominal.
**Nenhuma página foi marcada HUMAN_APPROVED nesta execução automatizada.**

## Sumário executivo

- **Prontas para aprovação humana (`READY_FOR_HUMAN_APPROVAL`):** 11
- **Bloqueadas:** 1 (`jur-sumula-260-art` → REJECTED)
- **INDEXABLE nesta rodada:** 0
- **Sitemaps editoriais:** vazios de URLs não aprovadas
- **Autoria pública:** Biblioteca técnica CONFENGE (`author_is_tiago: false`)

### Única ação manual restante

1. Tiago Sasaki lê este pacote (e o JSON espelho).
2. Executa localmente `bash scripts/editorial/approve_wave1_tiago.sh` (script **não** executado pela auditoria).
3. Roda `npm run editorial:build && npm run editorial:test`.
4. Resolve canibalização pós-indexação onde a matriz exige (pares com `/conteudos/` ainda `index,follow`).
5. Deploy + submissão de sitemaps no GSC (somente URLs aprovadas).

## Correção jurídica material desta auditoria

**Art. 115, § 1º, Lei nº 14.133/2021 (Planalto, verificado 2026-08-02):**

> É proibido à Administração retardar imotivadamente a execução de obra ou serviço, ou de suas parcelas, **inclusive na hipótese de posse do respectivo chefe do Poder Executivo ou de novo titular no órgão ou entidade contratante**.

O repositório continha a redação incorreta *"posse provisória ou definitiva"* em excerpts/claims/manifest. **Corrigido** em fontes oficiais capturadas, SOURCE-MANIFEST, páginas `lei-atraso-administracao` e `guia-notificacao-atraso`, e registries.

## Páginas candidatas (detalhe)

### `lei-art124-alteracao-obra` — **READY_FOR_HUMAN_APPROVAL**

| Campo | Valor |
|---|---|
| URL | `/lei-14133-obras/art-124-alteracao-contratual-obra/` |
| Hash material | `8ca36cc833f6dca2594d057d30722eb1328350d470ae01a03d232830053925e1` |
| Registry | `EDITORIAL_REVIEWED` |
| Intenção | art. 124 aditivo obra |
| Dispositivos | art.124, art.125, art.126 |
| Desktop HTTP/robots | 200 / `noindex,follow` |
| Screenshot desktop | `docs/evidence/wave1-audit-screenshots/lei-14133-obras__art-124-alteracao-contratual-obra__desktop.png` |
| Screenshot mobile | `docs/evidence/wave1-audit-screenshots/lei-14133-obras__art-124-alteracao-contratual-obra__mobile.png` |
| CTA WA/mail/origem | {'whatsapp_present': True, 'mailto_present': True, 'origin_url_in_message': True, 'no_result_promise': True} |
| Recomendação | aprovar (manter noindex até HUMAN_APPROVED+INDEXABLE pelo script de Tiago) |

**Fontes oficiais abertas:** Planalto L14133.htm (2026-08-02) + source_ids da página.

**Claims verificados:**
- `art124-eixos-unilateral-acordo` (direct): O art. 124 organiza alterações unilaterais pela Administração (inciso I) e por acordo entre as partes (inciso II), sempre com as devidas justificativas.
- `art124-inciso-i-hipoteses` (direct): Unilateral: (a) projeto/especificações para adequação técnica; (b) acréscimo/supressão quantitativa nos limites legais.
- `art124-inciso-ii-hipoteses` (direct): Por acordo (II): substituição de garantia; regime/modo de execução; forma de pagamento superveniente com valor atualizado; reequilíbrio nas hipóteses da alínea d.
- `art136-nao-e-124-denominacao` (direct): Alterações na razão ou denominação social do contratado podem ser apostiladas (art. 136, III), sem se confundir com hipóteses do art. 124, II.
- `art125-limites-no-contexto-124` (direct): Nas alterações unilaterais do art. 124, I, vigoram os limites de 25% e, em reforma de edifício ou equipamento, 50% de acréscimo (art. 125).
- `art126-nao-transfigura-objeto` (direct): Alterações unilaterais não podem transfigurar o objeto da contratação (art. 126).
- `art132-formalizacao-contexto-124` (direct): A formalização do termo aditivo é condição para a execução das prestações determinadas pela Administração, salvo antecipação justificada com formalização em até 1 mês (art. 132).

**Canibalização:**
- **competitors:** ['/conteudos/aditivo-qualitativo-quantitativo/ (noindex)', '/aditivos-obras-publicas/ (serviço)']
- **overlap:** baixa–média (intenção legal específica art.124 vs guias genéricos)
- **winner:** Wave 1 (quando INDEXABLE)
- **action:** manter ambas; Wave 1 é aplicação legal profunda; serviço institucional permanece comercial

**Erros encontrados:**
- nenhum material residual

**Correções executadas:**
- Verificado: art.124 I/II sem vínculo societário; arts.125/126/132 coerentes com Planalto.

**Risco residual:**
- Caso concreto (contrato, edital, matriz, regulamento local) pode modificar a conclusão.
- Aprovação automática revogada; só approve_cli.py com revisor nominal.

**Justificativa do status:** Gates editoriais verdes; claims sustentados por trechos oficiais Planalto verificados em 2026-08-02; robots noindex,follow; fora de sitemaps; autor Biblioteca técnica CONFENGE; author_is_tiago false; CTAs contextuais; sem promessa de resultado. Pronto para revisão humana nominal.

**Recomendação final:** aprovar via approve_wave1_tiago.sh (Tiago Sasaki) + --indexable; em seguida executar pós-aprovação de canibalização se aplicável

### `lei-limite-25-50` — **READY_FOR_HUMAN_APPROVAL**

| Campo | Valor |
|---|---|
| URL | `/lei-14133-obras/limite-25-50-aditivo-obra/` |
| Hash material | `5f4aec0b2e9e62d951262cec4bbd2edc4dd41b0caf1e1fcf427beb793a58b70f` |
| Registry | `EDITORIAL_REVIEWED` |
| Intenção | limite aditivo 25 50 |
| Dispositivos | art.125, art.124, art.126 |
| Desktop HTTP/robots | 200 / `noindex,follow` |
| Screenshot desktop | `docs/evidence/wave1-audit-screenshots/lei-14133-obras__limite-25-50-aditivo-obra__desktop.png` |
| Screenshot mobile | `docs/evidence/wave1-audit-screenshots/lei-14133-obras__limite-25-50-aditivo-obra__mobile.png` |
| CTA WA/mail/origem | {'whatsapp_present': True, 'mailto_present': True, 'origin_url_in_message': True, 'no_result_promise': True} |
| Recomendação | aprovar (manter noindex até HUMAN_APPROVED+INDEXABLE pelo script de Tiago) |

**Fontes oficiais abertas:** Planalto L14133.htm (2026-08-02) + source_ids da página.

**Claims verificados:**
- `art125-limites-25-50` (direct): Nas alterações unilaterais do art. 124, I, o contratado aceita acréscimos ou supressões de até 25% do valor inicial atualizado; em reforma de edifício ou de equipamento, acréscimo de até 50%.
- `art125-vinculo-124i` (direct): Os limites do art. 125 aplicam-se às alterações unilaterais do inciso I do art. 124.
- `art126-nao-transfigura` (direct): Alterações unilaterais do art. 124, I, não podem transfigurar o objeto da contratação (art. 126).
- `art125-50-nao-e-regra-geral` (direct): O limite de acréscimo de 50% não é regra geral de qualquer edificação nova: o art. 125 eleva o teto apenas no caso de reforma de edifício ou de equipamento.

**Canibalização:**
- **competitors:** ['/conteudos/limite-aditivo-25-50-obra-publica/ (index,follow)']
- **overlap:** alta (mesma consulta principal de teto 25/50)
- **winner:** Wave 1 preferida após HUMAN_APPROVED (devices + claims + fontes frescas)
- **action:** após indexar Wave 1: noindex ou canonical do conteudos para Wave 1; não dual-index

**Erros encontrados:**
- nenhum material residual

**Correções executadas:**
- Verificado: 50% só reforma de edifício/equipamento; limites sobre valor inicial atualizado.

**Risco residual:**
- Canibalização alta com URL indexable em /conteudos/: resolver noindex/consolidação no pós-aprovação antes de submeter sitemap.
- Caso concreto (contrato, edital, matriz, regulamento local) pode modificar a conclusão.
- Aprovação automática revogada; só approve_cli.py com revisor nominal.

**Justificativa do status:** Gates editoriais verdes; claims sustentados por trechos oficiais Planalto verificados em 2026-08-02; robots noindex,follow; fora de sitemaps; autor Biblioteca técnica CONFENGE; author_is_tiago false; CTAs contextuais; sem promessa de resultado. Pronto para revisão humana nominal.

**Recomendação final:** aprovar conteúdo e indexar Wave 1 somente após (ou em conjunto com) disposição do competidor indexable em /conteudos/ conforme matriz; script de aprovação ainda executável com ciência do residual

### `lei-item-novo-desconto` — **READY_FOR_HUMAN_APPROVAL**

| Campo | Valor |
|---|---|
| URL | `/lei-14133-obras/preco-item-novo-desconto-proposta/` |
| Hash material | `66bb5e782da7074e9e646c90a3752c75ffa40b5619658a01184599afbbf8f0d8` |
| Registry | `EDITORIAL_REVIEWED` |
| Intenção | item novo aditivo desconto |
| Dispositivos | art.127, art.124, art.125 |
| Desktop HTTP/robots | 200 / `noindex,follow` |
| Screenshot desktop | `docs/evidence/wave1-audit-screenshots/lei-14133-obras__preco-item-novo-desconto-proposta__desktop.png` |
| Screenshot mobile | `docs/evidence/wave1-audit-screenshots/lei-14133-obras__preco-item-novo-desconto-proposta__mobile.png` |
| CTA WA/mail/origem | {'whatsapp_present': True, 'mailto_present': True, 'origin_url_in_message': True, 'no_result_promise': True} |
| Recomendação | aprovar (manter noindex até HUMAN_APPROVED+INDEXABLE pelo script de Tiago) |

**Fontes oficiais abertas:** Planalto L14133.htm (2026-08-02) + source_ids da página.

**Claims verificados:**
- `art127-preco-sem-unitario` (direct): Sem preços unitários para obras ou serviços cujo aditamento se fizer necessário, fixam-se pela relação proposta/orçamento-base sobre preços referenciais ou de mercado na data do aditamento, respeitado o art. 125.
- `art124-contexto-aditamento` (direct): Aditamento com item novo permanece no regime de alterações do art. 124, que exige as devidas justificativas para unilateralidade ou acordo.
- `art125-limite-item-novo` (direct): Preços de obras ou serviços sem unitário no aditamento, fixados na forma do art. 127, respeitam os limites de acréscimo e supressão do art. 125.
- `desconto-proposta-operacional` (interpretive): Manutenção do desconto da proposta em item novo é prática/tese frequente, não regra automática do art. 127; exige coerência documental com a proposta e o contrato.

**Canibalização:**
- **competitors:** ['/conteudos/desconto-da-proposta-em-item-novo-aditivo/ (index,follow)', '/conteudos/preco-de-item-novo-aditivo-obra-publica/ (noindex)']
- **overlap:** alta com desconto-da-proposta
- **winner:** Wave 1 preferida após aprovação
- **action:** após indexar Wave 1: noindex/consolidar conteudos desconto-da-proposta; manter links related

**Erros encontrados:**
- nenhum material residual

**Correções executadas:**
- Verificado: art.127 relação proposta/orçamento-base; desconto não automático.

**Risco residual:**
- Canibalização alta com URL indexable em /conteudos/: resolver noindex/consolidação no pós-aprovação antes de submeter sitemap.
- Caso concreto (contrato, edital, matriz, regulamento local) pode modificar a conclusão.
- Aprovação automática revogada; só approve_cli.py com revisor nominal.

**Justificativa do status:** Gates editoriais verdes; claims sustentados por trechos oficiais Planalto verificados em 2026-08-02; robots noindex,follow; fora de sitemaps; autor Biblioteca técnica CONFENGE; author_is_tiago false; CTAs contextuais; sem promessa de resultado. Pronto para revisão humana nominal.

**Recomendação final:** aprovar conteúdo e indexar Wave 1 somente após (ou em conjunto com) disposição do competidor indexable em /conteudos/ conforme matriz; script de aprovação ainda executável com ciência do residual

### `lei-reequilibrio-reajuste` — **READY_FOR_HUMAN_APPROVAL**

| Campo | Valor |
|---|---|
| URL | `/lei-14133-obras/reequilibrio-reajuste-repactuacao/` |
| Hash material | `b339ec79e05601c2113db5ebf64e5edfed07766c903cdc246eb2036965070e30` |
| Registry | `EDITORIAL_REVIEWED` |
| Intenção | reequilibrio reajuste repactuacao |
| Dispositivos | art.130, art.131, art.135, art.136, art.6 |
| Desktop HTTP/robots | 200 / `noindex,follow` |
| Screenshot desktop | `docs/evidence/wave1-audit-screenshots/lei-14133-obras__reequilibrio-reajuste-repactuacao__desktop.png` |
| Screenshot mobile | `docs/evidence/wave1-audit-screenshots/lei-14133-obras__reequilibrio-reajuste-repactuacao__mobile.png` |
| CTA WA/mail/origem | {'whatsapp_present': True, 'mailto_present': True, 'origin_url_in_message': True, 'no_result_promise': True} |
| Recomendação | aprovar (manter noindex até HUMAN_APPROVED+INDEXABLE pelo script de Tiago) |

**Fontes oficiais abertas:** Planalto L14133.htm (2026-08-02) + source_ids da página.

**Claims verificados:**
- `repactuacao-art135-escopo` (direct): Repactuação no art. 135 aplica-se a serviços contínuos com dedicação exclusiva ou predominância de mão de obra, com demonstração analítica de variação de custos.
- `reajuste-sentido-estrito` (direct): Reajustamento em sentido estrito é aplicação do índice de correção monetária previsto no contrato que retrate a variação do custo de produção.
- `reequilibrio-art130-aditivo` (direct): Alteração unilateral que aumente ou diminua encargos exige restabelecimento do equilíbrio no mesmo termo aditivo (art. 130).
- `reequilibrio-art131-janela` (direct): Extinção não impede reconhecimento do desequilíbrio; pedido deve ser formulado na vigência e antes de prorrogação nos termos do art. 107.
- `apostila-136-reajuste-repactuacao` (direct): Variação de valor por reajuste ou repactuação previstos no contrato pode ser registrada por apostila (art. 136, I).
- `matriz-riscos-equilibrio` (direct): A matriz de riscos caracteriza o equilíbrio econômico-financeiro inicial e a alocação de ônus de eventos supervenientes (art. 6º, XXVII), interferindo na análise de reequilíbrio.
- `art107-prorrogacao-continuos` (direct): Contratos de serviços e fornecimentos contínuos podem ser prorrogados sucessivamente até vigência máxima decenal, com atestação de vantajosidade (art. 107).

**Canibalização:**
- **competitors:** ['/conteudos/reajuste-repactuacao-reequilibrio-diferenca/ (noindex)', '/reequilibrio-obras-publicas/ (serviço)']
- **overlap:** média com conteudos noindex; baixa com serviço
- **winner:** Wave 1
- **action:** manter ambas Wave 1 + serviço; conteudos permanece noindex

**Erros encontrados:**
- nenhum material residual

**Correções executadas:**
- Verificado: art.135 escopo serviços contínuos; distinção reajuste/repactuação/reequilíbrio.

**Risco residual:**
- Caso concreto (contrato, edital, matriz, regulamento local) pode modificar a conclusão.
- Aprovação automática revogada; só approve_cli.py com revisor nominal.

**Justificativa do status:** Gates editoriais verdes; claims sustentados por trechos oficiais Planalto verificados em 2026-08-02; robots noindex,follow; fora de sitemaps; autor Biblioteca técnica CONFENGE; author_is_tiago false; CTAs contextuais; sem promessa de resultado. Pronto para revisão humana nominal.

**Recomendação final:** aprovar via approve_wave1_tiago.sh (Tiago Sasaki) + --indexable; em seguida executar pós-aprovação de canibalização se aplicável

### `lei-atraso-administracao` — **READY_FOR_HUMAN_APPROVAL**

| Campo | Valor |
|---|---|
| URL | `/lei-14133-obras/atraso-imputavel-administracao/` |
| Hash material | `4fe9b1cb9d4ac259b30f9e284b42720ba74965f502fa107e7690e13bf7641af6` |
| Registry | `EDITORIAL_REVIEWED` |
| Intenção | atraso imputavel administracao |
| Dispositivos | art.115, art.124, art.130 |
| Desktop HTTP/robots | 200 / `noindex,follow` |
| Screenshot desktop | `docs/evidence/wave1-audit-screenshots/lei-14133-obras__atraso-imputavel-administracao__desktop.png` |
| Screenshot mobile | `docs/evidence/wave1-audit-screenshots/lei-14133-obras__atraso-imputavel-administracao__mobile.png` |
| CTA WA/mail/origem | {'whatsapp_present': True, 'mailto_present': True, 'origin_url_in_message': True, 'no_result_promise': True} |
| Recomendação | aprovar (manter noindex até HUMAN_APPROVED+INDEXABLE pelo script de Tiago) |

**Fontes oficiais abertas:** Planalto L14133.htm (2026-08-02) + source_ids da página.

**Claims verificados:**
- `art115-proibicao-retardo` (direct): É proibido à Administração retardar imotivadamente a execução de obra ou serviço, ou de suas parcelas, inclusive na hipótese de posse do chefe do Poder Executivo ou de novo titular no órgão ou entidade contratante (art. 115, § 1º).
- `art115-execucao-fiel` (direct): O contrato deve ser executado fielmente pelas partes, de acordo com as cláusulas avençadas e a Lei.
- `art130-equilibrio-alteracao` (direct): Se alteração unilateral aumentar ou diminuir encargos, o equilíbrio deve ser restabelecido no mesmo termo aditivo (art. 130).
- `art124-contexto-alteracao-atraso` (direct): Quando houver alteração contratual de projeto ou quantitativo no curso da execução, o art. 124 exige justificativas e enquadra unilateralidade ou acordo.

**Canibalização:**
- **competitors:** ['/conteudos/atraso-obra-culpa-administracao/ (index,follow)', '/atrasos-prorrogacao-obras-publicas/ (serviço)']
- **overlap:** alta com conteudos atraso-culpa
- **winner:** Wave 1 preferida após aprovação (art.115 §1 corrigido)
- **action:** após indexar Wave 1: noindex/consolidar conteudos atraso-obra-culpa-administracao

**Erros encontrados:**
- official_excerpt art.115 §1 com redação incorreta ('posse provisória ou definitiva') em claims/manifest/excerpts

**Correções executadas:**
- Corrigido official_excerpt do art. 115 § 1º: texto Planalto é 'posse do respectivo chefe do Poder Executivo ou de novo titular no órgão ou entidade contratante', não 'posse provisória ou definitiva'.
- Body atualizado com a hipótese legal de troca de gestão e menção ao § 5º (paralisação/cronograma).
- Claim art115-proibicao-retardo alinhado ao texto oficial.

**Risco residual:**
- Canibalização alta com URL indexable em /conteudos/: resolver noindex/consolidação no pós-aprovação antes de submeter sitemap.
- Caso concreto (contrato, edital, matriz, regulamento local) pode modificar a conclusão.
- Aprovação automática revogada; só approve_cli.py com revisor nominal.

**Justificativa do status:** Gates editoriais verdes; claims sustentados por trechos oficiais Planalto verificados em 2026-08-02; robots noindex,follow; fora de sitemaps; autor Biblioteca técnica CONFENGE; author_is_tiago false; CTAs contextuais; sem promessa de resultado. Art.115 §1 corrigido para texto Planalto. Pronto para revisão humana nominal.

**Recomendação final:** aprovar conteúdo e indexar Wave 1 somente após (ou em conjunto com) disposição do competidor indexable em /conteudos/ conforme matriz; script de aprovação ainda executável com ciência do residual

### `lei-parcela-incontroversa` — **READY_FOR_HUMAN_APPROVAL**

| Campo | Valor |
|---|---|
| URL | `/lei-14133-obras/parcela-incontroversa-medicao-pagamento/` |
| Hash material | `527030dad87845d07afc1e9d40fb5ce3cdceaab5dd19ab60662929c037504189` |
| Registry | `EDITORIAL_REVIEWED` |
| Intenção | parcela incontroversa medicao |
| Dispositivos | art.143, art.141 |
| Desktop HTTP/robots | 200 / `noindex,follow` |
| Screenshot desktop | `docs/evidence/wave1-audit-screenshots/lei-14133-obras__parcela-incontroversa-medicao-pagamento__desktop.png` |
| Screenshot mobile | `docs/evidence/wave1-audit-screenshots/lei-14133-obras__parcela-incontroversa-medicao-pagamento__mobile.png` |
| CTA WA/mail/origem | {'whatsapp_present': True, 'mailto_present': True, 'origin_url_in_message': True, 'no_result_promise': True} |
| Recomendação | aprovar (manter noindex até HUMAN_APPROVED+INDEXABLE pelo script de Tiago) |

**Fontes oficiais abertas:** Planalto L14133.htm (2026-08-02) + source_ids da página.

**Claims verificados:**
- `art143-parcela-incontroversa` (direct): Havendo controvérsia sobre dimensão, qualidade e quantidade da execução, a parcela incontroversa deve ser liberada no prazo de pagamento.
- `art141-ordem-cronologica` (direct): O dever de pagamento observa ordem cronológica por fonte de recursos e categorias (bens, locações, serviços, obras).
- `art143-individualizacao-operacional` (interpretive): Liberação da parcela incontroversa exige individualizar valores e critérios na medição; alegar o artigo sem memória de cálculo é insuficiente na prática.

**Canibalização:**
- **competitors:** ['/conteudos/parcela-incontroversa-medicao-contrato-publico/ (noindex)']
- **overlap:** alta mas competidor já noindex
- **winner:** Wave 1
- **action:** manter Wave 1; conteudos permanece noindex

**Erros encontrados:**
- nenhum material residual

**Correções executadas:**
- Verificado: art.143 + art.141 ordem cronológica sem promessa automática.

**Risco residual:**
- Concorrente /conteudos/parcela-incontroversa-medicao-contrato-publico/ já está noindex; risco dual-index atual é nulo.
- Caso concreto (contrato, edital, matriz, regulamento local) pode modificar a conclusão.
- Aprovação automática revogada; só approve_cli.py com revisor nominal.

**Justificativa do status:** Gates editoriais verdes; claims sustentados por trechos oficiais Planalto verificados em 2026-08-02; robots noindex,follow; fora de sitemaps; autor Biblioteca técnica CONFENGE; author_is_tiago false; CTAs contextuais; sem promessa de resultado. Pronto para revisão humana nominal.

**Recomendação final:** aprovar via approve_wave1_tiago.sh (Tiago Sasaki) + --indexable; competidor em /conteudos/ já noindex — sem bloqueio de canibalização pré-indexação

### `lei-servico-sem-aditivo` — **READY_FOR_HUMAN_APPROVAL**

| Campo | Valor |
|---|---|
| URL | `/lei-14133-obras/servico-executado-sem-termo-aditivo/` |
| Hash material | `5b2d66db23bc425c4d61f46e9cd354cae4a6333ad20c22c3234c628cda0c6ffa` |
| Registry | `EDITORIAL_REVIEWED` |
| Intenção | servico sem termo aditivo |
| Dispositivos | art.124, art.132, art.125 |
| Desktop HTTP/robots | 200 / `noindex,follow` |
| Screenshot desktop | `docs/evidence/wave1-audit-screenshots/lei-14133-obras__servico-executado-sem-termo-aditivo__desktop.png` |
| Screenshot mobile | `docs/evidence/wave1-audit-screenshots/lei-14133-obras__servico-executado-sem-termo-aditivo__mobile.png` |
| CTA WA/mail/origem | {'whatsapp_present': True, 'mailto_present': True, 'origin_url_in_message': True, 'no_result_promise': True} |
| Recomendação | aprovar (manter noindex até HUMAN_APPROVED+INDEXABLE pelo script de Tiago) |

**Fontes oficiais abertas:** Planalto L14133.htm (2026-08-02) + source_ids da página.

**Claims verificados:**
- `art132-formalizacao-aditivo` (direct): A formalização do termo aditivo é condição para a execução das prestações determinadas pela Administração no curso do contrato, salvo antecipação justificada com formalização em até 1 mês.
- `art124-alteracao-justificada` (direct): Alterações contratuais exigem as devidas justificativas nos eixos do art. 124.
- `art125-obrigacao-aceitar-limites` (direct): Nas alterações unilaterais, o contratado é obrigado a aceitar acréscimos ou supressões nos limites do art. 125 (25%/50% reforma).

**Canibalização:**
- **competitors:** ['/conteudos/servico-executado-sem-termo-aditivo/ (noindex)']
- **overlap:** alta; competidor noindex (disposição consolidar já aplicada)
- **winner:** Wave 1
- **action:** manter Wave 1; não reindexar conteudos duplicado

**Erros encontrados:**
- nenhum material residual

**Correções executadas:**
- Verificado: art.132 formalização; art.125 obrigação de aceitar nos limites.

**Risco residual:**
- Concorrente /conteudos/servico-executado-sem-termo-aditivo/ já noindex (disposição consolidar aplicada); não reindexar o duplicado.
- Caso concreto (contrato, edital, matriz, regulamento local) pode modificar a conclusão.
- Aprovação automática revogada; só approve_cli.py com revisor nominal.

**Justificativa do status:** Gates editoriais verdes; claims sustentados por trechos oficiais Planalto verificados em 2026-08-02; robots noindex,follow; fora de sitemaps; autor Biblioteca técnica CONFENGE; author_is_tiago false; CTAs contextuais; sem promessa de resultado. Pronto para revisão humana nominal.

**Recomendação final:** aprovar via approve_wave1_tiago.sh (Tiago Sasaki) + --indexable; competidor em /conteudos/ já noindex — sem bloqueio de canibalização pré-indexação

### `guia-checklist-aditivo` — **READY_FOR_HUMAN_APPROVAL**

| Campo | Valor |
|---|---|
| URL | `/guias-contratos-obras/checklist-pedido-aditivo/` |
| Hash material | `51e1bec123b5ca64a4674f371c84f666038bf84641c8fc86ca5d77d848bd5bd0` |
| Registry | `EDITORIAL_REVIEWED` |
| Intenção | checklist aditivo obra |
| Dispositivos | art.124, art.125 |
| Desktop HTTP/robots | 200 / `noindex,follow` |
| Screenshot desktop | `docs/evidence/wave1-audit-screenshots/guias-contratos-obras__checklist-pedido-aditivo__desktop.png` |
| Screenshot mobile | `docs/evidence/wave1-audit-screenshots/guias-contratos-obras__checklist-pedido-aditivo__mobile.png` |
| CTA WA/mail/origem | {'whatsapp_present': True, 'mailto_present': True, 'origin_url_in_message': True, 'no_result_promise': True} |
| Recomendação | aprovar (manter noindex até HUMAN_APPROVED+INDEXABLE pelo script de Tiago) |

**Fontes oficiais abertas:** Planalto L14133.htm (2026-08-02) + source_ids da página.

**Claims verificados:**
- `guia-aditivo-docs-minimos` (interpretive): Pedido de aditivo de obra exige descrição técnica, nexo com determinação/projeto, planilha, memória de saldo (arts. 124 e 125) e comunicações oficiais.
- `guia-aditivo-art124-eixos` (direct): O enquadramento do aditivo deve distinguir alteração unilateral (art. 124, I) e por acordo (art. 124, II).
- `guia-aditivo-art125-saldo` (direct): Memória do saldo percentual amarra-se aos limites de acréscimo/supressão do art. 125 sobre o valor inicial atualizado.

**Canibalização:**
- **competitors:** ['nenhum equivalente indexable forte']
- **overlap:** baixa
- **winner:** Wave 1
- **action:** manter

**Erros encontrados:**
- nenhum material residual

**Correções executadas:**
- Verificado: checklist amarrado a arts.124/125; sem promessa de deferimento.

**Risco residual:**
- Caso concreto (contrato, edital, matriz, regulamento local) pode modificar a conclusão.
- Aprovação automática revogada; só approve_cli.py com revisor nominal.

**Justificativa do status:** Gates editoriais verdes; claims sustentados por trechos oficiais Planalto verificados em 2026-08-02; robots noindex,follow; fora de sitemaps; autor Biblioteca técnica CONFENGE; author_is_tiago false; CTAs contextuais; sem promessa de resultado. Pronto para revisão humana nominal.

**Recomendação final:** aprovar via approve_wave1_tiago.sh (Tiago Sasaki) + --indexable; em seguida executar pós-aprovação de canibalização se aplicável

### `guia-docs-reequilibrio` — **READY_FOR_HUMAN_APPROVAL**

| Campo | Valor |
|---|---|
| URL | `/guias-contratos-obras/documentos-pedido-reequilibrio/` |
| Hash material | `708e188e53ff185293b030806d26d5a6a32bbc60a24a3498f23116a7cd7d22a9` |
| Registry | `EDITORIAL_REVIEWED` |
| Intenção | documentos reequilibrio obra |
| Dispositivos | art.130, art.131 |
| Desktop HTTP/robots | 200 / `noindex,follow` |
| Screenshot desktop | `docs/evidence/wave1-audit-screenshots/guias-contratos-obras__documentos-pedido-reequilibrio__desktop.png` |
| Screenshot mobile | `docs/evidence/wave1-audit-screenshots/guias-contratos-obras__documentos-pedido-reequilibrio__mobile.png` |
| CTA WA/mail/origem | {'whatsapp_present': True, 'mailto_present': True, 'origin_url_in_message': True, 'no_result_promise': True} |
| Recomendação | aprovar (manter noindex até HUMAN_APPROVED+INDEXABLE pelo script de Tiago) |

**Fontes oficiais abertas:** Planalto L14133.htm (2026-08-02) + source_ids da página.

**Claims verificados:**
- `guia-reeq-art130` (direct): Alteração unilateral que aumente ou diminua encargos exige restabelecimento do equilíbrio no mesmo termo aditivo (art. 130).
- `guia-reeq-art131-janela` (direct): Pedido de restabelecimento do equilíbrio deve ser formulado na vigência e antes de prorrogação nos termos do art. 107 (art. 131, parágrafo único).
- `guia-reeq-nexo-matriz` (interpretive): Dossiê de reequilíbrio em obra precisa de causa, nexo com contrato e matriz de riscos, quantificação e prova contemporânea — documentos sem nexo não sustentam a tese.
- `guia-reeq-vs-repactuacao` (direct): Repactuação do art. 135 não se confunde com reequilíbrio dos arts. 130/131 nem com reajuste por índice (art. 136, I).

**Canibalização:**
- **competitors:** ['/conteudos/documentos-reequilibrio-obra-publica/ (noindex)']
- **overlap:** média–alta; competidor noindex
- **winner:** Wave 1
- **action:** manter Wave 1 checklist operacional; conteudos noindex

**Erros encontrados:**
- boilerplate editorial duplicado genérico de checklist

**Correções executadas:**
- Removida duplicação de ressalva/contexto; texto operacional específico de reequilíbrio.

**Risco residual:**
- Concorrente /conteudos/documentos-reequilibrio-obra-publica/ já está noindex; Wave 1 é o checklist operacional preferido.
- Caso concreto (contrato, edital, matriz, regulamento local) pode modificar a conclusão.
- Aprovação automática revogada; só approve_cli.py com revisor nominal.

**Justificativa do status:** Gates editoriais verdes; claims sustentados por trechos oficiais Planalto verificados em 2026-08-02; robots noindex,follow; fora de sitemaps; autor Biblioteca técnica CONFENGE; author_is_tiago false; CTAs contextuais; sem promessa de resultado. Pronto para revisão humana nominal.

**Recomendação final:** aprovar via approve_wave1_tiago.sh (Tiago Sasaki) + --indexable; competidor em /conteudos/ já noindex — sem bloqueio de canibalização pré-indexação

### `guia-glosa` — **READY_FOR_HUMAN_APPROVAL**

| Campo | Valor |
|---|---|
| URL | `/guias-contratos-obras/contestar-glosa-medicao/` |
| Hash material | `fba21a75f6a50279f032bda1946fce4ceb2991dd0f66b1efb9504ba31aa7f468` |
| Registry | `EDITORIAL_REVIEWED` |
| Intenção | contestar glosa medicao |
| Dispositivos | art.143 |
| Desktop HTTP/robots | 200 / `noindex,follow` |
| Screenshot desktop | `docs/evidence/wave1-audit-screenshots/guias-contratos-obras__contestar-glosa-medicao__desktop.png` |
| Screenshot mobile | `docs/evidence/wave1-audit-screenshots/guias-contratos-obras__contestar-glosa-medicao__mobile.png` |
| CTA WA/mail/origem | {'whatsapp_present': True, 'mailto_present': True, 'origin_url_in_message': True, 'no_result_promise': True} |
| Recomendação | aprovar (manter noindex até HUMAN_APPROVED+INDEXABLE pelo script de Tiago) |

**Fontes oficiais abertas:** Planalto L14133.htm (2026-08-02) + source_ids da página.

**Claims verificados:**
- `guia-glosa-art143` (direct): Havendo controvérsia sobre dimensão, qualidade e quantidade, a parcela incontroversa deve ser liberada no prazo de pagamento (art. 143).
- `guia-glosa-prova-operacional` (interpretive): Contestação de glosa deve juntar critério de medição do contrato e prova de execução (diário, fotos, levantamentos), individualizando o valor glosado.

**Canibalização:**
- **competitors:** ['/conteudos/glosa-de-medicao-obra-publica/ (noindex)', '/conteudos/glosa-por-qualidade-obra-publica/ (index)']
- **overlap:** média com glosa-por-qualidade (ângulo qualidade vs checklist contestação)
- **winner:** manter ambas se ângulos distintos
- **action:** Wave 1 = checklist contestação + art.143; glosa-por-qualidade = foco qualidade — diferenciar no related; não canonical cruzado sem relação editorial

**Erros encontrados:**
- boilerplate editorial duplicado genérico de checklist

**Correções executadas:**
- Removida duplicação 'Contexto de uso' e boilerplate genérico de checklist.

**Risco residual:**
- Caso concreto (contrato, edital, matriz, regulamento local) pode modificar a conclusão.
- Aprovação automática revogada; só approve_cli.py com revisor nominal.

**Justificativa do status:** Gates editoriais verdes; claims sustentados por trechos oficiais Planalto verificados em 2026-08-02; robots noindex,follow; fora de sitemaps; autor Biblioteca técnica CONFENGE; author_is_tiago false; CTAs contextuais; sem promessa de resultado. Pronto para revisão humana nominal.

**Recomendação final:** aprovar via approve_wave1_tiago.sh (Tiago Sasaki) + --indexable; em seguida executar pós-aprovação de canibalização se aplicável

### `guia-notificacao-atraso` — **READY_FOR_HUMAN_APPROVAL**

| Campo | Valor |
|---|---|
| URL | `/guias-contratos-obras/responder-notificacao-atraso/` |
| Hash material | `e8ce56a3690414f9fdf7b7985873ade153ef5386d9daf6d788689f1cf4b83543` |
| Registry | `EDITORIAL_REVIEWED` |
| Intenção | resposta notificacao atraso obra |
| Dispositivos | art.115, art.155 |
| Desktop HTTP/robots | 200 / `noindex,follow` |
| Screenshot desktop | `docs/evidence/wave1-audit-screenshots/guias-contratos-obras__responder-notificacao-atraso__desktop.png` |
| Screenshot mobile | `docs/evidence/wave1-audit-screenshots/guias-contratos-obras__responder-notificacao-atraso__mobile.png` |
| CTA WA/mail/origem | {'whatsapp_present': True, 'mailto_present': True, 'origin_url_in_message': True, 'no_result_promise': True} |
| Recomendação | aprovar (manter noindex até HUMAN_APPROVED+INDEXABLE pelo script de Tiago) |

**Fontes oficiais abertas:** Planalto L14133.htm (2026-08-02) + source_ids da página.

**Claims verificados:**
- `guia-atraso-art115` (direct): É proibido à Administração retardar imotivadamente a execução de obra ou serviço, ou de suas parcelas, inclusive na hipótese de posse do chefe do Poder Executivo ou de novo titular no órgão (art. 115, § 1º).
- `guia-atraso-resposta-operacional` (interpretive): Resposta a notificação de atraso deve mapear cronologia, fatos admitidos/contestados e provas; silêncio e resposta genérica enfraquecem a defesa.

**Canibalização:**
- **competitors:** ['/conteudos/resposta-notificacao-atraso-obra-publica/ (index,follow)']
- **overlap:** alta
- **winner:** Wave 1 preferida após aprovação
- **action:** após indexar Wave 1: noindex/consolidar conteudos resposta-notificacao-atraso

**Erros encontrados:**
- mesmo erro de excerpt art.115 §1
- boilerplate de checklist copiado (word_count caiu <400 após limpeza parcial)
- seções duplicadas de contexto

**Correções executadas:**
- Mesma correção do art. 115 § 1º nos claims/excerpts.
- Removido boilerplate copiado de checklist; reescrito ressalvas e exemplo hipotético.
- Expandido body para word_count>=400 (gate).

**Risco residual:**
- Canibalização alta com URL indexable em /conteudos/: resolver noindex/consolidação no pós-aprovação antes de submeter sitemap.
- Caso concreto (contrato, edital, matriz, regulamento local) pode modificar a conclusão.
- Aprovação automática revogada; só approve_cli.py com revisor nominal.

**Justificativa do status:** Gates editoriais verdes; claims sustentados por trechos oficiais Planalto verificados em 2026-08-02; robots noindex,follow; fora de sitemaps; autor Biblioteca técnica CONFENGE; author_is_tiago false; CTAs contextuais; sem promessa de resultado. Art.115 §1 corrigido para texto Planalto. Pronto para revisão humana nominal.

**Recomendação final:** aprovar conteúdo e indexar Wave 1 somente após (ou em conjunto com) disposição do competidor indexable em /conteudos/ conforme matriz; script de aprovação ainda executável com ciência do residual

### `jur-sumula-260-art` — **REJECTED**

| Campo | Valor |
|---|---|
| URL | `/jurisprudencia-contratos-obras/tcu-sumula-260-art-obras/` |
| Hash material | `717c8e524920e0d7af8266af3bba35572294546177fb66b387482fb60abadf40` |
| Registry | `REJECTED` |
| Intenção | Súmula TCU 260 ART obras |
| Dispositivos | — |
| Desktop HTTP/robots | None / `noindex,follow` |
| Screenshot desktop | `None` |
| Screenshot mobile | `None` |
| CTA WA/mail/origem | {'note': 'HTML existe mas página não é candidata a aprovação'} |
| Recomendação | manter noindex |

**Fontes oficiais abertas:** Planalto L14133.htm (2026-08-02) + source_ids da página.

**Claims verificados:**
- (nenhum — página REJECTED sem claim bank completo)

**Canibalização:**
- **action:** manter REJECTED + noindex + fora de sitemaps

**Erros encontrados:**
- dossier oficial incompleto

**Correções executadas:**
- mantido REJECTED; publication_hold true

**Risco residual:**
- Falta texto oficial integral da Súmula 260
- Falta data oficial de aprovação
- Falta URL estável e verificável do enunciado no TCU
- Distinção ART/autoria/responsabilidade incompleta sem enunciado

**Justificativa do status:** Bloqueio deliberado até dossiê TCU completo.

**Recomendação final:** manter noindex; não incluir no script de aprovação

## Matriz de canibalização (ações explícitas)

| URL Wave 1 | Concorrente principal | Sobreposição | Vencedor | Ação |
|---|---|---|---|---|
| `/lei-14133-obras/art-124-alteracao-contratual-obra/` | /conteudos/aditivo-qualitativo-quantitativo/ (noindex) | baixa–média (intenção legal específica art.124 vs guias genéricos) | Wave 1 (quando INDEXABLE) | manter ambas; Wave 1 é aplicação legal profunda; serviço institucional permanece comercial |
| `/lei-14133-obras/limite-25-50-aditivo-obra/` | /conteudos/limite-aditivo-25-50-obra-publica/ (index,follow) | alta (mesma consulta principal de teto 25/50) | Wave 1 preferida após HUMAN_APPROVED (devices + claims + fontes frescas) | após indexar Wave 1: noindex ou canonical do conteudos para Wave 1; não dual-index |
| `/lei-14133-obras/preco-item-novo-desconto-proposta/` | /conteudos/desconto-da-proposta-em-item-novo-aditivo/ (index,follow) | alta com desconto-da-proposta | Wave 1 preferida após aprovação | após indexar Wave 1: noindex/consolidar conteudos desconto-da-proposta; manter links related |
| `/lei-14133-obras/reequilibrio-reajuste-repactuacao/` | /conteudos/reajuste-repactuacao-reequilibrio-diferenca/ (noindex) | média com conteudos noindex; baixa com serviço | Wave 1 | manter ambas Wave 1 + serviço; conteudos permanece noindex |
| `/lei-14133-obras/atraso-imputavel-administracao/` | /conteudos/atraso-obra-culpa-administracao/ (index,follow) | alta com conteudos atraso-culpa | Wave 1 preferida após aprovação (art.115 §1 corrigido) | após indexar Wave 1: noindex/consolidar conteudos atraso-obra-culpa-administracao |
| `/lei-14133-obras/parcela-incontroversa-medicao-pagamento/` | /conteudos/parcela-incontroversa-medicao-contrato-publico/ (noindex) | alta mas competidor já noindex | Wave 1 | manter Wave 1; conteudos permanece noindex |
| `/lei-14133-obras/servico-executado-sem-termo-aditivo/` | /conteudos/servico-executado-sem-termo-aditivo/ (noindex) | alta; competidor noindex (disposição consolidar já aplicada) | Wave 1 | manter Wave 1; não reindexar conteudos duplicado |
| `/guias-contratos-obras/checklist-pedido-aditivo/` | nenhum equivalente indexable forte | baixa | Wave 1 | manter |
| `/guias-contratos-obras/documentos-pedido-reequilibrio/` | /conteudos/documentos-reequilibrio-obra-publica/ (noindex) | média–alta; competidor noindex | Wave 1 | manter Wave 1 checklist operacional; conteudos noindex |
| `/guias-contratos-obras/contestar-glosa-medicao/` | /conteudos/glosa-de-medicao-obra-publica/ (noindex) | média com glosa-por-qualidade (ângulo qualidade vs checklist contestação) | manter ambas se ângulos distintos | Wave 1 = checklist contestação + art.143; glosa-por-qualidade = foco qualidade — diferenciar no related; não canonical cruzado sem relação editorial |
| `/guias-contratos-obras/responder-notificacao-atraso/` | /conteudos/resposta-notificacao-atraso-obra-publica/ (index,follow) | alta | Wave 1 preferida após aprovação | após indexar Wave 1: noindex/consolidar conteudos resposta-notificacao-atraso |

## Script de aprovação (criar, não executar nesta auditoria)

```bash
bash scripts/editorial/approve_wave1_tiago.sh
```

Pré-condições do script: working tree limpa nos arquivos materiais; revisor fixo `Tiago Sasaki`; aborta no primeiro erro.

## Pós-aprovação humana

```bash
npm run editorial:build
npm run editorial:test
```

Conferir: só aprovadas com `index,follow`; só aprovadas no sitemap editorial; sumula REJECTED; depois deploy e GSC.

