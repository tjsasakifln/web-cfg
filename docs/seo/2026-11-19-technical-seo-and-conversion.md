# SEO técnico e passagem das ferramentas para serviços

## Objetivo e decisão

Decisão do fundador em 19/11/2026: `EXECUTE_NOW`, frente `INBOUND_ENGINE`.
O pedido autoriza revisão adversarial, implementação, PR, integração após
validação e acompanhamento da publicação Netcup. Efeitos esperados:
distribuição, confiança e receita. A primeira evidência é técnica, na release;
o efeito comercial depende de uso e de oportunidades efetivamente recebidas.

O visitante quer resolver uma tarefa de engenharia e, quando precisa de apoio,
identificar o serviço correspondente sem explicar novamente de onde veio.
A hipótese é que uma passagem específica do cálculo/modelo para o serviço
aumente contatos pertinentes. Clique, pedido recebido, proposta, contrato e
recebimento permanecem eventos diferentes.

Base examinada: `44b3897167febcc61bcfb0dadf1147d8c2f75b31`.
As melhorias recentes de ferramentas, créditos, notícias e SEO são preservadas.
Não há congelamento de funcionalidades nem migração de URLs nesta alteração.

## Revisão do esboço recebido

| Proposição | Constatação e decisão |
| --- | --- |
| Implantar infraestrutura SEO no Netlify | A produção é Cloudflare com origem nginx/Node na Netcup. O fluxo canônico existente continua responsável pelo build, promoção, conferência pública e rollback. |
| Criar índice e sitemaps separados | Já há `sitemap-index.xml`, mapas por família e um mapa próprio do runtime de notícias. Preservar suas fontes e os validadores de URLs canônicas/indexáveis. |
| Bloquear UTM para consolidar URLs | Não aplicar. O Google precisa rastrear para ler canonical e noindex. As URLs canônicas existentes continuam sem parâmetros de campanha. |
| Impor 50 a 60 caracteres no título e 140 a 155 na descrição | Não são limites oficiais de indexação. O gate exige conteúdo presente, único e coerente; não rejeita uma página útil apenas por essas faixas. |
| Recriar entidades de empresa e autor | O registro de credenciais e o saneamento de identidade já controlam fonte, revogação e superfícies permitidas. Reutilizar esse sistema. |
| Garantir resultados enriquecidos de FAQ e Service | FAQ deixou de ser exibido pelo Google em 07/05/2026. Service não é um recurso autônomo da galeria. Perguntas úteis e semântica válida não garantem apresentação especial na busca. |
| Usar EngineeringApplication | Não consta das categorias documentadas pelo Google. Oito utilitários passam a UtilitiesApplication, coerente com sua função. Não acrescentar avaliações ou notas fictícias. |
| Criar novas árvores de ferramentas, soluções e projetos | As páginas existentes já têm catálogo, serviços, projetos, links e registro de intenção. Fortalecer os caminhos úteis sem criar páginas intercambiáveis ou mudar URLs para cumprir um modelo. |
| Garantir LCP menor que 1,8 s e CLS zero no build | Preservar a matriz Lighthouse e seus limites existentes. Experiência real exige dados de campo, incluindo INP; o build não garante Core Web Vitals. |
| Gerar lead ao clicar no contato | Preservar a separação entre navegação, clique de contato e lead persistido. Não criar uma segunda coleta comercial nem transportar dados pessoais em analytics. |

## Alterações implementadas

### Metadados conferidos no HTML final

O validador passa a analisar o `head` efetivo em vez de aceitar a primeira
ocorrência por expressão regular. Detecta ausência, vazio ou duplicidade de
título, descrição e canonical, URL canônica divergente, atributos ambíguos e
duplicidade de robots ou metadados de compartilhamento. Comentários, templates,
strings de JavaScript e texto semelhante a tags dentro do título não satisfazem
a verificação. Duplicidades entre páginas consideram entidades HTML, espaços e
caixa.

O build executa o mesmo censo em todo HTML montado. As regras de noindex e os
status de retirada continuam sendo respeitados; o validador não muda a política
de indexação. A projeção editorial permanece restrita às rotas declaradas.

Seis páginas existentes passam a receber a projeção completa de Open Graph e
Twitter a partir de seus próprios títulos, descrições e canonicals:
`/triagem-tecnica/`, `/radar/nacional-obras-publicas/`, `/privacidade/`,
`/comercial/privacidade-leads/`, `/comercial/termos-diagnostico-b2g/` e `/nurture/`.
O conteúdo visível, preços, autoria e datas dessas seis páginas são preservados.

### Próximo passo específico em oito ferramentas

