import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Sparkles, X } from 'lucide-react';
import {
  applyGalleryFilterBuffer,
  DEFAULT_GALLERY_FILTER_PARAMS,
  type GalleryFilterParams,
} from '../../engine/filters';
import { useEditorStore } from '../../store/useEditorStore';
import type { FilterGalleryKind } from '../../types/editor';

const FILTER_TABS: Array<{ id: FilterGalleryKind; label: string; desc: string }> = [
  {
    id: 'high-pass',
    label: 'High Pass',
    desc: 'Retains sharp edge detail on neutral gray—ideal on an Overlay or Soft Light layer for crisp sharpening.',
  },
  {
    id: 'motion-blur',
    label: 'Motion Blur',
    desc: 'Directional streak blur simulating camera pan or fast subject movement.',
  },
  {
    id: 'oil-paint',
    label: 'Oil Paint',
    desc: 'Painterly brushstroke stylization using local intensity-bucket clustering.',
  },
  {
    id: 'halftone',
    label: 'Halftone',
    desc: 'Classic monochrome print dot screen scaled by local region luminance.',
  },
  {
    id: 'emboss',
    label: 'Emboss',
    desc: 'Directional 3D relief shading centered on neutral gray.',
  },
  {
    id: 'edge-detect',
    label: 'Edge Detect',
    desc: '3×3 Sobel gradient magnitude extraction highlighting contours and high-contrast edges.',
  },
];

