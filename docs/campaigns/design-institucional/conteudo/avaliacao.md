# /servicos/#servico-avaliacao : avaliação de imóvel como seção própria

Procedência: lido em 2026-09-17 na base `47da03b64` (worktree `salto-01-piloto`): `servicos/index.html` (article `#servico-avaliacao`, linha 06), `data/corporate/intent-family-matrix.v1.json` (família `avaliar_imovel`), `data/site/brand.json` e `data/site/public-ia-map.json` (situação `property_valuation`), `scripts/site/hub_link_matrix.json` (entrada `servicos-avaliacao`), `data/site/credential-registry.json`, `triagem-tecnica/index.html` (`#pericia-avaliacao`), `scripts/site/test_home_conversion_contract.py::test_services_hub_is_corporate_indexable_and_price_free`, `tests/pos-inb-20260911/07/test_navigation.py`, `scripts/site/test_hub_link_matrix.py`. Frente A, conteúdo e percurso. Nada aqui altera HTML.

## 0. O que fica exatamente como está

- `<article class="corporate-service-row" id="servico-avaliacao" data-hub-link="servicos-avaliacao">`: id e marcador são REQUIRED_LINK no `hub_link_matrix.json` (`href /servicos/#servico-avaliacao`, rótulo "Avaliação de imóvel") e destino da situação `property_valuation` na home e no `public-ia-map`.
- Os dois eyebrows literais "O que assumimos" e "O que você passa a ter" (cobrados por linha em `test_services_hub_is_corporate_indexable_and_price_free`) e a frase "Parecer preliminar não substitui a avaliação formal".
- Os três canais atuais, com os hrefs exatos: `https://wa.me/5548988344559?text=Ol%C3%A1%2C%20Tiago.%20Preciso%20de%20avalia%C3%A7%C3%A3o%20de%20im%C3%B3vel.` ("Pedir pelo WhatsApp", `list-ruled__action`), `mailto:tiago.sasaki@confenge.com.br?subject=Avalia%C3%A7%C3%A3o%20de%20im%C3%B3vel` ("Enviar contexto por e-mail"), `/triagem-tecnica/#pericia-avaliacao` ("Pedir pela triagem"; o id existe na triagem).
- Nenhum "R$" seguido de dígito em `/servicos/` (asserção do teste do hub). É por isso que a figura "estrutura da análise" não carrega valor de mercado nem exemplo numérico: ela mostra a ordem da análise, não um resultado.
- Sem "campanha", sem "família pública", sem travessão, sem "sob medida" ou "personalizada".
- Credenciais: só o que o registro projeta (EESC-USP, CREA ativo, ART e nota fiscal, CNPJ). A pós-graduação em avaliações e o cadastro de perito estão WITHHELD no `credential-registry.json` e não entram.

## 1. Conteúdo da seção

Kicker (manter): Avaliação de imóvel

H3 (manter): Preciso do valor de um imóvel

Situação: Pessoas, famílias, empresas e advogados quando negociar, partilhar, dar em garantia ou registrar exige um valor de imóvel fundamentado em engenharia, para uma finalidade e uma data definidas. Pessoa física não precisa informar CNPJ para começar. Se a decisão também exigir inspeção da condição física ou assistência em uma disputa, a proposta combina as etapas.

O que assumimos: Avaliamos o imóvel urbano em cinco partes, sempre nesta ordem: o objeto (o que é o imóvel, onde está, com que documentos); a finalidade e a data (para que decisão o valor serve e em que momento); o método (comparativo ou evolutivo, conforme o caso, com as premissas escritas); os dados e fontes (amostra, documentos e vistoria, cada fonte citada e datada); e a conclusão delimitada (o que o valor representa e o que ele não representa).

O que você passa a ter: Laudo ou parecer de avaliação com objeto, finalidade, data, método, dados e conclusão delimitada, para negociar com um número que a outra parte consegue conferir, partilhar sem discutir a base, dar em garantia com fundamento ou registrar. Parecer preliminar não substitui a avaliação formal. O pedido entra aqui, com o que você já souber.

Para que serve (quatro usos, em uma linha cada):
- Negociar: comprar ou vender com um valor que explica a si mesmo, e não com a média de anúncios.
- Partilhar: divisão de bens, inventário ou dissolução de sociedade com base comum entre as partes.
- Garantia: dar o imóvel em garantia com valor fundamentado para quem recebe.
- Registro: atualização patrimonial, contabilização ou exigência formal de um valor com data.

