import { sanitizeAdjustments } from '../engine/presets';
import {
  DEFAULT_COLOR_OVERLAY,
  DEFAULT_DROP_SHADOW,
  DEFAULT_INNER_GLOW,
  DEFAULT_INNER_SHADOW,
  DEFAULT_OUTER_GLOW,
  DEFAULT_STROKE,
} from '../engine/canvasOps';
import type {
  BlendMode,
  ImageExifMetadata,
  LayerEffects,
  LayerType,
  SerializedLayer,
  SerializedProject,
  ShapeKind,
  ShapeLayer,
  TextLayer,
} from '../types/editor';

export const MAX_IMAGE_DIMENSION = 8192;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_PROJECT_LAYERS = 256;

const MAX_DATA_URL_LENGTH = 64 * 1024 * 1024;
const MAX_LAYER_NAME_LENGTH = 120;
const MAX_TEXT_LENGTH = 20_000;

const ALLOWED_BLEND_MODES = new Set<BlendMode>([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'soft-light',
  'hard-light',
  'difference',
  'exclusion',
]);

const ALLOWED_LAYER_TYPES = new Set<LayerType>([
  'raster',
  'text',
  'shape',
  'group',
  'adjustment',
]);

const ALLOWED_SHAPE_KINDS = new Set<ShapeKind>([
  'rect',
  'rounded-rect',
  'ellipse',
  'line',
  'polygon',
  'star',
  'arrow',
]);

const ALLOWED_FONT_WEIGHTS = new Set<TextLayer['fontWeight']>(['400', '500', '600', '700']);
const ALLOWED_FONT_STYLES = new Set<TextLayer['fontStyle']>(['normal', 'italic']);
const ALLOWED_TEXT_ALIGNS = new Set<TextLayer['align']>(['left', 'center', 'right']);

const FORBIDDEN_IDS = new Set(['__proto__', 'constructor', 'prototype']);

const SAFE_RASTER_DATA_PREFIXES = [
  'data:image/png;base64,',
  'data:image/jpeg;base64,',
  'data:image/jpg;base64,',
  'data:image/webp;base64,',
  'data:image/gif;base64,',
  'data:image/bmp;base64,',
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function isBase64Body(body: string): boolean {
  if (body.length === 0) return false;
  for (let i = 0; i < body.length; i++) {
    const code = body.charCodeAt(i);
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    const isPlusSlash = code === 43 || code === 47;
    const isEq = code === 61 && i >= body.length - 2;
    if (!isUpper && !isLower && !isDigit && !isPlusSlash && !isEq) {
      return false;
    }
  }
  return true;
}

/**
 * Strictly allow only local base64-encoded raster image data URLs (PNG, JPEG,
 * WebP, GIF, BMP). Rejects network URLs (http/https), blob URLs, javascript:,
 * and data:image/svg+xml payloads.
 */
export function isSafeRasterDataUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_DATA_URL_LENGTH) return false;
  const lower = value.slice(0, 32).toLowerCase();
  const prefix = SAFE_RASTER_DATA_PREFIXES.find((p) => lower.startsWith(p));
  if (!prefix) return false;
  const payload = value.slice(prefix.length);
  return isBase64Body(payload);
}

/** Clamp width/height within safe editor dimension & pixel-budget ceilings. */
export function constrainCanvasDimensions(
  w: number,
  h: number
): { width: number; height: number; scaledDown: boolean } {
  let width = Number.isFinite(w) ? Math.max(1, Math.round(w)) : 1;
  let height = Number.isFinite(h) ? Math.max(1, Math.round(h)) : 1;
  let scaledDown = false;

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
    scaledDown = true;
  }

  if (width * height > MAX_IMAGE_PIXELS) {
    const scale = Math.sqrt(MAX_IMAGE_PIXELS / (width * height));
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
    if (width * height > MAX_IMAGE_PIXELS && height > 1) {
      height = Math.max(1, Math.floor(MAX_IMAGE_PIXELS / width));
    }
    scaledDown = true;
  }

  return { width, height, scaledDown };
}

function sanitizeSafeId(value: unknown, fallbackPrefix: string, index: number): string {
  if (typeof value === 'string') {
    const trimmed = value.trim().slice(0, 80);
    if (
      trimmed.length > 0 &&
      !FORBIDDEN_IDS.has(trimmed) &&
      /^[A-Za-z0-9_.:-]+$/.test(trimmed)
    ) {
      return trimmed;
    }
  }
  return `${fallbackPrefix}_${index}`;
}

