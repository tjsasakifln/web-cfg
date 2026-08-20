# ROLLBACK — CONFENGE-WEB217-G04

## Captured before merge
- previous_main: `8ced783468a70ea8208398ec4202dc4b89b4d4fe`
- previous production deploy: `6a86f72ad7e3c60008095566` (`commit` 8ced7834, `environment` production)

## After publish
- MERGE_SHA: `85c7193ad9a9df8fc22840d6dbdd0b30e91486f8`
- production deploy: `6a8786281956a400087ec6f8`

## Procedure
1. Do not hot-fix production.
2. `git revert` of merge commit `85c7193a` on `main`, or republish deploy `6a86f72ad7e3c60008095566`.
3. Re-smoke `/`, `/conteudos/`, `/ferramentas/`, BOFU pillars, assets, robots/sitemap, checkout fail-closed.
4. Keep this file’s before/after SHAs.
