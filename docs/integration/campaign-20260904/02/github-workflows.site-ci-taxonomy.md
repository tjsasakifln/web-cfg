# Fragment — site-ci invokes taxonomy tests

- **campaign_id:** 02
- **target_path:** `.github/workflows/site-ci.yml`
- **operation:** add `npm run test:corporate-taxonomy` (or the pytest equivalent) to the unit/brand/copy job after `npm run test:demand-radar`
- **stable_key:** workflow step "Unit and brand/copy/design gates"
- **owner_after:** campaign 01 / goal 97
- **depends_on:** package.json fragment `test:corporate-taxonomy`
- **test:** site-ci green includes taxonomy validator
- **rollback:** drop the line; local pytest remains

Campaign 02 must not edit `.github/**`. Until this fragment is applied, GitHub
`site-ci` will not invoke the new tests.
