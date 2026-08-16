# Knowledge funnel integration (WEB-002)

Fixture-safe walk of Answer → Evidence → Analysis/X-Ray → persist-first lead → Warmbly handoff.

```bash
python3 -m scripts.knowledge_funnel walk --case happy --out /tmp/funnel-trace.json
python3 -m scripts.knowledge_funnel walk --case happy --twice
python3 -m scripts.knowledge_funnel validate
python3 -m pytest tests/knowledge_funnel -q
```

- Corpus: `data/knowledge_funnel/corpus.v1.json` (references shipped fixtures; `claimed_live=false`)
- Orchestrator: `walk.py` calls `scripts.market_answers`, `scripts.contract_analysis`, and `intake_bridge.cjs`
- Intake bridge drives `scripts/conversion/intake-core.cjs` and `xray.cjs`
- Does not flip `conversion_market_answer_xray`, INDEX, or send a live Warmbly payload
