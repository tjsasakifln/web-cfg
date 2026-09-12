# Fragmentos de integração da MV-06

Owner de aplicação: **MV-09**. Estes arquivos são propostas de integração e não alteram producers pertencentes a outras campanhas.

| Fragmento | Target owner | Uso |
| --- | --- | --- |
| `public-family-registry.fragment.json` | MV-09 / `data/organic/public-family-registry.json` | declarar três famílias exatas, seus visitor jobs e ação terminal |
| `intake-attribution.fragment.json` | MV-03 + MV-09 | configurar captura protegida, atribuição `CONFENGE_WEB`, próximo estado e proibição de PII em analytics |
| `authority-proof.fragment.md` | MV-02 + MV-09 | substituir blocos de prova condicionais por projeção canônica verificável |
| `route-promotion.fragment.md` | MV-09 | promover candidatos, resolver assets/canonical/schema/sitemap e executar gates sem publicação parcial |

Ordem segura: taxonomia/oferta → prova e conflitos → captura → promoção de rota/registry → build/gates → revisão visual → merge/publicação pela MV-09. `noindex` não é removido antecipadamente.