export const FilterGalleryModal: React.FC = () => {
  const {
    modals,
    filterGalleryKind,
    setFilterGalleryKind,
    closeModal,
    documents,
    activeDocumentId,
    applyGalleryFilterToLayer,
  } = useEditorStore();

  const doc = documents.find((d) => d.id === activeDocumentId);
  const activeLayer = doc?.layers.find((l) => l.id === doc.activeLayerId) ?? null;
  const isValidRaster = !!activeLayer && activeLayer.type === 'raster' && !activeLayer.locked;

  const [params, setParams] = useState<GalleryFilterParams>(DEFAULT_GALLERY_FILTER_PARAMS);
  const [showOriginal, setShowOriginal] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (modals.filterGallery) {
      setParams((p) => ({ ...p, kind: filterGalleryKind }));
      setShowOriginal(false);
    }
  }, [modals.filterGallery, filterGalleryKind]);

  // Extract a bounded preview buffer (max 340px) from the active raster layer
  const previewSource = useMemo(() => {
    if (!modals.filterGallery || !activeLayer || activeLayer.type !== 'raster') return null;
    const srcCanvas = activeLayer.canvas;
    const maxSide = 340;
    const scale = Math.min(1, maxSide / Math.max(1, srcCanvas.width, srcCanvas.height));
    const pw = Math.max(1, Math.round(srcCanvas.width * scale));
    const ph = Math.max(1, Math.round(srcCanvas.height * scale));
    const tmp = document.createElement('canvas');
    tmp.width = pw;
    tmp.height = ph;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    if (!tctx) return null;
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(srcCanvas, 0, 0, pw, ph);
    const img = tctx.getImageData(0, 0, pw, ph);
    return { width: pw, height: ph, data: img.data, scale };
  }, [modals.filterGallery, activeLayer]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !previewSource) return;
    canvas.width = previewSource.width;
    canvas.height = previewSource.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (showOriginal) {
      ctx.putImageData(
        new ImageData(new Uint8ClampedArray(previewSource.data), previewSource.width, previewSource.height),
        0,
        0
      );
      return;
    }

    const scaledParams: GalleryFilterParams = {
      ...params,
      radius:
        params.kind === 'high-pass'
          ? Math.max(1, Math.round(params.radius * previewSource.scale))
          : params.radius,
      distance: Math.max(1, Math.round(params.distance * previewSource.scale)),
      cellSize: Math.max(4, Math.round(params.cellSize * Math.max(0.5, previewSource.scale))),
    };
    const filtered = applyGalleryFilterBuffer(
      previewSource.data,
      previewSource.width,
      previewSource.height,
      scaledParams
    );
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(filtered), previewSource.width, previewSource.height),
      0,
      0
    );
  }, [previewSource, params, showOriginal]);

  if (!modals.filterGallery || !doc) return null;

  const activeTabMeta = FILTER_TABS.find((t) => t.id === params.kind) ?? FILTER_TABS[0];

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidRaster) return;
    applyGalleryFilterToLayer(params);
    closeModal('filterGallery');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleApply}
        className="w-full max-w-2xl rounded-xl border shadow-2xl overflow-hidden"
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
            <Sparkles className="w-4 h-4 text-[#0A84FF]" />
            <h2 className="text-[13px] font-semibold">Filter Gallery</h2>
          </div>
          <button
            type="button"
            onClick={() => closeModal('filterGallery')}
            className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-[12px]">
          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-1.5">
            {FILTER_TABS.map((tab) => {
              const active = params.kind === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setParams((p) => ({ ...p, kind: tab.id }));
                    setFilterGalleryKind(tab.id);
                  }}
                  className={`px-2.5 py-1 rounded-md border text-[11px] font-medium cursor-pointer whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-[#0A84FF] text-white border-[#0A84FF]'
                      : 'hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)]'
                  }`}
                  style={{ borderColor: active ? '#0A84FF' : 'var(--lp-border)' }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {!isValidRaster && (
            <div className="rounded-lg border border-[#FF9F0A]/40 bg-[#FF9F0A]/10 px-3 py-2 text-[11px] text-[#FF9F0A]">
              {activeLayer?.locked
                ? 'Active layer is locked. Unlock it in Layers before applying a filter.'
                : 'Filter Gallery operates on raster layers. Select a Raster Layer (or Rasterize a Text/Shape layer first).'}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4 items-start">
            {/* Live Preview Box */}
            <div className="space-y-2">
              <div
                className="relative rounded-lg border checkerboard-bg flex items-center justify-center min-h-[240px] max-h-[340px] overflow-hidden p-2"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                {previewSource ? (
                  <canvas
                    ref={previewCanvasRef}
                    className="max-w-full max-h-[320px] object-contain shadow-sm"
                  />
                ) : (
                  <span className="text-[11px] text-[var(--lp-text-secondary)]">
                    No raster layer preview available
                  </span>
                )}
                {showOriginal && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/75 text-white text-[10px] font-medium">
                    Original
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--lp-text-secondary)]">
                <span>
                  {doc.selection ? 'Applies inside active selection' : 'Applies to active raster layer'}
                </span>
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

            {/* Contextual Controls */}
            <div
              className="rounded-lg border p-3 space-y-3"
              style={{
                backgroundColor: 'var(--lp-bg)',
                borderColor: 'var(--lp-border)',
              }}
            >
              <div>
                <div className="text-[12px] font-semibold text-[var(--lp-text)]">
                  {activeTabMeta.label}
                </div>
                <p className="text-[11px] text-[var(--lp-text-secondary)] mt-1 leading-relaxed">
                  {activeTabMeta.desc}
                </p>
              </div>

              <div className="h-px" style={{ backgroundColor: 'var(--lp-border)' }} />

              {params.kind === 'high-pass' && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[var(--lp-text-secondary)]">Radius</span>
                    <span className="font-mono-tabular">{params.radius} px</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={30}
                    value={params.radius}
                    onChange={(e) => setParams((p) => ({ ...p, radius: Number(e.target.value) }))}
                    className="lp-slider w-full"
                  />
                </div>
              )}

              {params.kind === 'motion-blur' && (
                <>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[var(--lp-text-secondary)]">Distance</span>
                      <span className="font-mono-tabular">{params.distance} px</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={40}
                      value={params.distance}
                      onChange={(e) =>
                        setParams((p) => ({ ...p, distance: Number(e.target.value) }))
                      }
                      className="lp-slider w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[var(--lp-text-secondary)]">Angle</span>
                      <span className="font-mono-tabular">{params.angle}°</span>
                    </div>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      value={params.angle}
                      onChange={(e) => setParams((p) => ({ ...p, angle: Number(e.target.value) }))}
                      className="lp-slider w-full"
                    />
                  </div>
                </>
              )}

              {params.kind === 'oil-paint' && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[var(--lp-text-secondary)]">Brush Radius</span>
                    <span className="font-mono-tabular">{Math.min(5, Math.max(1, params.radius))} px</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={Math.min(5, Math.max(1, params.radius))}
                    onChange={(e) => setParams((p) => ({ ...p, radius: Number(e.target.value) }))}
                    className="lp-slider w-full"
                  />
                </div>
              )}

              {params.kind === 'halftone' && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[var(--lp-text-secondary)]">Dot Cell Size</span>
                    <span className="font-mono-tabular">{params.cellSize} px</span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={24}
                    value={params.cellSize}
                    onChange={(e) =>
                      setParams((p) => ({ ...p, cellSize: Number(e.target.value) }))
                    }
                    className="lp-slider w-full"
                  />
                </div>
              )}

              {params.kind === 'emboss' && (
                <>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[var(--lp-text-secondary)]">Strength</span>
                      <span className="font-mono-tabular">{params.strength.toFixed(1)}×</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={0.5}
                      value={params.strength}
                      onChange={(e) =>
                        setParams((p) => ({ ...p, strength: Number(e.target.value) }))
                      }
                      className="lp-slider w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[var(--lp-text-secondary)]">Light Angle</span>
                      <span className="font-mono-tabular">{params.angle}°</span>
                    </div>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      value={params.angle}
                      onChange={(e) => setParams((p) => ({ ...p, angle: Number(e.target.value) }))}
                      className="lp-slider w-full"
                    />
                  </div>
                </>
              )}

              {params.kind === 'edge-detect' && (
                <p className="text-[11px] text-[var(--lp-text-secondary)]">
                  Uses a 3×3 Sobel convolution operator with no additional parameters.
                </p>
              )}
            </div>
          </div>
        </div>

        <div
          className="px-4 py-3 border-t flex items-center justify-end gap-2"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <button
            type="button"
            onClick={() => closeModal('filterGallery')}
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
            Apply Filter
          </button>
        </div>
      </form>
    </div>
  );
};
