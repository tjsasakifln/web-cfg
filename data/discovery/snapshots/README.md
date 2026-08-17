# Discovery observation snapshots

Append-only NDJSON at `observations.ndjson`. Each line is one hashed
observation (`schema_version=1`). Replay of the same `record_hash` does
not write a second line.

Do not commit raw GSC/analytics exports if they contain PII. Store only
minimized observations produced by `python3 -m scripts.discovery`.
