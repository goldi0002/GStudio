import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pipette, X } from 'lucide-react';
import { compositeLayersToCanvas } from '../../engine/canvasOps';
import {
  computeColorRangeMask,
  renderColorRangePreviewBuffer,
  type ColorRangeMode,
  type ColorRangePreviewMode,
} from '../../engine/colorRange';
import { useEditorStore } from '../../store/useEditorStore';

const COLOR_RANGE_MODES: Array<{ id: ColorRangeMode; label: string }> = [
  { id: 'sampled', label: 'Sampled Colors' },
  { id: 'reds', label: 'Reds' },
  { id: 'yellows', label: 'Yellows' },
  { id: 'greens', label: 'Greens' },
  { id: 'cyans', label: 'Cyans' },
  { id: 'blues', label: 'Blues' },
  { id: 'magentas', label: 'Magentas' },
  { id: 'highlights', label: 'Highlights' },
  { id: 'midtones', label: 'Midtones' },
  { id: 'shadows', label: 'Shadows' },
];

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [10, 132, 255];
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbTupleToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export const ColorRangeModal: React.FC = () => {
  const {
    modals,
    closeModal,
    documents,
    activeDocumentId,
    foregroundColor,
    applyColorRangeResult,
  } = useEditorStore();

  const doc = documents.find((d) => d.id === activeDocumentId) ?? null;

  const [mode, setMode] = useState<ColorRangeMode>('sampled');
  const [sampleRgb, setSampleRgb] = useState<[number, number, number]>(() =>
    hexToRgbTuple(foregroundColor)
  );
  const [fuzziness, setFuzziness] = useState(55);
  const [invert, setInvert] = useState(false);
  const [previewMode, setPreviewMode] = useState<ColorRangePreviewMode>('rubylith');
  const [outputTarget, setOutputTarget] = useState<'selection' | 'mask'>('selection');

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Reset sampled color from active document center or foreground when opened
  useEffect(() => {
    if (modals.colorRange) {
      setSampleRgb(hexToRgbTuple(foregroundColor));
    }
  }, [modals.colorRange, foregroundColor]);

  // Composite full doc once when modal opens, plus build downscaled preview buffer
  const sourceBuffers = useMemo(() => {
    if (!modals.colorRange || !doc) return null;
    const fullCanvas = compositeLayersToCanvas(
      doc.width,
      doc.height,
      doc.backgroundColor,
      doc.layers,
      doc.adjustments
    );
    const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });
    if (!fullCtx) return null;
    const fullData = fullCtx.getImageData(0, 0, doc.width, doc.height).data;

    const maxSide = 380;
    const scale = Math.min(1, maxSide / Math.max(1, doc.width, doc.height));
    const pw = Math.max(2, Math.round(doc.width * scale));
    const ph = Math.max(2, Math.round(doc.height * scale));
    const prevCanvas = document.createElement('canvas');
    prevCanvas.width = pw;
    prevCanvas.height = ph;
    const pctx = prevCanvas.getContext('2d', { willReadFrequently: true });
    if (!pctx) return null;
    pctx.imageSmoothingEnabled = true;
    pctx.imageSmoothingQuality = 'high';
    pctx.drawImage(fullCanvas, 0, 0, pw, ph);
    const prevData = pctx.getImageData(0, 0, pw, ph).data;

    return {
      fullWidth: doc.width,
      fullHeight: doc.height,
      fullData,
      previewWidth: pw,
      previewHeight: ph,
      previewData: prevData,
    };
  }, [modals.colorRange, doc]);

  const previewMask = useMemo(() => {
    if (!sourceBuffers) return null;
    return computeColorRangeMask(
      sourceBuffers.previewData,
      sourceBuffers.previewWidth,
      sourceBuffers.previewHeight,
      { mode, sampleRgb, fuzziness, invert }
    );
  }, [sourceBuffers, mode, sampleRgb, fuzziness, invert]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !sourceBuffers || !previewMask) return;
    canvas.width = sourceBuffers.previewWidth;
    canvas.height = sourceBuffers.previewHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rendered = renderColorRangePreviewBuffer(
      sourceBuffers.previewData,
      previewMask.maskData,
      previewMode
    );
    ctx.putImageData(
      new ImageData(
        new Uint8ClampedArray(rendered),
        sourceBuffers.previewWidth,
        sourceBuffers.previewHeight
      ),
      0,
      0
    );
  }, [sourceBuffers, previewMask, previewMode]);

  if (!modals.colorRange || !doc) return null;

  const handleSampleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !sourceBuffers) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const px = Math.max(
      0,
      Math.min(
        sourceBuffers.previewWidth - 1,
        Math.floor(((e.clientX - rect.left) / rect.width) * sourceBuffers.previewWidth)
      )
    );
    const py = Math.max(
      0,
      Math.min(
        sourceBuffers.previewHeight - 1,
        Math.floor(((e.clientY - rect.top) / rect.height) * sourceBuffers.previewHeight)
      )
    );
    const idx = (py * sourceBuffers.previewWidth + px) * 4;
    setMode('sampled');
    setSampleRgb([
      sourceBuffers.previewData[idx],
      sourceBuffers.previewData[idx + 1],
      sourceBuffers.previewData[idx + 2],
    ]);
  };

  const matchPct =
    sourceBuffers && previewMask
      ? ((previewMask.matchCount / (sourceBuffers.previewWidth * sourceBuffers.previewHeight)) * 100).toFixed(1)
      : '0.0';

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceBuffers) return;
    const fullResult = computeColorRangeMask(
      sourceBuffers.fullData,
      sourceBuffers.fullWidth,
      sourceBuffers.fullHeight,
      { mode, sampleRgb, fuzziness, invert }
    );
    applyColorRangeResult(fullResult.maskData, fullResult.bounds, outputTarget);
    closeModal('colorRange');
  };

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
            <Pipette className="w-4 h-4 text-[#0A84FF]" />
            <div>
              <h2 className="text-[13px] font-semibold">Color Range &amp; Chroma Matte</h2>
              <p className="text-[11px] text-[var(--lp-text-secondary)]">
                Click anywhere on the preview to sample a color or isolate tonal &amp; hue ranges
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => closeModal('colorRange')}
            className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-[1fr_250px] gap-4 text-[12px] overflow-y-auto">
          {/* Preview Canvas */}
          <div className="space-y-2">
            <div
              className="rounded-lg border checkerboard-bg flex items-center justify-center min-h-[280px] p-3 overflow-hidden"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              {sourceBuffers ? (
                <canvas
                  ref={previewCanvasRef}
                  onClick={handleSampleClick}
                  title="Click to sample color from image"
                  className="max-w-full max-h-[340px] object-contain shadow-md cursor-crosshair"
                />
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1 rounded-md border p-0.5" style={{ borderColor: 'var(--lp-border)' }}>
                {(
                  [
                    ['rubylith', 'Quick Mask'],
                    ['matte', 'Matte'],
                    ['cutout', 'Cutout'],
                  ] as const
                ).map(([pm, label]) => (
                  <button
                    key={pm}
                    type="button"
                    onClick={() => setPreviewMode(pm)}
                    className={`px-2 py-0.5 rounded text-[11px] cursor-pointer whitespace-nowrap ${
                      previewMode === pm
                        ? 'bg-[#0A84FF] text-white'
                        : 'text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="font-mono-tabular text-[var(--lp-text-secondary)]">
                Coverage {matchPct}%
              </span>
            </div>
          </div>

          {/* Range Controls */}
          <div
            className="rounded-lg border p-3 space-y-3"
            style={{
              backgroundColor: 'var(--lp-bg)',
              borderColor: 'var(--lp-border)',
            }}
          >
            <label className="space-y-1 block">
              <span className="text-[11px] text-[var(--lp-text-secondary)] block">Select</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ColorRangeMode)}
                className="w-full px-2 py-1.5 rounded border bg-[var(--lp-panel)] text-[11px]"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                {COLOR_RANGE_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            {mode === 'sampled' && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--lp-text-secondary)]">Sampled Color</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono-tabular text-[11px]">
                    {rgbTupleToHex(sampleRgb[0], sampleRgb[1], sampleRgb[2])}
                  </span>
                  <input
                    type="color"
                    value={rgbTupleToHex(sampleRgb[0], sampleRgb[1], sampleRgb[2])}
                    onChange={(e) => setSampleRgb(hexToRgbTuple(e.target.value))}
                    className="w-6 h-6 rounded border bg-transparent cursor-pointer"
                    style={{ borderColor: 'var(--lp-border)' }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--lp-text-secondary)]">Fuzziness</span>
                <span className="font-mono-tabular">{fuzziness}</span>
              </div>
              <input
                type="range"
                min={1}
                max={200}
                value={fuzziness}
                onChange={(e) => setFuzziness(Number(e.target.value))}
                className="lp-slider w-full"
              />
            </div>

            <label className="flex items-center justify-between text-[11px] cursor-pointer pt-0.5">
              <span>Invert Matte</span>
              <input
                type="checkbox"
                checked={invert}
                onChange={(e) => setInvert(e.target.checked)}
              />
            </label>

            <div className="h-px" style={{ backgroundColor: 'var(--lp-border)' }} />

            <div className="space-y-1.5">
              <span className="text-[11px] text-[var(--lp-text-secondary)] block">Output To</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setOutputTarget('selection')}
                  className={`py-1.5 px-2 rounded border text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                    outputTarget === 'selection'
                      ? 'bg-[#0A84FF] text-white border-[#0A84FF]'
                      : 'hover:bg-[var(--lp-hover)]'
                  }`}
                  style={{ borderColor: outputTarget === 'selection' ? '#0A84FF' : 'var(--lp-border)' }}
                >
                  Selection
                </button>
                <button
                  type="button"
                  onClick={() => setOutputTarget('mask')}
                  className={`py-1.5 px-2 rounded border text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                    outputTarget === 'mask'
                      ? 'bg-[#0A84FF] text-white border-[#0A84FF]'
                      : 'hover:bg-[var(--lp-hover)]'
                  }`}
                  style={{ borderColor: outputTarget === 'mask' ? '#0A84FF' : 'var(--lp-border)' }}
                >
                  Layer Mask
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
            onClick={() => closeModal('colorRange')}
            className="px-3.5 py-1.5 rounded-lg border text-[12px] hover:bg-[var(--lp-hover)] cursor-pointer whitespace-nowrap"
            style={{ borderColor: 'var(--lp-border)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 rounded-lg bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-[12px] font-medium cursor-pointer whitespace-nowrap"
          >
            {outputTarget === 'mask' ? 'Apply as Layer Mask' : 'Create Selection'}
          </button>
        </div>
      </form>
    </div>
  );
};
