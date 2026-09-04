# Fragment: public-family-registry

CAMPAIGN_ID=09
ISSUE_OWNER=589

- target_path: `data/organic/public-family-registry.json`
- operation: `insert_family`
- stable_key: `private-project-technical-readiness`
- dependency: goal 97; captura 08; conteúdo e método já no canário desta campanha
- test: `npm run test:inbound-gates` after the family is declared; route must match `/ferramentas/prontidao-tecnica-obra-privada/` exactly
- rollback: remove the family object by `id=private-project-technical-readiness`; do not blanket-redirect

```json
{
  "id": "private-project-technical-readiness",
  "visitor_job": "Identificar evidências técnicas presentes, ausentes ou desconhecidas antes de contratar, executar ou retomar uma obra privada.",
  "profile": "commercial_content",
  "terminal_action": "capture_form",
  "classification": "PUBLIC_FAMILY",
  "match": {
    "routes": ["/ferramentas/prontidao-tecnica-obra-privada/"]
  },
  "gate_coverage": {
    "conversion": "full",
    "copy": "full",
    "accessibility": "full"
  },
  "declared_at": "2026-09-04",
  "owner_issue": 589,
  "debt": [],
  "index_evidence": {
    "substrate": "first_party_publication",
    "not_applicable": ["citable_source", "official_live"],
    "reason": "Ferramenta de autoavaliação de primeira parte: o valor é o cálculo no navegador, não um registro externo.",
    "authority": [
      "data/organic/public-family-registry.json (profile_rules.commercial_content)",
      "scripts/site/inbound_gates.py::gate_conversion"
    ],
    "declared_at": "2026-09-04",
    "owner_issue": 589
  }
}
```

Não declarar esta família nesta branch. Prefixo `/piloto/` absorveria a rota no `piloto-preview` e misturaria visitor job B2G.
