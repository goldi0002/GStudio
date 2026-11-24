import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cropRatioFor } from '../engine/cropRatio';
import { isDefaultAdjustments } from '../engine/adjustments';
import {
  applyBlurSharpenDab,
  applyCloneStampDab,
  applyDodgeBurnDab,
  applyGradientToCanvas,
  applyRedEyeRemovalDab,
  applySelectionClipToContext,
  applySmudgeDab,
  applySpotHealDab,
  cloneCanvas,
  compositeLayersToCanvas,
  computeLayerResizeRect,
  computeMagicWandSelection,
  computePolygonBounds,
  computeShapePathPoints,
  computeSnapGuides,
  createCanvas,
  docPointToLayerLocal,
  floodFillCanvas,
  isPointInSelection,
  maskCanvasDiffBySelection,
  paintColorReplaceDab,
  pickTopmostLayerAtPoint,
  renderLayerNodeToContext,
  rgbaToHex,
  rotatePointAroundCenter,
  sampleAverageColorFromCanvas,
  snapRotationAngle,
  traceSelectionBoundarySegments,
} from '../engine/canvasOps';
import { processAdjustmentsAsync } from '../engine/workerClient';
import { useEditorStore } from '../store/useEditorStore';
import type {
  BrushSymmetryMode,
  CropRect,
  Layer,
  SelectionPoint,
  SnapGuide,
} from '../types/editor';

function getSymmetryPoints(
  x: number,
  y: number,
  docW: number,
  docH: number,
  mode: BrushSymmetryMode
): Array<{ x: number; y: number }> {
  if (mode === 'vertical') return [{ x, y }, { x: docW - x, y }];
  if (mode === 'horizontal') return [{ x, y }, { x, y: docH - y }];
  if (mode === 'quad') {
    return [
      { x, y },
      { x: docW - x, y },
      { x, y: docH - y },
      { x: docW - x, y: docH - y },
    ];
  }
  return [{ x, y }];
}

type DragMode =
  | { kind: 'none' }
  | { kind: 'pan'; startClientX: number; startClientY: number; startPanX: number; startPanY: number }
  | { kind: 'move-layer'; layerId: string; startDocX: number; startDocY: number; origX: number; origY: number }
  | {
      kind: 'resize-layer';
      layerId: string;
      handle: string;
      startDocX: number;
      startDocY: number;
      origX: number;
      origY: number;
      origW: number;
      origH: number;
      origRotation: number;
    }
  | {
      kind: 'rotate-layer';
      layerId: string;
      centerX: number;
      centerY: number;
      startAngle: number;
      origRotation: number;
    }
  | { kind: 'marquee'; startDocX: number; startDocY: number }
  | { kind: 'lasso-freehand'; points: SelectionPoint[] }
  | { kind: 'lasso-polygon'; points: SelectionPoint[]; cursor: SelectionPoint }
  | { kind: 'gradient'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'shape'; startDocX: number; startDocY: number; curDocX: number; curDocY: number }
  | {
      kind: 'paint';
      lastDocX: number;
      lastDocY: number;
      painted: boolean;
      prePaintCanvas: HTMLCanvasElement | null;
    }
  | {
      kind: 'clone';
      lastDocX: number;
      lastDocY: number;
      startDocX: number;
      startDocY: number;
      srcAnchorX: number;
      srcAnchorY: number;
      srcCanvas: HTMLCanvasElement;
      srcOffX: number;
      srcOffY: number;
      srcScX: number;
      srcScY: number;
      srcLayer: Layer | null;
      prePaintCanvas: HTMLCanvasElement | null;
      painted: boolean;
    }
  | {
      kind: 'heal';
      lastDocX: number;
      lastDocY: number;
      prePaintCanvas: HTMLCanvasElement | null;
      painted: boolean;
    }
  | {
      kind: 'dodge-burn';
      lastDocX: number;
      lastDocY: number;
      prePaintCanvas: HTMLCanvasElement | null;
      painted: boolean;
    }
  | {
      kind: 'smudge-blur';
      lastDocX: number;
      lastDocY: number;
      prePaintCanvas: HTMLCanvasElement | null;
      painted: boolean;
    }
  | { kind: 'crop-move'; startDocX: number; startDocY: number; origCrop: CropRect }
  | { kind: 'crop-handle'; handle: string; startDocX: number; startDocY: number; origCrop: CropRect }
  | { kind: 'split-divider' };

const RULER_SIZE = 22;

