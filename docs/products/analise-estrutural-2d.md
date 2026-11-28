# Editor de análise estrutural 2D

Decisão de 27/11/2026: EXECUTE_NOW para a implementação e PR. Frente Inbound
Engine, alavancas de distribuição e confiança. A tarefa do visitante é
desenhar um sistema de barras, conferir o equilíbrio e levar
os esforços para o seu fluxo de trabalho. O lançamento deve medir uso e
emissões aceitas, sem confundir emissão com receita ou com projeto contratado.
Após 30 dias, comparar emissões e pedidos de projeto originados nesta rota.

## Fronteira

- Rota e identificador existentes: `/ferramentas/trelicas-e-porticos/` e
  `trelicas-e-porticos`. Sem nova família, política de indexação ou preços.
- O editor e o motor de análise são do site. O modelo de trabalho
  `version: 1` fica no navegador e pode ser salvo e aberto em JSON sem crédito,
  junto ao caso ativo e aos fatores da combinação selecionada.
  O formulário PyNite continua separado e mantém o processamento no servidor.
- As emissões de CSV e SVG seguem o ADR-TOOLS-001. A autorização recebe
  formato, tamanho e SHA-256, não o conteúdo. O arquivo associa os resultados
  à combinação. A carteira mantém o comprovante e seus eventos já existentes,
  sem novos eventos com dados do modelo. A recuperação de uma emissão
  interrompida usa o arquivo original e a mesma operação.

## Modelo e convenções

Pórticos usam ux, uy e rz, e permitem seções por barra, rótulas de extremidade
e barras de treliça axial. Grelhas planas XY usam uz, rx e ry, com rigidez à
flexão e torção de Saint-Venant. As coordenadas e a posição de cálculo são
em metros, forças em kN, momentos em kN·m e giros em rad. A interface usa
GPa para E e G, cm² para A e cm⁴ para I e J. Deslocamentos e giros das tabelas
são apresentados em mm e mrad.

O motor monta a matriz global a partir de rigidez direta Euler-Bernoulli.
Combina casos lineares, forças, momentos, cargas pontuais e trapezoidais
no elemento, deslocamentos prescritos no apoio e temperatura uniforme
axial nas barras de pórtico e treliça. A coordenada local cresce de i para j.
N em tração é positivo, V é a derivada de M no trecho contínuo e T segue a
regra da mão direita no eixo da barra. O momento de carga pontual de flexão
na grelha é conjugado a dw/dx, portanto é −My local se My for definido pela
regra da mão direita. No CSV, dir/esq distinguem os dois lados dos saltos.
Extremos internos de esforços são incluídos nas estações. A deformada
é desenhada em escala ampliada e seus extremos exibidos são amostrados.

Ao ligar uma nova barra a um nó isolado sobre uma única barra, por desenho
ou pelas coordenadas, o editor divide a barra existente e preserva suas ações.
Se mais de uma barra passa pelo nó, escolha qual deve ser ligada no painel do
nó. A opção de emenda também está disponível para modelos já desenhados ou
importados. Abrir um modelo ou selecionar um nó que já tem barras ligadas não
altera ligações por conta própria, mesmo se outra barra cruzar o ponto.

Não há dimensionamento normativo, empenamento, deformação por cisalhamento,
flambagem ou grandes deslocamentos no editor. A análise P-Delta do pórtico
segue disponível no formulário anterior. Eixos e sinais do editor não
devem ser confundidos com os sinais apresentados por aquele formulário.

## Verificação e reversão

- `node --test runtime/science-tools/tests/estruturas-2d.test.mjs`
  confere a calculadora de vigas existente, soluções de quadro, treliça e
  grelha, rótulas, mecanismos, ações impostas e as saídas.
- `node runtime/science-tools/tests/estruturas-2d-browser.mjs` exercita
  interações, SVG/CSV com a carteira e recibo simulados, dados que não saem
  do navegador e invalidação após edição. O teste do formulário continua em
  `runtime/science-tools/tests/browser.mjs`.
- Para reverter, reverter a PR e usar o release versionado de
  RUNTIME-AUTHORITY. Sem migração da carteira ou armazenamento de projetos.
  As permissões HTML, CSV e JSON e o fluxo de P-Delta do formulário anterior
  são preservados.
