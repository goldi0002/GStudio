import type {
  Adjustments,
  CurvePoint,
  CurvesConfig,
  DocumentState,
  FiltersConfig,
  GradientMapConfig,
  HslBandId,
  HslMixerConfig,
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

export const HSL_BAND_META: Array<{
  id: HslBandId;
  label: string;
  centerHue: number;
  swatch: string;
}> = [
  { id: 'red', label: 'Reds', centerHue: 0, swatch: '#FF453A' },
  { id: 'orange', label: 'Oranges', centerHue: 30, swatch: '#FF9F0A' },
  { id: 'yellow', label: 'Yellows', centerHue: 60, swatch: '#FFD60A' },
  { id: 'green', label: 'Greens', centerHue: 120, swatch: '#30D158' },
  { id: 'aqua', label: 'Aquas', centerHue: 180, swatch: '#64D2FF' },
  { id: 'blue', label: 'Blues', centerHue: 240, swatch: '#0A84FF' },
  { id: 'purple', label: 'Purples', centerHue: 275, swatch: '#BF5AF2' },
  { id: 'magenta', label: 'Magentas', centerHue: 320, swatch: '#FF375F' },
];

export function createDefaultHslMixer(): HslMixerConfig {
  return {
    red: { h: 0, s: 0, l: 0 },
    orange: { h: 0, s: 0, l: 0 },
    yellow: { h: 0, s: 0, l: 0 },
    green: { h: 0, s: 0, l: 0 },
    aqua: { h: 0, s: 0, l: 0 },
    blue: { h: 0, s: 0, l: 0 },
    purple: { h: 0, s: 0, l: 0 },
    magenta: { h: 0, s: 0, l: 0 },
  };
}

export const DEFAULT_HSL_MIXER: HslMixerConfig = createDefaultHslMixer();

export const DEFAULT_GRADIENT_MAP: GradientMapConfig = {
  enabled: false,
  shadowColor: '#142038',
  highlightColor: '#FFD6A5',
  mix: 100,
};

export const DEFAULT_FILTERS: FiltersConfig = {
  blur: 0,
  vignette: 0,
  vignetteMidpoint: 55,
  noise: 0,
  pixelate: 1,
  denoise: 0,
  bloom: 0,
  posterize: 0,
  chromaticAberration: 0,
  threshold: 0,
  lensDistortion: 0,
  tiltShiftBlur: 0,
  tiltShiftPos: 50,
  tiltShiftBand: 25,
};

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  exposure: 0,
  saturation: 0,
  vibrance: 0,
  hue: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  clarity: 0,
  fade: 0,
  sharpness: 0,
  splitTone: 0,
  splitShadowHue: 220,
  splitHighlightHue: 40,
  grayscale: false,
  sepia: false,
  invert: false,
  levels: { ...DEFAULT_LEVELS },
  curves: {
    rgb: DEFAULT_CURVES.rgb.map((p) => ({ ...p })),
    r: DEFAULT_CURVES.r.map((p) => ({ ...p })),
    g: DEFAULT_CURVES.g.map((p) => ({ ...p })),
    b: DEFAULT_CURVES.b.map((p) => ({ ...p })),
  },
  filters: { ...DEFAULT_FILTERS },
  hsl: createDefaultHslMixer(),
  gradientMap: { ...DEFAULT_GRADIENT_MAP },
};

function isIdentityCurve(pts?: CurvePoint[]): boolean {
  if (!pts || pts.length === 0) return true;
  if (pts.length !== 2) return false;
  return pts[0].x === 0 && pts[0].y === 0 && pts[1].x === 255 && pts[1].y === 255;
}

export function cloneHslMixer(hsl?: HslMixerConfig): HslMixerConfig {
  const out = createDefaultHslMixer();
  if (!hsl) return out;
  for (const { id } of HSL_BAND_META) {
    const b = hsl[id];
    if (b) {
      out[id] = { h: b.h ?? 0, s: b.s ?? 0, l: b.l ?? 0 };
    }
  }
  return out;
}

export function cloneAdjustments(adj: Adjustments): Adjustments {
  return {
    ...adj,
    vibrance: adj.vibrance ?? 0,
    clarity: adj.clarity ?? 0,
    fade: adj.fade ?? 0,
    splitTone: adj.splitTone ?? 0,
    splitShadowHue: adj.splitShadowHue ?? 220,
    splitHighlightHue: adj.splitHighlightHue ?? 40,
    invert: adj.invert ?? false,
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
    filters: adj.filters
      ? {
          ...DEFAULT_FILTERS,
          ...adj.filters,
        }
      : { ...DEFAULT_FILTERS },
    hsl: cloneHslMixer(adj.hsl),
    gradientMap: adj.gradientMap
      ? { ...DEFAULT_GRADIENT_MAP, ...adj.gradientMap }
      : { ...DEFAULT_GRADIENT_MAP },
  };
}

