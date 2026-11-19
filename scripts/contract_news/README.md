# Notícias de contratos públicos

Consumidor editorial do contrato `confenge.contract-news-facts/v1`, produzido
pelo `extra-cli`. Não consulta o banco operacional e não busca contratos no PNCP.
Aquisição, identidade, fonte e confirmação oficial continuam no produtor.

## Operação

```sh
python3 -m scripts.contract_news source-state --state-dir /var/lib/confenge-web/contract-news/private
python3 -m scripts.contract_news generate --input /caminho/privado/facts.json --dry-run
python3 -m scripts.contract_news generate --input /caminho/privado/facts.json
python3 -m scripts.contract_news check --input /var/lib/confenge-web/contract-news/public/current.json
```

`source-state` imprime somente `published_ids` e até cinco `recheck_ids`. A saída
deve ficar em arquivo privado, para o produtor confirmar os registros publicados.
Registros verificados vêm novamente em `records`. A resposta adicional
`recheck_results` tem itens `{id, status}`, com status `verified`, `ineligible` ou
`unavailable`. A tentativa de rechecagem avança o cursor privado mesmo quando não
há alteração material ou a fonte está indisponível. Falha de consulta não apaga
o acervo.

O modo `--dry-run` confere o contrato de entrada, a atualidade e a seleção, sem
criar arquivos, usar chave ou chamar a API. Não gera uma notícia de demonstração.

Para gerar, o serviço precisa de `CONFENGE_NEWS_ENABLED=1` e `OPENAI_API_KEY` no
ambiente privado. `CONFENGE_NEWS_MODEL` permite escolher o modelo; o padrão é
`gpt-4.1-mini`. `CONFENGE_NEWS_NODE` pode indicar o executável Node instalado; o
padrão é `node`. Nenhuma chave entra em JSON, argumento do processo, snapshot,
mensagem de erro ou registro de orçamento.

Diretórios padrão, separados:

- Estado: `/var/lib/confenge-web/contract-news/private`, modo `0700`; ledger `0600`.
- Leitura pública: `/var/lib/confenge-web/contract-news/public`, snapshots `0644`.
- O servidor lê a segunda pasta por `CONFENGE_NEWS_DIR` e nunca serve o ledger.

## Limites e recuperação

Cada execução tenta no máximo dois registros; o dia civil de São Paulo permite
no máximo seis tentativas, seis aceitações e doze chamadas à API. Retificações
também consomem esses limites. Os argumentos `--max-per-run`, `--max-per-day` e
`--max-calls-per-day` podem diminuir os limites, sem ultrapassar os tetos.

Cada impressão digital material admite uma tentativa por padrão. Uma nova
checagem, hash bruto diferente ou timestamp de atualização não libera outra
tentativa. É possível usar `--max-attempts-per-record 2` para uma recuperação
deliberada, ainda dentro do orçamento diário. Não há repetição de chamadas dentro
da execução. Nunca remova o ledger para repetir a geração: isso perde o histórico
de gastos e é bloqueado quando já existe publicação.

Cada artigo usa duas chamadas Responses com JSON estrito: redação e verificação
de sustentação. As chamadas têm timeout de quarenta e cinco segundos, saída
máxima de 1.800 e 900 tokens e nenhum acesso a ferramentas. `--timeout` pode
ajustar o timeout até sessenta segundos. O estado registra cada tentativa e
chamada antes do pedido pago. Um timeout ou resposta incompleta consome o
orçamento reservado, pois o servidor pode já ter processado a solicitação.

Um lock de processo impede execuções concorrentes de gastarem ou publicarem em
duplicidade. A ausência da chave não altera o acervo. Para suspender a geração,
defina `CONFENGE_NEWS_ENABLED=0` ou crie o arquivo `private/STOP`. O serviço verifica
a suspensão antes de cada chamada e antes da publicação. As notícias anteriores
continuam acessíveis.

