import React, { useEffect, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Contrast,
  Copy,
  Eye,
  EyeOff,
  CaretsToAxisDashedVertical,
  CaretsToAxisDashedHorizontal,
  Folder,
  FolderOpen,
  FolderPlus,
  SlidersHorizontal,
  Image as ImageIcon,
  Lock,
  Merge,
  Plus,
  RotateCcw,
  Shapes,
  Sparkles,
  Trash2,
  Type,
  Unlock,
} from 'lucide-react';
import {
  cloneAdjustments,
  createDefaultHslMixer,
  DEFAULT_FILTERS,
  DEFAULT_GRADIENT_MAP,
  getTargetAdjustments,
  HSL_BAND_META,
  isDefaultAdjustments,
  isDefaultFilters,
  isDefaultHslMixer,
} from '../engine/adjustments';
import {
  browserPresetStorage,
  deletePreset,
  FONT_PRESETS,
  loadPresets,
  QUICK_LOOKS,
  savePreset,
  type AdjustmentPreset,
} from '../engine/presets';
import {
  DEFAULT_COLOR_OVERLAY,
  DEFAULT_DROP_SHADOW,
  DEFAULT_INNER_GLOW,
  DEFAULT_INNER_SHADOW,
  DEFAULT_OUTER_GLOW,
  DEFAULT_STROKE,
} from '../engine/canvasOps';
import { useEditorStore } from '../store/useEditorStore';
import type { BlendMode, HslBandId, Layer, ShapeKind } from '../types/editor';
import { CurvesLevelsPanel } from './CurvesLevelsPanel';
import { HistogramPanel } from './HistogramPanel';

const BLEND_MODES: Array<{ value: BlendMode; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
];

const EffectRange: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit?: () => void;
}> = ({ label, value, min, max, suffix = '', disabled, onChange, onCommit }) => (
  <div>
    <div className="flex justify-between text-[10px] text-[var(--lp-text-secondary)]">
      <span>{label}</span>
      <span className="font-mono-tabular">
        {value}
        {suffix}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={onCommit}
      className="lp-slider w-full"
    />
  </div>
);

interface SectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  rightAction?: React.ReactNode;
  children: React.ReactNode;
}

const InspectorSection: React.FC<SectionProps> = ({
  title,
  open,
  onToggle,
  rightAction,
  children,
}) => (
  <div className="border-b" style={{ borderColor: 'var(--lp-border)' }}>
    <div className="flex items-center justify-between px-3 py-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--lp-text)] hover:opacity-80 cursor-pointer"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-[var(--lp-text-secondary)]" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[var(--lp-text-secondary)]" />
        )}
        <span>{title}</span>
      </button>
      {rightAction}
    </div>
    {open && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
  </div>
);

