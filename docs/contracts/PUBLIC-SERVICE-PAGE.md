# Contrato de página pública de serviço

Toda página consumidora deve cumprir estas funções editoriais:

```text
explicar o serviço
→ relacionar decisões técnicas ao empreendimento
→ demonstrar competência pertinente
→ apoiar uma decisão de contratação
→ oferecer contato útil
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

## Leitura comercial (Comunicação Institucional, Competência e Conversão)

A ordem, o agrupamento e a profundidade dos blocos variam com o serviço. O
contrato exige as funções acima, sem impor uma narrativa única. As condições
materiais aparecem junto da decisão a que pertencem.

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
