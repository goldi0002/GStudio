import assert from 'node:assert/strict';
import {
  applyAdjustmentsToBuffer,
  applyDenoise,
  buildLevelsLut,
  buildSplineCurveLut,
  cloneAdjustments,
  computeHistogram,
  computeHistogramChannelStats,
  createDefaultHslMixer,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_CURVES,
  DEFAULT_FILTERS,
  DEFAULT_GRADIENT_MAP,
  DEFAULT_LEVELS,
  getTargetAdjustments,
  isDefaultAdjustments,
  isDefaultFilters,
  withTargetAdjustments,
} from './adjustments';
import {
  applyEdgeDetectBuffer,
  applyEmbossBuffer,
  applyHalftoneBuffer,
  applyHighPassBuffer,
  applyMotionBlurBuffer,
  applyOilPaintBuffer,
  autoContrastBuffer,
  autoLevelsBuffer,
} from './filters';
import {
  deletePreset,
  loadPresets,
  MAX_ADJUSTMENT_PRESETS,
  savePreset,
  sanitizeAdjustments,
  type PresetStorage,
} from './presets';
import {
  documentRevision,
  forgetPersistedRevision,
  getPersistedRevision,
  hasUnsavedDocuments,
  isDocumentUnsaved,
  markDocumentPersisted,
  prunePersistedRevisions,
  recordPersistedRevision,
  resetPersistedRevisions,
} from '../persistence/revisionTracker';
import type { DocumentState } from '../types/editor';
import { encodeBMP } from './bmpEncoder';
import { cropRatioFor, fitRatioRect, parseRatio } from './cropRatio';
import {
  blurSharpenBuffer,
  canvasSizeLayers,
  cloneLayerEffects,
  cloneStampBuffer,
  colorReplaceBuffer,
  computeAlphaBoundsFromRgba,
  computeCanvasAnchorOffset,
  computeLayerResizeRect,
  computePolygonBounds,
  computeShadowOffset,
  computeShapePathPoints,
  cropAndStraightenLayers,
  cropLayers,
  computeSnapGuides,
  DEFAULT_LAYER_EFFECTS,
  docPointToLayerLocal,
  dodgeBurnBuffer,
  extractMagicWandMask,
  hashPixels,
  extractSelectionFromBuffer,
  featherMaskBuffer,
  resizeMaskBuffer,
  fillBufferWithMask,
  hexToRgba,
  invertMaskBuffer,
  invertSelectionState,
  isLayerTreeVisible,
  isPointInSelection,
  pickTopmostLayerAtPoint,
  rasterizeSelectionToMaskBuffer,
  redEyeRemovalBuffer,
  rgbaToHex,
  restoreLayersFromSnapshot,
  rotatePointAroundCenter,
  scaleAdjustmentsForSample,
  smudgeBuffer,
  snapRotationAngle,
  snapshotLayers,
  solveHomography,
  spotHealBuffer,
  strokeBufferWithSelectionMask,
  traceSelectionBoundarySegments,
  warpBufferPerspective,
} from './canvasOps';
import type { AdjustmentLayer, GroupLayer, Layer, RasterLayer, ShapeLayer } from '../types/editor';

// 1. Default adjustments identity test
{
  const src = new Uint8ClampedArray([120, 80, 40, 255, 0, 0, 0, 0]);
  const out = applyAdjustmentsToBuffer(src, 2, 1, DEFAULT_ADJUSTMENTS);
  assert.equal(isDefaultAdjustments(DEFAULT_ADJUSTMENTS), true);
  assert.deepEqual(Array.from(out), Array.from(src), 'Default adjustments should preserve exact pixel values');
}

// 2. Brightness & Alpha preservation test
{
  const src = new Uint8ClampedArray([100, 100, 100, 255, 50, 50, 50, 0]);
  const out = applyAdjustmentsToBuffer(src, 2, 1, { ...DEFAULT_ADJUSTMENTS, brightness: 50 });
  assert.ok(out[0] > 150 && out[1] > 150 && out[2] > 150, 'Positive brightness lifts RGB');
  assert.equal(out[3], 255, 'Opaque alpha preserved');
  assert.equal(out[7], 0, 'Transparent alpha preserved');
}

// 3. Contrast, Exposure, Highlights, Shadows, Temperature, Tint, Saturation, Hue, Sepia, Grayscale
{
  const src = new Uint8ClampedArray([80, 120, 180, 255]);

  const warm = applyAdjustmentsToBuffer(src, 1, 1, { ...DEFAULT_ADJUSTMENTS, temperature: 60 });
  assert.ok(warm[0] > src[0] && warm[2] < src[2], 'Warm temperature boosts red and reduces blue');

  const tint = applyAdjustmentsToBuffer(src, 1, 1, { ...DEFAULT_ADJUSTMENTS, tint: 60 });
  assert.ok(tint[1] < src[1], 'Positive magenta tint reduces green channel');

  const desat = applyAdjustmentsToBuffer(src, 1, 1, { ...DEFAULT_ADJUSTMENTS, saturation: -100 });
  assert.ok(Math.abs(desat[0] - desat[1]) <= 1 && Math.abs(desat[1] - desat[2]) <= 1, 'Full desaturation produces neutral gray');

  const hueRot = applyAdjustmentsToBuffer(src, 1, 1, { ...DEFAULT_ADJUSTMENTS, hue: 120 });
  assert.notDeepEqual(Array.from(hueRot), Array.from(src), 'Hue rotation shifts RGB channels');

  const shadowLift = applyAdjustmentsToBuffer(new Uint8ClampedArray([30, 30, 30, 255]), 1, 1, {
    ...DEFAULT_ADJUSTMENTS,
    shadows: 80,
  });
  assert.ok(shadowLift[0] > 50, 'Positive shadows lifts dark tones');

  const hlRecover = applyAdjustmentsToBuffer(new Uint8ClampedArray([240, 240, 240, 255]), 1, 1, {
    ...DEFAULT_ADJUSTMENTS,
    highlights: -80,
  });
  assert.ok(hlRecover[0] < 220, 'Negative highlights recovers bright tones');

  const gray = applyAdjustmentsToBuffer(new Uint8ClampedArray([200, 60, 20, 255]), 1, 1, {
    ...DEFAULT_ADJUSTMENTS,
    grayscale: true,
  });
  assert.equal(gray[0], gray[1]);
  assert.equal(gray[1], gray[2]);

  const sepia = applyAdjustmentsToBuffer(new Uint8ClampedArray([140, 140, 140, 255]), 1, 1, {
    ...DEFAULT_ADJUSTMENTS,
    sepia: true,
  });
  assert.ok(sepia[0] >= sepia[1] && sepia[1] >= sepia[2], 'Sepia tones warm highlights R >= G >= B');
}

// 4. Exposure +1 EV doubles linear channel response (clamped to 255)
{
  const src = new Uint8ClampedArray([60, 100, 200, 255]);
  const out = applyAdjustmentsToBuffer(src, 1, 1, { ...DEFAULT_ADJUSTMENTS, exposure: 1 });
  assert.equal(out[0], 120);
  assert.equal(out[1], 200);
  assert.equal(out[2], 255);
}

// 5. Sharpness 3x3 edge boost test
{
  const src = new Uint8ClampedArray([
    20, 20, 20, 255, 20, 20, 20, 255, 20, 20, 20, 255,
    20, 20, 20, 255, 140, 140, 140, 255, 20, 20, 20, 255,
    20, 20, 20, 255, 20, 20, 20, 255, 20, 20, 20, 255,
  ]);
  const out = applyAdjustmentsToBuffer(src, 3, 3, { ...DEFAULT_ADJUSTMENTS, sharpness: 100 });
  const centerIdx = (1 * 3 + 1) * 4;
  assert.ok(out[centerIdx] > 140, 'Sharpness accentuates high-frequency center pixel');
}

// 6. BMP 24-bit & 32-bit binary header & bottom-up BGR packing test
{
  const fakeImg = {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 128,
    ]),
  } as ImageData;

  const bmp24 = encodeBMP(fakeImg, false);
  assert.equal(bmp24[0], 0x42);
  assert.equal(bmp24[1], 0x4d);
  assert.equal(bmp24.byteLength, 70);
  assert.equal(bmp24[54], 255);
  assert.equal(bmp24[55], 0);
  assert.equal(bmp24[56], 0);

  const bmp32 = encodeBMP(fakeImg, true);
  assert.equal(bmp32.byteLength, 70);
  assert.equal(bmp32[58], 255);
  assert.equal(bmp32[61], 128);
}

// 7. Color conversion & Selection hit-testing (Rect & Ellipse)
{
  assert.deepEqual(hexToRgba('#0A84FF', 200), [10, 132, 255, 200]);
  assert.equal(rgbaToHex(10, 132, 255), '#0A84FF');

  const rectSel = { kind: 'rect' as const, x: 10, y: 10, width: 100, height: 50 };
  assert.equal(isPointInSelection(50, 30, rectSel), true);
  assert.equal(isPointInSelection(5, 30, rectSel), false);

  const ellipseSel = { kind: 'ellipse' as const, x: 0, y: 0, width: 100, height: 100 };
  assert.equal(isPointInSelection(50, 50, ellipseSel), true);
  assert.equal(isPointInSelection(2, 2, ellipseSel), false); // outside inscribed circle
}

// 8. Spline Curve LUT & Curves Pipeline
{
  const idLut = buildSplineCurveLut([
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ]);
  assert.equal(idLut[0], 0);
  assert.equal(idLut[128], 128);
  assert.equal(idLut[255], 255);

  const liftedLut = buildSplineCurveLut([
    { x: 0, y: 0 },
    { x: 128, y: 185 },
    { x: 255, y: 255 },
  ]);
  assert.equal(liftedLut[128], 185, 'Spline curve passes through control knot');
  assert.ok(liftedLut[64] > 64 && liftedLut[192] > 192, 'Lifted curve boosts neighboring tones monotonically');

  const src = new Uint8ClampedArray([128, 128, 128, 255]);
  const out = applyAdjustmentsToBuffer(src, 1, 1, {
    ...DEFAULT_ADJUSTMENTS,
    curves: {
      ...DEFAULT_CURVES,
      rgb: [
        { x: 0, y: 0 },
        { x: 128, y: 185 },
        { x: 255, y: 255 },
      ],
    },
  });
  assert.equal(out[0], 185);
}

