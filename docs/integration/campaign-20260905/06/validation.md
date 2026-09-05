# MV-06 — evidência de execução e validação

Observado em 2026-09-05 (America/Sao_Paulo).

## Isolamento e autoridade

- Repositório confirmado: `tjsasakifln/web-cfg`; remote `origin=https://github.com/tjsasakifln/web-cfg.git`; default branch `main`.
- Branch exclusiva: `feat/mv-06-expert-valuation-sst-revenue-pages-20260905`.
- Worktree exclusivo: `/home/tjsasakifln/code/confenge/.worktrees/web-cfg/mv-06-expert-valuation-sst-revenue-pages-20260905`.
- Primeiro `git fetch --all --prune`: `origin/main=89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`.
- Durante a execução, #604 integrou intake adaptativo e registro de credenciais. Novo fetch e rebase limpo: `BASE_SHA=470a5ffafeaf45a59649109742ce5885f9789328`.
- `HEAD_SHA` final é registrado pelo ref remoto e pela metadata da PR producer depois do push; este documento não tenta ser autorreferente.
- Nenhum checkout principal foi usado para editar; nenhum arquivo fora do WRITE_SET foi alterado.

## GitHub e produção reais

- Issues #577, #581, #583, #585 e #61 permaneciam abertas no corte.
- PR #604 estava `MERGED` em `470a5ffa…`; `site-ci`, pSEO e CodeQL concluíram com sucesso.
- PRs arquiteturais #590 (taxonomia) e #594 (ofertas) permaneciam abertas/behind; os IDs de núcleo foram consumidos por referência, enquanto IDs de oferta continuam `null`.
- PR #595 (conflitos) permanecia aberta. A política pública existente não foi tratada como prova de gate multivertical concluído.
- Autoridade de intake em `netlify/functions/data/adaptive-intake-authority.json`: `WITHHELD`, sem pin externo final. Por isso a promoção exige a integração da MV-03/MV-09; os candidatos mantêm contato direto e não recebem arquivos.
- Registro integrado `data/site/credential-registry.json`: CNPJ/nome da pessoa estão `VERIFIED`; Engenharia Civil/EESC-USP e ART/NF estão `SELF_ATTESTED`; CREA, título SST, CPTEC, pós-graduação em avaliações e vínculo técnico estão `WITHHELD`. A copy segue esses estados.
- Produção no corte: build e runtime `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`, Cloudflare → `confenge-nginx-node/v2`, portanto um release atrás de `origin/main`.
- As três rotas propostas respondiam 404 em produção. Nenhum deploy, merge ou mutação de produção foi executado.

## Pesquisa e fontes

- Pesquisa SERP e buyer language: registrada em `research.md`, com consultas datadas e sem cópia de concorrentes.
- Fontes primárias: Planalto/CPC, CONFEA, catálogo ABNT, MTE (PGR, NR-1, NR-15, NR-16, NR-17) e documentação do eSocial.
- A verificação de links detectou uma URL antiga da NR-16 retornando 404; o candidato e a pesquisa foram corrigidos para a rota oficial vigente terminada em `norma-regulamentadora-no-16-nr-16`.
- Portais oficiais lentos/anti-bot não foram convertidos em “fonte ausente”. Onde CREA/CPTEC não puderam ser reproduzidos, o registro canônico `WITHHELD` foi preservado.

## Gates locais

| Validação | Resultado |
| --- | --- |
| `python3 -m pytest tests/campaigns/mv-06/test_mv06_candidates.py -q` | 15 passed |
| `python3 scripts/site/test_public_plain_language.py` | PASS em 251 superfícies públicas já embarcadas |
| `python3 scripts/site/test_public_internal_marketing_labels.py` | `PUBLIC_INTERNAL_MARKETING_LABELS=0`; `DL_HERO_PROOF=0` |
| `python3 scripts/site/test_html_integrity.py` | `HTML_INTEGRITY_TESTS_OK` |
| Browser 1440×1000 e 390×844 | 6/6 sem overflow horizontal; todos os anchors locais resolvidos |
| axe-core WCAG 2 A/AA + 2.1 A/AA nos dois viewports | 0 violações `serious`/`critical` nas 6 combinações |
| JSON parse + `git diff --check` | PASS |
| Screenshots | 12 arquivos: primeiro viewport desktop/mobile e componentes de prova/contato por família; dimensões e hashes SHA-256 em `evidence/screenshots/manifest.json` |

Os gates gerais de root não certificam os candidatos em `docs/`; os 15 testes autocontidos fazem essa cobertura. MV-09 deve repetir os gates completos sobre o HTML promovido e o artefato público.

## Veredito producer

`READY_FOR_INTEGRATION=YES` significa que pesquisa, copy, limites, candidatos, testes, screenshots e fragmentos estão completos. Não significa `READY_TO_PUBLISH`: prova profissional, oferta canônica, conflitos, intake, registry, canonical, sitemap e artefato público continuam fail-closed no integrador.
