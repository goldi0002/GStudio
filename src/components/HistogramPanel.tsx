import React, { useMemo, useRef, useState } from 'react';
import {
  applyAdjustmentsToBuffer,
  computeHistogram,
  computeHistogramChannelStats,
  isDefaultAdjustments,
} from '../engine/adjustments';
import {
  sampleActiveLayerForHistogram,
  sampleDocumentBaseForHistogram,
  scaleAdjustmentsForSample,
} from '../engine/canvasOps';
import { useEditorStore } from '../store/useEditorStore';

export type HistogramScope = 'document' | 'layer';
export type HistogramChannel = 'rgb' | 'luma' | 'r' | 'g' | 'b';
export type HistogramScale = 'linear' | 'log';

const CHANNEL_TABS: Array<{ key: HistogramChannel; label: string; color: string }> = [
  { key: 'rgb', label: 'RGB', color: 'var(--lp-text)' },
  { key: 'luma', label: 'Luma', color: 'var(--lp-text)' },
  { key: 'r', label: 'R', color: '#FF453A' },
  { key: 'g', label: 'G', color: '#30D158' },
  { key: 'b', label: 'B', color: '#0A84FF' },
];

const SVG_W = 256;
const SVG_H = 100;
const BASE_Y = 98;
const MAX_BAR_H = 90;

function computeDisplayMax(arrays: Uint32Array[]): number {
  let maxMid = 0;
  for (const arr of arrays) {
    for (let i = 1; i < 255; i++) {
      if (arr[i] > maxMid) maxMid = arr[i];
    }
  }
  if (maxMid > 0) return maxMid;

  let maxEdge = 1;
  for (const arr of arrays) {
    if (arr[0] > maxEdge) maxEdge = arr[0];
    if (arr[255] > maxEdge) maxEdge = arr[255];
  }
  return maxEdge;
}

function projectBinHeight(val: number, displayMax: number, scale: HistogramScale): number {
  if (val <= 0 || displayMax <= 0) return 0;
  const ratio =
    scale === 'log'
      ? Math.log1p(val) / Math.log1p(displayMax)
      : val / displayMax;
  return Math.min(MAX_BAR_H, Math.max(0, ratio * MAX_BAR_H));
}

function buildPaths(
  arr: Uint32Array,
  displayMax: number,
  scale: HistogramScale
): { area: string; line: string } {
  const areaParts: string[] = [`M 0 ${BASE_Y}`];
  const lineParts: string[] = [];

  for (let x = 0; x < 256; x++) {
    const h = projectBinHeight(arr[x], displayMax, scale);
    const y = (BASE_Y - h).toFixed(2);
    areaParts.push(`L ${x} ${y}`);
    lineParts.push(`${x === 0 ? 'M' : 'L'} ${x} ${y}`);
  }
  areaParts.push(`L 255 ${BASE_Y} Z`);
  return { area: areaParts.join(' '), line: lineParts.join(' ') };
}

