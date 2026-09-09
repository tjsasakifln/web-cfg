# Rollback de produção (nginx / Netcup)

## Objetivo

Identificar o SHA público, a saúde do processo e restaurar um release
conhecido sem adivinhar o host, sem a UI da Netlify e sem apagar leads.

Produção é o plano `public_canonical` em
[`docs/architecture/RUNTIME-AUTHORITY.md`](../architecture/RUNTIME-AUTHORITY.md).
O rollback canônico executa `deploy/netcup/run_bundle_control.py` a partir de
um checkout limpo do `CONTROLLER_SHA`. O diretório local informado ao runner
deve conter as três partes do envelope preservado em
`/opt/confenge-web/incoming/<CONTROLLER_SHA>`; `--sha` identifica esse mesmo
controller, enquanto `--rollback-target` identifica o `PREVIOUS_SHA` a
restaurar. O runner valida o envelope e o controller, transmite o código pelo
SSH fixado e só então solicita o swap atômico de `current`.

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
| `Server` | homepage | `cloudflare` |
| `X-Confenge-Host-Architecture-Version` | homepage | `confenge-nginx-node/v2` |
| `cf-cache-status` | homepage pública aquecida | `HIT`; health/runtime/ops ficam `DYNAMIC` |
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

Cada push em `main` executa automaticamente a cadeia completa até a promoção.
Dispatch manual é apenas o caminho de diagnóstico/recuperação e exige o SHA
exato observado antes do disparo:

```bash
sha=$(gh api repos/tjsasakifln/web-cfg/git/ref/heads/main --jq .object.sha)
gh workflow run netcup-release.yml --repo tjsasakifln/web-cfg --ref main -f operation=package_only -f expected_sha="$sha"
gh workflow run netcup-release.yml --repo tjsasakifln/web-cfg --ref main -f operation=stage_verify -f expected_sha="$sha"
gh workflow run netcup-release.yml --repo tjsasakifln/web-cfg --ref main -f operation=promote -f expected_sha="$sha"
```

Promoção automática e manual continuam atrás do ambiente GitHub
`netcup-production` e da variável
`NETCUP_CUTOVER_AUTHORIZED=CONFENGE_NETCUP_CUTOVER_APPROVED`. Esta documentação
não cria essa variável e não dispara o workflow.

Runner canônico (checkout limpo em `CONTROLLER_SHA`, bundle do mesmo SHA e
host/porta/chave/known-hosts da configuração autorizada):

```bash
python3 deploy/netcup/run_bundle_control.py \
  --bundle-directory /absolute/local/incoming/<CONTROLLER_SHA> \
  --sha <CONTROLLER_SHA> \
  --operation rollback \
  --rollback-target <PREVIOUS_SHA> \
  --target confenge-deploy@<PINNED_HOST> \
  --ssh-option=-p --ssh-option=<PINNED_PORT> \
  --ssh-option=-o --ssh-option=BatchMode=yes \
  --ssh-option=-o --ssh-option=IdentitiesOnly=yes \
  --ssh-option=-o --ssh-option=StrictHostKeyChecking=yes \
  --ssh-option=-o --ssh-option=UserKnownHostsFile=/absolute/pinned/known_hosts \
  --ssh-option=-i --ssh-option=/absolute/private/key-path
```

O launcher root-owned `/opt/confenge-web/bin/rollback` permanece somente como
referência histórica de provisionamento e recuperação legada. Chamá-lo não
comprova que correções do controller versionado no repositório foram usadas.

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
3. Homepage 200, `Server: cloudflare` e
   `X-Confenge-Host-Architecture-Version: confenge-nginx-node/v2`
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
3. Obter por SSH fixado o envelope exato de
   `/opt/confenge-web/incoming/<CONTROLLER_SHA>` e conferir que o checkout limpo
   está em `CONTROLLER_SHA`.
4. Executar o runner canônico da seção 2 com `--sha <CONTROLLER_SHA>` e
   `--rollback-target <PREVIOUS_SHA>`.
5. Rodar a verificação da seção 4.
6. Se o rollback foi de emergência, abrir PR de correção a partir do tip de
   `main` e promover pelo caminho de release. Nunca force-push em `main` como
   substituto de rollback.

Não usar a UI da Netlify, `netlify api restoreSiteDeploy`, nem republicar um
deploy Netlify para restaurar `confenge.com.br`.

Rollback de release não altera DNS nem a regra de cache do edge. O A do apex e
o CNAME `www` devem continuar **Proxied** na Cloudflare. Torná-los DNS-only
expõe o IP de origem e reintroduz a latência regional. HTML público pode ficar
no edge por no máximo 5 minutos; `build-info`, `runtime-info`, `/healthz`,
`/ready`, `/ops/`, `/intranet/`, `/.netlify/` e `/api/` não entram nessa regra.

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

- [ ] Checkout limpo = `CONTROLLER_SHA`; envelope local = incoming preservado
      do mesmo `CONTROLLER_SHA`.
- [ ] `run_bundle_control.py --sha CONTROLLER_SHA --operation rollback
      --rollback-target PREVIOUS_SHA` pelo SSH fixado.
- [ ] Seção 4 verde.
- [ ] Lead sintético persiste no filesystem (mesmo `lead_id` se retry).
- [ ] Re-promote do SHA de `main` se o drill era temporário.
- [ ] Evidência `ROLLED_BACK` / `PROMOTED` anexada.

Abortar se: SHA alvo ausente, `/ready` já falso, snapshot não verificado, ou
qualquer passo exigir edição de DNS/nginx manual.

## Limites

- Rollback de release não reverte o EnvironmentFile.
- Rollback de release não apaga nem restaura leads; isso é o store host-owned.
- O workflow `netcup-release.yml` sincroniza pushes de `main`, não altera DNS e
  não instala timers.
- `confenge.netlify.app` é leftover; 301 para o canônico não o torna produção.