function sanitizeColor(value: unknown, fallback: string, allowTransparent = false): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (allowTransparent && trimmed.toLowerCase() === 'transparent') {
    return 'transparent';
  }
  if (/^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

function sanitizeBlendMode(value: unknown, fallback: BlendMode = 'normal'): BlendMode {
  return typeof value === 'string' && ALLOWED_BLEND_MODES.has(value as BlendMode)
    ? (value as BlendMode)
    : fallback;
}

function sanitizeFontFamily(value: unknown): string {
  if (typeof value !== 'string') {
    return '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
  }
  const trimmed = value.trim().slice(0, 160);
  // Reject CSS injection delimiters (`;`, `{`, `}`, `url(`, `\`)
  if (
    trimmed.length === 0 ||
    /[;{}\\<>]/.test(trimmed) ||
    /url\s*\(/i.test(trimmed) ||
    /expression\s*\(/i.test(trimmed)
  ) {
    return '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
  }
  return trimmed;
}

export function sanitizeLayerEffects(value: unknown): LayerEffects | null {
  const src = asRecord(value);
  if (!src) return null;

  const ds = asRecord(src.dropShadow) ?? {};
  const og = asRecord(src.outerGlow) ?? {};
  const st = asRecord(src.stroke) ?? {};
  const co = asRecord(src.colorOverlay) ?? {};
  const is = asRecord(src.innerShadow) ?? {};
  const ig = asRecord(src.innerGlow) ?? {};

  return {
    dropShadow: {
      enabled: typeof ds.enabled === 'boolean' ? ds.enabled : DEFAULT_DROP_SHADOW.enabled,
      color: sanitizeColor(ds.color, DEFAULT_DROP_SHADOW.color),
      opacity: clampFinite(ds.opacity, 0, 100, DEFAULT_DROP_SHADOW.opacity),
      blur: clampFinite(ds.blur, 0, 64, DEFAULT_DROP_SHADOW.blur),
      distance: clampFinite(ds.distance, 0, 80, DEFAULT_DROP_SHADOW.distance),
      angle: clampFinite(ds.angle, -180, 180, DEFAULT_DROP_SHADOW.angle),
    },
    outerGlow: {
      enabled: typeof og.enabled === 'boolean' ? og.enabled : DEFAULT_OUTER_GLOW.enabled,
      color: sanitizeColor(og.color, DEFAULT_OUTER_GLOW.color),
      opacity: clampFinite(og.opacity, 0, 100, DEFAULT_OUTER_GLOW.opacity),
      blur: clampFinite(og.blur, 0, 64, DEFAULT_OUTER_GLOW.blur),
      spread: clampFinite(og.spread, 0, 24, DEFAULT_OUTER_GLOW.spread),
    },
    stroke: {
      enabled: typeof st.enabled === 'boolean' ? st.enabled : DEFAULT_STROKE.enabled,
      color: sanitizeColor(st.color, DEFAULT_STROKE.color),
      opacity: clampFinite(st.opacity, 0, 100, DEFAULT_STROKE.opacity),
      width: clampFinite(st.width, 1, 40, DEFAULT_STROKE.width),
      position: st.position === 'inside' ? 'inside' : 'outside',
    },
    colorOverlay: {
      enabled: typeof co.enabled === 'boolean' ? co.enabled : DEFAULT_COLOR_OVERLAY.enabled,
      color: sanitizeColor(co.color, DEFAULT_COLOR_OVERLAY.color),
      opacity: clampFinite(co.opacity, 0, 100, DEFAULT_COLOR_OVERLAY.opacity),
      blendMode: sanitizeBlendMode(co.blendMode, DEFAULT_COLOR_OVERLAY.blendMode),
    },
    innerShadow: {
      enabled: typeof is.enabled === 'boolean' ? is.enabled : DEFAULT_INNER_SHADOW.enabled,
      color: sanitizeColor(is.color, DEFAULT_INNER_SHADOW.color),
      opacity: clampFinite(is.opacity, 0, 100, DEFAULT_INNER_SHADOW.opacity),
      blur: clampFinite(is.blur, 0, 64, DEFAULT_INNER_SHADOW.blur),
      distance: clampFinite(is.distance, 0, 80, DEFAULT_INNER_SHADOW.distance),
      angle: clampFinite(is.angle, -180, 180, DEFAULT_INNER_SHADOW.angle),
    },
    innerGlow: {
      enabled: typeof ig.enabled === 'boolean' ? ig.enabled : DEFAULT_INNER_GLOW.enabled,
      color: sanitizeColor(ig.color, DEFAULT_INNER_GLOW.color),
      opacity: clampFinite(ig.opacity, 0, 100, DEFAULT_INNER_GLOW.opacity),
      blur: clampFinite(ig.blur, 0, 64, DEFAULT_INNER_GLOW.blur),
      spread: clampFinite(ig.spread, 0, 24, DEFAULT_INNER_GLOW.spread),
    },
  };
}

function sanitizeTextData(value: unknown): Omit<
  TextLayer,
  | 'id'
  | 'name'
  | 'type'
  | 'visible'
  | 'locked'
  | 'opacity'
  | 'blendMode'
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'rotation'
  | 'scaleX'
  | 'scaleY'
  | 'flipX'
  | 'flipY'
  | 'effects'
  | 'parentId'
  | 'mask'
> {
  const src = asRecord(value) ?? {};
  const weight =
    typeof src.fontWeight === 'string' &&
    ALLOWED_FONT_WEIGHTS.has(src.fontWeight as TextLayer['fontWeight'])
      ? (src.fontWeight as TextLayer['fontWeight'])
      : '600';
  const style =
    typeof src.fontStyle === 'string' &&
    ALLOWED_FONT_STYLES.has(src.fontStyle as TextLayer['fontStyle'])
      ? (src.fontStyle as TextLayer['fontStyle'])
      : 'normal';
  const align =
    typeof src.align === 'string' &&
    ALLOWED_TEXT_ALIGNS.has(src.align as TextLayer['align'])
      ? (src.align as TextLayer['align'])
      : 'left';

  return {
    text: typeof src.text === 'string' ? src.text.slice(0, MAX_TEXT_LENGTH) : 'Text',
    fontFamily: sanitizeFontFamily(src.fontFamily),
    fontSize: clampFinite(src.fontSize, 8, 400, 48),
    fontWeight: weight,
    fontStyle: style,
    color: sanitizeColor(src.color, '#FFFFFF'),
    align,
    lineHeight: clampFinite(src.lineHeight, 0.8, 3, 1.25),
  };
}

function sanitizeShapeData(value: unknown): Omit<
  ShapeLayer,
  | 'id'
  | 'name'
  | 'type'
  | 'visible'
  | 'locked'
  | 'opacity'
  | 'blendMode'
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'rotation'
  | 'scaleX'
  | 'scaleY'
  | 'flipX'
  | 'flipY'
  | 'effects'
  | 'parentId'
  | 'mask'
> {
  const src = asRecord(value) ?? {};
  const shapeKind =
    typeof src.shapeKind === 'string' && ALLOWED_SHAPE_KINDS.has(src.shapeKind as ShapeKind)
      ? (src.shapeKind as ShapeKind)
      : 'rect';

  const result: Omit<
    ShapeLayer,
    | 'id'
    | 'name'
    | 'type'
    | 'visible'
    | 'locked'
    | 'opacity'
    | 'blendMode'
    | 'x'
    | 'y'
    | 'width'
    | 'height'
    | 'rotation'
    | 'scaleX'
    | 'scaleY'
    | 'flipX'
    | 'flipY'
    | 'effects'
    | 'parentId'
    | 'mask'
  > = {
    shapeKind,
    fill: sanitizeColor(src.fill, '#0A84FF'),
    fillEnabled: typeof src.fillEnabled === 'boolean' ? src.fillEnabled : true,
    stroke: sanitizeColor(src.stroke, '#FFFFFF'),
    strokeEnabled: typeof src.strokeEnabled === 'boolean' ? src.strokeEnabled : false,
    strokeWidth: clampFinite(src.strokeWidth, 1, 64, 2),
    cornerRadius: clampFinite(src.cornerRadius, 0, 512, 12),
  };

  if (shapeKind === 'polygon' || shapeKind === 'star') {
    result.sides = Math.round(clampFinite(src.sides, 3, 16, 5));
  }

  return result;
}

/**
 * Validate and normalize an untrusted `.lps` or stored project payload.
 * Rejects malformed schemas, unsafe image/mask URLs, oversized canvas
 * allocations, and unallowed layer/style fields.
 */
export function parseSerializedProject(raw: unknown): SerializedProject {
  const root = asRecord(raw);
  if (!root || root.formatVersion !== 1 || !Array.isArray(root.layers)) {
    throw new Error('Invalid .lps project file.');
  }
  if (root.layers.length > MAX_PROJECT_LAYERS) {
    throw new Error(`Project exceeds maximum supported layer count (${MAX_PROJECT_LAYERS}).`);
  }

  const rawWidth = typeof root.width === 'number' && Number.isFinite(root.width) ? root.width : 1024;
  const rawHeight = typeof root.height === 'number' && Number.isFinite(root.height) ? root.height : 1024;
  if (rawWidth <= 0 || rawHeight <= 0) {
    throw new Error('Invalid .lps project dimensions.');
  }
  const { width: docWidth, height: docHeight } = constrainCanvasDimensions(rawWidth, rawHeight);

  const usedLayerIds = new Set<string>();
  const layers: SerializedLayer[] = [];

  for (let i = 0; i < root.layers.length; i++) {
    const sl = asRecord(root.layers[i]);
    if (!sl) {
      throw new Error('Invalid layer entry in .lps project.');
    }

    const type: LayerType =
      typeof sl.type === 'string' && ALLOWED_LAYER_TYPES.has(sl.type as LayerType)
        ? (sl.type as LayerType)
        : 'raster';

    let layerId = sanitizeSafeId(sl.id, 'layer', i);
    while (usedLayerIds.has(layerId)) {
      layerId = `${layerId}_${i}`;
    }
    usedLayerIds.add(layerId);

    const rawLw =
      typeof sl.width === 'number' && Number.isFinite(sl.width) && sl.width > 0
        ? sl.width
        : docWidth;
    const rawLh =
      typeof sl.height === 'number' && Number.isFinite(sl.height) && sl.height > 0
        ? sl.height
        : docHeight;
    const { width: layerWidth, height: layerHeight } = constrainCanvasDimensions(rawLw, rawLh);

    let maskDataUrl: string | undefined;
    if (sl.maskDataUrl !== undefined && sl.maskDataUrl !== null && sl.maskDataUrl !== '') {
      if (!isSafeRasterDataUrl(sl.maskDataUrl)) {
        throw new Error('Project contains an unsafe or unsupported layer mask image.');
      }
      maskDataUrl = sl.maskDataUrl;
    }

    let rasterDataUrl: string | undefined;
    if (type === 'raster' && sl.rasterDataUrl !== undefined && sl.rasterDataUrl !== null && sl.rasterDataUrl !== '') {
      if (!isSafeRasterDataUrl(sl.rasterDataUrl)) {
        throw new Error('Project contains an unsafe or unsupported raster image.');
      }
      rasterDataUrl = sl.rasterDataUrl;
    }

    const sanitizedLayer: SerializedLayer = {
      id: layerId,
      name:
        typeof sl.name === 'string' && sl.name.trim()
          ? sl.name.trim().slice(0, MAX_LAYER_NAME_LENGTH)
          : `Layer ${i + 1}`,
      type,
      visible: typeof sl.visible === 'boolean' ? sl.visible : true,
      locked: typeof sl.locked === 'boolean' ? sl.locked : false,
      opacity: clampFinite(sl.opacity, 0, 100, 100),
      blendMode: sanitizeBlendMode(sl.blendMode, 'normal'),
      x: clampFinite(sl.x, -MAX_IMAGE_DIMENSION * 4, MAX_IMAGE_DIMENSION * 4, 0),
      y: clampFinite(sl.y, -MAX_IMAGE_DIMENSION * 4, MAX_IMAGE_DIMENSION * 4, 0),
      width: type === 'adjustment' ? docWidth : layerWidth,
      height: type === 'adjustment' ? docHeight : layerHeight,
      rotation: clampFinite(sl.rotation, -3600, 3600, 0),
      scaleX: clampFinite(sl.scaleX, 0.01, 64, 1),
      scaleY: clampFinite(sl.scaleY, 0.01, 64, 1),
      flipX: typeof sl.flipX === 'boolean' ? sl.flipX : false,
      flipY: typeof sl.flipY === 'boolean' ? sl.flipY : false,
      effects: type === 'adjustment' ? null : sanitizeLayerEffects(sl.effects),
      parentId:
        typeof sl.parentId === 'string' && !FORBIDDEN_IDS.has(sl.parentId.trim())
          ? sl.parentId.trim().slice(0, 80) || null
          : null,
      ...(maskDataUrl !== undefined
        ? {
            maskDataUrl,
            maskEnabled: typeof sl.maskEnabled === 'boolean' ? sl.maskEnabled : true,
            maskInverted: typeof sl.maskInverted === 'boolean' ? sl.maskInverted : false,
          }
        : {}),
      ...(rasterDataUrl !== undefined ? { rasterDataUrl } : {}),
      ...(type === 'text' ? { textData: sanitizeTextData(sl.textData) } : {}),
      ...(type === 'shape' ? { shapeData: sanitizeShapeData(sl.shapeData) } : {}),
      ...(type === 'group'
        ? { groupExpanded: typeof sl.groupExpanded === 'boolean' ? sl.groupExpanded : true }
        : {}),
      ...(type === 'adjustment'
        ? { adjustmentData: sanitizeAdjustments(sl.adjustmentData) }
        : {}),
    };

    layers.push(sanitizedLayer);
  }

  // Ensure every parentId points to an existing group layer (prevent orphan cycles / dangling refs)
  const groupIds = new Set(layers.filter((l) => l.type === 'group').map((l) => l.id));
  for (const layer of layers) {
    if (layer.parentId && (!groupIds.has(layer.parentId) || layer.parentId === layer.id)) {
      layer.parentId = null;
    }
  }

  const rawActiveId =
    typeof root.activeLayerId === 'string' && usedLayerIds.has(root.activeLayerId)
      ? root.activeLayerId
      : null;

  const thumbnailDataUrl = isSafeRasterDataUrl(root.thumbnailDataUrl)
    ? root.thumbnailDataUrl
    : '';

  const cleanExifStr = (v: unknown): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const cleaned = v.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 160);
    return cleaned.length > 0 ? cleaned : undefined;
  };

  const sanitizeExif = (rawExif: unknown): ImageExifMetadata | null => {
    const src = asRecord(rawExif);
    if (!src) return null;
    const gpsRaw = asRecord(src.gps);
    const gps =
      gpsRaw &&
      typeof gpsRaw.latitude === 'number' &&
      Number.isFinite(gpsRaw.latitude) &&
      Math.abs(gpsRaw.latitude) <= 90 &&
      typeof gpsRaw.longitude === 'number' &&
      Number.isFinite(gpsRaw.longitude) &&
      Math.abs(gpsRaw.longitude) <= 180
        ? {
            latitude: Number(gpsRaw.latitude.toFixed(6)),
            longitude: Number(gpsRaw.longitude.toFixed(6)),
            ...(cleanExifStr(gpsRaw.altitude) ? { altitude: cleanExifStr(gpsRaw.altitude) } : {}),
          }
        : undefined;

    const out: ImageExifMetadata = {};
    const stringFields: Array<
      keyof Pick<
        ImageExifMetadata,
        | 'make'
        | 'model'
        | 'lensMake'
        | 'lensModel'
        | 'dateTimeOriginal'
        | 'focalLength'
        | 'focalLength35mm'
        | 'aperture'
        | 'shutterSpeed'
        | 'exposureBias'
        | 'exposureProgram'
        | 'meteringMode'
        | 'whiteBalance'
        | 'flash'
        | 'orientation'
        | 'colorSpace'
        | 'xResolution'
        | 'software'
        | 'artist'
        | 'copyright'
      >
    > = [
      'make',
      'model',
      'lensMake',
      'lensModel',
      'dateTimeOriginal',
      'focalLength',
      'focalLength35mm',
      'aperture',
      'shutterSpeed',
      'exposureBias',
      'exposureProgram',
      'meteringMode',
      'whiteBalance',
      'flash',
      'orientation',
      'colorSpace',
      'xResolution',
      'software',
      'artist',
      'copyright',
    ];
    for (const key of stringFields) {
      const val = cleanExifStr(src[key]);
      if (val) out[key] = val;
    }
    if (typeof src.iso === 'number' && Number.isFinite(src.iso) && src.iso > 0 && src.iso <= 10_000_000) {
      out.iso = Math.round(src.iso);
    }
    if (typeof src.exifWidth === 'number' && Number.isFinite(src.exifWidth) && src.exifWidth > 0) {
      out.exifWidth = Math.round(src.exifWidth);
    }
    if (typeof src.exifHeight === 'number' && Number.isFinite(src.exifHeight) && src.exifHeight > 0) {
      out.exifHeight = Math.round(src.exifHeight);
    }
    if (gps) out.gps = gps;

    return Object.keys(out).length > 0 ? out : null;
  };

  const exif = sanitizeExif(root.exif);

  return {
    formatVersion: 1,
    id: sanitizeSafeId(root.id, 'doc', Date.now()),
    name:
      typeof root.name === 'string' && root.name.trim()
        ? root.name.trim().slice(0, MAX_LAYER_NAME_LENGTH)
        : 'Untitled Project',
    width: docWidth,
    height: docHeight,
    backgroundColor: sanitizeColor(root.backgroundColor, 'transparent', true),
    activeLayerId: rawActiveId ?? layers[0]?.id ?? null,
    adjustments: sanitizeAdjustments(root.adjustments),
    layers,
    createdAt:
      typeof root.createdAt === 'number' && Number.isFinite(root.createdAt)
        ? root.createdAt
        : Date.now(),
    updatedAt:
      typeof root.updatedAt === 'number' && Number.isFinite(root.updatedAt)
        ? root.updatedAt
        : Date.now(),
    sourceFormat:
      typeof root.sourceFormat === 'string' && root.sourceFormat.trim()
        ? root.sourceFormat.trim().slice(0, 16)
        : 'LPS',
    thumbnailDataUrl,
    ...(exif ? { exif } : {}),
  };
}

const DISALLOWED_SVG_TAGS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'applet',
  'meta',
  'base',
]);

