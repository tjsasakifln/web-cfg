# Consumo por MV-04 a MV-07

Todos os consumidores usam `consumer-pin.json`. Hash divergente bloqueia
integração; não há fallback permissivo.

## MV-04 — home e shell corporativo

- Começar pelas situações de `intent-family-matrix.v1.json`.
- Não transformar os cinco núcleos em cinco promessas ou menus obrigatórios.
- Usar a tese e o wording nacional da constituição.
- Não inventar preço, prazo, case, credencial ou capacidade.

## MV-05 — engenharia privada

- Consumir `projetar_revisar_compatibilizar`, `orcar_planejar_decidir`,
  `inspecionar_diagnosticar`, `receber_entregar_reformar` e
  `documentar_as_built_regularizar`.
- Para #602, usar `complementary_engineering_project_review` e manter autoria
  arquitetônica, disciplina, campo, aprovação e ART nas fronteiras declaradas.

## MV-06 — perícias, avaliações e SST

- Consumir as famílias de prova, avaliação, assistência trabalhista e SST.
- Aplicar a classe mínima de prova antes de claim profissional.
- Diferenciar laudo, parecer, diagnóstico e assistência de parte.

## MV-07 — planejamento público e B2G

- Consumir `public_works_technical_procurement_planning` para o ente.
- Consumir o catálogo 54/54 por referência para licitante e contratado.
- Tratar os `offer_ids` B2G da matriz como entradas representativas e resolver
  a cobertura integral pela autoridade tipada; não retirar os demais itens.
- Bloquear atendimento simultâneo ao ente e ao licitante no mesmo certame.
- Não criar `CFG-D55`; qualquer mutação do registro compartilhado é de MV-09.

## Integração comum

MV-09 é o único owner de `public-family-registry.json`, package/workflows,
merge e deploy. Toda rota com preço precisa de captura fail-closed. Inbound não
autoriza outbound, SMTP ou ação comercial automática.
