import {
  applyAdjustmentsToBuffer,
  cloneAdjustments,
  cloneDefaultAdjustments,
  DEFAULT_ADJUSTMENTS,
  isDefaultAdjustments,
} from './adjustments';
import type {
  Adjustments,
  AdjustmentLayer,
  BlendMode,
  CanvasAnchor,
  ColorOverlayEffect,
  CropRect,
  DocumentState,
  DropShadowEffect,
  GroupLayer,
  HistoryLayerSnapshot,
  InnerGlowEffect,
  InnerShadowEffect,
  Layer,
  LayerEffects,
  LayerMask,
  OuterGlowEffect,
  StrokeEffect,
  RasterLayer,
  SelectionPoint,
  SelectionState,
  ShapeKind,
  ShapeLayer,
  SnapGuide,
  TextLayer,
} from '../types/editor';

export const DEFAULT_DROP_SHADOW: DropShadowEffect = {
  enabled: false,
  color: '#000000',
  opacity: 55,
  blur: 14,
  distance: 8,
  angle: 135,
};

export const DEFAULT_OUTER_GLOW: OuterGlowEffect = {
  enabled: false,
  color: '#0A84FF',
  opacity: 65,
  blur: 16,
  spread: 2,
};

export const DEFAULT_STROKE: StrokeEffect = {
  enabled: false,
  color: '#FFFFFF',
  opacity: 100,
  width: 3,
  position: 'outside',
};

export const DEFAULT_COLOR_OVERLAY: ColorOverlayEffect = {
  enabled: false,
  color: '#0A84FF',
  opacity: 100,
  blendMode: 'normal',
};

export const DEFAULT_INNER_SHADOW: InnerShadowEffect = {
  enabled: false,
  color: '#000000',
  opacity: 55,
  blur: 12,
  distance: 6,
  angle: 135,
};

export const DEFAULT_INNER_GLOW: InnerGlowEffect = {
  enabled: false,
  color: '#FFFFFF',
  opacity: 60,
  blur: 14,
  spread: 2,
};

export const DEFAULT_LAYER_EFFECTS: LayerEffects = {
  dropShadow: DEFAULT_DROP_SHADOW,
  outerGlow: DEFAULT_OUTER_GLOW,
  stroke: DEFAULT_STROKE,
  colorOverlay: DEFAULT_COLOR_OVERLAY,
  innerShadow: DEFAULT_INNER_SHADOW,
  innerGlow: DEFAULT_INNER_GLOW,
};

export function cloneLayerEffects(effects?: LayerEffects | null): LayerEffects | null {
  if (!effects) return null;
  return {
    dropShadow: { ...DEFAULT_DROP_SHADOW, ...(effects.dropShadow ?? {}) },
    outerGlow: { ...DEFAULT_OUTER_GLOW, ...(effects.outerGlow ?? {}) },
    stroke: { ...DEFAULT_STROKE, ...(effects.stroke ?? {}) },
    colorOverlay: { ...DEFAULT_COLOR_OVERLAY, ...(effects.colorOverlay ?? {}) },
    innerShadow: { ...DEFAULT_INNER_SHADOW, ...(effects.innerShadow ?? {}) },
    innerGlow: { ...DEFAULT_INNER_GLOW, ...(effects.innerGlow ?? {}) },
  };
}

export function hasActiveLayerEffects(effects?: LayerEffects | null): boolean {
  if (!effects) return false;
  return Boolean(
    effects.dropShadow?.enabled ||
      effects.outerGlow?.enabled ||
      effects.stroke?.enabled ||
      effects.colorOverlay?.enabled ||
      effects.innerShadow?.enabled ||
      effects.innerGlow?.enabled
  );
}

export function rotatePointAroundCenter(
  px: number,
  py: number,
  cx: number,
  cy: number,
  angleDeg: number
): { x: number; y: number } {
  if (angleDeg === 0) return { x: px, y: py };
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

export function snapRotationAngle(angleDeg: number, snapShift: boolean): number {
  let norm = ((angleDeg + 180) % 360 + 360) % 360 - 180;
  if (norm === -180 && angleDeg > 0) norm = 180;
  if (snapShift) {
    norm = Math.round(norm / 15) * 15;
  }
  return Math.round(norm * 10) / 10;
}

export function computeShadowOffset(
  distance: number,
  angleDeg: number
): { offsetX: number; offsetY: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    offsetX: Math.cos(rad) * distance,
    offsetY: Math.sin(rad) * distance,
  };
}

export function docPointToLayerLocal(
  docX: number,
  docY: number,
  layer: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'scaleX' | 'scaleY' | 'rotation' | 'flipX' | 'flipY'>
): { x: number; y: number } {
  const cx = layer.x + (layer.width * layer.scaleX) / 2;
  const cy = layer.y + (layer.height * layer.scaleY) / 2;
  const unrot = rotatePointAroundCenter(docX, docY, cx, cy, -(layer.rotation || 0));
  const sx = (layer.scaleX || 1) * (layer.flipX ? -1 : 1);
  const sy = (layer.scaleY || 1) * (layer.flipY ? -1 : 1);
  return {
    x: (unrot.x - cx) / sx + layer.width / 2,
    y: (unrot.y - cy) / sy + layer.height / 2,
  };
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function createWhiteMaskCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

export function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = createCanvas(source.width, source.height);
  const ctx = copy.getContext('2d');
  if (ctx) {
    ctx.drawImage(source, 0, 0);
  }
  return copy;
}

function cloneMask(mask?: LayerMask | null): LayerMask | null {
  if (!mask) return null;
  return {
    canvas: cloneCanvas(mask.canvas),
    enabled: mask.enabled,
    inverted: mask.inverted,
  };
}

