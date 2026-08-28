# Matriz 8 → oferta — vitrine pública de `/entregas/`

Fonte: `data/commercial/deliverables-registry.v1.json` (`public_state === PUBLISHED`).
Os demais 46 itens (44 VALIDATE, 2 BLOCKED) permanecem no registro interno e não aparecem como produto.

| ID | Nome público | Rota | Preço | CTA do item |
| --- | --- | --- | --- | --- |
| CFG-D01 | Radar de Licitações Prioritárias | `/casos/modelo-relatorio-inteligencia-licitacoes/` | R$ 599 | Ver o exemplo de Radar de Licitações Prioritárias |
| CFG-D02 | Base de Mercado para Expansão | `/casos/modelo-base-quantitativa-canonica/` | R$ 690 | Ver o exemplo de Base de Mercado para Expansão |
| CFG-D03 | Síntese Executiva de Expansão | `/casos/modelo-apresentacao-executiva-resultados/` | R$ 890 | Ver o exemplo de Síntese Executiva de Expansão |
| CFG-D04 | Mapa de Órgãos com Maior Potencial | `/casos/modelo-mapa-compradores-publicos/` | R$ 1.200 | Ver o exemplo de Mapa de Órgãos com Maior Potencial |
| CFG-D05 | Radar de Contratos Próximos da Renovação | `/casos/modelo-contratos-vincendos-relicitacao/` | R$ 1.450 | Ver o exemplo de Radar de Contratos Próximos da Renovação |
| CFG-D06 | Mapa de Concorrentes Relevantes | `/casos/modelo-mapeamento-concorrentes-publicos/` | R$ 1.900 | Ver o exemplo de Mapa de Concorrentes Relevantes |
| CFG-D07 | Referências de Preços de Obras Públicas | `/casos/modelo-painel-precos-obras-publicas/` | R$ 2.400 | Ver o exemplo de Referências de Preços de Obras Públicas |
| CFG-D08 | Plano Executivo de Expansão | `/casos/modelo-relatorio-executivo-consolidado/` | R$ 3.750 | Ver o exemplo de Plano Executivo de Expansão |

Faixa pública única: R$ 599 a R$ 3.750.
Captura terminal: `#captura-entregas` (`/.netlify/functions/lead`), com select só das oito unidades publicadas.
Deep links estáveis: `#entrega-01` … `#entrega-08`.
