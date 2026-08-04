# Relatório final, SEO orgânico CONFENGE

**Data:** 2026-07-30  
**Repositório:** site estático Netlify (`webcfg`)  
**Baseline GSC (sinal direcional):** 14–28 jul 2026, 10 cliques, 325 impressões, CTR ~3,08%, posição média ~9,12  

---

## 1. Diagnóstico encontrado

### Já correto no tree (preservado)

| Área | Estado |
|------|--------|
| Canonicals HTTPS absolutos autoconsistentes | 132 páginas indexáveis |
| Sitemap × filesystem | 132/132 alinhados; robots aponta sitemap |
| Titles / descriptions / H1 | Únicos (1 H1 por página) |
| Redirects legados em `netlify.toml` | `/servicos`, `/blog`, `/privacy-policy`, etc. |
| HSTS + `upgrade-insecure-requests` | `_headers` (HTTP→HTTPS no host) |
| Form Netlify + honeypot + LGPD + `origem` | Home |
| Prefill `?tema=` / `?origem=` | `script.js` |
| Identidade AVCB/NexGen/imobiliário | Ausente no HTML atual |
| Páginas high-CTR GSC | Não reescritas sem justificativa |

### Pendências reais fechadas neste ciclo

| Problema | Evidência / correção |
|----------|----------------------|
| SINAPI sem tabela, checklist, exemplo, CPRB, CTAs em 3 momentos | Página reestruturada |
| Boilerplate massivo (“A resposta não é automática…”, “leitura conjunta…”, “causa, responsabilidade…”) | 0 ocorrências residual |
| Mold bulk da 1ª passagem (“decisão correta depende…”) | Removido; classificado honestamente |
| FAQs truncadas (`Organize a linha do.`) | Rebuild sem corte mid-phrase |
| Criterion-cards órfãos com números duplicados (ex.: aditivo 02/03) | Grid limpo 01–04; validator estrutural |
| Analytics só documentação | Camada `dataLayer` + eventos sem PII |
| Form link `/privacidade` sem barra | Canônico `/privacidade/` |
| Trailing slash incompleto nos pilares | `netlify.toml` |
| Classificação desonesta (`manter` em mold) | 19 manter / 99 aprofundar / 2 consolidar |

### Premissa GSC

Janela curta (n≈10 cliques): usada como **sinal direcional**. Não se restaurou versão antiga de produção; melhorias pós-GSC foram preservadas e estendidas.

---

## 2. Alterações implementadas

| Arquivo / área | Finalidade |
|----------------|------------|
| `conteudos/sinapi-desonerado-nao-desonerado/index.html` | Title/meta SERP; resposta desonerado/não/CPRB; tabela; decisão; exemplo; checklist; 3 CTAs; WA contextual; links pilar/guias; fontes com data |
| `conteudos/{prioritários GSC}/index.html` | Resposta executiva, lead, meta/title, CTA/WA por problema |
| `conteudos/*/index.html` | Remoção de boilerplate; limpeza estrutural de órfãos; FAQ completas |
| `conteudos/aditivo-qualitativo-quantitativo/index.html` | Grid diagnóstico **01–04** sem resíduos |
| `script.js` | `confengeTrack` / `dataLayer`; eventos WA, form, scroll, search, content→service; filtro anti-PII |
| `styles.css` | `.compare-table`, `.lead-inline-soft`, float mobile |
| `index.html` | Privacidade canônica; data-attrs WA |
| `netlify.toml` | Redirects legados + trailing slash pilares |
| `seo/ANALYTICS.md` | Documentação da camada |
| `seo/content-classification.json` | Classificação dos 120 guias |
| `seo/scripts/validate_seo.py` | Duplicatas, molds, truncamento, crit_dup, números/órfãos estruturais |
| `seo/scripts/test_analytics_pii.mjs` | Unit test PII no `script.js` real |
| `seo/scripts/test_criterion_structure.py` | Unit test: fixture suja falha; aditivo limpo passa |
| `seo/REDIRECTS.md`, `seo/CHANGELOG-SEO.md` | Documentação |

---

## 3. Migração de URLs

