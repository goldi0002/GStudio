import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Grid3x3, RotateCcw, Scan, X } from 'lucide-react';
import { warpBufferPerspective } from '../../engine/canvasOps';
import { useEditorStore } from '../../store/useEditorStore';

interface CornerNorm {
  x: number; // 0..1 relative to layer width
  y: number; // 0..1 relative to layer height
}

const DEFAULT_CORNERS: CornerNorm[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

const CORNER_LABELS = ['TL', 'TR', 'BR', 'BL'];

export const PerspectiveModal: React.FC = () => {
  const { modals, closeModal, documents, activeDocumentId, applyPerspectiveToActiveLayer } =
    useEditorStore();

  const doc = documents.find((d) => d.id === activeDocumentId);
  const activeLayer = doc?.layers.find((l) => l.id === doc.activeLayerId) ?? null;
  const isValidRaster = !!activeLayer && activeLayer.type === 'raster' && !activeLayer.locked;

  const [corners, setCorners] = useState<CornerNorm[]>(DEFAULT_CORNERS);
  const [vKeystone, setVKeystone] = useState(0); // -45..45
  const [hKeystone, setHKeystone] = useState(0); // -45..45
  const [showGrid, setShowGrid] = useState(true);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (modals.perspective) {
      setCorners(DEFAULT_CORNERS.map((c) => ({ ...c })));
      setVKeystone(0);
      setHKeystone(0);
    }
  }, [modals.perspective]);

  const applyKeystoneSliders = (vk: number, hk: number) => {
    setVKeystone(vk);
    setHKeystone(hk);
    const vx = (vk / 100) * 0.45;
    const hy = (hk / 100) * 0.45;
    setCorners([
      { x: vx > 0 ? vx : 0, y: hy > 0 ? hy : 0 },
      { x: vx > 0 ? 1 - vx : 1, y: hy < 0 ? -hy : 0 },
      { x: vx < 0 ? 1 + vx : 1, y: hy < 0 ? 1 + hy : 1 },
      { x: vx < 0 ? -vx : 0, y: hy > 0 ? 1 - hy : 1 },
    ]);
  };

  const previewSource = useMemo(() => {
    if (!modals.perspective || !activeLayer || activeLayer.type !== 'raster') return null;
    const srcCanvas = activeLayer.canvas;
    const maxSide = 360;
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
    return {
      width: pw,
      height: ph,
      data: ctx.getImageData(0, 0, pw, ph).data,
    };
  }, [modals.perspective, activeLayer]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !previewSource) return;
    canvas.width = previewSource.width;
    canvas.height = previewSource.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dstPts = corners.map((c) => ({
      x: c.x * (previewSource.width - 1),
      y: c.y * (previewSource.height - 1),
    }));
    const warped = warpBufferPerspective(
      previewSource.data,
      previewSource.width,
      previewSource.height,
      dstPts
    );
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(warped), previewSource.width, previewSource.height),
      0,
      0
    );
  }, [previewSource, corners]);

  if (!modals.perspective || !doc) return null;

  const updateCornerFromClient = (clientX: number, clientY: number, idx: number) => {
    const el = previewCanvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    setCorners((prev) => prev.map((c, i) => (i === idx ? { x: nx, y: ny } : c)));
  };

  const handleReset = () => {
    setCorners(DEFAULT_CORNERS.map((c) => ({ ...c })));
    setVKeystone(0);
    setHKeystone(0);
  };

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidRaster || activeLayer?.type !== 'raster') return;
    const w = activeLayer.canvas.width;
    const h = activeLayer.canvas.height;
    const dstCorners = corners.map((c) => ({
      x: c.x * Math.max(1, w - 1),
      y: c.y * Math.max(1, h - 1),
    }));
    applyPerspectiveToActiveLayer(dstCorners);
    closeModal('perspective');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleApply}
        className="w-full max-w-xl rounded-xl border shadow-2xl overflow-hidden"
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
            <Scan className="w-4 h-4 text-[#0A84FF]" />
            <h2 className="text-[13px] font-semibold">Perspective & Keystone Transform</h2>
          </div>
          <button
            type="button"
            onClick={() => closeModal('perspective')}
            className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-[12px]">
          {!isValidRaster && (
            <div className="rounded-lg border border-[#FF9F0A]/40 bg-[#FF9F0A]/10 px-3 py-2 text-[11px] text-[#FF9F0A]">
              {activeLayer?.locked
                ? 'Active layer is locked. Unlock it before transforming perspective.'
                : 'Select a Raster Layer (or Rasterize a Text/Shape layer) to apply Perspective warp.'}
            </div>
          )}

          {/* Interactive Warp Stage */}
          <div
            ref={stageRef}
            onPointerMove={(e) => {
              if (draggingIdx !== null) updateCornerFromClient(e.clientX, e.clientY, draggingIdx);
            }}
            onPointerUp={() => setDraggingIdx(null)}
            onPointerCancel={() => setDraggingIdx(null)}
            className="rounded-lg border checkerboard-bg flex items-center justify-center p-5 min-h-[260px] select-none"
            style={{ borderColor: 'var(--lp-border)' }}
          >
            {previewSource ? (
              <div className="relative inline-block">
                <canvas
                  ref={previewCanvasRef}
                  className="block max-w-full max-h-[300px] shadow-md"
                  style={{
                    width: previewSource.width,
                    height: previewSource.height,
                  }}
                />
                {/* Alignment Grid + Quad Outline */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  {showGrid &&
                    [25, 50, 75].map((pct) => (
                      <React.Fragment key={pct}>
                        <line
                          x1={pct}
                          y1={0}
                          x2={pct}
                          y2={100}
                          stroke="rgba(255,255,255,0.22)"
                          strokeWidth={0.4}
                        />
                        <line
                          x1={0}
                          y1={pct}
                          x2={100}
                          y2={pct}
                          stroke="rgba(255,255,255,0.22)"
                          strokeWidth={0.4}
                        />
                      </React.Fragment>
                    ))}
                  <polygon
                    points={corners.map((c) => `${c.x * 100},${c.y * 100}`).join(' ')}
                    fill="none"
                    stroke="#0A84FF"
                    strokeWidth={1.1}
                    strokeDasharray="2 1.5"
                  />
                </svg>
                {/* 4 Draggable Corner Handles */}
                {corners.map((c, idx) => (
                  <button
                    key={CORNER_LABELS[idx]}
                    type="button"
                    title={`Drag ${CORNER_LABELS[idx]} corner`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                      setDraggingIdx(idx);
                    }}
                    onPointerMove={(e) => {
                      if (draggingIdx === idx) {
                        updateCornerFromClient(e.clientX, e.clientY, idx);
                      }
                    }}
                    onPointerUp={() => setDraggingIdx(null)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#0A84FF] border-2 border-white shadow-md cursor-grab active:cursor-grabbing"
                    style={{
                      left: `${c.x * 100}%`,
                      top: `${c.y * 100}%`,
                    }}
                  />
                ))}
              </div>
            ) : (
              <span className="text-[11px] text-[var(--lp-text-secondary)]">
                No raster layer available
              </span>
            )}
          </div>

          {/* Keystone Sliders & Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--lp-text-secondary)]">Vertical Keystone</span>
                <span className="font-mono-tabular">{vKeystone}%</span>
              </div>
              <input
                type="range"
                min={-45}
                max={45}
                value={vKeystone}
                onChange={(e) => applyKeystoneSliders(Number(e.target.value), hKeystone)}
                className="lp-slider w-full"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--lp-text-secondary)]">Horizontal Keystone</span>
                <span className="font-mono-tabular">{hKeystone}%</span>
              </div>
              <input
                type="range"
                min={-45}
                max={45}
                value={hKeystone}
                onChange={(e) => applyKeystoneSliders(vKeystone, Number(e.target.value))}
                className="lp-slider w-full"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={() => setShowGrid((g) => !g)}
              className={`px-2.5 py-1 rounded border flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                showGrid
                  ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/45'
                  : 'hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)]'
              }`}
              style={{ borderColor: showGrid ? undefined : 'var(--lp-border)' }}
            >
              <Grid3x3 className="w-3.5 h-3.5" />
              <span>Alignment Grid</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 py-1 rounded border flex items-center gap-1.5 hover:bg-[var(--lp-hover)] cursor-pointer whitespace-nowrap"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Corners</span>
            </button>
          </div>
        </div>

        <div
          className="px-4 py-3 border-t flex items-center justify-end gap-2"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <button
            type="button"
            onClick={() => closeModal('perspective')}
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
            Apply Perspective
          </button>
        </div>
      </form>
    </div>
  );
};
