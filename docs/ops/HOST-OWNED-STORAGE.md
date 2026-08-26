# Persistência portátil — contrato e inventário

**Estado desta entrega:** `HOST_OWNED_STORAGE_READY / LIVE_DATA_MIGRATION_NOT_YET_EXECUTED`
**Decisão:** `EXECUTE_NOW` (P0)
**Frente executiva:** SCALE / SUNSET
**Alavancas:** automação, dados, confiança e receita
**Tempo para evidência:** testes herméticos nesta PR; evidência live somente no cutover autorizado.

O backend escolhido é filesystem host-owned em um diretório durável dedicado,
bind-mounted fora do release. Os contratos e o volume de uma única VPS não
justificam Postgres, Redis, S3 nem outro serviço. Esta implementação não cria
CRM, identidade, crawler ou DataLake. O `web-cfg` continua proprietário apenas
da captura pública; o handoff normalizado `CONFENGE_WEB` continua indo ao
Warmbly, que permanece proprietário da ação comercial.

Repetir a captura cem vezes melhora o mesmo sistema: cada repetição exercita a
primitiva atômica, os índices determinísticos, a retenção e o outbox. Não cria
cem operações manuais nem usa volume de registros como North Star.

## Inventário obrigatório

| consumer | dado | operação R/W | backend atual antes desta PR | retenção | sensibilidade | backend-alvo |
| --- | --- | --- | --- | --- | --- | --- |
| `lead.cjs`, `ops.cjs`, `inbound-handoff.cjs` | lead mínimo, consentimento, atribuição, delivery e outbox Warmbly | get, getByIdempotency, create-only put, update, delete, list | `confenge-leads`; File/HTTP/Memory alternativos | `delete_after`, 730 d default | crítica: contato, mensagem, CNPJ, hashes, valores | namespace `leads` + índice `leads-idempotency` |
| `market-answer-intake.cjs`, `scripts/conversion/**` | recibo X-Ray e handraise | get/idempotency, create-only put, update, list ops | `confenge-leads` | lead 730 d; recibos legados sem prazo | alta: CNPJ e possível PII | `leads`, preservando `kind`, sem segunda identidade |
| eligibility/terms/offer persist | aceite e preparação de oferta gravados como `offer:*` | get/idempotency, create-only put | `confenge-leads` | expiry quando declarado | alta/legal | `leads`, por compatibilidade do contrato existente |
| `collect.cjs`, leitura em `ops.cjs` | analytics first-party minimizado | append/create-only, list últimos 14 d | `confenge-analytics` ou arquivos locais | 90 d default; leitura ops 14 d | baixa/média: SID, IP hash, correlação; PII proibida | `analytics-events` |
| `nurture.cjs` | subscription, consentimento, estado, send log, token selado | get, put, list | `confenge-nurture/subs` ou arquivo/memória | 730 d default | crítica: e-mail e token selado | `nurture-subscriptions` |
| `nurture.cjs` | suppression/unsubscribe | put, list | `confenge-nurture/suppression` | sem purge genérico; revogação durável | crítica | `nurture-suppressions` |
| `correction.cjs` | pedido de correção e contato | create-only put, get, list, delete | `confenge-corrections` ou arquivo/memória | 730 d default | crítica: contato e texto livre | `corrections` |
| `search-observation.cjs` | agregados GSC e outbox | get, create-only put, update, list | `search-obs/` em `confenge-leads` | 730 d default | estratégica, sem query/PII | `search-observations` |
| `commercial-event.cjs` | evento cross-system e outbox | get, create-only put, update, list | `commercial-event/` em `confenge-leads` | 730 d default | comercial | `commercial-events` |
| `ops.cjs` | GSC operacional e snapshots de rollback | get/put system record | `system/` em `confenge-leads`; snapshot pseudo-lead | sem purge genérico | estratégica privada | `ops-system`; snapshot deixa de ser best-effort |
| checkout/webhooks sandbox | reservas, events, processed receipts | get, putIfAbsent, put, list/delete adapter | `confenge-offers-sandbox` | TTL 48 h quando declarado | média | `offers-sandbox` |
| checkout/webhooks production (flags continuam off) | aceite, mapeamento provider e recibos | get, putIfAbsent, put, list/delete adapter | `confenge-offers-production` | expiry/730 d conforme record | crítica/legal/financeira | `offers-production`, isolado no mesmo root |
| `data/nurture`, `data/offers`, `data/conversion`, GSC fallback e demais `data/**` empacotados | catálogos, tracks, flags, fixtures, fallback redigido | somente leitura | Git + bundle | versionado | público/sintético ou estratégico redigido | **permanece estático; não vira DB** |

