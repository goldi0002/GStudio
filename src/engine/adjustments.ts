import type {
  Adjustments,
  CurvePoint,
  CurvesConfig,
  DocumentState,
  FiltersConfig,
  LevelsConfig,
} from '../types/editor';

export const DEFAULT_LEVELS: LevelsConfig = {
  black: 0,
  gamma: 1,
  white: 255,
  outBlack: 0,
  outWhite: 255,
};

export const DEFAULT_CURVES: CurvesConfig = {
  rgb: [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ],
  r: [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ],
  g: [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ],
  b: [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ],
};

export const DEFAULT_FILTERS: FiltersConfig = {
  blur: 0,
  vignette: 0,
  vignetteMidpoint: 55,
  noise: 0,
  pixelate: 1,
  denoise: 0,
};

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  exposure: 0,
  saturation: 0,
  hue: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  sharpness: 0,
  grayscale: false,
  sepia: false,
  levels: { ...DEFAULT_LEVELS },
  curves: {
    rgb: DEFAULT_CURVES.rgb.map((p) => ({ ...p })),
    r: DEFAULT_CURVES.r.map((p) => ({ ...p })),
    g: DEFAULT_CURVES.g.map((p) => ({ ...p })),
    b: DEFAULT_CURVES.b.map((p) => ({ ...p })),
  },
  filters: { ...DEFAULT_FILTERS },
};

function isIdentityCurve(pts?: CurvePoint[]): boolean {
  if (!pts || pts.length === 0) return true;
  if (pts.length !== 2) return false;
  return pts[0].x === 0 && pts[0].y === 0 && pts[1].x === 255 && pts[1].y === 255;
}

export function cloneAdjustments(adj: Adjustments): Adjustments {
  return {
    ...adj,
    levels: adj.levels ? { ...adj.levels } : { ...DEFAULT_LEVELS },
    curves: adj.curves
      ? {
          rgb: adj.curves.rgb.map((p) => ({ ...p })),
          r: adj.curves.r.map((p) => ({ ...p })),
          g: adj.curves.g.map((p) => ({ ...p })),
          b: adj.curves.b.map((p) => ({ ...p })),
        }
      : {
          rgb: DEFAULT_CURVES.rgb.map((p) => ({ ...p })),
          r: DEFAULT_CURVES.r.map((p) => ({ ...p })),
          g: DEFAULT_CURVES.g.map((p) => ({ ...p })),
          b: DEFAULT_CURVES.b.map((p) => ({ ...p })),
        },
    filters: adj.filters ? { ...adj.filters } : { ...DEFAULT_FILTERS },
  };
}

export function cloneDefaultAdjustments(): Adjustments {
  return cloneAdjustments(DEFAULT_ADJUSTMENTS);
}

export function isDefaultLevels(levels?: LevelsConfig): boolean {
  if (!levels) return true;
  return (
    levels.black === 0 &&
    Math.abs(levels.gamma - 1) < 0.005 &&
    levels.white === 255 &&
    levels.outBlack === 0 &&
    levels.outWhite === 255
  );
}

export function isDefaultCurves(curves?: CurvesConfig): boolean {
  if (!curves) return true;
  return (
    isIdentityCurve(curves.rgb) &&
    isIdentityCurve(curves.r) &&
    isIdentityCurve(curves.g) &&
    isIdentityCurve(curves.b)
  );
}

export function isDefaultFilters(filters?: FiltersConfig): boolean {
  if (!filters) return true;
  return (
    filters.blur <= 0 &&
    filters.vignette === 0 &&
    filters.noise <= 0 &&
    filters.pixelate <= 1 &&
    (filters.denoise ?? 0) <= 0
  );
}