// 9. Levels LUT & Histogram
{
  const lvlLut = buildLevelsLut({
    ...DEFAULT_LEVELS,
    black: 50,
    white: 200,
    gamma: 1,
  });
  assert.equal(lvlLut[40], 0, 'Values below input black clip to 0');
  assert.equal(lvlLut[210], 255, 'Values above input white clip to 255');
  assert.ok(lvlLut[125] >= 126 && lvlLut[125] <= 129, 'Midpoint maps near 128');

  const hist = computeHistogram(
    new Uint8ClampedArray([
      100, 150, 200, 255,
      100, 150, 200, 255,
      0, 0, 0, 0, // transparent pixel ignored
    ])
  );
  assert.equal(hist.r[100], 2);
  assert.equal(hist.g[150], 2);
  assert.equal(hist.b[200], 2);
}

// 10. Non-destructive Filters: Gaussian Blur, Vignette, Noise, Pixelate
{
  // Gaussian Blur diffuses a bright center impulse into neighbors
  const impulse = new Uint8ClampedArray(5 * 5 * 4);
  for (let i = 0; i < impulse.length; i += 4) impulse[i + 3] = 255;
  const mid = (2 * 5 + 2) * 4;
  impulse[mid] = 240;
  impulse[mid + 1] = 240;
  impulse[mid + 2] = 240;
  const blurred = applyAdjustmentsToBuffer(impulse, 5, 5, {
    ...DEFAULT_ADJUSTMENTS,
    filters: { ...DEFAULT_FILTERS, blur: 2 },
  });
  assert.ok(blurred[mid] < 240, 'Blur attenuates isolated impulse peak');
  assert.ok(blurred[(2 * 5 + 1) * 4] > 0, 'Blur spreads energy to adjacent pixels');

  // Pixelate averages each block uniformly
  const blockSrc = new Uint8ClampedArray([
    10, 10, 10, 255, 50, 50, 50, 255,
    10, 10, 10, 255, 50, 50, 50, 255,
  ]);
  const pixOut = applyAdjustmentsToBuffer(blockSrc, 2, 2, {
    ...DEFAULT_ADJUSTMENTS,
    filters: { ...DEFAULT_FILTERS, pixelate: 2 },
  });
  assert.equal(pixOut[0], 30);
  assert.equal(pixOut[4], 30);

  // Vignette darkens outer corners when negative
  const flat = new Uint8ClampedArray(9 * 9 * 4);
  for (let i = 0; i < flat.length; i += 4) {
    flat[i] = 180;
    flat[i + 1] = 180;
    flat[i + 2] = 180;
    flat[i + 3] = 255;
  }
  const vigOut = applyAdjustmentsToBuffer(flat, 9, 9, {
    ...DEFAULT_ADJUSTMENTS,
    filters: { ...DEFAULT_FILTERS, vignette: -80, vignetteMidpoint: 35 },
  });
  assert.ok(vigOut[0] < vigOut[(4 * 9 + 4) * 4], 'Negative vignette darkens corners relative to center');

  // Noise perturbs uniform buffer deterministically
  const noiseOut = applyAdjustmentsToBuffer(flat, 9, 9, {
    ...DEFAULT_ADJUSTMENTS,
    filters: { ...DEFAULT_FILTERS, noise: 50 },
  });
  assert.notEqual(noiseOut[0], noiseOut[4], 'Film noise introduces spatial luminance variation');
}

// 11. Polygon, Mask, and Inverted Selection Hit-Testing & Bounds
{
  const triangle = [
    { x: 10, y: 10 },
    { x: 50, y: 10 },
    { x: 30, y: 50 },
  ];
  const bounds = computePolygonBounds(triangle);
  assert.deepEqual(bounds, { x: 10, y: 10, width: 40, height: 40 });

  const polySel = { kind: 'polygon' as const, ...bounds, points: triangle };
  assert.equal(isPointInSelection(30, 25, polySel), true, 'Point inside polygon');
  assert.equal(isPointInSelection(12, 45, polySel), false, 'Point outside polygon');

  const invPoly = invertSelectionState(polySel, 100, 100);
  assert.equal(invPoly.inverted, true);
  assert.equal(isPointInSelection(30, 25, invPoly), false, 'Inverted polygon excludes interior');
  assert.equal(isPointInSelection(5, 5, invPoly), true, 'Inverted polygon includes exterior');
}

// 12. Magic Wand Mask Extraction (Contiguous vs Global & Tolerance)
{
  // 4x2 RGBA image: two separate blue islands separated by red pixels
  const rgba = new Uint8ClampedArray([
    // row 0: Blue(0,0), Red(1,0), Blue(2,0), NearBlue(3,0)
    10, 20, 220, 255,   220, 20, 20, 255,   10, 20, 220, 255,   22, 30, 210, 255,
    // row 1: Blue(0,1), Red(1,1), Red(2,1), Red(3,1)
    10, 20, 220, 255,   220, 20, 20, 255,   220, 20, 20, 255,   220, 20, 20, 255,
  ]);

  const contig = extractMagicWandMask(rgba, 4, 2, 0, 0, 15, true);
  assert.ok(contig);
  assert.equal(contig.pixelCount, 2, 'Contiguous flood selects only left blue column');
  assert.deepEqual(contig.bounds, { x: 0, y: 0, width: 1, height: 2 });

  const global = extractMagicWandMask(rgba, 4, 2, 0, 0, 15, false);
  assert.ok(global);
  assert.equal(global.pixelCount, 4, 'Global selection captures all blue & near-blue pixels within tolerance');
  assert.deepEqual(global.bounds, { x: 0, y: 0, width: 4, height: 2 });

  const inverted = invertMaskBuffer(contig.maskData, 4, 2);
  assert.equal(inverted.nextMask[0], 0);
  assert.equal(inverted.nextMask[1], 255);
  assert.deepEqual(inverted.bounds, { x: 1, y: 0, width: 3, height: 2 });
}

// 13. Selection Boundary Segment Tracing
{
  // 3x3 mask with single center pixel selected
  const mask = new Uint8Array([
    0, 0, 0,
    0, 255, 0,
    0, 0, 0,
  ]);
  const segs = traceSelectionBoundarySegments(mask, 3, 3);
  assert.equal(segs.length, 4, 'Single isolated pixel emits 4 unit perimeter segments');
}

// 14. Smart Alignment Guides & Edge Snapping
{
  // Active 100x100 layer near canvas center (canvas 800x600 -> center X=400, Y=300; top-left should snap to 350,250)
  const snapCenter = computeSnapGuides(
    { x: 347, y: 253, width: 100, height: 100 },
    800,
    600,
    [],
    6
  );
  assert.equal(snapCenter.dx, 3);
  assert.equal(snapCenter.dy, -3);
  assert.ok(snapCenter.guides.some((g) => g.orientation === 'v' && g.pos === 400 && g.kind === 'center'));
  assert.ok(snapCenter.guides.some((g) => g.orientation === 'h' && g.pos === 300 && g.kind === 'center'));

  // Sibling right-edge alignment & resize edgeMask snapping
  const snapSibling = computeSnapGuides(
    { x: 100, y: 50, width: 97, height: 80 },
    800,
    600,
    [{ x: 200, y: 20, width: 50, height: 50 }],
    6,
    { right: true }
  );
  assert.equal(snapSibling.dx, 3, 'Right edge snaps 197 -> 200 to sibling left edge');
  assert.ok(snapSibling.guides.some((g) => g.orientation === 'v' && g.pos === 200 && g.kind === 'sibling'));
}

// 15. Clone Stamp Pixel Buffer
{
  const w = 8;
  const h = 8;
  const src = new Uint8ClampedArray(w * h * 4);
  const dst = new Uint8ClampedArray(w * h * 4);
  // Paint green block in top-left (1..3, 1..3) of source, red in destination
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      src[idx] = x <= 3 && y <= 3 ? 20 : 200;
      src[idx + 1] = x <= 3 && y <= 3 ? 220 : 40;
      src[idx + 2] = 40;
      src[idx + 3] = 255;

      dst[idx] = 200;
      dst[idx + 1] = 40;
      dst[idx + 2] = 40;
      dst[idx + 3] = 255;
    }
  }

  const changed = cloneStampBuffer({
    targetData: dst,
    targetWidth: w,
    targetHeight: h,
    sourceData: src,
    sourceWidth: w,
    sourceHeight: h,
    dstCenterX: 6,
    dstCenterY: 6,
    srcCenterX: 2,
    srcCenterY: 2,
    radius: 1.5,
    hardness: 1,
    opacity: 1,
  });
  assert.equal(changed, true);
  const clonedIdx = (6 * w + 6) * 4;
  assert.equal(dst[clonedIdx], 20);
  assert.equal(dst[clonedIdx + 1], 220);

  // Selection clipping prevents cloning outside selection
  const untouched = cloneStampBuffer({
    targetData: dst,
    targetWidth: w,
    targetHeight: h,
    sourceData: src,
    sourceWidth: w,
    sourceHeight: h,
    dstCenterX: 5,
    dstCenterY: 2,
    srcCenterX: 2,
    srcCenterY: 2,
    radius: 1.5,
    hardness: 1,
    opacity: 1,
    selection: { kind: 'rect', x: 0, y: 0, width: 2, height: 2 },
  });
  assert.equal(untouched, false);
}

