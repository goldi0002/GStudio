export type ColorRangeMode =
  | 'sampled'
  | 'reds'
  | 'yellows'
  | 'greens'
  | 'cyans'
  | 'blues'
  | 'magentas'
  | 'highlights'
  | 'midtones'
  | 'shadows';

export type ColorRangePreviewMode = 'matte' | 'rubylith' | 'cutout';

export interface ColorRangeOptions {
  mode: ColorRangeMode;
  sampleRgb: [number, number, number];
  /** 1..200 sensitivity / tolerance range. */
  fuzziness: number;
  invert: boolean;
}

export interface ColorRangeResult {
  maskData: Uint8Array;
  bounds: { x: number; y: number; width: number; height: number };
  matchCount: number;
}

function rgbToHueSatLum(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) * 0.5;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

function hueDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const PRESET_HUE_CENTER: Record<
  'reds' | 'yellows' | 'greens' | 'cyans' | 'blues' | 'magentas',
  number
> = {
  reds: 0,
  yellows: 60,
  greens: 120,
  cyans: 180,
  blues: 240,
  magentas: 300,
};

/**
 * Computes a soft-edge 0..255 selection mask across an RGBA pixel buffer
 * using either sampled perceptual color distance or preset hue/luminance bands.
 */
export function computeColorRangeMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: ColorRangeOptions
): ColorRangeResult {
  const total = width * height;
  const maskData = new Uint8Array(total);
  const fuzz = Math.max(1, Math.min(200, options.fuzziness));

  const [sr, sg, sb] = options.sampleRgb;
  // Perceptual weighted Euclidean distance in RGB space (max ~441 * ~1.73 = ~765)
  const hardDist = fuzz * 1.15;
  const softSpan = Math.max(14, fuzz * 0.85);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let matchCount = 0;

  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOff + x;
      const p = idx * 4;
      const a = rgba[p + 3];
      if (a === 0) {
        maskData[idx] = options.invert ? 255 : 0;
        if (maskData[idx] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          matchCount++;
        }
        continue;
      }

      const r = rgba[p];
      const g = rgba[p + 1];
      const b = rgba[p + 2];
      let strength = 0; // 0..1

      if (options.mode === 'sampled') {
        const dr = r - sr;
        const dg = g - sg;
        const db = b - sb;
        // Weighted luminance/chrominance distance (redmean approximation)
        const rMean = (r + sr) * 0.5;
        const dist = Math.sqrt(
          (2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db
        );
        if (dist <= hardDist) {
          strength = 1;
        } else if (dist < hardDist + softSpan) {
          const t = 1 - (dist - hardDist) / softSpan;
          strength = t * t * (3 - 2 * t);
        }
      } else if (
        options.mode === 'highlights' ||
        options.mode === 'midtones' ||
        options.mode === 'shadows'
      ) {
        const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        const spread = 0.14 + (fuzz / 200) * 0.36;
        if (options.mode === 'highlights') {
          const threshold = 0.72 - (fuzz / 200) * 0.25;
          strength = Math.max(0, Math.min(1, (luma - (threshold - spread)) / spread));
        } else if (options.mode === 'shadows') {
          const threshold = 0.28 + (fuzz / 200) * 0.25;
          strength = Math.max(0, Math.min(1, (threshold + spread - luma) / spread));
        } else {
          const dist = Math.abs(luma - 0.5);
          const halfW = 0.14 + (fuzz / 200) * 0.28;
          strength = Math.max(0, Math.min(1, 1 - Math.max(0, dist - halfW * 0.4) / halfW));
        }
      } else {
        const targetHue = PRESET_HUE_CENTER[options.mode];
        const [hue, sat] = rgbToHueSatLum(r, g, b);
        const maxAngle = 22 + (fuzz / 200) * 58;
        const dHue = hueDiffDeg(hue, targetHue);
        const hueWeight =
          dHue <= maxAngle * 0.55
            ? 1
            : dHue < maxAngle
              ? 1 - (dHue - maxAngle * 0.55) / (maxAngle * 0.45)
              : 0;
        const satWeight = Math.max(0, Math.min(1, (sat - 0.08) / 0.22));
        strength = hueWeight * satWeight;
      }

      if (options.invert) {
        strength = 1 - strength;
      }

      const val = Math.max(0, Math.min(255, Math.round(strength * 255)));
      maskData[idx] = val;
      if (val > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        matchCount++;
      }
    }
  }

  const bounds =
    maxX >= minX && maxY >= minY
      ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
      : { x: 0, y: 0, width: 0, height: 0 };

  return { maskData, bounds, matchCount };
}

/**
 * Renders a visual preview of the Color Range matte:
 * - 'matte': classic grayscale alpha matte
 * - 'rubylith': unselected areas tinted with translucent crimson mask
 * - 'cutout': selected pixels shown with live alpha transparency
 */
export function renderColorRangePreviewBuffer(
  src: Uint8ClampedArray,
  maskData: Uint8Array,
  mode: ColorRangePreviewMode
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const n = maskData.length;

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const m = maskData[i];
    if (mode === 'matte') {
      out[p] = m;
      out[p + 1] = m;
      out[p + 2] = m;
      out[p + 3] = 255;
    } else if (mode === 'cutout') {
      out[p] = src[p];
      out[p + 1] = src[p + 1];
      out[p + 2] = src[p + 2];
      out[p + 3] = Math.round((src[p + 3] * m) / 255);
    } else {
      // rubylith overlay on unselected regions
      const inv = (255 - m) / 255;
      const overlay = inv * 0.65;
      out[p] = Math.round(src[p] * (1 - overlay) + 235 * overlay);
      out[p + 1] = Math.round(src[p + 1] * (1 - overlay) + 45 * overlay);
      out[p + 2] = Math.round(src[p + 2] * (1 - overlay) + 60 * overlay);
      out[p + 3] = src[p + 3];
    }
  }

  return out;
}
