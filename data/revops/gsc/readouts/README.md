# Readouts datados do consumidor GSC (host)

Registro, por data, do que o consumidor autenticado do host respondeu para o
snapshot privado do Search Console. Fecha a pendência 6 de
`docs/campaigns/bofu-integral-20260919/README.md` (readout GSC ≥ 2026-09-08 para
os holds `KEEP_NOINDEX`) ou prova, com data, que a leitura ficou INDISPONÍVEL.

Regra: ausência de readout, leitura não executada ou resposta que não seja
`CURRENT` é **INDISPONÍVEL**, nunca zero e nunca "sem tráfego". O snapshot
rastreado em `data/revops/gsc/insights_latest.json` tem `as_of` próprio e
envelhece; `ready_for_product_decisions: true` gravado nele não é frescor
(a janela máxima é `max_as_of_lag_days: 14`, ver `scripts/revops/gsc_history.py`).

## Como produzir um readout (operador, no host)

Sem texto de consulta: só metadados, contagens e hash. O comando lê o endpoint
autenticado do host (`OPS_TOKEN` está em `runtime.env` no ec-prod; nunca no
repositório):

```sh
# no host (ssh ec-prod), com OPS e OPS_TOKEN carregados do runtime.env
curl -s -H "Authorization: Bearer $OPS_TOKEN" "$OPS?action=gsc_insights" \
  | jq '{as_of: .meta.as_of, status, source_kind: .meta.delivery_source, ready: .meta.ready_for_product_decisions, counts: .insights.counts, snapshot_sha256: .meta.snapshot_sha256}'
curl -s -H "Authorization: Bearer $OPS_TOKEN" "$OPS?action=gsc_history" \
  | jq '{status: .readiness.status, last_known_good: .last_known_good.as_of, last_attempt: .last_attempt.at, reason_codes: .readiness.reason_codes}'
```

Grave a saída como `data/revops/gsc/readouts/<AAAA-MM-DD>.json` com:

- `read_at` (UTC), `read_by` (papel, não pessoa), `executed: true`;
- `host_consumer.gsc_insights` e `host_consumer.gsc_history` (as saídas acima,
  sem `insights.analyses` nem qualquer `query_text`);
- `response_sha256` de cada corpo bruto (para reconciliar com `snapshot_sha256`);
- `repository_snapshot` avaliado na mesma data (`as_of`, `lag_days`, `status`).

Se a leitura não foi executada (sem acesso, sem credencial, sem host), grave o
mesmo arquivo com `executed: false`, `status: "INDISPONIVEL"` e o motivo.

## Verificação

`node --test scripts/revops/test_gsc_freshness_probe.mjs` lê o readout mais
recente deste diretório e confere que a avaliação do snapshot rastreado
(`as_of` + 14 dias contra a data do readout) bate com o que o readout declara,
e que nenhum readout carrega texto de consulta.