// 16. Spot Healing Ring Interpolation
{
  const w = 15;
  const h = 15;
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      buf[idx] = 100;
      buf[idx + 1] = 150;
      buf[idx + 2] = 190;
      buf[idx + 3] = 255;
    }
  }
  // Place a stark white blemish in center (6..8, 6..8)
  for (let y = 6; y <= 8; y++) {
    for (let x = 6; x <= 8; x++) {
      const idx = (y * w + x) * 4;
      buf[idx] = 255;
      buf[idx + 1] = 255;
      buf[idx + 2] = 255;
    }
  }

  const healed = spotHealBuffer({
    data: buf,
    width: w,
    height: h,
    centerX: 7,
    centerY: 7,
    radius: 2.5,
    hardness: 1,
  });
  assert.equal(healed, true);
  const cIdx = (7 * w + 7) * 4;
  assert.equal(buf[cIdx], 100, 'Spot heal restores surrounding red channel');
  assert.equal(buf[cIdx + 1], 150, 'Spot heal restores surrounding green channel');
  assert.equal(buf[cIdx + 2], 190, 'Spot heal restores surrounding blue channel');
}

// 17. Rotation Geometry, Flip Local Coords, Shadow Offset & Effects Deep Clone
{
  const rot = rotatePointAroundCenter(10, 0, 0, 0, 90);
  assert.ok(Math.abs(rot.x) < 1e-6 && Math.abs(rot.y - 10) < 1e-6, '90° rotation maps (10,0) -> (0,10)');

  assert.equal(snapRotationAngle(14, true), 15);
  assert.equal(snapRotationAngle(-38, true), -45);
  assert.equal(snapRotationAngle(200, false), -160);

  const shadow = computeShadowOffset(10, 90);
  assert.ok(Math.abs(shadow.offsetX) < 1e-6 && Math.abs(shadow.offsetY - 10) < 1e-6);

  const flippedLocal = docPointToLayerLocal(10, 20, {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    flipX: true,
    flipY: false,
  });
  assert.equal(flippedLocal.x, 90, 'Horizontal flip mirrors local X coordinate around center');
  assert.equal(flippedLocal.y, 20);

  const clonedFx = cloneLayerEffects({
    ...DEFAULT_LAYER_EFFECTS,
    dropShadow: { ...DEFAULT_LAYER_EFFECTS.dropShadow, enabled: true, blur: 24 },
  });
  assert.ok(clonedFx);
  assert.equal(clonedFx.dropShadow.enabled, true);
  assert.equal(clonedFx.dropShadow.blur, 24);
  clonedFx.dropShadow.blur = 2;
  assert.equal(DEFAULT_LAYER_EFFECTS.dropShadow.blur, 14, 'Cloned effects do not mutate defaults');
}

// 18. Proportional Corner Resize & Rotated Anchor Geometry
{
  const prop = computeLayerResizeRect({
    handle: 'se',
    dxDoc: 100,
    dyDoc: 20,
    origX: 10,
    origY: 20,
    origW: 200,
    origH: 100,
    origRotation: 0,
    lockAspect: true,
  });
  assert.equal(prop.x, 10);
  assert.equal(prop.y, 20);
  assert.equal(prop.width, 300);
  assert.equal(prop.height, 150, 'Shift-locked corner drag preserves 2:1 aspect ratio');

  const nwProp = computeLayerResizeRect({
    handle: 'nw',
    dxDoc: -50,
    dyDoc: -10,
    origX: 100,
    origY: 100,
    origW: 100,
    origH: 100,
    origRotation: 0,
    lockAspect: true,
  });
  assert.equal(nwProp.x + nwProp.width, 200, 'NW resize anchors SE corner X');
  assert.equal(nwProp.y + nwProp.height, 200, 'NW resize anchors SE corner Y');
  assert.equal(nwProp.width, 150);
  assert.equal(nwProp.height, 150);

  // 90°-rotated layer dragging East handle in rotated local space moves along world +Y
  const rotResize = computeLayerResizeRect({
    handle: 'e',
    dxDoc: 0,
    dyDoc: 40,
    origX: 100,
    origY: 100,
    origW: 100,
    origH: 50,
    origRotation: 90,
    lockAspect: false,
  });
  assert.ok(Math.abs(rotResize.width - 140) < 1e-6, 'World +Y drag expands 90°-rotated width');
  assert.equal(rotResize.height, 50);
}

// 19. Auto-Select Layer Hit-Testing (Visibility, Lock, Group Ancestor & Raster Alpha)
{
  const hiddenGroup: GroupLayer = {
    id: 'grp_hidden',
    name: 'Hidden Group',
    type: 'group',
    visible: false,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    x: 0,
    y: 0,
    width: 400,
    height: 400,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    expanded: true,
  };
  const childInHiddenGroup: ShapeLayer = {
    id: 'shape_hidden',
    name: 'Child Shape',
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    parentId: 'grp_hidden',
    shapeKind: 'rect',
    fill: '#FF0000',
    fillEnabled: true,
    stroke: '#000000',
    strokeEnabled: false,
    strokeWidth: 0,
    cornerRadius: 0,
  };
  const bgLocked: ShapeLayer = {
    id: 'shape_locked',
    name: 'Locked BG',
    type: 'shape',
    visible: true,
    locked: true,
    opacity: 100,
    blendMode: 'normal',
    x: 0,
    y: 0,
    width: 400,
    height: 400,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    shapeKind: 'rect',
    fill: '#FFFFFF',
    fillEnabled: true,
    stroke: '#000000',
    strokeEnabled: false,
    strokeWidth: 0,
    cornerRadius: 0,
  };
  const midShape: ShapeLayer = {
    id: 'shape_mid',
    name: 'Mid Card',
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    x: 50,
    y: 50,
    width: 100,
    height: 100,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    shapeKind: 'rect',
    fill: '#0A84FF',
    fillEnabled: true,
    stroke: '#000000',
    strokeEnabled: false,
    strokeWidth: 0,
    cornerRadius: 0,
  };
  const topSparseRaster = {
    id: 'raster_top',
    name: 'Top Overlay',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    x: 0,
    y: 0,
    width: 400,
    height: 400,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    canvas: {} as HTMLCanvasElement,
  } as RasterLayer;

  const layers: Layer[] = [bgLocked, midShape, hiddenGroup, childInHiddenGroup, topSparseRaster];
  assert.equal(isLayerTreeVisible(childInHiddenGroup, layers), false);

  const hitWithSamplers = (x: number, y: number) =>
    pickTopmostLayerAtPoint(x, y, layers, {
      // Top raster only opaque inside x >= 180 && y >= 180
      sampleRasterAlpha: (_layer, lx, ly) => (lx >= 180 && ly >= 180 ? 255 : 0),
      sampleMaskVisible: () => true,
    });

  assert.equal(hitWithSamplers(100, 100)?.id, 'shape_mid', 'Transparent top raster falls through to Mid Card');
  assert.equal(hitWithSamplers(200, 200)?.id, 'raster_top', 'Opaque top raster pixel selects Top Overlay');
  assert.equal(hitWithSamplers(10, 10), null, 'Locked background is skipped when auto-selecting');
}

// 20. Selection Rasterization, Gaussian-Approx Feathering & 50% Marching Ants Threshold
{
  const w = 16;
  const h = 16;
  const rectSel = { kind: 'rect' as const, x: 4, y: 4, width: 8, height: 8 };
  const rawMask = rasterizeSelectionToMaskBuffer(rectSel, w, h);
  assert.equal(rawMask[0], 0);
  assert.equal(rawMask[7 * w + 7], 255);

  const feathered = featherMaskBuffer(rawMask, w, h, 3);
  assert.ok(feathered.maskData[7 * w + 7] > 200, 'Core remains strong after feather');
  assert.ok(feathered.maskData[3 * w + 7] > 0 && feathered.maskData[3 * w + 7] < 200, 'Edge spreads softly outside original rect');
  assert.ok(feathered.bounds.width > 8 && feathered.bounds.height > 8, 'Feathered bounds expand');

  const noFeather = featherMaskBuffer(rawMask, w, h, 0);
  assert.deepEqual(noFeather.bounds, { x: 4, y: 4, width: 8, height: 8 });

  // Marching ants threshold uses >= 128 so soft low-alpha fringe does not draw outer rings
  const fringe = new Uint8Array([
    40, 40, 40,
    40, 200, 40,
    40, 40, 40,
  ]);
  assert.equal(traceSelectionBoundarySegments(fringe, 3, 3).length, 4);
}

// 21. Selection Buffer Extraction (Layer via Copy Bounds & Alpha Modulation)
{
  const w = 6;
  const h = 6;
  const src = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      src[i] = 30;
      src[i + 1] = 160;
      src[i + 2] = 250;
      src[i + 3] = x >= 2 && y >= 2 ? 200 : 0;
    }
  }
  const mask = new Uint8Array(w * h);
  mask[2 * w + 2] = 255;
  mask[2 * w + 3] = 128;
  mask[1 * w + 1] = 255; // transparent in source, should not inflate tight bounds!

  const extracted = extractSelectionFromBuffer(src, w, h, mask);
  assert.ok(extracted);
  assert.equal(extracted.x, 2);
  assert.equal(extracted.y, 2);
  assert.equal(extracted.width, 2);
  assert.equal(extracted.height, 1);
  assert.equal(extracted.data[3], 200);
  assert.equal(extracted.data[7], Math.round((200 * 128) / 255));
}

