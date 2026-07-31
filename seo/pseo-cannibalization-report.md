# pSEO Cannibalization Report

Decisões de indexação só com intenção própria + info exclusiva + CTA coerente.

## Páginas pSEO vs guias/serviços existentes

| page_id | decision | competitor | exclusive | status |
|---|---|---|---|---|
| `market-pavimentacao-infraestrutura-viaria-sc` | noindex | — | dados públicos do datalake (se independência amostral OK) | reject |
| `market-pavimentacao-infraestrutura-viaria-pi` | noindex | — | dados públicos do datalake (se independência amostral OK) | reject |
| `market-edificacoes-publicas-mg` | noindex | — | dados públicos do datalake (se independência amostral OK) | reject |
| `market-edificacoes-publicas-rs` | noindex | — | dados públicos do datalake (se independência amostral OK) | reject |
| `agency-88830609` | reject | — | histórico do órgão se primários independentes | noindex |
| `price-manutencao-predial-engenharia-rs-manutencao-predial` | noindex | — | faixa de tickets contratuais se diversidade OK | noindex |
| `price-pavimentacao-infraestrutura-viaria-pi-paralelepipedo` | noindex | — | faixa de tickets contratuais se diversidade OK | noindex |
| `comp-manutencao-predial-engenharia-rs` | noindex | — | dados públicos do datalake (se independência amostral OK) | reject |
| `radar-edificacoes-publicas-pr` | noindex | — | oportunidades abertas deduplicadas com link de edital | noindex |
| `radar-pavimentacao-infraestrutura-viaria-sc` | noindex | — | oportunidades abertas deduplicadas com link de edital | noindex |
| `radar-saneamento-hidraulica-sc` | noindex | — | oportunidades abertas deduplicadas com link de edital | noindex |
| `radar-pavimentacao-infraestrutura-viaria-rs` | noindex | — | oportunidades abertas deduplicadas com link de edital | noindex |
| `radar-edificacoes-publicas-sc` | noindex | — | oportunidades abertas deduplicadas com link de edital | noindex |
| `radar-pavimentacao-infraestrutura-viaria-pr` | noindex | — | oportunidades abertas deduplicadas com link de edital | noindex |
| `radar-edificacoes-publicas-rs` | noindex | — | oportunidades abertas deduplicadas com link de edital | noindex |
| `prob-orcamento-edital` | consolidate | /auditoria-orcamento-licitacao/ | nenhuma evidência claim-específica no datalake atual | noindex |
| `prob-sinapi-sicro` | consolidate | /conteudos/ | nenhuma evidência claim-específica no datalake atual | noindex |
| `prob-medicao-glosa` | consolidate | /conteudos/ | nenhuma evidência claim-específica no datalake atual | noindex |
| `prob-aditivos-margem` | consolidate | /aditivos-obras-publicas/ | nenhuma evidência claim-específica no datalake atual | noindex |
| `prob-reequilibrio` | consolidate | /conteudos/ | nenhuma evidência claim-específica no datalake atual | noindex |

## Regras

- Zero indexável é aceitável se nenhuma página satisfizer os gates.
- Cenários problema → consolidar com guias técnicos até haver evidência claim-específica.
- Benchmarks de ticket contratual não competem com 'preço unitário' — copy deve deixar isso explícito.
- Radars só indexam com ≥3 oportunidades únicas, dedup=0 e links de edital.
