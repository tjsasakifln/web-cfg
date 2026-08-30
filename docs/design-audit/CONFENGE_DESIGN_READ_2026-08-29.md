# CONFENGE_DESIGN_READ_2026-08-29

**Campanha:** `WEB_CFG_HUMAN_CRAFTED_DESIGN_BACKLOG_20260829`  
**Leitura contemporânea:** 2026-08-30  
**Produção observada:** `https://confenge.com.br/`  
**SHA contemporâneo de `origin/main`:** `b4cafc4fe0a005c3769a7b6acde882ff1f9d65d8`  
**SHA live/screenshot:** `7500d7bdeb325f9f72e38b72e7fd6bb6db29f680` — o delta é somente o quality gate do PR #483, sem HTML/CSS/JS/assets públicos.  
**Decisão:** `VALIDATE` uma direção Technical Editorial antes de congelar ou expandir tokens.  
**Frente executiva:** INBOUND ENGINE  
**Alavancas:** trust, conversion, customer e automation  
**Tempo até evidência:** protótipos comparáveis em um ciclo de design; percepção humana somente após teste real.

## Audience

Direção, engenharia, licitações e contratos de construtoras que atuam em obras públicas. O visitante relevante é competente, tem pouco tempo, conhece risco técnico e comercial e tende a desconfiar de promessa sem fonte, método, limite ou artefato verificável.

## Context

As páginas apoiam decisões de alto valor: alocar capital e equipe numa licitação, precificar risco, registrar fatos contemporaneamente, proteger caixa e margem, comparar escopos, contratar uma análise e sustentar posições técnicas. O conteúdo envolve documentação, orçamento, cronograma, medição, contrato, fonte pública, incerteza e responsabilidade profissional.

O site não é um software que precisa parecer inovador. É a superfície pública de uma consultoria técnica B2B brasileira que precisa parecer capaz de ler documentos difíceis, organizar evidência e produzir uma decisão defensável.

## Desired visual language

### Technical Editorial / Engineering Intelligence

Uma combinação de:

- publicação técnica, com medida de leitura, índice, captions, fontes, notas e hierarquia de documento;
- relatório de engenharia, com keylines, tabelas, matrizes, cronologias, anotações, unidades, status e memória de cálculo;
- consultoria executiva, com tese clara, argumento escalonado, prova próxima e uma ação dominante;
- instrumento produtivo, quando o visitante calcula, compara, preenche ou decide;
- precisão institucional contemporânea, sem teatralidade tecnológica.

A linguagem deve ser sóbria, precisa, profissional, autoral, tecnicamente competente, editorialmente refinada, confiável para comprador B2B cético e reconhecível como brasileira e ligada a obras públicas.

### Duas marchas, uma marca

- **Expressiva:** home, páginas comerciais, artigos e trust. Usa dominância, composição e tipografia para ordenar tese, evidência e consequência.
- **Produtiva:** ferramentas, formulários, tabelas, resultados e inteligência pública. Usa densidade, estabilidade, unidades, método e estados para apoiar tarefa.

Uma página pode ser híbrida, mas cada região deve declarar a marcha e o motivo. Whitespace de campanha não deve contaminar uma tabela; densidade de instrumento não deve apagar a tese comercial.

## O que esta direção não significa

Não significa serif em tudo, off-white, mono, números `01/02/03`, keylines ou assimetria como novo preset. Também não significa simular AutoCAD, blueprint, dashboard, tela de terminal ou relatório inexistente.

Não deve parecer:

- startup de IA ou SaaS;
- dashboard genérico ou banco digital;
- escritório jurídico clichê;
- construtora institucional dos anos 2000;
- landing page de infoproduto;
- coleção de cards premium;
- Awwwards experimental que dificulte confiança ou tarefa;
- resultado de prompt “editorial brutalist engineering website”.

## Identificadores visuais derivados do negócio

Usar apenas quando comunicarem conteúdo real:

- pranchas e keylines de relatório;
- índices documentais e numeração funcional;
- referências de planilha e célula;
- cronologias de fatos e protocolos;
- matrizes de risco, responsabilidade e decisão;
- mapas e recortes de fonte pública;
- tabelas de quantitativo, preço, medição e cenário;
- footnotes, fonte, data de corte, versão, status e ressalva;
- fragmentos de documento, memória de cálculo e artefato CONFENGE;
- annotations que conectem fato, cálculo, inferência, lacuna e próxima ação.

