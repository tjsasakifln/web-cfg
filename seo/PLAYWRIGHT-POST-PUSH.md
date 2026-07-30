# Playwright pós-push — 2026-07-30

## Push

| Campo | Valor |
|-------|--------|
| Repo | `https://github.com/tjsasakifln/web-cfg` |
| Branch | `main` |
| Commit | `de4cbef` — *SEO: higiene de indexação, SINAPI, CTR prioritário, analytics e validadores* |
| Status | **Pushed OK** (`9894342..de4cbef`) |

## Deploy (bloqueador externo)

| Campo | Valor |
|-------|--------|
| Host produção | **Netlify** (`server: Netlify`, HSTS ativo) |
| Auto-deploy a partir do GitHub `web-cfg` | **Não** — push não atualizou o live |
| Netlify CLI | Instalável, **não autenticado** (`netlify login` / `NETLIFY_AUTH_TOKEN` ausentes) |
| App Netlify (Playwright) | Tela **Log in** (Google/GitHub/…) — sem sessão |
| Zip pronto para drop | `/tmp/grok-goal-1b02ecba3a6c/implementer/confenge-deploy.zip` (~12 MB) |

**Conclusão deploy:** o código está no GitHub; **produção ainda serve build antigo**. Playwright **não** consegue autenticar a Netlify sem credencial do usuário.

### Como publicar (1 ação do operador)

1. **Opção A — conectar Git (recomendado)**  
   Netlify → Site settings → Build & deploy → Link repository → `tjsasakifln/web-cfg` branch `main` → Publish directory `.` → Deploy.
2. **Opção B — drag-and-drop**  
   [app.netlify.com/drop](https://app.netlify.com/drop) com o zip acima **ou** a pasta do repo (exceto `.git`).
3. **Opção C — CLI**  
   ```bash
   npx netlify-cli@17 login
   npx netlify-cli@17 link   # escolher site confenge.com.br
   npx netlify-cli@17 deploy --prod --dir=.
   ```
4. **Revalidar**  
   ```bash
   npm i -D playwright && npx playwright install chromium
   node seo/scripts/playwright_prod_checklist.mjs
   ```

---

## Matriz Playwright: produção vs local (código do push)

Ferramenta: Playwright MCP + `page.request`  
Local: `http://127.0.0.1:8788` (build do repo pós-`de4cbef`)  
Prod: `https://confenge.com.br`

| Check | Produção (live) | Local (repo) |
|-------|-----------------|--------------|
| Home 200 | OK | OK |
| `llms.txt` | **404** | **200** |
| `sitemap.xml` / `robots.txt` | 200 | 200 |
| SINAPI title `qual usar?` | **Não** (`qual tabela usar na licitação?`) | **Sim** |
| `.lead-inline` | **0** | **3** |
| `.compare-table` / CPRB / `#checklist` | **Não** | **Sim** |
| WhatsApp com “desonerado” | **Não** (mensagem genérica) | **Sim** |
| Form `input[name=origem]` | **0** | **1** |
| Prefill `?tema=&origem=` | N/A | **OK** (`valid=true`) |
| `window.confengeTrack` | N/A / ausente no build antigo | **function** |
| Aditivo critérios 01–04 | N/A | **01–04** limpos |
| Redirects legados 301 | **404** em todos | N/A (`http.server` não aplica `netlify.toml`) |
| HTTP → HTTPS | **301** → `https://confenge.com.br/` | N/A |

### Redirects produção (sem follow)

| Path | Status | Location |
|------|--------|----------|
| `/servicos` | 404 | — |
| `/blog` | 404 | — |
| `/privacy-policy` | 404 | — |
| `/contato` | 404 | — |
| `/avcbclcb` | 404 | — |
| `/vision` | 404 | — |
| `/trabalhe-conosco` | 404 | — |
| `/nexgen` | 404 | — |
| `/terms-and-conditions` | 404 | — |

Após deploy do `netlify.toml` do commit `de4cbef`, esperados **301** semânticos (ver `seo/REDIRECTS.md`).

### Screenshots

- Local (novo): `seo/screenshots/local-sinapi-after-push.png`
- Live (antigo): `seo/screenshots/live-sinapi-after-push.png`

### Evidência de probe

`/tmp/grok-goal-1b02ecba3a6c/implementer/evidence/playwright-prod-probe.log`

---

## Pendências externas — o que Playwright sanou vs não

| Pendência | Via Playwright? | Status |
|-----------|-----------------|--------|
| Confirmar código no GitHub | Push + SHA | **Sanado** (`de4cbef`) |
| Validar build local (SINAPI, form, analytics, aditivo) | Sim | **Sanado** (local 100% checks) |
| HTTP→HTTPS live | Sim | **Sanado** (301) |
| Deploy Netlify / publicar `llms.txt` + redirects 301 | Requer auth Netlify | **Bloqueado** |
| GSC enviar sitemap / pedir indexação | Conta Google | **Bloqueado** (fora de Playwright anônimo) |
| GA4/Plausible com ID real | Decisão + propriedade | **Bloqueado** (não inventar ID) |
| Cases/depoimentos | Autorização comercial | **Bloqueado** |

---

## Critérios de aceite pós-deploy (reexecutar)

```bash
node seo/scripts/playwright_prod_checklist.mjs
```

Deve passar:

- [ ] `https://confenge.com.br/llms.txt` → 200  
- [ ] Title SINAPI contém `qual usar?`  
- [ ] `.lead-inline` e `.compare-table` na SINAPI  
- [ ] `input[name=origem]` na home  
- [ ] Prefill tema/origem preenche mensagem  
- [ ] `/servicos` (e legados) → **301** (não 404)  
- [ ] Aditivo `#diagnostico` spans `01`–`04` apenas  

Quando o checklist prod passar, as pendências de **publicação** e **redirects** ficam sanadas; GSC/analytics continuam manuais.
