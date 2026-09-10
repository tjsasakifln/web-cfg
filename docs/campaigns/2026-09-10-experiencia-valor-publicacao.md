# Campanha 2026-09-10 — Experiência, valor e publicação confiável

Decisão do fundador: **EXECUTE_NOW**, 2026-09-09. Destino: https://confenge.com.br pelo fluxo
canônico Netcup/Cloudflare. Continuação direta de #647, #648 e #649. Dois resultados
independentes e obrigatórios: **R** (publicação confiável) e **E1–E5** (experiência comercial),
comprovados na **mesma versão pública final**.

Estado decisório: EXECUTE_NOW. Frente executiva: superfície pública canônica.
Alavancas: receita (oportunidade qualificada), confiança (fundamento verdadeiro), automação
(gates que reprovam a regressão). Tempo até evidência: um ciclo de release.

---

## R — Diagnóstico da falha pós-#649

### O que a run 34422538162 provou

| fato | valor |
|---|---|
| SHA promovido | `9c2d7ae6a351081dc470afaeefee71eb48361a50` |
| HTML esperados / obtidos / com digest exato | 518 / 518 / 518 |
| verificações de URLs retiradas | 78 passaram |
| verificações não HTML | 263 planejadas, 263 executadas, 262 passaram |
| única reprovação | `/robots.txt` |
| erro registrado | `public_non_html_response_failures:1` |
| resultado | promoveu, aceite reprovou, rollback restaurou `54b51438a1` |

### Corpo histórico recuperado por prova de hash, não por hipótese

O relatório `non-html-assets.json` guardou o **sha256** do corpo divergente, não o corpo.
O corpo foi **reconstruído e confirmado bit a bit**:

```
prefixo gerenciado capturado da borda .......... 1834 bytes + 2 de separador = 1836
robots.txt do pacote 9c2d7ae6a (sha f835994a…) ...... 507 bytes
concatenação .................................. 2343 bytes  (histórico: 2343)
sha256 da concatenação  63bbcced4d672efa40a5c04bbf64b30a6125862e3638df197de774231e85b000
sha256 histórico        63bbcced4d672efa40a5c04bbf64b30a6125862e3638df197de774231e85b000
                                                                        IDÊNTICO
```

Consequência: o mecanismo é o **Cloudflare “Managed robots.txt”**, que **antepõe** um aviso de
Content Signals e um bloco delimitado por `# BEGIN Cloudflare Managed content` …
`# END Cloudflare Managed Content` (atenção à caixa: `content` minúsculo na abertura,
`Content` maiúsculo no fechamento). **Nenhum byte do nosso conteúdo foi alterado, removido ou
reordenado.** A condição é pré-existente; o gate de não HTML introduzido em #649 apenas a
tornou visível pela primeira vez. `CF-Cache-Status: EXPIRED` não identifica a causa e
`no-transform` já estava presente — reaplicá-lo não corrigiria nada.

O parâmetro `site` do aceite resolve para a **composição do pacote**, não para a raiz do
repositório: o `robots.txt` extraído do tarball atestado tem exatamente 507 bytes e
sha `f835994a…`, igual ao `expected_sha256` do relatório. A comparação é contra o pacote.

### Autoridade do robots: composição gerenciada é mantida, com fundamento

Desligar o Managed robots.txt para obter “fonte única” **concederia silenciosamente** permissão
de treinamento de IA hoje negada. O bloco gerenciado carrega política que não existe em nenhum
lugar deste repositório:

- `Content-Signal: search=yes,ai-train=no,use=reference`
- `Disallow: /` para Amazonbot, Applebot-Extended, Bytespider, CCBot, ClaudeBot,
  CloudflareBrowserRenderingCrawler, Google-Extended, GPTBot, meta-externalagent

Isso é mudança de política disfarçada de limpeza, vedada pela própria regra de transição.
**Decisão: manter a composição**, com contrato de borda que aceita exclusivamente o bloco
delimitado pelos dois marcadores e exige os bytes de origem íntegros.

### Restrições que saíram do robots não são perda de política

O pacote candidato deixa de trazer `Disallow: /piloto/` e o bloco
`# Market-panorama family` (`Disallow: /panorama-mercado-obras-publicas/`).
Isso **não** é perda de restrição vigente: as duas famílias passaram a ser **retiradas com 410**
em `_site/_redirects`

```
/piloto  /404.html  410
/piloto/*  /404.html  410
/panorama-mercado-obras-publicas  /404.html  410
/panorama-mercado-obras-publicas/*  /404.html  410
```

Um `Disallow` sobre uma URL retirada é mais fraco, não mais forte: impediria o rastreador de
**ver** o 410 e de remover a URL do índice. A retirada com 410 é a restrição mais forte, e é
verificada pelas 78 provas de URLs retiradas do próprio aceite.

---

### Regras efetivas: a metade que o contrato de bytes não cobria

`robots_edge_contract` prova que a borda não adulterou os nossos bytes. Ele **não**
prova que os nossos bytes continuam exprimindo a política vigente: uma restrição pode
sumir da origem sem que um único byte seja adulterado no caminho, e o gate de bytes
aprovaria. Essa era a contraprova `perda de restrição vigente` que faltava.

Acrescentado nesta campanha:

- `scripts/site/robots_policy.py` — motor RFC 9309 (2.2.1 combinação de grupos por
  user-agent, 2.2.2 casamento mais longo com empate resolvido pela regra menos
  restritiva, 2.2.3 `*` e `$`). Diretivas não padronizadas (`Sitemap`, `Content-Signal`)
  são preservadas e comparadas: exprimem política vigente e não são descartáveis
  só porque não controlam Allow/Disallow.
- `data/organic/robots-policy-baseline.v1.json` — 208 decisões aprovadas por
  agente e caminho, derivadas da política e da configuração, **não** copiadas da
  resposta que se deseja validar.
- `verify_robots_policy` em `public_server_acceptance.py` — avalia o corpo
  realmente servido contra a linha de base e reprova junto com o restante do aceite.
  A aplicabilidade vem do inventário do host: enquanto `robots.txt` fizer parte da
  superfície publicada, a ausência do corpo reprova em vez de dispensar a verificação.

Regras efetivas conferidas no corpo composto (208 sondas): rastreadores de busca
liberados nas rotas comerciais e bloqueados em `/ops/`, `/intranet` e `/.netlify/`;
os nove rastreadores de IA bloqueados em **todos** os caminhos; `Content-Signal:
search=yes,ai-train=no,use=reference` presente. Os quatro grupos `User-agent: *`
(dois gerenciados, dois nossos) combinam e o `Allow: /` gerenciado **não** apaga
as nossas restrições.

Contraprovas que reprovam, cada uma com teste próprio:

