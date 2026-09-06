# Contrato de página pública de serviço

Toda página consumidora segue, nessa ordem:

```text
situation
→ consequence_or_decision
→ deliverable
→ method
→ proof
→ material_boundary
→ next_useful_state
```

O contrato executável está em
`data/corporate/public-service-page-contract.v1.json`. Ele distingue laudo,
parecer, projeto, revisão e diagnóstico; define as classes mínimas de prova;
limita ART, NF, vistoria, campo e atendimento nacional; impede promessa de
aprovação ou êxito; e define o tratamento de oferta sem preço e de outra demanda
técnica.

Uma oferta sem preço não usa zero, faixa inventada, “sob consulta” como preço ou
CTA de compra. Ela informa o que falta delimitar e conduz a
`REQUEST_SCOPE_REVIEW`. Outra demanda termina em `NEEDS_CONTEXT` até haver
enquadramento ou GAP explícito.
