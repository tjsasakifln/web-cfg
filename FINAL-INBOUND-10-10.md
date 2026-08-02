# FINAL-INBOUND-10-10 — CONFENGE web-cfg + produção

**Terminal status:** `BLOCKED_WITH_EXACT_EXTERNAL_ACTIONS`

**Tip repositório = produção:** `6a386477ea3f10244d52f73e2ffc1beec581b6a6`  
**build_time produção:** `2026-08-02T15:34:03Z` · `environment: production`  
**Evidência de identidade:** `docs/evidence/inbound-10/prod-build-info-tip.json`

**Não declarar** `COMPLETE` / `10/10` / `FORTUNE_500` enquanto qualquer item de `docs/ops/EXTERNAL-ACTIONS.md` necessário ao inbound completo permanecer sem prova.

---

## 1. Resumo executivo

O canal inseguro (ntfy público + FormSubmit + topic na resposta) foi **eliminado e substituído** por pipeline persist-first (Netlify Blobs + `connectLambda`), rate limit, resposta whitelist, coletor 1ª parte, LGPD alinhada e gates de CI.  

**Revalidado no tip `6a386477` em produção:** leads **HTTP 201** (jornadas A/B/C), **sem leak**, rate **429**, collect **accepted**, páginas críticas **200**, privacidade atualizada.

**Bloqueio residual 10/10:** apenas ações **owner-only** (e-mail Resend+DNS, Turnstile, webhook ops, branch protection, uptime monitor, rotação ntfy histórica). Mapa: `docs/evidence/inbound-10/score-blocker-map.md`.

## 2. Estado inicial

`docs/evidence/inbound-10/gap-matrix-initial.md` — baseline `8c11a9c8` com topic ntfy exposto e PII em canal público.

## 3. Riscos encontrados

1. Topic ntfy + PII públicos (crítico) — **mitigado no tip**.  
2. Sucesso sem persistência — **mitigado** (201 só após Blobs + read-back).  
3. E-mail FormSubmit 403 — path removido; Resend **aguarda** owner.  
4. Analytics só dataLayer — **coletor prod ativo**.  
5. Branch protection ausente — **owner §5**.  
6. pSEO thin — **containment** (0 publish, sitemap vazio válido).

## 4. Alterações realizadas

| Área | Mudança |
| --- | --- |
| `netlify/functions/lead.cjs` + `lib/*` | Pipeline corporativo + connectLambda |
| `netlify/functions/collect.cjs` | Analytics 1ª parte |
| `script.js` | Coletor, form 201-only, fallback WA |
| `privacidade/` | LGPD real |
| `obrigado-*.html` | Protocolo, SLA, WA, e-mail, docs |
| CI/governance | secrets, CTA, CodeQL, Dependabot, CODEOWNERS |
| Ops | ENV, SLO, rollback, EXTERNAL-ACTIONS |

## 5. Arquitetura final

```
Browser form → POST /.netlify/functions/lead
  → validate / origin / rate / optional Turnstile
  → connectLambda → Netlify Blobs put + get verify
  → ops webhook HMAC + Resend (best-effort, env)
  → 201 { lead_id, journey, status }  // whitelist

Browser track() → POST /.netlify/functions/collect (no PII)
```

## 6. Funil final

impressão → landing → CTA → form progressivo → **persist** → protocolo → obrigado → WA/e-mail docs → notify ops (env) → atendimento documentado

## 7. Fluxo de dados

- Lead PII: Blobs + canais autenticados (quando env).  
- Analytics: eventos sem nome/telefone/e-mail/mensagem.  
- Atribuição: UTMs/landing/journey no registro do lead.

## 8. Segurança e LGPD

- Sem hardcoded topic/FormSubmit; secrets scan CI.  
- Rate limit IP+fingerprint; honeypot secundário.  
- Turnstile: código pronto, **§4 EXTERNAL**.  
- Política + `docs/security/lgpd-operators.md`.  
- Rotação tópico histórico: **§1 EXTERNAL**.

## 9. Analytics

Coletor 1ª parte em produção (`collect-health-tip.json`, `collect-batch-tip.json`).  
Conversões: `docs/ops/ANALYTICS-DASHBOARD.md`.  
Plausible cloud: **opcional §7**.

## 10. SEO

Redirects/410 legado; `validate:seo` OK; robots/sitemaps 200; entidade antiga 410 (avcb/clcb/vision/ia).

## 11. pSEO

Editorial gate: 0 publishable, 18 reject, 5 noindex; sitemap inteligência vazio **intencional** (`pseo-wave-status.md`). Não é falha de deploy — é contenção de qualidade.

## 12. Conversão

Form step1, WA contextual (`test:cta-whatsapp`), mailto, obrigado com protocolo.  
Notify e-mail: **§1–3 EXTERNAL**.

## 13. CI/CD

`site-ci` (lead, secrets, CTA, brand, copy, design, UI, SEO, pSEO, LH local, axe).  
CodeQL + Dependabot + PR template.  
Deploy preview via Netlify PR (plataforma).  
**Branch protection: §5 EXTERNAL.**

## 14. Observabilidade

`docs/ops/SLO-MONITORING.md` + probe design.  
**Uptime/alerts ativos: §6 EXTERNAL.**

## 15. Evidências (tip `6a386477`)

Diretório `docs/evidence/inbound-10/`:

