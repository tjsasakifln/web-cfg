# G03 — Protocolo executável do QA de recebimento (3 envios reais)

Campanha CONFENGE-BOFU-FECHAMENTO-20260919 (re-datado de CONFENGE-POS-REDESIGN-FECHAMENTO-20260918) · release `fedb4768b` (artifact `2b2de021…`, build 2026-09-19T19:54:34Z).
Prontidão medida em 2026-09-19T23:11Z: `prontidao-operacional-fedb4768b.json` (mesma pasta; GET públicos, sem ssh). Borda: build-info e runtime-info servem `fedb4768b`/`2b2de021…`; ops `health` ok (storage filesystem); Warmbly inbound health `READY`, `auto_send_enabled=false`; as três rotas de captura respondem 200 com âncora, formulário e slot Turnstile. Resend, contadores autenticados, systemd, psql e env do runtime estão marcados `INDISPONIVEL_SEM_SSH` no snapshot com o comando exato: ler no host **imediatamente antes do envio A** (§3.0) e gravar como "valor anterior" na evidência (§6).
Antes de qualquer envio, uma sonda sintética precisa ter batido em `fedb4768b` (§3.0): a última run diária registrada (35448519033, 14:22Z) ainda lia outra release.

## 0. Regras

- Quem envia é **um humano num navegador real** (Chrome/Firefox normal, não headless, não Playwright). O Turnstile é de uso único e carrega ao focar o formulário; automação de submit está fora deste protocolo (ver §5).
- Aba normal (não privada): a chave de idempotência `fe-<uuid>` vive em `sessionStorage` por página/asset/cta. Cada rota (A, B, C) tem chave própria → 3 registros distintos são o esperado.
- Sem parâmetros `utm_*` na URL. Sem cache-buster. Sem as palavras `synthetic`, `qa`, `internal`, `probe`, `test`, `[qa]`, `do not contact` em nenhum campo (classificariam o registro como não-real em `record-kind.cjs` e/ou o esconderiam do INBOUND NOW no Warmbly).
- Identidade em todos os envios: nome `Tiago Sasaki`, e-mail `tiago.sasaki@confenge.com.br`, telefone em branco, empresa em branco. Consentimento marcado.
- Espaçar os envios ≥ 30 s. Limite do servidor: 8 envios/IP e 12/fingerprint a cada 10 min.
- Anotar, para cada envio, hora UTC do clique e a URL de destino após o redirecionamento.
- Correlação (§3) roda **no host** (`ssh ec-prod`) e grava apenas ids, status, timestamps. Nunca copiar `to`, `nome`, `telefone`, `email`, `mensagem` para a evidência; nenhum passo consulta o ops com dados de contato (a projeção sem contato já traz o `provider_id`).

## 1. Envios

Ordem: A → B → C. Ler o `lead_id` de cada envio antes do próximo.

### A — Home `#contato` · REF-A06-20260919-A1

