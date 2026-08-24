# Protocolo 2 — teste de cinco segundos (#184)

Versão 1.0.0. Congelado antes do primeiro recrutamento.

## Estímulo e execução

Capturar a primeira viewport da home no SHA registrado, sem banners ou dados
personalizados. Usar viewport real atribuído antes da sessão; a amostra inclui
ao menos duas exposições mobile e duas desktop, sem decidir resultado separado
por dispositivo com subamostra inferior a cinco.

1. Mostrar o estímulo por cinco segundos, cronometrados.
2. Ocultar completamente.
3. Fazer as perguntas na ordem abaixo, sem reexibir e sem explicar termos.
4. Depois do registro, permitir reexibição somente para feedback exploratório
   privado que não entra na pontuação.

## Perguntas neutras

1. Para quem é esta página?
2. Que problema ela ajuda a resolver?
3. O que você faria em seguida?
4. Isto parece consultoria, software/produto, ou outra coisa? Por quê?

O moderador pode pedir “pode falar mais?” e nada além disso. Não pode mencionar
construtora, obra pública, margem, consultoria ou CTA antes da resposta.

## Codificação congelada

- `audience`: identifica construtora/empresa de engenharia ligada a licitação ou
  contrato de obra pública.
- `problem`: identifica decisão em licitação, risco contratual ou proteção de
  margem/resultado.
- `next_action`: identifica análise do caso, envio de documento, caminhos por
  situação ou contato com a CONFENGE.
- `not_software`: classifica como consultoria/serviço e não interpreta o painel
  de evidências como software/produto contratado.

Cada dimensão passa com pelo menos 80%; na amostra mínima, isso exige 4/5.
Qualquer dimensão abaixo disso reprova.
Só então a leitura pode recomendar manter, mover depois do hero ou substituir o
painel. CTR do CTA principal e scroll para `#jornadas` continuam residuais
separados, com baseline e janela de tráfego próprias. Uma sessão não prova
causalidade. Menos de cinco: `AMOSTRA_INSUFICIENTE`.