function mapBlendMode(mode: BlendMode): GlobalCompositeOperation {
  return mode as GlobalCompositeOperation;
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (maxWidth <= 0) {
      lines.push(para);
      continue;
    }
    const words = para.split(' ');
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

function applyMaskToCanvas(
  contentCanvas: HTMLCanvasElement,
  mask: LayerMask
): void {
  const w = contentCanvas.width;
  const h = contentCanvas.height;
  const ctx = contentCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const maskSample = createCanvas(w, h);
  const mctx = maskSample.getContext('2d', { willReadFrequently: true });
  if (!mctx) return;
  mctx.drawImage(mask.canvas, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const maskData = mctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const m = maskData.data;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    // Grayscale luminance of mask pixel * mask alpha controls visibility
    const lum = (0.299 * m[i] + 0.587 * m[i + 1] + 0.114 * m[i + 2]) / 255;
    const mAlpha = (m[i + 3] / 255) * lum;
    const factor = mask.inverted ? 1 - mAlpha : mAlpha;
    d[i + 3] = Math.round(d[i + 3] * factor);
  }
  ctx.putImageData(imgData, 0, 0);
}

function drawLayerGeometryToContext(
  ctx: CanvasRenderingContext2D,
  layer: Exclude<Layer, GroupLayer | AdjustmentLayer>
): void {
  const cx = layer.x + (layer.width * layer.scaleX) / 2;
  const cy = layer.y + (layer.height * layer.scaleY) / 2;
  ctx.save();
  ctx.translate(cx, cy);
  if (layer.rotation !== 0) {
    ctx.rotate((layer.rotation * Math.PI) / 180);
  }
  ctx.scale(
    layer.scaleX * (layer.flipX ? -1 : 1),
    layer.scaleY * (layer.flipY ? -1 : 1)
  );
  ctx.translate(-layer.width / 2, -layer.height / 2);

  if (layer.type === 'raster') {
    ctx.drawImage(layer.canvas, 0, 0, layer.width, layer.height);
  } else if (layer.type === 'shape') {
    renderShapeLayer(ctx, layer);
  } else if (layer.type === 'text') {
    renderTextLayer(ctx, layer);
  }
  ctx.restore();
}

function compositeLayerEffectsToContext(
  ctx: CanvasRenderingContext2D,
  contentCanvas: HTMLCanvasElement,
  layer: Layer,
  docW: number,
  docH: number
): void {
  const effects = layer.effects;
  const fxCanvas = createCanvas(docW, docH);
  const fctx = fxCanvas.getContext('2d');
  if (!fctx) return;

  const shiftX = docW + 256;

  if (effects?.dropShadow?.enabled) {
    const ds = effects.dropShadow;
    const [r, g, b] = hexToRgba(ds.color, 255);
    const alpha = Math.max(0, Math.min(1, ds.opacity / 100));
    const { offsetX, offsetY } = computeShadowOffset(ds.distance, ds.angle);
    fctx.save();
    fctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    fctx.shadowBlur = Math.max(0, ds.blur);
    fctx.shadowOffsetX = -shiftX + offsetX;
    fctx.shadowOffsetY = offsetY;
    fctx.drawImage(contentCanvas, shiftX, 0);
    fctx.restore();
  }

  if (effects?.outerGlow?.enabled) {
    const glow = effects.outerGlow;
    const [r, g, b] = hexToRgba(glow.color, 255);
    const alpha = Math.max(0, Math.min(1, glow.opacity / 100));
    const spread = Math.max(0, glow.spread);
    const passes: Array<[number, number]> =
      spread > 0
        ? [
            [spread, 0],
            [-spread, 0],
            [0, spread],
            [0, -spread],
            [spread * 0.7, spread * 0.7],
            [-spread * 0.7, spread * 0.7],
            [spread * 0.7, -spread * 0.7],
            [-spread * 0.7, -spread * 0.7],
          ]
        : [[0, 0]];

    fctx.save();
    fctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${spread > 0 ? Math.min(1, alpha * 0.65) : alpha})`;
    fctx.shadowBlur = Math.max(1, glow.blur);
    for (const [ox, oy] of passes) {
      fctx.shadowOffsetX = -shiftX + ox;
      fctx.shadowOffsetY = oy;
      fctx.drawImage(contentCanvas, shiftX, 0);
    }
    fctx.restore();
  }

  // Layer content sits above the outer effects and below the inner ones.
  fctx.drawImage(contentCanvas, 0, 0);

  // Color overlay — recolors the layer while preserving its alpha shape.
  const colorOverlay = effects?.colorOverlay;
  if (colorOverlay?.enabled) {
    const overlayCanvas = createCanvas(docW, docH);
    const octx = overlayCanvas.getContext('2d');
    if (octx) {
      octx.drawImage(contentCanvas, 0, 0);
      octx.globalAlpha = Math.max(0, Math.min(1, colorOverlay.opacity / 100));
      octx.globalCompositeOperation = mapBlendMode(colorOverlay.blendMode);
      octx.fillStyle = colorOverlay.color;
      octx.fillRect(0, 0, docW, docH);
      octx.globalAlpha = 1;
      octx.globalCompositeOperation = 'destination-in';
      octx.drawImage(contentCanvas, 0, 0);
      fctx.drawImage(overlayCanvas, 0, 0);
    }
  }

  // Stroke — a band just outside or just inside the layer silhouette.
  const stroke = effects?.stroke;
  if (stroke?.enabled && stroke.width > 0) {
    const bandCanvas = createCanvas(docW, docH);
    const bctx = bandCanvas.getContext('2d');
    if (bctx) {
      const width = Math.max(1, stroke.width);
      const angles = Math.max(16, Math.min(96, Math.ceil(width * 4)));

      if (stroke.position === 'inside') {
        // Erode the silhouette, then keep the difference as the inner band.
        const eroded = createCanvas(docW, docH);
        const ectx = eroded.getContext('2d');
        if (ectx) {
          ectx.drawImage(contentCanvas, 0, 0);
          ectx.globalCompositeOperation = 'destination-in';
          for (let i = 0; i < angles; i += 1) {
            const angle = (i / angles) * Math.PI * 2;
            ectx.drawImage(
              contentCanvas,
              Math.cos(angle) * width,
              Math.sin(angle) * width
            );
          }
          bctx.drawImage(contentCanvas, 0, 0);
          bctx.globalCompositeOperation = 'destination-out';
          bctx.drawImage(eroded, 0, 0);
        }
      } else {
        // Dilate the silhouette, then remove the original to leave the outer band.
        for (let i = 0; i < angles; i += 1) {
          const angle = (i / angles) * Math.PI * 2;
          bctx.drawImage(contentCanvas, Math.cos(angle) * width, Math.sin(angle) * width);
        }
        bctx.globalCompositeOperation = 'destination-out';
        bctx.drawImage(contentCanvas, 0, 0);
      }

      const [r, g, b] = hexToRgba(stroke.color, 255);
      const alpha = Math.max(0, Math.min(1, stroke.opacity / 100));
      bctx.globalCompositeOperation = 'source-in';
      bctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      bctx.fillRect(0, 0, docW, docH);
      fctx.drawImage(bandCanvas, 0, 0);
    }
  }

  // Inner shadow — shadow cast by the layer edge onto its own interior.
  const innerShadow = effects?.innerShadow;
  if (innerShadow?.enabled) {
    const innerCanvas = createCanvas(docW, docH);
    const ictx = innerCanvas.getContext('2d');
    if (ictx) {
      const [r, g, b] = hexToRgba(innerShadow.color, 255);
      const alpha = Math.max(0, Math.min(1, innerShadow.opacity / 100));
      const { offsetX, offsetY } = computeShadowOffset(
        innerShadow.distance,
        innerShadow.angle
      );
      ictx.drawImage(contentCanvas, 0, 0);
      ictx.globalCompositeOperation = 'source-atop';
      ictx.shadowColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ictx.shadowBlur = Math.max(0, innerShadow.blur);
      ictx.shadowOffsetX = -shiftX + offsetX;
      ictx.shadowOffsetY = offsetY;
      ictx.drawImage(contentCanvas, shiftX, 0);
      fctx.drawImage(innerCanvas, 0, 0);
    }
  }

  // Inner glow — light spilling inward from the layer edge.
  const innerGlow = effects?.innerGlow;
  if (innerGlow?.enabled) {
    const innerCanvas = createCanvas(docW, docH);
    const ictx = innerCanvas.getContext('2d');
    if (ictx) {
      const [r, g, b] = hexToRgba(innerGlow.color, 255);
      const alpha = Math.max(0, Math.min(1, innerGlow.opacity / 100));
      const passes = innerGlow.spread > 0 ? 2 : 1;
      ictx.drawImage(contentCanvas, 0, 0);
      ictx.globalCompositeOperation = 'source-atop';
      ictx.shadowColor = `rgba(${r}, ${g}, ${b}, ${passes > 1 ? Math.min(1, alpha * 0.7) : alpha})`;
      ictx.shadowBlur = Math.max(1, innerGlow.blur);
      ictx.shadowOffsetX = -shiftX;
      ictx.shadowOffsetY = 0;
      for (let i = 0; i < passes; i += 1) {
        const spread = i === 0 ? 0 : Math.max(1, innerGlow.spread);
        ictx.shadowOffsetX = -shiftX + (i === 0 ? 0 : spread);
        ictx.shadowOffsetY = i === 0 ? 0 : spread;
        ictx.drawImage(contentCanvas, shiftX, 0);
      }
      fctx.drawImage(innerCanvas, 0, 0);
    }
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100));
  ctx.globalCompositeOperation = mapBlendMode(layer.blendMode);
  ctx.drawImage(fxCanvas, 0, 0);
  ctx.restore();
}

/** Per-pixel visibility (0..1) of a layer mask, honouring `enabled` and `inverted`. */
function maskFactors(mask: LayerMask, w: number, h: number): Float32Array {
  const sample = createCanvas(w, h);
  const mctx = sample.getContext('2d', { willReadFrequently: true });
  const out = new Float32Array(w * h);
  if (!mctx) return out.fill(1);
  mctx.drawImage(mask.canvas, 0, 0, w, h);
  const m = mctx.getImageData(0, 0, w, h).data;
  for (let i = 0, p = 0; i < m.length; i += 4, p++) {
    const lum = (0.299 * m[i] + 0.587 * m[i + 1] + 0.114 * m[i + 2]) / 255;
    const a = (m[i + 3] / 255) * lum;
    out[p] = mask.inverted ? 1 - a : a;
  }
  return out;
}

interface AdjustmentCacheEntry {
  adjustments: Adjustments;
  width: number;
  height: number;
  hash: number;
  output: Uint8ClampedArray;
}

const ADJUSTMENT_CACHE_LIMIT = 3;
const adjustmentCache = new Map<string, AdjustmentCacheEntry>();

/** Fast FNV-1a style hash over 32-bit words; far cheaper than re-running the adjustment pipeline. */
export function hashPixels(data: Uint8ClampedArray): number {
  const words = new Uint32Array(data.buffer, data.byteOffset, data.byteLength >> 2);
  let h = 0x811c9dc5;
  for (let i = 0; i < words.length; i++) {
    h = Math.imul(h ^ words[i], 0x01000193);
  }
  return h >>> 0;
}

/**
 * Returns the adjusted pixels for an adjustment layer, reusing the previous result when neither the
 * layer's adjustments nor the pixels underneath changed (e.g. painting on a layer above it).
 */
function getAdjustedPixels(
  layer: AdjustmentLayer,
  src: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const hash = hashPixels(src);
  const hit = adjustmentCache.get(layer.id);
  if (
    hit &&
    hit.adjustments === layer.adjustments &&
    hit.width === width &&
    hit.height === height &&
    hit.hash === hash
  ) {
    adjustmentCache.delete(layer.id);
    adjustmentCache.set(layer.id, hit); // refresh LRU position
    return hit.output;
  }
  const output = applyAdjustmentsToBuffer(src, width, height, layer.adjustments);
  adjustmentCache.delete(layer.id);
  adjustmentCache.set(layer.id, { adjustments: layer.adjustments, width, height, hash, output });
  while (adjustmentCache.size > ADJUSTMENT_CACHE_LIMIT) {
    const oldest = adjustmentCache.keys().next().value;
    if (oldest === undefined) break;
    adjustmentCache.delete(oldest);
  }
  return output;
}

/**
 * Applies an adjustment layer to whatever has been drawn on `ctx` so far.
 * Normal blend mode lerps original -> adjusted per pixel by mask * opacity (exact, no alpha doubling);
 * other blend modes draw the adjusted copy with the canvas blend operation.
 */
function renderAdjustmentLayerToContext(
  ctx: CanvasRenderingContext2D,
  layer: AdjustmentLayer,
  docW: number,
  docH: number
): void {
  const opacity = Math.max(0, Math.min(1, layer.opacity / 100));
  if (opacity <= 0 || isDefaultAdjustments(layer.adjustments)) return;

  const src = ctx.getImageData(0, 0, docW, docH);
  const adjusted = getAdjustedPixels(layer, src.data, docW, docH);
  const factors = layer.mask && layer.mask.enabled ? maskFactors(layer.mask, docW, docH) : null;

  if (layer.blendMode === 'normal') {
    const d = src.data;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const f = opacity * (factors ? factors[p] : 1);
      if (f <= 0) continue;
      if (f >= 1) {
        d[i] = adjusted[i];
        d[i + 1] = adjusted[i + 1];
        d[i + 2] = adjusted[i + 2];
        d[i + 3] = adjusted[i + 3];
      } else {
        d[i] += (adjusted[i] - d[i]) * f;
        d[i + 1] += (adjusted[i + 1] - d[i + 1]) * f;
        d[i + 2] += (adjusted[i + 2] - d[i + 2]) * f;
        d[i + 3] += (adjusted[i + 3] - d[i + 3]) * f;
      }
    }
    ctx.putImageData(src, 0, 0);
    return;
  }

  const layerCanvas = createCanvas(docW, docH);
  const lctx = layerCanvas.getContext('2d');
  if (!lctx) return;
  const out = new ImageData(new Uint8ClampedArray(adjusted), docW, docH);
  if (factors) {
    for (let i = 3, p = 0; i < out.data.length; i += 4, p++) {
      out.data[i] = Math.round(out.data[i] * factors[p]);
    }
  }
  lctx.putImageData(out, 0, 0);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = mapBlendMode(layer.blendMode);
  ctx.drawImage(layerCanvas, 0, 0);
  ctx.restore();
}

export function renderLayerNodeToContext(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  allLayers: Layer[],
  docW: number,
  docH: number,
  visited = new Set<string>(),
  skipAdjustmentLayers = false
): void {
  if (!layer.visible || layer.opacity <= 0) return;
  if (visited.has(layer.id)) return;
  visited.add(layer.id);

  if (layer.type === 'adjustment') {
    if (!skipAdjustmentLayers) renderAdjustmentLayerToContext(ctx, layer, docW, docH);
    return;
  }

  const hasEffects = hasActiveLayerEffects(layer.effects);

  if (layer.type === 'group') {
    const children = allLayers.filter((l) => l.parentId === layer.id);
    if (children.length === 0) return;
    const groupBuf = createCanvas(docW, docH);
    const gctx = groupBuf.getContext('2d');
    if (!gctx) return;

    for (const child of children) {
      renderLayerNodeToContext(gctx, child, allLayers, docW, docH, visited, skipAdjustmentLayers);
    }

    if (layer.mask && layer.mask.enabled) {
      applyMaskToCanvas(groupBuf, layer.mask);
    }

    if (hasEffects) {
      compositeLayerEffectsToContext(ctx, groupBuf, layer, docW, docH);
      return;
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100));
    ctx.globalCompositeOperation = mapBlendMode(layer.blendMode);
    ctx.drawImage(groupBuf, 0, 0);
    ctx.restore();
    return;
  }

  if ((layer.mask && layer.mask.enabled) || hasEffects) {
    const scratch = createCanvas(docW, docH);
    const sctx = scratch.getContext('2d');
    if (sctx) {
      drawLayerGeometryToContext(sctx, layer);
      if (layer.mask && layer.mask.enabled) {
        applyMaskToCanvas(scratch, layer.mask);
      }
      if (hasEffects) {
        compositeLayerEffectsToContext(ctx, scratch, layer, docW, docH);
      } else {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100));
        ctx.globalCompositeOperation = mapBlendMode(layer.blendMode);
        ctx.drawImage(scratch, 0, 0);
        ctx.restore();
      }
    }
    return;
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100));
  ctx.globalCompositeOperation = mapBlendMode(layer.blendMode);
  drawLayerGeometryToContext(ctx, layer);
  ctx.restore();
}

export function computeShapePathPoints(
  width: number,
  height: number,
  shapeKind: Extract<ShapeKind, 'polygon' | 'star' | 'arrow'>,
  sides = 5
): Array<{ x: number; y: number }> {
  const n = Math.max(3, Math.min(16, Math.round(sides || 5)));
  const cx = width * 0.5;
  const cy = height * 0.5;
  const rx = Math.max(1, width * 0.5);
  const ry = Math.max(1, height * 0.5);

  if (shapeKind === 'polygon') {
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / n;
      pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
    }
    return pts;
  }

  if (shapeKind === 'star') {
    const pts: Array<{ x: number; y: number }> = [];
    const innerRatio = 0.42;
    const total = n * 2;
    for (let i = 0; i < total; i++) {
      const rScale = i % 2 === 0 ? 1 : innerRatio;
      const a = -Math.PI / 2 + (i * Math.PI * 2) / total;
      pts.push({
        x: cx + Math.cos(a) * rx * rScale,
        y: cy + Math.sin(a) * ry * rScale,
      });
    }
    return pts;
  }

  const headW = Math.max(4, Math.min(width * 0.46, height * 0.72));
  const shaftX = Math.max(0, width - headW);
  const shaftHalfH = height * 0.2;
  return [
    { x: 0, y: cy - shaftHalfH },
    { x: shaftX, y: cy - shaftHalfH },
    { x: shaftX, y: 0 },
    { x: width, y: cy },
    { x: shaftX, y: height },
    { x: shaftX, y: cy + shaftHalfH },
    { x: 0, y: cy + shaftHalfH },
  ];
}

function renderShapeLayer(ctx: CanvasRenderingContext2D, layer: ShapeLayer): void {
  const {
    width,
    height,
    shapeKind,
    fill,
    fillEnabled,
    stroke,
    strokeEnabled,
    strokeWidth,
    cornerRadius,
    sides,
  } = layer;
  ctx.beginPath();

  if (shapeKind === 'rect') {
    ctx.rect(0, 0, width, height);
  } else if (shapeKind === 'rounded-rect') {
    const r = Math.min(cornerRadius, width / 2, height / 2);
    ctx.roundRect(0, 0, width, height, r);
  } else if (shapeKind === 'ellipse') {
    ctx.ellipse(
      width / 2,
      height / 2,
      Math.max(1, width / 2),
      Math.max(1, height / 2),
      0,
      0,
      Math.PI * 2
    );
  } else if (shapeKind === 'line') {
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
  } else if (shapeKind === 'polygon' || shapeKind === 'star' || shapeKind === 'arrow') {
    const pts = computeShapePathPoints(width, height, shapeKind, sides);
    if (pts.length > 0) {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();
    }
  }

  if (fillEnabled && shapeKind !== 'line') {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (strokeEnabled && strokeWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function renderTextLayer(ctx: CanvasRenderingContext2D, layer: TextLayer): void {
  const {
    text,
    fontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    color,
    align,
    lineHeight,
    width,
  } = layer;
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = align;

  const lines = wrapTextLines(ctx, text || ' ', width);
  const step = fontSize * lineHeight;
  const xPos = align === 'left' ? 0 : align === 'center' ? width / 2 : width;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], xPos, i * step);
  }
}

export function compositeLayersToCanvas(
  width: number,
  height: number,
  backgroundColor: string,
  layers: Layer[],
  adjustments?: Adjustments,
  skipAdjustmentLayers = false
): HTMLCanvasElement {
  const out = createCanvas(width, height);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return out;

  if (backgroundColor && backgroundColor !== 'transparent') {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }

  const layerIds = new Set(layers.map((l) => l.id));
  const visited = new Set<string>();
  const topLevel = layers.filter((l) => !l.parentId || !layerIds.has(l.parentId));

  for (const layer of topLevel) {
    renderLayerNodeToContext(ctx, layer, layers, width, height, visited, skipAdjustmentLayers);
  }

  if (adjustments && !isDefaultAdjustments(adjustments)) {
    const imgData = ctx.getImageData(0, 0, width, height);
    applyAdjustmentsToBuffer(imgData.data, width, height, adjustments, imgData.data);
    ctx.putImageData(imgData, 0, 0);
  }

  return out;
}

export interface SampledHistogramBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  scale: number;
  kindLabel: string;
  hidden: boolean;
}

function scaleLayerEffectsForPreview(
  effects: LayerEffects | null | undefined,
  scale: number
): LayerEffects | null {
  if (!effects) return null;
  return {
    dropShadow: {
      ...effects.dropShadow,
      blur: effects.dropShadow.blur * scale,
      distance: effects.dropShadow.distance * scale,
    },
    outerGlow: {
      ...effects.outerGlow,
      blur: effects.outerGlow.blur * scale,
      spread: effects.outerGlow.spread * scale,
    },
    stroke: {
      ...effects.stroke,
      width: Math.max(1, effects.stroke.width * scale),
    },
    colorOverlay: { ...effects.colorOverlay },
    innerShadow: {
      ...effects.innerShadow,
      blur: effects.innerShadow.blur * scale,
      distance: effects.innerShadow.distance * scale,
    },
    innerGlow: {
      ...effects.innerGlow,
      blur: effects.innerGlow.blur * scale,
      spread: effects.innerGlow.spread * scale,
    },
  };
}

export function scaleAdjustmentsForSample(adj: Adjustments, scale: number): Adjustments {
  if (scale >= 0.99 || !adj.filters) return adj;
  const f = adj.filters;
  return {
    ...adj,
    filters: {
      ...f,
      blur: f.blur > 0 ? Math.max(0.5, f.blur * scale) : 0,
      tiltShiftBlur:
        (f.tiltShiftBlur ?? 0) > 0
          ? Math.max(0.5, (f.tiltShiftBlur ?? 0) * scale)
          : 0,
      pixelate: f.pixelate > 1 ? Math.max(2, Math.round(f.pixelate * scale)) : 1,
      chromaticAberration:
        (f.chromaticAberration ?? 0) > 0
          ? Math.max(1, Math.round((f.chromaticAberration ?? 0) * scale))
          : 0,
    },
  };
}

function scaleLayerForHistogram(layer: Layer, scale: number): Layer {
  const scaledEffects = scaleLayerEffectsForPreview(layer.effects, scale);
  if (layer.type === 'adjustment') {
    return {
      ...layer,
      id: `${layer.id}__hist`,
      x: 0,
      y: 0,
      width: Math.max(1, Math.round(layer.width * scale)),
      height: Math.max(1, Math.round(layer.height * scale)),
      adjustments: scaleAdjustmentsForSample(layer.adjustments, scale),
    };
  }
  if (layer.type === 'group') {
    return {
      ...layer,
      x: layer.x * scale,
      y: layer.y * scale,
      width: Math.max(1, layer.width * scale),
      height: Math.max(1, layer.height * scale),
      effects: scaledEffects,
    };
  }
  if (layer.type === 'text') {
    return {
      ...layer,
      x: layer.x * scale,
      y: layer.y * scale,
      width: Math.max(1, layer.width * scale),
      height: Math.max(1, layer.height * scale),
      fontSize: Math.max(1, layer.fontSize * scale),
      effects: scaledEffects,
    };
  }
  if (layer.type === 'shape') {
    return {
      ...layer,
      x: layer.x * scale,
      y: layer.y * scale,
      width: Math.max(1, layer.width * scale),
      height: Math.max(1, layer.height * scale),
      strokeWidth: Math.max(0.5, layer.strokeWidth * scale),
      cornerRadius: layer.cornerRadius * scale,
      effects: scaledEffects,
    };
  }
  return {
    ...layer,
    x: layer.x * scale,
    y: layer.y * scale,
    width: Math.max(1, layer.width * scale),
    height: Math.max(1, layer.height * scale),
    effects: scaledEffects,
  };
}

export function sampleDocumentBaseForHistogram(
  docWidth: number,
  docHeight: number,
  backgroundColor: string,
  layers: Layer[],
  maxDim = 180
): SampledHistogramBuffer {
  const scale = Math.min(1, maxDim / Math.max(1, docWidth, docHeight));
  const sw = Math.max(1, Math.round(docWidth * scale));
  const sh = Math.max(1, Math.round(docHeight * scale));
  const scaledLayers = layers.map((l) => scaleLayerForHistogram(l, scale));
  const canvas = compositeLayersToCanvas(sw, sh, backgroundColor, scaledLayers);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return {
    data: ctx ? ctx.getImageData(0, 0, sw, sh).data : new Uint8ClampedArray(0),
    width: sw,
    height: sh,
    scale,
    kindLabel: 'Composite',
    hidden: false,
  };
}

export function sampleActiveLayerForHistogram(
  layer: Layer | null | undefined,
  allLayers: Layer[],
  docWidth: number,
  docHeight: number,
  backgroundColor: string,
  editingTarget: 'layer' | 'mask',
  maxDim = 180
): SampledHistogramBuffer {
  if (!layer) {
    return {
      data: new Uint8ClampedArray(0),
      width: 0,
      height: 0,
      scale: 1,
      kindLabel: 'No Layer',
      hidden: false,
    };
  }

  if (editingTarget === 'mask' && layer.mask) {
    const mw = Math.max(1, layer.mask.canvas.width);
    const mh = Math.max(1, layer.mask.canvas.height);
    const scale = Math.min(1, maxDim / Math.max(mw, mh));
    const sw = Math.max(1, Math.round(mw * scale));
    const sh = Math.max(1, Math.round(mh * scale));
    const c = createCanvas(sw, sh);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return { data: new Uint8ClampedArray(0), width: sw, height: sh, scale, kindLabel: 'Mask', hidden: !layer.mask.enabled };
    }
    ctx.drawImage(layer.mask.canvas, 0, 0, sw, sh);
    const data = ctx.getImageData(0, 0, sw, sh).data;
    if (layer.mask.inverted) {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
    }
    return {
      data,
      width: sw,
      height: sh,
      scale,
      kindLabel: 'Mask',
      hidden: !layer.mask.enabled,
    };
  }

  if (layer.type === 'raster') {
    const cw = Math.max(1, layer.canvas.width);
    const ch = Math.max(1, layer.canvas.height);
    const scale = Math.min(1, maxDim / Math.max(cw, ch));
    const sw = Math.max(1, Math.round(cw * scale));
    const sh = Math.max(1, Math.round(ch * scale));
    const c = createCanvas(sw, sh);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return { data: new Uint8ClampedArray(0), width: sw, height: sh, scale, kindLabel: 'Raster', hidden: !layer.visible };
    }
    ctx.drawImage(layer.canvas, 0, 0, sw, sh);
    return {
      data: ctx.getImageData(0, 0, sw, sh).data,
      width: sw,
      height: sh,
      scale,
      kindLabel: 'Raster',
      hidden: !layer.visible,
    };
  }

  if (layer.type === 'text' || layer.type === 'shape') {
    const effW = Math.max(1, layer.width * layer.scaleX);
    const effH = Math.max(1, layer.height * layer.scaleY);
    const scale = Math.min(1, maxDim / Math.max(effW, effH));
    const sw = Math.max(1, Math.round(effW * scale));
    const sh = Math.max(1, Math.round(effH * scale));
    const scaled = scaleLayerForHistogram(
      { ...layer, x: 0, y: 0, rotation: 0, visible: true, opacity: 100, blendMode: 'normal' },
      scale
    ) as Exclude<Layer, GroupLayer | AdjustmentLayer>;
    const c = createCanvas(sw, sh);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return {
        data: new Uint8ClampedArray(0),
        width: sw,
        height: sh,
        scale,
        kindLabel: layer.type === 'text' ? 'Text' : 'Shape',
        hidden: !layer.visible,
      };
    }
    drawLayerGeometryToContext(ctx, scaled);
    return {
      data: ctx.getImageData(0, 0, sw, sh).data,
      width: sw,
      height: sh,
      scale,
      kindLabel: layer.type === 'text' ? 'Text' : 'Shape',
      hidden: !layer.visible,
    };
  }

  if (layer.type === 'group') {
    const scale = Math.min(1, maxDim / Math.max(1, docWidth, docHeight));
    const sw = Math.max(1, Math.round(docWidth * scale));
    const sh = Math.max(1, Math.round(docHeight * scale));
    const descendants = allLayers
      .filter((l) => l.parentId === layer.id || l.id === layer.id)
      .map((l) =>
        scaleLayerForHistogram(
          l.id === layer.id ? { ...l, visible: true, opacity: 100, blendMode: 'normal', parentId: null } : l,
          scale
        )
      );
    const c = compositeLayersToCanvas(sw, sh, 'transparent', descendants);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    return {
      data: ctx ? ctx.getImageData(0, 0, sw, sh).data : new Uint8ClampedArray(0),
      width: sw,
      height: sh,
      scale,
      kindLabel: 'Group',
      hidden: !layer.visible,
    };
  }

  // Adjustment layer: show composite output up through this adjustment layer
  const scale = Math.min(1, maxDim / Math.max(1, docWidth, docHeight));
  const sw = Math.max(1, Math.round(docWidth * scale));
  const sh = Math.max(1, Math.round(docHeight * scale));
  const idx = allLayers.findIndex((l) => l.id === layer.id);
  const upThrough = (idx === -1 ? allLayers : allLayers.slice(0, idx + 1)).map((l) =>
    scaleLayerForHistogram(l.id === layer.id ? { ...l, visible: true } : l, scale)
  );
  const c = compositeLayersToCanvas(sw, sh, backgroundColor, upThrough);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return {
    data: ctx ? ctx.getImageData(0, 0, sw, sh).data : new Uint8ClampedArray(0),
    width: sw,
    height: sh,
    scale,
    kindLabel: 'Adjustment Output',
    hidden: !layer.visible,
  };
}

export function generateThumbnailDataUrl(
  doc: Pick<DocumentState, 'width' | 'height' | 'backgroundColor' | 'layers' | 'adjustments'>,
  maxEdge = 320
): string {
  const scale = Math.min(1, maxEdge / Math.max(doc.width, doc.height));
  const tw = Math.max(1, Math.round(doc.width * scale));
  const th = Math.max(1, Math.round(doc.height * scale));
  const full = compositeLayersToCanvas(
    doc.width,
    doc.height,
    doc.backgroundColor,
    doc.layers,
    doc.adjustments
  );
  const thumb = createCanvas(tw, th);
  const ctx = thumb.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(full, 0, 0, tw, th);
  }
  return thumb.toDataURL('image/webp', 0.82);
}

export function measureTextLayerDimensions(
  layer: Pick<
    TextLayer,
    'text' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'fontStyle' | 'lineHeight' | 'width'
  >
): { width: number; height: number } {
  const probe = createCanvas(1, 1);
  const ctx = probe.getContext('2d');
  if (!ctx) return { width: layer.width, height: Math.max(40, layer.fontSize * 1.4) };
  ctx.font = `${layer.fontStyle} ${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
  const lines = wrapTextLines(ctx, layer.text || ' ', layer.width);
  const height = Math.max(
    layer.fontSize * layer.lineHeight,
    lines.length * layer.fontSize * layer.lineHeight
  );
  return { width: Math.max(40, Math.round(layer.width)), height: Math.round(height) };
}

export function computeAutoEnhanceAdjustments(canvas: HTMLCanvasElement): Adjustments {
  const sampleW = Math.min(240, canvas.width);
  const sampleH = Math.min(240, canvas.height);
  const probe = createCanvas(sampleW, sampleH);
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { ...DEFAULT_ADJUSTMENTS };
  }
  ctx.drawImage(canvas, 0, 0, sampleW, sampleH);
  const data = ctx.getImageData(0, 0, sampleW, sampleH).data;

  const hist = new Uint32Array(256);
  let count = 0;
  let sumR = 0;
  let sumB = 0;
  let sumLuma = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 20) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = Math.min(255, Math.max(0, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)));
    hist[luma]++;
    sumR += r;
    sumB += b;
    sumLuma += luma;
    count++;
  }

  if (count === 0) return { ...DEFAULT_ADJUSTMENTS };

  let acc = 0;
  let p2 = 0;
  let p98 = 255;
  const lowThresh = count * 0.02;
  const highThresh = count * 0.98;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc <= lowThresh) p2 = v;
    if (acc <= highThresh) p98 = v;
  }

  const avgLuma = sumLuma / count;
  const spread = Math.max(20, p98 - p2);
  const contrastBoost = spread < 185 ? Math.min(36, Math.round(((210 - spread) / 210) * 42)) : 6;
  const exposureShift =
    avgLuma < 105
      ? Math.min(0.45, Number((((118 - avgLuma) / 255) * 1.1).toFixed(2)))
      : avgLuma > 165
        ? Math.max(-0.35, Number((((150 - avgLuma) / 255) * 0.9).toFixed(2)))
        : 0;
  const shadowLift = p2 > 18 ? -10 : avgLuma < 110 ? 18 : 8;
  const highlightRecover = p98 > 246 ? -16 : 6;

  const avgR = sumR / count;
  const avgB = sumB / count;
  const tempNudge = Math.max(-18, Math.min(18, Math.round((avgB - avgR) * 0.12)));

  return {
    ...DEFAULT_ADJUSTMENTS,
    brightness: 4,
    contrast: contrastBoost,
    exposure: exposureShift,
    saturation: 12,
    temperature: tempNudge,
    highlights: highlightRecover,
    shadows: shadowLift,
    sharpness: 14,
  };
}

