# Funil de conversão inbound (sem PII)

## Jornadas (fonte: `data/site/brand.json`)

| ID | Código | Visitante | CTA | Obrigado |
|----|--------|-----------|-----|----------|
| `contrato` | A | Problema urgente em contrato | Enviar documentos para análise | `/obrigado-contrato` |
| `edital` | B | Edital / proposta | Enviar edital para triagem | `/obrigado-edital` |
| `operacao` | C | Operação B2G sem método | Diagnosticar a operação B2G | `/obrigado-operacao` |

## Eventos (sem PII)

Instrumentação existente em `script.js` / testes `test:analytics`:

| Evento | Uso |
|--------|-----|
| `editorial_page_view` / `legal_article_view` | Visualização de artigo |
| `whatsapp_click` / `editorial_whatsapp_click` | Clique WhatsApp |
| `email_click` | Clique e-mail |
| `lead_form_submit` | Conclusão de formulário |
| `pseo_whatsapp_click` / `pseo_cta_click` | pSEO |

Atributos permitidos: `page_path`, `journey`, `cta_position`, `content_cluster`, `tema` (não-PII), `origem` (path).  
**Proibido:** nome, e-mail, telefone, CPF, texto livre de mensagem no analytics.

## Atribuição conteúdo → oferta

1. Artigo indexável carrega `data-journey` + cluster.  
2. CTA principal alinhado à jornada (um peso dominante).  
3. Query `jornada=`, `tema=`, `origem=` no formulário.  
4. WhatsApp com mensagem contextual da jornada (brand.json).  
5. Página de obrigado específica da jornada.

## Baseline

| Métrica | Valor |
|---------|-------|
| Impressões / cliques GSC | **NO_DATA** nesta sessão |
| Conversões GA | **NO_DATA** |
| Taxa conteúdo→oferta | **NO_DATA** |
| WhatsApp vs formulário | **NO_DATA** |

Declarar baseline só com export real (`pseo:gsc:ingest` / Analytics). Não inventar.

## Gate

`gate_conversion` em `scripts/site/inbound_gates.py` — cada indexável `/conteudos/` precisa de CTA e sinal de jornada.