// 22. Masked Fill Compositing
{
  const w = 4;
  const h = 2;
  const dst = new Uint8ClampedArray(w * h * 4);
  const mask = new Uint8Array([
    0, 255, 128, 0,
    0, 0, 0, 0,
  ]);
  const changed = fillBufferWithMask({
    targetData: dst,
    targetWidth: w,
    targetHeight: h,
    fillRgba: [200, 100, 50, 255],
    maskData: mask,
    maskWidth: w,
    maskHeight: h,
  });
  assert.equal(changed, true);
  assert.equal(dst[3], 0, 'Unselected pixel remains transparent');
  assert.equal(dst[4], 200);
  assert.equal(dst[7], 255, 'Full mask pixel fills opaquely');
  assert.equal(dst[11], 128, 'Half mask pixel fills at half alpha');
}

{
  // Crop aspect ratios
  assert.equal(cropRatioFor('free', 1.5), null);
  assert.equal(cropRatioFor('16:9', 1.5), 16 / 9);
  assert.equal(cropRatioFor('custom', 2), 2);
  assert.equal(cropRatioFor('custom', NaN), null, 'Invalid custom ratio falls back to free');
  assert.equal(parseRatio('21:9'), 21 / 9);
  assert.equal(parseRatio('4 x 5'), 0.8);
  assert.equal(parseRatio('1.5'), 1.5);
  assert.equal(parseRatio('0:5'), null);
  assert.equal(parseRatio('abc'), null);
  const wide = fitRatioRect(1000, 500, 1, 1000);
  assert.deepEqual(wide, { x: 250, y: 0, width: 500, height: 500 }, 'Square is clamped to height');
  const half = fitRatioRect(1000, 1000, 2, 400);
  assert.deepEqual(half, { x: 300, y: 400, width: 400, height: 200 });
}

{
  // Grow / shrink selection
  const w = 20;
  const h = 20;
  const mask = new Uint8Array(w * h);
  for (let y = 8; y < 12; y++) for (let x = 8; x < 12; x++) mask[y * w + x] = 255; // 4x4 block
  const grown = resizeMaskBuffer(mask, w, h, 2);
  assert.deepEqual(grown.bounds, { x: 6, y: 6, width: 8, height: 8 }, 'Grow adds 2px on each side');
  assert.equal(grown.maskData[7 * w + 7], 255);
  const shrunk = resizeMaskBuffer(grown.maskData, w, h, -2);
  assert.deepEqual(shrunk.bounds, { x: 8, y: 8, width: 4, height: 4 }, 'Shrink undoes grow');
  const gone = resizeMaskBuffer(mask, w, h, -3);
  assert.equal(gone.bounds.width, 0, 'Shrinking past the size empties the mask');
  const edge = new Uint8Array(w * h).fill(255);
  const edgeShrunk = resizeMaskBuffer(edge, w, h, -2);
  assert.deepEqual(
    edgeShrunk.bounds,
    { x: 2, y: 2, width: 16, height: 16 },
    'A full-canvas selection shrinks away from the canvas edge'
  );
  assert.equal(resizeMaskBuffer(mask, w, h, 0).bounds.width, 4, 'Zero delta is a no-op');
}

{
  // Noise reduction smooths flat noise but keeps a hard edge
  const w = 16;
  const h = 16;
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const base = x < 8 ? 40 : 215;
      const n = ((x * 7 + y * 13) % 9) - 4; // deterministic +/-4 noise
      buf[i] = buf[i + 1] = buf[i + 2] = base + n;
      buf[i + 3] = 255;
    }
  }
  const spread = (b: Uint8ClampedArray, x0: number, x1: number) => {
    let lo = 255;
    let hi = 0;
    for (let y = 2; y < h - 2; y++) {
      for (let x = x0; x < x1; x++) {
        const v = b[(y * w + x) * 4];
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    return hi - lo;
  };
  const before = spread(buf, 1, 6);
  const out = new Uint8ClampedArray(buf);
  applyDenoise(out, w, h, 80);
  assert.ok(spread(out, 1, 6) < before, 'Noise in a flat area is reduced');
  assert.ok(out[(8 * w + 9) * 4] > 190 && out[(8 * w + 6) * 4] < 70, 'The hard edge is preserved');
  const same = new Uint8ClampedArray(buf);
  applyDenoise(same, w, h, 0);
  assert.deepEqual(same, buf, 'Amount 0 leaves pixels untouched');
}

// Adjustment layers: targeting, history snapshots and doc transforms
{
  const adjLayer: AdjustmentLayer = {
    id: 'adj1',
    name: 'Adjustment 1',
    type: 'adjustment',
    visible: true,
    locked: false,
    opacity: 60,
    blendMode: 'multiply',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    parentId: null,
    adjustments: { ...cloneAdjustments(DEFAULT_ADJUSTMENTS), saturation: -40 },
  };
  const other: ShapeLayer = {
    id: 's1',
    name: 'Shape',
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    shapeKind: 'rect',
    fill: '#fff',
    fillEnabled: true,
    stroke: '#000',
    strokeEnabled: false,
    strokeWidth: 1,
    cornerRadius: 0,
  };
  const globalAdj = { ...cloneAdjustments(DEFAULT_ADJUSTMENTS), brightness: 10 };
  const docOnAdj = { adjustments: globalAdj, layers: [other, adjLayer], activeLayerId: 'adj1' };
  assert.equal(getTargetAdjustments(docOnAdj).saturation, -40, 'Active adjustment layer is the edit target');
  const docOnShape = { ...docOnAdj, activeLayerId: 's1' };
  assert.equal(getTargetAdjustments(docOnShape).brightness, 10, 'Other layers edit the global stack');

  const edited = withTargetAdjustments(docOnAdj, { ...cloneAdjustments(DEFAULT_ADJUSTMENTS), hue: 30 });
  assert.equal(edited.adjustments.brightness, 10, 'Global stack untouched when editing a layer');
  assert.equal((edited.layers[1] as AdjustmentLayer).adjustments.hue, 30, 'Layer stack updated');
  const editedGlobal = withTargetAdjustments(docOnShape, { ...cloneAdjustments(DEFAULT_ADJUSTMENTS), hue: 5 });
  assert.equal(editedGlobal.adjustments.hue, 5, 'Global stack updated when a normal layer is active');
  assert.equal((editedGlobal.layers[1] as AdjustmentLayer).adjustments.saturation, -40);

  const restored = restoreLayersFromSnapshot(snapshotLayers([other, adjLayer]));
  const back = restored[1] as AdjustmentLayer;
  assert.equal(back.type, 'adjustment');
  assert.equal(back.adjustments.saturation, -40, 'Snapshot round trip keeps adjustments');
  assert.equal(back.opacity, 60);
  assert.equal(back.blendMode, 'multiply');
  assert.notEqual(back.adjustments, adjLayer.adjustments, 'Snapshot clones the adjustments');

  const cropped = cropLayers([adjLayer], { x: 10, y: 10, width: 40, height: 20 })[0];
  assert.equal(cropped.type, 'adjustment');
  assert.equal(cropped.width, 40, 'Crop keeps adjustment layers canvas-sized');
  assert.equal(pickTopmostLayerAtPoint(5, 5, [other, adjLayer])?.id, 's1', 'Adjustment layers are never hit-tested');
}

// ---- Pixel hashing (adjustment layer cache key) ----
{
  const a = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]);
  const b = new Uint8ClampedArray(a);
  assert.equal(hashPixels(a), hashPixels(b), 'Identical pixels hash identically');
  b[5] = 6;
  assert.notEqual(hashPixels(a), hashPixels(b), 'A one-channel change alters the hash');
  const view = new Uint8ClampedArray(new Uint8ClampedArray(16).buffer, 4, 8);
  assert.doesNotThrow(() => hashPixels(view), 'Offset views are supported');
}