O teste é informacional: se o elemento for retirado, o visitante perde entendimento, rastreabilidade ou contexto. Se nada for perdido, ele é decoração e precisa de justificativa excepcional.

## Princípios de direção

1. **Job antes de estilo.** A composição nasce da decisão do visitante e da evidência necessária.
2. **Estrutura antes de surface.** Regra, coluna, contraste, tabela e whitespace resolvem agrupamento antes de card, radius ou shadow.
3. **Tipografia por papel.** Tese, leitura, interface, número, legenda, fonte e nota não são apenas pesos diferentes da mesma headline sans.
4. **Evidência como mídia principal.** Documento, tabela, mapa, cronograma e fonte superam ornamento técnico abstrato.
5. **Um elemento dominante por seção.** Claim, prova, consequência ou ação; nunca quatro componentes com peso igual por default.
6. **Consistência sem clonagem.** Tokens comuns, arquétipos distintos por job.
7. **Mobile reeditado.** Ordem, densidade, comparação e prova são recompostos; mobile não é desktop empilhado.
8. **Motion explica relação.** Feedback, estado, navegação ou continuidade espacial; nenhum ritual de reveal/lift.
9. **Exceção declarada.** Gradient, radius, shadow, serif, ícone ou animação não são proibidos, mas têm papel e evidência.
10. **Canário e rollback.** Direção grande passa por 2–3 protótipos, uma superfície canário e comparação reproduzível antes de escala.

## O que já merece ser preservado

- proposta e destinatário compreensíveis na primeira dobra;
- CTA dominante e captura fail-closed;
- linguagem direta sobre edital, contrato, margem e obra;
- rótulos honestos para exemplos sintéticos e ausência de prova real;
- fonte, data, método, limitações e política editorial visíveis;
- relatório público, tabelas, tool workflow e artefatos demonstrativos já existentes;
- fotografia real do responsável técnico;
- semântica, acessibilidade, responsive, targets de 44 px, JS-off suportado, SEO, performance, analytics e privacidade;
- paleta navy/green como base institucional, com verde como sinal de decisão;
- `confenge.com.br` como única superfície e `CONFENGE_WEB` como source de conversão.

## Teste contrafactual

Ao remover logo/nome e substituir copy por texto neutro:

- **Home:** conserva alguma materialidade por relatório/PNCP, mas a primeira dobra ainda pode ser de consultoria genérica. `GENERIC_IDENTITY_RISK: HIGH`.
- **Entregas:** a taxonomia 8/54, estados, preços e estrutura de decisão preservam especificidade; a repetição de caixas reduz autoria. `GENERIC_IDENTITY_RISK: MEDIUM`.
- **Money page:** hero com capa, eyebrow, H1, lead e CTA é amplamente intercambiável; a especificidade aparece depois. `GENERIC_IDENTITY_RISK: HIGH`.
- **Artigo:** fontes, checklist e sequência técnica ajudam, mas o shell de content marketing é genérico. `GENERIC_IDENTITY_RISK: MEDIUM-HIGH`.
- **Ferramenta:** premissas, etapas, unidades e resultado sinalizam instrumento técnico. `GENERIC_IDENTITY_RISK: LOW-MEDIUM`.
- **Inteligência pública:** metodologia, tabelas, source/freshness e limitações continuam reconhecíveis. `GENERIC_IDENTITY_RISK: LOW`.
- **Trust:** retrato real e credenciais ajudam; related cards e hero genérico diluem. `GENERIC_IDENTITY_RISK: MEDIUM`.

## Conclusão

A hipótese Technical Editorial é validada como direção, não como estilo pronto. O repositório já declara “engenharia editorial premium”, porém a declaração antecedeu uma comparação prototype-first e ainda convive com um render dominado por system sans, hero compartilhado, surfaces repetidas e CSS legado. A próxima decisão correta é ratificar uma Visual Constitution sobre três composições representativas — comercial, leitura/evidência e instrumento — e então implementar por canários, sem big-bang.

O efeito de 100 repetições só melhora o sistema se cada nova superfície herdar keylines, papéis tipográficos, provenance, archetype e gate. Produzir 100 composições artesanais sem contrato apenas cria 100 unidades de trabalho.

## Base externa

Ver [Pesquisa externa — direção visual humana e anti-genericidade](../research/DESIGN_RESEARCH_HUMAN_CRAFTED_2026-08-29.md), que lê criticamente as skills obrigatórias e 12 sites oficiais sem instalar, copiar ou versionar terceiros.