export function isDefaultAdjustments(adj: Adjustments): boolean {
  return (
    adj.brightness === 0 &&
    adj.contrast === 0 &&
    adj.exposure === 0 &&
    adj.saturation === 0 &&
    adj.hue === 0 &&
    adj.temperature === 0 &&
    adj.tint === 0 &&
    adj.highlights === 0 &&
    adj.shadows === 0 &&
    adj.sharpness === 0 &&
    !adj.grayscale &&
    !adj.sepia &&
    isDefaultLevels(adj.levels) &&
    isDefaultCurves(adj.curves) &&
    isDefaultFilters(adj.filters)
  );
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Monotone cubic Hermite spline interpolation (Fritsch-Carlson) for smooth Curves LUTs.
 */
export function buildSplineCurveLut(points: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  const sorted = [...points].sort((a, b) => a.x - b.x);
  if (sorted.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  // Deduplicate identical x coordinates
  const pts: CurvePoint[] = [];
  for (const p of sorted) {
    if (pts.length === 0 || Math.abs(p.x - pts[pts.length - 1].x) >= 1) {
      pts.push({ x: clamp255(p.x), y: clamp255(p.y) });
    }
  }
  if (pts.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  const n = pts.length;
  const dx = new Float64Array(n - 1);
  const dy = new Float64Array(n - 1);
  const m = new Float64Array(n);

  for (let i = 0; i < n - 1; i++) {
    dx[i] = Math.max(1, pts[i + 1].x - pts[i].x);
    dy[i] = pts[i + 1].y - pts[i].y;
  }

  const slopes = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    slopes[i] = dy[i] / dx[i];
  }

  m[0] = slopes[0];
  m[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      m[i] = 0;
    } else {
      m[i] = (slopes[i - 1] + slopes[i]) * 0.5;
    }
  }

  // Limit tangents to avoid overshoot
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(slopes[i]) < 1e-6) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const a = m[i] / slopes[i];
      const b = m[i + 1] / slopes[i];
      const h = Math.hypot(a, b);
      if (h > 3) {
        const t = 3 / h;
        m[i] = t * a * slopes[i];
        m[i + 1] = t * b * slopes[i];
      }
    }
  }

  let seg = 0;
  for (let x = 0; x < 256; x++) {
    if (x <= pts[0].x) {
      lut[x] = Math.round(pts[0].y);
      continue;
    }
    if (x >= pts[n - 1].x) {
      lut[x] = Math.round(pts[n - 1].y);
      continue;
    }
    while (seg < n - 2 && x > pts[seg + 1].x) seg++;
    const h = dx[seg];
    const t = (x - pts[seg].x) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const val = h00 * pts[seg].y + h10 * h * m[seg] + h01 * pts[seg + 1].y + h11 * h * m[seg + 1];
    lut[x] = Math.round(clamp255(val));
  }

  return lut;
}

export function buildLevelsLut(levels: LevelsConfig): Uint8Array {
  const lut = new Uint8Array(256);
  const inMin = Math.max(0, Math.min(253, levels.black));
  const inMax = Math.max(inMin + 2, Math.min(255, levels.white));
  const invGamma = 1 / Math.max(0.1, Math.min(4, levels.gamma));
  const outMin = Math.max(0, Math.min(255, levels.outBlack));
  const outMax = Math.max(0, Math.min(255, levels.outWhite));

  for (let i = 0; i < 256; i++) {
    const norm = Math.max(0, Math.min(1, (i - inMin) / (inMax - inMin)));
    const gammaApplied = Math.pow(norm, invGamma);
    lut[i] = Math.round(clamp255(outMin + gammaApplied * (outMax - outMin)));
  }
  return lut;
}

export interface HistogramData {
  luma: Uint32Array;
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  maxVal: number;
}

export function computeHistogram(data: Uint8ClampedArray): HistogramData {
  const luma = new Uint32Array(256);
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 10) continue;
    const rv = data[i];
    const gv = data[i + 1];
    const bv = data[i + 2];
    r[rv]++;
    g[gv]++;
    b[bv]++;
    const lv = Math.min(255, Math.max(0, Math.round(0.2126 * rv + 0.7152 * gv + 0.0722 * bv)));
    luma[lv]++;
  }

  let maxVal = 1;
  // Ignore extreme 0/255 spikes slightly so midtone histogram remains readable
  for (let i = 1; i < 255; i++) {
    if (luma[i] > maxVal) maxVal = luma[i];
    if (r[i] > maxVal) maxVal = r[i];
    if (g[i] > maxVal) maxVal = g[i];
    if (b[i] > maxVal) maxVal = b[i];
  }
  return { luma, r, g, b, maxVal };
}