| URL antiga | Ação aplicada | Destino ou status | Justificativa |
|------------|---------------|-------------------|---------------|
| `/privacy-policy` | 301 | `/privacidade/` | Política atual B2G |
| `/privacy-policy/` | 301 | `/privacidade/` | Idem |
| `/terms-and-conditions` | 301 | `/privacidade/` | Sem termos separados |
| `/terms-and-conditions/` | 301 | `/privacidade/` | Idem |
| `/contato` | 301 | `/#contato` | Formulário na home |
| `/contato/` | 301 | `/#contato` | Idem |
| `/blog` | 301 | `/conteudos/` | Biblioteca técnica |
| `/blog/` | 301 | `/conteudos/` | Idem |
| `/servicos` | 301 | `/#atuacao` | Intenção de serviços (não home cega) |
| `/servicos/` | 301 | `/#atuacao` | Idem |
| `/trabalhe-conosco` | 301 | `/#contato` | Sem carreiras; canal de contato |
| `/trabalhe-conosco/` | 301 | `/#contato` | Idem |
| `/vision` | 301 | `/` | Fantasma sem equivalente semântico |
| `/vision/` | 301 | `/` | Idem |
| `/nexgen` | 301 | `/` | Legado descontinuado no B2G |
| `/nexgen/` | 301 | `/` | Idem |
| `/avcbclcb` | 301 | `/` | Fora do posicionamento B2G; sem destino temático |
| `/avcbclcb/` | 301 | `/` | Idem |
| `/privacidade` | 301 | `/privacidade/` | Normalização de barra |
| `/privacidade.html` | 301 | `/privacidade/` | Alias legado |
| HTTP `http://confenge.com.br/*` | upgrade/HSTS | HTTPS | `_headers` no host Netlify |
| Artigos AVCB / avaliações imobiliárias | N/A |, | Não existem no repositório atual |
| Guias `/conteudos/*/` | Manter indexáveis | 200 + canonical | 99 em backlog `aprofundar`; sem purge em massa |

---

## 4. Melhorias de CTR

Matriz com **before = `git show HEAD:`** e **after = HTML atual** (evidência: `evidence/ctr-matrix.json`).

| URL | Consulta-alvo | Intenção | Título anterior | Título novo | Description nova (resumo) | Razão |
|-----|---------------|----------|-----------------|-------------|---------------------------|-------|
| `/conteudos/sinapi-desonerado-nao-desonerado/` | sinapi desonerado ou não / qual usar | Decisão de tabela | SINAPI desonerado ou não: qual tabela usar no edital? | **SINAPI desonerado ou não desonerado: qual usar?** | Entenda quando usar desonerado ou não, encargos, BDI, edital e erros da proposta | 88 imp / 0 cliques; query no início |
| `/conteudos/administracao-local-orcamento-obra-publica/` | administração local orçamento | Classificação de custo | Administração local: custo direto, BDI ou planilha? | **Administração local no orçamento: direto, BDI ou planilha?** | Critérios para precificar sem duplicar/omitir equipe | Zero clique, posição competitiva |
| `/conteudos/atraso-obra-culpa-administracao/` | atraso culpa administração | Prova / proteção | Atraso por culpa da Administração: como provar e proteger | **Atraso por culpa da Administração: como provar** | Provar causa, impacto e proteger antes de sanção | Title mobile + resposta |
| `/conteudos/aditivo-empreitada-por-preco-global/` | aditivo empreitada global | Direito a aditivo | Aditivo em empreitada global: quando a construtora tem direito | **Aditivo em empreitada global: quando cabe** | Quando mudança de projeto/escopo gera direito | Intenção + regime |
| `/conteudos/resposta-notificacao-atraso-obra-publica/` | resposta notificação atraso | Como responder | Notificação por atraso: como montar a resposta técnica | **Notificação por atraso: como montar a resposta** | Fatos, anexos, prazos; o que não admitir sem prova | Meta/título enxutos |
| `/conteudos/data-base-orcamento-reajuste-obra-publica/` | data-base reajuste | Perda de margem | Data-base e reajuste: onde a construtora perde dinheiro | **Data-base e reajuste: onde se perde margem** | Índice, periodicidade, reajuste vs reequilíbrio | Snippet acionável |
| `/conteudos/medicao-por-evento-obra-publica/` | medição por evento | Modelo de medição | Medição por evento ou por quantitativo: qual modelo protege melhor a construtora? | **Medição por evento ou quantitativo: o que muda** | Diferenças de caixa, glosa e prova | Title mobile |
| `/conteudos/glosa-por-qualidade-obra-publica/` | glosa qualidade | Limite da glosa | Glosa por qualidade: a fiscalização pode glosar tudo? | **Glosa por qualidade: pode glosar a medição inteira?** | O que apontar e como responder com critério | Intenção explícita |
| `/conteudos/atraso-na-medicao-obra-publica/` | atraso na medição | Fluxo de caixa | Atraso na medição: como proteger o fluxo de caixa | **Atraso na medição: como proteger o caixa** | Protocolar, glosa, parcela devida | Snippet direto |
| `/conteudos/demolicao-nao-prevista-obra-publica/` | demolição não prevista | Como cobrar | (mesmo title) | Mantido + resposta/lead específicos | Documentar, medir e cobrar sem absorver | Resposta SERP alinhada |
| `/conteudos/atraso-pagamento-contrato-publico-suspender/` | atraso pagamento suspender | Pode suspender? | (mesmo title) | Mantido + resposta específica | Condições, riscos, formalização | High intent; já bom title |

