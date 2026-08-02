# FINAL-INBOUND-10-10 — CONFENGE web-cfg + produção

**Terminal status:** `BLOCKED_WITH_EXACT_EXTERNAL_ACTIONS`  

**Motivo:** pipeline corporativo de leads, analytics 1ª parte, LGPD e gates de engenharia estão no repositório e prontos para deploy; **produção ainda não comprova** e-mail autenticado (SPF/DKIM/DMARC + Resend), Turnstile ativo, webhook ops, branch protection GitHub e coleta pós-deploy até o owner configurar secrets/DNS/GitHub. O tópico ntfy público ainda está em produção no tip antigo até o deploy deste commit.

**Não declarar COMPLETE / 10/10 / FORTUNE_500** enquanto a tabela de ações externas e a paridade produção≠repo inseguro permanecerem.

---

## 1. Resumo executivo

Auditoria revalidada em 2026-08-02 mostrou lead production retornando **topic ntfy hardcoded** e PII em canal público, FormSubmit 403, analytics só dataLayer, privacidade desatualizada (Netlify Forms).  

Implementado no repositório: intake com persistência-first (Netlify Blobs / store), rate limit, Turnstile opcional, webhook/Resend autenticados, coletor `collect`, formulário sem Netlify Forms, LGPD/operadores, CI (secrets, CTAs, CodeQL, Dependabot, CODEOWNERS), ops (SLA, rollback, SLO, env names).

## 2. Estado inicial

Ver `docs/evidence/inbound-10/gap-matrix-initial.md`.  
Baseline commit produção: `8c11a9c8…` com lead inseguro.

## 3. Riscos encontrados

1. Vazamento de tópico ntfy + PII (crítico).  
2. Sucesso sem persistência durável.  
3. E-mail inoperante (FormSubmit).  
4. Analytics não coletado.  
5. Governança main sem protection comprovada.  
6. pSEO contido (0 publish) — correto editorialmente; zero impressões pSEO.

## 4. Alterações realizadas

| Área | Mudança |
| --- | --- |
| `netlify/functions/lead.cjs` + `lib/*` | Pipeline corporativo |
| `netlify/functions/collect.cjs` | Analytics 1ª parte |
| `script.js` | Coletor, form 201-only, fallback WA sem falso sucesso |
| `privacidade/` | LGPD alinhada à arquitetura real |
| `obrigado-*.html` | Protocolo, SLA, WA, e-mail, docs seguros |
| CI/governance | secrets scan, CTA audit, CodeQL, Dependabot, CODEOWNERS, PR template |
| Ops docs | ENV, SLO, rollback, lead handling, external actions |

## 5. Arquitetura final

```
Browser form → POST /.netlify/functions/lead
  → validate/sanitize/origin/rate/turnstile
  → persist Blobs (lead_id) 
  → ops webhook HMAC + Resend (best effort)
  → 201 { lead_id, journey, status }  // sem secrets/PII

Browser track() → POST /.netlify/functions/collect (batch, no PII)
```

## 6. Funil final

impressão → landing → CTA → form (step1 nome+contato+tipo+consent) → **persist** → protocolo → obrigado → WA/e-mail docs → ops notify → CRM manual/planilha

## 7. Fluxo de dados

Lead: PII só em store + canais autenticados.  
Analytics: eventos de funil sem nome/telefone/e-mail/mensagem.  
Atribuição: UTMs/landing/referrer no registro do lead.

## 8. Segurança e LGPD

- Sem tópico default; FormSubmit removido do path.  
- Rate limit IP+fingerprint; honeypot secundário; Turnstile quando secret set.  
- Política + `docs/security/lgpd-operators.md`.  
- **Rotação do tópico ntfy antigo: ação externa obrigatória.**

## 9. Analytics

Coletor real 1ª parte; conversões distintas documentadas em `docs/ops/ANALYTICS-DASHBOARD.md`.  
Prova em produção do coletor: **após deploy** deste commit.

## 10. SEO

Redirects/410 legado revalidados; `VALIDATION_OK`; sitemap index OK; inteligência vazia (containment).