function applyPixelate(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  blockSize: number
): void {
  const bs = Math.max(2, Math.round(blockSize));
  for (let by = 0; by < height; by += bs) {
    const yEnd = Math.min(height, by + bs);
    for (let bx = 0; bx < width; bx += bs) {
      const xEnd = Math.min(width, bx + bs);
      let sr = 0,
        sg = 0,
        sb = 0,
        sa = 0,
        count = 0;
      for (let y = by; y < yEnd; y++) {
        for (let x = bx; x < xEnd; x++) {
          const i = (y * width + x) * 4;
          sr += buf[i];
          sg += buf[i + 1];
          sb += buf[i + 2];
          sa += buf[i + 3];
          count++;
        }
      }
      const ar = Math.round(sr / count);
      const ag = Math.round(sg / count);
      const ab = Math.round(sb / count);
      const aa = Math.round(sa / count);
      for (let y = by; y < yEnd; y++) {
        for (let x = bx; x < xEnd; x++) {
          const i = (y * width + x) * 4;
          buf[i] = ar;
          buf[i + 1] = ag;
          buf[i + 2] = ab;
          buf[i + 3] = aa;
        }
      }
    }
  }
}

function applySeparableGaussianBlur(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.max(1, Math.min(35, Math.round(radius)));
  const sigma = Math.max(0.5, r * 0.45);
  const size = r * 2 + 1;
  const kernel = new Float32Array(size);
  let kSum = 0;
  for (let i = -r; i <= r; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + r] = w;
    kSum += w;
  }
  for (let i = 0; i < size; i++) kernel[i] /= kSum;

  const temp = new Float32Array(buf.length);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      let ar = 0,
        ag = 0,
        ab = 0,
        aa = 0;
      for (let k = -r; k <= r; k++) {
        const sx = x + k < 0 ? 0 : x + k >= width ? width - 1 : x + k;
        const idx = (rowOff + sx) * 4;
        const wt = kernel[k + r];
        ar += buf[idx] * wt;
        ag += buf[idx + 1] * wt;
        ab += buf[idx + 2] * wt;
        aa += buf[idx + 3] * wt;
      }
      const outIdx = (rowOff + x) * 4;
      temp[outIdx] = ar;
      temp[outIdx + 1] = ag;
      temp[outIdx + 2] = ab;
      temp[outIdx + 3] = aa;
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let ar = 0,
        ag = 0,
        ab = 0,
        aa = 0;
      for (let k = -r; k <= r; k++) {
        const sy = y + k < 0 ? 0 : y + k >= height ? height - 1 : y + k;
        const idx = (sy * width + x) * 4;
        const wt = kernel[k + r];
        ar += temp[idx] * wt;
        ag += temp[idx + 1] * wt;
        ab += temp[idx + 2] * wt;
        aa += temp[idx + 3] * wt;
      }
      const outIdx = (y * width + x) * 4;
      buf[outIdx] = clamp255(ar);
      buf[outIdx + 1] = clamp255(ag);
      buf[outIdx + 2] = clamp255(ab);
      buf[outIdx + 3] = clamp255(aa);
    }
  }
}

