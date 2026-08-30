# Canário de ruptura visual — a home como planilha

**Campanha:** `CONFENGE_DESIGN_BREAKTHROUGH_CANARY_20260830`
**Issue:** #525 · **Parent:** #493 · **Supersede estético de:** #494 (`KEEP_CURRENT`, commit `583d2d88e`)
**Estado da decisão:** `EXECUTE_NOW` · **Frente executiva:** INBOUND ENGINE
**Tempo até evidência:** um canário, uma rota, medido nos mesmos cinco viewports do protocolo.
**Alavancas:** trust, distribution, customer.
**North Star:** oportunidades comerciais qualificadas. Não é page count, não é quantidade de componentes, não é linha de CSS.

---

## 0. `BRAND_OWNER_REJECTED_KEEP_CURRENT_AFTER_LIVE_REVIEW`

A #494 terminou em `KEEP_CURRENT` por empate na regra pré-registrada, e a decisão foi correta **dentro da pergunta que ela fazia**. A pergunta era: *entre dois mecanismos de proveniência, algum vence por margem de dois campos?* Não vencia. Zero byte mudou em rota pública.

O brand owner inspecionou a produção depois disso e registrou que o resultado não atende:

> O site continua sem transformação visual material ou revolucionária. O estado atual é funcional e tecnicamente robusto, mas não é suficientemente distintivo, memorável ou autoral.

Isso **supera a conclusão estética** da #494 sem apagar sua evidência: a `DECISION_RULE_494_PRE_REGISTERED.md` §7 continua no repositório, com as medidas, os hashes e o desfecho intactos. O que muda é o enquadramento do problema.

**O erro conceitual que esta campanha não repete.** A #494 comparou dois *mecanismos* dentro de uma direção única já cravada em gate (`concept = "engenharia editorial premium"`). Comparar mecanismo com mecanismo, sob conteúdo fixo e paleta fixa, **não podia** produzir ruptura perceptível: a variável em disputa era invisível a um metro de distância. Gates técnicos protegem a direção escolhida; eles não escolhem a direção. Aqui a função objetivo é outra — maximizar identidade, clareza, autoridade e diferenciação, sujeito às mesmas restrições duras.

---

## 1. Superfície e escopo

Canário na **home `/` apenas**. Nenhuma das outras 260 rotas foi redesenhada. Nenhum ADR arquitetural foi alterado; nenhuma fronteira foi cruzada.

O veículo é `assets/home-10x.css`, que já existia com a regra *"Do not load on other routes"*, já era fingerprintado pelo build e já estava na baseline de uso de CSS. O rollback é o SHA: revertê-lo devolve a home anterior sem tocar em nenhuma outra família.

Conteúdo e função ficam congelados. Proposta de valor, ICP, visitor jobs, CTA, formulário, Turnstile, consentimento, captura, `CONFENGE_WEB`, analytics, URLs, canonicals, schema, fatos, preços, claims e classificação de prova são os mesmos bytes. A transformação é de composição, hierarquia, tipografia, proporção, ritmo, densidade, superfície e tratamento de dado.

---

## 2. As três direções produzidas

Em `docs/design-audit/prototypes/breakthrough-2026-08-30/`, isoladas do artefato público pelo mesmo caminho fixo que a #494 usou. Copy, dados e fontes idênticos nas três — só a composição varia.

| | Tese de composição | Motor de layout | O que remove do design atual |
|---|---|---|---|
| **A — Planilha** | a página é a planilha orçamentária do ofício | grade global de trilhos nomeados; tudo snapa neles, cabeçalho e rodapé inclusive | container centralizado, cards, hero split, badges, raio, sombra |
| **B — Parecer com aparato de margem** | a página é o parecer técnico que a casa entrega | espinha assimétrica: margem de referência estreita + corpo largo; cada afirmação carrega fonte, artigo, data de corte, unidade e limite na própria linha | cards, simetria, eyebrows, container, hero split |
| **C — Folha de rosto e sumário** | a página abre como um relatório técnico brasileiro abre | capa tipográfica com natureza do trabalho e responsável técnico, depois sumário com linha de chamada, depois hierarquia 1 / 1.1 | landing page inteira; não há trilho nem grade de colunas |

