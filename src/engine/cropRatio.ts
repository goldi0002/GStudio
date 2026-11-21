/** Aspect-ratio helpers shared by the crop tool's options bar and canvas handles. */

export type CropAspect = 'free' | '1:1' | '4:3' | '16:9' | '3:2' | '4:5' | 'custom';

const PRESET_RATIOS: Record<string, number> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '16:9': 16 / 9,
  '3:2': 3 / 2,
  '4:5': 4 / 5,
};

/** Width ÷ height the crop must keep, or null when the crop is free-form. */
export function cropRatioFor(aspect: CropAspect, customRatio: number): number | null {
  if (aspect === 'free') return null;
  if (aspect === 'custom') return Number.isFinite(customRatio) && customRatio > 0 ? customRatio : null;
  return PRESET_RATIOS[aspect] ?? null;
}

/** Parses "W:H", "W/H", "W x H" or a plain decimal ("1.5") into width ÷ height. */
export function parseRatio(input: string): number | null {
  const m = input.trim().match(/^(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)$/i);
  if (m) {
    const w = parseFloat(m[1]);
    const h = parseFloat(m[2]);
    return w > 0 && h > 0 ? w / h : null;
  }
  const n = parseFloat(input);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Largest rect of the given ratio centred in a doc, starting from a preferred width. */
export function fitRatioRect(
  docW: number,
  docH: number,
  ratio: number,
  preferredWidth: number
): { x: number; y: number; width: number; height: number } {
  let w = Math.min(preferredWidth, docW);
  let h = w / ratio;
  if (h > docH) {
    h = docH;
    w = h * ratio;
  }
  return {
    x: Math.max(0, Math.round((docW - w) / 2)),
    y: Math.max(0, Math.round((docH - h) / 2)),
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
  };
}