**Não alterados (CTR GSC razoável):**  
`bdi-diferenciado-obra-publica`, `fiscal-nao-assina-medicao-obra-publica`, `pagamento-parcial-etapa-empreitada-global`, `prorrogacao-prazo-obra-publica-documentos`, `desconto-da-proposta-em-item-novo-aditivo`, `sinapi-ou-sicro-obra-publica`.

---

## 5. Melhorias de conversão

| Elemento | Implementação |
|----------|----------------|
| CTAs contextuais (3 momentos) | SINAPI: após resposta, após documentos, mid/final + aside |
| WhatsApp pré-preenchido | Mensagem humana por página/cluster; número (48) 98834-4559 inalterado |
| Form qualificado | nome, empresa, e-mail, WhatsApp opcional, necessidade, contexto, consentimento, honeypot, `origem` |
| Prefill | `?tema=` / `?origem=` → mensagem + scroll `#contato` |
| Eventos (`script.js`) | `whatsapp_click`, `lead_form_start`, `lead_form_submit`, `lead_form_error`, `service_cta_click`, `content_to_service_click`, `internal_search` (só `query_len`), `qualified_scroll` |
| Params | `page_path`, `content_cluster`, `cta_position`, `cta_label`, `device_context`, `destination_type`, **sem e-mail/telefone/texto livre** |
| Pilares comerciais | 8 clusters com intenção distinta; links guia → pilar preservados |

Contatos oficiais inalterados: WhatsApp **(48) 98834-4559** · **tiago.sasaki@confenge.com.br**.

---

## 6. Conteúdos consolidados

Arquivo: `seo/content-classification.json`.

| Classificação | Qtd | Significado |
|---------------|-----|-------------|
| **manter** | 19 | Handcrafted / prioritários GSC com resposta específica |
| **aprofundar** | 99 | Ainda com variantes estruturais reutilizáveis, backlog editorial (não ostentar volume) |
| **consolidar** | 2 | `matriz-de-riscos-reequilibrio-economico-financeiro` → matriz geral; `servico-executado-sem-termo-aditivo` → `fiscal-mandou-executar-sem-aditivo` (ainda indexados até dados pós-deploy) |
| redirecionar / noindex / remover | 0 | Evitado purge em massa sem tráfego estável |

**Boilerplate lexical crítico:** 0 ocorrências de  
“A resposta não é automática”, “O tema exige uma leitura conjunta”, “causa, responsabilidade, impacto e valor”, “a análise deve analisar”, “a decisão correta depende”, filler “Esse elemento altera…”.

**Estrutural aditivo:** órfãos removidos; grid `01–04` apenas.

---

## 7. Validações executadas

### Comandos e resultados reais