Nenhuma é variação cosmética de outra: os motores de layout são grade de colunas, margem de referência e capa/índice. Lado a lado, a diferença é evidente antes de ler qualquer rótulo.

## 3. A escolha, em prosa

Eliminação por restrição dura, primeiro. **C reprova por herança, não por gosto.** A capa monumental empurra o CTA primário para fora da primeira dobra em 1366×768, e comprimir a capa até o contrato caber destrói exatamente o que a torna memorável. Pior: uma folha de rosto é um artefato de abertura único. Ela não escala para artigo, ferramenta, inteligência pública ou money page — o §14 pede o contrário. C é a mais bonita das três em uma tela e a mais inútil nas outras 260.

A e B sobrevivem às restrições. E elas não são rivais: são a mesma percepção — *a proveniência é a matéria visual dominante* — em duas escalas. A põe o aparato em **colunas**; B põe em **margem**.

**Vence A, e A absorve de B o registro visível da ausência.**

Primeiro, **A é a menos transplantável**. Tire o logo e a copy de A e sobram ITEM · DESCRIÇÃO · UNIDADE · QUANT · FONTE com algarismos tabulares e zero cortado, sob uma régua congelada. Isso é uma folha de custo de obra pública brasileira e nada mais. B, despida dos rótulos em português, é um documento acadêmico — serve a um escritório de advocacia, a um instituto de pesquisa, a uma casa de política pública. A trava no ofício; B trava só no registro.

Segundo, **A põe o dado onde o olho do comprador já vai procurá-lo**. Quem lê planilha de medição toda semana lê da esquerda para a direita até a última coluna. Dar a essa coluna a proveniência — e não um número decorativo — é usar um hábito de leitura que o visitante já tem.

Terceiro, **a célula vazia é honesta e é o mecanismo**. O `—` da planilha é a convenção do próprio ofício para não-aplicável. Onde a seção não tem fonte externa, o trilho FONTE diz `tese da casa` em âmbar, com um quadrado desenhado ao lado: a lacuna aparece, não some, e cor nunca é o único portador. É a propriedade que tornava B convincente, dita no vocabulário que o ofício já tem em vez de numa nota de margem inventada. Na home viva isso incide sobre a própria manchete da casa — a linha mais vendedora da página é marcada como tese, não como fato de fonte pública.

Quarto, **A comprime melhor**. A margem fixa de B taxa todo viewport abaixo de ~1300px, e o contrato de primeira dobra crava 1366 e 1363. Os trilhos de A são estreitos por natureza e colapsam para a vista de célula sem perder o vocabulário.

Nenhum score. Nenhuma média ponderada. Nenhum empate declarado por trade-off.

---

## 4. O que a direção é, concretamente

**Trilhos.** `ITEM · DESCRIÇÃO · UNIDADE · QUANT · FONTE`, declarados uma vez em `--cols` e herdados por cada faixa. Régua congelada no topo, como numa folha aberta. Réguas verticais correndo a altura inteira de cada faixa, para que o espaço à direita de uma descrição curta leia como coluna e não como vazio.

**Os trilhos estreitos carregam verdade, não enfeite.** Toda linha é conferível na própria página: `3 portas`, `1–2 dias úteis`, `4 ofertas`, `3 registros`, `8 critérios`, `PNCP · 21/08/2026`, `EESC-USP`. Nenhum número inventado, nenhum agregado de preço derivado, nenhum dashboard ornamental.

**Uma superfície escura, e só uma.** A faixa de captura é a linha de total da folha. Foi para lá que o navy foi, plano em vez de gradiente, e é lá que o formulário vira a ficha inserida na linha. O `--lime` sai da home: os dois call sites que restavam (`eyebrow` das entregas e ícones de canal) viraram verde-decisão e branco, o que também afasta a página do agrupamento "escuro + acento ácido" que o brief da #494 registrou como risco.

