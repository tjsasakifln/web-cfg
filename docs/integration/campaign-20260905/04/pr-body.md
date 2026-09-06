CONFENGE_MV_CAMPAIGN=04

READY_FOR_INTEGRATION=BLOCKED:MV-09 deve ativar /servicos/ atomicamente e reconciliar inventários derivados/BOFU

## Resultado

Reconstrói a home e o shell das rotas da campanha para apresentar a CONFENGE como marca guarda-chuva de Engenharia, Perícias e Inteligência Técnica. A entrada passa a ser por cinco situações reconhecíveis; obras públicas preserva sua vertical, rotas e prova PNCP próprias.

Fecha #582 como implementação producer; contribui para #577 sem absorver os owners de autoridade, captura multi-vertical ou taxonomia.

## Evidência e hipótese

- Visitor job: entender em cinco segundos o que a CONFENGE é, reconhecer a situação e escolher um próximo passo seguro.
- Hipótese: categoria + benefício + chooser por situação reduz saída de tráfego frio multi-vertical e aumenta triagem aplicável sem regredir o patrimônio B2G.
- Base final: `3552cf228424ebb8f34266f671fd80df43d0615c`, após rebase nos merges das PRs #604 e #612. A auditoria começou em `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`.
- Estado anterior: home exclusivamente B2G e `/servicos/` com 301 para `/servicos-obras-publicas/`.
- Decisão: `EXECUTE_NOW`; frente `INBOUND ENGINE`; alavancas receita, conversão, confiança, distribuição e cliente.
- Tempo para evidência: primeira sessão de produção e janela inicial de 14 dias.

## Mudanças

- primeira dobra 390×844 com categoria, benefício, um CTA dominante, caminho de escolha e três sinais de confiança;
- chooser por cinco situações, não por organograma;
- entregáveis e limites em português direto;
- números PNCP confinados à seção B2G;
- `/servicos/` corporativo, self-canonical e `noindex,follow` até ativação fail-closed pela MV-09;
- redirect exato `/servicos/` removido; URLs B2G preservadas;
- contratos, geradores e testes de marca/shell/nav atualizados;
- fontes do shell limitadas a `/` e `/servicos/`, mantendo outros 211 HTMLs
  byte-stable; o build promove navegação e CTA genérico corporativos no
  artefato mutável, sem sobrescrever CTAs comerciais versionados nem rotas
  congeladas.

Dependência de integração: MV-09 deve incluir `servicos` no allowlist do
artefato e compor essa ativação com a remoção do redirect no mesmo merge. Esta
PR producer, isoladamente, não é publicável.

A home passa de 128 para 129 ações rastreáveis e preserva, no contexto B2G,
os caminhos protegidos de entrega demonstrativa e diagnóstico. O contrato de
contagem e o inventário derivado em `data/commercial/` e `docs/commercial/`
estão fora do `WRITE_SET`: MV-09 deve revisar os 129 destinos, atualizar a
expectativa e regenerar o inventário conforme o fragmento. O pretest da
producer fica deliberadamente vermelho por esse drift até a composição.

O gate CSS também sinaliza classes da home anterior agora sem uso e um novo
token de raio; o gate BOFU sinaliza apenas o novo hash de `_redirects`. Os dois
baselines estão fora do `WRITE_SET` e têm reconciliação restrita descrita no
fragmento para MV-09.

## Data owner, analytics e privacidade

- contratos: `data/site/brand.json` e `data/site/public-ia-map.json`;
- `extra-cli` continua autoridade de fatos/identidade/proveniência; nenhum crawler ou modelo paralelo foi criado;
- `warmbly` continua autoridade de ação comercial; origem do runtime permanece `CONFENGE_WEB`;
- eventos existentes e sem PII: `cta_click`, `email_click`, `whatsapp_click`;
- inbound continua iniciado pelo visitante e não autoriza outbound/SMTP.
- `/triagem-tecnica/` já existe, mas seu recebimento externo está fail-closed;
  o CTA mantém o fallback local de e-mail/WhatsApp até autoridade final comum.

## Qualidade

- `python3 -m pytest scripts/site/test_brand_contract.py scripts/site/test_home_conversion_contract.py scripts/site/test_public_ia.py -q`
- `python3 scripts/site/test_nav_taskflow.py`
- `python3 scripts/site/shell_nav.py --check`
- `python3 scripts/site/render_nav_hubs.py --check`
- `node scripts/site/test_redirects.mjs`
- `node scripts/site/test_home_first_fold.mjs` com Chrome local e bibliotecas do runner
- `npm run test:ui`
- `npm run test:design`
- `npm run test:copy`
- `npm run test:analytics`
- `npm run test:inbound-gates`
- `npm run inbound:gates` (`ok: true`; candidato `/servicos/` reportado como aviso fail-closed)
- `npm run test:first-fold-contract` (1740/1740 checks)
- `npm run test:copy-contract` (424/424 checks)
- `npm run test:contract-analysis` (212 passed)
- `npm run test:knowledge-funnel` (14 passed)
- `npm run test:real-proof-registry` (zero problemas)
- `npm run test:integrity-promotion-gate` (3944/3944 checks)
- `npm run validate:seo` (zero erros e avisos)
- `npm run test:bofu-dominance` sinaliza somente o hash esperado de `_redirects`
- `npm run audit:css-usage` sinaliza somente o baseline derivado fora do owner
- `npm run test:cta-form-next-state` sinaliza 129 CTAs contra o baseline 128
- `npm test` passou integralmente no ensaio temporário com os quatro contratos
  de integração reconciliados; todos foram restaurados antes do push

## Rollback e integração

Rollback por revert deste SHA; sem migração de dados, redirect em massa, merge ou deploy. A ADR afetada e as edições fora do write set estão documentadas em `docs/integration/campaign-20260905/04/mv-09-integration-fragment.md`.

## Teste de 100 repetições

Cem demandas alimentam cinco situações e uma triagem comum; não criam cem páginas, formulários ou filas. A North Star é oportunidade comercial qualificada conectada a proposta/receita, não volume de páginas, cliques ou mensagens.
