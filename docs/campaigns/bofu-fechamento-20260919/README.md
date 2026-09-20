# CONFENGE-BOFU-FECHAMENTO-20260919 — registro único da campanha

Decisão: EXECUTE_NOW (fundador, 2026-09-19). Front executivo: INBOUND_CORE. Alavancas: confiança (nomes acessíveis, fragmentos válidos, ressalvas uma vez por contexto), receita (intenção própria do órgão contratante; recebimento/reforma/documentação do construído e avaliação de imóvel com posição própria; contexto preservado até o atendimento), automação (gates novos fail-closed: WCAG 2.5.3 estático + axe, fragmentos/idrefs/ids duplicados, canais e nota sem JS em toda rota de captura, formulários de ferramenta), dado (contrato de contagem refinado, `origin_class` no snapshot e na exportação, readout GSC datado). Tempo até evidência: publicação e verificação pública nesta campanha; leitura comercial em Warmbly após janelas comparáveis. Parent: #61. Issues: #705, #706 (#707 sem mudança). Continuação de `docs/campaigns/bofu-integral-20260919/README.md` (mesmo dia).

Mandato: fechar as lacunas da auditoria de 19/09 — dor → solução → entrega → prova → contato para o ICP sem tempo; preservar o redesign; conversas qualificadas e propostas inbound, separadas do outbound; sem promessa de receita; poucas PRs; sem mídia, publicação externa ou mudança de preços/atribuições; nenhuma menção pública a IA.

## Base efetiva

