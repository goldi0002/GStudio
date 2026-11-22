import type { Adjustments, CurvePoint } from '../types/editor';
import { cloneAdjustments, DEFAULT_ADJUSTMENTS } from './adjustments';

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

  return {
    brightness: clampNumber(source.brightness, -100, 100, base.brightness),
    contrast: clampNumber(source.contrast, -100, 100, base.contrast),
    exposure: clampNumber(source.exposure, -2, 2, base.exposure),
    saturation: clampNumber(source.saturation, -100, 100, base.saturation),
    hue: clampNumber(source.hue, -180, 180, base.hue),
    temperature: clampNumber(source.temperature, -100, 100, base.temperature),
    tint: clampNumber(source.tint, -100, 100, base.tint),
    highlights: clampNumber(source.highlights, -100, 100, base.highlights),
    shadows: clampNumber(source.shadows, -100, 100, base.shadows),
    sharpness: clampNumber(source.sharpness, 0, 100, base.sharpness),
    grayscale: typeof source.grayscale === 'boolean' ? source.grayscale : base.grayscale,
    sepia: typeof source.sepia === 'boolean' ? source.sepia : base.sepia,
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
    },
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
