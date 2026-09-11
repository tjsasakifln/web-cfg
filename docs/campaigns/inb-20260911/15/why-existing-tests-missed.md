# Por que as suites existentes não substituem o CORE_QA_SUITE

Contraprova desta campanha. Não é catálogo público.

| Lacuna material | Suites atuais | Por que não pegam |
|---|---|---|
| Recibo antes de persistir, no percurso de compra | `test_lead_function.mjs` exige 201 + store no caminho feliz; não classifica HTML que afirma recibo sem `lead.cjs`; não tem fixture adversarial de handler que devolve 201 com store vazio num runner de jornada. | O teste mora no handler, não no conjunto compra+HTML+recibo. |
| Dado de teste publicado | `test_real_proof_registry.mjs` pega claim de cliente real; não varre `qa.test@`, `CONFENGE_TEST_`, `LEAD_STORE_DIR`, `localhost:4173` em HTML público. | Marcadores de fixture não são “cliente real”. |
| Dependência de prova ausente (cálculos/IDs) | Proof registry exige rótulo demonstrativo, não memória de cálculo nem IDs de item. | Imagem/badge passa sem números conferíveis. |
| Link obrigatório quebrado (`data-cta-id`) | `gate_index_surface` e `test_internal_links_resolve` não tratam CTA com `data-cta-id`/`data-receipt-required` como obrigatório da jornada. | Link de navegação ≠ CTA de compra. |
| Dado pessoal em evento | `test_analytics_pii.mjs` e `admitEvent` cobrem o contrato; o runner de jornada não era invocável contra um admit passthrough local. | Sem mutação isolada no CORE_QA_SUITE. |
| Conclusão errada para desconhecido | `test_private_project_technical_readiness.mjs` já impede UNKNOWN→GAP no motor; não prova que o runner independente falha um classificador adversarial. | Cobertura do motor ≠ cobertura do revisor. |
| CORE omitido do manifest | Nenhum teste impede o integrador de dropar campanha 03–10 da lista de release. | A matriz desta suíte sempre inclui 01–10. |
| WhatsApp como conversa persistida | `test_cta_whatsapp.mjs` exige `wa.me`; `test_contact_journeys.mjs` aceita WhatsApp como canal. | Ninguém falha “recibo” atribuído a clique em WhatsApp. |

A suíte em `tests/campaigns/inb_20260911/15/` consome os mesmos unidades (`lead.cjs`, `event-contract.cjs`, `inbound_gates._match_family`, `diagnosePrivateProjectTechnicalReadiness`, `real_proof_registry`) e acrescenta só a contraprova das lacunas acima.
