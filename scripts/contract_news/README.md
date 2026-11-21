# Notícias de contratos públicos

Consumidor editorial do contrato `confenge.contract-news-facts/v1`, produzido
pelo `extra-cli`. Aquisição, identidade, confirmação oficial e extração de anexos
continuam no produtor. O site recebe os fatos e um contexto documental vinculado
ao contrato; não consulta o banco operacional nem mantém um coletor PNCP.

## Quatro agentes salvos

As configurações versionadas estão em `agent_profiles.py`. Na execução habilitada,
`AgentsClient` procura ou cria quatro agentes na plataforma OpenAI e consulta suas
configurações novamente antes de iniciar a primeira sessão. O registro privado
`agents-registry.json` conserva IDs e hashes das configurações. Uma resposta de
criação perdida exige reconciliação; não dispara outra criação às cegas.

| Etapa | Trabalho | Condição de avanço |
| --- | --- | --- |
| Apuração documental | Ler cadastro, contratação de origem e anexos; selecionar o fato relevante | Achados vinculados a trechos literais e informação adicional ao cadastro |
| Análise técnica | Explicar consequências para projeto, execução, medição ou acompanhamento | Pontos ligados aos achados e identificados como interpretação |
| Redação jornalística | Produzir manchete, texto, resumo, contexto e análise em português correto | Estrutura editorial, fontes e números verificáveis |
| Revisão editorial | Confrontar o artigo com os documentos originais | Exatidão, qualidade, valor técnico, rastreabilidade e prontidão aprovados |

Cada etapa usa uma sessão independente do agente correspondente. A revisão recebe
fontes originais, apuração, análise e artigo; a saída dos demais agentes não é
prova. Os agentes não têm ferramentas de publicação. A aplicação controla a
aceitação e a promoção do conteúdo.

Os modelos e esforços padrão são definidos por etapa em `agent_profiles.py`.
`CONFENGE_NEWS_MODEL`, quando informado, substitui o modelo das quatro etapas.
Não há substituição automática por um gerador simples em caso de indisponibilidade.
A criação e o uso real dos agentes precisam ser comprovados pelos IDs consultados
e pela execução concluída; código presente no repositório não comprova esses atos.

## Operação

```sh
python3 -m scripts.contract_news source-state --state-dir /var/lib/confenge-web/contract-news/private
python3 -m scripts.contract_news generate --input /caminho/privado/facts.json --dry-run
python3 -m scripts.contract_news generate --input /caminho/privado/facts.json
python3 -m scripts.contract_news check --input /var/lib/confenge-web/contract-news/public/current.json
```

`source-state` imprime somente `published_ids` e até cinco `recheck_ids`.
Versões editoriais antigas têm prioridade. A saída fica em arquivo privado para
o produtor reconfirmar os registros. A resposta `recheck_results` contém
`{id, status}`, com status `verified`, `ineligible` ou `unavailable`. Cada tentativa
avança o cursor privado. A tentativa de consultar anexos avança um cursor
documental separado, inclusive quando a lista ou o PDF falha. Assim, a revisão
simultânea de cinco cadastros não concentra sempre a leitura documental no mesmo
artigo. Com candidatas nos dois grupos, o produtor reserva uma vaga documental
para revisão e outra para notícia nova. As novas alternam por janela de quatro
horas. Se um contrato novo ficar sem contexto completo, o produtor tenta a
próxima candidata no mesmo lote, dentro do orçamento de consultas. Falha de
consulta não remove o acervo.

Cada PDF legível pode contribuir com até 64.000 caracteres. O produtor recusa
textos maiores, preserva os limites de tamanho e páginas por PDF e informa a
cobertura da extração. O texto aceito permanece restrito à apuração.

`--dry-run` confere entrada, atualidade e seleção sem criar arquivos, usar chave,
provisionar agentes ou iniciar sessões. Para gerar, o serviço precisa de
`CONFENGE_NEWS_ENABLED=1` e `OPENAI_API_KEY` no ambiente privado.
`CONFENGE_NEWS_NODE` pode indicar o executável Node; o padrão é `node`.

Estado privado: `/var/lib/confenge-web/contract-news/private`, modo `0700`;
ledger e registro de agentes com modo `0600`. A leitura pública usa
`/var/lib/confenge-web/contract-news/public`, com snapshots `0644`.
O servidor lê somente a segunda pasta, indicada por `CONFENGE_NEWS_DIR`.
Nenhuma chave entra em argumentos, snapshots, erros ou registros de orçamento.

PDFs baixados e o lote `facts.json` ficam na área temporária privada de cada
execução. O publicador a descarta ao encerrar o lote, inclusive em caso de
falha. Uma interrupção abrupta pode deixar uma área temporária, que o próximo
ciclo remove após uma hora. O primeiro ciclo desta versão também descarta o
arquivo de intercâmbio legado. O acervo e o ledger preservam metadados, hashes
e links necessários à auditoria, enquanto os anexos originais ficam no PNCP.
O resultado do publicador registra `document_work_discarded=true` somente
depois de concluir a limpeza do lote.

O produtor usa o wheel fixado `pypdf-6.21.4-py3-none-any.whl` para leitura de PDFs.
O bundle aprovado inclui seu hash no manifesto. O receptor aceita somente esse
caminho de wheel, até 2 MiB e com assinatura ZIP, além dos arquivos Python permitidos.

## Limites e recuperação

Cada execução tenta até dois contratos. O dia civil de São Paulo permite até
seis tentativas e doze sessões de inferência. Um artigo aprovado consome quatro
sessões, portanto o teto efetivo é de três artigos por dia quando todas as etapas
são aprovadas. Rejeições, correções e migrações consomem as mesmas cotas.
`--max-per-run`, `--max-per-day` e `--max-calls-per-day` podem reduzir os limites.

