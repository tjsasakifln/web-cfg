# Contrato de taxonomia comercial

As autoridades são:

- `CONFENGE_COMMERCIAL_CONSTITUTION/1.0.0` — tese, owners, regra nacional e
  fallback;
- `CONFENGE_CORPORATE_TAXONOMY/1.0.0` — cinco agrupamentos operacionais internos;
- `CONFENGE_PUBLIC_INTENT_MATRIX/1.0.0` — linguagem pública e anti-canibalização;
- `CONFENGE_OFFER_CATALOG/2.0.0` — ofertas finitas e B2G por referência.

O fluxo semântico é:

```text
situação reconhecível
→ família de intenção
→ família canônica de serviço
→ oferta finita | NEEDS_CONTEXT/GAP
→ próximo estado útil
```

Persona não resolve rota. Nome de núcleo não precisa aparecer na copy. Uma
oferta inexistente ou um hash divergente falha fechado. A matriz completa está
em `data/corporate/intent-family-matrix.v1.json` e já contém os campos:
`intent_family | public_wording | canonical_service_family | offer_ids |
audience_examples | terminal_action | adjacent_intents | disambiguation`.

O catálogo B2G existente continua sendo a verdade de IDs, nomes, preços e
checkout. A camada multivertical só o expande em memória por referência.
Nas duas famílias B2G, `offer_ids` contém entradas representativas. A cobertura
integral permanece na referência tipada ao registro de 54 entregáveis e aos
quatro checkouts vigentes; consumidores não podem interpretar a seleção como
redução do catálogo protegido.
