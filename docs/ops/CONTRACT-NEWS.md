# Notícias de contratos públicos

Decisão de produto: ADR-NEWS-001. A superfície pública é
`https://confenge.com.br/noticias/contratos-publicos/`.

## Execução

O workflow `Contract news publication` executa seis vezes por dia, às 02:55,
06:55, 10:55, 14:55, 18:55 e 22:55 no horário de São Paulo. O agendamento do
GitHub pode sofrer atraso. A rotina também é solicitada depois que
`netcup-release` termina com sucesso e pode ser disparada manualmente em `main`.

O job usa o ambiente protegido `netcup-production`. Uma branch de trabalho não
está autorizada a utilizar esse ambiente. A verificação inicial confere que o
commit esperado de `main` está realmente no link `current` da Netcup. Se ainda
não estiver, registra `waiting_for_release`, sem apresentar isso como publicação.

O código executado no servidor vem do pacote imutável da release vigente.
`data/editorial/contract-news-source.json` fixa o commit aprovado do `extra-cli`.
O runner obtém esse checkout público e empacota somente seu fechamento Python.
O servidor verifica digest, manifesto, commit e todos os arquivos antes de
executá-los em diretório privado temporário. A projeção Radar existente é lida
sem alteração. A confirmação na API PNCP pertence a esse produtor.

Nenhum coletor, timer de ingestão, serviço de banco, permissão PostgreSQL ou
checkout operacional de `extra-cli` é modificado pelo workflow editorial.

## Configuração privada

Usa os mesmos segredos de SSH da publicação Netcup, com `known_hosts` fixado.
A chave OpenAI é obtida de `OPENAI_API_KEY` no ambiente protegido do GitHub ou
de `OPENAI_API_KEY` no arquivo privado `/etc/confenge-web/runtime.env`, quando
legível pelo usuário de publicação. A chave não é argumento de processo, não
entra no repositório e não aparece em saídas ou snapshots. Quando transmitida
por SSH, usa arquivo temporário privado, removido ao término.

Sem chave disponível, a rotina termina com `missing_openai_api_key`; isso não é
uma publicação concluída. Não há texto fictício como substituição.

As configurações opcionais no arquivo privado são `CONFENGE_NEWS_MODEL`, padrão
`gpt-4.1-mini`, e `CONFENGE_NEWS_NODE`, padrão `node`. O modelo precisa suportar
Responses com o formato JSON estrito usado pelo consumidor.

## Estado durável e limites

| Item | Caminho ou limite |
| --- | --- |
| Estado editorial privado | `/var/lib/confenge-web/contract-news/private/` |
| Projeção para o servidor | `/var/lib/confenge-web/contract-news/public/` |
| Fonte existente | `/var/lib/confenge-market-radar/current.json` |
| Confirmações PNCP por execução | até 20, incluindo até 5 rechecagens |
| Novidades | publicadas no PNCP nos últimos 7 dias e pertinentes à engenharia |
| Geração por execução | até 2 tentativas |
| Geração por dia em São Paulo | até 6 tentativas e 6 publicações |
| Chamadas OpenAI por dia | até 12, reservadas antes do pedido pago |
| Repetição automática do mesmo conteúdo | uma tentativa por impressão digital material |
| Geração e revisão | duas chamadas separadas; sem ferramentas do modelo |
| Publicação | validação do HTML real, snapshot imutável e ponteiro atômico |

O diretório pai e a projeção pública precisam ser atravessáveis pelo usuário do
runtime. A pasta privada permanece `0700`; ledger e credenciais permanecem
`0600`. Somente a projeção pública é lida pelo handler. A quantidade de chamadas
é limitada; o custo monetário depende do modelo e dos tokens efetivamente usados.

Falhas da fonte ou da OpenAI conservam as notícias já publicadas. Mudanças
materiais aceitas conservam URL e data original, atualizando a data de
modificação. O acervo não expira quando uma notícia deixa de ser recente.

## Verificação e operação

O resumo da execução informa tentativas, chamadas, publicações e rejeições por
código. `published` só conta aceitações; `verified_articles` corresponde à
validação da projeção. O passo seguinte consulta o domínio público, verifica o
índice, sitemap do acervo, sitemap de notícias recentes, RSS e uma notícia real.
Arquivo vazio recebe `noindex` e contagem zero. Uma execução vazia não comprova
geração real pela OpenAI.

```sh
python3 -m scripts.contract_news check --input /var/lib/confenge-web/contract-news/public/current.json
python3 deploy/contract-news/verify_public.py --base https://confenge.com.br
```

O workflow `Contract news readiness`, disparado em `main`, faz inspeção de
presença e acesso sem expor valores de credenciais. Seus resultados devem ser
consultados antes de solicitar mudanças de configuração.

Para suspender novas publicações, definir a variável GitHub
`CONFENGE_NEWS_ENABLED=0`, a mesma opção no arquivo privado, ou criar
`private/STOP`. O acervo continua disponível. Não remover o ledger para repetir
uma tentativa: ele conserva os limites de gasto, identidade e histórico.

A correção editorial usa o canal existente em `/triagem-tecnica/#corrigir-o-site`.
Uma indisponibilidade de fonte avança o cursor de rechecagem e mantém o relato
histórico com sua data de consulta. Não equivale a afirmar que os dados continuam
inalterados. O cancelamento de publicação exige ação editorial deliberada.

Rollback do código usa o procedimento Netcup existente. Os arquivos editoriais
duráveis ficam fora das releases. A versão de contrato do acervo deve continuar
compatível com a release de destino; o handler rejeita uma projeção incompatível.

## Aceitação e acompanhamento

Antes da integração, executar `npm run test:contract-news`, os testes do pacote
Netcup e os gates completos da PR. A versão de produção requer as mesmas
validações e a qualificação Netcup já existente. Nenhum gate é desabilitado para
publicar esta seção.

Confirmar em produção: commit servido, execução real com fonte atual, ao menos
uma notícia aceita, URL 200, conteúdo e JSON-LD correspondentes, fonte PNCP
acessível, sitemap e RSS atualizados, índice sem duplicação e repetição sem nova
cobrança para fatos inalterados.

O resultado comercial é acompanhado por origem de tráfego, leitura, passagem
para serviço e contato pelo WhatsApp. Os eventos não devem tratar clique como
lead, proposta, contrato ou recebimento. A análise posterior cruza conversões e
resultado econômico no sistema proprietário. Volume de notícias e impressões
isoladas não são critérios de sucesso comercial.