O contador `calls` mede sessões de inferência reservadas, não requisições HTTP de
consulta de agentes ou acompanhamento de sessões. Cada tentativa e sessão é
registrada antes do pedido pago. Falhas e timeouts conservam a reserva, pois o
serviço remoto pode já ter processado a solicitação. Um contrato só começa se
houver espaço para as quatro etapas no orçamento do dia.

Cada sessão tem prazo máximo de 120 segundos; cada requisição HTTP, até 45
segundos. Parte do prazo da sessão é reservada ao cancelamento de trabalho
incompleto. `--timeout` pode reduzir o prazo. A geração tem limite externo de
1.200 segundos; o produtor, 480 segundos; o job do Actions, 35 minutos.

Cada combinação de impressão digital factual e `EDITORIAL_VERSION` admite uma
tentativa por padrão. Nova consulta, relógio ou hash bruto sem mudança material
não autorizam outra tentativa. `--max-attempts-per-record 2` permite recuperação
deliberada, ainda dentro das cotas. Não há repetição automática de inferência.

Uma revisão editorial pode reprocessar artigos mesmo sem mudança factual.
Conserva `slug` e `published_at`; só a nova versão aceita altera `modified_at`.
O ledger conserva gastos e tentativas anteriores. Nunca remova o ledger para
forçar geração: isso perde o histórico e é bloqueado quando já existe publicação.

Um lock impede execuções concorrentes. `CONFENGE_NEWS_ENABLED=0` ou `private/STOP`
suspendem chamadas e publicações, preservando as notícias. Quando
`CONFENGE_NEWS_RELEASE_LINK` e `CONFENGE_NEWS_RELEASE_SHA` são definidos, precisam
identificar a release corrente; uma troca suspende novas chamadas e a promoção.

## Seleção, apuração e texto

Notícias novas exigem publicação no PNCP nos últimos sete dias; exportação e
confirmação da fonte precisam ter até vinte e seis horas. Correções e revisões
de notícias existentes podem tratar registros históricos. Exigem-se fornecedor
pessoa jurídica, valor positivo com natureza explícita, identidade e URL oficial
vinculadas, datas coerentes e objeto completo.

A seleção considera obras, saneamento, infraestrutura, projetos e manutenção de
engenharia. Migrações e correções de artigos existentes têm prioridade; entre os
demais, prevalecem os valores maiores. Não há quantidade mínima. A apuração deve
acrescentar informação verificada além do cadastro. Texto genérico de engenharia
não substitui a falta de documentos.

Os fatos canônicos permanecem intactos. A redação pode corrigir apresentação,
acentuação e caixa e resumir o objeto com fidelidade. Resumos, seções e fontes
ficam em `editorial`; nomes apresentados ao leitor, em `editorial.display`.
A análise técnica explica consequências das premissas documentais e é
identificada como interpretação da CONFENGE.

Valor registrado não é pagamento; vigência não é prazo de execução; sede do órgão
não prova local da obra. Os documentos precisam sustentar essas afirmações.
A revisão exige todos os critérios, inclusive qualidade editorial e valor técnico.
Nenhuma etapa é apresentada como entrevista, vistoria ou revisão humana inexistente.

## Publicação e comprovação

`confenge.contract-news-publication/v1` preserva campos históricos e permite
`editorial` e `editorial_version`. Leitores aceitam notícias anteriores durante a
migração. Referências públicas conservam URL, identidade, data e hash; texto
extraído de anexos permanece privado.

Antes da promoção, Python valida o conteúdo e executa
`node runtime/contract-news/validate.mjs` sobre o candidato privado. Falhas
preservam o ponteiro anterior. Aceitações persistidas podem ser promovidas
após recuperação sem repetir sessões.

O snapshot imutável `snapshot-<sha256>.json` é sincronizado antes da substituição
atômica de `current.json`. O ponteiro contém arquivo, SHA-256, data e quantidade
de artigos. Preservam-se o snapshot corrente e dois anteriores. O limite é
32 MiB; excedê-lo retém a publicação sem apagar notícias.

A rotina `.github/workflows/contract-news.yml` roda após a aceitação da release
Netcup exata e nos horários programados. Um workflow concluído não comprova
publicação: conferir `published`, `editorial_version`, `agent_ids`, rejeições e
a notícia servida.

```sh
python3 deploy/contract-news/verify_public.py --base https://confenge.com.br
python3 deploy/contract-news/verify_public.py --base https://confenge.com.br --expected-editorial-version 2026-11-20.1
```

A segunda forma exige a versão indicada no artigo inspecionado e deve ser usada
após o reprocessamento. A primeira verifica a release antes da migração.
O verificador confere índice, uma notícia real, canonical, texto visível, fontes,
datas, RSS e sitemaps. Exemplos reais também precisam de conferência editorial.

## Verificação de desenvolvimento

```sh
npm run test:contract-news
npm run test:contract-news:browser
```

As verificações cobrem migração de ledger legado, URL e data preservadas,
idempotência, cotas, virada do dia, reserva anterior à sessão, falhas entre
etapas, fontes, revisão reprovada, registro dos agentes, integridade do snapshot,
recuperação, renderização real e versão editorial servida.

Objetivo e responsabilidades estão em
[`ADR-NEWS-001`](../../docs/architecture/ADR-NEWS-001-contract-news.md).
Aquisição qualificada, contato, proposta e recebimento são medidos separadamente.