export const HistogramPanel: React.FC = () => {
  const documents = useEditorStore((s) => s.documents);
  const activeDocumentId = useEditorStore((s) => s.activeDocumentId);
  const liveCanvasTick = useEditorStore((s) => s.liveCanvasTick);
  const theme = useEditorStore((s) => s.theme);

  const [scope, setScope] = useState<HistogramScope>('document');
  const [channel, setChannel] = useState<HistogramChannel>('rgb');
  const [scaleMode, setScaleMode] = useState<HistogramScale>('linear');
  const [hoveredLevel, setHoveredLevel] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const doc = documents.find((d) => d.id === activeDocumentId) ?? null;
  const activeLayer = doc?.layers.find((l) => l.id === doc.activeLayerId) ?? null;

  // 1. Sample downscaled document base composite only when layers/dimensions/live paint change
  const docBaseSample = useMemo(() => {
    if (!doc || scope !== 'document') return null;
    return sampleDocumentBaseForHistogram(
      doc.width,
      doc.height,
      doc.backgroundColor,
      doc.layers,
      180
    );
  }, [
    doc?.width,
    doc?.height,
    doc?.backgroundColor,
    doc?.layers,
    scope,
    liveCanvasTick,
  ]);

  // 2. Apply document-level adjustments/filters onto the small sample buffer (<2ms)
  const docFinalPixels = useMemo(() => {
    if (!doc || !docBaseSample || scope !== 'document') return null;
    if (isDefaultAdjustments(doc.adjustments)) return docBaseSample.data;
    const scaledAdj = scaleAdjustmentsForSample(doc.adjustments, docBaseSample.scale);
    return applyAdjustmentsToBuffer(
      docBaseSample.data,
      docBaseSample.width,
      docBaseSample.height,
      scaledAdj
    );
  }, [doc?.adjustments, docBaseSample, scope]);

  // 3. Sample active layer (or mask) when scope === 'layer'
  const layerSample = useMemo(() => {
    if (!doc || scope !== 'layer') return null;
    return sampleActiveLayerForHistogram(
      activeLayer,
      doc.layers,
      doc.width,
      doc.height,
      doc.backgroundColor,
      doc.editingTarget,
      180
    );
  }, [
    activeLayer,
    doc?.layers,
    doc?.width,
    doc?.height,
    doc?.backgroundColor,
    doc?.editingTarget,
    scope,
    liveCanvasTick,
  ]);

  const activePixels = scope === 'document' ? docFinalPixels : layerSample?.data ?? null;

  const histogram = useMemo(() => {
    if (!activePixels || activePixels.length === 0) return null;
    return computeHistogram(activePixels);
  }, [activePixels]);

  const activeBins = useMemo(() => {
    if (!histogram) return null;
    if (channel === 'r') return histogram.r;
    if (channel === 'g') return histogram.g;
    if (channel === 'b') return histogram.b;
    return histogram.luma;
  }, [histogram, channel]);

  const stats = useMemo(() => {
    if (!histogram || !activeBins) return null;
    return computeHistogramChannelStats(activeBins, histogram.totalPixels);
  }, [histogram, activeBins]);

  const displayMax = useMemo(() => {
    if (!histogram) return 1;
    if (channel === 'rgb') {
      return computeDisplayMax([histogram.r, histogram.g, histogram.b, histogram.luma]);
    }
    if (channel === 'luma') return computeDisplayMax([histogram.luma]);
    if (channel === 'r') return computeDisplayMax([histogram.r]);
    if (channel === 'g') return computeDisplayMax([histogram.g]);
    return computeDisplayMax([histogram.b]);
  }, [histogram, channel]);

  const renderedPaths = useMemo(() => {
    if (!histogram) return null;
    if (channel === 'rgb') {
      return {
        r: buildPaths(histogram.r, displayMax, scaleMode),
        g: buildPaths(histogram.g, displayMax, scaleMode),
        b: buildPaths(histogram.b, displayMax, scaleMode),
        luma: buildPaths(histogram.luma, displayMax, scaleMode),
      };
    }
    const target =
      channel === 'luma'
        ? histogram.luma
        : channel === 'r'
          ? histogram.r
          : channel === 'g'
            ? histogram.g
            : histogram.b;
    return {
      single: buildPaths(target, displayMax, scaleMode),
    };
  }, [histogram, channel, displayMax, scaleMode]);

  if (!doc) return null;

  const isEmpty = !histogram || histogram.totalPixels === 0;
  const shadowClipped = (stats?.shadowClipPct ?? 0) >= 0.1;
  const highlightClipped = (stats?.highlightClipPct ?? 0) >= 0.1;
  const rgbBlend = theme === 'dark' ? 'screen' : 'normal';
  const rgbOpacity = theme === 'dark' ? 0.52 : 0.34;

  const targetCaption =
    scope === 'document'
      ? `Composite · ${doc.width} × ${doc.height} px`
      : activeLayer
        ? `${layerSample?.kindLabel ?? 'Layer'}: ${activeLayer.name}${
            layerSample?.hidden ? ' (Hidden)' : ''
          }`
        : 'No active layer';

  const hoveredCount =
    hoveredLevel !== null && activeBins ? activeBins[hoveredLevel] : 0;
  const hoveredPct =
    hoveredLevel !== null && histogram && histogram.totalPixels > 0
      ? (hoveredCount / histogram.totalPixels) * 100
      : 0;

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const lvl = Math.max(
      0,
      Math.min(255, Math.round(((e.clientX - rect.left) / rect.width) * 255))
    );
    setHoveredLevel(lvl);
  };

  return (
    <div className="space-y-2 text-[11px]" data-testid="histogram-panel">
      {/* Row 1: Scope Switcher + Linear/Log Scale Toggle */}
      <div className="flex items-center justify-between gap-1.5">
        <div
          role="group"
          aria-label="Histogram scope"
          className="flex items-center rounded-md border p-0.5 flex-1 min-w-0"
          style={{
            backgroundColor: 'var(--lp-panel)',
            borderColor: 'var(--lp-border)',
          }}
        >
          <button
            type="button"
            onClick={() => setScope('document')}
            aria-pressed={scope === 'document'}
            className={`flex-1 py-1 px-2 rounded text-[10px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              scope === 'document'
                ? 'bg-[#0A84FF] text-white'
                : 'text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)]'
            }`}
          >
            Document
          </button>
          <button
            type="button"
            onClick={() => setScope('layer')}
            aria-pressed={scope === 'layer'}
            className={`flex-1 py-1 px-2 rounded text-[10px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              scope === 'layer'
                ? 'bg-[#0A84FF] text-white'
                : 'text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)]'
            }`}
          >
            Active Layer
          </button>
        </div>

        <div
          role="group"
          aria-label="Histogram scale"
          className="flex items-center rounded-md border p-0.5 shrink-0"
          style={{
            backgroundColor: 'var(--lp-panel)',
            borderColor: 'var(--lp-border)',
          }}
        >
          <button
            type="button"
            onClick={() => setScaleMode('linear')}
            aria-pressed={scaleMode === 'linear'}
            title="Linear scale"
            className={`px-1.5 py-1 rounded text-[10px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
              scaleMode === 'linear'
                ? 'bg-[var(--lp-active-surface)] text-[#0A84FF]'
                : 'text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)]'
            }`}
          >
            Lin
          </button>
          <button
            type="button"
            onClick={() => setScaleMode('log')}
            aria-pressed={scaleMode === 'log'}
            title="Logarithmic scale"
            className={`px-1.5 py-1 rounded text-[10px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
              scaleMode === 'log'
                ? 'bg-[var(--lp-active-surface)] text-[#0A84FF]'
                : 'text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)]'
            }`}
          >
            Log
          </button>
        </div>
      </div>

      {/* Row 2: Histogram Chart Viewport */}
      <div
        className="rounded-lg border overflow-hidden relative"
        style={{
          backgroundColor: 'var(--lp-bg)',
          borderColor: 'var(--lp-border)',
        }}
      >
        {/* Top Clipping Indicators */}
        <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5 text-[10px] font-mono-tabular">
          <span
            title={
              stats
                ? `Shadow clipping (0): ${stats.shadowClipPct.toFixed(1)}%`
                : 'Shadow clipping'
            }
            className={`inline-flex items-center gap-1 ${
              shadowClipped ? 'text-[#0A84FF] font-medium' : 'text-[var(--lp-text-secondary)] opacity-55'
            }`}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
              <polygon
                points="0,8 8,8 0,0"
                fill={shadowClipped ? '#0A84FF' : 'currentColor'}
              />
            </svg>
            <span>{stats ? `${stats.shadowClipPct.toFixed(1)}%` : '0.0%'}</span>
          </span>

          <span
            title={
              stats
                ? `Highlight clipping (255): ${stats.highlightClipPct.toFixed(1)}%`
                : 'Highlight clipping'
            }
            className={`inline-flex items-center gap-1 ${
              highlightClipped
                ? 'text-[#FF453A] font-medium'
                : 'text-[var(--lp-text-secondary)] opacity-55'
            }`}
          >
            <span>{stats ? `${stats.highlightClipPct.toFixed(1)}%` : '0.0%'}</span>
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
              <polygon
                points="0,8 8,8 8,0"
                fill={highlightClipped ? '#FF453A' : 'currentColor'}
              />
            </svg>
          </span>
        </div>

        <div className="px-1.5 pb-1">
          {isEmpty ? (
            <div className="h-24 flex items-center justify-center text-[10px] text-[var(--lp-text-secondary)] text-center px-3">
              {activeLayer || scope === 'document'
                ? 'No opaque pixels in target'
                : 'Select a layer to inspect'}
            </div>
          ) : (
            <svg
              ref={svgRef}
              role="img"
              aria-label="Histogram tonal distribution"
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              preserveAspectRatio="none"
              onPointerMove={handlePointerMove}
              onPointerLeave={() => setHoveredLevel(null)}
              className="w-full h-24 block cursor-crosshair touch-none select-none"
            >
              {/* Subtle Zone Gridlines (25%, 50%, 75%) */}
              {[64, 128, 192].map((gx) => (
                <line
                  key={gx}
                  x1={gx}
                  y1={2}
                  x2={gx}
                  y2={BASE_Y}
                  stroke="var(--lp-border-strong)"
                  strokeOpacity={0.45}
                  strokeWidth="1"
                />
              ))}
              <line
                x1={0}
                y1={BASE_Y - MAX_BAR_H / 2}
                x2={SVG_W}
                y2={BASE_Y - MAX_BAR_H / 2}
                stroke="var(--lp-border-strong)"
                strokeOpacity={0.3}
                strokeWidth="1"
                strokeDasharray="3 3"
              />

              {/* Channels */}
              {channel === 'rgb' && renderedPaths?.r && renderedPaths?.g && renderedPaths?.b ? (
                <>
                  <path
                    d={renderedPaths.r.area}
                    fill="#FF453A"
                    fillOpacity={rgbOpacity}
                    style={{ mixBlendMode: rgbBlend }}
                  />
                  <path
                    d={renderedPaths.g.area}
                    fill="#30D158"
                    fillOpacity={rgbOpacity}
                    style={{ mixBlendMode: rgbBlend }}
                  />
                  <path
                    d={renderedPaths.b.area}
                    fill="#0A84FF"
                    fillOpacity={rgbOpacity}
                    style={{ mixBlendMode: rgbBlend }}
                  />
                  {renderedPaths.luma && (
                    <path
                      d={renderedPaths.luma.line}
                      fill="none"
                      stroke="var(--lp-text)"
                      strokeOpacity={0.48}
                      strokeWidth="1"
                    />
                  )}
                </>
              ) : (
                renderedPaths?.single && (
                  <>
                    <path
                      d={renderedPaths.single.area}
                      fill={
                        CHANNEL_TABS.find((t) => t.key === channel)?.color ?? 'var(--lp-text)'
                      }
                      fillOpacity={channel === 'luma' ? 0.24 : 0.34}
                    />
                    <path
                      d={renderedPaths.single.line}
                      fill="none"
                      stroke={
                        CHANNEL_TABS.find((t) => t.key === channel)?.color ?? 'var(--lp-text)'
                      }
                      strokeOpacity={channel === 'luma' ? 0.85 : 0.95}
                      strokeWidth="1.25"
                    />
                  </>
                )
              )}

              {/* Hover Scrub Hairline */}
              {hoveredLevel !== null && activeBins && (
                <>
                  <line
                    x1={hoveredLevel}
                    y1={0}
                    x2={hoveredLevel}
                    y2={BASE_Y}
                    stroke="var(--lp-text)"
                    strokeOpacity={0.65}
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                  <circle
                    cx={hoveredLevel}
                    cy={
                      BASE_Y -
                      projectBinHeight(activeBins[hoveredLevel], displayMax, scaleMode)
                    }
                    r={2.5}
                    fill="#0A84FF"
                    stroke="var(--lp-bg)"
                    strokeWidth="1"
                  />
                </>
              )}
            </svg>
          )}
        </div>

        {/* Bottom Tonal Ramp Indicator (0 -> 255) */}
        <div
          aria-hidden="true"
          className="h-[3px] w-full"
          style={{
            background: 'linear-gradient(90deg, #000000 0%, #808080 50%, #FFFFFF 100%)',
          }}
        />
      </div>

      {/* Row 3: Channel Selector */}
      <div
        role="group"
        aria-label="Histogram channels"
        className="flex items-center rounded-md border p-0.5"
        style={{
          backgroundColor: 'var(--lp-panel)',
          borderColor: 'var(--lp-border)',
        }}
      >
        {CHANNEL_TABS.map((ch) => (
          <button
            key={ch.key}
            type="button"
            onClick={() => setChannel(ch.key)}
            aria-pressed={channel === ch.key}
            className={`flex-1 py-0.5 rounded text-[10px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              channel === ch.key
                ? 'bg-[#0A84FF] text-white'
                : 'text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)]'
            }`}
          >
            {ch.label}
          </button>
        ))}
      </div>

      {/* Row 4: Target Info & Tabular Tonal Metrics */}
      <div className="space-y-0.5 px-0.5">
        <div
          className="text-[10px] text-[var(--lp-text-secondary)] truncate"
          data-testid="histogram-target"
          title={targetCaption}
        >
          {targetCaption}
        </div>
        <div className="flex items-center justify-between text-[10px] font-mono-tabular text-[var(--lp-text-secondary)]">
          {hoveredLevel !== null ? (
            <>
              <span>
                Level <strong className="text-[var(--lp-text)] font-medium">{hoveredLevel}</strong>
              </span>
              <span>
                Share{' '}
                <strong className="text-[var(--lp-text)] font-medium">
                  {hoveredPct.toFixed(1)}%
                </strong>
              </span>
              <span>
                Mean{' '}
                <strong className="text-[var(--lp-text)] font-medium">
                  {stats ? stats.mean.toFixed(1) : '—'}
                </strong>
              </span>
            </>
          ) : (
            <>
              <span>
                Mean{' '}
                <strong className="text-[var(--lp-text)] font-medium">
                  {stats && !isEmpty ? stats.mean.toFixed(1) : '—'}
                </strong>
              </span>
              <span>
                Median{' '}
                <strong className="text-[var(--lp-text)] font-medium">
                  {stats && !isEmpty ? stats.median : '—'}
                </strong>
              </span>
              <span>
                Std{' '}
                <strong className="text-[var(--lp-text)] font-medium">
                  {stats && !isEmpty ? stats.stdDev.toFixed(1) : '—'}
                </strong>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
