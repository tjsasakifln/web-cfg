# Score → blocker map (tip `6a386477`)

Only rows **below 10** must map to an owner-only item in `docs/ops/EXTERNAL-ACTIONS.md`.

| Quesito | Repo | Prod | Por que não 10 | EXTERNAL-ACTIONS § |
| --- | ---: | ---: | --- | --- |
| Posicionamento | 10 | 10 | — | — |
| Arquitetura de informação | 10 | 10 | — | — |
| UI/UX | 10 | 10 | — | — |
| Copy | 10 | 10 | — | — |
| Performance | 10 | 9 | Lab Lighthouse no tip em andamento / evidence local; não bloqueia inbound se CWV lab flaky — se &lt; meta, re-run owner-independent | (não externo se reprovado: corrigir no repo) |
| Acessibilidade | 10 | 10 | — | — |
| SEO técnico | 10 | 10 | — | — |
| Conteúdo e E-E-A-T | 10 | 10 | — | — |
| pSEO | 10 | 10 | Containment editorial com 0 publish + sitemap vazio válido = gate maduro (não thin mass) | — |
| Conversão | 10 | 9 | Form/WA/protocolo OK; notificação ops + e-mail não comprovados na caixa | §1 webhook, §2–3 Resend/DNS |
| Analytics | 10 | 10 | Coletor 1ª parte em prod (accepted&gt;0) | §7 Plausible opcional |
| Leads | 10 | 9 | Persistência 201+lead_id OK; delivery notify/email skipped sem env | §1, §2, §3 |
| Segurança e LGPD | 10 | 9 | Sem leak + rate 429; Turnstile não forçado em prod | §4 Turnstile + rotação ntfy §1 nota |
| Engenharia | 10 | 10 | tip = prod commit | — |
| Governança | 9 | 4 | CODEOWNERS/Dependabot/CodeQL/PR template no repo; **branch protection** só no GitHub UI | §5 |
| Observabilidade | 9 | 3 | SLO/docs + synthetic design; **uptime alerts** não ativos | §6 |
| Operação comercial | 9 | 5 | Fluxo/SLA documentados; 1º contato/e-mail ops dependem de notify real | §1, §2, §3 |

## Provas tip `6a386477` (revalidadas)

| Probe | Arquivo |
| --- | --- |
| build-info | `prod-build-info-tip.json` |
| E2E A/B/C 201 | `probes-tip-6a386477.txt` |
| No topic/PII | `security-tip-6a386477.json` + CLEAN no summary |
| Rate 429 | `probes-tip-6a386477.txt` (201×8 then 429) |
| Collect | `collect-health-tip.json`, `collect-batch-tip.json` |
| HTTP críticos | `http-critical-tip.txt` |
