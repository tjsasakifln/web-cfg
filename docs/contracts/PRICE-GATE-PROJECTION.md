# Projeção fail-closed do gate de preço

`CONFENGE_PRICE_GATE_PROJECTION/1.0.0` evita quatro equivalências falsas:

```text
fundador autorizou testar ≠ margem validada
margem validada ≠ preço público
preço público ≠ checkout
inbound ≠ autorização outbound
```

Este contrato não decide nem concede permissão comercial. A governança é a
autoridade de política, aprovação, exceção e kill switch. Sem pin material dessa
autoridade, a projeção local permanece `DENY` para proposta, exibição pública e
checkout.

`FOUNDER_AUTHORIZED_EXPERIMENT` descreve a semântica de uma autorização material
com unidade, valor ou piso e canal de teste; não a cria. `MARGIN_VALIDATED`
descreve o gate de três entregas pagas comparáveis e margem direta mínima de 55%
da #341. Cobrança automática depende de decisão externa
`CHECKOUT_AUTHORIZED` e dos contratos financeiros do owner.

A projeção consumível e não autoritativa está em
`data/corporate/pricing-gate-projection.v1.json`.
