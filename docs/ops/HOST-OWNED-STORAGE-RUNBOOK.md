# Runbook — storage host-owned, migração e restore

Este runbook opera o store host-owned de produção (`/var/lib/confenge-web`).
Não troca DNS, não edita nginx e não dispara rollback de release. Todos os
comandos de mutação exigem `--apply`; sem ele, as ferramentas fazem dry-run.
Payload sensível nunca é impresso.

## 1. Provisionar fora do release

Como root no host, substitua `confenge-web` pelo usuário real do serviço:

```bash
install -d -o confenge-web -g confenge-web -m 0700 /var/lib/confenge-web
install -d -o confenge-web -g confenge-web -m 0700 /var/backups/confenge-web
```

No EnvironmentFile root-owned `0600` do serviço:

```dotenv
NODE_ENV=production
CONFENGE_STORAGE_BACKEND=filesystem
CONFENGE_STORAGE_DIR=/var/lib/confenge-web
LEAD_RETAIN_DAYS=730
ANALYTICS_RETAIN_DAYS=90
NURTURE_RETAIN_DAYS=730
CORRECTION_RETAIN_DAYS=730
```

O release deve montar `/var/lib/confenge-web` como diretório persistente. Nunca
coloque esse root sob o checkout/release, public root, `_site` ou localização
servida pelo nginx.

## 2. Readiness antes de ingestão

No release candidato:

```bash
node -e 'const {storageReadiness}=require("./netlify/functions/lib/storage-config.cjs"); const r=storageReadiness(process.env); console.log(JSON.stringify(r)); process.exit(r.ok?0:1)'
```

O runtime do goal 01 deve usar o mesmo helper em `/ready`: `ok:false` precisa
retornar readiness não saudável e impedir ingestão. Nunca configure
`CONFENGE_STORAGE_BACKEND=memory` em production.

## 3. Export histórico Netlify (leftover; não é o store de produção)

Credenciais de leitura são uma ação externa. Sem elas, a ferramenta responde
`EXTERNAL_EXPORT_REQUIRED`. Não grave tokens no shell history ou no repositório.

```bash
export NETLIFY_BLOBS_SITE_ID='site-id-from-secure-store'
export NETLIFY_BLOBS_TOKEN='read-token-from-secure-store'
npm run storage:migrate:export
```

O primeiro comando é dry-run e retorna apenas counts. Depois crie o bundle fora
do Git/release, em destino ainda inexistente:

```bash
npm run storage:migrate:export -- --out /var/backups/confenge-web/migration-initial --apply
npm run storage:migrate:reconcile -- --source /var/backups/confenge-web/migration-initial --store /var/lib/confenge-web
```

Classes exportadas: leads (índice de idempotência é reconstruído do record),
system records, analytics, nurture subscriptions/suppressions, corrections,
commercial events, search observations e offers sandbox/production. Catálogos,
tracks, fixtures e arquivos estáticos não entram.

Import também começa em dry-run:

```bash
npm run storage:migrate:import -- --source /var/backups/confenge-web/migration-initial --store /var/lib/confenge-web
npm run storage:migrate:import -- --source /var/backups/confenge-web/migration-initial --store /var/lib/confenge-web --apply
```

Repita import: o resultado esperado é `idempotent`, sem conflicts. Antes de um
cutover futuro, faça export delta, import, drain/freeze de intake, export final e
reconciliation contra `--store`; o comando só retorna `RECONCILED` quando todos
os payload hashes coincidem e não há missing/conflicts. Não use dual-write. Warmbly continua deduplicando pela identidade
normalizada já contratada; nenhum ledger comercial novo é criado aqui.

## 4. Snapshot, checksum e retenção

```bash
npm run storage:backup -- snapshot --store /var/lib/confenge-web --out /var/backups/confenge-web --retain 14
npm run storage:backup -- snapshot --store /var/lib/confenge-web --out /var/backups/confenge-web --retain 14 --apply
```

O snapshot segura o mesmo lock dos writers, copia para staging, calcula checksum
por arquivo + agregado e só então renomeia. A retenção remove apenas snapshots
com nome e manifest verificáveis; diretórios estranhos ficam intocados.

Valide periodicamente:

```bash
npm run storage:backup -- verify --snapshot /var/backups/confenge-web/confenge-storage-YYYYMMDDTHHMMSSZ
```

Não publique bundle/snapshot como artifact do GitHub e não o copie para `_site`.

## 5. Restore — sempre em diretório novo

```bash
npm run storage:backup -- restore --snapshot /var/backups/confenge-web/confenge-storage-YYYYMMDDTHHMMSSZ --target /var/lib/confenge-web-restore-candidate
npm run storage:backup -- restore --snapshot /var/backups/confenge-web/confenge-storage-YYYYMMDDTHHMMSSZ --target /var/lib/confenge-web-restore-candidate --apply
```

A ferramenta recusa target existente, live, symlink, release ou sobreposição com
o snapshot. O estado final é `RESTORE_VALIDATED_NOT_ACTIVATED`: nenhuma troca de
mount/env ocorre automaticamente. Antes de ativar restore antigo, reconcilie
DSAR/deletes e sobreponha suppressions/unsubscribes posteriores para não
ressuscitar consentimento revogado.

## 6. Retention/delete

```bash
npm run storage:retention -- --store /var/lib/confenge-web
npm run storage:retention -- --store /var/lib/confenge-web --apply
```

O apply remove record expirado e índice de idempotência no mesmo contrato. JSON
corrupto ou data de retenção malformada não é apagado silenciosamente.
`nurture-suppressions` e `ops-system` não entram no purge genérico.

## 7. Rollback e coexistência

- Produção usa `filesystem` em `/var/lib/confenge-web`. Rollback de release
  (`docs/ops/ROLLBACK.md`) não apaga esse diretório.
- Não devolver tráfego canônico à Netlify. Leftover `confenge.netlify.app` não
  é o plano público.
- Nunca aceite um procedimento que deixe um lead apenas num backend abandonado.
- Não apague leftovers de Blobs nem remova `@netlify/blobs` do lockfile sem
  janela encerrada e counts/hashes/receipts conferidos.
