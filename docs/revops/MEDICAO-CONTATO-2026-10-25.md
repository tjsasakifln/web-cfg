# Medição e contato nas páginas prioritárias

Decisão: EXECUTE_NOW. Frente: INBOUND ENGINE. Hipótese: explicar o trabalho contratável e manter o contexto entre artigo, serviço e pedido reduz obstáculos ao contato. Alavancas: distribuição, confiança e receita. Evidência técnica nesta entrega; leitura comercial após uma janela de 28 dias, sem inferir causalidade com poucos contatos. Repetir a jornada usa os mesmos contratos e a mesma carteira, sem criar cadastros ou tarefas administrativas paralelas.

## Referência inicial

Dados fornecidos pelo usuário, levantados em 24/10/2026 no Search Console de `sc-domain:confenge.com.br`. Comparação histórica de 28 dias: 28/08–24/09 versus 25/09–22/10/2026. Não são uma nova consulta, nem contagem de compradores ou receita.

| Indicador | Anterior | Recente |
| --- | ---: | ---: |
| Cliques Google | 73 | 83 |
| Impressões | 1.105 | 1.684 |
| CTR | 6,61% | 4,93% |
| Cliques na página inicial | 43 | 24 |
| Cliques nas demais páginas | 30 | 59 |
| Cliques em `/conteudos/` | 17 | 42 |

| Página | Cliques anteriores | Cliques recentes | Impressões recentes |
| --- | ---: | ---: | ---: |
| `/conteudos/aditivo-empreitada-por-preco-global/` | 4 | 16 | 143 |
| `/conteudos/mobilizacao-desmobilizacao-orcamento-obra/` | 0 | 8 | 137 |
| `/conteudos/bdi-diferenciado-obra-publica/` | 3 | 7 | 125 |
| `/medicoes-glosas-obras-publicas/` | 2 | 6 | 231 |
| `/conteudos/sinapi-desonerado-nao-desonerado/` | 3 | 2 | 278 |

As quatro primeiras somaram 37 de 83 cliques. Computadores: 71 de 83. Houve 25 cliques somente em 21 e 22/10. Amostra pequena e concentrada; não demonstra crescimento sustentado, intenção de compra ou retorno financeiro.

## Ambiente e destino dos dados

Base: `92f7087cea0589f1e4828576ea264cc64843925d`, `origin/main` e versão pública conferida em 25/10. Trabalho em `codex/conversao-medicao-20261025`, em checkout isolado. Arquitetura preservada: Cloudflare → nginx/Netcup → Node 22. HTML e `script.js` publicados são produtos das fontes e geradores do repositório.

O navegador envia eventos a `/api/web/collect`. O runtime declara armazenamento filesystem em `/var/lib/confenge-web`, namespace `analytics-events`. Pedidos seguem `/api/web/lead` → validação e consentimento → namespace `leads` → confirmação com `lead_id`/`receipt_id` → transporte existente para o proprietário comercial. `ops-system` guarda estados operacionais. O código de funções em `netlify/functions/` é executado pelo runtime Netcup, não prova hospedagem Netlify.

O identificador interno correlaciona captura e recebimento no Warmbly. A origem registrada inclui primeira página, página do contato, serviço e campos de atribuição disponíveis; a ausência de um dado continua ausência. Usar `landing_page`, `landing_url`, `origem`, `tema`, `source_origin_asset_id`, `source_origin_route_family`, `route_family`, `asset_id`, `cta_id` e campos correspondentes presentes no registro. Mensagens, contatos e documentos não pertencem aos eventos analíticos.

Consultas agregadas já existentes, com credencial operacional autorizada:

- `GET /api/web/ops?action=analytics_summary`
- `GET /api/web/ops?action=weekly_report`
- `GET /api/web/ops?action=system_health`

