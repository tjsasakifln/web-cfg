# Analytics (CONFENGE)

O site **não** inclui ID de GA4/Plausible inventado. Há uma **camada desacoplada** em `script.js`:

- `window.dataLayer.push({ event, ...params })`
- `window.confengeTrack(eventName, params)`
- Encaminha para `gtag` / `plausible` **somente se** já existirem na página

## Eventos implementados

| Evento | Trigger | Params (sem PII) |
|--------|---------|------------------|
| `whatsapp_click` | clique em `a[href*="wa.me"]` | `page_path`, `content_cluster`, `cta_position`, `cta_label`, `device_context`, `destination_type` |
| `lead_form_start` | primeiro focus em campo do form | idem |
| `lead_form_submit` | submit válido | + `cta_label` = valor do select `necessidade` |
| `lead_form_error` | invalid / submit inválido | idem |
| `service_cta_click` | clique para `#contato` / form com `?tema=` | idem |
| `content_to_service_click` | clique de guia → página-pilar/serviço | idem |
| `internal_search` | busca na biblioteca (≥3 chars) | `query_len`, `results_count` — **não** envia o termo cru |
| `qualified_scroll` | 50% e 75% da página (uma vez cada) | `cta_position=scroll_50\|75` |

## O que **não** é enviado

- e-mail, telefone, nome, empresa, texto livre de `mensagem`
- termo de busca em texto (apenas comprimento e contagem de resultados)

## Como ligar GA4 ou Plausible

1. Criar propriedade real
2. Inserir snippet no `<head>` de `index.html` (e opcionalmente artigos)
3. Ajustar CSP em `_headers` (`script-src`, `connect-src`)
4. Validar no debug: `window.CONFENGE_DEBUG_ANALYTICS = true`

### Plausible (exemplo)

```html
<script defer data-domain="confenge.com.br" src="https://plausible.io/js/script.tagged-events.js"></script>
```

### GA4 (exemplo)

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXX');
</script>
```

## Atribuição de lead

- Campo hidden `origem` no form
- Prefill `?tema=` / `?origem=` (query ou hash legado) em `script.js`
