# Fechamento da campanha SST Conversion Correction 2.0

Data de execução: 26/09/2026
Data de encerramento: 27/09/2026

Repositório: `web-cfg`

Estado inicial: produção em `f337d010f588872923253a592f0949caf2478b40`
Branch de execução: `campaign/sst-conversion-correction-20260926`

Este documento é o registro de fechamento exigido pela campanha. Os campos de deploy e produção serão atualizados com o SHA efetivamente publicado antes do encerramento.

## 1. Estado inicial

A inspeção começou pelo repositório e pela produção, ambos no SHA `f337d010f588872923253a592f0949caf2478b40`. A URL existente `/seguranca-trabalho-apoio-tecnico/` já tinha autoridade interna, canonical próprio e conteúdo tecnicamente prudente, por isso foi preservada.

Problemas encontrados:

- a oferta central começava por diagnóstico, limites e encaminhamento, sem deixar evidente que a CONFENGE executaria a parcela documental contratada;
- a dor aparecia como necessidade de um documento, não como carga operacional que RH, engenharia, administrativo ou SESMT quer transferir;
- visita e campo apareciam de forma capaz de enfraquecer a promessa remota;
- uma única página concentrava elaboração de PGR, revisão, obras, terceirização e assistência em disputa;
- home e serviços não contavam a mesma história de oferta documental já sustentada pela dupla formação existente no perfil e em confiança;
- o formulário geral identificava a jornada SST, mas não subclassificava a necessidade documental;
- não existiam eventos próprios para a vertical;
- fontes comerciais legadas ainda descreviam diagnóstico e trabalho de campo de forma incompatível com a nova oferta;
- as novas rotas inicialmente não estavam na allowlist do artefato público, uma falha encontrada e corrigida pelo build antes da publicação.

Evidência visual do estado inicial: [`evidence/before/manifest.json`](evidence/before/manifest.json), com home, hub SST, serviços, perfil e confiança em 390 px e 1440 px.

## 2. URLs

### Preservada e transformada

- `/seguranca-trabalho-apoio-tecnico/`: continua sendo a URL canônica da vertical e passou a funcionar como hub comercial de documentação remota.

### Criadas

- `/elaboracao-pgr/`
- `/revisao-atualizacao-pgr/`
- `/pgr-documentacao-sst-obras/`
- `/terceirizacao-documentacao-sst/`

### Alteradas por coerência

- `/`: entrada SST orientada à dor operacional, quatro caminhos BOFU e pergunta condicional no formulário;
- `/servicos/`: oferta e JSON-LD atualizados para documentação de SST;
- `/triagem-tecnica/`: caminho documental remoto separado de disputa;
- `/entregas/`: entrega SST alinhada ao portfólio remoto;
- `/especialista/tiago-jun-sasaki/`: contexto, ligação e CTA SST acrescentados à formação dupla já publicada;
- `/confianca/`: título profissional tornado explícito na prosa, oferta documental remota e limites coerentes;
- `/conteudos/`, `/casos/` e `/404.html`: entradas legadas corrigidas;
- navegação e rodapés das cinco rotas SST: CTAs específicos e contexto analítico.

### Redirects

Nenhum redirect novo. O slug existente foi preservado; não houve remoção de URL pública nem cadeia de redirecionamento.

## 3. Intenção, keyword, valor e CTA

