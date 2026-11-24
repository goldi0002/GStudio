import type { Adjustments, CurvePoint, GradientMapConfig, HslMixerConfig } from '../types/editor';
import {
  cloneAdjustments,
  createDefaultHslMixer,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_GRADIENT_MAP,
  HSL_BAND_META,
} from './adjustments';

/**
 * Minimal storage surface so presets can be tested without a DOM and so a
 * browser that blocks localStorage (private windows) can fail gracefully.
 */
export interface PresetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AdjustmentPreset {
  id: string;
  name: string;
  createdAt: number;
  adjustments: Adjustments;
}

export const PRESET_STORAGE_KEY = 'gstudio.adjustmentPresets.v1';
export const MAX_ADJUSTMENT_PRESETS = 30;
const MAX_PRESET_NAME_LENGTH = 60;
const MAX_CURVE_POINTS = 32;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function sanitizeCurvePoints(value: unknown, fallback: CurvePoint[]): CurvePoint[] {
  if (!Array.isArray(value)) return fallback.map((point) => ({ ...point }));

  const points: CurvePoint[] = [];
  for (const raw of value) {
    const point = asRecord(raw);
    if (typeof point.x !== 'number' || typeof point.y !== 'number') continue;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const x = Math.round(clampNumber(point.x, 0, 255, 0));
    const y = Math.round(clampNumber(point.y, 0, 255, 0));
    if (points.some((existing) => existing.x === x)) continue;
    points.push({ x, y });
  }

  if (points.length < 2) return fallback.map((point) => ({ ...point }));
  points.sort((a, b) => a.x - b.x);
  return points.slice(0, MAX_CURVE_POINTS);
}

function sanitizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed : fallback;
}

function sanitizeHslMixer(value: unknown): HslMixerConfig {
  const source = asRecord(value);
  const out = createDefaultHslMixer();
  for (const { id } of HSL_BAND_META) {
    const b = asRecord(source[id]);
    out[id] = {
      h: clampNumber(b.h, -100, 100, 0),
      s: clampNumber(b.s, -100, 100, 0),
      l: clampNumber(b.l, -100, 100, 0),
    };
  }
  return out;
}

function sanitizeGradientMap(value: unknown): GradientMapConfig {
  const source = asRecord(value);
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_GRADIENT_MAP.enabled,
    shadowColor: sanitizeHexColor(source.shadowColor, DEFAULT_GRADIENT_MAP.shadowColor),
    highlightColor: sanitizeHexColor(source.highlightColor, DEFAULT_GRADIENT_MAP.highlightColor),
    mix: clampNumber(source.mix, 0, 100, DEFAULT_GRADIENT_MAP.mix),
  };
}

/**
 * Coerce arbitrary stored/imported data into a valid Adjustments object:
 * numbers are clamped to their slider ranges, unknown keys are dropped and
 * missing fields fall back to the defaults.
 */