O que confirmamos antes do aceite técnico:
- O objeto: imóvel urbano, com matrícula ou documento equivalente e localização definida.
- A finalidade e a data-base, porque elas mudam o método e os dados.
- Se cabe parecer preliminar ou avaliação formal: o parecer é uma leitura inicial e não substitui a avaliação formal.
- A vistoria: quando o método exige visita ao imóvel, ela é combinada na proposta, com local e logística confirmados.
- Independência: quando há disputa ou partes em conflito, verificamos conflito de interesse antes de receber qualquer documento.
- Atribuição e ART: o laudo é emitido no escopo e na atribuição profissional contratados, com ART e nota fiscal.
- Imóvel rural, imóvel no exterior e avaliação em massa de carteiras não fazem parte desta oferta. Se for o seu caso, descreva mesmo assim: a resposta diz o que é possível e o que não é.

Próximo passo (manter os três canais, na ordem atual): Pedir pelo WhatsApp · Enviar contexto por e-mail · Pedir pela triagem.

## 2. Figura "estrutura da análise"

Composição: prancha P4 da frente B, já gerada nesta worktree (`assets/pranchas/avaliacao-estrutura-desktop.svg` e `avaliacao-estrutura-mobile.svg`, fonte `data/demonstrative/plates/avaliacao-estrutura.v1.json`, manifesto `docs/campaigns/design-institucional/assets-manifest.json`, slot declarado para `/servicos/#servico-avaliacao`). Cinco passos encadeados AV-01 a AV-05 com os rótulos da fonte: Objeto; Finalidade e data; Método (comparativo ou evolutivo, conforme o caso); Dados e fontes (amostra, documentos, vistoria); Conclusão delimitada (limites, data e ressalvas), com foco em AV-05 e três chamadas numeradas. Sem valor monetário e sem número de norma, por decisão da fonte. A frente A não redesenha a figura; a legenda abaixo é escrita para essa composição e usa os mesmos cinco rótulos.

Legenda: Exemplo demonstrativo da estrutura de um laudo de avaliação, sem valor de mercado. Cada laudo ou parecer que entregamos segue estas cinco partes, nesta ordem: o objeto, a finalidade e a data, o método, os dados e fontes e a conclusão delimitada. É essa ordem que permite a quem recebe o documento conferir de onde o valor saiu e para que decisão ele serve. Parecer preliminar não substitui a avaliação formal.

## 3. Mapeamento e conflito registrado

- Situação do contrato: `property_valuation` ("Preciso do valor de um imóvel para negociar ou registrar", `href /servicos/#servico-avaliacao`, `index_state service_hub_index`).
- Família da matriz: `avaliar_imovel`, `canonical_service_family property_valuation`, `offer_ids urban_property_valuation` e `preliminary_property_opinion`, `terminal_action REQUEST_FORMAL_VALUATION_SCOPE`. Disambiguation: "Parecer preliminar não substitui avaliação formal. Imóvel rural, exterior ou avaliação em massa permanece GAP até existir capacidade e método comprovados." O texto acima nomeia esses três casos como fora da oferta sem prometer nada e sem abandonar o visitante.
- Conflito: `scripts/site/hub_link_matrix.json` declara `servicos-avaliacao` com `intent_family: produzir_prova_tecnica`. A matriz lista `urban_property_valuation` também em `produzir_prova_tecnica.offer_ids`, o que explica a dupla leitura, mas a família própria é `avaliar_imovel`. Registrado em `index-areas.json`; decisão do integrador.

## 4. Decisões que precisam do integrador

- A seção passa a ter figura e quatro subtítulos dentro de um `article.corporate-service-row`; conferir `test_ui_geometry.mjs` e o `grid-2` atual (os dois eyebrows vivem hoje em um `div.grid-2`).
- Figura P4 da frente B: decidir entre SVG inline (com `title`/`desc` e ids únicos) e `<img>` para os dois arquivos; ver `test_html_integrity` e a regra de nenhum "R$" seguido de dígito em `/servicos/` (a prancha não tem moeda).
- A linha 07 (`#servico-pericia`) aponta para `/servicos/#servico-avaliacao` ("Quando a disputa é de valor, veja avaliação de imóvel"); o link continua válido.