| URL | Intenção e keyword principal | Proposta de valor final | CTA principal |
| --- | --- | --- | --- |
| `/seguranca-trabalho-apoio-tecnico/` | documentação de Segurança do Trabalho remota | A empresa envia o contexto; a CONFENGE delimita, elabora ou revisa o escopo documental contratado e entrega os arquivos digitalmente | Resolver minha documentação de SST |
| `/elaboracao-pgr/` | elaboração de PGR | RH deixa de coordenar estrutura, versões e consolidação; recebe PGR elaborado, Inventário de Riscos e Plano de Ação | Solicitar elaboração do PGR |
| `/revisao-atualizacao-pgr/` | revisão e atualização de PGR | O PGR existente é confrontado com as informações atuais e a versão contratada é corrigida ou atualizada | Enviar meu PGR para revisão |
| `/pgr-documentacao-sst-obras/` | PGR NR-18 e documentação de SST para obras | A documentação acompanha etapas e métodos informados sem vender inspeção ou medição de campo | Organizar a documentação da obra |
| `/terceirizacao-documentacao-sst/` | terceirização da documentação de SST | A CONFENGE atua como capacidade técnica externa para absorver demanda documental recorrente ou represada | Passar essa frente para a CONFENGE |

Todos os títulos, H1, descriptions, canonicals, breadcrumbs, Open Graph e dados estruturados são próprios. A pesquisa e a decisão contra canibalização estão em [`research-log.md`](research-log.md).

## 4. Oferta e limites

A autoridade comercial é `data/commercial/sst-remote-portfolio.v1.json`, contrato `CONFENGE_SST_REMOTE_PORTFOLIO/1.0.0`.

O portfólio está separado em:

- `REMOTO_COMERCIALIZAVEL`: PGR, Inventário de Riscos, Plano de Ação, revisão de PGR, ordens de serviço, procedimentos, APR, permissões e matrizes documentais quando os elementos fornecidos sustentam tecnicamente a entrega;
- `REMOTO_CONDICIONAL`: documentos cuja emissão depende de dados, registros, medições ou evidências técnicas existentes e suficientes;
- `NAO_OFERTAR_NESTA_VERTICAL`: visita, vistoria, inspeção física, novas medições de ruído, calor, vibração ou agentes químicos, inspeções presenciais, treinamento presencial, ASO, PCMSO, exames e demais atos médicos.

Preço e prazo não foram inventados. ART aparece somente quando aplicável. Nota fiscal e entrega digital fazem parte da proposta comercial. Se faltar evidência material, o item é identificado antes da contratação e fica fora do escopo remoto.

## 5. Confiança e consistência

A dupla formação já constava no perfil e em confiança. A campanha passou a usá-la de forma consistente e comercialmente pertinente na home, no hub SST, nas quatro BOFU, em serviços, entregas e triagem; no perfil acrescentou contexto, link e CTA SST, e em confiança tornou o título explícito na prosa e vinculou a credencial à oferta documental remota. Os dados estruturados relevantes foram mantidos ou alinhados à mesma narrativa.

Nenhum número de registro, instituição adicional, data, certificação, atribuição ou experiência foi inventado. A combinação das duas formações foi usada especialmente na rota de obras.

## 6. Menções públicas a IA

O gate público percorreu 235 HTMLs e não encontrou menção visível a ferramenta de IA, “Uso de IA” ou equivalentes proibidos. Evidências internas de governança foram preservadas.

## 7. Litígio trabalhista

Assistência em disputa não aparece no hero, na proposta central ou nos CTAs de documentação empresarial. O assunto permanece somente como caminho secundário, ligado à triagem de perícia e avaliação quando contextual.

## 8. Home, formulário e canais

A home agora apresenta o título “Quero terceirizar a documentação de SST” e explica que, quando a equipe não consegue mais administrar essa frente, a CONFENGE terceiriza remotamente a documentação; a entrada liga o visitante ao hub e às quatro compras específicas.

O formulário geral permanece leve. Quando SST é selecionado, mostra somente estas opções finitas:

- elaborar PGR;
- revisar ou atualizar PGR;
- documentação de SST para obra;
- terceirizar ou organizar documentação;
- exigência específica;
- não sei o que preciso;
- outro.

Não há upload. O primeiro contato pede contexto e combina depois um canal adequado para documentos. WhatsApp, e-mail e formulário carregam origem e tema sem enviar nome, e-mail, telefone, mensagem ou conteúdo documental para analytics.

## 9. Links internos e descoberta

