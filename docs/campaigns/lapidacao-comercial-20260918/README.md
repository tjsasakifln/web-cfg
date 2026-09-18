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

## Matriz A01–A12

(preenchida no fechamento)
