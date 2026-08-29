# Evidência de release: canário de chuva em striking distance

- campanha: `CONFENGE_INBOUND_STRIKING_DISTANCE_CHUVA_REWRITE_INDEX_20260829`
- issue: `#127`
- decisão: `VALIDATE`
- frente executiva: Inbound Engine / aquisição orgânica
- alavancas: distribuição, confiança, dados e automação
- SHA-base inicial: `dbd7e3a073354f9c746e499d380fd438c088ee3d`
- main revalidado e incorporado antes do PR: `0cd62834a0f3b4408a2b2a06e808c85e0f0a2bbd`
- URL: `/conteudos/chuva-prorrogacao-prazo-obra-publica/`
- pergunta proprietária: quando um evento pluviométrico ou climático deixa de ser mero risco ordinário e passa a ter relevância técnica demonstrável para o prazo?

## Resultado

A página foi reescrita de forma integral, aprovada sob delegação expressa do owner e liberada como o único canário da issue #127. Ela agora responde a pergunta logo no início, separa ocorrência, excepcionalidade e impacto, e fornece uma matriz reproduzível com regra `UNKNOWN`. O texto não promete prorrogação, deferimento, indenização ou ausência de sanção.

O teste de 100 repetições é positivo apenas como sistema: a matriz, o ownership e o gate de aprovação hash-bound tornam futuras revisões mais verificáveis. Repetir a publicação sem demanda, utilidade e revisão produziria apenas 100 unidades de trabalho e continua proibido. O segundo canário depende de 28 dias de evidência GSC deste release.

## Before / after e prova negativa

| Estado | Robots | Sitemap XML | Canonical | H1 | Palavras visíveis em `<main>` |
|---|---|---:|---|---|---:|
| `origin/main` no SHA-base | `noindex,follow` | 0 | self-canonical | Chuva justifica prorrogação de prazo em obra pública? | 1.118 |
| branch final | `index,follow` | 1 | self-canonical | Chuva na obra pública: quando o prazo é tecnicamente impactado | 1.899 |

O espelho `sitemap.txt` também contém a URL uma vez. A inclusão em `/conteudos/` é a entrada única exigida pelo contrato de igualdade entre política, HTML indexável e diretório; nenhuma navegação global foi alterada.

O HTML público foi reaberto em 29/08/2026 e confirmou o mesmo estado negativo de robots, canonical e sitemap; a contagem anterior da tabela é a medição reproduzível do SHA-base, não uma atribuição de contagem exata ao deploy live.

As duas irmãs permanecem `noindex,follow`, self-canonical e ausentes dos sitemaps:

- `/conteudos/aditivo-qualitativo-quantitativo/`
- `/conteudos/prazo-vigencia-prazo-execucao-contrato-obra/`

## Fontes e revisão factual

Fontes primárias reabertas em `2026-08-29`: Lei nº 14.133/2021 no Planalto; orientação sobre matriz de riscos e Acórdãos 639/2006 e 3.077/2010 no TCU; Normais Climatológicas 1991–2020, metodologia e BDMEP no INMET. A [nota de pesquisa](../../research/chuva-prorrogacao-fontes-primarias-2026-08-29.md) registra claims, limites e `accessed_at`.

Conclusões adversariais:

- o art. 115, § 5º, não transforma qualquer chuva em impedimento;
- os julgados do TCU são casos contratuais específicos, anteriores à Lei 14.133, e não criam limiar universal;
- o limiar de 1 mm do INMET é uma contagem climatológica, não dia improdutivo ou dia de prazo;
- nenhuma estação, série, evento ou dado de obra real foi presumido;
- o exemplo de 16 horas é inteiramente sintético, com fórmula, unidade e premissas; dias contratuais permanecem `UNKNOWN`.

## Originalidade e anti-canibalização

- sobreposição máxima no cluster: `1,00%`, abaixo do limite de `15%`;
- sobreposição máxima da página de chuva com cada owner vizinho: `0,55%`;
- decisão desta URL: `qualificar-evento-climatico`;
- instrução do pedido, culpa da Administração, resposta à notificação e efeito legal continuam com seus owners existentes;
- a página encaminha explicitamente às quatro rotas quando a decisão muda;
- títulos, H1s e descriptions continuam distintos.

## Aprovação delegada e identidade material

- `approval_type`: `OWNER_DELEGATED_APPROVAL`
- `decision_authority`: `owner / Tiago Sasaki`
- `reviewer_executor`: `agente desta campanha / CONFENGE_INBOUND_STRIKING_DISTANCE_CHUVA_REWRITE_INDEX_20260829`
- `approval_basis`: `owner-delegated review 2026-08-29`
- `manual_human_review`: `false`
- material hash: `sha256:a588953e8df4fd59555afbad2ce331cb2c02d866ba06301850b804c882d7696d`
- approval hash: `sha256:373456323ef34f6002961bc1c7a2263d52f1fa9dde74b6168db296564e18d94f`

