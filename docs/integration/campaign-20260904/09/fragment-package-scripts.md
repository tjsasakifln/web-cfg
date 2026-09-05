# Fragment: package scripts

CAMPAIGN_ID=09
ISSUE_OWNER=589

- target_path: `package.json`
- operation: `insert_script`
- stable_key: `test:private-project-technical-readiness`
- dependency: campaign 01 / goal 97 (this campaign must not edit package.json)
- test: `node scripts/site/test_private_project_technical_readiness.mjs` (already the real entry; the npm alias is wiring only)
- rollback: delete the script key

```json
{
  "test:private-project-technical-readiness": "node scripts/site/test_private_project_technical_readiness.mjs"
}
```

Do not add dependencies. The test uses Node stdlib plus the shipped `.cjs`.
