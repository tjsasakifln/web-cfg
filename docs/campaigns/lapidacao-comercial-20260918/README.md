# CONFENGE-LAPIDACAO-COMERCIAL-20260918 — registro único da campanha

Decisão: EXECUTE_NOW (fundador, 2026-09-18). Frente: clareza comercial, confiança e continuidade entre interesse e atendimento. Alavancas: conversas qualificadas, confiança, automação confiável, manutenção reutilizável. Superfície: confenge.com.br, esteira Netcup.

Baseline reconciliado em 2026-09-18T21:30Z: `origin/main` = `866a3415e` (merge do PR #702, documental); produção serve `4cfa6adca` (PR #701, release 35382722937). O `site-ci` de `866a3415e` reprovou por `/entregas/: LCP 2026,98 ms > 2000 ms` (uma execução, 27 ms acima) e por `REQUIRED_EXECUTION_FAIL` derivado dessa falha; a release de `866a3415e` não promoveu. Branch de integração: `campaign/lapidacao-comercial-20260918` a partir de `866a3415e`. PR #696 (docs B2G) permanece aberto e intocado.

Decisão editorial expressa do proprietário (2026-09-18): "Exemplo demonstrativo" basta para identificar um demonstrativo. Explicações redundantes de que não é caso/obra de cliente saem, sem substituição por outra negativa. Identificação conservada em cada material autônomo; valores hipotéticos e restrições relevantes recebem indicação própria onde mudam a interpretação.

## Estados (dimensões, com evidência e data)

| Estado | Valor | Evidência |
| --- | --- | --- |
| EDITORIAL_VALIDADO | PENDENTE | — |
| PUBLICADO_E_VERIFICADO | PENDENTE | — |
| RECEBIMENTO_COMPROVADO / PENDENTE_OPERACIONAL | PENDENTE_OPERACIONAL | Turnstile 600010 recusa automação (`design-institucional/fechamento/evidence/producao/g03-qa-tentativa-automacao.json`); ação humana mínima em `g03-qa-protocolo.md` |
| VALIDACAO_HUMANA | NAO_EXECUTADA | sem participantes |
| RESULTADO_COMERCIAL | AINDA_NAO_MEDIDO | — |

## Registro de defeitos materiais

| ID | Jornada / URL / bloco | Evidência anterior (4cfa6adca) | Dúvida afetada | Causa / fonte | Correção | Informação preservada / destino | Prova de aceite | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D01 P1 | J1 `/` herói | P3 "A quantidade levantada num exemplo demonstrativo, sem obra de cliente, põe duas propostas na mesma conta. … para você orçar, contratar ou decidir." repete o H1 e explica o demonstrativo na abertura | o que fazemos / o que recebo | `index.html` | (a preencher) | figcaption mantém "Exemplo demonstrativo" | A01, captura 390/1440 | ABERTO |
| D02 P1 | J1 `/` legendas e seção "O que chega às suas mãos" | "Sem obra de cliente.", "não uma obra de cliente", "Premissas sintéticas, não obra de cliente", "Nenhum valor de mercado é inventado aqui" | é amostra? | `index.html` | (a preencher) | rótulo "Exemplo demonstrativo" por figura | A03 | ABERTO |
| D03 P1 | J2 `/quantitativos-orcamento-obras/` ficha da amostra | `dt Cliente / dd Exemplo demonstrativo Não é obra de cliente` | é amostra? | `sample-trail.mjs` / página | (a preencher) | — | A03 | ABERTO |
| D04 P1 | J2 `/quantitativos-orcamento-obras/` blocos de prova | mesma negativa em 4 lugares ("Não é orçamento para executar obra, não representa cliente, não é preço da CONFENGE e não é SINAPI real"; "Este é um exemplo demonstrativo de método: não representa cliente…" ×2; bullet "Amostras desta página…") | é amostra? preço hipotético? | `sample-trail.mjs` L226/255/281, `proof-entrances.mjs` L240 | (a preencher) | "Preços hipotéticos, para conferência aritmética" junto da tabela; quantidade ≠ preço; espessura ≠ dimensionamento | A01, A03, contraprovas em `test_purchase_path.mjs` | ABERTO |
| D05 P1 | J6 `/casos/demonstrativo-projeto-privado/` | kicker "exemplo demonstrativo" + H1 "Demonstrativo." + "Não há contratante, endereço, assinatura nem número de ART." + "Não é revisão profissional independente, nem revisão por cliente…" | é amostra? o que foi conferido? | `scripts/demonstrative/private_project/render.py` | (a preencher) | conferência do gerador dita afirmativamente; preço hipotético uma vez na tabela | A03 | ABERTO |
| D06 P1 | J5 pilares B2G (`render_nav_hubs.py` L595–602, L714–721) | "não é obra de cliente", "não contrato de cliente" | é amostra? | gerador | (a preencher) | — | A01/A03 | ABERTO |
| D07 P1 | J3 `/#contato` formulário | passo 1 sem envio: "Adicionar mais detalhes" é o único caminho até consentimento e envio; microtexto repetido (5 blocos com a mesma função) | como começo? o que acontece depois? | `index.html` bloco de contato, `js/modules/form.js` | (a preencher) | consentimento, privacidade, alternativa sem JS | A05, contraprova (esconder envio do passo 1 reprova) | ABERTO |
| D08 P0-op | POST /api/web/lead | pior caso 5 s + 8 s + 5 s ≈ 18 s > 15 s do navegador (handoff e entrega em série, `lead.cjs` ~L660–716) | recibo em tempo | `netlify/functions/lead.cjs` | (a preencher) | persistência antes do recibo | A07 teste determinístico | ABERTO |
| D09 P1-op | e-mail de alerta | sem `Idempotency-Key` no Resend; sem consumidor de retentativa (`drain_inbound` só drena handoff) | alerta chega? | `lead-delivery.cjs`, `ops.cjs` | (a preencher) | timeout ≠ não enviado; janela 24 h | A07 | ABERTO |
| D10 P1 | J5 `/servicos-obras-publicas/` 390×844 | primeira ação de contato visível a 1170 px (fora da primeira tela) | como começo? | página | (a avaliar no lote de propagação) | — | A04 | ABERTO |

## Mapa curto de proposições materiais (preservação)

| Proposição | Onde continua |
| --- | --- |
| Serviço de engenharia contratado, com responsável técnico nomeado, ART e nota fiscal | herói da home; página de serviço; "Quem assina" |
| Demonstrativo ≠ trabalho de cliente | rótulo "Exemplo demonstrativo" em cada figura/arquivo autônomo |
| Preços da amostra são hipotéticos | uma indicação junto da tabela de preços |
| Quantidade ≠ preço; espessura ≠ dimensionamento | legendas das amostras |
| Contratos do PNCP são de terceiros (contexto de mercado) | uma vez no bloco PNCP da home |
| Proposta só após confirmar escopo, local, atribuição e ART | "Como o trabalho passa para cá" e formulário |
| Sem documentos sensíveis no primeiro contato; canal seguro depois | uma vez junto do formulário |
| Análise técnica ≠ garantia de pagamento (B2G) | pilar de medições e glosas |


## Revisão comparativa independente do lote (2026-09-18, agentes; não é revisão humana)

Método: três revisores independentes (editorial, jornadas J1–J8, integridade de testes/backend) compararam a produção servida (`4cfa6adca`, rótulo P) com a candidata (`e3c97a1d0`, rótulo C) sem receber a solução esperada; cada achado P0/P1 passou por um verificador adversarial que tentou refutá-lo. Resultado: nenhum P0 em nenhuma versão; C melhor em cinco das seis rotas e no formulário; um único prejuízo material em C, corrigido antes da publicação (uso restrito do demonstrativo privado: "não é parecer nem orçamento para executar obra", uma vez). Achados confirmados e destino:

| Achado | Rota | Estado |
| --- | --- | --- |
| F02 / j3 / TP-02: consentimento e envio só dentro do painel "pode completar depois" (P) | `/` formulário | CORRIGIDO em C (2de9cf2ed); contraprova em `seo/scripts/test_form_funnel.mjs` falha contra o `script.js` de produção |
| F01 / TP-01: restrição de uso "não é parecer para executar obra" sumiu junto com a negativa redundante | `/casos/demonstrativo-projeto-privado/` | CORRIGIDO na propagação (restaurada uma vez; "sem contratante/assinatura/ART" não volta, por decisão do proprietário) |
| j3-nojs: nota sem JS de P afirmava "preferimos não exibi-lo" com o formulário visível | `/` | C diz só o que é verdade e aponta os canais; esconder o formulário sem JS exige CSS (fora desta campanha) — registrado |
| j5: formulário do pilar diz "campos marcados como obrigatórios" sem marcar nenhum | pilares `#captura-pilar` | CORRIGIDO na propagação (conjunto obrigatório nomeado, opcionais marcados) |
| j7: seis artigos de medição/prazo levam "Continuar pelo formulário" à home | `/conteudos/{glosa-de-medicao-obra-publica, medicao-de-obra-publica-rejeitada, fiscal-nao-assina-medicao-obra-publica, custos-indiretos-atraso-administracao-obra, chuva-prorrogacao-prazo-obra-publica, jogo-de-planilha-aditivo-obra-publica}/` | PRÉ-EXISTENTE, ISOLADO: os seis são congelados por hash (canário #389 / click-origin / aprovação hash-bound; `apply_article_pillar_form.py --check` lista os seis). Mudar o corpo quebra a medição do canário — conflito de autoridade fora desta decisão; permanece a ação humana já registrada no fechamento pós-redesign |

P2 registrados sem ação (preferência): "Quem acessa: operação CONFENGE" saiu do microtexto do formulário e continua em `/privacidade/`; "não é software, planilha gratuita" saiu do herói de quantitativos ("não executa a obra" permanece em Condições e limites).

## Matriz A01–A12 (preenchida em 2026-09-18; SHA candidato = HEAD da branch de integração)

| Item | Estado | Evidência |
| --- | --- | --- |
| A01 Redundância | ATENDIDO | Medidas antes/depois por rota em `evidence/editorial-measure.json` e `evidence/propagation-measure.json` (prosa, "demonstrativ", negativas); trechos por rota nos commits `82d6da29b`, `209e228d2`; revisão independente confirma C melhor em 5/6 rotas do lote sem paráfrase da repetição |
| A02 Significado | ATENDIDO | mapa de proposições acima; revisão independente: única perda material (restrição de uso do demonstrativo privado) corrigida em `209e228d2`; testes exigem os cortes de escopo ("não é projeto executivo", "não é orçamento para executar obra", "não é parecer jurídico", preço hipotético junto da tabela) |
| A03 Demonstrativos | ATENDIDO | rótulo no `<title>`, H1, JSON-LD e `<main>` de cada caso (`test_permissioned_proof`), em cada prancha SVG (título, desc, carimbo — `test_render_plates`), ficha "Cliente: não há cliente" removida; contraprovas em `test_purchase_path.mjs` (rótulo por entrada; qualificador de preço) |
| A04 Jornadas | ATENDIDO com exceção isolada | J1–J6, J8 PASS na revisão independente sobre C; J7 PASS para os artigos de quantitativos e FAIL pré-existente nos seis artigos de medição/prazo congelados por hash (conflito de autoridade, ver tabela acima) |
| A05 Formulário | ATENDIDO | consentimento e envio no passo essencial; opcionais honestos; `test_form_funnel.mjs` (estrutura + runtime com o `script.js` embarcado; contraprovas: envio/consentimento/obrigatório dentro do painel reprovam; `script.js` de produção reprova); `test:ui` (foco, aria, erro por texto); sonda móvel 320/390 sem overflow |
| A06 Recebimento | PENDENTE_OPERACIONAL | Turnstile recusa automação (600010); nenhuma submissão real executada por este agente. Ação humana mínima: `design-institucional/fechamento/evidence/producao/g03-qa-protocolo.md` (passos A2–A9 atualizados para o formulário novo). Sonda sintética autenticada continua verde na rotina diária |
| A07 Resiliência | ATENDIDO (limites declarados) | `8c23e455f`: handoff e entrega em paralelo (teste com Warmbly e Resend lentos ao mesmo tempo: 402 ms vs 653 ms em série no HEAD anterior; pior caso de produção calculado ≈ 14 s < 15 s), `Idempotency-Key` no Resend (24 h), reconciliação de e-mail no `drain_inbound` (consumidor: `revops-scheduled.yml` diário) com claim por tentativa, drains concorrentes → 1 envio, 409 mismatch nunca reenviado; sem exactly-once ilimitado |
| A08 Fontes | ATENDIDO | geradores corrigidos na fonte e regenerados duas vezes com diff idêntico (`private_project`, `infrastructure_pilot`, `compose_proof_entrances`, `render_nav_hubs --check`, `render_plates --check`, `render_cta_form_next_state --check`, `render_eight_offer_contracts --check`); hashes protegidos recapturados com razão datada e `baseline_commit` alcançável |
| A09 Qualidade técnica | ver "Execução da suíte" | réplica local do `site-ci` em clone limpo (Node 22, extra-cli contratado, `SOURCE_DATE_EPOCH`, env por passo) + `site-ci` real no PR |
| A10 Versão servida | PENDENTE até a publicação | `/.well-known/build-info.json` deve informar o merge commit; conferência de rotas/CTAs/formulário após a promoção |
| A11 Superioridade | ATENDIDO | revisão comparativa cega (rótulos P/C, três dimensões, verificação adversarial por achado): C melhor nos defeitos-alvo, sem regressão material após F01 |
| A12 Mensuração | PARCIAL | eventos existentes (`lead_form_start`, `lead_form_step`, `lead_form_submit`, `cta_click` com `destination_type`); quebra de série declarada: `lead_form_step` deixa de preceder obrigatoriamente `lead_form_submit` (taxa de expansão passa a ser opcional real); definições de denominadores em §12 abaixo; nenhum efeito comercial alegado |

## Mensuração (definições, sem alegação de efeito)

Instante da mudança: promoção da release desta campanha (registrar SHA e hora na seção de publicação). Páginas afetadas: inventário nos commits `82d6da29b`, `209e228d2`, `2de9cf2ed`. Campanhas concorrentes: nenhuma ativa em web-cfg; outbound e cadências fora deste repositório (Warmbly).

- Visita elegível: sessão mensurável por entrada (`page_view` sem QA/automação).
- Intenção: `cta_click` com `destination_type` (navegação separada de intenção).
- Início de formulário: `lead_form_start`; expansão opcional: `lead_form_step` (quebra de série em relação ao passo obrigatório anterior); solicitação persistida: `lead_persisted` no store (não o clique).
- Conclusão de formulário = solicitações válidas únicas / inícios comparáveis, por página de entrada e por dispositivo.
- Recebimento: `delivery.email.status=ok` com `provider_id`; conversa, qualificação, proposta e contratação: Warmbly, sem vínculo pessoa↔analytics anônimo.
- Leitura posterior (janelas comparáveis, volume suficiente): mais cliques sem solicitações → etapa de contato; mais solicitações sem conversas → entrega/atendimento; mais conversas sem qualificação → pertinência da promessa/origem; mais oportunidades sem propostas → escopo, preço e condução comercial.
