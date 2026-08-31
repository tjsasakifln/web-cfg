# Manual GSC snapshot — founder export 2026-08-31

This directory records the page-level measurements supplied by the founder for
the Search Console UI filter **Web · last 28 days**, whose exported daily range
is `2026-08-02` through `2026-08-29`.

`manual-page-snapshot.v1.json` is a normalized `MANUAL_GSC_SNAPSHOT`. It is not
the durable/current GSC authority from issue #413. The manual export has no
versioned producer snapshot/pointer, durable host read-back or producer-consumer
manifest parity, so it does not count as #413's third observation.

The campaign goal referenced raw files under
`evidence/search-console-2026-08-31/`, but that package was not present in the
shared workspace, attachment cache or campaign worktrees at execution time.
Consequently no raw-file checksum is claimed or invented. The normalized
artifact preserves only founder-reported aggregates and page rows.

The visible query table exposed 52 of 1,201 site impressions (about 4.3%). Raw
query text is not committed here. Visible queries may corroborate an existing
owner qualitatively, but they cannot define the query universe, create an owner
or prove absence of demand.

The page observations can re-score controlled measurement work as actual search
exposure. Zero clicks and CTR on the four controllable owners are tiny samples,
not evidence of conversion failure. No public HTML, CTA, route, canonical,
indexing or protected measurement window is changed by this snapshot.
