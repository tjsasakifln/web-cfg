# #248 — decisão DEFER para agenda pública

- Estado: **P2 / DEFER / BLOCKED**.
- Frente executiva: **REVENUE NOW**.
- Alavanca: conversão.
- Decision owner: `web-cfg/conversion`.
- Measurement owner: `warmbly/commercial-latency` por
  [Warmbly #55](https://github.com/tjsasakifln/warmbly/issues/55).
- Data da decisão: **2026-08-24**.
- Próxima verificação: **2026-09-20**, ou quando #55 publicar um baseline
  representativo, o que ocorrer primeiro.

## Decisão e evidência atual

O job do visitante de alta intenção é conseguir iniciar uma conversa sobre o
caso sem receber uma expectativa falsa de disponibilidade ou prazo. Uma agenda
com owner e latência observada poderia reduzir a ida e volta para marcação, mas
essa hipótese permanece bloqueada: Warmbly #55 ainda não publicou o baseline que
mede o caminho de ação comercial até conversa.

O contrato `intent-action-matrix/1.0` v1.4.1 é a evidência repo-owned desta
decisão. Em 2026-08-24 ele registra:

```json
{
  "exists": false,
  "owner": null,
  "sla": "UNKNOWN",
  "decision_state": "DEFER",
  "blocked_by": "https://github.com/tjsasakifln/warmbly/issues/55",
  "baseline": { "status": "MISSING", "evidence_ref": null }
}
```

WhatsApp e telefone continuam como canais iniciados pelo visitante, com owner
nomeado e SLA `UNKNOWN`. Não foi criada rota, página, link, CTA, calendário ou
promessa pública de resposta nesta mudança.

## Reopen gate atômico

O gate é avaliado sobre o contrato inteiro do PR. `agenda.exists` só pode mudar
para `true` se o **mesmo PR** também contiver:

1. `decision_state=EXECUTE_NOW`, `activated_at` e owner operacional não vazio;
2. baseline `MEASURED`, `representative=true`, produzido por Warmbly #55;
3. referência imutável: comentário específico de #55, commit de 40 caracteres
   ou arquivo em commit imutável do repositório Warmbly;
4. `measured_at`, início/fim da janela, intervalo de estágios, escopo de rota,
   clock de origem e timezone;
5. amostra positiva e métricas não negativas: count, mediana, p75, p90 e ciclos
   censurados/abertos;
6. `count=sample_count`, `period_start <= period_end <= measured_at <= as_of` e
   `median <= p75 <= p90`;
7. `agenda.sla=UNKNOWN` e a política global de SLA intacta.

Uma referência para a raiz da issue, um prazo estimado, uma amostra sem data ou
um owner em documento separado não satisfaz o gate. Baseline medido descreve o
passado; não vira SLA nem promessa pública. Definir um SLA futuro exige decisão
própria e mudança deliberada da política, fora de #248.

## Execução quando o blocker cair

1. Confirmar que Warmbly #55 publicou o artefato agregado sem PII e o marcou
   representativo.
2. Fixar referência imutável e conferir relógio, timezone, janela, contagens e
   percentis.
3. Alterar o bloco `agenda` atomicamente; rodar `npm run test:conversion`.
4. Só então implementar uma rota pública separada, com revisão de privacidade,
   analytics `CONFENGE_WEB`, fallback e rollback. A rota não é autorizada por
   este documento isoladamente.
5. Registrar a decisão de reabertura com data e evidência, sem declarar que a
   latência observada será o prazo futuro.

## Analytics, autoridade e North Star

Nenhuma telemetria ou PII nova é criada. Warmbly continua dono da ação e dos
outcomes; `web-cfg` continua dono apenas da superfície pública. A hipótese só é
útil se reduzir atrito até uma oportunidade comercial qualificada, não se gerar
cliques de calendário. Repetir o gate cem vezes evita cem promessas sem base; não
substitui a medição humana/operacional que existe uma vez por baseline.

ADR afetado: ADR-STRAT-002, sem mudança de fronteira. O contrato mantém a ação em
Warmbly e não cria runtime paralelo.

## Rollback

Enquanto `exists=false`, rollback é reverter o commit deste protocolo; não há
superfície pública a retirar. Depois de uma ativação futura, primeiro desabilitar
a rota/CTA, restaurar `exists=false`, `owner=null`, `sla=UNKNOWN` e
`decision_state=DEFER`; depois reverter o código da agenda. Preservar o baseline
histórico como evidência invalidada ou superada, sem apagar observações reais e
sem transformar rollback em promessa de prazo.
