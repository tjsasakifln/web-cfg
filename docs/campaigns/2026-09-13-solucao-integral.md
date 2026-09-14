# Campanha SOLUCAO-INTEGRAL-20260913: solução técnica completa e sob medida

Decisão do fundador de 2026-09-13: EXECUTE_NOW para correção editorial,
migração dos bloqueios editoriais incompatíveis, implementação, validação e
publicação; VALIDATE para efeitos de aquisição, conversão e receita. Frente
executiva: comercial/editorial. Alavancas: confiança e cliente. Tempo até
evidência: publicação verificada no domínio, nesta mesma campanha.

Base: `57c5ccd121ad57e652e66df320bdc2c4dc1bb141` (= `origin/main` = SHA servido
por `/.well-known/build-info.json` e `/.well-known/runtime-info.json` no
preflight; release `34774802068`). Branch
`campaign/solucao-integral-20260913/comunicacao-comercial`, PR #684. Esta
campanha aplica a decisão EXECUTE_NOW de 2026-09-09
(`2026-09-08-comunicacao-publica-comercial.md`) e não reabre #678, #681 ou
#683; o #682 permanece pendência separada.

## Resultado exigido e regra canônica

O visitante deve compreender que a CONFENGE entende a necessidade e conduz uma
solução de engenharia completa e sob medida, na ordem necessidade → solução →
trabalhos e entregas → condução e integração → conclusão técnica → contato.
Cada serviço conserva nome e identidade técnica; a proposta compõe as etapas
pertinentes. "Completa" caracteriza a solução técnica para a necessidade
atendida, nunca aprovação, êxito, obra executada, prazo ou preço. A regra
executável está em `data/corporate/public-service-page-contract.v1.json`
(`presentation_order`, `semantics.material_boundary`) e em `GX-06` de
`data/commercial/copy-contract.v1.json`; o gate persistente é
`scripts/site/test_integral_solution_copy.py`.

## Universo e cobertura

Duas fontes independentes, reconciliadas na descoberta: (1) fonte autoral e
gerada no repositório: 260 `index.html` + `404.html` + quatro `obrigado*.html`
+ `ops/wave1-review.html` = 266 arquivos, com produtor identificado (autoral,
`scripts/site/render_nav_hubs.py`, `scripts/commercial/render_*.mjs`,
`scripts/demonstrative/*/render.py`, `scripts/editorial/build.py`,
`scripts/pseo/build.py`, `scripts/live_intelligence/*`,
`scripts/contract_analysis`, `scripts/data_desk/publish.py`); (2) inventário
físico do artefato: `seo/PUBLIC-ARTIFACT-MANIFEST.json` com 229 rotas HTML +
5 HTML de raiz; sitemaps XML/TXT com 98 rotas indexáveis e 134 noindex. A
diferença 266 − 234 = 31 são `/piloto/` (24), `/oportunidades/` (5) e
`/panorama-mercado-obras-publicas/` (2), fora de `PUBLIC_TOP_DIRS` e com 410
em `_redirects`, mais `ops/wave1-review.html` excluído do artefato. Zero rota
indexável fora do sitemap; 44 famílias cobrem 100% das 98 rotas indexáveis.

Estados interativos examinados: sem JS (`class="no-js"`, `<noscript>` da
prontidão), prontidão adaptativa `WITHHELD` (canais de WhatsApp/e-mail/telefone
como alternativa), analytics recusado, erro de formulário, confirmação
`obrigado*`, resultados das ferramentas e alternativas da prontidão
(`app.js`), situações da home (`js/modules/nav.js`).

O gate lê a superfície humana (texto visível, `title`, metas, OG, `alt`,
`aria-label`, JSON-LD, `<template>` e sinks literais de JS) de todos os HTML da
fonte e de todos os HTML do artefato, e reprova quando uma rota do registro de
famílias (fonte) ou do manifesto (artefato) não foi lida. Preservações são por
trecho em `data/site/integral-solution-exceptions.json` e caducam se o texto
mudar; nesta campanha a lista está vazia. Desde a verificação da release
`51b231883` o gate também lê os índices `data-search` da biblioteca: o
cartão de `/conteudos/` ainda dizia "três compras distintas" no atributo
enquanto a descrição visível já estava corrigida (byte-grep da produção
encontrou; a superfície humana não). Texto interno de contrato que não é
renderizado (`intent-family-matrix.v1.json#disambiguation`,
`purchase-route-map.v1.json#required_proof`) fala em "compras distintas" como
regra de não fusão de famílias, não como comunicação; fica fora do universo.