function cropMaskCanvas(mask: LayerMask | null | undefined, crop: CropRect): LayerMask | null {
  if (!mask) return null;
  const cropped = createWhiteMaskCanvas(crop.width, crop.height);
  const ctx = cropped.getContext('2d');
  if (ctx) {
    ctx.drawImage(mask.canvas, -crop.x, -crop.y);
  }
  return {
    canvas: cropped,
    enabled: mask.enabled,
    inverted: mask.inverted,
  };
}

export function cropLayers(layers: Layer[], crop: CropRect): Layer[] {
  const cx = Math.round(crop.x);
  const cy = Math.round(crop.y);
  const cw = Math.max(1, Math.round(crop.width));
  const ch = Math.max(1, Math.round(crop.height));

  return layers.map((layer) => {
    const nextMask = cropMaskCanvas(layer.mask, { x: cx, y: cy, width: cw, height: ch });

    if (layer.type === 'group' || layer.type === 'adjustment') {
      return {
        ...layer,
        width: cw,
        height: ch,
        mask: nextMask,
      };
    }

    if (
      layer.type === 'raster' &&
      layer.rotation === 0 &&
      layer.scaleX === 1 &&
      layer.scaleY === 1
    ) {
      const ix1 = Math.max(cx, Math.round(layer.x));
      const iy1 = Math.max(cy, Math.round(layer.y));
      const ix2 = Math.min(cx + cw, Math.round(layer.x + layer.width));
      const iy2 = Math.min(cy + ch, Math.round(layer.y + layer.height));

      if (ix2 > ix1 && iy2 > iy1) {
        const nw = ix2 - ix1;
        const nh = iy2 - iy1;
        const croppedCanvas = createCanvas(nw, nh);
        const ctx = croppedCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(layer.canvas, ix1 - layer.x, iy1 - layer.y, nw, nh, 0, 0, nw, nh);
        }
        return {
          ...layer,
          x: ix1 - cx,
          y: iy1 - cy,
          width: nw,
          height: nh,
          canvas: croppedCanvas,
          mask: nextMask,
        };
      }
      return {
        ...layer,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        canvas: createCanvas(1, 1),
        mask: nextMask,
      };
    }

    return {
      ...layer,
      x: layer.x - cx,
      y: layer.y - cy,
      mask: nextMask,
      ...(layer.type === 'raster' ? { canvas: cloneCanvas(layer.canvas) } : {}),
    };
  });
}

export function cropAndStraightenLayers(
  layers: Layer[],
  crop: CropRect,
  angleDeg: number
): Layer[] {
  if (Math.abs(angleDeg) < 0.01) {
    return cropLayers(layers, crop);
  }

  const cx = Math.round(crop.x);
  const cy = Math.round(crop.y);
  const cw = Math.max(1, Math.round(crop.width));
  const ch = Math.max(1, Math.round(crop.height));
  const cropCx = cx + cw / 2;
  const cropCy = cy + ch / 2;
  const rad = (angleDeg * Math.PI) / 180;

  return layers.map((layer): Layer => {
    let nextMask: LayerMask | null = null;
    if (layer.mask) {
      const mCanvas = createWhiteMaskCanvas(cw, ch);
      const mctx = mCanvas.getContext('2d');
      if (mctx) {
        mctx.save();
        mctx.translate(cw / 2, ch / 2);
        mctx.rotate(rad);
        mctx.translate(-cropCx, -cropCy);
        mctx.drawImage(layer.mask.canvas, 0, 0);
        mctx.restore();
      }
      nextMask = {
        canvas: mCanvas,
        enabled: layer.mask.enabled,
        inverted: layer.mask.inverted,
      };
    }

    if (layer.type === 'group' || layer.type === 'adjustment') {
      return {
        ...layer,
        width: cw,
        height: ch,
        mask: nextMask,
      };
    }

    if (layer.type === 'raster') {
      const baked = createCanvas(cw, ch);
      const bctx = baked.getContext('2d');
      if (bctx) {
        bctx.imageSmoothingEnabled = true;
        bctx.imageSmoothingQuality = 'high';
        bctx.save();
        bctx.translate(cw / 2, ch / 2);
        bctx.rotate(rad);
        bctx.translate(-cropCx, -cropCy);
        drawLayerGeometryToContext(bctx, layer);
        bctx.restore();
      }
      return {
        ...layer,
        x: 0,
        y: 0,
        width: cw,
        height: ch,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        flipX: false,
        flipY: false,
        canvas: baked,
        mask: nextMask,
      };
    }

    // Text and Shape layers keep vector editability: orbit their center and add angleDeg
    const effW = layer.width * layer.scaleX;
    const effH = layer.height * layer.scaleY;
    const layerCx = layer.x + effW / 2;
    const layerCy = layer.y + effH / 2;
    const rotated = rotatePointAroundCenter(layerCx, layerCy, cropCx, cropCy, angleDeg);
    const nextCx = rotated.x - cx;
    const nextCy = rotated.y - cy;

    return {
      ...layer,
      x: nextCx - effW / 2,
      y: nextCy - effH / 2,
      rotation: snapRotationAngle((layer.rotation || 0) + angleDeg, false),
      mask: nextMask,
    };
  });
}

export function rasterizeVectorLayer(
  layer: TextLayer | ShapeLayer,
  newId: string
): RasterLayer {
  const effW = layer.width * layer.scaleX;
  const effH = layer.height * layer.scaleY;
  const cx = layer.x + effW / 2;
  const cy = layer.y + effH / 2;
  const corners = [
    rotatePointAroundCenter(layer.x, layer.y, cx, cy, layer.rotation || 0),
    rotatePointAroundCenter(layer.x + effW, layer.y, cx, cy, layer.rotation || 0),
    rotatePointAroundCenter(layer.x + effW, layer.y + effH, cx, cy, layer.rotation || 0),
    rotatePointAroundCenter(layer.x, layer.y + effH, cx, cy, layer.rotation || 0),
  ];
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));

  const maxScale = Math.max(Math.abs(layer.scaleX || 1), Math.abs(layer.scaleY || 1));
  const pad =
    layer.type === 'shape'
      ? Math.max(16, Math.ceil(layer.strokeWidth * maxScale + 16))
      : Math.max(24, Math.ceil(layer.fontSize * maxScale * 0.6 + 24));

  const boxX = Math.floor(minX - pad);
  const boxY = Math.floor(minY - pad);
  const boxW = Math.max(1, Math.min(8192, Math.ceil(maxX + pad) - boxX));
  const boxH = Math.max(1, Math.min(8192, Math.ceil(maxY + pad) - boxY));

  const scratch = createCanvas(boxW, boxH);
  const sctx = scratch.getContext('2d', { willReadFrequently: true });
  if (sctx) {
    sctx.save();
    sctx.translate(-boxX, -boxY);
    drawLayerGeometryToContext(sctx, layer);
    sctx.restore();

    const data = sctx.getImageData(0, 0, boxW, boxH).data;
    let tMinX = boxW;
    let tMinY = boxH;
    let tMaxX = -1;
    let tMaxY = -1;
    for (let y = 0; y < boxH; y++) {
      const row = y * boxW;
      for (let x = 0; x < boxW; x++) {
        if (data[(row + x) * 4 + 3] > 0) {
          if (x < tMinX) tMinX = x;
          if (y < tMinY) tMinY = y;
          if (x > tMaxX) tMaxX = x;
          if (y > tMaxY) tMaxY = y;
        }
      }
    }

    if (tMaxX >= tMinX && tMaxY >= tMinY) {
      const tw = tMaxX - tMinX + 1;
      const th = tMaxY - tMinY + 1;
      const outCanvas = createCanvas(tw, th);
      const octx = outCanvas.getContext('2d');
      if (octx) {
        octx.drawImage(scratch, tMinX, tMinY, tw, th, 0, 0, tw, th);
      }
      return {
        id: newId,
        name: layer.name,
        type: 'raster',
        visible: layer.visible,
        locked: layer.locked,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        parentId: layer.parentId ?? null,
        x: boxX + tMinX,
        y: boxY + tMinY,
        width: tw,
        height: th,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        flipX: false,
        flipY: false,
        mask: cloneMask(layer.mask),
        effects: cloneLayerEffects(layer.effects),
        canvas: outCanvas,
      };
    }
  }

  const fallbackW = Math.max(1, Math.round(effW));
  const fallbackH = Math.max(1, Math.round(effH));
  return {
    id: newId,
    name: layer.name,
    type: 'raster',
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    parentId: layer.parentId ?? null,
    x: Math.round(layer.x),
    y: Math.round(layer.y),
    width: fallbackW,
    height: fallbackH,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    flipY: false,
    mask: cloneMask(layer.mask),
    effects: cloneLayerEffects(layer.effects),
    canvas: createCanvas(fallbackW, fallbackH),
  };
}

export function resizeLayers(
  layers: Layer[],
  oldW: number,
  oldH: number,
  newW: number,
  newH: number
): Layer[] {
  const sx = newW / oldW;
  const sy = newH / oldH;

  return layers.map((layer) => {
    let nextMask: LayerMask | null = null;
    if (layer.mask) {
      const mCanvas = createCanvas(newW, newH);
      const mctx = mCanvas.getContext('2d');
      mctx?.drawImage(layer.mask.canvas, 0, 0, newW, newH);
      nextMask = { ...layer.mask, canvas: mCanvas };
    }

    if (layer.type === 'group' || layer.type === 'adjustment') {
      return { ...layer, width: newW, height: newH, mask: nextMask };
    }

    if (layer.type === 'raster') {
      const targetW = Math.max(1, Math.round(layer.width * sx));
      const targetH = Math.max(1, Math.round(layer.height * sy));
      const resized = createCanvas(targetW, targetH);
      const ctx = resized.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(layer.canvas, 0, 0, targetW, targetH);
      }
      return {
        ...layer,
        x: layer.x * sx,
        y: layer.y * sy,
        width: targetW,
        height: targetH,
        canvas: resized,
        mask: nextMask,
      };
    }
    if (layer.type === 'text') {
      return {
        ...layer,
        x: layer.x * sx,
        y: layer.y * sy,
        width: Math.max(10, layer.width * sx),
        height: Math.max(10, layer.height * sy),
        fontSize: Math.max(6, Math.round(layer.fontSize * ((sx + sy) / 2))),
        mask: nextMask,
      };
    }
    return {
      ...layer,
      x: layer.x * sx,
      y: layer.y * sy,
      width: Math.max(1, layer.width * sx),
      height: Math.max(1, layer.height * sy),
      strokeWidth: Math.max(0, layer.strokeWidth * ((sx + sy) / 2)),
      mask: nextMask,
    };
  });
}

export function rotateLayers(
  layers: Layer[],
  docW: number,
  docH: number,
  degrees: 90 | -90 | 180
): { layers: Layer[]; width: number; height: number } {
  const nextDocW = degrees === 180 ? docW : docH;
  const nextDocH = degrees === 180 ? docH : docW;

  const nextLayers = layers.map((layer): Layer => {
    let nextMask: LayerMask | null = null;
    if (layer.mask) {
      const rm = createCanvas(nextDocW, nextDocH);
      const rctx = rm.getContext('2d');
      if (rctx) {
        rctx.translate(nextDocW / 2, nextDocH / 2);
        rctx.rotate((degrees * Math.PI) / 180);
        rctx.drawImage(layer.mask.canvas, -docW / 2, -docH / 2);
      }
      nextMask = { ...layer.mask, canvas: rm };
    }

    if (layer.type === 'group' || layer.type === 'adjustment') {
      return { ...layer, width: nextDocW, height: nextDocH, mask: nextMask };
    }

    const cx = layer.x + (layer.width * layer.scaleX) / 2;
    const cy = layer.y + (layer.height * layer.scaleY) / 2;

    let ncx = cx;
    let ncy = cy;
    if (degrees === 90) {
      ncx = docH - cy;
      ncy = cx;
    } else if (degrees === -90) {
      ncx = cy;
      ncy = docW - cx;
    } else {
      ncx = docW - cx;
      ncy = docH - cy;
    }

    if (layer.type === 'raster') {
      const w = degrees === 180 ? layer.width : layer.height;
      const h = degrees === 180 ? layer.height : layer.width;
      const rotated = createCanvas(w, h);
      const ctx = rotated.getContext('2d');
      if (ctx) {
        ctx.translate(w / 2, h / 2);
        ctx.rotate((degrees * Math.PI) / 180);
        ctx.drawImage(layer.canvas, -layer.width / 2, -layer.height / 2);
      }
      return {
        ...layer,
        width: w,
        height: h,
        x: ncx - (w * layer.scaleX) / 2,
        y: ncy - (h * layer.scaleY) / 2,
        canvas: rotated,
        mask: nextMask,
      };
    }

    return {
      ...layer,
      x: ncx - (layer.width * layer.scaleX) / 2,
      y: ncy - (layer.height * layer.scaleY) / 2,
      rotation: (layer.rotation + degrees + 360) % 360,
      mask: nextMask,
    };
  });

  return { layers: nextLayers, width: nextDocW, height: nextDocH };
}

export function flipLayers(
  layers: Layer[],
  docW: number,
  docH: number,
  direction: 'horizontal' | 'vertical'
): Layer[] {
  return layers.map((layer): Layer => {
    let nextMask: LayerMask | null = null;
    if (layer.mask) {
      const fm = createCanvas(docW, docH);
      const fctx = fm.getContext('2d');
      if (fctx) {
        fctx.translate(
          direction === 'horizontal' ? docW : 0,
          direction === 'vertical' ? docH : 0
        );
        fctx.scale(direction === 'horizontal' ? -1 : 1, direction === 'vertical' ? -1 : 1);
        fctx.drawImage(layer.mask.canvas, 0, 0);
      }
      nextMask = { ...layer.mask, canvas: fm };
    }

    if (layer.type === 'group' || layer.type === 'adjustment') {
      return { ...layer, mask: nextMask };
    }

    const effW = layer.width * layer.scaleX;
    const effH = layer.height * layer.scaleY;

    if (layer.type === 'raster') {
      const flipped = createCanvas(layer.width, layer.height);
      const ctx = flipped.getContext('2d');
      if (ctx) {
        ctx.translate(
          direction === 'horizontal' ? layer.width : 0,
          direction === 'vertical' ? layer.height : 0
        );
        ctx.scale(direction === 'horizontal' ? -1 : 1, direction === 'vertical' ? -1 : 1);
        ctx.drawImage(layer.canvas, 0, 0);
      }
      return {
        ...layer,
        x: direction === 'horizontal' ? docW - (layer.x + effW) : layer.x,
        y: direction === 'vertical' ? docH - (layer.y + effH) : layer.y,
        canvas: flipped,
        mask: nextMask,
      };
    }

    return {
      ...layer,
      x: direction === 'horizontal' ? docW - (layer.x + effW) : layer.x,
      y: direction === 'vertical' ? docH - (layer.y + effH) : layer.y,
      flipX: direction === 'horizontal' ? !layer.flipX : layer.flipX,
      flipY: direction === 'vertical' ? !layer.flipY : layer.flipY,
      rotation:
        direction === 'horizontal'
          ? (360 - layer.rotation) % 360
          : (180 - layer.rotation + 360) % 360,
      mask: nextMask,
    };
  });
}