| Artefato | Conteúdo |
| --- | --- |
| `prod-build-info-tip.json` | identidade produção = tip |
| `probes-tip-6a386477.txt` | E2E A/B/C **201**, security, rate **429** |
| `security-tip-6a386477.json` | resposta sem topic/PII |
| `collect-health-tip.json` / `collect-batch-tip.json` | coletor |
| `http-critical-tip.txt` | home/jornadas/privacidade/obrigado 200 |
| `rate-limit-tip.txt` | códigos rate |
| `score-blocker-map.md` | notas ↔ EXTERNAL only |
| `gap-matrix-initial.md` / `gap-matrix-final.md` | gaps |
| `env-var-names-only.txt` | nomes env |
| `cta-audit.json` | WhatsApp |
| `pseo-wave-status.md` | pSEO containment |
| `legacy-prod-check.json` | URLs legadas |

## 16. Testes ponta a ponta (tip `6a386477`)

| Teste | Repo | Produção tip |
| --- | --- | --- |
| Lead A/B/C | `npm run test:lead-function` | **201** + `lead_id` (`probes-tip-6a386477.txt`) |
| No leak | `test:secrets-scan` | CLEAN (sem topic/ntfy/mensagem) |
| Rate limit | unit | **429** após 8× no mesmo IP |
| Collect | unit scrub | health + `accepted:2` |
| CTA WA | `test:cta-whatsapp` | número 5548988344559 |
| Redirects/410 | `test:redirects` | avcb/clcb/vision 410 |
| E-mail inbox | Resend code | **§2–3 EXTERNAL** |
| Turnstile | code path | **§4 EXTERNAL** |
| Notify ops | webhook code | **§1 EXTERNAL** |

## 17. Ações externas

**Única lista canônica:** `docs/ops/EXTERNAL-ACTIONS.md`

| § | Plataforma | O que falta para 10/10 |
| --- | --- | --- |
| 1 | Netlify env | `OPS_WEBHOOK_*`, `RESEND_*`, salt, probe; **revogar ntfy antigo** |
| 2 | DNS | SPF/DKIM/DMARC confenge.com.br |
| 3 | Resend | domínio + API key + prova inbox |
| 4 | Cloudflare Turnstile | site/secret + widget + CSP + `LEAD_REQUIRE_TURNSTILE=1` |
| 5 | GitHub | branch protection `main` + required checks |
| 6 | Uptime | Better Stack/UptimeRobot/Checkly + alerta ≠ canal leads |
| 7 | Plausible | opcional (coletor 1ª parte já basta para mensuração) |
| 8 | Blobs | **já operacional** no tip (201+verify) — manter; HTTP store se migrar |

## 18. Limitações

- Inbox e webhook não podem ser provados sem credenciais owner.  
- Branch protection e uptime exigem UI owner.  
- Dados sintéticos `TESTE-*` / `*@example.com` em Blobs: eliminar per `LEAD-HANDLING.md`.  
- LH lab local: console 404 em `/.netlify/functions/collect` (static server sem functions) — **não ocorre em produção** (collect 200).

## 19. Notas finais

Fail-closed: sem persistência → 503, não 200 falso.  
E-mail/notify não apagam lead.  
Resposta pública whitelisted.

## 20. Status terminal

```
BLOCKED_WITH_EXACT_EXTERNAL_ACTIONS
```

---

## Tabela de notas

**Regra:** nota **10** só com prova repo+prod. Toda nota **&lt;10** mapeia **somente** a `docs/ops/EXTERNAL-ACTIONS.md` (ver `score-blocker-map.md`).

| Quesito | Repo | Produção | Evidência | Se &lt;10 → EXTERNAL |
| --- | ---: | ---: | --- | --- |
| Posicionamento | 10 | 10 | brand.json, home, `test:brand` | — |
| Arquitetura de informação | 10 | 10 | jornadas A/B/C, hubs | — |
| UI/UX | 10 | 10 | `test:ui`, axe 0 critical/serious | — |
| Copy | 10 | 10 | `test:copy` | — |
| Performance | 10 | 10 | LH lab Perf≥97 LCP≤2.0 home/diretoria; CLS0 TBT0; SEO100 A11y100 (`docs/lighthouse-runs/summary.json`); collect prod ≠ 404 | — |
| Acessibilidade | 10 | 10 | axe + LH a11y 100 | — |
| SEO técnico | 10 | 10 | `validate:seo`, redirects/410 prod, robots/sitemaps | — |
| Conteúdo e E-E-A-T | 10 | 10 | especialista, pilares, prova verificável | — |
| pSEO | 10 | 10 | gate editorial 0 thin publish; sitemap-int vazio válido | — |
| Conversão | 10 | **9** | form/WA/201/obrigado | **§1 notify, §2–3 e-mail** |
| Analytics | 10 | 10 | collect tip accepted | §7 opcional |
| Leads | 10 | **9** | 201+persist+idempotency+rate | **§1 webhook, §2–3 Resend** |
| Segurança e LGPD | 10 | **9** | no leak, rate 429, privacy | **§4 Turnstile; §1 rotação ntfy** |
| Engenharia | 10 | 10 | tip=`6a386477` = prod build-info | — |
| Governança | **9** | **4** | CODEOWNERS, Dependabot, CodeQL, PR template | **§5 branch protection** |
| Observabilidade | **9** | **3** | SLO-MONITORING.md | **§6 uptime/alerts** |
| Operação comercial | **9** | **5** | LEAD-HANDLING.md, SLAs | **§1–3 notify+e-mail** |

**Linhas com 10/10 repo+prod:** posicionamento, IA, UI/UX, copy, performance, a11y, SEO, E-E-A-T, pSEO (containment), analytics, engenharia.

**Linhas bloqueadas só por owner:** conversão, leads, segurança (Turnstile/rotação), governança, observabilidade, operação comercial.
