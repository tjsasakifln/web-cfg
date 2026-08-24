# Frozen BOFU pillar unlock plan — issue #291

Decision: **DEFER until 2026-09-16, then EXECUTE_NOW only if every precondition is green.**

Front: **INBOUND ENGINE**. Leverage: **revenue + distribution**. Time to
evidence after execution: one complete GSC window.

## Outcome of this preparation

The date now has a versioned owner and an executable, fail-closed plan. This
commit changes no public HTML, no hash baseline, no robots/canonical directive
and no `earliest_safe_action_at` value.

The machine record is
`data/bofu-dominance/frozen-specs/unlock-plan.v1.json`. It derives the split that
must be honored by the future execution PR:

- real replacements: the `h1` of aditivos, the title/OG block of reequilibrio
  and the OG title of diagnostico-b2g-360;
- remove as no-op: medicoes, auditoria-orcamento and diagnostico-pre-licitacao
  entries whose `before` and `after` values are identical;
- persisted `CONFENGE_WEB` capture on all six pillars;
- visible `FAQPage` and `Person` parity on diagnostico-b2g-360.

## Preconditions

The execution PR is refused unless the calendar gate, the comparable evidence
owned by #292, the merged capture profile owned by #289 and the frozen hash gate
are all green. Reaching 2026-09-16 by itself does not authorize mutation.

The execution sequence requires rebase, preflight, application through the
frozen patch mechanism, full acceptance gates and only then a hash/snapshot
recapture without `--force`.

## Visitor job and hypothesis

The visitor job is to reach a BOFU pillar whose promise, authorship and next
action agree. The hypothesis remains that the prepared copy and persisted
capture improve qualified hand-raises after the freeze. This prepare-only PR
does not claim that effect.

## Data, analytics, rollback and architecture

No new data owner, event or PII field is introduced. Future capture must retain
source `CONFENGE_WEB`; Warmbly remains the action authority. Rollback of the
future execution is one PR revert including its hash/snapshot baseline. This
plan implements ADR-STRAT-002 without changing its public-surface boundary.
