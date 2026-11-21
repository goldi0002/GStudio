import assert from 'node:assert/strict';
import {
  applyAdjustmentsToBuffer,
  buildLevelsLut,
  buildSplineCurveLut,
  computeHistogram,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_CURVES,
  DEFAULT_FILTERS,
  DEFAULT_LEVELS,
  isDefaultAdjustments,
} from './adjustments';
import { encodeBMP } from './bmpEncoder';
import { cropRatioFor, fitRatioRect, parseRatio } from './cropRatio';
import {
  cloneLayerEffects,
  cloneStampBuffer,
  computeLayerResizeRect,
  computePolygonBounds,
  computeShadowOffset,
  computeSnapGuides,
  DEFAULT_LAYER_EFFECTS,
  docPointToLayerLocal,
  extractMagicWandMask,
  extractSelectionFromBuffer,
  featherMaskBuffer,
  fillBufferWithMask,
  hexToRgba,
  invertMaskBuffer,
  invertSelectionState,
  isLayerTreeVisible,
  isPointInSelection,
  pickTopmostLayerAtPoint,
  rasterizeSelectionToMaskBuffer,
  rgbaToHex,
  rotatePointAroundCenter,
  snapRotationAngle,
  spotHealBuffer,
  traceSelectionBoundarySegments,
} from './canvasOps';
import type { GroupLayer, Layer, RasterLayer, ShapeLayer } from '../types/editor';

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

console.log('All GStudio graphics engine unit tests passed.');


