# Campaign 05 integration pack — multivertical conflict gate

CAMPAIGN_ID=05. Owner of `/conflitos/` and `CONFENGE_PUBLIC_CONFLICT_GATE/1.0.0`.
Does not implement protected store, CRM, queue, shared form, party analytics,
email or follow-up.

| Fragment | Consumer campaign | Target |
| --- | --- | --- |
| `06-protected-decision-interface.md` | 06 / Governance #65 / Warmbly | protected decision payload |
| `07-professional-authority-boundary.md` | 07 / #581 | no public case identities |
| `08-form-first-step-fragment.md` | 08 | shared lead form |
| `14-warmbly-analytics-no-parties.md` | 14 | analytics / inbound |

Draft pins (test/fragment only, never runtime fallback):

- `CONFENGE_CORPORATE_TAXONOMY/1.0.0-draft.20260904`
- `CONFENGE_OFFER_CATALOG/2.0.0-draft.20260904`
- `CONFENGE_WEB_INTAKE/2.0.0-draft.20260904`
- `NET_NEW_INBOUND_HANDRAISER/1.0.0-draft.20260904`
- `CONFENGE_HANDRAISER_STATE/1.0.0-draft.20260904`
- `MEETCFG_HANDRAISER_CONTEXT/1.0.0-draft.20260904`

Invariants: `source=CONFENGE_WEB`, `outbound_eligible=false`, `auto_send=false`.
