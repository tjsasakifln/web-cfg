# Operação do marketplace de engenharia

## Estado desta entrega

Este documento descreve o provisionamento de um novo serviço privado no Netcup. A publicação do site pode entregar a página `/profissionais/` e os handlers do gateway, mas o workflow atual de `web-cfg` **não instala Docker, não cria PostgreSQL/Redis, não executa migrações e não configura Stripe**. O acesso de release existente não confere essas permissões de administração do host. Até concluir o procedimento abaixo, o gateway permanece `off` e a página encaminha a demanda à CONFENGE sem registrar cadastros, contratações ou pagamentos fictícios.

O código e as instruções são entregues para execução pelo operador com acesso ao host e à conta Stripe. Build de imagem, inicialização real dos containers, restauração e transação externa precisam de evidência própria; testes unitários não substituem essas etapas.

## Serviços e fronteiras

| Componente | Execução | Persistência e acesso |
| --- | --- | --- |
| Página e gateway CONFENGE | Runtime existente `confenge-web-runtime.service` | Única superfície pública em `https://confenge.com.br`; configuração em `/etc/confenge-web/runtime.env` |
| API Mercur 2.4.1 / Medusa 2.22.3 | Imagem da aplicação com Node 22.22.2, modo `server` | Publicada somente em `127.0.0.1:19050`; sem painel administrativo público |
| Worker Mercur | A mesma imagem, modo `worker` | Eventos, filas e trabalhos; sem porta publicada no host |
| PostgreSQL 17.11 | `postgres:17.11-bookworm` | Volume `confenge-engineering-marketplace_postgres_data`; usuário da aplicação sem superusuário |
| Redis 7.2.17 | `redis:7.2.17-bookworm` | Volume `confenge-engineering-marketplace_redis_data`, senha, AOF e `noeviction`; sem porta publicada |

API e worker compartilham PostgreSQL, Redis e chaves de autenticação. A rede `data` é interna; apenas API e worker também entram na rede com saída para Stripe. Não configurar proxy nginx direto para `/store`, `/vendor`, `/auth`, `/admin` ou a porta 19050. Todas as ações do navegador passam pela allowlist do gateway e pelo cabeçalho privado `x-confenge-gateway-key`. Documentos de entrega usam referência externa indicada pelo profissional; não há serviço de upload nesta versão.

