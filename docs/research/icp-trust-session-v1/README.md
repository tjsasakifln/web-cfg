# Painel ICP de confiança e compreensão — protocolo v1.0.0

Este pacote deixa a validação humana de #183, #184 e #188 pronta para execução,
sem afirmar que ela ocorreu. O estado versionado continua
`BLOCKED_HUMAN_PARTICIPANTS`: zero pessoas foram recrutadas ou testadas por esta
mudança, e nenhum resultado foi inferido de gates automatizados.

## Decisão e responsabilidade

- Estado: **P2 / VALIDATE**.
- Frente executiva: **INBOUND ENGINE**.
- Alavancas: confiança e conversão.
- Owner accountable: founder da CONFENGE.
- Operador: moderador de pesquisa designado pelo owner.
- Prazo de próxima verificação: **2026-09-13**.
- Tempo para evidência: uma execução completa com cinco pessoas elegíveis e
  consentidas.

O job do visitante é reconhecer onde resolver edital, glosa ou reequilíbrio,
entender que a CONFENGE presta consultoria e identificar situação, entrega e
próximo passo sem receber uma explicação privilegiada. A hipótese é que a
navegação task-first, o painel de evidências e a copy atual sustentam esse job.
Somente a sessão humana decide; esta PR valida apenas a prontidão do instrumento.

## Conteúdo do pacote

- [`protocol.json`](protocol.json): contrato machine-readable, critérios e
  política de privacidade.
- [`RECRUITMENT.md`](RECRUITMENT.md): fonte nomeada, triagem e quota.
- [`CONSENT-RETENTION.md`](CONSENT-RETENTION.md): texto de consentimento,
  minimização, DSAR e descarte.
- [`PROTOCOL-TREE-TEST.md`](PROTOCOL-TREE-TEST.md): teste de árvore de #183.
- [`PROTOCOL-FIVE-SECOND.md`](PROTOCOL-FIVE-SECOND.md): teste de cinco segundos
  de #184.
- [`PROTOCOL-COPY-COMPREHENSION.md`](PROTOCOL-COPY-COMPREHENSION.md): teste de
  compreensão de #188.
- [`RUNBOOK.md`](RUNBOOK.md): ordem operacional e registro agregado.
- [`STATE.json`](STATE.json): residual honesto até a execução humana.
- [`templates/`](templates/): dado agregado e interpretação separados.
- [`ROLLBACK.md`](ROLLBACK.md): reversão sem ressuscitar PII apagada.

## Gate

```bash
npm run test:trust-session-protocol
```

O gate reprova pacote incompleto, amostra menor que cinco com resultado,
disposição de issue fechada, PII em artefato agregado, protocolo que permite
coaching ou métricas fora de intervalo. Ele passa com o residual humano
explicitamente aberto; `READY` significa instrumento pronto, não pesquisa
concluída.

O v1 também fixa por SHA-256 o protocolo JSON, recrutamento, consentimento, os
três instrumentos e o runbook. Uma execução precisa ligar SHA e origem HTTPS da
CONFENGE, hashes dos três estímulos, distribuição mobile/desktop, as quatro
ofertas congeladas e as três sondagens de nomes. Pasta, `run_id`, data,
`STATE.json` e agregado precisam reconciliar. Arquivo extra, interpretação com
placeholder/PII/citação/fechamento ou mudança do instrumento sem nova versão
falha fechado.

## North Star e repetição

O pacote não mede leads, páginas ou commits. Ele reduz o risco de uma navegação
ou mensagem impedir uma oportunidade comercial qualificada de entender o
próximo passo. Repetir o mesmo contrato em futuras mudanças melhora o sistema:
instrumento congelado, consentimento, amostra mínima, decisão e rollback deixam
de ser improvisados; cada execução humana ainda é trabalho deliberado, nunca
automação de participantes.

## Residual após esta entrega

#183, #184, #188 e #297 permanecem `OPEN/BLOCKED`. Além do painel, #184 ainda
precisa de uma janela datada de CTR/scroll e #188 de uma janela de cliques. Uma
sessão não prova causalidade e este pacote não contém palavra-chave de fechamento
automático.
