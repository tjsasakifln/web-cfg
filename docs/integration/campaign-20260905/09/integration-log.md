# MV-09 — registro de integração comercial multivertical

- Campanha: `CONFENGE_MV_CAMPAIGN=09`
- Estado de decisão: `EXECUTE_NOW`
- Frente: `INBOUND ENGINE + REVENUE NOW`
- Alavancas: receita, distribuição, dados, automação, confiança e cliente
- Tempo para evidência: gates da PR final e smoke do mesmo SHA em produção
- `INITIAL_MAIN_SHA`: `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`
- `ROLLBACK_SHA` inicial: `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`
- North Star: oportunidades comerciais qualificadas, não volume de páginas ou commits

## Baseline revalidada em 2026-09-05

- `origin/main`, build-info e runtime-info live apontavam para o mesmo SHA inicial.
- `https://confenge.com.br/` era exclusivamente B2G no título, hero, navegação, schema e CTAs.
- `/servicos/` respondia `301` para `/servicos-obras-publicas/`.
- `/confianca/` e `/especialista/tiago-jun-sasaki/` existiam e eram canônicos, mas a apresentação permanecia B2G-cêntrica.
- `/servicos-obras-publicas/` permanecia canônico, indexável e com captura fail-closed.
- `/.well-known/build-info.json`, `/.well-known/runtime-info.json`, `/healthz` e `/ready` estavam saudáveis.
- `node scripts/site/runtime_authority.mjs --live` passou sem divergência.
- `npm ci` concluiu sem vulnerabilidades conhecidas. A máquina local usa Node 24, enquanto o ambiente canônico usa Node 22. O build inicial passou; a suíte inicial avançou até o gate browser e parou apenas por Chrome ausente.

## Política de donors — snapshot inicial

| PR | Disposição | Motivo / delta elegível |
|---|---|---|
| #590 | PARTIAL | Taxonomia corporativa, validadores e testes são bons doadores; reconciliar com MV-01 e com a ADR atual. |
| #591 | REJECT | DAG/pins de dependência não pertencem ao critical path comercial. |
| #592 | PARTIAL | Contrato/gate de papéis de prova pode reforçar claims; não é superfície do visitante. |
| #593 | REJECT | Hub local noindex, checks vermelhos e fora do critical path. |
| #594 | PARTIAL | Catálogo multivertical e limites são bons doadores; reconciliar com MV-01. |
| #595 | PARTIAL | Gate de conflito pode ser portado após revisão de autoridade/formulário. |
| #596 | PARTIAL | Biblioteca de intake somente com pin externo provado e fallback funcional. |
| #597 | PARTIAL | Fonte da shell corporativa, sem merge amplo nem reescrita massiva de rotas B2G. |
| #598 | PARTIAL | Motor privado somente depois das money pages e após corrigir falso positivo/nomes de artefatos. |
| #599 | PARTIAL | Claims estritamente provados; não adotar registry de identidade local como autoridade canônica. |
| #600 | DEFER | Pesquisa/medição não bloqueia a release. |
| #601 | SUPERSEDE | Composto draft amplo; usar somente donors atômicos revisados. |
| #602 | DEFER | Issue de apoio/complementação de projetos, não PR donor terminal. |
| #603 | ADOPT | Gate de linguagem pública direta, sujeito a reconciliação do delta final. |
| #604 | PARTIAL | Não mergear inteiro: quatro achados P1/P2 na revisão independente; ver abaixo. |

## Revisão independente de #604

### Standards

- P1: registry local de credenciais/identidade conflita com a autoridade de fatos e identidade de `extra-cli`.
- P1: `/triagem-tecnica/` declara captura persistida como ação terminal, mas o submit está `WITHHELD` e não há fallback WhatsApp/e-mail na própria rota.
- P1: expansão privada/multivertical atravessa a antiga decisão B2G sem atualizar a ADR no mesmo delta.
- Julgamento: motor readiness duplicado em `.js`/`.cjs`; campos de intake formam um data clump entre store/core/handoff.

### Spec

- P1: estágio de planejamento marca domínios ainda não aplicáveis como `EVIDENCE_PRESENT`, inflando `present_count` sem evidência declarada.
- P1: a ferramenta é indexada antes das money pages e leva prioritariamente à triagem withheld sem fallback.
- P2: o artefato calculado para fechar a lacuna não é renderizado; a UI expõe ID interno em inglês.
- P2: claim operacional de atendimento é agrupado como `VERIFIED` por fonte cadastral, quando deveria ser separado como autodeclaração.

## Dependências externas revalidadas

- Warmbly PR #265 foi mergeada no commit `e6b39887` e preserva o consumer inbound-only, sem envio SMTP.
- O pin final comum MV-03 ainda não estava publicado no snapshot inicial; submit adaptativo permanece bloqueado até prova atual.
- MV-08 ainda não tinha delta/PR terminal no snapshot inicial.

## Regra de integração

Cada campanha MV-01..08 será registrada como `ADOPT | PARTIAL | SUPERSEDE | REJECT`, com SHA, arquivos portados, testes e justificativa. Candidatos só serão promovidos preservando conteúdo/hash/intenção; qualquer alteração material será descrita neste arquivo.

O teste de cem repetições exige que taxonomia, roteamento, gates e artefatos sejam reutilizáveis. Uma expansão que apenas crie cem páginas ou cem operações manuais não será promovida.
