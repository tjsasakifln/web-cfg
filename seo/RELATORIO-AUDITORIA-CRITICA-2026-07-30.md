# Relatório final, Auditoria crítica SEO / CTR / conversão CONFENGE

**Data:** 2026-07-30  
**Fontes de verdade:** código em `/mnt/d/webcfg`, `git` (commits `2477b11`, `de4cbef`, follow-ups), HTML servido localmente, `netlify.toml`, probes em produção.  
**Evidências:** `seo/evidence-audit-2026-07-30/` (`final_verify.json`, `priority-restore-proof.json`, `validate_suite.txt`, `serve_report.log`, `prod_report.log`)

---

## 1. Veredito

**Implementação anterior parcialmente concluída**, com **correções aplicadas e revalidadas**.

A execução anterior entregou infraestrutura real: site estático Netlify (`publish = "."`), `robots.txt` + sitemap (132 URLs indexáveis), redirects 301 de rotas legadas (ativos em produção), página SINAPI com title/H1 na intenção GSC, tabela, WA contextual, JSON-LD e bus de analytics sem PII em `script.js`.

A auditoria hostil identificou **regressões editoriais graves** (waves de mold H3-slot que contaminaram 13/14 prioritárias). Correção estrutural: (1) bulk fora das 14 prioritárias **congelado em HEAD**; (2) 14 `#diagnostico` prioritários **restaurados à mão** com prosa tópica; (3) `validate_seo.py` com detecção **estrutural** (H3→`«H3»`, fail se frame ≥8 sitewide ou prioritária usa frame ≥5). Prova vermelha: 40 ERR; prova verde: `VALIDATION_OK`.

**Estado revalidado agora:** priority **14/14 CLEAN**; structural max freq **1**; SINAPI comparativo OK; serve **200**; prod redirects **301**; analytics unit **OK**. Bulk pode ainda carregar shells de `de4cbef` como **WARN** (freeze deliberado). **Deploy Netlify** permanece externo.

---

## 2. Matriz de conformidade

| Requisito | Situação encontrada | Correção aplicada | Evidência | Status final |
|---|---|---|---|---|
| Stack estática Netlify | Sem build; publish `.` |, | `netlify.toml` | comprovadamente concluído |
| robots + sitemap | 132 = indexáveis |, | `VALIDATION_OK` | comprovadamente concluído |
| Redirects legados 301 | Ativos em prod |, | `prod_report.log` | comprovadamente concluído |
| Links broken/HTTP/legados | 0 |, | crawls anteriores + suite | comprovadamente concluído |
| SINAPI meta/tabela/WA/JSON-LD | Comparativo garbled na 1ª rodada | Comparativo + diag restaurados | `final_verify.json` sinapi | comprovadamente concluído |
| Priority #diagnostico | Wave-4 H3-slot (13/14) | Hand-restore 53 cards | 14/14 CLEAN em final_verify | comprovadamente concluído |
| Structural mold detector | Ausente (só exact-body) | H3-normalized ≥8 / priority ≥5 | validate_seo.py + RED 40 → GREEN 0 | comprovadamente concluído |
| Bulk profundidade editorial | Shells de4cbef em HEAD | Freeze (sem wave-5) | WARN only no validator | parcialmente concluído |
| Analytics + PII + success | Success ausente na 1ª | `lead_form_success` + obrigado | script.js + ANALYTICS_UNIT_OK | comprovadamente concluído |
| Form POST E2E | Client OK |, | form em final_verify | parcialmente (host Forms) |
| Paridade prod = tree | Pode defasar | Deploy externo | curl prod | parcialmente |
| GA4/GTM ID | Só dataLayer | Não inventado | script.js | N/A técnico |

---

## 3. Alterações realizadas