**Tipografia.** Archivo v2.001 (Omnibus-Type, SIL OFL 1.1), subconjunto latino pt-BR, **um arquivo**, dois eixos: peso 100–900 e largura 62–125. O eixo de largura é a alavanca: título condensado com peso institucional, texto em largura normal, rótulos de coluna estreitos e caixa-alta. `tnum` e `zero` ligados, então valor e quantidade alinham em coluna e o zero é cortado — que é como planilha de obra se lê. Não há segunda família, não há mono como textura, não há serif de display. O `.type-serif` da manchete deixa de ser um serif de sistema e passa a ser o mesmo Archivo em largura expandida: a linha continua estratégica, sem trocar de desenho no meio da frase.

**Estados.** Hover de linha marca a faixa com uma barra de tinta à esquerda — seleção de linha, que é o gesto da planilha, e não elevação. Sem lift, sem sombra, sem transform. Foco visível com halo invertido sobre a faixa escura, para o anel medir contraste contra ela também.

**Mobile é desenhado, não empilhado.** Abaixo de 900px os trilhos colapsam na vista de célula: os rótulos `ITEM / UNIDADE / QUANT / FONTE` deixam de ser visualmente ocultos e aparecem ao lado do valor, numa faixa rotulada acima da descrição — do jeito que uma planilha colapsa no telefone.

---

## 5. Delta de custo declarado

O primeiro webfont do site sobe o orçamento em `data/site/design-system.json` de `font_files_max: 0 / font_total_gzip_kb_max: 0` para `1 / 64`, com o arquivo medido em **63,7 KB gzip**, servido de `assets/archivo-var-latin-fa9c0ffd.woff2` e carregado **só na home**. Isso é exatamente o que a nota do próprio orçamento previa: *"O primeiro webfont deve elevar estes dois números neste arquivo, para que apareça como delta revisado em vez de ser absorvido em silêncio."*

Os tetos do módulo **não se movem**: `FONT_FILES_CAP = 6` e `FONT_GZIP_CAP_KB = 120` continuam em `scripts/site/audit_performance.py`, e um segundo webfont não declarado continua reprovando. A baseline em `docs/performance/PERFORMANCE-BUDGET-BASELINE.json` foi reancorada no mesmo commit, porque ela é o anchor do delta.

**A revisão adversarial pagou por si aqui.** O primeiro corte do subconjunto foi
escolhido a mão, codepoint a codepoint, e deixou de fora dois caracteres que já
estavam em copy visível: o `²` de `4.710 m²` no registro do PNCP e o `©` do
rodapé. Glifo ausente não levanta erro — o navegador troca de família só naquele
caractere, então a página fica com dois desenhos e ninguém nota até alguém olhar
uma captura de perto.

A correção não foi comprar cobertura com bytes. Subir o subconjunto para o bloco
Latin-1 inteiro custaria ~14 KB de glifos que o site quase nunca usa e ainda
deixaria a armadilha aberta um bloco adiante. Em vez disso o subconjunto ganhou
o vocabulário aritmético que uma casa de engenharia digita sem avisar — `m²`,
`m³`, `±`, `½`, `©`, `®`, `µ`, `÷`, menos tipográfico — e a classe do defeito
foi fechada por um gate: `scripts/site/test_font_glyph_coverage.py` deriva as
rotas que carregam webfont local, compara o texto renderizado de cada uma com o
`cmap` do subconjunto e reprova se sobrar qualquer caractere. Ele tem negativa
própria, para que um refactor futuro não o transforme em no-op, e carve-out
estreito para o glifo decorativo que a folha esconde por CSS — válido só
enquanto ele continuar `aria-hidden`.

O gate encontrou mais dois na primeira execução: os três protótipos ainda
apontavam para o hash antigo da fonte, e o rodapé da direção A usava `Σ`, que o
subconjunto não tem.

Duas asserções de teste que cravavam o literal `0` — `font_files_total == 0` e `font_files=0/0` — foram reancoradas no orçamento **declarado**. Elas afirmavam a árvore do dia em que o orçamento foi calibrado; agora afirmam o contrato, que é o que não pode deslizar. As negativas sintéticas que provam o mecanismo (arquivo acima do orçamento, gzip acima do orçamento, `@font-face` sem arquivo resolvível, link do Google Fonts, teto do módulo) continuam intactas e verdes.

---

## 6. Herança: como esta direção sai da home

