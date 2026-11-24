import { encodeBMP } from '../engine/bmpEncoder';
import { cloneAdjustments, cloneDefaultAdjustments } from '../engine/adjustments';
import {
  cloneLayerEffects,
  compositeLayersToCanvas,
  createCanvas,
  generateThumbnailDataUrl,
} from '../engine/canvasOps';
import {
  constrainCanvasDimensions,
  isSafeRasterDataUrl,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  parseSerializedProject,
  sanitizeSvgMarkup,
} from './projectValidation';
import { parseExifFromBuffer } from './exifParser';
import type {
  DocumentState,
  ExportFitMode,
  ExportFormat,
  ImageExifMetadata,
  Layer,
  RasterLayer,
  SerializedLayer,
  SerializedProject,
} from '../types/editor';

export {
  constrainCanvasDimensions,
  isSafeRasterDataUrl,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  parseSerializedProject,
  sanitizeSvgMarkup,
};

export interface LocalCapabilities {
  fileSystemAccess: boolean;
  indexedDb: boolean;
  opfs: boolean;
  webWorker: boolean;
  offscreenCanvas: boolean;
}

export function detectLocalCapabilities(): LocalCapabilities {
  const isTopFrame = (() => {
    try {
      return window.self === window.top;
    } catch {
      return false;
    }
  })();

  const hasFSA =
    typeof window !== 'undefined' &&
    'showOpenFilePicker' in window &&
    'showSaveFilePicker' in window &&
    isTopFrame;

  return {
    fileSystemAccess: hasFSA,
    indexedDb: typeof indexedDB !== 'undefined',
    opfs:
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      typeof navigator.storage?.getDirectory === 'function',
    webWorker: typeof Worker !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
  };
}

export interface DecodedImageResult {
  name: string;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  sourceFormat: string;
  fileSizeBytes: number;
  scaledDown: boolean;
  exif?: ImageExifMetadata | null;
}

export async function decodeImageFile(file: File): Promise<DecodedImageResult> {
  const ext = file.name.split('.').pop()?.toUpperCase() || 'IMAGE';

  // Handle SVG rasterization cleanly after sanitizing executable tags, handlers, and remote URLs
  if (file.type === 'image/svg+xml' || ext === 'SVG') {
    const rawSvgText = await file.text();
    const safeSvgText = sanitizeSvgMarkup(rawSvgText);
    const blob = new Blob([safeSvgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadHtmlImage(url);
      const rawW = img.naturalWidth || 1200;
      const rawH = img.naturalHeight || 900;
      const { width, height, scaledDown } = constrainCanvasDimensions(rawW, rawH);
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      return {
        name: stripExtension(file.name),
        width,
        height,
        canvas,
        sourceFormat: 'SVG',
        fileSizeBytes: file.size,
        scaledDown,
        exif: null,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  let exif: ImageExifMetadata | null = null;
  try {
    const headerBuf = await file.arrayBuffer();
    exif = parseExifFromBuffer(headerBuf);
  } catch {
    exif = null;
  }

  // Prefer createImageBitmap where supported, fallback to HTMLImageElement
  let bitmap: ImageBitmap | null = null;
  let imgEl: HTMLImageElement | null = null;
  let url: string | null = null;

  try {
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(file);
      } catch {
        bitmap = null;
      }
    }

    if (bitmap) {
      const { width, height, scaledDown } = constrainCanvasDimensions(bitmap.width, bitmap.height);
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      return {
        name: stripExtension(file.name),
        width,
        height,
        canvas,
        sourceFormat: ext,
        fileSizeBytes: file.size,
        scaledDown,
        exif,
      };
    }

    url = URL.createObjectURL(file);
    imgEl = await loadHtmlImage(url);
    const { width, height, scaledDown } = constrainCanvasDimensions(
      imgEl.naturalWidth,
      imgEl.naturalHeight
    );
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgEl, 0, 0, width, height);
    return {
      name: stripExtension(file.name),
      width,
      height,
      canvas,
      sourceFormat: ext,
      fileSizeBytes: file.size,
      scaledDown,
      exif,
    };
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unsupported or corrupted image file.'));
    img.src = src;
  });
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') || 'Untitled';
}

