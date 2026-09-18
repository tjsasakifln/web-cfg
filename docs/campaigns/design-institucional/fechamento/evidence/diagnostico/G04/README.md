# G04 — semântica de mensuração (evidência bruta, diagnóstico 2026-09-18)

Checkout: campaign/pos-redesign-fechamento-20260918 em 252fc98d1 (fonte HTML + script.js rastreado, servidos
estaticamente em 127.0.0.1:8797; sem _site, sem produção, requisições externas abortadas, nenhum formulário enviado).

- `probe_events.mjs` + `dataLayer-probe-252fc98d1.json`: clique com preventDefault em 27 controles das sete rotas
  prioritárias e diff de `window.dataLayer` (nome, cta_position, cta_id, cta_kind, destination_type, alias_from, consent).
- `visitor_effort.proposed.mjs` + `visitor-effort-proposta-252fc98d1.json`: cópia proposta da ferramenta
  `expansao/tools/visitor_effort.mjs` com `first_nav` separado de `first_contact`, `actions_count` (= população do
  `contacts_count` antigo, comparável às capturas anteriores), `plate_chars` lido do SVG fonte referenciado por
  `<img src=/assets/pranchas/*.svg>`, `plates_visible` sem `picture img` (foto do responsável não é prancha) e
  float excluído do primeiro contato. Não substitui a ferramenta: é evidência da correção.