O Compose reserva limites de 2 GiB para API, 2 GiB para worker, 1 GiB para PostgreSQL e 768 MiB para Redis. O operador deve verificar a capacidade livre além dos serviços já presentes. O guia oficial do Mercur orienta separar server e worker e prever pelo menos 2 GB por instância. As versões das imagens são fixas nesta receita; registrar também seus digests no relatório de implantação e revisar correções de segurança antes da ativação. Fontes: [guia de self hosting da tag 2.4.1](https://github.com/mercurjs/mercur/blob/v2.4.1/apps/docs/resources/deployment/self-host.mdx), [imagem Node 22.22.2](https://hub.docker.com/layers/library/node/22.22.2-bookworm-slim/), [imagens oficiais PostgreSQL](https://github.com/docker-library/official-images/blob/master/library/postgres) e [Redis](https://github.com/docker-library/official-images/blob/master/library/redis).

## 1. Produzir a imagem fora do host público

Usar um checkout limpo do SHA da PR aprovada, Docker com BuildKit e o lockfile versionado da aplicação. O Dockerfile instala com `npm ci --engine-strict --ignore-scripts --legacy-peer-deps`, compatível com a instalação que produziu o lockfile, e executa o build autorizado pelo wrapper depois. O runtime desta aplicação usa Node 22.22.2 porque o lockfile contém dependências com requisito superior ao mínimo histórico 22.22.0 do Mercur. A validação estrita de engines permanece habilitada. O build não recebe credenciais da implantação. Não executar `npm install` no diretório de release do site nem transformar o workflow estático em provisionador do banco.

```sh
docker build \
  --tag REGISTRY/confenge-engineering:FULL_COMMIT_SHA \
  --label org.opencontainers.image.revision=FULL_COMMIT_SHA \
  apps/engineering-marketplace
```

Publicar a imagem no registro autorizado ou transferir um arquivo de imagem verificado pelo operador. Registrar o SHA do código, digest da imagem e saída dos testes. Usar `REGISTRY/confenge-engineering@sha256:DIGEST` em produção, sem `latest`. O estágio final contém o servidor compilado, os recursos CJS/JSON e dependências de produção; não contém `.env`, fontes de teste, páginas de demonstração ou credenciais de build.

Antes de promover, confirmar que a imagem executa `node scripts/medusa.cjs db:migrate` e `node scripts/medusa.cjs exec ./src/scripts/setup.js` em um ambiente isolado. O `npm run seed` do checkout de desenvolvimento aponta para o arquivo TypeScript; no container compilado, o comando usa `.js`. O entrypoint do container aplica esse wrapper a todos os comandos abaixo, desativa a preferência persistida de telemetria antes de carregar a CLI e verifica o estado resultante. Manter `MEDUSA_DISABLE_TELEMETRY=true` e `MERCUR_DISABLE_TELEMETRY=true`; não contornar o wrapper chamando `npx medusa` ou o binário direto.

## 2. Provisionar configuração privada

O operador precisa de Docker Engine e Compose v2 com suporte a `depends_on.condition`, `init` e limites de memória. Instalar conforme o procedimento aprovado do host. Copiar o diretório `deploy/netcup/marketplace/` do mesmo SHA para `/opt/confenge-marketplace/releases/FULL_COMMIT_SHA/deploy/`. Guardar o SHA anterior; nunca editar arquivos de um release em uso.

Executar a geração uma única vez, fora do repositório:

```sh
sudo install -d -m 0700 /etc/confenge-marketplace
sudo python3 /opt/confenge-marketplace/releases/FULL_COMMIT_SHA/deploy/init-config.py \
  --directory /etc/confenge-marketplace \
  --image REGISTRY/confenge-engineering@sha256:DIGEST
```

O gerador exige um digest real, cria três arquivos com modo `0600`, recusa sobrescrever arquivos existentes e informa apenas os nomes dos arquivos. PostgreSQL administrativo, PostgreSQL da aplicação, Redis, JWT, cookie Mercur e sessão do gateway recebem valores independentes. A chave gateway é a mesma nos dois lados por necessidade do protocolo. O banco é criado com `marketplace` como proprietário, sem `SUPERUSER`, `CREATEDB` ou `CREATEROLE`.

| Arquivo privado | Conteúdo |
| --- | --- |
| `/etc/confenge-marketplace/compose.env` | Digest da aplicação, caminho da configuração backend e senhas de PostgreSQL/Redis |
| `/etc/confenge-marketplace/runtime.env` | URLs privadas dos bancos, JWT/cookie, chave do gateway, configuração Stripe e comissão |
| `/etc/confenge-marketplace/gateway.env` | Entradas a incorporar ao ambiente existente do runtime web; inicia com marketplace desligado |

Não publicar `docker compose config`, `docker inspect`, variáveis de ambiente ou conteúdo desses arquivos em logs de CI, tickets ou chat. Para validar o Compose sem imprimir os valores, usar `./marketplacectl config --quiet`. O wrapper aceita `MARKETPLACE_COMPOSE_ENV` apenas para operação local; no host o padrão é `/etc/confenge-marketplace/compose.env`.

## 3. Migrar e preparar os registros técnicos

No diretório privado do release:

```sh
sudo ./marketplacectl config --quiet
sudo ./marketplacectl pull
sudo ./marketplacectl up -d --wait postgres redis
sudo ./marketplacectl run --rm tools db:migrate
sudo ./marketplacectl run --rm tools exec ./src/scripts/setup.js
```

As migrações executam **uma vez, antes de API e worker**. Não colocar `db:migrate` em cada partida de container. O comando `setup` deve ser repetível: prepara loja/moeda BRL, canal dedicado e chave publicável vinculada ao canal, sem catálogo de calçados, avaliações, prestadores ou clientes de demonstração. Copiar a chave `pk_` emitida para `ENGINEERING_MARKETPLACE_PUBLISHABLE_KEY` no gateway e para `MARKETPLACE_READINESS_PUBLISHABLE_KEY` no backend.

Incorporar as entradas de `gateway.env` ao arquivo existente `/etc/confenge-web/runtime.env`, mantendo sua propriedade e modo `0640` aprovados pelo runtime web. Não substituir o restante do ambiente. O serviço web já recebe `RUNTIME_PROFILE=netcup-production` do launcher. Manter `ENGINEERING_MARKETPLACE_MODE=off` durante preparação.

```sh
sudo ./marketplacectl up -d --wait api worker
sudo ./marketplacectl exec -T api node < ready.cjs
```

O healthcheck dos containers verifica apenas se o processo HTTP responde a `/health`. O comando `ready.cjs` autentica o contrato privado `/store/engineering/config`, que consulta a tabela de solicitações. Ele comprova API, migração e acesso ao PostgreSQL; o processamento efetivo do worker deve ser conferido com evento assinado no ensaio de integração. Falha no probe bloqueia a ativação.

O gateway exige backend em HTTP loopback, chave `pk_`, chave privada ASCII de 32 a 256 caracteres e chave de sessão base64url canônica de 32 bytes. O gerador entrega os formatos corretos. As chaves JWT/cookie devem ser estáveis entre API e worker e sobreviver ao rollback. Uma rotação deliberada encerra sessões e deve ser registrada.

Após a conferência profissional, executar o comando privado de revisão com os valores fornecidos pelo operador. O exemplo abaixo é um modelo: substituir ID, operador e referência por registros reais antes de executar. A decisão `withdraw` suspende um perfil anteriormente publicado.

```sh
sudo ./marketplacectl run --rm \
  -e MARKETPLACE_REVIEW_SELLER_ID=sel_ID_REAL \
  -e MARKETPLACE_REVIEW_DECISION=approve \
  -e MARKETPLACE_REVIEW_OPERATOR=OPERADOR_IDENTIFICADO \
  -e MARKETPLACE_REVIEW_EVIDENCE=REFERENCIA_PRIVADA_DA_CONFERENCIA \
  tools exec ./src/scripts/review-provider.js
```

O comando valida os campos e o aceite dos termos, registra operador, referência e instante, e altera `engineering_verified`/status. A referência de evidência fica na metadata privada; ela precisa corresponder à verificação humana efetivamente realizada, não a um texto genérico de aprovação.

## 4. Configurar Stripe e condições comerciais

Preencher no backend, primeiro com a conta de testes:

| Variável | Valor esperado |
| --- | --- |
| `MARKETPLACE_PAYMENT_MODE` | `test` no ensaio isolado, `live` na operação real |
| `STRIPE_SECRET_KEY` | Chave `sk_test_…` ou `sk_live_…` compatível com o modo |
| `STRIPE_OPERATOR_WEBHOOK_SECRET` | Segredo do endpoint de eventos da plataforma |
| `STRIPE_SELLERS_WEBHOOK_SECRET` | Segredo distinto do endpoint de contas conectadas |
| `MARKETPLACE_COMMISSION_BPS` | Inteiro aprovado entre 0 e 5000; 1000 significa 10%; omitir até a decisão comercial |
| `MARKETPLACE_PAYMENTS_ENABLED` | `false` até o ensaio; `true` somente no ambiente testado e liberado |

Copiar o valor de `STRIPE_SELLERS_WEBHOOK_SECRET` também para `ENGINEERING_MARKETPLACE_CONNECT_WEBHOOK_SECRET` no runtime web. Este é o único segredo de Stripe usado pelo gateway. A chave secreta de API e o segredo de cobrança permanecem no backend. Configurar os endpoints públicos reais:

| Endpoint público | Destino privado fixo | Uso |
| --- | --- | --- |
| `https://confenge.com.br/api/web/engineering-marketplace-webhook` | `/hooks/engineering-stripe` | Eventos de cobrança da plataforma; confirmação financeira pelo backend |
| `https://confenge.com.br/api/web/engineering-marketplace-connect-webhook` | `/hooks/payout` | Eventos de contas conectadas; atualização nativa dos requisitos de recebimento |

Habilitar os eventos descritos em [payments.md](payments.md) para a implementação desta versão. Os dois endpoints recebem POST com corpo original e `Stripe-Signature`; não usar URL com query, cabeçalhos de sessão do navegador ou uma rota `/hooks` pública genérica. O relay Connect verifica HMAC e tolerância temporal de 5 minutos antes de enfileirar. O relay de cobrança devolve sucesso apenas se o backend confirmar recebimento. O relógio do host deve estar sincronizado.

O provider nativo configura país BR e `manualPayouts=false`. As transferências, reversões e liquidações automáticas do fluxo de pedidos de comércio foram desativadas porque a contratação de engenharia cria uma cobrança com destination charge própria. A captura nativa trabalha com payment collections do comércio, que não são criadas para `engineering_request`. Não reabilitar esses fluxos: isso pode duplicar movimentos financeiros. A disponibilidade de cadastro, cobrança e recebimento depende da conta Stripe e da habilitação do prestador; o código não comprova elegibilidade comercial no Brasil. O cliente aceita a revisão exata da proposta, e a comissão informada ao profissional fica congelada nela. Mudança de taxa exige nova proposta.

## 5. Aceitação antes da primeira transação

Primeiro executar o fluxo completo em base e conta Stripe de teste, com dados de teste identificados e sem publicá-los na produção. O modo `sandbox` do gateway é permitido apenas fora de `netcup-production`; uma página pública não pode anunciar contratação real usando o ambiente de teste.

O contrato privado de configuração declara `payment_mode`. O gateway confere essa informação em cada criação de checkout/onboarding: modo `live` só aceita Stripe `live`, e `sandbox` só aceita Stripe `test`. Flag desligada, modo incompatível ou comissão ausente mantém `paymentsEnabled:false` e impede a operação mesmo se alguém chamar a API sem a interface.

Registrar evidência de:

1. Cadastro cliente e profissional, aceite da versão dos termos, retomada de cadastro interrompido, entrada/saída, sessão expirada e isolamento entre duas contas.
2. Perfil pendente invisível no diretório; revisão humana da atribuição, registro, escopo/local e ART/RRT quando aplicável; publicação pelo operador; edição volta a ocultar o perfil até nova revisão.
3. Solicitação real persistida, proposta com escopo/prazo/valor e comissão, rejeição de aceite de revisão antiga e de comissão alterada, aceite pelo cliente correto.
4. Onboarding Connect BR concluído e conta apta a cobrar/receber; checkout de teste; evento assinado validado; destinatário, valor e parcela da plataforma conferidos na Stripe e no pedido.
5. Reenvio do mesmo evento, evento fora de ordem, assinatura inválida e tentativa de criar checkout concorrente; nenhum pagamento ou repasse duplicado.
6. Entrega, confirmação do cliente e uma avaliação vinculada ao serviço pago/concluído. Reembolso e disputa posteriores devem atualizar o estado financeiro preservando avaliações históricas que já eram elegíveis; criar uma nova avaliação continua exigindo serviço concluído e pagamento confirmado.
7. Interrupção/reinício de API e worker, falha de Redis, backup/restauração em ambiente isolado e retomada de eventos pendentes.

Para ativar na produção, registrar responsável, SHA/digests, resultado do ensaio, comissão, conta Stripe real e primeiro profissional habilitado. Trocar para credenciais `live`, executar a migração necessária caso o plugin Stripe tenha sido habilitado depois do primeiro bootstrap, recriar API/worker, repetir readiness e só então definir `ENGINEERING_MARKETPLACE_MODE=live` no runtime web. Reiniciar `confenge-web-runtime.service` pelo procedimento operacional existente e conferir `GET /api/web/engineering-marketplace?op=config` com `enabled:true`, versão esperada e `paymentsEnabled` coerente.

Não marcar esse gate como concluído com base em um 200 da página, no healthcheck estático, em fixtures ou na URL de retorno do checkout. A evidência financeira vem dos eventos verificados e da consulta à Stripe. A revisão profissional é executada pelo comando privado de operação documentado no README da aplicação, nunca pelo perfil público.

## 6. Monitorar e manter

Monitorar API/worker saudáveis, readiness, reinícios, espaço dos volumes, memória Redis, backlog/erros de eventos, falhas dos webhooks na Stripe, solicitações em `payment.status=creating` e pagamentos pendentes antigos. Não registrar senha, token, descrição técnica do cliente, documentos ou payload bruto de Stripe na observabilidade.

O estado `creating` após falha de rede exige conciliação: conferir a chave de idempotência, sessão e PaymentIntent na Stripe antes de reparar o registro. Não limpar o campo `payment` para permitir uma nova cobrança. Reembolso, disputa e chargeback exigem operação coordenada na Stripe e conferência posterior do webhook; o botão de concluir entrega não retém nem libera dinheiro.

A busca, proposta, recebimento e suporte comercial precisam de responsável operacional. Este módulo não substitui cobrança fiscal, verificação profissional, emissão de ART/RRT, processo de recuperação de conta ou atendimento a cancelamentos. Os fluxos que ainda precisam de ação humana seguem com a equipe CONFENGE.

## 7. Backup e recuperação

Guardar backups cifrados fora do host, com retenção e controle de acesso definidos para dados pessoais e transacionais. O módulo nativo de recebimentos também persiste os dados de conta devolvidos pela Stripe, que podem incluir cadastro, requisitos de verificação e informações bancárias parciais; esses campos continuam privados. Capturar configuração privada em cofre separado, inclusive chaves estáveis e digests. Antes de migração, produzir um dump PostgreSQL e confirmar sua leitura:

```sh
umask 077
sudo ./marketplacectl exec -T postgres pg_dump -U postgres -d marketplace --format=custom > /PRIVATE_BACKUP_PATH/marketplace.dump
sudo ./marketplacectl exec -T postgres pg_restore --list < /PRIVATE_BACKUP_PATH/marketplace.dump > /PRIVATE_BACKUP_PATH/marketplace.dump.contents
```

Os caminhos de backup devem existir, ser privados e estar em armazenamento cifrado; não usar um diretório público ou dentro de `_site`. O dump é um retrato consistente do PostgreSQL. Guardar também um snapshot Redis, pois contém filas e workflows:

```sh
sudo ./marketplacectl exec -T redis sh -ec 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli --rdb /data/marketplace-backup.rdb >/dev/null'
sudo ./marketplacectl cp redis:/data/marketplace-backup.rdb /PRIVATE_BACKUP_PATH/marketplace-redis.rdb
sudo chmod 0600 /PRIVATE_BACKUP_PATH/marketplace-redis.rdb
```

Conferir a integridade com `redis-check-rdb` da mesma versão durante o ensaio. O comando termina após obter o snapshot; PostgreSQL e Redis ainda têm instantes de referência distintos, e a recuperação precisa conciliar filas e eventos. Copiar o diretório Redis em uso como arquivos soltos não produz uma prova de restauração.

O ensaio de restauração ocorre em **outro projeto Compose e volumes isolados**, sem credenciais Stripe reais, sem portas públicas e sem acesso de saída a pagamentos. Criar as funções/usuários com o bootstrap, restaurar o dump usando `pg_restore --exit-on-error`, iniciar a imagem correspondente e verificar contratos e relações. Restaurar o RDB em volume Redis novo, sem um AOF anterior que o sobreponha, e gerar/conferir o novo AOF antes de voltar à configuração persistente desta receita. Verificar também a retomada das filas. Nunca usar `docker compose down -v` na produção.

Restaurar um snapshot pode perder operações posteriores ao ponto de recuperação. Após qualquer restauração real, conciliar sessões e eventos Stripe desde esse ponto antes de liberar novas cobranças. Não repetir transferências, não marcar saldo pelo retorno do navegador e não tratar a restauração do site como restauração do banco.

## 8. Pausa e rollback

Para suspender novas contratações, definir `ENGINEERING_MARKETPLACE_MODE=off` e reiniciar apenas o runtime web pelo procedimento existente. Os dois handlers de webhook continuam encaminhando eventos se o backend estiver configurado. Para suspender apenas novas cobranças/onboarding, usar `MARKETPLACE_PAYMENTS_ENABLED=false` e recriar API/worker, preservando as chaves Stripe e os webhooks para conciliação. Não parar o worker para fazer uma pausa comercial.

Rollback do site e rollback do marketplace são operações distintas. O site usa o bundle e o procedimento de [release Netcup](../../deploy/netcup/README.md). O marketplace usa a imagem anterior, compatível com o schema atual, e o diretório versionado correspondente. Aplicar backup antes de migrar; se a migração não for retrocompatível, preparar restauração/compensação explícita com interrupção e conciliação, sem executar downgrade automático.

```sh
# Depois de registrar o digest anterior em compose.env e conferir compatibilidade:
sudo ./marketplacectl up -d --wait api worker
sudo ./marketplacectl exec -T api node < ready.cjs
```

Não reverter para uma versão do site sem os handlers de webhook enquanto houver pagamentos ou contas conectadas em operação. Não apagar volumes, não alterar o schema por tentativa e não trocar senhas de banco apenas editando o `.env`: em volumes existentes, a inicialização do PostgreSQL não executa novamente. Usar procedimento de rotação e validação de conexão próprio.