export function hexToRgba(hex: string, alpha = 255): [number, number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0');
  const num = parseInt(full.slice(0, 6), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255, alpha];
}

export function rgbaToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function isPointInPolygon(x: number, y: number, points: SelectionPoint[]): boolean {
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isPointInSelection(
  x: number,
  y: number,
  selection: SelectionState | null
): boolean {
  if (!selection) return true;
  let inside = false;
  if (selection.kind === 'rect') {
    inside =
      x >= selection.x &&
      x <= selection.x + selection.width &&
      y >= selection.y &&
      y <= selection.y + selection.height;
  } else if (selection.kind === 'ellipse') {
    const rx = selection.width / 2;
    const ry = selection.height / 2;
    if (rx > 0 && ry > 0) {
      const cx = selection.x + rx;
      const cy = selection.y + ry;
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      inside = dx * dx + dy * dy <= 1;
    }
  } else if (selection.kind === 'polygon' && selection.points) {
    inside = isPointInPolygon(x, y, selection.points);
  } else if (
    selection.kind === 'mask' &&
    selection.maskData &&
    selection.maskWidth &&
    selection.maskHeight
  ) {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px >= 0 && py >= 0 && px < selection.maskWidth && py < selection.maskHeight) {
      inside = selection.maskData[py * selection.maskWidth + px] > 0;
    }
  }
  return selection.inverted ? !inside : inside;
}

export function computePolygonBounds(points: SelectionPoint[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const x = Math.floor(minX);
  const y = Math.floor(minY);
  return {
    x,
    y,
    width: Math.max(1, Math.ceil(maxX) - x),
    height: Math.max(1, Math.ceil(maxY) - y),
  };
}

export function invertMaskBuffer(
  maskData: Uint8Array,
  width: number,
  height: number
): { nextMask: Uint8Array; bounds: { x: number; y: number; width: number; height: number } } {
  const nextMask = new Uint8Array(maskData.length);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      const v = maskData[idx] > 0 ? 0 : 255;
      nextMask[idx] = v;
      if (v > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    return { nextMask, bounds: { x: 0, y: 0, width: 0, height: 0 } };
  }
  return {
    nextMask,
    bounds: {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
  };
}

export function invertSelectionState(
  selection: SelectionState | null,
  docW: number,
  docH: number
): SelectionState {
  if (!selection) {
    return { kind: 'rect', x: 0, y: 0, width: docW, height: docH };
  }
  if (
    selection.kind === 'mask' &&
    selection.maskData &&
    selection.maskWidth &&
    selection.maskHeight
  ) {
    const { nextMask, bounds } = invertMaskBuffer(
      selection.maskData,
      selection.maskWidth,
      selection.maskHeight
    );
    return {
      kind: 'mask',
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maskData: nextMask,
      maskWidth: selection.maskWidth,
      maskHeight: selection.maskHeight,
      inverted: false,
    };
  }
  return {
    ...selection,
    inverted: !selection.inverted,
  };
}

export function extractMagicWandMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  tolerance: number,
  contiguous: boolean
): {
  maskData: Uint8Array;
  bounds: { x: number; y: number; width: number; height: number };
  pixelCount: number;
} | null {
  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return null;

  const total = width * height;
  const maskData = new Uint8Array(total);
  const startIdx = (sy * width + sx) * 4;
  const tr = rgba[startIdx];
  const tg = rgba[startIdx + 1];
  const tb = rgba[startIdx + 2];
  const ta = rgba[startIdx + 3];

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let pixelCount = 0;

  const matchesPixel = (pixelIndex: number): boolean => {
    const i = pixelIndex * 4;
    return (
      Math.abs(rgba[i] - tr) <= tolerance &&
      Math.abs(rgba[i + 1] - tg) <= tolerance &&
      Math.abs(rgba[i + 2] - tb) <= tolerance &&
      Math.abs(rgba[i + 3] - ta) <= tolerance
    );
  };

  if (!contiguous) {
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const idx = row + x;
        if (matchesPixel(idx)) {
          maskData[idx] = 255;
          pixelCount++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
  } else {
    const visited = new Uint8Array(total);
    const stack = new Int32Array(total);
    let sp = 0;
    const startP = sy * width + sx;
    stack[sp++] = startP;
    visited[startP] = 1;

    while (sp > 0) {
      const pIdx = stack[--sp];
      if (!matchesPixel(pIdx)) continue;
      maskData[pIdx] = 255;
      pixelCount++;

      const x = pIdx % width;
      const y = (pIdx - x) / width;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      if (x > 0) {
        const left = pIdx - 1;
        if (!visited[left]) {
          visited[left] = 1;
          stack[sp++] = left;
        }
      }
      if (x < width - 1) {
        const right = pIdx + 1;
        if (!visited[right]) {
          visited[right] = 1;
          stack[sp++] = right;
        }
      }
      if (y > 0) {
        const up = pIdx - width;
        if (!visited[up]) {
          visited[up] = 1;
          stack[sp++] = up;
        }
      }
      if (y < height - 1) {
        const down = pIdx + width;
        if (!visited[down]) {
          visited[down] = 1;
          stack[sp++] = down;
        }
      }
    }
  }

  if (pixelCount === 0) return null;
  return {
    maskData,
    bounds: {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
    pixelCount,
  };
}

export function computeMagicWandSelection(
  sourceCanvas: HTMLCanvasElement,
  startX: number,
  startY: number,
  tolerance: number,
  contiguous: boolean
): SelectionState | null {
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const imgData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const res = extractMagicWandMask(
    imgData.data,
    sourceCanvas.width,
    sourceCanvas.height,
    startX,
    startY,
    tolerance,
    contiguous
  );
  if (!res) return null;
  return {
    kind: 'mask',
    x: res.bounds.x,
    y: res.bounds.y,
    width: res.bounds.width,
    height: res.bounds.height,
    maskData: res.maskData,
    maskWidth: sourceCanvas.width,
    maskHeight: sourceCanvas.height,
    inverted: false,
  };
}

export function traceSelectionBoundarySegments(
  maskData: Uint8Array,
  width: number,
  height: number
): Array<[number, number, number, number]> {
  const segments: Array<[number, number, number, number]> = [];

  // Horizontal edges (top & bottom of selected runs)
  for (let y = 0; y <= height; y++) {
    let runStart = -1;
    let runType = 0; // 1 = top boundary (above unselected, below selected), 2 = bottom boundary
    for (let x = 0; x < width; x++) {
      const above = y > 0 ? maskData[(y - 1) * width + x] >= 128 : false;
      const below = y < height ? maskData[y * width + x] >= 128 : false;
      const edgeType = above !== below ? (below ? 1 : 2) : 0;
      if (edgeType !== runType) {
        if (runStart !== -1 && runType !== 0) {
          segments.push([runStart, y, x, y]);
        }
        runStart = edgeType !== 0 ? x : -1;
        runType = edgeType;
      }
    }
    if (runStart !== -1 && runType !== 0) {
      segments.push([runStart, y, width, y]);
    }
  }

  // Vertical edges (left & right of selected runs)
  for (let x = 0; x <= width; x++) {
    let runStart = -1;
    let runType = 0;
    for (let y = 0; y < height; y++) {
      const left = x > 0 ? maskData[y * width + (x - 1)] >= 128 : false;
      const right = x < width ? maskData[y * width + x] >= 128 : false;
      const edgeType = left !== right ? (right ? 1 : 2) : 0;
      if (edgeType !== runType) {
        if (runStart !== -1 && runType !== 0) {
          segments.push([x, runStart, x, y]);
        }
        runStart = edgeType !== 0 ? y : -1;
        runType = edgeType;
      }
    }
    if (runStart !== -1 && runType !== 0) {
      segments.push([x, runStart, x, height]);
    }
  }

  return segments;
}

export function buildSelectionSubpathInLayerSpace(
  ctx: CanvasRenderingContext2D,
  selection: SelectionState,
  offsetX: number,
  offsetY: number,
  scaleX = 1,
  scaleY = 1
): boolean {
  const sx = scaleX || 1;
  const sy = scaleY || 1;
  const lx = (selection.x - offsetX) / sx;
  const ly = (selection.y - offsetY) / sy;
  const lw = selection.width / sx;
  const lh = selection.height / sy;

  if (selection.kind === 'rect') {
    ctx.rect(lx, ly, lw, lh);
    return true;
  }
  if (selection.kind === 'ellipse') {
    ctx.ellipse(
      lx + lw / 2,
      ly + lh / 2,
      Math.max(0.5, lw / 2),
      Math.max(0.5, lh / 2),
      0,
      0,
      Math.PI * 2
    );
    return true;
  }
  if (selection.kind === 'polygon' && selection.points && selection.points.length >= 3) {
    const pts = selection.points;
    ctx.moveTo((pts[0].x - offsetX) / sx, (pts[0].y - offsetY) / sy);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo((pts[i].x - offsetX) / sx, (pts[i].y - offsetY) / sy);
    }
    ctx.closePath();
    return true;
  }
  return false;
}

export function applySelectionClipToContext(
  ctx: CanvasRenderingContext2D,
  selection: SelectionState,
  canvasWidth: number,
  canvasHeight: number,
  offsetX: number,
  offsetY: number,
  scaleX = 1,
  scaleY = 1
): 'geometric' | 'mask' {
  if (selection.kind === 'mask') return 'mask';
  ctx.beginPath();
  if (selection.inverted) {
    ctx.rect(-1, -1, canvasWidth + 2, canvasHeight + 2);
  }
  const built = buildSelectionSubpathInLayerSpace(ctx, selection, offsetX, offsetY, scaleX, scaleY);
  if (built) {
    ctx.clip(selection.inverted ? 'evenodd' : 'nonzero');
  }
  return 'geometric';
}

export function maskCanvasDiffBySelection(
  targetCanvas: HTMLCanvasElement,
  beforeCanvas: HTMLCanvasElement,
  selection: SelectionState,
  offsetX: number,
  offsetY: number,
  scaleX = 1,
  scaleY = 1
): void {
  const tctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  const bctx = beforeCanvas.getContext('2d', { willReadFrequently: true });
  if (!tctx || !bctx) return;

  const w = targetCanvas.width;
  const h = targetCanvas.height;
  const tImg = tctx.getImageData(0, 0, w, h);
  const bImg = bctx.getImageData(0, 0, w, h);
  const td = tImg.data;
  const bd = bImg.data;
  const sx = scaleX || 1;
  const sy = scaleY || 1;

  const hasFeatherMask =
    selection.kind === 'mask' &&
    selection.maskData &&
    selection.maskWidth &&
    selection.maskHeight;

  for (let py = 0; py < h; py++) {
    const docY = offsetY + py * sy;
    for (let px = 0; px < w; px++) {
      const docX = offsetX + px * sx;
      const i = (py * w + px) * 4;
      if (hasFeatherMask && selection.maskData && selection.maskWidth && selection.maskHeight) {
        const mx = Math.floor(docX);
        const my = Math.floor(docY);
        let m = 0;
        if (mx >= 0 && my >= 0 && mx < selection.maskWidth && my < selection.maskHeight) {
          m = selection.maskData[my * selection.maskWidth + mx] / 255;
        }
        if (selection.inverted) m = 1 - m;
        if (m <= 0) {
          td[i] = bd[i];
          td[i + 1] = bd[i + 1];
          td[i + 2] = bd[i + 2];
          td[i + 3] = bd[i + 3];
        } else if (m < 1) {
          td[i] = Math.round(bd[i] * (1 - m) + td[i] * m);
          td[i + 1] = Math.round(bd[i + 1] * (1 - m) + td[i + 1] * m);
          td[i + 2] = Math.round(bd[i + 2] * (1 - m) + td[i + 2] * m);
          td[i + 3] = Math.round(bd[i + 3] * (1 - m) + td[i + 3] * m);
        }
      } else if (!isPointInSelection(docX, docY, selection)) {
        td[i] = bd[i];
        td[i + 1] = bd[i + 1];
        td[i + 2] = bd[i + 2];
        td[i + 3] = bd[i + 3];
      }
    }
  }
  tctx.putImageData(tImg, 0, 0);
}

export function applyGradientToCanvas(params: {
  targetCanvas: HTMLCanvasElement;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  kind: 'linear' | 'radial';
  style: 'fg-bg' | 'fg-transparent';
  startColor: string;
  endColor: string;
  opacity: number;
  selection: SelectionState | null;
}): void {
  const {
    targetCanvas,
    x0,
    y0,
    x1,
    y1,
    offsetX,
    offsetY,
    scaleX,
    scaleY,
    kind,
    style,
    startColor,
    endColor,
    opacity,
    selection,
  } = params;

  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  const beforeCanvas = selection?.kind === 'mask' ? cloneCanvas(targetCanvas) : null;
  const sx = scaleX || 1;
  const sy = scaleY || 1;
  const lx0 = (x0 - offsetX) / sx;
  const ly0 = (y0 - offsetY) / sy;
  const lx1 = (x1 - offsetX) / sx;
  const ly1 = (y1 - offsetY) / sy;

  const [sr, sg, sb] = hexToRgba(startColor, 255);
  const [er, eg, eb] = hexToRgba(endColor, 255);
  const startStop = `rgba(${sr}, ${sg}, ${sb}, 1)`;
  const endStop =
    style === 'fg-transparent'
      ? `rgba(${sr}, ${sg}, ${sb}, 0)`
      : `rgba(${er}, ${eg}, ${eb}, 1)`;

  let grad: CanvasGradient;
  if (kind === 'radial') {
    const r = Math.max(1, Math.hypot(lx1 - lx0, ly1 - ly0));
    grad = ctx.createRadialGradient(lx0, ly0, 0, lx0, ly0, r);
  } else {
    grad = ctx.createLinearGradient(lx0, ly0, lx1, ly1);
  }
  grad.addColorStop(0, startStop);
  grad.addColorStop(1, endStop);

  ctx.save();
  if (selection && selection.kind !== 'mask') {
    applySelectionClipToContext(
      ctx,
      selection,
      targetCanvas.width,
      targetCanvas.height,
      offsetX,
      offsetY,
      sx,
      sy
    );
  }
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity / 100));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
  ctx.restore();

  if (selection && selection.kind === 'mask' && beforeCanvas) {
    maskCanvasDiffBySelection(targetCanvas, beforeCanvas, selection, offsetX, offsetY, sx, sy);
  }
}

export interface SnapBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computeSnapGuides(
  activeBounds: SnapBounds,
  docW: number,
  docH: number,
  siblingBounds: SnapBounds[],
  thresholdDoc: number,
  edgeMask?: { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean }
): { dx: number; dy: number; guides: SnapGuide[] } {
  const xTargets: Array<{ pos: number; kind: SnapGuide['kind'] }> = [
    { pos: 0, kind: 'edge' },
    { pos: docW / 2, kind: 'center' },
    { pos: docW, kind: 'edge' },
  ];
  const yTargets: Array<{ pos: number; kind: SnapGuide['kind'] }> = [
    { pos: 0, kind: 'edge' },
    { pos: docH / 2, kind: 'center' },
    { pos: docH, kind: 'edge' },
  ];

  for (const sib of siblingBounds) {
    xTargets.push(
      { pos: sib.x, kind: 'sibling' },
      { pos: sib.x + sib.width / 2, kind: 'sibling' },
      { pos: sib.x + sib.width, kind: 'sibling' }
    );
    yTargets.push(
      { pos: sib.y, kind: 'sibling' },
      { pos: sib.y + sib.height / 2, kind: 'sibling' },
      { pos: sib.y + sib.height, kind: 'sibling' }
    );
  }

  const xAnchors: number[] = edgeMask
    ? [
        ...(edgeMask.left ? [activeBounds.x] : []),
        ...(edgeMask.right ? [activeBounds.x + activeBounds.width] : []),
      ]
    : [activeBounds.x, activeBounds.x + activeBounds.width / 2, activeBounds.x + activeBounds.width];

  const yAnchors: number[] = edgeMask
    ? [
        ...(edgeMask.top ? [activeBounds.y] : []),
        ...(edgeMask.bottom ? [activeBounds.y + activeBounds.height] : []),
      ]
    : [activeBounds.y, activeBounds.y + activeBounds.height / 2, activeBounds.y + activeBounds.height];

  let bestDx = 0;
  let minAbsDx = thresholdDoc;
  let foundX = false;
  for (const anchor of xAnchors) {
    for (const target of xTargets) {
      const diff = target.pos - anchor;
      const absDiff = Math.abs(diff);
      if (absDiff <= minAbsDx) {
        minAbsDx = absDiff;
        bestDx = diff;
        foundX = true;
      }
    }
  }

  let bestDy = 0;
  let minAbsDy = thresholdDoc;
  let foundY = false;
  for (const anchor of yAnchors) {
    for (const target of yTargets) {
      const diff = target.pos - anchor;
      const absDiff = Math.abs(diff);
      if (absDiff <= minAbsDy) {
        minAbsDy = absDiff;
        bestDy = diff;
        foundY = true;
      }
    }
  }

  const dx = foundX ? Math.round(bestDx) : 0;
  const dy = foundY ? Math.round(bestDy) : 0;
  const guides: SnapGuide[] = [];
  const seenV = new Set<number>();
  const seenH = new Set<number>();

  if (foundX) {
    for (const anchor of xAnchors) {
      const snappedAnchor = anchor + dx;
      for (const target of xTargets) {
        if (Math.abs(target.pos - snappedAnchor) <= 0.75 && !seenV.has(target.pos)) {
          seenV.add(target.pos);
          guides.push({ orientation: 'v', pos: target.pos, kind: target.kind });
        }
      }
    }
  }

  if (foundY) {
    for (const anchor of yAnchors) {
      const snappedAnchor = anchor + dy;
      for (const target of yTargets) {
        if (Math.abs(target.pos - snappedAnchor) <= 0.75 && !seenH.has(target.pos)) {
          seenH.add(target.pos);
          guides.push({ orientation: 'h', pos: target.pos, kind: target.kind });
        }
      }
    }
  }

  return { dx, dy, guides };
}

