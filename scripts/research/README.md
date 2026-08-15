# Research pack (EDIÇÃO ZERO)

Read-only consumer of the versioned `data/pseo` snapshot.

```bash
python3 -m scripts.research build
python3 -m scripts.research validate
python3 -m pytest scripts/research/tests -q
```

Does not write `data/pseo`, does not call extra-cli crawlers, and does not
query `public_read_v1`. Preview HTML is `noindex` and stays off sitemaps.