export const RightInspector: React.FC = () => {
  const {
    documents,
    activeDocumentId,
    inspectorOpen,
    inspectorWidth,
    toggleInspectorPanel,
    selectLayer,
    setEditingTarget,
    addRasterLayer,
    addGroupLayer,
    addAdjustmentLayer,
    toggleGroupExpanded,
    assignLayerToGroup,
    addLayerMask,
    toggleLayerMaskEnabled,
    invertLayerMask,
    deleteLayerMask,
    addTextLayer,
    addShapeLayer,
    updateLayer,
    updateLayerEffects,
    clipboardEffects,
    copyActiveLayerEffects,
    pasteActiveLayerEffects,
    flipActiveLayer,
    deleteLayer,
    duplicateLayer,
    moveLayerOrder,
    mergeLayerDown,
    rasterizeActiveLayer,
    reorderLayers,
    alignActiveLayer,
    updateAdjustments,
    updateFilters,
    updateHslBand,
    resetHslMixer,
    updateGradientMap,
    resetFilters,
    commitAdjustmentsHistory,
    applyAutoEnhance,
    resetAdjustments,
    showToast,
    foregroundColor,
    setForegroundColor,
    recentSwatches,
    jumpToHistory,
    cursorCanvasPos,
    setEditingTextLayerId,
    viewportSettings,
    setBeforeAfterMode,
  } = useEditorStore();

  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [dragLayerIdx, setDragLayerIdx] = useState<number | null>(null);
  const [presetName, setPresetName] = useState('');
  const [savedPresets, setSavedPresets] = useState<AdjustmentPreset[]>([]);
  const [activeHslBand, setActiveHslBand] = useState<HslBandId>('red');

  useEffect(() => {
    setSavedPresets(loadPresets(browserPresetStorage()));
  }, []);

  const doc = documents.find((d) => d.id === activeDocumentId) ?? null;
  if (!doc) return null;

  const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId) ?? null;
  const activeLayerIndex = doc.layers.findIndex((l) => l.id === doc.activeLayerId);
  const groupLayers = doc.layers.filter((l) => l.type === 'group');
  const layerIdSet = new Set(doc.layers.map((l) => l.id));

  const adjustmentSliders: Array<{
    key:
      | 'exposure'
      | 'brightness'
      | 'contrast'
      | 'highlights'
      | 'shadows'
      | 'clarity'
      | 'fade'
      | 'temperature'
      | 'tint'
      | 'vibrance'
      | 'saturation'
      | 'hue'
      | 'sharpness';
    label: string;
    min: number;
    max: number;
    step?: number;
  }> = [
    { key: 'exposure', label: 'Exposure', min: -2, max: 2, step: 0.05 },
    { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
    { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
    { key: 'highlights', label: 'Highlights', min: -100, max: 100 },
    { key: 'shadows', label: 'Shadows', min: -100, max: 100 },
    { key: 'clarity', label: 'Clarity', min: -100, max: 100 },
    { key: 'fade', label: 'Matte Fade', min: 0, max: 100 },
    { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
    { key: 'tint', label: 'Tint', min: -100, max: 100 },
    { key: 'vibrance', label: 'Vibrance', min: -100, max: 100 },
    { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
    { key: 'hue', label: 'Hue', min: -180, max: 180 },
    { key: 'sharpness', label: 'Sharpness', min: 0, max: 100 },
  ];

  // Build hierarchical display list (topmost z-order first, child layers indented beneath expanded groups)
  const displayNodes: Array<{ layer: Layer; index: number; isChild: boolean }> = [];
  const topLevelReversed = doc.layers
    .map((layer, index) => ({ layer, index }))
    .filter(({ layer }) => !layer.parentId || !layerIdSet.has(layer.parentId))
    .reverse();

  for (const item of topLevelReversed) {
    displayNodes.push({ ...item, isChild: false });
    if (item.layer.type === 'group' && item.layer.expanded) {
      const childrenReversed = doc.layers
        .map((layer, index) => ({ layer, index }))
        .filter(({ layer }) => layer.parentId === item.layer.id)
        .reverse();
      for (const child of childrenReversed) {
        displayNodes.push({ ...child, isChild: true });
      }
    }
  }

  const estimatedBytes = doc.width * doc.height * 4 * Math.max(1, doc.layers.length);
  const targetAdj = getTargetAdjustments(doc);
  const editingLayerAdj = activeLayer?.type === 'adjustment';
  const filters = targetAdj.filters ?? DEFAULT_FILTERS;

  const handleSavePreset = () => {
    const saved = savePreset(browserPresetStorage(), presetName, targetAdj);
    if (!saved) {
      showToast('Could not save preset. My Presets may be full or storage is unavailable.', 'error');
      return;
    }
    setSavedPresets(loadPresets(browserPresetStorage()));
    setPresetName('');
    showToast(`Saved preset “${saved.name}”.`, 'success');
  };

  const handleApplyPreset = (preset: AdjustmentPreset) => {
    updateAdjustments(cloneAdjustments(preset.adjustments), `Apply Preset: ${preset.name}`);
  };

  const handleDeletePreset = (preset: AdjustmentPreset) => {
    setSavedPresets(deletePreset(browserPresetStorage(), preset.id));
    showToast(`Deleted preset “${preset.name}”.`, 'info');
  };

  return (
    <aside
      className="shrink-0 border-l overflow-y-auto select-none"
      style={{
        width: inspectorWidth,
        backgroundColor: 'var(--lp-sidebar)',
        borderColor: 'var(--lp-border)',
      }}
    >
      {/* 0. HISTOGRAM PANEL */}
      <InspectorSection
        title="Histogram"
        open={inspectorOpen.histogram}
        onToggle={() => toggleInspectorPanel('histogram')}
      >
        <HistogramPanel />
      </InspectorSection>

      {/* 1. LAYERS PANEL */}
      <InspectorSection
        title="Layers"
        open={inspectorOpen.layers}
        onToggle={() => toggleInspectorPanel('layers')}
        rightAction={
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              title="Add Raster Layer"
              onClick={() => addRasterLayer()}
              className="p-1 rounded hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Add Layer Group"
              onClick={() => addGroupLayer()}
              className="p-1 rounded hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Add Adjustment Layer"
              aria-label="Add Adjustment Layer"
              onClick={() => addAdjustmentLayer()}
              className="p-1 rounded hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title={activeLayer?.mask ? 'Layer already has a mask' : 'Add Layer Mask'}
              disabled={!activeLayer || !!activeLayer.mask}
              onClick={() => activeLayer && addLayerMask(activeLayer.id)}
              className="p-1 rounded hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] disabled:opacity-30 cursor-pointer"
            >
              <Contrast className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Add Text Layer"
              onClick={() => {
                const id = addTextLayer();
                if (id) setEditingTextLayerId(id);
              }}
              className="p-1 rounded hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] cursor-pointer"
            >
              <Type className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Add Shape Layer"
              onClick={() =>
                addShapeLayer(
                  doc.width * 0.35,
                  doc.height * 0.35,
                  doc.width * 0.3,
                  doc.height * 0.3,
                  'rounded-rect'
                )
              }
              className="p-1 rounded hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] cursor-pointer"
            >
              <Shapes className="w-3.5 h-3.5" />
            </button>
          </div>
        }
      >
        {activeLayer && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-[var(--lp-text-secondary)] mb-1">
                Blend Mode
              </label>
              <select
                value={activeLayer.blendMode}
                onChange={(e) =>
                  updateLayer(
                    activeLayer.id,
                    { blendMode: e.target.value as BlendMode },
                    'Blend Mode'
                  )
                }
                className="w-full px-2 py-1 rounded border text-[11px] bg-[var(--lp-panel)]"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                {BLEND_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between text-[10px] text-[var(--lp-text-secondary)] mb-1">
                <span>Opacity</span>
                <span className="font-mono-tabular">{activeLayer.opacity}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={activeLayer.opacity}
                onChange={(e) =>
                  updateLayer(activeLayer.id, { opacity: Number(e.target.value) })
                }
                onPointerUp={() => commitAdjustmentsHistory('Layer Opacity')}
                onKeyUp={() => commitAdjustmentsHistory('Layer Opacity')}
                className="lp-slider w-full mt-1.5"
              />
            </div>
          </div>
        )}

        {/* Group Assignment Picker (shown when at least 1 Group exists & active layer isn't a Group) */}
        {activeLayer && activeLayer.type !== 'group' && groupLayers.length > 0 && (
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <span className="text-[var(--lp-text-secondary)]">Parent Group</span>
            <select
              value={activeLayer.parentId ?? ''}
              onChange={(e) =>
                assignLayerToGroup(activeLayer.id, e.target.value || null)
              }
              className="px-2 py-0.5 rounded border text-[11px] bg-[var(--lp-panel)] max-w-[155px]"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              <option value="">None (Top Level)</option>
              {groupLayers.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div
          className="rounded-lg border overflow-hidden divide-y max-h-56 overflow-y-auto"
          style={{
            backgroundColor: 'var(--lp-panel)',
            borderColor: 'var(--lp-border)',
          }}
        >
          {displayNodes.map(({ layer, index, isChild }) => {
            const isSelected = layer.id === doc.activeLayerId;
            const editingMask = isSelected && doc.editingTarget === 'mask' && !!layer.mask;
            return (
              <div
                key={layer.id}
                data-layer-row={layer.name}
                draggable
                onDragStart={() => setDragLayerIdx(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragLayerIdx !== null && dragLayerIdx !== index) {
                    const dragged = doc.layers[dragLayerIdx];
                    if (
                      dragged &&
                      dragged.type !== 'group' &&
                      layer.type === 'group' &&
                      dragged.parentId !== layer.id
                    ) {
                      assignLayerToGroup(dragged.id, layer.id);
                    } else {
                      reorderLayers(dragLayerIdx, index);
                    }
                  }
                  setDragLayerIdx(null);
                }}
                onClick={() => {
                  selectLayer(layer.id);
                  setEditingTarget('layer');
                }}
                onDoubleClick={() => {
                  if (layer.type === 'text') {
                    setEditingTextLayerId(layer.id);
                  } else {
                    setRenamingLayerId(layer.id);
                    setRenameText(layer.name);
                  }
                }}
                className={`flex items-center gap-1.5 py-1.5 pr-2 text-[11px] cursor-pointer transition-colors ${
                  isChild ? 'pl-6' : 'pl-2'
                } ${
                  isSelected
                    ? 'bg-[var(--lp-active-surface)] text-[var(--lp-text)]'
                    : 'hover:bg-[var(--lp-hover)]'
                }`}
                style={{ borderColor: 'var(--lp-border)' }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateLayer(layer.id, { visible: !layer.visible }, 'Toggle Visibility');
                  }}
                  title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                  className="text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] cursor-pointer shrink-0"
                >
                  {layer.visible ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 opacity-45" />
                  )}
                </button>

                {layer.type === 'group' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGroupExpanded(layer.id);
                    }}
                    title={layer.expanded ? 'Collapse Group' : 'Expand Group'}
                    className="text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] cursor-pointer shrink-0"
                  >
                    {layer.expanded ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                  </button>
                )}

                <span
                  className={`w-4.5 h-4.5 rounded flex items-center justify-center shrink-0 ${
                    isSelected && !editingMask ? 'ring-1 ring-[#0A84FF]' : ''
                  }`}
                  style={{
                    backgroundColor:
                      layer.type === 'raster'
                        ? 'rgba(90, 200, 250, 0.14)'
                        : layer.type === 'text'
                          ? 'rgba(191, 90, 242, 0.16)'
                          : layer.type === 'group'
                            ? 'rgba(48, 209, 88, 0.16)'
                            : layer.type === 'adjustment'
                              ? 'rgba(10, 132, 255, 0.16)'
                              : 'rgba(255, 159, 10, 0.16)',
                    color:
                      layer.type === 'raster'
                        ? '#5AC8FA'
                        : layer.type === 'text'
                          ? '#BF5AF2'
                          : layer.type === 'group'
                            ? '#30D158'
                            : layer.type === 'adjustment'
                              ? '#0A84FF'
                              : '#FF9F0A',
                  }}
                >
                  {layer.type === 'raster' ? (
                    <ImageIcon className="w-3 h-3" />
                  ) : layer.type === 'text' ? (
                    <Type className="w-3 h-3" />
                  ) : layer.type === 'group' ? (
                    layer.expanded ? (
                      <FolderOpen className="w-3 h-3" />
                    ) : (
                      <Folder className="w-3 h-3" />
                    )
                  ) : layer.type === 'adjustment' ? (
                    <SlidersHorizontal className="w-3 h-3" />
                  ) : (
                    <Shapes className="w-3 h-3" />
                  )}
                </span>

                {layer.mask && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      selectLayer(layer.id);
                      setEditingTarget('mask');
                    }}
                    title="Click to paint on Layer Mask"
                    className={`w-4.5 h-4.5 rounded flex items-center justify-center shrink-0 border cursor-pointer ${
                      editingMask
                        ? 'ring-2 ring-[#0A84FF] border-[#0A84FF]'
                        : 'border-[var(--lp-border-strong)]'
                    } ${!layer.mask.enabled ? 'opacity-40' : ''}`}
                    style={{ backgroundColor: layer.mask.inverted ? '#1C1C1E' : '#F5F5F7' }}
                  >
                    <Contrast
                      className={`w-3 h-3 ${
                        layer.mask.inverted ? 'text-white' : 'text-[#141414]'
                      }`}
                    />
                  </button>
                )}

                <div className="flex-1 min-w-0">
                  {renamingLayerId === layer.id ? (
                    <input
                      autoFocus
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onBlur={() => {
                        updateLayer(
                          layer.id,
                          { name: renameText.trim() || layer.name },
                          'Rename Layer'
                        );
                        setRenamingLayerId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          updateLayer(
                            layer.id,
                            { name: renameText.trim() || layer.name },
                            'Rename Layer'
                          );
                          setRenamingLayerId(null);
                        }
                      }}
                      className="w-full px-1 py-0.5 rounded bg-[var(--lp-bg)] border border-[#0A84FF] outline-none text-[11px]"
                    />
                  ) : (
                    <div className="truncate font-medium">{layer.name}</div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateLayer(layer.id, { locked: !layer.locked }, 'Toggle Lock');
                  }}
                  title={layer.locked ? 'Unlock Layer' : 'Lock Layer'}
                  className={`cursor-pointer shrink-0 ${
                    layer.locked
                      ? 'text-[#0A84FF]'
                      : 'text-[var(--lp-text-secondary)] opacity-45 hover:opacity-100'
                  }`}
                >
                  {layer.locked ? (
                    <Lock className="w-3 h-3" />
                  ) : (
                    <Unlock className="w-3 h-3" />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Mask Controls for Active Layer */}
        {activeLayer?.mask && (
          <div
            className="rounded-md border px-2 py-1.5 flex items-center justify-between gap-1.5 text-[10px]"
            style={{
              backgroundColor: 'var(--lp-panel)',
              borderColor: 'var(--lp-border)',
            }}
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEditingTarget('layer')}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${
                  doc.editingTarget === 'layer'
                    ? 'bg-[#0A84FF] text-white'
                    : 'text-[var(--lp-text-secondary)] hover:bg-[var(--lp-hover)]'
                }`}
              >
                Layer
              </button>
              <button
                type="button"
                onClick={() => setEditingTarget('mask')}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${
                  doc.editingTarget === 'mask'
                    ? 'bg-[#0A84FF] text-white'
                    : 'text-[var(--lp-text-secondary)] hover:bg-[var(--lp-hover)]'
                }`}
              >
                Mask
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => toggleLayerMaskEnabled(activeLayer.id)}
                className="px-1.5 py-0.5 rounded border hover:bg-[var(--lp-hover)] cursor-pointer"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                {activeLayer.mask.enabled ? 'Disable' : 'Enable'}
              </button>
              <button
                type="button"
                onClick={() => invertLayerMask(activeLayer.id)}
                className="px-1.5 py-0.5 rounded border hover:bg-[var(--lp-hover)] cursor-pointer"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                Invert
              </button>
              <button
                type="button"
                onClick={() => deleteLayerMask(activeLayer.id)}
                title="Remove Layer Mask"
                className="p-0.5 rounded hover:bg-[#FF453A]/15 hover:text-[#FF453A] cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Layer Action Bar */}
        {activeLayer && (
          <div className="flex items-center justify-between pt-0.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={activeLayerIndex >= doc.layers.length - 1}
                onClick={() => moveLayerOrder(activeLayer.id, 'up')}
                title="Move Up"
                className="p-1 rounded border hover:bg-[var(--lp-hover)] disabled:opacity-30 cursor-pointer"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                disabled={activeLayerIndex <= 0}
                onClick={() => moveLayerOrder(activeLayer.id, 'down')}
                title="Move Down"
                className="p-1 rounded border hover:bg-[var(--lp-hover)] disabled:opacity-30 cursor-pointer"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                <ArrowDown className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => duplicateLayer(activeLayer.id)}
                title="Duplicate Layer"
                className="p-1 rounded border hover:bg-[var(--lp-hover)] cursor-pointer"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                <Copy className="w-3 h-3" />
              </button>
              <button
                type="button"
                disabled={activeLayerIndex <= 0 || activeLayer.type === 'group' || activeLayer.type === 'adjustment'}
                onClick={() => mergeLayerDown(activeLayer.id)}
                title="Merge Down"
                className="p-1 rounded border hover:bg-[var(--lp-hover)] disabled:opacity-30 cursor-pointer"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                <Merge className="w-3 h-3" />
              </button>
            </div>

            <button
              type="button"
              disabled={doc.layers.length <= 1}
              onClick={() => deleteLayer(activeLayer.id)}
              title="Delete Layer"
              className="p-1 rounded border hover:bg-[#FF453A]/15 hover:text-[#FF453A] disabled:opacity-30 cursor-pointer"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </InspectorSection>

      {/* 2. PROPERTIES PANEL */}
      <InspectorSection
        title="Properties"
        open={inspectorOpen.properties}
        onToggle={() => toggleInspectorPanel('properties')}
      >
        {activeLayer ? (
          activeLayer.type === 'adjustment' ? (
            <div className="space-y-1.5 text-[11px] text-[var(--lp-text-secondary)]">
              <div className="flex items-center justify-between text-[var(--lp-text)]">
                <span className="font-medium">Adjustment Layer</span>
              </div>
              <p className="text-[10px] leading-relaxed">
                Applies to everything below it{activeLayer.parentId ? ' in its group' : ''}. Edit its
                settings in the Adjustments panel. Opacity, blend mode and a layer mask control where
                and how strongly it applies.
              </p>
            </div>
          ) : activeLayer.type === 'group' ? (
            <div className="space-y-1.5 text-[11px] text-[var(--lp-text-secondary)]">
              <div className="flex items-center justify-between text-[var(--lp-text)]">
                <span className="font-medium">Layer Group</span>
                <span className="font-mono-tabular">
                  {doc.layers.filter((l) => l.parentId === activeLayer.id).length} nested
                </span>
              </div>
              <p className="text-[10px] leading-relaxed">
                Group Blend Mode, Opacity, and Layer Mask composite across all nested child layers.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 text-[11px]">
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] text-[var(--lp-text-secondary)]">X</span>
                <input
                  type="number"
                  disabled={activeLayer.locked}
                  value={Math.round(activeLayer.x)}
                  onChange={(e) =>
                    updateLayer(activeLayer.id, { x: Number(e.target.value) || 0 }, 'Move X')
                  }
                  className="w-full px-2 py-1 rounded border bg-[var(--lp-panel)] font-mono-tabular"
                  style={{ borderColor: 'var(--lp-border)' }}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-[var(--lp-text-secondary)]">Y</span>
                <input
                  type="number"
                  disabled={activeLayer.locked}
                  value={Math.round(activeLayer.y)}
                  onChange={(e) =>
                    updateLayer(activeLayer.id, { y: Number(e.target.value) || 0 }, 'Move Y')
                  }
                  className="w-full px-2 py-1 rounded border bg-[var(--lp-panel)] font-mono-tabular"
                  style={{ borderColor: 'var(--lp-border)' }}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-[var(--lp-text-secondary)]">Width</span>
                <input
                  type="number"
                  min={1}
                  disabled={activeLayer.locked}
                  value={Math.round(activeLayer.width * activeLayer.scaleX)}
                  onChange={(e) => {
                    const val = Math.max(1, Number(e.target.value) || 1);
                    if (activeLayer.type === 'raster') {
                      updateLayer(
                        activeLayer.id,
                        { scaleX: val / activeLayer.width },
                        'Resize Layer'
                      );
                    } else {
                      updateLayer(activeLayer.id, { width: val }, 'Resize Layer');
                    }
                  }}
                  className="w-full px-2 py-1 rounded border bg-[var(--lp-panel)] font-mono-tabular"
                  style={{ borderColor: 'var(--lp-border)' }}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-[var(--lp-text-secondary)]">Height</span>
                <input
                  type="number"
                  min={1}
                  disabled={activeLayer.locked}
                  value={Math.round(activeLayer.height * activeLayer.scaleY)}
                  onChange={(e) => {
                    const val = Math.max(1, Number(e.target.value) || 1);
                    if (activeLayer.type === 'raster') {
                      updateLayer(
                        activeLayer.id,
                        { scaleY: val / activeLayer.height },
                        'Resize Layer'
                      );
                    } else {
                      updateLayer(activeLayer.id, { height: val }, 'Resize Layer');
                    }
                  }}
                  className="w-full px-2 py-1 rounded border bg-[var(--lp-panel)] font-mono-tabular"
                  style={{ borderColor: 'var(--lp-border)' }}
                />
              </label>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] text-[var(--lp-text-secondary)] mb-1">
                <span>Rotation</span>
                <div className="flex items-center gap-1.5">
                  {activeLayer.rotation !== 0 && !activeLayer.locked && (
                    <button
                      type="button"
                      onClick={() => updateLayer(activeLayer.id, { rotation: 0 }, 'Reset Rotation')}
                      className="text-[10px] text-[#0A84FF] hover:underline cursor-pointer"
                    >
                      0°
                    </button>
                  )}
                  <span className="font-mono-tabular">{Math.round(activeLayer.rotation)}°</span>
                </div>
              </div>
              <input
                type="range"
                min={-180}
                max={180}
                disabled={activeLayer.locked}
                value={activeLayer.rotation}
                onChange={(e) =>
                  updateLayer(activeLayer.id, { rotation: Number(e.target.value) })
                }
                onPointerUp={() => commitAdjustmentsHistory('Rotate Layer')}
                onKeyUp={() => commitAdjustmentsHistory('Rotate Layer')}
                className="lp-slider w-full"
              />
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                <button
                  type="button"
                  disabled={activeLayer.locked}
                  onClick={() => flipActiveLayer('horizontal')}
                  className={`py-1 px-2 rounded border text-[10px] flex items-center justify-center gap-1.5 disabled:opacity-35 cursor-pointer transition-colors ${
                    activeLayer.flipX
                      ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/45'
                      : 'hover:bg-[var(--lp-hover)]'
                  }`}
                  style={{ borderColor: activeLayer.flipX ? undefined : 'var(--lp-border)' }}
                >
                  <CaretsToAxisDashedVertical className="w-3 h-3" />
                  <span>Flip H</span>
                </button>
                <button
                  type="button"
                  disabled={activeLayer.locked}
                  onClick={() => flipActiveLayer('vertical')}
                  className={`py-1 px-2 rounded border text-[10px] flex items-center justify-center gap-1.5 disabled:opacity-35 cursor-pointer transition-colors ${
                    activeLayer.flipY
                      ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/45'
                      : 'hover:bg-[var(--lp-hover)]'
                  }`}
                  style={{ borderColor: activeLayer.flipY ? undefined : 'var(--lp-border)' }}
                >
                  <CaretsToAxisDashedHorizontal className="w-3 h-3" />
                  <span>Flip V</span>
                </button>
              </div>
            </div>

            {/* Inline Text Layer Controls */}
            {activeLayer.type === 'text' && (
              <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--lp-border)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-[var(--lp-text-secondary)]">
                    Typography
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingTextLayerId(activeLayer.id)}
                    className="text-[10px] text-[#0A84FF] hover:underline cursor-pointer"
                  >
                    Open Full Editor
                  </button>
                </div>
                <input
                  type="text"
                  value={activeLayer.text}
                  onChange={(e) =>
                    updateLayer(activeLayer.id, {
                      text: e.target.value,
                      name: e.target.value.trim().slice(0, 22) || 'Text Layer',
                    })
                  }
                  className="w-full px-2 py-1 rounded border bg-[var(--lp-panel)] text-[11px]"
                  style={{ borderColor: 'var(--lp-border)' }}
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    aria-label="Layer font family"
                    value={activeLayer.fontFamily}
                    onChange={(e) =>
                      updateLayer(activeLayer.id, { fontFamily: e.target.value }, 'Font Family')
                    }
                    className="w-full px-1.5 py-1 rounded border bg-[var(--lp-panel)] text-[11px]"
                    style={{ borderColor: 'var(--lp-border)' }}
                  >
                    {FONT_PRESETS.map((f) => (
                      <option key={f.label} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                    {!FONT_PRESETS.some((f) => f.value === activeLayer.fontFamily) && (
                      <option value={activeLayer.fontFamily}>Custom Font</option>
                    )}
                  </select>
                  <select
                    aria-label="Layer font weight"
                    value={activeLayer.fontWeight}
                    onChange={(e) =>
                      updateLayer(
                        activeLayer.id,
                        { fontWeight: e.target.value as '400' | '500' | '600' | '700' },
                        'Font Weight'
                      )
                    }
                    className="w-full px-1.5 py-1 rounded border bg-[var(--lp-panel)] text-[11px]"
                    style={{ borderColor: 'var(--lp-border)' }}
                  >
                    <option value="400">Regular</option>
                    <option value="500">Medium</option>
                    <option value="600">Semibold</option>
                    <option value="700">Bold</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={8}
                    max={400}
                    aria-label="Layer font size"
                    value={activeLayer.fontSize}
                    onChange={(e) =>
                      updateLayer(
                        activeLayer.id,
                        { fontSize: Math.max(8, Number(e.target.value) || 24) },
                        'Text Size'
                      )
                    }
                    className="w-14 px-1.5 py-1 rounded border bg-[var(--lp-panel)] font-mono-tabular text-[11px]"
                    style={{ borderColor: 'var(--lp-border)' }}
                  />
                  <input
                    type="number"
                    min={0.8}
                    max={3}
                    step={0.05}
                    aria-label="Layer line height"
                    title="Line Height"
                    value={activeLayer.lineHeight}
                    onChange={(e) =>
                      updateLayer(
                        activeLayer.id,
                        {
                          lineHeight: Math.max(0.8, Math.min(3, Number(e.target.value) || 1.25)),
                        },
                        'Line Height'
                      )
                    }
                    className="w-14 px-1.5 py-1 rounded border bg-[var(--lp-panel)] font-mono-tabular text-[11px]"
                    style={{ borderColor: 'var(--lp-border)' }}
                  />
                  <button
                    type="button"
                    title="Toggle Italic"
                    onClick={() =>
                      updateLayer(
                        activeLayer.id,
                        { fontStyle: activeLayer.fontStyle === 'italic' ? 'normal' : 'italic' },
                        'Font Style'
                      )
                    }
                    className={`px-2 py-1 rounded border text-[11px] italic font-serif cursor-pointer transition-colors ${
                      activeLayer.fontStyle === 'italic'
                        ? 'bg-[#0A84FF] text-white border-[#0A84FF]'
                        : 'hover:bg-[var(--lp-hover)]'
                    }`}
                    style={{
                      borderColor:
                        activeLayer.fontStyle === 'italic' ? '#0A84FF' : 'var(--lp-border)',
                    }}
                  >
                    I
                  </button>
                  <div className="flex items-center gap-0.5 ml-auto">
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
                        title={`Align ${align}`}
                        onClick={() =>
                          updateLayer(activeLayer.id, { align }, 'Text Alignment')
                        }
                        className={`p-1 rounded cursor-pointer ${
                          activeLayer.align === align
                            ? 'bg-[#0A84FF] text-white'
                            : 'hover:bg-[var(--lp-hover)]'
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                  <input
                    type="color"
                    value={activeLayer.color}
                    onChange={(e) =>
                      updateLayer(activeLayer.id, { color: e.target.value }, 'Text Color')
                    }
                    className="w-6 h-6 rounded border bg-transparent cursor-pointer shrink-0"
                    style={{ borderColor: 'var(--lp-border)' }}
                  />
                </div>
              </div>
            )}

            {/* Inline Shape Layer Controls */}
            {activeLayer.type === 'shape' && (
              <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--lp-border)' }}>
                <span className="text-[10px] font-medium text-[var(--lp-text-secondary)] block">
                  Shape Style
                </span>
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label="Layer shape kind"
                    value={activeLayer.shapeKind}
                    onChange={(e) =>
                      updateLayer(
                        activeLayer.id,
                        { shapeKind: e.target.value as ShapeKind },
                        'Shape Type'
                      )
                    }
                    className="flex-1 min-w-0 px-1.5 py-1 rounded border bg-[var(--lp-panel)] text-[11px]"
                    style={{ borderColor: 'var(--lp-border)' }}
                  >
                    <option value="rounded-rect">Rounded Rect</option>
                    <option value="rect">Rectangle</option>
                    <option value="ellipse">Ellipse</option>
                    <option value="polygon">Polygon</option>
                    <option value="star">Star</option>
                    <option value="arrow">Arrow</option>
                    <option value="line">Line</option>
                  </select>
                  {activeLayer.shapeKind === 'rounded-rect' && (
                    <label className="flex items-center gap-1 text-[10px] text-[var(--lp-text-secondary)] shrink-0">
                      <span>R</span>
                      <input
                        type="number"
                        min={0}
                        max={200}
                        aria-label="Corner radius"
                        value={activeLayer.cornerRadius}
                        onChange={(e) =>
                          updateLayer(
                            activeLayer.id,
                            {
                              cornerRadius: Math.max(0, Math.min(200, Number(e.target.value) || 0)),
                            },
                            'Corner Radius'
                          )
                        }
                        className="w-12 px-1 py-0.5 rounded border bg-[var(--lp-panel)] font-mono-tabular text-[11px] text-[var(--lp-text)]"
                        style={{ borderColor: 'var(--lp-border)' }}
                      />
                    </label>
                  )}
                  {(activeLayer.shapeKind === 'polygon' || activeLayer.shapeKind === 'star') && (
                    <label className="flex items-center gap-1 text-[10px] text-[var(--lp-text-secondary)] shrink-0">
                      <span>{activeLayer.shapeKind === 'star' ? 'Pts' : 'Sides'}</span>
                      <input
                        type="number"
                        min={3}
                        max={16}
                        aria-label="Polygon or star sides"
                        value={activeLayer.sides ?? 5}
                        onChange={(e) =>
                          updateLayer(
                            activeLayer.id,
                            {
                              sides: Math.max(
                                3,
                                Math.min(16, Math.round(Number(e.target.value) || 5))
                              ),
                            },
                            'Shape Sides'
                          )
                        }
                        className="w-11 px-1 py-0.5 rounded border bg-[var(--lp-panel)] font-mono-tabular text-[11px] text-[var(--lp-text)]"
                        style={{ borderColor: 'var(--lp-border)' }}
                      />
                    </label>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeLayer.fillEnabled}
                      onChange={(e) =>
                        updateLayer(
                          activeLayer.id,
                          { fillEnabled: e.target.checked },
                          'Toggle Shape Fill'
                        )
                      }
                    />
                    <span>Fill</span>
                  </label>
                  <input
                    type="color"
                    value={activeLayer.fill}
                    onChange={(e) =>
                      updateLayer(activeLayer.id, { fill: e.target.value }, 'Shape Fill')
                    }
                    className="w-7 h-6 rounded border bg-transparent cursor-pointer"
                    style={{ borderColor: 'var(--lp-border)' }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeLayer.strokeEnabled}
                      onChange={(e) =>
                        updateLayer(
                          activeLayer.id,
                          { strokeEnabled: e.target.checked },
                          'Toggle Shape Stroke'
                        )
                      }
                    />
                    <span>Stroke</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={64}
                      value={activeLayer.strokeWidth}
                      onChange={(e) =>
                        updateLayer(
                          activeLayer.id,
                          { strokeWidth: Math.max(1, Number(e.target.value) || 1) },
                          'Stroke Width'
                        )
                      }
                      className="w-12 px-1.5 py-0.5 rounded border bg-[var(--lp-panel)] font-mono-tabular text-[11px]"
                      style={{ borderColor: 'var(--lp-border)' }}
                    />
                    <input
                      type="color"
                      value={activeLayer.stroke}
                      onChange={(e) =>
                        updateLayer(activeLayer.id, { stroke: e.target.value }, 'Shape Stroke')
                      }
                      className="w-7 h-6 rounded border bg-transparent cursor-pointer"
                      style={{ borderColor: 'var(--lp-border)' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {(activeLayer.type === 'text' || activeLayer.type === 'shape') && (
              <button
                type="button"
                disabled={activeLayer.locked}
                onClick={rasterizeActiveLayer}
                className="w-full py-1.5 rounded border text-[11px] font-medium hover:bg-[var(--lp-hover)] disabled:opacity-35 cursor-pointer"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                Rasterize to Pixels
              </button>
            )}

            <div className="flex items-center gap-1 pt-0.5">
              {(
                [
                  ['L', 'left'],
                  ['C', 'center-h'],
                  ['R', 'right'],
                  ['T', 'top'],
                  ['M', 'center-v'],
                  ['B', 'bottom'],
                ] as const
              ).map(([label, align]) => (
                <button
                  key={align}
                  type="button"
                  disabled={activeLayer.locked}
                  onClick={() => alignActiveLayer(align)}
                  className="flex-1 py-1 rounded border text-[10px] font-medium hover:bg-[var(--lp-hover)] disabled:opacity-35 cursor-pointer"
                  style={{ borderColor: 'var(--lp-border)' }}
                >
                  {label}
                </button>
              ))}
            </div>
            </div>
          )
        ) : (
          <p className="text-[11px] text-[var(--lp-text-secondary)]">No active layer</p>
        )}

        {activeLayer && (() => {
          const dropShadow = {
            ...DEFAULT_DROP_SHADOW,
            ...(activeLayer.effects?.dropShadow ?? {}),
          };
          const outerGlow = {
            ...DEFAULT_OUTER_GLOW,
            ...(activeLayer.effects?.outerGlow ?? {}),
          };
          const stroke = {
            ...DEFAULT_STROKE,
            ...(activeLayer.effects?.stroke ?? {}),
          };
          const colorOverlay = {
            ...DEFAULT_COLOR_OVERLAY,
            ...(activeLayer.effects?.colorOverlay ?? {}),
          };
          const innerShadow = {
            ...DEFAULT_INNER_SHADOW,
            ...(activeLayer.effects?.innerShadow ?? {}),
          };
          const innerGlow = {
            ...DEFAULT_INNER_GLOW,
            ...(activeLayer.effects?.innerGlow ?? {}),
          };
          return (
            <div
              className="pt-2.5 border-t space-y-2.5 text-[11px]"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-[var(--lp-text-secondary)]">
                  Layer Effects
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={copyActiveLayerEffects}
                    title="Copy active layer effects"
                    className="px-1.5 py-0.5 rounded border text-[10px] hover:bg-[var(--lp-hover)] cursor-pointer whitespace-nowrap"
                    style={{ borderColor: 'var(--lp-border)' }}
                  >
                    Copy Style
                  </button>
                  <button
                    type="button"
                    disabled={!clipboardEffects || activeLayer.locked}
                    onClick={pasteActiveLayerEffects}
                    title="Paste copied layer effects"
                    className="px-1.5 py-0.5 rounded border text-[10px] hover:bg-[var(--lp-hover)] disabled:opacity-35 cursor-pointer whitespace-nowrap"
                    style={{ borderColor: 'var(--lp-border)' }}
                  >
                    Paste Style
                  </button>
                </div>
              </div>

              {/* Drop Shadow */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={activeLayer.locked}
                      checked={dropShadow.enabled}
                      onChange={(e) =>
                        updateLayerEffects(
                          activeLayer.id,
                          { dropShadow: { enabled: e.target.checked } },
                          e.target.checked ? 'Enable Drop Shadow' : 'Disable Drop Shadow'
                        )
                      }
                    />
                    <span>Drop Shadow</span>
                  </label>
                  {dropShadow.enabled && (
                    <input
                      type="color"
                      disabled={activeLayer.locked}
                      value={dropShadow.color}
                      onChange={(e) =>
                        updateLayerEffects(
                          activeLayer.id,
                          { dropShadow: { color: e.target.value } },
                          'Shadow Color'
                        )
                      }
                      className="w-6 h-5 rounded border bg-transparent cursor-pointer"
                      style={{ borderColor: 'var(--lp-border)' }}
                    />
                  )}
                </div>
                {dropShadow.enabled && (
                  <div className="pl-4 space-y-1.5">
                    <div>
                      <div className="flex justify-between text-[10px] text-[var(--lp-text-secondary)]">
                        <span>Opacity</span>
                        <span className="font-mono-tabular">{dropShadow.opacity}%</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={100}
                        disabled={activeLayer.locked}
                        value={dropShadow.opacity}
                        onChange={(e) =>
                          updateLayerEffects(activeLayer.id, {
                            dropShadow: { opacity: Number(e.target.value) },
                          })
                        }
                        onPointerUp={() => commitAdjustmentsHistory('Drop Shadow Opacity')}
                        className="lp-slider w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-[var(--lp-text-secondary)]">
                        <span>Blur</span>
                        <span className="font-mono-tabular">{dropShadow.blur}px</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={64}
                        disabled={activeLayer.locked}
                        value={dropShadow.blur}
                        onChange={(e) =>
                          updateLayerEffects(activeLayer.id, {
                            dropShadow: { blur: Number(e.target.value) },
                          })
                        }
                        onPointerUp={() => commitAdjustmentsHistory('Drop Shadow Blur')}
                        className="lp-slider w-full"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex justify-between text-[10px] text-[var(--lp-text-secondary)]">
                          <span>Dist</span>
                          <span className="font-mono-tabular">{dropShadow.distance}px</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={80}
                          disabled={activeLayer.locked}
                          value={dropShadow.distance}
                          onChange={(e) =>
                            updateLayerEffects(activeLayer.id, {
                              dropShadow: { distance: Number(e.target.value) },
                            })
                          }
                          onPointerUp={() => commitAdjustmentsHistory('Drop Shadow Distance')}
                          className="lp-slider w-full"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] text-[var(--lp-text-secondary)]">
                          <span>Angle</span>
                          <span className="font-mono-tabular">{dropShadow.angle}°</span>
                        </div>
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          disabled={activeLayer.locked}
                          value={dropShadow.angle}
                          onChange={(e) =>
                            updateLayerEffects(activeLayer.id, {
                              dropShadow: { angle: Number(e.target.value) },
                            })
                          }
                          onPointerUp={() => commitAdjustmentsHistory('Drop Shadow Angle')}
                          className="lp-slider w-full"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Outer Glow */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={activeLayer.locked}
                      checked={outerGlow.enabled}
                      onChange={(e) =>
                        updateLayerEffects(
                          activeLayer.id,
                          { outerGlow: { enabled: e.target.checked } },
                          e.target.checked ? 'Enable Outer Glow' : 'Disable Outer Glow'
                        )
                      }
                    />
                    <span>Outer Glow</span>
                  </label>
                  {outerGlow.enabled && (
                    <input
                      type="color"
                      disabled={activeLayer.locked}
                      value={outerGlow.color}
                      onChange={(e) =>
                        updateLayerEffects(
                          activeLayer.id,
                          { outerGlow: { color: e.target.value } },
                          'Outer Glow Color'
                        )
                      }
                      className="w-6 h-5 rounded border bg-transparent cursor-pointer"
                      style={{ borderColor: 'var(--lp-border)' }}
                    />
                  )}
                </div>
                {outerGlow.enabled && (
                  <div className="pl-4 space-y-1.5">
                    <div>
                      <div className="flex justify-between text-[10px] text-[var(--lp-text-secondary)]">
                        <span>Opacity</span>
                        <span className="font-mono-tabular">{outerGlow.opacity}%</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={100}
                        disabled={activeLayer.locked}
                        value={outerGlow.opacity}
                        onChange={(e) =>
                          updateLayerEffects(activeLayer.id, {
                            outerGlow: { opacity: Number(e.target.value) },
                          })
                        }
                        onPointerUp={() => commitAdjustmentsHistory('Outer Glow Opacity')}
                        className="lp-slider w-full"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex justify-between text-[10px] text-[var(--lp-text-secondary)]">
                          <span>Blur</span>
                          <span className="font-mono-tabular">{outerGlow.blur}px</span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={64}
                          disabled={activeLayer.locked}
                          value={outerGlow.blur}
                          onChange={(e) =>
                            updateLayerEffects(activeLayer.id, {
                              outerGlow: { blur: Number(e.target.value) },
                            })
                          }
                          onPointerUp={() => commitAdjustmentsHistory('Outer Glow Blur')}
                          className="lp-slider w-full"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] text-[var(--lp-text-secondary)]">
                          <span>Spread</span>
                          <span className="font-mono-tabular">{outerGlow.spread}px</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={24}
                          disabled={activeLayer.locked}
                          value={outerGlow.spread}
                          onChange={(e) =>
                            updateLayerEffects(activeLayer.id, {
                              outerGlow: { spread: Number(e.target.value) },
                            })
                          }
                          onPointerUp={() => commitAdjustmentsHistory('Outer Glow Spread')}
                          className="lp-slider w-full"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Stroke */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={activeLayer.locked}
                      checked={stroke.enabled}
                      onChange={(e) =>
                        updateLayerEffects(
                          activeLayer.id,
                          { stroke: { enabled: e.target.checked } },
                          e.target.checked ? 'Enable Stroke' : 'Disable Stroke'
                        )
                      }
                    />
                    <span>Stroke</span>
                  </label>
                  {stroke.enabled && (
                    <input
                      type="color"
                      disabled={activeLayer.locked}
                      value={stroke.color}
                      onChange={(e) =>
                        updateLayerEffects(
                          activeLayer.id,
                          { stroke: { color: e.target.value } },
                          'Stroke Color'
                        )
                      }
                      className="w-6 h-5 rounded border bg-transparent cursor-pointer"
                      style={{ borderColor: 'var(--lp-border)' }}
                    />
                  )}
                </div>
                {stroke.enabled && (
                  <div className="pl-4 space-y-1.5">
                    <div className="flex items-center gap-1">
                      {(['outside', 'inside'] as const).map((position) => (
                        <button
                          key={position}
                          type="button"
                          disabled={activeLayer.locked}
                          onClick={() =>
                            updateLayerEffects(
                              activeLayer.id,
                              { stroke: { position } },
                              'Stroke Position'
                            )
                          }
                          className={`flex-1 py-1 rounded border text-[10px] capitalize cursor-pointer ${
                            stroke.position === position
                              ? 'bg-[#0A84FF] text-white border-[#0A84FF]'
                              : 'hover:bg-[var(--lp-hover)]'
                          }`}
                          style={{
                            borderColor:
                              stroke.position === position ? '#0A84FF' : 'var(--lp-border)',
                          }}
                        >
                          {position}
                        </button>
                      ))}
                    </div>
                    <EffectRange
                      label="Width"
                      value={stroke.width}
                      min={1}
                      max={40}
                      suffix="px"
                      disabled={activeLayer.locked}
                      onChange={(v) =>
                        updateLayerEffects(activeLayer.id, { stroke: { width: v } })
                      }
                      onCommit={() => commitAdjustmentsHistory('Stroke Width')}
                    />
                    <EffectRange
                      label="Opacity"
                      value={stroke.opacity}
                      min={1}
                      max={100}
                      suffix="%"
                      disabled={activeLayer.locked}
                      onChange={(v) =>
                        updateLayerEffects(activeLayer.id, { stroke: { opacity: v } })
                      }
                      onCommit={() => commitAdjustmentsHistory('Stroke Opacity')}
                    />
                  </div>
                )}
              </div>

              {/* Color Overlay */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={activeLayer.locked}
                      checked={colorOverlay.enabled}
                      onChange={(e) =>
                        updateLayerEffects(
                          activeLayer.id,
                          { colorOverlay: { enabled: e.target.checked } },
                          e.target.checked ? 'Enable Color Overlay' : 'Disable Color Overlay'
                        )
                      }
                    />
                    <span>Color Overlay</span>
                  </label>
                  {colorOverlay.enabled && (
                    <input
                      type="color"
                      disabled={activeLayer.locked}
                      value={colorOverlay.color}
                      onChange={(e) =>
                        updateLayerEffects(
                          activeLayer.id,
                          { colorOverlay: { color: e.target.value } },
                          'Color Overlay Color'
                        )
                      }
                      className="w-6 h-5 rounded border bg-transparent cursor-pointer"
                      style={{ borderColor: 'var(--lp-border)' }}
                    />
                  )}
                </div>
                {colorOverlay.enabled && (
                  <div className="pl-4 space-y-1.5">
                    <EffectRange
                      label="Opacity"
                      value={colorOverlay.opacity}
                      min={1}
                      max={100}
                      suffix="%"
                      disabled={activeLayer.locked}
                      onChange={(v) =>
                        updateLayerEffects(activeLayer.id, { colorOverlay: { opacity: v } })
                      }
                      onCommit={() => commitAdjustmentsHistory('Color Overlay Opacity')}
                    />
                    <label className="flex items-center justify-between gap-2 text-[10px] text-[var(--lp-text-secondary)]">
                      <span>Blend</span>
                      <select
                        value={colorOverlay.blendMode}
                        disabled={activeLayer.locked}
                        onChange={(e) =>
                          updateLayerEffects(
                            activeLayer.id,
                            { colorOverlay: { blendMode: e.target.value as BlendMode } },
                            'Color Overlay Blend'
                          )
                        }
                        className="h-6 rounded border bg-transparent px-1 text-[10px] cursor-pointer"
                        style={{ borderColor: 'var(--lp-border)' }}
                      >
                        {BLEND_MODES.map((mode) => (
                          <option key={mode.value} value={mode.value}>
                            {mode.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>

              {/* Inner Shadow */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={activeLayer.locked}
                      checked={innerShadow.enabled}
                      onChange={(e) =>
                        updateLayerEffects(
                          activeLayer.id,
                          { innerShadow: { enabled: e.target.checked } },
                          e.target.checked ? 'Enable Inner Shadow' : 'Disable Inner Shadow'
                        )
                      }
                    />
                    <span>Inner Shadow</span>
                  </label>
                  {innerShadow.enabled && (
                    <input
                      type="color"
                      disabled={activeLayer.locked}
                      value={innerShadow.color}
                      onChange={(e) =>
                        updateLayerEffects(
                          activeLayer.id,
                          { innerShadow: { color: e.target.value } },
                          'Inner Shadow Color'
                        )
                      }
                      className="w-6 h-5 rounded border bg-transparent cursor-pointer"
                      style={{ borderColor: 'var(--lp-border)' }}
                    />
                  )}
                </div>
                {innerShadow.enabled && (
                  <div className="pl-4 space-y-1.5">
                    <EffectRange
                      label="Opacity"
                      value={innerShadow.opacity}
                      min={1}
                      max={100}
                      suffix="%"
                      disabled={activeLayer.locked}
                      onChange={(v) =>
                        updateLayerEffects(activeLayer.id, { innerShadow: { opacity: v } })
                      }
                      onCommit={() => commitAdjustmentsHistory('Inner Shadow Opacity')}
                    />
                    <EffectRange
                      label="Blur"
                      value={innerShadow.blur}
                      min={0}
                      max={64}
                      suffix="px"
                      disabled={activeLayer.locked}
                      onChange={(v) =>
                        updateLayerEffects(activeLayer.id, { innerShadow: { blur: v } })
                      }
                      onCommit={() => commitAdjustmentsHistory('Inner Shadow Blur')}
                    />
                    <EffectRange
                      label="Distance"
                      value={innerShadow.distance}
                      min={0}
                      max={80}
                      suffix="px"
                      disabled={activeLayer.locked}
                      onChange={(v) =>
                        updateLayerEffects(activeLayer.id, { innerShadow: { distance: v } })
                      }
                      onCommit={() => commitAdjustmentsHistory('Inner Shadow Distance')}
                    />
                    <EffectRange
                      label="Angle"
                      value={innerShadow.angle}
                      min={-180}
                      max={180}
                      suffix="°"
                      disabled={activeLayer.locked}
                      onChange={(v) =>
                        updateLayerEffects(activeLayer.id, { innerShadow: { angle: v } })
                      }
                      onCommit={() => commitAdjustmentsHistory('Inner Shadow Angle')}
                    />
                  </div>
                )}
              </div>

              {/* Inner Glow */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={activeLayer.locked}
                      checked={innerGlow.enabled}
                      onChange={(e) =>
                        updateLayerEffects(
                          activeLayer.id,
                          { innerGlow: { enabled: e.target.checked } },
                          e.target.checked ? 'Enable Inner Glow' : 'Disable Inner Glow'
                        )
                      }
                    />
                    <span>Inner Glow</span>
                  </label>
                  {innerGlow.enabled && (
                    <input
                      type="color"
                      disabled={activeLayer.locked}
                      value={innerGlow.color}
                      onChange={(e) =>
                        updateLayerEffects(
                          activeLayer.id,
                          { innerGlow: { color: e.target.value } },
                          'Inner Glow Color'
                        )
                      }
                      className="w-6 h-5 rounded border bg-transparent cursor-pointer"
                      style={{ borderColor: 'var(--lp-border)' }}
                    />
                  )}
                </div>
                {innerGlow.enabled && (
                  <div className="pl-4 space-y-1.5">
                    <EffectRange
                      label="Opacity"
                      value={innerGlow.opacity}
                      min={1}
                      max={100}
                      suffix="%"
                      disabled={activeLayer.locked}
                      onChange={(v) =>
                        updateLayerEffects(activeLayer.id, { innerGlow: { opacity: v } })
                      }
                      onCommit={() => commitAdjustmentsHistory('Inner Glow Opacity')}
                    />
                    <EffectRange
                      label="Blur"
                      value={innerGlow.blur}
                      min={1}
                      max={64}
                      suffix="px"
                      disabled={activeLayer.locked}
                      onChange={(v) =>
                        updateLayerEffects(activeLayer.id, { innerGlow: { blur: v } })
                      }
                      onCommit={() => commitAdjustmentsHistory('Inner Glow Blur')}
                    />
                    <EffectRange
                      label="Spread"
                      value={innerGlow.spread}
                      min={0}
                      max={24}
                      suffix="px"
                      disabled={activeLayer.locked}
                      onChange={(v) =>
                        updateLayerEffects(activeLayer.id, { innerGlow: { spread: v } })
                      }
                      onCommit={() => commitAdjustmentsHistory('Inner Glow Spread')}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </InspectorSection>

      {/* 3. ADJUSTMENTS PANEL (Non-destructive + Easy Quick Looks) */}
      <InspectorSection
        title="Adjustments"
        open={inspectorOpen.adjustments}
        onToggle={() => toggleInspectorPanel('adjustments')}
        rightAction={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                setBeforeAfterMode(
                  viewportSettings.beforeAfterMode === 'split' ? 'off' : 'split'
                )
              }
              className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${
                viewportSettings.beforeAfterMode === 'split'
                  ? 'bg-[#0A84FF] text-white'
                  : 'text-[var(--lp-text-secondary)] hover:bg-[var(--lp-hover)]'
              }`}
            >
              Split
            </button>
            {!isDefaultAdjustments(targetAdj) && (
              <button
                type="button"
                onClick={resetAdjustments}
                title="Reset All Adjustments"
                className="p-1 rounded hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-2.5">
          <p
            className="text-[10px] text-[var(--lp-text-secondary)]"
            data-testid="adjustment-target"
          >
            Editing: {editingLayerAdj && activeLayer ? `“${activeLayer.name}” adjustment layer` : 'whole document'}
          </p>
          {/* 1-Click Auto Balance & Non-Destructive Quick Looks */}
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={applyAutoEnhance}
              className="w-full py-1.5 px-2.5 rounded-lg bg-[var(--lp-active-surface)] text-[#0A84FF] hover:bg-[#0A84FF] hover:text-white text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto Balance Tone (Local)</span>
            </button>

            <div className="flex flex-wrap gap-1">
              {QUICK_LOOKS.map((look) => (
                <button
                  key={look.name}
                  type="button"
                  onClick={() => updateAdjustments(look.patch, `Look: ${look.name}`)}
                  className="px-2 py-1 rounded border text-[10px] font-medium hover:border-[#0A84FF] hover:text-[#0A84FF] transition-colors cursor-pointer"
                  style={{
                    backgroundColor: 'var(--lp-panel)',
                    borderColor: 'var(--lp-border)',
                  }}
                >
                  {look.name}
                </button>
              ))}
            </div>
          </div>

          {/* User-saved presets (localStorage only) */}
          <div className="space-y-1.5">
            <span className="text-[10px] text-[var(--lp-text-secondary)] block">My Presets</span>
            <div className="flex items-center gap-1">
              <input
                type="text"
                aria-label="Preset name"
                placeholder="Preset name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSavePreset();
                  }
                }}
                className="flex-1 min-w-0 px-2 py-1 rounded border bg-[var(--lp-bg)] text-[11px] outline-none focus:border-[#0A84FF]"
                style={{ borderColor: 'var(--lp-border)' }}
              />
              <button
                type="button"
                onClick={handleSavePreset}
                disabled={!presetName.trim()}
                className="px-2 py-1 rounded border text-[10px] font-medium hover:border-[#0A84FF] hover:text-[#0A84FF] disabled:opacity-40 disabled:hover:border-[var(--lp-border)] disabled:hover:text-inherit cursor-pointer"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                Save preset
              </button>
            </div>
            {savedPresets.length > 0 ? (
              <ul className="space-y-1">
                {savedPresets.map((preset) => (
                  <li key={preset.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      title={`Apply preset ${preset.name}`}
                      className="flex-1 min-w-0 text-left px-2 py-1 rounded border text-[10px] truncate hover:border-[#0A84FF] hover:text-[#0A84FF] transition-colors cursor-pointer"
                      style={{
                        backgroundColor: 'var(--lp-panel)',
                        borderColor: 'var(--lp-border)',
                      }}
                    >
                      {preset.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete preset ${preset.name}`}
                      onClick={() => handleDeletePreset(preset)}
                      className="p-1 rounded text-[var(--lp-text-secondary)] hover:text-[#FF453A] hover:bg-[var(--lp-hover)] cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10px] text-[var(--lp-text-secondary)]">
                Save the current adjustments to reuse them later.
              </p>
            )}
          </div>

          <div className="h-px" style={{ backgroundColor: 'var(--lp-border)' }} />

          {adjustmentSliders.map((item) => {
            const val = targetAdj[item.key] ?? 0;
            return (
              <div key={item.key} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <button
                    type="button"
                    title="Double-click to reset"
                    onDoubleClick={() =>
                      updateAdjustments({ [item.key]: 0 }, `Reset ${item.label}`)
                    }
                    className="text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] cursor-pointer"
                  >
                    {item.label}
                  </button>
                  <span className="font-mono-tabular text-[11px]">
                    {item.step ? val.toFixed(2) : Math.round(val)}
                  </span>
                </div>
                <input
                  type="range"
                  min={item.min}
                  max={item.max}
                  step={item.step ?? 1}
                  value={val}
                  onChange={(e) =>
                    updateAdjustments({ [item.key]: Number(e.target.value) })
                  }
                  onPointerUp={() => commitAdjustmentsHistory(`Adjust ${item.label}`)}
                  onKeyUp={() => commitAdjustmentsHistory(`Adjust ${item.label}`)}
                  className="lp-slider w-full"
                />
              </div>
            );
          })}

          {/* Split Toning */}
          <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--lp-border)' }}>
            <div className="flex items-center justify-between text-[11px]">
              <button
                type="button"
                title="Double-click to reset split toning"
                onDoubleClick={() => updateAdjustments({ splitTone: 0 }, 'Reset Split Toning')}
                className="text-[10px] font-medium text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] cursor-pointer"
              >
                Split Toning
              </button>
              <span className="font-mono-tabular text-[11px]">
                {Math.round(targetAdj.splitTone ?? 0)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={targetAdj.splitTone ?? 0}
              onChange={(e) => updateAdjustments({ splitTone: Number(e.target.value) })}
              onPointerUp={() => commitAdjustmentsHistory('Adjust Split Toning')}
              onKeyUp={() => commitAdjustmentsHistory('Adjust Split Toning')}
              className="lp-slider w-full"
              aria-label="Split Toning Strength"
            />
            {(targetAdj.splitTone ?? 0) > 0 && (
              <div className="space-y-2 pl-2 border-l" style={{ borderColor: 'var(--lp-border)' }}>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-1.5 text-[var(--lp-text-secondary)]">
                      <span
                        className="w-2.5 h-2.5 rounded-full border"
                        style={{
                          backgroundColor: `hsl(${targetAdj.splitShadowHue ?? 220}, 75%, 52%)`,
                          borderColor: 'var(--lp-border-strong)',
                        }}
                      />
                      Shadow Hue
                    </span>
                    <span className="font-mono-tabular">
                      {Math.round(targetAdj.splitShadowHue ?? 220)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={targetAdj.splitShadowHue ?? 220}
                    onChange={(e) =>
                      updateAdjustments({ splitShadowHue: Number(e.target.value) })
                    }
                    onPointerUp={() => commitAdjustmentsHistory('Adjust Split Shadow Hue')}
                    onKeyUp={() => commitAdjustmentsHistory('Adjust Split Shadow Hue')}
                    className="lp-slider w-full"
                    aria-label="Split Toning Shadow Hue"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-1.5 text-[var(--lp-text-secondary)]">
                      <span
                        className="w-2.5 h-2.5 rounded-full border"
                        style={{
                          backgroundColor: `hsl(${targetAdj.splitHighlightHue ?? 40}, 75%, 52%)`,
                          borderColor: 'var(--lp-border-strong)',
                        }}
                      />
                      Highlight Hue
                    </span>
                    <span className="font-mono-tabular">
                      {Math.round(targetAdj.splitHighlightHue ?? 40)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={targetAdj.splitHighlightHue ?? 40}
                    onChange={(e) =>
                      updateAdjustments({ splitHighlightHue: Number(e.target.value) })
                    }
                    onPointerUp={() => commitAdjustmentsHistory('Adjust Split Highlight Hue')}
                    onKeyUp={() => commitAdjustmentsHistory('Adjust Split Highlight Hue')}
                    className="lp-slider w-full"
                    aria-label="Split Toning Highlight Hue"
                  />
                </div>
              </div>
            )}
          </div>

          {/* HSL / Color Mixer (8 Bands) */}
          {(() => {
            const hsl = targetAdj.hsl ?? createDefaultHslMixer();
            const bandVal = hsl[activeHslBand] ?? { h: 0, s: 0, l: 0 };
            const bandMeta = HSL_BAND_META.find((b) => b.id === activeHslBand) ?? HSL_BAND_META[0];
            const bandEdited = bandVal.h !== 0 || bandVal.s !== 0 || bandVal.l !== 0;
            return (
              <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--lp-border)' }}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[10px] font-medium text-[var(--lp-text-secondary)]">
                    HSL / Color Mixer · {bandMeta.label}
                  </span>
                  {!isDefaultHslMixer(hsl) && (
                    <button
                      type="button"
                      onClick={resetHslMixer}
                      className="text-[10px] text-[#0A84FF] hover:underline cursor-pointer"
                    >
                      Reset All
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-8 gap-1">
                  {HSL_BAND_META.map((band) => {
                    const b = hsl[band.id];
                    const hasEdit = b && (b.h !== 0 || b.s !== 0 || b.l !== 0);
                    const isSelected = band.id === activeHslBand;
                    return (
                      <button
                        key={band.id}
                        type="button"
                        title={band.label}
                        aria-label={`HSL ${band.label}`}
                        onClick={() => setActiveHslBand(band.id)}
                        className={`relative h-5 rounded border flex items-center justify-center cursor-pointer transition-transform ${
                          isSelected ? 'ring-2 ring-[#0A84FF] scale-105' : 'opacity-80 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: band.swatch,
                          borderColor: 'var(--lp-border-strong)',
                        }}
                      >
                        {hasEdit && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-1.5 pl-2 border-l" style={{ borderColor: 'var(--lp-border)' }}>
                  {(
                    [
                      ['h', 'Hue', `Adjust ${bandMeta.label} Hue`],
                      ['s', 'Saturation', `Adjust ${bandMeta.label} Saturation`],
                      ['l', 'Luminance', `Adjust ${bandMeta.label} Luminance`],
                    ] as const
                  ).map(([prop, label, commitLabel]) => (
                    <div key={prop} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <button
                          type="button"
                          title="Double-click to reset"
                          onDoubleClick={() =>
                            updateHslBand(activeHslBand, { [prop]: 0 }, `Reset ${bandMeta.label} ${label}`)
                          }
                          className="text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] cursor-pointer"
                        >
                          {label}
                        </button>
                        <span className="font-mono-tabular">{Math.round(bandVal[prop])}</span>
                      </div>
                      <input
                        type="range"
                        min={-100}
                        max={100}
                        value={bandVal[prop]}
                        onChange={(e) =>
                          updateHslBand(activeHslBand, { [prop]: Number(e.target.value) })
                        }
                        onPointerUp={() => commitAdjustmentsHistory(commitLabel)}
                        onKeyUp={() => commitAdjustmentsHistory(commitLabel)}
                        className="lp-slider w-full"
                        aria-label={`${bandMeta.label} ${label}`}
                      />
                    </div>
                  ))}
                  {bandEdited && (
                    <button
                      type="button"
                      onClick={() =>
                        updateHslBand(activeHslBand, { h: 0, s: 0, l: 0 }, `Reset ${bandMeta.label}`)
                      }
                      className="text-[10px] text-[var(--lp-text-secondary)] hover:text-[#0A84FF] cursor-pointer"
                    >
                      Reset {bandMeta.label}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Gradient Map (Duotone) */}
          {(() => {
            const gm = targetAdj.gradientMap ?? DEFAULT_GRADIENT_MAP;
            return (
              <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--lp-border)' }}>
                <div className="flex items-center justify-between text-[11px]">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-medium text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)]">
                    <input
                      type="checkbox"
                      checked={gm.enabled}
                      onChange={(e) =>
                        updateGradientMap(
                          { enabled: e.target.checked },
                          e.target.checked ? 'Enable Gradient Map' : 'Disable Gradient Map'
                        )
                      }
                    />
                    <span>Gradient Map (Duotone)</span>
                  </label>
                  {gm.enabled && (
                    <span className="font-mono-tabular text-[10px]">{Math.round(gm.mix)}%</span>
                  )}
                </div>

                {gm.enabled && (
                  <div className="space-y-2 pl-2 border-l" style={{ borderColor: 'var(--lp-border)' }}>
                    <div className="flex items-center gap-2 text-[10px]">
                      <label className="flex items-center gap-1 text-[var(--lp-text-secondary)]">
                        <span>Shadow</span>
                        <input
                          type="color"
                          value={gm.shadowColor}
                          onChange={(e) =>
                            updateGradientMap(
                              { shadowColor: e.target.value },
                              'Gradient Map Shadow'
                            )
                          }
                          className="w-6 h-5 rounded border bg-transparent cursor-pointer"
                          style={{ borderColor: 'var(--lp-border)' }}
                        />
                      </label>
                      <div
                        className="flex-1 h-4 rounded border"
                        style={{
                          background: `linear-gradient(to right, ${gm.shadowColor}, ${gm.highlightColor})`,
                          borderColor: 'var(--lp-border-strong)',
                        }}
                      />
                      <label className="flex items-center gap-1 text-[var(--lp-text-secondary)]">
                        <input
                          type="color"
                          value={gm.highlightColor}
                          onChange={(e) =>
                            updateGradientMap(
                              { highlightColor: e.target.value },
                              'Gradient Map Highlight'
                            )
                          }
                          className="w-6 h-5 rounded border bg-transparent cursor-pointer"
                          style={{ borderColor: 'var(--lp-border)' }}
                        />
                        <span>High</span>
                      </label>
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex justify-between text-[10px] text-[var(--lp-text-secondary)]">
                        <span>Mix</span>
                        <span className="font-mono-tabular">{Math.round(gm.mix)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={gm.mix}
                        onChange={(e) => updateGradientMap({ mix: Number(e.target.value) })}
                        onPointerUp={() => commitAdjustmentsHistory('Gradient Map Mix')}
                        onKeyUp={() => commitAdjustmentsHistory('Gradient Map Mix')}
                        className="lp-slider w-full"
                        aria-label="Gradient Map Mix"
                      />
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {[
                        { label: 'Cyanotype', s: '#0D2137', h: '#D6F2FF' },
                        { label: 'Gold Sepia', s: '#2C1B12', h: '#FCE1B6' },
                        { label: 'Infrared', s: '#2B0938', h: '#FF8A65' },
                        { label: 'Midnight', s: '#0B132B', h: '#6FFFE9' },
                      ].map((swatch) => (
                        <button
                          key={swatch.label}
                          type="button"
                          onClick={() =>
                            updateGradientMap(
                              {
                                enabled: true,
                                shadowColor: swatch.s,
                                highlightColor: swatch.h,
                              },
                              `Duotone: ${swatch.label}`
                            )
                          }
                          className="px-1.5 py-0.5 rounded border text-[10px] hover:border-[#0A84FF] cursor-pointer whitespace-nowrap"
                          style={{
                            backgroundColor: 'var(--lp-panel)',
                            borderColor: 'var(--lp-border)',
                          }}
                        >
                          {swatch.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() =>
                updateAdjustments(
                  { grayscale: !targetAdj.grayscale },
                  'Toggle Grayscale'
                )
              }
              className={`flex-1 py-1.5 rounded border text-[11px] font-medium cursor-pointer transition-colors ${
                targetAdj.grayscale
                  ? 'bg-[#0A84FF] text-white border-[#0A84FF]'
                  : 'hover:bg-[var(--lp-hover)]'
              }`}
              style={{
                borderColor: targetAdj.grayscale ? '#0A84FF' : 'var(--lp-border)',
              }}
            >
              Grayscale
            </button>
            <button
              type="button"
              onClick={() =>
                updateAdjustments({ sepia: !targetAdj.sepia }, 'Toggle Sepia')
              }
              className={`flex-1 py-1.5 rounded border text-[11px] font-medium cursor-pointer transition-colors ${
                targetAdj.sepia
                  ? 'bg-[#0A84FF] text-white border-[#0A84FF]'
                  : 'hover:bg-[var(--lp-hover)]'
              }`}
              style={{
                borderColor: targetAdj.sepia ? '#0A84FF' : 'var(--lp-border)',
              }}
            >
              Sepia
            </button>
            <button
              type="button"
              onClick={() =>
                updateAdjustments({ invert: !targetAdj.invert }, 'Toggle Invert')
              }
              className={`flex-1 py-1.5 rounded border text-[11px] font-medium cursor-pointer transition-colors ${
                targetAdj.invert
                  ? 'bg-[#0A84FF] text-white border-[#0A84FF]'
                  : 'hover:bg-[var(--lp-hover)]'
              }`}
              style={{
                borderColor: targetAdj.invert ? '#0A84FF' : 'var(--lp-border)',
              }}
            >
              Invert
            </button>
          </div>
        </div>
      </InspectorSection>

      {/* 3.5. LEVELS & CURVES PANEL */}
      <InspectorSection
        title="Levels & Curves"
        open={inspectorOpen.levelsCurves}
        onToggle={() => toggleInspectorPanel('levelsCurves')}
      >
        <CurvesLevelsPanel />
      </InspectorSection>

      {/* 3.7. FILTERS PANEL (Non-destructive GPU/Worker Effects) */}
      <InspectorSection
        title="Filters"
        open={inspectorOpen.filters}
        onToggle={() => toggleInspectorPanel('filters')}
        rightAction={
          !isDefaultFilters(filters) ? (
            <button
              type="button"
              onClick={resetFilters}
              title="Reset Filters"
              className="p-1 rounded hover:bg-[var(--lp-hover)] text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          ) : null
        }
      >
        <div className="space-y-2.5 text-[11px]">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[var(--lp-text-secondary)]">Gaussian Blur</span>
              <span className="font-mono-tabular">{filters.blur} px</span>
            </div>
            <input
              type="range"
              min={0}
              max={35}
              value={filters.blur}
              onChange={(e) => updateFilters({ blur: Number(e.target.value) })}
              onPointerUp={() => commitAdjustmentsHistory('Filter: Gaussian Blur')}
              onKeyUp={() => commitAdjustmentsHistory('Filter: Gaussian Blur')}
              className="lp-slider w-full"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[var(--lp-text-secondary)]">Vignette</span>
              <span className="font-mono-tabular">{filters.vignette}</span>
            </div>
            <input
              type="range"
              min={-100}
              max={100}
              value={filters.vignette}
              onChange={(e) => updateFilters({ vignette: Number(e.target.value) })}
              onPointerUp={() => commitAdjustmentsHistory('Filter: Vignette')}
              onKeyUp={() => commitAdjustmentsHistory('Filter: Vignette')}
              className="lp-slider w-full"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[var(--lp-text-secondary)]">Vignette Midpoint</span>
              <span className="font-mono-tabular">{filters.vignetteMidpoint}%</span>
            </div>
            <input
              type="range"
              min={15}
              max={90}
              value={filters.vignetteMidpoint}
              onChange={(e) => updateFilters({ vignetteMidpoint: Number(e.target.value) })}
              onPointerUp={() => commitAdjustmentsHistory('Filter: Vignette Midpoint')}
              onKeyUp={() => commitAdjustmentsHistory('Filter: Vignette Midpoint')}
              className="lp-slider w-full"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[var(--lp-text-secondary)]">Noise Reduction</span>
              <span className="font-mono-tabular">{filters.denoise ?? 0}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={filters.denoise ?? 0}
              onChange={(e) => updateFilters({ denoise: Number(e.target.value) })}
              onPointerUp={() => commitAdjustmentsHistory('Filter: Noise Reduction')}
              onKeyUp={() => commitAdjustmentsHistory('Filter: Noise Reduction')}
              className="lp-slider w-full"
              aria-label="Noise Reduction"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[var(--lp-text-secondary)]">Film Noise</span>
              <span className="font-mono-tabular">{filters.noise}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={filters.noise}
              onChange={(e) => updateFilters({ noise: Number(e.target.value) })}
              onPointerUp={() => commitAdjustmentsHistory('Filter: Film Noise')}
              onKeyUp={() => commitAdjustmentsHistory('Filter: Film Noise')}
              className="lp-slider w-full"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[var(--lp-text-secondary)]">Pixelate</span>
              <span className="font-mono-tabular">
                {filters.pixelate <= 1 ? 'Off' : `${filters.pixelate} px`}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={48}
              value={filters.pixelate}
              onChange={(e) => updateFilters({ pixelate: Number(e.target.value) })}
              onPointerUp={() => commitAdjustmentsHistory('Filter: Pixelate')}
              onKeyUp={() => commitAdjustmentsHistory('Filter: Pixelate')}
              className="lp-slider w-full"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[var(--lp-text-secondary)]">Highlight Bloom</span>
              <span className="font-mono-tabular">{filters.bloom ?? 0}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={filters.bloom ?? 0}
              onChange={(e) => updateFilters({ bloom: Number(e.target.value) })}
              onPointerUp={() => commitAdjustmentsHistory('Filter: Highlight Bloom')}
              onKeyUp={() => commitAdjustmentsHistory('Filter: Highlight Bloom')}
              className="lp-slider w-full"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[var(--lp-text-secondary)]">Posterize</span>
              <span className="font-mono-tabular">
                {(filters.posterize ?? 0) < 2 ? 'Off' : `${filters.posterize} lv`}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={24}
              value={(filters.posterize ?? 0) >= 2 ? filters.posterize : 1}
              onChange={(e) => {
                const v = Number(e.target.value);
                updateFilters({ posterize: v <= 1 ? 0 : v });
              }}
              onPointerUp={() => commitAdjustmentsHistory('Filter: Posterize')}
              onKeyUp={() => commitAdjustmentsHistory('Filter: Posterize')}
              className="lp-slider w-full"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[var(--lp-text-secondary)]">Chromatic Aberration</span>
              <span className="font-mono-tabular">{filters.chromaticAberration ?? 0}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={filters.chromaticAberration ?? 0}
              onChange={(e) => updateFilters({ chromaticAberration: Number(e.target.value) })}
              onPointerUp={() => commitAdjustmentsHistory('Filter: Chromatic Aberration')}
              onKeyUp={() => commitAdjustmentsHistory('Filter: Chromatic Aberration')}
              className="lp-slider w-full"
              aria-label="Chromatic Aberration"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[var(--lp-text-secondary)]">Threshold</span>
              <span className="font-mono-tabular">
                {(filters.threshold ?? 0) < 1 ? 'Off' : filters.threshold}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={255}
              value={filters.threshold ?? 0}
              onChange={(e) => updateFilters({ threshold: Number(e.target.value) })}
              onPointerUp={() => commitAdjustmentsHistory('Filter: Threshold')}
              onKeyUp={() => commitAdjustmentsHistory('Filter: Threshold')}
              className="lp-slider w-full"
              aria-label="Threshold"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[var(--lp-text-secondary)]">Lens Distortion</span>
              <span className="font-mono-tabular">{filters.lensDistortion ?? 0}</span>
            </div>
            <input
              type="range"
              min={-100}
              max={100}
              value={filters.lensDistortion ?? 0}
              onChange={(e) => updateFilters({ lensDistortion: Number(e.target.value) })}
              onPointerUp={() => commitAdjustmentsHistory('Filter: Lens Distortion')}
              onKeyUp={() => commitAdjustmentsHistory('Filter: Lens Distortion')}
              className="lp-slider w-full"
              aria-label="Lens Distortion"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[var(--lp-text-secondary)]">Tilt-Shift Blur</span>
              <span className="font-mono-tabular">{filters.tiltShiftBlur ?? 0} px</span>
            </div>
            <input
              type="range"
              min={0}
              max={35}
              value={filters.tiltShiftBlur ?? 0}
              onChange={(e) => updateFilters({ tiltShiftBlur: Number(e.target.value) })}
              onPointerUp={() => commitAdjustmentsHistory('Filter: Tilt-Shift Blur')}
              onKeyUp={() => commitAdjustmentsHistory('Filter: Tilt-Shift Blur')}
              className="lp-slider w-full"
              aria-label="Tilt-Shift Blur"
            />
          </div>

          {(filters.tiltShiftBlur ?? 0) > 0 && (
            <div className="space-y-2 pl-2 border-l" style={{ borderColor: 'var(--lp-border)' }}>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-[var(--lp-text-secondary)]">Focus Position</span>
                  <span className="font-mono-tabular">{filters.tiltShiftPos ?? 50}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={filters.tiltShiftPos ?? 50}
                  onChange={(e) => updateFilters({ tiltShiftPos: Number(e.target.value) })}
                  onPointerUp={() => commitAdjustmentsHistory('Filter: Tilt-Shift Position')}
                  onKeyUp={() => commitAdjustmentsHistory('Filter: Tilt-Shift Position')}
                  className="lp-slider w-full"
                  aria-label="Tilt-Shift Focus Position"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-[var(--lp-text-secondary)]">Focus Band</span>
                  <span className="font-mono-tabular">{filters.tiltShiftBand ?? 25}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={60}
                  value={filters.tiltShiftBand ?? 25}
                  onChange={(e) => updateFilters({ tiltShiftBand: Number(e.target.value) })}
                  onPointerUp={() => commitAdjustmentsHistory('Filter: Tilt-Shift Band')}
                  onKeyUp={() => commitAdjustmentsHistory('Filter: Tilt-Shift Band')}
                  className="lp-slider w-full"
                  aria-label="Tilt-Shift Focus Band"
                />
              </div>
            </div>
          )}
        </div>
      </InspectorSection>

      {/* 4. COLOR PANEL */}
      <InspectorSection
        title="Color"
        open={inspectorOpen.color}
        onToggle={() => toggleInspectorPanel('color')}
      >
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={foregroundColor}
              onChange={(e) => setForegroundColor(e.target.value)}
              className="w-10 h-8 rounded border cursor-pointer bg-transparent"
              style={{ borderColor: 'var(--lp-border)' }}
            />
            <input
              type="text"
              value={foregroundColor}
              onChange={(e) => {
                if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                  setForegroundColor(e.target.value);
                }
              }}
              className="flex-1 px-2 py-1 rounded border bg-[var(--lp-panel)] font-mono-tabular text-[11px]"
              style={{ borderColor: 'var(--lp-border)' }}
            />
          </div>
          <div>
            <span className="block text-[10px] text-[var(--lp-text-secondary)] mb-1.5">
              Studio Swatches
            </span>
            <div className="flex flex-wrap gap-1.5">
              {recentSwatches.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setForegroundColor(hex)}
                  title={hex}
                  className={`w-5 h-5 rounded border cursor-pointer transition-transform hover:scale-110 ${
                    foregroundColor === hex ? 'ring-2 ring-[#0A84FF]' : ''
                  }`}
                  style={{
                    backgroundColor: hex,
                    borderColor: 'var(--lp-border-strong)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </InspectorSection>

      {/* 5. HISTORY PANEL */}
      <InspectorSection
        title="History"
        open={inspectorOpen.history}
        onToggle={() => toggleInspectorPanel('history')}
        rightAction={
          <span className="text-[10px] font-mono-tabular text-[var(--lp-text-secondary)]">
            {doc.historyIndex + 1}/{doc.history.length}
          </span>
        }
      >
        <div
          className="rounded-lg border divide-y max-h-44 overflow-y-auto"
          style={{
            backgroundColor: 'var(--lp-panel)',
            borderColor: 'var(--lp-border)',
          }}
        >
          {doc.history.map((entry, idx) => {
            const isCurrent = idx === doc.historyIndex;
            const isFuture = idx > doc.historyIndex;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => jumpToHistory(idx)}
                className={`w-full px-2.5 py-1.5 text-left text-[11px] flex items-center justify-between cursor-pointer transition-colors ${
                  isCurrent
                    ? 'bg-[#0A84FF] text-white font-medium'
                    : isFuture
                      ? 'opacity-45 hover:opacity-80 hover:bg-[var(--lp-hover)]'
                      : 'hover:bg-[var(--lp-hover)]'
                }`}
                style={{ borderColor: 'var(--lp-border)' }}
              >
                <span className="truncate">{entry.label}</span>
                <span className="text-[10px] font-mono-tabular opacity-70 shrink-0">
                  #{idx + 1}
                </span>
              </button>
            );
          })}
        </div>
      </InspectorSection>

      {/* 6. METADATA PANEL */}
      <InspectorSection
        title="Metadata"
        open={inspectorOpen.metadata}
        onToggle={() => toggleInspectorPanel('metadata')}
      >
        <dl className="grid grid-cols-2 gap-y-1.5 text-[11px]">
          <dt className="text-[var(--lp-text-secondary)]">Dimensions</dt>
          <dd className="text-right font-mono-tabular">
            {doc.width} × {doc.height} px
          </dd>
          <dt className="text-[var(--lp-text-secondary)]">Source</dt>
          <dd className="text-right font-mono-tabular">{doc.sourceFormat}</dd>
          <dt className="text-[var(--lp-text-secondary)]">Layers</dt>
          <dd className="text-right font-mono-tabular">{doc.layers.length}</dd>
          <dt className="text-[var(--lp-text-secondary)]">Cursor</dt>
          <dd className="text-right font-mono-tabular">
            {cursorCanvasPos ? `${cursorCanvasPos.x}, ${cursorCanvasPos.y}` : '—'}
          </dd>
          <dt className="text-[var(--lp-text-secondary)]">Memory Est.</dt>
          <dd className="text-right font-mono-tabular">
            {(estimatedBytes / (1024 * 1024)).toFixed(1)} MB
          </dd>
        </dl>
      </InspectorSection>
    </aside>
  );
};