export function cloneDefaultAdjustments(): Adjustments {
  return cloneAdjustments(DEFAULT_ADJUSTMENTS);
}

export function isDefaultHslMixer(hsl?: HslMixerConfig): boolean {
  if (!hsl) return true;
  for (const { id } of HSL_BAND_META) {
    const b = hsl[id];
    if (b && (b.h !== 0 || b.s !== 0 || b.l !== 0)) return false;
  }
  return true;
}

export function isDefaultGradientMap(gm?: GradientMapConfig): boolean {
  if (!gm) return true;
  return !gm.enabled || gm.mix <= 0;
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
    (filters.denoise ?? 0) <= 0 &&
    (filters.bloom ?? 0) <= 0 &&
    (filters.posterize ?? 0) < 2 &&
    (filters.chromaticAberration ?? 0) <= 0 &&
    (filters.threshold ?? 0) < 1 &&
    (filters.lensDistortion ?? 0) === 0 &&
    (filters.tiltShiftBlur ?? 0) <= 0
  );
}

export function isDefaultAdjustments(adj: Adjustments): boolean {
  return (
    adj.brightness === 0 &&
    adj.contrast === 0 &&
    adj.exposure === 0 &&
    adj.saturation === 0 &&
    (adj.vibrance ?? 0) === 0 &&
    adj.hue === 0 &&
    adj.temperature === 0 &&
    adj.tint === 0 &&
    adj.highlights === 0 &&
    adj.shadows === 0 &&
    (adj.clarity ?? 0) === 0 &&
    (adj.fade ?? 0) === 0 &&
    adj.sharpness === 0 &&
    (adj.splitTone ?? 0) <= 0 &&
    !adj.grayscale &&
    !adj.sepia &&
    !adj.invert &&
    isDefaultLevels(adj.levels) &&
    isDefaultCurves(adj.curves) &&
    isDefaultFilters(adj.filters) &&
    isDefaultHslMixer(adj.hsl) &&
    isDefaultGradientMap(adj.gradientMap)
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
  totalPixels: number;
}

export interface HistogramChannelStats {
  mean: number;
  median: number;
  stdDev: number;
  shadowClipPct: number;
  highlightClipPct: number;
}

export function computeHistogram(data: Uint8ClampedArray): HistogramData {
  const luma = new Uint32Array(256);
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  let totalPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 10) continue;
    totalPixels++;
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
  return { luma, r, g, b, maxVal, totalPixels };
}

export function computeHistogramChannelStats(
  bins: Uint32Array,
  totalPixels: number
): HistogramChannelStats {
  if (totalPixels <= 0) {
    return {
      mean: 0,
      median: 0,
      stdDev: 0,
      shadowClipPct: 0,
      highlightClipPct: 0,
    };
  }

  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * bins[i];
  }
  const mean = sum / totalPixels;

  let varSum = 0;
  let cum = 0;
  let median = 0;
  let medianFound = false;
  const half = totalPixels / 2;

  for (let i = 0; i < 256; i++) {
    const count = bins[i];
    if (count > 0) {
      const diff = i - mean;
      varSum += diff * diff * count;
      cum += count;
      if (!medianFound && cum >= half) {
        median = i;
        medianFound = true;
      }
    }
  }

  return {
    mean,
    median,
    stdDev: Math.sqrt(varSum / totalPixels),
    shadowClipPct: (bins[0] / totalPixels) * 100,
    highlightClipPct: (bins[255] / totalPixels) * 100,
  };
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

