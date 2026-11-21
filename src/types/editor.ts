export type ToolId =
  | 'move'
  | 'marquee-rect'
  | 'marquee-ellipse'
  | 'lasso'
  | 'magic-wand'
  | 'crop'
  | 'brush'
  | 'eraser'
  | 'bucket'
  | 'gradient'
  | 'clone-stamp'
  | 'spot-heal'
  | 'text'
  | 'shape'
  | 'eyedropper'
  | 'hand'
  | 'zoom';

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'soft-light'
  | 'hard-light'
  | 'difference'
  | 'exclusion';

export type ShapeKind = 'rect' | 'rounded-rect' | 'ellipse' | 'line';

export type LayerType = 'raster' | 'text' | 'shape' | 'group';

export interface LayerMask {
  canvas: HTMLCanvasElement;
  enabled: boolean;
  inverted: boolean;
}

export interface DropShadowEffect {
  enabled: boolean;
  color: string;
  opacity: number; // 0..100
  blur: number; // 0..64
  distance: number; // 0..80
  angle: number; // -180..180 degrees
}

export interface OuterGlowEffect {
  enabled: boolean;
  color: string;
  opacity: number; // 0..100
  blur: number; // 0..64
  spread: number; // 0..24
}

export interface StrokeEffect {
  enabled: boolean;
  color: string;
  opacity: number; // 0..100
  width: number; // 1..40 px
  position: 'outside' | 'inside';
}

export interface ColorOverlayEffect {
  enabled: boolean;
  color: string;
  opacity: number; // 0..100
  blendMode: BlendMode;
}

export interface InnerShadowEffect {
  enabled: boolean;
  color: string;
  opacity: number; // 0..100
  blur: number; // 0..64
  distance: number; // 0..80
  angle: number; // -180..180 degrees
}

export interface InnerGlowEffect {
  enabled: boolean;
  color: string;
  opacity: number; // 0..100
  blur: number; // 0..64
  spread: number; // 0..24
}

export interface LayerEffects {
  dropShadow: DropShadowEffect;
  outerGlow: OuterGlowEffect;
  stroke: StrokeEffect;
  colorOverlay: ColorOverlayEffect;
  innerShadow: InnerShadowEffect;
  innerGlow: InnerGlowEffect;
}

export interface BaseLayer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0 to 100
  blendMode: BlendMode;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
  scaleX: number;
  scaleY: number;
  flipX?: boolean;
  flipY?: boolean;
  effects?: LayerEffects | null;
  parentId?: string | null;
  mask?: LayerMask | null;
}

export interface RasterLayer extends BaseLayer {
  type: 'raster';
  canvas: HTMLCanvasElement;
}

export interface TextLayer extends BaseLayer {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: '400' | '500' | '600' | '700';
  fontStyle: 'normal' | 'italic';
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
}

export interface ShapeLayer extends BaseLayer {
  type: 'shape';
  shapeKind: ShapeKind;
  fill: string;
  fillEnabled: boolean;
  stroke: string;
  strokeEnabled: boolean;
  strokeWidth: number;
  cornerRadius: number;
}

export interface GroupLayer extends BaseLayer {
  type: 'group';
  expanded: boolean;
}

export type Layer = RasterLayer | TextLayer | ShapeLayer | GroupLayer;

export interface CurvePoint {
  x: number; // 0..255
  y: number; // 0..255
}

export interface CurvesConfig {
  rgb: CurvePoint[];
  r: CurvePoint[];
  g: CurvePoint[];
  b: CurvePoint[];
}

export interface LevelsConfig {
  black: number; // 0..253
  gamma: number; // 0.1..4.0
  white: number; // 2..255
  outBlack: number; // 0..255
  outWhite: number; // 0..255
}

export interface FiltersConfig {
  blur: number; // 0..35 px
  vignette: number; // -100..100
  vignetteMidpoint: number; // 15..90 %
  noise: number; // 0..100
  pixelate: number; // 1..48 px (1 = off)
  /** Edge-preserving noise reduction, 0..100. Optional: older saved projects omit it. */
  denoise?: number;
}

export interface Adjustments {
  brightness: number; // -100..100
  contrast: number; // -100..100
  exposure: number; // -2.0..2.0
  saturation: number; // -100..100
  hue: number; // -180..180
  temperature: number; // -100..100
  tint: number; // -100..100
  highlights: number; // -100..100
  shadows: number; // -100..100
  sharpness: number; // 0..100
  grayscale: boolean;
  sepia: boolean;
  levels?: LevelsConfig;
  curves?: CurvesConfig;
  filters?: FiltersConfig;
}

