# Contrato de dados público pSEO (web-cfg ↔ extra-cli)

**Schema version:** `1.0.0`  
**Estratégia:** ICP-Derived Evidence pSEO  
**Consumidor:** build estático Netlify (`web-cfg`)  
**Produtor:** `python -m scripts.pseo.export_web_cfg` em `extra-cli` (read-only)

## Princípios

1. Apenas campos na allowlist pública (`scripts/pseo/allowlist.py` no extra-cli).
2. Proibido: scores comerciais, ranks Top 20, labels humanos, estados de pipeline, contatos, autorização de contato, `suggested_offer`, `next_human_step`.
3. Netlify **nunca** conecta ao PostgreSQL. O deploy consome snapshot versionado em `data/pseo/`.
4. Build **falha fechado** se schema, checksum ou freshness forem inválidos.

## Arquivos do snapshot (`data/pseo/`)

| Arquivo | Conteúdo |
|---------|----------|
| `manifest.json` | schema_version, generated_at, source_run_id, source_commit_sha, dataset_hash, sources, counts, denominators, freshness, limitations, checksums |
| `schema.json` | ponteiro de versão e política de campos |
| `archetypes.json` | arquétipos ICP públicos (padrões de objeto, UFs, faixas, serviços CONFENGE) |
| `markets.json` | mercados segmento×UF agregados |
| `agencies.json` | dossiês de órgãos com massa crítica |
| `prices.json` | benchmarks mediana/P25/P75 (sem média como referência) |
| `competition.json` | concorrência observada (neutra) |
| `opportunities.json` | radar evergreen (não 1 URL por edital) |
| `problem_service.json` | pontes dados→problema→serviço |
| `icp_methodology.json` | metodologia + histogramas internos **sem** identidades |
| `registry.json` | gerado no build: score, status, motivos |

## Freshness

- `freshness.max_age_days_policy` (default 180).
- Snapshot com `generated_at` mais antigo que a política → build rejeita.

## Automação futura (não implementada com segredo)

Fluxo recomendado quando CI tiver acesso read-only ao datalake:

1. Job no `extra-cli` (cron/CI): `python -m scripts.pseo.export_web_cfg --out artifacts/pseo/web_cfg_export`.
2. Artifact assinado (checksums no manifest).
3. PR automático no `web-cfg` copiando para `data/pseo/` **ou** download no build local de quem publica.
4. `npm run pseo:build && npm run pseo:validate && npm run pseo:audit`.
5. Deploy Netlify só do estático, zero DSN.

Até lá, o snapshot sanitizado versionado no repositório é a fonte de verdade do site.