- home e serviços levam ao hub e às ofertas pertinentes;
- hub distribui as quatro intenções BOFU;
- cada BOFU retorna ao hub; links cruzados entre ofertas, perfil e confiança aparecem apenas quando pertinentes;
- perfil e confiança confirmam a credencial e apontam para SST;
- obras recebe caminho próprio;
- sitemap XML e TXT listam as cinco rotas;
- `data/site/public-ia-map.json`, `data/organic/public-family-registry.json` e `scripts/site/hub_link_matrix.json` foram reconciliados;
- a allowlist `scripts/pseo/public_artifact.py` empacota as cinco rotas no `_site`.

## 10. Analytics

Eventos implementados e registrados no contrato público:

- `sst_page_view`
- `sst_cta_click`
- `sst_whatsapp_click`
- `sst_form_start`
- `sst_form_submit`
- `pgr_cta`
- `pgr_review_cta`
- `sst_obra_cta`
- `sst_outsourcing_cta`

O resolvedor usa somente as cinco famílias finitas. O bundle entregue (`script.js`) é exercitado comportamentalmente, incluindo os quatro eventos BOFU e o WhatsApp principal do hub. Mutação do resolvedor reprova o gate. Nenhum campo livre ou PII entra nesses eventos.

## 11. Testes e build

Resultados já confirmados nesta revisão:

- campanha SST, cross-site, analytics e legado: 26/26;
- contrato regulatório/comercial INB14: 119/119;
- catálogo multivertical: 1481/1481;
- consistência de contratos comerciais: 521/521;
- verdade da oferta pública: 132/132;
- IA pública: 235 HTMLs, zero ocorrência;
- integridade HTML: 237 páginas, zero falha;
- SEO: 235 páginas, 100 indexáveis, zero erro e zero warning;
- grafo de sitemap: 29/29;
- contratos de home e IA pública: 43/43;
- matriz responsiva: 192 renderizações, 12 rotas e 16 larguras entre 320 e 1920 px;
- auditoria dinâmica SST: 12 combinações de rota e viewport, zero violação axe WCAG A/AA, zero overflow e zero `pageerror`;
- eventos genéricos: 41 cenários;
- WhatsApp: 52 links encontrados, zero warning;
- shell, navegação, JSON-LD e módulos do bundle: sincronizados;
- build final (`npm run build:site`): **PASS**; artefato público com 568 arquivos, zero finding, SEO sem erro e paridade visível 100/100.
- validação final em Ubuntu no merge: pSEO, CodeQL, site-ci, required execution evidence e os nove jobs do workflow de release concluíram com sucesso; Lighthouse terminou em `MEASURED_PASS`.

A tentativa do agregador `npm test` no checkout Windows avançou pelos gates iniciais e foi interrompida no `pseo:test` por duas integrações com o repositório vizinho `extra-cli`, cujo `os.fsync` retorna `Bad file descriptor` nesse ambiente. A terceira falha observada, separador de caminho no censo público, foi corrigida e o caso Turnstile passou isoladamente. O repositório vizinho, já com mudanças alheias, não foi alterado; os checks obrigatórios do PR e a cadeia de release em Ubuntu concluíram com sucesso e são a autoridade integral da suíte.

Correções de infraestrutura encontradas pelos gates:

- normalização de separador de caminho no catálogo e no teste de autoridade para Windows/Linux;
- caminhos relativos do censo público normalizados para `/` em Windows e Linux;
- hash de exceções históricas normalizado para LF, preservando o fail-closed contra alterações materiais em checkouts com CRLF;
- preservação de CRLF/LF pelo renderizador do contrato de formulário;
- teste do passo 1 preparado para `fieldset` semântico aninhado;
- stubs do teste pSEO atualizados para elementos DOM usados pela seleção SST;
- quatro novas rotas incluídas no artefato público;
- hash da autoridade BOFU tornado estável entre LF e CRLF, com teste de regressão 34/34;
- expectativa do teste de lead atualizada para a jornada `sst` persistida por `SERV-SST`;
- remoção de `script` e `style` nos testes de cópia visível endurecida para aceitar espaço válido no fechamento da tag, com regressão dedicada;
- CTA terminal de WhatsApp restaurado dentro do conteúdo principal do perfil e validado pelo gate inbound;
- smoke CI do `_site` ampliado para exigir HTTP 200 das cinco rotas SST.

