# Padrão editorial de naturalidade (CONFENGE)

**Objetivo:** páginas indexáveis devem parecer escritas por engenheiro que fala com diretor de construtora — não por template que distribui keywords.

## Regras obrigatórias

1. Responder à pergunta central nos primeiros 100–150 termos.
2. Informar cedo quando não existe resposta automática.
3. Usar preposições, artigos, sujeitos e verbos naturais.
4. Priorizar clareza sobre densidade de keywords.
5. Usar o termo principal só onde faz sentido editorial.
6. Cobrir cenário específico (não só definição genérica).
7. Diferenciar: regra geral · condições · exceções · documentos · riscos · decisão · quando buscar apoio.
8. Citar fontes oficiais sem extrapolar.
9. Avisar que contrato, edital, matriz de riscos e fatos do caso alteram a conclusão.
10. Encerrar com próximo passo coerente com a jornada (A contrato / B edital / C operação).

## Proibições (gates automatizados)

| Padrão | Por quê |
|--------|---------|
| `Converta a discussão sobre {keyword} em um objeto delimitado...` | Instrução de gerador, não linguagem humana |
| `Qual documento deve ser lido primeiro em um caso de {keyword}?` | FAQ mecânica a partir do slug |
| `Qual o primeiro risco prático em um caso de {keyword}?` | Idem |
| `O caso de {slug sem preposições} só se sustenta` | Keyword crua como substantivo |
| `absorver custo ou risco de {slug} sem prova` | Keyword enxertada |
| Termos de pipeline (`dataset_hash`, `page_material_hash`, Wave 1, etc.) | Vazamento interno |

## FAQ

- Só mantenha `FAQPage` com perguntas reais, respostas visíveis e valor adicional.
- Não repita a keyword na pergunta só para rankear.
- Se o FAQ for clone entre páginas, remova ou reescreva.

## Jornadas e CTA

| Jornada | Situação | CTA semântico |
|---------|----------|---------------|
| A `contrato` | glosa, medição, aditivo, reequilíbrio, atraso, multa | Enviar documentos para análise |
| B `edital` | edital, proposta, BDI, habilitação | Enviar edital para triagem |
| C `operacao` | rotina B2G, seleção, governança | Diagnosticar a operação B2G |

Uma jornada principal por página. Sem três CTAs de mesmo peso.

## Ofertas (linguagem comum primeiro)

Exemplo correto: *“Rotina contínua de decisão em licitações e contratos públicos — modelo denominado Diretoria B2G fracionada.”*

Evitar abrir só com Bid Room / Contract Defense / Diretoria B2G sem o benefício.

## Aprovação humana

Nenhuma automação marca `HUMAN_APPROVED` ou `INDEXABLE`. Wave 1 permanece no fluxo da PR nº 10 (`approve_wave1_tiago.sh`).

## Implementação

- Detecção: `scripts/site/inbound_gates.py`, `scripts/editorial/naturalness.py`
- Remediação P0: `scripts/site/inbound_first_remediate.py`
- Testes: `npm run test:inbound-gates`
