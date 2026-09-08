# Campanha: comunicação pública comercial (2026-09-08)

Registro de retomada. Issue guarda-chuva: #611. PR: #644.
Base: `234a061f1` (= `origin/main` = SHA servido em produção no início).
Branch: `campanha/comunicacao-publica-comercial`.

## Universo auditado

378 rotas no sitemap servido: 74 autorais + ~22 artigos editoriais + ~280
`/oportunidades/` (um único modelo parametrizado, amostrado). A auditoria C1–C6
cobriu **52 rotas autorais lidas no HTML renderizado de produção**, uma a uma,
em 2026-09-08 sobre o SHA `234a061f1`. Resultado agregado: 262 achados, 108 de
gravidade alta. Falhas por dimensão: C3 entrega 28, C6 continuidade 24,
C2 trabalho 22, C5 confiança 22, C4 utilidade 7, C1 reconhecimento 5.
Achados por categoria: autossabotagem 85, jargão 64, generalidade-sem-entrega
41, b2g-exclusivo 22, promessa-destino-divergente 16, conteúdo-insuficiente 14,
exclusão-porte 10, alegação-sem-fundamento 7, demonstrativo-como-real 2.

Evidência bruta: transcrições em
`.claude/projects/.../subagents/workflows/wf_5d98a824-cd0/journal.jsonl`.

## Concluído (commitado neste PR)

1. **Entrega deixa de ser hipotética** — home e `/servicos/`. Sai "pode
   resultar em", "possíveis entregas", "conforme o escopo" repetido; entra o
   documento que sai da mesa, com o que contém.
2. **Bloco PNCP para de induzir o descarte por porte** — a comparação 1% do
   contrato × honorário sai dos três cartões; preços publicados aparecem uma
   vez, fora da comparação, com "atendemos contratos de qualquer porte".
3. **Identidade** — descrição `Organization` no JSON-LD e frase de rodapé em
   ~200 rotas deixam de dizer que a CONFENGE é consultoria de licitações.
4. **Segundo revisor** — sai o anúncio "Sem revisão independente: não há
   segundo revisor nomeado" de 17 rotas; os tokens negativos saem de
   `authority-matrix.json`.
5. **`/entregas/`** — a vitrine para de publicar o estado comercial interno
   ("44 em validação", "2 bloqueadas"). Estados seguem íntegros no registro.
6. **Primeiro contato** — sai "se temos capacidade de atender" de 170 rotas.
7. **Rótulo público B2G** — removido do texto visível das rotas autorais.

## Travas que exigiam o defeito, substituídas por propriedades corretas

- `scripts/site/test_home_real_contract_case.py` — exigia "1% deste contrato é
  R$ X" + faixas de honorário por cartão. Agora reprova percentual pareado com
  honorário e a **classe da paráfrase** ("ferramenta pública gratuita",
  "entrega de entrada", "fica abaixo do custo", "contratos assim"), que a trava
  literal `"neste porte" not in html` deixava passar.
- `tests/commercial/test_offer_fit_matrix.mjs` — exigia que 1% do contrato
  local ficasse ABAIXO do piso do dossiê.
- `data/site/authority-matrix.json` + `test_authority_contract.py` +
  `test_margin_cluster_inventory.mjs` — o slot de revisor era cumprido pela
  negativa; agora só pelo nome do responsável técnico.
- `test_task_doors.mjs`, `test_deliverables_registry.mjs`,
  `test_design_gates.py`, `test_truthful_gates.py` — exigiam os contadores de
  capacidade não vendável.

## Fora de escopo, deliberadamente

`build:site` refresca dados do PNCP e recria ~300 rotas de `/oportunidades/`.
No repositório, `sitemap-oportunidades.xml` é um stub que o build preenche, e
`PUBLIC-ARTIFACT-MANIFEST.json` registra nomes de rota. Como esta campanha não
cria nem remove rota, esses artefatos ficam na versão da `main`.

## Pendente

- **Contato**: `adaptive-intake-authority.json` está `WITHHELD` e `loadPin()`
  exige `status: FINAL` com pin e hashes reais mais quatro variáveis de
  ambiente casadas com Governance. **Não forçar READY, não inventar pin.**
  `/triagem-tecnica/` opera com três canais diretos contextualizados, que é o
  caminho sancionado. **Destino do e-mail comprovado**: `confenge.com.br` tem
  MX vivo (`mx1/mx2.hostinger.com`) e SPF `include:_spf.mail.hostinger.com`.
  **Destino do WhatsApp comprovado como endereço válido**: carregado em
  navegador (Playwright, 2026-09-08), `wa.me/5548988344559` redireciona para
  `api.whatsapp.com/send/?phone=5548988344559` e renderiza "Chat on WhatsApp
  with +55 48 98834-4559" com os links de conversa ativos, **sem** a tela de
  número inválido que o WhatsApp exibe para número não registrado. Isso prova
  que o número é um destino de conversa válido, sem enviar mensagem. **Não
  prova recebimento nem leitura**: nenhuma mensagem foi enviada, e abrir o app
  nunca seria prova de entrega.
- Achados remanescentes da auditoria por rota (blocos genéricos sem entrega em
  `/aditivos-obras-publicas/` e `/auditoria-orcamento-licitacao/`,
  "remunera método e artefato, não resultado" em
  `render_contract_defense_products.mjs`, `/entregas/` C1–C6, hubs).
- **Pré-existente, não desta campanha**: `test_margin_cluster_inventory.mjs`
  já falhava em `origin/main` intocada com
  `/conteudos/matriz-de-riscos-reequilibrio-economico-financeiro/ missing Método`
  (verificado com `git stash`). Não está encadeado em `npm test`.
- Dívida de vocabulário registrada: 487 ocorrências em 158 rotas
  (`enquadramento` 148, `acervo` 111, `enquadrar` 79, `gate` 56, `artefato` 44,
  `aderência` 41). **Não zerar em lote**: em artigos de Lei 14.133,
  "enquadramento" é a classificação jurídica do aditivo, vocabulário do
  comprador, e §7 manda preservar. Triagem por ocorrência, com fundamento
  nomeado, não anistia por pasta.

## Reversão

`/opt/confenge-web/bin/rollback 234a061f111a446e89935ae69fa8217efadbff0e`