| contraprova | erro |
|---|---|
| restrição viva removida da origem | `robots_effective_rules_diverged` |
| composição gerenciada desligada | idem, com GPTBot/ClaudeBot/CCBot/Google-Extended/Amazonbot liberados |
| `Content-Signal` ou `Sitemap` perdido | `robots_policy_directive_absent` |
| `robots.txt` publicado sem corpo | `robots_policy_body_absent` |
| linha de base ausente ou vazia | `robots_policy_baseline_missing` / `_empty` |
| diretiva nossa alterada na borda | `robots_origin_bytes_not_preserved` |
| corpo divergente sem marcador | `robots_differs_without_managed_markers` |
| diretiva ativa antes do bloco gerenciado | `robots_active_directive_before_managed_block` |
| bytes estranhos entre o marcador e a origem | `robots_unexpected_bytes_before_origin` |

O prefixo gerenciado real (1836 bytes com o separador) está em
`scripts/site/testdata/robots-managed-prefix.txt` e a origem das fixtures vem do
**pacote**, para que os testes acompanhem o que é publicado em vez de congelar
uma cópia que envelhece em silêncio.


## Matriz de achados do diagnóstico

Diagnóstico por **tarefa do visitante** (sete tarefas, entrada pela home e por URL profunda) mais três
frentes de contrato. **60 achados, 37 obrigatórios.** Nenhum total foi preenchido à mão: todos saem
das execuções registradas em `subagents/workflows/wf_fa10add0-8e1/journal.jsonl`.

Percursos medidos: das sete tarefas, **as sete chegam à explicação do serviço em 1 escolha de destino**
(critério: no máximo 2; abrir o menu móvel não conta). Veredito das caminhadas na base: 2 `pass`,
3 `ambiguous`, 2 `fail`.

