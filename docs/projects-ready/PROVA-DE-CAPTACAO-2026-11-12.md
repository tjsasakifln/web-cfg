# Prova da captação residencial em 12/11/2026

## Decisão e escopo

Estado: `EXECUTE_NOW`. Frente: aquisição e receita. Evidência buscada: consulta
residencial realmente gravada, acessível à equipe e excluída dos indicadores
quando for ensaio. A seção 5 do pedido do fundador autoriza armazenamento
protegido com consulta restrita como destino da captação.

A disponibilidade de um contato no armazenamento e seu recebimento no Warmbly
são fatos distintos. O site continua responsável pela captura; Warmbly continua
responsável pela ação comercial. Esta correção não cria CRM nem modifica os
destinos, as credenciais, o comportamento dos contatos reais ou as regras de
envio.

## Tentativa preservada e diagnóstico

A [PR #832](https://github.com/tjsasakifln/web-cfg/pull/832) foi integrada em
`14d99b4128b0e69dd9c6babb2be74bb1226e3dae`. A
[execução Netcup 43188990177](https://github.com/tjsasakifln/web-cfg/actions/runs/43188990177)
passou por validação, pacote, qualificação, promoção, reconciliação dos 593 HTMLs
e medição pública. A prova residencial falhou às 10:33:01 UTC, antes de qualquer
POST, com `BLOCKED_BEFORE_POST/warmbly_safety_gate_not_ready`.

O processo restaurou automaticamente a versão
`ba3f9df4ef3eba356ccfe4c6a6553c2979c967c1` às 10:33:36 UTC. Essa tentativa não
estabelece a data de início validado da captação. O relatório original permanece
no [artefato de aceitação](https://github.com/tjsasakifln/web-cfg/actions/runs/43188990177/artifacts/13934798429),
cujo ZIP tem SHA-256
`5265e6a9f5640c43188a381b4412f1a1159ed2b59d91835abdc37ebaf4146fc5`.

Uma [consulta somente GET](https://github.com/tjsasakifln/web-cfg/actions/runs/43203613518)
às 10:48:40 UTC confirmou:

| Observação | Resultado |
| --- | --- |
| Identidade pública e runtime | Ambos na versão restaurada `ba3f9df4ef3eba356ccfe4c6a6553c2979c967c1` |
| OPS autenticado | HTTP 200, `ok=true` |
| Configuração de entrada | `READY`, URL e segredo definidos, destino `WARMBLY_PRODUCTION_V1` |
| Gate externo | `BLOCKED`, motivo `destination_safety_gate_failed` |
| Health canônico Warmbly | HTTP 410, resposta sem JSON |
| Estado de auto-send do Warmbly | Desconhecido nessa observação |

O [artefato sanitizado](https://github.com/tjsasakifln/web-cfg/actions/runs/43203613518/artifacts/13936058452)
tem ZIP SHA-256
`288a00f6acc76cc41aee6cf399931c91563fb63724595e50ed580ffa11b88af0`;
o JSON extraído tem SHA-256
`6d189b6bdcbf8bbb90021377c08576b62b41318ccdc7f232115785f163477a13`.
Ele não contém credenciais, contatos ou respostas privadas brutas.

A origem do HTTP 410 não foi determinada. O
[handler versionado](https://github.com/tjsasakifln/warmbly/blob/088486d2c0dc05a881e543bcb10cdd101f663eaa/internal/api/handler/confenge_inbound.go)
mantém o health com HTTP 200 e estado `READY` ou `BLOCKED`; o
[vhost correspondente](https://github.com/tjsasakifln/warmbly/blob/088486d2c0dc05a881e543bcb10cdd101f663eaa/deploy/confenge-vps/nginx/site-https.conf)
encaminha essa rota ao serviço Warmbly. Nenhuma retirada autorizada foi
encontrada nas fontes consultadas. Não há evidência para trocar URL ou segredo.
`auto_send_off=false` no gate bloqueado significa que a condição segura não foi
confirmada; não demonstra auto-send ativo.

## Correção da prova

O cenário residencial havia herdado o contrato de uma prova que também envia
um registro sintético ao Warmbly. Para verificar o percurso autorizado de
captação local, passa a usar o modo `persist-only` que já existe no servidor:

1. Exigir credenciais válidas, identidade exata da versão e formulário publicado.
2. Enviar o cabeçalho autenticado de persistência local. O servidor marca o
   registro como sintético e excluído antes de gravar; o encaminhamento nasce
   terminal, com motivo `persist_only_probe`, zero tentativas e sem agendamento.
3. Exigir criação HTTP 201 e repetição HTTP 200 com o mesmo recibo.
4. Reler o registro por OPS autenticado e conferir qualificação, contexto,
   marcadores persistidos, nenhum downstream e notificações/e-mail `skipped`.
5. Conferir a exclusão do ensaio e a preservação dos indicadores comerciais.

A projeção restrita do OPS expõe somente o booleano confirmado para o registro
sintético autenticado e o motivo literal permitido. Um `SKIPPED` por falta de
configuração não satisfaz a prova.

O resultado aprovado se chama `CAPTURE_PERSISTENCE_READY`. O relatório declara
que o transporte não foi executado e conserva a observação do gate externo sem
inventar disponibilidade. Todos os cenários que transportam continuam exigindo
os mesmos predicados do gate Warmbly antes do primeiro POST. O modo residencial
continua recusando e-mail controlado.

## Aceitação e operação

A correção exige revisão, testes, nova versão em `main` e nova execução completa
do processo oficial. Os resultados da tentativa anterior não são rebatizados
como prova da nova versão. A data de início da captação só pode ser registrada
depois da aceitação completa e da conferência do domínio público.

Enquanto o Warmbly não for restabelecido e verificado, a equipe consulta os
contatos no OPS protegido e acompanha ali o atendimento existente. O protocolo
comprova gravação, não recebimento pelo CRM. Nenhuma fila é reprocessada por esta
correção. A prova local não autoriza declarar a integração externa reparada.

Venda continua condicionada a produto real, direitos, revisão profissional,
preço, termos, conta institucional e entrega protegida. A reversão preserva os
contatos e pedidos já gravados, conforme o procedimento Netcup existente.