1. Abrir `https://confenge.com.br/#contato`.
2. Painel "Contato essencial" do formulário `#formulario-contato`: `nome` = `Tiago Sasaki`; `email` = `tiago.sasaki@confenge.com.br`; `telefone` vazio; `estagio` = selecionar **"Ainda não sei qual serviço preciso, quero ser orientado"** (journey `outro`).
3. Clicar **"Adicionar mais detalhes"** (botão secundário ao fim do painel essencial; abre o painel "Detalhes opcionais" — desde LAPIDACAO-COMERCIAL-20260918 este passo é opcional: consentimento e o botão de envio ficam fora dos dois painéis, sempre visíveis; sem detalhes, ir direto ao passo 5).
4. Painel "Detalhes opcionais": `mensagem` = `REF-A06-20260919-A1 QA de recebimento pós-redesign. Pedido: confirmar recebimento deste protocolo; não é demanda técnica.`; demais campos vazios. ("Voltar" devolve ao painel essencial sem perder o preenchido.)
5. Marcar `consentimento` (caixa "Autorizo o uso destes dados…", logo abaixo do painel visível, acima do botão de envio).
6. Aguardar o widget Turnstile (`#turnstile-slot`, entre o consentimento e o botão) terminar (ícone verde/"Success"). Se abrir desafio interativo, resolvê-lo manualmente.
7. Clicar **"Descrever minha situação"** (submit, botão primário sempre visível abaixo do consentimento).
8. Esperado: redirecionamento em ≤ 15 s para `/obrigado?receipt=lead-<27 hex>` (ou o destino da journey) com "Protocolo de recebimento: lead-…" visível. Anotar `LEAD_A=lead-…`.
9. Contraprova do caminho mínimo (uma vez, sem novo envio): recarregar `/#contato`, preencher só nome, e-mail e necessidade, marcar consentimento e conferir que "Descrever minha situação" está clicável sem abrir "Adicionar mais detalhes"; ao clicar com o e-mail e o WhatsApp vazios, a mensagem "Informe um WhatsApp ou um e-mail" aparece no painel essencial (não enviar).

### B — `/medicoes-glosas-obras-publicas/#captura-pilar` · REF-A06-20260919-B1

1. Abrir `https://confenge.com.br/medicoes-glosas-obras-publicas/#captura-pilar`.
2. Formulário `.pillar-capture-form` (cta `medicoes-glosas-obras-publicas-handraise`): `nome` = `Tiago Sasaki`; `email` = `tiago.sasaki@confenge.com.br`; `mensagem` = `REF-A06-20260919-B1 QA de recebimento pós-redesign (pilar medições e glosas). Pedido: confirmar recebimento; não é demanda técnica.`; marcar `consentimento`.
3. Turnstile compact concluído → clicar **"Descrever a medição"**.
4. Esperado: redirecionamento com `?receipt=lead-…`. Anotar `LEAD_B`.

### C — `/entregas/#captura-entregas` · REF-A06-20260919-C1

1. Abrir `https://confenge.com.br/entregas/#captura-entregas`.
2. Formulário `.pillar-capture-form` (cta `entregas-hub-handraise`): `deliverable_id` deixar no valor padrão; `nome` = `Tiago Sasaki`; `email` = `tiago.sasaki@confenge.com.br`; `mensagem` = `REF-A06-20260919-C1 QA de recebimento pós-redesign (hub de entregas). Pedido: confirmar recebimento; não é demanda técnica.`; marcar `consentimento`.
3. Turnstile compact concluído → clicar **"Saber qual entrega resolve a minha pergunta"**.
4. Esperado: redirecionamento com `?receipt=lead-…`. Anotar `LEAD_C`.

### Se o navegador mostrar "Não recebemos a confirmação a tempo"

O registro pode existir. **Não** reescrever dados; clicar enviar de novo na mesma aba (mesma chave → recibo idempotente `200`, sem novo Turnstile). Se ainda falhar, parar e correlacionar pelo assunto no Resend (§3.4 fallback) e por `received_at` no ops (`leads&kind=real`).

## 2. Verificação imediata no navegador (sem enviar nada mais)

- Caixa `tiago.sasaki@confenge.com.br`: 3 e-mails de `CONFENGE Leads <leads@confenge.com.br>` com assunto `Lead CONFENGE [<jornada>] <estagio> · <lead_id>` (A: `[outro]`; B e C: jornada do pilar). Anotar hora de chegada. Conferir cabeçalho DKIM `d=confenge.com.br` = pass.

## 3. Correlação por lead_id (host, somente leitura)

### 3.0 Antes do envio A: valores anteriores e sonda sintética em `fedb4768b`

