import type { FilterGalleryKind } from '../types/editor';

export interface GalleryFilterParams {
  kind: FilterGalleryKind;
  radius: number; // High Pass (1..30) & Oil Paint (1..5)
  distance: number; // Motion Blur (1..40)
  angle: number; // Motion Blur (-180..180) & Emboss (0..360)
  strength: number; // Emboss (1..5)
  cellSize: number; // Halftone (4..24)
}

export const DEFAULT_GALLERY_FILTER_PARAMS: GalleryFilterParams = {
  kind: 'high-pass',
  radius: 6,
  distance: 14,
  angle: 0,
  strength: 2,
  cellSize: 8,
};

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function findPercentileRange(
  hist: Uint32Array,
  total: number,
  clipFraction: number
): [number, number] {
  if (total <= 0) return [0, 255];
  const clipCount = Math.floor(total * clipFraction);
  let low = 0;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc > clipCount) {
      low = i;
      break;
    }
  }
  let high = 255;
  acc = 0;
  for (let i = 255; i >= 0; i--) {
    acc += hist[i];
    if (acc > clipCount) {
      high = i;
      break;
    }
  }
  if (high <= low) return [0, 255];
  return [low, high];
}

/**
 * Per-channel Auto Levels stretch (R, G, B stretched independently to remove color casts).
 */
export function autoLevelsBuffer(
  src: Uint8ClampedArray,
  clipPercent = 0.5
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  const hr = new Uint32Array(256);
  const hg = new Uint32Array(256);
  const hb = new Uint32Array(256);
  let total = 0;

  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3] === 0) continue;
    hr[src[i]]++;
    hg[src[i + 1]]++;
    hb[src[i + 2]]++;
    total++;
  }
  if (total === 0) return out;

  const frac = Math.max(0, Math.min(0.05, clipPercent / 100));
  const [rMin, rMax] = findPercentileRange(hr, total, frac);
  const [gMin, gMax] = findPercentileRange(hg, total, frac);
  const [bMin, bMax] = findPercentileRange(hb, total, frac);

  const rScale = 255 / Math.max(1, rMax - rMin);
  const gScale = 255 / Math.max(1, gMax - gMin);
  const bScale = 255 / Math.max(1, bMax - bMin);

  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    out[i] = clamp255(Math.round((out[i] - rMin) * rScale));
    out[i + 1] = clamp255(Math.round((out[i + 1] - gMin) * gScale));
    out[i + 2] = clamp255(Math.round((out[i + 2] - bMin) * bScale));
  }
  return out;
}

/**
 * Luminance-preserving Auto Contrast stretch (expands dynamic range without shifting hue).
 */
export function autoContrastBuffer(
  src: Uint8ClampedArray,
  clipPercent = 0.5
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  const hl = new Uint32Array(256);
  let total = 0;

  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3] === 0) continue;
    const lum = Math.round(0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2]);
    hl[clamp255(lum)]++;
    total++;
  }
  if (total === 0) return out;

  const frac = Math.max(0, Math.min(0.05, clipPercent / 100));
  const [lMin, lMax] = findPercentileRange(hl, total, frac);
  const scale = 255 / Math.max(1, lMax - lMin);

  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    out[i] = clamp255(Math.round((out[i] - lMin) * scale));
    out[i + 1] = clamp255(Math.round((out[i + 1] - lMin) * scale));
    out[i + 2] = clamp255(Math.round((out[i + 2] - lMin) * scale));
  }
  return out;
}

/**
 * High Pass filter centered at 128 gray: useful for Overlay/Soft Light detail sharpening.
 */
