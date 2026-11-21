import React, { useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  buildSplineCurveLut,
  computeHistogram,
  DEFAULT_CURVES,
  DEFAULT_LEVELS,
  getTargetAdjustments,
  isDefaultCurves,
  isDefaultLevels,
} from '../engine/adjustments';
import { compositeLayersToCanvas, createCanvas } from '../engine/canvasOps';
import { useEditorStore } from '../store/useEditorStore';
import type { CurvePoint, CurvesConfig } from '../types/editor';

type CurveChannel = keyof CurvesConfig;

const CHANNEL_META: Array<{ key: CurveChannel; label: string; color: string }> = [
  { key: 'rgb', label: 'RGB', color: '#F5F5F7' },
  { key: 'r', label: 'Red', color: '#FF453A' },
  { key: 'g', label: 'Green', color: '#30D158' },
  { key: 'b', label: 'Blue', color: '#0A84FF' },
];

export const CurvesLevelsPanel: React.FC = () => {
  const {
    documents,
    activeDocumentId,
    updateLevels,
    updateCurves,
    resetLevelsAndCurves,
    commitAdjustmentsHistory,
  } = useEditorStore();

  const [channel, setChannel] = useState<CurveChannel>('rgb');
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const doc = documents.find((d) => d.id === activeDocumentId) ?? null;

  // Compute live downsampled histogram whenever base layers change
  const histogram = useMemo(() => {
    if (!doc) return null;
    const scale = Math.min(1, 160 / Math.max(doc.width, doc.height));
    const sw = Math.max(1, Math.round(doc.width * scale));
    const sh = Math.max(1, Math.round(doc.height * scale));
    const full = compositeLayersToCanvas(
      doc.width,
      doc.height,
      doc.backgroundColor,
      doc.layers
    );
    const small = createCanvas(sw, sh);
    const sctx = small.getContext('2d', { willReadFrequently: true });
    if (!sctx) return null;
    sctx.drawImage(full, 0, 0, sw, sh);
    const data = sctx.getImageData(0, 0, sw, sh).data;
    return computeHistogram(data);
  }, [doc?.layers, doc?.width, doc?.height, doc?.backgroundColor]);

  const levels = (doc ? getTargetAdjustments(doc) : null)?.levels ?? DEFAULT_LEVELS;
  const curves = (doc ? getTargetAdjustments(doc) : null)?.curves ?? DEFAULT_CURVES;
  const activePoints = curves[channel] ?? DEFAULT_CURVES[channel];
  const channelColor =
    CHANNEL_META.find((c) => c.key === channel)?.color ?? '#F5F5F7';

  const lut = useMemo(() => buildSplineCurveLut(activePoints), [activePoints]);

  const curvePolylinePoints = useMemo(() => {
    const pts: string[] = [];
    for (let x = 0; x < 256; x += 2) {
      pts.push(`${x},${255 - lut[x]}`);
    }
    pts.push(`255,${255 - lut[255]}`);
    return pts.join(' ');
  }, [lut]);

  const histogramPath = useMemo(() => {
    if (!histogram) return '';
    const arr =
      channel === 'rgb'
        ? histogram.luma
        : channel === 'r'
          ? histogram.r
          : channel === 'g'
            ? histogram.g
            : histogram.b;
    const maxV = Math.max(1, histogram.maxVal);
    const parts = ['M 0 255'];
    for (let x = 0; x < 256; x += 2) {
      const h = Math.min(250, (arr[x] / maxV) * 235);
      parts.push(`L ${x} ${255 - h}`);
    }
    parts.push('L 255 255 Z');
    return parts.join(' ');
  }, [histogram, channel]);

  if (!doc) return null;

  const pointerToCurveCoord = (clientX: number, clientY: number): CurvePoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 128, y: 128 };
    const nx = Math.max(0, Math.min(255, Math.round(((clientX - rect.left) / rect.width) * 255)));
    const ny = Math.max(0, Math.min(255, Math.round((1 - (clientY - rect.top) / rect.height) * 255)));
    return { x: nx, y: ny };
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = pointerToCurveCoord(e.clientX, e.clientY);

    // Hit-test existing control points
    const hitIdx = activePoints.findIndex(
      (p) => Math.hypot(p.x - pt.x, p.y - pt.y) <= 14
    );
    if (hitIdx !== -1) {
      setDraggingIndex(hitIdx);
      return;
    }

    // Add a new interior control point sorted by x
    const clampedX = Math.max(2, Math.min(253, pt.x));
    const nextPoints = [...activePoints, { x: clampedX, y: pt.y }].sort(
      (a, b) => a.x - b.x
    );
    const newIdx = nextPoints.findIndex(
      (p) => p.x === clampedX && p.y === pt.y
    );
    updateCurves(channel, nextPoints);
    setDraggingIndex(newIdx !== -1 ? newIdx : null);
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggingIndex === null) return;
    const pt = pointerToCurveCoord(e.clientX, e.clientY);
    const next = activePoints.map((p) => ({ ...p }));
    const isFirst = draggingIndex === 0;
    const isLast = draggingIndex === next.length - 1;

    if (isFirst) {
      next[0].x = Math.min(pt.x, (next[1]?.x ?? 255) - 2);
      next[0].y = pt.y;
    } else if (isLast) {
      next[draggingIndex].x = Math.max(pt.x, (next[draggingIndex - 1]?.x ?? 0) + 2);
      next[draggingIndex].y = pt.y;
    } else {
      const minX = next[draggingIndex - 1].x + 2;
      const maxX = next[draggingIndex + 1].x - 2;
      next[draggingIndex].x = Math.max(minX, Math.min(maxX, pt.x));
      next[draggingIndex].y = pt.y;
    }
    updateCurves(channel, next);
  };

  const handleSvgPointerUp = () => {
    if (draggingIndex !== null) {
      setDraggingIndex(null);
      commitAdjustmentsHistory(`Adjust ${channel.toUpperCase()} Curve`);
    }
  };

  const handlePointDoubleClick = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (idx <= 0 || idx >= activePoints.length - 1) return;
    const next = activePoints.filter((_, i) => i !== idx);
    updateCurves(channel, next, `Remove ${channel.toUpperCase()} Curve Point`);
  };

  const hasChanges = !isDefaultLevels(levels) || !isDefaultCurves(curves);

  return (
    <div className="space-y-3 text-[11px]">
      {/* Channel Selector + Reset */}
      <div className="flex items-center justify-between gap-2">
        <div
          className="flex items-center rounded-md border p-0.5 flex-1"
          style={{
            backgroundColor: 'var(--lp-panel)',
            borderColor: 'var(--lp-border)',
          }}
        >
          {CHANNEL_META.map((ch) => (
            <button
              key={ch.key}
              type="button"
              onClick={() => setChannel(ch.key)}
              className={`flex-1 py-1 rounded text-[10px] font-medium cursor-pointer transition-colors ${
                channel === ch.key
                  ? 'bg-[#0A84FF] text-white'
                  : 'text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)]'
              }`}
            >
              {ch.label}
            </button>
          ))}
        </div>

        {hasChanges && (
          <button
            type="button"
            onClick={resetLevelsAndCurves}
            title="Reset Levels & Curves"
            className="p-1.5 rounded border hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] cursor-pointer"
            style={{ borderColor: 'var(--lp-border)' }}
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Interactive Curves Editor + Histogram */}
      <div
        className="rounded-lg border overflow-hidden p-1.5"
        style={{
          backgroundColor: 'var(--lp-bg)',
          borderColor: 'var(--lp-border)',
        }}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 255 255"
          preserveAspectRatio="none"
          onPointerDown={handleSvgPointerDown}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          className="w-full h-36 block cursor-crosshair touch-none select-none"
        >
          {/* Quarter Grid */}
          {[64, 128, 192].map((g) => (
            <React.Fragment key={g}>
              <line
                x1={g}
                y1={0}
                x2={g}
                y2={255}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
              <line
                x1={0}
                y1={g}
                x2={255}
                y2={g}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
            </React.Fragment>
          ))}

          {/* Identity diagonal */}
          <line
            x1={0}
            y1={255}
            x2={255}
            y2={0}
            stroke="rgba(255,255,255,0.16)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />

          {/* Live Histogram Backdrop */}
          {histogramPath && (
            <path
              d={histogramPath}
              fill={channel === 'rgb' ? 'rgba(245,245,247,0.14)' : channelColor}
              fillOpacity={channel === 'rgb' ? 1 : 0.22}
            />
          )}

          {/* Spline Curve */}
          <polyline
            fill="none"
            stroke={channel === 'rgb' ? '#0A84FF' : channelColor}
            strokeWidth="2.5"
            points={curvePolylinePoints}
          />

          {/* Control Points */}
          {activePoints.map((pt, idx) => (
            <circle
              key={`${idx}-${pt.x}`}
              cx={pt.x}
              cy={255 - pt.y}
              r={draggingIndex === idx ? 6.5 : 5}
              fill="#FFFFFF"
              stroke={channel === 'rgb' ? '#0A84FF' : channelColor}
              strokeWidth="2"
              onDoubleClick={(e) => handlePointDoubleClick(idx, e)}
              className="cursor-grab active:cursor-grabbing"
            />
          ))}
        </svg>
        <div className="flex items-center justify-between text-[10px] text-[var(--lp-text-secondary)] pt-1 px-0.5">
          <span>Click curve to add point</span>
          <span>Double-click to remove</span>
        </div>
      </div>

      {/* Levels Controls */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--lp-text-secondary)]">
            Levels
          </span>
          <span className="font-mono-tabular text-[10px] text-[var(--lp-text-secondary)]">
            {levels.black} · {levels.gamma.toFixed(2)} · {levels.white}
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-[var(--lp-text-secondary)]">
            <span>Input Shadows</span>
            <span className="font-mono-tabular text-[var(--lp-text)]">{levels.black}</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, levels.white - 2)}
            value={levels.black}
            onChange={(e) => updateLevels({ black: Number(e.target.value) })}
            onPointerUp={() => commitAdjustmentsHistory('Levels Shadows')}
            onKeyUp={() => commitAdjustmentsHistory('Levels Shadows')}
            className="lp-slider w-full"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-[var(--lp-text-secondary)]">
            <span>Midtones (Gamma)</span>
            <span className="font-mono-tabular text-[var(--lp-text)]">
              {levels.gamma.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min={0.2}
            max={3.0}
            step={0.02}
            value={levels.gamma}
            onChange={(e) => updateLevels({ gamma: Number(e.target.value) })}
            onPointerUp={() => commitAdjustmentsHistory('Levels Gamma')}
            onKeyUp={() => commitAdjustmentsHistory('Levels Gamma')}
            className="lp-slider w-full"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-[var(--lp-text-secondary)]">
            <span>Input Highlights</span>
            <span className="font-mono-tabular text-[var(--lp-text)]">{levels.white}</span>
          </div>
          <input
            type="range"
            min={Math.min(255, levels.black + 2)}
            max={255}
            value={levels.white}
            onChange={(e) => updateLevels({ white: Number(e.target.value) })}
            onPointerUp={() => commitAdjustmentsHistory('Levels Highlights')}
            onKeyUp={() => commitAdjustmentsHistory('Levels Highlights')}
            className="lp-slider w-full"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-[var(--lp-text-secondary)]">
              <span>Out Black</span>
              <span className="font-mono-tabular">{levels.outBlack}</span>
            </div>
            <input
              type="range"
              min={0}
              max={255}
              value={levels.outBlack}
              onChange={(e) => updateLevels({ outBlack: Number(e.target.value) })}
              onPointerUp={() => commitAdjustmentsHistory('Levels Output Black')}
              onKeyUp={() => commitAdjustmentsHistory('Levels Output Black')}
              className="lp-slider w-full"
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-[var(--lp-text-secondary)]">
              <span>Out White</span>
              <span className="font-mono-tabular">{levels.outWhite}</span>
            </div>
            <input
              type="range"
              min={0}
              max={255}
              value={levels.outWhite}
              onChange={(e) => updateLevels({ outWhite: Number(e.target.value) })}
              onPointerUp={() => commitAdjustmentsHistory('Levels Output White')}
              onKeyUp={() => commitAdjustmentsHistory('Levels Output White')}
              className="lp-slider w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
