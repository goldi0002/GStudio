# Adjustment layers — design (for review, nothing built yet)

## Goal
Let adjustments (curves, levels, hue/sat, filters…) live in the layer stack instead of one document-wide
stack. An adjustment layer affects everything **below** it, can be masked, reordered, hidden, given opacity
and blend mode, and stays non-destructive.

## Today
- `doc.adjustments` is a single `Adjustments` object, applied once to the final composite in
  `compositeLayersToCanvas` (canvasOps.ts) and on-screen via the worker (`processAdjustmentsAsync`).
- `Layer = raster | text | shape | group`. Groups render into a doc-sized scratch canvas, then mask → opacity → blend.
- History snapshots (`HistoryLayerSnapshot`) and `.lps` files (`SerializedLayer`, `formatVersion: 1`) carry layers and `adjustments`.

## Proposed model
1. **New layer type `adjustment`** in `LayerType`, extending `BaseLayer` with `adjustments: Adjustments`.
   `x/y/width/height/rotation/scale` are ignored (always doc-sized). Opacity, blend mode, visibility, lock,
   `mask` and `parentId` all keep working with no new fields.
2. **Keep `doc.adjustments`** as the "global" stack for now. It still applies on top of the full composite, so
   existing files, the Adjustments panel, presets and batch processing behave exactly as before.
   Adjustment layers are additive. (Option to migrate the global stack into a layer later; not part of v1.)
3. **Rendering** in `renderLayerNodeToContext`: for an `adjustment` layer, snapshot what is already drawn on
   `ctx` (the composite of everything below *within the current group/root*), run
   `applyAdjustmentsToBuffer` on a copy, apply the layer mask to the *processed* copy, then blend back with
   opacity and blend mode. Inside a group this scopes the effect to the group, like Photoshop's pass-through off.
   Empty/default adjustments, hidden layers and opacity 0 are skipped for free.
4. **Worker path**: the on-screen composite currently runs the global stack in the worker after a synchronous
   composite. Adjustment layers need the pixel work mid-composite, so v1 runs them synchronously on the main
   thread via the same function (identical output for preview/export/thumbnail). Heavy stacks may lag on very
   large canvases; v2 option is to render the composite in segments split at adjustment layers and push each
   segment through the worker. I'd measure before doing that.
5. **UI**
   - Layers panel: "New adjustment layer" menu (Curves, Levels, Brightness/Contrast, Hue/Saturation, Filters…,
     each pre-opens the matching section), with a distinct icon; reorder, hide, delete, opacity, blend, mask all
     reuse existing controls.
   - RightInspector / CurvesLevelsPanel get a target: when the active layer is an adjustment layer they edit
     `layer.adjustments`; otherwise the global `doc.adjustments` as today. Section header says which one.
   - Paint/transform/crop tools treat adjustment layers like locked-geometry layers (mask editing works,
     pixel painting and move are disabled).
6. **History**: `HistoryLayerSnapshot.adjustmentData?: Adjustments` (cloned like `doc.adjustments`). Slider
   changes commit one entry per gesture, labelled "Adjustment: <name>", same as the global panel.
7. **Persistence**: `SerializedLayer` gains optional `adjustmentData`. Because the field is optional and unknown
   layer types would break older builds, bump `formatVersion` only if I make a type guard; plan is to keep
   `formatVersion: 1`, write `type: 'adjustment'`, and have the loader skip unknown layer types with a toast
   so older/newer files degrade instead of failing. Existing `.lps` files load unchanged.
8. **Other consumers** to update: `deserializeProject`/`serializeProject`, thumbnail + export (use
   `compositeLayersToCanvas`, so automatic), flatten/merge down (merge-down onto an adjustment layer bakes it
   into the pixels below), duplicate layer, group/ungroup, layer-effects code (adjustment layers have none),
   `BatchProcessModal` (unaffected; operates on the global stack).

## Edge cases
- Adjustment layer at the very bottom: operates on the background colour only (matches Photoshop).
- Transparent pixels: adjustments already preserve alpha; processing happens on premultiplied-safe data via the
  existing buffer function, so semi-transparent edges don't halo.
- Mask on an adjustment layer uses the existing doc-sized `LayerMask`, so "Mask from Selection" works for
  local adjustments with no new code.
- Clipping to the layer directly below: out of scope for v1.

## Testing
- Unit (engine.test.ts): composite with an adjustment layer equals applying the same adjustments to the
  composite of the layers below; a mask of 0 is identity; a mask of 50% is the midpoint; layers above are
  unaffected; hidden / opacity 0 are identity; serialize → deserialize round trip.
- e2e: add Hue/Saturation layer to a sample, canvas turns monochrome; paint a mask region and confirm only that
  region changes; undo/redo; save/reopen `.lps`.

## Rollout (small PRs)
1. Type + render + serialize + unit tests (no UI).
2. Layers-panel creation, inspector targeting, tool guards, history.
3. e2e coverage and README.

## Open questions
- Should a **global** adjustment panel stay at all once layers exist, or migrate it (my pick: keep for v1).
- Pass-through inside groups (my pick, as above) vs. always flattening the whole doc below.
- Is main-thread processing acceptable for v1 (my pick: yes, measure on 4K first)?
