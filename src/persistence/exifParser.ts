import type { ImageExifMetadata } from '../types/editor';

const MAX_IFD_ENTRIES = 512;
const MAX_EXIF_STRING_LEN = 160;

const TYPE_SIZES: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8, // SRATIONAL
};

const ORIENTATION_LABELS: Record<number, string> = {
  1: '1 · Normal',
  2: '2 · Flip Horizontal',
  3: '3 · Rotate 180°',
  4: '4 · Flip Vertical',
  5: '5 · Transpose',
  6: '6 · Rotate 90° CW',
  7: '7 · Transverse',
  8: '8 · Rotate 270° CW',
};

const EXPOSURE_PROGRAM_LABELS: Record<number, string> = {
  0: 'Not defined',
  1: 'Manual',
  2: 'Program AE',
  3: 'Aperture Priority',
  4: 'Shutter Priority',
  5: 'Creative (Slow speed)',
  6: 'Action (High speed)',
  7: 'Portrait',
  8: 'Landscape',
};

const METERING_MODE_LABELS: Record<number, string> = {
  0: 'Unknown',
  1: 'Average',
  2: 'Center-weighted',
  3: 'Spot',
  4: 'Multi-spot',
  5: 'Multi-segment',
  6: 'Partial',
  255: 'Other',
};