## 12. Evidência visual

- antes: [`evidence/before/manifest.json`](evidence/before/manifest.json), 10 capturas da produção inicial;
- depois: [`evidence/after/manifest.json`](evidence/after/manifest.json), 44 capturas locais em 390x844, 430x932, 768x1024 e 1440x1000;
- inspeção automatizada e humana: primeira dobra, hierarquia, CTA, overflow, foco por teclado e axe.

## 13. Deploy e produção

- PR: [#725](https://github.com/tjsasakifln/web-cfg/pull/725), mesclado em 27/09/2026.
- SHA mesclado e publicado: `2d7faa236a4b2c281290c7556251bf191fcc7236`.
- workflow de release: [netcup-release 36295127064](https://github.com/tjsasakifln/web-cfg/actions/runs/36295127064), concluído com sucesso nos nove jobs; promoção atômica em 27/09/2026 às 05:24:58 UTC, sem rollback.
- identidade servida: `/.well-known/build-info.json` e `/.well-known/runtime-info.json` confirmam o SHA publicado; hash do artefato `68d4ccd23eeb299afccca4f2e2610930b4ada15bef0cd9d850eafd418e4241ba` e bundle de release `d8b846b6e68ad127c258dbe39da57831e0948e52dec161d9416b4bc286a96971`.
- aceitação pós-promoção: `/healthz` e `/ready` responderam 200; 537/537 HTMLs servidos foram reconciliados com o digest do artefato, sem erro; runtime acceptance passou em modo `official_live_lighthouse`; evidência pós-promoção no artefato `10924790679` do workflow.
- validação direta: home, hub SST, quatro BOFU, perfil, confiança, serviços, entregas e triagem responderam 200 com canonical exato; a 404 personalizada respondeu 404; o sitemap lista as cinco rotas SST.
- validação de conversão e mobile: nas cinco rotas SST, 390x844 e 1440x1000 apresentaram CTA principal visível, WhatsApp contextual, footer, zero overflow e zero `pageerror`. No hub, o clique principal emitiu `sst_cta_click`; nas quatro BOFU, emitiu também o evento específico de cada oferta. Na home 390x844, selecionar SST revelou as sete opções finitas, sem `inert` ou `aria-hidden`, persistiu a jornada `sst` e emitiu `sst_form_start`.
- buscas pós-deploy em 27/09/2026: as consultas `site:confenge.com.br segurança do trabalho`, `site:confenge.com.br PGR`, `site:confenge.com.br "Uso de IA"`, `site:confenge.com.br "Engenheiro de Segurança do Trabalho"` e as quatro URLs BOFU ainda refletiam crawls anteriores. O índice mostrava títulos ou copy anteriores da home, do hub e do perfil e ainda não mostrava as novas BOFU. Resultados em cache com “Uso de IA” ainda exibiam trechos históricos de superfícies de governança ou análises editoriais; a leitura direta dessas URLs e das superfícies comerciais SST publicadas confirmou zero ocorrência visível no conteúdo atualmente servido. Isso é atraso de recrawl, não conteúdo antigo ainda servido.

## 14. Lacunas restantes

Não há lacuna funcional ou de publicação conhecida. Resta somente observar a propagação do índice do buscador e registrar quando títulos, snippets e as quatro novas BOFU forem recrawleados. Até lá, resultados em cache devem continuar separados do conteúdo efetivamente servido, cuja identidade e conteúdo já foram validados no SHA publicado.