function isUnsafeSvgAttrUrl(value: string): boolean {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:text/') ||
    lower.startsWith('data:application/') ||
    lower.startsWith('http:') ||
    lower.startsWith('https:') ||
    lower.startsWith('//')
  ) {
    return true;
  }
  return false;
}

function sanitizeSvgStyleText(cssText: string): string {
  // Replace external http/https/javascript url(...) references in CSS properties/styles
  return cssText.replace(
    /url\s*\(\s*(['"]?)\s*(?:https?:|\/\/|javascript:|vbscript:|data:text\/)[^)]*\1\s*\)/gi,
    'none'
  );
}

/**
 * Strip executable elements, inline event handlers, foreignObject, and remote
 * network references from SVG text before creating an image Blob for local
 * canvas rasterization.
 */
export function sanitizeSvgMarkup(svgText: string): string {
  if (typeof DOMParser !== 'undefined' && typeof XMLSerializer !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const parserError = doc.getElementsByTagName('parsererror');
    if (parserError.length > 0 || !doc.documentElement || doc.documentElement.localName.toLowerCase() !== 'svg') {
      throw new Error('Invalid SVG image file.');
    }

    const walkAndClean = (el: Element) => {
      const children = Array.from(el.children);
      for (const child of children) {
        if (DISALLOWED_SVG_TAGS.has(child.localName.toLowerCase())) {
          child.remove();
          continue;
        }
        walkAndClean(child);
      }

      if (el.localName.toLowerCase() === 'style' && el.textContent) {
        el.textContent = sanitizeSvgStyleText(el.textContent);
      }

      for (const attr of Array.from(el.attributes)) {
        const attrName = attr.name.toLowerCase();
        if (attrName.startsWith('on')) {
          el.removeAttribute(attr.name);
          continue;
        }
        if (attrName === 'style') {
          el.setAttribute(attr.name, sanitizeSvgStyleText(attr.value));
          continue;
        }
        if (
          attrName === 'href' ||
          attrName === 'xlink:href' ||
          attrName === 'src' ||
          attrName.endsWith(':href')
        ) {
          // Local fragment references like `#grad1` and safe raster data URLs remain allowed
          if (!attr.value.trim().startsWith('#') && isUnsafeSvgAttrUrl(attr.value)) {
            el.removeAttribute(attr.name);
          }
        }
      }
    };

    walkAndClean(doc.documentElement);
    return new XMLSerializer().serializeToString(doc.documentElement);
  }

  // Non-DOM fallback (e.g. unit test runtime)
  let cleaned = svgText
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<(?:iframe|object|embed|applet|meta|base)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(
      /\s(?:href|xlink:href|src)\s*=\s*(?:"\s*(?:https?:|\/\/|javascript:|vbscript:|data:text\/)[^"]*"|'\s*(?:https?:|\/\/|javascript:|vbscript:|data:text\/)[^']*')/gi,
      ''
    );
  cleaned = sanitizeSvgStyleText(cleaned);
  return cleaned;
}
