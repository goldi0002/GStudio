import {
  applyAdjustmentsToBuffer,
  DEFAULT_ADJUSTMENTS,
  isDefaultAdjustments,
} from './adjustments';
import type {
  Adjustments,
  BlendMode,
  CropRect,
  DocumentState,
  DropShadowEffect,
  GroupLayer,
  HistoryLayerSnapshot,
  Layer,
  LayerEffects,
  LayerMask,
  OuterGlowEffect,
  RasterLayer,
  SelectionPoint,
  SelectionState,
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

export const DEFAULT_LAYER_EFFECTS: LayerEffects = {
  dropShadow: DEFAULT_DROP_SHADOW,
  outerGlow: DEFAULT_OUTER_GLOW,
};

export function cloneLayerEffects(effects?: LayerEffects | null): LayerEffects | null {
  if (!effects) return null;
  return {
    dropShadow: { ...DEFAULT_DROP_SHADOW, ...(effects.dropShadow ?? {}) },
    outerGlow: { ...DEFAULT_OUTER_GLOW, ...(effects.outerGlow ?? {}) },
  };
}

export function hasActiveLayerEffects(effects?: LayerEffects | null): boolean {
  return Boolean(effects && (effects.dropShadow?.enabled || effects.outerGlow?.enabled));
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
  layer: Exclude<Layer, GroupLayer>
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

  fctx.drawImage(contentCanvas, 0, 0);

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100));
  ctx.globalCompositeOperation = mapBlendMode(layer.blendMode);
  ctx.drawImage(fxCanvas, 0, 0);
  ctx.restore();
}

export function renderLayerNodeToContext(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  allLayers: Layer[],
  docW: number,
  docH: number,
  visited = new Set<string>()
): void {
  if (!layer.visible || layer.opacity <= 0) return;
  if (visited.has(layer.id)) return;
  visited.add(layer.id);

  const hasEffects = hasActiveLayerEffects(layer.effects);

  if (layer.type === 'group') {
    const children = allLayers.filter((l) => l.parentId === layer.id);
    if (children.length === 0) return;
    const groupBuf = createCanvas(docW, docH);
    const gctx = groupBuf.getContext('2d');
    if (!gctx) return;

    for (const child of children) {
      renderLayerNodeToContext(gctx, child, allLayers, docW, docH, visited);
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
  adjustments?: Adjustments
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
    renderLayerNodeToContext(ctx, layer, layers, width, height, visited);
  }

  if (adjustments && !isDefaultAdjustments(adjustments)) {
    const imgData = ctx.getImageData(0, 0, width, height);
    applyAdjustmentsToBuffer(imgData.data, width, height, adjustments, imgData.data);
    ctx.putImageData(imgData, 0, 0);
  }

  return out;
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

    if (layer.type === 'group') {
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

    if (layer.type === 'group') {
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

    if (layer.type === 'group') {
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

    if (layer.type === 'group') {
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
    if (layer.type === 'group' || layer.locked) continue;
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