O executor também pode fixar `CONFENGE_NEWS_RELEASE_LINK=/opt/confenge-web/current`
e `CONFENGE_NEWS_RELEASE_SHA` com o commit completo de quarenta caracteres. Quando
uma dessas variáveis está presente, ambas precisam estar válidas e o destino do
link precisa conservar o SHA informado. Uma troca de release suspende novas
chamadas e a promoção daquela execução. Configuração parcial ou inválida fecha
esse controle e preserva o acervo.

## Seleção e verificação

As notícias novas se restringem a contratos publicados no PNCP nos últimos sete
dias. Export e confirmação da fonte precisam ter no máximo vinte e seis horas.
Retificações de artigos já publicados podem ser históricas. O consumidor exige
fornecedor pessoa jurídica, valor positivo com natureza explícita, identificador
PNCP e URL oficial vinculados, datas coerentes e objeto completo até 5.120
caracteres. Não soma valores inicial/global/acumulado nem transforma vigência em
prazo de obra. Mantém até quatro casas decimais na fonte; exibe centavos com
arredondamento decimal.

Os registros são selecionados pela pertinência a obras, saneamento,
infraestrutura, projetos ou manutenção de engenharia. Entre os elegíveis,
retificações são tratadas primeiro e os valores maiores têm prioridade.
Não há quantidade mínima de notícias. Contratos incompletos, antigos para uma
notícia nova ou sem relação com o recorte não geram chamadas pagas.

O modelo redige com marcadores controlados para entidade, objeto, valor e datas.
O assunto da manchete deve ser trecho literal do objeto. Números livres, HTML,
URLs, marcadores inexistentes, instruções maliciosas e afirmações de pagamento,
início/conclusão da obra, licitação aberta, impactos ou rankings são retidos por
verificações determinísticas. Um segundo pedido avalia cada afirmação da notícia
renderizada contra os fatos. A aprovação desse pedido não substitui os demais
controles e não é descrita como revisão humana.

## Contrato publicado

`confenge.contract-news-publication/v1` contém `generated_at` e `articles`.
Cada artigo contém `id`, `slug`, `title`, `description`, `lead`, `paragraphs`,
`category`, `published_at`, `modified_at` e `facts`. Os fatos incluem todas as
datas e a origem recebidas do produtor. Não há prompts, respostas de revisão ou
credenciais nessa projeção.

O `slug` combina uma descrição com hash curto do identificador e não carrega
CNPJ. Uma retificação conserva URL e `published_at`; só uma mudança material
aceita altera `modified_at`. A rechecagem sem mudança apenas avança o cursor
privado. O acervo histórico não expira.

Antes da promoção, o Python valida a publicação e executa
`node runtime/contract-news/validate.mjs` com o candidato privado, validando o HTML
e os dados estruturados realmente utilizados pelo servidor. A falha conserva o
ponteiro anterior. As aceitações já ficam persistidas: após corrigir o erro de
publicação, uma execução recupera a promoção sem chamar a API outra vez.

O arquivo imutável `snapshot-<sha256>.json` é gravado e sincronizado antes de
`current.json`. O ponteiro `confenge.contract-news-pointer/v1` contém `file`,
`sha256`, `generated_at` e `article_count`; sua troca é atômica. São preservados
o snapshot atual e dois anteriores. O limite de cada snapshot é 32 MiB; exceder
esse limite retém a publicação e não remove notícias automaticamente.

## Verificação de desenvolvimento

```sh
python3 -m unittest discover -s tests/contract_news -v
```

Os registros sintéticos ficam exclusivamente no módulo de testes. Os testes
cobrem limites, virada do dia em São Paulo, idempotência, retificações, falha da
API, injeção, datas, concorrência, integridade do ponteiro, recuperação após
interrupção e a execução do validador Node real antes da publicação.

Referências da integração: [Responses e JSON estrito](https://developers.openai.com/api/docs/guides/structured-outputs)
e [modelo GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
Estas capacidades não garantem indexação, tráfego ou receita; os eventos e os
resultados comerciais são acompanhados pelos sistemas proprietários existentes.
