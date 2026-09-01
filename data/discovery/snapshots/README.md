# Discovery observation snapshots

Append-only NDJSON at `observations.ndjson`. Each line is one hashed
observation (`schema_version=1`). Replay of the same `record_hash` does
not write a second line.

Committed `technical_probe` rows may cover any current cohort asset that
is non-fixture, `INDEX`, `publicable=true` and `noindex=false`. Historical
canary rows remain immutable evidence even if their current publication
intent later changes; do not replace or rewrite them when adding another
eligible asset.

Do not commit raw GSC/analytics exports if they contain PII. Store only
minimized observations produced by `python3 -m scripts.discovery`.