export function floodFillCanvas(
  canvas: HTMLCanvasElement,
  startX: number,
  startY: number,
  fillHex: string,
  tolerance: number,
  layerOffsetX = 0,
  layerOffsetY = 0,
  selection: SelectionState | null = null
): boolean {
  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  const w = canvas.width;
  const h = canvas.height;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return false;
  if (!isPointInSelection(sx + layerOffsetX, sy + layerOffsetY, selection)) return false;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const startIdx = (sy * w + sx) * 4;
  const tr = data[startIdx];
  const tg = data[startIdx + 1];
  const tb = data[startIdx + 2];
  const ta = data[startIdx + 3];

  const [fr, fg, fb, fa] = hexToRgba(fillHex, 255);
  if (tr === fr && tg === fg && tb === fb && ta === fa) return false;

  const visited = new Uint8Array(w * h);
  const stack: number[] = [sx, sy];

  const matches = (px: number, py: number): boolean => {
    const pIdx = py * w + px;
    if (visited[pIdx]) return false;
    if (selection && !isPointInSelection(px + layerOffsetX, py + layerOffsetY, selection)) {
      return false;
    }
    const i = pIdx * 4;
    const dr = Math.abs(data[i] - tr);
    const dg = Math.abs(data[i + 1] - tg);
    const db = Math.abs(data[i + 2] - tb);
    const da = Math.abs(data[i + 3] - ta);
    return dr <= tolerance && dg <= tolerance && db <= tolerance && da <= tolerance;
  };

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    const pIdx = y * w + x;
    if (visited[pIdx]) continue;
    if (!matches(x, y)) continue;

    visited[pIdx] = 1;
    const i = pIdx * 4;
    data[i] = fr;
    data[i + 1] = fg;
    data[i + 2] = fb;
    data[i + 3] = fa;

    if (x > 0) stack.push(x - 1, y);
    if (x < w - 1) stack.push(x + 1, y);
    if (y > 0) stack.push(x, y - 1);
    if (y < h - 1) stack.push(x, y + 1);
  }

  ctx.putImageData(imgData, 0, 0);
  return true;
}

function smoothstep01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export function cloneStampBuffer(params: {
  targetData: Uint8ClampedArray;
  targetWidth: number;
  targetHeight: number;
  sourceData: Uint8ClampedArray;
  sourceWidth: number;
  sourceHeight: number;
  dstCenterX: number;
  dstCenterY: number;
  srcCenterX: number;
  srcCenterY: number;
  radius: number;
  hardness: number; // 0..1
  opacity: number; // 0..1
  docOffsetX?: number;
  docOffsetY?: number;
  scaleX?: number;
  scaleY?: number;
  selection?: SelectionState | null;
}): boolean {
  const {
    targetData,
    targetWidth,
    targetHeight,
    sourceData,
    sourceWidth,
    sourceHeight,
    dstCenterX,
    dstCenterY,
    srcCenterX,
    srcCenterY,
    radius,
    hardness,
    opacity,
    docOffsetX = 0,
    docOffsetY = 0,
    scaleX = 1,
    scaleY = 1,
    selection = null,
  } = params;

  const r = Math.max(0.5, radius);
  const op = Math.max(0, Math.min(1, opacity));
  if (op <= 0) return false;

  const x0 = Math.max(0, Math.floor(dstCenterX - r));
  const x1 = Math.min(targetWidth - 1, Math.ceil(dstCenterX + r));
  const y0 = Math.max(0, Math.floor(dstCenterY - r));
  const y1 = Math.min(targetHeight - 1, Math.ceil(dstCenterY + r));
  if (x1 < x0 || y1 < y0) return false;

  const inner = Math.max(0, Math.min(0.98, hardness * 0.85));
  const sx = scaleX || 1;
  const sy = scaleY || 1;
  let modified = false;

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dist = Math.hypot(px - dstCenterX, py - dstCenterY);
      if (dist > r) continue;

      if (selection) {
        const docX = docOffsetX + px * sx;
        const docY = docOffsetY + py * sy;
        if (!isPointInSelection(docX, docY, selection)) continue;
      }

      const srcX = Math.round(srcCenterX + (px - dstCenterX));
      const srcY = Math.round(srcCenterY + (py - dstCenterY));
      if (srcX < 0 || srcY < 0 || srcX >= sourceWidth || srcY >= sourceHeight) continue;

      const sIdx = (srcY * sourceWidth + srcX) * 4;
      const sa = sourceData[sIdx + 3] / 255;
      if (sa <= 0) continue;

      const dNorm = dist / r;
      const falloff =
        hardness >= 0.99 || dNorm <= inner
          ? 1
          : 1 - smoothstep01((dNorm - inner) / (1 - inner));
      const w = falloff * op;
      if (w <= 0) continue;

      const effA = sa * w;
      const tIdx = (py * targetWidth + px) * 4;
      const ta = targetData[tIdx + 3] / 255;
      const outA = effA + ta * (1 - effA);
      if (outA <= 0) continue;

      const invOutA = 1 / outA;
      targetData[tIdx] = Math.round(
        (sourceData[sIdx] * effA + targetData[tIdx] * ta * (1 - effA)) * invOutA
      );
      targetData[tIdx + 1] = Math.round(
        (sourceData[sIdx + 1] * effA + targetData[tIdx + 1] * ta * (1 - effA)) * invOutA
      );
      targetData[tIdx + 2] = Math.round(
        (sourceData[sIdx + 2] * effA + targetData[tIdx + 2] * ta * (1 - effA)) * invOutA
      );
      targetData[tIdx + 3] = Math.round(outA * 255);
      modified = true;
    }
  }

  return modified;
}

export function applyCloneStampDab(params: {
  targetCanvas: HTMLCanvasElement;
  sourceCanvas: HTMLCanvasElement;
  dstCenterX: number;
  dstCenterY: number;
  srcCenterX: number;
  srcCenterY: number;
  radius: number;
  hardness: number;
  opacity: number;
  docOffsetX?: number;
  docOffsetY?: number;
  scaleX?: number;
  scaleY?: number;
  selection?: SelectionState | null;
}): boolean {
  const tctx = params.targetCanvas.getContext('2d', { willReadFrequently: true });
  const sctx = params.sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!tctx || !sctx) return false;

  const r = Math.max(1, Math.ceil(params.radius));
  const x0 = Math.max(0, Math.floor(params.dstCenterX - r));
  const y0 = Math.max(0, Math.floor(params.dstCenterY - r));
  const x1 = Math.min(params.targetCanvas.width - 1, Math.ceil(params.dstCenterX + r));
  const y1 = Math.min(params.targetCanvas.height - 1, Math.ceil(params.dstCenterY + r));
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  if (bw <= 0 || bh <= 0) return false;

  const sx0 = Math.max(0, Math.floor(params.srcCenterX - r - 1));
  const sy0 = Math.max(0, Math.floor(params.srcCenterY - r - 1));
  const sx1 = Math.min(params.sourceCanvas.width - 1, Math.ceil(params.srcCenterX + r + 1));
  const sy1 = Math.min(params.sourceCanvas.height - 1, Math.ceil(params.srcCenterY + r + 1));
  const sw = sx1 - sx0 + 1;
  const sh = sy1 - sy0 + 1;
  if (sw <= 0 || sh <= 0) return false;

  const tImg = tctx.getImageData(x0, y0, bw, bh);
  const sImg = sctx.getImageData(sx0, sy0, sw, sh);

  const changed = cloneStampBuffer({
    targetData: tImg.data,
    targetWidth: bw,
    targetHeight: bh,
    sourceData: sImg.data,
    sourceWidth: sw,
    sourceHeight: sh,
    dstCenterX: params.dstCenterX - x0,
    dstCenterY: params.dstCenterY - y0,
    srcCenterX: params.srcCenterX - sx0,
    srcCenterY: params.srcCenterY - sy0,
    radius: params.radius,
    hardness: params.hardness,
    opacity: params.opacity,
    docOffsetX: (params.docOffsetX ?? 0) + x0 * (params.scaleX ?? 1),
    docOffsetY: (params.docOffsetY ?? 0) + y0 * (params.scaleY ?? 1),
    scaleX: params.scaleX,
    scaleY: params.scaleY,
    selection: params.selection,
  });

  if (changed) {
    tctx.putImageData(tImg, x0, y0);
  }
  return changed;
}

export function spotHealBuffer(params: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  radius: number;
  hardness: number; // 0..1
  docOffsetX?: number;
  docOffsetY?: number;
  scaleX?: number;
  scaleY?: number;
  selection?: SelectionState | null;
}): boolean {
  const {
    data,
    width,
    height,
    centerX,
    centerY,
    radius,
    hardness,
    docOffsetX = 0,
    docOffsetY = 0,
    scaleX = 1,
    scaleY = 1,
    selection = null,
  } = params;

  const r = Math.max(1, radius);
  const innerRing = r + 1;
  const outerRing = Math.max(r + 3, r * 1.38 + 2);

  // Sample clean collar ring around the dab
  const samples: Array<{ x: number; y: number; r: number; g: number; b: number; a: number }> = [];
  const angleSteps = 32;
  const radialRings = [innerRing, (innerRing + outerRing) * 0.5, outerRing];

  for (const rr of radialRings) {
    for (let k = 0; k < angleSteps; k++) {
      const ang = (k / angleSteps) * Math.PI * 2;
      const sx = Math.round(centerX + Math.cos(ang) * rr);
      const sy = Math.round(centerY + Math.sin(ang) * rr);
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const idx = (sy * width + sx) * 4;
      if (data[idx + 3] === 0) continue;
      samples.push({
        x: sx,
        y: sy,
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
        a: data[idx + 3],
      });
    }
  }

  if (samples.length === 0) return false;

  const x0 = Math.max(0, Math.floor(centerX - r));
  const x1 = Math.min(width - 1, Math.ceil(centerX + r));
  const y0 = Math.max(0, Math.floor(centerY - r));
  const y1 = Math.min(height - 1, Math.ceil(centerY + r));
  if (x1 < x0 || y1 < y0) return false;

  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const orig = new Uint8ClampedArray(bw * bh * 4);
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const sIdx = (py * width + px) * 4;
      const oIdx = ((py - y0) * bw + (px - x0)) * 4;
      orig[oIdx] = data[sIdx];
      orig[oIdx + 1] = data[sIdx + 1];
      orig[oIdx + 2] = data[sIdx + 2];
      orig[oIdx + 3] = data[sIdx + 3];
    }
  }

  const innerFalloff = Math.max(0, Math.min(0.95, hardness * 0.78));
  const scX = scaleX || 1;
  const scY = scaleY || 1;
  let modified = false;

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dist = Math.hypot(px - centerX, py - centerY);
      if (dist > r) continue;

      if (selection) {
        const docX = docOffsetX + px * scX;
        const docY = docOffsetY + py * scY;
        if (!isPointInSelection(docX, docY, selection)) continue;
      }

      let sumW = 0;
      let accR = 0;
      let accG = 0;
      let accB = 0;
      let accA = 0;

      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const dx = px - s.x;
        const dy = py - s.y;
        const w = 1 / (dx * dx + dy * dy + 1);
        sumW += w;
        accR += s.r * w;
        accG += s.g * w;
        accB += s.b * w;
        accA += s.a * w;
      }

      if (sumW <= 0) continue;
      const healR = accR / sumW;
      const healG = accG / sumW;
      const healB = accB / sumW;
      const healA = accA / sumW;

      const dNorm = dist / r;
      const blend =
        hardness >= 0.99 || dNorm <= innerFalloff
          ? 1
          : 1 - smoothstep01((dNorm - innerFalloff) / (1 - innerFalloff));

      const oIdx = ((py - y0) * bw + (px - x0)) * 4;
      const tIdx = (py * width + px) * 4;
      data[tIdx] = Math.round(orig[oIdx] * (1 - blend) + healR * blend);
      data[tIdx + 1] = Math.round(orig[oIdx + 1] * (1 - blend) + healG * blend);
      data[tIdx + 2] = Math.round(orig[oIdx + 2] * (1 - blend) + healB * blend);
      data[tIdx + 3] = Math.round(orig[oIdx + 3] * (1 - blend) + healA * blend);
      modified = true;
    }
  }

  return modified;
}

export function applySpotHealDab(params: {
  targetCanvas: HTMLCanvasElement;
  centerX: number;
  centerY: number;
  radius: number;
  hardness: number;
  docOffsetX?: number;
  docOffsetY?: number;
  scaleX?: number;
  scaleY?: number;
  selection?: SelectionState | null;
}): boolean {
  const ctx = params.targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  const pad = Math.ceil(Math.max(params.radius * 1.45 + 4, params.radius + 6));
  const x0 = Math.max(0, Math.floor(params.centerX - pad));
  const y0 = Math.max(0, Math.floor(params.centerY - pad));
  const x1 = Math.min(params.targetCanvas.width - 1, Math.ceil(params.centerX + pad));
  const y1 = Math.min(params.targetCanvas.height - 1, Math.ceil(params.centerY + pad));
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  if (bw <= 0 || bh <= 0) return false;

  const img = ctx.getImageData(x0, y0, bw, bh);
  const changed = spotHealBuffer({
    data: img.data,
    width: bw,
    height: bh,
    centerX: params.centerX - x0,
    centerY: params.centerY - y0,
    radius: params.radius,
    hardness: params.hardness,
    docOffsetX: (params.docOffsetX ?? 0) + x0 * (params.scaleX ?? 1),
    docOffsetY: (params.docOffsetY ?? 0) + y0 * (params.scaleY ?? 1),
    scaleX: params.scaleX,
    scaleY: params.scaleY,
    selection: params.selection,
  });

  if (changed) {
    ctx.putImageData(img, x0, y0);
  }
  return changed;
}

export function dodgeBurnBuffer(params: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  radius: number;
  hardness: number; // 0..1
  strength: number; // 0..1
  mode: 'dodge' | 'burn' | 'saturate' | 'desaturate';
  range: 'shadows' | 'midtones' | 'highlights';
  docOffsetX?: number;
  docOffsetY?: number;
  scaleX?: number;
  scaleY?: number;
  selection?: SelectionState | null;
}): boolean {
  const {
    data,
    width,
    height,
    centerX,
    centerY,
    radius,
    hardness,
    strength,
    mode,
    range,
    docOffsetX = 0,
    docOffsetY = 0,
    scaleX = 1,
    scaleY = 1,
    selection = null,
  } = params;

  const r = Math.max(0.5, radius);
  const str = Math.max(0, Math.min(1, strength));
  if (str <= 0) return false;

  const x0 = Math.max(0, Math.floor(centerX - r));
  const x1 = Math.min(width - 1, Math.ceil(centerX + r));
  const y0 = Math.max(0, Math.floor(centerY - r));
  const y1 = Math.min(height - 1, Math.ceil(centerY + r));
  if (x1 < x0 || y1 < y0) return false;

  const inner = Math.max(0, Math.min(0.98, hardness * 0.85));
  const sx = scaleX || 1;
  const sy = scaleY || 1;
  let modified = false;

  const clampByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dist = Math.hypot(px - centerX, py - centerY);
      if (dist > r) continue;

      if (selection) {
        const docX = docOffsetX + px * sx;
        const docY = docOffsetY + py * sy;
        if (!isPointInSelection(docX, docY, selection)) continue;
      }

      const idx = (py * width + px) * 4;
      if (data[idx + 3] === 0) continue;

      const dNorm = dist / r;
      const falloff =
        hardness >= 0.99 || dNorm <= inner
          ? 1
          : 1 - smoothstep01((dNorm - inner) / (1 - inner));
      if (falloff <= 0) continue;

      const rv = data[idx];
      const gv = data[idx + 1];
      const bv = data[idx + 2];
      const lum = (0.2126 * rv + 0.7152 * gv + 0.0722 * bv) / 255;

      let toneWeight = 1;
      if (range === 'shadows') {
        toneWeight = 0.2 + 0.8 * Math.pow(1 - lum, 1.35);
      } else if (range === 'midtones') {
        toneWeight = 0.3 + 0.7 * (4 * lum * (1 - lum));
      } else {
        toneWeight = 0.2 + 0.8 * Math.pow(lum, 1.35);
      }

      const amt = str * falloff * toneWeight * 0.45;
      if (amt <= 0) continue;

      if (mode === 'dodge') {
        data[idx] = clampByte(rv + (255 - rv) * amt + 8 * amt);
        data[idx + 1] = clampByte(gv + (255 - gv) * amt + 8 * amt);
        data[idx + 2] = clampByte(bv + (255 - bv) * amt + 8 * amt);
      } else if (mode === 'burn') {
        const factor = Math.max(0, 1 - amt);
        data[idx] = clampByte(rv * factor - 6 * amt);
        data[idx + 1] = clampByte(gv * factor - 6 * amt);
        data[idx + 2] = clampByte(bv * factor - 6 * amt);
      } else if (mode === 'saturate') {
        const luma = 0.2126 * rv + 0.7152 * gv + 0.0722 * bv;
        const satMult = 1 + amt * 1.65;
        data[idx] = clampByte(luma + (rv - luma) * satMult);
        data[idx + 1] = clampByte(luma + (gv - luma) * satMult);
        data[idx + 2] = clampByte(luma + (bv - luma) * satMult);
      } else {
        const luma = 0.2126 * rv + 0.7152 * gv + 0.0722 * bv;
        const satMult = Math.max(0, 1 - amt * 1.4);
        data[idx] = clampByte(luma + (rv - luma) * satMult);
        data[idx + 1] = clampByte(luma + (gv - luma) * satMult);
        data[idx + 2] = clampByte(luma + (bv - luma) * satMult);
      }
      modified = true;
    }
  }

  return modified;
}