## Diagnóstico diferencial e correções (antes → depois)

Descoberta em 88 agentes: 236 blocos classificados, 81 candidatos C1/C2, 57
confirmados após refutação adversarial, 24 refutados como C3/C4/C5. Correções
na origem (produtor entre parênteses quando não é o HTML autoral):

| Rota/estado | Antes | Categoria | Depois |
| --- | --- | --- | --- |
| `/servicos/` lead | "a página própria, quando ela já existe" | C2 | trabalho e entrega por situação; proposta combina as etapas em solução completa e sob medida, enumerada |
| `/servicos/#servico-revisao` | "Elaborar a disciplina que falta é outra compra." | C1 | elaboração e compatibilização entram na mesma proposta |
| `/servicos/#servico-compatibilizacao` | "compra distinta de elaborar ou revisar" | C1 | registra interferências, conduz ajustes; proposta compõe as etapas |
| `/servicos/#servico-avaliacao` | "Não há landing própria nesta publicação" | C2 | o pedido entra aqui; inspeção/assistência combinadas quando a decisão exigir |
| `/servicos/#servico-sst` | "Produção de peça nominada só entra se a proposta a nomear" | C1 | produzimos os documentos nomeados na proposta com o profissional habilitado |
| Home "Como funciona" | "Você recebe a indicação do que resolve." | C1 | "Você recebe a solução organizada", com etapas combinadas |
| Home obras públicas | "Avaliamos se podemos ajudar" | C2 | respondemos com o apoio técnico que cabe; responsabilidade confirmada antes do aceite |
| Home contato "Depois" | "o que dá para fazer com o material disponível" | C2 | trabalho, entrega e o que falta reunir |
| Home situação "outro" (`js/modules/nav.js` → `script.js`) | "se ela se encaixa na atuação da CONFENGE" | C2 | qual trabalho de engenharia a resolve (texto e WhatsApp) |
| `/triagem-tecnica/` | "responde dizendo se pode ajudar" | C2 | responde com o trabalho, a entrega e o que falta para a proposta |
| `/entregas/` sumário | "receber a indicação" | C1 | "receber a proposta organizada" |
| `/casos/` | "só mostra exemplos existentes; o que ainda não está apto não aparece"; "não há lista de trabalho real aqui" | C2 | exemplos mostram como o trabalho é organizado; rótulo demonstrativo preservado |
| `/conteudos/` | "Não há categoria vazia: se a entrega ainda não tem página própria" | C2 | cada caminho leva ao serviço que explica e recebe o pedido |
| `/parcerias-engenharia/` | "são compras distintas" | C1 | trabalhos com nome próprio que a proposta combina |
| Revisão (hero, aside, card, prova, contato) | "Não substituímos… nem assinamos" na dobra; "Revisão não é elaboração nem compatibilização"; "Só entra quando…"; "não se transforma em habilitação"; "continuam compras diferentes" | C1/C2 | relatório + condução dos ajustes; etapas irmãs na mesma proposta; autoria permanece com o autor (C4 preservado) |
| Compatibilização (hero, seção, card, limites, contato; `data/coordination/interference-register.v1.json`) | "encaminhamos o ajuste"; "Não confundir as compras"; "Isso é outra compra"; "permanece em aberto até o contexto chegar"; "continuam compras diferentes" | C1/C2 | conduzimos os ajustes com os autores; "Como as etapas se combinam"; revisão da peça entra na proposta; sem promessa de obra sem interferência (C4 preservado) |
| Complementares (aside, limites, card, seção, guia) | "Esta página vende elaboração, não revisão nem parceria"; "não cria pacote irrestrito nem equipe já contratada"; "Esta não é a página de revisão" | C1/C2 | etapas na mesma proposta; condições materiais afirmativas; autoria arquitetônica permanece (C4) |
| Quantitativos | "Esta página não publica tabela de honorários nem prazo" | C2 | fatores que influenciam o esforço descritos acima |
| Inspeção (seção, card, H2, limites) | "entra só se for contratado à parte"; "ficam de fora desta unidade"; "antes de assumir o trabalho"; "permanece em contexto, não em promessa"; "Não há endereço de loja…" | C1/C2 | etapas seguintes na proposta (reparo, orçamento, assistência); visita/local/ART combinados; sem unidade física de atendimento ao público (C4) |
| Assistência (metas, entrega, limites, H2, papéis) | "Sem advocacia e sem perícia do juízo"; "são compras diferentes"; "não esta entrega" | C1 | papéis próprios articulados; avaliação/inspeção na mesma proposta quando a disputa exige; resultado do processo pertence ao juízo (C4) |
| SST (metas, método, contato) | "só ocorre em proposta posterior"; "Visita só entra se…"; "é outra conversa" | C1 | a proposta nomeia e a CONFENGE conduz a produção; visita combinada; assistência técnica combinada |
| `/ferramentas/` e prontidão (`app.js`) | "termina em captura na própria página"; "abra a página dele: o pedido começa lá" | C2/C1 | cada resultado indica o serviço que dá continuidade; a proposta combina os caminhos |
| `/problemas-que-resolvemos/` (`data/commercial/offer-fit-matrix.v1.json` → `render_nav_hubs.py`, `js/modules/offer-fit.js`) | "Caso pontual… se resolve nas ferramentas públicas" | C1 | pode começar pelas ferramentas e seguir para a conversa com um engenheiro |
| Demonstrativos (`scripts/demonstrative/*/render.py`) e guia de orçamento | "são compras distintas" / "São compras diferentes" | C1 | trabalhos com nome próprio que a proposta combina |
| Guia "qual compra fazer?" | título, lead e seção "Como não misturar as compras" | C1 | "o que cada etapa resolve"; "Como as etapas se combinam"; três compras, três entregas, uma proposta |
| `/atrasos-prorrogacao-obras-publicas/` | "O trabalho termina na base técnica; peça e protocolo permanecem com o cliente"; WhatsApp "atraso no pagamento de parcela" | C1 / contato incoerente | base técnica entregue para a direção e o jurídico (C4); mensagem de prorrogação/impacto (`data/site/whatsapp-messages.json`) |
| `/diagnostico-pre-licitacao/` (pilar congelado, recaptura honesta) | "o trabalho é outro" | C1 | nomeia os produtos que dão continuidade |

