const encoder = new TextEncoder();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pointShapefile() {
  const bytes = new Uint8Array(128), view = new DataView(bytes.buffer);
  view.setInt32(0, 9994, false); view.setInt32(24, 64, false);
  view.setInt32(28, 1000, true); view.setInt32(32, 1, true);
  for (const offset of [36, 52]) view.setFloat64(offset, -48.55, true);
  for (const offset of [44, 60]) view.setFloat64(offset, -27.6, true);
  view.setInt32(100, 1, false); view.setInt32(104, 10, false); view.setInt32(108, 1, true);
  view.setFloat64(112, -48.55, true); view.setFloat64(120, -27.6, true);
  return bytes;
}

function pointIndex() {
  const bytes = new Uint8Array(108), view = new DataView(bytes.buffer);
  view.setInt32(0, 9994, false); view.setInt32(24, 54, false);
  view.setInt32(28, 1000, true); view.setInt32(32, 1, true);
  view.setInt32(100, 50, false); view.setInt32(104, 10, false);
  return bytes;
}

function pointDbf() {
  const bytes = new Uint8Array(77), view = new DataView(bytes.buffer);
  bytes[0] = 3; bytes[1] = 126; bytes[2] = 11; bytes[3] = 23;
  view.setUint32(4, 1, true); view.setUint16(8, 65, true); view.setUint16(10, 11, true);
  bytes.set(encoder.encode('NOME'), 32); bytes[43] = 'C'.charCodeAt(0); bytes[48] = 10; bytes[64] = 13;
  bytes[65] = 32; bytes.set(encoder.encode('DEMONSTRAC'), 66); bytes[76] = 26;
  return bytes;
}

function storedZip(entries) {
  const files = [], directory = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = encoder.encode(name), bytes = typeof data === 'string' ? encoder.encode(data) : data;
    const local = new Uint8Array(30 + nameBytes.length), localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true);
    localView.setUint32(14, crc32(bytes), true); localView.setUint32(18, bytes.length, true); localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, nameBytes.length, true); local.set(nameBytes, 30); files.push(local, bytes);
    const central = new Uint8Array(46 + nameBytes.length), centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc32(bytes), true); centralView.setUint32(20, bytes.length, true); centralView.setUint32(24, bytes.length, true);
    centralView.setUint16(28, nameBytes.length, true); centralView.setUint32(42, offset, true); central.set(nameBytes, 46); directory.push(central);
    offset += local.length + bytes.length;
  }
  const directorySize = directory.reduce((size, part) => size + part.length, 0), end = new Uint8Array(22), endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, entries.length, true); endView.setUint16(10, entries.length, true);
  endView.setUint32(12, directorySize, true); endView.setUint32(16, offset, true);
  const parts = [...files, ...directory, end], zip = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let cursor = 0; for (const part of parts) { zip.set(part, cursor); cursor += part.length; }
  return zip;
}

export function createDemoZip() {
  return storedZip([
    ['exemplo.shp', pointShapefile()], ['exemplo.shx', pointIndex()], ['exemplo.dbf', pointDbf()],
    ['exemplo.prj', 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'],
  ]);
}