function applyVignette(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
  midpointPct: number
): void {
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.hypot(cx, cy) || 1;
  const mid = Math.max(0.1, Math.min(0.95, midpointPct / 100));
  const strength = amount / 100; // -1 (darken edges) to +1 (brighten edges)

  for (let y = 0; y < height; y++) {
    const dy = (y - cy) / maxDist;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (buf[idx + 3] === 0) continue;
      const dx = (x - cx) / maxDist;
      const d = Math.hypot(dx, dy) / 0.75; // normalize corners near ~1.0
      if (d <= mid) continue;
      const t = Math.min(1, (d - mid) / Math.max(0.05, 1 - mid));
      const falloff = t * t * (3 - 2 * t); // smoothstep
      if (strength < 0) {
        const mult = Math.max(0, 1 + strength * falloff * 0.92);
        buf[idx] = clamp255(buf[idx] * mult);
        buf[idx + 1] = clamp255(buf[idx + 1] * mult);
        buf[idx + 2] = clamp255(buf[idx + 2] * mult);
      } else {
        const lift = strength * falloff * 145;
        buf[idx] = clamp255(buf[idx] + lift);
        buf[idx + 1] = clamp255(buf[idx + 1] + lift);
        buf[idx + 2] = clamp255(buf[idx + 2] + lift);
      }
    }
  }
}

/**
 * Edge-preserving noise reduction: a bilateral filter whose spatial radius and
 * colour tolerance both grow with `amount` (0..100). Pixels across a strong edge
 * get little weight, so flat areas smooth out while edges stay crisp.
 */
export function applyDenoise(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number
): void {
  const t = Math.max(0, Math.min(100, amount)) / 100;
  if (t === 0 || width < 3 || height < 3) return;
  const radius = t > 0.5 ? 2 : 1;
  const sigmaSpatial = 0.8 + radius * 0.6;
  const sigmaRange = 8 + t * 52; // colour distance (0..255 per channel) treated as "similar"
  const src = new Uint8ClampedArray(buf);
  const invS = 1 / (2 * sigmaSpatial * sigmaSpatial);
  const invR = 1 / (2 * sigmaRange * sigmaRange);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (src[idx + 3] === 0) continue;
      const r0 = src[idx];
      const g0 = src[idx + 1];
      const b0 = src[idx + 2];
      let wr = 0;
      let wg = 0;
      let wb = 0;
      let wsum = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const j = (yy * width + xx) * 4;
          if (src[j + 3] === 0) continue;
          const dr = src[j] - r0;
          const dg = src[j + 1] - g0;
          const db = src[j + 2] - b0;
          const w = Math.exp(-(dx * dx + dy * dy) * invS - (dr * dr + dg * dg + db * db) * invR);
          wr += src[j] * w;
          wg += src[j + 1] * w;
          wb += src[j + 2] * w;
          wsum += w;
        }
      }
      if (wsum > 0) {
        buf[idx] = clamp255(wr / wsum);
        buf[idx + 1] = clamp255(wg / wsum);
        buf[idx + 2] = clamp255(wb / wsum);
      }
    }
  }
}

function applyNoise(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number
): void {
  const scale = (amount / 100) * 65;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (buf[idx + 3] === 0) continue;
      // Fast deterministic spatial hash for stable non-flickering film grain
      let h = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      const n = (((h ^ (h >>> 16)) >>> 0) / 4294967295 - 0.5) * 2 * scale;
      buf[idx] = clamp255(buf[idx] + n);
      buf[idx + 1] = clamp255(buf[idx + 1] + n);
      buf[idx + 2] = clamp255(buf[idx + 2] + n);
    }
  }
}

/**
 * Pure pixel-buffer color, Levels, Curves & non-destructive Filter pipeline.
 * Operates cleanly in both Web Workers and unit tests.
 */
