import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye,
  Grid3x3,
  Move,
  RotateCcw,
  RotateCw,
  Shrink,
  Expand,
  Undo2,
  Waves,
  X,
  Eraser,
} from 'lucide-react';
import {
  applyLiquifyDab,
  applyLiquifyStroke,
  cloneLiquifyField,
  createLiquifyField,
  renderLiquifyBuffer,
  resetLiquifyField,
  type LiquifyField,
  type LiquifyMode,
} from '../../engine/liquify';
import { useEditorStore } from '../../store/useEditorStore';

const LIQUIFY_MODES: Array<{
  id: LiquifyMode;
  label: string;
  desc: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'push', label: 'Push', desc: 'Forward warp pixels along drag direction', icon: Move },
  { id: 'bloat', label: 'Bloat', desc: 'Radially expand outward from brush center', icon: Expand },
  { id: 'pinch', label: 'Pinch', desc: 'Radially pull inward toward brush center', icon: Shrink },
  { id: 'twirl-cw', label: 'Twirl CW', desc: 'Clockwise spiral vortex distortion', icon: RotateCw },
  { id: 'twirl-ccw', label: 'Twirl CCW', desc: 'Counter-clockwise spiral vortex', icon: RotateCcw },
  { id: 'reconstruct', label: 'Restore', desc: 'Brush away warp back to original pixels', icon: Eraser },
];