O snapshot `prontidao-operacional-fedb4768b.json` foi colhido sem ssh; os absolutos abaixo são lidos no host, **uma vez, imediatamente antes do clique de A**, e gravados na evidência (§6) como `valores_anteriores`. Nunca de memória, nunca de um snapshot anterior. Ordem obrigatória: identidade da release → sonda sintética → valores anteriores. A sonda persiste um registro sintético (e um handoff `delivered`, e uma linha no Warmbly); lida **depois** dela, a linha de base já o contém e a aritmética de §3.2/§3.6 (+N, N = envios humanos) fica válida.

```bash
ssh ec-prod
set -a; . /etc/confenge-web/runtime.env; set +a
OPS=http://127.0.0.1:18100/.netlify/functions/ops
# (1) identidade da release servida
curl -s http://127.0.0.1:18100/.well-known/runtime-info.json | jq '{release_sha, public_artifact_hash}'
# esperado: fedb4768b2fcafb28ba70f3153006a4dbe9fc1e6 / 2b2de021c0fd…; se diferente, parar: o protocolo vale para esta release
curl -s -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/domains/a75ceeb3-52aa-4ae6-8f9c-26f3d82489ea | jq '{name, status}'
# esperado: verified
# (2) sonda sintética contra esta release (record_kind=synthetic, e-mail skipped; não substitui os envios humanos)
cd /opt/confenge-web/current && EXPECTED_SHA=fedb4768b2fcafb28ba70f3153006a4dbe9fc1e6 npm run probe:lead:prod
# guardar só state, receipt_sha256 e checks na evidência; esperado state=TRANSPORT_READY
# (3) valores anteriores, lidos DEPOIS da sonda
curl -s -H "Authorization: Bearer $OPS_TOKEN" "$OPS?action=inbound_handoff" | jq '{counters, configuration, safety_gate}'
# valor anterior: counters.persisted_leads, counters.delivered; esperado contract=READY, auto_send_off=true
curl -s -H "Authorization: Bearer $OPS_TOKEN" "$OPS?action=leads&kind=real" | jq '{count, sla_breaches, counts_by_kind}'
# valor anterior: count, counts_by_kind.real, counts_by_kind.synthetic
docker exec warmbly-confenge-postgres-1 psql -U warmbly -d warmbly_dev -At -F'|' -c \
 "select count(*), status from outreach_inbound_leads group by status order by status"
# valor anterior: OPEN, SUPPRESSED
```

Alternativa sem shell no host para a sonda: `gh workflow run revops-scheduled.yml -f job=daily` e conferir no artifact `revops-daily-<run_id>` `deploy_identity … live=fedb4768b… match=true` e `probe_idempotent_same_id` PASS — também **antes** da leitura dos valores anteriores, pelo mesmo motivo.

