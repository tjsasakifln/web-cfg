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
5. adicionar a rota ao sitemap por meio do owner competente;
6. executar `npm run build:site`, confirmar `_site/servicos/index.html` e rodar
   `npm run inbound:gates` mais os gates SEO/canonical aplicáveis;
7. só então trocar `noindex,follow` por `index,follow`.

Não criar uma isenção permanente para contornar a declaração.
O merge deve ser atômico com essa integração: a remoção do redirect exato não
deve ser publicada sem a página presente no artefato.

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
