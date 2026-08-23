# Intent → action matrix v1.3.0

Schema: `intent-action-matrix/1.0`. Owner: `web-cfg/conversion`. As of 2026-08-23.

SLA is `UNKNOWN` on every route until Warmbly #55 measures a representative baseline. This file does not invent prazo.

Issue #90 (owned-audience opt-in) is **not authorized**. The `ainda_nao_pronto` route is citation/download only.

## First canary

- Asset family: `market_answer`
- Market answer id: `ma-pavimentacao-valor-tipico-v0`
- Question: Qual e o valor tipico dos contratos publicos de pavimentacao?
- Intent: `ver_propria_empresa`
- **Primary CTA:** `Veja sua empresa neste mercado`
- Secondary: Peca uma segunda leitura de contrato
- Feature flag: `conversion_market_answer_xray` (default off)

## Routes

| id | intent | eligibility | promised outcome | min fields | owner | channel | SLA | privacy/consent | fallback | kill gate | offer / service |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| aprender_mercado | aprender mercado | Answer/analysis visible; learning, not urgency | Explorar evidence/method/limits | none | web-cfg/editorial | on_page_evidence | UNKNOWN | no PII; no lead gate | citation_or_method_only | hide-answer or coercive form | evidence-method-explore / — |
| entender_contrato | entender contrato | Public contract or #83 in context | Analise tecnica / segunda leitura | public_contract_id | web-cfg/contract-analysis | editorial_or_handraise | UNKNOWN | contract id only until hand-raise | published analysis or method | lead-gated facts; case-study disguise | analise-tecnica-segunda-leitura / defesa-margem-contratos-publicos |
| ver_propria_empresa | ver propria empresa | Market Answer canary on screen | B2G X-Ray factual; no risk/dor/irregularidade | cnpj | web-cfg/conversion | xray_then_optional_handraise | UNKNOWN | CNPJ why/what shown; no URL/analytics; no name yet | NEEDS_DATA or NOT_FOUND | scores, hidden answer, invented SLA | b2g-xray-market-answer / diagnostico-b2g-360 |
| revisar_contrato | revisar contrato | Visitor asks human review of their contract | Defesa de Margem / Analise Meu Contrato | nome + contato + consent + contract/document | warmbly-after-capture | form_then_warmbly | UNKNOWN | explicit consent; no auto-send | operational WhatsApp if form fails | auto-message; “we found a problem” | analise-meu-contrato / defesa-margem-contratos-publicos |
| urgencia_real | urgencia real | Live pressure AND owned channel exists | WhatsApp or phone; no agenda (route absent) | none | tiago-jun-sasaki | whatsapp | UNKNOWN | visitor-initiated channel; persist only with consent | hand-raise without channel promise | invented SLA or ownerless agenda | falar-especialista / diagnostico-b2g-360 |
| ainda_nao_pronto | ainda nao pronto | Wants citation/download; #90 deferred | Citation or download; no form | none | web-cfg/editorial | citation_download | UNKNOWN | no PII; opt-in blocked | leave with visible answer | email capture or fake #90 | citation-download / — |
| contratar_relatorio_inteligencia_599 | contratar relatório de inteligência | A empresa informa raio/contexto; a CONFENGE busca os editais abertos; a quantidade segue a disponibilidade publicada; a profundidade é a máxima sustentada pelas informações da empresa | Confirmar raio, contexto, prazo e aceite; depois buscar os editais abertos disponíveis e preparar um relatório; não é checkout/catálogo | none | tiago-jun-sasaki | whatsapp | UNKNOWN | visitor-initiated; no message/PII in analytics | visible report remains ungated | oportunidades fornecidas pelo visitante, quantidade fixa/negociada, profundidade negociada/limitada, preço divergente, escopo concreto/SLA inventado, checkout ou PII em analytics | handraise-report-intelligence-599-v1 / — |

Nesta rota, `scope_state=UNKNOWN_UNTIL_HUMAN_ACCEPTANCE` vale para raio de atuação concreto, contexto da empresa, prazo e aceite. Não reabre os invariantes autorizados da entrega: a CONFENGE busca os editais abertos, a quantidade segue a disponibilidade publicada no raio confirmado e a análise alcança a profundidade máxima sustentada pelas informações apresentadas pela empresa.

## Operational channels

- WhatsApp/phone: exists (`5548988344559`, owner Tiago). SLA `UNKNOWN`.
- Agenda: **does not exist**. Do not offer.

## Auto-send

`auto_send=false` on every route. No messaging automation.
