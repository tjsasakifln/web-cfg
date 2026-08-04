# Medição comercial, CONFENGE Value Communication 2040

## Baseline

Status: `BASELINE_DATA_UNAVAILABLE`

Nenhuma propriedade real de GA4 ou Plausible está configurada no repositório.
O barramento `window.dataLayer` / `confengeTrack` permanece funcional com provider default `none`.

## Funil

| Etapa | Evento | Notas |
| --- | --- | --- |
| Visita home | page view (provider) | path `/` |
| Visita oferta | `offer_view` | `offer_id` |
| Clique CTA diagnóstico | `diagnostic_cta_click` | hero/final/header |
| Clique decisão crítica | `critical_decision_cta_click` | WhatsApp contextual |
| Clique CTA oferta | `offer_cta_click` | `offer_id`, `cta_position` |
| Ver comparação | `comparison_view` | home diferenciação |
| Início formulário | `lead_form_start` | sem PII |
| Estágio | `qualification_stage_select` | enum controlado |
| Urgência | `qualification_urgency_select` | enum controlado |
| Envio | `lead_form_submit` | stage/urgency categories |
| Sucesso | `lead_form_success` | página `/obrigado` |
| WhatsApp | `whatsapp_click` | sem texto livre |

## Qualificação humana (CRM)

Não confundir clique com lead. Após revisão:

1. lead recebido;
2. lead qualificado (ICP + urgência + decisão clara);
3. reunião;
4. proposta;
5. fechamento.

## Provider opcional

```bash
CONFENGE_ANALYTICS_PROVIDER=plausible|ga4|none
CONFENGE_ANALYTICS_ID=<id>
```

Default: `none`.

## Experimento ativo

Ver `data/site/message-experiments.json`:

> Posicionar como Diretoria B2G fracionada vs consultoria ampla de serviços.

Modo sequencial (sem A/B simultâneo) enquanto o tráfego for baixo.