export const LiquifyModal: React.FC = () => {
  const { modals, closeModal, documents, activeDocumentId, applyLiquifyToActiveLayer } =
    useEditorStore();

  const doc = documents.find((d) => d.id === activeDocumentId);
  const activeLayer = doc?.layers.find((l) => l.id === doc.activeLayerId) ?? null;
  const isValidRaster = !!activeLayer && activeLayer.type === 'raster' && !activeLayer.locked;

  const [mode, setMode] = useState<LiquifyMode>('push');
  const [brushSize, setBrushSize] = useState(48);
  const [strength, setStrength] = useState(60);
  const [density, setDensity] = useState(50);
  const [showMesh, setShowMesh] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [strokeHistoryLen, setStrokeHistoryLen] = useState(0);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const meshCanvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<LiquifyField | null>(null);
  const historyRef = useRef<LiquifyField[]>([]);
  const draggingRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  });

  const previewSource = useMemo(() => {
    if (!modals.liquify || !activeLayer || activeLayer.type !== 'raster') return null;
    const srcCanvas = activeLayer.canvas;
    const maxSide = 440;
    const scale = Math.min(1, maxSide / Math.max(1, srcCanvas.width, srcCanvas.height));
    const pw = Math.max(2, Math.round(srcCanvas.width * scale));
    const ph = Math.max(2, Math.round(srcCanvas.height * scale));
    const tmp = document.createElement('canvas');
    tmp.width = pw;
    tmp.height = ph;
    const ctx = tmp.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(srcCanvas, 0, 0, pw, ph);
    const img = ctx.getImageData(0, 0, pw, ph);
    return { width: pw, height: ph, data: img.data, scale };
  }, [modals.liquify, activeLayer]);

  const drawPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    const meshCanvas = meshCanvasRef.current;
    const field = fieldRef.current;
    if (!canvas || !previewSource || !field) return;

    if (canvas.width !== previewSource.width || canvas.height !== previewSource.height) {
      canvas.width = previewSource.width;
      canvas.height = previewSource.height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (showOriginal) {
      ctx.putImageData(
        new ImageData(
          new Uint8ClampedArray(previewSource.data),
          previewSource.width,
          previewSource.height
        ),
        0,
        0
      );
    } else {
      const warped = renderLiquifyBuffer(
        previewSource.data,
        previewSource.width,
        previewSource.height,
        field
      );
      ctx.putImageData(
        new ImageData(new Uint8ClampedArray(warped), previewSource.width, previewSource.height),
        0,
        0
      );
    }

    if (meshCanvas) {
      if (meshCanvas.width !== previewSource.width || meshCanvas.height !== previewSource.height) {
        meshCanvas.width = previewSource.width;
        meshCanvas.height = previewSource.height;
      }
      const mctx = meshCanvas.getContext('2d');
      if (mctx) {
        mctx.clearRect(0, 0, previewSource.width, previewSource.height);
        if (showMesh && !showOriginal) {
          const w = previewSource.width;
          const h = previewSource.height;
          const step = Math.max(14, Math.round(Math.min(w, h) / 16));
          mctx.strokeStyle = 'rgba(10, 132, 255, 0.52)';
          mctx.lineWidth = 1;

          // Sample forward displacement approximation by inverting local field vector
          for (let gy = 0; gy < h; gy += step) {
            mctx.beginPath();
            for (let gx = 0; gx < w; gx += 4) {
              const idx = gy * w + gx;
              const px = gx - field.dx[idx];
              const py = gy - field.dy[idx];
              if (gx === 0) mctx.moveTo(px, py);
              else mctx.lineTo(px, py);
            }
            mctx.stroke();
          }
          for (let gx = 0; gx < w; gx += step) {
            mctx.beginPath();
            for (let gy = 0; gy < h; gy += 4) {
              const idx = gy * w + gx;
              const px = gx - field.dx[idx];
              const py = gy - field.dy[idx];
              if (gy === 0) mctx.moveTo(px, py);
              else mctx.lineTo(px, py);
            }
            mctx.stroke();
          }
        }
      }
    }
  }, [previewSource, showMesh, showOriginal]);

  useEffect(() => {
    if (!modals.liquify || !previewSource) return;
    fieldRef.current = createLiquifyField(previewSource.width, previewSource.height);
    historyRef.current = [];
    setStrokeHistoryLen(0);
    setShowOriginal(false);
    drawPreview();
  }, [modals.liquify, previewSource, drawPreview]);

  useEffect(() => {
    if (modals.liquify) drawPreview();
  }, [modals.liquify, showMesh, showOriginal, drawPreview]);

  if (!modals.liquify || !doc) return null;

  const toCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !previewSource) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * previewSource.width,
      y: ((clientY - rect.top) / rect.height) * previewSource.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isValidRaster || !fieldRef.current || !previewSource) return;
    const pt = toCanvasCoords(e.clientX, e.clientY);
    if (!pt) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    // Snapshot for undo stroke
    historyRef.current = [...historyRef.current.slice(-14), cloneLiquifyField(fieldRef.current)];
    setStrokeHistoryLen(historyRef.current.length);

    draggingRef.current = { active: true, lastX: pt.x, lastY: pt.y };
    setCursorPos(pt);

    if (mode !== 'push') {
      applyLiquifyDab(fieldRef.current, {
        mode,
        x: pt.x,
        y: pt.y,
        prevX: pt.x,
        prevY: pt.y,
        radius: brushSize / 2,
        strength,
        density,
      });
      drawPreview();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = toCanvasCoords(e.clientX, e.clientY);
    if (!pt) return;
    setCursorPos(pt);

    if (!draggingRef.current.active || !fieldRef.current) return;
    applyLiquifyStroke(fieldRef.current, draggingRef.current.lastX, draggingRef.current.lastY, pt.x, pt.y, {
      mode,
      radius: brushSize / 2,
      strength,
      density,
    });
    draggingRef.current.lastX = pt.x;
    draggingRef.current.lastY = pt.y;
    drawPreview();
  };

  const handlePointerUp = () => {
    draggingRef.current.active = false;
  };

  const handleUndoStroke = () => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    fieldRef.current = prev;
    setStrokeHistoryLen(historyRef.current.length);
    drawPreview();
  };

  const handleReset = () => {
    if (!fieldRef.current) return;
    historyRef.current = [...historyRef.current.slice(-14), cloneLiquifyField(fieldRef.current)];
    setStrokeHistoryLen(historyRef.current.length);
    resetLiquifyField(fieldRef.current);
    drawPreview();
  };

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidRaster || !fieldRef.current) return;
    applyLiquifyToActiveLayer(fieldRef.current);
    closeModal('liquify');
  };

  const activeMeta = LIQUIFY_MODES.find((m) => m.id === mode) ?? LIQUIFY_MODES[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleApply}
        className="w-full max-w-3xl rounded-xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        style={{
          backgroundColor: 'var(--lp-panel)',
          borderColor: 'var(--lp-border-strong)',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <div className="flex items-center gap-2">
            <Waves className="w-4 h-4 text-[#0A84FF]" />
            <div>
              <h2 className="text-[13px] font-semibold">Liquify Mesh Studio</h2>
              <p className="text-[11px] text-[var(--lp-text-secondary)]">
                Interactive continuous vector-field sculpting with bilinear sub-pixel resampling
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => closeModal('liquify')}
            className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-[12px] overflow-y-auto">
          {!isValidRaster && (
            <div className="rounded-lg border border-[#FF9F0A]/40 bg-[#FF9F0A]/10 px-3 py-2 text-[11px] text-[#FF9F0A]">
              {activeLayer?.locked
                ? 'Active layer is locked. Unlock it in Layers before applying Liquify.'
                : 'Liquify operates on raster layers. Select a Raster Layer (or Rasterize a Text/Shape layer first).'}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-4 items-start">
            {/* Interactive Warp Viewport */}
            <div className="space-y-2">
              <div
                className="relative rounded-lg border checkerboard-bg flex items-center justify-center min-h-[300px] overflow-hidden p-3 select-none"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                {previewSource ? (
                  <div
                    className="relative inline-block"
                    style={{ width: previewSource.width, height: previewSource.height }}
                  >
                    <canvas
                      ref={previewCanvasRef}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      onPointerLeave={() => {
                        handlePointerUp();
                        setCursorPos(null);
                      }}
                      className="block w-full h-full shadow-md touch-none cursor-crosshair"
                    />
                    <canvas
                      ref={meshCanvasRef}
                      className="absolute inset-0 w-full h-full pointer-events-none"
                    />
                    {cursorPos && isValidRaster && (
                      <div
                        className="absolute rounded-full border border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.5)] pointer-events-none -translate-x-1/2 -translate-y-1/2"
                        style={{
                          left: cursorPos.x,
                          top: cursorPos.y,
                          width: brushSize,
                          height: brushSize,
                        }}
                      />
                    )}
                    {showOriginal && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/75 text-white text-[10px] font-medium pointer-events-none">
                        Original
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[11px] text-[var(--lp-text-secondary)]">
                    No raster layer preview available
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-[var(--lp-text-secondary)]">
                  {doc.selection
                    ? 'Applies inside active selection'
                    : 'Drag on image to sculpt mesh'}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowMesh((v) => !v)}
                    className={`px-2 py-1 rounded border text-[11px] flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                      showMesh
                        ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/45'
                        : 'hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)]'
                    }`}
                    style={{ borderColor: showMesh ? undefined : 'var(--lp-border)' }}
                  >
                    <Grid3x3 className="w-3 h-3" />
                    <span>Mesh</span>
                  </button>
                  <button
                    type="button"
                    onPointerDown={() => setShowOriginal(true)}
                    onPointerUp={() => setShowOriginal(false)}
                    onPointerLeave={() => setShowOriginal(false)}
                    className="px-2 py-1 rounded border text-[11px] flex items-center gap-1 hover:bg-[var(--lp-hover)] cursor-pointer whitespace-nowrap"
                    style={{ borderColor: 'var(--lp-border)' }}
                  >
                    <Eye className="w-3 h-3" />
                    <span>Hold Original</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Tool & Brush Inspector */}
            <div
              className="rounded-lg border p-3 space-y-3"
              style={{
                backgroundColor: 'var(--lp-bg)',
                borderColor: 'var(--lp-border)',
              }}
            >
              <div className="space-y-1.5">
                <span className="text-[11px] text-[var(--lp-text-secondary)] block">
                  Sculpt Mode
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {LIQUIFY_MODES.map((m) => {
                    const Icon = m.icon;
                    const active = mode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMode(m.id)}
                        className={`px-2 py-1.5 rounded-md border text-[11px] font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
                          active
                            ? 'bg-[#0A84FF] text-white border-[#0A84FF]'
                            : 'hover:bg-[var(--lp-hover)] text-[var(--lp-text)]'
                        }`}
                        style={{ borderColor: active ? '#0A84FF' : 'var(--lp-border)' }}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-[var(--lp-text-secondary)] leading-relaxed pt-0.5">
                  {activeMeta.desc}
                </p>
              </div>

              <div className="h-px" style={{ backgroundColor: 'var(--lp-border)' }} />

              <div className="space-y-2.5">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[var(--lp-text-secondary)]">Brush Size</span>
                    <span className="font-mono-tabular">{brushSize} px</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={140}
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="lp-slider w-full"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[var(--lp-text-secondary)]">Strength</span>
                    <span className="font-mono-tabular">{strength}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    value={strength}
                    onChange={(e) => setStrength(Number(e.target.value))}
                    className="lp-slider w-full"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[var(--lp-text-secondary)]">Falloff Density</span>
                    <span className="font-mono-tabular">{density}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={density}
                    onChange={(e) => setDensity(Number(e.target.value))}
                    className="lp-slider w-full"
                  />
                </div>
              </div>

              <div className="h-px" style={{ backgroundColor: 'var(--lp-border)' }} />

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={strokeHistoryLen === 0}
                  onClick={handleUndoStroke}
                  className="py-1.5 px-2 rounded border text-[11px] flex items-center justify-center gap-1 hover:bg-[var(--lp-hover)] disabled:opacity-35 cursor-pointer whitespace-nowrap"
                  style={{ borderColor: 'var(--lp-border)' }}
                >
                  <Undo2 className="w-3 h-3" />
                  <span>Undo Stroke</span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="py-1.5 px-2 rounded border text-[11px] flex items-center justify-center gap-1 hover:bg-[var(--lp-hover)] cursor-pointer whitespace-nowrap"
                  style={{ borderColor: 'var(--lp-border)' }}
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Mesh</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          className="px-4 py-3 border-t flex items-center justify-end gap-2"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <button
            type="button"
            onClick={() => closeModal('liquify')}
            className="px-3.5 py-1.5 rounded-lg border text-[12px] hover:bg-[var(--lp-hover)] cursor-pointer whitespace-nowrap"
            style={{ borderColor: 'var(--lp-border)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isValidRaster}
            className="px-4 py-1.5 rounded-lg bg-[#0A84FF] hover:bg-[#0A84FF]/90 disabled:opacity-40 text-white text-[12px] font-medium cursor-pointer whitespace-nowrap"
          >
            Apply Liquify
          </button>
        </div>
      </form>
    </div>
  );
};
