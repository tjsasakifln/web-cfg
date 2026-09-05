# Fragment: hub listing / home / nav

CAMPAIGN_ID=09
ISSUE_OWNER=589

- target_path: `ferramentas/index.html` (and, later, home/nav owned by #582)
- operation: `insert_tool_card`
- stable_key: `private_project_technical_readiness_v1`
- dependency: public family declared; route promoted to `/ferramentas/prontidao-tecnica-obra-privada/`
- test: indexable hubs must not featured-link a noindex canary (`featured_link_to_noindex`); after promotion, the card points to the indexable slug
- rollback: remove the card by asset id; do not redirect the hub to home

Card copy (no price):

- title: Diagnóstico de prontidão técnica de obra privada
- job: Identificar evidências técnicas presentes, ausentes ou desconhecidas antes de contratar, executar ou retomar a obra.
- CTA: Ver o diagnóstico (não “fale com especialista”)

Não ligar o canário isolado a partir de home, nav ou `/ferramentas/` enquanto `noindex`.
