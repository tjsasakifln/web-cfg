# Modelador paramétrico 3D no navegador

Estado: EXECUTE_NOW. Frente executiva: aquisição e uso de ferramentas de engenharia.
Autorização: instrução do fundador na sessão de 11/11/2026. Tipos de resultado:
distribuição, receita e confiança. Não há promessa de tráfego ou faturamento.

## Trabalho do visitante

Criar um esboço ou sólido, editar medidas, manter uma cópia FCStd e preparar
STEP/STL para outro fluxo de trabalho. A página pública `/ferramentas/modelador-parametrico-3d/`
tem utilidade e intenção próprias; `/cad/freecad/` é o ambiente técnico noindex.
A primeira ação informa os 503.224.999 bytes de aplicação, antes da compressão
do transporte. Nenhum binário é pré-carregado pela página pública.

O usuário vê a fonte FreeCAD 1.1.3/FreeCAD-Web v1.0.9, os formatos, o limite de
entrada de 128 MiB e o custo de memória/desempenho antes de iniciar. O exame de
WebGL 2, contexto seguro, isolamento e JSPI/memory64 precede o download. Não se
afirma compatibilidade por uma lista de versões de navegadores.

## Contratos e dados

- `scripts/freecad/runtime.json` fixa URL, tamanho e SHA-256 das três releases.
- O instalador valida cache e download, publica arquivos com hash no nome e
  acrescenta cache imutável apenas a essas rotas no artefato. Não altera binários.
- COOP/COEP e permissão de WebAssembly ficam no ambiente técnico. A página
  pública preserva a política global e continua leve.
- O JavaScript Emscripten fixado utiliza `new Function` nos invocadores Embind.
  Por isso, os documentos `/cad/freecad/` e `/cad/freecad/index.html` e o worker
  exato `/assets/freecad/FreeCAD-3f8c1ff4a0ee.js` recebem `script-src 'unsafe-eval'`.
  O worker usa a política da própria resposta, independente do documento. A
  política global, o launcher, a página de licenças e os demais assets não
  recebem essa permissão. Scripts inline,
  complementos remotos e frames continuam bloqueados. O gerador da política
  de produção mantém esse mesmo escopo, conferido pelo teste de distribuição.
- WASM e dados usam Cache Storage exclusivo dos componentes públicos. Tamanho e
  SHA-256 são verificados na rede e em toda reutilização. Conteúdo corrompido é
  descartado; bloqueio de armazenamento ou falta de quota não impede usar os
  bytes já verificados em memória. Modelos, exportações e conta nunca entram
  nesse cache. O teste de segunda abertura desativa o cache HTTP para conferir
  que os 501.757.581 bytes de WASM e dados não sejam solicitados novamente.
  O carregador Qt recebe o módulo compilado desses bytes verificados, pois o
  Emscripten desta versão não usa `Module.wasmBinary` para iniciar o motor.
- O sistema de arquivos, geometria, modelo importado e cópia FCStd ficam no
  navegador. O backup FCStd não chama a carteira, inclusive em falhas de saldo.
- A importação IGES preserva a tentativa normal pelo ImportGui. Se ela não
  produzir geometria, usa o leitor nativo Part como recuperação. Arquivos de
  intercâmbio vazios não recebem uma confirmação de sucesso; documentos FCStd
  vazios continuam válidos para iniciar ou retomar um trabalho.
- Saídas técnicas usam `exportToolResult` e o contrato existente
  `confenge.tools.emission/v1`. Só formato, tamanho e SHA-256 chegam ao serviço.
  Os bytes são congelados antes da autorização; cancelar permite retomar o mesmo
  resultado. O observador de gravação não entrega um arquivo enquanto seu
  descritor de escrita permanece aberto.
- Não se instala backend, proxy, MCP, compartilhamento remoto nem addons.
  A seleção FEM é removida, pois Gmsh/CalculiX não pertencem à distribuição
  verificada deste produto. Os formatos STEP/STL têm ação explícita própria.
- A implantação atual depende da autorização comercial e dos kill switches já
  existentes. Nenhum preço é alterado. A cópia editável permanece gratuita.

ADRs afetados: STRAT-002, STRAT-004 e TOOLS-001, preservados sem nova fronteira.
Família pública: ferramentas. Propriedade: este repositório para produto e
contratos; serviço de créditos existente para autorização da entrega.

## Qualificação e reversão

Verificação local da continuidade em 11/11/2026: 36 testes Node de rede,
requisitos, arquivos, cache e repetição da autorização; 49 testes Python da
distribuição, CSP e cache; montagem real do site com os três binários fixados.
O botão de retomada conserva o mesmo resultado congelado e a carteira preserva
o bloqueio de outro resultado enquanto a tentativa anterior estiver pendente.

Qualificação real concluída em 11/11/2026 no Chrome contratado
152.0.7977.42, com 21 verificações aprovadas. Evidência da ferramenta em
`2cc3f1bcc41ecb3244e10e483ba9c77ef3b1d0e2`:
[execução 43024778339](https://github.com/tjsasakifln/web-cfg/actions/runs/43024778339).
Evidência da integração em `58c3d84f313fd1659c99ee1c824106c34f4caa5b`:
[execução 43024787289](https://github.com/tjsasakifln/web-cfg/actions/runs/43024787289).

O ensaio confirmou inicialização real, esboço totalmente restringido, extrusão,
alteração da peça de 180.000 mm³ para 288.000 mm³, cópia FCStd reaberta com seus
parâmetros, STEP/STL autorizados e retomada idempotente pelo botão do arquivo.
A segunda abertura reutilizou os 501.757.581 bytes de WASM e dados mesmo com
o cache HTTP desativado. Não houve erros não tratados no navegador.

STEP, IGES, STL, 3MF, DXF e SVG abriram pelo seletor do produto com dimensões
conferidas em milímetros. Os modelos 3D preservaram 120 × 60 × 40 mm; os dois
desenhos 2D preservaram as quatro arestas de 100 × 60 mm. Os comandos nativos
File > Save As, Save e Export passaram pela ponte de gravação original. A
cópia FCStd editada reabriu com altura de 14 mm, e o STL entregue preservou
as dimensões 7 × 11 × 14 mm e o resumo criptográfico do recibo.

A publicação depende também das verificações gerais do site. Toda alteração
seguinte deve manter o ensaio real aprovado na versão candidata. A autorização
usou uma conta e um serviço de teste, sem operações financeiras reais.

O catálogo, o mapa do site e a imagem social entram na integração coordenada
das ferramentas. `modelador-abrir` registra `cta_click`, sem afirmar conversão
comercial, compra ou recebimento. Os eventos da carteira permanecem no contrato
compartilhado. Não há telemetria do fornecedor ou nomes de arquivos em eventos.

Reversão: retirar a entrada do catálogo e o launcher, revertendo este produto e
o passo de instalação. Manter a retenção de assets com hash exigida pelo deploy
para abas já abertas. As cópias FCStd baixadas continuam utilizáveis no FreeCAD.
