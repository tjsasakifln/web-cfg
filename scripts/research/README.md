# Research pack (EDIÇÃO ZERO)

Read-only consumer of (1) the extra-cli #400 `research_aggregate_v1` export
when present and (2) the versioned `data/pseo` 4-UF snapshot as fail-closed
preview.

```bash
python3 -m scripts.research build
python3 -m scripts.research validate
python3 -m pytest scripts/research/tests -q
```

Does not write `data/pseo`, does not call extra-cli crawlers, and does not
copy a datalake. Absent / insufficient / stale #400 keeps `NEEDS_DATA`,
`noindex` and off sitemap. Contract:
`docs/research/edicao-zero-4uf/consumer-contract-extra-cli-400.md`.