export function applyHighPassBuffer(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const r = Math.max(1, Math.min(30, Math.round(radius)));
  const sigma = Math.max(0.6, r * 0.5);
  const size = r * 2 + 1;
  const kernel = new Float32Array(size);
  let kSum = 0;
  for (let i = -r; i <= r; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + r] = w;
    kSum += w;
  }
  for (let i = 0; i < size; i++) kernel[i] /= kSum;

  const temp = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      let ar = 0;
      let ag = 0;
      let ab = 0;
      for (let k = -r; k <= r; k++) {
        const sx = x + k < 0 ? 0 : x + k >= width ? width - 1 : x + k;
        const idx = (rowOff + sx) * 4;
        const wt = kernel[k + r];
        ar += src[idx] * wt;
        ag += src[idx + 1] * wt;
        ab += src[idx + 2] * wt;
      }
      const tIdx = (rowOff + x) * 3;
      temp[tIdx] = ar;
      temp[tIdx + 1] = ag;
      temp[tIdx + 2] = ab;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pIdx = (y * width + x) * 4;
      const a = src[pIdx + 3];
      out[pIdx + 3] = a;
      if (a === 0) continue;
      let br = 0;
      let bg = 0;
      let bb = 0;
      for (let k = -r; k <= r; k++) {
        const sy = y + k < 0 ? 0 : y + k >= height ? height - 1 : y + k;
        const tIdx = (sy * width + x) * 3;
        const wt = kernel[k + r];
        br += temp[tIdx] * wt;
        bg += temp[tIdx + 1] * wt;
        bb += temp[tIdx + 2] * wt;
      }
      out[pIdx] = clamp255(Math.round(128 + (src[pIdx] - br)));
      out[pIdx + 1] = clamp255(Math.round(128 + (src[pIdx + 1] - bg)));
      out[pIdx + 2] = clamp255(Math.round(128 + (src[pIdx + 2] - bb)));
    }
  }
  return out;
}

/**
 * Directional Motion Blur along a specified distance (px) and angle (degrees).
 */
export function applyMotionBlurBuffer(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  distance: number,
  angleDeg: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const d = Math.max(1, Math.min(40, Math.round(distance)));
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const steps = d * 2 + 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let s = -d; s <= d; s++) {
        const sx = Math.max(0, Math.min(width - 1, Math.round(x + dx * s)));
        const sy = Math.max(0, Math.min(height - 1, Math.round(y + dy * s)));
        const srcIdx = (sy * width + sx) * 4;
        sr += src[srcIdx];
        sg += src[srcIdx + 1];
        sb += src[srcIdx + 2];
        sa += src[srcIdx + 3];
      }
      out[dstIdx] = clamp255(Math.round(sr / steps));
      out[dstIdx + 1] = clamp255(Math.round(sg / steps));
      out[dstIdx + 2] = clamp255(Math.round(sb / steps));
      out[dstIdx + 3] = clamp255(Math.round(sa / steps));
    }
  }
  return out;
}

/**
 * Directional Emboss / Relief centered on 128 neutral gray.
 */
export function applyEmbossBuffer(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  strength: number,
  angleDeg: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const s = Math.max(0.5, Math.min(5, strength));
  const rad = (angleDeg * Math.PI) / 180;
  const ox = Math.round(Math.cos(rad));
  const oy = Math.round(Math.sin(rad));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      out[idx + 3] = src[idx + 3];
      if (src[idx + 3] === 0) continue;

      const x1 = Math.max(0, Math.min(width - 1, x - ox));
      const y1 = Math.max(0, Math.min(height - 1, y - oy));
      const x2 = Math.max(0, Math.min(width - 1, x + ox));
      const y2 = Math.max(0, Math.min(height - 1, y + oy));
      const i1 = (y1 * width + x1) * 4;
      const i2 = (y2 * width + x2) * 4;

      for (let c = 0; c < 3; c++) {
        out[idx + c] = clamp255(Math.round(128 + (src[i1 + c] - src[i2 + c]) * s));
      }
    }
  }
  return out;
}

/**
 * Sobel 3x3 gradient magnitude edge detection.
 */
export function applyEdgeDetectBuffer(
  src: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const lumAt = (x: number, y: number): number => {
    const cx = Math.max(0, Math.min(width - 1, x));
    const cy = Math.max(0, Math.min(height - 1, y));
    const i = (cy * width + cx) * 4;
    return 0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2];
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      out[idx + 3] = src[idx + 3];
      if (src[idx + 3] === 0) continue;

      const tl = lumAt(x - 1, y - 1);
      const tc = lumAt(x, y - 1);
      const tr = lumAt(x + 1, y - 1);
      const ml = lumAt(x - 1, y);
      const mr = lumAt(x + 1, y);
      const bl = lumAt(x - 1, y + 1);
      const bc = lumAt(x, y + 1);
      const br = lumAt(x + 1, y + 1);

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const mag = clamp255(Math.round(Math.hypot(gx, gy)));
      out[idx] = mag;
      out[idx + 1] = mag;
      out[idx + 2] = mag;
    }
  }
  return out;
}