| Arquivo | Alteração | Motivo | Impacto |
|---|---|---|---|
| 14 `conteudos/<priority>/index.html` | `#diagnostico` hand-restored | Undo wave-4 H3-slot | Critérios tópicos reais |
| 106 bulk `conteudos/*/index.html` | `git checkout HEAD` | Freeze bulk | Fim de waves de mold |
| `conteudos/sinapi-…/index.html` | Comparativo A/B/C legível | Remover Posicione/cronograma | Flagship SERP |
| `script.js` | `lead_form_success` | Success real pós-redirect | Funil |
| `obrigado.html` | `data-lead-success` + script | Disparo success | Conversão |
| `seo/scripts/validate_seo.py` | Structural H3-normalized + priority gate | Anti-gaming | Gating |
| Relatório + evidence pack | Evidências reexecutadas | Honestidade | Auditoria |

---

## 4. URLs antigas

| URL | Status (prod) | Tratamento | Destino |
|---|---|---|---|
| `/servicos` | 301 | `netlify.toml` | `/#atuacao` |
| `/contato` | 301 | idem | `/#contato` |
| `/blog` | 301 | idem | `/conteudos/` |
| `/privacy-policy` | 301 | idem | `/privacidade/` |
| `/terms-and-conditions` | 301 | idem | `/privacidade/` |
| `/vision`, `/nexgen`, `/avcbclcb` | 301 | sem equivalente editorial | `/` |
| `/trabalhe-conosco` | 301 | contato | `/#contato` |
| `/privacidade` | 301 trailing | normalização | `/privacidade/` |

Comando: `curl -sI --max-redirs 0 https://confenge.com.br/servicos` → `301|…/#atuacao` (`prod_report.log`).

---

## 5. Páginas prioritárias

| URL | Title (início) | Description (início) | CTA | Alterações |
|---|---|---|---|---|
| `/conteudos/sinapi-desonerado-nao-desonerado/` | GSC/comercial | SINAPI desonerado ou não desonerado: qual usar? | CO | Entenda quando usar o SINAPI desonerado ou nã… | WA `5548988344559` | #diagnostico hand-restored; clean |
| `/conteudos/demolicao-nao-prevista-obra-publica/` | GSC/comercial | Demolição não prevista em obra pública: como cobrar  | Demolição não prevista no orçamento: como doc… | WA `5548988344559` | #diagnostico hand-restored; clean |
| `/conteudos/atraso-pagamento-contrato-publico-suspender/` | GSC/comercial | Atraso de pagamento: pode suspender a obra pública?  | Atraso de pagamento no contrato público autor… | WA `5548988344559` | #diagnostico hand-restored; clean |
| `/conteudos/administracao-local-orcamento-obra-publica/` | GSC/comercial | Administração local no orçamento: direto, BDI ou pla | Administração local é custo direto, BDI ou it… | WA `5548988344559` | #diagnostico hand-restored; clean |
| `/conteudos/atraso-obra-culpa-administracao/` | GSC/comercial | Atraso por culpa da Administração: como provar | CON | Atraso por culpa da Administração: como prova… | WA `5548988344559` | #diagnostico hand-restored; clean |
| `/conteudos/aditivo-empreitada-por-preco-global/` | GSC/comercial | Aditivo em empreitada global: quando cabe | CONFENGE | Aditivo em empreitada por preço global: quand… | WA `5548988344559` | #diagnostico hand-restored; clean |
| `/conteudos/resposta-notificacao-atraso-obra-publica/` | GSC/comercial | Notificação por atraso: como montar a resposta | CON | Como responder notificação de atraso em obra … | WA `5548988344559` | #diagnostico hand-restored; clean |
| `/conteudos/data-base-orcamento-reajuste-obra-publica/` | GSC/comercial | Data-base e reajuste: onde se perde margem | CONFENG | Data-base e reajuste em obra pública: onde a … | WA `5548988344559` | #diagnostico hand-restored; clean |
| `/conteudos/medicao-por-evento-obra-publica/` | GSC/comercial | Medição por evento ou quantitativo: o que muda | CON | Medição por evento ou por quantitativo: difer… | WA `5548988344559` | #diagnostico hand-restored; clean |
| `/conteudos/glosa-por-qualidade-obra-publica/` | GSC/comercial | Glosa por qualidade: pode glosar a medição inteira?  | Glosa por qualidade na medição: o que a fisca… | WA `5548988344559` | #diagnostico hand-restored; clean |
| `/conteudos/atraso-na-medicao-obra-publica/` | GSC/comercial | Atraso na medição: como proteger o caixa | CONFENGE | Atraso na medição de obra pública: como proto… | WA `5548988344559` | #diagnostico hand-restored; clean |
| `/conteudos/bdi-diferenciado-obra-publica/` | GSC/comercial | BDI diferenciado em materiais e equipamentos: quando | BDI diferenciado para materiais e equipamento… | WA `5548988344559` | #diagnostico hand-restored; clean |
| `/conteudos/mobilizacao-desmobilizacao-orcamento-obra/` | GSC/comercial | Como calcular mobilização e desmobilização na propos | Como calcular mobilização e desmobilização na… | WA `5548988344559` | #diagnostico hand-restored; clean |
| `/conteudos/empreitada-preco-global-preco-unitario/` | GSC/comercial | Empreitada global ou unitária: qual regime é mais ar | Empreitada global ou unitária: qual regime é … | WA `5548988344559` | #diagnostico hand-restored; clean |