export function applyDodgeBurnDab(params: {
  targetCanvas: HTMLCanvasElement;
  centerX: number;
  centerY: number;
  radius: number;
  hardness: number;
  strength: number;
  mode: 'dodge' | 'burn' | 'saturate' | 'desaturate';
  range: 'shadows' | 'midtones' | 'highlights';
  docOffsetX?: number;
  docOffsetY?: number;
  scaleX?: number;
  scaleY?: number;
  selection?: SelectionState | null;
}): boolean {
  const ctx = params.targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  const r = Math.max(1, Math.ceil(params.radius));
  const x0 = Math.max(0, Math.floor(params.centerX - r));
  const y0 = Math.max(0, Math.floor(params.centerY - r));
  const x1 = Math.min(params.targetCanvas.width - 1, Math.ceil(params.centerX + r));
  const y1 = Math.min(params.targetCanvas.height - 1, Math.ceil(params.centerY + r));
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  if (bw <= 0 || bh <= 0) return false;

  const img = ctx.getImageData(x0, y0, bw, bh);
  const changed = dodgeBurnBuffer({
    data: img.data,
    width: bw,
    height: bh,
    centerX: params.centerX - x0,
    centerY: params.centerY - y0,
    radius: params.radius,
    hardness: params.hardness,
    strength: params.strength,
    mode: params.mode,
    range: params.range,
    docOffsetX: (params.docOffsetX ?? 0) + x0 * (params.scaleX ?? 1),
    docOffsetY: (params.docOffsetY ?? 0) + y0 * (params.scaleY ?? 1),
    scaleX: params.scaleX,
    scaleY: params.scaleY,
    selection: params.selection,
  });

  if (changed) {
    ctx.putImageData(img, x0, y0);
  }
  return changed;
}

export function blurSharpenBuffer(params: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  radius: number;
  hardness: number; // 0..1
  strength: number; // 0..1
  mode: 'blur' | 'sharpen';
  docOffsetX?: number;
  docOffsetY?: number;
  scaleX?: number;
  scaleY?: number;
  selection?: SelectionState | null;
}): boolean {
  const {
    data,
    width,
    height,
    centerX,
    centerY,
    radius,
    hardness,
    strength,
    mode,
    docOffsetX = 0,
    docOffsetY = 0,
    scaleX = 1,
    scaleY = 1,
    selection = null,
  } = params;

  const r = Math.max(0.5, radius);
  const str = Math.max(0, Math.min(1, strength));
  if (str <= 0 || width < 2 || height < 2) return false;

  const x0 = Math.max(0, Math.floor(centerX - r));
  const x1 = Math.min(width - 1, Math.ceil(centerX + r));
  const y0 = Math.max(0, Math.floor(centerY - r));
  const y1 = Math.min(height - 1, Math.ceil(centerY + r));
  if (x1 < x0 || y1 < y0) return false;

  const orig = new Uint8ClampedArray(data);
  const inner = Math.max(0, Math.min(0.98, hardness * 0.85));
  const sx = scaleX || 1;
  const sy = scaleY || 1;
  let modified = false;

  const clampByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dist = Math.hypot(px - centerX, py - centerY);
      if (dist > r) continue;

      if (selection) {
        const docX = docOffsetX + px * sx;
        const docY = docOffsetY + py * sy;
        if (!isPointInSelection(docX, docY, selection)) continue;
      }

      const idx = (py * width + px) * 4;
      if (orig[idx + 3] === 0 && mode === 'sharpen') continue;

      const dNorm = dist / r;
      const falloff =
        hardness >= 0.99 || dNorm <= inner
          ? 1
          : 1 - smoothstep01((dNorm - inner) / (1 - inner));
      const amt = str * falloff;
      if (amt <= 0) continue;

      let accR = 0;
      let accG = 0;
      let accB = 0;
      let accA = 0;
      let wSum = 0;

      for (let ky = -1; ky <= 1; ky++) {
        const ny = Math.max(0, Math.min(height - 1, py + ky));
        for (let kx = -1; kx <= 1; kx++) {
          const nx = Math.max(0, Math.min(width - 1, px + kx));
          const kIdx = (ny * width + nx) * 4;
          const kw = kx === 0 && ky === 0 ? 4 : kx === 0 || ky === 0 ? 2 : 1;
          const na = orig[kIdx + 3] / 255;
          if (mode === 'sharpen' && na <= 0) continue;
          accR += orig[kIdx] * kw;
          accG += orig[kIdx + 1] * kw;
          accB += orig[kIdx + 2] * kw;
          accA += orig[kIdx + 3] * kw;
          wSum += kw;
        }
      }

      if (wSum <= 0) continue;
      const avgR = accR / wSum;
      const avgG = accG / wSum;
      const avgB = accB / wSum;
      const avgA = accA / wSum;

      if (mode === 'blur') {
        const blend = amt * 0.85;
        data[idx] = clampByte(orig[idx] * (1 - blend) + avgR * blend);
        data[idx + 1] = clampByte(orig[idx + 1] * (1 - blend) + avgG * blend);
        data[idx + 2] = clampByte(orig[idx + 2] * (1 - blend) + avgB * blend);
        data[idx + 3] = clampByte(orig[idx + 3] * (1 - blend) + avgA * blend);
      } else {
        const sharpGain = amt * 1.15;
        data[idx] = clampByte(orig[idx] + (orig[idx] - avgR) * sharpGain);
        data[idx + 1] = clampByte(orig[idx + 1] + (orig[idx + 1] - avgG) * sharpGain);
        data[idx + 2] = clampByte(orig[idx + 2] + (orig[idx + 2] - avgB) * sharpGain);
      }
      modified = true;
    }
  }

  return modified;
}

export function applyBlurSharpenDab(params: {
  targetCanvas: HTMLCanvasElement;
  centerX: number;
  centerY: number;
  radius: number;
  hardness: number;
  strength: number;
  mode: 'blur' | 'sharpen';
  docOffsetX?: number;
  docOffsetY?: number;
  scaleX?: number;
  scaleY?: number;
  selection?: SelectionState | null;
}): boolean {
  const ctx = params.targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  const r = Math.max(1, Math.ceil(params.radius)) + 1;
  const x0 = Math.max(0, Math.floor(params.centerX - r));
  const y0 = Math.max(0, Math.floor(params.centerY - r));
  const x1 = Math.min(params.targetCanvas.width - 1, Math.ceil(params.centerX + r));
  const y1 = Math.min(params.targetCanvas.height - 1, Math.ceil(params.centerY + r));
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  if (bw <= 0 || bh <= 0) return false;

  const img = ctx.getImageData(x0, y0, bw, bh);
  const changed = blurSharpenBuffer({
    data: img.data,
    width: bw,
    height: bh,
    centerX: params.centerX - x0,
    centerY: params.centerY - y0,
    radius: params.radius,
    hardness: params.hardness,
    strength: params.strength,
    mode: params.mode,
    docOffsetX: (params.docOffsetX ?? 0) + x0 * (params.scaleX ?? 1),
    docOffsetY: (params.docOffsetY ?? 0) + y0 * (params.scaleY ?? 1),
    scaleX: params.scaleX,
    scaleY: params.scaleY,
    selection: params.selection,
  });

  if (changed) {
    ctx.putImageData(img, x0, y0);
  }
  return changed;
}

export function smudgeBuffer(params: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  prevX: number;
  prevY: number;
  currX: number;
  currY: number;
  radius: number;
  hardness: number; // 0..1
  strength: number; // 0..1
  docOffsetX?: number;
  docOffsetY?: number;
  scaleX?: number;
  scaleY?: number;
  selection?: SelectionState | null;
}): boolean {
  const {
    data,
    width,
    height,
    prevX,
    prevY,
    currX,
    currY,
    radius,
    hardness,
    strength,
    docOffsetX = 0,
    docOffsetY = 0,
    scaleX = 1,
    scaleY = 1,
    selection = null,
  } = params;

  const dx = currX - prevX;
  const dy = currY - prevY;
  const distMoved = Math.hypot(dx, dy);
  const str = Math.max(0, Math.min(1, strength));
  if (distMoved < 0.05 || str <= 0 || width < 1 || height < 1) return false;

  const r = Math.max(0.5, radius);
  const x0 = Math.max(0, Math.floor(currX - r));
  const x1 = Math.min(width - 1, Math.ceil(currX + r));
  const y0 = Math.max(0, Math.floor(currY - r));
  const y1 = Math.min(height - 1, Math.ceil(currY + r));
  if (x1 < x0 || y1 < y0) return false;

  // Cap pull step so long jumps smudge smoothly without jumping entirely past local pixels
  const maxStep = Math.max(1, r * 0.65);
  const stepScale = distMoved > maxStep ? maxStep / distMoved : 1;
  const pullX = dx * stepScale;
  const pullY = dy * stepScale;

  const orig = new Uint8ClampedArray(data);
  const inner = Math.max(0, Math.min(0.98, hardness * 0.85));
  const sx = scaleX || 1;
  const sy = scaleY || 1;
  let modified = false;

  const sampleBilinear = (fx: number, fy: number): [number, number, number, number] => {
    const cx = Math.max(0, Math.min(width - 1, fx));
    const cy = Math.max(0, Math.min(height - 1, fy));
    const ix0 = Math.floor(cx);
    const iy0 = Math.floor(cy);
    const ix1 = Math.min(width - 1, ix0 + 1);
    const iy1 = Math.min(height - 1, iy0 + 1);
    const tx = cx - ix0;
    const ty = cy - iy0;

    const i00 = (iy0 * width + ix0) * 4;
    const i10 = (iy0 * width + ix1) * 4;
    const i01 = (iy1 * width + ix0) * 4;
    const i11 = (iy1 * width + ix1) * 4;

    const w00 = (1 - tx) * (1 - ty);
    const w10 = tx * (1 - ty);
    const w01 = (1 - tx) * ty;
    const w11 = tx * ty;

    return [
      orig[i00] * w00 + orig[i10] * w10 + orig[i01] * w01 + orig[i11] * w11,
      orig[i00 + 1] * w00 + orig[i10 + 1] * w10 + orig[i01 + 1] * w01 + orig[i11 + 1] * w11,
      orig[i00 + 2] * w00 + orig[i10 + 2] * w10 + orig[i01 + 2] * w01 + orig[i11 + 2] * w11,
      orig[i00 + 3] * w00 + orig[i10 + 3] * w10 + orig[i01 + 3] * w01 + orig[i11 + 3] * w11,
    ];
  };

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dist = Math.hypot(px - currX, py - currY);
      if (dist > r) continue;

      if (selection) {
        const docX = docOffsetX + px * sx;
        const docY = docOffsetY + py * sy;
        if (!isPointInSelection(docX, docY, selection)) continue;
      }

      const dNorm = dist / r;
      const falloff =
        hardness >= 0.99 || dNorm <= inner
          ? 1
          : 1 - smoothstep01((dNorm - inner) / (1 - inner));
      const amt = str * falloff * 0.85;
      if (amt <= 0) continue;

      const [sr, sg, sb, sa] = sampleBilinear(px - pullX, py - pullY);
      const idx = (py * width + px) * 4;
      const dstA = orig[idx + 3];
      const outA = dstA * (1 - amt) + sa * amt;

      if (outA <= 0.5) {
        data[idx + 3] = 0;
        modified = true;
        continue;
      }

      const wDst = dstA * (1 - amt);
      const wSrc = sa * amt;
      const denom = wDst + wSrc || 1;
      data[idx] = Math.round((orig[idx] * wDst + sr * wSrc) / denom);
      data[idx + 1] = Math.round((orig[idx + 1] * wDst + sg * wSrc) / denom);
      data[idx + 2] = Math.round((orig[idx + 2] * wDst + sb * wSrc) / denom);
      data[idx + 3] = Math.round(outA);
      modified = true;
    }
  }

  return modified;
}

export function applySmudgeDab(params: {
  targetCanvas: HTMLCanvasElement;
  prevX: number;
  prevY: number;
  currX: number;
  currY: number;
  radius: number;
  hardness: number;
  strength: number;
  docOffsetX?: number;
  docOffsetY?: number;
  scaleX?: number;
  scaleY?: number;
  selection?: SelectionState | null;
}): boolean {
  const ctx = params.targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  const r = Math.max(1, Math.ceil(params.radius));
  const pad = Math.ceil(r + Math.min(r * 0.75, Math.hypot(params.currX - params.prevX, params.currY - params.prevY)) + 2);
  const x0 = Math.max(0, Math.floor(params.currX - pad));
  const y0 = Math.max(0, Math.floor(params.currY - pad));
  const x1 = Math.min(params.targetCanvas.width - 1, Math.ceil(params.currX + pad));
  const y1 = Math.min(params.targetCanvas.height - 1, Math.ceil(params.currY + pad));
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  if (bw <= 0 || bh <= 0) return false;

  const img = ctx.getImageData(x0, y0, bw, bh);
  const changed = smudgeBuffer({
    data: img.data,
    width: bw,
    height: bh,
    prevX: params.prevX - x0,
    prevY: params.prevY - y0,
    currX: params.currX - x0,
    currY: params.currY - y0,
    radius: params.radius,
    hardness: params.hardness,
    strength: params.strength,
    docOffsetX: (params.docOffsetX ?? 0) + x0 * (params.scaleX ?? 1),
    docOffsetY: (params.docOffsetY ?? 0) + y0 * (params.scaleY ?? 1),
    scaleX: params.scaleX,
    scaleY: params.scaleY,
    selection: params.selection,
  });

  if (changed) {
    ctx.putImageData(img, x0, y0);
  }
  return changed;
}

export function snapshotLayers(layers: Layer[]): HistoryLayerSnapshot[] {
  return layers.map((layer) => {
    const maskSnap = layer.mask
      ? {
          maskCanvas: cloneCanvas(layer.mask.canvas),
          maskEnabled: layer.mask.enabled,
          maskInverted: layer.mask.inverted,
        }
      : {};
    const clonedEffects = cloneLayerEffects(layer.effects);

    if (layer.type === 'raster') {
      const { canvas, mask, effects: _effects, ...base } = layer;
      return {
        base: { ...base, mask: null, effects: clonedEffects },
        rasterCanvas: cloneCanvas(canvas),
        ...maskSnap,
      };
    }
    if (layer.type === 'text') {
      const {
        text,
        fontFamily,
        fontSize,
        fontWeight,
        fontStyle,
        color,
        align,
        lineHeight,
        mask,
        effects: _effects,
        ...base
      } = layer;
      return {
        base: { ...base, mask: null, effects: clonedEffects },
        textData: { text, fontFamily, fontSize, fontWeight, fontStyle, color, align, lineHeight },
        ...maskSnap,
      };
    }
    if (layer.type === 'adjustment') {
      const { adjustments, mask, effects: _effects, ...base } = layer;
      return {
        base: { ...base, mask: null, effects: clonedEffects },
        adjustmentData: cloneAdjustments(adjustments),
        ...maskSnap,
      };
    }
    if (layer.type === 'group') {
      const { expanded, mask, effects: _effects, ...base } = layer;
      return {
        base: { ...base, mask: null, effects: clonedEffects },
        groupExpanded: expanded,
        ...maskSnap,
      };
    }
    const {
      shapeKind,
      fill,
      fillEnabled,
      stroke,
      strokeEnabled,
      strokeWidth,
      cornerRadius,
      sides,
      mask,
      effects: _effects,
      ...base
    } = layer;
    return {
      base: { ...base, mask: null, effects: clonedEffects },
      shapeData: {
        shapeKind,
        fill,
        fillEnabled,
        stroke,
        strokeEnabled,
        strokeWidth,
        cornerRadius,
        ...(sides !== undefined ? { sides } : {}),
      },
      ...maskSnap,
    };
  });
}

export function restoreLayersFromSnapshot(snapshots: HistoryLayerSnapshot[]): Layer[] {
  return snapshots.map((snap): Layer => {
    const mask: LayerMask | null = snap.maskCanvas
      ? {
          canvas: cloneCanvas(snap.maskCanvas),
          enabled: snap.maskEnabled ?? true,
          inverted: snap.maskInverted ?? false,
        }
      : null;
    const restoredBase = {
      ...snap.base,
      flipX: snap.base.flipX ?? false,
      flipY: snap.base.flipY ?? false,
      effects: cloneLayerEffects(snap.base.effects),
    };

    if (snap.base.type === 'raster') {
      return {
        ...restoredBase,
        type: 'raster',
        mask,
        canvas: snap.rasterCanvas
          ? cloneCanvas(snap.rasterCanvas)
          : createCanvas(snap.base.width, snap.base.height),
      } as RasterLayer;
    }
    if (snap.base.type === 'text' && snap.textData) {
      return {
        ...restoredBase,
        type: 'text',
        mask,
        ...snap.textData,
      } as TextLayer;
    }
    if (snap.base.type === 'adjustment') {
      return {
        ...restoredBase,
        type: 'adjustment',
        mask,
        adjustments: cloneAdjustments(snap.adjustmentData ?? cloneDefaultAdjustments()),
      } as AdjustmentLayer;
    }
    if (snap.base.type === 'group') {
      return {
        ...restoredBase,
        type: 'group',
        mask,
        expanded: snap.groupExpanded ?? true,
      } as GroupLayer;
    }
    return {
      ...restoredBase,
      type: 'shape',
      mask,
      ...(snap.shapeData ?? {
        shapeKind: 'rect',
        fill: '#0A84FF',
        fillEnabled: true,
        stroke: '#FFFFFF',
        strokeEnabled: false,
        strokeWidth: 2,
        cornerRadius: 12,
      }),
    } as ShapeLayer;
  });
}

export function isLayerTreeVisible(layer: Layer, allLayers: Layer[]): boolean {
  if (!layer.visible || layer.opacity <= 0) return false;
  const byId = new Map(allLayers.map((l) => [l.id, l]));
  const seen = new Set<string>([layer.id]);
  let parentId = layer.parentId;
  while (parentId) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    if (!parent.visible || parent.opacity <= 0) return false;
    parentId = parent.parentId;
  }
  return true;
}

