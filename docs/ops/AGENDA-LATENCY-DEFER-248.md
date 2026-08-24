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

O contrato `intent-action-matrix/1.0` v1.4.2 é a evidência repo-owned desta
decisão. Em 2026-08-24 ele registra:

```json
{
  "exists": false,
  "owner": null,
  "route_url": null,
  "implementation_ref": null,
  "sla": "UNKNOWN",
  "decision_state": "DEFER",
  "blocked_by": "https://github.com/tjsasakifln/warmbly/issues/55",
  "baseline": {
    "status": "MISSING",
    "evidence_ref": null,
    "snapshot_path": null,
    "snapshot_sha256": null
  }
}
```

WhatsApp e telefone continuam como canais iniciados pelo visitante, com owner
nomeado e SLA `UNKNOWN`. Não foi criada rota, página, link, CTA, calendário ou
promessa pública de resposta nesta mudança.

## Reopen gate atômico

O gate é avaliado sobre o contrato inteiro do PR. `agenda.exists` só pode mudar
para `true` se o **mesmo PR** também contiver:

1. `decision_state=EXECUTE_NOW`, `activated_at` e owner operacional nomeado, sem
   `UNKNOWN`, `TBD` ou outro placeholder; o owner autorizado atual é
   `tiago-jun-sasaki` e trocar essa autoridade exige revisão explícita do gate;
2. `route_url` canônica `https://confenge.com.br/.../` e
   `implementation_ref` correspondente, local, versionado e existente no mesmo
   estado/PR;
3. baseline `MEASURED`, `representative=true`, produzido por Warmbly #55 como
   censo de todos os ciclos comerciais elegíveis da janela, sem selecionar
   apenas sucessos;
4. `evidence_ref` imutável pinado em commit de 40 caracteres ou blob desse
   commit no repositório Warmbly; issue e comentário editável não satisfazem;
5. snapshot JSON agregado, local e versionado em
   `docs/evidence/commercial-latency/`, com SHA-256 dos bytes exatos no contrato;
   os campos do snapshot devem ser idênticos ao baseline e não podem conter PII;
6. `measured_at`, início/fim da janela, intervalo de estágios, escopo de rota,
   clock de origem e timezone IANA, todos sem placeholders;
7. pelo menos 20 ciclos fechados em uma janela inclusiva mínima de 28 dias,
   contagem de todos os ciclos elegíveis e métricas não negativas: count,
   mediana, p75, p90 e ciclos censurados/abertos;
8. `count=sample_count`, `eligible_cycle_count=count+censored_open_cycles`,
   `period_start <= period_end <= measured_at <= activated_at <= as_of`,
   `median <= p75 <= p90` e no máximo 30 dias entre medição e ativação;
9. `activation_base_sha` igual ao base SHA real do PR; matriz, implementação e
   snapshot precisam aparecer no diff desse base até o head. Esse registro
   preserva a atomicidade depois do merge;
10. HTML da rota contendo canonical exata, atribuição `CONFENGE_WEB` e nenhuma
    marca pública SmartLic/Warmbly;
11. `agenda.sla=UNKNOWN` e a política global de SLA intacta.

Uma referência para issue/comentário, hash divergente, arquivo fora do repositório,
rota sem implementação, prazo estimado, amostra sem data ou owner placeholder não
satisfazem o gate. Baseline medido descreve o passado; não vira SLA nem promessa
pública. Definir um SLA futuro exige decisão própria e mudança deliberada da
política, fora de #248.

O gate valida a forma, o hash local, a referência imutável e a coerência do
snapshot, mas não autentica criptograficamente que um artefato privado de outro
repositório foi produzido por Warmbly nem que o snapshot local equivale ao blob
remoto. A revisão humana do owner deve conferir o blob pinado antes de aprovar a
ativação; essa limitação de confiança não pode virar claim automático.

## Execução quando o blocker cair

1. Confirmar que Warmbly #55 publicou um artefato agregado sem PII, marcou a
   amostra como representativa e o fixou em commit/blob imutável.
2. Versionar o snapshot JSON local, registrar o SHA-256 dos bytes exatos e
   conferir relógio, timezone, janela de 28+ dias, 20+ fechados, censo de ciclos,
   contagens, frescor e percentis.
3. Implementar a rota CONFENGE com revisão de privacidade, analytics
   `CONFENGE_WEB`, fallback e rollback; declarar sua URL canônica e arquivo-fonte.
4. Alterar o bloco `agenda` para `EXECUTE_NOW` no mesmo PR da implementação e do
   snapshot, gravar o base SHA real em `activation_base_sha` e rodar
   `npm run test:conversion` no evento `pull_request`.
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