// ---- Custom adjustment presets (#18) ----
function makePresetStorage(): PresetStorage & { failWrites: boolean } {
  const data = new Map<string, string>();
  return {
    failWrites: false,
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      if (this.failWrites) throw new Error('quota exceeded');
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

// Presets: save, reload and delete round trip
{
  const storage = makePresetStorage();
  const warm = { ...cloneAdjustments(DEFAULT_ADJUSTMENTS), temperature: 40, contrast: 12 };
  const saved = savePreset(storage, '  Warm Portrait  ', warm);
  assert.ok(saved, 'Preset is saved');
  assert.equal(saved?.name, 'Warm Portrait', 'Name is trimmed');

  const loaded = loadPresets(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].name, 'Warm Portrait');
  assert.equal(loaded[0].adjustments.temperature, 40, 'Adjustment values survive the round trip');
  assert.equal(loaded[0].adjustments.contrast, 12);

  const remaining = deletePreset(storage, loaded[0].id);
  assert.equal(remaining.length, 0, 'Delete removes the preset');
  assert.equal(loadPresets(storage).length, 0);
}

// Presets: empty names and unavailable storage are rejected without throwing
{
  const storage = makePresetStorage();
  assert.equal(savePreset(storage, '   ', DEFAULT_ADJUSTMENTS), null, 'Blank name is rejected');
  assert.equal(savePreset(null, 'Valid', DEFAULT_ADJUSTMENTS), null, 'Missing storage is rejected');
  assert.deepEqual(loadPresets(null), [], 'No storage loads an empty list');
  assert.deepEqual(deletePreset(undefined, 'nope'), [], 'Deleting without storage is safe');
  storage.failWrites = true;
  assert.equal(savePreset(storage, 'No Space', DEFAULT_ADJUSTMENTS), null, 'Write failures return null');
}

// Presets: re-using a name overwrites instead of duplicating
{
  const storage = makePresetStorage();
  savePreset(storage, 'Look', { ...cloneAdjustments(DEFAULT_ADJUSTMENTS), saturation: 10 });
  savePreset(storage, 'look', { ...cloneAdjustments(DEFAULT_ADJUSTMENTS), saturation: 90 });
  const loaded = loadPresets(storage);
  assert.equal(loaded.length, 1, 'Same name keeps one preset');
  assert.equal(loaded[0].adjustments.saturation, 90, 'The newer values win');
}

// Presets: the list is capped at the maximum
{
  const storage = makePresetStorage();
  for (let i = 0; i < MAX_ADJUSTMENT_PRESETS + 5; i += 1) {
    savePreset(storage, `Preset ${i}`, { ...cloneAdjustments(DEFAULT_ADJUSTMENTS), brightness: i });
  }
  const loaded = loadPresets(storage);
  assert.equal(loaded.length, MAX_ADJUSTMENT_PRESETS, 'Only the maximum number of presets is kept');
  assert.equal(
    loaded[loaded.length - 1].adjustments.brightness,
    MAX_ADJUSTMENT_PRESETS - 1,
    'Once full, additional presets are not added'
  );
  assert.equal(
    savePreset(storage, 'One Too Many', DEFAULT_ADJUSTMENTS),
    null,
    'Saving at the limit is rejected'
  );
}

// Presets: corrupt JSON is ignored
{
  const storage = makePresetStorage();
  storage.setItem('gstudio.adjustmentPresets.v1', '{not json');
  assert.deepEqual(loadPresets(storage), [], 'Corrupt JSON loads as an empty list');

  storage.setItem(
    'gstudio.adjustmentPresets.v1',
    JSON.stringify([null, 42, { name: '' }, { name: 'Kept', adjustments: { brightness: 5 } }])
  );
  const loaded = loadPresets(storage);
  assert.equal(loaded.length, 1, 'Invalid entries are dropped');
  assert.equal(loaded[0].name, 'Kept');
  assert.equal(loaded[0].adjustments.brightness, 5);
}

// Presets: sanitizing clamps values and drops unknown keys
{
  const sanitized = sanitizeAdjustments({
    brightness: 999,
    contrast: -999,
    saturation: '25',
    hue: Number.NaN,
    grayscale: 'yes',
    sepia: true,
    evil: 'drop me',
    levels: { black: -5, white: 1000, gamma: 9 },
    curves: {
      rgb: [
        { x: 300, y: -20 },
        { x: 128, y: 128 },
        { x: 255, y: 255 },
      ],
    },
    filters: { blur: 99, vignetteMidpoint: 2, pixelate: 0 },
  });

  assert.equal(sanitized.brightness, 100, 'Positive values are clamped');
  assert.equal(sanitized.contrast, -100, 'Negative values are clamped');
  assert.equal(sanitized.saturation, 25, 'Numeric strings are accepted');
  assert.equal(sanitized.hue, 0, 'NaN falls back to the default');
  assert.equal(sanitized.grayscale, false, 'Non-boolean flags fall back to the default');
  assert.equal(sanitized.sepia, true);
  assert.equal('evil' in sanitized, false, 'Unknown keys are dropped');
  assert.equal(sanitized.levels?.black, 0);
  assert.equal(sanitized.levels?.white, 255);
  assert.equal(sanitized.levels?.gamma, 4);
  assert.equal(sanitized.filters?.blur, 35);
  assert.equal(sanitized.filters?.vignetteMidpoint, 15);
  assert.equal(sanitized.filters?.pixelate, 1);
  assert.equal(sanitized.curves?.rgb.length, 2, 'Duplicate x values are dropped');
  assert.equal(sanitized.curves?.rgb[0].x, 128, 'Curve points are sorted by x');
  assert.equal(sanitized.curves?.rgb[0].y, 128);
  assert.equal(sanitized.curves?.rgb[1].x, 255, 'Out-of-range x is clamped');
  assert.equal(sanitized.curves?.rgb[1].y, 0, 'Out-of-range y is clamped');
}

// Presets: saved data is a copy, not a live reference
{
  const storage = makePresetStorage();
  const adjustments = cloneAdjustments(DEFAULT_ADJUSTMENTS);
  savePreset(storage, 'Copy', adjustments);
  adjustments.brightness = 77;
  adjustments.levels!.gamma = 3;
  const loaded = loadPresets(storage);
  assert.equal(loaded[0].adjustments.brightness, 0, 'Stored preset is independent of the source object');
  assert.equal(loaded[0].adjustments.levels?.gamma, 1);
}

function revisionDoc(id: string, updatedAt: number, dirty: boolean): DocumentState {
  return {
    id,
    updatedAt,
    dirty,
    historyIndex: 0,
    history: [],
  } as unknown as DocumentState;
}

// Unsaved-changes tracking: only persisted revisions count as saved
{
  resetPersistedRevisions();

  assert.equal(
    isDocumentUnsaved(revisionDoc('doc-dirty', 100, true)),
    true,
    'A never-persisted dirty document is unsaved'
  );
  assert.equal(
    isDocumentUnsaved(revisionDoc('doc-clean', 100, false)),
    false,
    'A never-persisted clean document is not warned about'
  );

  const saved = revisionDoc('doc-dirty', 100, true);
  markDocumentPersisted(saved);
  assert.equal(isDocumentUnsaved(saved), false, 'A successful save clears the guard');

  assert.equal(
    isDocumentUnsaved(revisionDoc('doc-dirty', 101, false)),
    true,
    'A newer revision stays unsaved even after the store clears its dirty flag'
  );

  resetPersistedRevisions();
}

// Unsaved-changes tracking: a stale save settling last keeps newer edits unsaved
{
  resetPersistedRevisions();
  const older = revisionDoc('doc-race', 100, false);
  const newer = revisionDoc('doc-race', 200, false);

  recordPersistedRevision('doc-race', documentRevision(newer));
  assert.equal(isDocumentUnsaved(newer), false, 'The newest completed save marks its revision saved');

  recordPersistedRevision('doc-race', documentRevision(older));
  assert.equal(
    isDocumentUnsaved(newer),
    true,
    'A stale autosave finishing after a newer save leaves the newer revision unsaved'
  );

  resetPersistedRevisions();
}

// Unsaved-changes tracking: documents are independent and forgotten on close
{
  resetPersistedRevisions();
  markDocumentPersisted(revisionDoc('doc-a', 10, true));
  markDocumentPersisted(revisionDoc('doc-b', 20, true));

  assert.equal(
    hasUnsavedDocuments([revisionDoc('doc-a', 10, true), revisionDoc('doc-b', 20, true)]),
    false,
    'All persisted documents are clean'
  );
  assert.equal(
    hasUnsavedDocuments([revisionDoc('doc-a', 11, true), revisionDoc('doc-b', 20, true)]),
    true,
    'One modified document is enough to warn'
  );

  prunePersistedRevisions(new Set(['doc-b']));
  assert.equal(getPersistedRevision('doc-a'), undefined, 'A closed document forgets its saved revision');
  assert.equal(getPersistedRevision('doc-b'), '20:0:0', 'Open documents keep their saved revision');
  assert.equal(
    isDocumentUnsaved(revisionDoc('doc-b', 20, true)),
    false,
    'An open, persisted document stays clean'
  );

  forgetPersistedRevision('doc-b');
  assert.equal(
    isDocumentUnsaved(revisionDoc('doc-b', 20, false)),
    false,
    'A reopened, clean document starts without a warning'
  );

  resetPersistedRevisions();
}

// ---- New Color Adjustments & Filters (vibrance, clarity, fade, invert, bloom, posterize) ----
{
  // Vibrance boosts muted tones much more than already saturated colors
  const src = new Uint8ClampedArray([
    150, 120, 120, 255, // muted warm gray
    230, 30, 30, 255, // already highly saturated red
  ]);
  const out = applyAdjustmentsToBuffer(src, 2, 1, {
    ...cloneAdjustments(DEFAULT_ADJUSTMENTS),
    vibrance: 80,
  });
  const mutedSpreadBefore = src[0] - src[1];
  const mutedSpreadAfter = out[0] - out[1];
  const satGainRatio = (out[0] - out[1] - (src[0] - src[1])) / Math.max(1, src[0] - src[1]);
  assert.ok(
    mutedSpreadAfter > mutedSpreadBefore,
    'Positive vibrance increases separation on muted tones'
  );
  assert.ok(satGainRatio > 0.1, 'Muted tone gets noticeable boost from vibrance');
  assert.ok(out[4] >= 220 && out[5] <= 40, 'Already saturated red stays protected');

  // Invert flips RGB and preserves alpha
  const invOut = applyAdjustmentsToBuffer(
    new Uint8ClampedArray([10, 100, 245, 180]),
    1,
    1,
    { ...cloneAdjustments(DEFAULT_ADJUSTMENTS), invert: true }
  );
  assert.deepEqual(Array.from(invOut), [245, 155, 10, 180], 'Invert flips RGB channels and keeps alpha');

  // Matte Fade lifts blacks without clipping whites
  const fadeOut = applyAdjustmentsToBuffer(
    new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
    2,
    1,
    { ...cloneAdjustments(DEFAULT_ADJUSTMENTS), fade: 60 }
  );
  assert.ok(fadeOut[0] > 20 && fadeOut[0] < 120, 'Matte fade lifts pure black');
  assert.equal(fadeOut[4], 255, 'Matte fade preserves white point');

  // Clarity enhances local midtone contrast relative to dark neighbors
  const w = 16;
  const h = 16;
  const grid = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const v = x >= 6 && x <= 9 && y >= 6 && y <= 9 ? 150 : 90;
      grid[idx] = v;
      grid[idx + 1] = v;
      grid[idx + 2] = v;
      grid[idx + 3] = 255;
    }
  }
  const clarityOut = applyAdjustmentsToBuffer(grid, w, h, {
    ...cloneAdjustments(DEFAULT_ADJUSTMENTS),
    clarity: 80,
  });
  const centerIdx = (7 * w + 7) * 4;
  const outerIdx = (1 * w + 1) * 4;
  assert.ok(
    clarityOut[centerIdx] > 150 && clarityOut[outerIdx] <= 90,
    'Positive clarity increases local midtone separation'
  );

  // Posterize quantizes channels cleanly
  const grad = new Uint8ClampedArray([20, 90, 175, 255, 240, 128, 60, 255]);
  const postOut = applyAdjustmentsToBuffer(grad, 2, 1, {
    ...cloneAdjustments(DEFAULT_ADJUSTMENTS),
    filters: { ...DEFAULT_FILTERS, posterize: 2 },
  });
  for (const ch of [postOut[0], postOut[1], postOut[2], postOut[4], postOut[5], postOut[6]]) {
    assert.ok(ch === 0 || ch === 255, `2-level posterize maps to 0 or 255, got ${ch}`);
  }

  // Highlight Bloom spills warm glow from bright pixels onto dark neighbors
  const bloomSrc = new Uint8ClampedArray(9 * 9 * 4);
  for (let i = 0; i < 81; i++) {
    bloomSrc[i * 4 + 3] = 255;
  }
  const bCenter = (4 * 9 + 4) * 4;
  bloomSrc[bCenter] = 255;
  bloomSrc[bCenter + 1] = 255;
  bloomSrc[bCenter + 2] = 255;
  const bloomOut = applyAdjustmentsToBuffer(bloomSrc, 9, 9, {
    ...cloneAdjustments(DEFAULT_ADJUSTMENTS),
    filters: { ...DEFAULT_FILTERS, bloom: 90 },
  });
  const bNeighbor = (4 * 9 + 5) * 4;
  assert.ok(bloomOut[bNeighbor] > 0, 'Highlight bloom radiates glow onto dark neighbor pixels');
}

