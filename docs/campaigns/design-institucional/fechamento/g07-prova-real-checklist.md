# G07 — Prova real de cliente: estado e material faltante

Estado: **DEPENDENCIA_EXTERNA** (`BLOCKED_EXTERNAL:FIRST_PERMISSIONED_CUSTOMER_PROOF`).

Fonte canônica: `data/site/permissioned-proof-registry.json` (`state: NO_APPROVED_CLIENT_PROOF`, `records: []`, `updated_at 2026-08-24`), política `docs/contracts/permissioned-proof/permissioned-proof-v1.json`, validador `scripts/site/permissioned_proof.py`, auditoria `data/commercial/real-proof-registry.v1.json`. Nada nesta sessão (repositório, host, conversa) contém caso de cliente com autorização de publicação. Acesso a informação não é autorização: contratos públicos, nomes de órgãos e e-mails de clientes não viram caso comercial.

Os demonstrativos publicados continuam rotulados como método (`sint[eé]tic|demonstrativ`), não como resultado de cliente. Nenhum placeholder, depoimento, resultado projetado ou nome de cliente foi publicado.

## Material mínimo para o primeiro registro (checklist privado)

1. Uma entrega real concluída da CONFENGE com documento emitido (ART/nota) e evidência documental do efeito (ex.: medição atestada, glosa revertida em parte, laudo aceito), sem depender de ato futuro de terceiros.
2. Consentimento ativo e escopado do cliente para publicação (não reutilizar consentimento de contato comercial), guardado como recibo privado fora do repositório público.
3. Peça enxuta no componente existente: problema → intervenção → documento entregue → efeito verificável, sem atribuir à CONFENGE o que depende do órgão/cliente.
4. Aprovação humana vinculada ao hash do material (`material-hash-bound human approval`), registro único em `records` e estado `PUBLISHED`; caso contrário `REJECTED`/`REVOKED`.
5. Atalhos proibidos pela política: entrega ou cliente fabricados, aprovação por agente/CI, PII ou consentimento bruto versionados, aprovação em lote, publicação sem hash.

Dono: Engº Tiago Sasaki. Gatilho: primeira entrega real com evidência e cliente disposto a considerar prova pública.