function applyBloom(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number
): void {
  const t = Math.max(0, Math.min(100, amount)) / 100;
  if (t <= 0 || width < 3 || height < 3) return;

  const glow = new Uint8ClampedArray(buf.length);
  const threshold = 165;
  const invSpan = 1 / (255 - threshold);

  for (let i = 0; i < buf.length; i += 4) {
    const a = buf[i + 3];
    if (a === 0) continue;
    const r = buf[i];
    const g = buf[i + 1];
    const b = buf[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum <= threshold) {
      glow[i + 3] = a;
      continue;
    }
    const weight = Math.min(1, (lum - threshold) * invSpan);
    glow[i] = Math.round(r * weight);
    glow[i + 1] = Math.round(g * weight);
    glow[i + 2] = Math.round(b * weight);
    glow[i + 3] = a;
  }

  const blurRadius = Math.max(2, Math.min(22, Math.round(2 + t * 14)));
  applySeparableGaussianBlur(glow, width, height, blurRadius);

  const strength = t * 0.92;
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) {
      const base = buf[i + c] / 255;
      const gVal = (glow[i + c] / 255) * strength;
      const screened = 1 - (1 - base) * (1 - gVal);
      buf[i + c] = clamp255(Math.round(screened * 255));
    }
  }
}

function applyPosterize(buf: Uint8ClampedArray, levels: number): void {
  const lv = Math.max(2, Math.min(24, Math.round(levels)));
  const step = 255 / (lv - 1);
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] === 0) continue;
    buf[i] = clamp255(Math.round(Math.round((buf[i] / 255) * (lv - 1)) * step));
    buf[i + 1] = clamp255(Math.round(Math.round((buf[i + 1] / 255) * (lv - 1)) * step));
    buf[i + 2] = clamp255(Math.round(Math.round((buf[i + 2] / 255) * (lv - 1)) * step));
  }
}

function applyThreshold(buf: Uint8ClampedArray, threshold: number): void {
  const cutoff = Math.max(1, Math.min(255, Math.round(threshold)));
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] === 0) continue;
    const lum = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
    const v = lum >= cutoff ? 255 : 0;
    buf[i] = v;
    buf[i + 1] = v;
    buf[i + 2] = v;
  }
}

function applyChromaticAberration(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number
): void {
  const t = Math.max(0, Math.min(100, amount)) / 100;
  if (t <= 0 || width < 2 || height < 2) return;

  const copy = new Uint8ClampedArray(buf);
  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.5;
  const maxRadius = Math.max(1, Math.hypot(cx, cy));
  const maxShift = t * Math.max(4, Math.min(width, height) * 0.018);

  const sampleChannel = (fx: number, fy: number, channelOffset: number): number => {
    const x = Math.max(0, Math.min(width - 1, fx));
    const y = Math.max(0, Math.min(height - 1, fy));
    const ix0 = Math.floor(x);
    const iy0 = Math.floor(y);
    const ix1 = Math.min(width - 1, ix0 + 1);
    const iy1 = Math.min(height - 1, iy0 + 1);
    const tx = x - ix0;
    const ty = y - iy0;

    const i00 = (iy0 * width + ix0) * 4 + channelOffset;
    const i10 = (iy0 * width + ix1) * 4 + channelOffset;
    const i01 = (iy1 * width + ix0) * 4 + channelOffset;
    const i11 = (iy1 * width + ix1) * 4 + channelOffset;

    return (
      copy[i00] * (1 - tx) * (1 - ty) +
      copy[i10] * tx * (1 - ty) +
      copy[i01] * (1 - tx) * ty +
      copy[i11] * tx * ty
    );
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (copy[idx + 3] === 0) continue;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.001) continue;
      const radialFactor = dist / maxRadius;
      const shift = maxShift * radialFactor;
      const ux = dx / dist;
      const uy = dy / dist;
      buf[idx] = clamp255(Math.round(sampleChannel(x + ux * shift, y + uy * shift, 0)));
      buf[idx + 2] = clamp255(Math.round(sampleChannel(x - ux * shift, y - uy * shift, 2)));
    }
  }
}

