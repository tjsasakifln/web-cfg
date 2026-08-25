# Market fit do catálogo ampliado: pacote de execução v1

Este pacote torna a issue #336 executável sem declarar que a pesquisa ocorreu.
O estado permanece `NOT_STARTED`: não há participante, oportunidade comercial,
proposta, pagamento, venda ou disposição a pagar registrada neste repositório.

## O que está pronto

- matriz congelada de 20 slots por 18 cartões, gerada de forma reproduzível;
- quotas de cinco slots para cada um dos quatro papéis do ICP;
- cobertura de 54/54 entregáveis com ao menos seis exposições por item;
- fronteiras críticas apresentadas em conjunto ao menos três vezes;
- ordem dos cartões congelada antes das sessões;
- templates agregados, sem PII, para pesquisa, QCOs e decisões por produto;
- validador fail-closed para impedir promoção por campo ausente ou inferência.

A matriz usa `MF-P01` a `MF-P20` como posições do desenho, não como
identificadores de pessoas. A associação entre slot e participante real fica no
armazenamento operacional privado e nunca entra no Git ou em analytics.

## Fronteiras de dados

- contato, triagem, consentimento e notas brutas: armazenamento operacional
  privado, conforme o pacote `icp-trust-session-v1`;
- ação comercial, proposta, decisão e outcome: Warmbly;
- analytics: somente dimensões agregadas permitidas, com fonte
  `CONFENGE_WEB`, sem PII;
- repositório: matriz sem identidade, contagens agregadas e hashes de export,
  nunca registros individuais.

## Comandos

```bash
node scripts/commercial/market_fit_exposure_plan.mjs --check
node scripts/commercial/market_fit_evidence.mjs --check
npm run test:market-fit-protocol
```

O primeiro comando detecta qualquer troca de cartão depois do congelamento. O
segundo valida os templates e artefatos agregados que venham a ser adicionados.
O gate pode confirmar prontidão do instrumento, mas somente sessões e QCOs
reais podem alterar o estado de evidência.

## Estado decisório

- Prioridade: P0.
- Estado: EXECUTE_NOW, com instrumento pronto e evidência humana pendente.
- Frente: REVENUE NOW.
- Tempo para evidência: 30 dias.
- Alavancas: customer, revenue, data e trust.
- North Star: oportunidades comerciais qualificadas, nunca volume de sessões,
  cartões, mensagens ou páginas.

Em 100 repetições, o desenho melhora o sistema apenas quando acumula evidência
comparável sobre decisão, preço, entrega e outcome. Repetir entrevista sem QCO,
proposta e retorno decisório cria trabalho, não valida market fit.

