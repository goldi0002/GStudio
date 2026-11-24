export type LiquifyMode =
  | 'push'
  | 'bloat'
  | 'pinch'
  | 'twirl-cw'
  | 'twirl-ccw'
  | 'reconstruct';

export interface LiquifyField {
  width: number;
  height: number;
  /** Backward X displacement in pixels: destination (x,y) samples source at x + dx[i]. */
  dx: Float32Array;
  /** Backward Y displacement in pixels: destination (x,y) samples source at y + dy[i]. */
  dy: Float32Array;
}

export interface LiquifyDabParams {
  mode: LiquifyMode;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  radius: number; // 4..200
  strength: number; // 1..100
  density?: number; // 0..100 (falloff sharpness, default 50)
}

export function createLiquifyField(width: number, height: number): LiquifyField {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return {
    width: w,
    height: h,
    dx: new Float32Array(w * h),
    dy: new Float32Array(w * h),
  };
}

export function cloneLiquifyField(field: LiquifyField): LiquifyField {
  return {
    width: field.width,
    height: field.height,
    dx: new Float32Array(field.dx),
    dy: new Float32Array(field.dy),
  };
}

export function resetLiquifyField(field: LiquifyField): void {
  field.dx.fill(0);
  field.dy.fill(0);
}

/**
 * Scales a displacement field from preview dimensions to full-resolution layer dimensions
 * using bilinear interpolation of the vector components.
 */
export function scaleLiquifyField(
  src: LiquifyField,
  targetWidth: number,
  targetHeight: number
): LiquifyField {
  const tw = Math.max(1, Math.round(targetWidth));
  const th = Math.max(1, Math.round(targetHeight));
  const out = createLiquifyField(tw, th);
  if (tw === src.width && th === src.height) {
    out.dx.set(src.dx);
    out.dy.set(src.dy);
    return out;
  }

  const scaleX = tw / src.width;
  const scaleY = th / src.height;
  const invScaleX = src.width / tw;
  const invScaleY = src.height / th;

  for (let y = 0; y < th; y++) {
    const sy = Math.min(src.height - 1, Math.max(0, y * invScaleY));
    const y0 = Math.floor(sy);
    const y1 = Math.min(src.height - 1, y0 + 1);
    const fy = sy - y0;

    for (let x = 0; x < tw; x++) {
      const sx = Math.min(src.width - 1, Math.max(0, x * invScaleX));
      const x0 = Math.floor(sx);
      const x1 = Math.min(src.width - 1, x0 + 1);
      const fx = sx - x0;

      const i00 = y0 * src.width + x0;
      const i10 = y0 * src.width + x1;
      const i01 = y1 * src.width + x0;
      const i11 = y1 * src.width + x1;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const dstIdx = y * tw + x;
      out.dx[dstIdx] =
        (src.dx[i00] * w00 + src.dx[i10] * w10 + src.dx[i01] * w01 + src.dx[i11] * w11) * scaleX;
      out.dy[dstIdx] =
        (src.dy[i00] * w00 + src.dy[i10] * w10 + src.dy[i01] * w01 + src.dy[i11] * w11) * scaleY;
    }
  }
  return out;
}