export function computeLayerResizeRect(params: {
  handle: string;
  dxDoc: number;
  dyDoc: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
  origRotation: number;
  lockAspect: boolean;
}): { x: number; y: number; width: number; height: number } {
  const { handle, dxDoc, dyDoc, origX, origY, origW, origH, origRotation, lockAspect } = params;
  const rotDelta = rotatePointAroundCenter(dxDoc, dyDoc, 0, 0, -origRotation);
  const dx = rotDelta.x;
  const dy = rotDelta.y;

  let nw = origW;
  let nh = origH;

  if (handle.includes('e')) nw = Math.max(10, origW + dx);
  if (handle.includes('w')) nw = Math.max(10, origW - dx);
  if (handle.includes('s')) nh = Math.max(10, origH + dy);
  if (handle.includes('n')) nh = Math.max(10, origH - dy);

  const isCorner =
    (handle.includes('n') || handle.includes('s')) &&
    (handle.includes('e') || handle.includes('w'));

  if (lockAspect && isCorner && origW > 0 && origH > 0) {
    const scaleW = nw / origW;
    const scaleH = nh / origH;
    const minScale = Math.max(10 / origW, 10 / origH);
    const chosenScale = Math.max(
      minScale,
      Math.abs(scaleW - 1) >= Math.abs(scaleH - 1) ? scaleW : scaleH
    );
    nw = origW * chosenScale;
    nh = origH * chosenScale;
  }

  let nx = handle.includes('w') ? origX + (origW - nw) : origX;
  let ny = handle.includes('n') ? origY + (origH - nh) : origY;

  if (origRotation !== 0) {
    const origCx = origX + origW / 2;
    const origCy = origY + origH / 2;
    const dirX = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
    const dirY = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
    const localShiftX = ((nw - origW) / 2) * dirX;
    const localShiftY = ((nh - origH) / 2) * dirY;
    const worldShift = rotatePointAroundCenter(localShiftX, localShiftY, 0, 0, origRotation);
    nx = origCx + worldShift.x - nw / 2;
    ny = origCy + worldShift.y - nh / 2;
  }

  return { x: nx, y: ny, width: nw, height: nh };
}

function defaultSampleRasterAlpha(layer: RasterLayer, localX: number, localY: number): number {
  const ctx = layer.canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  const cx = Math.floor(localX);
  const cy = Math.floor(localY);
  const x0 = Math.max(0, cx - 1);
  const y0 = Math.max(0, cy - 1);
  const x1 = Math.min(layer.canvas.width - 1, cx + 1);
  const y1 = Math.min(layer.canvas.height - 1, cy + 1);
  if (x1 < x0 || y1 < y0) return 0;
  const data = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
  let maxA = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > maxA) maxA = data[i];
  }
  return maxA;
}

function defaultSampleMaskVisible(layer: Layer, docX: number, docY: number): boolean {
  if (!layer.mask || !layer.mask.enabled) return true;
  const ctx = layer.mask.canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return true;
  const mx = Math.floor(docX);
  const my = Math.floor(docY);
  if (mx < 0 || my < 0 || mx >= layer.mask.canvas.width || my >= layer.mask.canvas.height) {
    return layer.mask.inverted;
  }
  const m = ctx.getImageData(mx, my, 1, 1).data;
  const lum = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255;
  const factor = (m[3] / 255) * lum;
  const effective = layer.mask.inverted ? 1 - factor : factor;
  return effective > 0.05;
}

export function pickTopmostLayerAtPoint(
  docX: number,
  docY: number,
  layers: Layer[],
  samplers?: {
    sampleRasterAlpha?: (layer: RasterLayer, localX: number, localY: number) => number;
    sampleMaskVisible?: (layer: Layer, docX: number, docY: number) => boolean;
  }
): Layer | null {
  const sampleAlpha = samplers?.sampleRasterAlpha ?? defaultSampleRasterAlpha;
  const sampleMask = samplers?.sampleMaskVisible ?? defaultSampleMaskVisible;

  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (layer.type === 'group' || layer.type === 'adjustment' || layer.locked) continue;
    if (!isLayerTreeVisible(layer, layers)) continue;

    const local = docPointToLayerLocal(docX, docY, layer);
    if (local.x < 0 || local.y < 0 || local.x > layer.width || local.y > layer.height) {
      continue;
    }
    if (!sampleMask(layer, docX, docY)) {
      continue;
    }
    if (layer.type === 'raster') {
      const alpha = sampleAlpha(layer, local.x, local.y);
      if (alpha <= 4) continue;
    }
    return layer;
  }
  return null;
}

export function rasterizeSelectionToMaskBuffer(
  selection: SelectionState,
  docW: number,
  docH: number
): Uint8Array {
  const w = Math.max(1, Math.round(docW));
  const h = Math.max(1, Math.round(docH));
  if (
    selection.kind === 'mask' &&
    selection.maskData &&
    selection.maskWidth === w &&
    selection.maskHeight === h &&
    !selection.inverted
  ) {
    return new Uint8Array(selection.maskData);
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      out[row + x] = isPointInSelection(x + 0.5, y + 0.5, selection) ? 255 : 0;
    }
  }
  return out;
}

function boxBlurPass(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  radius: number
): void {
  const temp = new Float32Array(width * height);
  const windowSize = radius * 2 + 1;

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const x = Math.max(0, Math.min(width - 1, k));
      sum += src[row + x];
    }
    temp[row] = sum / windowSize;
    for (let x = 1; x < width; x++) {
      const addX = Math.min(width - 1, x + radius);
      const remX = Math.max(0, x - radius - 1);
      sum += src[row + addX] - src[row + remX];
      temp[row + x] = sum / windowSize;
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const y = Math.max(0, Math.min(height - 1, k));
      sum += temp[y * width + x];
    }
    dst[x] = sum / windowSize;
    for (let y = 1; y < height; y++) {
      const addY = Math.min(height - 1, y + radius);
      const remY = Math.max(0, y - radius - 1);
      sum += temp[addY * width + x] - temp[remY * width + x];
      dst[y * width + x] = sum / windowSize;
    }
  }
}

export function featherMaskBuffer(
  maskData: Uint8Array,
  width: number,
  height: number,
  radiusPx: number
): { maskData: Uint8Array; bounds: { x: number; y: number; width: number; height: number } } {
  const r = Math.max(0, Math.round(radiusPx));
  const len = width * height;
  if (r === 0 || len === 0) {
    const copy = new Uint8Array(maskData);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (copy[y * width + x] > 0) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    return {
      maskData: copy,
      bounds:
        maxX < minX || maxY < minY
          ? { x: 0, y: 0, width: 0, height: 0 }
          : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    };
  }

  // 3-pass separable box blur closely approximates Gaussian feathering
  const passRadius = Math.max(1, Math.round(r * 0.58));
  let bufA = new Float32Array(len);
  let bufB = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    bufA[i] = maskData[i];
  }

  for (let pass = 0; pass < 3; pass++) {
    boxBlurPass(bufA, bufB, width, height, passRadius);
    const swap = bufA;
    bufA = bufB;
    bufB = swap;
  }

  const out = new Uint8Array(len);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      const v = Math.max(0, Math.min(255, Math.round(bufA[idx])));
      out[idx] = v;
      if (v > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  return {
    maskData: out,
    bounds:
      maxX < minX || maxY < minY
        ? { x: 0, y: 0, width: 0, height: 0 }
        : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

/** Sliding-window min (or max) over a 1D line using a monotonic deque: O(n) for any radius. */
function slidingExtreme(
  src: Uint8Array,
  dst: Uint8Array,
  start: number,
  stride: number,
  n: number,
  r: number,
  takeMax: boolean
): void {
  const idxQ = new Int32Array(n);
  let head = 0;
  let tail = 0;
  let next = 0; // next sample index to push
  for (let i = 0; i < n; i++) {
    const hi = Math.min(n - 1, i + r);
    while (next <= hi) {
      const v = src[start + next * stride];
      while (tail > head) {
        const last = src[start + idxQ[tail - 1] * stride];
        if (takeMax ? last <= v : last >= v) tail--;
        else break;
      }
      idxQ[tail++] = next++;
    }
    while (idxQ[head] < i - r) head++;
    dst[start + i * stride] = src[start + idxQ[head] * stride];
  }
}

/**
 * Grows (positive `deltaPx`) or shrinks (negative) a selection mask by a square
 * structuring element of the given radius, so edges move about `deltaPx` pixels.
 * Works on soft masks too. Pixels outside the image count as unselected when
 * shrinking, so a selection touching the canvas edge shrinks away from it.
 */
export function resizeMaskBuffer(
  maskData: Uint8Array,
  width: number,
  height: number,
  deltaPx: number
): { maskData: Uint8Array; bounds: { x: number; y: number; width: number; height: number } } {
  const r = Math.min(256, Math.round(Math.abs(deltaPx)));
  const grow = deltaPx > 0;
  let cur: Uint8Array = new Uint8Array(maskData);
  if (r > 0 && width > 0 && height > 0) {
    let src: Uint8Array = cur;
    if (!grow) {
      // Pad with a zero border so shrinking erodes inward from the canvas edge.
      const pw = width + 2 * r;
      const ph = height + 2 * r;
      const padded = new Uint8Array(pw * ph);
      for (let y = 0; y < height; y++) padded.set(maskData.subarray(y * width, (y + 1) * width), (y + r) * pw + r);
      const tmp = new Uint8Array(pw * ph);
      for (let y = 0; y < ph; y++) slidingExtreme(padded, tmp, y * pw, 1, pw, r, false);
      for (let x = 0; x < pw; x++) slidingExtreme(tmp, padded, x, pw, ph, r, false);
      const out = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) out.set(padded.subarray((y + r) * pw + r, (y + r) * pw + r + width), y * width);
      cur = out;
    } else {
      const tmp = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) slidingExtreme(src, tmp, y * width, 1, width, r, true);
      const out = new Uint8Array(width * height);
      for (let x = 0; x < width; x++) slidingExtreme(tmp, out, x, width, height, r, true);
      cur = out;
    }
  }
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cur[y * width + x] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return {
    maskData: cur,
    bounds:
      maxX < minX || maxY < minY
        ? { x: 0, y: 0, width: 0, height: 0 }
        : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

export function extractSelectionFromBuffer(
  srcRgba: Uint8ClampedArray,
  width: number,
  height: number,
  maskData: Uint8Array
): {
  data: Uint8ClampedArray;
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const p = row + x;
      if (maskData[p] > 0 && srcRgba[p * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const out = new Uint8ClampedArray(bw * bh * 4);

  for (let dy = 0; dy < bh; dy++) {
    const sy = minY + dy;
    for (let dx = 0; dx < bw; dx++) {
      const sx = minX + dx;
      const p = sy * width + sx;
      const m = maskData[p];
      if (m === 0) continue;
      const si = p * 4;
      const srcA = srcRgba[si + 3];
      if (srcA === 0) continue;
      const di = (dy * bw + dx) * 4;
      out[di] = srcRgba[si];
      out[di + 1] = srcRgba[si + 1];
      out[di + 2] = srcRgba[si + 2];
      out[di + 3] = m === 255 ? srcA : Math.round((srcA * m) / 255);
    }
  }

  return { data: out, x: minX, y: minY, width: bw, height: bh };
}

export function extractSelectionFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  maskData: Uint8Array,
  docW: number,
  docH: number
): { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number } | null {
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const img = ctx.getImageData(0, 0, docW, docH);
  const extracted = extractSelectionFromBuffer(img.data, docW, docH, maskData);
  if (!extracted) return null;
  const outCanvas = createCanvas(extracted.width, extracted.height);
  const octx = outCanvas.getContext('2d');
  if (octx) {
    const outImg = octx.createImageData(extracted.width, extracted.height);
    outImg.data.set(extracted.data);
    octx.putImageData(outImg, 0, 0);
  }
  return {
    canvas: outCanvas,
    x: extracted.x,
    y: extracted.y,
    width: extracted.width,
    height: extracted.height,
  };
}

export function writeMaskBufferToMaskCanvas(
  maskCanvas: HTMLCanvasElement,
  maskData: Uint8Array,
  width: number,
  height: number,
  invertMask = false
): void {
  const ctx = maskCanvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(width, height);
  const d = img.data;
  for (let i = 0; i < width * height; i++) {
    const v = invertMask ? 255 - maskData[i] : maskData[i];
    const p = i * 4;
    d[p] = v;
    d[p + 1] = v;
    d[p + 2] = v;
    d[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

export function fillBufferWithMask(params: {
  targetData: Uint8ClampedArray;
  targetWidth: number;
  targetHeight: number;
  fillRgba: [number, number, number, number];
  maskData: Uint8Array | null;
  maskWidth: number;
  maskHeight: number;
  offsetX?: number;
  offsetY?: number;
  scaleX?: number;
  scaleY?: number;
}): boolean {
  const {
    targetData,
    targetWidth,
    targetHeight,
    fillRgba,
    maskData,
    maskWidth,
    maskHeight,
    offsetX = 0,
    offsetY = 0,
    scaleX = 1,
    scaleY = 1,
  } = params;

  const [fr, fg, fb, fa] = fillRgba;
  const fillOpacity = fa / 255;
  if (fillOpacity <= 0) return false;
  const sx = scaleX || 1;
  const sy = scaleY || 1;
  let modified = false;

  for (let py = 0; py < targetHeight; py++) {
    const docY = Math.floor(offsetY + py * sy);
    for (let px = 0; px < targetWidth; px++) {
      let mFactor = 1;
      if (maskData) {
        const docX = Math.floor(offsetX + px * sx);
        if (docX < 0 || docY < 0 || docX >= maskWidth || docY >= maskHeight) continue;
        mFactor = maskData[docY * maskWidth + docX] / 255;
        if (mFactor <= 0) continue;
      }

      const effA = fillOpacity * mFactor;
      const idx = (py * targetWidth + px) * 4;
      const dstA = targetData[idx + 3] / 255;
      const outA = effA + dstA * (1 - effA);
      if (outA <= 0) continue;

      const invOutA = 1 / outA;
      targetData[idx] = Math.round((fr * effA + targetData[idx] * dstA * (1 - effA)) * invOutA);
      targetData[idx + 1] = Math.round(
        (fg * effA + targetData[idx + 1] * dstA * (1 - effA)) * invOutA
      );
      targetData[idx + 2] = Math.round(
        (fb * effA + targetData[idx + 2] * dstA * (1 - effA)) * invOutA
      );
      targetData[idx + 3] = Math.round(outA * 255);
      modified = true;
    }
  }
  return modified;
}

export function fillCanvasWithSelectionMask(params: {
  targetCanvas: HTMLCanvasElement;
  fillHex: string;
  opacityPercent: number;
  maskData: Uint8Array | null;
  docWidth: number;
  docHeight: number;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
}): boolean {
  const ctx = params.targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  const w = params.targetCanvas.width;
  const h = params.targetCanvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const alpha = Math.round(Math.max(0, Math.min(100, params.opacityPercent)) * 2.55);
  const rgba = hexToRgba(params.fillHex, alpha);
  const changed = fillBufferWithMask({
    targetData: img.data,
    targetWidth: w,
    targetHeight: h,
    fillRgba: rgba,
    maskData: params.maskData,
    maskWidth: params.docWidth,
    maskHeight: params.docHeight,
    offsetX: params.offsetX,
    offsetY: params.offsetY,
    scaleX: params.scaleX,
    scaleY: params.scaleY,
  });
  if (changed) {
    ctx.putImageData(img, 0, 0);
  }
  return changed;
}

export function computeCanvasAnchorOffset(
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
  anchor: CanvasAnchor
): { dx: number; dy: number } {
  const dw = newWidth - oldWidth;
  const dh = newHeight - oldHeight;
  const col = anchor.endsWith('w') ? 0 : anchor.endsWith('e') ? 2 : 1;
  const row = anchor.startsWith('n') ? 0 : anchor.startsWith('s') ? 2 : 1;
  return {
    dx: Math.round((dw * col) / 2),
    dy: Math.round((dh * row) / 2),
  };
}

export function canvasSizeLayers(
  layers: Layer[],
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
  anchor: CanvasAnchor
): Layer[] {
  const nw = Math.max(1, Math.round(newWidth));
  const nh = Math.max(1, Math.round(newHeight));
  const { dx, dy } = computeCanvasAnchorOffset(oldWidth, oldHeight, nw, nh, anchor);

  return layers.map((layer) => {
    let nextMask: LayerMask | null = layer.mask ?? null;
    if (layer.mask) {
      const mCanvas = createWhiteMaskCanvas(nw, nh);
      const mctx = mCanvas.getContext('2d');
      if (mctx) {
        mctx.drawImage(layer.mask.canvas, dx, dy);
      }
      nextMask = {
        canvas: mCanvas,
        enabled: layer.mask.enabled,
        inverted: layer.mask.inverted,
      };
    }

    if (layer.type === 'group' || layer.type === 'adjustment') {
      return {
        ...layer,
        width: nw,
        height: nh,
        mask: nextMask,
      };
    }

    return {
      ...layer,
      x: layer.x + dx,
      y: layer.y + dy,
      mask: nextMask,
      ...(layer.type === 'raster' ? { canvas: cloneCanvas(layer.canvas) } : {}),
    };
  });
}

export function computeAlphaBoundsFromRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number
): CropRect | null {
  if (width <= 0 || height <= 0) return null;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (data[(row + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  const trimW = maxX - minX + 1;
  const trimH = maxY - minY + 1;
  if (minX === 0 && minY === 0 && trimW === width && trimH === height) {
    return null;
  }
  return { x: minX, y: minY, width: trimW, height: trimH };
}

export function computeTrimTransparentBounds(
  width: number,
  height: number,
  backgroundColor: string,
  layers: Layer[],
  adjustments?: Adjustments
): CropRect | null {
  if (width <= 0 || height <= 0) return null;
  const flat = compositeLayersToCanvas(width, height, backgroundColor, layers, adjustments);
  const ctx = flat.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const data = ctx.getImageData(0, 0, width, height).data;
  return computeAlphaBoundsFromRgba(data, width, height);
}

export function strokeBufferWithSelectionMask(params: {
  targetData: Uint8ClampedArray;
  targetWidth: number;
  targetHeight: number;
  strokeRgba: [number, number, number, number];
  strokeWidthPx: number;
  maskData: Uint8Array | null;
  maskWidth: number;
  maskHeight: number;
  offsetX?: number;
  offsetY?: number;
  scaleX?: number;
  scaleY?: number;
}): boolean {
  const {
    targetData,
    targetWidth,
    targetHeight,
    strokeRgba,
    strokeWidthPx,
    maskData,
    maskWidth,
    maskHeight,
    offsetX = 0,
    offsetY = 0,
    scaleX = 1,
    scaleY = 1,
  } = params;

  const [sr, sg, sb, sa] = strokeRgba;
  const strokeOpacity = sa / 255;
  const thickness = Math.max(1, Math.min(48, Math.round(strokeWidthPx)));
  if (strokeOpacity <= 0 || targetWidth <= 0 || targetHeight <= 0) return false;

  const sx = scaleX || 1;
  const sy = scaleY || 1;
  let modified = false;

  if (!maskData) {
    for (let py = 0; py < targetHeight; py++) {
      for (let px = 0; px < targetWidth; px++) {
        if (
          px >= thickness &&
          py >= thickness &&
          px < targetWidth - thickness &&
          py < targetHeight - thickness
        ) {
          continue;
        }
        const idx = (py * targetWidth + px) * 4;
        const dstA = targetData[idx + 3] / 255;
        const outA = strokeOpacity + dstA * (1 - strokeOpacity);
        if (outA <= 0) continue;
        const inv = 1 / outA;
        targetData[idx] = Math.round((sr * strokeOpacity + targetData[idx] * dstA * (1 - strokeOpacity)) * inv);
        targetData[idx + 1] = Math.round((sg * strokeOpacity + targetData[idx + 1] * dstA * (1 - strokeOpacity)) * inv);
        targetData[idx + 2] = Math.round((sb * strokeOpacity + targetData[idx + 2] * dstA * (1 - strokeOpacity)) * inv);
        targetData[idx + 3] = Math.round(outA * 255);
        modified = true;
      }
    }
    return modified;
  }

  const rSq = thickness * thickness;
  for (let py = 0; py < targetHeight; py++) {
    const docY = Math.floor(offsetY + py * sy);
    if (docY < 0 || docY >= maskHeight) continue;
    for (let px = 0; px < targetWidth; px++) {
      const docX = Math.floor(offsetX + px * sx);
      if (docX < 0 || docX >= maskWidth) continue;
      const mVal = maskData[docY * maskWidth + docX];
      if (mVal === 0) continue;

      let nearEdge = false;
      for (let ky = -thickness; ky <= thickness && !nearEdge; ky++) {
        const ny = docY + ky;
        const ky2 = ky * ky;
        for (let kx = -thickness; kx <= thickness; kx++) {
          if (kx * kx + ky2 > rSq) continue;
          const nx = docX + kx;
          if (nx < 0 || ny < 0 || nx >= maskWidth || ny >= maskHeight) {
            nearEdge = true;
            break;
          }
          if (maskData[ny * maskWidth + nx] === 0) {
            nearEdge = true;
            break;
          }
        }
      }
      if (!nearEdge) continue;

      const effA = strokeOpacity * (mVal / 255);
      const idx = (py * targetWidth + px) * 4;
      const dstA = targetData[idx + 3] / 255;
      const outA = effA + dstA * (1 - effA);
      if (outA <= 0) continue;
      const inv = 1 / outA;
      targetData[idx] = Math.round((sr * effA + targetData[idx] * dstA * (1 - effA)) * inv);
      targetData[idx + 1] = Math.round((sg * effA + targetData[idx + 1] * dstA * (1 - effA)) * inv);
      targetData[idx + 2] = Math.round((sb * effA + targetData[idx + 2] * dstA * (1 - effA)) * inv);
      targetData[idx + 3] = Math.round(outA * 255);
      modified = true;
    }
  }
  return modified;
}

export function strokeCanvasWithSelectionMask(params: {
  targetCanvas: HTMLCanvasElement;
  strokeHex: string;
  strokeWidthPx: number;
  opacityPercent: number;
  maskData: Uint8Array | null;
  docWidth: number;
  docHeight: number;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
}): boolean {
  const ctx = params.targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  const w = params.targetCanvas.width;
  const h = params.targetCanvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const alpha = Math.round(Math.max(0, Math.min(100, params.opacityPercent)) * 2.55);
  const rgba = hexToRgba(params.strokeHex, alpha);
  const changed = strokeBufferWithSelectionMask({
    targetData: img.data,
    targetWidth: w,
    targetHeight: h,
    strokeRgba: rgba,
    strokeWidthPx: params.strokeWidthPx,
    maskData: params.maskData,
    maskWidth: params.docWidth,
    maskHeight: params.docHeight,
    offsetX: params.offsetX,
    offsetY: params.offsetY,
    scaleX: params.scaleX,
    scaleY: params.scaleY,
  });
  if (changed) {
    ctx.putImageData(img, 0, 0);
  }
  return changed;
}

function rgbToHslUnit(r: number, g: number, b: number): [number, number, number] {
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
  return [h / 6, s, l];
}

function hslUnitToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s <= 1e-6) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

export function colorReplaceBuffer(params: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  radius: number;
  hardness: number; // 0..1
  opacity: number; // 0..1
  targetRgba: [number, number, number, number];
}): boolean {
  const { data, width, height, centerX, centerY, radius, hardness, opacity, targetRgba } = params;
  const r = Math.max(0.5, radius);
  const op = Math.max(0, Math.min(1, opacity));
  if (op <= 0) return false;

  const [fh, fs] = rgbToHslUnit(targetRgba[0], targetRgba[1], targetRgba[2]);
  const x0 = Math.max(0, Math.floor(centerX - r));
  const x1 = Math.min(width - 1, Math.ceil(centerX + r));
  const y0 = Math.max(0, Math.floor(centerY - r));
  const y1 = Math.min(height - 1, Math.ceil(centerY + r));
  if (x1 < x0 || y1 < y0) return false;

  const inner = Math.max(0, Math.min(0.98, hardness * 0.85));
  let modified = false;

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dist = Math.hypot(px - centerX, py - centerY);
      if (dist > r) continue;
      const idx = (py * width + px) * 4;
      if (data[idx + 3] === 0) continue;

      const dNorm = dist / r;
      const falloff =
        hardness >= 0.99 || dNorm <= inner
          ? 1
          : 1 - smoothstep01((dNorm - inner) / (1 - inner));
      const w = falloff * op;
      if (w <= 0) continue;

      const [, , lum] = rgbToHslUnit(data[idx], data[idx + 1], data[idx + 2]);
      const [nr, ng, nb] = hslUnitToRgb(fh, fs, lum);
      data[idx] = Math.round(data[idx] * (1 - w) + nr * w);
      data[idx + 1] = Math.round(data[idx + 1] * (1 - w) + ng * w);
      data[idx + 2] = Math.round(data[idx + 2] * (1 - w) + nb * w);
      modified = true;
    }
  }
  return modified;
}

export function paintColorReplaceDab(params: {
  targetCanvas: HTMLCanvasElement;
  centerX: number;
  centerY: number;
  radius: number;
  hardness: number; // 0..1
  opacity: number; // 0..1
  hex: string;
}): boolean {
  const ctx = params.targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  const r = Math.max(1, Math.ceil(params.radius));
  const x0 = Math.max(0, Math.floor(params.centerX - r));
  const y0 = Math.max(0, Math.floor(params.centerY - r));
  const x1 = Math.min(params.targetCanvas.width - 1, Math.ceil(params.centerX + r));
  const y1 = Math.min(params.targetCanvas.height - 1, Math.ceil(params.centerY + r));
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  if (bw <= 0 || bh <= 0) return false;

  const img = ctx.getImageData(x0, y0, bw, bh);
  const changed = colorReplaceBuffer({
    data: img.data,
    width: bw,
    height: bh,
    centerX: params.centerX - x0,
    centerY: params.centerY - y0,
    radius: params.radius,
    hardness: params.hardness,
    opacity: params.opacity,
    targetRgba: hexToRgba(params.hex, 255),
  });
  if (changed) {
    ctx.putImageData(img, x0, y0);
  }
  return changed;
}

export function redEyeRemovalBuffer(params: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  radius: number;
  hardness: number; // 0..1
  docOffsetX?: number;
  docOffsetY?: number;
  scaleX?: number;
  scaleY?: number;
  selection?: SelectionState | null;
}): boolean {
  const {
    data,
    width,
    height,
    centerX,
    centerY,
    radius,
    hardness,
    docOffsetX = 0,
    docOffsetY = 0,
    scaleX = 1,
    scaleY = 1,
    selection = null,
  } = params;

  const r = Math.max(0.5, radius);
  const x0 = Math.max(0, Math.floor(centerX - r));
  const x1 = Math.min(width - 1, Math.ceil(centerX + r));
  const y0 = Math.max(0, Math.floor(centerY - r));
  const y1 = Math.min(height - 1, Math.ceil(centerY + r));
  if (x1 < x0 || y1 < y0) return false;

  const inner = Math.max(0, Math.min(0.98, hardness * 0.85));
  const sx = scaleX || 1;
  const sy = scaleY || 1;
  let modified = false;

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dist = Math.hypot(px - centerX, py - centerY);
      if (dist > r) continue;
      if (selection) {
        if (!isPointInSelection(docOffsetX + px * sx, docOffsetY + py * sy, selection)) continue;
      }

      const idx = (py * width + px) * 4;
      if (data[idx + 3] === 0) continue;

      const pr = data[idx];
      const pg = data[idx + 1];
      const pb = data[idx + 2];
      // Preserve specular eye catchlights
      if (pg > 185 && pb > 185) continue;

      const maxGB = Math.max(pg, pb);
      const redExcess = pr - maxGB;
      if (pr < 55 || redExcess < 22 || pr < maxGB * 1.35) continue;

      const dNorm = dist / r;
      const falloff =
        hardness >= 0.99 || dNorm <= inner
          ? 1
          : 1 - smoothstep01((dNorm - inner) / (1 - inner));
      const rednessRatio = Math.min(1, (pr / Math.max(1, maxGB) - 1.25) / 1.15);
      const strength = Math.max(0, Math.min(1, falloff * rednessRatio));
      if (strength <= 0) continue;

      const neutralPupil = Math.round(Math.min(pg, pb) * 0.82);
      data[idx] = Math.round(pr * (1 - strength) + neutralPupil * strength);
      data[idx + 1] = Math.round(pg * (1 - strength * 0.35) + neutralPupil * (strength * 0.35));
      data[idx + 2] = Math.round(pb * (1 - strength * 0.35) + neutralPupil * (strength * 0.35));
      modified = true;
    }
  }
  return modified;
}

export function applyRedEyeRemovalDab(params: {
  targetCanvas: HTMLCanvasElement;
  centerX: number;
  centerY: number;
  radius: number;
  hardness: number;
  docOffsetX?: number;
  docOffsetY?: number;
  scaleX?: number;
  scaleY?: number;
  selection?: SelectionState | null;
}): boolean {
  const ctx = params.targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  const r = Math.max(1, Math.ceil(params.radius));
  const x0 = Math.max(0, Math.floor(params.centerX - r));
  const y0 = Math.max(0, Math.floor(params.centerY - r));
  const x1 = Math.min(params.targetCanvas.width - 1, Math.ceil(params.centerX + r));
  const y1 = Math.min(params.targetCanvas.height - 1, Math.ceil(params.centerY + r));
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  if (bw <= 0 || bh <= 0) return false;

  const img = ctx.getImageData(x0, y0, bw, bh);
  const changed = redEyeRemovalBuffer({
    data: img.data,
    width: bw,
    height: bh,
    centerX: params.centerX - x0,
    centerY: params.centerY - y0,
    radius: params.radius,
    hardness: params.hardness,
    docOffsetX: (params.docOffsetX ?? 0) + x0 * (params.scaleX ?? 1),
    docOffsetY: (params.docOffsetY ?? 0) + y0 * (params.scaleY ?? 1),
    scaleX: params.scaleX,
    scaleY: params.scaleY,
    selection: params.selection,
  });
  if (changed) {
    ctx.putImageData(img, x0, y0);
  }
  return changed;
}

export function sampleAverageColorFromCanvas(
  canvas: HTMLCanvasElement,
  docX: number,
  docY: number,
  sampleSize: 1 | 3 | 5
): string | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const half = sampleSize === 1 ? 0 : sampleSize === 3 ? 1 : 2;
  const cx = Math.max(0, Math.min(canvas.width - 1, Math.floor(docX)));
  const cy = Math.max(0, Math.min(canvas.height - 1, Math.floor(docY)));
  const x0 = Math.max(0, cx - half);
  const y0 = Math.max(0, cy - half);
  const x1 = Math.min(canvas.width - 1, cx + half);
  const y1 = Math.min(canvas.height - 1, cy + half);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const data = ctx.getImageData(x0, y0, bw, bh).data;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0 && sampleSize > 1) continue;
    sr += data[i];
    sg += data[i + 1];
    sb += data[i + 2];
    count++;
  }
  if (count === 0) {
    const px = ctx.getImageData(cx, cy, 1, 1).data;
    return rgbaToHex(px[0], px[1], px[2]);
  }
  return rgbaToHex(sr / count, sg / count, sb / count);
}

