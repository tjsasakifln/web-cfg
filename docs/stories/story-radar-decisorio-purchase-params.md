# Story: parâmetros do Radar Decisório no momento da compra

Issue: [web-cfg#266](https://github.com/tjsasakifln/web-cfg/issues/266)
Decisão do fundador: 2026-08-23.
Estado: P0 / EXECUTE_NOW. Frente executiva: REVENUE NOW. Alavanca: receita.

## Problema

A oferta avulsa de R$ 599 promete um relatório compatível com o perfil, o acervo
e o raio de atuação da empresa. O link de pagamento coleta apenas endereço. Se
alguém comprasse hoje, o dinheiro entraria e não haveria como saber o que
produzir. Perguntar por WhatsApp não escala.

## Decisão

O cliente informa os parâmetros por formulário dedicado no momento da compra. O
pagamento só é liberado depois de o servidor confirmar que o pedido está
gravado.

## Superfície pública

Rota: `/comercial/radar-decisorio/` (noindex; é etapa transacional, não ativo de
SEO). O formulário publica em `/.netlify/functions/lead`.

Os cinco CTAs de R$ 599 do modelo público e a ação terminal do Radar Nacional
entram nessa rota. Nenhum CTA precificado desses percursos pode saltar a coleta
e abrir diretamente WhatsApp ou pagamento.

O Radar Nacional declara `data-terminal-action="capture-route"`. O gate só
aceita esse marcador quando o destino é uma rota canônica em `/comercial/`,
está `noindex` e contém, no `<main>`, um formulário POST para a função de lead
com atribuição e consentimento obrigatórios. Um link interno comum não satisfaz
o contrato.

## Campos (contrato operacional v1)

| Campo | Obrigatório | Observação |
| --- | --- | --- |
| CNPJ | sim | permite derivar porte, capital social e CNAE de fonte pública |
| Recorte geográfico | sim | `cidade_base` com raio em km, ou `uf` inteira |
| UF | sim | desambigua a cidade-base e define o recorte quando não há cidade |
| Raio em km | condicional | obrigatório quando o recorte é cidade-base; 10 a 1000 |
| Segmentos de obra | sim | vocabulário já publicado nos relatórios |
| Acervo técnico | sim | texto livre, mínimo de 40 caracteres |
| E-mail de entrega | sim | destino do PDF e canal de contato do pedido |

Anexo de CAT ou atestado não é exigido no formulário. Documentos, quando
necessários, são recebidos pelo canal comercial depois do envio.

Este conjunto é o contrato operacional publicado e validado no servidor. Uma
confirmação posterior do fundador que altere os campos exige nova versão do
contrato e migração compatível; não autoriza divergência silenciosa entre HTML,
servidor e matriz de intenção.

Vocabulário de segmentos: `edificacoes-publicas`,
`pavimentacao-infraestrutura-viaria`, `saneamento-hidraulica`,
`manutencao-predial-engenharia`.

## Regras que o código impõe

1. **Validação no servidor.** `netlify/functions/lib/radar-params.cjs` recusa
   qualquer campo ausente ou fora do vocabulário. A checagem do navegador é
   conveniência, não contrato.
2. **Correlação com o pagamento.** A política de `externalReference` é
   `cfg:{offer_id}:{correlation_id}` e vive em
   `scripts/offers/external-reference.cjs`. Provedor de produção, provedor de
   sandbox e este formulário consomem o mesmo construtor. A forma antiga de dois
   segmentos foi removida do adaptador de produção.
3. **Fail-closed.** Falha de persistência responde 5xx sem `correlation_id` e
   sem `external_reference`. A etapa de pagamento na página só abre a partir de
   um `external_reference` devolvido pelo servidor. É preferível perder a venda
   a receber sem saber o que entregar.
4. **Relógio de entrega.** Até 48 horas úteis, contadas do envio do formulário.
   Nunca da confirmação do pagamento. O texto público diz isso antes do
   pagamento.
5. **Quantidade não prometida.** A quantidade de oportunidades decorre dos
   editais vigentes compatíveis com o recorte no momento da busca. O texto
   público diz isso antes do pagamento.
6. **Nenhum dado pessoal em git.** Fixtures e testes usam CNPJ sintético e
   domínio de exemplo. `analyticsShape()` é a única projeção que sai do servidor
   para medição: sem CNPJ, sem e-mail, sem texto de acervo.
7. **Idempotência representa o pedido.** A chave automática inclui um resumo
   estável dos parâmetros normalizados. Repetir a mesma configuração converge;
   alterar recorte, segmento, acervo ou destino cria outro pedido, mesmo para o
   mesmo contato dentro da janela de quinze minutos.

## Identidade comercial

A oferta avulsa de R$ 599 é a ação não catalogada aprovada pelo proprietário
`handraise-report-intelligence-599-v1`, registrada em
`docs/contracts/intent-action/intent-action-matrix.v1.json` com
`authorized_amount_cents = 59900` e ação
`owner_approved_non_catalog_persisted_order_intake`. Ela não é um SKU do catálogo congelado
(`data/offers/catalog.snapshot.json`), e o pin de governança permanece intacto.

## Analytics

Cada CTA que entra no formulário emite um único `cta_click` com `offer_id`,
`next_action_id`, identidade, posição, `event_id` e a correlação anônima da
jornada web, sem PII. Essa correlação não é protocolo de pagamento.
`external_reference` só nasce no servidor depois da persistência do pedido.

## Evidência

`npm run test:radar-params` exercita os módulos publicados e o HTML publicado.

## Fora deste repositório

- Ativar o link de pagamento no Asaas e preencher o `externalReference` no link
  hospedado: ação do fundador.
- Aprovar eventual revisão futura dos campos; o conjunto acima permanece como
  contrato operacional v1 até uma mudança versionada.
- Produzir o relatório em si.
