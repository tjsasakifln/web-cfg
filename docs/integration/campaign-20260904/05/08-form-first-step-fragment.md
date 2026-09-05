# Fragment 08 — shared form first-step

- **target_path:** `js/modules/form.js` (shared lead form, owned by campaign 08). Campaign 05 does not edit this file.
- **operation:** consume
- **stable_key:** public first-step on `/conflitos/` (`#conflict-gate-form`) + `CONFENGE_WEB_INTAKE/2.0.0-draft.20260904` pin
- **dependency:** campaign 05 statuses; `CONFENGE_WEB` source; no file upload; no party fields on the public first step
- **test:** campaign 08 must not add `type=file`, party/process/órgão/employee/medical free text, or query-string PII. Conflict status `UNKNOWN` / `REVIEW_REQUIRED` / `DECLINE` blocks corpus. `scripts/site/test_conflict_gate.py` plus document-intake honesty (`type=file` absent on `/conflitos/`)
- **rollback:** if campaign 08 cannot read the pin, keep the current B2G form and treat conflict state as `REVIEW_REQUIRED`. Do not skip screening.

## What the shared form may collect first

Contact channel, person/company role, nucleus, city, deadline, desired deliverable, document *availability* (not the documents), consent.

## What it must not collect on the public first step

Party names, lawsuit corpus, medical records, employee lists, plans, expert reports, CPF, detailed conflict motive. Those belong on the protected path after a cabível status.

## Status → form next step

| Conflict status | Form next step |
| --- | --- |
| `CLEAR` | only if protected path is available; else treat as `REVIEW_REQUIRED` |
| `CLEAR_WITH_DISCLOSURE` | protected disclosure first; no public corpus |
| `REVIEW_REQUIRED` | pause corpus; human review |
| `DECLINE` | neutral refusal; no extra detail |
| `UNKNOWN` | pause; never CLEAR |

Qualification state `CONFLICT_CHECK_REQUIRED` (issue #580) maps to this gate. Missing data stays unknown.
