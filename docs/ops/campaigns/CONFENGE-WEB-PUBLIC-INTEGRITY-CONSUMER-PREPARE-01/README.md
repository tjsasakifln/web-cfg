# CONFENGE-WEB-PUBLIC-INTEGRITY-CONSUMER-PREPARE-01

**Decision state:** P1 / VALIDATE / CONSUMER_PREPARE_ONLY  
**Leverage:** trust + revenue (diligencia humana) + distribution (BOFU utility)  
**Time to evidence:** keyed live canary (out of this wave)

## Status

| Campo | Valor |
|---|---|
| CAMPAIGN | CONFENGE-WEB-PUBLIC-INTEGRITY-CONSUMER-PREPARE-01 |
| BASE_SHA | `d1c7aaa66969cc63aa673f2c16a5df22a90bc7a9` (`origin/main`) |
| CONSUMED_SCHEMA | `public-read-integrity/1.0` |
| PRODUCER | extra-cli#436 SHA `8e15f94fb641a79954a8c909417bb9df18c0d491` **PRODUCER_CODE_DEPLOYED** |
| KEYED_LIVE_CANARY | **KEYED_LIVE_CANARY_PENDING** (unkeyed live canary correctly returned UNKNOWN) |
| WAVE | **CONSUMER_PREPARE_ONLY** |
| FEATURE_FLAG | `PUBLIC_INTEGRITY_CONSUMER` |
| FLAG_DEFAULT | `false` |
| FINAL_VERDICT | READY_FOR_KEYED_LIVE_CANARY |
| MERGED | false |
| DEPLOYED | false |

web-cfg#156 still described the consumer as blocked on the producer. This campaign
distinguishes: producer code is deployed; keyed live proof is pending; this PR
only prepares the fail-closed consumer. The issue is **not closed**.

## Visitor job

Parceiro / consorcio / subcontratado precisa de uma leitura preliminar de
ocorrencias publicas em CEIS e CNEP, com cobertura e limites visiveis, antes de
diligencia humana.

## Surfaces

- Landing: `/piloto/consulta-ocorrencias-publicas/` (POST, noindex while flag off)
- Result: `/piloto/consulta-ocorrencias-publicas/r/?t={opaque}` (always noindex,nofollow,noarchive)
- Intake: `/.netlify/functions/public-integrity-consult`

CNPJ never enters path, query, fragment, title, canonical, analytics, dataLayer,
referrer, logs, HTML publico, fixtures or git.

## Tests

```bash
node tests/public_integrity_consumer/test_consumer.mjs
```
