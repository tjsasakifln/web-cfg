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
