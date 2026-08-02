## Summary

<!-- What and why -->

## Checklist

- [ ] Segurança: sem segredos; lead path validado (`npm run test:lead-function` + `test:secrets-scan`)
- [ ] Conversão: formulário / WhatsApp / mailto / confirmação
- [ ] Analytics: sem PII (`npm run test:analytics`)
- [ ] SEO: redirects, sitemap, robots se tocados
- [ ] pSEO: não amplia onda sem gate editorial
- [ ] CI verde
- [ ] Produção: plano de deploy + verificação `build-info.json`

## Risk

<!-- Low / Med / High + rollback note -->
