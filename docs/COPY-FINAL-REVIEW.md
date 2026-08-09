# Copy final review (pt-BR commercial + public surfaces)

## Scope

1. **Commercial:** home, four offers, especialista, obrigado, header, mobile menu, footer, forms, metadata/OG/JSON-LD, validation-adjacent microcopy.
2. **Public content (em-dash pass):** `/radar/*`, `/conteudos/*`, `/inteligencia/*`, pilares técnicos, casos, legal pages, piloto.

User-facing em-dashes (travessões, U+2014) removed from CONFENGE prose. Official source titles (Planalto, TCU, AGU, CAIXA, Compras.gov.br) may keep `—` as external citation labels.

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
| Travessões (`—`) in commercial HTML | commas / parentheses / colons |
| `…operação — não para o mercado…` (radar) | `…operação, não para o mercado…` |
| `empresa — A, B, C — para` | `empresa (A, B, C) para` |
| `Delimite o problema — valor… — antes` | `Delimite o problema (valor…) antes` |
| `CONFENGE — Conteúdos` (RSS chrome) | `CONFENGE · Conteúdos` |
| Placeholder de dado ausente `—` | `n/d` |

## Offer identity (primary CTA)

- **Diretoria B2G:** Diagnosticar encaixe da Diretoria B2G
- **Diagnóstico B2G 360°:** Solicitar Diagnóstico B2G
- **Bid Room:** Avaliar proposta crítica (explained as sala de decisão da proposta)
- **Contract Defense & Margin:** Avaliar contrato sob pressão (explained as defesa técnica e proteção de margem)

## Gate

- `scripts/site/test_copy_gates.py` → commercial microcopy + `test_public_surfaces_have_no_prose_em_dashes`
- `scripts/site/lint_editorial_copy.py` → editorial JSON, ferramentas, and public HTML residual check
- `scripts/site/scrub_em_dashes.py --check` / `--write` → scrub + verify public HTML
- Generators must not reintroduce prose `—`: `scripts/pseo/build.py`, `scripts/pseo/render.py`, `scripts/site/inbound_first_remediate.py`

## Specialist chrome

Legacy nav fragments (`#atuacao`, `#diferenciais`, `#metodo`) aligned to current home (`#como-atuamos`, Diretoria B2G, Inteligência).
