# Slug, intenção e canibalização

CAMPAIGN_ID=09
ISSUE_OWNER=589

## Intenção da rota

Visitante: construtora, incorporadora, empresa de engenharia, projetista coordenador ou gestor técnico de obra **privada**.

Trabalho: identificar evidências técnicas presentes, ausentes ou desconhecidas antes de contratar, executar ou retomar a obra.

Não é leitura de contrato público, edital, PNCP, margem B2G nem orçamento de licitação.

## Slug canônico proposto (pós-promoção, goal 97)

`/ferramentas/prontidao-tecnica-obra-privada/`

Uma rota, não família mecânica. Title/H1 prometem o visitor job. Indexação só depois de conteúdo, método, captura e prova verdes.

Canário atual (isolado): `docs/integration/campaign-20260904/09/canary/index.html`. Sem `rel=canonical` público: o arquivo não é rota publicada, `/piloto/` está travado em 24 URLs e `/ferramentas/prontidao-tecnica-obra-privada/` só existe depois do goal 97.

## Mapa contra rotas B2G existentes

| Rota existente | Intenção | Sobreposição |
| --- | --- | --- |
| `/ferramentas/diagnostico-defesa-margem/` | Contrato público, recorte PNCP, UNKNOWN de aditivo/medição | Nenhuma. Público vs privado; fonte oficial vs autoavaliação. |
| `/diagnostico-pre-licitacao/` | Preparação de licitação | Nenhuma. B2G. |
| `/diagnostico-b2g-360/` | Oferta B2G | Nenhuma. |
| `/diagnostico-b2g-expansao/` | Oferta B2G | Nenhuma. |
| `/auditoria-orcamento-licitacao/` | Orçamento de certame | Nenhuma. |
| `/piloto/ofertas/diagnostico-expansao/` | Oferta piloto com preço | Nenhuma. Não reutilizar este namespace. |
| `/ferramentas/matriz-atraso-obra/` | Atraso em contrato (hipótese) | Baixa. Evento de atraso vs prontidão documental de obra privada. |

O slug evita o prefixo `diagnostico-` para não competir com a família B2G já indexável.