export interface SelectionPoint {
  x: number;
  y: number;
}

export interface SelectionState {
  kind: 'rect' | 'ellipse' | 'polygon' | 'mask';
  x: number;
  y: number;
  width: number;
  height: number;
  points?: SelectionPoint[];
  maskData?: Uint8Array;
  maskWidth?: number;
  maskHeight?: number;
  inverted?: boolean;
}

export interface SnapGuide {
  orientation: 'v' | 'h';
  pos: number;
  kind: 'center' | 'edge' | 'sibling';
}

export type ExportFitMode = 'contain' | 'cover' | 'stretch';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HistoryLayerSnapshot {
  base: BaseLayer;
  maskCanvas?: HTMLCanvasElement;
  maskEnabled?: boolean;
  maskInverted?: boolean;
  rasterCanvas?: HTMLCanvasElement;
  textData?: Omit<TextLayer, keyof BaseLayer>;
  shapeData?: Omit<ShapeLayer, keyof BaseLayer>;
  groupExpanded?: boolean;
}

export interface HistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  width: number;
  height: number;
  adjustments: Adjustments;
  layers: HistoryLayerSnapshot[];
  activeLayerId: string | null;
}

export interface DocumentState {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: string; // 'transparent' | hex
  layers: Layer[];
  activeLayerId: string | null;
  editingTarget: 'layer' | 'mask';
  adjustments: Adjustments;
  selection: SelectionState | null;
  zoom: number;
  panX: number;
  panY: number;
  history: HistoryEntry[];
  historyIndex: number;
  dirty: boolean;
  createdAt: number;
  updatedAt: number;
  sourceFormat: string;
  fileSizeBytes?: number;
  fileHandleName?: string;
}

export interface ToolOptions {
  brushSize: number;
  brushHardness: number; // 0..100
  brushOpacity: number; // 1..100
  eraserSize: number;
  eraserHardness: number;
  eraserOpacity: number;
  bucketTolerance: number; // 0..255
  lassoMode: 'freehand' | 'polygon';
  wandTolerance: number; // 0..128
  wandContiguous: boolean;
  gradientKind: 'linear' | 'radial';
  gradientStyle: 'fg-bg' | 'fg-transparent';
  gradientOpacity: number; // 1..100
  cloneSize: number;
  cloneHardness: number; // 0..100
  cloneOpacity: number; // 1..100
  cloneAligned: boolean;
  cloneSampleAllLayers: boolean;
  healSize: number;
  healHardness: number; // 0..100
  snapToGuides: boolean;
  moveAutoSelect: boolean;
  cropAspect: 'free' | '1:1' | '4:3' | '16:9' | '3:2' | '4:5' | 'custom';
  /** Width ÷ height used when cropAspect is 'custom'. */
  cropCustomRatio: number;
  shapeKind: ShapeKind;
  shapeFill: string;
  shapeFillEnabled: boolean;
  shapeStroke: string;
  shapeStrokeEnabled: boolean;
  shapeStrokeWidth: number;
  shapeCornerRadius: number;
  textFontFamily: string;
  textFontSize: number;
  textFontWeight: '400' | '500' | '600' | '700';
  textAlign: 'left' | 'center' | 'right';
}

export interface RecentProjectMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  layerCount: number;
  updatedAt: number;
  thumbnailDataUrl: string;
  sourceFormat: string;
  estimatedBytes: number;
}

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'bmp';

export interface SerializedLayer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  flipX?: boolean;
  flipY?: boolean;
  effects?: LayerEffects | null;
  parentId?: string | null;
  maskDataUrl?: string;
  maskEnabled?: boolean;
  maskInverted?: boolean;
  rasterDataUrl?: string;
  textData?: Omit<TextLayer, keyof BaseLayer>;
  shapeData?: Omit<ShapeLayer, keyof BaseLayer>;
  groupExpanded?: boolean;
}

export interface SerializedProject {
  formatVersion: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  activeLayerId: string | null;
  adjustments: Adjustments;
  layers: SerializedLayer[];
  createdAt: number;
  updatedAt: number;
  sourceFormat: string;
  thumbnailDataUrl: string;
}
