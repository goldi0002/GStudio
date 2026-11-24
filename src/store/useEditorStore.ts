import { create } from 'zustand';
import {
  cloneAdjustments,
  cloneDefaultAdjustments,
  createDefaultHslMixer,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_CURVES,
  DEFAULT_FILTERS,
  DEFAULT_GRADIENT_MAP,
  DEFAULT_LEVELS,
  getTargetAdjustments,
  withTargetAdjustments,
} from '../engine/adjustments';
import {
  applyGalleryFilterBuffer,
  autoContrastBuffer,
  autoLevelsBuffer,
  type GalleryFilterParams,
} from '../engine/filters';
import {
  applyPixelFilterToCanvas,
  applySelectionClipToContext,
  canvasSizeLayers,
  cloneCanvas,
  cloneLayerEffects,
  compositeLayersToCanvas,
  computeAutoEnhanceAdjustments,
  computeTrimTransparentBounds,
  createCanvas,
  createWhiteMaskCanvas,
  cropAndStraightenLayers,
  cropLayers,
  DEFAULT_COLOR_OVERLAY,
  DEFAULT_DROP_SHADOW,
  DEFAULT_INNER_GLOW,
  DEFAULT_INNER_SHADOW,
  DEFAULT_OUTER_GLOW,
  DEFAULT_STROKE,
  extractSelectionFromCanvas,
  featherMaskBuffer,
  resizeMaskBuffer,
  fillCanvasWithSelectionMask,
  flipLayers,
  invertSelectionState,
  maskCanvasDiffBySelection,
  measureTextLayerDimensions,
  rasterizeSelectionToMaskBuffer,
  rasterizeVectorLayer,
  renderLayerNodeToContext,
  resizeLayers,
  restoreLayersFromSnapshot,
  rotateLayers,
  snapshotLayers,
  strokeCanvasWithSelectionMask,
  warpCanvasPerspective,
  writeMaskBufferToMaskCanvas,
} from '../engine/canvasOps';
import { SAMPLE_PRESETS } from '../engine/sampleImages';
import {
  type DecodedImageResult,
  deserializeProject,
  saveBlobLocally,
  serializeDocument,
} from '../persistence/fileAccess';
import {
  deleteProjectFromIndexedDb,
  listRecentProjectsFromIndexedDb,
  loadProjectFromIndexedDb,
  loadSetting,
  saveProjectToIndexedDb,
  saveSetting,
} from '../persistence/indexedDb';
import type {
  Adjustments,
  CanvasAnchor,
  ColorOverlayEffect,
  CropRect,
  CurvePoint,
  CurvesConfig,
  DocumentState,
  DropShadowEffect,
  FilterGalleryKind,
  FiltersConfig,
  GradientMapConfig,
  AdjustmentLayer,
  GroupLayer,
  HistoryEntry,
  HslBandAdjust,
  HslBandId,
  InnerGlowEffect,
  InnerShadowEffect,
  Layer,
  LayerEffects,
  LayerMask,
  LevelsConfig,
  OuterGlowEffect,
  StrokeEffect,
  RasterLayer,
  RecentProjectMeta,
  SelectionState,
  SerializedProject,
  ShapeKind,
  ShapeLayer,
  TextLayer,
  ToolId,
  ToolOptions,
} from '../types/editor';

const MAX_HISTORY = 40;

