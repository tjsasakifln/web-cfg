# Ações externas, recovery clean inbound

**Status:** `READY_FOR_NAMED_HUMAN_APPROVAL`

1. **Revisar pacote Wave 1 (docs/editorial/WAVE1-HUMAN-REVIEW-PACKET.json) página a página** (owner: Tiago Sasaki (ou revisor humano nomeado))
2. **Para cada página aprovável: ALLOW_HUMAN_APPROVAL=1 python3 scripts/editorial/approve_cli.py com --checklist completo, --material-hash, --confirm, --reviewer real** (owner: humano externo)
3. **Resolver canibalização BLOCKED_UNTIL_HUMAN_CHOOSES_CANONICAL antes de indexar pares sobrepostos** (owner: humano editorial)
4. **Rebuild editorial + verificar sitemaps/robots após cada aprovação; páginas não selecionadas permanecem noindex** (owner: humano + CI)
5. **Não liberar onda pSEO até proveniência/singularidade material refeitas (operacional continua 0 publish)** (owner: equipe SEO)
6. **Encerrar PRs #10 e #11 como substituídas após merge desta recovery (sem auto-merge desta PR)** (owner: Tiago)

## Proibido

- Registrar Tiago Sasaki como revisor por agente/automação
- approve-all / aprovação em lote
- Inferir aprovação de mensagens de goal done
- Declarar HUMAN_APPROVED/INDEXABLE/10/10 sem ato humano externo
