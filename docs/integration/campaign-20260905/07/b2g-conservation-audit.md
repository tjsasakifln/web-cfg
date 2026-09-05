# Auditoria de conservação B2G

**Modo:** somente leitura sobre as rotas públicas existentes. Nenhum HTML, registry, sitemap, redirect, dado ou contrato B2G foi alterado nesta campanha.

**Observação:** 05/09/2026, `BASE_SHA=470a5ffafeaf45a59649109742ce5885f9789328`. `origin/main` avançou durante a execução e a branch foi atualizada por fast-forward antes do fechamento. Na última consulta, `/.well-known/build-info.json` de produção ainda apontava para o antecessor `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`, com `environment=production`; respostas vieram por Cloudflare com `X-Confenge-Host-Architecture-Version: confenge-nginx-node/v2`. Os HTMLs das 14 rotas centrais não mudaram entre esses dois commits.

## Veredito

O patrimônio B2G está íntegro na base: hub, 13 money pages do `bofu-intent-matrix`, ferramentas e superfícies de dados existem. As 14 rotas centrais respondem 200 em produção, declaram `index,follow`, têm canonical próprio e aparecem no sitemap. Ferramentas e dados têm estados mistos, detalhados abaixo: parte é indexável e parte permanece em quarentena `noindex`, sem sitemap. A home oferece caminhos B2G já na navegação e no primeiro bloco.

O risco de integração é concreto e localizado: `/servicos/` responde 301 para `/servicos-obras-publicas/`. Se a marca guarda-chuva publicar um hub corporativo nessa URL, o redirect legado precisa ser migrado para o novo destino sem tocar na URL, no canonical ou no intent de `/servicos-obras-publicas/`.

## Antes e depois necessário

| Superfície | Estado observado em `BASE_SHA`/produção | Contrato depois da integração MV-09 |
| --- | --- | --- |
| `/servicos-obras-publicas/` | hub exclusivo de licitações e contratos de obras públicas; canonical próprio; indexável; captura interna | manter URL, canonical, indexação, sitemap, captura e mensagem para empresa que disputa/opera contrato público; adicionar no máximo uma porta claramente rotulada para o ente contratante |
| `/servicos/` | não existe como página; `/servicos` e variantes legadas redirecionam ao hub B2G | se o hub corporativo for publicado, canonical `/servicos/`, ligação explícita para “Obras Públicas e B2G” e redirects legados migrados URL a URL para o hub corporativo |
| Home `/` | title, H1, jornadas e prova são B2G; links diretos para edital/proposta, contrato sob pressão e operação recorrente | ampliar a categoria corporativa sem apagar uma porta B2G reconhecível no primeiro contato; `/servicos-obras-publicas/` deve continuar alcançável em no máximo duas ações |
| Money pages B2G | 13 rotas canônicas declaradas pela matriz de intenção; todas 200/self-canonical/indexáveis/no sitemap | nenhum rename, noindex, canonical para `/servicos/`, remoção de sitemap ou redirect; mudança de copy só com razão URL a URL e testes verdes |
| Ferramentas | hub e quatro ferramentas contratuais indexáveis; análise de CNPJ em quarentena `noindex,nofollow` | preservar utilidade, fonte, estado de publicação, atribuição e ponte comercial B2G; não rebatizar como ferramenta genérica sem message match nem indexar a quarentena sem seus gates |
| Dados/inteligência | análises de contratos, oportunidades, inteligência, panorama, radar e metodologia usam dados públicos com proveniência | manter `extra-cli` como owner de aquisição/identidade/proveniência; números PNCP sempre com objeto, recorte, corte, método e limite |
| Destinos de conversão | formulário persistente interno, WhatsApp, e-mail e telefone publicados; evidências apontam ao PNCP | manter `source=CONFENGE_WEB`, contexto B2G e recibo; inbound não marca `outbound_eligible` e não autoriza envio/SMTP |

## Hub `/servicos-obras-publicas/`

Evidências na fonte atual:

- `servicos-obras-publicas/index.html:6-10`: title B2G, `index,follow` e canonical próprio.
- `:64`: H1 “Serviços para licitações e contratos de obras públicas”.
- `:73-91`: acesso a medição/glosa, diagnóstico, diretoria, bid room, defesa de margem e catálogo de eventos contratuais.
- `:91-99`: ofertas precificadas e captura persistente na própria página; qualquer integração deve continuar passando o gate fail-closed de preço/captura.
- `:106`: rodapé liga a edital/proposta, operação recorrente, ferramentas e money pages.

O arquivo tinha SHA-256 `dcee7d5a395f6abadf543297b571ccef14b01f03669241c291c40ae96e1e0669` e era referenciado por 205 arquivos HTML. O hash é evidência diagnóstica, não congelamento byte a byte: shell compartilhado e copy podem evoluir, desde que os invariantes semânticos permaneçam.

