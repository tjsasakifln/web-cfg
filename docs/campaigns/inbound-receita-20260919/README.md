# CONFENGE-INBOUND-RECEITA-E-PRODUCAO-20260919 — registro único da campanha

Decisão: EXECUTE_NOW (fundador, 2026-09-19). Front executivo: INBOUND_CORE. Alavancas: receita (propostas qualificadas de honorários), confiança, automação, cliente. Tempo até evidência: publicação e verificação nesta campanha; leitura comercial em Warmbly após janelas comparáveis. Parent estratégico: #61. Issues executadas: #705 (jornada), #706 (medição, parcela web), #707 (descoberta, parcela web). Este arquivo é a única trilha canônica; as issues recebem referências cruzadas.

Mandato: a ressalva de #705–#707 de que a criação das issues não autorizava deploy fica suprida (comentário registrado nas três issues em 2026-09-19). Não autorizados: mídia paga, contratação de ferramentas, prospecção, contato com clientes/parceiros, publicação externa, mudança de preços/condições sem base autorizada.

## Base efetiva (reconciliação 2026-09-19T04:33Z)

| Item | Valor |
| --- | --- |
| `origin/main` | `3245c774f` (merge do PR #704, documental sobre `6bd981197`) |
| Servido em produção | `6bd981197` (`/.well-known/build-info.json` = `runtime-info.release_sha`; `build_time 2026-09-19T02:05:55Z`; `host_architecture_version confenge-nginx-node/v2`) |
| Release em andamento | 35420505060 para `3245c774f` (documental; conteúdo público idêntico) |
| Predecessor saudável para reversão | `4cfa6adca` (release 35382722937) — ou `6bd981197`, conforme o candidato promovido nesta campanha |
| Branch de integração | `campaign/inbound-receita-20260919` a partir de `3245c774f` |
| Proteção de branch | `site-ci` + `pSEO quality gates` obrigatórios, strict up-to-date, 0 revisões; merge commit permitido (não usar squash: first-fold/frozen-specs gravam SHA) |
| PRs abertas alheias | #696, #637, #635, #633, #600 e dependabot — intocadas |

## Estados (dimensões)

| Estado | Valor | Evidência |
| --- | --- | --- |
| IMPLEMENTADO_E_TESTADO | ATENDIDO (2026-09-19) | PR #708 (27 commits por frente), réplica local do `site-ci` 33/33 sobre `122902d47`, revisão adversarial com 7 achados confirmados e corrigidos; `site-ci` + `pSEO quality gates` verdes na PR |
| INTEGRADO | ATENDIDO | merge commit `4fa3c64db` (#708); hotfixes de teste `a29eabd96` (#709: contraprova autorreferente em `main`) e `a27472bec` (#710: corrida do harness com o widget antiabuso no artefato de produção) |
| PUBLICADO_E_VERIFICADO | ATENDIDO (2026-09-19T11:5xZ) | release 35439209267 promovida; `/.well-known/build-info.json` = `runtime-info.release_sha` = `a27472bec`; verificação pública 34/34 (`evidence/verificacao-publica-a27472bec.txt`): seis artigos → pilar com contexto, caso → pilar, pilar → caso, 410 em `/uso-de-ia/` e `/politica-editorial/v/1.0.0/`, rodapé sem "Uso de IA", sitemap sem as rotas, `robots.txt` byte-idêntico, bundle novo servido, amostra de 14 rotas sem menção a IA/contraste, 9 rotas B2G/privadas 200 |
| RECEBIMENTO_COMPROVADO / PENDENTE_OPERACIONAL | PENDENTE_OPERACIONAL (cadeia sintética verde na nova release; cadeia humana não executada) | `revops-scheduled` daily (run 35441489601): `deploy_identity match=true`, `isolated_probe lead-9e8f…`, `probe_idempotent_same_id`, `probe_no_commercial_inflate 0→0`, `inbound_handoff_counters delivered=19 pending=0`; Turnstile recusa automação (600010) — protocolo humano em `design-institucional/fechamento/evidence/producao/g03-qa-protocolo.md` |
| DESCOBERTA_HABILITADA vs EXPOSICAO_OBSERVADA | HABILITADA (interna) / NÃO OBSERVADA | ligações publicadas: 6 artigos → pilares, pilar → caso, caso → formulário do pilar; 3 oportunidades externas PREPARADAS, NÃO PUBLICADAS (autorização específica pendente); nenhuma exposição medida ainda |
| RESULTADO_COMERCIAL | AINDA_NAO_MEDIDO | leitura em Warmbly após janelas comparáveis; quebras de série registradas (§Mensuração) |

## Matriz de achados

Método: cada linha foi verificada por leitura direta do arquivo citado nesta sessão (grep/sed/leitura de JSON), não copiada do texto de origem sem checar. Divergências entre o que a issue/relatório afirmava e o que o arquivo mostra estão registradas, não silenciadas; o log completo de comandos e resultados está em `evidence/w4-verificacoes.json`.

| Evidência e data | Problema do visitante | Causa / arquivo ou contrato | Efeito comercial esperado (hipótese) | Mudança mínima | Teste | Responsável | Classificação |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Seis artigos de medição/prazo enviam "Continuar pelo formulário" à home (`apply_article_pillar_form.py --check`, executado em 2026-09-19, PASS, 6 pendências) | Sai da leitura do artigo e perde o contexto ao chegar num formulário genérico na home | Três autoridades de congelamento distintas e não relacionadas entre si: (1) canário #389 e irmãos por SHA — `glosa-de-medicao-obra-publica`, `medicao-de-obra-publica-rejeitada`, `fiscal-nao-assina-medicao-obra-publica` (`docs/evidence/389-measurement-glosa-canary/canary-contract.json`); (2) aprovação delegada hash-bound de `chuva-prorrogacao-prazo-obra-publica`, com rebind datado em 2026-09-09 e razão registrada (`data/editorial/striking-distance-noindex.v1.json:44`, campo `material_hash_rebound_at`/`material_hash_rebound_reason`); (3) pin CLICK_ORIGIN de `custos-indiretos-atraso-administracao-obra` e `jogo-de-planilha-aditivo-obra-publica`, porque um teste de clique real no GSC quebrou quando esses dois foram tocados por engano (`scripts/site/apply_article_pillar_form.py:111-114`) | Menos abandono entre artigo e formulário do pilar, mais solicitações com contexto de origem preservado | Não fazer nesta tarefa: qualquer edição de corpo exige nova aprovação hash-bound datada para (2) e revalidação do teste CLICK_ORIGIN para (3); (1) exige decisão específica sobre o canário #389 | `apply_article_pillar_form.py --check` (já verde hoje porque nada foi tocado); `scripts/organic/tests/test_inb08_owned_routes.py` para o pin CLICK_ORIGIN | integrador / owner editorial, por autoridade de congelamento | corrigir_agora, mas bloqueado por três aprovações separadas — não é uma correção única |
| `/casos/medicao-glosa-demonstrativo/` (registro de débito já existente em `data/organic/public-family-registry.json:557-560`, `expires_at: 2026-09-30`, `owner_issue: 61`) | Chega ao demonstrativo mas o `<main>` não tem ação terminal própria | Débito comercial já registrado, route-exact, datado, com issue dona (#61); a issue de implementação #290 já foi encerrada | Visitante do exemplo demonstrativo converte sem precisar voltar para achar o formulário | Adicionar ação terminal ao `<main>` do caso antes de 2026-09-30, ou renovar o débito com razão datada | `scripts/site/inbound_gates.py::gate_conversion` | integrador / owner de conversão | corrigir_agora — o prazo do débito (2026-09-30) vence em 11 dias |
| Pilar `/medicoes-glosas-obras-publicas/` repete a negativa "não promete" | Duas negativas adjacentes com objetos diferentes podem ler como redundância, sem serem literalmente a mesma frase | linha 80: "a análise técnica não é petição jurídica e não promete recebimento" (limite de escopo, card de condições); linha 228: "Este formulário não conclui contratação e não promete reversão da glosa" (formulário) | Leitura mais direta, sem perda de nenhuma das duas ressalvas materiais | Consolidação editorial mínima das duas frases em uma só ocorrência, sem remover nenhuma das duas ressalvas | leitura humana / revisão editorial (não há gate automatizado para isso) | owner editorial | corrigir_agora, mas é ajuste de estilo, não um defeito de conteúdo |
| Campo oculto `origem` do pilar pré-renderizado com o próprio slug do pilar (`medicoes-glosas-obras-publicas/index.html:235`, `value="medicoes-glosas-obras-publicas"`) | O sistema comercial não sabe, pelo campo `origem`, qual artigo trouxe o visitante até o pilar — só sabe que o contato veio do próprio pilar | `js/modules/form.js:604` só preenche `landing_page` em runtime se estiver vazio; como o pilar já vem com `landing_page` e `origem` preenchidos estaticamente com a própria URL/slug, nenhum contexto de artigo de origem chega por esses dois campos. O contexto de artigo hoje só viaja por `tema`/`origem` em query string — e só nos CTAs que apontam para a home (ex.: `conteudos/glosa-de-medicao-obra-publica/index.html:88`, `href="/?tema=...&origem=/conteudos/glosa-de-medicao-obra-publica/#contato"`) — ou pelo referrer HTTP, que não é capturado no payload atual | Atribuição mais fina de qual artigo gera contato qualificado | Não decidir aqui: exige decisão de campo canônico entre web-cfg e Warmbly (qual campo é a fonte de verdade para "artigo de origem" quando o destino final é o pilar, não a home) | a definir junto com o contrato de atribuição da issue #706 | Warmbly (dono de oportunidade/atribuição) + web-cfg | dependencia_externa |
| `glosa-de-medicao-obra-publica` é `noindex,follow` (`conteudos/glosa-de-medicao-obra-publica/index.html:9`) | — (página não é ponto de entrada orgânica) | Página segue útil para navegação interna e para os visitantes que já a alcançam por link, só não é indexável | nenhum — decisão editorial preexistente, não um defeito | nenhuma | — | — | ja_atendido / já registrado — tensão observada e não resolvida: a mesma página aparece no snapshot GSC de 02-29/08 com 11 impressões e 1 clique (`seo/gsc-2026-08-31/manual-page-snapshot.v1.json:200-205`); não se sabe, sem mais dado, se o `noindex` é posterior à janela observada ou se o Google ainda não recrawleou |
| A06 — recebimento de e-mail de lead real por navegador humano | Sem essa evidência, `RECEBIMENTO_COMPROVADO` continua `PENDENTE_OPERACIONAL` (herdado da campanha anterior) | Turnstile recusa automação (600010); protocolo humano documentado em `design-institucional/fechamento/evidence/producao/g03-qa-protocolo.md` | — | executar o protocolo com 3 envios reais, ≥30s entre eles | protocolo A2-A9 do documento acima | proprietário (contato autorizado) | dependencia_externa: ação humana |
| F005 — "PII em wa.me" | — (achado do relatório de origem, checado nesta sessão) | REFUTADO: `js/modules/form.js:564-565` monta a mensagem do fallback só com `(estagio \|\| journey \|\| 'contato')`; nenhum outro ponto do `js/` interpola nome/e-mail/telefone em link `wa.me` (`grep -rn "wa\.me" js/` retorna só `form.js:30`, `form.js:586`, `form.js:772`, `nav.js:1270`); os links `wa.me` embutidos nas páginas estáticas usam texto fixo por artigo (ex. `conteudos/glosa-de-medicao-obra-publica/index.html:88`) | — | nenhuma | — | — | ja_atendido — achado do relatório não se sustenta |
| Promessas proibidas ("laudo incontestável", "aditivo aprovado", "pagamento liberado", "sigilo total") | — | grep negativo sobre todo o HTML público (excluindo docs/, tests/, node_modules, worktrees soltos): zero ocorrências das quatro frases | — | nenhuma | grep negativo, repetível | — | ja_atendido |
| EESC-USP como credencial | — | `index.html:99,278,391`, `confianca/index.html:75` afirmam só a formação ("Engenharia Civil pela EESC-USP", registro ativo no CREA); nenhuma linguagem de chancela/aprovação institucional da universidade | — | nenhuma | grep + leitura de contexto | — | ja_atendido |
| `cta_click` sem `destination_type` | O evento de intenção pode ficar sem classificação de destino | `js/modules/nav.js:1245-1249` só inclui `destination_type` quando truthy (spread condicional) — mecanismo confirmado. MAS o mandato pedia tratar isso como pendência a corrigir (W3); a leitura direta mostra que já está tratado: `netlify/functions/lib/event-registry.json:251` documenta "absent = legacy_unclassified, counted as intent and labelled"; `data/revops/closed-loop-funnel.v1.json:171` já tem `legacy_unclassified_events`; a correção e o teste (2/2 verde) estão registrados em `docs/campaigns/design-institucional/fechamento/evidence/correcoes-revisao-consolidadas.json` (commit `1dad38fc3`) | contagem correta do funil sem inflar nem zerar `view_to_cta` | nenhuma nesta tarefa | `test_closed_loop` (já existente) | — | ja_atendido — reclassificado a partir de corrigir_agora no mandato original |
| Contagem de propostas sem especificação no contrato closed-loop | Sem uma definição única de "o que conta como proposta", o indicador de R$ 1 milhão pode inflar por revisão, alternativa excludente ou recorrência | Especificação pedida pela issue #706 (dedução, deduplicação, fuso, revisões, alternativas, recorrência, coortes) ainda não existe como contrato formal entre web-cfg e Warmbly | leitura de desempenho comercial confiável | especificar o contrato de contagem com o owner comercial | fixtures (a)-(j) listadas na issue #706 | Warmbly + web-cfg (PR-2) | dependencia_externa — fica para a PR-2, como o mandato já previa |

Nota sobre uma verificação que **não** pôde ser concluída como o mandato pedia: a página pública `/inspecao-diagnostico-edificacoes/` distingue o objetivo da inspeção da apuração de nexo causal/recebimento **em prosa** (linha 159: "Isso não é projeto de reforma nem perícia de um processo"), mas **não cita nenhuma das duas normas por número** (nem NBR 16747, nem NBR 13752) em nenhum ponto do HTML público. A única citação de norma encontrada está no contrato interno `data/offers/multivertical/catalog.v2.json:996` ("ABNT NBR 16747 quando aplicável ao objetivo"), que não cita a NBR 13752 e não é superfície pública. Isso é registrado como pendência editorial real, não como um achado já atendido — ver Brief 2 (Condomínio) abaixo.

## Jornada piloto e ativo escolhido (#707)

Jornada: artigo ou caso → `/medicoes-glosas-obras-publicas/` → `#exemplo-demonstrativo` (âncora confirmada em `medicoes-glosas-obras-publicas/index.html:86,96`) → `/casos/medicao-glosa-demonstrativo/` → `#captura-pilar` (confirmada em `medicoes-glosas-obras-publicas/index.html:228`) → recibo.

Ativo escolhido: `/casos/medicao-glosa-demonstrativo/`. Motivo: utilidade concreta (divide a glosa em três pedidos, method demonstrado item a item); `index,follow`; legível no celular (não avaliado com ferramenta de medição nesta tarefa, apenas leitura de estrutura); leva à oferta atual pelo pilar; sem alegação jurídica automática; defeito reproduzido nesta sessão: o `<main>` do caso não tem ação terminal própria (débito já registrado em `data/organic/public-family-registry.json:557-560`, vencendo em 2026-09-30).

Correção à premissa original: o mandato descrevia o caso como tendo "CTA na home e sem links de entrada além de /casos/". A leitura direta mostrou o seguinte: neste ramo, `medicoes-glosas-obras-publicas/index.html:102` linka para o caso ("Ver o exemplo completo, item a item"), pelo commit `471df38e6`; `origin/main` não tem esse trecho (`git show origin/main:medicoes-glosas-obras-publicas/index.html | grep -c medicao-glosa-demonstrativo` = 0). A ponte pilar→caso é, portanto, um link novo **publicado nesta campanha**; só o link a partir de `casos/index.html` já existia antes dela (ver seção de distribuição abaixo e `evidence/distribuicao-preparada.json`).

Alternativa avaliada: `/ferramentas/diagnostico-defesa-margem/` — mantida como ferramenta complementar, não descartada. Recorte PNCP de 2026-08-14, página revista em 2026-08-15 (`ferramentas/diagnostico-defesa-margem/index.html:79`). Correção à premissa original: o mandato afirmava a ferramenta "ausente" do snapshot GSC; isso é falso para o snapshot de 31/08 — ela aparece com 3 impressões, 0 cliques, posição 1.33 (`seo/gsc-2026-08-31/manual-page-snapshot.v1.json:521-527`; ver `evidence/gsc-leituras.json`).

Duas a três consultas de intenção, marcadas como **hipóteses**, com o que o snapshot GSC mostra e seus limites (período 02-29/08/2026, um único snapshot manual, sem quebra por dispositivo nem confirmação de origem BR isolada para as rotas específicas): ver `evidence/gsc-leituras.json`, bloco `duas_a_tres_consultas_de_intencao_hipoteses`. Resumo: nenhuma das três hipóteses tem consulta (query) observada associada nas fontes disponíveis — só impressão de página, o que é uma agregação diferente e não prova volume de busca por termo.

## Três briefs (#705)

Todas as afirmações abaixo distinguem fonte (arquivo verificado), hipótese editorial (marcada como tal) ou lacuna (marcada como desconhecida). **Apenas a jornada B2G é alterada nesta campanha; nenhum destes briefs cria página nova.**

### Brief 1 — Contratos públicos (medição/glosa)

- Situação: empresa contratada recebe medição com glosa ou pagamento parcial e precisa decidir se contesta tecnicamente.
- Termos do comprador: **hipótese editorial** — não há fala direta de comprador registrada nesta sessão para este brief; a issue #705 cita corpus C01-C12 do relatório de origem como "coleção de indícios, não validação", sem URLs/datas suficientes para reprodução (issue #705, item 2 da revisão adversarial).
- Trabalho assumido: organizar contrato, boletins de medição, quantidades e registros em posição técnica utilizável para discutir a medição; **não promete deferimento** (`medicoes-glosas-obras-publicas/index.html:80,228`).
- Artefato entregue e uso: nota de enquadramento com fundamentação da posição e lista do que falta reunir; usado para negociar com a fiscalização/administração, não como petição jurídica.
- Evidência/demonstrativo disponível: `/casos/medicao-glosa-demonstrativo/` (URL real, verificada nesta sessão).
- Campo/atribuição: `origem`, `landing_page`, `asset_id`, `route_family` do formulário do pilar (`medicoes-glosas-obras-publicas/index.html:235`) — ver limite de atribuição na matriz de achados acima.
- Condição material: "A CONFENGE atende a empresa contratada. O órgão público contratante decide o ateste, a liquidação e o pagamento" (`medicoes-glosas-obras-publicas/index.html:80`).
- CTA e destino real: formulário `#captura-pilar` no próprio pilar (`medicoes-glosas-obras-publicas/index.html:228`).
- `intent_family`: `executar_proteger_contrato_publico` (`data/corporate/intent-family-matrix.v1.json`, `canonical_service_family: public_contract_execution`); `offer_ids` associados incluem `CFG-D17` a `CFG-D42`.
- Correções técnicas: nenhuma pendente para este brief além das já listadas na matriz de achados (artigos congelados, campo `origem` estático).

### Brief 2 — Problemas em condomínios (inspeção/diagnóstico)

- Situação: síndico, proprietário ou construtora em entrega precisa registrar a condição de uma edificação (fissura, infiltração, recebimento) e decidir intervenção.
- Termos do comprador: **hipótese editorial** — mesma ressalva do Brief 1; a issue #705 (item 3 da revisão adversarial) aponta erro de enquadramento no relatório de origem: a NBR 16747 (inspeção) foi tratada como se servisse à investigação de nexo causal/recebimento, distinção que a Norma de Inspeção Predial IBAPE 2025 (p. 11, citada na issue) remete à NBR 13752.
- Trabalho assumido: inspecionar e documentar com metodologia adequada ao objetivo declarado, distinguindo manutenção, recebimento e apuração causal — sem fundir as três compras.
- Artefato entregue e uso: relatório de inspeção e condição, com objeto, data, manifestações localizadas e escopo efetivamente examinado (`data/offers/multivertical/catalog.v2.json`, offer `building_inspection_pathology`, `deliverables`).
- Evidência/demonstrativo disponível: página de serviço `/inspecao-diagnostico-edificacoes/`; **não há demonstrativo publicado equivalente ao `/casos/medicao-glosa-demonstrativo/` para esta linha** — desconhecido/lacuna, não afirmado como existente.
- Campo/atribuição: não aplicável a esta tarefa (não é a jornada piloto).
- Condição material verificada: `inspecao-diagnostico-edificacoes/index.html:159` já distingue por objetivo em prosa ("Isso não é projeto de reforma nem perícia de um processo"), mas **não cita NBR 16747 nem NBR 13752 por número** em nenhum ponto do HTML público — correção técnica do relatório de origem ainda não refletida na cópia publicada. Isso é uma pendência editorial real (não coberta por esta tarefa, que não altera HTML).
- Sem calculadora de Habite-se+5 anos: confirmado por ausência — `grep -rn "Habite-se"` não retorna ocorrência em HTML público nesta sessão.
- Conclusão fundamentada, não favorável: consistente com `exclusions` do offer `building_inspection_pathology` ("laudo de avaliação de valor", "perícia judicial vendida como inspeção privada sem recorte" — `data/offers/multivertical/catalog.v2.json`).
- CTA e destino real: formulário de contato da página de serviço (`inspecao-diagnostico-edificacoes/index.html:256`, seção de contato).
- `intent_family`: `inspecionar_diagnosticar` (`canonical_service_family: building_condition_documentation`, `offer_ids: ["building_inspection_pathology", "pre_litigation_technical_screening"]`).
- EESC-USP como credencial: mantém o padrão já verificado (formação, não chancela) — ver matriz de achados.

### Brief 3 — Assistência técnica

- Situação: parte em disputa cível de edificação ou imóvel (ou seu advogado) precisa de assistente técnico para instruir a tese.
- Termos do comprador: **hipótese editorial** — mesma ressalva dos briefs anteriores.
- Trabalho assumido: formular quesitos, examinar peças e documentos do corpus congelado, criticar laudo de terceiro quando contratado, sustentar manifestação técnica útil à parte e ao advogado — sem prometer resultado judicial (`data/offers/multivertical/catalog.v2.json`, offer `civil_building_technical_assistance`, `exclusions`: "não garante resultado judicial", "não é advocacia", "não é nomeação como perito do juízo").
- Artefato entregue e uso: quesitos e pontos técnicos da parte, análise de peças, crítica fundamentada de laudo de terceiro, esclarecimentos técnicos.
- Evidência/demonstrativo disponível: não verificado nesta sessão um demonstrativo público específico para esta linha — desconhecido/lacuna.
- Campo/atribuição: não aplicável a esta tarefa.
- Condição material: conclusão fundamentada, nunca favorável antecipadamente; EESC-USP citada só como formação (mesmo padrão do Brief 2).
- CTA e destino real: não identificado nesta sessão um formulário/rota dedicada; possivelmente a rota de contato geral — a confirmar antes de qualquer nova comunicação sobre este brief.
- `intent_family`: `produzir_prova_tecnica` (`canonical_service_family: technical_evidence_disputes`, `offer_ids: ["pre_litigation_technical_screening", "civil_building_technical_assistance", "urban_property_valuation"]`).

**Declaração explícita**: apenas a jornada B2G (medição/glosa) é alterada nesta campanha. Nenhum dos três briefs acima cria landing page nova; os briefs de condomínio e assistência técnica reutilizam rotas e contratos de oferta já existentes, sem página nova.

## Distribuição interna e externa (#707)

Conexões internas (verificadas nesta sessão): ver `evidence/distribuicao-preparada.json`, blocos `conexoes_internas_publicadas_nesta_campanha` e `conexoes_internas_ja_existentes_antes_da_campanha`. Resumo: `/medicoes-glosas-obras-publicas/` → `/casos/medicao-glosa-demonstrativo/` (linha 102) é link novo desta campanha (commit `471df38e6`; `origin/main` não tem esse trecho); `/casos/` → `/casos/medicao-glosa-demonstrativo/` já existia em produção antes desta campanha. As rotas alteradas nesta W4 incluem o pilar `/medicoes-glosas-obras-publicas/`.

Até três oportunidades de distribuição **externa**, preparadas, sem destinatários nem nomes de pessoas/organizações privadas, estado `PREPARADA, NAO_PUBLICADA`, autorização específica pendente (detalhe completo em `evidence/distribuicao-preparada.json`, bloco `oportunidades_externas_preparadas`):

1. Biblioteca própria/hub de conteúdos (`/conteudos/`) — link pilar→caso publicado nesta campanha, sem parâmetro livre.
2. Comunidade profissional de engenharia de custos/obras públicas — regra de contribuição útil a verificar antes de qualquer postagem (comunidades específicas variam; nenhuma foi identificada ou contatada nesta sessão); mensagem-rascunho no arquivo de evidência.
3. Entidade/diretório setorial pertinente — regra de submissão a verificar; entidade específica não nomeada até decisão de contato.

Janela de leitura: 14 dias após a distribuição efetiva, com início/fim reais a registrar somente quando a distribuição ocorrer (hoje `null`/`null` em `evidence/distribuicao-preparada.json`). Interpretação por estágio copiada, de forma resumida, da issue #707: sem exposição suficiente → revisar distribuição/indexação; exposição sem uso → revisar correspondência promessa/conteúdo; uso sem contato → revisar ponte comercial; contato sem qualificação → investigar intenção/necessidade; qualificação sem proposta → investigar escopo/capacidade/preço; amostra pequena → resultado inconclusivo, sem narrativa de sucesso.

## Mensuração (#706, sem outro sistema)

Estágios distinguíveis hoje, por contrato/evento já existente: `page_view` → `cta_click` (com `destination_type` quando aplicável; ausência já tratada como `legacy_unclassified`, ver matriz de achados) → `lead_form_start`/`lead_form_step`/`lead_form_submit` → `lead_persisted` → `delivery.email.status` → handoff Warmbly. Estados comerciais (oportunidade qualificada, proposta enviada, aceita, faturada, recebida) continuam de responsabilidade da Warmbly, sem vínculo pessoa↔analytics anônimo — nada disso é reimplementado ou reespecificado nesta tarefa.

Quebras de série que **esta campanha** provocaria, se e quando os seis artigos e o caso passarem a levar ao pilar em vez da home: `cta_click` `destination` muda de rota "home" para rota "pilar"; `landing_page`/`tema` (quando usados) passam a chegar como o artigo de origem em vez de sempre a home. Nenhuma dessas mudanças foi feita nesta tarefa (W4 é só documentação); fica registrado como o que aconteceria, não como o que aconteceu.

Quebra de série adicional, descrita por FX1 (dependência Warmbly, TAREFAS-01): distinta da mudança pilar→home acima (que segue condicional, "se e quando"), esta já se aplica a partir desta release, porque a ponte pilar→caso já está publicada neste ramo: o clique artigo→pilar passa de `content_to_service` (engajamento) a `cta_click` `form` (intenção); `tema` passa a persistir no registro do lead; `origem` continua o slug do pilar.

`destination_type` sempre presente: item da issue #706/W3. Correção à premissa: já está tratado hoje via rótulo `legacy_unclassified` quando o campo está ausente (ver matriz de achados); "sempre presente" no sentido literal (nunca omitido do payload) ainda não é o comportamento atual — o campo é omitido e o consumidor rotula a ausência, o que é uma forma diferente de resolver o mesmo problema. Isso é uma constatação de W3, não uma verificação nova desta tarefa.

Modelo reverso, como cenário interno (todas as taxas são hipóteses, sem denominador observado): `visitantes necessários = 40 / (0,35 × q × 0,03)`, com `q` = contatos recebidos que viram oportunidades qualificadas / contatos recebidos. Exemplos ilustrativos da issue #706: q=100% → 3.810; q=50% → 7.619; q=30% → 12.698 visitantes/mês. Não são previsão, benchmark nem meta de tráfego aprovada.

O que fica para a PR-2: a especificação de contagem de propostas (uma proposta canônica por oportunidade/escopo efetivo, revisão substitui e não soma, alternativas excludentes não somam, valor de honorários separado de valor de obra/pleito) e as fixtures (a)-(j) listadas na issue #706, com o owner comercial (Warmbly) — dependência externa, não resolvida aqui.

## Cobertura da revisão

Nota honesta: os mapas usados como ponto de partida desta tarefa foram produzidos por leitura somente-leitura de sete agentes anteriores (mencionados no encaminhamento da campanha); um desses leitores, referente ao ativo/jornada de distribuição (#707), teve o conteúdo recuperado da transcrição por falha de esquema; o crítico de completude que deveria revisar o conjunto não devolveu resultado. Nenhuma dessas afirmações de terceiros foi aceita sem checagem nesta tarefa: as alegações efetivamente usadas nesta seção W4 foram verificadas diretamente pelo integrador (esta sessão) por leitura de arquivo, com file:line citado, e o log de comandos está em `evidence/w4-verificacoes.json`. Principais verificações diretas desta sessão:

- `scripts/site/apply_article_pillar_form.py --check` (PASS, 6 pendências, seis artigos confirmados).
- `conteudos/glosa-de-medicao-obra-publica/index.html:9` (`noindex,follow`).
- `js/modules/form.js:564-566` e `grep -rn "wa\.me" js/` (refutação de F005).
- `js/modules/nav.js:1245-1249`, `netlify/functions/lib/event-registry.json:251`, `data/revops/closed-loop-funnel.v1.json:171` (reclassificação de `legacy_unclassified` para `ja_atendido`).
- `medicoes-glosas-obras-publicas/index.html:102,235` e `js/modules/form.js:604` (ponte pilar→caso publicada nesta campanha pelo commit `471df38e6` neste ramo; `origin/main` não tem esse trecho; limite real de `landing_page`/`origem`).
- `data/organic/public-family-registry.json:557-560` (débito já registrado do caso, `expires_at: 2026-09-30`).
- `seo/gsc-2026-08-31/manual-page-snapshot.v1.json:137-141,193-198,200-205,521-527` e `scripts/revops/fixtures/gsc-founder-baseline-2026-09-02-08/` (duas fontes GSC, correção sobre a ferramenta "ausente").
- `inspecao-diagnostico-edificacoes/index.html:159` e `data/offers/multivertical/catalog.v2.json:996` (NBR 16747/13752 não citadas juntas na superfície pública).
- Grep negativo de quatro promessas proibidas e verificação de EESC-USP como credencial factual.

Os estados finais (concluído, publicado, verificado em produção) não são preenchidos aqui — cabem ao integrador, conforme a diretriz desta tarefa.

## Adendo editorial do fundador (2026-09-19): ausência de menção a IA

Diretriz: nenhum conteúdo destinado ao visitante afirma, nega, justifica ou compara a participação de inteligência artificial nos trabalhos. Regra de ausência de menção, não de declaração de ausência; nenhuma referência retirada foi substituída por negação, eufemismo, comparação ou anúncio da política. Não altera ferramentas internas, documentação operacional, instruções de agentes, registros de auditoria nem a política de rastreamento (`robots.txt` intocado, byte-idêntico).

Inventário (3 leitores somente-leitura, verificado pelo integrador) e tratamento aplicado na fonte/gerador, nunca só no HTML:

| Superfície | Fonte/gerador | Tratamento |
| --- | --- | --- |
| Rodapé institucional "Uso de IA" (89 páginas + `404.html`) | `scripts/site/authority.py` (`FOOTER_AUTHORITY_NAV`), `scripts/pseo/html_shell.py` (fallback), propagação por `scripts/site/patch_authority_footers.py --write` | item removido sem substituto; prova por word-diff: único token removido em 84 páginas só de rodapé é o âncora; `git diff` sem `header_nav`/`mobile_nav` |
| Navegação das páginas de autoridade | `scripts/site/render_authority_pages.py` (`_nav`), `confianca/index.html` (manual) | item removido |
| `/uso-de-ia/` (página inteira) | `data/site/editorial-policy.json` + `render_authority_pages.py` | RETIRE 410 (`_redirects`, bloco "Retired 2026-09-19 (#705)"); registro em `data/editorial/public-preview-route-decisions.json`; fora da família `legal-and-trust`, de `PUBLIC_TOP_DIRS`, de `authority-governance.json`, do sitemap; fonte preservada no JSON (versões 1.0.0–1.3.0) |
| Política editorial | `data/site/editorial-policy.json` → versão 1.4.0 (2026-09-19) sem a seção; "interpretação humana" → "interpretação do responsável técnico"; changelog público: "Uma seção da política foi retirada por decisão editorial do fundador." | histórico 1.0.0–1.3.0 preservado no registro; `/politica-editorial/v/1.0.0/` despublicada (410) por conter o texto antigo; resumo público da 1.1.0 sem a cláusula |
| Regime `ai_disclosure required/recommended` da matriz de autoridade | `data/site/authority-matrix.json`, `scripts/site/authority.py`, `scripts/site/test_authority_contract.py` | regime retirado; testes invertidos para exigir ausência (contraprovas: link no rodapé, rótulo, `data-ai-disclosure`, "inteligência artificial", "Não usamos IA" reprovam) |
| Análises técnicas de contratos | `scripts/contract_analysis/render.py` (`AI_DISCLOSURE_HTML`) | parágrafo removido; `approvals.json` recapturado (hash renderizado) |
| Páginas manuais: `especialista/tiago-jun-sasaki/`, `projetos-complementares-engenharia/`, `metodologia-inteligencia/`, `conteudos/chuva-prorrogacao-prazo-obra-publica/` | HTML manual | frase/parágrafo removidos sem substituto (a responsabilidade pela página já estava declarada ao lado) |
| `conflitos/` "análise humana" | contrato lido por `scripts/site/conflict_gate.py` | reescrito sem contraste humano/automatizado |
| Versão 1.3.0 → 1.4.0 nas 4 superfícies de dados (`inteligencia/`, `radar/nacional-obras-publicas/`, `metodologia-inteligencia/`, `ferramentas/limite-acrescimos-supressoes/`) | `policy_version_disclosure()` | parágrafo de versão atualizado (mesmo procedimento de `a36d34beb`) |

Verificação contextual acrescentada ao mecanismo editorial existente: `scripts/site/test_ai_mention_gate.py` (`npm run test:ai-mention`, passo "Editorial: no AI mention on visitor surface" no `site-ci`, antes do build). Reutiliza `visible_text()/visible_markup()` de `public_copy_scope.py` e cobre texto visível, `title`, meta/og/twitter, `alt`/`aria-label`/`title`, JSON-LD (`name/description/text`) e `href` para `/uso-de-ia/`. Reprova afirmações de uso (IA, inteligência artificial, ChatGPT, chatbot, modelos generativos, agentes inteligentes, tecnologia cognitiva, LLM, machine learning, AI), negações/comparações ("sem IA", "não usamos IA", "100% humano", "feito por pessoas", "não é resposta de chatbot", "não divulgamos nossas ferramentas") e links à rota retirada. Lista de segurança testada: "inteligência técnica", "inteligência de mercado", `/inteligencia/`, "engenharia", "via", "dia", "perícia", "vigilância", "auditoria", "Itajaí", "materiais", "ART", "AIA". Zero exceções em `copy-exceptions.json`.

Falsos positivos preservados: "IA" como arquitetura de informação (`data/site/public-ia-map.json`, `scripts/site/public_ia.py`), "inteligência técnica/de mercado", rotas `/inteligencia/` e `/metodologia-inteligencia/`.

## Execução da suíte (A09)

- Réplica local do `site-ci` em clone limpo (`~/code/confenge/.worktrees/inbound-clean`, Node 22.23.2, extra-cli contratado `704975a7`, `SOURCE_DATE_EPOCH` do commit, `CONTEXT=production` + `TURNSTILE_SITE_KEY` só no build, `set -e` por passo, `CHROME_PATH` Chromium 153): **33/33 passos verdes** sobre o artefato construído em `122902d47` (`_site/.well-known/build-info.json.commit` = HEAD). Log: `evidence/replica-site-ci-122902d47.log`.
- Primeira réplica (sobre `178c6827a`) reprovou em 8 passos; causas e correções: sonda nginx tratava `v/1.0.0` como arquivo (corrigida em `scripts/migration/netcup/validate-nginx.mjs`); bundle `script.js` defasado em relação a `js/modules/nav.js` (reconstruído; achado JOR-01 da revisão); regra CSS morta `.ai-disclosure`; censo do logo e baseline de desempenho com 233 rotas (regravados para 231); exceções de copy da rota retirada; `CHROME_PATH` e rebuild concorrente no ambiente da réplica (não são defeitos do candidato).
- Revisão adversarial independente (workflow `inbound-receita-review`, 4 dimensões × 2 refutadores por achado P0/P1): confirmados JOR-01, JOR-02, JOR-03, ED-01, ED-02, ED-03, ED-04 — todos corrigidos nos commits `e32b9d8c2`, `c68e5ed30`, `bd20d86a9`; P2 assumidos: INB-SEO-01 (teste antigo exigia `/uso-de-ia/`), INB-SEO-02 (`CHROME_PREFIXES`), INB-SEO-03 (data do pilar), A2/ED-05 (contraste humano/automatizado em 15 rotas + terceira família do gate). Refutado: F005 (PII em `wa.me`). Não corrigidos por decisão: INB-SEO-05 (datas dos 4 artigos noindex, pré-existente, efeito nulo em busca).
- `site-ci` e `pSEO quality gates` reais: PR #708.

## Publicação e verificação (2026-09-19)

- PR #708 (`campaign/inbound-receita-20260919`, head `9c74ff5b3`; artefato construído em `122902d47`): `site-ci` 35431639964 e 35433006506 verdes, pSEO verde. Merge commit `4fa3c64db` (09:23Z).
- Release de `4fa3c64db` (35434558511) reprovou no gate `site-ci` de `main`: a contraprova `test_click_origin_guard_lets_the_bridge_evolve_only` montava a fixture a partir de `origin/main`, que após o merge já continha o link do pilar → PR #709 (`a29eabd96`, só teste). Release de `a29eabd96` (35436385962, duas execuções) reprovou em "Commercial visitor journeys": `next_hit_target:false` antes do clique em "Adicionar mais detalhes" e foco em `consentimento` — clique emitido durante o deslocamento de layout do widget antiabuso, presente só no artefato de produção (o `site-ci` da PR e a réplica local, 3/3, passaram) → PR #710 (`a27472bec`, harness espera botão estável e alvo do hit-test; asserção da transição mantida).
- Release 35439209267 (`a27472bec`): preflight, `site-ci` (contexto de produção), pSEO, package/attest, stage, qualification e promote verdes. Predecessor servido: `6bd981197` (disponível para reversão pelo controlador canônico, `docs/ops/ROLLBACK.md`).
- Verificação pública: `evidence/verificacao-publica-a27472bec.txt` (34/34). Rotina diária autorizada (run 35441489601): verde, sem inflar indicadores comerciais (QA sintético excluído por `record_kind`).
- Superfície renderizada em runtime pela função `/api/web/live-intelligence-analyze` (`/analise-cnpj/r/`, rótulo "Pedir revisão do responsável técnico"): não observada publicamente — a sonda sem Turnstile recebe 403 (antiabuso, por desenho); o código implantado em `a27472bec` contém o rótulo novo (`netlify/functions/live-intelligence-analyze.cjs`). Sem Slack disponível nesta sessão: registro mantido no GitHub.
- Equivalência documental: o merge do #709/#710 alterou apenas testes; o artefato público de `a27472bec` é o mesmo conteúdo verificado em `122902d47` (diferem só identidade/manifestos).

## Ação humana mínima restante

1. **A06 — recebimento humano pelo Turnstile** (herdado): executar `design-institucional/fechamento/evidence/producao/g03-qa-protocolo.md` num navegador real (3 envios, contatos autorizados, referência REF-…), devolvendo `lead_id`, hora, chegada na caixa e `delivery.email.provider_id`. Sem isso o estado permanece PENDENTE_OPERACIONAL.
2. **Distribuição externa (#707)**: autorizar (ou não) cada uma das três oportunidades em `evidence/distribuicao-preparada.json`; registrar início/fim reais da janela de 14 dias quando houver distribuição efetiva.
3. **Warmbly (#706)**: decidir o campo canônico de origem da oportunidade (`origem` continua o slug do pilar; o contexto do artigo chega em `tema`, `landing_page`, `referrer` e no prefixo da mensagem) e o contrato de contagem de propostas (uma por oportunidade/escopo; revisão substitui; alternativas não somadas; total × parcela mensal; emitida/aceita/faturada/recebida; America/Sao_Paulo) — a parcela web ficou retrocompatível; fixtures (a)–(j) ficam para a PR-2 quando o contrato do snapshot for acordado.

## Encerramento

1. Implementado e testado: jornada B2G medição/glosa (seis artigos + caso + pilar), instrumentação web (#706) e descoberta interna (#707); adendo editorial de ausência de menção a IA com gate; recapturas coordenadas.
2. Integrado: `4fa3c64db` + `a29eabd96` + `a27472bec` em `main`.
3. Publicado e verificado: `a27472bec` servido e conferido (34/34).
4. Recebimento: cadeia sintética comprovada; cadeia humana PENDENTE_OPERACIONAL (A06).
5. Descoberta/distribuição: habilitada internamente; exposição não observada; externa preparada, não publicada.
6. Resultado comercial: ainda não medido (sem promessa de tráfego, indexação ou receita).
