# Copy final review (pt-BR commercial surfaces)

## Scope

Home, four offers, especialista, obrigado, header, mobile menu, footer, forms, metadata/OG/JSON-LD, validation-adjacent microcopy. User-facing em-dashes (travessões) removed from commercial HTML.

## Corrections applied

| Before | After |
|--------|--------|
| Premissas e decisões registrados | Premissas e decisões ficam registradas |
| A CONFENGE assume a recomendação e confronta com o resultado | Cada recomendação da CONFENGE é confrontada posteriormente com o resultado |
| Preferir formulário | Continuar pelo formulário |
| Deep work | Análise concentrada |
| GO / REVIEW / NO-GO (theater) | Avançar, revisar ou recusar |
| Conhecer a Diretoria B2G | Diagnosticar encaixe da Diretoria B2G |
| Avaliar uma oportunidade | Avaliar proposta crítica |
| Enquadrar um risco contratual | Avaliar contrato sob pressão |
| sala de guerra | coordenação da proposta / coordenação intensiva (explained) |
| Workstreams | Frentes de trabalho |
| Travessões (—) in commercial HTML | commas / parentheses / colons |

## Offer identity (primary CTA)

- **Diretoria B2G:** Diagnosticar encaixe da Diretoria B2G
- **Diagnóstico B2G 360°:** Solicitar Diagnóstico B2G
- **Bid Room:** Avaliar proposta crítica (explained as sala de decisão da proposta)
- **Contract Defense & Margin:** Avaliar contrato sob pressão (explained as defesa técnica e proteção de margem)

## Gate

`scripts/site/test_copy_gates.py` → `test_concordance_and_forbidden_microcopy` + landmark check. Regex gate covers known defects only; not a substitute for human review.

## Specialist chrome

Legacy nav fragments (`#atuacao`, `#diferenciais`, `#metodo`) aligned to current home (`#como-atuamos`, Diretoria B2G, Inteligência).