## Principais money pages

Estas são as 13 `canonical_service_route` de `data/organic/bofu-intent-matrix.json`. Todas foram observadas em produção com HTTP 200 e canonical próprio em 05/09/2026.

| Intent | Rota | Posição na matriz | Links internos observados |
| --- | --- | --- | ---: |
| aditivos | `/aditivos-obras-publicas/` | linha 28 | 209 |
| medições e pagamentos | `/medicoes-glosas-obras-publicas/` | linha 47 | 28 |
| reequilíbrio | `/reequilibrio-obras-publicas/` | linha 70 | 208 |
| orçamento/BDI | `/auditoria-orcamento-licitacao/` | linha 88 | 26 |
| pré-licitação para empresa | `/diagnostico-pre-licitacao/` | linha 111 | 23 |
| diagnóstico de operação | `/diagnostico-b2g-360/` | linha 130 | 17 |
| atraso/prorrogação | `/atrasos-prorrogacao-obras-publicas/` | linha 146 | 207 |
| defesa técnica | `/defesa-tecnica-contratos-publicos/` | linha 165 | 208 |
| acompanhamento | `/acompanhamento-contratos-obras/` | linha 183 | 21 |
| defesa de margem | `/defesa-margem-contratos-publicos/` | linha 199 | 18 |
| proposta para licitação crítica | `/bid-room-licitacoes-obras/` | linha 215 | 236 |
| operação recorrente | `/diretoria-b2g/` | linha 231 | 239 |
| expansão B2G | `/diagnostico-b2g-expansao/` | linha 247 | 21 |

“Links internos observados” conta arquivos HTML que continham ao menos um `href` para a rota; mede superfície de regressão, não autoridade SEO nem visitas.

## Tools e dados

### Ferramentas atuais

- `/ferramentas/`
- `/ferramentas/checklist-reequilibrio/`
- `/ferramentas/diagnostico-defesa-margem/`
- `/ferramentas/limite-acrescimos-supressoes/`
- `/ferramentas/matriz-atraso-obra/`
- `/analise-cnpj/`

O hub `/ferramentas/` continua orientado a contratos e licitações de obras, com canonical próprio e caminhos explícitos para diagnóstico/vertical. As ferramentas não são prova de um novo serviço para o ente nem devem ser usadas para sugerir decisão automática.

No `BASE_SHA`, o hub e as quatro ferramentas sob `/ferramentas/` têm canonical próprio, são indexáveis e aparecem no sitemap; algumas usam indexação implícita por ausência de meta robots. `/analise-cnpj/` está deliberadamente fora do sitemap, sem canonical e com `noindex,nofollow`. Conservação significa não perder as cinco superfícies públicas e não publicar silenciosamente a superfície em quarentena.

### Dados e inteligência atuais

- `/analises-contratos-publicos/`: análises desidentificadas de contratos.
- `/oportunidades/`: oportunidades públicas com fatos e fonte.
- `/inteligencia/`: respostas derivadas de contratos públicos.
- `/panorama-mercado-obras-publicas/`: recortes de mercado desidentificados.
- `/radar/`: radar de obras públicas.
- `/metodologia-inteligencia/`: método, cobertura e limites.

O estado observado não é uniformemente indexável: `/analises-contratos-publicos/`, `/inteligencia/`, `/panorama-mercado-obras-publicas/` e `/radar/` têm canonical próprio, mas estão `noindex` e fora do sitemap. As quatro instâncias registradas de `/oportunidades/` também estão `noindex`, fora do sitemap e sem canonical. Apenas `/metodologia-inteligencia/` está `index,follow`, self-canonical e no sitemap. O manifesto conserva tanto as superfícies publicadas quanto essa quarentena; uma promoção futura exige seus próprios gates editoriais, de dados e conversão.

O owner de aquisição, fatos, identidade e proveniência continua sendo `extra-cli` por contrato SELECT-only versionado. Esta campanha não criou dataset, crawler, portal ou identidade.

## PNCP e prova contextualizada

A home atual contém três camadas que precisam viajar juntas caso o shell corporativo seja ampliado:

1. `index.html:125`: fonte PNCP, data de corte, definição de “confirmado” e ligação para método/limites.
2. `index.html:282`: universo de 11.931 registros, 233 contratos de engenharia, quatro estados, corte de 31/07/2026 e a ressalva de que não é a base nacional inteira.
3. `index.html:314,332,350`: três links diretos para os contratos oficiais no PNCP usados como evidência.

Número isolado na home corporativa seria perda de contexto. O bloco pode permanecer numa seção claramente rotulada “Obras Públicas e B2G” ou migrar para uma superfície B2G, mas deve conservar: tipo de registro, geografia, data de corte, método, limitação e fonte oficial. Os números não provam resultado de cliente, capacidade da CONFENGE nem representatividade nacional.

