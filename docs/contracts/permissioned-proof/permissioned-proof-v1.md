# CONFENGE permissioned-proof contract v1

- **Schema:** `confenge.permissioned-proof-policy/1.0`
- **Version:** `1.0.0`
- **Effective at:** 2026-08-24
- **Owner:** `web-cfg`, issue #249
- **Decision state:** P2 / DEFER until the first real delivery
- **Executive front:** COMPOUNDING SYSTEM / Proof Engine
- **Leverage:** trust
- **Machine contract:** [`permissioned-proof-v1.json`](permissioned-proof-v1.json)
- **Registry:** [`data/site/permissioned-proof-registry.json`](../../../data/site/permissioned-proof-registry.json)

This contract controls whether documentary evidence from a real CONFENGE
delivery may become public proof. It does not assert that a delivery, client,
outcome or permission exists. The registry starts with zero records and
`NO_APPROVED_CLIENT_PROOF`.

## Visitor job and hypothesis

A visitor evaluating CONFENGE needs to distinguish demonstrative material from
a real, authorized result. The hypothesis is deliberately narrow: proof that is
traceable to scoped consent and a named human decision can increase
institutional trust without converting a private delivery into an unbounded
marketing claim.

Repeating this gate 100 times improves the system: each proposed proof is bound
to its own consent scope and material hash. Repeating an improvised consent
conversation 100 times would only create 100 unreviewable units of risk.

## Authority boundary

- `web-cfg` owns the public-proof contract, registry and publication gate.
- Warmbly remains the owner of commercial action and observed outcomes. An
  observed outcome is input evidence, not publication permission.
- Consent receipts and delivery material stay in owner-controlled private
  storage. The committed registry accepts only opaque `private://` references
  and hashes; client PII and raw consent are forbidden.
- Public analytics may receive `source=CONFENGE_WEB`, `proof_id`, state and
  permission class. It must not receive the consent receipt reference or PII.
- No crawler, canonical-fact store or parallel identity model is introduced.

## States

| State | Meaning | Public proof allowed |
|---|---|---:|
| `DRAFT` | Candidate exists only as a private proposal. | No |
| `CONSENT_CAPTURED` | A dedicated publication-consent receipt exists. | No |
| `HUMAN_REVIEW_REQUIRED` | Scope and proposed material await named review. | No |
| `APPROVED` | The named human approved the exact scope and material hash. | No |
| `PUBLISHED` | Approved material was published on `confenge.com.br`. | Yes |
| `REJECTED` | Candidate will not be published. | No |
| `REVOKED` | Consent was withdrawn; public material must be removed. | No |
| `RETENTION_EXPIRED` | Private material reached its deletion boundary. | No |

Only `PUBLISHED` is public. `APPROVED` is intentionally separate so a build,
agent or CI run cannot turn a review decision into a publication claim.

## Permission classes

| Class | Rule |
|---|---|
| `demonstrativo` | Not client proof. It remains visibly labeled and needs no publication consent. |
| `consented` | Real proof limited to the fields and channels named by active consent. |
| `redacted` | Real proof whose allowed fields and required redactions are both named by active consent. |
| `confidential` | Private delivery evidence only; it cannot enter a public URL. |

Commercial-contact consent, payment, delivery acceptance, a public contract or
silence never counts as consent to publish proof.

## Consent record

A record may move beyond `DRAFT` only with:

- `status=ACTIVE` and a valid `captured_at`;
- `scope.public_fields`, `scope.public_channels` and
  `scope.withdrawal_channel`;
- SHA-256 `scope_hash` over the canonical scope;
- an opaque `receipt_ref` beginning with
  `private://permissioned-proof/`;
- `retention.delete_after` and a private material location;
- an available revocation channel.

The receipt reference must be bound to the exact `proof_id`; it cannot be
copied from another record. The scope is schema-closed: the only public channel
is `confenge.com.br`, public fields come from the policy allowlist, and a
`redacted` proof must name its redactions explicitly. Lifecycle events start at
`DRAFT`, follow a legal transition, use strict UTC timestamps and end at the
record's current state.

