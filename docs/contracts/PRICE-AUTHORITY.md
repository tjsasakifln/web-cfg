# Contrato de autoridade de preço

`CONFENGE_PRICE_AUTHORITY/1.0.0` evita quatro equivalências falsas:

```text
fundador autorizou testar ≠ margem validada
margem validada ≠ preço público
preço público ≠ checkout
inbound ≠ autorização outbound
```

`FOUNDER_AUTHORIZED_EXPERIMENT` exige autorização material com unidade, valor ou
piso e canal de teste. Permite proposta manual, mas não autoriza publicação nem
checkout. `MARGIN_VALIDATED` preserva o gate de três entregas pagas comparáveis e
margem direta mínima de 55% da #341. Cobrança automática depende de
`CHECKOUT_AUTHORIZED` e dos contratos financeiros do owner.

O registro executável está em `data/corporate/pricing-authority.v1.json`.
