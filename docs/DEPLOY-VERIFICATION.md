# Deploy verification

Date: 2026-08-02T03:35:31Z

## Diagnosis

| Check | Result |
|-------|--------|
| Local HEAD (session start) | `06edd555fab77c96e8e69d624ec58f9f785cbda0` |
| Public `/.well-known/pseo-build.json` web_cfg_sha (pre-change) | `06edd555fab77c96e8e69d624ec58f9f785cbda0` |
| Source index.html SHA-256 | matched production home byte-for-byte |
| Netlify build command | `npm run build:site` |
| Publish directory | `_site` |
| Branch | `main` |
| production build policy | every push to `main` builds; `build.ignore` is forbidden by `test_workflow_gates.py` |

**Root cause of prior "old deploy" reports:** earlier UIUX sessions documented COMPLETE while production still served older SHAs for some commits, and `lighthouse.status=not_run` / moderate axe remained. At the start of this cutover session, production already matched HEAD `06edd555fab77c96e8e69d624ec58f9f785cbda0`. Remaining gap was content quality, a11y landmark, broken `/servicos` fragment (`/#atuacao` missing), CSS dead code, pSEO provenance, and missing production gates.

## Broken public redirect found

- `/servicos` → `/#atuacao` but home fragment is `#como-atuamos` (fixed).

## Netlify credentials

- `netlify` CLI: not installed in this environment
- Netlify auth token: not present
- Deploy trigger path: material push to `main` (GitHub → Netlify)
- Production drift guard: every `main` push builds; Netlify content deduplication
  avoids redundant uploads without suppressing the release identity.

## Post-push verification commands

```bash
npm run test:production-cutover
curl -sS https://confenge.com.br/.well-known/pseo-build.json
```
