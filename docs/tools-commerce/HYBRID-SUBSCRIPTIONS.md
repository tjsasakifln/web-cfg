# CONFENGE Free e Pro | operação e aceite da PR #899

**Estado:** candidato em revisão, não autorizado para merge, cobrança ou exposição pública. O código, os testes simulados, o ambiente externo e a aprovação comercial são evidências distintas. Os checks precisam corresponder ao HEAD da PR; este documento não substitui o resultado dos checks.

## 1. Contrato comercial aprovado

Free sem mensalidade; uma primeira exportação por conta verificada. Pro mensal R$ 49,90, seis créditos por competência efetivamente paga, não cumulativos, sem fidelidade. Créditos avulsos e promocionais preservam suas regras e os adquiridos não expiram. Carteira única, mesmos pacotes avulsos, Pix/Orders e checkout hospedado existentes, programa de indicação existente. O experimento controlado libera somente operações básicas previamente aprovadas, depois de usada a cortesia inicial, sem gerar franquia geral e sem assinatura vigente. Não há plano anual, empresarial ou ilimitado.

Fonte de ofertas: `runtime/tools-commerce/policy.cjs` (avulsos e regras existentes) e `subscription-policy.cjs` (FREE, PRO imutável e projeção pública). A oferta Pro v1 contém valor em centavos, moeda, quantidade, periodicidade e versão/hash dos termos; a cópia contratada fica no documento da assinatura. Alterações futuras exigem nova versão e preservação dos contratos anteriores. A minuta publicada em /termos-de-uso/#assinatura-ferramentas descreve a regra sem duplicar valores monetários em página jurídica; o preço contratado vem do catálogo. Aprovar a minuta e a política de privacidade antes da ativação.

## 2. Matriz de implementação, testes e evidências

