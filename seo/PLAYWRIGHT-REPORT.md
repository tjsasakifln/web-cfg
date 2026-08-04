# Relatório Playwright, checklist SEO / leads

Data: 2026-07-30  
Ferramenta: Playwright MCP  
Ambientes: **produção** `https://confenge.com.br` vs **local** `http://127.0.0.1:8765` (build do repo `web-cfg`)

## Resumo executivo

| Item | Produção (live) | Local (repo) |
|------|-----------------|--------------|
| Site responde | OK | OK |
| `sitemap.xml` / `robots.txt` | 200 | 200 |
| `llms.txt` | **404** (não deployado) | **200** |
| Titles Tier S reescritos | **Antigos** | **Novos** |
| Bloco `lead-inline` | **Ausente** | **Presente** |
| FAQ ofício genérica | **Ainda presente** | Removida |
| Meta genérica | **Ainda presente** | Removida |
| WhatsApp contextual | Genérico | Contextual |
| Form `origem` | **Ausente** | Presente |
| Prefill `?tema=&origem=#contato` | N/A | **OK** (valid=true) |
| Redirects 301 legados | **404** (ainda sem netlify.toml novo) | N/A (http.server não aplica redirects) |

**Conclusão:** as melhorias SEO/leads estão no GitHub (`tjsasakifln/web-cfg`) e validadas localmente. **Produção ainda serve a versão antiga**, falta deploy Netlify.

---

## 1. Produção, URLs do checklist

| URL | Status | Observação |
|-----|--------|------------|
| `/` | 200 | Homepage OK |
| `/sitemap.xml` | 200 | |
| `/robots.txt` | 200 | |
| `/sitemap.txt` | 200 | |
| `/llms.txt` | **404** | Novo arquivo ainda não publicado |
| `/conteudos/sinapi-desonerado-nao-desonerado/` | 200 | Title antigo; sem lead-inline |

### Redirects legados (produção)

Todos retornam **404** (página 404 CONFENGE), não 301:

`/servicos`, `/blog`, `/privacy-policy`, `/contato`, `/avcbclcb`, `/vision`, `/trabalhe-conosco`, `/nexgen`, `/terms-and-conditions`

Após deploy do `netlify.toml` atualizado, devem virar 301.

---

## 2. Local, Tier S (reescritas)

| Slug | Title | lead-inline | Resposta executiva |
|------|-------|-------------|-------------------|
| sinapi-desonerado-nao-desonerado | SINAPI desonerado ou não: qual tabela usar no edital? | sim | Use a tabela… exigida pelo edital |
| bdi-diferenciado-obra-publica | BDI diferenciado em materiais e equipamentos… | sim | Use BDI diferenciado quando… |
| limite-aditivo-25-50-obra-publica | Limite de aditivo 25% e 50%: o que conta na Lei 14.133 | sim | Percentuais 25%/50%… |
| mobilizacao-desmobilizacao-orcamento-obra | Como calcular mobilização e desmobilização na proposta | sim | Calcule a partir do escopo real… |
| atraso-pagamento-contrato-publico-suspender | Atraso de pagamento: pode suspender a obra pública? | sim | Pode legitimar medidas… não automático |

---

## 3. Conversão (form + WhatsApp), local

Fluxo validado:

1. Abrir artigo SINAPI  
2. CTA **Preferir formulário** → `/?tema=…&origem=/conteudos/sinapi…/#contato`  
3. Campo `mensagem` pré-preenchido: `Demanda relacionada a: SINAPI desonerado ou não desonerado.`  
4. Campo hidden `origem` = `/conteudos/sinapi-desonerado-nao-desonerado/`  
5. Preencher nome, empresa, e-mail, necessidade, consentimento  
6. `form.checkValidity()` → **true**  
7. Form: `name=diagnostico-confenge`, `data-netlify=true`, `action=/obrigado`

**Não submetido** a Netlify em produção (evita lead de teste / ambiente local sem Forms).

---

## 4. Screenshots

Salvos em `seo/screenshots/`:

- `local-sinapi.png`, hero artigo reescrito  
- `local-sinapi-lead.png`, bloco de conversão  
- `local-form-prefill.png` / `local-form-ready.png`, form com atribuição  
- `live-sinapi.png`, produção (versão antiga)

---

## 5. Ações que Playwright **não** consegue fazer sozinho

| Ação | Motivo |
|------|--------|
| Deploy Netlify | Requer login/token Netlify ou conectar o repo no painel |
| Search Console: enviar sitemap / pedir indexação | Requer conta Google autenticada |
| Analytics ID | Não há propriedade configurada |

### Deploy recomendado (manual, ~5 min)

1. Netlify → Add new site → Import from Git → `tjsasakifln/web-cfg` (branch `main`)  
   **ou** drag-and-drop da pasta do projeto  
2. Publish directory: `.` (raiz)  
3. Após publish, reexecutar este checklist no domínio live  
4. GSC → Sitemaps → `https://confenge.com.br/sitemap.xml`  
5. GSC → Inspeção de URL nas 5 páginas Tier S → Solicitar indexação  

---

## 6. Critérios de aceite pós-deploy (re-rodar Playwright)

- [ ] `https://confenge.com.br/llms.txt` → 200  
- [ ] Title SINAPI contém `qual tabela usar no edital`  
- [ ] `.lead-inline` existe na página SINAPI  
- [ ] `input[name=origem]` no form da home  
- [ ] `/servicos` → 301 para `/#atuacao` (ou home+hash conforme Netlify)  
- [ ] Prefill `/?tema=teste&origem=/x/#contato` preenche mensagem  
