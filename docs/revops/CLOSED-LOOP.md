# Operação do funil fechado (CFG10X-13)

**Decision state:** EXECUTE_NOW

**Executive front:** transformar “oportunidade comercial qualificada” em medição auditável.

**Leverage:** revenue + trust + automation.

**Time to evidence:** fixture report in CI, replayed twice.

**Owners:** `web-cfg` admits visitor events; `warmbly` observes qualified / proposal / won.

Contract: `data/revops/closed-loop-funnel.v1.json`

Fixture: `scripts/revops/fixtures/closed-loop-synthetic.v1.json`

Diagram: [CLOSED-LOOP-FUNNEL.md](./CLOSED-LOOP-FUNNEL.md)

Netcup portable-runtime unit: `netlify/functions/lib/closed-loop.cjs`. The path is the source-compatible handler tree packaged by `deploy/netcup/package_release.py`; it is not a Netlify production runtime or storage dependency.

A persisted lead or raw message is not a qualified opportunity. The CLI never POSTs a lead. Its default/CI mode reads only the synthetic fixture; its explicit `--snapshot` mode reads one local, operator-supplied file and performs no write or network call.

The report is a private CLI artifact only: it creates no public/indexable route. Existing private ops surfaces remain authenticated, `noindex` and `no-store`. Production commercial rates remain `UNKNOWN` until Warmbly supplies the versioned read-only, non-PII observation snapshot declared by the contract and Governance/Control Center pins its payload hash. CI fixture counts are never promoted to live evidence. Snapshot input schema is `confenge.closed-loop-snapshot/1.0`; producer contract is `warmbly.closed-loop-observations/1.0`.

Current external evidence state: `BLOCKED_EXTERNAL`. No approved Warmbly live payload hash is checked into or available to CI. The consumer is ready, but an absent, partial, unpinned, QA or synthetic snapshot fails closed instead of rendering official zero.

## Daily

1. Run the fixture report (CI already does this on `test:revops`):

   ```bash
   npm run revops:closed-loop
   ```

2. Confirm each of the seven named rates declares `numerator`, `numerator_count`, `numerator_unit`, `denominator`, `denominator_count` and `denominator_unit`:

   - `view_to_cta`
   - `cta_to_start`
   - `step1_to_step2`
   - `step2_to_persisted`
   - `persisted_to_qualified`
   - `qualified_to_proposal`
   - `proposal_to_won`

   Visitor stages use unique sessions. `step2_to_persisted` counts sessions that both reached step 2 and persisted. Commercial stages use leads. This prevents repeat submissions in one session from making the rate exceed 1.
3. Confirm `response_time` joins persisted → qualified by `lead_id` and exposes `observed_count`, `missing_count`, mean, median and p95 in seconds. `tempo_de_resposta_seconds` is the median compatibility field.
4. Confirm synthetic `revenue` matches the fixture `won.revenue`. Replay must be byte-identical.
5. Scan ops summaries for PII. The fixture report must not carry name, email, phone, CNPJ or free text.
6. Do not define or judge commercial SLA, reason taxonomy or next action here. Those policies and values are Warmbly-owned; this report only measures producer observations.

## Weekly

1. Validate and render a Warmbly-owned read-only snapshot against `warmbly_observation_contract` before comparing production counts. Missing Warmbly evidence stays `UNKNOWN`; never write zero from collect.

   ```bash
   WARMBLY_SNAPSHOT_APPROVED_SHA256=<governance-approved-sha256> \
     npm run revops:closed-loop -- --snapshot /private/path/warmbly-snapshot.json
   ```

   An official snapshot must declare `kind=warmbly_aggregate_snapshot`, `completeness=complete`, coverage window/watermark, producer contract, artifact id and a byte-stable canonical payload hash matching the separately approved pin. Every lead must be `record_kind=real`. The command rejects undeclared fields, PII/free text, malformed join IDs, unsafe attribution, orphan chains and non-monotonic timestamps. It prints only the non-PII report to stdout.
2. Review commercial SLA, qualification/loss reasons and next actions in Warmbly, not in this repository.
3. DSAR / retention for the host-owned receipt store: dry-run first.

   ```bash
   CONFENGE_STORAGE_DIR=/var/lib/confenge-web npm run revops:dsar -- purge --dry-run
   ```

   Default retention follows `LEAD_RETAIN_DAYS` (730 when unset) in the lead-store/DSAR policy. Apply delete only after human confirmation.
4. Promote or hold pages/offers with the criteria below. Do not treat page count or raw message count as success.

## Promotion criteria (page / offer)

Promote a public page or offer only when the fixture-compatible measurement for that route/offer/origem shows:

| Gate | Rule |
| --- | --- |
| View → CTA | `view_to_cta` is observed and not collapsing view into lead |
| CTA → start | `cta_to_start` uses form start, not a decorative click |
| Step1 → step2 | Multi-step form actually advances |
| Step2 → persisted | Persist returns a `lead_id` (raw lead) |
| Persisted → qualified | Warmbly observation exists; raw lead is not enough |
| Qualified → proposal | Observed proposal id + amount |
| Proposal → won | Observed sale id + revenue |
| Tempo | Per-lead persisted → qualified samples are complete; target/SLA evaluation remains in Warmbly |
| Privacy | Admitted analytics and the report still carry zero email / phone / free text |
| Attribution | landing, route family, asset, CTA, journey and offer survive through the sale |

Hold or sunset the page/offer when qualified stays `UNKNOWN`, when raw leads inflate “opportunity”, or when PII appears on an analytics event. Missing or incomplete Warmbly coverage is `UNKNOWN`, never zero.

Rollback: revert this contract/module/fixture and the browser ID propagation. The immutable Netcup release can be rolled back by full SHA; host-owned lead storage survives release rollback. Legacy 24-hex lead IDs remain readable through `legacy_pattern`, while new receipts use `lead-*`.
