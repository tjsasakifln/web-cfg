# IndexNow release notification

**Decision:** EXECUTE_NOW for changed canonical CONFENGE URLs only.

IndexNow complements sitemaps. It does not prove crawl or indexation, and it
does not replace Google Search Console or Bing Webmaster Tools inspection.

## Ownership proof

The public build includes:

```text
https://confenge.com.br/.well-known/indexnow-key.txt
```

The key is an ownership token, not a credential. The submitter refuses URLs
outside `https://confenge.com.br`, query strings, fragments, empty batches and
batches above 10,000 URLs.

## Post-deploy command

Submit only URLs added, materially updated or deleted in the release:

```bash
node scripts/site/indexnow_submit.mjs --dry-run \
  https://confenge.com.br/ \
  https://confenge.com.br/ferramentas/checklist-reequilibrio/

node scripts/site/indexnow_submit.mjs \
  https://confenge.com.br/ \
  https://confenge.com.br/ferramentas/checklist-reequilibrio/
```

Run only after the exact release SHA and public key URL return `200`. Record
the HTTP `200` or `202`, URL list, SHA and timestamp. A successful submission
means notification accepted, not indexed.

SmartLic removals require a separately hosted `smartlic.tech` key on the
temporary bridge. Never submit SmartLic URLs with the CONFENGE key.