export async function pickLocalFiles(accept: string, multiple = false): Promise<File[]> {
  // Always provide a reliable input-element picker fallback if File System Access API is blocked/unavailable
  const caps = detectLocalCapabilities();
  if (caps.fileSystemAccess && typeof (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function') {
    try {
      const picker = (
        window as unknown as {
          showOpenFilePicker: (opts: unknown) => Promise<Array<{ getFile: () => Promise<File> }>>;
        }
      ).showOpenFilePicker;

      const isProject = accept.includes('.lps');
      const handles = await picker({
        multiple,
        types: isProject
          ? [
              {
                description: 'GStudio Project',
                accept: { 'application/json': ['.lps'] },
              },
            ]
          : [
              {
                description: 'Supported Images',
                accept: {
                  'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.bmp', '.gif', '.svg'],
                },
              },
            ],
      });
      return Promise.all(handles.map((h) => h.getFile()));
    } catch (err) {
      // User cancelled picker
      if (err instanceof DOMException && err.name === 'AbortError') {
        return [];
      }
      // SecurityError in iframe -> fall through to <input type="file">
    }
  }

  return new Promise<File[]>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
      input.remove();
    };

    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : [];
      cleanup();
      resolve(files);
    };
    input.oncancel = () => {
      cleanup();
      resolve([]);
    };
    input.click();
  });
}

