# Cobertura do relatório de ferramentas de engenharia

Atualização: 11/11/2026. Decisão: `EXECUTE_NOW`. Frente: ferramentas, aquisição orgânica e conversão em exportações e serviços de engenharia. Alavancas: distribuição, receita, confiança e automação.

Esta matriz confronta as **19 famílias** do relatório fornecido na sessão com funções executáveis do `web-cfg`. Uma família pode exigir mais de uma ferramenta e várias bibliotecas podem atender ao mesmo trabalho do usuário. A presença de um pacote, de uma lista de extensões ou de uma página de apresentação não foi considerada prova de função.

“Existente” identifica funções encontradas na base da sessão. “Nova entrega” identifica fontes e interfaces preparadas nesta sessão, inclusive complementos em revisão. A matriz descreve cobertura técnica; o estado de publicação é o estado das respectivas pull requests e verificações de produção. Não declara que um item está em produção apenas porque sua fonte existe.

## 1. Auditoria, consulta e coordenação BIM

| Nº | Família do relatório | Função e acesso na CONFENGE | Saídas e cobertura efetiva |
|---|---|---|---|
| 1 | IfcOpenShell: ifctester, ifcdiff, ifccsv, ifcfm e ifc4d | Existentes: [auditor IDS](/bim/web/oficina.html#ids), [quantitativos IFC](/bim/web/ifc-excel.html) e [comparador de quantitativos](/bim/web/comparar.html). Novas entregas: [inventário IFC](/ferramentas/inventario-ifc/) e [comparador geométrico](/ferramentas/comparador-geometrico-ifc/). | IDS → JSON; quantitativos → XLSX; comparação de quantidades → CSV; inventário e geometria → CSV/JSON. O inventário reúne propriedades de ocorrência e tipo, espaços, relações espaciais e sistemas. Não afirma conformidade integral COBie, templates completos de ifcfm ou interoperabilidade IFC4D. Implementações equivalentes reutilizam web-ifc; não dependem de instalar todos os utilitários IfcOpenShell. |
| 2 | IFClite | Existentes: [visualizador IFC](/bim/web/visualizador.html), consulta de propriedades e seleção de elementos; [LandXML para IFC](/bim/web/modelagem.html#terreno); [CONFENGE Civil](/cad/aplicativos/#civilcraft) para terrenos e traçados. O inventário novo amplia a consulta tabular. | IFC, XLSX, LandXML e saídas de terreno nas respectivas rotas. O leitor reconhece esquemas IFC4/IFC4X3, sem promessa de renderizar toda entidade possível de infraestrutura. Não se declara equivalência com a linguagem completa de consultas do IFClite, nem com seu desempenho WebGPU. |
| 3 | IFC Georeferencer | Nova entrega: [georreferenciador IFC](/ferramentas/georreferenciador-ifc/). Origem manual ou pontos de controle para SIRGAS 2000/UTM, usando IfcProjectedCRS e IfcMapConversion. | IFC e JSON com parâmetros, resíduos e SHA-256. Ajuste rígido horizontal com escala física 1:1 e deslocamento vertical; conversão da unidade do IFC para metro. Não executa transformação de datum vertical, ajuste geral de sete parâmetros ou reparação universal de coordenadas. IFC2x3, contextos ambíguos e origens já embutidas fora dos limites são recusados. |
| 4 | That Open Engine / web-ifc | Nova entrega: [plantas e cortes IFC](/ferramentas/plantas-cortes-ifc/), aproveitando o leitor geométrico já distribuído. | Interseção real de triângulos com plano X/Y/Z; SVG com dimensões gerais e escala física. Não é apenas projeção da caixa do objeto. Não produz detalhamento executivo, cotas associativas, hachuras normativas ou DWG de corte. |
| 5 | xeokit SDK / BIM Viewer | Nova entrega: [federação IFC e BCF](/ferramentas/federacao-bcf/). Até cinco modelos na mesma origem, com seleção de elementos e apontamento. | BCF 2.1 em ZIP com tópico e seleção IFC. Arquivos XML validados contra os XSD oficiais. A exportação não inclui câmera ou captura de tela; essas estruturas são opcionais no esquema usado. Não utiliza xeokit nem introduz sua licença na distribuição. Não promete importação geral de BCF ou detecção automática de interferências. |

Fontes da entrega BIM: `scripts/bim/overrides/web/`, `scripts/bim/read-source.mjs` e `tests/bim/`. A distribuição base `scripts/bim/aplicativo.tar.gz` permanece idêntica à base da sessão. O publicador aplica fontes legíveis depois de extrair o pacote, incluindo-as no digest de versão.

### O que a comparação geométrica acrescenta

O comparador existente da suíte BIM usava centro e dimensões da caixa envolvente e número de triângulos. Uma contraprova com mudança de um vértice interno, mantendo caixa e contagem, era classificada como igual. A ferramenta nova compara os triângulos colocados no sistema de coordenadas de engenharia, por GlobalId.

A assinatura SHA-256 ordena vértices e triângulos quantizados. Números de registros STEP, IDs de malha e ordem de leitura ficam fora da identidade. Assinaturas diferentes passam por correspondência bijetiva de triângulos, exigindo distância euclidiana de cada vértice dentro da tolerância escolhida. O relatório distingue inclusão, remoção, alteração da malha e alteração de posicionamento das partes.

O método é conservador diante de triangulações diferentes de uma mesma superfície. Não faz subtração booleana, não calcula volume da alteração e não é um verificador de colisões. Não aplica MapConversion à geometria; compara sua declaração semântica separadamente. Mais de uma operação cartográfica por arquivo é recusada para não confundir contextos. Limites: 25 MiB, 6.000 elementos e 200.000 triângulos por modelo, com cancelamento e limite de 90 segundos na interface.

## 2. Desenho, conversão e quantitativos CAD

| Nº | Família do relatório | Função e acesso na CONFENGE | Saídas e cobertura efetiva |
|---|---|---|---|
| 6 | MLightCAD / libredwg-web | Existentes: [editor DWG/DXF](/cad/) e [CONFENGE CAD 2D](/cad/aplicativos/#cadcraft). A leitura, edição e regravação de desenhos são funções reais da base. | DWG/DXF no editor e PDF nos comandos de desenho da suíte. O teste do editor reabre a saída e confere geometria, camadas, blocos e uma linha modificada. **CHTML offline interativo não estava comprovado na base**. Instalar o aplicativo para trabalhar offline não equivale a exportar um arquivo CHTML autônomo. SVG/JSON só devem ser anunciados nas ações específicas que efetivamente os geram. |
| 7 | dxf-parser / dxf-viewer | Nova entrega: [quantitativos DXF por camada](/ferramentas/quantitativos-dxf/). Leitura do arquivo, comprimentos e contagem de inserções de blocos, com tratamento explícito de entidades não computadas. | CSV e JSON. Usa o parser fixado na distribuição e mantém testes de escala, blocos e geometrias. Não presume unidade física quando o desenho não a declara, nem transforma qualquer objeto proprietário em quantitativo confiável. |
| 8 | LibreCAD-Web | Existentes: [editor DWG/DXF](/cad/) para edição 2D e [CONFENGE CAD 2D](/cad/aplicativos/#cadcraft) para ambiente ampliado de desenho e impressão. | Reutilização da função de edição, salvamento e PDF. Não foi instalada uma terceira interface CAD apenas para corresponder ao nome de outra biblioteca. Exportação PNG/SVG não é inferida da capacidade de editar DXF. |

Fontes de prova: `scripts/cad/README.md`, `tests/cad/roundtrip.mjs`, `scripts/cad/suite/releases.json`, `scripts/cad/suite/brand.py`, `cad/aplicativos/` e as páginas de ajuda e handlers das edições fixadas. `exportFormats` é uma permissão da ponte comercial; isoladamente não prova que um aplicativo implementa o formato.

## 3. Estruturas, seções, memórias e geotecnia

| Nº | Família do relatório | Função e acesso na CONFENGE | Saídas e cobertura efetiva |
|---|---|---|---|
| 9 | Awatif / awatif-workspace | Existentes: análise de pórticos 3D e cascas em [CONFENGE BIM](/cad/aplicativos/#bimcraft) e [CONFENGE Detalhamento](/cad/aplicativos/#detailcraft). Nova entrega complementar: [radier sobre solo elástico](/ferramentas/radier-solo-elastico/). | A suíte gera esforços, reações, deslocamentos e PDF/CSV. Radier gera CSV/JSON/SVG com laje MITC4 e molas de Winkler. É análise linear; não representa contato exclusivamente em compressão ou levantamento/descolamento do solo. Não se usa o pórtico **plano** como prova de cobertura 3D. |
| 10 | handcalcs | Nova entrega: [memorial de cálculo](/ferramentas/memorial-de-calculo/). Modelos de viga biapoiada, barra axial e Hazen-Williams. | HTML imprimível, LaTeX/TEX, CSV e JSON. A impressão do navegador pode salvar PDF; isso não equivale a um renderizador PDF executado no servidor. Somente modelos de cálculo permitidos, sem executar Python ou fórmulas arbitrárias do visitante. |
| 11 | section-properties / concrete-properties | Novas entregas: [propriedades de seções](/ferramentas/propriedades-de-secoes/) e [seção de concreto armado](/ferramentas/secao-de-concreto-armado/). Contornos e furos, propriedades geométricas e tensões; concreto com armaduras, flexo-compressão e momento-curvatura. | HTML imprimível, CSV e JSON. A malha de produção usa triangulação GEOS/Shapely com o adaptador documentado, incluindo elementos quadráticos; a distribuição não depende de Triangle. Hipóteses constitutivas, sinais e parâmetros são expostos. Os resultados não são dimensionamento completo de um edifício ou certificação normativa automática. |
| 12 | PyNite / anaStruct | Nova entrega: [treliças e pórticos planos](/ferramentas/trelicas-e-porticos/) com PyNite: análise linear de treliças e pórticos, com segunda ordem P-Delta para pórticos. Já existia [viga contínua](/ferramentas/analise-de-viga-continua/). Placas, 3D e radier são atendidos pelas rotas da família 9. | HTML imprimível, CSV e JSON no módulo científico; CSV na viga. Não se instala anaStruct para duplicar a função que já está implementada. A UI científica de barras continua sendo 2D. |
| 13 | Groundhog | Nova entrega: [CPT e resistência axial de estacas](/ferramentas/geotecnia-cpt-estacas/). Normalização de leituras CPT e integração de resistências de estacas por camadas. | HTML imprimível, CSV e JSON. Contém qt, Rf, Bq, Qt, Fr, Qtn e Ic, além do modelo de resistência de estacas descrito na página. Não faz identificação inequívoca de solo só pelo índice Ic, interpretação automática de toda sondagem SPT ou cálculo geral de fundações fora das hipóteses declaradas. |

Fontes científicas: `runtime/science-tools/operations/`, `runtime/science-tools/confenge_mesh.py`, `assets/js/science-tools.mjs`, `netlify/functions/science-tools.cjs` e `runtime/science-tools/tests/`. Os modelos têm esquemas fixos, dados efêmeros, isolamento de processo e limites de memória, tempo e saída. As telas mostram os limites do modelo empregado.

### Prova executável da cobertura 3D e de placas

Na edição **BIMCraft 0.8.1** fixada em `releases.json`, `app/frame/frame-solve.js` usa barras espaciais com 12 graus de liberdade por elemento, flexão nos dois planos, torsão e apoios. `plate-solve.js` acrescenta cascas de 24 graus de liberdade, flexão MITC4, membrana, pressão e peso próprio. `analysis-bim-ui.js` envia lajes e paredes à montagem, e `frame-panel.js` acrescenta seus resultados às tabelas.

Fluxo: `/cad/aplicativos/#bimcraft` → abrir IFC → aba **Analysis** → conferir modelo analítico, casos, apoios e cargas → **Run analysis** → diagramas/deslocamentos no modelo e **Report (PDF/CSV)**. A extração automática de barras depende de perfis e extrusões reconhecidos; objetos não representados são contabilizados. Não basta abrir qualquer IFC para inferir um modelo estrutural correto.

O arquivo de ajuda `app/help/frame-analysis.md` da edição contém uma lista antiga dizendo que lajes não existem. A verificação deu prioridade ao handler e ao solver efetivamente distribuídos. O teste oficial [`tests/tools/frame/test-shell.mjs`](https://github.com/getcadcraft/partcraft/blob/partcraft-v0.8.1/tests/tools/frame/test-shell.mjs) foi executado sobre os módulos extraídos do **ZIP de produção fixado**, com **73 verificações aprovadas e nenhuma falha**. Casos: placa apoiada/engastada de Timoshenko, patch de MacNeal e Harder inclinado, paredes, faixas, diafragmas, laje sobre colunas, malhas e entradas hostis.

A interface antiga dos apoios preservava apenas restrições `fix`, apesar de o solver aceitar molas `k`. Por isso o radier com coeficiente de subleito recebeu uma interface própria, sem alegar que a aba antiga já permitia configurar Winkler. O FEM sólido do CONFENGE Peças usa tetraedros/hexaedros e não foi usado como substituto genérico de uma ferramenta de lajes sobre solo.

## 4. Hidráulica, conforto e energia

| Nº | Família do relatório | Função e acesso na CONFENGE | Saídas e cobertura efetiva |
|---|---|---|---|
| 14 | epanet-js-toolkit | Existente: [rede de água por formulário](/ferramentas/rede-de-agua/). Nova entrega: [abrir e simular INP](/ferramentas/epanet-inp/) com cenário original, demanda adicional e fechamento permanente de trecho. | INP, CSV e JSON, motor OWA EPANET 2.2 em WASM. Até 1 MiB, 1.000 nós, 2.000 trechos e 48 h na importação. Percorre eventos hidráulicos, interrompe se regra reabrir trecho do cenário e recusa avisos impeditivos. Não simula qualidade/MSX nem certifica conformidade de hidrantes. A licença do aplicativo Next.js epanet-js não foi tomada como autorização de hospedagem. |
| 15 | pythermalcomfort | Nova entrega: [conforto e estresse térmico](/ferramentas/conforto-termico/). Ambientes em lote com parâmetros ambientais, atividade e vestimenta. | PMV, PPD, SET e UTCI conforme as rotinas selecionadas, em HTML imprimível, CSV e JSON. Valores fora do domínio de aplicação são sinalizados; não se apresenta índice fora da faixa como conclusão válida. Não é laudo assinado ou avaliação ocupacional completa. |
| 16 | pvlib-python | Nova entrega: [energia solar fotovoltaica](/ferramentas/energia-solar-fotovoltaica/). Séries fornecidas pelo usuário, posição solar, irradiância no plano, temperatura de célula e potência DC/AC. | HTML imprimível, CSV e JSON com energia **do período informado**. Requer série crescente, fuso, intervalo constante e sem lacunas. Não inventa geração anual a partir de amostra curta, não busca meteorologia sem entrada do usuário, nem calcula retorno financeiro/tarifa. |
| 17 | CalcForge e utilitários elétricos/mecânicos | O repositório indicado no relatório continha somente `LICENSE` e `README.md`, sem motor utilizável. Reutilizam-se [redes elétricas/hidráulicas](/cad/aplicativos/#calculo-network), [circuitos](/cad/aplicativos/#calculo-em), [sistemas](/cad/aplicativos/#calculo-sys) e [diagrama unifilar](/ferramentas/diagrama-unifilar/) nas funções existentes. | Motores de cálculo → TXT; unifilar → SVG/JSON. `engines/network/power.js` implementa fluxo de potência AC Newton-Raphson, não dimensionamento automático de cabos conforme NBR 5410. Não se afirma que queda de tensão, motores, escoamento compressível e laminados estejam integralmente cobertos só porque há um catálogo elétrico. |

Prova da limitação CalcForge: árvore do repositório [slukiceng/CalcForge](https://api.github.com/repos/slukiceng/CalcForge/git/trees/5abfe2a5c77318449a624185210c6ec16b6a2756), consultada na sessão. Os 12 motores existentes vêm de `scripts/cad/suite/calc-engines-2026-11-07.tar.gz`; seu catálogo e exemplos são exercitados em `tests/cad/suite-content.mjs`.

## 5. Terrenos, nuvens e planejamento

| Nº | Família do relatório | Função e acesso na CONFENGE | Saídas e cobertura efetiva |
|---|---|---|---|
| 18 | Potree / potree-rs / bevy_pointcloud | Existentes: [perfil de nuvem](/bim/web/oficina.html#perfil), terreno em [CONFENGE BIM](/cad/aplicativos/#bimcraft) e corte/aterro em [CONFENGE Civil](/cad/aplicativos/#civilcraft). Correção nesta sessão do falso rateio de volumes por plataforma. | Perfil → CSV; terreno → LandXML; volumes Civil → `.quantities.json` para o ambiente de quantitativos. O volume é diferença entre superfícies de terreno amostradas, não volume fechado de qualquer nuvem de pontos. Não há promessa de processar bilhões de pontos, converter toda nuvem via PotreeConverter ou oferecer servidor de nuvens massivas. |
| 19 | SVAR Svelte Gantt + ifc4d | Existente: [caminho crítico](/ferramentas/caminho-critico-obra/). Nova entrega: [comparador de cronogramas](/ferramentas/comparador-cronogramas/) com baseline confirmada, cenário atualizado e evento isolado. | CSV e SVG; cópia editável JSON gratuita. Até 500 atividades, rede fim-início, dias inteiros e marcos de duração zero. Detecta inclusões/retiradas e mudança de dependências. Não importa diretamente MPP/XER, não implementa calendários múltiplos, nivelamento de recursos, IFC4D ou interoperabilidade ifc4d. Não transforma diferença de duração em conclusão automática de direito contratual. |

### Fluxo e método dos volumes já existentes

**CONFENGE BIM:** `/cad/aplicativos/#bimcraft` → **Build → Terrain → Open a survey file** → selecionar levantamento → **Building pad** → propriedades do terreno/plataforma. O leitor oferece pontos XYZ/PNEZD/PENZD, curvas DWG/DXF, LAS/LAZ, GeoTIFF/grade ASCII e LandXML nos handlers da edição. Nuvens LAS/LAZ passam pelo filtro de pontos classificados como terreno e redução aproximada de um ponto por m². O terreno pode ser exportado em LandXML para o ambiente Civil.

Essa edição reposiciona levantamentos de coordenadas grandes junto à edificação e ajusta a elevação inicial, aproximadamente oito polegadas abaixo do piso. É necessário conferir o alinhamento e a função de elevação do terreno. Esse fluxo **não foi descrito como preservação automática do georreferenciamento original**.

Na base, `res-terrain.js` calculava o corte/aterro agregado e gravava cada plataforma como `total / quantidade_de_plataformas`. A correção em `scripts/cad/suite/brand.py` injeta `terrain_quantities.mjs` como fonte legível no build, mantendo o ZIP de origem intacto no Git.

O cálculo corrigido amostra pontos médios em células inicialmente de **250 mm**, aumentando o passo quando necessário para limitar a **250.000 células**. As células de borda usam sua área real. A diferença vertical em mm multiplicada pela área em mm² é convertida para m³. O passo efetivo fica registrado em `VolumeMethod`; não se aplicam fatores de empolamento ou contração.

Para até 16 plataformas, só se publicam valores individuais quando a influência de cada superfície independente é disjunta, sua soma reproduz a superfície combinada **em cada célula** e os totais também reconciliam ao erro numérico. Sobreposição, domínios diferentes, interpolação não atribuível ou quantidade maior mantêm somente o agregado. As propriedades individuais recebem texto de indisponibilidade. A UI também não mostra valores legados sem marca de verificação como se tivessem sido recalculados.

**CONFENGE Civil:** `/cad/aplicativos/#civilcraft` → abrir pontos XYZ/CSV ou LandXML → construir TIN → criar plataforma/corredor → painel **Earthwork** → **Send to Takeoff**. `app/grading.js` integra uma malha de aproximadamente 250.000 amostras; utiliza os limites de taludes e uma única superfície final nas sobreposições. As unidades seguem o projeto, em m³ ou yd³, sem empolamento/contração. Não é integração exata de prismas de dois TINs e o método deve acompanhar o quantitativo exportado.

Fontes primárias: [`res-terrain.js`](https://github.com/getcadcraft/bimcraft/blob/bimcraft-v0.8.1/app/res-terrain.js), [`terrain.md`](https://github.com/getcadcraft/bimcraft/blob/bimcraft-v0.8.1/app/help/terrain.md), [`grading.js`](https://github.com/getcadcraft/civilcraft/blob/civilcraft-v0.8.1/app/grading.js) e [`earthwork.js`](https://github.com/getcadcraft/civilcraft/blob/civilcraft-v0.8.1/app/earthwork.js), nas mesmas tags das distribuições fixadas.

## 6. Verificação adversarial e critérios comerciais

As novas rotas usam a superfície pública `confenge.com.br`. O catálogo central é `data/site/tool-showcase.json`; títulos, descrições, links canônicos, breadcrumbs e dados estruturados precisam corresponder à função real, à entrada aceita e à saída disponível. Os filtros por formato consideram entrada ou saída comprovadas. Nenhuma linha desta matriz autoriza anunciar leitura ou gravação **RVT**.

A hipótese de aquisição é responder ao trabalho específico, por exemplo “comparar geometria IFC” ou “exportar quantitativos DXF”, com a ferramenta utilizável na própria página. A conversão reutiliza a carteira e `exportToolResult`, sem criar preço, débito ou política de indicação paralelos. Créditos, cortesia e indicação seguem os contratos centrais. Simular, inspecionar e preservar a cópia editável seguem os termos de cada produto, sem atribuir custo a uma ação que a interface fornece gratuitamente.

Dados de arquivos permanecem locais nas ferramentas que rodam no navegador. As ferramentas científicas enviam somente o payload previsto ao runtime próprio, que processa de forma efêmera. O comprovante de autorização de exportação não é recibo de serviço de engenharia, contrato assinado ou prova de download salvo no computador do usuário. Os eventos de aquisição e próxima ação usam os contratos existentes, sem incluir nomes de arquivos ou outros dados pessoais na análise de tráfego.

### Evidência obtida nesta sessão

| Área | Verificação relevante |
|---|---|
| CSV | Neutralização de prefixos de fórmula, inclusive após espaços/controles, preservando números negativos numéricos. |
| Inventário IFC | Propriedades de tipos e ocorrências, valores zero/false, relações espaciais e limites de percurso. |
| Cortes | Prismas analíticos, plano coplanar sem diagonal interna, deslocamento absoluto e escala SVG. Nomes hostis preservam XML válido. |
| Federação/BCF | ZIP reaberto com verificação de CRC, XML validado nos XSD BCF 2.1 oficiais, GlobalIds duplicados tratados e origem comum preservada. |
| Georreferência | Releitura real web-ifc, unidades m/mm/cm, IFC4X3, ajuste de 30°, resíduos, preservação dos registros geométricos e rejeição de contextos ambíguos. Troca de arquivo apaga a origem anterior; texto hostil permanece literal e a entrega usa MIME de anexo binário. |
| Comparação geométrica | Vértice interno alterado sem mudar AABB, rotação/translação, diferença de malha, tolerância atravessando fronteira de quantização, matching bijetivo, IDs renumerados e modelos reais. 9 testes aprovados na revisão independente. |
| Terreno | Pads de 4 m³ de corte e 12 m³ de aterro; sobreposição; distribuição espacial invertida com o mesmo total; células de borda; limite de amostras. 5 testes aprovados. ZIP adaptado real conferido, incluindo fonte injetada e cache offline. |
| Estruturas 3D/placas | 73 verificações oficiais executadas sobre módulos do ZIP fixado, sem falhas. |
| Runtime científico | Rejeição de JSON excessivamente profundo antes do spawn, limite de recursos, resultado atrasado invalidado, CSV seguro, escala geométrica 1:1 e malhas com furos/regiões conferidas. |

Comandos principais reproduzíveis no checkout:

```sh
CONFENGE_BIM_NODE_MODULES=/caminho/do/stage/node_modules node --test tests/bim/*.test.mjs
node --test tests/cad-suite/terrain-quantities.test.mjs
python3 scripts/cad/suite/install.py _site
node tests/cad/suite-content.mjs _site
```

O teste de placas usa o fixture oficial acima com os arquivos `assets/apps/bimcraft/0.8.1/frame/` extraídos do ZIP cujo SHA-256 é `93ccdf2500eab65a001b98594eeda63c6ddee40e98e3283b66863abbe2a3673a`. O teste independente é colocado sob `tests/tools/frame/` e os módulos sob `tests/lib/frame/`, preservando seus imports. Executa-se `node tests/tools/frame/test-shell.mjs` nessa árvore de evidência.

Os resultados acima são evidência dos testes efetivamente executados. CI, CodeQL, interface no navegador e aceitação da publicação continuam sendo conferidos nos commits específicos das PRs. A alteração de download georreferenciado deve passar novamente pelo CodeQL; teste local de conteúdo hostil não substitui esse resultado remoto.

## 7. Escopo que permanece explicitamente separado

- **CHTML autônomo:** não confundir com cache offline da suíte CAD. Requer confirmação de implementação/exportador e licença antes de oferecer esse formato.
- **COBie/ifcfm integral e IFC4D:** inventário de propriedades e comparação CPM não afirmam esses padrões de entrega ou intercâmbio.
- **CalcForge:** README sem motor executável não constitui ferramenta distribuível. As funções elétricas existentes são reaproveitadas apenas onde a equivalência foi comprovada.
- **Modelagem paramétrica ampliada:** FreeCAD web tem integração própria, solicitada adicionalmente na sessão. A disponibilidade de um workbench não prova que seus executáveis externos, como Gmsh/CalculiX, estejam distribuídos. A integração de autoria não implica compatibilidade RVT, Blender/Bonsai completos ou solver FEM adicional pronto.
- **Validação profissional:** o escopo e as hipóteses acompanham a saída técnica. Resultados de ferramentas não constituem automaticamente projeto executivo, ART, laudo assinado ou prova de direito contratual.

Rollback: desativar a entrada exata do catálogo/registro comercial e retirar a rota ou redirecioná-la de forma específica, preservando os arquivos editáveis dos usuários. As adaptações da suíte são reconstituídas a partir do ZIP fixado e de fontes versionadas. ADRs aplicáveis: `ADR-STRAT-002` e `ADR-STRAT-004`; nenhuma segunda marca, CRM ou fonte de dados paralela foi criada.
