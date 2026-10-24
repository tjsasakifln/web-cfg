# HOLD technical reassessment — 2026-10-24

Decision state: `EXECUTE_NOW` for the in-repository fail-closed correction.
This is a technical reassessment of URL decisions, not human acceptance of the
11 ready redirects, a DNS/TLS change, a bridge cutover, or a production
observation.

Reviewer: Codex agent, under the authorized 2026-10-24 gate correction. No
human approval is claimed.

## Result

- All 54 of 54 `HOLD_TARGET_NOT_READY` entries still have `target` and
  `target_url` null, `expected_http` 410, a nonempty `skip_reason`, and a named
  non-live `intended_future_surface`.
- The 11 `REDIRECT_301` mappings are unchanged. No HOLD was promoted to a 301
  and no redirect was changed.
- A focused review of the nearest local CONFENGE candidates found noindex
  pages or pages without equivalent intent. The two indexable routes,
  `/conteudos/bdi-diferenciado-obra-publica/` and
  `/conteudos/fiscal-nao-assina-medicao-obra-publica/`, address narrower jobs
  than the generic BDI and inspection entries. Neither is a ready 1:1
  destination for those HOLD rows.

Keeping the rows at 410 with no Location is therefore safer than directing a
visitor to a weak substitute, a parent hub, or the home page. Reassess before
any promotion or cutover and no later than 2026-11-21.

## Evidence and limits

The canonical builder projects this decision into the inventory, its
byte-identical manifesto, the execute set, and both SHA pins. The validators
continue to fail after the deadline and preserve the existing 410/no-target and
no-weak-substitute checks.

Human acceptance, bridge/DNS/TLS work, SmartLic#2115 execution, and the
28-day observation remain `NOT_PERFORMED`.
