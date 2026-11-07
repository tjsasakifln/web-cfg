import assert from 'node:assert/strict';
import test from 'node:test';
import {extractDwgPreview} from '../../cad/preview.mjs';

const sentinel = Buffer.from('1f256d07d43628289d57ca3f9d44102b','hex');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU04AAAAASUVORK5CYII=', 'base64');
function drawing(picture, type) {
  const start = 64, offset = start + 30, end = offset + picture.length;
  const bytes = Buffer.alloc(end + 16);
  bytes.write('AC1032'); bytes.writeUInt32LE(start, 13);
  sentinel.copy(bytes, start); bytes.writeUInt32LE(end - start - 20, start + 16);
  bytes[start + 20] = 1; bytes[start + 21] = type;
  bytes.writeUInt32LE(offset, start + 22); bytes.writeUInt32LE(picture.length, start + 26);
  picture.copy(bytes, offset); sentinel.map(n => 255 - n).copy(bytes, end);
  return bytes;
}
test('accepts the PNG in the declared section and respects typed array offsets', async () => {
  const preview = extractDwgPreview(drawing(png, 6));
  assert.equal(preview.type, 'image/png');
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), png);
});
test('converts an uncompressed DIB into a BMP with a valid pixel offset', async () => {
  const dib = Buffer.alloc(44); dib.writeUInt32LE(40); dib.writeInt32LE(1,4);
  dib.writeInt32LE(1,8); dib.writeUInt16LE(1,12); dib.writeUInt16LE(24,14);
  const preview = extractDwgPreview(drawing(dib, 2));
  assert.equal(preview.type, 'image/bmp');
  const bytes = Buffer.from(await preview.arrayBuffer());
  assert.equal(bytes.readUInt32LE(10), 54); assert.equal(bytes.readUInt32LE(2), bytes.length);
});
test('rejects forged signatures, offsets, lengths and excessive dimensions', () => {
  for (const mutate of [
    b => b.write('bogus'), b => b.writeUInt32LE(0xffffffff,13), b => b.fill(0,64,80),
    b => b.writeUInt32LE(0xffffffff,80), b => b.writeUInt32LE(20,86), b => b.writeUInt32LE(0xffffffff,90),
    b => b.fill(0,b.length-16), b => b.writeUInt32BE(65535,94+16),
    b => b.writeUInt32BE(0xffffffff,94+33), b => b.writeUInt32BE(0x6163544c,94+37)
  ]) {
    const bytes=drawing(png,6); mutate(bytes);
    assert.equal(extractDwgPreview(bytes), null);
  }
  assert.equal(extractDwgPreview(png), null);
  assert.equal(extractDwgPreview(new Uint8Array()), null);
});
