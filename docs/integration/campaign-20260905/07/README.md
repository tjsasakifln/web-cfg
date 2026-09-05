# MV-07 — nova oferta para entes públicos e conservação B2G

- `CONFENGE_MV_CAMPAIGN=07`
- Título da PR: `[MV-07] Public contracting planning candidate and B2G conservation contract`
- Branch: `feat/mv-07-public-procurement-planning-b2g-conservation-20260905`
- Worktree: `/home/tjsasakifln/code/confenge/.worktrees/web-cfg/mv-07-public-procurement-planning-b2g-conservation-20260905`
- `BASE_SHA=470a5ffafeaf45a59649109742ce5885f9789328`
- `HEAD_SHA`: registrar na PR após o commit final
- Estado: `P1 / EXECUTE_NOW`
- Frente: `REVENUE NOW + INBOUND ENGINE`
- Alavancas: receita, conversão, confiança, cliente e distribuição
- Tempo para evidência: candidato integrável e contrato de conservação verdes; evidência comercial somente após rota/captura publicada e primeira demanda corretamente qualificada ou recusada
- North Star: oportunidade comercial qualificada, não página, acesso ou formulário
- Integração/merge/deploy: somente MV-09

## Resultado

Esta campanha entrega dois ativos independentes:

1. um candidato completo e modular para o ente público que prepara a contratação, com base normativa, copy, matriz, responsabilidades, conflito, ART/NF e captura segura;
2. um contrato automatizado de conservação da vertical B2G existente durante a ampliação corporativa.

Nenhum HTML público foi editado. Alterações fora do `WRITE_SET` estão descritas em `mv-09-integration-fragment.md`.

## Estado real apurado

- `origin=https://github.com/tjsasakifln/web-cfg.git`, default branch `main`.
- `origin/main` no fetch inicial: `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`; durante a execução avançou para `470a5ffafeaf45a59649109742ce5885f9789328`, incorporado por fast-forward antes do commit.
- Issues #587 e #588: abertas, `decision:execute-now`, sem assignee em 05/09/2026.
- PR de arquitetura relacionada #590: aberta, clean e com checks principais verdes; não foi tratada como base desta producer.
- Na consulta inicial não havia PR aberta cujo título/branch correspondesse às campanhas MV-01–MV-09 desta onda.
- Produção `https://confenge.com.br/`: ainda no SHA anterior `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb` na última consulta, ambiente production, Cloudflare diante de `confenge-nginx-node/v2`; os HTMLs B2G centrais não mudaram no novo commit de `main`.
- Checks do novo `origin/main` na consulta final: pSEO, análise e preflight verdes; `site-ci` ainda em execução. Os jobs dependentes de empacotamento, stage e promoção daquele run estavam cancelados, coerente com produção ainda no SHA anterior. Um `daily-ops` agendado anterior também estava vermelho; são estados operacionais externos a este WRITE_SET e não foram mascarados nem alterados.
- As 14 rotas B2G centrais responderam 200/self-canonical. `/servicos/` respondeu 301 para `/servicos-obras-publicas/`.
- Estado outbound contemporâneo: Warmbly #43 `NO_GO_SMTP`, dispatch `PAUSED`, kill switch acionado e `SMTP_SENT=NO`; a base inicial de 36 entes registrada em #587 também está `PAUSED`, com zero envio. Sem envio autorizado, o destino live permanece `UNKNOWN`, não uma URL presumida.
- SHAs remotos relacionados, somente para leitura: Warmbly `main=33bd329437bc04a2e95ef0f4d562d26b85f34e35`; `extra-cli` `main=96f1bea8fa5f2a44d9563943f9875b350da3ccc4`. Nenhuma PR outbound/CONFENGE aberta foi observada nesses repositórios na consulta.

## Arquivos

- `public-candidates/planejamento-tecnico-licitacoes-obras-publicas/legal-research.md`: fontes oficiais e limites de âmbito.
- `public-candidates/planejamento-tecnico-licitacoes-obras-publicas/offer-contract.json`: contrato estruturado do candidato `CFG-D55`.
- `public-candidates/planejamento-tecnico-licitacoes-obras-publicas/public-copy.md`: copy integral candidata.
- `public-candidates/planejamento-tecnico-licitacoes-obras-publicas/applicability-matrix.md`: matriz modular sem escopo aberto.
- `public-candidates/planejamento-tecnico-licitacoes-obras-publicas/traceability-example.md`: exemplo sintético das ligações entre peças.
- `b2g-conservation-baseline.json`: baseline verificável de rotas, links, canais e hashes.
- `b2g-conservation-audit.md`: inventário e contrato antes/depois.
- `mv-09-integration-fragment.md`: alterações que pertencem aos owners de catálogo, HTML, registry, captura e shell.
- `tests/campaigns/mv-07/`: gates locais.

## Hipóteses e medição

**Visitante:** equipe de Prefeitura, Secretaria, Câmara, autarquia, estatal, consórcio ou outro ente na fase preparatória.

**Aquisição:** quem busca ETP/TR/projeto/orçamento para obra pública reconhece o resultado e o lado contratante sem confundir a página com análise de edital para construtora.

**Conversão:** contexto mínimo e sem upload inicial aumenta a conclusão da triagem e permite barrar conflito antes do acervo.

**Eventos futuros, sem PII:** visualização da oferta, escolha de papel, ação principal, início/conclusão da triagem, aceite/rejeição do transporte e estado de qualificação. Proposta, receita e outcome retornam pelo owner comercial; não nascem no site.

## Dados e autoridade

- Fatos normativos: fontes oficiais do Planalto, Compras.gov.br e legislação profissional, verificadas em 05/09/2026.
- Fatos PNCP: permanecem sob contratos versionados SELECT-only do `extra-cli`; esta campanha não os duplicou.
- Captura: `source=CONFENGE_WEB`; Warmbly é owner de ação comercial.
- Analytics: apenas enums/IDs allowlisted; sem partes, processo, texto livre, arquivos ou contato.

## 100 repetições

Cem demandas percorrem os mesmos módulos, quatro estados de aplicabilidade, checkpoints de conflito e unidade de trabalho. Isso melhora estimativa, perda e margem sem criar cem páginas, SKUs, templates cegos ou decisões administrativas.

## Rollback

Antes da integração, basta remover/reverter os arquivos desta producer. Depois da integração, retirar a nova rota e `CFG-D55` por ID exato, sem tocar nas 14 rotas B2G existentes; preservar solicitações recebidas conforme finalidade/retenção; nunca fazer redirect em massa para a home.

## ADR afetada

ADR-STRAT-002 continua sendo a autoridade da superfície pública única e dos planos truth/public/action. Esta producer não altera a ADR. A ampliação corporativa está coordenada por #577/#578 e PR #590; a integração deve resolver contra a versão aceita pela MV-09.
