# TEST-EVIDENCE

## Commands (exit 0 unless noted)

```
npm run test:brand
npm run test:design
npm run test:copy
npm run test:analytics
npm run test:pseo-attribution
npm run audit:performance
npm run audit:accessibility
```

## pseo:test

88 passed, 2 skipped; 3 failures observed under pytest-timeout=30s on slow `/mnt/d` filesystem (`shutil.copyxattr` / `_site` I/O). Environment flake, not design regression. Logs: implementer scratch `pseo-test.log`.

## Runtime

Playwright load of home twice: H1 thesis present both times; zero page errors on commercial URLs in capture run.
