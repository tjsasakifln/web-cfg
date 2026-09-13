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

## Leitura comercial da sequência (SOLUCAO-INTEGRAL-20260913)

A sequência técnica acima é a ordem dos blocos que o contrato exige. A leitura
que o visitante faz segue `presentation_order` do JSON: necessidade → solução →
trabalhos e entregas → condução e integração → conclusão técnica → contato.

`material_boundary` reúne as condições reais que mudam a compra (preço ou
fatores de honorário, extensão contratada, obrigações, papel de terceiros,
campo, local, dependências, conflito, sigilo, prazo), ditas junto da decisão a
que pertencem. Não é inventário de ausências, estado de maturidade interna nem
lista do que a empresa não faz. Distinguir modalidades (elaborar, revisar,
compatibilizar, orçar, inspecionar, periciar, avaliar) explica a articulação e
permite proposta sob medida; não encerra a conversa com "isso é outra compra".

Um diagnóstico pode registrar `UNKNOWN` em um dado sem que isso limite a
solução que a empresa conduz a partir dele. "Solução completa" caracteriza a
solução técnica para a necessidade atendida quando a página enumera os
trabalhos que a compõem (ver `GX-06` em `data/commercial/copy-contract.v1.json`);
nunca promete aprovação, êxito, obra executada, prazo ou preço.
