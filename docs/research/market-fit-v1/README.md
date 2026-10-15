# Market fit multi-vertical: pacote de execucao v3

Este pacote torna a issue #336 executavel sem declarar que a pesquisa ocorreu.
O estado permanece `NOT_STARTED`: nao ha participante, oportunidade comercial,
proposta, pagamento, venda ou disposicao a pagar registrada neste repositorio.

A pesquisa humana e unica. Nao ha segunda amostra e nao se abre outra issue de
pesquisa. A composicao 8/3/3/3/3 e amostragem qualitativa predeclarada, nao
verdade de mercado. Uma unica revisao e permitida antes da primeira sessao,
mantendo n=20 e documentando a razao.

## O que esta pronto

- 20 slots sem identidade, 12 tarefas cada, ordem congelada;
- quotas 8 (canario de engenharia privada), 3 pericia, 3 avaliacao, 3 SST, 3 B2G;
- B2G permanece presente;
- contrato semantico de mensuracao, matriz de privacidade e regras de
  atribuicao;
- templates agregados sem PII para pesquisa, QCO por nucleo e decisoes;
- validador fail-closed.

A matriz usa `MF-P01` a `MF-P20` como posicoes do desenho, nao como
identificadores de pessoas.

## Fronteiras de dados

- contato, triagem, consentimento e notas brutas: armazenamento operacional
  privado, conforme o pacote `icp-trust-session-v1`;
- acao comercial, proposta, decisao e outcome: Warmbly;
- analytics: somente dimensoes agregadas permitidas, com fonte
  `CONFENGE_WEB`, sem PII;
- QCO, proposta e receita nao sao eventos client-side;
- repositorio: matriz sem identidade, contagens agregadas e hashes de export.

## Comandos

```bash
node scripts/commercial/market_fit_exposure_plan.mjs --check
node scripts/commercial/market_fit_evidence.mjs --check
npm run test:market-fit-protocol
node tests/measurement/test_multivertical_measurement_contract.mjs
```

## Estado decisorio

- Prioridade: P2.
- Estado: MEASUREMENT_WAIT_VALID, instrumento pronto, evidencia humana pendente.
- Frente: INBOUND ENGINE.
- Alavancas: customer, revenue, data e trust.
- North Star: QCO por nucleo ligado a proposta/receita downstream.

Em 100 repeticoes, o desenho melhora o sistema quando acumula evidencia
comparavel. Repetir entrevista sem QCO cria trabalho, nao valida market fit.