## Contrato do filesystem

- `CONFENGE_STORAGE_BACKEND=filesystem` e `CONFENGE_STORAGE_DIR` absoluto são
  obrigatórios na Netcup. Backend ausente ou inválido falha fechado.
- O root deve existir, ter `0700` e estar fora do release. Subdiretórios são
  `0700`; records são `0600`.
- Nome de arquivo é SHA-256 completo da chave lógica. IDs, e-mail, telefone ou
  idempotency key não aparecem em nomes.
- Cada arquivo tem envelope versionado, hash da chave e hash canônico do
  payload. JSON truncado, checksum divergente, índice órfão, permissão insegura
  ou erro de leitura gera erro explícito; nunca vira “not found”.
- Create-only usa temp privado, `fsync`, hard-link atômico e `fsync` do
  diretório. Update usa temp, `fsync`, rename atômico e `fsync`.
- Writers e snapshot compartilham lock cross-process no root. Duas requests
  iguais convergem para um record/receipt; a chave de lead continua produzindo
  `lead_id` determinístico.
- Chaves lógicas nunca são concatenadas ao path. Root, namespace e arquivo são
  validados com `lstat`; arquivos são abertos com `O_NOFOLLOW`.

## Seleção e coexistência

| ambiente | configuração | comportamento |
| --- | --- | --- |
| Netcup | `CONFENGE_STORAGE_BACKEND=filesystem` + root explícito | nenhuma resolução de `@netlify/blobs`; persistência sobrevive restart/deploy |
| Netlify durante rollback | `CONFENGE_STORAGE_BACKEND=netlify-blobs` | adapter legado lazy, mesmos stores atuais |
| Netlify atual ainda não reconfigurado | contexto Blobs presente | inferência legada temporária, **sem** fallback para memory |
| teste/local | backend explícito ou aliases legados | memory somente test/non-production |
| qualquer production sem backend | ausente/inválido | readiness false e intake 503 |

`storageReadiness()` em `netlify/functions/lib/storage-config.cjs` é a interface
mínima que o runtime portátil do goal 01 deve chamar na rota `/ready`. A
branch-base desta PR ainda não contém essa rota; esta PR não cria nem altera o
servidor HTTP independente.

## Hipótese, autoridade e rollback

- **Visitor job:** enviar uma solicitação consentida e receber um único receipt,
  inclusive durante retry/restart.
- **Hipótese de aquisição/conversão:** remover a dependência do host sem mudar a
  jornada reduz risco de perda de captura e preserva o tempo de handoff.
- **Owner/contract:** `web-cfg` captura; Warmbly recebe `CONFENGE_WEB` e executa;
  `extra-cli` não é replicado.
- **Analytics:** contrato first-party e proibição de PII permanecem; só o adapter
  durável muda.
- **Rollback:** manter tráfego Netlify no adapter legado ou publicar o deploy
  conhecido anterior. Após um futuro cutover com escrita na Netcup, reconcile e
  sync create-only reverso são obrigatórios antes de devolver tráfego à Netlify.
- **ADR afetado:** nenhuma fronteira de ADR é alterada. A mudança implementa
  portabilidade do plano público; DNS/runtime authority só muda em goal próprio.

## Residual exato

1. Nenhum dado live foi exportado, importado, removido ou migrado nesta PR.
2. O contexto Netlify legado permanece aceito para não quebrar produção antes do
   cutover; removê-lo e retirar `@netlify/blobs` do npm exige janela encerrada e
   rollback sem dependência de Blobs.
3. O goal 01 deve consumir `storageReadiness()` em `/ready` quando seu servidor
   entrar na base comum.
4. A ativação host, bind mount, backup schedule, export inicial/delta, drain e
   reconcile live continuam ações externas deliberadamente não executadas.