export const CanvasWorkspace: React.FC = () => {
  const {
    documents,
    activeDocumentId,
    activeTool,
    toolOptions,
    foregroundColor,
    backgroundColor,
    cropRect,
    cropStraighten,
    fitTrigger,
    cloneSource,
    viewportSettings,
    setZoom,
    setPan,
    setCropRect,
    setCloneSource,
    applyCrop,
    cancelCrop,
    setSelection,
    selectLayer,
    updateLayer,
    addTextLayer,
    addShapeLayer,
    commitCanvasMutation,
    setForegroundColor,
    setEditingTextLayerId,
    setCursorCanvasPos,
    setCursorPixelColor,
    cursorPixelColor,
    bumpLiveCanvasTick,
    setSplitPosition,
    showToast,
  } = useEditorStore();

  const doc = documents.find((d) => d.id === activeDocumentId) ?? null;

  const containerRef = useRef<HTMLDivElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const rulerTopRef = useRef<HTMLCanvasElement>(null);
  const rulerLeftRef = useRef<HTMLCanvasElement>(null);

  // Offscreen cached composites
  const beforeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const afterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // "Before" for the compare views: like beforeCanvasRef but also without adjustment layers.
  const compareCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const adjustVersionRef = useRef(0);
  const cloneAlignedOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  const lastHistogramBumpRef = useRef(0);
  const pixelSampleCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [spacePressed, setSpacePressed] = useState(false);
  const [cursorScreen, setCursorScreen] = useState<{ x: number; y: number } | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const dragRef = useRef<DragMode>({ kind: 'none' });
  // Active touch pointers (for pinch zoom) and the latest pen pressure (0-1) for brush size.
  const touchPointsRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const pressureRef = useRef(1);
  const [shapePreview, setShapePreview] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [lassoPreview, setLassoPreview] = useState<{
    points: SelectionPoint[];
    cursor: SelectionPoint | null;
    isPolygonMode: boolean;
  } | null>(null);
  const [gradientPreview, setGradientPreview] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const [activeGuides, setActiveGuides] = useState<SnapGuide[]>([]);
  const [liveCloneSamplePos, setLiveCloneSamplePos] = useState<{ x: number; y: number } | null>(null);
  const [liveRotateDeg, setLiveRotateDeg] = useState<number | null>(null);
  const [liveResizeDims, setLiveResizeDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    cloneAlignedOffsetRef.current = null;
  }, [cloneSource]);

  const maskBoundarySegments = useMemo(() => {
    if (
      doc?.selection?.kind === 'mask' &&
      doc.selection.maskData &&
      doc.selection.maskWidth &&
      doc.selection.maskHeight
    ) {
      return traceSelectionBoundarySegments(
        doc.selection.maskData,
        doc.selection.maskWidth,
        doc.selection.maskHeight
      );
    }
    return null;
  }, [doc?.selection]);

  // Clear in-progress polygon lasso when switching tools or lasso mode
  useEffect(() => {
    if (activeTool !== 'lasso' || toolOptions.lassoMode !== 'polygon') {
      if (dragRef.current.kind === 'lasso-polygon') {
        dragRef.current = { kind: 'none' };
        setLassoPreview(null);
      }
    }
  }, [activeTool, toolOptions.lassoMode]);

  // Observe container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: Math.max(100, entry.contentRect.width),
          height: Math.max(100, entry.contentRect.height),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Spacebar temporary hand pan & Crop / Polygonal Lasso Enter/Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setSpacePressed(true);
      }
      if (e.key === 'Enter' && activeTool === 'crop' && cropRect) {
        e.preventDefault();
        applyCrop();
      }
      if (e.key === 'Escape' && activeTool === 'crop') {
        e.preventDefault();
        cancelCrop();
      }
      if (e.key === 'Enter' && dragRef.current.kind === 'lasso-polygon') {
        e.preventDefault();
        const pts = dragRef.current.points;
        dragRef.current = { kind: 'none' };
        setLassoPreview(null);
        if (pts.length >= 3) {
          const bounds = computePolygonBounds(pts);
          setSelection({ kind: 'polygon', ...bounds, points: pts });
        }
      }
      if (e.key === 'Escape' && dragRef.current.kind === 'lasso-polygon') {
        e.preventDefault();
        dragRef.current = { kind: 'none' };
        setLassoPreview(null);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [activeTool, cropRect, applyCrop, cancelCrop, setSelection]);

  // Fit-to-screen zoom trigger
  useEffect(() => {
    if (!doc) return;
    const pad = viewportSettings.showRulers ? RULER_SIZE + 56 : 56;
    const availW = Math.max(120, containerSize.width - pad);
    const availH = Math.max(120, containerSize.height - pad);
    const fitZoom = Math.min(1.5, Math.min(availW / doc.width, availH / doc.height));
    setZoom(Math.max(0.08, fitZoom), 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTrigger, doc?.id]);

  // Recompute base composite & worker-processed adjusted composite whenever document layers/adjustments change
  useEffect(() => {
    if (!doc) return;
    const unadjusted = compositeLayersToCanvas(
      doc.width,
      doc.height,
      doc.backgroundColor,
      doc.layers
    );
    beforeCanvasRef.current = unadjusted;
    compareCanvasRef.current =
      viewportSettings.beforeAfterMode !== 'off' && doc.layers.some((l) => l.type === 'adjustment')
        ? compositeLayersToCanvas(doc.width, doc.height, doc.backgroundColor, doc.layers, undefined, true)
        : unadjusted;

    if (isDefaultAdjustments(doc.adjustments)) {
      afterCanvasRef.current = unadjusted;
      setRenderTick((t) => t + 1);
      return;
    }

    const version = ++adjustVersionRef.current;
    const ctx = unadjusted.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, doc.width, doc.height);

    void processAdjustmentsAsync(imgData, doc.adjustments).then((processed) => {
      if (adjustVersionRef.current !== version) return;
      if (processed.width !== doc.width || processed.height !== doc.height) return;
      const outCanvas = createCanvas(doc.width, doc.height);
      const outCtx = outCanvas.getContext('2d');
      if (outCtx) {
        outCtx.putImageData(processed, 0, 0);
      }
      afterCanvasRef.current = outCanvas;
      setRenderTick((t) => t + 1);
    });
  }, [
    doc,
    doc?.layers,
    doc?.adjustments,
    doc?.width,
    doc?.height,
    doc?.backgroundColor,
    viewportSettings.beforeAfterMode,
  ]);

  // Helper: convert screen coordinates (relative to container) <-> document coordinates
  const getArtboardOrigin = useCallback(() => {
    if (!doc) return { x: 0, y: 0 };
    const rulerOffset = viewportSettings.showRulers ? RULER_SIZE : 0;
    const centerX = rulerOffset + (containerSize.width - rulerOffset) / 2 + doc.panX;
    const centerY = rulerOffset + (containerSize.height - rulerOffset) / 2 + doc.panY;
    return {
      x: centerX - (doc.width * doc.zoom) / 2,
      y: centerY - (doc.height * doc.zoom) / 2,
    };
  }, [doc, containerSize, viewportSettings.showRulers]);

  const screenToDoc = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || !doc) return { x: 0, y: 0, sx: 0, sy: 0 };
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const origin = getArtboardOrigin();
      return {
        x: (sx - origin.x) / doc.zoom,
        y: (sy - origin.y) / doc.zoom,
        sx,
        sy,
      };
    },
    [doc, getArtboardOrigin]
  );

  // Paint main display canvas
  useEffect(() => {
    const canvas = displayCanvasRef.current;
    if (!canvas || !doc) return;
    const dpr = window.devicePixelRatio || 1;
    const w = containerSize.width;
    const h = containerSize.height;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const origin = getArtboardOrigin();
    const drawW = doc.width * doc.zoom;
    const drawH = doc.height * doc.zoom;

    // Subtle artboard drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = 'rgba(0,0,0,0.01)';
    ctx.fillRect(origin.x, origin.y, drawW, drawH);
    ctx.restore();

    // Checkerboard inside artboard if transparency enabled
    if (viewportSettings.showTransparency) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(origin.x, origin.y, drawW, drawH);
      ctx.clip();
      const tile = 10;
      const isDark = document.documentElement.classList.contains('dark');
      const cA = isDark ? '#242427' : '#E5E5EA';
      const cB = isDark ? '#2D2D31' : '#F5F5F7';
      ctx.fillStyle = cA;
      ctx.fillRect(origin.x, origin.y, drawW, drawH);
      ctx.fillStyle = cB;
      const startRow = 0;
      const cols = Math.ceil(drawW / tile);
      const rows = Math.ceil(drawH / tile);
      for (let r = startRow; r < rows; r++) {
        for (let c = r % 2; c < cols; c += 2) {
          ctx.fillRect(origin.x + c * tile, origin.y + r * tile, tile, tile);
        }
      }
      ctx.restore();
    }

    // Draw composited bitmap
    const afterCanvas = afterCanvasRef.current;
    const beforeCanvas = compareCanvasRef.current ?? beforeCanvasRef.current;
    const isStraightening =
      activeTool === 'crop' && cropRect !== null && Math.abs(cropStraighten) >= 0.01;
    ctx.imageSmoothingEnabled = doc.zoom < 2.5 || isStraightening;
    ctx.imageSmoothingQuality = 'high';

    ctx.save();
    if (isStraightening && cropRect) {
      const pivotX = origin.x + (cropRect.x + cropRect.width / 2) * doc.zoom;
      const pivotY = origin.y + (cropRect.y + cropRect.height / 2) * doc.zoom;
      ctx.translate(pivotX, pivotY);
      ctx.rotate((cropStraighten * Math.PI) / 180);
      ctx.translate(-pivotX, -pivotY);
    }

    if (
      viewportSettings.beforeAfterMode === 'hold' &&
      beforeCanvas
    ) {
      ctx.drawImage(beforeCanvas, origin.x, origin.y, drawW, drawH);
    } else if (
      viewportSettings.beforeAfterMode === 'split' &&
      beforeCanvas &&
      afterCanvas
    ) {
      const splitX = origin.x + drawW * viewportSettings.splitPosition;
      // Left: Before
      ctx.save();
      ctx.beginPath();
      ctx.rect(origin.x, origin.y, splitX - origin.x, drawH);
      ctx.clip();
      ctx.drawImage(beforeCanvas, origin.x, origin.y, drawW, drawH);
      ctx.restore();

      // Right: After
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, origin.y, origin.x + drawW - splitX, drawH);
      ctx.clip();
      ctx.drawImage(afterCanvas, origin.x, origin.y, drawW, drawH);
      ctx.restore();

      // Divider line
      ctx.strokeStyle = '#0A84FF';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(splitX, origin.y);
      ctx.lineTo(splitX, origin.y + drawH);
      ctx.stroke();
    } else if (afterCanvas) {
      ctx.drawImage(afterCanvas, origin.x, origin.y, drawW, drawH);
    }
    ctx.restore();

    // Optional grid
    if (viewportSettings.showGrid) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(origin.x, origin.y, drawW, drawH);
      ctx.clip();
      const step = doc.zoom >= 6 ? 1 : doc.zoom >= 1.5 ? 25 : 100;
      ctx.strokeStyle =
        doc.zoom >= 6 ? 'rgba(128,128,140,0.22)' : 'rgba(10,132,255,0.22)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= doc.width; gx += step) {
        const px = Math.round(origin.x + gx * doc.zoom) + 0.5;
        ctx.beginPath();
        ctx.moveTo(px, origin.y);
        ctx.lineTo(px, origin.y + drawH);
        ctx.stroke();
      }
      for (let gy = 0; gy <= doc.height; gy += step) {
        const py = Math.round(origin.y + gy * doc.zoom) + 0.5;
        ctx.beginPath();
        ctx.moveTo(origin.x, py);
        ctx.lineTo(origin.x + drawW, py);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Artboard hairline border
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(origin.x + 0.5, origin.y + 0.5, drawW, drawH);

    // Active Selection Marching Ants
    if (doc.selection) {
      const s = doc.selection;
      const sx = origin.x + s.x * doc.zoom;
      const sy = origin.y + s.y * doc.zoom;
      const sw = s.width * doc.zoom;
      const sh = s.height * doc.zoom;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (s.kind === 'mask' && maskBoundarySegments) {
        for (const [x1, y1, x2, y2] of maskBoundarySegments) {
          ctx.moveTo(origin.x + x1 * doc.zoom, origin.y + y1 * doc.zoom);
          ctx.lineTo(origin.x + x2 * doc.zoom, origin.y + y2 * doc.zoom);
        }
      } else if (s.kind === 'polygon' && s.points && s.points.length >= 2) {
        ctx.moveTo(origin.x + s.points[0].x * doc.zoom, origin.y + s.points[0].y * doc.zoom);
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineTo(origin.x + s.points[i].x * doc.zoom, origin.y + s.points[i].y * doc.zoom);
        }
        ctx.closePath();
        if (s.inverted) {
          ctx.rect(origin.x, origin.y, drawW, drawH);
        }
      } else if (s.kind === 'rect') {
        ctx.rect(sx, sy, sw, sh);
        if (s.inverted) {
          ctx.rect(origin.x, origin.y, drawW, drawH);
        }
      } else {
        ctx.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
        if (s.inverted) {
          ctx.rect(origin.x, origin.y, drawW, drawH);
        }
      }
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#0A84FF';
      ctx.stroke();
      ctx.restore();
    }

    // Live Lasso Preview
    if (lassoPreview && lassoPreview.points.length > 0) {
      const pts = lassoPreview.points;
      ctx.save();
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(origin.x + pts[0].x * doc.zoom, origin.y + pts[0].y * doc.zoom);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(origin.x + pts[i].x * doc.zoom, origin.y + pts[i].y * doc.zoom);
      }
      if (lassoPreview.cursor) {
        ctx.lineTo(
          origin.x + lassoPreview.cursor.x * doc.zoom,
          origin.y + lassoPreview.cursor.y * doc.zoom
        );
      }
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#0A84FF';
      ctx.stroke();

      if (lassoPreview.isPolygonMode) {
        const ox = origin.x + pts[0].x * doc.zoom;
        const oy = origin.y + pts[0].y * doc.zoom;
        ctx.setLineDash([]);
        ctx.fillStyle = '#0A84FF';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ox, oy, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Live Gradient Vector Handle
    if (gradientPreview) {
      const gx0 = origin.x + gradientPreview.x0 * doc.zoom;
      const gy0 = origin.y + gradientPreview.y0 * doc.zoom;
      const gx1 = origin.x + gradientPreview.x1 * doc.zoom;
      const gy1 = origin.y + gradientPreview.y1 * doc.zoom;
      ctx.save();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gx0, gy0);
      ctx.lineTo(gx1, gy1);
      ctx.stroke();
      ctx.strokeStyle = '#0A84FF';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(gx0, gy0);
      ctx.lineTo(gx1, gy1);
      ctx.stroke();

      for (const [hx, hy, fill] of [
        [gx0, gy0, foregroundColor],
        [
          gx1,
          gy1,
          toolOptions.gradientStyle === 'fg-transparent' ? 'transparent' : backgroundColor,
        ],
      ] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 5, 0, Math.PI * 2);
        ctx.fillStyle = fill === 'transparent' ? '#FFFFFF' : fill;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#0A84FF';
        ctx.stroke();
      }
      ctx.restore();
    }

    // Smart Alignment Guides
    if (activeGuides.length > 0) {
      ctx.save();
      ctx.lineWidth = 1;
      for (const guide of activeGuides) {
        ctx.strokeStyle = guide.kind === 'center' ? '#0A84FF' : '#FF375F';
        ctx.beginPath();
        if (guide.orientation === 'v') {
          const px = Math.round(origin.x + guide.pos * doc.zoom) + 0.5;
          ctx.moveTo(px, origin.y - 16);
          ctx.lineTo(px, origin.y + drawH + 16);
        } else {
          const py = Math.round(origin.y + guide.pos * doc.zoom) + 0.5;
          ctx.moveTo(origin.x - 16, py);
          ctx.lineTo(origin.x + drawW + 16, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Move Tool Bounding Box, Resize Handles & Rotation Stem
    if (activeTool === 'move') {
      const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
      if (activeLayer && activeLayer.visible && activeLayer.type !== 'group' && activeLayer.type !== 'adjustment') {
        const lx = origin.x + activeLayer.x * doc.zoom;
        const ly = origin.y + activeLayer.y * doc.zoom;
        const lw = activeLayer.width * activeLayer.scaleX * doc.zoom;
        const lh = activeLayer.height * activeLayer.scaleY * doc.zoom;
        const cx = lx + lw / 2;
        const cy = ly + lh / 2;

        ctx.save();
        ctx.translate(cx, cy);
        if (activeLayer.rotation !== 0) {
          ctx.rotate((activeLayer.rotation * Math.PI) / 180);
        }

        ctx.strokeStyle = '#0A84FF';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-lw / 2, -lh / 2, lw, lh);

        if (!activeLayer.locked) {
          // Rotation stem & handle above top-center
          const stemY = -lh / 2 - 24;
          ctx.beginPath();
          ctx.moveTo(0, -lh / 2);
          ctx.lineTo(0, stemY);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(0, stemY, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = liveRotateDeg !== null ? '#0A84FF' : '#FFFFFF';
          ctx.fill();
          ctx.strokeStyle = liveRotateDeg !== null ? '#FFFFFF' : '#0A84FF';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          if (liveRotateDeg !== null) {
            const label = `${Math.round(liveRotateDeg)}°`;
            ctx.font = '600 11px "SF Mono", ui-monospace, monospace';
            const tw = ctx.measureText(label).width + 12;
            ctx.fillStyle = 'rgba(24, 24, 28, 0.9)';
            ctx.beginPath();
            ctx.roundRect(-tw / 2, stemY - 28, tw, 20, 5);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, 0, stemY - 18);
          }

          const pts = [
            [-lw / 2, -lh / 2],
            [0, -lh / 2],
            [lw / 2, -lh / 2],
            [lw / 2, 0],
            [lw / 2, lh / 2],
            [0, lh / 2],
            [-lw / 2, lh / 2],
            [-lw / 2, 0],
          ];
          for (const [hx, hy] of pts) {
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = '#0A84FF';
            ctx.lineWidth = 1.5;
            ctx.fillRect(hx - 4, hy - 4, 8, 8);
            ctx.strokeRect(hx - 4, hy - 4, 8, 8);
          }

          if (liveResizeDims !== null) {
            const label = `${liveResizeDims.w} × ${liveResizeDims.h} px`;
            ctx.font = '600 11px "SF Mono", ui-monospace, monospace';
            const tw = ctx.measureText(label).width + 12;
            const hudY = lh / 2 + 18;
            ctx.fillStyle = 'rgba(24, 24, 28, 0.9)';
            ctx.beginPath();
            ctx.roundRect(-tw / 2, hudY - 10, tw, 20, 5);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, 0, hudY);
          }
        }
        ctx.restore();
      }
    }

    // Clone Stamp Source Target Reticle
    if (activeTool === 'clone-stamp' && (liveCloneSamplePos || cloneSource)) {
      const samplePt = liveCloneSamplePos ?? cloneSource!;
      const tx = origin.x + samplePt.x * doc.zoom;
      const ty = origin.y + samplePt.y * doc.zoom;
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(tx, ty, 7, 0, Math.PI * 2);
      ctx.moveTo(tx - 11, ty);
      ctx.lineTo(tx + 11, ty);
      ctx.moveTo(tx, ty - 11);
      ctx.lineTo(tx, ty + 11);
      ctx.stroke();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(tx, ty, 7, 0, Math.PI * 2);
      ctx.moveTo(tx - 11, ty);
      ctx.lineTo(tx + 11, ty);
      ctx.moveTo(tx, ty - 11);
      ctx.lineTo(tx, ty + 11);
      ctx.stroke();
      ctx.restore();
    }

    // Brush / Eraser Symmetry Axes
    if (
      (activeTool === 'brush' || activeTool === 'eraser') &&
      toolOptions.brushSymmetry !== 'off'
    ) {
      const sym = toolOptions.brushSymmetry;
      ctx.save();
      ctx.strokeStyle = 'rgba(10, 132, 255, 0.72)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      if (sym === 'vertical' || sym === 'quad') {
        const vx = origin.x + drawW / 2;
        ctx.beginPath();
        ctx.moveTo(vx, origin.y);
        ctx.lineTo(vx, origin.y + drawH);
        ctx.stroke();
      }
      if (sym === 'horizontal' || sym === 'quad') {
        const hy = origin.y + drawH / 2;
        ctx.beginPath();
        ctx.moveTo(origin.x, hy);
        ctx.lineTo(origin.x + drawW, hy);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Shape Drag Preview
    if (shapePreview) {
      const sx = origin.x + shapePreview.x * doc.zoom;
      const sy = origin.y + shapePreview.y * doc.zoom;
      const sw = shapePreview.w * doc.zoom;
      const sh = shapePreview.h * doc.zoom;
      ctx.save();
      ctx.strokeStyle = '#0A84FF';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      if (toolOptions.shapeKind === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(
          sx + sw / 2,
          sy + sh / 2,
          Math.max(1, sw / 2),
          Math.max(1, sh / 2),
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      } else if (toolOptions.shapeKind === 'rounded-rect') {
        const r = Math.min(toolOptions.shapeCornerRadius * doc.zoom, sw / 2, sh / 2);
        ctx.beginPath();
        ctx.roundRect(sx, sy, sw, sh, Math.max(0, r));
        ctx.stroke();
      } else if (toolOptions.shapeKind === 'line') {
        ctx.beginPath();
        ctx.moveTo(sx, sy + sh / 2);
        ctx.lineTo(sx + sw, sy + sh / 2);
        ctx.stroke();
      } else if (
        toolOptions.shapeKind === 'polygon' ||
        toolOptions.shapeKind === 'star' ||
        toolOptions.shapeKind === 'arrow'
      ) {
        const pts = computeShapePathPoints(
          Math.max(1, sw),
          Math.max(1, sh),
          toolOptions.shapeKind,
          toolOptions.shapeSides
        );
        if (pts.length > 0) {
          ctx.beginPath();
          ctx.moveTo(sx + pts[0].x, sy + pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(sx + pts[i].x, sy + pts[i].y);
          }
          ctx.closePath();
          ctx.stroke();
        }
      } else {
        ctx.strokeRect(sx, sy, sw, sh);
      }
      ctx.restore();
    }

    // Crop Overlay
    if (activeTool === 'crop' && cropRect) {
      const cx = origin.x + cropRect.x * doc.zoom;
      const cy = origin.y + cropRect.y * doc.zoom;
      const cw = cropRect.width * doc.zoom;
      const ch = cropRect.height * doc.zoom;

      // Darken outer cropped area
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.beginPath();
      ctx.rect(origin.x, origin.y, drawW, drawH);
      ctx.rect(cx + cw, cy, -cw, ch); // winding cutout
      ctx.fill('evenodd');

      // Crop border
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx, cy, cw, ch);

      // Rule of thirds (plus finer alignment sub-grid when straightening)
      if (Math.abs(cropStraighten) >= 0.01) {
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 5; i++) {
          if (i % 2 === 0) continue;
          ctx.beginPath();
          ctx.moveTo(cx + (cw * i) / 6, cy);
          ctx.lineTo(cx + (cw * i) / 6, cy + ch);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx, cy + (ch * i) / 6);
          ctx.lineTo(cx + cw, cy + (ch * i) / 6);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + (cw * i) / 3, cy);
        ctx.lineTo(cx + (cw * i) / 3, cy + ch);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy + (ch * i) / 3);
        ctx.lineTo(cx + cw, cy + (ch * i) / 3);
        ctx.stroke();
      }

      // Corner handles
      const handles = [
        [cx, cy],
        [cx + cw / 2, cy],
        [cx + cw, cy],
        [cx + cw, cy + ch / 2],
        [cx + cw, cy + ch],
        [cx + cw / 2, cy + ch],
        [cx, cy + ch],
        [cx, cy + ch / 2],
      ];
      for (const [hx, hy] of handles) {
        ctx.fillStyle = '#0A84FF';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.fillRect(hx - 4.5, hy - 4.5, 9, 9);
        ctx.strokeRect(hx - 4.5, hy - 4.5, 9, 9);
      }
      ctx.restore();
    }

    // Brush / Eraser / Clone / Spot Heal / Dodge-Burn / Smudge-Blur cursor ring
    if (
      (activeTool === 'brush' ||
        activeTool === 'eraser' ||
        activeTool === 'clone-stamp' ||
        activeTool === 'spot-heal' ||
        activeTool === 'dodge-burn' ||
        activeTool === 'smudge-blur') &&
      cursorScreen
    ) {
      const size =
        activeTool === 'brush'
          ? toolOptions.brushSize
          : activeTool === 'eraser'
            ? toolOptions.eraserSize
            : activeTool === 'clone-stamp'
              ? toolOptions.cloneSize
              : activeTool === 'spot-heal'
                ? toolOptions.healSize
                : activeTool === 'dodge-burn'
                  ? toolOptions.dodgeBurnSize
                  : toolOptions.smudgeBlurSize;
      const radius = Math.max(2, (size * doc.zoom) / 2);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cursorScreen.x, cursorScreen.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cursorScreen.x, cursorScreen.y, Math.max(1, radius - 1), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.stroke();
      if (activeTool === 'clone-stamp' || activeTool === 'spot-heal') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(cursorScreen.x - 1, cursorScreen.y - 1, 2, 2);
      }
      ctx.restore();
    }

    // Eyedropper 9×9 Magnifier Pixel Loupe
    if (activeTool === 'eyedropper' && cursorScreen && afterCanvas) {
      const px = Math.floor((cursorScreen.x - origin.x) / doc.zoom);
      const py = Math.floor((cursorScreen.y - origin.y) / doc.zoom);
      if (px >= 0 && py >= 0 && px < doc.width && py < doc.height) {
        const loupeRadius = 46;
        const gridCount = 9;
        const cellSize = 10;
        const gridTotal = gridCount * cellSize; // 90px
        const gridRadius = gridTotal / 2; // 45px
        const rulerPad = viewportSettings.showRulers ? RULER_SIZE : 0;

        const lx =
          cursorScreen.x + 68 + loupeRadius > w - 8
            ? cursorScreen.x - 68
            : cursorScreen.x + 68;
        const ly =
          cursorScreen.y - 68 - loupeRadius < rulerPad + 8
            ? cursorScreen.y + 68
            : cursorScreen.y - 68;

        ctx.save();
        // Drop shadow for loupe housing
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 4;
        ctx.beginPath();
        ctx.arc(lx, ly, loupeRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#18181B';
        ctx.fill();
        ctx.restore();

        // Clipped 9×9 pixelated magnifier interior
        ctx.save();
        ctx.beginPath();
        ctx.arc(lx, ly, gridRadius - 1, 0, Math.PI * 2);
        ctx.clip();

        ctx.fillStyle = '#1C1C1E';
        ctx.fillRect(lx - gridRadius, ly - gridRadius, gridTotal, gridTotal);

        const srcX0 = px - 4;
        const srcY0 = py - 4;
        const clampedX0 = Math.max(0, srcX0);
        const clampedY0 = Math.max(0, srcY0);
        const clampedX1 = Math.min(doc.width, srcX0 + gridCount);
        const clampedY1 = Math.min(doc.height, srcY0 + gridCount);
        if (clampedX1 > clampedX0 && clampedY1 > clampedY0) {
          ctx.imageSmoothingEnabled = false;
          const dstX = lx - gridRadius + (clampedX0 - srcX0) * cellSize;
          const dstY = ly - gridRadius + (clampedY0 - srcY0) * cellSize;
          ctx.drawImage(
            afterCanvas,
            clampedX0,
            clampedY0,
            clampedX1 - clampedX0,
            clampedY1 - clampedY0,
            dstX,
            dstY,
            (clampedX1 - clampedX0) * cellSize,
            (clampedY1 - clampedY0) * cellSize
          );
        }

        // Crisp 9×9 grid hairlines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = 1;
        for (let i = 1; i < gridCount; i++) {
          const gx = Math.round(lx - gridRadius + i * cellSize) + 0.5;
          const gy = Math.round(ly - gridRadius + i * cellSize) + 0.5;
          ctx.beginPath();
          ctx.moveTo(gx, ly - gridRadius);
          ctx.lineTo(gx, ly + gridRadius);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(lx - gridRadius, gy);
          ctx.lineTo(lx + gridRadius, gy);
          ctx.stroke();
        }

        // Center pixel reticle
        const cxCell = lx - cellSize / 2;
        const cyCell = ly - cellSize / 2;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(cxCell, cyCell, cellSize, cellSize);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.25;
        ctx.strokeRect(cxCell, cyCell, cellSize, cellSize);
        ctx.restore();

        // Outer color-ring bezel
        ctx.beginPath();
        ctx.arc(lx, ly, loupeRadius - 2, 0, Math.PI * 2);
        ctx.strokeStyle = cursorPixelColor?.hex ?? '#0A84FF';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(lx, ly, loupeRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.25;
        ctx.stroke();

        // Monospace hex + pixel readout below loupe
        const badgeText = `${cursorPixelColor?.hex ?? '#000000'} · ${px},${py}`;
        ctx.font = '600 10px "SF Mono", ui-monospace, monospace';
        const tw = ctx.measureText(badgeText).width + 12;
        const badgeY = ly + loupeRadius + 14;
        ctx.fillStyle = 'rgba(20, 20, 24, 0.9)';
        ctx.beginPath();
        ctx.roundRect(lx - tw / 2, badgeY - 9, tw, 18, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, lx, badgeY);

        ctx.restore();
      }
    }

    ctx.restore();
  }, [
    doc,
    containerSize,
    renderTick,
    activeTool,
    cropRect,
    cropStraighten,
    cloneSource,
    liveCloneSamplePos,
    liveRotateDeg,
    liveResizeDims,
    shapePreview,
    lassoPreview,
    gradientPreview,
    activeGuides,
    maskBoundarySegments,
    foregroundColor,
    backgroundColor,
    cursorScreen,
    cursorPixelColor,
    viewportSettings,
    toolOptions,
    getArtboardOrigin,
  ]);

  // Draw Rulers
  useEffect(() => {
    if (!viewportSettings.showRulers || !doc) return;
    const dpr = window.devicePixelRatio || 1;
    const origin = getArtboardOrigin();

    const stepCandidates = [10, 25, 50, 100, 250, 500, 1000];
    const majorStep =
      stepCandidates.find((s) => s * doc.zoom >= 55) ?? 1000;

    // Top Ruler
    const topEl = rulerTopRef.current;
    if (topEl) {
      const rw = Math.max(1, containerSize.width - RULER_SIZE);
      topEl.width = Math.round(rw * dpr);
      topEl.height = Math.round(RULER_SIZE * dpr);
      const rctx = topEl.getContext('2d');
      if (rctx) {
        rctx.save();
        rctx.scale(dpr, dpr);
        rctx.clearRect(0, 0, rw, RULER_SIZE);
        const startDocX = Math.floor((RULER_SIZE - origin.x) / doc.zoom / majorStep) * majorStep;
        const endDocX = Math.ceil((containerSize.width - origin.x) / doc.zoom / majorStep) * majorStep;
        rctx.font = '10px "SF Mono", ui-monospace, monospace';
        rctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--lp-text-secondary') || '#99999F';
        rctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--lp-ruler-tick') || 'rgba(255,255,255,0.3)';
        for (let x = startDocX; x <= endDocX; x += majorStep) {
          const sx = origin.x + x * doc.zoom - RULER_SIZE;
          rctx.beginPath();
          rctx.moveTo(sx + 0.5, RULER_SIZE - 8);
          rctx.lineTo(sx + 0.5, RULER_SIZE);
          rctx.stroke();
          rctx.fillText(String(x), sx + 3, 11);
        }
        if (cursorScreen) {
          const cx = cursorScreen.x - RULER_SIZE;
          rctx.strokeStyle = '#0A84FF';
          rctx.beginPath();
          rctx.moveTo(cx, 0);
          rctx.lineTo(cx, RULER_SIZE);
          rctx.stroke();
        }
        rctx.restore();
      }
    }

    // Left Ruler
    const leftEl = rulerLeftRef.current;
    if (leftEl) {
      const rh = Math.max(1, containerSize.height - RULER_SIZE);
      leftEl.width = Math.round(RULER_SIZE * dpr);
      leftEl.height = Math.round(rh * dpr);
      const lctx = leftEl.getContext('2d');
      if (lctx) {
        lctx.save();
        lctx.scale(dpr, dpr);
        lctx.clearRect(0, 0, RULER_SIZE, rh);
        const startDocY = Math.floor((RULER_SIZE - origin.y) / doc.zoom / majorStep) * majorStep;
        const endDocY = Math.ceil((containerSize.height - origin.y) / doc.zoom / majorStep) * majorStep;
        lctx.font = '10px "SF Mono", ui-monospace, monospace';
        lctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--lp-text-secondary') || '#99999F';
        lctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--lp-ruler-tick') || 'rgba(255,255,255,0.3)';
        for (let y = startDocY; y <= endDocY; y += majorStep) {
          const sy = origin.y + y * doc.zoom - RULER_SIZE;
          lctx.beginPath();
          lctx.moveTo(RULER_SIZE - 8, sy + 0.5);
          lctx.lineTo(RULER_SIZE, sy + 0.5);
          lctx.stroke();
          lctx.save();
          lctx.translate(10, sy + 3);
          lctx.rotate(-Math.PI / 2);
          lctx.fillText(String(y), 0, 0);
          lctx.restore();
        }
        if (cursorScreen) {
          const cy = cursorScreen.y - RULER_SIZE;
          lctx.strokeStyle = '#0A84FF';
          lctx.beginPath();
          lctx.moveTo(0, cy);
          lctx.lineTo(RULER_SIZE, cy);
          lctx.stroke();
        }
        lctx.restore();
      }
    }
  }, [doc, containerSize, viewportSettings.showRulers, cursorScreen, getArtboardOrigin]);

  const paintDab = (
    targetCanvas: HTMLCanvasElement,
    offsetX: number,
    offsetY: number,
    scaleX: number,
    scaleY: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    isEraser: boolean,
    isMask: boolean
  ) => {
    const ctx = targetCanvas.getContext('2d');
    if (!ctx || !doc) return;
    const size = isEraser ? toolOptions.eraserSize : toolOptions.brushSize;
    const hardness = (isEraser ? toolOptions.eraserHardness : toolOptions.brushHardness) / 100;
    const opacity = (isEraser ? toolOptions.eraserOpacity : toolOptions.brushOpacity) / 100;
    const radius = Math.max(0.5, (size * pressureRef.current) / 2);

    ctx.save();
    if (doc.selection && doc.selection.kind !== 'mask') {
      applySelectionClipToContext(
        ctx,
        doc.selection,
        targetCanvas.width,
        targetCanvas.height,
        offsetX,
        offsetY,
        scaleX,
        scaleY
      );
    }

    // On a Layer Mask, Eraser paints black (#000000) to conceal; Brush paints foregroundColor (white reveals, black hides)
    ctx.globalCompositeOperation = !isMask && isEraser ? 'destination-out' : 'source-over';
    ctx.globalAlpha = opacity;
    const strokeColor = isMask && isEraser ? '#000000' : foregroundColor;

    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const step = Math.max(1, radius * 0.25);
    const steps = Math.max(1, Math.ceil(dist / step));

    const sx = scaleX || 1;
    const sy = scaleY || 1;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = (x0 + dx * t - offsetX) / sx;
      const py = (y0 + dy * t - offsetY) / sy;

      if (hardness >= 0.95) {
        ctx.fillStyle = !isMask && isEraser ? '#000000' : strokeColor;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const grad = ctx.createRadialGradient(px, py, radius * hardness * 0.8, px, py, radius);
        if (!isMask && isEraser) {
          grad.addColorStop(0, 'rgba(0,0,0,1)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
        } else {
          grad.addColorStop(0, strokeColor);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  const stepBrushOrEraser = (
    targetCanvas: HTMLCanvasElement,
    activeLayer: Layer,
    offsetX: number,
    offsetY: number,
    scaleX: number,
    scaleY: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    isEraser: boolean,
    isMask: boolean
  ) => {
    if (!doc) return;
    const pts0 = getSymmetryPoints(x0, y0, doc.width, doc.height, toolOptions.brushSymmetry);
    const pts1 = getSymmetryPoints(x1, y1, doc.width, doc.height, toolOptions.brushSymmetry);

    if (!isEraser && !isMask && toolOptions.brushMode === 'color-replace') {
      const radius = Math.max(0.5, (toolOptions.brushSize * pressureRef.current) / 2);
      const hardness = toolOptions.brushHardness / 100;
      const opacity = toolOptions.brushOpacity / 100;
      const scAvg = Math.max(0.2, ((scaleX || 1) + (scaleY || 1)) / 2);
      const localRadius = radius / scAvg;

      for (let k = 0; k < pts0.length; k++) {
        const ax = pts0[k].x;
        const ay = pts0[k].y;
        const bx = pts1[k].x;
        const by = pts1[k].y;
        const dist = Math.hypot(bx - ax, by - ay);
        const step = Math.max(1.5, radius * 0.3);
        const steps = Math.max(1, Math.ceil(dist / step));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const dxDoc = ax + (bx - ax) * t;
          const dyDoc = ay + (by - ay) * t;
          const localPt = docPointToLayerLocal(dxDoc, dyDoc, activeLayer);
          paintColorReplaceDab({
            targetCanvas,
            centerX: localPt.x,
            centerY: localPt.y,
            radius: localRadius,
            hardness,
            opacity,
            hex: foregroundColor,
          });
        }
      }
      return;
    }

    for (let k = 0; k < pts0.length; k++) {
      paintDab(
        targetCanvas,
        offsetX,
        offsetY,
        scaleX,
        scaleY,
        pts0[k].x,
        pts0[k].y,
        pts1[k].x,
        pts1[k].y,
        isEraser,
        isMask
      );
    }
  };

  const stepCloneSegment = (
    targetCanvas: HTMLCanvasElement,
    sourceCanvas: HTMLCanvasElement,
    editingMask: boolean,
    activeLayer: Layer,
    srcLayer: Layer | null,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    startDocX: number,
    startDocY: number,
    srcAnchorX: number,
    srcAnchorY: number
  ): boolean => {
    if (!doc) return false;
    const radius = Math.max(1, toolOptions.cloneSize / 2);
    const hardness = toolOptions.cloneHardness / 100;
    const opacity = toolOptions.cloneOpacity / 100;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const step = Math.max(1, radius * 0.32);
    const steps = Math.max(1, Math.ceil(dist / step));

    const offX = editingMask ? 0 : activeLayer.x;
    const offY = editingMask ? 0 : activeLayer.y;
    const scX = editingMask ? 1 : activeLayer.scaleX || 1;
    const scY = editingMask ? 1 : activeLayer.scaleY || 1;

    let modified = false;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const dxDoc = x0 + (x1 - x0) * t;
      const dyDoc = y0 + (y1 - y0) * t;
      const sxDoc = srcAnchorX + (dxDoc - startDocX);
      const syDoc = srcAnchorY + (dyDoc - startDocY);

      const dstPt = editingMask
        ? { x: dxDoc, y: dyDoc }
        : docPointToLayerLocal(dxDoc, dyDoc, activeLayer);
      const srcPt = srcLayer && !editingMask
        ? docPointToLayerLocal(sxDoc, syDoc, srcLayer)
        : { x: sxDoc, y: syDoc };

      const did = applyCloneStampDab({
        targetCanvas,
        sourceCanvas,
        dstCenterX: dstPt.x,
        dstCenterY: dstPt.y,
        srcCenterX: srcPt.x,
        srcCenterY: srcPt.y,
        radius: radius / Math.max(0.2, (scX + scY) / 2),
        hardness,
        opacity,
        docOffsetX: offX,
        docOffsetY: offY,
        scaleX: scX,
        scaleY: scY,
        selection: doc.selection,
      });
      if (did) modified = true;
    }
    return modified;
  };

  const stepHealSegment = (
    targetCanvas: HTMLCanvasElement,
    editingMask: boolean,
    activeLayer: Layer,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): boolean => {
    if (!doc) return false;
    const radius = Math.max(1, toolOptions.healSize / 2);
    const hardness = toolOptions.healHardness / 100;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const step = Math.max(1.5, radius * 0.4);
    const steps = Math.max(1, Math.ceil(dist / step));

    const offX = editingMask ? 0 : activeLayer.x;
    const offY = editingMask ? 0 : activeLayer.y;
    const scX = editingMask ? 1 : activeLayer.scaleX || 1;
    const scY = editingMask ? 1 : activeLayer.scaleY || 1;

    let modified = false;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const dxDoc = x0 + (x1 - x0) * t;
      const dyDoc = y0 + (y1 - y0) * t;
      const dstPt = editingMask
        ? { x: dxDoc, y: dyDoc }
        : docPointToLayerLocal(dxDoc, dyDoc, activeLayer);

      const did =
        toolOptions.spotHealMode === 'red-eye' && !editingMask
          ? applyRedEyeRemovalDab({
              targetCanvas,
              centerX: dstPt.x,
              centerY: dstPt.y,
              radius: radius / Math.max(0.2, (scX + scY) / 2),
              hardness,
              docOffsetX: offX,
              docOffsetY: offY,
              scaleX: scX,
              scaleY: scY,
              selection: doc.selection,
            })
          : applySpotHealDab({
              targetCanvas,
              centerX: dstPt.x,
              centerY: dstPt.y,
              radius: radius / Math.max(0.2, (scX + scY) / 2),
              hardness,
              docOffsetX: offX,
              docOffsetY: offY,
              scaleX: scX,
              scaleY: scY,
              selection: doc.selection,
            });
      if (did) modified = true;
    }
    return modified;
  };

  const stepDodgeBurnSegment = (
    targetCanvas: HTMLCanvasElement,
    editingMask: boolean,
    activeLayer: Layer,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): boolean => {
    if (!doc) return false;
    const radius = Math.max(1, (toolOptions.dodgeBurnSize * pressureRef.current) / 2);
    const hardness = toolOptions.dodgeBurnHardness / 100;
    const strength = toolOptions.dodgeBurnStrength / 100;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const step = Math.max(1.5, radius * 0.35);
    const steps = Math.max(1, Math.ceil(dist / step));

    const offX = editingMask ? 0 : activeLayer.x;
    const offY = editingMask ? 0 : activeLayer.y;
    const scX = editingMask ? 1 : activeLayer.scaleX || 1;
    const scY = editingMask ? 1 : activeLayer.scaleY || 1;

    let modified = false;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const dxDoc = x0 + (x1 - x0) * t;
      const dyDoc = y0 + (y1 - y0) * t;
      const dstPt = editingMask
        ? { x: dxDoc, y: dyDoc }
        : docPointToLayerLocal(dxDoc, dyDoc, activeLayer);

      const did = applyDodgeBurnDab({
        targetCanvas,
        centerX: dstPt.x,
        centerY: dstPt.y,
        radius: radius / Math.max(0.2, (scX + scY) / 2),
        hardness,
        strength,
        mode: toolOptions.dodgeBurnMode,
        range: toolOptions.dodgeBurnRange,
        docOffsetX: offX,
        docOffsetY: offY,
        scaleX: scX,
        scaleY: scY,
        selection: doc.selection,
      });
      if (did) modified = true;
    }
    return modified;
  };

  const stepSmudgeBlurSegment = (
    targetCanvas: HTMLCanvasElement,
    editingMask: boolean,
    activeLayer: Layer,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): boolean => {
    if (!doc) return false;
    const radius = Math.max(1, (toolOptions.smudgeBlurSize * pressureRef.current) / 2);
    const hardness = toolOptions.smudgeBlurHardness / 100;
    const strength = toolOptions.smudgeBlurStrength / 100;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const step = Math.max(1.5, radius * 0.35);
    const steps = Math.max(1, Math.ceil(dist / step));

    const offX = editingMask ? 0 : activeLayer.x;
    const offY = editingMask ? 0 : activeLayer.y;
    const scX = editingMask ? 1 : activeLayer.scaleX || 1;
    const scY = editingMask ? 1 : activeLayer.scaleY || 1;
    const localRadius = radius / Math.max(0.2, (scX + scY) / 2);

    if (toolOptions.smudgeBlurMode === 'smudge') {
      if (dist < 0.05) return false;
      let modified = false;
      let prevPt = editingMask
        ? { x: x0, y: y0 }
        : docPointToLayerLocal(x0, y0, activeLayer);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const dxDoc = x0 + (x1 - x0) * t;
        const dyDoc = y0 + (y1 - y0) * t;
        const curPt = editingMask
          ? { x: dxDoc, y: dyDoc }
          : docPointToLayerLocal(dxDoc, dyDoc, activeLayer);
        const did = applySmudgeDab({
          targetCanvas,
          prevX: prevPt.x,
          prevY: prevPt.y,
          currX: curPt.x,
          currY: curPt.y,
          radius: localRadius,
          hardness,
          strength,
          docOffsetX: offX,
          docOffsetY: offY,
          scaleX: scX,
          scaleY: scY,
          selection: doc.selection,
        });
        if (did) modified = true;
        prevPt = curPt;
      }
      return modified;
    }

    let modified = false;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const dxDoc = x0 + (x1 - x0) * t;
      const dyDoc = y0 + (y1 - y0) * t;
      const dstPt = editingMask
        ? { x: dxDoc, y: dyDoc }
        : docPointToLayerLocal(dxDoc, dyDoc, activeLayer);
      const did = applyBlurSharpenDab({
        targetCanvas,
        centerX: dstPt.x,
        centerY: dstPt.y,
        radius: localRadius,
        hardness,
        strength,
        mode: toolOptions.smudgeBlurMode,
        docOffsetX: offX,
        docOffsetY: offY,
        scaleX: scX,
        scaleY: scY,
        selection: doc.selection,
      });
      if (did) modified = true;
    }
    return modified;
  };

  const refreshLivePaintComposite = () => {
    if (!doc) return;
    const now = performance.now();
    if (now - lastHistogramBumpRef.current >= 85) {
      lastHistogramBumpRef.current = now;
      bumpLiveCanvasTick();
    }
    const unadjusted = compositeLayersToCanvas(
      doc.width,
      doc.height,
      doc.backgroundColor,
      doc.layers
    );
    beforeCanvasRef.current = unadjusted;
    if (isDefaultAdjustments(doc.adjustments)) {
      afterCanvasRef.current = unadjusted;
      setRenderTick((t) => t + 1);
      return;
    }
    const version = ++adjustVersionRef.current;
    const ctx = unadjusted.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, doc.width, doc.height);
    void processAdjustmentsAsync(imgData, doc.adjustments).then((processed) => {
      if (adjustVersionRef.current !== version) return;
      if (processed.width !== doc.width || processed.height !== doc.height) return;
      const outCanvas = createCanvas(doc.width, doc.height);
      const outCtx = outCanvas.getContext('2d');
      outCtx?.putImageData(processed, 0, 0);
      afterCanvasRef.current = outCanvas;
      setRenderTick((t) => t + 1);
    });
  };

  const hitTestHandle = (
    sx: number,
    sy: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number
  ): string | null => {
    const pts: Array<[string, number, number]> = [
      ['nw', rx, ry],
      ['n', rx + rw / 2, ry],
      ['ne', rx + rw, ry],
      ['e', rx + rw, ry + rh / 2],
      ['se', rx + rw, ry + rh],
      ['s', rx + rw / 2, ry + rh],
      ['sw', rx, ry + rh],
      ['w', rx, ry + rh / 2],
    ];
    for (const [name, hx, hy] of pts) {
      if (Math.abs(sx - hx) <= 7 && Math.abs(sy - hy) <= 7) {
        return name;
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!doc) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    pressureRef.current = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 1;
    if (e.pointerType === 'touch') {
      touchPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchPointsRef.current.size === 2) {
        // A second finger turns the gesture into a pinch: drop any stroke or drag in progress.
        dragRef.current = { kind: 'none' };
        const [a, b] = [...touchPointsRef.current.values()];
        pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: doc.zoom };
        return;
      }
      if (touchPointsRef.current.size > 2) return;
    }
    const { x: docX, y: docY, sx, sy } = screenToDoc(e.clientX, e.clientY);
    const origin = getArtboardOrigin();

    // Check Before/After Split Divider drag first
    if (viewportSettings.beforeAfterMode === 'split') {
      const splitX = origin.x + doc.width * doc.zoom * viewportSettings.splitPosition;
      if (Math.abs(sx - splitX) <= 8) {
        dragRef.current = { kind: 'split-divider' };
        return;
      }
    }

    // Hand tool, Spacebar, or Middle mouse button -> Pan
    if (activeTool === 'hand' || spacePressed || e.button === 1) {
      dragRef.current = {
        kind: 'pan',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: doc.panX,
        startPanY: doc.panY,
      };
      return;
    }

    if (activeTool === 'zoom') {
      const factor = e.altKey ? 1 / 1.35 : 1.35;
      const nextZoom = Math.max(0.05, Math.min(16, doc.zoom * factor));
      const ratio = nextZoom / doc.zoom;
      const rulerOffset = viewportSettings.showRulers ? RULER_SIZE : 0;
      const cx = rulerOffset + (containerSize.width - rulerOffset) / 2;
      const cy = rulerOffset + (containerSize.height - rulerOffset) / 2;
      const nextPanX = sx - cx - (sx - cx - doc.panX) * ratio;
      const nextPanY = sy - cy - (sy - cy - doc.panY) * ratio;
      setZoom(nextZoom, nextPanX, nextPanY);
      return;
    }

    if (activeTool === 'eyedropper') {
      const px = Math.floor(docX);
      const py = Math.floor(docY);
      const src = afterCanvasRef.current;
      if (src && px >= 0 && py >= 0 && px < doc.width && py < doc.height) {
        const hex = sampleAverageColorFromCanvas(src, docX, docY, toolOptions.eyedropperSampleSize);
        if (hex) {
          setForegroundColor(hex);
          const sz = toolOptions.eyedropperSampleSize;
          showToast(`Sampled ${hex} (${sz}×${sz})`, 'info');
        }
      }
      return;
    }

    if (activeTool === 'crop' && cropRect) {
      const cx = origin.x + cropRect.x * doc.zoom;
      const cy = origin.y + cropRect.y * doc.zoom;
      const cw = cropRect.width * doc.zoom;
      const ch = cropRect.height * doc.zoom;
      const handle = hitTestHandle(sx, sy, cx, cy, cw, ch);
      if (handle) {
        dragRef.current = {
          kind: 'crop-handle',
          handle,
          startDocX: docX,
          startDocY: docY,
          origCrop: { ...cropRect },
        };
        return;
      }
      if (sx >= cx && sx <= cx + cw && sy >= cy && sy <= cy + ch) {
        dragRef.current = {
          kind: 'crop-move',
          startDocX: docX,
          startDocY: docY,
          origCrop: { ...cropRect },
        };
        return;
      }
      return;
    }

    if (activeTool === 'marquee-rect' || activeTool === 'marquee-ellipse') {
      dragRef.current = { kind: 'marquee', startDocX: docX, startDocY: docY };
      setSelection({
        kind: activeTool === 'marquee-rect' ? 'rect' : 'ellipse',
        x: Math.round(docX),
        y: Math.round(docY),
        width: 1,
        height: 1,
      });
      return;
    }

    if (activeTool === 'lasso') {
      if (toolOptions.lassoMode === 'polygon') {
        const d = dragRef.current;
        if (d.kind === 'lasso-polygon') {
          const originPt = d.points[0];
          const distPx = Math.hypot((docX - originPt.x) * doc.zoom, (docY - originPt.y) * doc.zoom);
          if (d.points.length >= 3 && distPx <= 10) {
            const pts = [...d.points];
            dragRef.current = { kind: 'none' };
            setLassoPreview(null);
            const bounds = computePolygonBounds(pts);
            setSelection({ kind: 'polygon', ...bounds, points: pts });
            return;
          }
          const lastPt = d.points[d.points.length - 1];
          if (Math.hypot(docX - lastPt.x, docY - lastPt.y) >= 1) {
            d.points.push({ x: docX, y: docY });
          }
          d.cursor = { x: docX, y: docY };
          setLassoPreview({ points: [...d.points], cursor: d.cursor, isPolygonMode: true });
        } else {
          const pts = [{ x: docX, y: docY }];
          const cursor = { x: docX, y: docY };
          dragRef.current = { kind: 'lasso-polygon', points: pts, cursor };
          setLassoPreview({ points: pts, cursor, isPolygonMode: true });
        }
        return;
      }

      const pts = [{ x: docX, y: docY }];
      dragRef.current = { kind: 'lasso-freehand', points: pts };
      setLassoPreview({ points: pts, cursor: null, isPolygonMode: false });
      return;
    }

    if (activeTool === 'magic-wand') {
      const px = Math.floor(docX);
      const py = Math.floor(docY);
      if (px < 0 || py < 0 || px >= doc.width || py >= doc.height) return;
      const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
      let sampleCanvas: HTMLCanvasElement | null = null;
      if (activeLayer && activeLayer.visible && activeLayer.type !== 'group' && activeLayer.type !== 'adjustment') {
        const layerBuf = createCanvas(doc.width, doc.height);
        const lctx = layerBuf.getContext('2d');
        if (lctx) {
          renderLayerNodeToContext(lctx, activeLayer, doc.layers, doc.width, doc.height);
          sampleCanvas = layerBuf;
        }
      } else {
        sampleCanvas = beforeCanvasRef.current;
      }
      if (!sampleCanvas) return;
      const sel = computeMagicWandSelection(
        sampleCanvas,
        px,
        py,
        toolOptions.wandTolerance,
        toolOptions.wandContiguous
      );
      if (sel) {
        setSelection(sel);
      } else {
        showToast('No matching pixels found at cursor.', 'info');
      }
      return;
    }

    if (activeTool === 'text') {
      const id = addTextLayer(Math.round(docX), Math.round(docY), 'New Text');
      if (id) setEditingTextLayerId(id);
      return;
    }

    if (activeTool === 'shape') {
      dragRef.current = {
        kind: 'shape',
        startDocX: docX,
        startDocY: docY,
        curDocX: docX,
        curDocY: docY,
      };
      setShapePreview({ x: docX, y: docY, w: 1, h: 1 });
      return;
    }

    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);

    if (activeTool === 'move') {
      // Check active layer's transform/rotation handles first so they always take precedence
      if (activeLayer && activeLayer.visible && activeLayer.type !== 'group' && activeLayer.type !== 'adjustment' && !activeLayer.locked) {
        const lx = origin.x + activeLayer.x * doc.zoom;
        const ly = origin.y + activeLayer.y * doc.zoom;
        const lw = activeLayer.width * activeLayer.scaleX * doc.zoom;
        const lh = activeLayer.height * activeLayer.scaleY * doc.zoom;
        const scx = lx + lw / 2;
        const scy = ly + lh / 2;
        const localPointer = rotatePointAroundCenter(sx, sy, scx, scy, -activeLayer.rotation);

        // Rotation stem handle
        const rotHandleX = scx;
        const rotHandleY = scy - lh / 2 - 24;
        if (Math.hypot(localPointer.x - rotHandleX, localPointer.y - rotHandleY) <= 10) {
          const cxDoc = activeLayer.x + (activeLayer.width * activeLayer.scaleX) / 2;
          const cyDoc = activeLayer.y + (activeLayer.height * activeLayer.scaleY) / 2;
          const startAngle = Math.atan2(docY - cyDoc, docX - cxDoc) * (180 / Math.PI);
          dragRef.current = {
            kind: 'rotate-layer',
            layerId: activeLayer.id,
            centerX: cxDoc,
            centerY: cyDoc,
            startAngle,
            origRotation: activeLayer.rotation,
          };
          setLiveRotateDeg(activeLayer.rotation);
          return;
        }

        const handle = hitTestHandle(
          localPointer.x,
          localPointer.y,
          scx - lw / 2,
          scy - lh / 2,
          lw,
          lh
        );
        if (handle) {
          const origW = activeLayer.width * activeLayer.scaleX;
          const origH = activeLayer.height * activeLayer.scaleY;
          dragRef.current = {
            kind: 'resize-layer',
            layerId: activeLayer.id,
            handle,
            startDocX: docX,
            startDocY: docY,
            origX: activeLayer.x,
            origY: activeLayer.y,
            origW,
            origH,
            origRotation: activeLayer.rotation,
          };
          setLiveResizeDims({ w: Math.round(origW), h: Math.round(origH) });
          return;
        }
      }

      let targetLayer = activeLayer ?? null;
      if (toolOptions.moveAutoSelect) {
        const hitLayer = pickTopmostLayerAtPoint(docX, docY, doc.layers);
        if (hitLayer) {
          targetLayer = hitLayer;
          if (hitLayer.id !== doc.activeLayerId) {
            selectLayer(hitLayer.id);
          }
        }
      }

      if (!targetLayer) return;
      if (targetLayer.type === 'group') {
        showToast('Select a child layer inside the group to move or resize.', 'info');
        return;
      }
      if (targetLayer.type === 'adjustment') {
        showToast('Adjustment layers cover the whole canvas; edit them in the Adjustments panel.', 'info');
        return;
      }
      if (targetLayer.locked) {
        showToast('Active layer is locked.', 'info');
        return;
      }

      dragRef.current = {
        kind: 'move-layer',
        layerId: targetLayer.id,
        startDocX: docX,
        startDocY: docY,
        origX: targetLayer.x,
        origY: targetLayer.y,
      };
      return;
    }

    if (activeTool === 'gradient') {
      const editingMask = doc.editingTarget === 'mask' && !!activeLayer?.mask;
      if (!activeLayer) {
        showToast('Select a layer to apply gradient.', 'info');
        return;
      }
      if (activeLayer.locked) {
        showToast('Active layer is locked.', 'info');
        return;
      }
      if (!editingMask && activeLayer.type !== 'raster') {
        showToast('Select a Raster Layer or Layer Mask to apply gradient.', 'info');
        return;
      }
      dragRef.current = {
        kind: 'gradient',
        x0: docX,
        y0: docY,
        x1: docX,
        y1: docY,
      };
      setGradientPreview({ x0: docX, y0: docY, x1: docX, y1: docY });
      return;
    }

    if (activeTool === 'clone-stamp') {
      if (e.altKey) {
        const samplePt = { x: Math.round(docX), y: Math.round(docY) };
        setCloneSource(samplePt);
        showToast(`Clone source sampled at (${samplePt.x}, ${samplePt.y})`, 'info');
        return;
      }

      const editingMask = doc.editingTarget === 'mask' && !!activeLayer?.mask;
      if (!activeLayer) {
        showToast('Select a layer to use Clone Stamp.', 'info');
        return;
      }
      if (activeLayer.locked) {
        showToast('Active layer is locked.', 'info');
        return;
      }
      if (!editingMask && activeLayer.type !== 'raster') {
        showToast('Select a Raster Layer or Layer Mask to use Clone Stamp.', 'info');
        return;
      }
      if (!cloneSource) {
        showToast('Hold Alt/Option + Click canvas to set Clone Stamp source.', 'info');
        return;
      }

      const targetCanvas =
        editingMask && activeLayer.mask
          ? activeLayer.mask.canvas
          : activeLayer.type === 'raster'
            ? activeLayer.canvas
            : null;
      if (!targetCanvas) return;

      const prePaintCanvas =
        doc.selection?.kind === 'mask' ? cloneCanvas(targetCanvas) : null;

      let srcAnchorX = cloneSource.x;
      let srcAnchorY = cloneSource.y;
      if (toolOptions.cloneAligned) {
        if (!cloneAlignedOffsetRef.current) {
          cloneAlignedOffsetRef.current = {
            dx: cloneSource.x - docX,
            dy: cloneSource.y - docY,
          };
        }
        srcAnchorX = docX + cloneAlignedOffsetRef.current.dx;
        srcAnchorY = docY + cloneAlignedOffsetRef.current.dy;
      }

      const sampleAll = toolOptions.cloneSampleAllLayers && !editingMask;
      const srcCanvas = sampleAll
        ? cloneCanvas(beforeCanvasRef.current ?? createCanvas(doc.width, doc.height))
        : cloneCanvas(targetCanvas);
      const srcLayer = sampleAll ? null : activeLayer;
      const srcOffX = sampleAll || editingMask ? 0 : activeLayer.x;
      const srcOffY = sampleAll || editingMask ? 0 : activeLayer.y;
      const srcScX = sampleAll || editingMask ? 1 : activeLayer.scaleX;
      const srcScY = sampleAll || editingMask ? 1 : activeLayer.scaleY;

      const painted = stepCloneSegment(
        targetCanvas,
        srcCanvas,
        editingMask,
        activeLayer,
        srcLayer,
        docX,
        docY,
        docX,
        docY,
        docX,
        docY,
        srcAnchorX,
        srcAnchorY
      );

      if (doc.selection?.kind === 'mask' && prePaintCanvas) {
        maskCanvasDiffBySelection(
          targetCanvas,
          prePaintCanvas,
          doc.selection,
          editingMask ? 0 : activeLayer.x,
          editingMask ? 0 : activeLayer.y,
          editingMask ? 1 : activeLayer.scaleX,
          editingMask ? 1 : activeLayer.scaleY
        );
      }

      setLiveCloneSamplePos({ x: srcAnchorX, y: srcAnchorY });
      dragRef.current = {
        kind: 'clone',
        lastDocX: docX,
        lastDocY: docY,
        startDocX: docX,
        startDocY: docY,
        srcAnchorX,
        srcAnchorY,
        srcCanvas,
        srcOffX,
        srcOffY,
        srcScX,
        srcScY,
        srcLayer,
        prePaintCanvas,
        painted,
      };
      refreshLivePaintComposite();
      return;
    }

    if (activeTool === 'spot-heal') {
      const editingMask = doc.editingTarget === 'mask' && !!activeLayer?.mask;
      if (!activeLayer) {
        showToast('Select a layer to use Spot Healing.', 'info');
        return;
      }
      if (activeLayer.locked) {
        showToast('Active layer is locked.', 'info');
        return;
      }
      if (!editingMask && activeLayer.type !== 'raster') {
        showToast('Select a Raster Layer or Layer Mask to use Spot Healing.', 'info');
        return;
      }

      const targetCanvas =
        editingMask && activeLayer.mask
          ? activeLayer.mask.canvas
          : activeLayer.type === 'raster'
            ? activeLayer.canvas
            : null;
      if (!targetCanvas) return;

      const prePaintCanvas =
        doc.selection?.kind === 'mask' ? cloneCanvas(targetCanvas) : null;

      const painted = stepHealSegment(
        targetCanvas,
        editingMask,
        activeLayer,
        docX,
        docY,
        docX,
        docY
      );

      if (doc.selection?.kind === 'mask' && prePaintCanvas) {
        maskCanvasDiffBySelection(
          targetCanvas,
          prePaintCanvas,
          doc.selection,
          editingMask ? 0 : activeLayer.x,
          editingMask ? 0 : activeLayer.y,
          editingMask ? 1 : activeLayer.scaleX,
          editingMask ? 1 : activeLayer.scaleY
        );
      }

      dragRef.current = {
        kind: 'heal',
        lastDocX: docX,
        lastDocY: docY,
        prePaintCanvas,
        painted,
      };
      refreshLivePaintComposite();
      return;
    }

    if (activeTool === 'dodge-burn' || activeTool === 'smudge-blur') {
      const editingMask = doc.editingTarget === 'mask' && !!activeLayer?.mask;
      if (!activeLayer) {
        showToast('Select a layer to retouch.', 'info');
        return;
      }
      if (activeLayer.locked) {
        showToast('Active layer is locked.', 'info');
        return;
      }
      if (!editingMask && activeLayer.type !== 'raster') {
        showToast('Select a Raster Layer or Layer Mask to retouch.', 'info');
        return;
      }

      const targetCanvas =
        editingMask && activeLayer.mask
          ? activeLayer.mask.canvas
          : activeLayer.type === 'raster'
            ? activeLayer.canvas
            : null;
      if (!targetCanvas) return;

      const prePaintCanvas = doc.selection?.kind === 'mask' ? cloneCanvas(targetCanvas) : null;
      const painted =
        activeTool === 'dodge-burn'
          ? stepDodgeBurnSegment(
              targetCanvas,
              editingMask,
              activeLayer,
              docX,
              docY,
              docX,
              docY
            )
          : stepSmudgeBlurSegment(
              targetCanvas,
              editingMask,
              activeLayer,
              docX,
              docY,
              docX,
              docY
            );

      if (doc.selection?.kind === 'mask' && prePaintCanvas) {
        maskCanvasDiffBySelection(
          targetCanvas,
          prePaintCanvas,
          doc.selection,
          editingMask ? 0 : activeLayer.x,
          editingMask ? 0 : activeLayer.y,
          editingMask ? 1 : activeLayer.scaleX,
          editingMask ? 1 : activeLayer.scaleY
        );
      }

      dragRef.current = {
        kind: activeTool,
        lastDocX: docX,
        lastDocY: docY,
        prePaintCanvas,
        painted,
      };
      if (painted) refreshLivePaintComposite();
      return;
    }

    if (activeTool === 'brush' || activeTool === 'eraser') {
      const editingMask = doc.editingTarget === 'mask' && !!activeLayer?.mask;
      if (!activeLayer) {
        showToast('Select a layer to paint.', 'info');
        return;
      }
      if (activeLayer.locked) {
        showToast('Active layer is locked.', 'info');
        return;
      }
      if (!editingMask && activeLayer.type !== 'raster') {
        showToast('Select a Raster Layer or add a Layer Mask to paint.', 'info');
        return;
      }

      const targetCanvas =
        editingMask && activeLayer.mask
          ? activeLayer.mask.canvas
          : activeLayer.type === 'raster'
            ? activeLayer.canvas
            : null;
      if (!targetCanvas) return;

      const isColorReplace =
        activeTool === 'brush' && !editingMask && toolOptions.brushMode === 'color-replace';
      const prePaintCanvas =
        doc.selection && (doc.selection.kind === 'mask' || isColorReplace)
          ? cloneCanvas(targetCanvas)
          : null;

      const offX = editingMask ? 0 : activeLayer.x;
      const offY = editingMask ? 0 : activeLayer.y;
      const scX = editingMask ? 1 : activeLayer.scaleX;
      const scY = editingMask ? 1 : activeLayer.scaleY;

      stepBrushOrEraser(
        targetCanvas,
        activeLayer,
        offX,
        offY,
        scX,
        scY,
        docX,
        docY,
        docX,
        docY,
        activeTool === 'eraser',
        editingMask
      );

      if (doc.selection && prePaintCanvas) {
        maskCanvasDiffBySelection(
          targetCanvas,
          prePaintCanvas,
          doc.selection,
          offX,
          offY,
          scX,
          scY
        );
      }

      dragRef.current = {
        kind: 'paint',
        lastDocX: docX,
        lastDocY: docY,
        painted: true,
        prePaintCanvas,
      };
      refreshLivePaintComposite();
      return;
    }

    if (activeTool === 'bucket') {
      const editingMask = doc.editingTarget === 'mask' && !!activeLayer?.mask;
      if (!activeLayer) {
        showToast('Select a layer to use Paint Bucket.', 'info');
        return;
      }
      if (activeLayer.locked) {
        showToast('Active layer is locked.', 'info');
        return;
      }
      if (!editingMask && activeLayer.type !== 'raster') {
        showToast('Select a Raster Layer or a Layer Mask to use Paint Bucket.', 'info');
        return;
      }
      if (!isPointInSelection(docX, docY, doc.selection)) {
        showToast('Click inside the active selection to fill.', 'info');
        return;
      }
      const changed = editingMask && activeLayer.mask
        ? floodFillCanvas(
            activeLayer.mask.canvas,
            docX,
            docY,
            foregroundColor,
            toolOptions.bucketTolerance,
            0,
            0,
            doc.selection
          )
        : activeLayer.type === 'raster'
          ? floodFillCanvas(
              activeLayer.canvas,
              docX - activeLayer.x,
              docY - activeLayer.y,
              foregroundColor,
              toolOptions.bucketTolerance,
              activeLayer.x,
              activeLayer.y,
              doc.selection
            )
          : false;
      if (changed) {
        commitCanvasMutation(editingMask ? 'Paint Bucket Mask' : 'Paint Bucket Fill');
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!doc) return;
    if (e.pointerType === 'pen') pressureRef.current = e.pressure > 0 ? e.pressure : 1;
    if (e.pointerType === 'touch' && touchPointsRef.current.has(e.pointerId)) {
      const prev = touchPointsRef.current.get(e.pointerId)!;
      touchPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pinch = pinchRef.current;
      if (pinch && touchPointsRef.current.size === 2) {
        const [a, b] = [...touchPointsRef.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const nextZoom = Math.max(0.05, Math.min(16, pinch.zoom * (dist / pinch.dist)));
        const ratio = nextZoom / doc.zoom;
        const rect = e.currentTarget.getBoundingClientRect();
        const mx = (a.x + b.x) / 2 - rect.left;
        const my = (a.y + b.y) / 2 - rect.top;
        const rulerOffset = viewportSettings.showRulers ? RULER_SIZE : 0;
        const cx = rulerOffset + (containerSize.width - rulerOffset) / 2;
        const cy = rulerOffset + (containerSize.height - rulerOffset) / 2;
        // Zoom about the pinch centre, and follow the centre as the fingers pan.
        const panX = mx - cx - (mx - cx - doc.panX) * ratio + (e.clientX - prev.x) / 2;
        const panY = my - cy - (my - cy - doc.panY) * ratio + (e.clientY - prev.y) / 2;
        setZoom(nextZoom, panX, panY);
        return;
      }
      if (touchPointsRef.current.size > 1) return;
    }
    const { x: docX, y: docY, sx, sy } = screenToDoc(e.clientX, e.clientY);
    setCursorScreen({ x: sx, y: sy });
    setCursorCanvasPos({ x: Math.round(docX), y: Math.round(docY) });

    const px = Math.floor(docX);
    const py = Math.floor(docY);
    const sampleSrc = afterCanvasRef.current;
    if (sampleSrc && px >= 0 && py >= 0 && px < doc.width && py < doc.height) {
      let scratch = pixelSampleCanvasRef.current;
      if (!scratch) {
        scratch = createCanvas(1, 1);
        pixelSampleCanvasRef.current = scratch;
      }
      const sctx = scratch.getContext('2d', { willReadFrequently: true });
      if (sctx) {
        sctx.clearRect(0, 0, 1, 1);
        sctx.drawImage(sampleSrc, px, py, 1, 1, 0, 0, 1, 1);
        const d = sctx.getImageData(0, 0, 1, 1).data;
        setCursorPixelColor({
          r: d[0],
          g: d[1],
          b: d[2],
          a: d[3],
          hex: rgbaToHex(d[0], d[1], d[2]),
        });
      }
    } else {
      setCursorPixelColor(null);
    }

    const d = dragRef.current;
    if (d.kind === 'none') return;

    if (d.kind === 'split-divider') {
      const origin = getArtboardOrigin();
      const pos = (sx - origin.x) / (doc.width * doc.zoom);
      setSplitPosition(pos);
      return;
    }

    if (d.kind === 'pan') {
      const dx = e.clientX - d.startClientX;
      const dy = e.clientY - d.startClientY;
      setPan(d.startPanX + dx, d.startPanY + dy);
      return;
    }

    if (d.kind === 'move-layer') {
      const targetLayer = doc.layers.find((l) => l.id === d.layerId);
      if (!targetLayer) return;
      const rawX = d.origX + (docX - d.startDocX);
      const rawY = d.origY + (docY - d.startDocY);
      const layerW = targetLayer.width * targetLayer.scaleX;
      const layerH = targetLayer.height * targetLayer.scaleY;

      if (toolOptions.snapToGuides && !e.altKey) {
        const siblingBounds = doc.layers
          .filter((l) => l.id !== targetLayer.id && l.visible && l.type !== 'group' && l.type !== 'adjustment')
          .map((l) => ({
            x: l.x,
            y: l.y,
            width: l.width * l.scaleX,
            height: l.height * l.scaleY,
          }));
        const snap = computeSnapGuides(
          { x: rawX, y: rawY, width: layerW, height: layerH },
          doc.width,
          doc.height,
          siblingBounds,
          6 / doc.zoom
        );
        setActiveGuides(snap.guides);
        updateLayer(targetLayer.id, {
          x: Math.round(rawX + snap.dx),
          y: Math.round(rawY + snap.dy),
        });
      } else {
        setActiveGuides([]);
        updateLayer(targetLayer.id, { x: Math.round(rawX), y: Math.round(rawY) });
      }
      return;
    }

    if (d.kind === 'rotate-layer') {
      const targetLayer = doc.layers.find((l) => l.id === d.layerId);
      if (!targetLayer) return;
      const curAngle = Math.atan2(docY - d.centerY, docX - d.centerX) * (180 / Math.PI);
      const nextRot = snapRotationAngle(d.origRotation + (curAngle - d.startAngle), e.shiftKey);
      setLiveRotateDeg(nextRot);
      updateLayer(targetLayer.id, { rotation: nextRot });
      return;
    }

    if (d.kind === 'resize-layer') {
      const targetLayer = doc.layers.find((l) => l.id === d.layerId);
      if (!targetLayer) return;
      let { x: nx, y: ny, width: nw, height: nh } = computeLayerResizeRect({
        handle: d.handle,
        dxDoc: docX - d.startDocX,
        dyDoc: docY - d.startDocY,
        origX: d.origX,
        origY: d.origY,
        origW: d.origW,
        origH: d.origH,
        origRotation: d.origRotation,
        lockAspect: e.shiftKey,
      });

      if (d.origRotation === 0 && !e.shiftKey && toolOptions.snapToGuides && !e.altKey) {
        const siblingBounds = doc.layers
          .filter((l) => l.id !== targetLayer.id && l.visible && l.type !== 'group' && l.type !== 'adjustment')
          .map((l) => ({
            x: l.x,
            y: l.y,
            width: l.width * l.scaleX,
            height: l.height * l.scaleY,
          }));
        const edgeMask = {
          left: d.handle.includes('w'),
          right: d.handle.includes('e'),
          top: d.handle.includes('n'),
          bottom: d.handle.includes('s'),
        };
        const snap = computeSnapGuides(
          { x: nx, y: ny, width: nw, height: nh },
          doc.width,
          doc.height,
          siblingBounds,
          6 / doc.zoom,
          edgeMask
        );
        if (edgeMask.left) {
          nx += snap.dx;
          nw = Math.max(10, nw - snap.dx);
        } else if (edgeMask.right) {
          nw = Math.max(10, nw + snap.dx);
        }
        if (edgeMask.top) {
          ny += snap.dy;
          nh = Math.max(10, nh - snap.dy);
        } else if (edgeMask.bottom) {
          nh = Math.max(10, nh + snap.dy);
        }
        setActiveGuides(snap.guides);
      } else {
        setActiveGuides([]);
      }

      setLiveResizeDims({ w: Math.round(nw), h: Math.round(nh) });

      if (targetLayer.type === 'raster') {
        updateLayer(targetLayer.id, {
          x: Math.round(nx),
          y: Math.round(ny),
          scaleX: nw / targetLayer.width,
          scaleY: nh / targetLayer.height,
        });
      } else {
        updateLayer(targetLayer.id, {
          x: Math.round(nx),
          y: Math.round(ny),
          width: Math.round(nw),
          height: Math.round(nh),
        });
      }
      return;
    }

    if (d.kind === 'marquee') {
      const rx = Math.min(d.startDocX, docX);
      const ry = Math.min(d.startDocY, docY);
      const rw = Math.max(2, Math.abs(docX - d.startDocX));
      const rh = Math.max(2, Math.abs(docY - d.startDocY));
      setSelection({
        kind: activeTool === 'marquee-rect' ? 'rect' : 'ellipse',
        x: Math.round(rx),
        y: Math.round(ry),
        width: Math.round(rw),
        height: Math.round(rh),
      });
      return;
    }

    if (d.kind === 'lasso-freehand') {
      const last = d.points[d.points.length - 1];
      if (!last || Math.hypot(docX - last.x, docY - last.y) >= Math.max(1.5, 2 / doc.zoom)) {
        d.points.push({ x: docX, y: docY });
        setLassoPreview({ points: [...d.points], cursor: null, isPolygonMode: false });
      }
      return;
    }

    if (d.kind === 'lasso-polygon') {
      d.cursor = { x: docX, y: docY };
      setLassoPreview({ points: [...d.points], cursor: d.cursor, isPolygonMode: true });
      return;
    }

    if (d.kind === 'gradient') {
      let x1 = docX;
      let y1 = docY;
      if (e.shiftKey) {
        const dx = x1 - d.x0;
        const dy = y1 - d.y0;
        const len = Math.hypot(dx, dy);
        const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        x1 = d.x0 + Math.cos(angle) * len;
        y1 = d.y0 + Math.sin(angle) * len;
      }
      d.x1 = x1;
      d.y1 = y1;
      setGradientPreview({ x0: d.x0, y0: d.y0, x1, y1 });
      return;
    }

    if (d.kind === 'shape') {
      d.curDocX = docX;
      d.curDocY = docY;
      setShapePreview({
        x: Math.min(d.startDocX, docX),
        y: Math.min(d.startDocY, docY),
        w: Math.max(4, Math.abs(docX - d.startDocX)),
        h: Math.max(4, Math.abs(docY - d.startDocY)),
      });
      return;
    }

    if (d.kind === 'crop-move') {
      const dx = docX - d.startDocX;
      const dy = docY - d.startDocY;
      const nx = Math.max(0, Math.min(doc.width - d.origCrop.width, d.origCrop.x + dx));
      const ny = Math.max(0, Math.min(doc.height - d.origCrop.height, d.origCrop.y + dy));
      setCropRect({
        ...d.origCrop,
        x: Math.round(nx),
        y: Math.round(ny),
      });
      return;
    }

    if (d.kind === 'crop-handle') {
      const dx = docX - d.startDocX;
      const dy = docY - d.startDocY;
      let { x, y, width, height } = d.origCrop;
      if (d.handle.includes('e')) width = Math.max(16, Math.min(doc.width - x, width + dx));
      if (d.handle.includes('s')) height = Math.max(16, Math.min(doc.height - y, height + dy));
      if (d.handle.includes('w')) {
        const nx = Math.max(0, Math.min(x + width - 16, x + dx));
        width = width + (x - nx);
        x = nx;
      }
      if (d.handle.includes('n')) {
        const ny = Math.max(0, Math.min(y + height - 16, y + dy));
        height = height + (y - ny);
        y = ny;
      }

      // Enforce locked aspect ratio if selected
      const targetRatio = cropRatioFor(toolOptions.cropAspect, toolOptions.cropCustomRatio);
      if (targetRatio) {
        if (d.handle === 'n' || d.handle === 's') {
          width = Math.min(doc.width - x, height * targetRatio);
          height = width / targetRatio;
        } else {
          height = width / targetRatio;
          if (y + height > doc.height) {
            height = doc.height - y;
            width = height * targetRatio;
          }
        }
      }

      setCropRect({
        x: Math.round(x),
        y: Math.round(y),
        width: Math.max(16, Math.round(width)),
        height: Math.max(16, Math.round(height)),
      });
      return;
    }

    if (d.kind === 'clone') {
      const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
      if (!activeLayer) return;
      const editingMask = doc.editingTarget === 'mask' && !!activeLayer.mask;
      const targetCanvas =
        editingMask && activeLayer.mask
          ? activeLayer.mask.canvas
          : activeLayer.type === 'raster'
            ? activeLayer.canvas
            : null;
      if (!targetCanvas) return;

      const did = stepCloneSegment(
        targetCanvas,
        d.srcCanvas,
        editingMask,
        activeLayer,
        d.srcLayer,
        d.lastDocX,
        d.lastDocY,
        docX,
        docY,
        d.startDocX,
        d.startDocY,
        d.srcAnchorX,
        d.srcAnchorY
      );
      if (did) d.painted = true;

      if (doc.selection?.kind === 'mask' && d.prePaintCanvas) {
        maskCanvasDiffBySelection(
          targetCanvas,
          d.prePaintCanvas,
          doc.selection,
          editingMask ? 0 : activeLayer.x,
          editingMask ? 0 : activeLayer.y,
          editingMask ? 1 : activeLayer.scaleX,
          editingMask ? 1 : activeLayer.scaleY
        );
      }

      d.lastDocX = docX;
      d.lastDocY = docY;
      setLiveCloneSamplePos({
        x: d.srcAnchorX + (docX - d.startDocX),
        y: d.srcAnchorY + (docY - d.startDocY),
      });
      refreshLivePaintComposite();
      return;
    }

    if (d.kind === 'heal') {
      const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
      if (!activeLayer) return;
      const editingMask = doc.editingTarget === 'mask' && !!activeLayer.mask;
      const targetCanvas =
        editingMask && activeLayer.mask
          ? activeLayer.mask.canvas
          : activeLayer.type === 'raster'
            ? activeLayer.canvas
            : null;
      if (!targetCanvas) return;

      const did = stepHealSegment(
        targetCanvas,
        editingMask,
        activeLayer,
        d.lastDocX,
        d.lastDocY,
        docX,
        docY
      );
      if (did) d.painted = true;

      if (doc.selection?.kind === 'mask' && d.prePaintCanvas) {
        maskCanvasDiffBySelection(
          targetCanvas,
          d.prePaintCanvas,
          doc.selection,
          editingMask ? 0 : activeLayer.x,
          editingMask ? 0 : activeLayer.y,
          editingMask ? 1 : activeLayer.scaleX,
          editingMask ? 1 : activeLayer.scaleY
        );
      }

      d.lastDocX = docX;
      d.lastDocY = docY;
      refreshLivePaintComposite();
      return;
    }

    if (d.kind === 'dodge-burn' || d.kind === 'smudge-blur') {
      const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
      if (!activeLayer) return;
      const editingMask = doc.editingTarget === 'mask' && !!activeLayer.mask;
      const targetCanvas =
        editingMask && activeLayer.mask
          ? activeLayer.mask.canvas
          : activeLayer.type === 'raster'
            ? activeLayer.canvas
            : null;
      if (!targetCanvas) return;

      const did =
        d.kind === 'dodge-burn'
          ? stepDodgeBurnSegment(
              targetCanvas,
              editingMask,
              activeLayer,
              d.lastDocX,
              d.lastDocY,
              docX,
              docY
            )
          : stepSmudgeBlurSegment(
              targetCanvas,
              editingMask,
              activeLayer,
              d.lastDocX,
              d.lastDocY,
              docX,
              docY
            );
      if (did) d.painted = true;

      if (doc.selection?.kind === 'mask' && d.prePaintCanvas) {
        maskCanvasDiffBySelection(
          targetCanvas,
          d.prePaintCanvas,
          doc.selection,
          editingMask ? 0 : activeLayer.x,
          editingMask ? 0 : activeLayer.y,
          editingMask ? 1 : activeLayer.scaleX,
          editingMask ? 1 : activeLayer.scaleY
        );
      }

      d.lastDocX = docX;
      d.lastDocY = docY;
      if (did) refreshLivePaintComposite();
      return;
    }

    if (d.kind === 'paint') {
      const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
      if (!activeLayer) return;
      const editingMask = doc.editingTarget === 'mask' && !!activeLayer.mask;
      const targetCanvas =
        editingMask && activeLayer.mask
          ? activeLayer.mask.canvas
          : activeLayer.type === 'raster'
            ? activeLayer.canvas
            : null;
      if (!targetCanvas) return;

      const offX = editingMask ? 0 : activeLayer.x;
      const offY = editingMask ? 0 : activeLayer.y;
      const scX = editingMask ? 1 : activeLayer.scaleX;
      const scY = editingMask ? 1 : activeLayer.scaleY;

      stepBrushOrEraser(
        targetCanvas,
        activeLayer,
        offX,
        offY,
        scX,
        scY,
        d.lastDocX,
        d.lastDocY,
        docX,
        docY,
        activeTool === 'eraser',
        editingMask
      );

      if (doc.selection && d.prePaintCanvas) {
        maskCanvasDiffBySelection(
          targetCanvas,
          d.prePaintCanvas,
          doc.selection,
          offX,
          offY,
          scX,
          scY
        );
      }

      d.lastDocX = docX;
      d.lastDocY = docY;
      refreshLivePaintComposite();
    }
  };

  const handlePointerUp = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (e?.pointerType === 'touch') {
      const wasPinching = pinchRef.current !== null;
      touchPointsRef.current.delete(e.pointerId);
      if (touchPointsRef.current.size < 2) pinchRef.current = null;
      // Lifting a finger after a pinch must not commit or start anything else.
      if (wasPinching) return;
    }
    const d = dragRef.current;
    if (d.kind === 'lasso-polygon') {
      return;
    }
    dragRef.current = { kind: 'none' };
    setActiveGuides([]);
    setLiveCloneSamplePos(null);
    setLiveRotateDeg(null);
    setLiveResizeDims(null);

    if (d.kind === 'move-layer') {
      commitCanvasMutation('Move Layer');
    } else if (d.kind === 'resize-layer') {
      commitCanvasMutation('Transform Layer');
    } else if (d.kind === 'rotate-layer') {
      commitCanvasMutation('Rotate Layer');
    } else if (d.kind === 'lasso-freehand') {
      setLassoPreview(null);
      if (d.points.length >= 3) {
        const bounds = computePolygonBounds(d.points);
        setSelection({
          kind: 'polygon',
          ...bounds,
          points: d.points,
        });
      }
    } else if (d.kind === 'gradient') {
      setGradientPreview(null);
      if (doc && Math.hypot(d.x1 - d.x0, d.y1 - d.y0) >= 2) {
        const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
        const editingMask = doc.editingTarget === 'mask' && !!activeLayer?.mask;
        if (activeLayer && !activeLayer.locked) {
          if (editingMask && activeLayer.mask) {
            applyGradientToCanvas({
              targetCanvas: activeLayer.mask.canvas,
              x0: d.x0,
              y0: d.y0,
              x1: d.x1,
              y1: d.y1,
              offsetX: 0,
              offsetY: 0,
              scaleX: 1,
              scaleY: 1,
              kind: toolOptions.gradientKind,
              style: toolOptions.gradientStyle,
              startColor: foregroundColor,
              endColor: backgroundColor,
              opacity: toolOptions.gradientOpacity,
              selection: doc.selection,
            });
            commitCanvasMutation('Gradient Mask');
          } else if (activeLayer.type === 'raster') {
            applyGradientToCanvas({
              targetCanvas: activeLayer.canvas,
              x0: d.x0,
              y0: d.y0,
              x1: d.x1,
              y1: d.y1,
              offsetX: activeLayer.x,
              offsetY: activeLayer.y,
              scaleX: activeLayer.scaleX,
              scaleY: activeLayer.scaleY,
              kind: toolOptions.gradientKind,
              style: toolOptions.gradientStyle,
              startColor: foregroundColor,
              endColor: backgroundColor,
              opacity: toolOptions.gradientOpacity,
              selection: doc.selection,
            });
            commitCanvasMutation('Gradient Fill');
          }
        }
      }
    } else if (d.kind === 'clone' && d.painted) {
      const editingMask = doc?.editingTarget === 'mask';
      commitCanvasMutation(editingMask ? 'Clone Stamp Mask' : 'Clone Stamp');
    } else if (d.kind === 'heal' && d.painted) {
      const editingMask = doc?.editingTarget === 'mask';
      commitCanvasMutation(
        editingMask
          ? 'Spot Heal Mask'
          : toolOptions.spotHealMode === 'red-eye'
            ? 'Red-Eye Removal'
            : 'Spot Heal'
      );
    } else if (d.kind === 'dodge-burn' && d.painted) {
      const editingMask = doc?.editingTarget === 'mask';
      commitCanvasMutation(editingMask ? 'Dodge/Burn Mask' : 'Dodge/Burn Stroke');
    } else if (d.kind === 'smudge-blur' && d.painted) {
      const editingMask = doc?.editingTarget === 'mask';
      commitCanvasMutation(editingMask ? 'Smudge/Detail Mask' : 'Smudge/Detail Stroke');
    } else if (d.kind === 'paint' && d.painted) {
      const editingMask = doc?.editingTarget === 'mask';
      commitCanvasMutation(
        editingMask
          ? activeTool === 'eraser'
            ? 'Mask Erase Stroke'
            : 'Mask Brush Stroke'
          : activeTool === 'eraser'
            ? 'Eraser Stroke'
            : toolOptions.brushMode === 'color-replace'
              ? 'Color Replace Brush'
              : 'Brush Stroke'
      );
    } else if (d.kind === 'shape') {
      const x = Math.min(d.startDocX, d.curDocX);
      const y = Math.min(d.startDocY, d.curDocY);
      const w = Math.max(24, Math.abs(d.curDocX - d.startDocX));
      const h = Math.max(24, Math.abs(d.curDocY - d.startDocY));
      setShapePreview(null);
      addShapeLayer(x, y, w, h);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!doc) return;
    if (activeTool === 'lasso' && dragRef.current.kind === 'lasso-polygon') {
      const pts = [...dragRef.current.points];
      dragRef.current = { kind: 'none' };
      setLassoPreview(null);
      if (pts.length >= 3) {
        const bounds = computePolygonBounds(pts);
        setSelection({ kind: 'polygon', ...bounds, points: pts });
      }
      return;
    }
    if (activeTool === 'crop' && cropRect) {
      applyCrop();
      return;
    }
    const { x: docX, y: docY } = screenToDoc(e.clientX, e.clientY);
    const hitText = [...doc.layers]
      .reverse()
      .find((l): l is Layer & { type: 'text' } => {
        if (l.type !== 'text' || !l.visible) return false;
        const local = docPointToLayerLocal(docX, docY, l);
        return local.x >= 0 && local.x <= l.width && local.y >= 0 && local.y <= l.height;
      });
    if (hitText) {
      setEditingTextLayerId(hitText.id);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!doc) return;
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || activeTool === 'zoom') {
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const nextZoom = Math.max(0.05, Math.min(16, doc.zoom * factor));
        const ratio = nextZoom / doc.zoom;
        const { sx, sy } = screenToDoc(e.clientX, e.clientY);
        const rulerOffset = viewportSettings.showRulers ? RULER_SIZE : 0;
        const cx = rulerOffset + (containerSize.width - rulerOffset) / 2;
        const cy = rulerOffset + (containerSize.height - rulerOffset) / 2;
        const nextPanX = sx - cx - (sx - cx - doc.panX) * ratio;
        const nextPanY = sy - cy - (sy - cy - doc.panY) * ratio;
        setZoom(nextZoom, nextPanX, nextPanY);
      } else {
        setPan(doc.panX - e.deltaX, doc.panY - e.deltaY);
      }
    }
  };

  const cursorStyle = (() => {
    if (spacePressed || activeTool === 'hand') return 'grab';
    if (activeTool === 'zoom') return 'zoom-in';
    if (
      activeTool === 'brush' ||
      activeTool === 'eraser' ||
      activeTool === 'clone-stamp' ||
      activeTool === 'spot-heal' ||
      activeTool === 'dodge-burn' ||
      activeTool === 'smudge-blur'
    ) {
      return 'none';
    }
    if (activeTool === 'text') return 'text';
    if (activeTool === 'move') return 'default';
    return 'crosshair';
  })();

  if (!doc) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-xs text-[var(--lp-text-secondary)]"
        style={{ backgroundColor: 'var(--lp-workspace)' }}
      >
        No open document
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => {
        setCursorScreen(null);
        setCursorCanvasPos(null);
        setCursorPixelColor(null);
      }}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
      className="flex-1 relative overflow-hidden select-none mac-workspace-well"
      style={{
        cursor: cursorStyle,
        touchAction: 'none',
      }}
    >
      <canvas
        ref={displayCanvasRef}
        className="absolute inset-0 w-full h-full block pointer-events-none"
      />

      {/* Before / After Floating Indicator */}
      {viewportSettings.beforeAfterMode === 'split' && (
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 px-3 py-1 rounded-md border text-[11px] pointer-events-none backdrop-blur-md"
          style={{
            backgroundColor: 'var(--lp-panel)',
            borderColor: 'var(--lp-border-strong)',
          }}
        >
          <span>Before (Original)</span>
          <span className="text-[var(--lp-text-secondary)]">|</span>
          <span className="text-[#0A84FF] font-medium">After (Adjusted)</span>
        </div>
      )}
      {viewportSettings.beforeAfterMode === 'hold' && (
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-md border text-[11px] pointer-events-none backdrop-blur-md"
          style={{
            backgroundColor: 'var(--lp-panel)',
            borderColor: 'var(--lp-border-strong)',
          }}
        >
          Showing Original (Before Adjustments)
        </div>
      )}

      {/* Rulers */}
      {viewportSettings.showRulers && (
        <>
          <div
            className="absolute top-0 left-0 border-r border-b z-10 pointer-events-none"
            style={{
              width: RULER_SIZE,
              height: RULER_SIZE,
              backgroundColor: 'var(--lp-ruler-bg)',
              borderColor: 'var(--lp-border)',
            }}
          />
          <canvas
            ref={rulerTopRef}
            className="absolute top-0 border-b z-10 pointer-events-none"
            style={{
              left: RULER_SIZE,
              width: `calc(100% - ${RULER_SIZE}px)`,
              height: RULER_SIZE,
              backgroundColor: 'var(--lp-ruler-bg)',
              borderColor: 'var(--lp-border)',
            }}
          />
          <canvas
            ref={rulerLeftRef}
            className="absolute left-0 border-r z-10 pointer-events-none"
            style={{
              top: RULER_SIZE,
              width: RULER_SIZE,
              height: `calc(100% - ${RULER_SIZE}px)`,
              backgroundColor: 'var(--lp-ruler-bg)',
              borderColor: 'var(--lp-border)',
            }}
          />
        </>
      )}
    </div>
  );
};