export function applyAdjustmentsToBuffer(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  adj: Adjustments,
  out?: Uint8ClampedArray
): Uint8ClampedArray {
  const dst = out ?? new Uint8ClampedArray(src.length);

  if (isDefaultAdjustments(adj)) {
    if (dst !== src) {
      dst.set(src);
    }
    return dst;
  }

  const len = src.length;
  const expMult = adj.exposure !== 0 ? Math.pow(2, adj.exposure) : 1;
  const brightOffset = (adj.brightness / 100) * 128;
  const contrastNorm = adj.contrast / 100;
  const contrastFactor =
    contrastNorm >= 0 ? 1 + contrastNorm * 1.5 : 1 + contrastNorm * 0.85;
  const tempShift = (adj.temperature / 100) * 38;
  const tintShift = (adj.tint / 100) * 32;
  const satMult = 1 + adj.saturation / 100;
  const hueRad = (adj.hue * Math.PI) / 180;
  const cosH = Math.cos(hueRad);
  const sinH = Math.sin(hueRad);

  const k = 1 / 3;
  const sqrtK = Math.sqrt(k);
  const h00 = cosH + (1 - cosH) * k;
  const h01 = k * (1 - cosH) - sqrtK * sinH;
  const h02 = k * (1 - cosH) + sqrtK * sinH;
  const h10 = k * (1 - cosH) + sqrtK * sinH;
  const h11 = cosH + k * (1 - cosH);
  const h12 = k * (1 - cosH) - sqrtK * sinH;
  const h20 = k * (1 - cosH) - sqrtK * sinH;
  const h21 = k * (1 - cosH) + sqrtK * sinH;
  const h22 = cosH + k * (1 - cosH);

  const highlightsAmount = adj.highlights / 100;
  const shadowsAmount = adj.shadows / 100;
  const hasHue = adj.hue !== 0;
  const hasSat = adj.saturation !== 0;
  const hasTone = adj.highlights !== 0 || adj.shadows !== 0;

  // Build Levels & Curves LUTs if active
  const useLevels = !isDefaultLevels(adj.levels);
  const levelsLut = useLevels && adj.levels ? buildLevelsLut(adj.levels) : null;
  const useCurves = !isDefaultCurves(adj.curves);
  const curveRgbLut = useCurves && adj.curves ? buildSplineCurveLut(adj.curves.rgb) : null;
  const curveRLut = useCurves && adj.curves ? buildSplineCurveLut(adj.curves.r) : null;
  const curveGLut = useCurves && adj.curves ? buildSplineCurveLut(adj.curves.g) : null;
  const curveBLut = useCurves && adj.curves ? buildSplineCurveLut(adj.curves.b) : null;

  for (let i = 0; i < len; i += 4) {
    const a = src[i + 3];
    if (a === 0) {
      dst[i] = 0;
      dst[i + 1] = 0;
      dst[i + 2] = 0;
      dst[i + 3] = 0;
      continue;
    }

    let r = src[i];
    let g = src[i + 1];
    let b = src[i + 2];

    // 1. Exposure
    if (expMult !== 1) {
      r *= expMult;
      g *= expMult;
      b *= expMult;
    }

    // 2. White balance
    if (tempShift !== 0) {
      r += tempShift;
      b -= tempShift;
    }
    if (tintShift !== 0) {
      g -= tintShift;
      r += tintShift * 0.35;
      b += tintShift * 0.35;
    }

    // 3. Shadows & Highlights
    if (hasTone) {
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const shadowWeight = Math.max(0, 1 - lum * 2);
      const highlightWeight = Math.max(0, lum * 2 - 1);
      const delta =
        shadowsAmount * shadowWeight * shadowWeight * 78 +
        highlightsAmount * highlightWeight * highlightWeight * 78;
      r += delta;
      g += delta;
      b += delta;
    }

    // 4. Brightness
    if (brightOffset !== 0) {
      r += brightOffset;
      g += brightOffset;
      b += brightOffset;
    }

    // 5. Contrast
    if (contrastFactor !== 1) {
      r = (r - 128) * contrastFactor + 128;
      g = (g - 128) * contrastFactor + 128;
      b = (b - 128) * contrastFactor + 128;
    }

    // 6. Levels LUT
    if (levelsLut) {
      r = levelsLut[Math.round(clamp255(r))];
      g = levelsLut[Math.round(clamp255(g))];
      b = levelsLut[Math.round(clamp255(b))];
    }

    // 7. Curves LUT (Master RGB -> Individual R, G, B)
    if (curveRgbLut && curveRLut && curveGLut && curveBLut) {
      r = curveRLut[curveRgbLut[Math.round(clamp255(r))]];
      g = curveGLut[curveRgbLut[Math.round(clamp255(g))]];
      b = curveBLut[curveRgbLut[Math.round(clamp255(b))]];
    }

    // 8. Hue rotation
    if (hasHue) {
      const nr = r * h00 + g * h01 + b * h02;
      const ng = r * h10 + g * h11 + b * h12;
      const nb = r * h20 + g * h21 + b * h22;
      r = nr;
      g = ng;
      b = nb;
    }

    // 9. Saturation
    if (hasSat) {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = luma + (r - luma) * satMult;
      g = luma + (g - luma) * satMult;
      b = luma + (b - luma) * satMult;
    }

    // 10. Grayscale
    if (adj.grayscale) {
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = gray;
      g = gray;
      b = gray;
    }

    // 11. Sepia
    if (adj.sepia) {
      const sr = r * 0.393 + g * 0.769 + b * 0.189;
      const sg = r * 0.349 + g * 0.686 + b * 0.168;
      const sb = r * 0.272 + g * 0.534 + b * 0.131;
      r = sr;
      g = sg;
      b = sb;
    }

    dst[i] = clamp255(r);
    dst[i + 1] = clamp255(g);
    dst[i + 2] = clamp255(b);
    dst[i + 3] = a;
  }

  // 12. 3x3 Unsharp-mask sharpness
  if (adj.sharpness > 0 && width > 2 && height > 2) {
    const amount = (adj.sharpness / 100) * 1.4;
    const copy = new Uint8ClampedArray(dst);
    const rowStride = width * 4;

    for (let y = 1; y < height - 1; y++) {
      const rowOffset = y * rowStride;
      for (let x = 1; x < width - 1; x++) {
        const idx = rowOffset + x * 4;
        if (copy[idx + 3] === 0) continue;

        const up = idx - rowStride;
        const down = idx + rowStride;
        const left = idx - 4;
        const right = idx + 4;

        for (let c = 0; c < 3; c++) {
          const center = copy[idx + c];
          const avgNeighbors =
            (copy[up + c] + copy[down + c] + copy[left + c] + copy[right + c]) * 0.25;
          dst[idx + c] = clamp255(center + (center - avgNeighbors) * amount);
        }
      }
    }
  }

  // 13. Non-destructive Filters (Pixelate -> Gaussian Blur -> Vignette -> Noise)
  const filters = adj.filters;
  if (filters) {
    // Denoise first so later filters (and film noise) are not smoothed away.
    if ((filters.denoise ?? 0) > 0) {
      applyDenoise(dst, width, height, filters.denoise ?? 0);
    }
    if (filters.pixelate > 1) {
      applyPixelate(dst, width, height, filters.pixelate);
    }
    if (filters.blur > 0) {
      applySeparableGaussianBlur(dst, width, height, filters.blur);
    }
    if (filters.vignette !== 0) {
      applyVignette(dst, width, height, filters.vignette, filters.vignetteMidpoint);
    }
    if (filters.noise > 0) {
      applyNoise(dst, width, height, filters.noise);
    }
  }

  return dst;
}

/** The adjustments the Adjustments/Levels/Curves/Filters panels currently edit: the active
 *  adjustment layer's own stack, or the document-wide one when any other layer is active. */
export function getTargetAdjustments(
  doc: Pick<DocumentState, 'adjustments' | 'layers' | 'activeLayerId'>
): Adjustments {
  const active = doc.layers.find((l) => l.id === doc.activeLayerId);
  return active && active.type === 'adjustment' ? active.adjustments : doc.adjustments;
}

/** Returns `doc` with the same target (see getTargetAdjustments) replaced by `next`. */
export function withTargetAdjustments<
  T extends Pick<DocumentState, 'adjustments' | 'layers' | 'activeLayerId'>,
>(doc: T, next: Adjustments): T {
  const active = doc.layers.find((l) => l.id === doc.activeLayerId);
  if (active && active.type === 'adjustment') {
    return {
      ...doc,
      layers: doc.layers.map((l) =>
        l.id === active.id && l.type === 'adjustment' ? { ...l, adjustments: next } : l
      ),
    };
  }
  return { ...doc, adjustments: next };
}