**Amostras de cards restaurados (não H3-slot):**
- **sinapi-desonerado-nao-desonerado** / `Texto do edital e anexos`: Qual tabela, mês/data-base e se a referência é desonerada ou não. Em caso de silêncio ou contradição entre edital, planilha modelo e memoria
- **atraso-pagamento-contrato-publico-suspender** / `Crédito líquido e certo`: Isole valor, competência e documentos que tornam o crédito exigível (medição, ateste, NF, ordem de pagamento). Sem essa base, atraso vira re
- **demolicao-nao-prevista-obra-publica** / `Vistoria e condição encontrada`: Registre o estado de fato antes de demolir: fotos datadas, localização e volumes. Sem isso, a demolição vira narrativa tardia.
- **glosa-por-qualidade-obra-publica** / `Distinguir rejeição`: Separe rejeição total, correção com reapresentação, reexecução e glosa parcial de valor. Tratar tudo como glosa zero sem critério contratual

**SINAPI flagship**
- Title/H1: `SINAPI desonerado ou não desonerado: qual usar?`
- Canonical: `https://confenge.com.br/conteudos/sinapi-desonerado-nao-desonerado/`
- Answer-box + `compare-table` + CPRB + checklist
- Comparativo: `Monte a planilha na base desonerada` (garbled=false)
- WA: `5548988344559`, `Olá, Tiago. Estou analisando uma licitação e preciso verificar se o orçamento deve usar SINAPI desonerado ou não desonerado. Posso enviar ed`
- JSON-LD types: ['Organization', 'Person', 'Article', 'BreadcrumbList', 'FAQPage']
- Serve: `200 38374 ['main','answer-box','compare-table']`

---

## 6. Conteúdo repetitivo e canibalização

**Padrões encontrados:**
1. Wave-1 de4cbef (`Pedido ligado a`, templates de atraso), residual em **bulk HEAD** (WARN)
2. Wave-2/3 repair molds, purgados nas prioritárias
3. **Wave-4 H3-slot** (~17 frames, freq 8–18), **revertido** (bulk HEAD + priority hand)

**Disposições:**
- Prioritárias: aprofundadas / restauradas (14/14)
- Bulk: **congelado** (parcial; sem wave-5)
- Consolidações de URL: nenhuma (intenções distintas)
- Pendência humana: shells bulk; GSC pós-deploy

---

## 7. Conversão

