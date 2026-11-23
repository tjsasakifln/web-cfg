const NORMALIZE = (value) => String(value || '').toUpperCase().replace(/\s+/g, ' ');

export function identifyProjection(wkt) {
  const source = NORMALIZE(wkt);
  if (!source) return { ok: false, reason: 'O ZIP precisa conter o arquivo .prj com o sistema de coordenadas.' };

  const geographic = /WGS[ _]?(84|1984)|SIRGAS[ _]?2000/.test(source);
  const utm = /UTM[ _]?(ZONE|FUSO)?\s*\d{1,2}[NS]?|TRANSVERSE[_ ]MERCATOR/.test(source);
  const recognizedDatum = /WGS[ _]?(84|1984)|SIRGAS[ _]?2000/.test(source);

  if (!recognizedDatum) {
    return { ok: false, reason: 'O .prj usa um datum que este piloto ainda não reconhece. Converta ou confirme o CRS antes de continuar.' };
  }
  if (utm && !/UTM/.test(source)) {
    return { ok: false, reason: 'O .prj descreve uma projeção sem identificar o fuso UTM. Este piloto não infere projeções.' };
  }
  if (!geographic && !utm) {
    return { ok: false, reason: 'O .prj não informa um CRS reconhecido. Este piloto não converte arquivos de origem ambígua.' };
  }
  return {
    ok: true,
    label: /SIRGAS[ _]?2000/.test(source) ? 'SIRGAS 2000' : 'WGS 84',
    kind: utm ? 'UTM' : 'geográfico'
  };
}

function validateGeometry(geometry) {
  if (geometry === null) return;
  const walk = (value) => {
    if (!Array.isArray(value)) throw new Error('A geometria convertida é inválida.');
    if (typeof value[0] === 'number') {
      if (value.length < 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1]) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) {
        throw new Error('A geometria resultante ficou fora dos limites geográficos do GeoJSON.');
      }
      return;
    }
    value.forEach(walk);
  };
  if (!geometry || typeof geometry.type !== 'string') throw new Error('A geometria convertida é inválida.');
  walk(geometry.coordinates);
}

export function normalizeLayers(parsed, { maxFeatures = 100000 } = {}) {
  const layers = Array.isArray(parsed) ? parsed : [parsed];
  if (!layers.length || layers.some((layer) => !layer || layer.type !== 'FeatureCollection')) {
    throw new Error('O arquivo não contém uma camada SHP que possa ser convertida.');
  }
  const total = layers.reduce((count, layer) => count + layer.features.length, 0);
  if (total > maxFeatures) throw new Error('A camada excede o limite de 100.000 feições deste piloto.');
  return layers.map((layer, index) => ({
    type: 'FeatureCollection',
    name: layer.fileName || `camada-${index + 1}`,
    features: layer.features.map((feature) => {
      validateGeometry(feature.geometry || null);
      return {
        type: 'Feature',
        properties: feature.properties || {},
        geometry: feature.geometry || null
      };
    })
  }));
}