export function applyLiquifyDab(field: LiquifyField, params: LiquifyDabParams): boolean {
  const { mode, x, y, prevX, prevY } = params;
  const radius = Math.max(2, params.radius);
  const strength = Math.max(0.01, Math.min(1, params.strength / 100));
  const densityExp = 1.2 + ((100 - Math.max(0, Math.min(100, params.density ?? 50))) / 100) * 1.8;

  const rSq = radius * radius;
  const x0 = Math.max(0, Math.floor(x - radius));
  const x1 = Math.min(field.width - 1, Math.ceil(x + radius));
  const y0 = Math.max(0, Math.floor(y - radius));
  const y1 = Math.min(field.height - 1, Math.ceil(y + radius));
  if (x1 < x0 || y1 < y0) return false;

  const vx = x - prevX;
  const vy = y - prevY;
  if (mode === 'push' && Math.hypot(vx, vy) < 0.05) {
    return false;
  }

  const maxDisp = Math.max(field.width, field.height) * 0.65;
  let modified = false;

  for (let py = y0; py <= y1; py++) {
    const dyCenter = py - y;
    const rowOff = py * field.width;

    for (let px = x0; px <= x1; px++) {
      const dxCenter = px - x;
      const dSq = dxCenter * dxCenter + dyCenter * dyCenter;
      if (dSq >= rSq) continue;

      const t = 1 - dSq / rSq;
      const falloff = Math.pow(t, densityExp);
      const idx = rowOff + px;

      if (mode === 'push') {
        const weight = falloff * strength * 0.65;
        field.dx[idx] = Math.max(-maxDisp, Math.min(maxDisp, field.dx[idx] - vx * weight));
        field.dy[idx] = Math.max(-maxDisp, Math.min(maxDisp, field.dy[idx] - vy * weight));
        modified = true;
      } else if (mode === 'bloat') {
        const factor = falloff * strength * 0.16;
        field.dx[idx] = Math.max(-maxDisp, Math.min(maxDisp, field.dx[idx] - dxCenter * factor));
        field.dy[idx] = Math.max(-maxDisp, Math.min(maxDisp, field.dy[idx] - dyCenter * factor));
        modified = true;
      } else if (mode === 'pinch') {
        const factor = falloff * strength * 0.16;
        field.dx[idx] = Math.max(-maxDisp, Math.min(maxDisp, field.dx[idx] + dxCenter * factor));
        field.dy[idx] = Math.max(-maxDisp, Math.min(maxDisp, field.dy[idx] + dyCenter * factor));
        modified = true;
      } else if (mode === 'twirl-cw' || mode === 'twirl-ccw') {
        const dir = mode === 'twirl-cw' ? -1 : 1;
        const theta = dir * falloff * strength * 0.18;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const rx = dxCenter * cos - dyCenter * sin - dxCenter;
        const ry = dxCenter * sin + dyCenter * cos - dyCenter;
        field.dx[idx] = Math.max(-maxDisp, Math.min(maxDisp, field.dx[idx] + rx));
        field.dy[idx] = Math.max(-maxDisp, Math.min(maxDisp, field.dy[idx] + ry));
        modified = true;
      } else if (mode === 'reconstruct') {
        const k = Math.min(1, falloff * strength * 0.35);
        field.dx[idx] *= 1 - k;
        field.dy[idx] *= 1 - k;
        if (Math.abs(field.dx[idx]) < 0.005) field.dx[idx] = 0;
        if (Math.abs(field.dy[idx]) < 0.005) field.dy[idx] = 0;
        modified = true;
      }
    }
  }

  return modified;
}

export function applyLiquifyStroke(
  field: LiquifyField,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  params: Omit<LiquifyDabParams, 'x' | 'y' | 'prevX' | 'prevY'>
): boolean {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const step = Math.max(1.5, params.radius * 0.22);
  const steps = Math.max(1, Math.ceil(dist / step));
  let modified = false;
  let lastX = x0;
  let lastY = y0;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const nx = x0 + (x1 - x0) * t;
    const ny = y0 + (y1 - y0) * t;
    if (
      applyLiquifyDab(field, {
        ...params,
        x: nx,
        y: ny,
        prevX: lastX,
        prevY: lastY,
      })
    ) {
      modified = true;
    }
    lastX = nx;
    lastY = ny;
  }
  return modified;
}

/**
 * Renders a source RGBA buffer through a Liquify displacement field using
 * premultiplied-alpha bilinear interpolation to prevent dark edge halos.
 */
export function renderLiquifyBuffer(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  field: LiquifyField
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const w = width;
  const h = height;

  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      const fIdx = rowOff + x;
      const sx = Math.min(w - 1, Math.max(0, x + field.dx[fIdx]));
      const sy = Math.min(h - 1, Math.max(0, y + field.dy[fIdx]));

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = x0 + 1 < w ? x0 + 1 : x0;
      const y1 = y0 + 1 < h ? y0 + 1 : y0;
      const fx = sx - x0;
      const fy = sy - y0;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const i00 = (y0 * w + x0) * 4;
      const i10 = (y0 * w + x1) * 4;
      const i01 = (y1 * w + x0) * 4;
      const i11 = (y1 * w + x1) * 4;

      const a00 = src[i00 + 3];
      const a10 = src[i10 + 3];
      const a01 = src[i01 + 3];
      const a11 = src[i11 + 3];

      const outA = a00 * w00 + a10 * w10 + a01 * w01 + a11 * w11;
      const dst = fIdx * 4;

      if (outA <= 0.5) {
        out[dst] = 0;
        out[dst + 1] = 0;
        out[dst + 2] = 0;
        out[dst + 3] = 0;
        continue;
      }

      const pr =
        src[i00] * a00 * w00 +
        src[i10] * a10 * w10 +
        src[i01] * a01 * w01 +
        src[i11] * a11 * w11;
      const pg =
        src[i00 + 1] * a00 * w00 +
        src[i10 + 1] * a10 * w10 +
        src[i01 + 1] * a01 * w01 +
        src[i11 + 1] * a11 * w11;
      const pb =
        src[i00 + 2] * a00 * w00 +
        src[i10 + 2] * a10 * w10 +
        src[i01 + 2] * a01 * w01 +
        src[i11 + 2] * a11 * w11;

      out[dst] = Math.min(255, Math.max(0, Math.round(pr / outA)));
      out[dst + 1] = Math.min(255, Math.max(0, Math.round(pg / outA)));
      out[dst + 2] = Math.min(255, Math.max(0, Math.round(pb / outA)));
      out[dst + 3] = Math.min(255, Math.max(0, Math.round(outA)));
    }
  }

  return out;
}
