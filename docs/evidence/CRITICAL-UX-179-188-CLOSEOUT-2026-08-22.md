# Fechamento adversarial de UX crítica — issues #179–#188

Data de corte: 2026-08-22

Decisão: **EXECUTE_NOW** para P0/P1; **VALIDATE** permanece explícito onde a acceptance exige pesquisa humana.

Frente executiva: Inbound Engine / Compounding System.

Tempo para evidência: imediato nos gates de código e laboratório; uma janela de tráfego ou sessão moderada nos três residuais humanos.

Alavancas: distribuição, confiança, automação e receita.

## Job do visitante e hipótese

O visitante precisa reconhecer o problema, consumir prova legível e iniciar a próxima ação em qualquer viewport, sem atravessar imagem-título, linguagem interna, navegação ambígua ou trabalho bloqueante. A hipótese é que hierarquia mais direta, ativos proporcionais, controles acessíveis e runtime abaixo de 200 ms reduzem abandono antes do formulário sem alterar a verdade pública ou a atribuição comercial.

## Antes, causa e correção

A medição que originou #185 registrou performance 89, TBT 400 ms, `script.js` com tarefa de 467 ms e cerca de 866 ms em Style & Layout. O runtime público tinha 74.640 bytes sem minificação, agendava flush analítico dentro da janela inicial, instalava trabalho decorativo mesmo quando não havia elementos e fazia o navegador considerar de imediato toda a home longa.

A correção:

- monta e minifica `script.js` deterministicamente a partir dos três módulos-fonte; o artefato caiu para aproximadamente 42 KiB;
- posterga o flush first-party, preservando `visibilitychange`, `pagehide`, `sendBeacon`, `CONFENGE_WEB` e a política sem PII;
- evita idle decorativo vazio e invalidação desnecessária do rodapé;
- aplica `content-visibility` somente às seções abaixo da dobra da home, com tamanho intrínseco de fallback;
- torna Lighthouse, geometria real e auditoria de acessibilidade gates fail-closed em CI.

O resultado versionado em `docs/lighthouse-runs/summary.json` registra três medições mobile com performance 95/95/98, TBT p75 143 ms, tarefa própria máxima 193 ms, accessibility 100, best-practices 100 e SEO 100. O workflow agora repete a home três vezes e abre um processo Chrome novo por medição; qualquer performance abaixo de 95, TBT p75 maior ou igual a 200 ms ou tarefa própria acima de 200 ms falha a PR.

## Cobertura das dez issues

| Issue | Entrega anterior incorporada em `main` | Evidência/gate atual | Situação honesta |
|---|---|---|---|
| #179 | #253, substituindo o patch histórico #189 | 5 viewports, auditorias de proporção/responsividade e varredura de capas raster | acceptance automatizável coberta |
| #180 | duplicata de #179 | mesmos gates de #179 | fechada como duplicata |
| #181 | #194 consolidada por #217 | estrutura, primeira dobra, atribuição e eventos | acceptance automatizável coberta |
| #182 | #200 consolidada por #217 | âncora do formulário, ordem de foco, mobile/desktop e funil | acceptance automatizável coberta |
| #183 | #208 consolidada por #217 | shell global, toque/teclado, taxonomia e analytics sem PII | teste de árvore com ≥80% ainda requer participantes |
| #184 | #213 e prova real segmentada em #222 | axe, equivalência mobile e controles deliberados | teste de 5 segundos e comparação CTR/scroll ainda requerem tráfego/pessoas |
| #185 | #211 consolidada por #217 mais este fechamento | três Lighthouse, thresholds exatos, bundle determinístico, formulário e eventos | coberta pelo gate fail-closed |
| #186 | #214 consolidada por #217 | contraste de token, design gate, axe em superfícies críticas | acceptance automatizável coberta |
| #187 | #216 consolidada por #217 | validação SVG, console/best-practices, nome e alvo de toque | acceptance automatizável coberta; matriz Safari/WebKit continua manual |
| #188 | #215 consolidada por #217 | lint de linguagem interna e orientação por job | compreensão com 5 pessoas e comparação de cliques ainda requerem pesquisa/tráfego |

Não se declara sucesso humano a partir de teste automatizado. #183, #184 e #188 devem permanecer abertas, ou receber checklist residual explícito, até a evidência moderada/observada existir.

## Qualidade, contratos e limites

- `npm test`: verde; a execução inclui contratos de marca, autoridade, analytics, atribuição, formulários, SEO, migração e 70 cenários BOFU congelados.
- Browser real: geometria e fluxos verdes entre 320 e 1920 px; axe sem violações critical/serious em 13 superfícies.
- A baseline BOFU foi recapturada sem mutar os seis HTMLs protegidos.
- Dono de fatos/aquisição: não alterado; nenhum crawler, DataLake ou identidade foi criado. Contratos SELECT-only de `extra-cli` permanecem intactos.
- Ação comercial: `warmbly` continua recebendo o contexto existente; fonte normalizada `CONFENGE_WEB`; nenhum PII novo entra em analytics.
- Superfície canônica: somente `confenge.com.br`; nenhuma marca, CTA, URL ou runtime SmartLic foi introduzido.
- ADR afetado: ADR-STRAT-002, sem mudança de decisão arquitetural.

## Repetição, monitoramento e rollback

Repetir os gates cem vezes melhora o sistema porque detecta regressões em todos os próximos templates e artefatos; não cria cem unidades de revisão manual. A North Star continua sendo oportunidade comercial qualificada, não score, page count ou volume de commits.

Rollback: reverter a PR de fechamento restaura o bundle anterior, o flush e os workflows. As decisões de URL permanecem inalteradas; não há redirect, migração ou nova superfície para desfazer.
