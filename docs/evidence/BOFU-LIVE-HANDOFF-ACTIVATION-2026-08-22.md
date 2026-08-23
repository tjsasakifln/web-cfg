# BOFU live handoff activation — 2026-08-22

Issue canônica: [#230](https://github.com/tjsasakifln/web-cfg/issues/230)

Estado da decisão: `EXECUTE_NOW`  
Frente executiva: `REVENUE NOW`  
Tempo até evidência: mesma rodada operacional  
Alavancas: receita, automação e confiança

## Resultado

O mecanismo fail-closed de auditoria e requeue bounded está publicado em produção. A auditoria e o `dry_run` autenticados passaram sem expor PII e identificaram exatamente um registro `real/not_configured` elegível. Nenhum registro foi requeued ou entregue porque a autoridade Netlify continua sem o URL e o HMAC do contrato.

Este é um fechamento parcial seguro, não uma prova comercial. O canário histórico permanece bloqueado antes de `PENDING`.

```text
BLOCKED_EXTERNAL_ACTION=Netlify production authorization required to set the destination URL, allowed host and copy the existing Warmbly HMAC without disclosure
```

## Autoridades e versões observadas

```text
WEB_CFG_BASE_SHA=c5fa76277036de81e391ba469985b8923182e746
WEB_CFG_FINAL_SHA=2e9aa14a1d26ff09c689ae861adab59bad6be91f
NETLIFY_PRODUCTION_DEPLOY_SHA=2e9aa14a1d26ff09c689ae861adab59bad6be91f
NETLIFY_PRODUCTION_DEPLOY_ID=6a8a5d719be4360008444a04
WARMBLY_MAIN_SHA=bb02162fcad576c4a3c64edf897037f38ec31bf2
WARMBLY_DEPLOYED_HOST_SHA=f2b25ba2637f7bc835a095689c2d32bd979f6cb4
```

O `main` e o host Warmbly avançaram durante a rodada por mudanças externas a esta campanha; ambos foram revalidados ao final. Nenhum código Warmbly foi alterado aqui.

## Gates de produção

Prova autenticada: GitHub Actions run [`32613457209`](https://github.com/tjsasakifln/web-cfg/actions/runs/32613457209).

```text
OPS health=200
inbound_handoff=200
audit_inbound_requeue=200
requeue_inbound dry_run=true=200
commercial funnel=200

Netlify:
webhook_url=UNSET
webhook_secret=UNSET
contract=UNSET

Warmbly:
secret=SET
auto_send=false PROVEN
health.status=READY
health.dispatch_attempted=false
```

O segredo foi verificado apenas por presença. Seu valor não foi lido para a evidência, impresso, persistido ou transferido. A sessão não possuía login/token Netlify; por isso não foi criado um segundo HMAC e o cutover foi abortado.

## Auditoria sanitizada dos 124 registros

```text
total=124
handoff.status.SKIPPED=22
handoff.status.MISSING=102
handoff.reason.non_real=21
handoff.reason.not_configured=1
handoff.reason.MISSING=102
record_kind.synthetic=66
record_kind.qa=11
record_kind.real=2
record_kind.MISSING=45
explicit_consent.true=124
created_at_window.2026-08=124
```

Classificação exclusiva usada pelo requeue:

```text
DNC_OR_SUPPRESSED=77
OTHER_BLOCKER=46
ELIGIBLE_REAL_NOT_CONFIGURED=1
MANUAL_REVIEW_LEGACY=0
NEVER_REQUEUE_NON_REAL=0
ALREADY_DELIVERED=0
```

O contador bruto `handoff.reason.non_real=21` é uma dimensão do outbox. Na classificação exclusiva, esses registros também satisfazem a barreira mais forte `DNC_OR_SUPPRESSED`; não são candidatos e jamais são enviados. Os 102 registros sem status de handoff não foram tratados como `real` nem automaticamente requeued.

O `dry_run` do caminho de execução confirmou:

```text
eligible_count=1
never_requeue_count=0
manual_review_count=0
reason_counts.dnc_or_suppressed=77
reason_counts.not_skipped=46
reason_counts.eligible_real_not_configured=1
```

Nenhum ID, nome, email, telefone ou conteúdo de mensagem integra esta evidência.

## Replay e primeiro circuito real

```text
eligible=1
attempted=0
delivered=0
duplicates=0
retryable=0
blocked=0
dead=0
manual_review=0
never_requeue=0

lead_persisted=false
Warmbly_receipt=false
Warmbly_action=false
commercial_event=false
qualified_pipeline=UNKNOWN
```

`lead_persisted=false` acima significa que não existe um lead consentido individual correlacionado por `lead_id/receipt_id` através do circuito completo nesta prova. O funil agregado contém `lead_persisted=36`, mas não autoriza inferir um contato consentido, receipt Warmbly ou pipeline qualificado.

## Código, qualidade, observabilidade e rollback

O PR [#259](https://github.com/tjsasakifln/web-cfg/pull/259) publicou:

- classificador fail-closed para `SKIPPED/not_configured`;
- auditoria agregada sem PII;
- `POST requeue_inbound` autenticado, `eligible_only`, `dry_run` explícito e limite de 1 a 20;
- gate server-side `READY + auto_send=false + dispatch_attempted=false`;
- transição exclusiva `SKIPPED/not_configured -> PENDING`;
- abort de batch em `401/403` e em taxa anormal de erros retryable;
- testes adversariais e documentação operacional.

O PR [#260](https://github.com/tjsasakifln/web-cfg/pull/260) corrigiu somente o parser sanitizado da prova de `dry_run`.

Gates executados sem reduzir thresholds:

```text
npm test=PASS
npm run test:inbound-handoff=PASS
npm run test:lead-function=PASS
npm run test:lead-store-production=PASS
npm run test:ops-auth=PASS
npm run test:analytics=PASS
npm run test:conversion=PASS
npm run test:bofu-dominance=PASS
npm run test:margin-defense-dod=PASS
npm run test:secrets-scan=PASS
PR CI site-ci=PASS
PR CI pSEO quality gates=PASS
PR CI CodeQL=PASS
Warmbly deployed-host Go CI and CONFENGE product acceptance=PASS (no code changed here)
```

Analytics continuam agregados e sem PII. A reversão é feita revertendo os merges de #260 e #259; nenhuma linha foi mutada pelo `dry_run`. O ADR afetado é `ADR-STRAT-002`, sem mudança de fronteira: Confenge continua a única superfície pública, `extra-cli` permanece a autoridade de fatos/identidade e Warmbly permanece a autoridade da ação comercial.

## Próxima ação autorizada necessária

Um operador com acesso administrativo à Netlify deve:

1. Abrir o projeto `confenge` na Netlify e limitar as três variáveis ao contexto Production.
2. Definir `CONFENGE_INBOUND_WEBHOOK_URL` exatamente como `https://api.confenge.com.br/api/v1/webhooks/confenge/inbound`.
3. Definir `CONFENGE_INBOUND_ALLOWED_HOSTS` como `api.confenge.com.br`.
4. Copiar, por canal administrativo secreto/clipboard seguro, o valor **já existente** de `CONFENGE_INBOUND_WEBHOOK_SECRET` no host Warmbly para a variável homônima da Netlify. Não usar `echo`, argumento de linha de comando, log de Action, arquivo do repositório ou comentário.
5. Publicar/republicar `main` se a Netlify exigir para propagar o runtime.
6. Reexecutar o job `inbound-proof` e exigir URL `SET`, secret `SET`, contract `READY`, todos os endpoints `200` e Warmbly `auto_send=false` antes de qualquer mutação.
7. Reexecutar `dry_run`; então requeue somente um candidato (`limit=1`), drenar um, confirmar receipt/action/dedupe/zero outbound e só depois decidir sobre qualquer coorte restante.

A issue #230 deve permanecer aberta até um lead real consentido ter persistência, delivery, receipt e ação humana observáveis.

## Flags finais desta rodada

```text
BOFU_CODE_READY=true
BOFU_TRANSPORT_CONFIG_READY=false
BOFU_SKIPPED_AUDITED=true
BOFU_SAFE_REQUEUE_READY=true
BOFU_HISTORICAL_REAL_REPLAY_PROVEN=false
BOFU_PRODUCTION_HANDOFF_READY=false
BOFU_REAL_LOOP_PROVEN=false
BOFU_REVENUE_CONVERGENCE_READY=false
READY_FOR_FIRST_REAL_CONTACT=false
```

```text
O sistema está agora configurado para que o próximo lead B2G real consentido seja persistido, entregue exatamente uma vez ao Warmbly e apareça como ação humana sem qualquer auto-send? NO

Já existe prova de um lead real atravessando o circuito completo? NO
```
