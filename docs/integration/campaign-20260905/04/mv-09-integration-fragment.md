# Fragmento de integração para MV-09

Este arquivo descreve edições necessárias que MV-04 não realizou porque os destinos pertencem a outro owner ou estão no `DO_NOT_TOUCH`.

## 1. Ativar `/servicos/` como família pública

Hoje a página candidata usa canonical próprio e `noindex,follow`. Antes de remover `noindex`:

1. declarar a rota exata `/servicos/` em `data/organic/public-family-registry.json`;
2. registrar visitor job, perfil, ação terminal e cobertura de gate coerentes com o chooser corporativo;
3. confirmar que a rota não exibe preço e não introduz exceção comercial;
4. incluir `servicos` no allowlist do artefato público em
   `scripts/pseo/public_artifact.py`; a MV-04 não tocou esse arquivo e o build
   isolado ainda não copia a página candidata para `_site`;
5. atualizar somente a entrada exata de `https://confenge.com.br/servicos` em
   `data/organic/legacy-url-inventory.json`: a decisão deixa de ser `keep_301`
   e passa a ser `MIGRATE` para a canonical própria `/servicos/`, sem alterar
   ou redirecionar em bloco qualquer outra URL legada;
6. adicionar a rota ao sitemap por meio do owner competente;
7. executar `npm run build:site`, confirmar `_site/servicos/index.html` e rodar
   `npm run inbound:gates` mais os gates SEO/canonical aplicáveis;
8. só então trocar `noindex,follow` por `index,follow`.

Não criar uma isenção permanente para contornar a declaração.
O merge deve ser atômico com essa integração: a remoção do redirect exato não
deve ser publicada sem a página presente no artefato.

Enquanto essa decisão não for gravada pelo owner, `organic:test` falha de modo
esperado com `missing redirect for /servicos`; não restaurar o 301 na producer
para mascarar essa dependência.

## 1.1. Regenerar o inventário derivado de CTAs

A home corporativa preserva, dentro da vertical B2G, a transferência para o
Dossiê de Medição, Glosa e Pagamento, o demonstrativo de relatório e o
diagnóstico de expansão. As ações corporativas cobrem cinco situações,
triagem e sinais de confiança. A quantidade derivada passa de 128 para 129, mas
`docs/commercial/cta-form-next-state-inventory.json` pertence a outro owner e
não foi alterado pela producer. Depois de compor as campanhas, executar:

1. atualizar `data/commercial/cta-form-next-state.v1.json` para
   `expected_declared_ctas: 129`, depois de revisar os 129 destinos;
2. regenerar e validar o inventário:

```bash
node scripts/commercial/cta_form_next_state_audit.mjs --write docs/commercial/cta-form-next-state-inventory.json
npm run test:cta-form-next-state
```

Revisar o diff antes do merge. O teste passou com o inventário regenerado
temporariamente; sem essa integração, o pretest da PR producer deve falhar de
forma explícita por drift do inventário.

## 1.2. Reconciliar baseline CSS e snapshot BOFU

A troca estrutural da home deixa 33 classes de `styles.css` e quatro classes de
`entregas/styles.css` sem uso, e eleva `border_radius` de 137 para 138. O
baseline `data/design/css-usage-baseline.json` está fora do `WRITE_SET`. Depois
de compor as campanhas, revisar se cada classe pode ser removida ou ainda é
consumida por outra fonte antes de executar:

```bash
python3 scripts/site/audit_css_usage.py --write
npm run audit:css-usage
```

A remoção exata do redirect de `/servicos/` também altera `_redirects`, um
arquivo coberto por `data/bofu-dominance/frozen-specs/hashes.json`. A MV-09 deve
recapturar o hash de `_redirects` somente no commit de integração revisado,
atualizar `baseline_commit`, data e motivo, e executar
`npm run test:bofu-dominance`. Não recapturar as seis páginas BOFU nem usar a
recaptura para esconder qualquer outro drift.

## 1.3. Promover a rota de triagem quando houver autoridade

A PR #604 publicou `/triagem-tecnica/`, mas o submit permanece fail-closed até
Governance e Warmbly compartilharem o contrato final. MV-04 preserva
`/#triagem-tecnica` como fallback iniciado pelo visitante. Quando a autoridade
externa estiver disponível e os checks de readback/idempotência passarem, MV-09
pode migrar `navigation.cta`, situações não B2G e rodapés para
`/triagem-tecnica/`. Não usar a mudança de link para habilitar outbound ou SMTP.

## 2. Expandir o shell para todas as páginas

`data/site/public-ia-map.json` contém temporariamente `rollout.shell_scope=campaign_routes_only`. Assim, `scripts/site/shell_nav.py` altera apenas `/` e `/servicos/`; os demais 211 documentos com shell compartilhado permanecem byte-stable nesta PR.

Na integração coordenada:

1. resolver conflitos com as outras campanhas na ordem definida por MV-09;
2. remover o rollout temporário ou mudar o escopo para a ativação global acordada;
3. executar `python3 scripts/site/shell_nav.py --write`;
4. executar os renderizadores de hubs afetados;
5. revisar diffs gerados, breadcrumbs e active states;
6. rodar gates de navegação, copy, acessibilidade, conversão, SEO e inbound antes do merge.

O shell corporativo esperado contém `Serviços e problemas`, `Obras públicas`, `Biblioteca` e `Iniciar triagem`. As rotas B2G continuam com canonical e entrada próprias.

## 3. Atualizar a decisão arquitetural

`docs/architecture/ADR-STRAT-002-confenge-canonical-public-surface.md` ainda descreve a CONFENGE como ativo exclusivamente B2G. Atualizar a ADR antes da ativação global para registrar:

- CONFENGE como marca guarda-chuva de engenharia, perícias e inteligência técnica;
- obras públicas/B2G como vertical forte, não categoria corporativa inteira;
- `confenge.com.br` como única superfície pública;
- `extra-cli` e `warmbly` com as autoridades já definidas;
- rollout reversível por rota/família e preservação das URLs B2G.

## 4. Conflitos conhecidos

- PR #597 também altera home/shell e muitos HTMLs gerados. Não aplicar em bloco: selecionar semântica compatível e regenerar a partir dos contratos já integrados.
- PR #603 reforça linguagem pública. Reexecutar o gate de linguagem após a composição; não transportar jargão de contratos técnicos para a copy.
- alterações em registry, sitemap, `package.json` ou workflows devem ficar com seus owners.
