# Georreferenciar IFC em SIRGAS 2000 / UTM

## Decisão e trabalho do visitante

Estado: `EXECUTE_NOW`, solicitado pelo fundador na ampliação das ferramentas em
10/11/2026. Frente: aquisição por ferramentas úteis e exportações por créditos.
O visitante precisa posicionar um modelo local no sistema do levantamento,
conferir as coordenadas e entregar um IFC que mantenha essa referência.

Rota: `/ferramentas/georreferenciador-ifc/`. Consulta e conferência gratuitas;
exportações `ifc` e `json` passam pelo contrato existente de créditos com
`toolId: bim-georreferenciador`. A página declara a cobrança condicional sem
inventar preço, crédito cortesia ou autorização de checkout. Usa os eventos
existentes da exportação e o compartilhamento canônico do catálogo.

Hipótese: a resolução de um problema de interoperabilidade atrai usuários de
BIM/topografia e cria uma razão concreta para exportar e retornar. Avaliar
conferências concluídas, exportações autorizadas e retorno dos usuários. O
tempo para evidência começa após publicação da rota; não se infere aquisição
ou faturamento a partir da quantidade de páginas. Há ganho de distribuição,
confiança e reutilização do motor IFC já instalado.

## Implementação e dados

O modelo permanece no navegador. Um worker confere STEP, unidades, contexto,
posicionamentos e referência existente com web-ifc 0.0.77. O conversor UTM já
publicado verifica se a origem e os limites do modelo estão no fuso e na faixa
geográfica atendidos. Não há mapas, geocodificação, proxy, serviço meteorológico,
grids de datum ou nova dependência de pacote.

O algoritmo oferece translação e rotação conhecidas ou ajuste rígido por pelo
menos três pares não colineares. A solução de mínimos quadrados calcula a
rotação horizontal pela correlação das coordenadas centradas; as translações
vêm dos centroides e da média das diferenças de altura. Resíduos são calculado
menos levantado. O limite é aplicado a cada erro horizontal e a cada erro
vertical, além de apresentar os respectivos RMS. Distâncias são preservadas.

`IfcProjectedCRS.MapUnit` é metro. `IfcMapConversion.Scale` é exclusivamente a
conversão da unidade do projeto para metro. Não se ajusta escala física,
inclinação do eixo Z, datum ou ondulação geoidal. `IfcSite` e `TrueNorth` não
são alterados nem somados à rotação informada.

A escrita modifica somente os registros de CRS e MapConversion existentes,
ou acrescenta esses registros e uma unidade SI quando necessário. O índice
STEP distingue strings, aspas escapadas e comentários de declarações reais.
Não se reserializa a geometria pelo leitor. Cada outro registro e o cabeçalho
permanecem idênticos. Uma referência compartilhada com outra entidade é
recusada. A saída é reaberta e os parâmetros gravados são conferidos antes
de liberar o download. O relatório inclui hashes SHA-256 da entrada e saída.

O usuário é dono dos modelos e dos pontos informados. Não há persistência
desse conteúdo no servidor. Os contratos comerciais, captura e checkout
permanecem nos componentes existentes, conforme ADR-STRAT-002 e ADR-TOOLS-001.

## Limites explícitos

- IFC4 ou IFC4.3, até 25 MiB e 250.000 registros; exatamente um projeto e um
  contexto 3D com WorldCoordinateSystem XYZ na origem.
- Metro, decímetro, centímetro ou milímetro SI declarados no projeto.
- SIRGAS 2000 / UTM 18S a 25S e 18N a 22N, no domínio do conversor público.
- De 3 a 30 pontos distribuídos em duas direções. A exportação por pontos
  exige resíduos dentro do limite escolhido, de 0,001 a 5 m.
- Recusa IFC2x3, múltiplas operações, IfcRigidOperation, escala por eixo,
  escalas físicas preexistentes e MapUnit ausente ou incompatível.
- Coordenadas geométricas e posicionamentos acumulados acima de 50 km são
  recusados para evitar duplicar uma referência já embutida. Não há reparo
  automático de origem, recuperação de arquivo incompleto ou inferência de CRS.
- Aplicam-se também os limites de geometria do leitor existente: dois milhões
  de triângulos, 6.000 instâncias e 128 MiB de buffers.

## Validação

```sh
CONFENGE_BIM_NODE_MODULES=/caminho/do/stage/node_modules node --test tests/bim/georeference.test.mjs
```

Sete testes passaram em 11/11/2026, com o web-ifc real ativado. A prova numérica
usa uma rotação de 30 graus calculada independentemente, pontos em milímetros,
deslocamentos conhecidos e resíduos menores que 1e-8 m. A releitura confirma
as unidades m/mm/cm, EPSG, altura, rotação, texto Unicode e atualização da
referência sem acumular entidades. Casos adversariais incluem escala indevida,
pontos colineares/repetidos, EPSG geográfico, números não finitos, IDs falsos
em strings/comentários, IDs repetidos, vários blocos DATA, origem embutida e
WCS deslocado. Os testes comparam cada registro original antes/depois.

Sem a variável acima, somente o teste que depende da instalação WASM é
explicitamente pulado. Os outros testes não dependem de instalação externa.
A validação visual e a integração de catálogo, exportações e produção são
gates do revisor da PR. Não são declaradas como concluídas por estes testes.

Rollback: retirar o registro da ferramenta e reverter os arquivos georef,
a página e seus testes. O archive BIM original e as outras ferramentas não
são modificados por esta implementação.

## Fontes técnicas

- [buildingSMART, IfcMapConversion IFC4](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/FINAL/HTML/schema/ifcrepresentationresource/lexical/ifcmapconversion.htm)
- [buildingSMART, guia de georreferenciamento IFC](https://www.buildingsmart.org/wp-content/uploads/2020/02/User-Guide-for-Geo-referencing-in-IFC-v2.0.pdf)
- [buildingSMART, regra de unidades GRF005](https://buildingsmart.github.io/ifc-gherkin-rules/branches/main/features/GRF005_CRS-unit-type-differences.html)
- O IFC Georeferencer v1.0.2 foi examinado como referência de arquitetura; seus
  mapas, grids, servidor e código de aplicação não são redistribuídos aqui.
  A implementação local usa o motor IFC e o conversor já licenciados no site.