Preservações com fundamento específico (não são defeitos): matrizes "Faz
sentido / Não faz sentido" e exclusões dos pacotes de preço fixo B2G (C4:
pacote realmente ofertado, com encaminhamento ao produto certo e contato
contextual); "capacidade de atendimento" em Operação de Proposta, Diretoria e
Diagnóstico de Expansão (C4: capacidade simultânea declarada na oferta);
"Não substituímos o orçamentista da obra na montagem completa da proposta nem
garantimos vitória" em auditoria de orçamento (C4: extensão do pacote de preço
fixo + success_boundary); rótulos de demonstrativo e "Não representa cliente,
obra executada nem dimensionamento concluído" (C5); orientações das ferramentas
gratuitas ("organize o dossiê antes de protocolar") (C5); "O formulário não está
disponível agora. Use WhatsApp, e-mail ou telefone" (C6); citações da Lei
14.133 e de terceiros (C7); autoria de projeto alheio e "não redimensionamos a
disciplina de um autor sem que a revisão dessa peça esteja na proposta" (C4).

## Migração dos gates (regra antiga → nova condição, consumidor real)

| Regra antiga | Local/consumidor ativo | Bloqueio reproduzido | Propriedade legítima | Nova condição e teste |
| --- | --- | --- | --- | --- |
| `forbidden_phrases` com "solução completa" e "soluções personalizadas" | `data/site/brand.json` → `scripts/site/brand.py`, `test_brand_contract.py`, `test_copy_gates.py` (`len >= 54`, fixture) → `npm run test:brand`, `test:copy` → site-ci e pseo | `scan_brand_html('<p>Entregamos uma solução completa e sob medida.</p>')` reprovava, inclusive negada | banlist de jargão por conteúdo | frases retiradas; `BRAND_PHRASES_THAT_MUST_STAY` afirmada por conteúdo; completude julgada por `test_integral_solution_copy.py` (slogan sem trabalho reprova, oferta enumerada passa) |
| FL-01/FL-05 `term_scan` sem exceção contextual | `copy-contract.v1.json` → `copy_contract_audit.mjs` → `test_copy_contract.mjs` (23 rotas B2G) | `classifyOccurrence` → `VIOLATION` para oferta enumerada | claim sem prova imediata continua VIOLATION | `GX-06 enumerated_scope_adjacency` (vocabulário de trabalhos, ≥3 termos, frase + frase seguinte); 7 asserções: slogan reprova, enumerada passa, equivalente passa, distante reprova, garantia continua reprovada |
| `material_boundary` = "o que não está incluído"; diagnóstico veta "solução completa"; ART e `allowed_copy` condicionantes antes do valor; `screen_structure` "não soluções completas" | `public-service-page-contract.v1.json` → `contracts.py` + `consumer-pin.json` (hash do arquivo) → `test:corporate-taxonomy` (pretest de `npm test`) | qualquer edição semântica reprova `page_contract_hash` até recalcular | sequência, `claim_classes`, `NEEDS_CONTEXT` interno, `success_boundary`, autoridade de preço | semântica de condições materiais junto da decisão; `presentation_order`; pin editorial recalculado pelo mesmo `_content_hash`; `docs/contracts/PUBLIC-SERVICE-PAGE.md` |
| Frases negativas exatas na primeira dobra | `tests/intake/test_inb05_revisao_projetos.mjs` | asserção literal | autoria alheia; sem laudo de segurança inventado; contexto incompleto acolhido | propriedades: autoria permanece; etapas irmãs como continuidade; sem slogan de fragmentação; mutação de assinatura alheia continua reprovando |
| `must` com "esta página vende elaboração", "não revisão nem parceria", "não cria pacote irrestrito", "nem equipe já contratada", "esta não é a página de revisão" | `tests/inb-20260911/12/...` | asserção literal | autoria arquitetônica, assinatura retroativa, `mustNot` de bastidor | `integralRe` (multi-necessidade acolhida; revisão/compatibilização na mesma proposta); frases antigas em `mustNot`; contraprova de assinatura retroativa mantida |
| "encaminhamos o ajuste" e slogan "não é elaborar…" como mutação | `tests/coordination/test_page_contract.mjs` | asserção literal | não redimensionar disciplina alheia; não prometer obra sem interferência | mutações sobre as propriedades |
| Frozen specs (`script.js`, pilares) | `data/bofu-dominance/frozen-specs/hashes.json` | drift em `script.js` e `diagnostico-pre-licitacao` | preço, prazo, checkout, robots, canonical inalterados | recaptura honesta com motivo, `baseline_commit` alcançável |

