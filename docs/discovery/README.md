# Search / AI Discovery Observatory

Prepare-only path for issues #86 and #89. Measures whether a CONFENGE asset
is technically eligible to be found, cited and reused. It does not publish,
does not send IndexNow, and does not invent appearance or citation numbers.

## Visitor job

An editor or operator needs a reproducible answer to: *can this approved
URL be crawled, indexed and cited — and what is still UNKNOWN?*

## Decision state

VALIDATE. Time to evidence: one observatory run + one IndexNow dry-run on
an approved canonical. Leverage: distribution, trust, data.

## What it does

- Reads `data/discovery/cohort.v1.json` (8 members: utility #60, contract
  analysis #83, Market Answer #84, methodology, author/entity, offer,
  flagship #65, labeled fixture).
- Inspects local HTML, `robots.txt` and sitemaps. Live HTTP, GSC, Bing and
  Generative AI reports stay `UNKNOWN` until an observed overlay exists.
- Separates six metric stages: ELIGIBILITY, INDEX/APPEARANCE, CITATION,
  REFERRAL, ENGAGEMENT, LEAD/PIPELINE.
- Refuses collapsed counts: bot hit ≠ citation, impression ≠ session,
  referral ≠ lead, IndexNow receipt ≠ indexation.
- Emits a deterministic per-asset report and a prepare-only IndexNow
  receipt for allowlisted approved canonicals.

## Commands

```bash
python3 -m scripts.discovery report
python3 -m scripts.discovery report --json --as-of 2026-08-16T00:00:00Z
python3 -m scripts.discovery indexnow \
  --url https://confenge.com.br/radar/nacional-obras-publicas/ \
  --url https://confenge.com.br/internal/data-desk/fixture-only/ \
  --state changed
```

IndexNow is dry-run by default. `--send` is refused. A stored receipt means
*notification prepared* (and, after a future human-gated send, *accepted*),
never *indexed*.

## Swap an approved asset

Change the registry and the IndexNow allowlist. Do not redesign the
inspector. The fixture stays labeled `FIXTURE_ONLY` and never enters the
publicable or IndexNow sets.

## What this is not

- Not an `llms.txt` strategy.
- Not cloaking, bot-specific copy, or fake citations.
- Not a generic discovery API.
- Not a reason to close #86. Closing needs an approved URL plus observed
  reuse, not a prepare-only report.