// Presets: sanitizeAdjustments clamps new fields
{
  const sanitized = sanitizeAdjustments({
    vibrance: 200,
    clarity: -200,
    fade: 150,
    invert: true,
    filters: { bloom: 999, posterize: 1 },
  });
  assert.equal(sanitized.vibrance, 100);
  assert.equal(sanitized.clarity, -100);
  assert.equal(sanitized.fade, 100);
  assert.equal(sanitized.invert, true);
  assert.equal(sanitized.filters?.bloom, 100);
  assert.equal(sanitized.filters?.posterize, 0, 'Posterize < 2 resets to 0 (Off)');
}

// ---- Dodge / Burn / Sponge, Blur / Sharpen, and Smudge buffer engines ----
{
  // Dodge & Burn
  const base = new Uint8ClampedArray(5 * 5 * 4);
  for (let i = 0; i < 25; i++) {
    base[i * 4] = 120;
    base[i * 4 + 1] = 80;
    base[i * 4 + 2] = 80;
    base[i * 4 + 3] = 255;
  }
  const dodged = new Uint8ClampedArray(base);
  const didDodge = dodgeBurnBuffer({
    data: dodged,
    width: 5,
    height: 5,
    centerX: 2,
    centerY: 2,
    radius: 2,
    hardness: 1,
    strength: 0.8,
    mode: 'dodge',
    range: 'midtones',
  });
  assert.equal(didDodge, true);
  const cIdx = (2 * 5 + 2) * 4;
  assert.ok(dodged[cIdx] > 120, 'Dodge lightens targeted pixels');
  assert.equal(dodged[0], 120, 'Corner outside radius remains untouched');

  const burned = new Uint8ClampedArray(base);
  dodgeBurnBuffer({
    data: burned,
    width: 5,
    height: 5,
    centerX: 2,
    centerY: 2,
    radius: 2,
    hardness: 1,
    strength: 0.8,
    mode: 'burn',
    range: 'midtones',
  });
  assert.ok(burned[cIdx] < 120, 'Burn darkens targeted pixels');

  const desat = new Uint8ClampedArray(base);
  dodgeBurnBuffer({
    data: desat,
    width: 5,
    height: 5,
    centerX: 2,
    centerY: 2,
    radius: 2,
    hardness: 1,
    strength: 0.9,
    mode: 'desaturate',
    range: 'midtones',
  });
  assert.ok(
    desat[cIdx] - desat[cIdx + 1] < base[cIdx] - base[cIdx + 1],
    'Desaturate reduces chroma spread'
  );

  // Blur / Sharpen
  const noisy = new Uint8ClampedArray(5 * 5 * 4);
  for (let i = 0; i < 25; i++) {
    const v = i === 12 ? 240 : 40;
    noisy[i * 4] = v;
    noisy[i * 4 + 1] = v;
    noisy[i * 4 + 2] = v;
    noisy[i * 4 + 3] = 255;
  }
  const blurred = new Uint8ClampedArray(noisy);
  const didBlur = blurSharpenBuffer({
    data: blurred,
    width: 5,
    height: 5,
    centerX: 2,
    centerY: 2,
    radius: 2,
    hardness: 1,
    strength: 1,
    mode: 'blur',
  });
  assert.equal(didBlur, true);
  assert.ok(blurred[cIdx] < 240 && blurred[cIdx] > 40, 'Blur softens isolated bright spike');

  // Smudge drags left pigment rightward
  const smudgeBuf = new Uint8ClampedArray(7 * 7 * 4);
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const idx = (y * 7 + x) * 4;
      smudgeBuf[idx] = x <= 2 ? 240 : 20;
      smudgeBuf[idx + 1] = 20;
      smudgeBuf[idx + 2] = 20;
      smudgeBuf[idx + 3] = 255;
    }
  }
  const didSmudge = smudgeBuffer({
    data: smudgeBuf,
    width: 7,
    height: 7,
    prevX: 2,
    prevY: 3,
    currX: 4,
    currY: 3,
    radius: 2,
    hardness: 1,
    strength: 0.9,
  });
  assert.equal(didSmudge, true);
  assert.ok(smudgeBuf[(3 * 7 + 4) * 4] > 20, 'Smudge drags red pigment in stroke direction');
}

// ---- Crop & Straighten preserves vector editability and rotates coordinates ----
{
  const adj: AdjustmentLayer = {
    id: 'a1',
    name: 'Adj',
    type: 'adjustment',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    flipY: false,
    mask: null,
    effects: cloneLayerEffects(DEFAULT_LAYER_EFFECTS),
    adjustments: cloneAdjustments(DEFAULT_ADJUSTMENTS),
  };
  const shape: ShapeLayer = {
    id: 's1',
    name: 'Rect',
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    x: 90,
    y: 40,
    width: 20,
    height: 20,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    flipY: false,
    mask: null,
    effects: cloneLayerEffects(DEFAULT_LAYER_EFFECTS),
    shapeKind: 'rect',
    fill: '#ffffff',
    fillEnabled: true,
    stroke: '#000000',
    strokeEnabled: true,
    strokeWidth: 1,
    cornerRadius: 0,
  };
  const straightened = cropAndStraightenLayers(
    [adj, shape],
    { x: 50, y: 20, width: 100, height: 60 },
    15
  );
  assert.equal(straightened[0].width, 100);
  assert.equal(straightened[0].height, 60);
  const outShape = straightened[1] as ShapeLayer;
  assert.equal(outShape.type, 'shape', 'Vector shape stays non-destructively editable');
  assert.equal(outShape.rotation, 15, 'Straighten angle accumulates on vector layer rotation');
  assert.ok(Math.abs(outShape.x + outShape.width / 2 - 50) < 0.01, 'Centered shape stays centered in crop');
  assert.ok(Math.abs(outShape.y + outShape.height / 2 - 30) < 0.01);
}

// ---- Histogram stats & downsampled filter scaling ----
{
  const pixels = new Uint8ClampedArray([
    0, 0, 0, 255,       // shadow clipped (luma 0)
    100, 100, 100, 255, // midtone (luma 100)
    100, 100, 100, 255, // midtone (luma 100)
    255, 255, 255, 255, // highlight clipped (luma 255)
    10, 20, 30, 0,      // transparent -> ignored
  ]);
  const hist = computeHistogram(pixels);
  assert.equal(hist.totalPixels, 4, 'Only opaque pixels contribute to totalPixels');
  const stats = computeHistogramChannelStats(hist.luma, hist.totalPixels);
  assert.ok(Math.abs(stats.mean - 113.75) < 0.01, 'Computes exact tonal mean');
  assert.equal(stats.median, 100, 'Computes 50th percentile median bin');
  assert.ok(stats.stdDev > 80, 'Computes tonal spread standard deviation');
  assert.equal(stats.shadowClipPct, 25, 'Computes shadow clipping % at bin 0');
  assert.equal(stats.highlightClipPct, 25, 'Computes highlight clipping % at bin 255');

  const emptyStats = computeHistogramChannelStats(new Uint32Array(256), 0);
  assert.equal(emptyStats.mean, 0);
  assert.equal(emptyStats.median, 0);
  assert.equal(emptyStats.shadowClipPct, 0);
  assert.equal(emptyStats.highlightClipPct, 0);

  const scaledAdj = scaleAdjustmentsForSample(
    {
      ...cloneAdjustments(DEFAULT_ADJUSTMENTS),
      filters: { ...DEFAULT_FILTERS, blur: 20, pixelate: 16 },
    },
    0.25
  );
  assert.equal(scaledAdj.filters?.blur, 5, 'Scales blur radius proportionally for preview histogram');
  assert.equal(scaledAdj.filters?.pixelate, 4, 'Scales pixelate block size proportionally');
}

