/**
 * Pure local uncompressed BMP binary encoder (24-bit BGR or 32-bit BGRA).
 * Writes standard BITMAPFILEHEADER (14 bytes) + BITMAPINFOHEADER (40 bytes) + bottom-up pixel rows.
 */
export function encodeBMP(imageData: ImageData, includeAlpha = false): Uint8Array {
  const { width, height, data } = imageData;
  const bpp = includeAlpha ? 32 : 24;
  const bytesPerPixel = bpp / 8;
  const rawRowSize = width * bytesPerPixel;
  const paddedRowSize = Math.ceil(rawRowSize / 4) * 4;
  const pixelArraySize = paddedRowSize * height;
  const headerSize = 54;
  const fileSize = headerSize + pixelArraySize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // BITMAPFILEHEADER (14 bytes)
  view.setUint8(0, 0x42); // 'B'
  view.setUint8(1, 0x4d); // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint32(10, headerSize, true);

  // BITMAPINFOHEADER (40 bytes)
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive = bottom-up
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, bpp, true);
  view.setUint32(30, 0, true); // BI_RGB (uncompressed)
  view.setUint32(34, pixelArraySize, true);
  view.setInt32(38, 2835, true); // ~72 DPI
  view.setInt32(42, 2835, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);

  // Pixel data (bottom-up scanlines, BGR / BGRA order)
  for (let y = 0; y < height; y++) {
    const srcRow = height - 1 - y;
    const dstRowOffset = headerSize + y * paddedRowSize;
    for (let x = 0; x < width; x++) {
      const srcIdx = (srcRow * width + x) * 4;
      const dstIdx = dstRowOffset + x * bytesPerPixel;
      bytes[dstIdx] = data[srcIdx + 2]; // B
      bytes[dstIdx + 1] = data[srcIdx + 1]; // G
      bytes[dstIdx + 2] = data[srcIdx]; // R
      if (includeAlpha) {
        bytes[dstIdx + 3] = data[srcIdx + 3]; // A
      }
    }
  }

  return bytes;
}