function makeId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** First free "<Base> N" name for a document's layer stack. */
function nextNumberedName(layers: Layer[], base: string): string {
  const used = new Set(layers.map((l) => l.name));
  let index = 1;
  while (used.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

function cloneLayerMask(mask?: LayerMask | null): LayerMask | null {
  if (!mask) return null;
  return {
    canvas: cloneCanvas(mask.canvas),
    enabled: mask.enabled,
    inverted: mask.inverted,
  };
}

function createHistoryEntry(
  doc: Pick<DocumentState, 'width' | 'height' | 'adjustments' | 'layers' | 'activeLayerId'>,
  label: string
): HistoryEntry {
  return {
    id: makeId('hist'),
    label,
    timestamp: Date.now(),
    width: doc.width,
    height: doc.height,
    adjustments: cloneAdjustments(doc.adjustments),
    layers: snapshotLayers(doc.layers),
    activeLayerId: doc.activeLayerId,
  };
}

export interface InspectorPanelsState {
  histogram: boolean;
  layers: boolean;
  properties: boolean;
  adjustments: boolean;
  levelsCurves: boolean;
  filters: boolean;
  color: boolean;
  history: boolean;
  metadata: boolean;
}

export interface ViewportSettings {
  showRulers: boolean;
  showGrid: boolean;
  showTransparency: boolean;
  beforeAfterMode: 'off' | 'split' | 'hold';
  splitPosition: number; // 0..1
}

export interface ModalStates {
  newProject: boolean;
  resizeImage: boolean;
  canvasSize: boolean;
  exportImage: boolean;
  batchProcess: boolean;
  filterGallery: boolean;
  perspective: boolean;
  shortcuts: boolean;
  privacy: boolean;
  editingTextLayerId: string | null;
}

interface EditorStoreState {
  initialized: boolean;
  view: 'welcome' | 'editor';
  theme: 'dark' | 'light';
  documents: DocumentState[];
  activeDocumentId: string | null;
  activeTool: ToolId;
  toolOptions: ToolOptions;
  foregroundColor: string;
  backgroundColor: string;
  recentSwatches: string[];
  cropRect: CropRect | null;
  cropStraighten: number;
  cloneSource: { x: number; y: number } | null;
  fitTrigger: number;
  liveCanvasTick: number;
  cursorCanvasPos: { x: number; y: number } | null;
  viewportSettings: ViewportSettings;
  inspectorOpen: InspectorPanelsState;
  inspectorWidth: number;
  recentProjects: RecentProjectMeta[];
  saveStatus: 'idle' | 'saving' | 'saved';
  clipboardLayer: Layer | null;
  clipboardEffects: LayerEffects | null;
  preferInternalClipboard: boolean;
  modals: ModalStates;
  filterGalleryKind: FilterGalleryKind;
  toast: { id: number; message: string; kind: 'info' | 'success' | 'error' } | null;

  initializeApp: () => Promise<void>;
  setView: (view: 'welcome' | 'editor') => void;
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;

  createDocument: (opts: {
    name: string;
    width: number;
    height: number;
    backgroundColor: string;
  }) => void;
  openDecodedImage: (decoded: DecodedImageResult) => void;
  openSamplePreset: (presetId: string) => void;
  openProjectData: (project: SerializedProject) => Promise<void>;
  openRecentProject: (projectId: string) => Promise<void>;
  deleteRecentProject: (projectId: string) => Promise<void>;
  closeDocument: (docId: string) => void;
  setActiveDocument: (docId: string) => void;

  setActiveTool: (tool: ToolId) => void;
  updateToolOptions: (patch: Partial<ToolOptions>) => void;
  setForegroundColor: (hex: string) => void;
  setBackgroundColor: (hex: string) => void;
  swapColors: () => void;
  setCursorCanvasPos: (pos: { x: number; y: number } | null) => void;
  bumpLiveCanvasTick: () => void;

  setZoom: (zoom: number, panX?: number, panY?: number) => void;
  setPan: (panX: number, panY: number) => void;
  requestFitZoom: () => void;

  toggleViewportSetting: (key: 'showRulers' | 'showGrid' | 'showTransparency') => void;
  setBeforeAfterMode: (mode: 'off' | 'split' | 'hold') => void;
  setSplitPosition: (pos: number) => void;

  setCropRect: (rect: CropRect | null) => void;
  setCropStraighten: (angle: number) => void;
  setCloneSource: (pos: { x: number; y: number } | null) => void;
  applyCrop: () => void;
  cancelCrop: () => void;

  setSelection: (selection: SelectionState | null) => void;
  selectAll: () => void;
  invertActiveSelection: () => void;
  clearSelection: () => void;
  cropToSelection: () => void;
  deleteSelectionOrLayer: () => void;
  featherActiveSelection: (radiusPx: number) => void;
  /** Positive grows the selection by that many pixels, negative shrinks it. */
  resizeActiveSelection: (deltaPx: number) => void;
  applySelectionAsMask: (mode?: 'reveal' | 'hide') => void;
  fillSelectionWithColor: (colorHex: string, opacityPercent?: number) => void;
  strokeSelectionWithColor: (colorHex: string, widthPx?: number, opacityPercent?: number) => void;

  selectLayer: (layerId: string) => void;
  setEditingTarget: (target: 'layer' | 'mask') => void;
  addRasterLayer: (name?: string) => void;
  addGroupLayer: (name?: string) => void;
  addAdjustmentLayer: (name?: string) => void;
  toggleGroupExpanded: (groupId: string) => void;
  assignLayerToGroup: (layerId: string, groupId: string | null) => void;
  addLayerMask: (layerId: string) => void;
  toggleLayerMaskEnabled: (layerId: string) => void;
  invertLayerMask: (layerId: string) => void;
  deleteLayerMask: (layerId: string) => void;
  placeImageAsLayer: (decoded: DecodedImageResult) => void;
  addTextLayer: (x?: number, y?: number, text?: string) => string | null;
  addShapeLayer: (x: number, y: number, width: number, height: number, kind?: ShapeKind) => void;
  updateLayer: (layerId: string, patch: Partial<Layer>, historyLabel?: string) => void;
  updateLayerEffects: (
    layerId: string,
    patch: {
      dropShadow?: Partial<DropShadowEffect>;
      outerGlow?: Partial<OuterGlowEffect>;
      stroke?: Partial<StrokeEffect>;
      colorOverlay?: Partial<ColorOverlayEffect>;
      innerShadow?: Partial<InnerShadowEffect>;
      innerGlow?: Partial<InnerGlowEffect>;
    },
    commitLabel?: string
  ) => void;
  copyActiveLayerEffects: () => void;
  pasteActiveLayerEffects: () => void;
  flipActiveLayer: (direction: 'horizontal' | 'vertical') => void;
  nudgeActiveLayer: (dx: number, dy: number) => void;
  deleteLayer: (layerId: string) => void;
  duplicateLayer: (layerId: string) => void;
  layerViaCopyOrDuplicate: () => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  moveLayerOrder: (layerId: string, direction: 'up' | 'down') => void;
  mergeLayerDown: (layerId: string) => void;
  stampVisibleLayers: () => void;
  rasterizeActiveLayer: () => void;
  flattenDocument: () => void;
  alignActiveLayer: (
    alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom'
  ) => void;
  commitCanvasMutation: (label: string) => void;

  copyActiveLayer: () => void;
  copyMergedToClipboard: () => void;
  cutActiveLayer: () => void;
  pasteClipboard: () => void;
  setPreferInternalClipboard: (value: boolean) => void;

  resizeActiveDocument: (newWidth: number, newHeight: number) => void;
  canvasSizeActiveDocument: (
    newWidth: number,
    newHeight: number,
    anchor: CanvasAnchor,
    extensionColor?: string
  ) => void;
  trimTransparentPixels: () => void;
  rotateActiveDocument: (degrees: 90 | -90 | 180) => void;
  flipActiveDocument: (direction: 'horizontal' | 'vertical') => void;

  updateAdjustments: (patch: Partial<Adjustments>, commitLabel?: string) => void;
  updateLevels: (patch: Partial<LevelsConfig>, commitLabel?: string) => void;
  updateCurves: (channel: keyof CurvesConfig, points: CurvePoint[], commitLabel?: string) => void;
  updateFilters: (patch: Partial<FiltersConfig>, commitLabel?: string) => void;
  updateHslBand: (
    band: HslBandId,
    patch: Partial<HslBandAdjust>,
    commitLabel?: string
  ) => void;
  resetHslMixer: () => void;
  updateGradientMap: (patch: Partial<GradientMapConfig>, commitLabel?: string) => void;
  applyAutoLevelsToLayer: () => void;
  applyAutoContrastToLayer: () => void;
  applyGalleryFilterToLayer: (params: GalleryFilterParams) => void;
  applyPerspectiveToActiveLayer: (dstCorners: Array<{ x: number; y: number }>) => void;
  resetLevelsAndCurves: () => void;
  resetFilters: () => void;
  commitAdjustmentsHistory: (label?: string) => void;
  applyAutoEnhance: () => void;
  resetAdjustments: () => void;

  undo: () => void;
  redo: () => void;
  jumpToHistory: (index: number) => void;

  saveActiveDocumentNow: () => Promise<void>;
  saveProjectFileAs: () => Promise<void>;

  toggleInspectorPanel: (panel: keyof InspectorPanelsState) => void;
  setInspectorWidth: (width: number) => void;
  openModal: (modal: keyof Omit<ModalStates, 'editingTextLayerId'>) => void;
  openFilterGallery: (kind?: FilterGalleryKind) => void;
  setFilterGalleryKind: (kind: FilterGalleryKind) => void;
  closeModal: (modal: keyof Omit<ModalStates, 'editingTextLayerId'>) => void;
  setEditingTextLayerId: (id: string | null) => void;
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
  clearToast: () => void;
}

let autosaveTimer: number | null = null;

function scheduleAutosave(
  docId: string,
  get: () => EditorStoreState,
  set: (partial: Partial<EditorStoreState>) => void
) {
  if (autosaveTimer !== null) {
    window.clearTimeout(autosaveTimer);
  }
  set({ saveStatus: 'saving' });
  autosaveTimer = window.setTimeout(async () => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    const meta = await saveProjectToIndexedDb(doc);
    if (meta) {
      const recents = await listRecentProjectsFromIndexedDb();
      set({
        recentProjects: recents,
        saveStatus: 'saved',
        documents: get().documents.map((d) => (d.id === docId ? { ...d, dirty: false } : d)),
      });
    } else {
      set({ saveStatus: 'idle' });
    }
  }, 1100);
}

function withActiveDocMutation(
  get: () => EditorStoreState,
  set: (partial: Partial<EditorStoreState>) => void,
  mutator: (doc: DocumentState) => DocumentState | null,
  historyLabel?: string
) {
  const state = get();
  const idx = state.documents.findIndex((d) => d.id === state.activeDocumentId);
  if (idx === -1) return;
  const current = state.documents[idx];
  const nextDoc = mutator(current);
  if (!nextDoc) return;

  let history = nextDoc.history;
  let historyIndex = nextDoc.historyIndex;

  if (historyLabel) {
    const entry = createHistoryEntry(nextDoc, historyLabel);
    const trimmed = history.slice(0, historyIndex + 1);
    trimmed.push(entry);
    if (trimmed.length > MAX_HISTORY) {
      trimmed.shift();
    }
    history = trimmed;
    historyIndex = trimmed.length - 1;
  }

  const updated: DocumentState = {
    ...nextDoc,
    history,
    historyIndex,
    dirty: true,
    updatedAt: Date.now(),
  };

  const nextDocs = [...state.documents];
  nextDocs[idx] = updated;
  set({ documents: nextDocs });
  scheduleAutosave(updated.id, get, set);
}

async function writeCanvasToSystemClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

function defaultCropForDoc(doc: DocumentState): CropRect {
  return { x: 0, y: 0, width: doc.width, height: doc.height };
}

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  initialized: false,
  view: 'welcome',
  theme: 'dark',
  documents: [],
  activeDocumentId: null,
  activeTool: 'move',
  toolOptions: {
    brushSize: 24,
    brushHardness: 85,
    brushOpacity: 100,
    brushMode: 'normal',
    brushSymmetry: 'off',
    eraserSize: 28,
    eraserHardness: 85,
    eraserOpacity: 100,
    bucketTolerance: 28,
    lassoMode: 'freehand',
    wandTolerance: 28,
    wandContiguous: true,
    gradientKind: 'linear',
    gradientStyle: 'fg-bg',
    gradientOpacity: 100,
    cloneSize: 28,
    cloneHardness: 70,
    cloneOpacity: 100,
    cloneAligned: true,
    cloneSampleAllLayers: false,
    healSize: 24,
    healHardness: 65,
    spotHealMode: 'heal',
    dodgeBurnMode: 'dodge',
    dodgeBurnRange: 'midtones',
    dodgeBurnSize: 28,
    dodgeBurnHardness: 45,
    dodgeBurnStrength: 35,
    smudgeBlurMode: 'smudge',
    smudgeBlurSize: 28,
    smudgeBlurHardness: 45,
    smudgeBlurStrength: 55,
    eyedropperSampleSize: 1,
    snapToGuides: true,
    moveAutoSelect: true,
    cropAspect: 'free',
    cropCustomRatio: 1.5,
    shapeKind: 'rounded-rect',
    shapeFill: '#0A84FF',
    shapeFillEnabled: true,
    shapeStroke: '#FFFFFF',
    shapeStrokeEnabled: false,
    shapeStrokeWidth: 4,
    shapeCornerRadius: 16,
    shapeSides: 5,
    textFontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
    textFontSize: 64,
    textFontWeight: '600',
    textFontStyle: 'normal',
    textAlign: 'left',
    textLineHeight: 1.25,
  },
  foregroundColor: '#0A84FF',
  backgroundColor: '#FFFFFF',
  recentSwatches: ['#0A84FF', '#FF453A', '#30D158', '#FFD60A', '#BF5AF2', '#FFFFFF', '#1D1D1F'],
  cropRect: null,
  cropStraighten: 0,
  cloneSource: null,
  fitTrigger: 0,
  liveCanvasTick: 0,
  cursorCanvasPos: null,
  viewportSettings: {
    showRulers: true,
    showGrid: false,
    showTransparency: true,
    beforeAfterMode: 'off',
    splitPosition: 0.5,
  },
  inspectorOpen: {
    histogram: true,
    layers: true,
    properties: true,
    adjustments: true,
    levelsCurves: false,
    filters: false,
    color: false,
    history: false,
    metadata: false,
  },
  inspectorWidth: 300,
  recentProjects: [],
  saveStatus: 'idle',
  clipboardLayer: null,
  clipboardEffects: null,
  preferInternalClipboard: false,
  modals: {
    newProject: false,
    resizeImage: false,
    canvasSize: false,
    exportImage: false,
    batchProcess: false,
    filterGallery: false,
    perspective: false,
    shortcuts: false,
    privacy: false,
    editingTextLayerId: null,
  },
  filterGalleryKind: 'high-pass',
  toast: null,

  initializeApp: async () => {
    if (get().initialized) return;
    const savedTheme = await loadSetting<'dark' | 'light'>('theme', 'dark');
    document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    const recents = await listRecentProjectsFromIndexedDb();
    set({
      initialized: true,
      theme: savedTheme,
      recentProjects: recents,
    });
  },

  setView: (view) => set({ view }),

  setTheme: (theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    void saveSetting('theme', theme);
    set({ theme });
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },

  createDocument: ({ name, width, height, backgroundColor }) => {
    const w = Math.max(1, Math.min(8192, Math.round(width)));
    const h = Math.max(1, Math.min(8192, Math.round(height)));
    const baseCanvas = createCanvas(w, h);
    if (backgroundColor !== 'transparent') {
      const ctx = baseCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, w, h);
      }
    }
    const baseLayer: RasterLayer = {
      id: makeId('layer'),
      name: 'Background',
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'normal',
      x: 0,
      y: 0,
      width: w,
      height: h,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      canvas: baseCanvas,
    };

    const doc: DocumentState = {
      id: makeId('doc'),
      name: name.trim() || 'Untitled Project',
      width: w,
      height: h,
      backgroundColor,
      layers: [baseLayer],
      activeLayerId: baseLayer.id,
      editingTarget: 'layer',
      adjustments: cloneDefaultAdjustments(),
      selection: null,
      zoom: 1,
      panX: 0,
      panY: 0,
      history: [],
      historyIndex: 0,
      dirty: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourceFormat: 'LPS',
    };
    doc.history = [createHistoryEntry(doc, 'New Document')];

    set((s) => ({
      documents: [...s.documents, doc],
      activeDocumentId: doc.id,
      view: 'editor',
      cropRect: null,
      cropStraighten: 0,
      fitTrigger: s.fitTrigger + 1,
    }));
    scheduleAutosave(doc.id, get, set);
  },

  openDecodedImage: (decoded) => {
    const layer: RasterLayer = {
      id: makeId('layer'),
      name: decoded.name || 'Image Layer',
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'normal',
      x: 0,
      y: 0,
      width: decoded.width,
      height: decoded.height,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      canvas: decoded.canvas,
    };

    const doc: DocumentState = {
      id: makeId('doc'),
      name: decoded.name || 'Imported Image',
      width: decoded.width,
      height: decoded.height,
      backgroundColor: 'transparent',
      layers: [layer],
      activeLayerId: layer.id,
      editingTarget: 'layer',
      adjustments: cloneDefaultAdjustments(),
      selection: null,
      zoom: 1,
      panX: 0,
      panY: 0,
      history: [],
      historyIndex: 0,
      dirty: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourceFormat: decoded.sourceFormat,
      fileSizeBytes: decoded.fileSizeBytes,
    };
    doc.history = [createHistoryEntry(doc, `Open ${decoded.sourceFormat}`)];

    set((s) => ({
      documents: [...s.documents, doc],
      activeDocumentId: doc.id,
      view: 'editor',
      cropRect: null,
      cropStraighten: 0,
      fitTrigger: s.fitTrigger + 1,
    }));

    if (decoded.scaledDown) {
      get().showToast(
        `Large image automatically constrained to ${decoded.width}×${decoded.height}px for smooth local memory performance.`,
        'info'
      );
    }
    scheduleAutosave(doc.id, get, set);
  },

  openSamplePreset: (presetId) => {
    const preset = SAMPLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const canvas = preset.render();
    const layer: RasterLayer = {
      id: makeId('layer'),
      name: preset.name,
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'normal',
      x: 0,
      y: 0,
      width: preset.width,
      height: preset.height,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      canvas,
    };

    const doc: DocumentState = {
      id: makeId('doc'),
      name: preset.name,
      width: preset.width,
      height: preset.height,
      backgroundColor: preset.backgroundColor,
      layers: [layer],
      activeLayerId: layer.id,
      editingTarget: 'layer',
      adjustments: cloneDefaultAdjustments(),
      selection: null,
      zoom: 1,
      panX: 0,
      panY: 0,
      history: [],
      historyIndex: 0,
      dirty: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourceFormat: 'Sample',
    };
    doc.history = [createHistoryEntry(doc, 'Open Studio Sample')];

    set((s) => ({
      documents: [...s.documents, doc],
      activeDocumentId: doc.id,
      view: 'editor',
      cropRect: null,
      cropStraighten: 0,
      fitTrigger: s.fitTrigger + 1,
    }));
    scheduleAutosave(doc.id, get, set);
  },

  openProjectData: async (serialized) => {
    const loaded = await deserializeProject(serialized);
    const existing = get().documents.find((d) => d.id === loaded.id);
    if (existing) {
      set((s) => ({
        activeDocumentId: existing.id,
        view: 'editor',
        fitTrigger: s.fitTrigger + 1,
      }));
      return;
    }

    const doc: DocumentState = {
      ...loaded,
      editingTarget: 'layer',
      adjustments: cloneAdjustments(loaded.adjustments),
      zoom: 1,
      panX: 0,
      panY: 0,
      selection: null,
      dirty: false,
      history: [],
      historyIndex: 0,
    };
    doc.history = [createHistoryEntry(doc, 'Open Project')];

    set((s) => ({
      documents: [...s.documents, doc],
      activeDocumentId: doc.id,
      view: 'editor',
      cropRect: null,
      cropStraighten: 0,
      fitTrigger: s.fitTrigger + 1,
    }));
  },

  openRecentProject: async (projectId) => {
    const existing = get().documents.find((d) => d.id === projectId);
    if (existing) {
      set((s) => ({
        activeDocumentId: existing.id,
        view: 'editor',
        fitTrigger: s.fitTrigger + 1,
      }));
      return;
    }
    const loaded = await loadProjectFromIndexedDb(projectId);
    if (!loaded) {
      get().showToast('Could not locate saved project in local storage.', 'error');
      return;
    }
    const doc: DocumentState = {
      ...loaded,
      editingTarget: 'layer',
      adjustments: cloneAdjustments(loaded.adjustments),
      zoom: 1,
      panX: 0,
      panY: 0,
      selection: null,
      dirty: false,
      history: [],
      historyIndex: 0,
    };
    doc.history = [createHistoryEntry(doc, 'Restored Project')];

    set((s) => ({
      documents: [...s.documents, doc],
      activeDocumentId: doc.id,
      view: 'editor',
      cropRect: null,
      cropStraighten: 0,
      fitTrigger: s.fitTrigger + 1,
    }));
  },

  deleteRecentProject: async (projectId) => {
    await deleteProjectFromIndexedDb(projectId);
    const recents = await listRecentProjectsFromIndexedDb();
    set({ recentProjects: recents });
    get().showToast('Removed project from local browser storage.', 'info');
  },

  closeDocument: (docId) => {
    const docs = get().documents.filter((d) => d.id !== docId);
    let nextActive = get().activeDocumentId;
    if (nextActive === docId) {
      nextActive = docs.length > 0 ? docs[docs.length - 1].id : null;
    }
    set({
      documents: docs,
      activeDocumentId: nextActive,
      view: docs.length === 0 ? 'welcome' : get().view,
      cropRect: null,
      cropStraighten: 0,
    });
  },

  setActiveDocument: (docId) => {
    set({ activeDocumentId: docId, view: 'editor', cropRect: null, cropStraighten: 0 });
  },

  setActiveTool: (tool) => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    let nextCropRect: CropRect | null = null;
    if (tool === 'crop' && doc) {
      nextCropRect = get().cropRect ?? defaultCropForDoc(doc);
    }
    set({ activeTool: tool, cropRect: nextCropRect });
  },

  updateToolOptions: (patch) =>
    set((s) => ({ toolOptions: { ...s.toolOptions, ...patch } })),

  setForegroundColor: (hex) => {
    const upper = hex.toUpperCase();
    set((s) => ({
      foregroundColor: upper,
      recentSwatches: [upper, ...s.recentSwatches.filter((c) => c !== upper)].slice(0, 12),
    }));
  },

  setBackgroundColor: (hex) => set({ backgroundColor: hex.toUpperCase() }),

  swapColors: () =>
    set((s) => ({
      foregroundColor: s.backgroundColor,
      backgroundColor: s.foregroundColor,
    })),

  setCursorCanvasPos: (pos) => set({ cursorCanvasPos: pos }),
  bumpLiveCanvasTick: () => set((s) => ({ liveCanvasTick: s.liveCanvasTick + 1 })),

  setZoom: (zoom, panX, panY) => {
    const clamped = Math.max(0.05, Math.min(16, zoom));
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === s.activeDocumentId
          ? {
              ...d,
              zoom: clamped,
              panX: panX !== undefined ? panX : d.panX,
              panY: panY !== undefined ? panY : d.panY,
            }
          : d
      ),
    }));
  },

  setPan: (panX, panY) => {
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === s.activeDocumentId ? { ...d, panX, panY } : d
      ),
    }));
  },

  requestFitZoom: () => set((s) => ({ fitTrigger: s.fitTrigger + 1 })),

  toggleViewportSetting: (key) =>
    set((s) => ({
      viewportSettings: { ...s.viewportSettings, [key]: !s.viewportSettings[key] },
    })),

  setBeforeAfterMode: (mode) =>
    set((s) => ({
      viewportSettings: { ...s.viewportSettings, beforeAfterMode: mode },
    })),

  setSplitPosition: (pos) =>
    set((s) => ({
      viewportSettings: {
        ...s.viewportSettings,
        splitPosition: Math.max(0.05, Math.min(0.95, pos)),
      },
    })),

  setCropRect: (rect) => set({ cropRect: rect }),

  setCropStraighten: (angle) =>
    set({ cropStraighten: Math.max(-45, Math.min(45, Math.round(angle * 2) / 2)) }),

  setCloneSource: (pos) => set({ cloneSource: pos }),

  applyCrop: () => {
    const crop = get().cropRect;
    if (!crop || crop.width < 1 || crop.height < 1) return;
    const angle = get().cropStraighten;
    withActiveDocMutation(
      get,
      set,
      (doc) => ({
        ...doc,
        width: Math.max(1, Math.round(crop.width)),
        height: Math.max(1, Math.round(crop.height)),
        layers: cropAndStraightenLayers(doc.layers, crop, angle),
        selection: null,
      }),
      Math.abs(angle) >= 0.01 ? 'Crop & Straighten' : 'Crop Image'
    );
    set((s) => ({
      cropRect: null,
      cropStraighten: 0,
      activeTool: 'move',
      fitTrigger: s.fitTrigger + 1,
    }));
  },

  cancelCrop: () => set({ cropRect: null, cropStraighten: 0, activeTool: 'move' }),

  setSelection: (selection) => {
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === s.activeDocumentId ? { ...d, selection } : d
      ),
    }));
  },

  selectAll: () => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc) return;
    get().setSelection({
      kind: 'rect',
      x: 0,
      y: 0,
      width: doc.width,
      height: doc.height,
    });
  },

  invertActiveSelection: () => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc) return;
    const nextSel = invertSelectionState(doc.selection, doc.width, doc.height);
    if (nextSel.width <= 0 || nextSel.height <= 0) {
      get().setSelection(null);
      return;
    }
    get().setSelection(nextSel);
  },

  clearSelection: () => get().setSelection(null),

  cropToSelection: () => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc?.selection) return;
    const sel = doc.selection;
    const rawCrop = sel.inverted
      ? { x: 0, y: 0, width: doc.width, height: doc.height }
      : {
          x: Math.max(0, Math.round(sel.x)),
          y: Math.max(0, Math.round(sel.y)),
          width: Math.min(doc.width - Math.max(0, Math.round(sel.x)), Math.round(sel.width)),
          height: Math.min(doc.height - Math.max(0, Math.round(sel.y)), Math.round(sel.height)),
        };
    if (rawCrop.width < 1 || rawCrop.height < 1) return;
    withActiveDocMutation(
      get,
      set,
      (curr) => ({
        ...curr,
        width: Math.max(1, rawCrop.width),
        height: Math.max(1, rawCrop.height),
        layers: cropLayers(curr.layers, rawCrop),
        selection: null,
      }),
      'Crop to Selection'
    );
    set((s) => ({ fitTrigger: s.fitTrigger + 1 }));
  },

  deleteSelectionOrLayer: () => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc) return;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer || activeLayer.locked) return;

    if (doc.selection && doc.editingTarget === 'mask' && activeLayer.mask) {
      const sel = doc.selection;
      const beforeMask = sel.kind === 'mask' ? cloneCanvas(activeLayer.mask.canvas) : null;
      const clonedMaskCanvas = cloneCanvas(activeLayer.mask.canvas);
      const ctx = clonedMaskCanvas.getContext('2d');
      if (ctx) {
        ctx.save();
        if (sel.kind !== 'mask') {
          applySelectionClipToContext(
            ctx,
            sel,
            clonedMaskCanvas.width,
            clonedMaskCanvas.height,
            0,
            0,
            1,
            1
          );
        }
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, clonedMaskCanvas.width, clonedMaskCanvas.height);
        ctx.restore();
        if (sel.kind === 'mask' && beforeMask) {
          maskCanvasDiffBySelection(clonedMaskCanvas, beforeMask, sel, 0, 0, 1, 1);
        }
      }
      withActiveDocMutation(
        get,
        set,
        (curr) => ({
          ...curr,
          layers: curr.layers.map((l) =>
            l.id === activeLayer.id && l.mask
              ? { ...l, mask: { ...l.mask, canvas: clonedMaskCanvas } }
              : l
          ),
        }),
        'Mask Out Selection'
      );
      return;
    }

    if (doc.selection && activeLayer.type === 'raster') {
      const sel = doc.selection;
      const beforeRaster = sel.kind === 'mask' ? cloneCanvas(activeLayer.canvas) : null;
      const cloned = cloneCanvas(activeLayer.canvas);
      const ctx = cloned.getContext('2d');
      if (ctx) {
        ctx.save();
        if (sel.kind !== 'mask') {
          applySelectionClipToContext(
            ctx,
            sel,
            cloned.width,
            cloned.height,
            activeLayer.x,
            activeLayer.y,
            activeLayer.scaleX,
            activeLayer.scaleY
          );
        }
        ctx.clearRect(0, 0, cloned.width, cloned.height);
        ctx.restore();
        if (sel.kind === 'mask' && beforeRaster) {
          maskCanvasDiffBySelection(
            cloned,
            beforeRaster,
            sel,
            activeLayer.x,
            activeLayer.y,
            activeLayer.scaleX,
            activeLayer.scaleY
          );
        }
      }
      withActiveDocMutation(
        get,
        set,
        (curr) => ({
          ...curr,
          layers: curr.layers.map((l) =>
            l.id === activeLayer.id ? { ...l, canvas: cloned } : l
          ),
        }),
        'Clear Selection'
      );
      return;
    }

    if (doc.layers.length > 1) {
      get().deleteLayer(activeLayer.id);
    }
  },

  featherActiveSelection: (radiusPx) => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc?.selection) return;
    const r = Math.max(0, Math.min(64, Math.round(radiusPx)));
    if (r <= 0) return;
    const rawMask = rasterizeSelectionToMaskBuffer(doc.selection, doc.width, doc.height);
    const { maskData, bounds } = featherMaskBuffer(rawMask, doc.width, doc.height, r);
    if (bounds.width <= 0 || bounds.height <= 0) {
      get().setSelection(null);
      return;
    }
    get().setSelection({
      kind: 'mask',
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maskData,
      maskWidth: doc.width,
      maskHeight: doc.height,
      inverted: false,
    });
    get().showToast(`Feathered selection (${r}px)`, 'info');
  },

  resizeActiveSelection: (deltaPx) => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc?.selection) return;
    const d = Math.max(-64, Math.min(64, Math.round(deltaPx)));
    if (d === 0) return;
    const rawMask = rasterizeSelectionToMaskBuffer(doc.selection, doc.width, doc.height);
    const { maskData, bounds } = resizeMaskBuffer(rawMask, doc.width, doc.height, d);
    if (bounds.width <= 0 || bounds.height <= 0) {
      get().setSelection(null);
      get().showToast('Selection shrank to nothing.', 'info');
      return;
    }
    get().setSelection({
      kind: 'mask',
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maskData,
      maskWidth: doc.width,
      maskHeight: doc.height,
      inverted: false,
    });
    get().showToast(`${d > 0 ? 'Grew' : 'Shrank'} selection by ${Math.abs(d)}px`, 'info');
  },

  applySelectionAsMask: (mode = 'reveal') => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc?.selection || !doc.activeLayerId) return;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) return;

    const selMask = rasterizeSelectionToMaskBuffer(doc.selection, doc.width, doc.height);
    const maskCanvas = createCanvas(doc.width, doc.height);
    writeMaskBufferToMaskCanvas(maskCanvas, selMask, doc.width, doc.height, mode === 'hide');

    withActiveDocMutation(
      get,
      set,
      (curr) => ({
        ...curr,
        layers: curr.layers.map((l) =>
          l.id === activeLayer.id
            ? {
                ...l,
                mask: {
                  canvas: maskCanvas,
                  enabled: true,
                  inverted: false,
                },
              }
            : l
        ),
        editingTarget: 'mask',
        selection: null,
      }),
      'Mask from Selection'
    );
    get().showToast(`Applied selection as layer mask on "${activeLayer.name}"`, 'success');
  },

  fillSelectionWithColor: (colorHex, opacityPercent = 100) => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc || !doc.activeLayerId) return;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) return;
    if (activeLayer.locked) {
      get().showToast('Active layer is locked.', 'info');
      return;
    }

    const editingMask = doc.editingTarget === 'mask' && !!activeLayer.mask;
    if (!editingMask && activeLayer.type !== 'raster') {
      get().showToast('Select a Raster Layer or Layer Mask to fill.', 'info');
      return;
    }

    const maskBuf = doc.selection
      ? rasterizeSelectionToMaskBuffer(doc.selection, doc.width, doc.height)
      : null;

    if (editingMask && activeLayer.mask) {
      const nextMaskCanvas = cloneCanvas(activeLayer.mask.canvas);
      const changed = fillCanvasWithSelectionMask({
        targetCanvas: nextMaskCanvas,
        fillHex: colorHex,
        opacityPercent,
        maskData: maskBuf,
        docWidth: doc.width,
        docHeight: doc.height,
        offsetX: 0,
        offsetY: 0,
        scaleX: 1,
        scaleY: 1,
      });
      if (!changed) return;
      withActiveDocMutation(
        get,
        set,
        (curr) => ({
          ...curr,
          layers: curr.layers.map((l) =>
            l.id === activeLayer.id && l.mask
              ? { ...l, mask: { ...l.mask, canvas: nextMaskCanvas } }
              : l
          ),
        }),
        'Fill Mask Selection'
      );
      return;
    }

    if (activeLayer.type === 'raster') {
      const nextCanvas = cloneCanvas(activeLayer.canvas);
      const changed = fillCanvasWithSelectionMask({
        targetCanvas: nextCanvas,
        fillHex: colorHex,
        opacityPercent,
        maskData: maskBuf,
        docWidth: doc.width,
        docHeight: doc.height,
        offsetX: activeLayer.x,
        offsetY: activeLayer.y,
        scaleX: activeLayer.scaleX,
        scaleY: activeLayer.scaleY,
      });
      if (!changed) return;
      withActiveDocMutation(
        get,
        set,
        (curr) => ({
          ...curr,
          layers: curr.layers.map((l) =>
            l.id === activeLayer.id ? { ...l, canvas: nextCanvas } : l
          ),
        }),
        'Fill Selection'
      );
    }
  },

  strokeSelectionWithColor: (colorHex, widthPx = 2, opacityPercent = 100) => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc || !doc.activeLayerId) return;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) return;
    if (activeLayer.locked) {
      get().showToast('Active layer is locked.', 'info');
      return;
    }

    const editingMask = doc.editingTarget === 'mask' && !!activeLayer.mask;
    if (!editingMask && activeLayer.type !== 'raster') {
      get().showToast('Select a Raster Layer or Layer Mask to stroke.', 'info');
      return;
    }

    const maskBuf = doc.selection
      ? rasterizeSelectionToMaskBuffer(doc.selection, doc.width, doc.height)
      : null;

    if (editingMask && activeLayer.mask) {
      const nextMaskCanvas = cloneCanvas(activeLayer.mask.canvas);
      const changed = strokeCanvasWithSelectionMask({
        targetCanvas: nextMaskCanvas,
        strokeHex: colorHex,
        strokeWidthPx: widthPx,
        opacityPercent,
        maskData: maskBuf,
        docWidth: doc.width,
        docHeight: doc.height,
        offsetX: 0,
        offsetY: 0,
        scaleX: 1,
        scaleY: 1,
      });
      if (!changed) return;
      withActiveDocMutation(
        get,
        set,
        (curr) => ({
          ...curr,
          layers: curr.layers.map((l) =>
            l.id === activeLayer.id && l.mask
              ? { ...l, mask: { ...l.mask, canvas: nextMaskCanvas } }
              : l
          ),
        }),
        'Stroke Mask Selection'
      );
      return;
    }

    if (activeLayer.type === 'raster') {
      const nextCanvas = cloneCanvas(activeLayer.canvas);
      const changed = strokeCanvasWithSelectionMask({
        targetCanvas: nextCanvas,
        strokeHex: colorHex,
        strokeWidthPx: widthPx,
        opacityPercent,
        maskData: maskBuf,
        docWidth: doc.width,
        docHeight: doc.height,
        offsetX: activeLayer.x,
        offsetY: activeLayer.y,
        scaleX: activeLayer.scaleX,
        scaleY: activeLayer.scaleY,
      });
      if (!changed) return;
      withActiveDocMutation(
        get,
        set,
        (curr) => ({
          ...curr,
          layers: curr.layers.map((l) =>
            l.id === activeLayer.id ? { ...l, canvas: nextCanvas } : l
          ),
        }),
        'Stroke Selection'
      );
    }
  },

  selectLayer: (layerId) => {
    set((s) => ({
      documents: s.documents.map((d) => {
        if (d.id !== s.activeDocumentId) return d;
        const targetLayer = d.layers.find((l) => l.id === layerId);
        return {
          ...d,
          activeLayerId: layerId,
          editingTarget: d.editingTarget === 'mask' && targetLayer?.mask ? 'mask' : 'layer',
        };
      }),
    }));
  },

  setEditingTarget: (target) => {
    set((s) => ({
      documents: s.documents.map((d) => {
        if (d.id !== s.activeDocumentId) return d;
        const active = d.layers.find((l) => l.id === d.activeLayerId);
        if (target === 'mask' && !active?.mask) return d;
        return { ...d, editingTarget: target };
      }),
    }));
  },

  addRasterLayer: (name) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const layer: RasterLayer = {
          id: makeId('layer'),
          name: name || nextNumberedName(doc.layers, 'Layer'),
          type: 'raster',
          visible: true,
          locked: false,
          opacity: 100,
          blendMode: 'normal',
          x: 0,
          y: 0,
          width: doc.width,
          height: doc.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          canvas: createCanvas(doc.width, doc.height),
        };
        return {
          ...doc,
          layers: [...doc.layers, layer],
          activeLayerId: layer.id,
          editingTarget: 'layer',
        };
      },
      'New Raster Layer'
    );
  },

  addGroupLayer: (name) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const group: GroupLayer = {
          id: makeId('group'),
          name: name || nextNumberedName(doc.layers, 'Group'),
          type: 'group',
          visible: true,
          locked: false,
          opacity: 100,
          blendMode: 'normal',
          x: 0,
          y: 0,
          width: doc.width,
          height: doc.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          expanded: true,
        };
        return {
          ...doc,
          layers: [...doc.layers, group],
          activeLayerId: group.id,
          editingTarget: 'layer',
        };
      },
      'New Layer Group'
    );
  },

  toggleGroupExpanded: (groupId) => {
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === s.activeDocumentId
          ? {
              ...d,
              layers: d.layers.map((l) =>
                l.id === groupId && l.type === 'group' ? { ...l, expanded: !l.expanded } : l
              ),
            }
          : d
      ),
    }));
  },

  assignLayerToGroup: (layerId, groupId) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        if (layerId === groupId) return null;
        if (groupId) {
          const targetGroup = doc.layers.find((l) => l.id === groupId);
          if (!targetGroup || targetGroup.type !== 'group') return null;
        }
        return {
          ...doc,
          layers: doc.layers.map((l) =>
            l.id === layerId ? { ...l, parentId: groupId } : l
          ),
        };
      },
      groupId ? 'Move Layer to Group' : 'Remove Layer from Group'
    );
  },

  addLayerMask: (layerId) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const target = doc.layers.find((l) => l.id === layerId);
        if (!target || target.mask) return null;
        const mask: LayerMask = {
          canvas: createWhiteMaskCanvas(doc.width, doc.height),
          enabled: true,
          inverted: false,
        };
        return {
          ...doc,
          layers: doc.layers.map((l) => (l.id === layerId ? { ...l, mask } : l)),
          activeLayerId: layerId,
          editingTarget: 'mask',
        };
      },
      'Add Layer Mask'
    );
  },

  toggleLayerMaskEnabled: (layerId) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => ({
        ...doc,
        layers: doc.layers.map((l) =>
          l.id === layerId && l.mask
            ? { ...l, mask: { ...l.mask, enabled: !l.mask.enabled } }
            : l
        ),
      }),
      'Toggle Layer Mask'
    );
  },

  invertLayerMask: (layerId) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => ({
        ...doc,
        layers: doc.layers.map((l) =>
          l.id === layerId && l.mask
            ? { ...l, mask: { ...l.mask, inverted: !l.mask.inverted } }
            : l
        ),
      }),
      'Invert Layer Mask'
    );
  },

  deleteLayerMask: (layerId) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => ({
        ...doc,
        layers: doc.layers.map((l) => (l.id === layerId ? { ...l, mask: null } : l)),
        editingTarget: doc.activeLayerId === layerId ? 'layer' : doc.editingTarget,
      }),
      'Delete Layer Mask'
    );
  },

  placeImageAsLayer: (decoded) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const fitScale = Math.min(
          1,
          (doc.width * 0.85) / decoded.width,
          (doc.height * 0.85) / decoded.height
        );
        const w = Math.max(1, Math.round(decoded.width * fitScale));
        const h = Math.max(1, Math.round(decoded.height * fitScale));
        const placedCanvas = createCanvas(w, h);
        const pctx = placedCanvas.getContext('2d');
        if (pctx) {
          pctx.imageSmoothingEnabled = true;
          pctx.imageSmoothingQuality = 'high';
          pctx.drawImage(decoded.canvas, 0, 0, w, h);
        }
        const layer: RasterLayer = {
          id: makeId('layer'),
          name: decoded.name || 'Placed Image',
          type: 'raster',
          visible: true,
          locked: false,
          opacity: 100,
          blendMode: 'normal',
          x: Math.round((doc.width - w) / 2),
          y: Math.round((doc.height - h) / 2),
          width: w,
          height: h,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          canvas: placedCanvas,
        };
        return {
          ...doc,
          layers: [...doc.layers, layer],
          activeLayerId: layer.id,
        };
      },
      `Place "${decoded.name}"`
    );
  },

  addTextLayer: (x, y, text = 'Double-click to edit') => {
    let createdId: string | null = null;
    const opts = get().toolOptions;
    const fg = get().foregroundColor;

    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const width = Math.min(doc.width * 0.65, Math.max(260, opts.textFontSize * 8));
        const height = Math.max(80, opts.textFontSize * 2.2);
        const layer: TextLayer = {
          id: makeId('text'),
          name: text.slice(0, 22) || 'Text Layer',
          type: 'text',
          visible: true,
          locked: false,
          opacity: 100,
          blendMode: 'normal',
          x: x !== undefined ? x : Math.round((doc.width - width) / 2),
          y: y !== undefined ? y : Math.round((doc.height - height) / 2),
          width,
          height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          text,
          fontFamily: opts.textFontFamily,
          fontSize: opts.textFontSize,
          fontWeight: opts.textFontWeight,
          fontStyle: opts.textFontStyle,
          color: fg,
          align: opts.textAlign,
          lineHeight: opts.textLineHeight,
        };
        createdId = layer.id;
        return {
          ...doc,
          layers: [...doc.layers, layer],
          activeLayerId: layer.id,
        };
      },
      'Add Text Layer'
    );
    return createdId;
  },

  addShapeLayer: (x, y, width, height, kind) => {
    const opts = get().toolOptions;
    const shapeKind = kind ?? opts.shapeKind;
    const labelMap: Record<ShapeKind, string> = {
      rect: 'Rectangle',
      'rounded-rect': 'Rounded Rect',
      ellipse: 'Ellipse',
      line: 'Line',
      polygon: 'Polygon',
      star: 'Star',
      arrow: 'Arrow',
    };

    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const baseName = labelMap[shapeKind];
        const layer: ShapeLayer = {
          id: makeId('shape'),
          name: nextNumberedName(doc.layers, baseName),
          type: 'shape',
          visible: true,
          locked: false,
          opacity: 100,
          blendMode: 'normal',
          x: Math.round(x),
          y: Math.round(y),
          width: Math.max(8, Math.round(width)),
          height: Math.max(8, Math.round(height)),
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          shapeKind,
          fill: opts.shapeFill,
          fillEnabled: opts.shapeFillEnabled,
          stroke: opts.shapeStroke,
          strokeEnabled: opts.shapeStrokeEnabled || shapeKind === 'line',
          strokeWidth: opts.shapeStrokeWidth,
          cornerRadius: opts.shapeCornerRadius,
          ...(shapeKind === 'polygon' || shapeKind === 'star' ? { sides: opts.shapeSides } : {}),
        };
        return {
          ...doc,
          layers: [...doc.layers, layer],
          activeLayerId: layer.id,
        };
      },
      `Add ${labelMap[shapeKind]}`
    );
  },

  updateLayer: (layerId, patch, historyLabel) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => ({
        ...doc,
        layers: doc.layers.map((l) => {
          if (l.id !== layerId) return l;
          const merged = { ...l, ...patch } as Layer;
          if (merged.type === 'text') {
            const dims = measureTextLayerDimensions(merged);
            return { ...merged, height: dims.height };
          }
          return merged;
        }),
      }),
      historyLabel
    );
  },

  updateLayerEffects: (layerId, patch, commitLabel) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => ({
        ...doc,
        layers: doc.layers.map((l) => {
          if (l.id !== layerId) return l;
          const current: LayerEffects = {
            dropShadow: { ...DEFAULT_DROP_SHADOW, ...(l.effects?.dropShadow ?? {}) },
            outerGlow: { ...DEFAULT_OUTER_GLOW, ...(l.effects?.outerGlow ?? {}) },
            stroke: { ...DEFAULT_STROKE, ...(l.effects?.stroke ?? {}) },
            colorOverlay: { ...DEFAULT_COLOR_OVERLAY, ...(l.effects?.colorOverlay ?? {}) },
            innerShadow: { ...DEFAULT_INNER_SHADOW, ...(l.effects?.innerShadow ?? {}) },
            innerGlow: { ...DEFAULT_INNER_GLOW, ...(l.effects?.innerGlow ?? {}) },
          };
          const nextEffects: LayerEffects = {
            dropShadow: patch.dropShadow
              ? { ...current.dropShadow, ...patch.dropShadow }
              : current.dropShadow,
            outerGlow: patch.outerGlow
              ? { ...current.outerGlow, ...patch.outerGlow }
              : current.outerGlow,
            stroke: patch.stroke ? { ...current.stroke, ...patch.stroke } : current.stroke,
            colorOverlay: patch.colorOverlay
              ? { ...current.colorOverlay, ...patch.colorOverlay }
              : current.colorOverlay,
            innerShadow: patch.innerShadow
              ? { ...current.innerShadow, ...patch.innerShadow }
              : current.innerShadow,
            innerGlow: patch.innerGlow
              ? { ...current.innerGlow, ...patch.innerGlow }
              : current.innerGlow,
          };
          return { ...l, effects: nextEffects };
        }),
      }),
      commitLabel
    );
  },

  copyActiveLayerEffects: () => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!layer) return;
    const cloned = cloneLayerEffects(layer.effects);
    set({ clipboardEffects: cloned });
    get().showToast(`Copied layer style from "${layer.name}"`, 'info');
  },

  pasteActiveLayerEffects: () => {
    const clip = get().clipboardEffects;
    if (!clip) return;
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const active = doc.layers.find((l) => l.id === doc.activeLayerId);
        if (!active || active.locked) return null;
        return {
          ...doc,
          layers: doc.layers.map((l) =>
            l.id === active.id ? { ...l, effects: cloneLayerEffects(clip) } : l
          ),
        };
      },
      'Paste Layer Style'
    );
    get().showToast('Pasted layer style', 'success');
  },

  flipActiveLayer: (direction) => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc || !doc.activeLayerId) return;
    const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!layer || layer.locked || layer.type === 'group' || layer.type === 'adjustment') return;
    if (direction === 'horizontal') {
      get().updateLayer(layer.id, { flipX: !layer.flipX }, 'Flip Layer Horizontal');
    } else {
      get().updateLayer(layer.id, { flipY: !layer.flipY }, 'Flip Layer Vertical');
    }
  },

  nudgeActiveLayer: (dx, dy) => {
    if (dx === 0 && dy === 0) return;
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc || !doc.activeLayerId) return;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer || activeLayer.locked) return;

    const tool = get().activeTool;
    if ((tool === 'marquee-rect' || tool === 'marquee-ellipse') && doc.selection) {
      get().setSelection({
        ...doc.selection,
        x: doc.selection.x + dx,
        y: doc.selection.y + dy,
      });
      return;
    }

    withActiveDocMutation(
      get,
      set,
      (curr) => {
        const target = curr.layers.find((l) => l.id === curr.activeLayerId);
        if (!target || target.locked || target.type === 'adjustment') return null;

        if (target.type === 'group') {
          const groupIds = new Set<string>([target.id]);
          let added = true;
          while (added) {
            added = false;
            for (const l of curr.layers) {
              if (l.parentId && groupIds.has(l.parentId) && !groupIds.has(l.id)) {
                groupIds.add(l.id);
                added = true;
              }
            }
          }
          let movedAny = false;
          const nextLayers = curr.layers.map((l) => {
            if (l.id !== target.id && l.parentId && groupIds.has(l.parentId) && !l.locked && l.type !== 'group' && l.type !== 'adjustment') {
              movedAny = true;
              return { ...l, x: l.x + dx, y: l.y + dy };
            }
            return l;
          });
          return movedAny ? { ...curr, layers: nextLayers } : null;
        }

        return {
          ...curr,
          layers: curr.layers.map((l) =>
            l.id === target.id ? { ...l, x: l.x + dx, y: l.y + dy } : l
          ),
        };
      },
      'Nudge Layer'
    );
  },

  deleteLayer: (layerId) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        if (doc.layers.length <= 1) return null;
        const nextLayers = doc.layers
          .filter((l) => l.id !== layerId)
          .map((l) => (l.parentId === layerId ? { ...l, parentId: null } : l));
        if (nextLayers.length === 0) return null;
        const nextActive =
          doc.activeLayerId === layerId
            ? nextLayers[nextLayers.length - 1]?.id ?? null
            : doc.activeLayerId;
        return {
          ...doc,
          layers: nextLayers,
          activeLayerId: nextActive,
          editingTarget: doc.activeLayerId === layerId ? 'layer' : doc.editingTarget,
        };
      },
      'Delete Layer'
    );
  },

  duplicateLayer: (layerId) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const idx = doc.layers.findIndex((l) => l.id === layerId);
        if (idx === -1) return null;
        const src = doc.layers[idx];
        const clonedMask = cloneLayerMask(src.mask);
        const clonedEffects = cloneLayerEffects(src.effects);
        const dup: Layer =
          src.type === 'raster'
            ? {
                ...src,
                id: makeId('layer'),
                name: `${src.name} Copy`,
                x: src.x + 16,
                y: src.y + 16,
                canvas: cloneCanvas(src.canvas),
                mask: clonedMask,
                effects: clonedEffects,
              }
            : src.type === 'adjustment'
              ? {
                  ...src,
                  id: makeId('adjustment'),
                  name: `${src.name} Copy`,
                  adjustments: cloneAdjustments(src.adjustments),
                  mask: clonedMask,
                  effects: clonedEffects,
                }
              : src.type === 'group'
              ? {
                  ...src,
                  id: makeId('group'),
                  name: `${src.name} Copy`,
                  mask: clonedMask,
                  effects: clonedEffects,
                }
              : {
                  ...src,
                  id: makeId(src.type),
                  name: `${src.name} Copy`,
                  x: src.x + 16,
                  y: src.y + 16,
                  mask: clonedMask,
                  effects: clonedEffects,
                };
        const next = [...doc.layers];
        next.splice(idx + 1, 0, dup);
        return {
          ...doc,
          layers: next,
          activeLayerId: dup.id,
          editingTarget: 'layer',
        };
      },
      'Duplicate Layer'
    );
  },

  layerViaCopyOrDuplicate: () => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc || !doc.activeLayerId) return;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) return;

    if (!doc.selection) {
      get().duplicateLayer(activeLayer.id);
      return;
    }

    const maskBuf = rasterizeSelectionToMaskBuffer(doc.selection, doc.width, doc.height);
    const scratch = createCanvas(doc.width, doc.height);
    const sctx = scratch.getContext('2d', { willReadFrequently: true });
    if (!sctx) return;

    const cleanLayers = doc.layers.map((l) =>
      l.id === activeLayer.id
        ? { ...l, visible: true, opacity: 100, blendMode: 'normal' as const, effects: null }
        : l
    );
    const cleanTarget = cleanLayers.find((l) => l.id === activeLayer.id);
    if (!cleanTarget) return;
    renderLayerNodeToContext(sctx, cleanTarget, cleanLayers, doc.width, doc.height);

    const extracted = extractSelectionFromCanvas(scratch, maskBuf, doc.width, doc.height);
    if (!extracted) {
      get().showToast('Selection contains no visible pixels on the active layer.', 'info');
      return;
    }

    withActiveDocMutation(
      get,
      set,
      (curr) => {
        const idx = curr.layers.findIndex((l) => l.id === activeLayer.id);
        const cutout: RasterLayer = {
          id: makeId('layer'),
          name: `${activeLayer.name} Copy`,
          type: 'raster',
          visible: true,
          locked: false,
          opacity: activeLayer.opacity,
          blendMode: activeLayer.blendMode,
          x: extracted.x,
          y: extracted.y,
          width: extracted.width,
          height: extracted.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          parentId: activeLayer.parentId ?? null,
          canvas: extracted.canvas,
        };
        const nextLayers = [...curr.layers];
        nextLayers.splice(idx === -1 ? nextLayers.length : idx + 1, 0, cutout);
        return {
          ...curr,
          layers: nextLayers,
          activeLayerId: cutout.id,
          editingTarget: 'layer',
        };
      },
      'Layer via Copy'
    );
    get().showToast('Created Layer via Copy', 'success');
  },

  reorderLayers: (fromIndex, toIndex) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        if (
          fromIndex === toIndex ||
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= doc.layers.length ||
          toIndex >= doc.layers.length
        ) {
          return null;
        }
        const next = [...doc.layers];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return { ...doc, layers: next };
      },
      'Reorder Layers'
    );
  },

  moveLayerOrder: (layerId, direction) => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc) return;
    const idx = doc.layers.findIndex((l) => l.id === layerId);
    if (idx === -1) return;
    const target = direction === 'up' ? idx + 1 : idx - 1;
    get().reorderLayers(idx, target);
  },

  mergeLayerDown: (layerId) => {
    const curDoc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!curDoc) return;
    const curIdx = curDoc.layers.findIndex((l) => l.id === layerId);
    if (curIdx <= 0) return;
    if (
      [curDoc.layers[curIdx], curDoc.layers[curIdx - 1]].some(
        (l) => l.type === 'group' || l.type === 'adjustment'
      )
    ) {
      get().showToast('Merge down only works between pixel, text and shape layers.', 'info');
      return;
    }

    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const idx = doc.layers.findIndex((l) => l.id === layerId);
        if (idx <= 0) return null;
        const lower = doc.layers[idx - 1];
        const upper = doc.layers[idx];
        if (lower.type === 'group' || upper.type === 'group') return null;
        if (lower.type === 'adjustment' || upper.type === 'adjustment') return null;
        const mergedCanvas = compositeLayersToCanvas(doc.width, doc.height, 'transparent', [
          { ...lower, parentId: null },
          { ...upper, parentId: null },
        ]);
        const merged: RasterLayer = {
          id: makeId('layer'),
          name: lower.name,
          type: 'raster',
          visible: true,
          locked: false,
          opacity: 100,
          blendMode: 'normal',
          x: 0,
          y: 0,
          width: doc.width,
          height: doc.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          parentId: lower.parentId ?? null,
          canvas: mergedCanvas,
        };
        const nextLayers = [...doc.layers];
        nextLayers.splice(idx - 1, 2, merged);
        return {
          ...doc,
          layers: nextLayers,
          activeLayerId: merged.id,
          editingTarget: 'layer',
        };
      },
      'Merge Layer Down'
    );
  },

  stampVisibleLayers: () => {
    const curDoc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!curDoc) return;
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const flatCanvas = compositeLayersToCanvas(
          doc.width,
          doc.height,
          doc.backgroundColor,
          doc.layers,
          doc.adjustments
        );
        const stamped: RasterLayer = {
          id: makeId('layer'),
          name: nextNumberedName(doc.layers, 'Stamped'),
          type: 'raster',
          visible: true,
          locked: false,
          opacity: 100,
          blendMode: 'normal',
          x: 0,
          y: 0,
          width: doc.width,
          height: doc.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          canvas: flatCanvas,
        };
        return {
          ...doc,
          layers: [...doc.layers, stamped],
          activeLayerId: stamped.id,
          editingTarget: 'layer',
        };
      },
      'Stamp Visible'
    );
    get().showToast('Created stamped composite layer', 'success');
  },

  rasterizeActiveLayer: () => {
    const curDoc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!curDoc || !curDoc.activeLayerId) return;
    const target = curDoc.layers.find((l) => l.id === curDoc.activeLayerId);
    if (!target || target.locked || (target.type !== 'text' && target.type !== 'shape')) {
      return;
    }

    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
        if (!layer || layer.locked || (layer.type !== 'text' && layer.type !== 'shape')) {
          return null;
        }
        const rasterized = rasterizeVectorLayer(layer, makeId('layer'));
        return {
          ...doc,
          layers: doc.layers.map((l) => (l.id === layer.id ? rasterized : l)),
          activeLayerId: rasterized.id,
          editingTarget: 'layer',
        };
      },
      'Rasterize Layer'
    );
    set((s) => ({
      modals: { ...s.modals, editingTextLayerId: null },
    }));
    get().showToast(`Rasterized "${target.name}" to pixels.`, 'success');
  },

  flattenDocument: () => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const flatCanvas = compositeLayersToCanvas(
          doc.width,
          doc.height,
          doc.backgroundColor,
          doc.layers,
          doc.adjustments
        );
        const flatLayer: RasterLayer = {
          id: makeId('layer'),
          name: 'Flattened Image',
          type: 'raster',
          visible: true,
          locked: false,
          opacity: 100,
          blendMode: 'normal',
          x: 0,
          y: 0,
          width: doc.width,
          height: doc.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          canvas: flatCanvas,
        };
        return {
          ...doc,
          layers: [flatLayer],
          activeLayerId: flatLayer.id,
          editingTarget: 'layer',
          adjustments: cloneDefaultAdjustments(),
        };
      },
      'Flatten Image'
    );
  },

  alignActiveLayer: (alignment) => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc || !doc.activeLayerId) return;
    const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!layer || layer.locked || layer.type === 'group' || layer.type === 'adjustment') return;
    const w = layer.width * layer.scaleX;
    const h = layer.height * layer.scaleY;

    let x = layer.x;
    let y = layer.y;
    if (alignment === 'left') x = 0;
    if (alignment === 'center-h') x = Math.round((doc.width - w) / 2);
    if (alignment === 'right') x = Math.round(doc.width - w);
    if (alignment === 'top') y = 0;
    if (alignment === 'center-v') y = Math.round((doc.height - h) / 2);
    if (alignment === 'bottom') y = Math.round(doc.height - h);

    get().updateLayer(layer.id, { x, y }, 'Align Layer');
  },

  commitCanvasMutation: (label) => {
    withActiveDocMutation(get, set, (doc) => ({ ...doc }), label);
  },

  copyActiveLayer: () => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!layer) return;

    const clonedMask = cloneLayerMask(layer.mask);
    const clonedEffects = cloneLayerEffects(layer.effects);
    const cloned: Layer =
      layer.type === 'raster'
        ? { ...layer, canvas: cloneCanvas(layer.canvas), mask: clonedMask, effects: clonedEffects }
        : { ...layer, mask: clonedMask, effects: clonedEffects };
    set({ clipboardLayer: cloned, preferInternalClipboard: true });
    get().showToast(`Copied "${layer.name}"`, 'info');
  },

  copyMergedToClipboard: () => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc) return;
    const flat = compositeLayersToCanvas(
      doc.width,
      doc.height,
      doc.backgroundColor,
      doc.layers,
      doc.adjustments
    );
    let clipCanvas = flat;
    let clipX = 0;
    let clipY = 0;
    let clipW = doc.width;
    let clipH = doc.height;

    if (doc.selection) {
      const maskBuf = rasterizeSelectionToMaskBuffer(doc.selection, doc.width, doc.height);
      const extracted = extractSelectionFromCanvas(flat, maskBuf, doc.width, doc.height);
      if (!extracted) {
        get().showToast('Selection is empty.', 'info');
        return;
      }
      clipCanvas = extracted.canvas;
      clipX = extracted.x;
      clipY = extracted.y;
      clipW = extracted.width;
      clipH = extracted.height;
    }

    const mergedLayer: RasterLayer = {
      id: makeId('layer'),
      name: `${doc.name} Merged`,
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'normal',
      x: clipX,
      y: clipY,
      width: clipW,
      height: clipH,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      canvas: clipCanvas,
    };
    set({ clipboardLayer: mergedLayer, preferInternalClipboard: true });
    // Also hand the pixels to the OS clipboard so they can be pasted into other apps.
    // Best effort: unsupported browsers and denied permissions keep the in-app copy.
    const toast = get().showToast;
    void writeCanvasToSystemClipboard(clipCanvas).then((ok) =>
      toast(ok ? 'Copied merged composite to clipboard' : 'Copied merged composite', 'info')
    );
  },

  cutActiveLayer: () => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc || doc.layers.length <= 1) {
      get().copyActiveLayer();
      return;
    }
    const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!layer || layer.locked) return;
    get().copyActiveLayer();
    get().deleteLayer(layer.id);
  },

  pasteClipboard: () => {
    const clip = get().clipboardLayer;
    if (!clip) return;
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const clonedMask = cloneLayerMask(clip.mask);
        const clonedEffects = cloneLayerEffects(clip.effects);
        const pasted: Layer =
          clip.type === 'raster'
            ? {
                ...clip,
                id: makeId('layer'),
                name: `${clip.name} Pasted`,
                x: clip.x + 20,
                y: clip.y + 20,
                canvas: cloneCanvas(clip.canvas),
                mask: clonedMask,
                effects: clonedEffects,
              }
            : clip.type === 'adjustment'
              ? {
                  ...clip,
                  id: makeId('adjustment'),
                  name: `${clip.name} Pasted`,
                  adjustments: cloneAdjustments(clip.adjustments),
                  mask: clonedMask,
                  effects: clonedEffects,
                }
              : clip.type === 'group'
              ? {
                  ...clip,
                  id: makeId('group'),
                  name: `${clip.name} Pasted`,
                  mask: clonedMask,
                  effects: clonedEffects,
                }
              : {
                  ...clip,
                  id: makeId(clip.type),
                  name: `${clip.name} Pasted`,
                  x: clip.x + 20,
                  y: clip.y + 20,
                  mask: clonedMask,
                  effects: clonedEffects,
                };
        return {
          ...doc,
          layers: [...doc.layers, pasted],
          activeLayerId: pasted.id,
          editingTarget: 'layer',
        };
      },
      'Paste Layer'
    );
  },

  setPreferInternalClipboard: (value) => set({ preferInternalClipboard: value }),

  resizeActiveDocument: (newWidth, newHeight) => {
    const w = Math.max(1, Math.min(8192, Math.round(newWidth)));
    const h = Math.max(1, Math.min(8192, Math.round(newHeight)));
    withActiveDocMutation(
      get,
      set,
      (doc) => ({
        ...doc,
        width: w,
        height: h,
        layers: resizeLayers(doc.layers, doc.width, doc.height, w, h),
        selection: null,
      }),
      `Resize (${w}×${h})`
    );
    set((s) => ({ fitTrigger: s.fitTrigger + 1 }));
  },

  canvasSizeActiveDocument: (newWidth, newHeight, anchor, extensionColor = 'transparent') => {
    const w = Math.max(1, Math.min(8192, Math.round(newWidth)));
    const h = Math.max(1, Math.min(8192, Math.round(newHeight)));
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const nextLayers = canvasSizeLayers(doc.layers, doc.width, doc.height, w, h, anchor);
        if (extensionColor && extensionColor !== 'transparent') {
          const bgCanvas = createCanvas(w, h);
          const ctx = bgCanvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = extensionColor;
            ctx.fillRect(0, 0, w, h);
          }
          const matteLayer: RasterLayer = {
            id: makeId('layer'),
            name: 'Canvas Fill',
            type: 'raster',
            visible: true,
            locked: false,
            opacity: 100,
            blendMode: 'normal',
            x: 0,
            y: 0,
            width: w,
            height: h,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            canvas: bgCanvas,
          };
          nextLayers.unshift(matteLayer);
        }
        return {
          ...doc,
          width: w,
          height: h,
          layers: nextLayers,
          selection: null,
        };
      },
      `Canvas Size (${w}×${h})`
    );
    set((s) => ({ fitTrigger: s.fitTrigger + 1 }));
  },

  trimTransparentPixels: () => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc) return;
    const bounds = computeTrimTransparentBounds(
      doc.width,
      doc.height,
      doc.backgroundColor,
      doc.layers,
      doc.adjustments
    );
    if (!bounds) {
      get().showToast('No transparent border pixels to trim.', 'info');
      return;
    }
    withActiveDocMutation(
      get,
      set,
      (curr) => ({
        ...curr,
        width: bounds.width,
        height: bounds.height,
        layers: cropLayers(curr.layers, bounds),
        selection: null,
      }),
      `Trim Transparent (${bounds.width}×${bounds.height})`
    );
    set((s) => ({ fitTrigger: s.fitTrigger + 1 }));
    get().showToast(`Trimmed canvas to ${bounds.width}×${bounds.height} px`, 'success');
  },

  rotateActiveDocument: (degrees) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const rotated = rotateLayers(doc.layers, doc.width, doc.height, degrees);
        return {
          ...doc,
          width: rotated.width,
          height: rotated.height,
          layers: rotated.layers,
          selection: null,
        };
      },
      `Rotate ${degrees === -90 ? '90° CCW' : degrees === 90 ? '90° CW' : '180°'}`
    );
    set((s) => ({ fitTrigger: s.fitTrigger + 1 }));
  },

  flipActiveDocument: (direction) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => ({
        ...doc,
        layers: flipLayers(doc.layers, doc.width, doc.height, direction),
        selection: null,
      }),
      `Flip ${direction === 'horizontal' ? 'Horizontal' : 'Vertical'}`
    );
  },

  updateAdjustments: (patch, commitLabel) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => withTargetAdjustments(doc, { ...getTargetAdjustments(doc), ...patch }),
      commitLabel
    );
  },

  updateLevels: (patch, commitLabel) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const adj = getTargetAdjustments(doc);
        return withTargetAdjustments(doc, {
          ...adj,
          levels: { ...(adj.levels ?? DEFAULT_LEVELS), ...patch },
        });
      },
      commitLabel
    );
  },

  updateCurves: (channel, points, commitLabel) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const adj = getTargetAdjustments(doc);
        const prevCurves = adj.curves ?? cloneDefaultAdjustments().curves!;
        return withTargetAdjustments(doc, {
          ...adj,
          curves: {
            ...prevCurves,
            [channel]: points.map((p) => ({ ...p })),
          },
        });
      },
      commitLabel
    );
  },

  updateFilters: (patch, commitLabel) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const adj = getTargetAdjustments(doc);
        return withTargetAdjustments(doc, {
          ...adj,
          filters: { ...(adj.filters ?? DEFAULT_FILTERS), ...patch },
        });
      },
      commitLabel
    );
  },

  updateHslBand: (band, patch, commitLabel) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const adj = getTargetAdjustments(doc);
        const prevHsl = adj.hsl ?? createDefaultHslMixer();
        return withTargetAdjustments(doc, {
          ...adj,
          hsl: {
            ...prevHsl,
            [band]: { ...prevHsl[band], ...patch },
          },
        });
      },
      commitLabel
    );
  },

  resetHslMixer: () => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const adj = getTargetAdjustments(doc);
        return withTargetAdjustments(doc, {
          ...adj,
          hsl: createDefaultHslMixer(),
        });
      },
      'Reset HSL Color Mixer'
    );
  },

  updateGradientMap: (patch, commitLabel) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const adj = getTargetAdjustments(doc);
        return withTargetAdjustments(doc, {
          ...adj,
          gradientMap: { ...(adj.gradientMap ?? DEFAULT_GRADIENT_MAP), ...patch },
        });
      },
      commitLabel
    );
  },

  applyAutoLevelsToLayer: () => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!layer || layer.locked || layer.type !== 'raster') {
      get().showToast('Select an unlocked raster layer to apply Auto Levels.', 'info');
      return;
    }
    const ok = applyPixelFilterToCanvas({
      targetCanvas: layer.canvas,
      transform: (data) => autoLevelsBuffer(data, 0.5),
      selection: doc.selection,
      offsetX: layer.x,
      offsetY: layer.y,
      scaleX: layer.scaleX,
      scaleY: layer.scaleY,
    });
    if (ok) {
      get().commitCanvasMutation('Auto Levels');
      get().showToast('Applied Auto Levels to active layer.', 'success');
    }
  },

  applyAutoContrastToLayer: () => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!layer || layer.locked || layer.type !== 'raster') {
      get().showToast('Select an unlocked raster layer to apply Auto Contrast.', 'info');
      return;
    }
    const ok = applyPixelFilterToCanvas({
      targetCanvas: layer.canvas,
      transform: (data) => autoContrastBuffer(data, 0.5),
      selection: doc.selection,
      offsetX: layer.x,
      offsetY: layer.y,
      scaleX: layer.scaleX,
      scaleY: layer.scaleY,
    });
    if (ok) {
      get().commitCanvasMutation('Auto Contrast');
      get().showToast('Applied Auto Contrast to active layer.', 'success');
    }
  },

  applyGalleryFilterToLayer: (params) => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!layer || layer.locked || layer.type !== 'raster') {
      get().showToast('Select an unlocked raster layer to apply filters.', 'info');
      return;
    }
    const labelMap: Record<FilterGalleryKind, string> = {
      'high-pass': 'High Pass',
      'motion-blur': 'Motion Blur',
      'oil-paint': 'Oil Paint',
      halftone: 'Halftone',
      emboss: 'Emboss',
      'edge-detect': 'Edge Detect',
    };
    const ok = applyPixelFilterToCanvas({
      targetCanvas: layer.canvas,
      transform: (data, w, h) => applyGalleryFilterBuffer(data, w, h, params),
      selection: doc.selection,
      offsetX: layer.x,
      offsetY: layer.y,
      scaleX: layer.scaleX,
      scaleY: layer.scaleY,
    });
    if (ok) {
      get().commitCanvasMutation(`Filter: ${labelMap[params.kind]}`);
      get().showToast(`Applied ${labelMap[params.kind]} filter.`, 'success');
    }
  },

  applyPerspectiveToActiveLayer: (dstCorners) => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!layer || layer.locked || layer.type !== 'raster') {
      get().showToast('Select an unlocked raster layer to transform perspective.', 'info');
      return;
    }
    const warped = warpCanvasPerspective(layer.canvas, dstCorners);
    withActiveDocMutation(
      get,
      set,
      (curr) => ({
        ...curr,
        layers: curr.layers.map((l) =>
          l.id === layer.id && l.type === 'raster' ? { ...l, canvas: warped } : l
        ),
        selection: null,
      }),
      'Perspective Transform'
    );
    set((s) => ({ liveCanvasTick: s.liveCanvasTick + 1 }));
    get().showToast('Applied perspective warp to active layer.', 'success');
  },

  resetLevelsAndCurves: () => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const fresh = cloneDefaultAdjustments();
        return withTargetAdjustments(doc, {
          ...getTargetAdjustments(doc),
          levels: fresh.levels,
          curves: fresh.curves,
        });
      },
      'Reset Levels & Curves'
    );
  },

  resetFilters: () => {
    withActiveDocMutation(
      get,
      set,
      (doc) =>
        withTargetAdjustments(doc, {
          ...getTargetAdjustments(doc),
          filters: { ...DEFAULT_FILTERS },
        }),
      'Reset Filters'
    );
  },

  addAdjustmentLayer: (name) => {
    withActiveDocMutation(
      get,
      set,
      (doc) => {
        const active = doc.layers.find((l) => l.id === doc.activeLayerId);
        const layer: AdjustmentLayer = {
          id: makeId('adjustment'),
          name: name || nextNumberedName(doc.layers, 'Adjustment'),
          type: 'adjustment',
          visible: true,
          locked: false,
          opacity: 100,
          blendMode: 'normal',
          x: 0,
          y: 0,
          width: doc.width,
          height: doc.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          parentId: active ? (active.type === 'group' ? active.id : (active.parentId ?? null)) : null,
          adjustments: cloneDefaultAdjustments(),
        };
        // Insert directly above the active layer (or on top), so it affects what is beneath it.
        const idx = active ? doc.layers.findIndex((l) => l.id === active.id) : -1;
        const layers = [...doc.layers];
        layers.splice(idx >= 0 && active?.type !== 'group' ? idx + 1 : layers.length, 0, layer);
        return { ...doc, layers, activeLayerId: layer.id, editingTarget: 'layer' };
      },
      'New Adjustment Layer'
    );
    get().showToast('Adjustment layer added. Use the Adjustments panel to edit it.', 'success');
  },

  commitAdjustmentsHistory: (label = 'Color Adjustment') => {
    withActiveDocMutation(get, set, (doc) => ({ ...doc }), label);
  },

  applyAutoEnhance: () => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc) return;
    const base = compositeLayersToCanvas(
      doc.width,
      doc.height,
      doc.backgroundColor,
      doc.layers
    );
    const autoAdj = computeAutoEnhanceAdjustments(base);
    withActiveDocMutation(
      get,
      set,
      (curr) => {
        const adj = getTargetAdjustments(curr);
        return withTargetAdjustments(curr, {
          ...cloneAdjustments(adj),
          ...autoAdj,
          levels: adj.levels ?? { ...DEFAULT_LEVELS },
          curves: adj.curves ?? cloneDefaultAdjustments().curves,
          filters: adj.filters ?? { ...DEFAULT_FILTERS },
        });
      },
      'Auto Balance'
    );
    get().showToast('Applied local histogram Auto Balance.', 'success');
  },

  resetAdjustments: () => {
    withActiveDocMutation(
      get,
      set,
      (doc) => withTargetAdjustments(doc, cloneDefaultAdjustments()),
      'Reset Adjustments'
    );
  },

  undo: () => {
    const state = get();
    const idx = state.documents.findIndex((d) => d.id === state.activeDocumentId);
    if (idx === -1) return;
    const doc = state.documents[idx];
    if (doc.historyIndex <= 0) return;

    const targetIndex = doc.historyIndex - 1;
    const snap = doc.history[targetIndex];
    const restoredLayers = restoreLayersFromSnapshot(snap.layers);
    const activeLayer = restoredLayers.find((l) => l.id === snap.activeLayerId);
    const nextDoc: DocumentState = {
      ...doc,
      width: snap.width,
      height: snap.height,
      adjustments: cloneAdjustments(snap.adjustments),
      layers: restoredLayers,
      activeLayerId: snap.activeLayerId,
      editingTarget: doc.editingTarget === 'mask' && activeLayer?.mask ? 'mask' : 'layer',
      historyIndex: targetIndex,
      selection: null,
      dirty: true,
      updatedAt: Date.now(),
    };
    const nextDocs = [...state.documents];
    nextDocs[idx] = nextDoc;
    set({ documents: nextDocs, cropRect: null, cropStraighten: 0 });
    scheduleAutosave(nextDoc.id, get, set);
  },

  redo: () => {
    const state = get();
    const idx = state.documents.findIndex((d) => d.id === state.activeDocumentId);
    if (idx === -1) return;
    const doc = state.documents[idx];
    if (doc.historyIndex >= doc.history.length - 1) return;

    const targetIndex = doc.historyIndex + 1;
    const snap = doc.history[targetIndex];
    const restoredLayers = restoreLayersFromSnapshot(snap.layers);
    const activeLayer = restoredLayers.find((l) => l.id === snap.activeLayerId);
    const nextDoc: DocumentState = {
      ...doc,
      width: snap.width,
      height: snap.height,
      adjustments: cloneAdjustments(snap.adjustments),
      layers: restoredLayers,
      activeLayerId: snap.activeLayerId,
      editingTarget: doc.editingTarget === 'mask' && activeLayer?.mask ? 'mask' : 'layer',
      historyIndex: targetIndex,
      selection: null,
      dirty: true,
      updatedAt: Date.now(),
    };
    const nextDocs = [...state.documents];
    nextDocs[idx] = nextDoc;
    set({ documents: nextDocs, cropRect: null, cropStraighten: 0 });
    scheduleAutosave(nextDoc.id, get, set);
  },

  jumpToHistory: (targetIndex) => {
    const state = get();
    const idx = state.documents.findIndex((d) => d.id === state.activeDocumentId);
    if (idx === -1) return;
    const doc = state.documents[idx];
    if (targetIndex < 0 || targetIndex >= doc.history.length || targetIndex === doc.historyIndex) {
      return;
    }

    const snap = doc.history[targetIndex];
    const restoredLayers = restoreLayersFromSnapshot(snap.layers);
    const activeLayer = restoredLayers.find((l) => l.id === snap.activeLayerId);
    const nextDoc: DocumentState = {
      ...doc,
      width: snap.width,
      height: snap.height,
      adjustments: cloneAdjustments(snap.adjustments),
      layers: restoredLayers,
      activeLayerId: snap.activeLayerId,
      editingTarget: doc.editingTarget === 'mask' && activeLayer?.mask ? 'mask' : 'layer',
      historyIndex: targetIndex,
      selection: null,
      dirty: true,
      updatedAt: Date.now(),
    };
    const nextDocs = [...state.documents];
    nextDocs[idx] = nextDoc;
    set({ documents: nextDocs, cropRect: null, cropStraighten: 0 });
    scheduleAutosave(nextDoc.id, get, set);
  },

  saveActiveDocumentNow: async () => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc) return;
    set({ saveStatus: 'saving' });
    const meta = await saveProjectToIndexedDb(doc);
    if (meta) {
      const recents = await listRecentProjectsFromIndexedDb();
      set((s) => ({
        recentProjects: recents,
        saveStatus: 'saved',
        documents: s.documents.map((d) => (d.id === doc.id ? { ...d, dirty: false } : d)),
      }));
      get().showToast(`Saved "${doc.name}" to local IndexedDB storage.`, 'success');
    } else {
      set({ saveStatus: 'idle' });
      get().showToast('Unable to write to browser IndexedDB storage.', 'error');
    }
  },

  saveProjectFileAs: async () => {
    const doc = get().documents.find((d) => d.id === get().activeDocumentId);
    if (!doc) return;
    const serialized = serializeDocument(doc);
    const json = JSON.stringify(serialized, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const safeName = doc.name.replace(/[^a-z0-9_\- ]/gi, '_').trim() || 'project';
    const saved = await saveBlobLocally(
      blob,
      `${safeName}.lps`,
      'GStudio Project (.lps)',
      'application/json',
      '.lps'
    );
    if (saved) {
      await get().saveActiveDocumentNow();
      get().showToast(`Saved "${safeName}.lps" locally.`, 'success');
    }
  },

  toggleInspectorPanel: (panel) =>
    set((s) => ({
      inspectorOpen: { ...s.inspectorOpen, [panel]: !s.inspectorOpen[panel] },
    })),

  setInspectorWidth: (width) =>
    set({ inspectorWidth: Math.max(250, Math.min(420, Math.round(width))) }),

  openModal: (modal) =>
    set((s) => ({ modals: { ...s.modals, [modal]: true } })),

  openFilterGallery: (kind) =>
    set((s) => ({
      filterGalleryKind: kind ?? s.filterGalleryKind,
      modals: { ...s.modals, filterGallery: true },
    })),

  setFilterGalleryKind: (kind) => set({ filterGalleryKind: kind }),

  closeModal: (modal) =>
    set((s) => ({ modals: { ...s.modals, [modal]: false } })),

  setEditingTextLayerId: (id) =>
    set((s) => ({ modals: { ...s.modals, editingTextLayerId: id } })),

  showToast: (message, kind = 'info') => {
    const id = Date.now();
    set({ toast: { id, message, kind } });
    window.setTimeout(() => {
      if (get().toast?.id === id) {
        set({ toast: null });
      }
    }, 3400);
  },

  clearToast: () => set({ toast: null }),
}));
