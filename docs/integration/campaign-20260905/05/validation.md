# MV-05 — validação dos candidatos

Data: 05-09-2026. Os candidatos continuam isolados em `docs/integration`; nenhum resultado abaixo equivale a deploy ou autorização de oferta.

## Resultado

| Verificação | Resultado |
| --- | --- |
| `python3 tests/campaigns/mv-05/test_candidates.py` | **PASS — 9 testes**: conjunto exato, assets locais, metadata/canonical, JSON-LD, linguagem/prova, CTAs fechados sem PII, limites campo/remoto, fragmentos e dimensões das capturas. |
| `python3 scripts/site/audit_css_usage.py` | **PASS — `CSS_USAGE_OK`**; o CSS local preserva o orçamento de decoração do repositório (`border_radius=137`, `gradient=51`). |
| `python3 scripts/site/test_public_plain_language.py` | **PASS — 249 superfícies públicas atuais**. Os candidatos são cobertos adicionalmente pelo teste autocontido. |
| `python3 scripts/site/inbound_gates.py --out /tmp/mv05-inbound-gates-report.json` | **PASS — `ok: true`** no baseline público. Avisos de dívida já registrada permanecem; candidatos isolados não foram tratados como rotas publicadas. MV-09 deve repetir o gate no artefato promovido. |
| `node scripts/site/runtime_authority.mjs --live` | **PASS — `ok: true`**. Produção observada no release `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`, host `confenge-nginx-node/v2`, ambiente `production`. |
| JSON/XML dos fragmentos | **PASS** com `python3 -m json.tool` e `xml.etree.ElementTree`. |
| `git diff --check` | **PASS**. |
| Browser local, 4 rotas × 2 viewports | **PASS — 8/8 HTTP 200**, nenhum overflow horizontal, CTAs com 52 px no desktop e 78 px no mobile. |
| axe-core WCAG 2 A/AA + 2.1 AA | **PASS — zero violações `critical` ou `serious`** nas 8 renderizações. |
| Revisão visual das primeiras dobras | **PASS** em 390×844 e 1366×768; H1, consequência, limite e ação permanecem legíveis. |

## Screenshots

Cada PNG é uma captura do viewport, com `deviceScaleFactor=1` e scroll no topo.

- `screenshots/engenharia-projetos-obras-390x844.png`
- `screenshots/engenharia-projetos-obras-1366x768.png`
- `screenshots/compatibilizacao-revisao-projetos-390x844.png`
- `screenshots/compatibilizacao-revisao-projetos-1366x768.png`
- `screenshots/quantitativos-orcamento-obras-390x844.png`
- `screenshots/quantitativos-orcamento-obras-1366x768.png`
- `screenshots/inspecao-documentacao-edificacoes-390x844.png`
- `screenshots/inspecao-documentacao-edificacoes-1366x768.png`

## Limites da validação

- A ação dos candidatos navega para a triagem com contexto fechado de prévia. O próprio fragmento de captura exige formulário persistido dentro do `<main>` no SHA de promoção; o link sozinho não libera indexação.
- A produção não foi alterada. Nenhum POST, envio de lead, mensagem, outbound, SMTP, merge ou deploy foi realizado.
- Enquanto o pacote era produzido, `origin/main` avançou para `470a5ffafeaf45a59649109742ce5885f9789328` com o merge de #604. Os checks/release desse push estavam em execução; a produção ainda respondia no SHA-base `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`. A campanha não aguardou nem interferiu no deploy de outra campanha.
- A oferta privada, capacidade, presença em campo, responsabilidade técnica, ART/NF e disciplina permanecem sujeitas à autoridade comercial/profissional vigente e à integração das dependências abertas.
- As screenshots mostram o shell local do candidato. MV-09 deve repetir a matriz após aplicar o shell corporativo, captura e assets públicos finais.
