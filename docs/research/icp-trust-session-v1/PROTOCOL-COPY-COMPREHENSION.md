# Protocolo 3 — compreensão da copy (#188)

Versão 1.0.0. Congelado antes do primeiro recrutamento.

## Estímulo

Usar as ofertas e descrições do SHA registrado, sem reescrever no instrumento.
Exibir uma oferta por vez, em ordem alternada. Para cada oferta, perguntar sem
explicação do moderador:

O escopo v1 é fechado: `diagnostico-b2g-360`, `diretoria-b2g`, `bid-room` e
`contract-defense`, nos quatro caminhos registrados em `protocol.json`. O
agregado deve conter as quatro ofertas; remover, renomear ou acrescentar uma
exige nova versão do protocolo antes do recrutamento.

1. Para quem é esta oferta?
2. Em qual situação ela seria usada?
3. O que a CONFENGE entrega?
4. Qual é o próximo passo possível?

Depois das quatro respostas, perguntar: “Há algum nome ou termo que precisaria
de uma descrição imediata em português?”. Sondar explicitamente `Bid Room`,
`Contract Defense & Margin` e `Diretoria B2G fracionada`, sem definir nenhum
deles. Se um nome não estiver no snapshot público testado, marcar
`NOT_PRESENT_IN_BOUND_SNAPSHOT`; não criar uma oferta substituta.

## Codificação congelada

Para cada oferta e pessoa, registrar quatro flags: `audience`, `situation`,
`deliverable`, `next_action`. Marcar sucesso somente quando a resposta recupera
o sentido publicado sem ajuda. Para os três nomes híbridos/ingleses, registrar
também `needs_portuguese_descriptor`.

Cada dimensão de cada oferta passa com pelo menos 80%; na amostra mínima, isso
exige 4/5. Um termo só dispensa descrição portuguesa quando o mesmo limiar o
entende sem ajuda. Reprovação
orienta nova copy, mas não autoriza remover termos técnicos que o ICP usa com
precisão, incluindo BDI, SINAPI, glosa e reequilíbrio.

Não guardar citações livres no repositório. A interpretação usa apenas padrões
agregados. Comparação de cliques antes/depois exige janela datada própria e não
recebe conclusão causal a partir desta sessão. Menos de cinco:
`AMOSTRA_INSUFICIENTE`.
