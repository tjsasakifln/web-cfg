# Fragment: public artifact allowlist

- `target_path`: `scripts/pseo/public_artifact.py`
- `operation`: `add_PUBLIC_TOP_DIRS_member`
- `stable_key`: `grande-florianopolis`
- `depends_on`: move HTML from `docs/campaigns/campaign-20260904/11/hub/grande-florianopolis/` to top-level `grande-florianopolis/index.html` in the same change, still with meta robots noindex
- `teste`: `python3 scripts/pseo/public_artifact.py audit` after assemble; `_site/grande-florianopolis/index.html` exists; sitemaps still omit the URL until goal 99
- `rollback`: remove the dir name from `PUBLIC_TOP_DIRS` and stop shipping the top-level folder. Restore the docs prototype if needed.

Do **not** add this member in campaign 11. Isolation is the publication contract.
