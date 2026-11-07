// DWG image seeker and picture directory, Open Design Specification for .dwg files.
// Read only the declared preview section, never an arbitrary image in a drawing.
const sentinel = [31, 37, 109, 7, 212, 54, 40, 40, 157, 87, 202, 63, 157, 68, 16, 43];
const pngMagic = [137, 80, 78, 71, 13, 10, 26, 10];
const maxBytes = 4 * 1024 * 1024;
const matches = (bytes, at, pattern) => pattern.every((value, index) => bytes[at + index] === value);
const dimensionsOK = (width, height) => width > 0 && width <= 2048 && height > 0 && height <= 2048;

function pngPreview(bytes, view) {
  if (bytes.length < 45 || !matches(bytes, 0, pngMagic) ||
      view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452 ||
      !dimensionsOK(view.getUint32(16), view.getUint32(20))) return null;

  const chunks = [bytes.subarray(0, 33)];
  let hasPixels = false;
  let at = 33;
  for (let count = 0; count < 2048 && at + 12 <= bytes.length; count++) {
    const size = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const end = at + size + 12;
    if (end > bytes.length || type === 'IHDR' || type === 'acTL') return null;
    // Keep the static image. Discard comments, color profiles and other metadata.
    if (['PLTE', 'tRNS', 'IDAT', 'IEND'].includes(type)) chunks.push(bytes.subarray(at, end));
    if (type === 'IDAT' && size) hasPixels = true;
    if (type === 'IEND') return hasPixels && size === 0 && end === bytes.length ? new Blob(chunks, {type: 'image/png'}) : null;
    at = end;
  }
  return null;
}

function bitmapPreview(bytes, view) {
  if (bytes.length < 40 || view.getUint32(0, true) !== 40 || view.getUint16(12, true) !== 1 || view.getUint32(16, true) !== 0) return null;
  const width = view.getInt32(4, true);
  const height = Math.abs(view.getInt32(8, true));
  const bits = view.getUint16(14, true);
  if (!dimensionsOK(width, height) || ![1, 4, 8, 24, 32].includes(bits)) return null;
  const maxColors = bits <= 8 ? 2 ** bits : 0;
  const colors = view.getUint32(32, true) || maxColors;
  if (colors > maxColors) return null;
  const pixelsAt = 40 + 4 * colors;
  const dibSize = pixelsAt + height * 4 * Math.ceil(width * bits / 32);
  if (dibSize > bytes.length) return null;

  const header = new Uint8Array(14);
  const fields = new DataView(header.buffer);
  header.set([66, 77]); // The DWG stores a DIB, without the BMP file header.
  fields.setUint32(2, 14 + dibSize, true);
  fields.setUint32(10, 14 + pixelsAt, true);
  return new Blob([header, bytes.subarray(0, dibSize)], {type: 'image/bmp'});
}

export function extractDwgPreview(input) {
  if (!(input instanceof ArrayBuffer || input instanceof Uint8Array)) return null;
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 21 || !/^AC10\d\d$/.test(String.fromCharCode(...bytes.subarray(0, 6)))) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = view.getUint32(13, true);
  if (start + 21 > bytes.length || !matches(bytes, start, sentinel)) return null;
  const end = start + 20 + view.getUint32(start + 16, true);
  const count = bytes[start + 20];
  const entries = start + 21;
  const dataAt = entries + count * 9;
  if (dataAt > end || end + 16 > bytes.length || !matches(bytes, end, sentinel.map(n => 255 - n))) return null;

  for (let at = entries; at < dataAt; at += 9) {
    const type = bytes[at];
    if (type !== 2 && type !== 6) continue;
    const offset = view.getUint32(at + 1, true);
    const size = view.getUint32(at + 5, true);
    if (offset < dataAt || !size || size > maxBytes || offset + size > end) continue;
    const image = bytes.subarray(offset, offset + size);
    const fields = new DataView(image.buffer, image.byteOffset, image.length);
    const result = type === 6 ? pngPreview(image, fields) : bitmapPreview(image, fields);
    if (result) return result;
  }
  return null;
}
