# Portfólio AEC da CONFENGE

O Radar Open Source AEC de 23/11/2026 e a sua revisão relacionam 17 projetos de terceiros e o TakeoffCraft existente. A frente é INBOUND ENGINE. A entrega cobre a tarefa do visitante, o motor utilizado, o custo de operação e a confirmação da versão publicada sob o domínio canônico. Citações a iLovePDF, Lovable e Manus descrevem estratégias de aquisição, distribuição e reutilização.

O escopo aprovado em 23/11/2026 abrange as ferramentas executadas no navegador em `/ferramentas/`. OpnForm, DocuSeal, OpenProject e WebODM ficam adiados. A organização de pranchas usa pdf-lib no navegador.

## Execução e prova

| Sistema | Estado no Radar | Tarefa ou evidência exigida |
|---|---|---|
| Online3DViewer | EXECUTE_NOW | Abrir STEP, IGES e 3DM na mesma rota de visualização. Conferir geometria real e falha limpa, sem envio do arquivo. |
| Mapshaper | EXECUTE_NOW | Simplificar a camada após a validação de origem. Conferir o número de feições, a diferença de vértices e o GeoJSON baixado em WGS 84. |
| OpenTakeoff | VALIDATE | Conferir escala, área, perímetro e rastreabilidade frente ao TakeoffCraft em plantas controladas. Um único destino canônico para a medição. |
| TakeoffCraft | EXECUTE_NOW | Abrir uma prancha, medir e encontrar o fluxo de exportação da carteira existente a partir da página que descreve a tarefa. |
| pdfme | EXECUTE_NOW | Gerar o relatório fotográfico de vistoria no navegador com os dados do visitante e verificar texto, imagens e páginas no PDF baixado. |
| Stirling PDF | VALIDATE | Avaliar licenças por módulo e a reunião de pranchas e anexos. Só reutilizar partes cuja procedência e distribuição possam ser comprovadas. |
| Pannellum | EXECUTE_NOW | Criar, salvar e reabrir cenas 360°. Para publicar o resultado, verificar autorização para cada imagem, revogação e expiração. |
| Chili3D | VALIDATE | Exercitar operações CAD e comparar com o modelador existente. Se publicado, oferecer fonte correspondente e testar importação, reabertura e exportação. |
| TerriaMap e TerriaJS | EXECUTE_NOW | Sobrepor camadas públicas com fonte, atribuição e data, e reabrir a mesma configuração por link em celular. |
| Excalidraw | EXECUTE_NOW | Editar um croqui com modelos de vistoria, frente de obra e interface entre disciplinas. Verificar exportação SVG e reabertura do formato editável. |
| SVG-Edit | VALIDATE | Editar legenda, símbolo e carimbo vetorial com arquivos locais e saída SVG sanitizada. |
| OpnForm | VALIDATE | Aplicar um modelo de vistoria com permissão da equipe, retenção, trilha de envio e proteção de anexos. |
| Potree | EXECUTE_NOW | Inspecionar uma nuvem com metadados de origem e unidades no navegador. Conversão automática de arquivos de terceiros depende de termos e capacidade próprios. |
| WebODM | VALIDATE | Processar conjuntos autorizados em ambiente dedicado. Verificar tempo, cotas, custo, retenção e produtos de saída antes de liberar trabalhos ao público. |
| draw.io | VALIDATE | Testar uma troca real entre ambientes de diagramação para um esquema de obra. Publicação adicional depende de uma tarefa própria verificável. |
| DocuSeal | VALIDATE | Conferir trilha de auditoria, identidade, armazenamento e responsabilidades de um fluxo de assinatura com documentos de teste. |
| OpenProject | VALIDATE | Conferir programação e colaboração com escopo piloto e isolamento dos projetos. Comparar com as ferramentas de obra e o ambiente operacional existente. |
| Frappe Gantt | EXECUTE_NOW | Visualizar as atividades já calculadas na ferramenta de caminho crítico. Tabela e CSV mantêm as durações e folgas de referência. |

## Evidência da implementação

O candidato amplia o GeoJSON com Mapshaper, visualiza 3DM, gera o PDF de vistoria no pdfme, conecta cenas do Pannellum, usa Frappe Gantt como visualização do cálculo existente e inclui croqui, editor SVG e Potree. O organizador de pranchas usa pdf-lib. A distribuição permanece local, com avisos de origem e licença dos motores.

O diagrama de não conformidade com draw.io foi editado no navegador, exportado em SVG e no formato editável e reaberto a partir do arquivo baixado. O geoportal usa TerriaMap com duas malhas do IBGE e configurações reabríveis. O teste local do OpenTakeoff importou uma prancha, aplicou escala, mediu e exportou CSV. O candidato local remove os módulos opcionais de autenticação e sincronização externas. O teste do novo artefato repetiu a escala, o traçado e a exportação no caminho da área de trabalho.

Serviços que persistem dados exigem ambiente próprio. O teste local de OpnForm confirmou um envio isolado e o acesso restrito à resposta de teste. Chili3D criou um sólido, salvou um arquivo .cd com o nó geométrico e reabriu o documento no Chrome. O fork local publica o código-fonte correspondente ao lado do motor. A publicação do motor Stirling depende das condições comerciais e de distribuição do módulo pretendido.

## Publicação e resultado de negócio

A promoção do site segue o artefato imutável da Netcup, com reversão pela release anterior. Uma integração conta como publicada somente após os checks obrigatórios, a confirmação do SHA por HTTP e um teste da função na rota canônica. Um serviço adicional requer implantação e reversão independentes, contrato de acesso e armazenamento antes de ativar a entrada pública.

Os arquivos de trabalho permanecem no navegador nos percursos locais. A aquisição é medida por páginas e consultas no Search Console, a conclusão por evento agregado e a distribuição por ativações após compartilhamento voluntário. O Warmbly recebe o contexto da tarefa para a proposta de engenharia. Receita da carteira é conferida no livro de emissões e liquidação. O tempo inicial de leitura é de 28 dias completos por lançamento, sujeito a amostra suficiente.

Aplicam-se ADR-STRAT-002, ADR-STRAT-004 e ADR-TOOLS-001. Os ativos, os usos comprovados e a publicação de cada frente precisam de evidências próprias antes de atualizar o estado de produção.
