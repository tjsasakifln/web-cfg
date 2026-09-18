# Frente artigo (TAREFAS-03): mudança semântica de evento e o que `--check` garante

Campanha POS-REDESIGN-FECHAMENTO-20260918. Registro exigido pela revisão adversarial da frente artigo (apontamento BAIXA) e complemento do apontamento ALTA (o que o verificador garante de fato). Data: 2026-09-18.

## O que mudou no HTML

`scripts/site/apply_article_pillar_form.py --write` levou o link `Continuar pelo formulário` de 111 artigos de `/conteudos/` para `{pilar}#captura-pilar` (Tema principal do artigo ou `path_overrides` do `content-service-map`) e inseriu um `text-link` `data-pillar-link="1"` para o pilar no primeiro `aside-card` de 116 artigos. Os quatro artigos que tinham `href="/"` nu (com `#contato` só em `data-origem`) entraram na segunda reaplicação, após a ampliação de `FORM_LINK_RE`. Ficam de fora apenas os três artigos congelados pelo canário #389 (`glosa-de-medicao-obra-publica`, `medicao-de-obra-publica-rejeitada`, `fiscal-nao-assina-medicao-obra-publica`), listados como pendência em todo `--check`.

## Semântica de evento antes e depois

Leitura de `js/modules/analytics.js` (`classifyTransition`) e `js/modules/nav.js` (fase de captura do clique). Nada foi alterado nesses módulos.

| | Antes (`href="/#contato"` ou `/?…#contato`) | Antes (`href="/"` nu, 4 artigos) | Depois (`{pilar}#captura-pilar`) |
|---|---|---|---|
| Classificação | `/#contato/` casa → `kind: 'contact'` | `dest.path = '/'` é `isChromePath` e não é destino canônico → `kind: 'not_transition'` | fragmento removido por `canonicalizePath`; os 8 pilares são `CANONICAL_DESTINATIONS` → `kind: 'transition'` |
| Evento | `service_cta_click`, `destination_type: 'form'` | nenhum (clique sem evento de conversão) | `content_to_service`, `destination_type: 'service'`, `destination_path` = pilar, `destination_service_id` = id do pilar |
| Chegada do visitante | formulário da home (`urlAsksForContact`) | topo da home, sem formulário | formulário do pilar (`#captura-pilar`), com `tema`/`landing_page`/`referrer` do artigo |

Consequências:

1. A série "formulário a partir de artigo" muda de nome: deixa de existir como `service_cta_click`/`form` na família `/conteudos/` e passa a `content_to_service`/`service`. Leituras que somem `service_cta_click` por origem editorial verão a série cair a zero a partir da publicação; a contagem correta passa a ser `content_to_service` filtrado por `cta_position = 'form'`.
2. Cada artigo passa a emitir dois `content_to_service` para o mesmo `destination_path`: o botão do formulário (`cta_position: 'form'`, rótulo `Continuar pelo formulário`) e o novo `text-link` do bloco de oferta (`cta_position` ausente → tratado como `inline`, rótulo do cluster). A contagem de `content_to_service` por artigo dobra em potencial; a desambiguação é por `cta_position` e `cta_label`.
3. Nenhum dos dois links carrega `data-cta-id`, `data-asset-id`, `data-asset-family` ou `data-route-family`; `cta_id` e `route_family` chegam como `unspecified` e a transição não conta como plenamente atribuída em `scripts/site/inbound_gates.py::_service_transition_destinations` (`SERVICE_TRANSITION_ATTRS`). Isso já era assim para o link antigo. Enriquecer os dois links (por exemplo `data-cta-id="article-form"` / `article-offer-pillar` e `data-asset-id=<slug>`) fica como opção explícita para uma reaplicação futura do script; não foi feito nesta frente porque retocaria 116 artigos e mudaria o payload de atribuição sem leitura combinada.
4. Nenhum consumidor quebra: `release_measurement_ledger` cobre só rotas-baseline e `tests/attribution/test_source_to_service.mjs` (`npm run test:attribution`) passa.

## O que `apply_article_pillar_form.py --check` garante

Antes desta correção o verificador só reconhecia `href="/#contato"` e `href="/?…#contato"`; o `href="/"` nu passava em branco (falso verde). Agora:

* `FORM_LINK_RE` (reescrita) cobre `/`, `/?…`, `/#contato` e `/?…#contato` no botão `button-secondary`.
* `RESIDUAL_FORM_RE` (guarda) acusa qualquer `Continuar pelo formulário`, com qualquer classe ou ordem de atributos, cujo `href` resolva para a home, com ou sem fragmento. `--check` sai 1 se algum artigo não congelado ainda tiver esse link, ou se algum artigo estiver desatualizado em relação à transformação.
* Artigos congelados pelo canário #389 aparecem como pendência, nunca como erro nem como alteração.

`npm run inbound:remediate` (`scripts/site/inbound_first_remediate.py::inject_journey_cta`) agora deriva o destino do formulário da mesma regra (`form_target`) e não reescreve uma `lead-inline` que já leva ao pilar; sem pilar continua caindo em `/#contato`. Cobertura: `python3 scripts/site/test_apply_article_pillar_form.py`.

Pendente de integração: ligar `python3 scripts/site/apply_article_pillar_form.py --check` e `python3 scripts/site/test_apply_article_pillar_form.py` a um gate do CI (`inbound:gates` ou `site-ci`); o remediador mantém `/#contato` nos artigos congelados pelo canário #389 (mesmo destino que escrevia antes), mas continua regenerando a `lead-inline` deles se for executado (comportamento anterior à campanha, fora desta frente).