// ---- Canvas size anchor offsets & canvasSizeLayers ----
{
  assert.deepEqual(computeCanvasAnchorOffset(100, 80, 200, 120, 'c'), { dx: 50, dy: 20 });
  assert.deepEqual(computeCanvasAnchorOffset(100, 80, 200, 120, 'nw'), { dx: 0, dy: 0 });
  assert.deepEqual(computeCanvasAnchorOffset(100, 80, 200, 120, 'se'), { dx: 100, dy: 40 });
  assert.deepEqual(computeCanvasAnchorOffset(200, 200, 100, 100, 'c'), { dx: -50, dy: -50 });

  const shape: ShapeLayer = {
    id: 'cs-s1',
    name: 'Star',
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    x: 10,
    y: 20,
    width: 40,
    height: 40,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    flipY: false,
    mask: null,
    effects: cloneLayerEffects(DEFAULT_LAYER_EFFECTS),
    shapeKind: 'star',
    sides: 6,
    fill: '#ffffff',
    fillEnabled: true,
    stroke: '#000000',
    strokeEnabled: false,
    strokeWidth: 2,
    cornerRadius: 0,
  };
  const adj: AdjustmentLayer = {
    id: 'cs-a1',
    name: 'Adj',
    type: 'adjustment',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    flipY: false,
    mask: null,
    effects: cloneLayerEffects(DEFAULT_LAYER_EFFECTS),
    adjustments: cloneAdjustments(DEFAULT_ADJUSTMENTS),
  };
  const grp: GroupLayer = {
    id: 'cs-g1',
    name: 'Group',
    type: 'group',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    flipY: false,
    mask: null,
    effects: cloneLayerEffects(DEFAULT_LAYER_EFFECTS),
    expanded: true,
  };

  const resized = canvasSizeLayers([grp, adj, shape], 100, 80, 200, 140, 'c');
  assert.equal(resized[0].width, 200, 'Group matches new canvas width');
  assert.equal(resized[0].height, 140, 'Group matches new canvas height');
  assert.equal(resized[1].width, 200, 'Adjustment layer matches new canvas width');
  assert.equal(resized[2].x, 60, 'Shape x shifts by centered anchor delta (+50)');
  assert.equal(resized[2].y, 50, 'Shape y shifts by centered anchor delta (+30)');

  const snapped = restoreLayersFromSnapshot(snapshotLayers([shape]))[0] as ShapeLayer;
  assert.equal(snapped.shapeKind, 'star');
  assert.equal(snapped.sides, 6, 'Snapshot preserves custom star point count');
}

// ---- Trim transparent alpha bounds + crop roundtrip ----
{
  const w = 10;
  const h = 8;
  const buf = new Uint8ClampedArray(w * h * 4);
  // Set opaque pixels in [2..5] x [3..6]
  for (let y = 3; y <= 6; y++) {
    for (let x = 2; x <= 5; x++) {
      const idx = (y * w + x) * 4;
      buf[idx] = 200;
      buf[idx + 3] = 255;
    }
  }
  const bounds = computeAlphaBoundsFromRgba(buf, w, h);
  assert.deepEqual(bounds, { x: 2, y: 3, width: 4, height: 4 });

  const emptyBounds = computeAlphaBoundsFromRgba(new Uint8ClampedArray(w * h * 4), w, h);
  assert.equal(emptyBounds, null, 'All-transparent canvas returns null');

  const fullBuf = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 3; i < fullBuf.length; i += 4) fullBuf[i] = 255;
  assert.equal(computeAlphaBoundsFromRgba(fullBuf, 4, 4), null, 'Fully opaque canvas needs no trim');

  const shape: ShapeLayer = {
    id: 'trim-s1',
    name: 'Box',
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    x: 2,
    y: 3,
    width: 4,
    height: 4,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    flipY: false,
    mask: null,
    effects: cloneLayerEffects(DEFAULT_LAYER_EFFECTS),
    shapeKind: 'rect',
    fill: '#ffffff',
    fillEnabled: true,
    stroke: '#000000',
    strokeEnabled: false,
    strokeWidth: 1,
    cornerRadius: 0,
  };
  const cropped = cropLayers([shape], bounds!);
  assert.equal(cropped[0].x, 0, 'Trimmed shape shifts to origin x=0');
  assert.equal(cropped[0].y, 0, 'Trimmed shape shifts to origin y=0');
}

// ---- Stroke selection & border stroke ----
{
  const w = 12;
  const h = 12;
  const target = new Uint8ClampedArray(w * h * 4);
  const mask = new Uint8Array(w * h);
  // Selected square x=3..8, y=3..8
  for (let y = 3; y <= 8; y++) {
    for (let x = 3; x <= 8; x++) {
      mask[y * w + x] = 255;
    }
  }
  const changed = strokeBufferWithSelectionMask({
    targetData: target,
    targetWidth: w,
    targetHeight: h,
    strokeRgba: [255, 0, 0, 255],
    strokeWidthPx: 1,
    maskData: mask,
    maskWidth: w,
    maskHeight: h,
  });
  assert.equal(changed, true);
  // Perimeter pixel (3,3) is stroked
  assert.equal(target[(3 * w + 3) * 4], 255);
  assert.equal(target[(3 * w + 3) * 4 + 3], 255);
  // Interior pixel (5,5) remains transparent
  assert.equal(target[(5 * w + 5) * 4 + 3], 0);
  // Outside pixel (1,1) remains transparent
  assert.equal(target[(1 * w + 1) * 4 + 3], 0);

  // Full canvas border when maskData is null
  const fullTarget = new Uint8ClampedArray(8 * 8 * 4);
  const fullChanged = strokeBufferWithSelectionMask({
    targetData: fullTarget,
    targetWidth: 8,
    targetHeight: 8,
    strokeRgba: [0, 255, 0, 255],
    strokeWidthPx: 2,
    maskData: null,
    maskWidth: 8,
    maskHeight: 8,
  });
  assert.equal(fullChanged, true);
  assert.equal(fullTarget[(0 * 8 + 0) * 4 + 1], 255, 'Top-left corner stroked');
  assert.equal(fullTarget[(4 * 8 + 4) * 4 + 3], 0, 'Center pixel remains transparent');
}

// ---- Vector shapes: polygon, star, arrow ----
{
  const hex = computeShapePathPoints(100, 100, 'polygon', 6);
  assert.equal(hex.length, 6, 'Hexagon generates 6 vertices');

  const star = computeShapePathPoints(100, 100, 'star', 7);
  assert.equal(star.length, 14, '7-point star generates 14 vertices');

  const arrow = computeShapePathPoints(120, 60, 'arrow');
  assert.equal(arrow.length, 7, 'Arrow generates 7 polygon vertices');
  for (const pt of arrow) {
    assert.ok(pt.x >= 0 && pt.x <= 120, 'Arrow point x stays inside bounding width');
    assert.ok(pt.y >= 0 && pt.y <= 60, 'Arrow point y stays inside bounding height');
  }
}

// ---- Split Toning, Chromatic Aberration & Threshold ----
{
  // Split toning shifts darks toward shadow hue and brights toward highlight hue
  const splitSrc = new Uint8ClampedArray([
    35, 35, 35, 255,   // dark neutral shadow
    220, 220, 220, 255, // bright neutral highlight
  ]);
  const splitAdj = {
    ...cloneAdjustments(DEFAULT_ADJUSTMENTS),
    splitTone: 80,
    splitShadowHue: 240, // blue shadows
    splitHighlightHue: 0, // red highlights
  };
  assert.equal(isDefaultAdjustments(splitAdj), false, 'Non-zero splitTone is non-default');
  const splitOut = applyAdjustmentsToBuffer(splitSrc, 2, 1, splitAdj);
  assert.ok(splitOut[2] > splitOut[0], 'Blue shadow split tone boosts blue over red in shadows');
  assert.ok(splitOut[4] > splitOut[6], 'Red highlight split tone boosts red over blue in highlights');

  // Threshold produces strict binary black or white
  const threshSrc = new Uint8ClampedArray([
    40, 40, 40, 255,
    200, 200, 200, 255,
    150, 150, 150, 0,
  ]);
  const threshAdj = {
    ...cloneAdjustments(DEFAULT_ADJUSTMENTS),
    filters: { ...DEFAULT_FILTERS, threshold: 128 },
  };
  assert.equal(isDefaultFilters(threshAdj.filters), false, 'Active threshold marks filters non-default');
  const threshOut = applyAdjustmentsToBuffer(threshSrc, 3, 1, threshAdj);
  assert.deepEqual(Array.from(threshOut.slice(0, 4)), [0, 0, 0, 255], 'Dark pixel snaps to black');
  assert.deepEqual(Array.from(threshOut.slice(4, 8)), [255, 255, 255, 255], 'Bright pixel snaps to white');
  assert.equal(threshOut[11], 0, 'Transparent alpha preserved during threshold');

  // Chromatic aberration shifts red outward and blue inward radially around edges
  const caW = 11;
  const caH = 5;
  const caSrc = new Uint8ClampedArray(caW * caH * 4);
  // Dark opaque background with a 3px white vertical block at x=6..8
  for (let i = 3; i < caSrc.length; i += 4) caSrc[i] = 255;
  for (let y = 0; y < caH; y++) {
    for (let x = 6; x <= 8; x++) {
      const i = (y * caW + x) * 4;
      caSrc[i] = 255;
      caSrc[i + 1] = 255;
      caSrc[i + 2] = 255;
    }
  }
  const caAdj = {
    ...cloneAdjustments(DEFAULT_ADJUSTMENTS),
    filters: { ...DEFAULT_FILTERS, chromaticAberration: 100 },
  };
  assert.equal(isDefaultFilters(caAdj.filters), false);
  const caOut = applyAdjustmentsToBuffer(caSrc, caW, caH, caAdj);
  // Inner edge (x=6): red samples outward into the white block, blue samples inward toward dark
  const innerIdx = (2 * caW + 6) * 4;
  assert.ok(caOut[innerIdx] > caOut[innerIdx + 2], 'Inner fringe boosts red over blue');
  // Outer edge (x=9): blue samples inward into the white block, red samples outward into dark
  const outerIdx = (2 * caW + 9) * 4;
  assert.ok(caOut[outerIdx + 2] > caOut[outerIdx], 'Outer fringe boosts blue over red');

  // Sanitize backward compatibility when older presets omit new fields
  const sanitized = sanitizeAdjustments({ brightness: 15 });
  assert.equal(sanitized.splitTone, 0);
  assert.equal(sanitized.splitShadowHue, 220);
  assert.equal(sanitized.splitHighlightHue, 40);
  assert.equal(sanitized.filters?.chromaticAberration, 0);
  assert.equal(sanitized.filters?.threshold, 0);
}

