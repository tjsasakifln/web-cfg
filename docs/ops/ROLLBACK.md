# Rollback de produção (nginx / Netcup)

## Objetivo

Identificar o SHA público, a saúde do processo e restaurar um release
conhecido sem adivinhar o host, sem a UI da Netlify e sem apagar leads.

Produção é o plano `public_canonical` em
[`docs/architecture/RUNTIME-AUTHORITY.md`](../architecture/RUNTIME-AUTHORITY.md).
O comando canônico no host é `/opt/confenge-web/bin/rollback <FULL_SHA>`.
Ele faz o mesmo swap atômico de `current` que a promoção: valida o candidato,
troca o symlink, recarrega nginx, verifica identidade ao vivo e, se falhar,
restaura o symlink anterior.

Stage não troca `current`. Legacy Netlify não é produção.

## 1. Identificar o SHA e a saúde (somente leitura)

```bash
curl -sS -D - -o /dev/null https://confenge.com.br/ | tr -d '\r' | grep -Ei '^(HTTP/|server:|x-confenge-host-architecture-version:)'
curl -sS https://confenge.com.br/.well-known/build-info.json
curl -sS https://confenge.com.br/.well-known/runtime-info.json
curl -sS https://confenge.com.br/healthz
curl -sS https://confenge.com.br/ready
curl -sS "https://confenge.com.br/.netlify/functions/ops?action=health"
```

Anotar:

| Campo | Fonte | Esperado em produção |
| --- | --- | --- |
| `Server` | homepage | `nginx` |
| `X-Confenge-Host-Architecture-Version` | homepage | `confenge-nginx-node/v2` |
| `commit` / `release_sha` | build-info e runtime-info | 40 hex; iguais entre si |
| `environment` | build-info e runtime-info | `production` |
| `profile` | runtime-info | `netcup-production` |
| `storage_backend` | runtime-info e ops health | `filesystem` |
| `/healthz` | JSON `status` | `live` |
| `/ready` | JSON `ok` | `true` |

Comparar o SHA observado com `git rev-parse origin/main` (produção segue
`main`, não o HEAD de um PR aberto). O gate hermético:

```bash
npm run test:runtime-authority
```

Opcional, read-only contra o vivo (SHA versus `origin/main`):

```bash
node scripts/site/runtime_authority.mjs --live
```

No host, se o SSH de deploy estiver autorizado:

```text
readlink /opt/confenge-web/current
readlink /opt/confenge-web/rollback
tail -n 20 /opt/confenge-web/evidence/deploy.ndjson
```

## 2. Caminho de release

```text
main
  -> site-ci (único build público)
  -> _site + runtime portátil + contrato nginx gerado, nomeados pelo FULL_SHA
  -> tar determinístico + manifest SHA-256 destacado + atestação GitHub
  -> SSH upload em /opt/confenge-web/incoming/.upload-FULL_SHA-RUN_ID-ATTEMPT
  -> adoção atômica como incoming/FULL_SHA
  -> stage-release + verify-release (não muda current)
  -> promote-release (swap atômico de current + nginx -t + reload + smoke)
  -> evidência append-only em /opt/confenge-web/evidence/deploy.ndjson
```

Dispatch (não executado por esta documentação; produção já responde neste host):

```bash
gh workflow run netcup-release.yml --repo tjsasakifln/web-cfg --ref main -f operation=package_only
gh workflow run netcup-release.yml --repo tjsasakifln/web-cfg --ref main -f operation=stage_verify
gh workflow run netcup-release.yml --repo tjsasakifln/web-cfg --ref main -f operation=promote
```

`promote` continua atrás do ambiente GitHub `netcup-production` e da variável
`NETCUP_CUTOVER_AUTHORIZED=CONFENGE_NETCUP_CUTOVER_APPROVED`. Esta documentação
não cria essa variável e não dispara o workflow.

Host:

```text
/opt/confenge-web/bin/stage-release <FULL_SHA>
/opt/confenge-web/bin/verify-release <FULL_SHA>
CONFENGE_LOCAL_ORIGIN=http://127.0.0.1:8088 /opt/confenge-web/bin/promote-release <FULL_SHA>
CONFENGE_LOCAL_ORIGIN=http://127.0.0.1:8088 /opt/confenge-web/bin/rollback <FULL_SHA>
```

## 3. Atomicidade

- Cada release é um diretório real `/opt/confenge-web/releases/<FULL_SHA>`.
- `current` e `rollback` são symlinks. A troca é `symlink` + `rename` + `fsync`
  do diretório raiz.
- nginx recarrega depois de cada promote/rollback porque os includes gerados
  (`headers`, `redirects`, `runtime-locations`, `locations`) são lidos no load.
  Trocar só o symlink muda o `root` estático e não as políticas já parseadas.
- Persistência de leads fica em `/var/lib/confenge-web`, fora da árvore de
  release. Rollback de `current` **não** apaga nem reescreve leads.
- Falha depois do swap restaura o symlink anterior, reinicia o runtime
  anterior, recarrega nginx e revalida. Evidência `AUTO_ROLLBACK_OK` ou
  `AUTO_ROLLBACK_FAILED`.