## Destinos atuais do outbound

“Destino do outbound” foi tratado separadamente de “canal de conversão do site”. A apuração contemporânea encontrou:

- Warmbly remoto `main=33bd329437bc04a2e95ef0f4d562d26b85f34e35`; issue Warmbly #43 aberta com `CURRENT_VERDICT=NO_GO_SMTP`, `DISPATCH=PAUSED`, kill switch acionado e `SMTP_SENT=NO` em 04/09/2026.
- `extra-cli` remoto `main=96f1bea8fa5f2a44d9563943f9875b350da3ccc4`; continua owner do feed/elegibilidade, não da página pública nem do envio.
- comentário owner em web-cfg #587: base inicial de 36 contas (16 Prefeituras, 16 Câmaras, 2 autarquias de saneamento e 2 consórcios), campanha `PAUSED` e nenhum envio.
- buscas nos checkouts de Warmbly e `extra-cli` não localizaram URL B2G de landing hard-coded como destino atual.

Consequência: **não existe destino live de outbound que possa ser afirmado a partir da evidência observável**, porque nenhum envio foi autorizado. O estado correto é `UNKNOWN_NOT_OBSERVED_BECAUSE_NO_SEND_WAS_AUTHORIZED`, não uma URL inferida de draft, template ou link do site. Para conservação, todas as rotas B2G candidatas a first touch permanecem íntegras; somente Warmbly #43 pode escolher/autorizar transporte e a MV-07 não resume campanha, SMTP ou cadência.

## Destinos atuais do site e fronteira inbound/outbound

Nos arquivos centrais do site, os destinos observados foram:

- `/.netlify/functions/lead`: captura persistente no runtime público; o nome histórico do path não altera a autoridade Netcup/Node.
- `https://wa.me/5548988344559`: conversa direta, com texto contextual.
- `mailto:tiago.sasaki@confenge.com.br` e `tel:+5548988344559`: alternativas públicas.
- `https://pncp.gov.br/...`: fonte de evidência, não handoff comercial.

Nenhum destino SmartLic foi encontrado. O novo candidato deve emitir `source=CONFENGE_WEB`, `nucleus_id=public_works_b2g`, `deliverable_id=CFG-D55` e contexto de próxima ação, mas manter `outbound_eligible=false`, `auto_send=false` e `smtp_authorized=false`. Warmbly continua owner da ação comercial.

## Canonical, index, sitemap e links

- Cada uma das 14 rotas centrais tem arquivo `index.html`, meta robots que inclui `index,follow` e canonical self.
- As 14 URLs constam em `sitemap.xml`; evidências de linha estão em `b2g-conservation-baseline.json` e nos testes.
- `data/organic/public-family-registry.json:67` deriva a família `service-pillars` das rotas da matriz; `:503` declara o hub B2G separadamente.
- A home liga diretamente a rotas B2G no header (`index.html:65-68`), nas jornadas (`:146-169`) e no footer (`:580`). `/servicos-obras-publicas/` está a uma ação pelo footer, portanto abaixo do limite de duas.

## Mudanças de copy que pertencem à integração, não a esta campanha

1. Home: o novo primeiro bloco corporativo não pode remover o rótulo visível “Obras Públicas e B2G” nem as portas edital/proposta, contrato sob pressão e operação recorrente.
2. `/servicos-obras-publicas/`: adicionar uma divisão curta de papéis que preserve a página para empresas e envie representantes do ente à nova rota.
3. `/servicos/`: deixar claro que é o hub corporativo dos núcleos, não um substituto nem canonical das páginas B2G.
4. Rodapés/shared shell: manter um link nominal “Obras Públicas e B2G” para `/servicos-obras-publicas/`.

As strings propostas e os alvos exatos estão em `mv-09-integration-fragment.md`; não foram aplicados.

## Contrato automatizado

`tests/campaigns/mv-07/test_b2g_conservation.py` verifica:

- alcance em até duas ações;
- existência, `index,follow`, canonical próprio e sitemap para todas as rotas centrais;
- coerência do futuro `/servicos/` sem sequestro do canonical/redirect B2G;
- contexto mínimo de qualquer bloco PNCP preservado entre home e hub B2G;
- captura e canais B2G sem SmartLic;
- integridade e separação das duas audiências no candidato.

O teste não exige hashes HTML exatos. Isso permite evolução intencional de shell/copy sem permitir perda de URL, intent, proveniência ou conversão.

## Rollback

Se a integração reduzir encontrabilidade, mudar canonical/indexação, perder contexto PNCP ou misturar ente e licitante, reverter somente os commits de integração das superfícies afetadas. Restaurar os redirects URL a URL conforme a decisão anterior; nunca enviar rotas B2G em massa para a home. Solicitações já recebidas e recibos permanecem sujeitos ao contrato de retenção vigente.