export function sanitizeAdjustments(value: unknown): Adjustments {
  const source = asRecord(value);
  const base = cloneAdjustments(DEFAULT_ADJUSTMENTS);
  const levels = asRecord(source.levels);
  const curves = asRecord(source.curves);
  const filters = asRecord(source.filters);

  const black = clampNumber(levels.black, 0, 253, base.levels?.black ?? 0);
  const white = clampNumber(levels.white, 2, 255, base.levels?.white ?? 255);

  const rawPosterize = clampNumber(filters.posterize, 0, 24, base.filters?.posterize ?? 0);
  const rawThreshold = clampNumber(filters.threshold, 0, 255, base.filters?.threshold ?? 0);

  return {
    brightness: clampNumber(source.brightness, -100, 100, base.brightness),
    contrast: clampNumber(source.contrast, -100, 100, base.contrast),
    exposure: clampNumber(source.exposure, -2, 2, base.exposure),
    saturation: clampNumber(source.saturation, -100, 100, base.saturation),
    vibrance: clampNumber(source.vibrance, -100, 100, base.vibrance ?? 0),
    hue: clampNumber(source.hue, -180, 180, base.hue),
    temperature: clampNumber(source.temperature, -100, 100, base.temperature),
    tint: clampNumber(source.tint, -100, 100, base.tint),
    highlights: clampNumber(source.highlights, -100, 100, base.highlights),
    shadows: clampNumber(source.shadows, -100, 100, base.shadows),
    clarity: clampNumber(source.clarity, -100, 100, base.clarity ?? 0),
    fade: clampNumber(source.fade, 0, 100, base.fade ?? 0),
    sharpness: clampNumber(source.sharpness, 0, 100, base.sharpness),
    splitTone: clampNumber(source.splitTone, 0, 100, base.splitTone ?? 0),
    splitShadowHue: clampNumber(source.splitShadowHue, 0, 360, base.splitShadowHue ?? 220),
    splitHighlightHue: clampNumber(source.splitHighlightHue, 0, 360, base.splitHighlightHue ?? 40),
    grayscale: typeof source.grayscale === 'boolean' ? source.grayscale : base.grayscale,
    sepia: typeof source.sepia === 'boolean' ? source.sepia : base.sepia,
    invert: typeof source.invert === 'boolean' ? source.invert : base.invert ?? false,
    levels: {
      black,
      gamma: clampNumber(levels.gamma, 0.1, 4, base.levels?.gamma ?? 1),
      white: Math.max(black + 2, white),
      outBlack: clampNumber(levels.outBlack, 0, 255, base.levels?.outBlack ?? 0),
      outWhite: clampNumber(levels.outWhite, 0, 255, base.levels?.outWhite ?? 255),
    },
    curves: {
      rgb: sanitizeCurvePoints(curves.rgb, base.curves?.rgb ?? []),
      r: sanitizeCurvePoints(curves.r, base.curves?.r ?? []),
      g: sanitizeCurvePoints(curves.g, base.curves?.g ?? []),
      b: sanitizeCurvePoints(curves.b, base.curves?.b ?? []),
    },
    filters: {
      blur: clampNumber(filters.blur, 0, 35, base.filters?.blur ?? 0),
      vignette: clampNumber(filters.vignette, -100, 100, base.filters?.vignette ?? 0),
      vignetteMidpoint: clampNumber(
        filters.vignetteMidpoint,
        15,
        90,
        base.filters?.vignetteMidpoint ?? 55
      ),
      noise: clampNumber(filters.noise, 0, 100, base.filters?.noise ?? 0),
      pixelate: clampNumber(filters.pixelate, 1, 48, base.filters?.pixelate ?? 1),
      denoise: clampNumber(filters.denoise, 0, 100, base.filters?.denoise ?? 0),
      bloom: clampNumber(filters.bloom, 0, 100, base.filters?.bloom ?? 0),
      posterize: rawPosterize < 2 ? 0 : Math.round(rawPosterize),
      chromaticAberration: clampNumber(
        filters.chromaticAberration,
        0,
        100,
        base.filters?.chromaticAberration ?? 0
      ),
      threshold: rawThreshold < 1 ? 0 : Math.round(rawThreshold),
      lensDistortion: clampNumber(
        filters.lensDistortion,
        -100,
        100,
        base.filters?.lensDistortion ?? 0
      ),
      tiltShiftBlur: clampNumber(
        filters.tiltShiftBlur,
        0,
        35,
        base.filters?.tiltShiftBlur ?? 0
      ),
      tiltShiftPos: clampNumber(
        filters.tiltShiftPos,
        10,
        90,
        base.filters?.tiltShiftPos ?? 50
      ),
      tiltShiftBand: clampNumber(
        filters.tiltShiftBand,
        5,
        60,
        base.filters?.tiltShiftBand ?? 25
      ),
    },
    hsl: sanitizeHslMixer(source.hsl),
    gradientMap: sanitizeGradientMap(source.gradientMap),
  };
}