## 4. Verificação depois de promover ou reverter

1. `build-info.json` `commit` = SHA alvo
2. `runtime-info.json` `release_sha` = SHA alvo e
   `host_architecture_version=confenge-nginx-node/v2`
3. Homepage 200, `Server: nginx`
4. `/healthz` live, `/ready` ok
5. `POST /.netlify/functions/lead` com payload sintético (ou 503 se store/env
   incompatível — documentar; não tratar 503 como sucesso)
6. `robots.txt` e `sitemap-index.xml` 200
7. Registrar quem, quando, from→to SHA, evidência `ROLLED_BACK`/`PROMOTED`,
   resultado. Sem PII.

## 5. Rollback autorizado

1. Escolher um SHA **já verificado** em `/opt/confenge-web/releases/`. O alvo
   típico é `readlink /opt/confenge-web/rollback`.
2. Confirmar que o SHA existe e que `verify-release` já passou nesse SHA.
3. Executar `/opt/confenge-web/bin/rollback <FULL_SHA>` com
   `CONFENGE_LOCAL_ORIGIN=http://127.0.0.1:8088`.
4. Rodar a verificação da seção 4.
5. Se o rollback foi de emergência, abrir PR de correção a partir do tip de
   `main` e promover pelo caminho de release. Nunca force-push em `main` como
   substituto de rollback.

Não usar a UI da Netlify, `netlify api restoreSiteDeploy`, nem republicar um
deploy Netlify para restaurar `confenge.com.br`.

## 6. Recuperação de lead

O store de produção é filesystem host-owned (`CONFENGE_STORAGE_BACKEND=filesystem`,
`CONFENGE_STORAGE_DIR=/var/lib/confenge-web`). Ele sobrevive ao rollback de
release.

| Situação | Ação |
| --- | --- |
| Rollback de site (SHA ruim) | Não mexer no store. Leads permanecem. |
| Store corrompido ou disco | Restaurar snapshot para um diretório **novo**, nunca sobre o live. |
| Precisa reativar snapshot | Reconciliar DSAR/deletes e suppressions posteriores; só então apontar env/mount. O restore termina em `RESTORE_VALIDATED_NOT_ACTIVATED`. |

```bash
npm run storage:backup -- verify --snapshot /var/backups/confenge-web/confenge-storage-YYYYMMDDTHHMMSSZ
npm run storage:backup -- restore --snapshot /var/backups/confenge-web/confenge-storage-YYYYMMDDTHHMMSSZ --target /var/lib/confenge-web-restore-candidate
npm run storage:backup -- restore --snapshot /var/backups/confenge-web/confenge-storage-YYYYMMDDTHHMMSSZ --target /var/lib/confenge-web-restore-candidate --apply
```

Export operacional (PII fora do git):

```bash
# no host, com o store live montado e ops auth
node scripts/revops/export_leads.mjs --out /var/backups/confenge-web/leads-export.jsonl --kind real
```

Não publicar export em `_site/`, artifact de CI ou allowlist pública. Blobs da
Netlify não são o caminho de produção.

## 7. Warmbly inbound (sem rollback de site)

Para desligar só o handoff comercial: remover
`CONFENGE_INBOUND_WEBHOOK_URL` / `CONFENGE_INBOUND_WEBHOOK_SECRET` no
EnvironmentFile e reiniciar `confenge-web-runtime.service`. A captura local
continua. Não redirecionar `OPS_WEBHOOK_URL` para
`/api/v1/webhooks/confenge/inbound`.

## 8. Checklist seguro para drill autorizado futuro

Não executar este drill sem autorização explícita do founder. Não mudar DNS.
Não promover. Não rodar rollback real “para ver”. Esta lista é o ensaio
documental.

Preflight (read-only):

- [ ] Autorização escrita (issue/comentário) com SHA alvo e janela.
- [ ] `curl` de build-info, runtime-info, `/healthz`, `/ready` capturados.
- [ ] SHA vivo = `origin/main` ou SHA de emergência declarado.
- [ ] `readlink current` e `readlink rollback` conferidos.
- [ ] SHA alvo existe em `/opt/confenge-web/releases/` e já foi `VERIFIED`.
- [ ] Snapshot recente de `/var/lib/confenge-web` verificado (checksum).
- [ ] Canal ops acordado; sem PII no chat público.

Ensaio (somente se autorizado):

- [ ] `rollback <FULL_SHA>` no host.
- [ ] Seção 4 verde.
- [ ] Lead sintético persiste no filesystem (mesmo `lead_id` se retry).
- [ ] Re-promote do SHA de `main` se o drill era temporário.
- [ ] Evidência `ROLLED_BACK` / `PROMOTED` anexada.

Abortar se: SHA alvo ausente, `/ready` já falso, snapshot não verificado, ou
qualquer passo exigir edição de DNS/nginx manual.

## Limites

- Rollback de release não reverte o EnvironmentFile.
- Rollback de release não apaga nem restaura leads; isso é o store host-owned.
- O workflow `netcup-release.yml` não altera DNS e não instala timers.
- `confenge.netlify.app` é leftover; 301 para o canônico não o torna produção.
