# Analytics (CONFENGE)

O site ainda **não** inclui tag de analytics no HTML para não injetar ID inventado.

## Recomendado

1. **Plausible** (privacy-friendly) ou **GA4**
2. Após criar a propriedade, inserir o snippet no `<head>` de:
   - `index.html`
   - e, se desejado, nos templates de artigo (ou um único `script.js` loader)

### Plausible (exemplo)

```html
<script defer data-domain="confenge.com.br" src="https://plausible.io/js/script.js"></script>
```

Atualizar CSP em `_headers` para permitir o host do script (`script-src` e `connect-src`).

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

## Eventos de conversão sugeridos

| Evento | Trigger |
|--------|---------|
| `lead_form_submit` | submit do form `diagnostico-confenge` |
| `whatsapp_click` | clique em `a[href*="wa.me"]` |
| `cta_form_from_article` | clique em “Preferir formulário” com `?origem=` |

O `script.js` já preenche `mensagem` e pode ler `origem`/`tema` da query string para atribuição de lead por URL.