Não havia token Ops nem acesso SSH utilizável nos acessos locais relacionados examinados. Portanto, registros históricos recuperáveis, contagens reais/testes e falhas de entrega em produção não foram inspecionados nem reconstruídos. A declaração pública de filesystem confirma o backend, mas não substitui uma consulta aos registros. `/healthz` respondeu 200. `/ready` também respondeu 200; esse endpoint executa seu próprio teste transitório de escrita/leitura/exclusão, não cria contato comercial e não é uma consulta estritamente de leitura.

## Google Analytics

Windsor.ai consultado em 25/10: única conta GA4 disponível `vision-etp-express`, propriedade `494051528`. Consulta de hostname, stream_id, stream_name, event_name e event_count entre 28/08 e 24/10 retornou zero linhas. Nenhum fluxo web ou identificador `G-...` foi confirmado. Isso não comprova ausência de visitantes, nem vínculo incorreto da propriedade.

A decisão existente `data/ops/third-party-conversion-decision.v1.json` está em `DEFER`, com exportação de navegador e servidor desabilitada e sem contrato de consentimento externo implementado. A entrega mantém a coleta própria e impede que a simples existência de `window.gtag` ou `window.plausible` dispare exportação. Não instala outra tag, propriedade ou fluxo.

Para concluir a ligação Google, é necessário acesso à configuração da propriedade e dos fluxos para confirmar domínio e identificador de coleta, além de compatibilizar a implantação com o consentimento vigente. Sem esses elementos, não há como comprovar recebimento no Google.

## Leitura comercial na rotina existente

Rota principal: artigo de aditivo em preço global → contato efetivamente persistido → oportunidade qualificada no Warmbly → proposta, contrato, faturamento e recebimento conforme evidências próprias. Conferir primeira página e serviço no pedido e usar o mesmo identificador no recebimento comercial. Não transformar visita, clique, início de formulário, tentativa de envio ou sucesso de navegador em oportunidade qualificada.

As definições e o consumidor existentes estão em `docs/revops/CLOSED-LOOP.md` e `docs/ops/WARMBLY-INBOUND.md`. O estado comercial continua desconhecido quando não há observação do proprietário comercial. Não foi criado painel, CRM, cadastro ou agendamento adicional.

## Páginas e correções

- Aditivo em preço global: o próximo passo existente foi movido para depois da resposta inicial, com trabalho, entrega técnica e informações úteis para começar. Os destinos mantêm artigo e serviço no contexto.
- Mobilização e desmobilização: contato voltado à revisão das rubricas de mobilização, desmobilização e canteiro, preservando o assunto no formulário de auditoria de orçamento.
- BDI diferenciado: revisão das famílias de custo, incidências e memória do orçamento; o contato segue para o serviço pertinente com o contexto do artigo.
- Medições e glosas: o formulário aproveita o contexto da própria página e esclarece que documentos completos podem ser enviados depois. O pedido inicial não promete análise já contratada, decisão do órgão ou recebimento financeiro.
- SINAPI desonerado/não desonerado: título, descrição, abertura e destino foram revistos. A versão base já atendia ao recorte solicitado, por isso o conteúdo foi preservado.

Na captura, submit simultâneo é bloqueado; resposta sem recibo, falha de rede e 5xx não produzem confirmação falsa. A página de agradecimento não emite outro sucesso por simples visita. A repetição do mesmo pedido preserva a chave de idempotência; edição de campos materiais cria nova chave. Com armazenamento de sessão bloqueado, essa proteção funciona enquanto o mesmo formulário permanece aberto; não sobrevive ao recarregamento da página após uma resposta indeterminada.

Na medição, valores pessoais detectáveis em endereços e parâmetros são filtrados no navegador e no servidor, inclusive após decodificação; não há encaminhamento automático a `gtag`/Plausible. Falhas temporárias de envio recebem até três novas tentativas com o mesmo identificador de evento, em fila limitada a 100 itens. Não se presume entrega após fechamento da página. O coletor legado de Blobs também passa a responder falha quando a gravação falha, em vez de aceitar falsamente um evento sem identificador. O backend filesystem vigente já tinha essa proteção. O log do encaminhamento adicional deixa de incluir trecho de e-mail.

