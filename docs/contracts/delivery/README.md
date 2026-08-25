# Delivery gate compatibility contract

Status: `CONTRACT_PROVEN`, synthetic fixture only. Tracks
[`tjsasakifln/web-cfg#88`](https://github.com/tjsasakifln/web-cfg/issues/88)
and the cross-repo canary coordinated by
[`tjsasakifln/Governance#120`](https://github.com/tjsasakifln/Governance/issues/120).

## Ownership

- `web-cfg` owns the public offer/deliverable identifiers and the future
  contracting/checkout/provider-event producer. This directory only validates
  compatibility and supplies a sanitized fixture.
- Warmbly owns proposal/commercial state and real financial reconciliation. It
  emits `confenge.delivery_order_requested.v1`.
- Governance owns readiness, capacity, delivery admission and Work Orders. A
  schema-valid request is not proof that a Work Order was admitted.
- Asaas owns external provider facts. An HTTP 2xx, callback,
  `PAYMENT_CONFIRMED` or provider object alone is never an authorized delivery
  gate or received revenue.

No proposal, CRM, billing ledger, reconciliation truth or Work Order is created
in this repository.

## Versioned contracts

- `confenge.financial_gate.v1.schema.json` defines the nested, fail-closed gate.
  Its `received_revenue` field is always the literal `false` because the gate is
  an admission fact, not revenue recognition.
- `confenge.delivery_order_requested.v1.schema.json` defines the Warmbly to
  Governance handoff and binds proposal, accepted snapshot, offer, deliverable,
  scope, price, terms, onboarding and financial-gate references.

Warmbly is the canonical producer. Its golden is
`docs/contracts/proposal-v1/fixtures/delivery-order-requested.synthetic.v1.json`.
The two repositories pin the following compatibility fingerprints:

| Artifact | SHA-256 |
| --- | --- |
| `confenge.delivery_order_requested.v1.schema.json` bytes | `6464c124040bbadea9f719dcecacdcd3faa85febfa4610950f3791bb224fb0ba` |
| `confenge.financial_gate.v1.schema.json` bytes | `5c0bdecf80fdfe1101ba1606f8a5462f035aae7c2a2b0d262af86de7b6d4a903` |
| sorted-key golden JSON semantics | `1b57b3ba107ed0adb2d27a8e2b6088b8f6584512152c864d90f39da5f5d4345e` |

The validator additionally enforces invariants JSON Schema cannot express: for
`SYNTHETIC_VALID` and `AUTHORIZED`, top-level `synthetic` must equal
`financial_gate.synthetic`; a non-`UNKNOWN` gate needs an onboarding reference;
and `UNKNOWN` is valid but classified `HELD`, never admitted. An `UNKNOWN`
acceptance handoff may still be a synthetic proposal event while truthfully
carrying a non-synthetic, absent financial gate.

## Canary binding

The checked-in fixture is sanitized and binds only the authorized first slice:

| Field | Value |
| --- | --- |
| offer / version | `CFG-DIAG-EXP-v1` / `v1` |
| deliverable / version | `CFG-DIAG-EXP-v1` / `v1` |
| scope version | `CFG-SCOPE-DIAG-EXP-v1` |
| price version | `CFG-OFFER-CATALOG-v1` (pins BRL 800000 cents upstream) |
| terms version | `CFG-TERMS-B2B-2026-08-17-v1` |
| registry ref | `github://tjsasakifln/web-cfg@6c3415cb05b3423d87592eba39d3a0ec61bde0b1/data/commercial/deliverables-registry.v1.json` |
| registry hash | `sha256:b4d85f4d32244e2d27c8a68b68e02041c7621bc23060ad4046217a35f86606cc` |

The deliverable is the `expansion_package` plan consumed by Governance; it is
not a copied 54-row readiness registry.

## Synthetic fixture and real replacement

`data/offers/fixtures/delivery-gate/synthetic-financial-gate.v1.json` exercises
the production-shaped nested contract with:

```text
state=SYNTHETIC_VALID
synthetic=true
received_revenue=false
```

The real replacement is the Warmbly-owned
`confenge.financial_gate_reconciled.v1`. `web-cfg` may later emit the existing
normalized provider-side fact `confenge.commercial_event.v1`, but it cannot
mint the reconciled event or an `AUTHORIZED` gate. Warmbly may project
`financial_gate.state=AUTHORIZED` only after provider evidence is reconciled
and the explicit financial policy authorizes it; the reconciled event ID then
becomes `financial_gate.source_event_id`. The local adapter deliberately
returns `warmbly_reconciliation_required` if asked to authorize.

## Safety state and verification

The contract test checks that these values remain unchanged:

```text
CONFENGE_OFFER_CATALOG_PUBLIC=false
ASAAS_MODE=disabled
production_checkout_enabled=false
production_webhook_enabled=false
real_money_mutation_enabled=false
all provider mappings=null
```

Run:

```bash
npm run test:delivery-gate-contract
```

The test is hermetic: it performs no Asaas, e-mail or customer network call.
Rollback is a revert of the contract, fixture, validator and tests; no external
state exists to compensate.