| Ferramenta | Serviço existente vinculado |
| --- | --- |
| Memorial de cálculo | Revisão técnica de projetos |
| Propriedades de seções | Projetos estruturais |
| Seção de concreto armado | Projeto estrutural de concreto armado |
| Treliças e pórticos | Projetos estruturais |
| CPT e estacas | Projetos de estruturas e fundações |
| Conforto térmico | Projetos de instalações |
| Energia solar fotovoltaica | Projeto elétrico |
| Modelador paramétrico 3D | Coordenação multidisciplinar |

Sete páginas substituem o bloco genérico existente. O modelador recebe uma
passagem equivalente. Os links são HTML navegável com destino canônico e os
botões utilizam a triagem atual. Não mudam cálculo, processamento, exportações,
preços, licença nem responsabilidade pelo serviço.

O formulário recebe a necessidade atual e conserva a primeira origem da sessão.
Os contatos declaram a jornada de projeto para substituir uma seleção anterior
incompatível, como perícia. Os canais diretos da triagem mantêm suas mensagens
atuais; não se afirma que WhatsApp e e-mail recebem automaticamente esse tema.

As oito revisões de conteúdo têm data atualizada no registro do catálogo,
metadados, nota visível e sitemap. A correção somente semântica da categoria
da viga contínua preserva sua data anterior.

### Medição e integridade

`/cad/` e `/bim/` passam a ser origens da família `tool` no registro do servidor
e no cliente. As transições para os serviços usam `content_to_service` existente;
a navegação entre ferramentas não é contada como contratação nem lead.
Não há novo transporte, evento, identificador pessoal ou URL com texto livre.

O verificador do catálogo confere categorias de aplicações em JSON-LD real,
incluindo listas e grafos. Categoria ausente, recomendada mas não obrigatória
pelo Google, não provoca invenção de preço ou avaliação. A verificação não
declara elegibilidade a resultado enriquecido.

A revisão de componentes do CSS do diagnóstico foi repetida após a adição dos
dois prefixos em analytics. Nenhum componente, seletor, import ou regra de CSS
foi acrescentado. Os dois hashes de fonte derivados foram atualizados; as 266
exclusões e os bytes da folha projetada permanecem iguais.

## Validação e publicação

Antes da integração, executar os testes de metadados, categorias, atribuição,
analytics, catálogo e build, além dos workflows obrigatórios da PR. O navegador
da CI confere o artefato e as jornadas existentes. Uma medição local não substitui
a aceitação pública da release.

O aceite de produção exige o SHA integrado em `/.well-known/build-info.json`,
runtime correspondente, conclusão do workflow Netcup e conferência de páginas,
sitemap e comportamento público. O fluxo existente também prova persistência de
captação sintética sem envio comercial. Não declarar submissão ao Search Console
ou resultado comercial sem recibo próprio.

Uma combinação de HTTP, www e caminho sem barra pode exigir mais de um salto.
Esta alteração não promete eliminar toda cadeia de variantes. O vhost externo
tem provisionamento próprio; editar um modelo local não comprovaria sua instalação.

## Responsabilidade, medição e recuperação

Aplicam-se ADR-STRAT-002, ADR-STRAT-004 e RUNTIME-AUTHORITY, sem mudança de
fronteira. `web-cfg` mantém páginas e aquisição; `extra-cli`, fatos públicos e
proveniência; Warmbly, ação comercial e resultados. O destino comercial existente
recebe a origem `CONFENGE_WEB`.

Comparar, por ferramenta e serviço, entradas orgânicas, passagens para serviços,
abertura de contato e pedidos realmente persistidos. Examinar oportunidades e
recebimentos no sistema comercial, sem atribuir causalidade a uma simples alta
de cliques. Repetir essa estrutura em cem ferramentas reaproveita os mesmos
contratos e validadores, sem criar cem funis independentes.

Recuperação: reverter a PR completa e publicar pelo fluxo Netcup existente.
Não há migração de dados ou alteração de armazenamento persistente. A publicação
preserva a recuperação automática da release anterior.

## Referências primárias consultadas em 19/11/2026

