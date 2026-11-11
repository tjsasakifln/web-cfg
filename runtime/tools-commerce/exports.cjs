const { check, mac } = require('./policy.cjs');

const LOCAL_FORMATS = Object.freeze({
  'radier-solo-elastico': ['csv', 'json', 'svg'],
  'energia-solar-fotovoltaica': ['html', 'csv', 'json'],
  'conforto-termico': ['html', 'csv', 'json'],
  'geotecnia-cpt-estacas': ['html', 'csv', 'json'],
  'trelicas-e-porticos': ['html', 'csv', 'json'],
  'secao-de-concreto-armado': ['html', 'csv', 'json'],
  'propriedades-de-secoes': ['html', 'csv', 'json'],
  'memorial-de-calculo': ['html', 'csv', 'json', 'tex'],
  'bim-georreferenciador': ['ifc', 'json'],
  'bim-federacao': ['bcfzip'],
  'bim-cortes': ['svg'],
  'bim-inventario': ['csv', 'json'],
  'comparador-cronogramas': ['csv', 'svg'],
  'epanet-inp': ['csv', 'inp', 'json'],
  'quantitativos-dxf': ['csv', 'json'],
  'conversor-utm-sirgas-2000': ['csv'],
  'calculadora-de-beiral': ['txt'],
  'calculadora-psicrometrica': ['csv'],
  'analise-de-viga-continua': ['csv'],
  'diagrama-unifilar': ['svg'],
  'rede-de-agua': ['csv', 'inp'],
  'limite-acrescimos-supressoes': ['txt', 'print'],
  'checklist-reequilibrio': ['txt', 'print'],
  'matriz-atraso-obra': ['txt', 'print'],
  'diagnostico-defesa-margem': ['txt', 'print'],
  'prontidao-tecnica-obra-privada': ['print'],
  'caminho-critico-obra': ['csv'],
  'calculadora-bdi': ['csv'],
  'radar-mercado-publico': ['csv'],
  'orcamento-de-obras': ['xlsx', 'csv'],
  'cad-editor': ['dwg', 'dxf'],
  'analise-cnpj': ['txt'],
  'bim-cad': ['dxf', 'dwg'],
  'bim-digitalizar': ['dxf', 'dwg'],
  'bim-ifc-excel': ['xlsx'],
  'bim-visualizador': ['xlsx', 'csv'],
  'bim-modelagem': ['ifc', 'step'],
  'bim-oficina': ['ifc', 'json', 'csv'],
  'bim-chapas': ['svg'],
  'bim-comparar': ['csv'],
  'bim-regua': ['txt'],
  'bim-fotogrametria': ['ply', 'obj'],
  'cad-suite-cadcraft': ['bcfzip', 'craft', 'csv', 'dxf', 'e57', 'gcode', 'geojson', 'html', 'json', 'jsonl', 'las', 'mp4', 'obj', 'pdf', 'png', 'rul', 'stl', 'svg', 'swb', 'usda', 'webm', 'zip'],
  'cad-suite-bimcraft': ['bcfzip', 'craft', 'csv', 'dxf', 'e57', 'gcode', 'gltf', 'glb', 'html', 'ifc', 'json', 'jsonl', 'las', 'mp4', 'nc', 'obj', 'pcf', 'pdf', 'png', 'srt', 'stl', 'svg', 'txt', 'usda', 'usdc', 'usdz', 'vtt', 'wav', 'webm', 'xlsx', 'xml', 'zip'],
  'cad-suite-modelcraft': ['3mf', 'csv', 'dae', 'dwg', 'dxf', 'glb', 'html', 'ifc', 'json', 'jsonl', 'mp4', 'mtlx', 'obj', 'pdf', 'ply', 'png', 'stl', 'svg', 'usda', 'usdc', 'usdz', 'webm', 'zip'],
  'cad-suite-markupcraft': ['bcfzip', 'csv', 'json', 'jsonl', 'pdf', 'png', 'xlsx'],
  'cad-suite-takeoffcraft': ['csv', 'glb', 'json', 'jsonl', 'pdf', 'png', 'usdz', 'xlsx'],
  'cad-suite-civilcraft': ['csv', 'dwg', 'dxf', 'geojson', 'glb', 'html', 'ifc', 'json', 'jsonl', 'kml', 'landxml', 'obj', 'pdf', 'png', 'tif', 'tiff', 'usda', 'usdc', 'usdz', 'xml', 'zip'],
  'cad-suite-detailcraft': ['craft', 'csv', 'dwg', 'dxf', 'html', 'ifc', 'json', 'jsonl', 'kss', 'nc1', 'pdf', 'stl', 'txt', 'usda', 'usdc', 'usdz', 'zip'],
  'cad-suite-partcraft': ['3mf', 'csv', 'dxf', 'gcode', 'html', 'ifc', 'inp', 'json', 'jsonl', 'md', 'nc', 'obj', 'pcscript', 'pdf', 'step', 'stl', 'svg', 'swb', 'usdz', 'vdb', 'vti', 'vtk', 'vtu', 'zip'],
  'cad-suite-calculos': ['txt'],
});

const schema = 'confenge.tools.emission/v1';

function localArtifact(toolId, payload, key) {
  check(typeof toolId === 'string' && Object.hasOwn(LOCAL_FORMATS, toolId), 'INVALID_EXPORT', 422);
  check(payload && typeof payload === 'object' && !Array.isArray(payload) &&
    Object.keys(payload).length === 3, 'INVALID_EXPORT', 422);
  const { format, bytes, sha256 } = payload;
  check(LOCAL_FORMATS[toolId].includes(format) && Number.isSafeInteger(bytes) && bytes > 0 &&
    typeof sha256 === 'string' && /^[0-9a-f]{64}$/.test(sha256), 'INVALID_EXPORT', 422);

  const artifact = { schema, toolId, format, bytes, sha256 };
  const digest = mac(key, schema, JSON.stringify(artifact));
  return { digest, receipt(event) {
    return { ...artifact, id: event.exportId, issuedAt: new Date(event.at).toISOString(),
      proof: mac(key, 'local-export-issue', `${event.exportId}:${event.at}:${digest}`) };
  } };
}

module.exports = { LOCAL_FORMATS, localArtifact };
