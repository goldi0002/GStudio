import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Generates deterministic PNG fixtures for the batch-processing E2E test.
 * Run with: bun scripts/make-fixtures.ts
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function makePng(
  width: number,
  height: number,
  color: [number, number, number, number],
  stripe?: [number, number, number, number]
): Buffer {
  const rowLength = width * 4 + 1;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowLength;
    raw[rowStart] = 0; // filter: none
    const pixel = stripe && y > height / 2 ? stripe : color;
    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + 1 + x * 4;
      raw[offset] = pixel[0];
      raw[offset + 1] = pixel[1];
      raw[offset + 2] = pixel[2];
      raw[offset + 3] = pixel[3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const fixtures: Array<{ file: string; width: number; height: number; color: [number, number, number, number]; stripe?: [number, number, number, number] }> = [
  { file: 'red-640x480.png', width: 640, height: 480, color: [220, 40, 40, 255], stripe: [120, 20, 20, 255] },
  { file: 'blue-800x600.png', width: 800, height: 600, color: [20, 90, 220, 255], stripe: [255, 255, 255, 255] },
  { file: 'green-320x240.png', width: 320, height: 240, color: [30, 180, 90, 255] },
];

const outDir = resolve('tests/fixtures');
mkdirSync(outDir, { recursive: true });
for (const fixture of fixtures) {
  const path = resolve(outDir, fixture.file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, makePng(fixture.width, fixture.height, fixture.color, fixture.stripe));
  console.log(`wrote ${path}`);
}