The actual receipt, client identity, contact data and delivery files never go
into this repository.

## Human approval and publication

The publication approver is **Engº Tiago Sasaki**
(`tiago-jun-sasaki`), already named by the repository's authority governance.
Approval is individual, never bulk, and binds:

1. `proof_id`;
2. `consent_scope_hash`;
3. SHA-256 `material_hash` of the proposed HTML.

An agent, CI job or bot may validate the record but may not fill or infer the
approval. The transition to `PUBLISHED` also requires the same material hash, a
proof-bound private approval reference, a canonical
`https://confenge.com.br/casos/<proof_id>/` URL and a publication timestamp
after approval. The page must declare that exact canonical and mark exactly the
fields allowed by the consent scope.
The registry resolves that URL to the committed HTML and refuses a missing or
hash-drifted file. An approved row in the existing `data/site/cases.json` must
have the same `proof_id`, permission class and public path; neither registry can
bypass the other.

This is an explicit solo-operator trust boundary, not a cryptographic claim:
CI validates chronology, state, exact bindings, duplicate-reference reuse and
the committed material, but it cannot authenticate the contents of the private
receipt store or prove who created a receipt. The named owner must create the
private approval receipt and review the code change. The machine contract calls
this `OWNER_ATTESTED_PRIVATE_RECEIPT_PLUS_CODE_REVIEW` rather than pretending
that a self-declared JSON `human=true` is independently verified.

This slice does not authorize review/rating structured data. Those schema types
remain forbidden until a separate decision and evidence gate explicitly allow
them.

## Retention and revocation

Private subject material inherits the existing 730-day default from
[`DSAR-RETENTION-RUNBOOK.md`](../../ops/DSAR-RETENTION-RUNBOOK.md). Every record
requires `delete_after`; private purge remains human-confirmed through the DSAR
runbook.

Revocation is allowed at any time after consent and has immediate public effect:

1. set consent to `REVOKED` and record `requested_at`, `effective_at` and a
   non-PII reason code;
2. void the publication approval;
3. unpublish the proof and its structured claims;
4. apply private deletion according to the DSAR/retention boundary;
5. make an explicit URL-level decision. Never blanket-redirect a retired proof
   URL to the home page.

## Fail-closed gates

`scripts/site/permissioned_proof.py` validates the pinned policy, schema-closed
registry, individual records and material binding. `npm run test:authority`
covers:

- the empty real-proof registry and named `next_test`;
- a satisfiable synthetic positive contract, without a public file;
- scope and material hash drift;
- direct-publication and skipped-review lifecycle attacks;
- copied consent/approval references and duplicate public identities;
- strict timestamp order, exact retention and canonical URL attacks;
- consent-field/channel/redaction scope closure and visible canonical/field parity;
- immediate revocation/unpublish semantics;
- refusal of normalized PII keys, email, phone and tax IDs in committed records;
- the existing false-case-study fixture;
- a second fixture that claims consent but has no named human approver.

The new negative fixture is fixture-only, `noindex,nofollow`, outside `_site`
and cannot enter the real registry.

## Next test

`first-real-delivery-permissioned-proof` remains
`WAIT_FIRST_REAL_DELIVERY`, owned by Engº Tiago Sasaki. When documentary outcome
evidence from the first real delivery exists, the owner may create one private
receipt and one registry record. The result is either:

- `PUBLISHED`, after active scoped consent and hash-bound human approval; or
- `REJECTED` / `REVOKED`, without inventing or weakening evidence.

Until then, zero approved public proof is the correct state.

## Analytics, rollback and ADR

No public event, page, URL, canonical, robots rule or conversion flow changes in
this slice. Rollback is a revert of the contract, registry and gate files; it
does not delete client data because none is stored here.

ADR-STRAT-002 and RUNTIME-AUTHORITY are preserved: CONFENGE remains the only
public surface, web-cfg governs publication, and Warmbly governs commercial
action/outcomes. No ADR update is required.
