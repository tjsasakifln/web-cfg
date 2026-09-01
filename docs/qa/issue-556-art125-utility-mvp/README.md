# Evidência da issue #556 - triagem numérica do Art. 125

## Decisão e hipótese

- Estado: `VALIDATE` (P1).
- Frente: Inbound / Revenue / Conversion / Trust.
- Alavancas: receita, cliente, automação e confiança.
- Tempo para evidência determinística: imediato nos gates locais e de CI.
- Evidência econômica: `UNKNOWN` até uma coorte de SHA promovido ser reconciliada com QCO, proposta, contrato e margem observados pelo Warmbly.
- Job do visitante: verificar o recorte numérico do próximo acréscimo ou supressão, identificar premissas não confirmadas e levar contexto mínimo para análise humana do `CFG-D19`.
- Hipótese: cálculo útil antes do contato, seguido de receipt persistido, reduz a aritmética repetitiva da primeira conversa. Não há alegação de uplift, ROI, QCO ou receita.

## Autoridade e fronteiras

- Fonte legal geral reconfirmada em 2026-08-31: Lei nº 14.133/2021, arts. 124, I, 125 e 126, no Planalto.
- Regra geral preservada: 25% para acréscimo e supressão; somente o acréscimo passa a 50% em reforma de edifício ou equipamento.
- Fora do método: alteração consensual, transfiguração do objeto e regime excepcional de calamidade da Lei nº 14.981/2024.
- Dono dos fatos/proveniência: `extra-cli`; nenhum crawler, DataLake ou identidade foi criado.
- Dono da utility/captura: `web-cfg`.
- Dono da ação comercial e outcomes: Warmbly, via `source=CONFENGE_WEB`.
- ADRs aplicados sem alteração: ADR-STRAT-002, RUNTIME-AUTHORITY e MARKET-CAPTURE-OS.

## Contratos entregues

- Branches superiores: `INPUT_NOT_CONFIRMED`, `WITHIN_NUMERIC_SCOPE`, `NUMERIC_SCOPE_EXCEEDED`.
- Estados de premissa: `CONFIRMED | UNKNOWN`, `CONFIRMED | UNKNOWN`, `CONFIRMED_COMPLETE | KNOWN_PARTIAL | UNKNOWN`.
- `KNOWN_PARTIAL` mostra somente saldo máximo teórico/provisório; `UNKNOWN` nunca vira zero.
- Artefato local "Triagem numérica do Art. 125": copiar, TXT e imprimir/salvar PDF no browser.
- Captura on-page persist-first para `CFG-D19`, `contract_event=mudanca_escopo`, família Aditivos, consentimento, Turnstile, idempotência e receipt.
- Valores monetários, inputs crus e texto do artefato não existem no formulário, payload persistido, handoff ou analytics.
- Analytics: `tool_view`, `tool_start`, `tool_complete`, `tool_copy`, `tool_download`, `tool_to_form` e estágios do formulário; propriedades apenas categóricas/booleanas.
- Allowlist agregada de PII em analytics: `[]`.

## Evidência executada

| Gate | Resultado |
|---|---|
| `npm run test:tool-compute` | PASS - fixtures gerais, arredondamento, eixos independentes, propriedades e estados confirmed/partial/unknown |
| `npm run test:tools` | PASS - estrutura, eventos, DOM text-safe e fail-closed |
| E2E de tools em `_site` | PASS - `failed=0`, overflow 0, hostile persisted-state, três branches, artefato completo, dois leads na mesma aba com chaves distintas |
| `npm run test:analytics` + `test:form-funnel` | PASS - PII/raw-money negativos e `pii_allowlist=[]` |
| `npm run test:lead-function` | PASS - 54 checks; `CFG-D19` persiste com receipt e sem valores da calculadora |
| `npm run test:inbound-handoff` | PASS - 26 checks; `CONFENGE_WEB` e contexto categórico, sem valores/artefato |
| Turnstile build + `test:xray-turnstile-e2e` | PASS - injeção production fail-closed e fluxo browser |
| `npm run test:inbound-gates` + `npm run inbound:gates` | PASS - dívida route-exact removida; nenhum finding da rota; 55/66 ações terminais cobertas e 5 dívidas remanescentes alheias |
| `npm run build:site` + HTML/CSP/cache | PASS - artefato público, CSP sem relaxamento, cache e integridade |
| `npm run audit:axe` | PASS - 70 rotas x 2 viewports, zero critical/serious; a rota também ficou com zero moderate no E2E final |
| `npm run test:responsive-matrix` | PASS - 12 rotas x 16 larguras; a rota teve ainda 7 viewports no E2E |
| `npm run validate:seo` | PASS - 0 erros, 0 warnings |
| `npm run test:affected -- --base origin/main` | PASS - subset de risco, 31/91 suites selecionadas, sem fallback |
| Protected diff | PASS - único HTML alterado é a rota #556; home, pilares protegidos e rotas #126/#127/#128/#327/#387/#529 permanecem sem diff |
| SEO estável da rota | PASS - title, H1, canonical e robots sem alteração; somente `dateModified` acompanha a revisão real |

Os testes browser usaram bibliotecas Chromium extraídas em `/tmp` por falta de `libnspr4/libnss3` no host; nenhum threshold ou gate foi alterado.

## Rollback e publicação

- Publicação, merge e auto-merge: não executados.
- Rollback do código: reverter os commits exclusivos desta PR; receipts e histórico de medição não devem ser apagados.
- SHA promovido: `NOT_APPLICABLE` nesta entrega sem merge/publicação. Antes de qualquer publicação separadamente autorizada, registrar o SHA exato promovido e usar `/opt/confenge-web/bin/rollback FULL_SHA` no runtime canônico.

## Teste de 100 repetições

Cem usos reutilizam a mesma regra determinística, o mesmo artefato e o mesmo handoff. Eles só melhoram o sistema se branches agregadas sem PII forem reconciliadas com outcomes reais do Warmbly; sem essa reconciliação, são atividade e a evidência econômica permanece `UNKNOWN`.
