import React, { useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  Columns2,
  Eye,
  CaretsToAxisDashedVertical,
  CaretsToAxisDashedHorizontal,
  Grid3x3,
  ImagePlus,
  Magnet,
  MousePointerClick,
  RotateCcw,
  RotateCw,
  Ruler,
  X,
} from 'lucide-react';
import { cropRatioFor, fitRatioRect, parseRatio } from '../engine/cropRatio';
import { decodeImageFile, pickLocalFiles } from '../persistence/fileAccess';
import { useEditorStore } from '../store/useEditorStore';
import type { ShapeKind } from '../types/editor';

export const ToolOptionsBar: React.FC = () => {
  const {
    activeTool,
    toolOptions,
    updateToolOptions,
    documents,
    activeDocumentId,
    cropRect,
    cloneSource,
    setCropRect,
    applyCrop,
    cancelCrop,
    selectAll,
    invertActiveSelection,
    clearSelection,
    cropToSelection,
    featherActiveSelection,
    resizeActiveSelection,
    applySelectionAsMask,
    fillSelectionWithColor,
    layerViaCopyOrDuplicate,
    alignActiveLayer,
    flipActiveLayer,
    rotateActiveDocument,
    flipActiveDocument,
    placeImageAsLayer,
    viewportSettings,
    toggleViewportSetting,
    setBeforeAfterMode,
    setZoom,
    requestFitZoom,
    foregroundColor,
    backgroundColor,
    setEditingTarget,
    showToast,
  } = useEditorStore();

  const [featherRadius, setFeatherRadius] = useState(6);
  const [resizePx, setResizePx] = useState(4);

  const doc = documents.find((d) => d.id === activeDocumentId);
  if (!doc) return null;

  const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);

  const applyCropAspect = (aspect: typeof toolOptions.cropAspect, customRatio?: number) => {
    const custom = customRatio ?? toolOptions.cropCustomRatio;
    updateToolOptions(
      aspect === 'custom'
        ? { cropAspect: aspect, cropCustomRatio: custom }
        : { cropAspect: aspect }
    );
    if (!cropRect) return;
    const r = cropRatioFor(aspect, custom);
    if (!r) return;
    setCropRect(fitRatioRect(doc.width, doc.height, r, cropRect.width));
  };

  const swapCropOrientation = () => {
    const r = cropRatioFor(toolOptions.cropAspect, toolOptions.cropCustomRatio);
    if (r) {
      applyCropAspect('custom', 1 / r);
    } else if (cropRect) {
      applyCropAspect('custom', cropRect.height / cropRect.width);
    }
  };

  const handlePlaceImageLayer = async () => {
    const files = await pickLocalFiles(
      'image/png,image/jpeg,image/webp,image/avif,image/bmp,image/gif,image/svg+xml',
      false
    );
    if (files.length === 0) return;
    try {
      const decoded = await decodeImageFile(files[0]);
      placeImageAsLayer(decoded);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to place image.', 'error');
    }
  };

  return (
    <div
      className="h-9 shrink-0 flex items-center justify-between px-3 border-b text-[12px] select-none overflow-x-auto gap-4"
      style={{
        backgroundColor: 'var(--lp-panel)',
        borderColor: 'var(--lp-border)',
      }}
    >
      {/* Left: Active Tool Contextual Controls */}
      <div className="flex items-center gap-3 shrink-0">
        {activeTool === 'move' && (
          <>
            <span className="text-[11px] font-medium text-[var(--lp-text-secondary)]">
              Move & Transform
            </span>
            <div className="h-4 w-px bg-[var(--lp-border)]" />
            <button
              type="button"
              onClick={() => updateToolOptions({ moveAutoSelect: !toolOptions.moveAutoSelect })}
              title="Auto-Select Topmost Layer Under Cursor"
              className={`px-2 py-0.5 rounded border text-[11px] flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors ${
                toolOptions.moveAutoSelect
                  ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/45'
                  : 'hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)]'
              }`}
              style={{
                borderColor: toolOptions.moveAutoSelect ? undefined : 'var(--lp-border)',
              }}
            >
              <MousePointerClick className="w-3 h-3" />
              <span>Auto-Select</span>
            </button>
            <button
              type="button"
              onClick={() => updateToolOptions({ snapToGuides: !toolOptions.snapToGuides })}
              title="Toggle Smart Alignment Guides & Edge Snapping (Hold Alt to bypass)"
              className={`px-2 py-0.5 rounded border text-[11px] flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors ${
                toolOptions.snapToGuides
                  ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/45'
                  : 'hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)]'
              }`}
              style={{
                borderColor: toolOptions.snapToGuides ? undefined : 'var(--lp-border)',
              }}
            >
              <Magnet className="w-3 h-3" />
              <span>Snap</span>
            </button>
            <div className="h-4 w-px bg-[var(--lp-border)]" />
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-[var(--lp-text-secondary)] mr-1">Align:</span>
              {(['left', 'center-h', 'right', 'top', 'center-v', 'bottom'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  disabled={!activeLayer || activeLayer.locked}
                  onClick={() => alignActiveLayer(a)}
                  className="px-1.5 py-0.5 rounded text-[11px] hover:bg-[var(--lp-hover)] disabled:opacity-35 cursor-pointer whitespace-nowrap"
                >
                  {a === 'center-h' ? 'Center H' : a === 'center-v' ? 'Center V' : a[0].toUpperCase() + a.slice(1)}
                </button>
              ))}
            </div>
            <div className="h-4 w-px bg-[var(--lp-border)]" />
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                disabled={!activeLayer || activeLayer.locked || activeLayer.type === 'group'}
                onClick={() => flipActiveLayer('horizontal')}
                title="Flip Active Layer Horizontal"
                className={`px-1.5 py-0.5 rounded border text-[11px] flex items-center gap-1 disabled:opacity-35 cursor-pointer whitespace-nowrap transition-colors ${
                  activeLayer && activeLayer.flipX
                    ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/45'
                    : 'hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)]'
                }`}
                style={{ borderColor: activeLayer?.flipX ? undefined : 'var(--lp-border)' }}
              >
                <CaretsToAxisDashedVertical className="w-3.5 h-3.5" />
                <span>Flip H</span>
              </button>
              <button
                type="button"
                disabled={!activeLayer || activeLayer.locked || activeLayer.type === 'group'}
                onClick={() => flipActiveLayer('vertical')}
                title="Flip Active Layer Vertical"
                className={`px-1.5 py-0.5 rounded border text-[11px] flex items-center gap-1 disabled:opacity-35 cursor-pointer whitespace-nowrap transition-colors ${
                  activeLayer && activeLayer.flipY
                    ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/45'
                    : 'hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)]'
                }`}
                style={{ borderColor: activeLayer?.flipY ? undefined : 'var(--lp-border)' }}
              >
                <CaretsToAxisDashedHorizontal className="w-3.5 h-3.5" />
                <span>Flip V</span>
              </button>
            </div>
            <div className="h-4 w-px bg-[var(--lp-border)]" />
            <button
              type="button"
              onClick={() => void handlePlaceImageLayer()}
              className="px-2 py-0.5 rounded border text-[11px] hover:bg-[var(--lp-hover)] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              <ImagePlus className="w-3.5 h-3.5 text-[#0A84FF]" />
              <span>Place Image Layer…</span>
            </button>
          </>
        )}

        {(activeTool === 'marquee-rect' ||
          activeTool === 'marquee-ellipse' ||
          activeTool === 'lasso' ||
          activeTool === 'magic-wand') && (
          <>
            <span className="text-[11px] font-medium text-[var(--lp-text-secondary)]">
              {activeTool === 'marquee-rect'
                ? 'Rectangular Marquee'
                : activeTool === 'marquee-ellipse'
                  ? 'Elliptical Marquee'
                  : activeTool === 'lasso'
                    ? 'Lasso'
                    : 'Magic Wand'}
            </span>
            <div className="h-4 w-px bg-[var(--lp-border)]" />

            {activeTool === 'lasso' && (
              <>
                <div className="flex items-center gap-1">
                  {(['freehand', 'polygon'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateToolOptions({ lassoMode: mode })}
                      className={`px-2 py-0.5 rounded text-[11px] cursor-pointer transition-colors ${
                        toolOptions.lassoMode === mode
                          ? 'bg-[#0A84FF] text-white'
                          : 'hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)]'
                      }`}
                    >
                      {mode === 'freehand' ? 'Freehand' : 'Polygonal'}
                    </button>
                  ))}
                </div>
                <div className="h-4 w-px bg-[var(--lp-border)]" />
              </>
            )}

            {activeTool === 'magic-wand' && (
              <>
                <label className="flex items-center gap-2 text-[11px]">
                  <span className="text-[var(--lp-text-secondary)]">Tolerance</span>
                  <input
                    type="range"
                    min={0}
                    max={128}
                    value={toolOptions.wandTolerance}
                    onChange={(e) => updateToolOptions({ wandTolerance: Number(e.target.value) })}
                    className="lp-slider w-24"
                  />
                  <span className="font-mono-tabular w-7">{toolOptions.wandTolerance}</span>
                </label>
                <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={toolOptions.wandContiguous}
                    onChange={(e) => updateToolOptions({ wandContiguous: e.target.checked })}
                  />
                  <span>Contiguous</span>
                </label>
                <div className="h-4 w-px bg-[var(--lp-border)]" />
              </>
            )}

            {doc.selection ? (
              <div className="flex items-center gap-1.5">
                <span className="font-mono-tabular text-[11px] whitespace-nowrap">
                  {Math.round(doc.selection.width)} × {Math.round(doc.selection.height)} px
                  {doc.selection.inverted ? ' (Inv)' : ''}
                </span>
                <div className="h-4 w-px bg-[var(--lp-border)]" />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={64}
                    value={featherRadius}
                    onChange={(e) =>
                      setFeatherRadius(Math.max(1, Math.min(64, Number(e.target.value) || 1)))
                    }
                    title="Feather radius in pixels"
                    className="w-11 px-1 py-0.5 rounded border bg-transparent font-mono-tabular text-[11px]"
                    style={{ borderColor: 'var(--lp-border)' }}
                  />
                  <button
                    type="button"
                    onClick={() => featherActiveSelection(featherRadius)}
                    title="Soften selection edges by radius"
                    className="px-2 py-0.5 rounded border text-[11px] hover:bg-[var(--lp-hover)] cursor-pointer whitespace-nowrap"
                    style={{ borderColor: 'var(--lp-border)' }}
                  >
                    Feather
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={64}
                    value={resizePx}
                    onChange={(e) =>
                      setResizePx(Math.max(1, Math.min(64, Number(e.target.value) || 1)))
                    }
                    aria-label="Grow or shrink amount in pixels"
                    title="Grow / shrink amount in pixels"
                    className="w-11 px-1 py-0.5 rounded border bg-transparent font-mono-tabular text-[11px]"
                    style={{ borderColor: 'var(--lp-border)' }}
                  />
                  <button
                    type="button"
                    onClick={() => resizeActiveSelection(resizePx)}
                    title="Expand selection by the given pixels"
                    className="px-2 py-0.5 rounded border text-[11px] hover:bg-[var(--lp-hover)] cursor-pointer whitespace-nowrap"
                    style={{ borderColor: 'var(--lp-border)' }}
                  >
                    Grow
                  </button>
                  <button
                    type="button"
                    onClick={() => resizeActiveSelection(-resizePx)}
                    title="Contract selection by the given pixels"
                    className="px-2 py-0.5 rounded border text-[11px] hover:bg-[var(--lp-hover)] cursor-pointer whitespace-nowrap"
                    style={{ borderColor: 'var(--lp-border)' }}
                  >
                    Shrink
                  </button>
                </div>
                <button
                  type="button"
                  onClick={layerViaCopyOrDuplicate}
                  title="Create New Layer from Selection (⌘J)"
                  className="px-2 py-0.5 rounded border text-[11px] hover:bg-[var(--lp-hover)] cursor-pointer whitespace-nowrap"
                  style={{ borderColor: 'var(--lp-border)' }}
                >
                  Layer via Copy
                </button>
                <button
                  type="button"
                  onClick={() => applySelectionAsMask('reveal')}
                  title="Convert Selection into Layer Mask"
                  className="px-2 py-0.5 rounded border text-[11px] hover:bg-[var(--lp-hover)] cursor-pointer whitespace-nowrap"
                  style={{ borderColor: 'var(--lp-border)' }}
                >
                  To Mask
                </button>
                <button
                  type="button"
                  onClick={() => fillSelectionWithColor(foregroundColor, 100)}
                  title="Fill Selection with Foreground Color (⇧⌫)"
                  className="px-2 py-0.5 rounded border text-[11px] hover:bg-[var(--lp-hover)] cursor-pointer whitespace-nowrap"
                  style={{ borderColor: 'var(--lp-border)' }}
                >
                  Fill FG
                </button>
                <button
                  type="button"
                  onClick={invertActiveSelection}
                  className="px-2 py-0.5 rounded border text-[11px] hover:bg-[var(--lp-hover)] cursor-pointer whitespace-nowrap"
                  style={{ borderColor: 'var(--lp-border)' }}
                >
                  Invert
                </button>
                <button
                  type="button"
                  onClick={cropToSelection}
                  className="px-2 py-0.5 rounded bg-[#0A84FF] text-white text-[11px] font-medium cursor-pointer whitespace-nowrap"
                >
                  Crop
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="px-2 py-0.5 rounded border text-[11px] hover:bg-[var(--lp-hover)] cursor-pointer whitespace-nowrap"
                  style={{ borderColor: 'var(--lp-border)' }}
                >
                  Deselect
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="px-2 py-0.5 rounded border text-[11px] hover:bg-[var(--lp-hover)] cursor-pointer whitespace-nowrap"
                  style={{ borderColor: 'var(--lp-border)' }}
                >
                  Select All
                </button>
                <span className="text-[11px] text-[var(--lp-text-secondary)] whitespace-nowrap">
                  {activeTool === 'magic-wand'
                    ? 'Click pixel region to select matching colors'
                    : activeTool === 'lasso' && toolOptions.lassoMode === 'polygon'
                      ? 'Click points to trace · Double-click or click origin to close'
                      : 'Drag on canvas to create selection'}
                </span>
              </div>
            )}
          </>
        )}

        {activeTool === 'crop' && (
          <>
            <span className="text-[11px] font-medium text-[var(--lp-text-secondary)]">Crop</span>
            <div className="h-4 w-px bg-[var(--lp-border)]" />
            <div className="flex items-center gap-1">
              {(['free', '1:1', '4:3', '16:9', '3:2', '4:5'] as const).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => applyCropAspect(ratio)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono-tabular cursor-pointer transition-colors ${
                    toolOptions.cropAspect === ratio
                      ? 'bg-[#0A84FF] text-white'
                      : 'hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)]'
                  }`}
                >
                  {ratio === 'free' ? 'Free' : ratio}
                </button>
              ))}
            </div>
            <input
              type="text"
              aria-label="Custom crop ratio"
              title="Custom ratio, e.g. 21:9 or 1.91"
              placeholder="W:H"
              key={toolOptions.cropAspect === 'custom' ? toolOptions.cropCustomRatio : 'preset'}
              defaultValue={
                toolOptions.cropAspect === 'custom'
                  ? String(Math.round(toolOptions.cropCustomRatio * 1000) / 1000)
                  : ''
              }
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const r = parseRatio(e.currentTarget.value);
                if (r) applyCropAspect('custom', r);
              }}
              onBlur={(e) => {
                const r = parseRatio(e.currentTarget.value);
                if (r) applyCropAspect('custom', r);
              }}
              className={`w-14 px-1.5 py-0.5 rounded border text-[11px] font-mono-tabular bg-transparent ${
                toolOptions.cropAspect === 'custom' ? 'border-[#0A84FF]' : ''
              }`}
              style={toolOptions.cropAspect === 'custom' ? undefined : { borderColor: 'var(--lp-border)' }}
            />
            <button
              type="button"
              title="Swap landscape / portrait"
              aria-label="Swap landscape / portrait"
              onClick={swapCropOrientation}
              className="px-1.5 py-0.5 rounded hover:bg-[var(--lp-hover)] text-[11px] cursor-pointer text-[var(--lp-text-secondary)]"
            >
              ⇄
            </button>
            <div className="h-4 w-px bg-[var(--lp-border)]" />
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                title="Rotate 90° Counter-Clockwise"
                onClick={() => rotateActiveDocument(-90)}
                className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Rotate 90° Clockwise"
                onClick={() => rotateActiveDocument(90)}
                className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Flip Horizontal"
                onClick={() => flipActiveDocument('horizontal')}
                className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
              >
                <CaretsToAxisDashedVertical className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Flip Vertical"
                onClick={() => flipActiveDocument('vertical')}
                className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
              >
                <CaretsToAxisDashedHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
            {cropRect && (
              <>
                <div className="h-4 w-px bg-[var(--lp-border)]" />
                <span className="text-[11px] font-mono-tabular text-[var(--lp-text-secondary)]">
                  {Math.round(cropRect.width)} × {Math.round(cropRect.height)}
                </span>
                <button
                  type="button"
                  onClick={applyCrop}
                  className="px-2.5 py-0.5 rounded bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                  Apply
                </button>
                <button
                  type="button"
                  onClick={cancelCrop}
                  className="px-2 py-0.5 rounded border text-[11px] hover:bg-[var(--lp-hover)] flex items-center gap-1 cursor-pointer"
                  style={{ borderColor: 'var(--lp-border)' }}
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>
              </>
            )}
          </>
        )}

        {activeTool === 'brush' && (
          <>
            <span className="text-[11px] font-medium text-[var(--lp-text-secondary)]">Brush</span>
            <div className="h-4 w-px bg-[var(--lp-border)]" />
            <label className="flex items-center gap-2 text-[11px]">
              <span className="text-[var(--lp-text-secondary)]">Size</span>
              <input
                type="range"
                min={1}
                max={200}
                value={toolOptions.brushSize}
                onChange={(e) => updateToolOptions({ brushSize: Number(e.target.value) })}
                className="lp-slider w-24"
              />
              <span className="font-mono-tabular w-9">{toolOptions.brushSize}px</span>
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <span className="text-[var(--lp-text-secondary)]">Hardness</span>
              <input
                type="range"
                min={0}
                max={100}
                value={toolOptions.brushHardness}
                onChange={(e) => updateToolOptions({ brushHardness: Number(e.target.value) })}
                className="lp-slider w-20"
              />
              <span className="font-mono-tabular w-8">{toolOptions.brushHardness}%</span>
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <span className="text-[var(--lp-text-secondary)]">Opacity</span>
              <input
                type="range"
                min={1}
                max={100}
                value={toolOptions.brushOpacity}
                onChange={(e) => updateToolOptions({ brushOpacity: Number(e.target.value) })}
                className="lp-slider w-20"
              />
              <span className="font-mono-tabular w-8">{toolOptions.brushOpacity}%</span>
            </label>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span
                className="w-4 h-4 rounded border"
                style={{ backgroundColor: foregroundColor, borderColor: 'var(--lp-border-strong)' }}
              />
              <span className="font-mono-tabular text-[var(--lp-text-secondary)]">{foregroundColor}</span>
            </div>
          </>
        )}

        {activeTool === 'eraser' && (
          <>
            <span className="text-[11px] font-medium text-[var(--lp-text-secondary)]">Eraser</span>
            <div className="h-4 w-px bg-[var(--lp-border)]" />
            <label className="flex items-center gap-2 text-[11px]">
              <span className="text-[var(--lp-text-secondary)]">Size</span>
              <input
                type="range"
                min={2}
                max={200}
                value={toolOptions.eraserSize}
                onChange={(e) => updateToolOptions({ eraserSize: Number(e.target.value) })}
                className="lp-slider w-24"
              />
              <span className="font-mono-tabular w-9">{toolOptions.eraserSize}px</span>
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <span className="text-[var(--lp-text-secondary)]">Opacity</span>
              <input
                type="range"
                min={1}
                max={100}
                value={toolOptions.eraserOpacity}
                onChange={(e) => updateToolOptions({ eraserOpacity: Number(e.target.value) })}
                className="lp-slider w-20"
              />
              <span className="font-mono-tabular w-8">{toolOptions.eraserOpacity}%</span>
            </label>
          </>
        )}

        {activeTool === 'bucket' && (
          <>
            <span className="text-[11px] font-medium text-[var(--lp-text-secondary)]">Paint Bucket</span>
            <div className="h-4 w-px bg-[var(--lp-border)]" />
            <label className="flex items-center gap-2 text-[11px]">
              <span className="text-[var(--lp-text-secondary)]">Tolerance</span>
              <input
                type="range"
                min={0}
                max={255}
                value={toolOptions.bucketTolerance}
                onChange={(e) => updateToolOptions({ bucketTolerance: Number(e.target.value) })}
                className="lp-slider w-24"
              />
              <span className="font-mono-tabular w-7">{toolOptions.bucketTolerance}</span>
            </label>
            <span className="text-[11px] text-[var(--lp-text-secondary)]">
              Click inside raster layer to fill with {foregroundColor}
            </span>
          </>
        )}

        {activeTool === 'gradient' && (
          <>
            <span className="text-[11px] font-medium text-[var(--lp-text-secondary)]">Gradient</span>
            <div className="h-4 w-px bg-[var(--lp-border)]" />
            <div className="flex items-center gap-1">
              {(['linear', 'radial'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => updateToolOptions({ gradientKind: kind })}
                  className={`px-2 py-0.5 rounded text-[11px] cursor-pointer transition-colors ${
                    toolOptions.gradientKind === kind
                      ? 'bg-[#0A84FF] text-white'
                      : 'hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)]'
                  }`}
                >
                  {kind === 'linear' ? 'Linear' : 'Radial'}
                </button>
              ))}
            </div>
            <div className="h-4 w-px bg-[var(--lp-border)]" />
            <div className="flex items-center gap-1">
              {(
                [
                  ['fg-bg', 'FG → BG'],
                  ['fg-transparent', 'FG → Transp'],
                ] as const
              ).map(([style, label]) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => updateToolOptions({ gradientStyle: style })}
                  className={`px-2 py-0.5 rounded text-[11px] cursor-pointer whitespace-nowrap transition-colors ${
                    toolOptions.gradientStyle === style
                      ? 'bg-[#0A84FF] text-white'
                      : 'hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              className="w-16 h-4 rounded border shrink-0 checkerboard-bg overflow-hidden"
              style={{ borderColor: 'var(--lp-border-strong)' }}
              title="Active Gradient Preview"
            >
              <div
                className="w-full h-full"
                style={{
                  background:
                    toolOptions.gradientStyle === 'fg-transparent'
                      ? `linear-gradient(to right, ${foregroundColor}, transparent)`
                      : `linear-gradient(to right, ${foregroundColor}, ${backgroundColor})`,
                  opacity: toolOptions.gradientOpacity / 100,
                }}
              />
            </div>
            <label className="flex items-center gap-2 text-[11px]">
              <span className="text-[var(--lp-text-secondary)]">Opacity</span>
              <input
                type="range"
                min={1}
                max={100}
                value={toolOptions.gradientOpacity}
                onChange={(e) => updateToolOptions({ gradientOpacity: Number(e.target.value) })}
                className="lp-slider w-20"
              />
              <span className="font-mono-tabular w-8">{toolOptions.gradientOpacity}%</span>
            </label>
          </>
        )}

        {activeTool === 'clone-stamp' && (
          <>
            <span className="text-[11px] font-medium text-[var(--lp-text-secondary)] whitespace-nowrap">
              Clone Stamp
            </span>
            <div className="h-4 w-px bg-[var(--lp-border)]" />
            <label className="flex items-center gap-2 text-[11px]">
              <span className="text-[var(--lp-text-secondary)]">Size</span>
              <input
                type="range"
                min={2}
                max={200}
                value={toolOptions.cloneSize}
                onChange={(e) => updateToolOptions({ cloneSize: Number(e.target.value) })}
                className="lp-slider w-20"
              />
              <span className="font-mono-tabular w-9">{toolOptions.cloneSize}px</span>
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <span className="text-[var(--lp-text-secondary)]">Hardness</span>
              <input
                type="range"
                min={0}
                max={100}
                value={toolOptions.cloneHardness}
                onChange={(e) => updateToolOptions({ cloneHardness: Number(e.target.value) })}
                className="lp-slider w-16"
              />
              <span className="font-mono-tabular w-8">{toolOptions.cloneHardness}%</span>
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <span className="text-[var(--lp-text-secondary)]">Opacity</span>
              <input
                type="range"
                min={1}
                max={100}
                value={toolOptions.cloneOpacity}
                onChange={(e) => updateToolOptions({ cloneOpacity: Number(e.target.value) })}
                className="lp-slider w-16"
              />
              <span className="font-mono-tabular w-8">{toolOptions.cloneOpacity}%</span>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={toolOptions.cloneAligned}
                onChange={(e) => updateToolOptions({ cloneAligned: e.target.checked })}
              />
              <span>Aligned</span>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={toolOptions.cloneSampleAllLayers}
                onChange={(e) => updateToolOptions({ cloneSampleAllLayers: e.target.checked })}
              />
              <span>All Layers</span>
            </label>
            <span className="text-[11px] font-mono-tabular text-[var(--lp-text-secondary)] whitespace-nowrap">
              {cloneSource ? `Src ${cloneSource.x}, ${cloneSource.y}` : 'Alt+Click to sample'}
            </span>
          </>
        )}

        {activeTool === 'spot-heal' && (
          <>
            <span className="text-[11px] font-medium text-[var(--lp-text-secondary)] whitespace-nowrap">
              Spot Healing
            </span>
            <div className="h-4 w-px bg-[var(--lp-border)]" />
            <label className="flex items-center gap-2 text-[11px]">
              <span className="text-[var(--lp-text-secondary)]">Size</span>
              <input
                type="range"
                min={2}
                max={150}
                value={toolOptions.healSize}
                onChange={(e) => updateToolOptions({ healSize: Number(e.target.value) })}
                className="lp-slider w-24"
              />
              <span className="font-mono-tabular w-9">{toolOptions.healSize}px</span>
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <span className="text-[var(--lp-text-secondary)]">Hardness</span>
              <input
                type="range"
                min={0}
                max={100}
                value={toolOptions.healHardness}
                onChange={(e) => updateToolOptions({ healHardness: Number(e.target.value) })}
                className="lp-slider w-20"
              />
              <span className="font-mono-tabular w-8">{toolOptions.healHardness}%</span>
            </label>
            <span className="text-[11px] text-[var(--lp-text-secondary)] whitespace-nowrap">
              Click or drag over blemishes to blend from surrounding pixels
            </span>
          </>
        )}

        {activeTool === 'text' && (
          <>
            <span className="text-[11px] font-medium text-[var(--lp-text-secondary)]">Text</span>
            <div className="h-4 w-px bg-[var(--lp-border)]" />
            <label className="flex items-center gap-1.5 text-[11px]">
              <span className="text-[var(--lp-text-secondary)]">Size</span>
              <input
                type="number"
                min={8}
                max={400}
                value={toolOptions.textFontSize}
                onChange={(e) =>
                  updateToolOptions({ textFontSize: Math.max(8, Number(e.target.value) || 24) })
                }
                className="w-14 px-1.5 py-0.5 rounded border bg-transparent font-mono-tabular text-[11px]"
                style={{ borderColor: 'var(--lp-border)' }}
              />
            </label>
            <select
              value={toolOptions.textFontWeight}
              onChange={(e) =>
                updateToolOptions({
                  textFontWeight: e.target.value as '400' | '500' | '600' | '700',
                })
              }
              className="px-1.5 py-0.5 rounded border text-[11px] bg-[var(--lp-panel)]"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semibold</option>
              <option value="700">Bold</option>
            </select>
            <div className="flex items-center gap-0.5">
              {(
                [
                  ['left', AlignLeft],
                  ['center', AlignCenter],
                  ['right', AlignRight],
                ] as const
              ).map(([align, Icon]) => (
                <button
                  key={align}
                  type="button"
                  onClick={() => updateToolOptions({ textAlign: align })}
                  className={`p-1 rounded cursor-pointer ${
                    toolOptions.textAlign === align
                      ? 'bg-[#0A84FF] text-white'
                      : 'hover:bg-[var(--lp-hover)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
            <span className="text-[11px] text-[var(--lp-text-secondary)]">
              Click canvas to place text
            </span>
          </>
        )}

        {activeTool === 'shape' && (
          <>
            <span className="text-[11px] font-medium text-[var(--lp-text-secondary)]">Shape</span>
            <div className="h-4 w-px bg-[var(--lp-border)]" />
            <select
              value={toolOptions.shapeKind}
              onChange={(e) => updateToolOptions({ shapeKind: e.target.value as ShapeKind })}
              className="px-2 py-0.5 rounded border text-[11px] bg-[var(--lp-panel)]"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              <option value="rounded-rect">Rounded Rect</option>
              <option value="rect">Rectangle</option>
              <option value="ellipse">Ellipse</option>
              <option value="line">Line</option>
            </select>
            <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={toolOptions.shapeFillEnabled}
                onChange={(e) => updateToolOptions({ shapeFillEnabled: e.target.checked })}
              />
              <span>Fill</span>
              <input
                type="color"
                value={toolOptions.shapeFill}
                onChange={(e) => updateToolOptions({ shapeFill: e.target.value })}
                className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={toolOptions.shapeStrokeEnabled}
                onChange={(e) => updateToolOptions({ shapeStrokeEnabled: e.target.checked })}
              />
              <span>Stroke</span>
              <input
                type="color"
                value={toolOptions.shapeStroke}
                onChange={(e) => updateToolOptions({ shapeStroke: e.target.value })}
                className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer"
              />
            </label>
            <span className="text-[11px] text-[var(--lp-text-secondary)]">
              Drag on canvas to draw
            </span>
          </>
        )}

        {activeTool === 'eyedropper' && (
          <span className="text-[11px] text-[var(--lp-text-secondary)]">
            Eyedropper · Click anywhere on canvas to sample pixel color into Foreground
          </span>
        )}

        {activeTool === 'hand' && (
          <span className="text-[11px] text-[var(--lp-text-secondary)]">
            Hand Tool · Drag canvas to pan viewport (Tip: hold Space with any tool)
          </span>
        )}

        {activeTool === 'zoom' && (
          <>
            <span className="text-[11px] font-medium text-[var(--lp-text-secondary)]">Zoom</span>
            <div className="h-4 w-px bg-[var(--lp-border)]" />
            <button
              type="button"
              onClick={requestFitZoom}
              className="px-2 py-0.5 rounded border text-[11px] hover:bg-[var(--lp-hover)] cursor-pointer"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              Fit Screen
            </button>
            <button
              type="button"
              onClick={() => setZoom(1, 0, 0)}
              className="px-2 py-0.5 rounded border text-[11px] hover:bg-[var(--lp-hover)] cursor-pointer"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              100%
            </button>
            <span className="text-[11px] text-[var(--lp-text-secondary)]">
              Click to zoom in · Alt+Click to zoom out
            </span>
          </>
        )}
      </div>

      {/* Right: Mask Target Indicator & Quick Viewport Toggles */}
      <div className="flex items-center gap-1 shrink-0">
        {doc.editingTarget === 'mask' && activeLayer?.mask && (
          <div className="flex items-center gap-1.5 mr-1 px-2 py-0.5 rounded border border-[#0A84FF]/45 bg-[#0A84FF]/12 text-[11px] text-[#0A84FF]">
            <span className="font-medium whitespace-nowrap">
              Mask · Black hides, White reveals
            </span>
            <button
              type="button"
              onClick={() => setEditingTarget('layer')}
              className="px-1.5 py-0.5 rounded bg-[#0A84FF] text-white text-[10px] font-medium cursor-pointer whitespace-nowrap"
            >
              Back to Layer
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => toggleViewportSetting('showRulers')}
          title="Toggle Rulers"
          className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] cursor-pointer transition-colors ${
            viewportSettings.showRulers
              ? 'bg-[var(--lp-active-surface)] text-[#0A84FF]'
              : 'text-[var(--lp-text-secondary)] hover:bg-[var(--lp-hover)]'
          }`}
        >
          <Ruler className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Rulers</span>
        </button>

        <button
          type="button"
          onClick={() => toggleViewportSetting('showGrid')}
          title="Toggle Pixel Grid"
          className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] cursor-pointer transition-colors ${
            viewportSettings.showGrid
              ? 'bg-[var(--lp-active-surface)] text-[#0A84FF]'
              : 'text-[var(--lp-text-secondary)] hover:bg-[var(--lp-hover)]'
          }`}
        >
          <Grid3x3 className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Grid</span>
        </button>

        <button
          type="button"
          onPointerDown={() => setBeforeAfterMode('hold')}
          onPointerUp={() =>
            setBeforeAfterMode(viewportSettings.beforeAfterMode === 'hold' ? 'off' : viewportSettings.beforeAfterMode)
          }
          onPointerLeave={() => {
            if (viewportSettings.beforeAfterMode === 'hold') setBeforeAfterMode('off');
          }}
          title="Hold to View Original (Unadjusted)"
          className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] cursor-pointer transition-colors ${
            viewportSettings.beforeAfterMode === 'hold'
              ? 'bg-[#0A84FF] text-white'
              : 'text-[var(--lp-text-secondary)] hover:bg-[var(--lp-hover)]'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Hold Original</span>
        </button>

        <button
          type="button"
          onClick={() =>
            setBeforeAfterMode(
              viewportSettings.beforeAfterMode === 'split' ? 'off' : 'split'
            )
          }
          title="Before / After Split Comparison"
          className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] cursor-pointer transition-colors ${
            viewportSettings.beforeAfterMode === 'split'
              ? 'bg-[#0A84FF] text-white'
              : 'text-[var(--lp-text-secondary)] hover:bg-[var(--lp-hover)]'
          }`}
        >
          <Columns2 className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Split</span>
        </button>
      </div>
    </div>
  );
};