// ---- HSL Color Mixer, Duotone Gradient Map, Lens Distortion & Tilt-Shift ----
{
  // HSL Mixer shifts targeted color band while sparing neutrals and unrelated hues
  const hslSrc = new Uint8ClampedArray([
    220, 40, 40, 255,   // saturated red
    120, 120, 120, 255, // neutral gray
    40, 60, 220, 255,   // saturated blue
  ]);
  const hslCfg = createDefaultHslMixer();
  hslCfg.red = { h: 100, s: 0, l: 0 };
  const hslAdj = { ...cloneAdjustments(DEFAULT_ADJUSTMENTS), hsl: hslCfg };
  assert.equal(isDefaultAdjustments(hslAdj), false, 'Edited HSL band marks adjustments non-default');
  const hslOut = applyAdjustmentsToBuffer(hslSrc, 3, 1, hslAdj);
  assert.ok(hslOut[1] > hslSrc[1], 'Shifting Reds hue positive increases green component on red pixel');
  assert.deepEqual(Array.from(hslOut.slice(4, 8)), [120, 120, 120, 255], 'Neutral gray unaffected by HSL mixer');
  assert.ok(Math.abs(hslOut[10] - hslSrc[10]) <= 3, 'Unrelated blue pixel stays preserved');

  // Duotone Gradient Map maps darks -> shadowColor and brights -> highlightColor
  const gmSrc = new Uint8ClampedArray([
    0, 0, 0, 255,
    255, 255, 255, 255,
  ]);
  const gmAdj = {
    ...cloneAdjustments(DEFAULT_ADJUSTMENTS),
    gradientMap: {
      enabled: true,
      shadowColor: '#0000FF',
      highlightColor: '#FF0000',
      mix: 100,
    },
  };
  assert.equal(isDefaultAdjustments(gmAdj), false);
  const gmOut = applyAdjustmentsToBuffer(gmSrc, 2, 1, gmAdj);
  assert.deepEqual(Array.from(gmOut.slice(0, 4)), [0, 0, 255, 255], 'Black maps to shadow color');
  assert.deepEqual(Array.from(gmOut.slice(4, 8)), [255, 0, 0, 255], 'White maps to highlight color');

  // Lens Distortion & Tilt-Shift flags
  const lensAdj = {
    ...cloneAdjustments(DEFAULT_ADJUSTMENTS),
    filters: { ...DEFAULT_FILTERS, lensDistortion: 45 },
  };
  assert.equal(isDefaultFilters(lensAdj.filters), false);
  const tsAdj = {
    ...cloneAdjustments(DEFAULT_ADJUSTMENTS),
    filters: { ...DEFAULT_FILTERS, tiltShiftBlur: 12, tiltShiftPos: 50, tiltShiftBand: 20 },
  };
  assert.equal(isDefaultFilters(tsAdj.filters), false);
  // Build 11x11 image with checkerboard top/bottom rows and crisp middle row (y=5)
  const tsW = 11;
  const tsH = 11;
  const tsSrc = new Uint8ClampedArray(tsW * tsH * 4);
  for (let y = 0; y < tsH; y++) {
    for (let x = 0; x < tsW; x++) {
      const idx = (y * tsW + x) * 4;
      const v = (x + y) % 2 === 0 ? 250 : 10;
      tsSrc[idx] = v;
      tsSrc[idx + 1] = v;
      tsSrc[idx + 2] = v;
      tsSrc[idx + 3] = 255;
    }
  }
  const tsOut = applyAdjustmentsToBuffer(tsSrc, tsW, tsH, tsAdj);
  const midDiff = Math.abs(tsOut[(5 * tsW + 5) * 4] - tsSrc[(5 * tsW + 5) * 4]);
  const topDiff = Math.abs(tsOut[0] - tsSrc[0]);
  assert.equal(midDiff, 0, 'Tilt-shift focus center row stays sharp');
  assert.ok(topDiff > 20, 'Tilt-shift outer rows are blurred');

  // Sanitize defaults for new fields
  const backCompat = sanitizeAdjustments({ brightness: 10 });
  assert.equal(backCompat.gradientMap?.enabled, false);
  assert.equal(backCompat.hsl?.red.h, 0);
  assert.equal(backCompat.filters?.lensDistortion, 0);
  assert.equal(backCompat.filters?.tiltShiftBlur, 0);
}

// ---- Destructive Filter Gallery, Auto Levels/Contrast, Color Replace, Red-Eye, Perspective ----
{
  // Auto Levels & Auto Contrast stretch narrow tonal range
  const narrow = new Uint8ClampedArray([
    80, 90, 100, 255,
    120, 130, 140, 255,
    160, 170, 180, 255,
    10, 10, 10, 0,
  ]);
  const lvlOut = autoLevelsBuffer(narrow, 0);
  assert.equal(lvlOut[0], 0, 'Auto Levels stretches channel min to 0');
  assert.equal(lvlOut[8], 255, 'Auto Levels stretches channel max to 255');
  assert.equal(lvlOut[15], 0, 'Auto Levels skips transparent pixel');

  const conOut = autoContrastBuffer(narrow, 0);
  assert.ok(conOut[8] > 180 && conOut[0] < 80, 'Auto Contrast expands luminance range');

  // High Pass, Motion Blur, Emboss, Edge Detect, Oil Paint, Halftone
  const w = 8;
  const h = 8;
  const pattern = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = x < 4 ? 30 : 220;
      pattern[i] = v;
      pattern[i + 1] = v;
      pattern[i + 2] = v;
      pattern[i + 3] = 255;
    }
  }
  const hp = applyHighPassBuffer(pattern, w, h, 2);
  assert.equal(hp.length, pattern.length);
  assert.ok(Math.abs(hp[0] - 128) <= 2, 'Uniform flat region in High Pass settles near 128 gray');

  const mb = applyMotionBlurBuffer(pattern, w, h, 3, 0);
  assert.ok(mb[(3 * w + 3) * 4] > 30 && mb[(3 * w + 3) * 4] < 220, 'Horizontal motion blur blends across vertical edge');

  const emb = applyEmbossBuffer(pattern, w, h, 2, 0);
  assert.equal(emb[0], 128, 'Flat left region embosses to neutral 128 gray');
  assert.notEqual(emb[(3 * w + 4) * 4], 128, 'Edge transitions create relief highlights/shadows');

  const edge = applyEdgeDetectBuffer(pattern, w, h);
  assert.equal(edge[0], 0, 'Flat interior has zero Sobel gradient');
  assert.ok(edge[(3 * w + 4) * 4] > 200, 'Sharp edge produces strong Sobel response');

  const oil = applyOilPaintBuffer(pattern, w, h, 2);
  assert.equal(oil[(3 * w + 7) * 4 + 3], 255);

  const half = applyHalftoneBuffer(pattern, w, h, 4);
  assert.equal(half.length, pattern.length);

  // Color Replace preserves luminance direction while shifting hue
  const crBuf = new Uint8ClampedArray([220, 40, 40, 255]); // bright red
  const crChanged = colorReplaceBuffer({
    data: crBuf,
    width: 1,
    height: 1,
    centerX: 0,
    centerY: 0,
    radius: 3,
    hardness: 1,
    opacity: 1,
    targetRgba: [0, 0, 255, 255],
  });
  assert.equal(crChanged, true);
  assert.ok(crBuf[2] > crBuf[0], 'Color replace shifts red pixel toward blue hue');

  // Red-Eye Removal desaturates red pupils while sparing bright white catchlights
  const eyeBuf = new Uint8ClampedArray([
    210, 35, 35, 255,   // flash red-eye pixel
    245, 245, 245, 255, // bright specular catchlight
  ]);
  const eyeChanged = redEyeRemovalBuffer({
    data: eyeBuf,
    width: 2,
    height: 1,
    centerX: 0.5,
    centerY: 0,
    radius: 2,
    hardness: 1,
  });
  assert.equal(eyeChanged, true);
  assert.ok(eyeBuf[0] < 100, 'Red-eye pixel red channel is neutralized');
  assert.deepEqual(Array.from(eyeBuf.slice(4, 8)), [245, 245, 245, 255], 'White catchlight preserved');

  // Projective Homography & Perspective Warp
  const pw = 6;
  const ph = 6;
  const pSrc = new Uint8ClampedArray(pw * ph * 4);
  for (let i = 0; i < pw * ph; i++) {
    pSrc[i * 4] = (i * 7) % 255;
    pSrc[i * 4 + 1] = 100;
    pSrc[i * 4 + 2] = 180;
    pSrc[i * 4 + 3] = 255;
  }
  const identityPts = [
    { x: 0, y: 0 },
    { x: pw - 1, y: 0 },
    { x: pw - 1, y: ph - 1 },
    { x: 0, y: ph - 1 },
  ];
  assert.ok(solveHomography(identityPts, identityPts) !== null, 'Identity homography solves cleanly');
  const pIdentityOut = warpBufferPerspective(pSrc, pw, ph, identityPts);
  assert.deepEqual(Array.from(pIdentityOut), Array.from(pSrc), 'Identity perspective corners preserve buffer');

  const keystonePts = [
    { x: 1, y: 0 },
    { x: pw - 2, y: 0 },
    { x: pw - 1, y: ph - 1 },
    { x: 0, y: ph - 1 },
  ];
  const pKeystoneOut = warpBufferPerspective(pSrc, pw, ph, keystonePts);
  assert.equal(pKeystoneOut[3], 0, 'Top-left corner outside inward keystone quad becomes transparent');
  assert.equal(pKeystoneOut[((ph - 1) * pw + 2) * 4 + 3], 255, 'Bottom center inside quad remains opaque');
}

console.log('All GStudio graphics engine unit tests passed.');


