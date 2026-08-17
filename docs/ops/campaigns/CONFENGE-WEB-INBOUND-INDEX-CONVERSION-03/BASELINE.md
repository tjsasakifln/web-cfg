# CONFENGE-WEB-INBOUND-INDEX-CONVERSION-03 — baseline

Campaign: `CONFENGE-WEB-INBOUND-INDEX-CONVERSION-03`  
Repo: `tjsasakifln/web-cfg`  
Worktree/branch: `campaign/CONFENGE-WEB-INBOUND-INDEX-CONVERSION-03`  
Decision state: EXECUTE_NOW (P0 indexable SC asset) + VALIDATE (P1 catalog, default-off)

## Git

| Field | Value |
|---|---|
| origin/main observed | `265b40ea016506c6004c81c1b0aaab6e531b6627` |
| Worktree start | same SHA |
| Parallelism | Independent of Governance / extra-cli / Warmbly goals |
| Lockfiles / #92 #93 | not touched |

## Market Answer consume (SELECT-only)

| Field | Value |
|---|---|
| Payload | `data/extra-cli/public-read-market-answer-pavimentacao/1.0/export.json` |
| official_live | true |
| producer_status | OFFICIAL_LIVE |
| geography | kind=uf code=SC |
| n / usable | 5038 |
| coverage.status | COMPLETE |
| missingness | 25 / 5063 |
| folded_hash | `9b69e30cb9e696a6c268526b3646f2d1588519849c5024aa46e6ba89ec06c0b6` |
| producer content_hash | `dbb6254950f8e25f12676636c7dd39a339b300a48c2544c68a4a750813c41e18` |
| Quartiles rewritten? | no |

## Issues

| Issue | Role | Close? |
|---|---|---|
| #84 | acquisition / Market Answer | keep open until live index proof + discovery/outcome residual |
| #88 | catalog / contracting | keep open; P1 is default-off scaffolding |
| #60 #64 | real lead / QCO learning | record only what changed; lead/outcome UNKNOWN |

## Credentials

| Item | State |
|---|---|
| Netlify token | not used in this session |
| Asaas production | not authorized |
| HMAC sender | not proven; does not block code/merge |
