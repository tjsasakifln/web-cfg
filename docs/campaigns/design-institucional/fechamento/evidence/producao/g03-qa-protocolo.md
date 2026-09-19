# G03 — Protocolo executável do QA de recebimento (3 envios reais)

Campanha CONFENGE-POS-REDESIGN-FECHAMENTO-20260918 · release `4cfa6adca` (artifact `004d3534…`, build 2026-09-18T18:52:37Z).
Prontidão medida em 2026-09-18T19:45Z: `prontidao-operacional-4cfa6adca.json` (mesma pasta). Resend `verified`, ops storage ok, Warmbly `{"status":"ok"}`, `LEAD_REQUIRE_TURNSTILE=1`, `LEAD_REQUIRE_ORIGIN=1`, `LEAD_DELIVERY_TIMEOUT_MS` ausente (5000 ms).

## 0. Regras

- Quem envia é **um humano num navegador real** (Chrome/Firefox normal, não headless, não Playwright). O Turnstile é de uso único e carrega ao focar o formulário; automação de submit está fora deste protocolo (ver §5).
- Aba normal (não privada): a chave de idempotência `fe-<uuid>` vive em `sessionStorage` por página/asset/cta. Cada rota (A, B, C) tem chave própria → 3 registros distintos são o esperado.
- Sem parâmetros `utm_*` na URL. Sem cache-buster. Sem as palavras `synthetic`, `qa`, `internal`, `probe`, `test`, `[qa]`, `do not contact` em nenhum campo (classificariam o registro como não-real em `record-kind.cjs` e/ou o esconderiam do INBOUND NOW no Warmbly).
- Identidade em todos os envios: nome `Tiago Sasaki`, e-mail `tiago.sasaki@confenge.com.br`, telefone em branco, empresa em branco. Consentimento marcado.
- Espaçar os envios ≥ 30 s. Limite do servidor: 8 envios/IP e 12/fingerprint a cada 10 min.
- Anotar, para cada envio, hora UTC do clique e a URL de destino após o redirecionamento.
- Correlação (§3) roda **no host** (`ssh ec-prod`) e grava apenas ids, status, timestamps. Nunca copiar `to`, `nome`, `telefone`, `email`, `mensagem` para a evidência.

## 1. Envios

Ordem: A → B → C. Ler o `lead_id` de cada envio antes do próximo.

### A — Home `#contato` · REF-FECH-20260918-A1

1. Abrir `https://confenge.com.br/#contato`.
2. Painel "Contato essencial" do formulário `#formulario-contato`: `nome` = `Tiago Sasaki`; `email` = `tiago.sasaki@confenge.com.br`; `telefone` vazio; `estagio` = selecionar **"Ainda não sei qual serviço preciso, quero ser orientado"** (journey `outro`).
3. Clicar **"Adicionar mais detalhes"** (botão secundário ao fim do painel essencial; abre o painel "Detalhes opcionais" — desde LAPIDACAO-COMERCIAL-20260918 este passo é opcional: consentimento e o botão de envio ficam fora dos dois painéis, sempre visíveis; sem detalhes, ir direto ao passo 5).
4. Painel "Detalhes opcionais": `mensagem` = `REF-FECH-20260918-A1 QA de recebimento pós-redesign. Pedido: confirmar recebimento deste protocolo; não é demanda técnica.`; demais campos vazios. ("Voltar" devolve ao painel essencial sem perder o preenchido.)
5. Marcar `consentimento` (caixa "Autorizo o uso destes dados…", logo abaixo do painel visível, acima do botão de envio).
6. Aguardar o widget Turnstile (`#turnstile-slot`, entre o consentimento e o botão) terminar (ícone verde/"Success"). Se abrir desafio interativo, resolvê-lo manualmente.
7. Clicar **"Descrever minha situação"** (submit, botão primário sempre visível abaixo do consentimento).
8. Esperado: redirecionamento em ≤ 15 s para `/obrigado?receipt=lead-<27 hex>` (ou o destino da journey) com "Protocolo de recebimento: lead-…" visível. Anotar `LEAD_A=lead-…`.
9. Contraprova do caminho mínimo (uma vez, sem novo envio): recarregar `/#contato`, preencher só nome, e-mail e necessidade, marcar consentimento e conferir que "Descrever minha situação" está clicável sem abrir "Adicionar mais detalhes"; ao clicar com o e-mail e o WhatsApp vazios, a mensagem "Informe um WhatsApp ou um e-mail" aparece no painel essencial (não enviar).

### B — `/medicoes-glosas-obras-publicas/#captura-pilar` · REF-FECH-20260918-B1