Alcance dos adjetivos soltos: ao retirar "soluções personalizadas" da banlist
de marca, "personalizado(a)" e "sob medida" fora das 23 rotas B2G (onde FL-05
continua) ficariam sem consumidor. `completude_sem_trabalho` cobre os dois
adjetivos em todo o universo, sob a mesma regra de enumeração (caso varrido
"Atendimento personalizado para a sua obra"; caso preservado "Proposta sob
medida: elaboração, revisão e compatibilização…"). Fora do escopo desta
campanha e preexistente: FL-08 ("garantimos…") só roda nas rotas B2G;
`completude_com_promessa` reprova a promessa apenas quando adjacente a uma
alegação de completude.

Não alterados por não bloquearem a correção: `value-first-copy-contract`
(shadow, aliado), `inbound_gates.py`, `real_proof_registry.mjs`,
`test_self_deprecating_copy.py` (aliado, roda pré e pós-build).

## Regressão nas duas direções

`scripts/site/test_integral_solution_copy.py` (npm `test:integral-solution`,
em `test:copy:language`, site-ci pré-build e pós-build sobre `_site` com
`--require-artifact`): 19 casos varridos (fragmentação, bastidor, slogan em
meta/JSON-LD/sink de JS/aria-hidden/details, lista de serviços distante) e 12
casos preservados (autoria, preço fixo, demonstrativo, ferramenta, erro de
formulário, oferta enumerada). Cobertura: `test_coverage_refuses_a_smaller_universe`.
Contraprovas executadas sobre cópia do artefato: frase de abandono injetada em
`/servicos/` → reprova; slogan injetado em `404.html` → reprova; rota
`/triagem-tecnica/` removida → falha de cobertura. Copy-contract:
`gx06_*` no consumidor real. Regeneração: dois `build:site` consecutivos com
`SOURCE_DATE_EPOCH` e produtor contratado, 0 diferenças em `_site`.

## Evidência de publicação

Registrada em comentários do PR #684 e nos artefatos das execuções de
`site-ci`, `pSEO quality gates` e `netcup-release` do candidato. Este arquivo
não grava o SHA final do próprio candidato.
