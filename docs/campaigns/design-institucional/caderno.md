# CONFENGE-SALTO-INSTITUCIONAL-01 — caderno de decisões

Campanha 1 de 2 (direção de arte, materiais e piloto navegável). Sucessora: `CONFENGE-SALTO-INSTITUCIONAL-02-EXPANSAO-PRODUCAO`.
Estado de passagem: `estado.json` (esquema `confenge.design-institucional/1.0`). Evidências em `evidence/`.
Publicação nesta campanha: **não**. Ramo isolado `campaign/salto-institucional-01-piloto`, worktree própria; `main` não recebe nada.

## 1. Base real (observada 2026-09-16/17)

| Item | Valor |
| --- | --- |
| Produção observada | `47da03b64ba701016eec296234b1d14225ebe588` (`/.well-known/build-info.json`, `build_time` 2026-09-16T17:21:03Z; CSS servido `styles.93863fcc71c5.css`) |
| `origin/main` na abertura | `47da03b64ba701016eec296234b1d14225ebe588` (idêntico à produção) |
| Base do ramo do piloto | `47da03b64ba701016eec296234b1d14225ebe588` |
| Publicação | push em `main` dispara `netcup-release` (site-ci → pacote → promoção atômica → aceite público); merge de documentação também publica. Por isso nada desta campanha entra em `main`. |
| Rollback vigente | `docs/ops/ROLLBACK.md`; versão saudável observada: a própria `47da03b64` (aceite público verde na promoção de #695). Nenhuma reversão é executada nesta campanha. |
| Cadeia | fonte (`index.html`, `servicos/index.html`, `<slug>/index.html`, `data/demonstrative/*` → `scripts/demonstrative/*/render.py`) → `scripts/pseo/build_site.py` (gera pSEO/editorial, normaliza cópia, CSP) → `_site/` → CSS por `scripts/site/build_css.py` (`styles-tokens.css` + `css/identity.css` + `css/components.css` + `css/contracts.css` + `css/type-floor.css` concatenados em `styles.css`; `assets/home-10x.css` só na home) → fingerprint. `docs/` é excluído do artefato (`PUBLIC_EXCLUDED_RELPATHS`), protótipos em `docs/design-audit/prototypes` têm isolamento verificada (`test:prototype-isolation`). |

Capturas da produção (`evidence/producao-47da03b64/`, Chromium 1234 via puppeteer-core, cache desativado, `content-visibility` forçado visível para a página inteira, fontes carregadas — `Archivo Var` computada no H1 de todas as rotas): `/`, `/servicos/`, `/quantitativos-orcamento-obras/`, `/medicoes-glosas-obras-publicas/`, `/entregas/`, `/triagem-tecnica/` em 390×844 e 1440×1000, dobra e página inteira, menu aberto em 390. Primeira captura sem forçar `content-visibility` mostrou faixas em branco (artefato de captura, não defeito da página); descartada.

Alturas medidas (px, 1440 / 390): home 6.921 / 11.772; serviços 8.133 / 13.440; quantitativos 12.030 / 19.739; medições 10.077 / 13.836; entregas 12.038 / 18.190; triagem 3.840 / 6.312.

## 2. Diagnóstico priorizado (evidência nas capturas)

| # | Problema observado | Onde | Efeito sobre a compreensão | Mudança pretendida | Preservar | Teste |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | A única peça visual do site é uma planta miniatura (≈450 px) de banheiro; 9 SVG demonstrativos (elevações, perfil de drenagem, seção de pavimento) e 4 CSV ficam confinados a `/casos/` | home hero, `/servicos/` (0 figuras), `/medicoes…/` (0 figuras) | o visitante não vê como a CONFENGE trabalha; a empresa parece "só banheiro" | pranchas editoriais grandes, com carimbo, chamadas e legenda útil, reenquadradas no celular; infraestrutura e obra pública com figura própria | rótulo "Exemplo demonstrativo", dados de `data/demonstrative` sem alterar números | `test_home_conversion_contract` (rótulo), `test_html_integrity`, contraste de texto em SVG |
| 2 | Sete situações em linhas idênticas (ritmo único, ~1.700 px) e nove linhas iguais em `/servicos/` | home `#situacoes`, `/servicos/` | índice vira lista interminável; avaliação imobiliária e infraestrutura somem no meio | índice compacto por área de apresentação (6 grupos) com subserviços acessíveis, variação de largura/escala; obras públicas com peso próprio | os 7 `situation-row` com `h3`, `situation-use`, hrefs do `public-ia-map` (contrato) | `test_home_conversion_contract::test_situation_chooser…`, `test_design_gates` |
| 3 | Responsabilidade só em texto; retrato oficial existe e só aparece em `/especialista/` | home `authority_editorial` | "sei com quem vou falar" não é atendido | bloco de responsabilidade com retrato (`assets/tiago-sasaki-foto-v11-sem-fundo-560.{avif,webp,png}`), credenciais verificáveis e forma de condução | credenciais e link "Como conferir credenciais" | `test:brand`, `test:authority` |
| 4 | `market_context` é uma grade de três cartões iguais (padrão listado como proibido) e o bloco B2G repete o esqueleto do índice | home `#obras-publicas` | obras públicas parece anexo; números de mercado sem hierarquia | faixa escura própria de obras públicas com percurso (edital → contrato → medição), figura B2G e os três contratos como tabela regrada | `PNCP · 01/08/2026`, `54.055`, `4,48 mi`, `href="/servicos-obras-publicas/"`, ordem `situacoes` antes de `obras-publicas` | `test_pncp_proof_is_confined…` |
| 5 | Página de serviço com 12.030 px (desktop) e 19.739 px (celular), sem índice interno; ressalvas repetidas em vários blocos | `/quantitativos-orcamento-obras/` | leitura longa antes de qualquer prova; o visitante não sabe onde está | reconhecimento (necessidade, trabalho, entrega, próximo passo) na abertura com prancha; índice de página; método, condicionantes e fontes depois; ressalvas consolidadas | ids/anchors, links de WhatsApp/e-mail, JSON-LD, `#amostra-quantitativos`, faixa `.keys`, tabela real | `test:copy`, `test:design`, `tests/ativacao_20260912/03` |
| 6 | Pilar B2G fora do sistema: hero em degradê, faixa escura com botão, ícones em caixas, cartões, biblioteca com 6 itens iguais | `/medicoes-glosas-obras-publicas/` | ao clicar em obras públicas o visitante muda de "site"; competência é afirmada em texto, não mostrada | trazer o pilar para a mesma composição: abertura com utilidade e prancha "mesma parede, quatro números", dossiê como entrega nomeada, guias como índice regrado, contato único | HTML congelado por hash em `data/bofu-dominance/frozen-specs` (recaptura honesta com motivo), preço/condições/`document_intent`, formulário on-page publicado por #695 | `materialize.py`, `test:page-contract-*`, `inbound:gates` |
| 7 | Contato: a home concentra próximo passo + formulário + canais + bolha; `/triagem-tecnica/` é texto em caixas iguais, sem dizer o que acontece depois | home `#triagem-tecnica`/`#contato`, `/triagem-tecnica/` | esforço até o contato; expectativa pós-envio indefinida | uma ação dominante, alternativas subordinadas, "o que acontece depois" em três passos; estados (erro, sucesso, envio) tratados | formulário `#formulario-contato` byte-idêntico (hash congelado, 23 controles, 3 obrigatórios), `action="/obrigado"`, "Não envie documentos sensíveis" | `test_corporate_triage…`, `test:form-funnel`, `test:cta-form-next-state` |
| 8 | Avaliação imobiliária é a linha 06 de `/servicos/` (texto), sem tratamento próprio | `/servicos/#servico-avaliacao` | a oferta existe mas não é reconhecida | seção com objeto e estrutura da análise (figura: finalidade → método → dados → conclusão delimitada), sem valor de mercado inventado | id `servico-avaliacao`, `data-hub-link`, 3 canais, "Parecer preliminar não substitui a avaliação formal" | `test:hub-links`, `test:nav` |

Não confirmado do briefing: "excesso de ressalvas em cada bloco" existe em grau moderado (quantitativos: 6 blocos repetem "não é software/obra/SINAPI real"); "navegação interna incoerente" não foi observada no shell (menu único, breadcrumb presente).

## 3. Contrato do piloto

- **Percurso** (6 funções, 5 URLs + 1 seção): `/` → `/quantitativos-orcamento-obras/` → `/casos/demonstrativo-projeto-privado/` (exemplo ligado ao serviço privado) → `/servicos/#servico-avaliacao` (avaliações, seção tratada integralmente; a página inteira de `/servicos/` recebe o índice novo) → `/medicoes-glosas-obras-publicas/` (pilar B2G) → contato: `/#contato` (formulário, estados) e `/triagem-tecnica/`.
- **Escrita**: tokens, `css/identity.css`, `css/components.css`, `assets/home-10x.css` e contratos compartilhados só pelo integrador. Frentes auxiliares entregam arquivos delimitados (§4).
- **Não muda**: preços, condições, checkout, atribuições, ofertas, política de rastreamento, contratos de formulário, taxonomia, URLs, repositórios vizinhos.
- **Regras afetadas identificadas** (registro de escopo, não edição de AGENTS.md): hash do HTML dos seis pilares (`frozen-specs/hashes.json`) → recaptura com motivo via `scripts/bofu_dominance/frozen_specs/materialize.py`; hash do formulário da home (`CAPTURE_FORM_SHA256`) → preservado; hash da análise aprovada e frozen specs do CSS → recaptura na ordem obrigatória (análise → frozen specs → primeira dobra → baselines) somente com o CSS congelado; `archetype` gate (5–8 seções, ≥5 arquétipos) → respeitado.

## 4. Direção criativa (integrador)

**Prancha e percurso.** A assinatura visual passa a ser a *prancha de engenharia*: figura técnica composta (desenho + cota + chamada numerada + carimbo com revisão e "Exemplo demonstrativo") tratada como peça editorial, grande no desktop e reenquadrada no celular. O texto ao redor faz três coisas, sempre nesta ordem: nomeia a necessidade, mostra o trabalho na prancha, nomeia o documento entregue. Papéis tipográficos separados (institucional, serviço, editorial, chamada, corpo, legenda, dado técnico). Superfície clara, verde controlado, um momento escuro por página. Ver `estado.json#design_contract`.

Estudos A e B em `docs/design-audit/prototypes/salto-institucional-2026-09-17/` (isolados do artefato). Seleção em §6 do estado.