- [Canonical e URLs duplicadas](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Atualizações da documentação, retirada de FAQ em maio de 2026](https://developers.google.com/search/updates)
- [Categorias e requisitos de SoftwareApplication](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- [Títulos na busca](https://developers.google.com/search/docs/appearance/title-link)
- [Descrições na busca](https://developers.google.com/search/docs/appearance/snippet)
- [Core Web Vitals e medidas de campo](https://web.dev/articles/vitals)
- [Links rastreáveis](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- [Conteúdo útil, autoria e finalidade](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

## Recaptura do contrato de integridade em 19/11/2026

A CI da PR #852 detectou que o manifesto BOFU ainda atestava o bundle anterior,
em `runtime/test/contract-news-analytics.test.mjs`. A recaptura registra os bytes
das alterações já autorizadas neste pedido, mantendo o teste e seus controles.
Não representa nova aprovação técnica ou revisão humana.

Fonte recapturada: `fc9a5725fc77367216b7e52e19d3f3b96a537023`, árvore
`91dbece4a763d27459b7d83abaf3eb327033d007`. A comparação usa a main integrada
`599870348a00ed09d13c123d00c45ef9b45f1f0c`, após a PR #851. O produtor existente
`docs/campaigns/design-institucional/expansao/tools/recapture_chain.py` extraiu o
commit com `committed_snapshot`; `step_frozen`, `materialize` e
`frozen_recapture_provenance` foram executados nessa cópia isolada. Somente
`data/bofu-dominance/frozen-specs/hashes.json` foi transferido ao checkout.
Os demais artefatos produzidos na cópia não substituíram seus registros atuais.

Foram conferidos os 17 caminhos protegidos. O delta é restrito a três:

- `js/modules/analytics.js`: duas entradas, `/cad/` e `/bim/`, classificadas como
  ferramentas. Removidas apenas essas entradas, os bytes coincidem com a base.
- `script.js`: os mesmos dois prefixos acrescentam 30 bytes ao bundle minificado.
  Sua remoção reproduz integralmente o bundle da base.
- `sitemap.xml`: somente oito `lastmod` passam de `2026-11-11` a `2026-11-19`,
  correspondendo às oito ferramentas revisadas nesta PR. URLs, ordem e demais
  bytes permanecem iguais.

Os outros 14 caminhos protegidos, incluindo os seis pilares comerciais, são
idênticos à base. O manifesto conserva integralmente as 58 entradas históricas e
acrescenta o checkpoint substituído, totalizando 59. O baseline anterior,
`65831022bc7bb58ef07e50bb2b9558c9f1b0507a`, permanece nesse histórico com seus
hashes e evidências. O novo registro lista cada caminho alterado, hashes antigos
e novos, oito datas e a fonte Git alcançável.

Validação local da recaptura: `npm run test:bofu-dominance`, 123 testes aprovados;
`node --test runtime/test/contract-news-analytics.test.mjs`, quatro testes
aprovados. Esses resultados cobrem o contrato que falhou, a preservação de
histórico, a integridade dos arquivos protegidos e a integração dos eventos de
notícias. A conclusão global da CI, a inspeção das capturas das oito ferramentas
e a aceitação pública da release continuam pendentes nesta etapa.

## Revisão visual e medição da CI em 20/11/2026

As oito seções foram inspecionadas nas capturas reais de 390 e 1440 pixels da
[CI 44656688063](https://github.com/tjsasakifln/web-cfg/actions/runs/44656688063).
Os botões e a disposição do conteúdo estavam íntegros. A revisão encontrou
sete links de serviço sem distinção visual em relação ao texto do parágrafo.
Esses links recebem a classe existente `text-link`; o modelador já os sublinha.
O teste de navegador passa a conferir o sublinhado calculado nas oito páginas
e nas duas larguras, além de visibilidade, ausência de transbordamento,
navegação nativa e resposta HTTP 200. Não há mudança de CSS, destino ou oferta.

Essa execução anterior reprovou o Lighthouse em
`/conteudos/atraso-na-medicao-obra-publica/`: desempenho 80 para mínimo 90,
TBT de 851,443 ms, LCP de 1655,114 ms e CLS zero. Foram preservados os 86
resultados de 70 rotas, o relatório original e seus rastros. Os hashes do
relatório, trace e DevTools Log conferem com o manifesto da mesma execução.

No trace, a tarefa longa sem atribuição de script consumiu 391,195 ms de relógio
e 1,180 ms de CPU da thread. A simulação a apresenta como 1565 ms. A maior tarefa
atribuída ao código próprio foi 75 ms na simulação. Isso não identifica a causa
da espera nem transforma a medição em aprovação. O HTML-fonte e os estilos
da rota são iguais aos da base; os dois prefixos de origem acrescentam apenas
30 bytes ao bundle, correspondentes a oito bytes comprimidos nessa resposta.

A correção visual exige nova CI integral sobre o novo commit. A reprovação
anterior permanece registrada: nenhum resultado é substituído, nenhum limite
é reduzido e nenhuma repetição automática é acrescentada ao Lighthouse.
Integração e publicação dependem da aprovação completa da nova versão.