| Item | Resultado | Evidência |
|---|---|---|
| WA número | `5548988344559` em prioritárias | final_verify priority |
| WA SINAPI | texto sobre desonerado/não desonerado | final_verify |
| Form | `diagnostico-confenge`, netlify=true, action `/obrigado`, required=6, honeypot | form |
| Success | `data-lead-success=1` + script em obrigado | form |
| Events | all True: ['whatsapp_click', 'lead_form_start', 'lead_form_submit', 'lead_form_error', 'lead_form_success', 'service_cta_click', 'content_to_service_click', 'internal_search', 'qualified_scroll'] | form |
| PII | ANALYTICS_UNIT_OK | validate_suite |
| POST E2E | parcial (Netlify Forms host) |, |

---

## 8. Validações

| Comando | Resultado | Evidência |
|---|---|---|
| `python3 seo/scripts/validate_seo.py` | errors=0 **VALIDATION_OK** (bulk WARN only) | validate_suite.txt |
| `python3 seo/scripts/test_criterion_structure.py` | **CRITERION_STRUCTURE_OK** | idem |
| `node seo/scripts/test_analytics_pii.mjs` | **ANALYTICS_UNIT_OK** | idem |
| Priority extract | **14/14 CLEAN** | final_verify.json |
| Structural mold | ge8=0, max_freq=1 | final_verify.json |
| Serve local | todos 200 | serve_report.log |
| Prod redirects | 301 legados; SINAPI 200 | prod_report.log |
| RED→GREEN | 40 ERR → 0 ERR | validate_red_before_restore.txt → validate_suite |

Saída real:

```
python3 seo/scripts/validate_seo.py
→ pages=134 sitemap=132 indexable=132
→ errors=0 warnings=… (bulk HEAD shells only)
→ VALIDATION_OK

node seo/scripts/test_analytics_pii.mjs
→ ANALYTICS_UNIT_OK {"event":"whatsapp_click","page_path":"/x","cta_label":"ok"}

Serve:
200 33920 ['<main', 'contact-form'] /
200 38374 ['<main', 'answer-box', 'compare-table'] /conteudos/sinapi-desonerado-nao-desonerado/
200 24941 ['<main', 'answer-box'] /conteudos/atraso-pagamento-contrato-publico-suspender/
200 34777 ['<main'] /auditoria-orcamento-licitacao/
200 4179 ['<main', 'data-lead-success'] /obrigado.html
200 12673 ['data-lead-success'] /script.js

Prod:
/servicos => 301|https://confenge.com.br/#atuacao
/contato => 301|https://confenge.com.br/#contato
/blog => 301|https://confenge.com.br/conteudos/
/privacy-policy => 301|https://confenge.com.br/privacidade/
/conteudos/sinapi-desonerado-nao-desonerado/ => 200|

Priority:
priority clean 14/14
structural_frames_ge8=0 max_freq=1
```

---

## 9. Problemas não corrigidos no código

1. **Deploy Netlify**, tree validado; prod pode servir HTML antigo.  
2. **POST Forms E2E**, requer backend Netlify.  
3. **IDs GA4/GTM**, bus pronta; IDs não inventados.  
4. **Bulk guides**, shells de4cbef em HEAD (WARN); freeze deliberado, sem rewrite em massa.  
5. **GSC / DNS / credenciais**, externos.

---

## 10. Próximas ações externas

| Dependência | Ação |
|---|---|
| Netlify | Deploy do working tree |
| Google Search Console | CTR SINAPI; validar 301s |
| GA4 / GTM | Conectar ao dataLayer/gtag |
| Revisão jurídica | Claims de sanção/suspensão (opcional) |
| Comercial | Cases só com autorização |

---

## Definition of Done

| Critério | Estado |
|---|---|
| Validadores exit 0 | ✅ |
| Priority 14/14 diagnostico tópico | ✅ |
| Structural mold detector | ✅ RED 40 → GREEN 0 |
| SINAPI HTML final | ✅ |
| Redirects prod 301 | ✅ |
| Sitemap/robots | ✅ |
| WA + form + analytics no-PII | ✅ |
| Bulk profundidade total | ⏳ parcial (declarado) |
| Deploy produção | ⏳ externo |

*Não confiar em prose anterior sem os artefatos listados. Skeptic wave-4: cards prioritários re-extraídos e limpos.*
