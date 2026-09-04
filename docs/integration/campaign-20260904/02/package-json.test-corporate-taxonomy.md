# Fragment — package.json test script

- **campaign_id:** 02
- **target_path:** `package.json`
- **operation:** add npm script invoking the shipped taxonomy tests
- **stable_key:** `scripts["test:corporate-taxonomy"]`
- **owner_after:** campaign 01 / goal 97
- **depends_on:** `tests/corporate_taxonomy/` and `python3 -m scripts.corporate_taxonomy check`
- **test:** `python3 -m pytest tests/corporate_taxonomy -q` already passes locally in this worktree
- **rollback:** remove the script key; tests remain callable via pytest

Suggested script:

```json
{
  "test:corporate-taxonomy": "python3 -m pytest tests/corporate_taxonomy -q && python3 -m scripts.corporate_taxonomy check"
}
```

Campaign 02 must not edit `package.json` or lockfiles. Local pytest is the
behavior gate; missing CI wiring alone is `PASS_WITH_FRAGMENTS`.
