# Correção de conversão SST 2026-09-26

Decisão: EXECUTE_NOW. Prioridade P0. Frente executiva: INBOUND ENGINE. Alavancas: receita, distribuição, confiança e cliente. Tempo para evidência técnica: nesta campanha. Efeito comercial permanece VALIDATE e só pode ser medido depois da publicação.

## Hipótese e arquitetura

O comprador de SST avança mais quando encontra uma entrega documental concreta, uma rota compatível com sua situação e um contato de baixo atrito. O hub existente foi preservado como autoridade canônica e passou a distribuir quatro intenções BOFU distintas:

1. `/elaboracao-pgr/`: PGR novo.
2. `/revisao-atualizacao-pgr/`: PGR existente que precisa ser revisado.
3. `/pgr-documentacao-sst-obras/`: PGR e documentos de obra.
4. `/terceirizacao-documentacao-sst/`: demanda documental recorrente ou acumulada.

As cinco rotas pertencem à família canônica `organizar_sst`. A separação não cria persona como fonte de verdade. Cada rota resolve um trabalho de compra diferente e volta ao hub para comparação.

## Fonte de verdade e limites

`data/commercial/sst-remote-portfolio.v1.json` classifica o portfólio em `REMOTO_COMERCIALIZAVEL`, `REMOTO_CONDICIONAL` e `NAO_OFERTAR_NESTA_VERTICAL`. O contrato exclui atividade presencial obrigatória e atos médicos da vertical remota. Nenhuma página oferece visita, inspeção física ou nova medição executada pela CONFENGE.

O primeiro contato pede somente contexto. Arquivos e dados de trabalhador seguem depois por canal combinado. Preço e prazo não foram inventados. ART aparece somente quando aplicável e a nota fiscal integra a entrega comercial.

## Dados, analytics e owner

Owner público: `web-cfg`. Fonte comercial: `CONFENGE_SST_REMOTE_PORTFOLIO/1.0.0`. A ação e o resultado comercial continuam pertencendo ao Warmbly. Além dos eventos canônicos (`cta_click`, `whatsapp_click`, `email_click`), a campanha implementa `sst_page_view`, `sst_cta_click`, `sst_whatsapp_click`, `sst_form_start`, `sst_form_submit`, `pgr_cta`, `pgr_review_cta`, `sst_obra_cta` e `sst_outsourcing_cta`, sem PII.

O inventário completo, os testes, as evidências, o deploy e a validação de produção ficam registrados em [`FECHAMENTO.md`](FECHAMENTO.md).

## Fontes oficiais

- NR 1 e página oficial do PGR, Ministério do Trabalho e Emprego.
- NR 18 vigente, Ministério do Trabalho e Emprego.
- Lei 6.496/1977 para ART.

As URLs exatas estão registradas no contrato de portfólio.

## Reversão

Reverter as cinco páginas, o contrato de portfólio, o registro da família, a redação da intenção e as entradas de sitemap. Não redirecionar o hub existente. Se uma rota filha for retirada depois de indexada, decidir REDIRECT ou RETIRE de forma individual.