O ponto de partida `fc3e360089f3b2b4ad7817be999fc6a227e43742` falhou. O CI da main base `76968ac9b83bdf5c0d342cd369a682a3d9e50600` estava verde. A comparação não sustenta classificar os defeitos da PR como preexistentes. Evidência histórica: [Site CI inicial](https://github.com/tjsasakifln/web-cfg/actions/runs/45331016030), [pSEO inicial](https://github.com/tjsasakifln/web-cfg/actions/runs/45331015788). No primeiro, passaram 55 unitários e dois testes do emulador, mas o teste de integridade dos módulos compartilhados falhou. O pSEO indicou script.js desatualizado. Também houve preço indevido em família de páginas de confiança e hash de fontes da projeção CSS desatualizado. Falhas de scorecard posteriores não comprovam que os gates omitidos passaram.

Correções: restaurar integralmente o bundle de analytics e seu registro protegido da main, usar eventos existentes e projeções agregadas sem adicionar eventos incompatíveis; manter valor no catálogo e não em página jurídica; revisar todas as classes excluídas da projeção CSS, atualizar os dois hashes de fontes efetivamente alteradas e manter exclusões, CSS e limites dos testes. Não foram reduzidos critérios de qualidade. A revisão dos dois arquivos encontrou zero classes excluídas. O hash dos arquivos de base coincidiu com o manifesto anterior. Consulte a revisão `14ae88b88b90f86ac26801c46c033e28f2e5dfda`.

| Requisito do pedido de correção | Implementação (arquivo e função) | Teste/evidência | Resultado e pendência |
|---|---|---|---|
| 2. Decisões comerciais | policy.cjs; subscription-policy.cjs PRO, FREE, publicPlans; ledger.cjs | subscriptions.test.cjs: offer hidden, terms; core.test.cjs e regressão existente | Modelo preservado; confirmação do HEAD pendente |
| 3. CI / main | proteção do bundle e registry; termos; diagnostic-css-projection.json | logs iniciais acima, revisão de classes/hashes, gates de Site CI/pSEO | Causas primárias tratadas; resultado integral do candidato e preview exigidos |
| 4. Experimento | ledger.cjs account, selectBucket, grantExperiment, quoteExport, completeExport; subscription-policy.cjs configSubscriptions; tool-credits.mjs | firestore-emulator.test.cjs: experimental budget and quote consent; browser_tool_credits.mjs: carteira sem saldo convencional e confirmação alterada | Elegibilidade, mês, reserva e orçamento transacionais; execução final a confirmar; aprovar custos/formatos |
| 5. Calendário | subscription-calendar.cjs periodAt/calendarPeriod; subscription-provider.cjs invoiceFact; subscriptions.cjs observeInvoice | subscriptions.test.cjs: leap years, month ends, year boundary, future/past grants; emulador: paid cycle, duplicate invoice, future grant and reversal | Competência ancorada; ambiguidades ficam em review; ensaiar datas reais, retentativas e cancelamento no MP |
| 6. Consumo explícito | export-consent.cjs issue/verify; http.cjs export-quote; ledger.cjs quoteExport/completeExport; tool-credits.mjs | teste de HMAC vinculado a origem, conta, resultado e expiração; emulador com concorrência, recuperação com nova referência e conflito de digest; browser de reconfirmação | Nova interface confirma a origem; recuperação indexada não cria débito novo; suite final a confirmar. Clientes antigos só aceitos com híbrido desligado e sem benefício híbrido |
| 7. Margem | economics.cjs operations/verifyEvidence/loadEvidence; configSubscriptions; ledger.cjs limites por formato/dia; subscriptions.cjs snapshot econômico por contrato | unitário economic evidence covers every operation and full six-credit worst case, ausências e custo acima do teto | Registro e bloqueio conservadores; não há medições reais de CPU, memória, suporte/tarifa por operação neste candidato. Preencher evidência privada; não certificar margem observada |
| 8. Segurança financeira | subscription-provider.cjs verifyContract/invoiceFact/parseSubscriptionWebhook; subscriptions.cjs start/bind/reconcile/observeInvoice; http.cjs roteamento ORD | unitários de assinatura inválida, vendedor/moeda/ambiente/valor, estorno parcial e disputa; emulador de fatura duplicada/cancelamento; suites Orders/Pix existentes | Sem franquia por autorização, POST ambíguo não repetido; alteração de cartão pelo portal do provedor. Homologação externa e confirmação de casos e estados reais obrigatórias |
| 9. Sweep | subscription-ops.cjs lease/backoff; subscriptions.cjs sweep/health/reconcile; ops.cjs; deploy/netcup/tools-commerce | unitários de paginação acima de 100 faturas e lease/backoff; syntax check | Cursor persistente, fila, timeout de HTTP, tentativa controlada e timer. Validar capacidade, backlog, cancelamento e instalação real |
| 10. Indicadores | hybrid-report.cjs hybridUsage/cohortConversions/repeatedPurchases/experimentOutcomes/aggregateWorkflow/warmblyHandoff | unitário hybrid reporting does not mix account cohorts or turn event views into people | Relatório e handoff somente leitura implementados; fluxo consentido externo opcional; visitantes únicos, margem real e recebimentos bancários desconhecidos. Não é integração automática com Warmbly |
| 11. UI/UX/SEO | assets/js/tool-credits.mjs e showcase.mjs; URLs e CSS existentes | browser_tool_credits.mjs e gates site/pSEO/acessibilidade | Origem, saldo, validade, futuro, contratação e cancelamento expostos conforme estado. Chrome/viewport na suíte; não foi atestado Android/iOS físico, leitor de tela ou checkout real |
| 12. Termos e versões | subscription-terms.cjs, subscription-policy.cjs, termos-de-uso e privacidade; subscriptions.cjs start | unitário terms byte-bound | Aceite vinculado ao hash e oferta; aprovar minuta e readback de publicação |
| 13. Cobertura | tests/tools-commerce/subscriptions.test.cjs, firestore-emulator.test.cjs, browser_tool_credits.mjs e suites anteriores | [checks da PR](https://github.com/tjsasakifln/web-cfg/pull/899/checks) | Testes novos não contam como aprovados sem execução do SHA correspondente |
| 14. Roteiro MP | seções 3-7, README existente, scripts de deploy e ops | comandos documentados e testes simulados | instalar/configurar em HML com autorização; não usar credenciais no Git |
| 15. Revisão | revisão adversarial do código, invariantes, gates e regressões documentadas | commits e logs vinculados à PR | Não alegar revisão independente de subagente; obter revisão independente antes de ativar |
| 16. Encerramento | PR draft; flags novas off por padrão | HEAD + base e checks, comentário Netlify | Exige todos os checks, preview funcional e revisão; merge/ativação não autorizados |
| 17. Entrega | este documento, descrição PR e CODEX-HOMOLOGATION.md | links e SHA da descrição da PR | evidência dinâmica deve ser conferida no GitHub para o HEAD atual |

O teste de browser no viewport de 390 px utiliza provedor simulado; não constitui teste de dispositivo Android/iOS. A disponibilidade real do meio de pagamento, valores liberados, cancelamento confirmado e garantia de data de renovação só podem ser aferidos com a aplicação autorizada. Não confundir a aprovação de um commit anterior com aprovação do candidato.

## 3. Mercado Pago: modalidade e contrato da API

Utilizar assinatura **sem plano associado, com pagamento pendente**, conforme documentação oficial. Não criar um plano remoto por usuário, não usar link público genérico e não recolher número do cartão. `POST /preapproval` inclui external_reference exclusiva, payer_email, back_url, status pending e auto_recurring mensal em BRL. O init_point individual precisa conter o identificador do preapproval, em host HTTPS oficial validado. Se a resposta de criação for ambígua, persistir referência local e pesquisar pelo identificador, nunca repetir o POST cegamente.

Consultas: `GET /preapproval/{id}`, `GET /preapproval/search?external_reference=...`, `GET /authorized_payments/{id}`, `GET /authorized_payments/search?preapproval_id=...` com paginação, `GET /v1/payments/{id}`. Pesquisa por payment_id é auxiliar e deve ser corroborada pelo id da fatura e do pagamento; o sweep independe da entrega de webhooks. Cancelamento `PUT /preapproval/{id}` status cancelled, seguido de GET e confirmação. Alteração de cartão: orientar o assinante a alterar o meio de pagamento em Assinaturas no próprio Mercado Pago, não coletar cartão na CONFENGE.

O runtime exige vendedor, aplicação, oferta, periodicidade, moeda, valor, referência e vínculo da fatura/pagamento; ambiente real é verificado no pagamento. A concessão só ocorre após confirmação de pagamento acreditado, com período demonstrado e não estornado. A competência usa auto_recurring.start_date e data de débito coerente com o calendário contratual, não date_created nem date_approved. Competência originalmente comprovada fica imutável; primeiro registro de retentativa ambígua fica em review. Confirmar no sandbox e com as regras da aplicação se start_date, debit_date, retry_attempt e estados são retornados conforme a hipótese. Qualquer lacuna mantém a ativação bloqueada; não conceder por suposição, nem repetir cobrança para resolver divergência. Períodos futuros não substituem o atual. Reversão afeta o lote correspondente; parcial ou disputa permanece em revisão. Cobranças adicionais de fatura já concedida são registradas como exceção financeira sem novo benefício.

Documentação oficial:
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-authorized-payment/get
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/authorized-payment-search/get

## 4. Configuração privada por ambiente

Seguir README.md para Firebase HML/produção, ADC, HMAC, contas verificadas e IDs de vendedor. Confirmar se a aplicação institucional existente autoriza ambos os produtos; separar dados e credenciais de teste e produção. Não copiar segredos para relatórios ou logs. Usar HTTPS HML para retorno de assinatura. O preview Netlify não deve apontar para recursos reais de cobrança.

Em /etc/confenge-web/runtime.env, preservar as chaves existentes de Orders e Pix; adicionar:
- TOOLS_COMMERCE_PRO_INTEGRATION=0 até configuração do fluxo; manter 1 enquanto houver contratos vivos, mesmo com novas vendas desligadas.
- TOOLS_COMMERCE_PRO_MP_APPLICATION_ID: identificador confirmado no provedor.
- TOOLS_COMMERCE_PRO_READY=0 até aprovação.
- TOOLS_COMMERCE_PRO_TERMS_APPROVED=ferramentas-pro-v1 somente após aprovação humana.
- TOOLS_COMMERCE_PRO_TERMS_HASH: hash do conteúdo exato aprovado, conferir com `node -e "console.log(require('./runtime/tools-commerce/subscription-terms.cjs').termsHash)"`.
- TOOLS_COMMERCE_PRO_HOMOLOGATED=0; TOOLS_COMMERCE_PRO_CALENDAR_VERIFIED=0.
- TOOLS_COMMERCE_PRO_MAX_VARIABLE_CENTS: teto conservador aprovado, máximo 1497.
- TOOLS_COMMERCE_ECONOMICS_FILE: arquivo privado regular em /etc/confenge-web/, sem escrita de grupo/terceiros, até 1 MiB.
- TOOLS_COMMERCE_ECONOMICS_SHA256: SHA-256 dos bytes da evidência, aprovado pelo operador.
- TOOLS_COMMERCE_PRO_NEW=0; TOOLS_COMMERCE_PRO_PUBLIC=0.
- TOOLS_COMMERCE_EXPERIMENT=0; TOOLS_COMMERCE_EXPERIMENT_UNIT_COST_CENTS: custo conservador positivo e comprovado de uma operação elegível.
- TOOLS_COMMERCE_EXPORT_CONSENT=1 somente após verificar compatibilidade dos clientes antigos; a integração e o experimento exigem consentimento no servidor mesmo sem essa flag.
- TOOLS_COMMERCE_ANALYTICS_AGGREGATE: caminho privado opcional do agregado consentido. Sem arquivo, métrica de eventos permanece nula.

Webhook HML: https://<host-hml-autorizado>/api/web/tool-credits-webhook; produção: https://confenge.com.br/api/web/tool-credits-webhook. Configurar segredo próprio do ambiente; eventos subscription_preapproval, subscription_authorized_payment, payment e notificações de disputa pertinentes. Preservar Orders. A assinatura criptográfica do evento é verificada e fatos financeiros são consultados na API com credenciais privadas; não confiar no corpo da notificação.

## 5. Margem e experimentação

`economics-catalog` enumera a operação/formato. Preencher todas as operações em economics-evidence.example.json, com upperVariableCents, basis (observed ou conservative_estimate), sourceRef, cpuMs, peakMemoryBytes, storageBytes, transferBytes, externalApiCents, maxPayloadBytes, maxDailyExports; marcar experimentalApproved apenas após revisão. Para custos do ciclo, preencher taxas de cartão recorrente, tributos, provisão de estornos, suporte e infraestrutura variável, com origem e limite superior. Identificar evidência/operador/data (até 90 dias). Limite: seis vezes o maior custo elegível + custos do ciclo <= 30% de R$ 49,90. Não usar média nem simular custos desconhecidos como zero. Valores ausentes impedem ativação. Não publicar dados privados.

O piloto tem máximo de 50 contas de tratamento e reserva incremental mensal de 10000 centavos, operação elegível aprovada e custo <= limite experimental. Grupo estável, orçamento transacional, reserva preservada após desligamento. Não retirar benefício concedido. A autorização HMAC vincula conta, resultado, operação, origem e janela de validade. A transação revalida a seleção, sem substituição silenciosa por crédito comprado. Recuperação do mesmo artefato não gera débito. Os limites novos não reduzem retroativamente créditos comprados.

## 6. Instalação e operação

Comandos no runtime autorizado, em release validado, com variáveis privadas e acesso ADC:

```sh
node runtime/tools-commerce/ops.cjs economics-catalog
node runtime/tools-commerce/ops.cjs subscriptions-sweep
node runtime/tools-commerce/ops.cjs subscriptions-health
node runtime/tools-commerce/ops.cjs subscription-reconcile UUID_DO_CONTRATO
node runtime/tools-commerce/ops.cjs hybrid-usage 2026-11-01 2026-12-01
node runtime/tools-commerce/ops.cjs hybrid-financial-handoff 2026-11-01 2026-12-01
```

Com autorização de infraestrutura, conferir usuário confenge-deploy, grupo confenge-web, release /opt/confenge-web/current, Node no PATH do serviço, credenciais ADC legíveis e ambiente. A instalação não inicia a cobrança:

```sh
sudo bash deploy/netcup/tools-commerce/install.sh
sudo systemctl cat confenge-tools-subscriptions.service
# Após configuração externa autorizada:
sudo systemctl enable --now confenge-tools-subscriptions.timer
sudo systemctl list-timers confenge-tools-subscriptions.timer
sudo journalctl -u confenge-tools-subscriptions.service
```

Timer a cada cinco minutos, flock local, lease Firestore distribuído, HTTP com timeout, sweep com orçamento de execução, cursor de faturas, fila de eventos e backoff. Falha de execução aciona logger user.alert; integrar esse sinal ao canal operacional autorizado. Health verifica último sucesso, idade de evento pendente e contrato vencido. Inspecionar exceções e histórico por referência, sem repetir POST ou liberar créditos manualmente sem prova. Conferir índices reais, volume, tempo de processamento e SLA de cancelamento; não escalar acima da capacidade observada. O relatório piloto ainda consulta contas/contratos do ambiente; antes de escalar, medir custos e migrar para agregados incrementais.

## 7. Medição, aceite e reversão

Períodos com início inclusivo e fim exclusivo, datas de São Paulo, até 31 dias. Cadastro e ativação por conta: cadastrados no período com exportação efetiva no intervalo / cadastrados no período. Conversão por conta: compradores/assinantes que pertencem à mesma coorte de cadastro. Recompra: >=2 compras avulsas pagas no intervalo / compradores avulsos no intervalo. Retenção 7/30: somente coorte madura que exportou nas primeiras 24h, retorno com exportação no dia 7/30, denominador e janela declarados. MRR: retrato de assinaturas autorizadas com ciclo pago vigente; não soma avulsos nem meras autorizações. Receita bruta de pagamentos por modalidade; valores líquidos liberados no MP não são recebimento bancário. Reversões observadas no intervalo registram montante acumulado por fatura, não fluxo líquido. Cancelamento e inadimplência usam estados/tempo explícitos. Por ferramenta, contagem de emissões por origem. A/B: coorte atribuída no período, compradores e bruto por conta atribuída, diferença descritiva (não causal) e sem inferir contribuição incremental sem custos/follow-up equivalentes.

Opcional: agregado consentido dos eventos existentes, JSON com from, toExclusive, rows [{tool_id,step,count}]; step em view, started, ready, failed, edited, exported. Não contar eventos como pessoas. Não correlacionar IDs de contas com visitantes sem base/consentimento. Visitantes únicos, conversão de visitantes, receita por visitante, margem observada e recebimento bancário seguem desconhecidos até fonte compatível. Handoff financeiro tem chaves idempotentes estáveis, faturas, pagamentos, estados, reversões e exceções; é exportação privada de conciliação, não endpoint de ingestão nem escrituração. Warmbly permanece dono financeiro: validar contrato de importação, competência, faturamento, taxas e recebimentos no fluxo existente sem duplicidade. Não contabilizar duas vezes.

### Aceite externo

Em HML segregado: testar criação/recuperação de resposta ambígua, webhook válido/inválido/repetido/fora de ordem, compra Orders Pix e checkout, primeiro ciclo, tentativa recusada, atraso, pagamento antecipado/futuro, mês 28/29/30/31, mudança de ano, troca de cartão no provedor, conta desativada, cancelamento pendente/confirmado, pagamento depois do cancelamento, estorno parcial/total e disputa. Comparar GETs reais (respostas sanitizadas) a lançamentos Firestore, incluindo os casos em review. Não forjar relógio externo para simular homologação. Testar retomada, login e teclado, narrow/mobile, contraste/leitor de tela, Android/iOS reais quando disponíveis. Aprovar termos, atendimento, custos, margem e registro de recebimento. 

Com todos os checks do HEAD verdes, preview funcional e autorização humana específica, publicar inicialmente com PRO_NEW=0, PRO_PUBLIC=0, EXPERIMENT=0. Conferir release e configuração, webhook, timer, saúde, carteira, Pix e checkout. Ativar contratação/visibilidade apenas mediante confirmação formal das demais chaves e evidências. Para rollback comercial, desligar PRO_NEW, PRO_PUBLIC e EXPERIMENT; preservar reservas, contratos e saldos. Não desligar integração, conciliação ou cancelar contratos unilateralmente. Não retornar para release incapaz de gerir assinaturas vivas.

Ver [prompt residual](CODEX-HOMOLOGATION.md).
