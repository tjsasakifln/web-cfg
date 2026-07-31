# Loop de aprendizado pSEO → receita

Suporte a importação futura de métricas (Search Console + CRM). **Não** automatiza decisões comerciais irreversíveis com amostras pequenas.

## Métricas mínimas por página

| Métrica | Fonte típica |
|---------|----------------|
| indexação | GSC / URL inspection |
| impressões, consultas, CTR, posição | GSC |
| pseo_cta_click, pseo_table_interaction, pseo_source_open, pseo_related_page_click | dataLayer |
| pseo_form_start, pseo_form_submit, pseo_whatsapp_click | dataLayer |
| contato qualificado, reunião, proposta, contrato | CRM / pipeline CONFENGE |

Arquivo de importação previsto (futuro): `data/pseo/metrics/{yyyy-mm}.json` com chave `page_id` / `url`.

## Regras documentadas (human-in-the-loop)

1. **Impressões relevantes + CTR baixo** → testar title e meta description; manter H1 decisório.
2. **Tráfego sem CTA** → revisar intenção, oferta e transição visual (answer-box → CTA).
3. **Contatos sem qualificação** → corrigir promessa da página e campos do formulário; ajustar mensagem WhatsApp.
4. **Sem sinal orgânico após janela suficiente** (ex.: 90 dias indexada, impressões ~0) → consolidar ou `noindex`; registrar motivo no registry.
5. **Gera contatos qualificados** → aprofundar cluster e criar páginas adjacentes **somente** com evidência amostral (gates).

## Proibições do loop

- Auto-retirar em massa com N&lt;30 sessões.
- Otimizar só para impressões sem atributo de contato.
- Reintroduzir scores Top 20 ou dados proprietários no HTML.

## Atribuição

CTAs e formulário carregam: `pseo_page_id`, `page_type`, `archetype`, `segment`, `region`, `agency_id`, `intent`, `source_run_id`, `dataset_hash`, `cta_position`, `origem`.  
Analytics via `confengeTrack` **sem** PII (nome, telefone, e-mail, texto livre, CNPJ digitado).