A revisão encontrou uma dívida anterior no encaminhamento adicional de monitoramentos `CONFENGE_WEB_INTENT/1.0`: consentimento/contexto do caller e persistência de novas tentativas precisam de correção própria. As cinco páginas deste recorte não usam esse caminho. O transporte principal `confenge.inbound.v1` conserva sua fila e repetição; não se afirma aqui que o recurso separado de monitoramento foi corrigido ou validado de ponta a ponta.

## Validação, publicação e reversão

Testes do backend executados em Linux/WSL com Node 22.23.4, armazenamento temporário e integrações substituídas:

- `npm run test:lead-function`: passou, com 119 verificações principais e suítes de probes, intake e prontidão.
- `npm run test:inbound-handoff`: 34 verificações passaram, incluindo persistência anterior ao encaminhamento, repetição sem segundo POST, falha temporária, timeout e rejeição de autorização.
- `npm run test:lead-store-production`: passou, incluindo 64 operações concorrentes, migração e snapshots no backend filesystem.
- `npm run test:workflow-gates`: 18 verificações passaram em Linux. O fixture de shell não é portável ao Windows.

Validação final com Node 22.23.4:

- `npm run build:site`: passou; 624 arquivos no pacote público, auditoria sem achados e sem erros de compilação.
- `npm run test:analytics`: passou, incluindo política externa, PII/PII codificada, contrato de eventos, atribuição e recuperação de lotes pendentes.
- `npm run test:form-funnel`: passou, incluindo envio simultâneo, falha indeterminada e repetição com armazenamento de sessão bloqueado.
- `npm run test:priority-pages`: 4 testes passaram.
- `npm run test:priority-contact`: passou em Chrome, nas cinco páginas a 390 e 1440 px. A jornada artigo → formulário → handlers reais confirmou validação, contexto, persistência, resposta perdida, reenvio com o mesmo recibo, ausência de duplicação e recebimento no coletor isolado. Foram duas requisições de contato para um registro e 14 lotes analíticos observados, sem PII do formulário nem erros JavaScript.
- `npm run test:secrets-scan`: passou, 439 arquivos examinados; `git diff --check` sem erros.

As telas iniciais e os trechos de contato foram inspecionados em celular e computador. URLs, títulos, descrições, canônicas e links internos foram conferidos; não houve mudança de endereço ou redirecionamento. A revisão crítica final encerrou o achado de PII com dupla codificação após correção e teste.

Testes com armazenamento isolado e serviços substitutos comprovam a implementação local; não comprovam ingestão GA4 ou transporte de produção. A jornada de navegador bloqueia rede externa e usa substituto de memória no Windows; a persistência filesystem é verificada separadamente em Linux. A CI remota é informada no PR e não é presumida aprovada por estes testes locais.

Não houve publicação nesta entrega. A `main` dispara o processo de release Netcup; a integração depende da aprovação final prevista no pedido do usuário. Também permanecem pendentes o acesso operacional para consultar registros históricos e a identificação autorizada do fluxo web Google. Não houve contatos fictícios, notificações ou mensagens reais enviados à produção.

Para reverter antes da publicação, descartar a ramificação de trabalho sem tocar a `main` ou o checkout anterior. Depois de publicação autorizada, usar o procedimento de rollback por SHA em `docs/ops/ROLLBACK.md` e `deploy/netcup/README.md`, apontando para a release anterior verificada. A reversão de arquivos não deve apagar ou reescrever `/var/lib/confenge-web`.

ADRs aplicáveis: ADR-STRAT-002, ADR-STRAT-004 e RUNTIME-AUTHORITY. Não há mudança de proprietário, plataforma, identidade ou superfície pública.