function makePresetId(): string {
  return `preset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function writePresets(storage: PresetStorage, presets: AdjustmentPreset[]): boolean {
  try {
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}

/** Read presets from storage, ignoring corrupt JSON and invalid entries. */
export function loadPresets(storage: PresetStorage | null | undefined): AdjustmentPreset[] {
  if (!storage) return [];
  let parsed: unknown;
  try {
    const raw = storage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return [];
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const presets: AdjustmentPreset[] = [];
  const usedIds = new Set<string>();

  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim().slice(0, MAX_PRESET_NAME_LENGTH) : '';
    if (!name) continue;

    let id =
      typeof record.id === 'string' && record.id.trim() !== ''
        ? record.id.trim().slice(0, 64)
        : makePresetId();
    if (usedIds.has(id)) id = makePresetId();
    usedIds.add(id);

    presets.push({
      id,
      name,
      createdAt:
        typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
          ? record.createdAt
          : Date.now(),
      adjustments: sanitizeAdjustments(record.adjustments),
    });
    if (presets.length >= MAX_ADJUSTMENT_PRESETS) break;
  }

  return presets;
}

/**
 * Save the current adjustments under a name. Re-using an existing name
 * overwrites that preset instead of adding a duplicate. Returns null when the
 * name is empty, the list is full or storage is unavailable.
 */
export function savePreset(
  storage: PresetStorage | null | undefined,
  name: string,
  adjustments: Adjustments
): AdjustmentPreset | null {
  if (!storage) return null;
  const cleanName = String(name ?? '').trim().slice(0, MAX_PRESET_NAME_LENGTH);
  if (!cleanName) return null;

  const existing = loadPresets(storage);
  const withoutSameName = existing.filter(
    (preset) => preset.name.toLowerCase() !== cleanName.toLowerCase()
  );
  if (existing.length >= MAX_ADJUSTMENT_PRESETS && withoutSameName.length === existing.length) {
    return null;
  }

  const preset: AdjustmentPreset = {
    id: makePresetId(),
    name: cleanName,
    createdAt: Date.now(),
    adjustments: sanitizeAdjustments(adjustments),
  };
  const next = [...withoutSameName, preset].slice(0, MAX_ADJUSTMENT_PRESETS);
  return writePresets(storage, next) ? preset : null;
}

/** Delete a preset by id and return the remaining list. */
export function deletePreset(
  storage: PresetStorage | null | undefined,
  id: string
): AdjustmentPreset[] {
  if (!storage) return [];
  const remaining = loadPresets(storage).filter((preset) => preset.id !== id);
  writePresets(storage, remaining);
  return remaining;
}

/** localStorage in the browser, or null when it is missing/blocked. */
export function browserPresetStorage(): PresetStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

const BASE_TONE_RESET: Partial<Adjustments> = {
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
};

export const QUICK_LOOKS: Array<{ name: string; patch: Partial<Adjustments> }> = [
  {
    name: 'Vivid Daylight',
    patch: {
      ...BASE_TONE_RESET,
      contrast: 16,
      exposure: 0.12,
      saturation: 22,
      highlights: -14,
      shadows: 18,
      sharpness: 18,
    },
  },
  {
    name: 'Warm Golden',
    patch: {
      ...BASE_TONE_RESET,
      temperature: 28,
      tint: 6,
      contrast: 10,
      saturation: 14,
      highlights: -10,
      shadows: 14,
    },
  },
  {
    name: 'Cool Crisp',
    patch: {
      ...BASE_TONE_RESET,
      temperature: -22,
      contrast: 18,
      highlights: 8,
      shadows: -6,
      sharpness: 20,
    },
  },
  {
    name: 'Matte Film',
    patch: {
      ...BASE_TONE_RESET,
      brightness: 6,
      contrast: -12,
      saturation: -14,
      shadows: 26,
      highlights: -18,
      temperature: 8,
      fade: 24,
    },
  },
  {
    name: 'Split Teal & Amber',
    patch: {
      ...BASE_TONE_RESET,
      contrast: 14,
      clarity: 12,
      splitTone: 38,
      splitShadowHue: 195,
      splitHighlightHue: 36,
    },
  },
  {
    name: 'Crisp Mono',
    patch: {
      ...BASE_TONE_RESET,
      grayscale: true,
      contrast: 24,
      highlights: -10,
      shadows: 12,
      sharpness: 18,
    },
  },
];

export const FONT_PRESETS: Array<{ label: string; value: string }> = [
  {
    label: 'UI Sans',
    value: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
  },
  {
    label: 'Editorial Serif',
    value: 'Georgia, "Times New Roman", Times, serif',
  },
  {
    label: 'Geometric Sans',
    value: 'Avenir, "Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  {
    label: 'Technical Mono',
    value: '"SF Mono", ui-monospace, Menlo, Consolas, monospace',
  },
  {
    label: 'Display Impact',
    value: 'Impact, "Arial Black", sans-serif',
  },
  {
    label: 'Classic Script',
    value: '"Brush Script MT", "Snell Roundhand", cursive',
  },
];
