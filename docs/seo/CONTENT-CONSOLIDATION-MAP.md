# Mapa de consolidação de conteúdo

## Princípio

Uma URL só permanece indexável se a intenção for **distinta**. Variação lexical / singular-plural / ordem de palavras **não** justifica página separada.

## Clusters comerciais prioritários

| # | Cluster | Pilar | Oferta principal | Jornada | CTA |
|---|---------|-------|------------------|---------|-----|
| 1 | Medições, glosas, pagamentos | `/medicoes-glosas-obras-publicas/` | Contract Defense (defesa de margem) | A | Enviar documentos |
| 2 | Aditivos / serviços não previstos | `/aditivos-obras-publicas/` | Contract Defense | A | Enviar documentos |
| 3 | Reequilíbrio | `/reequilibrio-obras-publicas/` | Contract Defense | A | Enviar documentos |
| 4 | Atrasos / prorrogação / paralisação | `/atrasos-prorrogacao-obras-publicas/` | Contract Defense | A | Enviar documentos |
| 5 | Edital / decisão de participar | `/diagnostico-pre-licitacao/` | Bid Room (sala de decisão) | B | Enviar edital |
| 6 | Orçamento / BDI / SINAPI / SICRO | `/auditoria-orcamento-licitacao/` | Bid Room | B | Enviar edital |
| 7 | Notificações / multas / defesa | `/defesa-tecnica-contratos-publicos/` | Contract Defense | A | Enviar documentos |
| 8 | Operação B2G | `/diretoria-b2g/`, `/diagnostico-b2g-360/` | Diretoria B2G / Diagnóstico | C | Diagnosticar operação |

## Inventário indexável atual (`/conteudos/`)

22 URLs — ver matriz. Exemplos de distinção:

| URL | Intenção distinta |
|-----|-------------------|
| `atraso-pagamento-...-suspender` | Pode suspender por inadimplemento? |
| `atraso-na-medicao-...` | Medição não apreciada / caixa |
| `glosa-por-qualidade-...` | Glosa por defeito vs medição inteira |
| `limite-aditivo-25-50-...` | Teto legal de alteração |
| `sinapi-desonerado-...` | Regime tributário da tabela |
| `sinapi-ou-sicro-...` | Qual referência de preço |

## Canibalização conhecida (Wave 1 editorial)

Ver `docs/editorial/CONTENT-CANNIBALIZATION-REPORT.md`.  
Páginas editoriais Wave 1 competem com alguns `/conteudos/` ainda `index,follow` (ex.: limite 25/50, notificação atraso). **Não consolidar em lote sem GSC.** Após indexação humana de Wave 1, aplicar:

- perdedor → `noindex` + canonical ou 301 para vencedor
- hub e related já filtram `noindex`

## 98 noindex

Status: `RETAIN_NOINDEX`.  
Não reabrir em lote. Critérios para onda P1 (5–8 páginas):

1. Intenção comercial clara  
2. Sinal real de demanda (GSC) **ou** gap crítico na jornada  
3. Reescrita substancial + fontes  
4. Sem canibalizar indexável existente  
5. Aprovação humana  
6. Gates verdes  

## Dados ausentes

`traffic`, `impressions`, `clicks`, `backlinks` = **NO_DATA** em toda a matriz. Disposições que dependem de demanda real ficam explícitas como `BLOCKED_MISSING_EVIDENCE` ou adiadas a P1.