O gate normaliza somente o estado de release da meta robots; qualquer outra mudança no HTML invalida a aprovação. Os cinco resultados substantivos exigidos estão `true`. Não houve revisão humana manual nem segundo revisor independente.

O freeze BOFU classificou a alteração autorizada dos dois sitemaps como collateral não renderizante e exigiu recaptura. O baseline foi vinculado ao commit `cf822b030ee34d3b5cfc0ce5ab4477f8021212db`, que contém os bytes revisados; somente os hashes de `sitemap.xml` e `sitemap.txt` mudaram. Os seis HTMLs congelados, assets de renderização, `robots.txt`, redirects e o plano de unlock #291 permaneceram intactos.

## SEO, structured data e conversão

- title, H1 e description são exclusivos;
- canonical permaneceu na URL existente; nenhuma URL nova foi criada;
- `dateModified` e `lastmod` são `2026-08-29`; `datePublished` foi preservada;
- FAQ visível e `FAQPage` têm três pares idênticos e úteis;
- artefato público: 76 URLs indexáveis, 76 URLs em sitemap, 0 erro, 0 warning;
- `/conteudos/` declara e lista 22 itens, igual à política e ao conjunto indexável;
- CTA contextual solicita canal seguro e declara que o site não recebe arquivo;
- analytics usa somente atributos estáticos e o contrato existente `CONFENGE_WEB`; nenhuma PII foi adicionada ao payload;
- o handoff Warmbly e a autoridade `extra-cli` não foram alterados; não há novo crawler, dataset ou identidade.

## Gates executados

| Gate | Resultado |
|---|---|
| `npm run editorial:test` | PASS, 143 testes |
| testes específicos de chuva/striking/cluster | PASS, 27 testes |
| `npm run test:copy` | PASS |
| `npm run validate:seo` | PASS, 261 páginas, sitemap/indexável 76/76 |
| `npm run test:inbound-gates` | PASS |
| `npm run test:html-integrity` e `:site` | PASS, 263 HTML, 426 FAQs |
| `npm run build:site` | PASS, `public_artifact_hash=cc817d558e2a6336fb5dc1f562e739d64fa8672e61a1bce5e4768bbad4ac9332` |
| visible parity do build | PASS, 76 páginas, 0 defeitos |
| `npm run test:sitemap-graph` | PASS, 21 testes |
| `npm run test:hub-truth` | PASS, política/live/hub 22/22/22 |
| `npm run audit:accessibility` | PASS |
| browser exato da URL | PASS, 6 viewports, JS-off, teclado e axe 390/1440 |
| `npm run audit:axe` | PASS, 138 auditorias, 0 crítico/sério |
| `npm run test:ui` | PASS, incluindo layout crítico 114/114 |
| BOFU dominance/adversarial | PASS, 84 + 17 testes |
| analytics/PII, lead-function e inbound-handoff | PASS |

O audit sitewide adicional percorreu 1.572 combinações e encontrou três dívidas preexistentes em rotas fora do diff, todas a 360 px: `/comercial/termos-diagnostico-b2g/`, `/piloto/ofertas/contratar/` e `/termos-de-uso/`. A URL de chuva teve zero ocorrência; o gate exato e o layout crítico passaram. Nenhuma dessas dívidas foi alterada nesta campanha.

## Evidência visual

- [mobile 390 × 844](ui/screenshots/chuva-390x844.png)
- [tablet 768 × 1024](ui/screenshots/chuva-768x1024.png)
- [desktop 1440 × 1000](ui/screenshots/chuva-1440x1000.png)
- [matriz mobile, início](ui/screenshots/chuva-matriz-inicio-390.png)
- [matriz mobile, fim](ui/screenshots/chuva-matriz-fim-390.png)
- [relatório de UI reproduzível](ui/ui-report.json)

## Hipótese, mensuração e rollback

Hipótese: uma resposta estreita e reproduzível para qualificar impacto climático conquista a demanda histórica sem canibalizar os owners do pedido ou da defesa e conduz oportunidades qualificadas à validação técnica. Tempo para evidência: CI imediato; 28 dias de GSC após deploy para decidir manter, revisar ou voltar a `noindex`.

Rollback exato:

1. trocar somente a meta robots desta URL para `noindex,follow`;
2. remover sua única entrada de `sitemap.xml` e `sitemap.txt`;
3. mudar sua disposição para `noindex`, remover a entrada do diretório e retornar os contadores 22→21;
4. definir `approve_cli_indexable=false` e remover o objeto `approval`, preservando a reescrita;
5. regenerar a higiene de sitemap e o inventário editorial.

ADR afetado: ADR-STRAT-002 preservado, sem mudança de boundary. RUNTIME-AUTHORITY e MARKET-CAPTURE-OS preservados. Do not merge in this campaign.
