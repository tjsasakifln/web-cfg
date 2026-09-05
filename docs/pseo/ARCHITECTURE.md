# Arquitetura pSEO ICP-Derived Evidence

```
extra-cli (read-only DB)
  scripts/pseo/export_web_cfg.py
        │  allowlist + sanitize + aggregate
        ▼
  JSON snapshot (manifest + tables)
        │  commit / CI artifact
        ▼
web-cfg/data/pseo/
        │
  scripts/pseo/build.py
    ├─ schema fail-closed
    ├─ score indexability (0–100)
    ├─ diversity + similarity gates
    ├─ render HTML (identidade CONFENGE)
    ├─ registry.json
    └─ sitemap-inteligencia.xml
        │
  Netcup release (artefato site-ci → stage/verify → promoção atômica)
```

## Tipos de página

| Tipo | Path | CTA |
|------|------|-----|
| market | `/inteligencia/mercados/{seg}-{uf}/` | Solicitar mapa aplicado |
| agency | `/inteligencia/orgaos/{slug}/engenharia/` | Estratégia para o órgão |
| price | `/inteligencia/precos/{seg}-{uf}/` | Validar preço, risco e margem |
| competition | `/inteligencia/concorrencia/{seg}-{uf}/` | Mapa de concorrência |
| radar | `/radar/{seg}-{uf}/` | Analisar edital |
| problem_service | `/inteligencia/cenarios/{slug}/` | Organizar documentos |

## Comandos

```bash
npm run pseo:build      # gera HTML + registry + sitemap
npm run pseo:validate   # schema, SEO pSEO, similaridade, sitemap
npm run pseo:audit      # PII hooks, regressão ~132, forbidden, opcional determinismo
npm run pseo:test       # unit tests
```

No extra-cli:

```bash
python -m scripts.pseo.export_web_cfg --out /path/to/webcfg/data/pseo
python -m pytest tests/pseo -q
```
