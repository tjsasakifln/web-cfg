# Fragment — headers / robots (goal 97)

- target_path: `_headers` (optional `robots.txt`)
- operation: if sandbox is published at `/sandbox/adaptive-intake/`, add `X-Robots-Tag: noindex, nofollow, noarchive`
- stable_key: `/sandbox/adaptive-intake/*`
- dependency: campaign 08 does not edit `_headers` or `robots.txt`
- test: response headers on that path include noindex
- rollback: delete the header block; fixture stays in `tests/`
