# Remediação sistêmica de layout — 2026-08-23

## Decisão e hipótese

- Estado P0: `EXECUTE_NOW`.
- Frente executiva: Inbound Engine.
- Visitor job: entender rapidamente entradas, saídas, critérios, evidências e próximo passo de cada oferta sem confundir conteúdos distintos.
- Hipótese: restaurar contratos visuais compartilhados aumenta confiança e compreensão nas rotas comerciais e editoriais sem alterar copy, SEO ou conversão.
- Evidência esperada: nesta janela, regressão geométrica zero; depois do deploy, monitoramento normal de oportunidades comerciais qualificadas. A mudança não cria uma métrica de página ou volume como North Star.
- Leverage: confiança, distribuição e automação. Repetir a correção 100 vezes melhora o sistema porque novas rotas reutilizam primitives e o gate sitewide, em vez de exigir 100 patches.

## Causa raiz

O HTML de `/diagnostico-b2g-360/` já separava label e value em elementos distintos. A concatenação era visual, não de dados, MDX ou hydration. O commit `ebdc4057` (`feat(home): compress to seven narrative blocks with clear CTA hierarchy`) removeu regras compartilhadas de `styles.css` e deixou somente um seletor vazio de compatibilidade para classes que continuaram presentes em oito páginas de oferta.

Sem `display`, `grid` e `gap`, elementos como `.content-trails > a`, `.compare-split`, `.decision-map` e `.faq-layout` voltaram ao fluxo inline/default do navegador. Por isso o DOM correto era pintado como `ENTRADADocumentos necessários`.

A auditoria revelou a mesma classe em famílias adjacentes:

- templates de análise contratual e panorama continham hooks sem shell compartilhado;
- o diretório de conteúdo mantinha um grid histórico de três tracks, mas o markup atual tem um único `.dir-body`;
- pilotos legados usavam `nav-desktop` e tabelas sem contenção responsiva;
- a tabela do Radar não possuía contenção horizontal;
- formulários raros e disclosures tinham alvos abaixo de 44 px;
- o CTA de acompanhamento não permitia shrink adequado para texto longo.

## Correção upstream

- escala versionada `--space-*` em tokens CSS e no design system JSON;
- primitives de conteúdo editorial, label/value, comparação, mapa de decisão, FAQ, formulário e tabelas de dados;
- shells legíveis para análise contratual e panorama de mercado;
- regras responsivas mobile-first com tracks `minmax(0,1fr)`, wrapping e shrink explícitos;
- compatibilidade compartilhada para os 15 pilotos, sem patches por rota;
- correção estrutural do diretório quando existe somente `.dir-body`;
- auditoria renderizada baseada no manifesto público e ligada a `npm run test:ui`;
- coletor de screenshots corrigido para Chrome configurável, disclosures fechados e sticky chrome.

Não foram adicionados `!important`, hardcodes de copy ou alteração de conteúdo para esconder layout.

## QA adversarial

Baseline em produção: 12 rotas críticas × 6 larguras = 72 checks; 60 combinações falharam, com 196 observações entre primitive ausente, concatenação label/value, clipping, overflow e touch targets.

Depois da primeira correção, a varredura completa encontrou 30 combinações residuais nos pilotos, Radar, Termos, Ops e um disclosure. O gate móvel foi então endurecido de 40 para 44 px e encontrou mais quatro combinações em Conteúdos e Nurture. Também foi eliminado um falso positivo de CSS medido antes do carregamento e um erro do coletor ao capturar componentes dentro de `<details>`.

Resultado final local:

- 211 rotas do `seo/PUBLIC-ARTIFACT-MANIFEST.json`;
- 360, 390, 768, 1024, 1440 e 1920 px;
- 1.266 combinações renderizadas;
- zero falha de overflow horizontal, clipping, overlap label/value, concatenação, primitive ou touch target;
- teste de UI também cobre 320 px, zoom 200–400%, teclado, foco, reduced motion e Axe.

Relatórios: [baseline de produção](before-layout-audit.json) e [resultado sitewide](after-layout-audit.json).

## Evidência visual

Caso original:

- [desktop antes](before/diagnostico-b2g-360-component-1-1440x1000.png) → [desktop depois](after/diagnostico-b2g-360-component-1-1440x1000.png)
- [mobile antes](before/diagnostico-b2g-360-component-1-360x800.png) → [mobile depois](after/diagnostico-b2g-360-component-1-360x800.png)

Outras famílias:

- comparação: [antes](before/defesa-margem-contratos-publicos-component-1-1440x1000.png) → [depois](after/defesa-margem-contratos-publicos-component-1-1440x1000.png)
- mapa de decisão: [desktop](after/bid-room-licitacoes-obras-component-1-1440x1000.png) e [mobile](after/bid-room-licitacoes-obras-component-1-360x800.png)
- diretório editorial: [mobile](after/conteudos-component-1-360x800.png)
- análise contratual: [mobile](after/analises-contratos-publicosaditivo-saldo-component-1-360x800.png)
- panorama: [desktop](after/panorama-mercado-obras-publicasobras-pub-component-1-1440x1000.png)

## Contratos, analytics e rollback

- Data owner/contract: nenhum contrato de aquisição, identidade ou proveniência foi alterado. `extra-cli` continua owner e SELECT-only.
- Conversão: markup, URLs, formulário, eventos e handoff permanecem; `CONFENGE_WEB` e o contexto de próxima ação não mudaram.
- PII: nenhuma nova captura ou atributo analítico.
- SEO: canonical, metadata, structured data, robots e URLs preservados.
- ADR afetado: nenhuma mudança de boundary. A implementação permanece compatível com ADR-STRAT-002 e RUNTIME-AUTHORITY.
- Rollback: reverter os commits desta remediação restaura CSS/tokens/componentes e scripts de QA; não há migração de dados nem alteração irreversível.
- BOFU frozen spec: os seis HTMLs protegidos permanecem byte-identical. Os hashes dos dois stylesheets foram recapturados de forma revisada contra o commit de implementação `9d0f75e8`, após QA visual e auditoria sitewide verdes.

## Integração e produção

Este bloco será preenchido com commit, PR, deploy e smoke test público após a integração pelo fluxo normal.
