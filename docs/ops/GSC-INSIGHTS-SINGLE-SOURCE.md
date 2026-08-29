# GSC private operational state

**IDs:** DATA-06, DATA-13, #413
**Decision:** `EXECUTE_NOW` — data, automation and trust leverage
**Privacy:** ops-auth only; never public static JSON.

## Authority and data path

The production data plane is the Netcup host-owned filesystem selected by
`CONFENGE_STORAGE_BACKEND=filesystem` and rooted at
`CONFENGE_STORAGE_DIR=/var/lib/confenge-web`. The root comes from
`deploy/netcup/runtime/confenge-web-runtime.service`; it is outside immutable
release directories and survives an application rollback. Netlify Blobs is a
legacy adapter, not production storage or rollback.

The producer, handoff, storage and consumer are deliberately distinct:

1. `.github/workflows/revops-scheduled.yml` restores the authenticated durable
   history, then `search_demand_observatory.py sync` reads GSC and emits a
   `gsc-sync-state/v1` producer manifest. This observational input does not
   replace `extra-cli` as authority for canonical market facts, identity or
   provenance.
2. `publish_gsc_insights.mjs` rejects sensitive fields and sends the producer
   manifest, versioned history and optional redacted insights over the
   authenticated ops handoff.
3. `POST gsc_insights_ingest` writes an immutable
   `confenge-private-gsc-snapshot/v1` record plus a hashed
   `confenge-private-gsc-pointer/v1` in the `ops-system` namespace. The record
   carries the manifest hash, `as_of`, source freshness, producer time, ingest
   time, schema version, content hash and history hash.
4. `GET gsc_insights` reads only that durable namespace. It never promotes a
   packaged JSON copy. The producer performs an authenticated read-after-write;
   `.github/workflows/market-answer-freshness.yml` independently performs one
   authenticated, read-only GET every six hours.

The `/.netlify/functions/ops` path is a source-compatible URL handled by the
portable Node runtime behind nginx. It does not imply Netlify hosting.

## CURRENT contract

The consumer is `CURRENT` only when all of these remain true at read time:

- immutable snapshot, pointer, history and content hashes verify;
- producer and consumer manifest SHA-256 values are present and identical;
- producer, consumer and insight `as_of` values are present and identical;
- schema versions and source are recognized;
- the durable history contains at least three distinct observed `as_of` dates
  with no gap in the derived 28-day window;
- producer, GSC `as_of` and ingest timestamps are no more than 14 days old;
- `gsc-readiness/v2` is product-ready and query text is redacted;
- the value came from `delivery_source=durable_store`.

Missing storage, legacy/unversioned state, partial response, hash disagreement,
timeout or failed producer state is `UNKNOWN`; an expired valid snapshot is
`STALE`. A failed attempt is itself durable and keeps the prior known-good
snapshot available in `READ_ONLY`, but does not leave the consumer green.
Repeated snapshots do not renew freshness merely by changing ingest metadata.

`market-answer-freshness` is a consumer proof, not a sync job. It never restores,
publishes, probes storage with a write or otherwise mutates the data plane.

## Privacy and GitHub artifacts

Raw and individual GSC queries stay in the ignored ephemeral private tree. The
repository may contain aggregates and explicitly pseudonymous query hashes,
never plaintext query text. Those hashes are potentially dictionary-guessable,
so they are not anonymity proof. The public site, analytics, CI logs and
scheduled artifact exclude them; the artifact is limited to `last_sync.json`,
versioned history and the hash-only publish receipt, with `daily/` and
`private/` excluded. GitHub Actions cache/artifacts are evidence, never a
restore source or data plane.

Operational provenance stores `sha256:<digest>` in `run_id`, derived from the
CI provider, run ID and attempt. It remains correlatable by an operator who
already knows those public inputs, without storing a phone-like numeric value.
The privacy scanner therefore needs no exception: phone, email, raw-query and
sensitive-URL checks remain unchanged, including for an untyped `run_id`.

The old copies below remain compatibility inputs for parity/retirement work and
can never satisfy the consumer gate:

- `data/ops/gsc-insights.json`
- `netlify/functions/data/gsc-insights.json`
- `data/revops/gsc/insights_latest.json`

## Safe authenticated proof

The verifier performs one GET and prints only contract metadata—never the
private `insights` body or query data:

```bash
BASE_URL=https://confenge.com.br OPS_TOKEN='<secret>' \
  npm run revops:gsc:verify
```

Exit `0` means real `CURRENT`; `STALE` and `UNKNOWN` exit `1`. Deterministic
polarity can be reproduced without credentials:

```bash
node scripts/revops/verify_gsc_freshness.mjs --fixture current \
  --now 2026-08-29T12:00:00Z
node scripts/revops/verify_gsc_freshness.mjs --fixture stale \
  --now 2026-08-29T12:00:00Z
node scripts/revops/verify_gsc_freshness.mjs --fixture unknown \
  --now 2026-08-29T12:00:00Z
```

## Contemporary failure evidence

On 2026-08-29, scheduled run
[`33260693783`](https://github.com/tjsasakifln/web-cfg/actions/runs/33260693783)
reached the authenticated handoff on production SHA
`72ed3831ba28c9400627cdc9599aa54e9329e178`, then failed closed with
`422 gsc_history_sensitive_field`. The minimal reproduction showed that the
generic phone detector interpreted the numeric `GITHUB_RUN_ID` prefix as a
phone. The hashed provenance contract above fixes that false positive at the
producer while the regression suite keeps phone-like values red.

The same run proved `GSC_HISTORY_RESTORED status=EMPTY`, then produced its first
valid observation with `promote_insights=false`. Because readiness requires
three distinct daily `as_of` values, an empty production store cannot become
`CURRENT` on the deployment day or through repeated same-day dispatches. After
the protected deploy, the expected evidence window is three successful daily
producer observations (normally at 11:15 UTC), followed by the read-only
freshness probe. Each pre-threshold handoff must persist `UNKNOWN` rather than
remain ephemeral or turn green. A valid pre-threshold snapshot keeps its real
manifest hash, `as_of`, source freshness, producer time and ingest time, but has
no insights payload; the publisher writes a safe receipt only after reading
those fields back from durable storage. The manifest, `as_of` and producer time
must identify the same sealed history attempt and observation; shape-only or
idempotent mismatches are rejected before storage mutation. Attempts with no
valid source snapshot keep manifest and `as_of` null while preserving the prior
known-good consumer as `STALE`/`READ_ONLY` when one exists.

## Exact rollback

Rollback changes only the pointer to a known immutable snapshot and verifies the
consumer afterward. It never deletes later versions and never converts expired
data into `CURRENT`:

```bash
BASE_URL=https://confenge.com.br OPS_TOKEN='<secret>' \
  node scripts/revops/publish_gsc_insights.mjs \
  --rollback '<snapshot_sha256>' --reason operator_selected_known_good
```

Application release rollback remains the Netcup atomic symlink procedure in
`docs/ops/ROLLBACK.md`; private snapshots survive it.

## Legacy packaged parity and private export

These commands do not establish production freshness:

```bash
npm run test:gsc-parity
node scripts/revops/gsc_insights_sync.mjs --check
GSC_BACKUP_DIR=/secure/path node scripts/revops/gsc_insights_sync.mjs --backup
```

The backup command refuses destinations under `_site/`.
