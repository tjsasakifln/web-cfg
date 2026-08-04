# Gap matrix inicial, inbound 10/10 (repo × produção)

**Baseline commit (repo tip):** `8c11a9c873c878dcde6602d49c0b268524218ddc`  
**Produção build-info:** mesmo SHA · `2026-08-02T14:28:14Z` · environment `production`  
**Auditoria HTTP:** 2026-08-02T14:59Z (não usar relatórios antigos como prova)

| Ativo | Repo | Produção | Impacto | Prioridade | Evidência |
| --- | --- | --- | --- | --- | --- |
| Lead intake `/.netlify/functions/lead` | Existe; ntfy hardcoded + FormSubmit | 200 com `topic` exposto; PII em ntfy público; FormSubmit 403 | Crítico, vazamento + perda | P0 | POST prod → `topic: confenge-prod-leads-b2g-9f3c2a1e7d4b6e80` |
| Persistência durável | Ausente | Ausente (só ntfy efêmero) | Crítico | P0 | lead.cjs só ntfy/formsubmit |
| E-mail transacional | FormSubmit default | 403 Activation | Crítico | P0 | response delivery formsubmit error |
| Rate limit / Turnstile | Ausente | Ausente | Alto | P0 | código + POST ilimitado |
| Resposta sem segredos | Falha (topic em body) | Falha | Crítico | P0 | lead-prod-response |
| Analytics coletor real | dataLayer only | sem Plausible/GA4/Umami no HTML | Alto | P0 | HTML prod sem script coletor |
| Atribuição no lead | UTM no POST | ntfy recebe origem; sem store | Alto | P0 | lead.cjs |
| LGPD / privacidade | Diz Netlify processa form | Texto desatualizado | Alto | P0 | privacidade/index.html |
| WhatsApp CTAs | Número correto 5548988344559 | Contextual em jornadas | Médio | P0 | index + pillars |
| Formulário progressivo | Step 1/2 no script | Presente | Médio | P0 | script.js |
| Confirmação + protocolo | obrigado-* | Protocolo via query | Médio | P0 | obrigado.html |
| mailto contextual | Básico | Presente | Médio | P0 | index |
| SEO redirects legado | _redirects 410/301 | avcb/clcb 410 | Médio | P1 | curl |
| Sitemap inteligência | index presente | **urlset vazio** | Alto | P1 | sitemap-inteligencia.xml prod |
| pSEO wave | thin noindex; editorial gate | zero seeds indexáveis no sitemap | Alto | P1 | sitemap-int vazio |
| CI site-ci | gates amplos | green histórico | Médio | P1 | site-ci.yml |
| Branch protection | não no repo | desconhecido | Médio | P1 | precisa GitHub settings |
| Dependabot/CodeQL | ausente | n/a | Médio | P1 | .github |
| Release identity | build-info | 200 match tip | OK | P1 | .well-known |
| Rollback documentado | parcial | não exercitado neste audit | Médio | P1 | docs |
| Monitoramento/SLO | ausente formal | n/a | Médio | P1 |, |
| Lighthouse/a11y | scripts + evidence antiga | revalidar no tip | Médio | P1 | docs/evidence |

## Funil mapeado (estado inicial)

impressão orgânica → landing (home/jornadas/conteúdos) → CTA → form AJAX → **ntfy público (PII)** + FormSubmit 403 → receipt_id → obrigado → WhatsApp opcional  
Mensuração: client dataLayer only · sem coletor externo · sem lead store.

## Riscos imediatos

1. Tópico ntfy hardcoded e retornado na API pública, qualquer um pode ler leads.
2. PII enviada a serviço sem autenticação.
3. Sucesso HTTP sem persistência durável.
4. E-mail comercial não operacional.
5. Analytics “preparado” não coleta.