export async function saveBlobLocally(
  blob: Blob,
  suggestedName: string,
  description: string,
  mime: string,
  ext: string
): Promise<boolean> {
  const caps = detectLocalCapabilities();
  if (caps.fileSystemAccess && typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function') {
    try {
      const savePicker = (
        window as unknown as {
          showSaveFilePicker: (opts: unknown) => Promise<{
            createWritable: () => Promise<{
              write: (b: Blob) => Promise<void>;
              close: () => Promise<void>;
            }>;
          }>;
        }
      ).showSaveFilePicker;

      const handle = await savePicker({
        suggestedName,
        types: [
          {
            description,
            accept: { [mime]: [ext] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return false;
      }
      // Fall back to anchor download if SecurityError in iframe
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
  return true;
}

export interface ExportOptions {
  format: ExportFormat;
  quality: number; // 1..100
  width: number;
  height: number;
  fitMode?: ExportFitMode;
  preserveTransparency: boolean;
  matteColor: string;
}

export async function encodeDocumentForExport(
  doc: DocumentState,
  options: ExportOptions
): Promise<{ blob: Blob; previewUrl: string }> {
  const { width: targetWidth, height: targetHeight } = constrainCanvasDimensions(
    options.width,
    options.height
  );

  const bgForComposite =
    options.preserveTransparency && (options.format === 'png' || options.format === 'webp' || options.format === 'bmp')
      ? doc.backgroundColor
      : doc.backgroundColor === 'transparent'
        ? options.matteColor
        : doc.backgroundColor;

  const fullCanvas = compositeLayersToCanvas(
    doc.width,
    doc.height,
    bgForComposite,
    doc.layers,
    doc.adjustments
  );

  let targetCanvas = fullCanvas;
  if (targetWidth !== doc.width || targetHeight !== doc.height) {
    targetCanvas = createCanvas(targetWidth, targetHeight);
    const tctx = targetCanvas.getContext('2d')!;
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    if (!options.preserveTransparency || options.format === 'jpeg') {
      tctx.fillStyle = options.matteColor;
      tctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    const fitMode: ExportFitMode = options.fitMode ?? 'stretch';
    if (fitMode === 'contain') {
      const s = Math.min(targetWidth / doc.width, targetHeight / doc.height);
      const dw = doc.width * s;
      const dh = doc.height * s;
      const dx = (targetWidth - dw) / 2;
      const dy = (targetHeight - dh) / 2;
      tctx.drawImage(fullCanvas, dx, dy, dw, dh);
    } else if (fitMode === 'cover') {
      const s = Math.max(targetWidth / doc.width, targetHeight / doc.height);
      const dw = doc.width * s;
      const dh = doc.height * s;
      const dx = (targetWidth - dw) / 2;
      const dy = (targetHeight - dh) / 2;
      tctx.drawImage(fullCanvas, dx, dy, dw, dh);
    } else {
      tctx.drawImage(fullCanvas, 0, 0, targetWidth, targetHeight);
    }
  } else if (!options.preserveTransparency || options.format === 'jpeg') {
    const opaque = createCanvas(targetWidth, targetHeight);
    const octx = opaque.getContext('2d')!;
    octx.fillStyle = options.matteColor;
    octx.fillRect(0, 0, targetWidth, targetHeight);
    octx.drawImage(fullCanvas, 0, 0);
    targetCanvas = opaque;
  }

  if (options.format === 'bmp') {
    const ctx = targetCanvas.getContext('2d')!;
    const imgData = ctx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
    const bytes = encodeBMP(imgData, options.preserveTransparency);
    const copyBytes = new Uint8Array(bytes.byteLength);
    copyBytes.set(bytes);
    const blob = new Blob([copyBytes.buffer], { type: 'image/bmp' });
    const previewUrl = targetCanvas.toDataURL('image/png');
    return { blob, previewUrl };
  }

  const mimeMap: Record<'png' | 'jpeg' | 'webp', string> = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  };
  const mime = mimeMap[options.format];
  const q = Math.max(0.05, Math.min(1, options.quality / 100));

  const blob = await new Promise<Blob>((resolve, reject) => {
    targetCanvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to encode image locally.'));
      },
      mime,
      options.format === 'png' ? undefined : q
    );
  });

  const previewUrl = URL.createObjectURL(blob);
  return { blob, previewUrl };
}

export function serializeDocument(doc: DocumentState): SerializedProject {
  const layers: SerializedLayer[] = doc.layers.map((layer) => {
    const base: SerializedLayer = {
      id: layer.id,
      name: layer.name,
      type: layer.type,
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      rotation: layer.rotation,
      scaleX: layer.scaleX,
      scaleY: layer.scaleY,
      flipX: layer.flipX ?? false,
      flipY: layer.flipY ?? false,
      effects: cloneLayerEffects(layer.effects),
      parentId: layer.parentId ?? null,
    };
    if (layer.mask) {
      base.maskDataUrl = layer.mask.canvas.toDataURL('image/png');
      base.maskEnabled = layer.mask.enabled;
      base.maskInverted = layer.mask.inverted;
    }
    if (layer.type === 'raster') {
      base.rasterDataUrl = layer.canvas.toDataURL('image/png');
    } else if (layer.type === 'text') {
      base.textData = {
        text: layer.text,
        fontFamily: layer.fontFamily,
        fontSize: layer.fontSize,
        fontWeight: layer.fontWeight,
        fontStyle: layer.fontStyle,
        color: layer.color,
        align: layer.align,
        lineHeight: layer.lineHeight,
      };
    } else if (layer.type === 'group') {
      base.groupExpanded = layer.expanded;
    } else if (layer.type === 'adjustment') {
      base.adjustmentData = cloneAdjustments(layer.adjustments);
    } else {
      base.shapeData = {
        shapeKind: layer.shapeKind,
        fill: layer.fill,
        fillEnabled: layer.fillEnabled,
        stroke: layer.stroke,
        strokeEnabled: layer.strokeEnabled,
        strokeWidth: layer.strokeWidth,
        cornerRadius: layer.cornerRadius,
        ...(layer.sides !== undefined ? { sides: layer.sides } : {}),
      };
    }
    return base;
  });

  return {
    formatVersion: 1,
    id: doc.id,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    backgroundColor: doc.backgroundColor,
    activeLayerId: doc.activeLayerId,
    adjustments: { ...doc.adjustments },
    layers,
    createdAt: doc.createdAt,
    updatedAt: Date.now(),
    sourceFormat: doc.sourceFormat,
    thumbnailDataUrl: generateThumbnailDataUrl(doc),
    ...(doc.exif ? { exif: doc.exif } : {}),
  };
}

export async function deserializeProject(
  rawInput: SerializedProject | unknown
): Promise<
  Omit<
    DocumentState,
    'history' | 'historyIndex' | 'zoom' | 'panX' | 'panY' | 'selection' | 'dirty'
  >
> {
  const data = parseSerializedProject(rawInput);

  const layers: Layer[] = await Promise.all(
    data.layers.map(async (sl): Promise<Layer> => {
      let mask = null;
      if (sl.maskDataUrl) {
        if (!isSafeRasterDataUrl(sl.maskDataUrl)) {
          throw new Error('Project contains an unsafe layer mask image.');
        }
        const mCanvas = createCanvas(data.width, data.height);
        const mImg = await loadHtmlImage(sl.maskDataUrl);
        mCanvas.getContext('2d')?.drawImage(mImg, 0, 0, data.width, data.height);
        mask = {
          canvas: mCanvas,
          enabled: sl.maskEnabled ?? true,
          inverted: sl.maskInverted ?? false,
        };
      }

      const restoredEffects = cloneLayerEffects(sl.effects);
      const flipX = sl.flipX ?? false;
      const flipY = sl.flipY ?? false;

      if (sl.type === 'raster') {
        const canvas = createCanvas(sl.width, sl.height);
        if (sl.rasterDataUrl) {
          if (!isSafeRasterDataUrl(sl.rasterDataUrl)) {
            throw new Error('Project contains an unsafe raster image.');
          }
          const img = await loadHtmlImage(sl.rasterDataUrl);
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, sl.width, sl.height);
        }
        return {
          id: sl.id,
          name: sl.name,
          type: 'raster',
          visible: sl.visible,
          locked: sl.locked,
          opacity: sl.opacity,
          blendMode: sl.blendMode,
          x: sl.x,
          y: sl.y,
          width: sl.width,
          height: sl.height,
          rotation: sl.rotation,
          scaleX: sl.scaleX,
          scaleY: sl.scaleY,
          flipX,
          flipY,
          effects: restoredEffects,
          parentId: sl.parentId ?? null,
          mask,
          canvas,
        } as RasterLayer;
      }

      if (sl.type === 'text' && sl.textData) {
        return {
          id: sl.id,
          name: sl.name,
          type: 'text',
          visible: sl.visible,
          locked: sl.locked,
          opacity: sl.opacity,
          blendMode: sl.blendMode,
          x: sl.x,
          y: sl.y,
          width: sl.width,
          height: sl.height,
          rotation: sl.rotation,
          scaleX: sl.scaleX,
          scaleY: sl.scaleY,
          flipX,
          flipY,
          effects: restoredEffects,
          parentId: sl.parentId ?? null,
          mask,
          text: sl.textData.text,
          fontFamily: sl.textData.fontFamily,
          fontSize: sl.textData.fontSize,
          fontWeight: sl.textData.fontWeight,
          fontStyle: sl.textData.fontStyle,
          color: sl.textData.color,
          align: sl.textData.align,
          lineHeight: sl.textData.lineHeight,
        };
      }

      if (sl.type === 'adjustment') {
        return {
          id: sl.id,
          name: sl.name,
          type: 'adjustment',
          visible: sl.visible,
          locked: sl.locked,
          opacity: sl.opacity,
          blendMode: sl.blendMode,
          x: 0,
          y: 0,
          width: data.width,
          height: data.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          flipX: false,
          flipY: false,
          effects: null,
          parentId: sl.parentId ?? null,
          mask,
          adjustments: cloneAdjustments(sl.adjustmentData ?? cloneDefaultAdjustments()),
        };
      }

      if (sl.type === 'group') {
        return {
          id: sl.id,
          name: sl.name,
          type: 'group',
          visible: sl.visible,
          locked: sl.locked,
          opacity: sl.opacity,
          blendMode: sl.blendMode,
          x: sl.x,
          y: sl.y,
          width: sl.width,
          height: sl.height,
          rotation: sl.rotation,
          scaleX: sl.scaleX,
          scaleY: sl.scaleY,
          flipX,
          flipY,
          effects: restoredEffects,
          parentId: sl.parentId ?? null,
          mask,
          expanded: sl.groupExpanded ?? true,
        };
      }

      const sd = sl.shapeData;
      return {
        id: sl.id,
        name: sl.name,
        type: 'shape',
        visible: sl.visible,
        locked: sl.locked,
        opacity: sl.opacity,
        blendMode: sl.blendMode,
        x: sl.x,
        y: sl.y,
        width: sl.width,
        height: sl.height,
        rotation: sl.rotation,
        scaleX: sl.scaleX,
        scaleY: sl.scaleY,
        flipX,
        flipY,
        effects: restoredEffects,
        parentId: sl.parentId ?? null,
        mask,
        shapeKind: sd?.shapeKind ?? 'rect',
        fill: sd?.fill ?? '#0A84FF',
        fillEnabled: sd?.fillEnabled ?? true,
        stroke: sd?.stroke ?? '#FFFFFF',
        strokeEnabled: sd?.strokeEnabled ?? false,
        strokeWidth: sd?.strokeWidth ?? 2,
        cornerRadius: sd?.cornerRadius ?? 12,
        ...(sd?.sides !== undefined ? { sides: sd.sides } : {}),
      };
    })
  );

  return {
    id: data.id,
    name: data.name,
    width: data.width,
    height: data.height,
    backgroundColor: data.backgroundColor,
    activeLayerId: data.activeLayerId,
    editingTarget: 'layer',
    adjustments: cloneAdjustments(data.adjustments),
    layers,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    sourceFormat: data.sourceFormat || 'LPS',
    exif: data.exif ?? null,
  };
}
