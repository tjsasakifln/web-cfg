# Decisões de design — redesign da experiência do visitante

## Conceito

**Publicação editorial-técnica institucional**, não dashboard SaaS nem template de startup.

Combina:

- clareza de consultoria de alto valor;
- sobriedade de documentação de engenharia;
- ritmo de leitura editorial;
- conversão sem agressividade comercial.

## Tokens

- **Verde** (`--green-700`): ação primária e estado positivo — não borda decorativa em tudo.
- **Navy** (`--navy-950` / `#071a31`): autoridade em faixas e painéis de prova, sem page-wide dark.
- **Raio**: preferência `4–8px` onde necessário; listas editoriais sem raio/caixa.
- **Leitura**: `--read-measure: 68ch`; corpo desktop 18px / mobile 16px; line-height ~1.65.
- **Foco**: anel verde visível; `prefers-reduced-motion` respeitado.

## Primitivas (não são “variantes de card”)

1. **Narrativa editorial** — seções com respiro, sem moldura.
2. **Lista de decisão** — `journey-list` / `journey-row` com um caminho dominante.
3. **Sequência / processo** — etapas do checklist (`tool-step`).
4. **Evidência técnica** — matriz tipográfica no hero (ilustrativa).
5. **Comparação** — tabelas existentes, sem glass.
6. **Ferramenta interativa** — workbench largo (`tool-shell` ~1088px).
7. **Chamada comercial** — um CTA primário por viewport; secundário subordinado.
8. **Diretório** — linhas com tema + título + descrição; busca prioritária.

## Home

- Nav mental em 4 grupos + CTA **Analisar meu caso**.
- Hero: H1 + lead + 1 primário + 1 secundário (caminhos) + credenciais.
- Evidência: matriz fato→prova→impacto marcada como ilustrativa (não case).
- Jornadas em lista editorial; **contrato sob pressão** visualmente dominante.

## Hub `/conteudos/`

- Hero pergunta o problema; busca antes de taxonomia.
- Destaque: 1 lead + links compactos (não 6 caixas).
- Temas em 3 estágios de jornada; zero conteúdo = omitido da nav principal.
- Pluralização `1 guia` / `N guias`.
- Removidos: guias indexáveis, frentes, eixos, cluster cards, hub-metrics.

## Checklist

- Intro + **Iniciar diagnóstico**.
- 4 etapas; progresso de preenchimento ≠ prontidão jurídica.
- Diagnóstico sob demanda (**Ver diagnóstico**); progresso auto-atualiza.
- Opções em segmented control ≥44px; secundárias discretas; apagar com confirmação.
- Sticky bar mobile só durante preenchimento.

## Compromissos deliberados

- Não reescrever material jurídico aprovado.
- Não fabricar cases, métricas ou depoimentos.
- Não instalar framework front-end.
- Bid Room / Contract Defense permanecem como nomes secundários explicados em PT.
- Aprovação visual final é humana — esta PR não declara vitória estética.