function hueToCenteredTint(hueDeg: number): [number, number, number] {
  const h = (((hueDeg % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 1) [r, g, b] = [1, x, 0];
  else if (h < 2) [r, g, b] = [x, 1, 0];
  else if (h < 3) [r, g, b] = [0, 1, x];
  else if (h < 4) [r, g, b] = [0, x, 1];
  else if (h < 5) [r, g, b] = [x, 0, 1];
  else [r, g, b] = [1, 0, x];
  return [(r - 0.5) * 2, (g - 0.5) * 2, (b - 0.5) * 2];
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0');
  const num = parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(num)) return [0, 0, 0];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHsl01(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) * 0.5;
  const d = max - min;
  if (d < 1e-6) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hueToRgbChannel(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hsl01ToRgb(hDeg: number, s: number, l: number): [number, number, number] {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  if (s <= 1e-6) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hueToRgbChannel(p, q, h + 1 / 3) * 255,
    hueToRgbChannel(p, q, h) * 255,
    hueToRgbChannel(p, q, h - 1 / 3) * 255,
  ];
}

function applyHslMixer(buf: Uint8ClampedArray, hsl: HslMixerConfig): void {
  const activeBands = HSL_BAND_META.map((m) => ({
    center: m.centerHue,
    adj: hsl[m.id],
  })).filter((b) => b.adj && (b.adj.h !== 0 || b.adj.s !== 0 || b.adj.l !== 0));
  if (activeBands.length === 0) return;

  const bandHalfWidth = 42;
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] === 0) continue;
    const [hDeg, s, l] = rgbToHsl01(buf[i], buf[i + 1], buf[i + 2]);
    if (s < 0.02) continue;

    const chromaGate = Math.min(1, s * 4);
    let dh = 0;
    let ds = 0;
    let dl = 0;
    let wSum = 0;

    for (let k = 0; k < activeBands.length; k++) {
      const band = activeBands[k];
      let diff = Math.abs(hDeg - band.center);
      if (diff > 180) diff = 360 - diff;
      if (diff >= bandHalfWidth) continue;
      const w = 0.5 * (1 + Math.cos((Math.PI * diff) / bandHalfWidth));
      dh += (band.adj.h / 100) * 32 * w;
      ds += (band.adj.s / 100) * w;
      dl += (band.adj.l / 100) * 0.35 * w;
      wSum += w;
    }

    if (wSum <= 0) continue;
    const norm = wSum > 1 ? 1 / wSum : 1;
    const nextH = hDeg + dh * norm * chromaGate;
    const satDelta = ds * norm * chromaGate;
    const nextS =
      satDelta >= 0
        ? Math.min(1, s + (1 - s) * satDelta * 0.85)
        : Math.max(0, s * (1 + satDelta));
    const nextL = Math.max(0, Math.min(1, l + dl * norm * chromaGate));
    const [nr, ng, nb] = hsl01ToRgb(nextH, nextS, nextL);
    buf[i] = clamp255(nr);
    buf[i + 1] = clamp255(ng);
    buf[i + 2] = clamp255(nb);
  }
}

function applyLensDistortion(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number
): void {
  if (amount === 0 || width < 3 || height < 3) return;
  const copy = new Uint8ClampedArray(buf);
  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.5;
  const normR = Math.max(1, Math.min(cx, cy));
  const k = (-amount / 100) * 0.42;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / normR;
      const dy = (y - cy) / normR;
      const r2 = dx * dx + dy * dy;
      const scale = 1 + k * r2;
      const sx = cx + dx * scale * normR;
      const sy = cy + dy * scale * normR;
      const outIdx = (y * width + x) * 4;

      if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) {
        buf[outIdx] = 0;
        buf[outIdx + 1] = 0;
        buf[outIdx + 2] = 0;
        buf[outIdx + 3] = 0;
        continue;
      }

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(width - 1, x0 + 1);
      const y1 = Math.min(height - 1, y0 + 1);
      const tx = sx - x0;
      const ty = sy - y0;
      const i00 = (y0 * width + x0) * 4;
      const i10 = (y0 * width + x1) * 4;
      const i01 = (y1 * width + x0) * 4;
      const i11 = (y1 * width + x1) * 4;

      for (let c = 0; c < 4; c++) {
        buf[outIdx + c] = clamp255(
          Math.round(
            copy[i00 + c] * (1 - tx) * (1 - ty) +
              copy[i10 + c] * tx * (1 - ty) +
              copy[i01 + c] * (1 - tx) * ty +
              copy[i11 + c] * tx * ty
          )
        );
      }
    }
  }
}

function applyTiltShiftBlur(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  posPct: number,
  bandPct: number
): void {
  if (radius <= 0 || width < 3 || height < 3) return;
  const blurred = new Uint8ClampedArray(buf);
  applySeparableGaussianBlur(blurred, width, height, radius);
  const centerY = Math.max(0.05, Math.min(0.95, posPct / 100)) * height;
  const halfSharp = Math.max(2, (Math.max(5, Math.min(60, bandPct)) / 200) * height);
  const feather = Math.max(8, height * 0.18);

  for (let y = 0; y < height; y++) {
    const dist = Math.abs(y - centerY) - halfSharp;
    if (dist <= 0) continue;
    const t = Math.min(1, dist / feather);
    const blend = t * t * (3 - 2 * t);
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      const i = (rowOff + x) * 4;
      if (buf[i + 3] === 0) continue;
      buf[i] = clamp255(Math.round(buf[i] * (1 - blend) + blurred[i] * blend));
      buf[i + 1] = clamp255(Math.round(buf[i + 1] * (1 - blend) + blurred[i + 1] * blend));
      buf[i + 2] = clamp255(Math.round(buf[i + 2] * (1 - blend) + blurred[i + 2] * blend));
    }
  }
}