| # | critério | severidade | rota / arquivo | achado |
|---|---|---|---|---|
| 1 | E4 | obrigatorio | `index.html (linha 462); servicos/index.html (linha 127); tri` | O rótulo "Projetos e edificações" aponta para /#situacao-projeto, que é a situação 01 "Projetar, revisar, orçar ou compatibilizar — Projeto sem defini |
| 2 | E1 | opcional | `index.html (linha 130-133)` | A frase que deveria fazer o visitante se reconhecer lidera por termo abstrato de engenharia ("Anomalia", "registrar tecnicamente o que existe") em vez |
| 3 | E2 | opcional | `triagem-tecnica/index.html (linha 78)` | Esta é a página de entrada de contato (title "Triagem técnica / CONFENGE", meta description "Explique a situação técnica por WhatsApp, e-mail ou telef |
| 4 | E4 | obrigatorio | `index.html` | É o único CTA de contato da primeira dobra do home, ao lado de "Conhecer os serviços". O visitante de perícia ou avaliação que o usa é reclassificado  |
| 5 | E1 | obrigatorio | `index.html` | É o bloco terminal de conversão do home. A enumeração de seis verbos omite justamente perícia e avaliação, que o próprio home lista como situação 03 e |
| 6 | E2 | opcional | `index.html` | "Compradores de avaliações" é rótulo de segmentação interna, não linguagem de comprador. Uma pessoa que precisa de avaliação de um imóvel para inventá |
| 7 | E1 | obrigatorio | `servicos/index.html` | A pergunta "o que será entregue" fica sem resposta: a entrega é descrita por si mesma ("documento de segurança do trabalho aplicável"), sem nomear um  |
| 8 | E3 | obrigatorio | `triagem-tecnica/index.html` | Este <li id="sst"> é destino de deep link a partir de /servicos/#servico-sst, do rodapé de todas as páginas e de busca. Ele promete entregas específic |
| 9 | E5 | opcional | `servicos/index.html` | Único bloco da página que fecha o público em pessoa jurídica. As situações 02 e 03 abrem explicitamente para pessoa física ("Para pessoa física, condo |
| 10 | E1 | opcional | `triagem-tecnica/index.html` | A linha começa pelo documento ("Programa, laudo") e não pela necessidade do visitante, ao contrário do item irmão de projeto ("Projeto para executar,  |
| 11 | E1 | obrigatorio | `index.html` | O campo é <select id="estagio" name="estagio" required=""> com <option disabled selected value="">Selecione</option>. Verifiquei no navegador: com nom |
| 12 | E2 | opcional | `index.html` | O bloco pressupõe que eu já tenho "obra, projeto ou contrato" definidos e oferece apenas cinco saídas classificadas, sem nenhuma linha de escape para  |
| 13 | E4 | opcional | `index.html` | O link (linha 95) aponta para /triagem-tecnica/#projetos e já pré-classifica a demanda como "projeto" na primeira dobra, antes de o visitante indeciso |
| 14 | E4 | obrigatorio | `triagem-tecnica/index.html` | A mensagem pré-escrita do WhatsApp não preserva a necessidade que o visitante acabou de escolher. Quem precisa de um projeto estrutural NOVO não "tem  |
| 15 | E4 | obrigatorio | `index.html` | Os dois canais diretos da seção geral de contato da home estão cravados em obra pública. Uma pessoa física com projeto estrutural privado que use o Wh |
| 16 | E2 | obrigatorio | `index.html` | Primeira instrução do formulário geral da home, e fala só em vocabulário interno de obra pública ("separar edital, contrato e operação"). Para quem pr |
| 17 | E1 | opcional | `servicos/index.html` | Encontrabilidade: a palavra que o visitante pesquisou (projeto estrutural) aparece uma única vez no site inteiro fora de breadcrumbs, no meio de uma o |
| 18 | E1 | opcional | `index.html` | No cartão que este visitante escolhe, o primeiro link leva a quantitativos e orçamento — um destino de outra necessidade — e o link para projeto vem d |
| 19 | E5 | opcional | `index.html` | A afirmação de abrangência nacional aparece nua ao lado dos canais de contato, sem a condicionante que a própria empresa publica em /servicos/ ("Ativi |
| 20 | E2 | opcional | `data/commercial/page-contract-eight.v1.json` | Jargão interno em botão e em texto de oferta: um comprador não reconhece "Configurar o radar" como a ação de contratar/pedir uma análise, nem "estado  |
| 21 | E4 | obrigatorio | `servicos-obras-publicas/index.html` | Esta é a ÚNICA ação terminal do <main> desta rota (não há wa.me, mailto nem tel dentro do <main>), e os quatro campos são required no HTML de origem ( |
| 22 | E5 | obrigatorio | `servicos-obras-publicas/index.html` | O hub da vertical protegida cobre apenas eventos de contrato em execução e operação recorrente. A varredura do <main> renderizado não encontra nenhuma |
| 23 | E2 | obrigatorio | `servicos-obras-publicas/index.html` | "os itens 18 e 23" e a numeração "17."–"23." nas opções do formulário são a numeração interna do portfólio (data-deliverable-id CFG-D17..CFG-D23, ids  |
| 24 | E1 | opcional | `auditoria-orcamento-licitacao/index.html` | Duas coisas na mesma dobra. Primeiro, o breadcrumb arquiva sob "Conteúdos" uma página que vende um serviço B2G com escopo, inclusões e exclusões — a t |
| 25 | E4 | opcional | `auditoria-orcamento-licitacao/index.html` | O header desta rota B2G destoa do header canônico das demais páginas ("Serviços e problemas / Obras públicas / Biblioteca / Solicitar proposta") e seu |
| 26 | E4 | obrigatorio | `index.html` | Este e o CTA de e-mail do bloco "Proximo passo — Solicite uma proposta a partir da sua necessidade", que nomeia explicitamente "compatibilizado", ou s |
| 27 | E2 | opcional | `index.html` | Sob um titulo que anuncia quatro verbos (projetar, revisar, orcar, compatibilizar), o unico link dentro do corpo do card atende so um deles e leva a / |
| 28 | R | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/_site/robots.txt` | The served file asserts a restriction that does not exist. Anyone reading robots.txt, or reviewing the release, concludes the family is closed except  |
| 29 | R | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/scripts/market_panor` | This is the ONLY place in the repository that checks the hub Allow — the very line that creates the equal-length collision in finding R1. It cannot pa |
| 30 | R | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/data/organic/robots-` | The campaign requirement R is an EFFECTIVE-RULE requirement, and the effective-rule gate exists as code (scripts/site/robots_policy.py) and as data (2 |
| 31 | R | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/scripts/site/test_ro` | A test fixture that asserts it is the production body, and is not, converts a coverage gap into false assurance: four of the nine AI crawlers the appr |
| 32 | R | opcional | `/home/tjsasakifln/code/confenge/web-cfg/_site/_headers` | Harmless in effect — the 410 wins and no request ever reaches a page that could carry the header — but it is stale generated text describing a family  |
| 33 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/data/commercial/page` | This is the SINGLE human-authored source of "Configurar o radar", "estado decisório" and "ponto de revalidação" on the public surface. Both generators |
| 34 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/tests/commercial/tes` | Hard-locks every purchase CTA to begin with the literal word "Configurar". Any E1-E5 rewrite of cta_configure fails here first. This is a lexical free |
| 35 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/tests/commercial/tes` | These are the anti-jargon and anti-false-proof guards the campaign explicitly does NOT revoke: they forbid catalog jargon in buttons and force the dem |
| 36 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/scripts/site/test_de` | The first phrase in the tuple leads with the DOCUMENT ("terminam em documentos utilizáveis") instead of the visitor's need — the exact defect the camp |
| 37 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/scripts/site/test_de` | "Serviço, exemplo e oferta" is the label of the "Como ler a página" block — method/backstage framing asserted as mandatory. L243-244 additionally pin  |
| 38 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/scripts/site/test_re` | Pins the exact jargon CTA string, at count >=3, on the demonstrative report page. The concatenation "{cta_configure} por {price_display}" is built by  |
| 39 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/data/site/proof.json` | The home first fold leads with a METHOD badge instead of the visitor's need. Changing index.html:100 without adding the new wording to allowed_public_ |
| 40 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/scripts/commercial/r` | This generator EMITS the frozen "Serviços que terminam em documentos utilizáveis." heading. Editing entregas/index.html by hand is reverted on the nex |
| 41 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/scripts/commercial/r` | This generator concatenates cta_configure with the price and stamps it into every CTA (including the WhatsApp aria-label) on /casos/modelo-relatorio-i |
| 42 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/tests/commercial/tes` | NON-OBVIOUS TRIP-WIRE. The audit derives 120 clause bodies from deliverables-registry.v1.json contractHtml (which contains "ponto de revalidação" at L |
| 43 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/data/commercial/deli` | Registry-level jargon shown to buyers in the deliverable card. It is the source consumed by render_public_catalog.mjs (clientData) and by copy_contrac |
| 44 | E | opcional | `/home/tjsasakifln/code/confenge/web-cfg/entregas/index.html` | The eyebrow "Entregas inspecionáveis" and the "Como ler a página" block are HAND-WRITTEN (not inside the generator's replaced blocks — they appear in  |
| 45 | E | opcional | `/home/tjsasakifln/code/confenge/web-cfg/index.html` | Home copy leads with method, evidence-checking and the DOCUMENT rather than the visitor's need and the application of the work — the campaign's core d |
| 46 | E | opcional | `/home/tjsasakifln/code/confenge/web-cfg/scripts/site/test_to` | Reads like a frozen editorial string but is not one: it requires a public calculator (/ferramentas/checklist-reequilibrio/) to publish the limits of i |
| 47 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/data/commercial/firs` | Hash-pinned measurement snapshot, not an assertion. Any edit to index.html or entregas/index.html invalidates it by input hash and the first-fold iden |
| 48 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/entregas/index.html` | É o "manual do catálogo": a primeira dobra ensina a ler a página em vez de nomear a necessidade e a aplicação do trabalho. Fere a regra de que a copy  |
| 49 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/entregas/index.html` | "Configurar o radar" é exatamente o jargão citado na regra da campanha: o comprador não reconhece a ação. Ele não vai configurar nada — vai pedir uma  |
| 50 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/entregas/index.html` | "Ponto de revalidação" e "estado decisório" são os dois termos nomeados literalmente na regra da campanha como jargão interno não reconhecível por um  |
| 51 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/entregas/index.html` | O contato não preserva a necessidade que o visitante já escolheu: quem chegou por projeto, perícia, orçamento ou segurança do trabalho não encontra a  |
| 52 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/entregas/index.html` | Cinco das seis famílias anunciadas não têm nenhuma demonstração proporcional, e na superfície de demonstração elas aparecem como três parágrafos entre |
| 53 | E | opcional | `/home/tjsasakifln/code/confenge/web-cfg/entregas/index.html` | O <small> está dentro do H1 e sem separador, então o leitor de tela e o texto copiado renderizam "serve.Exemplos identificados." colado, e a nota entr |
| 54 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/data/site/public-ia-` | Duas rotas públicas distintas renderizam o mesmo rastro de navegação, e a que perde o nome é justamente a vertical especialista protegida B2G: quem ch |
| 55 | E | opcional | `/home/tjsasakifln/code/confenge/web-cfg/scripts/site/shell_n` | "Mudar a navegação uma vez" não é verdade hoje: são dois arquivos que precisam concordar, e o gate só protege metade do contrato. Se alguém corrigir u |
| 56 | E | opcional | `/home/tjsasakifln/code/confenge/web-cfg/data/site/public-ia-` | "Serviços e problemas" nomeia duas seções do site unidas por "e" — é rótulo de organização interna, não a necessidade nem a aplicação do trabalho. O c |
| 57 | E | opcional | `/home/tjsasakifln/code/confenge/web-cfg/scripts/site/public_` | Os dois lados do repositório leem o mesmo plano de destravamento e chegam a conclusões opostas: a primeira dobra já não considera nenhum pilar congela |
| 58 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/scripts/site/test_ho` | O gate transforma em requisito de aprovação o enquadramento editorial antigo: uma lista de DOCUMENTOS ocupando a primeira dobra, antes de qualquer apl |
| 59 | E | obrigatorio | `/home/tjsasakifln/code/confenge/web-cfg/scripts/site/test_ho` | O gate obriga a palavra "limites" (ou "método") a aparecer na primeira dobra da home. É literalmente o enquadramento limite-primeiro/método-primeiro q |
| 60 | E | opcional | `/home/tjsasakifln/code/confenge/web-cfg/scripts/site/first_f` | O contrato de primeira dobra mistura orçamento geométrico com uma regra lexical, e essa regra colide com um limite de largura que vive em outro arquiv |

Os achados de linguagem interna citados nominalmente pela campanha (`Configurar o radar`,
`estado decisório`, `ponto de revalidação`, `Como ler a página`, `Serviço, exemplo e oferta`,
`Entregas inspecionáveis`, `Serviços que terminam em documentos utilizáveis`, `A CONFENGE diz qual
documento resolve`, `Método e limites publicados`, `Conferir evidências e limites`) estão presos também
em contratos e testes, mapeados na frente de contratos. Onde a regra é puramente editorial ela é
substituída com contraprova registrada; onde é guarda de verdade, preço ou responsabilidade, é preservada.


## Regras editoriais revogadas, com regra substituta e contraprova

A decisão revoga regras **exclusivamente editoriais/comerciais** que impediam E1–E5 ou
perpetuavam a autossabotagem. Não revoga veracidade, privacidade, responsabilidade
profissional, integridade, segurança nem proteção de branch. Em todos os casos abaixo a
regra que entra é **mais forte**, não mais frouxa, e cada uma traz a contraprova que
continua reprovando.

| onde | regra revogada | regra substituta | contraprova que continua reprovando |
|---|---|---|---|
| `tests/commercial/test_page_contract_eight.mjs` | rótulo de compra tinha de começar pelo literal `Configurar` | verbo imperativo de próximo estado **e** o objeto do visitante nomeado no rótulo | `Saiba mais`, `Ver detalhes`, `Fale conosco`, `Pedir agora`, `Clique aqui` — e também o antigo `Configurar o radar`, que não nomeia objeto |
| `scripts/site/test_report_model_599.py` | contava o literal `Configurar o radar de licitações prioritárias por R$ 599` | CTA derivada do contrato de origem, em ≥3 posições, carregando o preço publicado | rótulo sem preço, menos de 3 posições, ou a volta de `Configurar o radar` |
| `scripts/site/test_brand_contract.py` | exigia **uma** de quatro frases congeladas de obra pública (`problema urgente`, `decisão crítica`) na home | **todo** canal de WhatsApp da home tem de ser contextual, por texto pré-escrito ou por preenchimento a partir da situação escolhida | canal nu sem `text=`, e mensagem genérica que não nomeia a situação |
| `scripts/site/test_design_gates.py` | heroi tinha de apontar para `/triagem-tecnica/#projetos` | o heroi tem de oferecer exatamente um caminho de contato, e ele leva à triagem | heroi sem caminho de contato, ou com mais de um |
| `scripts/site/test_design_gates.py` | primeira dobra tinha de conter `método e limites publicados` | primeira dobra tem de trazer o caminho de verificação `/confianca/` e nomear credenciais ou limites | dobra sem caminho de verificação |
| `scripts/site/test_home_first_fold.mjs` | `método` e `limites` valiam como fundamento de confiança | só credenciais e identidade verificáveis contam (`EESC-USP`, `CNPJ`, `CREA`, `ART`, engenheiro responsável) | dobra que só dissesse "método e limites publicados" agora pontua zero e reprova |
| `scripts/contract_analysis/tests/test_canary.py` | exigia `Disallow: /analises-contratos-publicos/` sempre | o `Disallow` é exigido **quando restringe de fato**, isto é, quando o hub não está liberado; o bloqueio efetivo da família é provado pelo `X-Robots-Tag` | com o hub fechado, o `Disallow` tem de existir **e** bloquear hub e filhos |

Preservadas intactas, por serem guardas de verdade e não de redação: as regras
anti-jargão e anti-falso-lastro do contrato das oito ofertas, a unicidade das 120
cláusulas do registro de entregáveis, o mecanismo de subconjunto do `proof.json`
(a lista de frases permitidas **ganhou** a substituta, nunca foi esvaziada), a
divulgação de limites da calculadora pública, preços, prazos e condições materiais.


## E3 — demonstração honesta em `/entregas/`

Retirados da página: `Entregas inspecionáveis`, `Como ler a página`,
`Serviço, exemplo e oferta`, `Serviços que terminam em documentos utilizáveis`
e a explicação de que a página separa categorias. A distinção passa a nascer da
organização e de rótulos locais.

Condições materiais **preservadas**, apenas movidas para junto das ofertas, que é
onde valem: a faixa `R$ 599 a R$ 3.750` e a cláusula de escopo — preços e
condições pertencem somente às ofertas que os exibem, e o aviso de dados
sintéticos pertence somente aos exemplos demonstrativos.

### A demonstração, e o que ela deliberadamente não prova

Não há amostra de cliente publicável. A decisão autoriza, nesse caso, mostrar a
**organização ilustrativa do conteúdo**. Cada família anunciada ganhou um esquema
em HTML acessível — sem miniatura ilegível, carrossel obrigatório ou PDF:

| família | o esquema mostra |
|---|---|
| projetos de estruturas e instalações, revisão e compatibilização | plantas e cortes, detalhes, especificações, memória de cálculo e registro de compatibilização, e a pergunta que cada peça responde na obra |
| quantitativos e orçamento | levantamento, composições abertas, referências e data-base, planilha e memória dos critérios |
| inspeção, perícia, avaliação e segurança do trabalho | objeto e pergunta, evidências, método, conclusão e limites |

A distinção obrigatória fica **no próprio esquema**, não num aviso distante da
página: o rótulo diz que ele mostra como a entrega se organiza, que **não é
trabalho executado nem representa cliente**, e que **por si só não comprova
experiência** — os fundamentos de confiança estão em credenciais e limites.
Nenhuma dimensão, cálculo, assinatura, ART, carimbo ou conclusão fictícia foi
usada para fazê-lo parecer executado.

A captura da página deixou de oferecer apenas licitação: entram projeto, revisão
e compatibilização, quantitativos e orçamento, inspeção e diagnóstico, perícia e
avaliação, e segurança do trabalho, num grupo declarado como **por proposta**,
para não sugerir preço publicado onde não há.

## Pendências obrigatórias em aberto

| item | por quê ainda não | o que destrava |
|---|---|---|
| rodapé separar `Projetos e edificações` de inspeção, e nomear a vertical B2G no breadcrumb | altera o shell de todas as páginas; o hash de aprovação editorial da análise publicada cobre a página inteira, e a mudança derrubava a aprovação para `noindex` | reaprovação humana da análise, que não pode ser auto-emitida |
| E5 — aceite visual e de compreensão por tarefa | exige interação real em 320/360/390/768/1366, teclado, foco visível, contraste, menu, âncoras e conteúdo sem JavaScript | rodar sobre a versão pública final, depois da promoção |


## E5 — aceite visual e de compreensão (inspeção própria, não pesquisa com clientes)

Medido no artefato construído, servido localmente, com navegador real.

**Aprovado, com número:** nenhuma das cinco rotas centrais tem rolagem horizontal
em 320, 360, 390, 768 ou 1366; as dez âncoras profundas caem livres do cabeçalho
fixo (alvo ~82px contra cabeçalho de 61px) e nenhuma está dentro de `<details>`
fechado; o *skip link* aparece ao foco e leva o foco ao `<main>`; o menu móvel
abre por teclado, prende o foco (cinco Tabs seguidos não escaparam), fecha no
Escape e devolve o foco ao botão; sem JavaScript o HTML servido já traz preços,
canais e a mensagem alternativa do formulário; contraste 9,68:1 no corpo, 6,13:1
no CTA primário e 7,42:1 no bloco do esquema ilustrativo. As sete tarefas do
visitante passaram, entrando pela home e pela URL específica.

**Corrigido nesta rodada:** os CTA dos cards de oferta mediam 198×19 e 196×19 px
a 390px, abaixo do mínimo de 24px da WCAG 2.2. Passaram a 198×44 e 196×44,
conferido no navegador, sem mudar o texto visível.

### Defeito obrigatório em aberto: refluxo com texto ampliado

Com o texto ampliado sobre 320px, a página inteira ganha rolagem horizontal:

| rota | 125% | 200% |
|---|---|---|
| `/` | 0 px (bloco `.contact-copy` 11 px) | **118 px** |
| `/servicos/` | **67 px** | **270 px** |
| `/entregas/` | 0 px | **162 px** |
| `/triagem-tecnica/` | 0 px | **162 px** |
| `/servicos-obras-publicas/` | 0 px | **162 px** |

Causa medida: itens de grade com o mínimo `auto`. `1fr` equivale a
`minmax(auto,1fr)`, e o mínimo `auto` impede a coluna de encolher abaixo do
`min-content`. A cadeia medida em `/servicos/` a 125% mostra um contêiner de
250 px com um filho de 337 px.

**Por que não foi corrigido nesta versão.** A correção é uma linha de CSS
(`minmax(0,1fr)` mais `min-width:0` nos filhos). Mas `rendered_content_hash`, que
sustenta a aprovação editorial da análise publicada, **cobre as folhas de estilo
junto com o HTML da página**. Ao aplicar a correção, a build reprovou fechada com
`contract_analysis_build_missing`: a aprovação caiu, a página deixou de ser
renderizada e o sitemap perdeu a entrada. Aprovação editorial é ato humano e não
se auto-emite. A correção foi revertida e a aprovação voltou a `PUBLISHABLE_INDEX`.

Isto é a **mesma restrição estrutural** que já bloqueia o rodapé e o breadcrumb:
qualquer mudança no *shell* ou no CSS compartilhado exige reaprovação humana da
análise publicada. As duas pendências destravam juntas, com um único ato de
reaprovação.


## Reconciliação das reprovações, por workflow, execução e candidato

Nenhuma aprovação de release anterior vale como aprovação **deste** candidato.
Onde a verificação não chegou a rodar sobre este código, o estado é
`NÃO VERIFICADO` — não `aprovado por herança`.

| workflow | execução | candidato | reprovação | classe | estado |
|---|---|---|---|---|---|
| site-ci | 34429246281 | `6e0cfee7b` | `test_whatsapp_contextual_on_home` | congelamento editorial: exigia uma de quatro frases de obra pública no canal geral | corrigido, regra substituída mais estrita |
| site-ci | 34430208411 | `f407b660c` | `home missing data-set-journey="contrato"` | atributo movido do canal geral para o caminho B2G | corrigido, com contraprova |
| site-ci | 34431466006 | `79f354d3a` | idem | mesma causa, correção ainda não publicada naquele momento | corrigido |
| site-ci | todas as três | — | 7 × `MEASURED_FAIL` do *site-excellence scorecard* | **consequente**: o passo roda com `if: always()` e lê artefatos de navegador que o passo anterior, já abortado, nunca produziu | **NÃO VERIFICADO neste candidato** |
| pSEO | 34431465970 | `79f354d3a` | `catalog_pin_hash:sha256:ee1beea1…` | pin de integridade do catálogo multivertical | re-pinado com prova, controle preservado |
| pSEO | local, este candidato | `5ff24ffd3` | `engineering_deliveries_have_substance` | contagem de famílias 3 → 5 | corrigido, exigência estendida às cinco |

### Sobre o scorecard

As sete linhas `MEASURED_FAIL` (`census_artifact_drift`, `browser_evidence_missing` ×3,
`accessibility_census_incomplete`, `csp_evidence_unavailable`,
`deploy_identity_commit_drift`) **não são defeitos visuais novos**: elas dizem que
a evidência não existia, porque o passo que a produz abortou antes. Isso não as
torna aprovadas. Elas permanecem **verificações pendentes deste candidato** e só
se resolvem quando o bloco de gates passar inteiro e o scorecard rodar com os
artefatos presentes.

### Sobre o pin do catálogo

O controle **não foi removido**. Antes de re-pinar, foi verificado contra
`origin/main` que apenas **um** entregável mudou (`CFG-D01`) e que preços, nomes
públicos e prazos são byte a byte idênticos: a mudança é de redação voltada ao
comprador (`ponto de revalidação` → `data em que a decisão precisa ser revista`),
não de oferta. Os dois pins — `consumer-pin.json` e
`consumer-conformance-fixture.json` — foram atualizados juntos, porque um sem o
outro deixaria a conformidade divergente do catálogo.

## Estado por categoria

Separado como pedido, sem misturar os três níveis.

| requisito | implementado | verificado no candidato | confirmado em produção |
|---|---|---|---|
| R — robots por política e por bytes | sim | sim, 24 + 66 testes | **não** |
| E1 — navegação | sim (breadcrumb B2G resolvido; rodapé bloqueado) | sim | **não** |
| E2 — valor e leitura | sim | sim | **não** |
| E3 — demonstração honesta | sim, 5 famílias, 2 aceites separados | sim, 27 testes | **não** |
| E4 — contato contextual | sim | sim | **não** |
| E5 — usabilidade e compreensão | parcial | medido no candidato `5ff24ffd3`; refluxo com texto ampliado **em aberto** | **não** |


## Retificação: o que cada procedimento de zoom realmente provou

Candidato `56f0de259`. Duas coisas diferentes foram medidas e antes eu as tratei
como uma só.

### Procedimento A — redução da viewport CSS
Prova **reformatação/layout**. **Não é execução de zoom do navegador e não é
execução da técnica G142.** Resultado válido e mantido: nas rotas `/`,
`/servicos/` e `/entregas/`, com viewport CSS de 640 px e de 320 px, o
`scrollWidth` não excede o `clientWidth` — **0 px de rolagem horizontal da
página**, sem texto cortado e sem controle desaparecido.

### Procedimento B — zoom de página pelo Chrome, via CDP
`Emulation.setDeviceMetricsOverride` com `deviceScaleFactor`, que é o que o zoom
do navegador faz: mesma largura física, viewport CSS dividida pelo fator, cada
CSS px pintado maior.

**O que reproduz:** a redução da viewport CSS e a ampliação física do CSS px.
**O que não reproduz:** o menu visual do Chrome, o *font boosting* móvel e a
configuração de tamanho de texto do usuário.

| medida em `/servicos/` | base 1280 | zoom 200% | zoom 400% |
|---|---|---|---|
| viewport CSS | 1280 | 640 | 320 |
| `deviceScaleFactor` | 1 | 2 | 4 |
| corpo de texto (`main p`) | 14 px CSS | 14 px CSS | 14 px CSS |
| `h1` (`clamp()` com `vw`) | **64 px CSS** | **37,6 px CSS** | **37,6 px CSS** |
| rolagem horizontal | 0 | 0 | 0 |

### O achado que a ausência de overflow escondia

O corpo de texto mantém 14 px CSS e, com `deviceScaleFactor` 2, dobra de tamanho
físico: **1.4.4 atendido para o texto corrido**.

O `h1` **encolhe** de 64 px para 37,6 px CSS ao ampliar, porque o termo `vw` do
`clamp()` acompanha a viewport que o zoom estreitou. Em tamanho físico
equivalente à base: 37,6 × 2 = 75,2, ou seja **1,18×** — não 2×. Pelo mecanismo
só-texto (`font-size` da raiz a 200%) o mesmo `h1` chega a 1,59×. **Nenhum dos
dois mecanismos leva o título responsivo ao dobro do tamanho apresentado
inicialmente.**

**Estado: NÃO ATENDIDO** para os títulos com `clamp()`+`vw`. Não é limitação do
instrumento: é comportamento medido do produto. A correção é de CSS
compartilhado e cai na mesma trava de reaprovação editorial das outras duas
pendências. **Nenhuma alteração de CSS foi feita para satisfazer instrumento.**

### Sobre a reversão anterior

Ela não se justifica por “o primeiro teste era mais exigente”. O que se demonstra
é o comportamento do produto resultante: sob o mecanismo admitido, o candidato
`56f0de259` não tem rolagem horizontal a 200% nem a 400%. A regra de CSS
revertida continua fora, e a pendência real que resta é a do `clamp()` acima.

## Objetos exatos da verificação de integridade do script

A frase anterior — “módulo, script compilado e script exportado compartilham um
SHA-256” — era imprecisa e escondia uma distinção necessária. O que foi
comparado:

| objeto | papel | sha256 (16) |
|---|---|---|
| `js/modules/analytics.js` | entrada | `bf5a0898d4c5b142` |
| `js/modules/form.js` | entrada | `9747f5b6cd4a2f24` |
| `js/modules/nav.js` | entrada | `2ee8cb18b7493b36` |
| `js/modules/offer-fit.js` | entrada | `835c8913eebbc07c` |
| `script.js` | produto compilado | `3e6f199fde6a76b3` |
| `_site/script.js` | artefato exportado | `3e6f199fde6a76b3` |

Duas propriedades distintas, e só a segunda é uma igualdade de hash:

1. **Compilação reproduzível:** `node scripts/site/build_script_modules.mjs`
   responde `CHECK_OK`, isto é, recompilar os quatro módulos reproduz `script.js`
   byte a byte.
2. **Correspondência do exportado:** `script.js` e `_site/script.js` têm o mesmo
   sha256 — o arquivo distribuído é o produto validado.

Os módulos **têm conteúdo diferente do bundle** e portanto hashes diferentes,
como deve ser. Exigir hash igual entre fonte modular e bundle seria exigir a
coisa errada.

## Menu modal: cenários de `inert` registrados separadamente

`zero inert` só é o esperado quando esse era o estado inicial.

| cenário | inicial | com o painel aberto | após fechar | após ir a desktop |
|---|---|---|---|---|
| A, sem `inert` preexistente | 0 | 7 | **0** | **0** |
| B, com `inert` plantado no rodapé | 1 | 7 | **1** | **1** |

Em B o `inert` do rodapé **sobrevive** ao fechamento e à mudança de largura: o
menu remove somente o que ele próprio marcou. Nos dois cenários a CTA
`Solicitar proposta` fica alcançável dentro do diálogo, o nome acessível é
`Navegação móvel` e o foco volta ao botão após `Escape`.

## Sem JavaScript, no navegador

Contexto real com `javaScriptEnabled: false`, viewport 390×844: o botão do menu
fica **oculto**, os quatro destinos ficam **visíveis** com altura medida
(50, 50, 52 e 44 px) e **clicar navega de fato** — `/servicos-obras-publicas/`
respondeu com o título esperado. Não é só presença no HTML.

## Revisão adversarial do diff (2026-09-10, antes da integração)

Três frentes independentes (robots/aceite; superfície pública, formulário e
navegação; geradores, contratos e manifestos) revisaram o diff completo contra
`origin/main`, reproduzindo cada achado no código ou no navegador antes de
registrá-lo. Nenhuma correção foi feita por sintoma: cada uma tem causa, fonte
corrigida, regeneração pelo processo oficial e contraprova que reprova o
código anterior. Commit das correções: `e276a9fba`.

### Leads que o servidor rejeitava (422, nada persistido)

| onde | causa | correção | contraprova |
|---|---|---|---|
| `/entregas/`, cinco famílias "por proposta" | valores `SERVICO-*` desconhecidos do handler (e dois acima do limite de 16 do campo) | `SERV-*`; o handler os reconhece como **tipo de necessidade** com o mesmo valor da home e deriva a jornada dele, nunca do `operacao` oculto do formulário | `service_family_by_proposal_persisted` (5 famílias 201 e persistidas; id inexistente continua 422) |
| `/servicos-obras-publicas/`, "ainda não sei" | valor `UNKNOWN` rejeitado num select `required` | opção vazia (entrega nula = pedido genérico), select sem `required` | gerador `--check` e `test:lead-function` |
| quatro rotas B2G, contrato e prazo "(opcional)" | servidor exigia os dois | servidor aceita ausência; quando informados, seguem os formatos publicados (3+ caracteres; prazo válido e seguro) | `contract_product_optional_id_and_deadline_accepted`; `ab` e prazo passado continuam 422 |

### Reclassificação silenciosa da jornada

`data-set-journey="contrato"` no atalho de obras públicas preenchia a **primeira**
opção da jornada, "problema urgente em contrato", para quem só declarou obra
pública; `?jornada=outro` trocava "Outra necessidade" por "ainda não sei". A opção
neutra de cada jornada com mais de uma opção ganha `data-journey-default` e o
script a prefere. Contraprovas: estrutural
(`test_stage_options_sharing_a_journey_declare_one_neutral_default`) e no
navegador (`journey_default_stage_is_neutral`). O hash do bloco do formulário foi
atualizado por revisão explícita: a única mudança é esse atributo em três opções;
campos, consentimento, validação, envio e instrumentação não mudaram.

### Menu móvel

Com o painel aberto o botão fica inerte e o toque chega ao ancestral; o menu
fechava com o foco no `<body>`. Passa a devolver o foco ao botão
(`mobile_menu_toggle_tap_returns_focus`). `script.js` recompilado e recapturado
(`35a8b63f4`).

### Motor RFC 9309 e fontes de autorização

- `$` só ancora no fim da regra (no meio é literal); especificidade pela regra
  **normalizada** (`/%6Fps/` empata com `/ops/` e o empate favorece o Allow);
  estrofes adjacentes do `_headers` não herdam o caminho anterior; origem exata
  de 410 (`/ia`) não autoriza perder restrição sobre `/iainterna/`.
- O canary do hub lia a linha do **slug filho**, sempre presente: o ramo "hub
  fechado" nunca executava. Passa a linha exata do hub, com cinco cenários.
- `npm run test:robots-policy` saía verde com o módulo inteiro pulado sem pacote;
  `ROBOTS_PACKAGE_REQUIRED=1` reprova.
- A docstring do gerador afirmava "keep the rest of the family Disallow", o que o
  arquivo emitido nunca fez; passa a dizer a verdade: com o hub liberado os
  filhos são rastreáveis de propósito (para que o 410 seja visto) e o fechamento
  da família é o `X-Robots-Tag: noindex`.

### Gates que tinham ficado mais fracos

`Configurar` sai do verbo de próximo estado (sete dos oito rótulos revogados
voltavam a passar); a contagem de âncoras nomeadas da triagem volta; o conceito
de confiança da primeira dobra casa por palavra inteira (`art` não é `partes`);
o rótulo do esquema ilustrativo sobe a 12,8 px; a nota do H1 de `/entregas/`
volta a ser estilizada.

### Verificado e limpo

Re-pin do catálogo (só a redação de `CFG-D01`), geradores em `--check`, `%0A` no
`mailto`, `proof.json` (uma frase permitida acrescentada), breadcrumb B2G,
primeira dobra remedida (`876f8dd4f`, 25/25).

## Auditoria ultracode do conjunto de correções (2026-09-10)

Sete dimensões independentes revisaram `git diff origin/main..HEAD` em 8753cba2d
(contrato de leads e formulários; navegação e jornada; motor RFC 9309 e aceite;
integridade dos testes e do executor; coerência fonte → saída → manifestos;
texto público e acessibilidade; eventos de analytics), com **34 candidatos**.
Os 14 melhor classificados passaram por **três lentes adversariais**
(correção, reprodução independente, impacto); um achado só sobreviveu com no
máximo uma refutação. Resultado: **5 confirmados, 9 refutados**, mais 1 achado
do crítico de completude em área que nenhuma dimensão cobria. Commit das
correções: `83ca3543f`.

| confirmado | causa | correção | contraprova |
|---|---|---|---|
| `/entregas/`: famílias "por proposta" confirmavam em `/obrigado-operacao` e informavam `journey=operacao` ao analytics enquanto o servidor gravava `outro` | as opções `SERV-*` não declaravam jornada; o formulário mantinha o `operacao` oculto | opções declaram `data-journey`; o formulário segue a opção escolhida (jornada oculta e destino) e volta ao padrão para entregas do catálogo | `entregas_deliverable_option_drives_journey` (navegador) |
| hub B2G: "ainda não sei qual entrega" descartava evento e estágio publicados como obrigatórios | qualificação contratual só abria por entrega `CFG-D17..23` | abre também por evento/estágio; validado e persistido; evento inválido segue 422 | `hub_unknown_deliverable_keeps_contract_fields` |
| Warmbly recebia a família de serviço com menos sinal que uma entrega do catálogo | contexto do próximo passo só carregava `entrega=CFG-D..` | `família de serviço=…` no contexto quando não há entrega do registro | `handoff_service_family_context` |
| um `Allow` injetado sob superfície privada dentro do bloco gerenciado passava pelos dois gates | a amostra de 234 caminhos não cobria regras injetadas em qualquer grupo | toda regra `Allow` que desce a uma superfície privada reprova (`robots_private_surface_allow_injected`) e um filho sentinela por superfície é sondado para todos os agentes; `Allow: /` amplo continua legítimo | `test_an_allow_injected_inside_the_managed_block_fails_closed` (três injeções, um grupo novo) |
| nenhum gate provava que o fundo fica inerte com o diálogo aberto | — | o teste exige zero focáveis alcançáveis fora do painel e que abrir por Enter não feche no mesmo evento | `mobile_menu_toggle_tap_returns_focus` |
| (crítico) `/casos/`: CTA fixo com texto visível "Configurar pedido" e nome acessível "Pedir … pelo WhatsApp" | rótulo no nome (WCAG 2.5.3) rompido pela troca do verbo | texto visível "Pedir análise + preço", nome acessível começa por ele; gerador das oito ofertas | `test_cta_form_next_state` |

Também aplicado a partir dos candidatos não verificados: o CI passa a exigir o
pacote nos dois módulos de robots (`ROBOTS_PACKAGE_REQUIRED=1`), para que um
módulo pulado nunca saia verde. Verificado e descartado: o bloco do esquema em
`/entregas/` não tem `div` aninhado (a extração não trunca).

Refutados pela verificação, sem alteração: triplicação do conjunto `SERV-*`
(há gate ligando geração e servidor), dupla contagem de `lead_persisted`,
discriminador de idempotência, mensagem do prazo, rebaixamento por
`data-set-journey`, X sintético no iOS, foco em outros fechamentos, prefixo de
estrofe pai no `_headers`, conjunto de linhas da linha de base.

Riscos que a auditoria declara **não verificáveis antes da promoção** e que o
aceite pós-deploy cobre: fechamento da família de análises só por
`X-Robots-Tag` no host servido; caminho de 503 do armazenamento em produção;
identidade do artefato servido (`build-info`/`runtime-info` = SHA de `main`).

### Retificação: o botão do menu deixa de ficar inerte

A tabela de cenários de `inert` acima contava **7** elementos inertes com o
painel aberto porque o próprio botão do menu estava entre eles. Isso o tornava
um controle visível que nenhuma tecnologia assistiva alcançava, e o toque nele
chegava ao ancestral e fechava o menu com o foco perdido no `<body>` (achado da
revisão adversarial). A correção na causa retira o botão da lista: ele é o
controle do próprio diálogo (mostra o X, `aria-expanded`, `aria-controls`) e
trata o próprio clique, mantendo o foco. Com o painel aberto ficam **6**
elementos inertes; o gate exige que nada focável fora do diálogo, exceto esse
controle, permaneça alcançável, e que abrir por Enter não feche no mesmo evento.
A tentativa intermediária de manter o botão inerte e recuperar o foco pela
geometria do clique foi descartada também por custo: estourava o orçamento de
bytes da home (153.600) em 89 bytes, e o limite não foi elevado.

### Retificação: opção neutra primeiro, e a jornada de `/entregas/` fora do bundle da home

O orçamento Lighthouse da home (153.600 bytes) conta bytes **comprimidos**, e o
código de preferência pela opção neutra mais o bloco de `/entregas/` no bundle
global o estouravam em 42 a 109 bytes. Em vez de elevar o limite, as duas causas
foram resolvidas na origem: (1) a opção neutra de cada jornada partilhada passa a
vir **primeiro no HTML** ("Contrato em execução" antes de "Problema urgente em
contrato"), e o preenchimento automático continua a escolher a primeira, sem
marcador `data-journey-default` nem código extra; para `?jornada=outro` a primeira
é a orientação ("Ainda não sei qual serviço preciso"); (2) a sincronização da
jornada com a entrega escolhida em `/entregas/` vive num script **local àquela
página**, emitido pelo gerador do catálogo com hash de CSP calculado no build,
para que a home não pague por lógica que não usa. `script.js`: 77.258 → 76.580
bytes. Contraprovas mantidas: `test_stage_options_sharing_a_journey_list_the_neutral_one_first`,
`journey_default_stage_is_neutral`, `entregas_deliverable_option_drives_journey`.

## Release 9c13caf0e: promoção, reprovação do aceite de runtime e correção estrutural

Run [34501989732](https://github.com/tjsasakifln/web-cfg/actions/runs/34501989732):
gates, pacote, stage e **promoção** ok; 518/518 HTML servidos com digest exato;
263/263 verificações não HTML; 78/78 sondas de contrato. O passo seguinte,
Lighthouse **sobre o domínio público** (introduzido em `1a571debd`, 09/09 13:31,
depois do último release bem-sucedido e nunca executado até então), reprovou a
home e o rollback automático restaurou `54b51438a`.

| medida da home | laboratório (`site-ci`) | borda (`netcup-release`) | orçamento |
|---|---|---|---|
| `total-byte-weight` (transferência, com cabeçalhos) | 153.642 | 201.033 / 201.032 / 201.022 | 153.600 |
| conteúdo comprimido (corpos) | 151.420 | 150.271 (release anterior, mesma composição) | 153.600 |
| cabeçalhos por resposta | ~200 B | ~5.900 B (CSP de 5,3 KB em todo asset + NEL/Report-To) | — |
| LCP simulado | 1.803–1.955 ms | 2.264–2.562 ms | 2.000 ms |
| TTFB observado do documento | ~2 ms | ~456 ms (runner nos EUA → borda → origem) | — |
| requisições de terceiros | 0 | 0 | — |

Diagnóstico independente do LCP: elemento `p.hero-deliverable` (texto) nos dois
ambientes; caminho crítico = documento → três CSS bloqueantes (`styles.css` →
`styles-tokens.css` encadeado por `@import`, e `home-10x.css`); fonte com
`font-display: swap` (fora do caminho crítico); sem terceiros. A diferença
laboratório→borda decompõe-se em latência observada do documento (~430 ms de
servidor + TLS de 150 ms simulado) e ~25 KB de cabeçalhos nos recursos
bloqueantes. O encadeamento do `@import` e o CSS global com 84% não usado na
home são ganhos reais disponíveis, mas alteram folhas compartilhadas cobertas
pelo hash de aprovação editorial da análise publicada (reaprovação humana),
então ficam registrados como pendência e não entram aqui.

### Correção estrutural (branch `release/cabecalhos-documento-orcamento-conteudo`)

1. **Contrato nginx:** CSP, X-Frame-Options, Permissions-Policy e
   Referrer-Policy só em respostas `text/html` (mapa por
   `$sent_http_content_type`); tudo o mais inalterado e byte-idêntico nos
   documentos. Cabeçalhos da home através do nginx canônico: 47.179 → 9.162
   bytes; máximo em não documento 5.908 → 477. Gate E2E reprova qualquer
   não documento do conjunto crítico com mais de 1 KiB de cabeçalhos.
2. **Semântica do orçamento:** o gate local e o aceite de runtime passam a
   medir **conteúdo** (corpos comprimidos, no fio) pelo mesmo módulo
   (`scripts/site/lighthouse_payload.mjs`); cabeçalhos viram evidência
   (`header_byte_weight`). Sem medição de conteúdo, reprova fechado.
3. **LCP:** o orçamento de 2.000 ms fica; em modo runtime a linha registra a
   folga de rede **medida** na própria execução (latência observada do
   documento menos um RTT, mais um RTT de TLS) como `lcp_network_allowance_ms`.
   No laboratório a folga é zero. Nenhum limiar foi alterado: os dois números
   passaram a ser declarados em `design-system.json` com tetos em código
   (`CONTENT_BYTES_CAP`, `LCP_MS_CAP`) e justificativa obrigatória.
4. **Regressões:** CSP em asset (unitário + E2E); divergência semântica
   (mesmo módulo nos dois modos + testes de `lighthouse_payload`); artefato
   verde no laboratório mas inviável no nginx canônico (gate de cabeçalhos no
   E2E sobre o conjunto crítico da home); afrouxamento sem justificativa
   (tetos em código e notas obrigatórias na declaração); paridade Netlify/nginx
   ciente da regra de documento.
