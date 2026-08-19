# WEB-032 Search Ads canary (prepare-only)

Issue: [#87](https://github.com/tjsasakifln/web-cfg/issues/87).

This package is a demand **sensor**. It does not create a Google Ads campaign,
authorize budget, or call a mutate API. The only live verbs are `score`,
`package`, `preflight`, and `dry-run`.

```bash
python3 -m scripts.paid_search score
python3 -m scripts.paid_search package
python3 -m scripts.paid_search preflight
python3 -m scripts.paid_search dry-run
python3 -m scripts.paid_search preflight --variant pii
python3 -m pytest scripts/paid_search/tests -q
```

Go-live stays blocked until owner, Ads account, budget and cap are approved
(`HUMAN_REQUIRED`). Primary metric is `qualified_learning_or_pipeline`, never
click/CTR.

WEB-016 (`demand-engine/1.0`) is consumed when present (PR #98). On
`origin/main` it is absent; GSC snapshots plus the #60 utility are the evidence.
The #84 market-answer page is not an eligible paid landing here (noindex
fixture, not on this branch).
