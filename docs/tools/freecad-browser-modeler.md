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
- O sistema de arquivos, geometria, modelo importado e cópia FCStd ficam no
  navegador. O backup FCStd não chama a carteira, inclusive em falhas de saldo.
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

Verificação local da primeira entrega: sete testes Node de rede, requisitos,
arquivos e exportação; quarenta testes Python da distribuição, CSP e cache;
instalação real dos três binários com verificação de 503.224.999 bytes; sintaxe
dos módulos, bootstrap Python e diálogos preservados.

O navegador deste executor não inicia por restrição de socket do ambiente. A
validação de boot real, geração da peça, cópia FCStd reaberta e STEP/STL é
obrigatória no Chrome contratado do CI antes de promover esta ferramenta. Não
se considera o boot aprovado apenas pela integridade dos downloads.

O catálogo, o mapa do site e a imagem social entram na integração coordenada
das ferramentas. `modelador-abrir` registra `cta_click`, sem afirmar conversão
comercial, compra ou recebimento. Os eventos da carteira permanecem no contrato
compartilhado. Não há telemetria do fornecedor ou nomes de arquivos em eventos.

Reversão: retirar a entrada do catálogo e o launcher, revertendo este produto e
o passo de instalação. Manter a retenção de assets com hash exigida pelo deploy
para abas já abertas. As cópias FCStd baixadas continuam utilizáveis no FreeCAD.