/**
 * Oil Paint stylization using local intensity-bucket histogram mode.
 */
export function applyOilPaintBuffer(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const r = Math.max(1, Math.min(5, Math.round(radius)));
  const levels = 20;
  const counts = new Uint16Array(levels);
  const sumR = new Uint32Array(levels);
  const sumG = new Uint32Array(levels);
  const sumB = new Uint32Array(levels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      out[idx + 3] = src[idx + 3];
      if (src[idx + 3] === 0) continue;

      counts.fill(0);
      sumR.fill(0);
      sumG.fill(0);
      sumB.fill(0);

      const y0 = Math.max(0, y - r);
      const y1 = Math.min(height - 1, y + r);
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width - 1, x + r);

      for (let ny = y0; ny <= y1; ny++) {
        for (let nx = x0; nx <= x1; nx++) {
          const ni = (ny * width + nx) * 4;
          if (src[ni + 3] === 0) continue;
          const avg = (src[ni] + src[ni + 1] + src[ni + 2]) / 3;
          const bucket = Math.min(levels - 1, Math.floor((avg / 256) * levels));
          counts[bucket]++;
          sumR[bucket] += src[ni];
          sumG[bucket] += src[ni + 1];
          sumB[bucket] += src[ni + 2];
        }
      }

      let bestBucket = 0;
      let bestCount = -1;
      for (let b = 0; b < levels; b++) {
        if (counts[b] > bestCount) {
          bestCount = counts[b];
          bestBucket = b;
        }
      }

      if (bestCount > 0) {
        out[idx] = clamp255(Math.round(sumR[bestBucket] / bestCount));
        out[idx + 1] = clamp255(Math.round(sumG[bestBucket] / bestCount));
        out[idx + 2] = clamp255(Math.round(sumB[bestBucket] / bestCount));
      } else {
        out[idx] = src[idx];
        out[idx + 1] = src[idx + 1];
        out[idx + 2] = src[idx + 2];
      }
    }
  }
  return out;
}

/**
 * Monochrome Halftone Dot Screen: renders crisp dark ink dots scaled by local cell luminance.
 */
export function applyHalftoneBuffer(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  cellSize: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const cell = Math.max(4, Math.min(24, Math.round(cellSize)));
  const maxR = cell * 0.56;

  for (let cy = 0; cy < height; cy += cell) {
    const yEnd = Math.min(height, cy + cell);
    const centerY = cy + (yEnd - cy) * 0.5;
    for (let cx = 0; cx < width; cx += cell) {
      const xEnd = Math.min(width, cx + cell);
      const centerX = cx + (xEnd - cx) * 0.5;

      let lumSum = 0;
      let count = 0;
      for (let y = cy; y < yEnd; y++) {
        for (let x = cx; x < xEnd; x++) {
          const i = (y * width + x) * 4;
          if (src[i + 3] === 0) continue;
          lumSum += 0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2];
          count++;
        }
      }

      const avgLum = count > 0 ? lumSum / count / 255 : 1;
      const dotR = maxR * Math.sqrt(Math.max(0, 1 - avgLum));

      for (let y = cy; y < yEnd; y++) {
        for (let x = cx; x < xEnd; x++) {
          const i = (y * width + x) * 4;
          const a = src[i + 3];
          out[i + 3] = a;
          if (a === 0) continue;
          const dist = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
          // Smooth 1px anti-aliased edge
          const ink = Math.max(0, Math.min(1, dotR + 0.5 - dist));
          const val = Math.round(248 * (1 - ink) + 18 * ink);
          out[i] = val;
          out[i + 1] = val;
          out[i + 2] = val;
        }
      }
    }
  }
  return out;
}

export function applyGalleryFilterBuffer(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  params: GalleryFilterParams
): Uint8ClampedArray {
  switch (params.kind) {
    case 'high-pass':
      return applyHighPassBuffer(src, width, height, params.radius);
    case 'motion-blur':
      return applyMotionBlurBuffer(src, width, height, params.distance, params.angle);
    case 'emboss':
      return applyEmbossBuffer(src, width, height, params.strength, params.angle);
    case 'edge-detect':
      return applyEdgeDetectBuffer(src, width, height);
    case 'oil-paint':
      return applyOilPaintBuffer(src, width, height, params.radius);
    case 'halftone':
      return applyHalftoneBuffer(src, width, height, params.cellSize);
  }
}
