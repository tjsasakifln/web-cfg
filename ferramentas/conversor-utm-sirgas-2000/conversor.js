import utm from './vendor/utm.js';

const degrees = Math.PI / 180;
const flattening = 1 / 298.257222101; // GRS 80
export const limit = 1000;

function epsg(zone, hemisphere) {
  if (!Number.isInteger(zone) || zone < 18 ||
      (hemisphere !== 'N' && hemisphere !== 'S') || zone > (hemisphere === 'N' ? 22 : 25)) {
    throw new Error('Use um fuso de 18 a 25 Sul ou de 18 a 22 Norte.');
  }
  return (hemisphere === 'S' ? 31960 : 31954) + zone;
}

function projection(zone, hemisphere) {
  const parameters = { a: 6378137, es: flattening * (2 - flattening), zone, utmSouth: hemisphere === 'S' };
  utm.init.call(parameters);
  return parameters;
}

function checkDomain(lat, lon, tolerance = 0) {
  // Scope is an envelope covering mainland Brazil, not a political boundary.
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -35 - tolerance || lat > 6 + tolerance || lon < -75 - tolerance || lon > -31 + tolerance) {
    throw new Error('Coordenada fora da faixa atendida (latitude −35 a +6 e longitude −75 a −31 graus). Confira a ordem e os sinais.');
  }
}

export function fromGeographic(lat, lon) {
  checkDomain(lat, lon);
  const zone = Math.floor((lon + 180) / 6) + 1;
  const hemisphere = lat < 0 ? 'S' : 'N';
  const code = epsg(zone, hemisphere);
  const { x, y } = projection(zone, hemisphere).forward({ x: lon * degrees, y: lat * degrees });
  return { lat, lon, easting: x, northing: y, zone, hemisphere, code };
}

export function fromUtm(easting, northing, zone, hemisphere) {
  const code = epsg(zone, hemisphere);
  if (!Number.isFinite(easting) || !Number.isFinite(northing) ||
      easting < 100000 || easting > 900000 || northing < 0 || northing > 10000000) {
    throw new Error('Confira E e N em metros, sem separador de milhar. A ferramenta usa o hemisfério geográfico do ponto.');
  }
  const { x, y } = projection(zone, hemisphere).inverse({ x: easting, y: northing });
  const lat = y / degrees;
  const lon = x / degrees;
  // CSV precision is one millimetre, including at the inclusive domain edges.
  checkDomain(lat, lon, 1e-8);
  // Accept centimetre rounding on zone edges, including the Equator.
  if (Math.abs(lon - (6 * zone - 183)) > 3.000001 ||
      (hemisphere === 'N' ? lat < -0.000001 : lat > 0.000001)) {
    throw new Error('O ponto cai fora do fuso natural informado. Confira E, N, fuso e hemisfério na planta.');
  }
  return { lat, lon, easting, northing, zone, hemisphere, code };
}

export function readPoints(text, convert) {
  const rows = text.trim().split(/\r?\n/);
  if (!text.trim()) throw new Error('Informe ao menos um par de coordenadas.');
  if (rows.length > limit || text.length > 100000) throw new Error('Divida o levantamento em lotes de até 1.000 pontos.');
  return rows.map((row, index) => {
    try {
      const cells = row.trim().split(/[;\t]/).map(part => part.trim());
      if (cells.length !== 2 || !cells.every(part => /^[+-]?\d+(?:[.,]\d+)?$/.test(part))) {
        throw new Error('Use dois números separados por ponto e vírgula ou tabulação, sem cabeçalho nem separador de milhar.');
      }
      return convert(...cells.map(part => Number(part.replace(',', '.'))));
    } catch (error) {
      throw new Error('Linha ' + (index + 1) + '. ' + error.message);
    }
  });
}

export const columns = ['Ponto', 'Latitude (°)', 'Longitude (°)', 'E (m)', 'N (m)', 'Fuso', 'EPSG UTM'];
export function values(point, index) {
  const pt = (n, precision) => n.toFixed(precision).replace('.', ',');
  return [String(index + 1), pt(point.lat, 8), pt(point.lon, 8), pt(point.easting, 3),
    pt(point.northing, 3), point.zone + point.hemisphere, String(point.code)];
}