1. Abrir `https://confenge.com.br/medicoes-glosas-obras-publicas/#captura-pilar`.
2. Formulário `.pillar-capture-form` (cta `medicoes-glosas-obras-publicas-handraise`): `nome` = `Tiago Sasaki`; `email` = `tiago.sasaki@confenge.com.br`; `mensagem` = `REF-FECH-20260918-B1 QA de recebimento pós-redesign (pilar medições e glosas). Pedido: confirmar recebimento; não é demanda técnica.`; marcar `consentimento`.
3. Turnstile compact concluído → clicar **"Descrever a medição"**.
4. Esperado: redirecionamento com `?receipt=lead-…`. Anotar `LEAD_B`.

### C — `/entregas/#captura-entregas` · REF-FECH-20260918-C1

1. Abrir `https://confenge.com.br/entregas/#captura-entregas`.
2. Formulário `.pillar-capture-form` (cta `entregas-hub-handraise`): `deliverable_id` deixar no valor padrão; `nome` = `Tiago Sasaki`; `email` = `tiago.sasaki@confenge.com.br`; `mensagem` = `REF-FECH-20260918-C1 QA de recebimento pós-redesign (hub de entregas). Pedido: confirmar recebimento; não é demanda técnica.`; marcar `consentimento`.
3. Turnstile compact concluído → clicar **"Saber qual entrega resolve a minha pergunta"**.
4. Esperado: redirecionamento com `?receipt=lead-…`. Anotar `LEAD_C`.

### Se o navegador mostrar "Não recebemos a confirmação a tempo"

O registro pode existir. **Não** reescrever dados; clicar enviar de novo na mesma aba (mesma chave → recibo idempotente `200`, sem novo Turnstile). Se ainda falhar, parar e correlacionar pelo assunto no Resend (§3.4 fallback) e por `received_at` no ops (`leads&kind=real`).

## 2. Verificação imediata no navegador (sem enviar nada mais)

- Caixa `tiago.sasaki@confenge.com.br`: 3 e-mails de `CONFENGE Leads <leads@confenge.com.br>` com assunto `Lead CONFENGE [<jornada>] <estagio> · <lead_id>` (A: `[outro]`; B e C: jornada do pilar). Anotar hora de chegada. Conferir cabeçalho DKIM `d=confenge.com.br` = pass.

## 3. Correlação por lead_id (host, somente leitura)

```bash
ssh ec-prod
set -a; . /etc/confenge-web/runtime.env; set +a
LEAD_A=lead-…; LEAD_B=lead-…; LEAD_C=lead-…   # preencher com os 3 recibos do §1 (jq está em /usr/bin/jq no host)
OPS=http://127.0.0.1:18100/.netlify/functions/ops
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
#           receipt.delivery.email_status=ok; counters.persisted_leads=23+N, delivered=17+N

# 3.3 provider_id do Resend. ATENÇÃO: com pii=0 o action=lead devolve delivery só como
#     {notify:<status>, email:<status>} (ops.cjs:364-376, lead-stages.cjs:216-221). provider_id, http e
#     reason só existem no objeto delivery completo, que exige pii=1 e também expõe nome/telefone/email.
#     Por isso: pii=1 SÓ no shell do host e SÓ com o filtro jq abaixo; nunca gravar a saída bruta.
PID=$(curl -s -H "Authorization: Bearer $OPS_TOKEN" "$OPS?action=lead&id=$L&pii=1" \
 | jq -r '.lead.delivery.email.provider_id // empty')
curl -s -H "Authorization: Bearer $OPS_TOKEN" "$OPS?action=lead&id=$L&pii=1" \
 | jq '{email_status:.lead.delivery.email.status, http:.lead.delivery.email.http, reason:.lead.delivery.email.reason, provider_id:.lead.delivery.email.provider_id, notify:.lead.delivery.notify.status}'
# esperado: email_status=ok, http=200, provider_id=<uuid Resend>

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

# 3.6 agregados pós-QA (comparar com prontidao-operacional-4cfa6adca.json)
curl -s -H "Authorization: Bearer $OPS_TOKEN" "$OPS?action=leads&kind=real" | jq '{count, sla_breaches, counts_by_kind}'
# esperado: count=3, counts_by_kind.real=3, synthetic=23
docker exec warmbly-confenge-postgres-1 psql -U warmbly -d warmbly_dev -At -F'|' -c \
 "select count(*), status from outreach_inbound_leads group by status order by status"
# esperado: OPEN 19 | SUPPRESSED 23
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

Em `docs/campaigns/design-institucional/fechamento/evidence/producao/g03-qa-resultado.json`: por envio `{ref, rota, clicado_em_utc, lead_id, receipt_url_sem_query_extra, ops_lead (3.1), handoff_receipt (3.2), delivery_extrato (3.3, sem PII), resend (3.4), warmbly (3.5), email_recebido_em}` + agregados 3.6. Nenhum campo de contato, nenhuma mensagem, nenhuma chave.