```bash
LEAD_A=lead-…; LEAD_B=lead-…; LEAD_C=lead-…   # preencher com os 3 recibos do §1 (jq está em /usr/bin/jq no host)
for L in "$LEAD_A" "$LEAD_B" "$LEAD_C"; do echo "=== $L"

# 3.1 registro durável, sem PII (mensagem vira [present]; delivery só com status)
curl -s -H "Authorization: Bearer $OPS_TOKEN" "$OPS?action=lead&id=$L" \
 | jq '{lead_id:.lead.lead_id, record_kind:.lead.record_kind, stage:.lead.commercial_stage, received_at:.lead.received_at, jornada:.lead.jornada, estagio:.lead.estagio, landing_page:.lead.landing_page, utm_source:.lead.utm_source, next_action:.lead.next_action, needs_contact:.lead.needs_contact, delivery:.lead.delivery}'
# esperado: record_kind=real, stage=lead_persisted, delivery.email=ok, utm_source=null

# 3.2 handoff Warmbly + status de entrega (sem PII)
curl -s -H "Authorization: Bearer $OPS_TOKEN" "$OPS?action=inbound_handoff&lead_id=$L" \
 | jq '{receipt:.receipt, counters:.counters, safety_gate:.safety_gate}'
# esperado: receipt.record_kind=real, receipt.handoff.status=delivered, attempts=1, delivered_at preenchido
#   (real e transportável: inbound-handoff.cjs:1134 só pula non_real; config READY, blocked só por config).
#   Se vier skipped/blocked/retryable: gravar handoff.last_error e safety_gate antes de chamar FAIL,
#           receipt.delivery.email_status=ok; counters.persisted_leads = valor anterior + N,
#           counters.delivered = valor anterior + N (N = envios reais deste QA; "valor anterior" =
#           leitura do §3.0 feita no host antes do envio A, nunca de memória nem de snapshot antigo).

# 3.3 provider_id do Resend, sem contato.
#     A projeção pública (lead-stages.cjs publicLeadSummary → publicDeliveryProjection, commit 505c833ab,
#     contida em fedb4768b) devolve no action=lead sem pii os identificadores do provedor:
#     .lead.delivery = {notify:<status>, email:<status>, email_provider_id, email_http, email_reason?, email_idempotency_key}.
#     Este é o único caminho do protocolo: nenhum passo lê o objeto delivery completo com dados de contato.
PID=$(curl -s -H "Authorization: Bearer $OPS_TOKEN" "$OPS?action=lead&id=$L" \
 | jq -r '.lead.delivery.email_provider_id // empty')
curl -s -H "Authorization: Bearer $OPS_TOKEN" "$OPS?action=lead&id=$L" \
 | jq '{email_status:.lead.delivery.email, http:.lead.delivery.email_http, reason:.lead.delivery.email_reason, provider_id:.lead.delivery.email_provider_id, idempotency_key:.lead.delivery.email_idempotency_key, notify:.lead.delivery.notify}'
# esperado: email_status=ok, http=200, provider_id=<uuid Resend>, idempotency_key=lead-email/<lead_id>
#     PID vazio com email_status=ok: a release servida não é fedb4768b (conferir §3.0) — parar e registrar;
#     PID vazio com email_status=error/pending: seguir para o fallback por assunto (3.4) e §4.

# 3.4 Resend: estado da mensagem (só id, created_at, last_event, subject)
if [ -n "$PID" ]; then
  curl -s -H "Authorization: Bearer $RESEND_API_KEY" "https://api.resend.com/emails/$PID" \
   | jq '{id, created_at, last_event, subject}'
else
  # fallback sem PII: filtrar pelo lead_id no assunto
  curl -s -H "Authorization: Bearer $RESEND_API_KEY" "https://api.resend.com/emails?limit=20" \
   | jq --arg L "$L" '.data[] | select(.subject|contains($L)) | {id, created_at, last_event, subject}'
fi
# esperado: last_event=delivered (ou sent → delivered em minutos)

# 3.5 Warmbly (postgres no container; colunas restritas, nunca lead_email/lead_phone/message)
docker exec warmbly-confenge-postgres-1 psql -U warmbly -d warmbly_dev -At -F'|' -c \
 "select lead_id, status, coalesce(suppress_reason,''), warmbly_ingested_at, coalesce(commercial_action_id::text,''), coalesce(dedupe_of_lead_id,''), raw_payload->>'record_kind' from outreach_inbound_leads where lead_id='$L'"
# esperado A: status=OPEN, suppress_reason vazio, dedupe_of_lead_id vazio, record_kind real/null
# esperado B e C: status=OPEN, dedupe_of_lead_id=<LEAD_A> (janela de 24 h por identity_key,
#                 inbound.go:16 / inbound_ingest.go:103-115) — comportamento esperado, não defeito;
#                 commercial_action_id pode ser herdado de A.
done

# 3.6 agregados pós-QA (comparar com os valores anteriores lidos no host no §3.0, antes do envio A)
curl -s -H "Authorization: Bearer $OPS_TOKEN" "$OPS?action=leads&kind=real" | jq '{count, sla_breaches, counts_by_kind}'
# esperado: count = valor anterior + N, counts_by_kind.real = valor anterior + N (N = envios reais deste QA);
#           counts_by_kind.synthetic = valor anterior, inalterado
docker exec warmbly-confenge-postgres-1 psql -U warmbly -d warmbly_dev -At -F'|' -c \
 "select count(*), status from outreach_inbound_leads group by status order by status"
# esperado: OPEN = valor anterior + N | SUPPRESSED = valor anterior, inalterado
```