```text
$ python3 seo/scripts/validate_seo.py
pages=134 sitemap=132 indexable=132
errors=0 warnings=0
VALIDATION_OK

$ node seo/scripts/test_analytics_pii.mjs
ANALYTICS_UNIT_OK {"event":"whatsapp_click","page_path":"/x","cta_label":"ok"}

$ python3 seo/scripts/test_criterion_structure.py
FIXTURE_FAILS_AS_EXPECTED [duplicate '02', orphan outside grid]
ADITIVO_CLEAN ['01','02','03','04']
CRITERION_STRUCTURE_OK

$ # suite full (inventory, crawl, JSON-LD, serve)
RESULT: PASS
errors=0 warnings=0
HTTP 200: /, /conteudos/sinapi-desonerado-nao-desonerado/, /sitemap.xml, /robots.txt, /script.js, /styles.css, /llms.txt
JSON-LD blocks parsed OK: 131
Legacy internal hits: 0
Sitemap vs FS: 0 mismatches
```

### Evidência em disco

| Artefato | Caminho |
|----------|---------|
| Log suite completa | `/tmp/grok-goal-1b02ecba3a6c/implementer/evidence/full-validation.log` |
| Summary JSON | `.../evidence/validation-summary.json` |
| Inventory URLs | `.../evidence/inventory-urls.txt` |
| SINAPI dump | `.../evidence/sinapi.html` |
| CTR matrix | `.../evidence/ctr-matrix.json` |
| Structure unit log | `.../evidence/criterion-structure-test.log` |

| Check | Resultado |
|-------|-----------|
| Titles duplicados | 0 |
| Descriptions duplicadas | 0 |
| H1 ≠ 1 | 0 |
| Canonical mismatch | 0 |
| JSON-LD parse | 131 OK / 0 fail |
| Sitemap só canônicas indexáveis | OK |
| Links legados internos | 0 |
| Boilerplate residual | 0 |
| Aditivo 01–04 sem órfãos | OK |
| Analytics PII filter | OK |
| Serve local assets | 200 |

---

## 8. Pendências

| Item | Dependência |
|------|-------------|
| Deploy Netlify do repo atual | Conta/token ou publish (produção pode estar atrás do Git) |
| Confirmar 301 legados em produção | Host Netlify após deploy |
| Enviar sitemap / inspeção URL no GSC | Conta Google Search Console |
| Ativar GA4 ou Plausible com ID real | Criar propriedade; ajustar CSP em `_headers` |
| Cases/depoimentos | Autorização comercial, **não inventados** |
| Consolidação física dos 2 pares canibalizados | Decisão editorial + 28 dias de dados |
| Aprofundamento real dos ~99 guias `aprofundar` | Sprint de conteúdo técnico (sem prosa bulk) |
| HTTP→HTTPS live | Certificado/host (config local OK) |

---

## 9. Próxima medição (28 e 56 dias)

Comparar com baseline GSC 14–28 jul 2026:

| Métrica | Como medir |
|---------|------------|
| Impressões não-marca | GSC consultas − “confenge” |
| CTR consultas prioritárias | desonerado/não; demolição; adm. local; etc. |
| Posição SINAPI e zero-click list | GSC páginas |
| Cliques WhatsApp | Evento `whatsapp_click` (após tag) |
| Formulários concluídos | Netlify Forms + `lead_form_submit` |
| Content → serviço | `content_to_service_click` |
| Leads com empresa + demanda real | Export Forms / CRM |

**Critério direcional de sucesso (não estatístico com n=10):**  
CTR da URL SINAPI > 0 com impressões estáveis; ≥1 lead atribuído a conteúdo prioritário; queda de impressões em URLs legadas após 301.

---

## Resumo executivo

Implementação **no código**, não auditoria abstrata:

1. **Higiene de indexação** fechada (sitemap, canonicals, redirects, HSTS).  
2. **SINAPI** como página de decisão completa (SERP + estrutura + CTAs).  
3. **Prioritários GSC** com title/resposta/CTA reais; high-CTR preservados.  
4. **Boilerplate e órfãos estruturais** removidos; classificação honesta (19/99/2).  
5. **Conversão + analytics** sem PII; validadores automatizados verdes.  

**Próximo passo de negócio:** deploy Netlify → GSC (sitemap + inspeção SINAPI) → ligar analytics com ID real → medir em 28/56 dias.