function sanitizeExifString(raw: string): string | undefined {
  let out = '';
  for (let i = 0; i < raw.length && out.length < MAX_EXIF_STRING_LEN; i++) {
    const code = raw.charCodeAt(i);
    if (code === 0) break;
    if (code >= 32 && code !== 127) {
      out += raw[i];
    }
  }
  const trimmed = out.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatExifDateTime(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Common EXIF format: "YYYY:MM:DD HH:MM:SS"
  const match = /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}:\d{2}:\d{2})$/.exec(raw);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]} ${match[4]}`;
  }
  return raw;
}

function formatNumberTrimmed(value: number, maxDecimals: number): string {
  const fixed = value.toFixed(maxDecimals);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function formatExposureTime(seconds: number): string | undefined {
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  if (seconds < 0.5) {
    const denom = Math.round(1 / seconds);
    if (denom >= 2) return `1/${denom} s`;
  }
  return `${formatNumberTrimmed(seconds, 2)} s`;
}

function formatFNumber(f: number): string | undefined {
  if (!Number.isFinite(f) || f <= 0) return undefined;
  return `f/${formatNumberTrimmed(f, 1)}`;
}

function formatFocalLength(mm: number): string | undefined {
  if (!Number.isFinite(mm) || mm <= 0) return undefined;
  return `${formatNumberTrimmed(mm, 1)} mm`;
}

function formatExposureBias(ev: number): string | undefined {
  if (!Number.isFinite(ev)) return undefined;
  if (Math.abs(ev) < 0.01) return '0 EV';
  const sign = ev > 0 ? '+' : '';
  return `${sign}${formatNumberTrimmed(ev, 2)} EV`;
}

function formatCameraCoords(
  dms: number[],
  ref: string | undefined
): number | undefined {
  if (dms.length < 3) return undefined;
  const [d, m, s] = dms;
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(s)) return undefined;
  let dec = Math.abs(d) + m / 60 + s / 3600;
  if (ref === 'S' || ref === 'W') dec = -dec;
  if (!Number.isFinite(dec) || Math.abs(dec) > 180) return undefined;
  return Number(dec.toFixed(6));
}

function readAscii(bytes: Uint8Array, start: number, length: number): string | undefined {
  if (start < 0 || length <= 0 || start + length > bytes.length) return undefined;
  const slice = bytes.subarray(start, Math.min(bytes.length, start + length));
  let text = '';
  for (let i = 0; i < slice.length; i++) {
    const b = slice[i];
    if (b === 0) break;
    text += String.fromCharCode(b);
  }
  return sanitizeExifString(text);
}

interface ParsedIfd {
  entries: Map<number, { type: number; count: number; dataOffset: number }>;
  nextIfdOffset: number;
}

function parseIfd(
  view: DataView,
  tiffStart: number,
  tiffLength: number,
  ifdRelOffset: number,
  littleEndian: boolean
): ParsedIfd | null {
  const absStart = tiffStart + ifdRelOffset;
  if (ifdRelOffset < 0 || absStart + 2 > tiffStart + tiffLength) return null;

  const rawCount = view.getUint16(absStart, littleEndian);
  const count = Math.min(rawCount, MAX_IFD_ENTRIES);
  const entries = new Map<number, { type: number; count: number; dataOffset: number }>();

  for (let i = 0; i < count; i++) {
    const entryOffset = absStart + 2 + i * 12;
    if (entryOffset + 12 > tiffStart + tiffLength) break;

    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const valCount = view.getUint32(entryOffset + 4, littleEndian);
    const unitSize = TYPE_SIZES[type];
    if (!unitSize || valCount === 0 || valCount > 16384) continue;

    const totalSize = unitSize * valCount;
    let dataOffset: number;
    if (totalSize <= 4) {
      dataOffset = entryOffset + 8;
    } else {
      const relPtr = view.getUint32(entryOffset + 8, littleEndian);
      if (relPtr < 8 || relPtr + totalSize > tiffLength) continue;
      dataOffset = tiffStart + relPtr;
    }
    entries.set(tag, { type, count: valCount, dataOffset });
  }

  const nextPtrPos = absStart + 2 + rawCount * 12;
  const nextIfdOffset =
    nextPtrPos + 4 <= tiffStart + tiffLength ? view.getUint32(nextPtrPos, littleEndian) : 0;

  return { entries, nextIfdOffset };
}

function readNumericValues(
  view: DataView,
  entry: { type: number; count: number; dataOffset: number } | undefined,
  littleEndian: boolean
): number[] {
  if (!entry) return [];
  const out: number[] = [];
  const maxItems = Math.min(entry.count, 16);
  for (let i = 0; i < maxItems; i++) {
    if (entry.type === 3) {
      out.push(view.getUint16(entry.dataOffset + i * 2, littleEndian));
    } else if (entry.type === 4) {
      out.push(view.getUint32(entry.dataOffset + i * 4, littleEndian));
    } else if (entry.type === 9) {
      out.push(view.getInt32(entry.dataOffset + i * 4, littleEndian));
    } else if (entry.type === 5) {
      const num = view.getUint32(entry.dataOffset + i * 8, littleEndian);
      const den = view.getUint32(entry.dataOffset + i * 8 + 4, littleEndian);
      if (den !== 0) out.push(num / den);
    } else if (entry.type === 10) {
      const num = view.getInt32(entry.dataOffset + i * 8, littleEndian);
      const den = view.getInt32(entry.dataOffset + i * 8 + 4, littleEndian);
      if (den !== 0) out.push(num / den);
    } else if (entry.type === 1) {
      out.push(view.getUint8(entry.dataOffset + i));
    }
  }
  return out;
}

function readSingleNumber(
  view: DataView,
  entry: { type: number; count: number; dataOffset: number } | undefined,
  littleEndian: boolean
): number | undefined {
  const vals = readNumericValues(view, entry, littleEndian);
  return vals.length > 0 && Number.isFinite(vals[0]) ? vals[0] : undefined;
}

function readEntryString(
  bytes: Uint8Array,
  entry: { type: number; count: number; dataOffset: number } | undefined
): string | undefined {
  if (!entry || (entry.type !== 2 && entry.type !== 7 && entry.type !== 1)) return undefined;
  return readAscii(bytes, entry.dataOffset, entry.count);
}

function parseTiffExif(
  bytes: Uint8Array,
  tiffStart: number,
  tiffLength: number
): ImageExifMetadata | null {
  if (tiffStart < 0 || tiffLength < 8 || tiffStart + tiffLength > bytes.length) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const byteOrder = view.getUint16(tiffStart, false);
  let littleEndian: boolean;
  if (byteOrder === 0x4949) {
    littleEndian = true;
  } else if (byteOrder === 0x4d4d) {
    littleEndian = false;
  } else {
    return null;
  }

  if (view.getUint16(tiffStart + 2, littleEndian) !== 42) {
    return null;
  }

  const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
  const ifd0 = parseIfd(view, tiffStart, tiffLength, ifd0Offset, littleEndian);
  if (!ifd0) return null;

  const meta: ImageExifMetadata = {};

  meta.make = readEntryString(bytes, ifd0.entries.get(0x010f));
  meta.model = readEntryString(bytes, ifd0.entries.get(0x0110));
  meta.software = readEntryString(bytes, ifd0.entries.get(0x0131));
  meta.artist = readEntryString(bytes, ifd0.entries.get(0x013b));
  meta.copyright = readEntryString(bytes, ifd0.entries.get(0x8298));

  const orientationVal = readSingleNumber(view, ifd0.entries.get(0x0112), littleEndian);
  if (orientationVal !== undefined && ORIENTATION_LABELS[orientationVal]) {
    meta.orientation = ORIENTATION_LABELS[orientationVal];
  }

  const xRes = readSingleNumber(view, ifd0.entries.get(0x011a), littleEndian);
  const resUnit = readSingleNumber(view, ifd0.entries.get(0x0128), littleEndian);
  if (xRes !== undefined && xRes > 0) {
    const unit = resUnit === 3 ? 'dpcm' : 'dpi';
    meta.xResolution = `${formatNumberTrimmed(xRes, 0)} ${unit}`;
  }

  const fallbackDate = formatExifDateTime(readEntryString(bytes, ifd0.entries.get(0x0132)));

  // ExifIFD
  const exifIfdOffset = readSingleNumber(view, ifd0.entries.get(0x8769), littleEndian);
  if (exifIfdOffset !== undefined && exifIfdOffset >= 8 && exifIfdOffset !== ifd0Offset) {
    const exifIfd = parseIfd(view, tiffStart, tiffLength, exifIfdOffset, littleEndian);
    if (exifIfd) {
      meta.dateTimeOriginal =
        formatExifDateTime(readEntryString(bytes, exifIfd.entries.get(0x9003))) ??
        formatExifDateTime(readEntryString(bytes, exifIfd.entries.get(0x9004))) ??
        fallbackDate;

      const focal = readSingleNumber(view, exifIfd.entries.get(0x920a), littleEndian);
      if (focal !== undefined) meta.focalLength = formatFocalLength(focal);

      const focal35 = readSingleNumber(view, exifIfd.entries.get(0xa405), littleEndian);
      if (focal35 !== undefined && focal35 > 0) {
        meta.focalLength35mm = `${Math.round(focal35)} mm`;
      }

      const fNumber = readSingleNumber(view, exifIfd.entries.get(0x829d), littleEndian);
      if (fNumber !== undefined) meta.aperture = formatFNumber(fNumber);

      const exposureTime = readSingleNumber(view, exifIfd.entries.get(0x829a), littleEndian);
      if (exposureTime !== undefined) meta.shutterSpeed = formatExposureTime(exposureTime);

      const iso = readSingleNumber(view, exifIfd.entries.get(0x8827), littleEndian);
      if (iso !== undefined && iso > 0) meta.iso = Math.round(iso);

      const bias = readSingleNumber(view, exifIfd.entries.get(0x9204), littleEndian);
      if (bias !== undefined) meta.exposureBias = formatExposureBias(bias);

      const program = readSingleNumber(view, exifIfd.entries.get(0x8822), littleEndian);
      if (program !== undefined && EXPOSURE_PROGRAM_LABELS[program]) {
        meta.exposureProgram = EXPOSURE_PROGRAM_LABELS[program];
      }

      const metering = readSingleNumber(view, exifIfd.entries.get(0x9207), littleEndian);
      if (metering !== undefined && METERING_MODE_LABELS[metering]) {
        meta.meteringMode = METERING_MODE_LABELS[metering];
      }

      const wb = readSingleNumber(view, exifIfd.entries.get(0xa403), littleEndian);
      if (wb === 0) meta.whiteBalance = 'Auto';
      else if (wb === 1) meta.whiteBalance = 'Manual';

      const flash = readSingleNumber(view, exifIfd.entries.get(0x9209), littleEndian);
      if (flash !== undefined) {
        meta.flash = (flash & 1) === 1 ? 'Fired' : 'Did not fire';
      }

      const cs = readSingleNumber(view, exifIfd.entries.get(0xa001), littleEndian);
      if (cs === 1) meta.colorSpace = 'sRGB';
      else if (cs === 65535) meta.colorSpace = 'Uncalibrated';

      const exifW = readSingleNumber(view, exifIfd.entries.get(0xa002), littleEndian);
      const exifH = readSingleNumber(view, exifIfd.entries.get(0xa003), littleEndian);
      if (exifW !== undefined && exifW > 0) meta.exifWidth = Math.round(exifW);
      if (exifH !== undefined && exifH > 0) meta.exifHeight = Math.round(exifH);

      meta.lensMake = readEntryString(bytes, exifIfd.entries.get(0xa433));
      meta.lensModel = readEntryString(bytes, exifIfd.entries.get(0xa434));
    }
  } else if (fallbackDate) {
    meta.dateTimeOriginal = fallbackDate;
  }

  // GPS IFD
  const gpsIfdOffset = readSingleNumber(view, ifd0.entries.get(0x8825), littleEndian);
  if (gpsIfdOffset !== undefined && gpsIfdOffset >= 8 && gpsIfdOffset !== ifd0Offset) {
    const gpsIfd = parseIfd(view, tiffStart, tiffLength, gpsIfdOffset, littleEndian);
    if (gpsIfd) {
      const latRef = readEntryString(bytes, gpsIfd.entries.get(0x0001));
      const latDms = readNumericValues(view, gpsIfd.entries.get(0x0002), littleEndian);
      const lonRef = readEntryString(bytes, gpsIfd.entries.get(0x0003));
      const lonDms = readNumericValues(view, gpsIfd.entries.get(0x0004), littleEndian);
      const lat = formatCameraCoords(latDms, latRef);
      const lon = formatCameraCoords(lonDms, lonRef);
      if (lat !== undefined && lon !== undefined) {
        const altRef = readSingleNumber(view, gpsIfd.entries.get(0x0005), littleEndian);
        const altVal = readSingleNumber(view, gpsIfd.entries.get(0x0006), littleEndian);
        const altitude =
          altVal !== undefined && Number.isFinite(altVal)
            ? `${altRef === 1 ? '-' : ''}${formatNumberTrimmed(altVal, 1)} m`
            : undefined;
        meta.gps = { latitude: lat, longitude: lon, ...(altitude ? { altitude } : {}) };
      }
    }
  }

  return hasAnyExifFields(meta) ? meta : null;
}

function parseJpegExif(bytes: Uint8Array): ImageExifMetadata | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.length) break;
    const marker = bytes[offset];
    offset += 1;

    // Standalone markers without length
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xd8) {
      continue;
    }
    // Start of scan or EOI ends header segment walk
    if (marker === 0xda || marker === 0xd9) break;
    if (offset + 2 > bytes.length) break;

    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;

    // APP1 marker with "Exif\0\0"
    if (marker === 0xe1 && segmentLength >= 16) {
      const sig =
        bytes[offset + 2] === 0x45 && // E
        bytes[offset + 3] === 0x78 && // x
        bytes[offset + 4] === 0x69 && // i
        bytes[offset + 5] === 0x66 && // f
        bytes[offset + 6] === 0x00 &&
        bytes[offset + 7] === 0x00;
      if (sig) {
        return parseTiffExif(bytes, offset + 8, segmentLength - 8);
      }
    }

    offset += segmentLength;
  }

  return null;
}

function parsePngExif(bytes: Uint8Array): ImageExifMetadata | null {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const chunkLen = view.getUint32(offset, false);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );
    const dataStart = offset + 8;
    if (dataStart + chunkLen + 4 > bytes.length) break;

    if (type === 'eXIf' && chunkLen >= 8) {
      // PNG eXIf starts directly with TIFF header ("II" or "MM")
      return parseTiffExif(bytes, dataStart, chunkLen);
    }
    if (type === 'IEND') break;
    offset = dataStart + chunkLen + 4;
  }

  return null;
}

function parseWebpExif(bytes: Uint8Array): ImageExifMetadata | null {
  // RIFF....WEBP
  if (
    bytes.length < 16 ||
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 ||
    bytes[9] !== 0x45 ||
    bytes[10] !== 0x42 ||
    bytes[11] !== 0x50
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    const chunkSize = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    if (dataStart + chunkSize > bytes.length) break;

    if (chunkId === 'EXIF' && chunkSize >= 8) {
      // Some encoders prepend "Exif\0\0", others start straight with TIFF header
      const hasExifPrefix =
        chunkSize >= 14 &&
        bytes[dataStart] === 0x45 &&
        bytes[dataStart + 1] === 0x78 &&
        bytes[dataStart + 2] === 0x69 &&
        bytes[dataStart + 3] === 0x66 &&
        bytes[dataStart + 4] === 0x00 &&
        bytes[dataStart + 5] === 0x00;
      return hasExifPrefix
        ? parseTiffExif(bytes, dataStart + 6, chunkSize - 6)
        : parseTiffExif(bytes, dataStart, chunkSize);
    }

    offset = dataStart + chunkSize + (chunkSize % 2);
  }

  return null;
}

export function hasAnyExifFields(exif: ImageExifMetadata | null | undefined): boolean {
  if (!exif) return false;
  return Boolean(
    exif.make ||
      exif.model ||
      exif.lensMake ||
      exif.lensModel ||
      exif.dateTimeOriginal ||
      exif.focalLength ||
      exif.focalLength35mm ||
      exif.aperture ||
      exif.shutterSpeed ||
      exif.iso !== undefined ||
      exif.exposureBias ||
      exif.exposureProgram ||
      exif.meteringMode ||
      exif.whiteBalance ||
      exif.flash ||
      exif.orientation ||
      exif.colorSpace ||
      exif.xResolution ||
      exif.software ||
      exif.artist ||
      exif.copyright ||
      exif.gps
  );
}

/**
 * Extract EXIF camera/capture metadata locally from JPEG, PNG, WebP, or TIFF bytes.
 */
export function parseExifFromBuffer(input: ArrayBuffer | Uint8Array): ImageExifMetadata | null {
  try {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.length < 12) return null;

    // JPEG
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      return parseJpegExif(bytes);
    }
    // PNG
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return parsePngExif(bytes);
    }
    // WebP
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      return parseWebpExif(bytes);
    }
    // Raw TIFF
    if (
      (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
    ) {
      return parseTiffExif(bytes, 0, bytes.length);
    }
    return null;
  } catch {
    return null;
  }
}

export function formatCameraDisplayName(exif: ImageExifMetadata | null | undefined): string | null {
  if (!exif) return null;
  const make = exif.make?.trim();
  const model = exif.model?.trim();
  if (make && model) {
    if (model.toLowerCase().startsWith(make.toLowerCase())) return model;
    return `${make} ${model}`;
  }
  return model || make || null;
}

export function formatLensDisplayName(exif: ImageExifMetadata | null | undefined): string | null {
  if (!exif) return null;
  const make = exif.lensMake?.trim();
  const model = exif.lensModel?.trim();
  if (make && model) {
    if (model.toLowerCase().startsWith(make.toLowerCase())) return model;
    return `${make} ${model}`;
  }
  return model || make || null;
}
