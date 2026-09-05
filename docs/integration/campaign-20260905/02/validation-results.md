# Validação local — MV-02

Data: 2026-09-05. Base final após rebase: `470a5ffafeaf45a59649109742ce5885f9789328`.

## Resultado final

| Gate | Resultado |
| --- | --- |
| `python3 scripts/site/test_credential_registry.py` | passou: validade, retirada, expiração, `DOCUMENTARY_PRIMARY`, CPTEC ≠ nomeação, endereço ≠ storefront, zero prova de cliente |
| `python3 scripts/site/test_conflict_gate.py` | passou: hash/versão, oito casos, Python/JS, path protegido, rollback e 100 triagens sem vazamento |
| `npm run test:authority` | passou, incluindo sanitização de identidade, paridade e permissioned proof |
| `npm run test:visible-parity` | passou |
| `npm run test:copy:language` | passou em 251 superfícies públicas |
| `npm run test:copy:core` | passou |
| `npm run test:privacy` | passou |
| `npm run test:html-integrity` | passou em 253 HTMLs |
| `npm run test:skip-link` | passou |
| `npm run test:inbound-gates` | passou |
| `npm run test:design` | passou após alinhar o CTA amplo do especialista ao contrato existente |
| `npm run build:site` | passou; artefato público montado, validação e visible parity sem erros |
| `npm run audit:axe` | passou em 57 rotas × 2 viewports, com zero violações críticas/sérias; uma ocorrência moderada preexistente em `/ferramentas/checklist-reequilibrio/`, fora do WRITE_SET |
| `node scripts/site/test_trust_surfaces_responsive.mjs` | passou nas três rotas em 390×844 e 1366×768, com axe sem violações |

O teste responsivo confirmou, nas seis combinações rota/viewport: zero overflow horizontal, um `h1`, header e breadcrumb íntegros, bloco obrigatório visível, nenhum ID duplicado, nenhum campo sem rótulo e nenhum controle menor que 44 px. No navegador, o gate retornou `REVIEW_REQUIRED` quando o canal protegido estava indisponível e `DECLINE` para dever público no mesmo objeto.

## Observação sobre seleção afetada

`npm run test:affected` promoveu a seleção para a matriz ampla por detectar o novo contrato compartilhado. Todos os blocos executados até `test:design` passaram, exceto a primeira execução do contrato de CTA do especialista, que ainda esperava o texto histórico “Solicitar diagnóstico”. A copy foi ajustada para “Solicitar diagnóstico técnico” e `npm run test:design` passou integralmente depois da correção. Os checks remotos da PR são a autoridade final para a matriz completa.

Arquivos gerados pelo build e pelos auditores fora do WRITE_SET foram restaurados; não integram a campanha.