Opcional (fila do operador, via túnel `ssh -L 5173:127.0.0.1:5173 ec-prod`): `GET http://127.0.0.1:5173` → INBOUND NOW deve listar A1 (B1/C1 aparecem deduplicados). Não clicar em outcome/dispatch.

## 4. Critério de aceite G03

| Item | Esperado |
|---|---|
| 3 recibos `lead-…` no navegador | ≤ 15 s cada, sem tela de timeout |
| `record_kind` | `real` nos 3 (ops `action=lead`) |
| `delivery.email` | `ok` nos 3; `provider_id` presente; Resend `last_event=delivered` |
| `handoff.status` | `delivered`, `attempts=1` nos 3 (`retryable` reexecuta sozinho; `skipped`/`blocked` só por classificação/config → registrar `reason`) |
| Warmbly | 3 linhas `OPEN`; B e C com `dedupe_of_lead_id=LEAD_A` |
| Caixa de entrada | 3 e-mails, DKIM pass, assunto com o `lead_id` |
| `leads&kind=real` | `count=3`, `sla_breaches=0` (checar antes de 4 h) |

Qualquer `email=error`/`reason=timeout`: conferir no Resend (§3.4) **antes** de qualquer reenvio manual.

## 5. Onde parar se o Turnstile bloquear

- **Sintoma A** — o widget não carrega/não fica verde no navegador humano: parar antes do submit. Registrar rota, hora, navegador, e o console (`challenges.cloudflare.com` bloqueado?). Nenhum registro foi criado; não há o que correlacionar.
- **Sintoma B** — submit devolve 403 (`turnstile_rejected` no journal: `journalctl -u confenge-web-runtime -o short-iso -n 50 | grep turnstile`): o front chama `turnstile.reset()`; tentar **uma** vez mais na mesma aba. Persistindo, parar; o QA fica `DEPENDENCIA_EXTERNA` (Turnstile/site key) e a evidência é o journal + hora.
- **Sintoma C** — 429 `rate_limited`: esperar 10 min; não trocar de IP/navegador para contornar.
- Este protocolo **não** prevê submissão automatizada (Playwright/curl): `LEAD_REQUIRE_TURNSTILE=1` e `LEAD_REQUIRE_ORIGIN=1` reprovam por desenho; o `LEAD_PROBE_SECRET` cria registros sintéticos (`email=skipped`) e não serve para provar o caminho real. Se for necessário automatizar, é decisão do fundador e sai deste protocolo.

## 6. Evidência a gravar

Em `docs/campaigns/design-institucional/fechamento/evidence/producao/g03-qa-resultado-fedb4768b.json`: campo `release` `{commit, artifact_hash, build_time}` copiado do `runtime-info`/`build-info` lidos no §3.0 no momento do envio (precisa ser `fedb4768b2fcafb28ba70f3153006a4dbe9fc1e6`; se a produção já servir outra release, o QA é de outra release e este protocolo é re-datado antes), `valores_anteriores` (§3.0) e `sonda_sintetica` `{state, receipt_sha256, checks}`; por envio `{ref, rota, clicado_em_utc, lead_id, receipt_url_sem_query_extra, ops_lead (3.1), handoff_receipt (3.2), delivery_extrato (3.3, sem contato), resend (3.4), warmbly (3.5), email_recebido_em}` + agregados 3.6. Nenhum campo de contato, nenhuma mensagem, nenhuma chave.
