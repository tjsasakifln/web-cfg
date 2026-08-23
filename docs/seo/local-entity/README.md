# Local entity — CONFENGE / Tiago Sasaki

Campaign: `CONFENGE-WEB-LOCAL-ENTITY-SEARCH-02`  
Decision state: **VALIDATE**  
Leverage: trust, distribution  
Refs: #74, #86, PR #159  
Affected ADR: [ADR-STRAT-002](../../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md) (consumed, not amended)

## Visitor job

A visitor or search system should recognize CONFENGE and Engº Tiago Sasaki as a national B2G engineering consultancy. That recognition must not depend on a fake street address, review markup, CREA number, city-page farm or live Search Console metrics that this repository cannot honestly produce.

## Hypothesis

An honest Organization/Person graph, a census that keeps map-pack distinct from organic, a founder-only read-only Google Business Profile checklist, and a short list of professional citation targets improve entity/local recognition without inventing NAP or opening a new public URL.

## What this campaign produces

| Artifact | Role |
|---|---|
| `data/local-entity/entity-graph.json` | Classified Organization/Person claims |
| `data/local-entity/census.json` | Map-pack / organic / local-organic rows + GSC BLOCKED envelope |
| `data/local-entity/surface-decision.json` | One enum; `new_public_landing_created: false` |
| `data/local-entity/gbp-checklist.json` | Read-only founder steps |
| `data/local-entity/citation-targets.json` | Unsent professional venues |
| `docs/seo/local-entity/*` | Human pack |

Entry: `python3 -m scripts.local_entity`  
Tests: `python3 -m pytest tests/local_entity -q`

## Claim statuses

Every identity claim is `VERIFIED` | `SELF_DECLARED` | `UNKNOWN` | `NOT_PUBLIC`.

`data/site/proof.json` `VERIFIED` + `perfil-publico-especialista` is circular self-attestation. This campaign remaps those records to `SELF_DECLARED`. Campaign `VERIFIED` is reserved for independent third-party evidence committed in-repo. None is present for street address, CREA, ratings or `sameAs` profiles.

Public phone, email and CNPJ already on `/especialista/tiago-jun-sasaki/` are existing public contact, not a new PII leak.

## Live GSC

Current overlay is `LIVE_JOB_OK` with `core_ready_for_product_decisions=false`. Absence is not zero. This campaign does not call the Search Analytics API. PR #159 historically recorded `credential_failure`.

## Surface decision

`USE_EXISTING_SERVICE`. See [SURFACE-DECISION.md](SURFACE-DECISION.md). No new public landing in this PR.

## Data owner / contract

Identity and provenance remain extra-cli contracts plus owned public copy. This package classifies what the specialist JSON-LD and `proof.json` already publish. It does not create a second identity model, a crawler or a DataLake.

The canonical home is a **read-only audited input** to this package. Publishing a new
identity fact there (including `PostalAddress`, `sameAs`, CREA/ART or a responsible-professional
claim) is deferred until `extra-cli` supplies a versioned SELECT-only identity projection with
provenance and freshness. The campaign deliberately does not hardcode an allowlist or copy those
facts into a second identity model.

## Analytics / rollback

No new public analytics events. Rollback is revert of the gate changes. The homepage is consumed
but remains outside the campaign's exclusive write paths; service pages, CSS/JS and sitemaps are
untouched.

## Quality gate

`python3 -m pytest tests/local_entity -q` audits every JSON-LD node on both the specialist page and
canonical home, and fails closed on invented NAP/review/credential, PII in committed artifacts,
collapsed map-pack/organic, live-GSC-as-zero, forbidden-tree edits and a new landing.