/**
 * Solves 3x3 projective homography H mapping `srcPts` (4 points) to `dstPts` (4 points).
 * Returns row-major 9-element matrix [h0..h7, 1] or null if degenerate.
 */
export function solveHomography(
  srcPts: ReadonlyArray<{ x: number; y: number }>,
  dstPts: ReadonlyArray<{ x: number; y: number }>
): Float64Array | null {
  if (srcPts.length < 4 || dstPts.length < 4) return null;
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = srcPts[i];
    const { x: u, y: v } = dstPts[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(A[col][col]);
    for (let r = col + 1; r < n; r++) {
      const val = Math.abs(A[r][col]);
      if (val > maxAbs) {
        maxAbs = val;
        pivotRow = r;
      }
    }
    if (maxAbs < 1e-10) return null;
    if (pivotRow !== col) {
      [A[col], A[pivotRow]] = [A[pivotRow], A[col]];
      [b[col], b[pivotRow]] = [b[pivotRow], b[col]];
    }
    const pivot = A[col][col];
    for (let r = col + 1; r < n; r++) {
      const factor = A[r][col] / pivot;
      if (factor === 0) continue;
      for (let c = col; c < n; c++) {
        A[r][c] -= factor * A[col][c];
      }
      b[r] -= factor * b[col];
    }
  }

  const h = new Float64Array(9);
  for (let r = n - 1; r >= 0; r--) {
    let sum = b[r];
    for (let c = r + 1; c < n; c++) {
      sum -= A[r][c] * h[c];
    }
    h[r] = sum / A[r][r];
  }
  h[8] = 1;
  return h;
}

/**
 * Inverse-maps destination pixels through projective homography into `srcData`
 * using bilinear interpolation. `dstCorners` order: [TL, TR, BR, BL] in pixel space.
 */
export function warpBufferPerspective(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  dstCorners: ReadonlyArray<{ x: number; y: number }>
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(srcData.length);
  if (width <= 1 || height <= 1 || dstCorners.length < 4) return new Uint8ClampedArray(srcData);

  const srcCorners = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];
  // Compute inverse homography directly: dst -> src
  const invH = solveHomography(dstCorners, srcCorners);
  if (!invH) return new Uint8ClampedArray(srcData);

  const h0 = invH[0], h1 = invH[1], h2 = invH[2];
  const h3 = invH[3], h4 = invH[4], h5 = invH[5];
  const h6 = invH[6], h7 = invH[7], h8 = invH[8];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const denom = h6 * x + h7 * y + h8;
      if (Math.abs(denom) < 1e-8) continue;
      const sxRaw = (h0 * x + h1 * y + h2) / denom;
      const syRaw = (h3 * x + h4 * y + h5) / denom;
      const EPS = 1e-4;
      if (sxRaw < -EPS || syRaw < -EPS || sxRaw > width - 1 + EPS || syRaw > height - 1 + EPS) {
        continue;
      }
      const sx = Math.max(0, Math.min(width - 1, sxRaw));
      const sy = Math.max(0, Math.min(height - 1, syRaw));

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
      const outIdx = (y * width + x) * 4;

      const w00 = (1 - tx) * (1 - ty);
      const w10 = tx * (1 - ty);
      const w01 = (1 - tx) * ty;
      const w11 = tx * ty;

      out[outIdx] = Math.round(
        srcData[i00] * w00 + srcData[i10] * w10 + srcData[i01] * w01 + srcData[i11] * w11
      );
      out[outIdx + 1] = Math.round(
        srcData[i00 + 1] * w00 + srcData[i10 + 1] * w10 + srcData[i01 + 1] * w01 + srcData[i11 + 1] * w11
      );
      out[outIdx + 2] = Math.round(
        srcData[i00 + 2] * w00 + srcData[i10 + 2] * w10 + srcData[i01 + 2] * w01 + srcData[i11 + 2] * w11
      );
      out[outIdx + 3] = Math.round(
        srcData[i00 + 3] * w00 + srcData[i10 + 3] * w10 + srcData[i01 + 3] * w01 + srcData[i11 + 3] * w11
      );
    }
  }
  return out;
}

export function warpCanvasPerspective(
  canvas: HTMLCanvasElement,
  dstCorners: ReadonlyArray<{ x: number; y: number }>
): HTMLCanvasElement {
  const w = canvas.width;
  const h = canvas.height;
  const outCanvas = createCanvas(w, h);
  const srcCtx = canvas.getContext('2d', { willReadFrequently: true });
  const dstCtx = outCanvas.getContext('2d');
  if (!srcCtx || !dstCtx) return outCanvas;
  const srcImg = srcCtx.getImageData(0, 0, w, h);
  const warped = warpBufferPerspective(srcImg.data, w, h, dstCorners);
  dstCtx.putImageData(new ImageData(new Uint8ClampedArray(warped), w, h), 0, 0);
  return outCanvas;
}

export function applyPixelFilterToCanvas(params: {
  targetCanvas: HTMLCanvasElement;
  transform: (data: Uint8ClampedArray, width: number, height: number) => Uint8ClampedArray;
  selection: SelectionState | null;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
}): boolean {
  const ctx = params.targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  const w = params.targetCanvas.width;
  const h = params.targetCanvas.height;
  const beforeCanvas = params.selection ? cloneCanvas(params.targetCanvas) : null;
  const img = ctx.getImageData(0, 0, w, h);
  const nextData = params.transform(img.data, w, h);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(nextData), w, h), 0, 0);
  if (params.selection && beforeCanvas) {
    maskCanvasDiffBySelection(
      params.targetCanvas,
      beforeCanvas,
      params.selection,
      params.offsetX,
      params.offsetY,
      params.scaleX,
      params.scaleY
    );
  }
  return true;
}