## 11. pSEO

Onda 0: **0 páginas publishable** por gate editorial (não forçar thin).  
`docs/evidence/inbound-10/pseo-wave-status.md`.

## 12. Conversão

Jornadas A/B/C + obrigado + WA contextual (`data/site/whatsapp-messages.json` + CTA audit OK).  
mailto contextual na home e confirmações.

## 13. CI/CD

`site-ci` ampliado; CodeQL; Dependabot; template PR; release identity `/.well-known/build-info.json`.

## 14. Observabilidade

`docs/ops/SLO-MONITORING.md` + probe design; uptime requer owner.

## 15. Evidências

Diretório: `docs/evidence/inbound-10/`  
- gap-matrix-initial.md  
- cta-audit.json  
- env-var-names-only.txt  
- legacy-prod-check.json  
- pseo-wave-status.md  
Scratch tests: `/tmp/grok-goal-d957e1511b09/implementer/*.log`

## 16. Testes ponta a ponta

| Teste | Repo | Produção (pré-deploy deste commit) |
| --- | --- | --- |
| lead unit/integration | PASS (`npm run test:lead-function`) | FAIL segurança (topic exposto) |
| secrets scan | PASS | N/A até deploy |
| CTA WA | PASS | número correto já em prod |
| analytics unit | PASS | coletor ausente até deploy |
| form funnel | PASS | — |
| redirects | PASS | 410/301 OK |
| e-mail real | código Resend | **bloqueado** sem API+DNS |
| Turnstile | código | **bloqueado** sem keys |

## 17. Ações externas

Lista completa: `docs/ops/EXTERNAL-ACTIONS.md`  
Resumo: Netlify env (webhook, Resend, Turnstile, salt), DNS SPF/DKIM/DMARC, GitHub branch protection, uptime monitor, rotação ntfy, redeploy, validar POST 201 sem topic.

## 18. Limitações

- Sem credenciais owner não há prova de inbox real nem HMAC ops em prod.  
- Branch protection não configurável só via git.  
- pSEO sem onda indexável até aprovação editorial humana de seeds fortes.  
- Lighthouse produção: reexecutar pós-deploy (evidence anterior em docs/evidence).

## 19. Notas finais

Implementação fail-closed: sem store → 503 (não 200 falso).  
Persistência não depende de e-mail.  
Respostas públicas whitelisted.

## 20. Status terminal

```
BLOCKED_WITH_EXACT_EXTERNAL_ACTIONS
```

---

## Tabela de notas (10 só com prova repo+prod)

| Quesito | Repo | Produção | Evidência |
| --- | ---: | ---: | --- |
| Posicionamento | 9 | 9 | brand + home |
| Arquitetura de informação | 9 | 9 | jornadas + hubs |
| UI/UX | 9 | 8 | test:ui, axe local |
| Copy | 9 | 9 | test:copy |
| Performance | 8 | 8 | Lighthouse evidence prévia; revalidar tip |
| Acessibilidade | 9 | 8 | axe home 0 critical |
| SEO técnico | 9 | 9 | validate:seo, redirects prod |
| Conteúdo e E-E-A-T | 8 | 8 | especialista + pilares |
| pSEO | 7 | 6 | containment editorial honesto (0 publish) |
| Conversão | 9 | 7 | form/WA ok; prod lead inseguro até deploy |
| Analytics | 9 | 4 | coletor no repo; prod sem até deploy |
| Leads | 9 | 2 | pipeline repo; prod ntfy PII |
| Segurança e LGPD | 9 | 3 | privacy atualizada no repo; prod antiga |
| Engenharia | 9 | 7 | CI gates; deploy pending |
| Governança | 7 | 4 | CODEOWNERS/Dependabot/CodeQL; branch protection owner |
| Observabilidade | 7 | 3 | docs SLO; monitor owner |
| Operação comercial | 8 | 5 | LEAD-HANDLING.md; e-mail/notify owner |

**Nenhuma linha 10/10 simultânea repo+produção neste terminal.**