| Item | Valor |
| --- | --- |
| `origin/main` e produção servida ao início (2026-09-19T19:54Z) | `fedb4768b` (merge de #714), `artifact_hash 2b2de021…` — `build-info` = `runtime-info` |
| PRs alheias abertas | intocadas |
| Ramo desta campanha | `campaign/bofu-fechamento-20260919` → PR #715 |
| Predecessor saudável para reversão | `fedb4768b` |

## Estados (dimensões)

| Estado | Valor | Evidência |
| --- | --- | --- |
| IMPLEMENTADO_E_TESTADO | SIM — `site-ci` real da PR #715 (run 35488381533 — site-validation 34 min, pSEO 35488381646; ambos verdes em d28affff0) e réplica local completa (`evidence/replica-site-ci-8fa6a661a.log`) | PR #715 |
| INTEGRADO | SIM — merge commit `a4871e867` (PR #715, merge, não squash; `site-ci` de main 35489869473 verde) | GitHub |
| PUBLICADO_E_VERIFICADO | SIM — release 35489869649 (preflight, pSEO e site-ci do SHA exato, pacote imutável, stage/verify, qualificação e promoção atômica: todas success); produção serve `a4871e867` (`build-info.commit` = `runtime-info.release_sha`; `artifact_hash 384d9ed2…` igual nos dois); verificação pública 51/51 e jornadas em navegador 14/14 na URL real | `/.well-known/build-info.json`; `evidence/verificacao-publica-a4871e867.txt` |
| RECEBIMENTO_COMPROVADO | PENDENTE_OPERACIONAL — protocolo g03 re-datado e prontidão parcial por GET público; passagem humana do proprietário | `docs/campaigns/design-institucional/fechamento/evidence/producao/g03-qa-protocolo.md`, `prontidao-operacional-fedb4768b.json` |
| RESULTADO_COMERCIAL | AINDA_NAO_MEDIDO — Warmbly é dona; contrato de contagem segue PROPOSTO | #706 |

## Achados da auditoria de 19/09 — reproduzidos no artefato servido (`fedb4768b`) e estado final

| Achado | Estado inicial (reproduzido) | Depois | Contraprova (reprova o estado defeituoso) |
| --- | --- | --- | --- |
| 8 links de `/entregas/` sem o texto visível no nome acessível (WCAG 2.5.3) | `aria-label="Quais editais abertos vale disputar?"` × visível `01Onde disputar?` (8/8) | Ordinal como texto visível e nome acessível começando por ele: `aria-label="01 Onde disputar? Quais editais…"` (`render_public_catalog.mjs`) | `test_deliverables_hub.py::test_decision_nav_accessible_names_start_with_the_visible_label`; axe `label-content-name-mismatch` ligada em `audit_axe.mjs` (8 nós sérios antes, 0 depois); gate estático sitewide em `audit_accessibility.py` (668 controles) |
| `href="#fontes"` sem destino em `/inteligencia/valor-tipico-contratos-pavimentacao/` | 1 href, 0 ids | Aponta ao título de fontes existente (`market_answers/render.py`) | `tests/market_answers/test_fragments.py`; `html_integrity.py` ganha `fragment_target_missing` (mesma página e entre páginas), `aria_idref_undefined`, `duplicate_id` — fonte (233 páginas, 2 576 fragmentos, 770 idrefs, 0 falhas) e `_site` |
| Ids duplicados de SVG inlinado em `/casos/demonstrativo-*` e `aria-labelledby` órfão em `/conteudos/` | reproduzidos | corrigidos nos geradores | idem |
| Órgão planejando a contratação obrigado a escolher "Outro evento contratual" | `select[name=contract_event]` sem intenção do órgão; instrução literal no bloco | `contract_event=planejamento_contratacao` (enum em `lead-core`, rótulo `lado=orgao_contratante` no handoff, `lead-store`, exportação), quatro campos opcionais da fase preparatória (objeto, estágio DFD/ETP/TR/orçamento/edital, regulamento, origem do recurso — `<label>` simples, sem CSS/JS), pré-seleção pelo CTA do hub (`data-contract-event`) e pelos CTAs da home/triagem (mesmo atributo + sessionStorage na chegada; href canônico sem query string) | `test_lead_function`, `test_inbound_handoff`, `test_capture_form_preselect.mjs` (clique local, entre rotas, rota errada, registro velho, valor fora do padrão), `tests/campaigns/bofu_fechamento_20260919/`; `grep 'escolha "Outro evento contratual"'` = 0 |
| Recebimento/entrega, reforma e documentação do construído subordinados a infiltração/fissura | Home: H3 só de infiltração; 1 prefill de WhatsApp para as cinco situações da rota | Home `li#situacao-obra-imovel`: H3 "Infiltração ou fissura, imóvel a receber ou reformar, construído a documentar" + `.area__sub` com as três âncoras; `/servicos/` idem; `/entregas/` frente 03; canais próprios por situação na rota; ferramenta de prontidão encaminha documentação do construído | `test_home_conversion_contract.py`, `test_public_ia.py`, `test_private_route_channels.mjs` (≥4 prefills distintos), `test_private_readiness_asbuilt_route.mjs` |
| Avaliação de imóvel fundida com perícia | uma `<option>` e um `li` | situação própria na home (`data-journey="avaliacao"`, bundle com rota e detalhe próprios), `li#avaliacao-imovel` na triagem, finalidades na seção de `/servicos/`; rota própria = decisão do proprietário (P-2) | `test_home_conversion_contract.py`, `test_event_semantics`, `test_contact_journeys` (cenário `pf_avaliacao_partilha`) |
| Ressalvas repetidas (SST, inspeção, assistência, casos, `/servicos/`, D23) | `ato médico` ×9 em SST; "não promete" e "exemplo demonstrativo" repetidos | uma vez por contexto; limites materiais e rótulo por prancha preservados | `test_integral_solution_copy.py` (frase ≥8 palavras repetida em >1 seção reprova; densidade de rótulo por figura) |
| Alternativas de contato não padronizadas | 14 formulários gerados sem `<noscript>`; `/analise-cnpj/` sem canal | nota sem JS por fonte única (`form_nojs_note.mjs`) no normalizador e no gerador de pilares; contact-alt em `/analise-cnpj/`; POST nativo sem JS recebe 400 `text/html` com canais (nada persistido) | `test_cta_form_next_state` + `apply_form_nojs_note.py --check`, `tests/commercial/test_tool_forms_nojs.mjs`, `inbound_gates.py` (capture_route_channels) |
| Contexto perdido entre páginas | referrer externo sobrescrito por interno; situação declarada fora do handoff; textarea sem id no hub | referrer first-touch (`origin_class=search_organic` em dois saltos), `situação declarada` no handoff, `#mensagem` no hub | `test_attribution_allowlist`, `test_inbound_handoff` |
| A06: timeout/retry/idempotência | chave reutilizada após edição dos campos | chave invalidada quando campos materiais mudam; Turnstile com timeout; sonda diária idempotente; alerta de e-mail não entregue; protocolo g03 re-datado | `test_form_funnel`, `test_lead_turnstile_timeout.mjs`, `scheduled_daily`, `test_g03_qa_protocol_identity.mjs` |
| Medição (#706) | revisão somava; `won` sem receita herdava; origem desconhecida sem marcador | revisão com o mesmo id substitui; parcelas por `at`; supersedes órfão fail-closed; `won` exige receita declarada; `origin_class` no snapshot/relatório; exportação com colunas de jornada; `set_record_kind` auditado; readout GSC 2026-09-19 = INDISPONÍVEL (não zero); mapa de demanda sem campos de calendário | `test_proposal_counting`, `test_closed_loop`, `test_privacy`, `test_lead_stages`, `organic:test` |

Não reproduzido: `hashNeeds.projetos` (A-08; o vocabulário do servidor não tem need de projeto). Fora desta campanha (ciclo próprio ou decisão do proprietário): rotas próprias (`/avaliacao-imoveis/`, recebimento/reforma, as-built, ente contratante — VALIDATE), pilares congelados (RESSALVAS-08), rodapé sitewide (HOME-HUB-10), idempotência material no servidor (409), nota sem JS em `/diagnostico-pre-licitacao/` (pilar congelado, carve-out datado).

## Método

Descoberta: 9 leitores somente-leitura por área + crítico de completude (84 achados; 11 amostrados no artefato servido, 11 reproduzidos). Implementação: 9 workstreams com arquivos disjuntos em worktrees (B home/IA, C entregas, D bundle, E rotas privadas/ressalvas, H geradores a11y, I medição, J operação A06; A órgão/formulários/servidor/censo serializado; G gates), cada um com revisor adversarial independente e rodada de correção (P0/P1 todos tratados; P2 registrados). Cadeia de fechamento em clone limpo, uma vez por rodada de bytes finais: frozen specs (só `script.js` derivou), primeira dobra 25/25, censo de CTAs 198→206 com notas datadas, `build:site`, gates sobre o artefato. Sem CSS; sem preço/prazo/atribuição/robots/sitemap alterados; `test:ai-mention` verde.

Correções após o primeiro `site-ci` real (evidência de que o CI real, não a réplica, é a autoridade): `?evento=` reprovado por `validate_seo` (contrato `canonical_hrefs`: atribuição interna em `data-*`) → mesmo atributo + sessionStorage; altura da home a 1440 no artefato (10513 > 10500) → rótulos das duas situações mais curtos (10453); `demand-map.json` com `evaluated_on` do dia → artefato só com a política de frescor; nota sem JS nos oito modelos contada à parte dos CTAs de oferta; sonda de contexto registrada no inventário de probes.

## Publicação e verificação

- Merge `a4871e867` em 2026-09-20; release `35489869649` promovida (todas as etapas success). Produção: `build-info.commit` = `runtime-info.release_sha` = `a4871e8672e4c5c27b1f80d4e0c2ccb1e989cd89`; `artifact_hash` = `public_artifact_hash` = `384d9ed2…`.
- Verificação pública 51/51 (`evidence/verificacao-publica-a4871e867.txt`): SHA e hash; 17 rotas 200; os 8 nomes acessíveis de `/entregas/` começam pelo texto visível e o rótulo antigo não existe; `#fontes` retargetado; opção `planejamento_contratacao`, quatro campos preparatórios, CTA com `data-contract-event` e `textarea#mensagem` no hub; instrução "Outro evento contratual" ausente; home/triagem com o CTA canônico ao formulário do hub (sem query string) e rótulo novo do imóvel; option `avaliacao`; ≥4 prefills distintos na inspeção; `ato médico` ≤2 em SST; canais e `<noscript>` em `/analise-cnpj/`; nota sem JS nos modelos; cluster "Reajuste contratual" no hub de problemas; bundle com preselect entre rotas; sem menção a IA (amostra).
- Jornadas em navegador na URL real, somente leitura (POST bloqueado pelo harness; `evidence/jornadas-navegador-a4871e867.txt`): home 390 → CTA do órgão → hub com `contract_event` pré-selecionado, registro consumido, atribuição sem o campo, select focável, URL canônica, sem overflow; `/entregas/` 1440: 8 links com nome acessível iniciado pelo texto visível, Enter leva a `#entrega-01`; home 320: situação "avaliação de imóvel" com próximo passo contextual e rota `/servicos/#servico-avaliacao`, sem overflow; inspeção 768: WhatsApp próprio do as-built; pavimentação: link de fontes resolve; modelo com JS desligado: nota sem JS visível.
- **Atraso da borda (achado novo, P-19):** a home nova chegou ao PoP em ~105 s, mas `/script.js?v=fortune04` (query fixa; a origem responde `max-age=14400`) seguiu servindo o bundle anterior (`cf-cache-status: HIT`) por até 4 h após a promoção; a origem já servia o bundle novo (`/script.js` sem query). As jornadas JS acima foram provadas no host real com o bundle da origem (query distinta). Janela de degradação: HTML novo + bundle antigo — o formulário continua enviando; a situação nova cai em "outro" e o preselect entre rotas não ocorre. Nenhuma correção nesta campanha (token Cloudflare só no host; decisão: fingerprint de `script.js` ou purge na release).
- Réplica local completa em `8fa6a661a` (`evidence/replica-site-ci-8fa6a661a.log`, 41 passos gerados do YAML): browsers 26–34 verdes; os únicos FAIL são os passos de infraestrutura do runner (checkout/npm ci) sem equivalente local; a réplica anterior (`2c0cecb0b`) antecipou os três defeitos que o CI real depois confirmou.
- Predecessor saudável para reversão: `fedb4768b`.

## Pendências (nenhuma fecha issue) — responsável

| # | Item | Responsável |
| --- | --- | --- |
| P-1 | Passagem humana A06 (protocolo g03 re-datado; sonda sintética no host antes do envio A; `g03-qa-resultado-<sha>.json`) | proprietário |
| P-2 | Rota própria `/avaliacao-imoveis/` (família nova + sitemap + catálogo fora de WITHHELD_PROOF) | proprietário |
| P-3 | Jornada do órgão: `orgao` em `ALLOWED_JOURNEYS`/contrato Warmbly ou `contrato`+evento (adotado); campo dedicado `lado` no `confenge.inbound.v1`; página de confirmação própria | Warmbly + proprietário |
| P-4 | Página própria para o ente contratante — VALIDATE; gatilho: ≥1 contato real do lado do ente ou impressões GSC; exemplo demonstrativo do lado do ente | proprietário |
| P-5 | Rotas próprias de recebimento/reforma e documentação do construído (mínimo aplicado na rota atual) | proprietário |
| P-6 | Exceção datada à invariante "no new field" registrada no contrato (campos opcionais do órgão, #705) — revisar quando Warmbly aceitar o campo | Governança |
| P-7 | Nota sem JS em `/diagnostico-pre-licitacao/` (pilar congelado; carve-out datado) | próximo desbloqueio |
| P-8 | Contrato de contagem: aceite Warmbly (RC-01..RC-08; RC-08 novo: `won` declara receita); `origin_class` como campo canônico | Warmbly |
| P-9 | §7 "Baixa pós-QA" no protocolo g03 (ação `set_record_kind` já existe) | proprietário |
| P-10 | Agenda mais frequente do drain de e-mail (timer horário no host ou 2º cron) e latência máxima documentada | ops |
| P-11 | Idempotência material no servidor (409 em conteúdo editado) | próximo ciclo |
| P-12 | Readout GSC executado no host (`data/revops/gsc/readouts/README.md`); pull com dimensão page | proprietário/ops |
| P-13 | Rodapé sitewide "Perícias e avaliações" → separar (regenera todas as rotas) | ciclo próprio |
| P-14 | Indexabilidade de `/analise-cnpj/` e classificação de `limite-acrescimos` (campos além do mínimo) | proprietário |
| P-15 | NBR 13752 no público só após registro no catálogo | responsável técnico |
| P-16 | Alinhador SINAPI (`/conteudos/sinapi-desonerado-nao-desonerado/`) sem degradação sem JS; WhatsApp ao lado do formulário de segunda leitura em três ferramentas (dívidas datadas, expiram 2026-10-19) | próximo ciclo |
| P-17 | `PII_VALUE_RE` da contagem de propostas pode rejeitar `scope_id` numérico (falso positivo fail-closed) | próximo ciclo |
| P-19 | `/script.js` sem fingerprint fica até 4 h na borda após a promoção (bundle antigo com HTML novo): fingerprintar ou purgar na release | ops/proprietário |
| P-18 | `export_leads.mjs` sem os quatro campos preparatórios; WhatsApp no modelo D01 vetado por `test_report_model_599` (só e-mail) | próximo ciclo |

## Comunicação

Estados separados em todo registro: implementação ≠ publicação ≠ recebimento comprovado ≠ resultado comercial. Nenhuma issue fechada. Comentários em #705 e #706 com antes/depois, PR/SHA, evidências e pendências.
