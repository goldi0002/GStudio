import React from 'react';
import { Maximize2 } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useEditorStore } from '../store/useEditorStore';
import type { ToolId } from '../types/editor';

const TOOL_TIPS: Record<ToolId, string> = {
  move: 'Move & Transform · Drag layer to move (Alt bypasses Snap) · Drag corners to resize or top stem to rotate (Shift snaps 15°)',
  'marquee-rect': 'Rectangular Marquee · Drag to select a region · Use Crop or Delete',
  'marquee-ellipse': 'Elliptical Marquee · Drag to select an oval region',
  lasso: 'Lasso · Drag freehand or click polygonal points to trace custom selections',
  'magic-wand': 'Magic Wand · Click any pixel region to select similar colors',
  crop: 'Crop · Drag handles to frame or adjust Straighten angle · Press Enter to apply · Esc to cancel',
  brush: 'Brush · Paint or Color Replace on raster layers & masks with optional Symmetry · [ or ] for size',
  eraser: 'Eraser · Erase pixels to transparency (supports Symmetry) · Press [ or ] to adjust size',
  bucket: 'Paint Bucket · Click inside a raster layer to fill matching colors',
  gradient: 'Gradient · Drag across layer or mask to blend linear or radial fills (Shift snaps 45°)',
  'clone-stamp': 'Clone Stamp · Alt+Click to sample source, then drag to paint texture · Press [ or ] for size',
  'spot-heal': 'Spot Healing · Heal blemishes or switch to Red-Eye Removal · [ or ] for size',
  'dodge-burn': 'Dodge & Burn · Selectively lighten, darken, or sponge saturation across Shadows, Midtones, or Highlights · [ or ] for size',
  'smudge-blur': 'Smudge, Blur & Sharpen · Push pigment or selectively soften and crispen image detail · [ or ] for size',
  text: 'Text · Click anywhere on canvas to add editable typography',
  shape: 'Shape · Drag on canvas to draw rectangles, ellipses, or lines',
  eyedropper: 'Eyedropper · Click canvas to sample 1×1, 3×3, or 5×5 average color',
  hand: 'Hand · Drag to pan around the canvas (hold Space with any tool)',
  zoom: 'Zoom · Click to zoom in · Alt+Click to zoom out',
};

export const BottomStatusBar: React.FC = () => {
  const {
    activeTool,
    documents,
    activeDocumentId,
    cursorCanvasPos,
    cursorPixelColor,
    setZoom,
    requestFitZoom,
  } = useEditorStore();

  const isOnline = useOnlineStatus();
  const doc = documents.find((d) => d.id === activeDocumentId);
  if (!doc) return null;

  const zoomPercent = Math.round(doc.zoom * 100);

  return (
    <footer
      className="h-7 shrink-0 px-3 border-t flex items-center justify-between gap-4 text-[11px] select-none"
      style={{
        backgroundColor: 'var(--lp-sidebar)',
        borderColor: 'var(--lp-border)',
        color: 'var(--lp-text-secondary)',
      }}
    >
      {/* Left: Plain-language Tool Tip */}
      <div className="truncate min-w-0">{TOOL_TIPS[activeTool]}</div>

      {/* Right: Coordinates, Canvas Dimensions, Zoom Slider */}
      <div className="flex items-center gap-3 shrink-0 font-mono-tabular">
        {!isOnline && (
          <>
            <span className="text-[#30D158] whitespace-nowrap">
              Offline · Local Cache Active
            </span>
            <span>·</span>
          </>
        )}
        {doc.selection && (
          <>
            <span className="text-[#0A84FF]">
              Sel {Math.round(doc.selection.width)}×{Math.round(doc.selection.height)}
            </span>
            <span>·</span>
          </>
        )}
        {cursorPixelColor && (
          <>
            <span
              className="hidden sm:inline-flex items-center gap-1.5"
              title={`RGBA(${cursorPixelColor.r}, ${cursorPixelColor.g}, ${cursorPixelColor.b}, ${cursorPixelColor.a})`}
            >
              <span
                className="w-2.5 h-2.5 rounded-[2px] border shrink-0"
                style={{
                  backgroundColor: cursorPixelColor.hex,
                  borderColor: 'var(--lp-border-strong)',
                }}
              />
              <span>{cursorPixelColor.hex}</span>
            </span>
            <span className="hidden sm:inline">·</span>
          </>
        )}
        <span className="hidden sm:inline w-24 text-right">
          {cursorCanvasPos ? `X:${cursorCanvasPos.x} Y:${cursorCanvasPos.y}` : '—'}
        </span>
        <span className="hidden md:inline">·</span>
        <span className="hidden md:inline">
          {doc.width} × {doc.height} px
        </span>
        <span>·</span>
        <div className="flex items-center gap-1.5">
          <input
            type="range"
            min={10}
            max={400}
            value={Math.min(400, Math.max(10, zoomPercent))}
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
            aria-label="Canvas Zoom"
            className="lp-slider w-20"
          />
          <span className="w-10 text-right text-[var(--lp-text)]">{zoomPercent}%</span>
          <button
            type="button"
            onClick={requestFitZoom}
            title="Fit Canvas to Window (⌘0)"
            className="p-0.5 rounded hover:bg-[var(--lp-hover)] hover:text-[var(--lp-text)] cursor-pointer"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </footer>
  );
};