A unidade de herança é o **conjunto de trilhos**, não a forma da seção. A money page não precisa parecer a home; o artigo não precisa parecer a ferramenta. O que viaja é o registro.

| Primitivo da home | Money page | Artigo | Inteligência pública | Ferramenta | Entregas |
|---|---|---|---|---|---|
| **Régua de coluna congelada** | régua de oferta: escopo · prazo · preço | régua de leitura: seção · fonte · data de corte | régua de série: recorte · período · fonte | régua de instrumento: entrada · unidade · limite | régua de catálogo: item · estado · SLA |
| **Trilho ITEM** | item da escada de ofertas | numeração de seção do artigo | id do recorte | passo do instrumento | item do rol taxativo |
| **Trilho UNIDADE** | unidade cobrada (mês, pontual) | unidade do fato (R$, dias, %) | unidade da série | unidade do campo | unidade da entrega |
| **Trilho QUANT** | quantidade contratada | quantidade citada | tamanho da amostra | valor calculado | quantidade de itens |
| **Trilho FONTE** | ofertas publicadas / contrato | fonte primária + data de corte | PNCP / base pública + corte | norma ou artigo que fundamenta o cálculo | oferta que entrega o item |
| **Célula `—` / `tese da casa`** | preço ainda não publicado aparece marcado | afirmação sem fonte primária aparece marcada | série sem atualização aparece marcada | campo sem norma aparece marcado | item sem SLA aparece marcado |
| **Faixa escura única** | a linha de contratação | o bloco de conclusão | o bloco de método | o bloco de resultado | a linha de próxima ação |
| **Vista de célula (mobile)** | idêntica | idêntica | idêntica | idêntica | idêntica |

O que garante consistência sem uniformidade são os papéis de tipo, a cor, as réguas, a densidade, o tratamento de proveniência e a linguagem estrutural — não a repetição do mesmo hero e das mesmas caixas.

**Nada disso foi implementado nesta campanha.** A matriz existe para provar que a direção não depende de customização irrepetível, e para que a próxima família tenha um contrato para herdar em vez de um render para imitar.

---

## 6.1 Evidência de captura

`../evidence/breakthrough-capture-index.json` indexa os dois lados: 20 PNGs
antes (`583d2d88e`) e 20 depois (`8c737b263`), nos cinco viewports do protocolo
× quatro estados de render — full-page, JS-off, `prefers-reduced-motion`
e primeira dobra. Os dois lados foram capturados a partir de **git worktrees
limpas**, então nenhum manifesto está marcado como provisório (`tree_dirty:
false` nos oito manifestos).

Os 20 pares diferem — **nenhum** sha256 antes coincide com o depois. A mudança
existe em todo viewport e em todo estado, inclusive com JavaScript desligado e
sob movimento reduzido. É essa a resposta mecânica ao §11: não é "talvez", e
não é "só olhando com atenção".

Os PNGs não entram na árvore, pela mesma razão da #494: são reproduzíveis byte
a byte a partir do commit registrado re-rodando o mesmo harness, e o que torna
uma re-captura conferível é o hash, não o binário.

---

## 7. Definition of done

- [x] CURRENT mais três direções realmente distintas, com motores de layout diferentes
- [x] nenhuma é variação cosmética: grade de colunas × margem de referência × capa e índice
- [x] vencedora escolhida por decisão de design, em prosa, sem score
- [x] vencedora passa todas as restrições duras (§8 do PR)
- [x] home real implementada, não apenas protótipo
- [x] mudança visual imediatamente perceptível nos cinco viewports
- [x] sem logo e sem copy, a composição continua específica ao domínio
- [x] CTA, prova e conversão permanecem fortes; a subárvore de captura não mudou
- [x] mobile desenhado como vista de célula, não empilhado
- [x] estados de interação completos: hover de linha, foco visível claro e escuro, reduced motion
- [x] nenhum ativo decorativo genérico introduzido
- [x] delta de performance declarado, medido e aprovado pelo contrato
- [x] before/after completos anexados
- [x] rollback atômico por SHA
- [x] matriz de herança para as próximas famílias
- [x] nenhuma outra família redesenhada
