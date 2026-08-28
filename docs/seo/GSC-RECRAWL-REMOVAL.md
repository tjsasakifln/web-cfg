# Search Console — manifesto de recrawl e remoção

**Não executar** Removals, URL Inspection, IndexNow nem qualquer escrita no Search Console sem credencial e autorização explícita do fundador. Este arquivo é o manifesto in-repo; não é um job externo.

Estado: `EXECUTE_NOW` no repositório. Ação GSC: **não executada**.

## A. Recrawl (URL Inspection → Request indexing) — só depois de merge/deploy

Canonicals ou destinos que mudaram nesta entrega:

| URL | Motivo |
|-----|--------|
| https://confenge.com.br/servicos-obras-publicas/ | Destino real de `/servicos` e `/servicos.html` (antes fragmento `/#como-atuamos`). |
| https://confenge.com.br/ | Snippets e hrefs internos canônicos; hint de edital aponta para o hub indexável de pré-licitação. |
| https://confenge.com.br/atrasos-prorrogacao-obras-publicas/ | Title/description reescritos por intenção. |
| https://confenge.com.br/defesa-margem-contratos-publicos/ | Title reescrito por intenção. |
| https://confenge.com.br/diretoria-b2g/ | Title/description reescritos por intenção. |
| https://confenge.com.br/acompanhamento-contratos-obras/ | Title reescrito por intenção. |
| https://confenge.com.br/defesa-tecnica-contratos-publicos/ | Title reescrito por intenção. |
| https://confenge.com.br/lei-14133-obras/ | Title reescrito por intenção. |
| https://confenge.com.br/servicos-obras-publicas/ | Description reescrita por intenção. |

Não solicitar indexação de família noindex (`/analises-contratos-publicos/`, `/panorama-mercado-obras-publicas/`, `/piloto/`, `/ops/`).

## B. Remoção / 410 (Removals + esperar recrawl)

Já retornam **HTTP 410** no host. SERP ainda pode mostrar identidades antigas até o recrawl. Não 301 para a home.

| URL | HTTP | Reason |
|-----|------|--------|
| https://confenge.com.br/nexgen | 410 | Produto abandonado (identidade antiga na SERP) |
| https://confenge.com.br/vision | 410 | Produto abandonado (identidade antiga na SERP) |
| https://confenge.com.br/avcb | 410 | Entidade antiga |
| https://confenge.com.br/avcb-clcb | 410 | Entidade antiga |
| https://confenge.com.br/avcbclcb | 410 | Entidade antiga |
| https://confenge.com.br/clcb | 410 | Entidade antiga |
| https://confenge.com.br/avaliacoes | 410 | Avaliações imobiliárias abandonadas |
| https://confenge.com.br/avaliacoes-imobiliarias | 410 | Avaliações imobiliárias abandonadas |
| https://confenge.com.br/avaliacao-imovel | 410 | Avaliações imobiliárias abandonadas |
| https://confenge.com.br/ia | 410 | Produto genérico de IA abandonado |
| https://confenge.com.br/inteligencia-artificial | 410 | Produto genérico de IA abandonado |
| https://confenge.com.br/automacao | 410 | Automação genérica abandonada |
| https://confenge.com.br/trabalhe-conosco | 410 | Sem substituto |

Também variantes `http://`, `www.` e com/sem barra final se o GSC ainda listar.

Família de análise de contrato (noindex unificado; sem `Allow` pontual):

| URL | HTTP esperado | Reason |
|-----|---------------|--------|
| https://confenge.com.br/analises-contratos-publicos/reajuste-incc-coluna-35-paralelepipedo-sao-goncalo-piaui-2026/ | 200 + noindex | Canário previamente observável; agora noindex coerente. Removals se ainda indexado. |

## C. Redirects de marca (não são remoção)

| From | To | Status |
|------|----|--------|
| /servicos | /servicos-obras-publicas/ | 301, um hop |
| /servicos.html | /servicos-obras-publicas/ | 301, um hop |
| /services | /servicos-obras-publicas/ | 301, um hop |
| /blog | /conteudos/ | 301 |
| /contato | /#contato | 301 |
| /privacy-policy | /privacidade/ | 301 |

## D. Operador

1. Esperar merge + deploy desta branch.
2. GSC → Removals para cada 410 da tabela B (e www/http).
3. GSC → URL Inspection nas URLs da tabela A; Request indexing só em 200 indexável.
4. Não 301 entidade abandonada para `/`.
5. Sem credencial GSC: parar aqui. `GSC_SITE_URL` / `GSC_CREDENTIALS_JSON` permanecem o contrato do observatório, não desta entrega.

## E. O que este manifesto não faz

- Não chama IndexNow.
- Não usa a Indexing API.
- Não altera extra-cli nem Warmbly.
- Não autoriza merge.