/**
 * O(W*H) separable box blur over luminance plane for local midtone micro-contrast (Clarity).
 */
function applyClarity(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  clarityAmount: number
): void {
  if (clarityAmount === 0 || width < 3 || height < 3) return;
  const n = width * height;
  const lum = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    lum[p] = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
  }

  const radius = Math.max(2, Math.min(8, Math.round(Math.min(width, height) * 0.02)));
  const horiz = new Float32Array(n);
  const blurred = new Float32Array(n);

  // Horizontal sliding window
  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    let sum = 0;
    let count = 0;
    for (let x = 0; x <= Math.min(width - 1, radius); x++) {
      sum += lum[rowOff + x];
      count++;
    }
    for (let x = 0; x < width; x++) {
      horiz[rowOff + x] = sum / count;
      const removeIdx = x - radius;
      if (removeIdx >= 0) {
        sum -= lum[rowOff + removeIdx];
        count--;
      }
      const addIdx = x + radius + 1;
      if (addIdx < width) {
        sum += lum[rowOff + addIdx];
        count++;
      }
    }
  }

  // Vertical sliding window
  for (let x = 0; x < width; x++) {
    let sum = 0;
    let count = 0;
    for (let y = 0; y <= Math.min(height - 1, radius); y++) {
      sum += horiz[y * width + x];
      count++;
    }
    for (let y = 0; y < height; y++) {
      blurred[y * width + x] = sum / count;
      const removeY = y - radius;
      if (removeY >= 0) {
        sum -= horiz[removeY * width + x];
        count--;
      }
      const addY = y + radius + 1;
      if (addY < height) {
        sum += horiz[addY * width + x];
        count++;
      }
    }
  }

  const strength = (clarityAmount / 100) * 1.35;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (buf[i + 3] === 0) continue;
    const l = lum[p];
    const lumNorm = l / 255;
    const midtoneWeight = 0.25 + 0.75 * (4 * lumNorm * (1 - lumNorm));
    const delta = (l - blurred[p]) * strength * midtoneWeight;
    buf[i] = clamp255(buf[i] + delta);
    buf[i + 1] = clamp255(buf[i + 1] + delta);
    buf[i + 2] = clamp255(buf[i + 2] + delta);
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
  const vibranceVal = adj.vibrance ?? 0;
  const hasVibrance = vibranceVal !== 0;
  const fadeVal = adj.fade ?? 0;
  const hasFade = fadeVal > 0;
  const fadeLift = (fadeVal / 100) * 58;
  const fadeScale = 1 - fadeLift / 255;
  const hasInvert = Boolean(adj.invert);
  const clarityVal = adj.clarity ?? 0;
  const splitToneVal = adj.splitTone ?? 0;
  const hasSplitTone = splitToneVal > 0;
  const splitShadowTint = hasSplitTone ? hueToCenteredTint(adj.splitShadowHue ?? 220) : [0, 0, 0];
  const splitHighlightTint = hasSplitTone ? hueToCenteredTint(adj.splitHighlightHue ?? 40) : [0, 0, 0];
  const splitStrength = (splitToneVal / 100) * 52;

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

  const hasGradientMap = Boolean(adj.gradientMap?.enabled && (adj.gradientMap?.mix ?? 0) > 0);
  const gmShadow = hasGradientMap && adj.gradientMap
    ? parseHexRgb(adj.gradientMap.shadowColor)
    : ([0, 0, 0] as [number, number, number]);
  const gmHighlight = hasGradientMap && adj.gradientMap
    ? parseHexRgb(adj.gradientMap.highlightColor)
    : ([255, 255, 255] as [number, number, number]);
  const gmMix = hasGradientMap && adj.gradientMap
    ? Math.max(0, Math.min(1, adj.gradientMap.mix / 100))
    : 0;

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

    // 9b. Vibrance (boosts muted tones without oversaturating already-vivid / skin hues)
    if (hasVibrance) {
      const cMax = Math.max(r, g, b);
      const cMin = Math.min(r, g, b);
      const sat = Math.max(0, Math.min(1, (cMax - cMin) / 255));
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const vibFactor =
        vibranceVal >= 0
          ? 1 + (vibranceVal / 100) * 1.15 * (1 - sat)
          : Math.max(0, 1 + (vibranceVal / 100) * (0.35 + 0.65 * (1 - sat)));
      r = luma + (r - luma) * vibFactor;
      g = luma + (g - luma) * vibFactor;
      b = luma + (b - luma) * vibFactor;
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

    // 11b. Invert
    if (hasInvert) {
      r = 255 - clamp255(r);
      g = 255 - clamp255(g);
      b = 255 - clamp255(b);
    }

    // 11c. Matte Fade (lift black point without blowing out highlights)
    if (hasFade) {
      r = fadeLift + clamp255(r) * fadeScale;
      g = fadeLift + clamp255(g) * fadeScale;
      b = fadeLift + clamp255(b) * fadeScale;
    }

    // 11d. Split Tone (color-grade shadows and highlights independently)
    if (hasSplitTone) {
      const lumaNorm = Math.max(0, Math.min(1, (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255));
      const shadowW = (1 - lumaNorm) * (1 - lumaNorm);
      const highW = lumaNorm * lumaNorm;
      r += (splitShadowTint[0] * shadowW + splitHighlightTint[0] * highW) * splitStrength;
      g += (splitShadowTint[1] * shadowW + splitHighlightTint[1] * highW) * splitStrength;
      b += (splitShadowTint[2] * shadowW + splitHighlightTint[2] * highW) * splitStrength;
    }

    // 11e. Duotone Gradient Map (blend luminance ramp between shadow and highlight color)
    if (hasGradientMap) {
      const t = Math.max(0, Math.min(1, (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255));
      const mr = gmShadow[0] + (gmHighlight[0] - gmShadow[0]) * t;
      const mg = gmShadow[1] + (gmHighlight[1] - gmShadow[1]) * t;
      const mb = gmShadow[2] + (gmHighlight[2] - gmShadow[2]) * t;
      r = r * (1 - gmMix) + mr * gmMix;
      g = g * (1 - gmMix) + mg * gmMix;
      b = b * (1 - gmMix) + mb * gmMix;
    }

    dst[i] = clamp255(r);
    dst[i + 1] = clamp255(g);
    dst[i + 2] = clamp255(b);
    dst[i + 3] = a;
  }

  // 11f. Selective HSL Color Mixer
  if (!isDefaultHslMixer(adj.hsl) && adj.hsl) {
    applyHslMixer(dst, adj.hsl);
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

  // 12b. Clarity (local midtone micro-contrast)
  if (clarityVal !== 0 && width > 2 && height > 2) {
    applyClarity(dst, width, height, clarityVal);
  }

  // 13. Non-destructive Filters (Denoise -> Lens Distortion -> Pixelate -> Blur -> Tilt-Shift -> Chromatic Aberration -> Bloom -> Vignette -> Posterize -> Threshold -> Noise)
  const filters = adj.filters;
  if (filters) {
    // Denoise first so later filters (and film noise) are not smoothed away.
    if ((filters.denoise ?? 0) > 0) {
      applyDenoise(dst, width, height, filters.denoise ?? 0);
    }
    if ((filters.lensDistortion ?? 0) !== 0) {
      applyLensDistortion(dst, width, height, filters.lensDistortion ?? 0);
    }
    if (filters.pixelate > 1) {
      applyPixelate(dst, width, height, filters.pixelate);
    }
    if (filters.blur > 0) {
      applySeparableGaussianBlur(dst, width, height, filters.blur);
    }
    if ((filters.tiltShiftBlur ?? 0) > 0) {
      applyTiltShiftBlur(
        dst,
        width,
        height,
        filters.tiltShiftBlur ?? 0,
        filters.tiltShiftPos ?? 50,
        filters.tiltShiftBand ?? 25
      );
    }
    if ((filters.chromaticAberration ?? 0) > 0) {
      applyChromaticAberration(dst, width, height, filters.chromaticAberration ?? 0);
    }
    if ((filters.bloom ?? 0) > 0) {
      applyBloom(dst, width, height, filters.bloom ?? 0);
    }
    if (filters.vignette !== 0) {
      applyVignette(dst, width, height, filters.vignette, filters.vignetteMidpoint);
    }
    if ((filters.posterize ?? 0) >= 2) {
      applyPosterize(dst, filters.posterize ?? 0);
    }
    if ((filters.threshold ?? 0) >= 1) {
      applyThreshold(dst, filters.threshold ?? 0);
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
