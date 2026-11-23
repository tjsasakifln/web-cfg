# Protocolo 2 — teste de cinco segundos (#184), absorvido em #336

Versao 1.2.0. Congelado antes do primeiro recrutamento da amostra unica de 20.
Nao e uma segunda pesquisa.

## Estimulo e execucao

Capturar a primeira viewport da home no SHA registrado, sem banners ou dados
personalizados. Usar viewport real atribuido antes da sessao; a amostra inclui
ao menos duas exposicoes mobile e duas desktop.

1. Mostrar o estimulo por cinco segundos, cronometrados.
2. Ocultar completamente.
3. Fazer as perguntas na ordem abaixo, sem reexibir e sem explicar termos.
4. Depois do registro, permitir reexibicao somente para feedback exploratorio
   privado que nao entra na pontuacao.

## Perguntas neutras

1. Para quem e esta pagina?
2. Que problema ela ajuda a resolver?
3. O que voce faria em seguida?
4. Isto parece consultoria, software/produto, ou outra coisa? Por que?

O moderador pode pedir “pode falar mais?” e nada alem disso. Nao pode mencionar
nucleo, consultoria ou CTA antes da resposta.

## Codificacao congelada

- `audience`: identifica profissional ou empresa com decisao tecnica documental
  em um dos cinco nucleos.
- `problem`: identifica uma decisao tecnica, pericial, avaliatoria, de SST ou
  contratual/B2G.
- `next_action`: identifica analise do caso, envio de documento, escolha de
  nucleo ou contato com a CONFENGE.
- `not_software`: classifica como consultoria/servico e nao interpreta o painel
  de evidencias como software/produto contratado.

Cada dimensao passa com pelo menos 80%; na amostra minima, isso exige 16/20.
Qualquer dimensao abaixo disso reprova. CTR do CTA principal continua residual
separado e nao e WTP. Uma sessao nao prova causalidade. Menos de vinte:
`AMOSTRA_INSUFICIENTE`.
