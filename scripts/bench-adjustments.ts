import { applyAdjustmentsToBuffer, cloneDefaultAdjustments } from '../src/engine/adjustments';
import { hashPixels } from '../src/engine/canvasOps';

/**
 * Measures the cost of stacked adjustment layers on a large canvas (pure buffer math, no canvas).
 * Run with: bun scripts/bench-adjustments.ts [width] [height] [layers]
 */
const width = Number(process.argv[2] ?? 4000);
const height = Number(process.argv[3] ?? 3000);
const layers = Number(process.argv[4] ?? 5);

const buf = new Uint8ClampedArray(width * height * 4);
for (let i = 0; i < buf.length; i++) buf[i] = (i * 31) & 255;

const adj = cloneDefaultAdjustments();
adj.saturation = -40;
adj.contrast = 20;
adj.temperature = 15;
adj.highlights = -30;

let t = performance.now();
let current = buf;
for (let l = 0; l < layers; l++) current = applyAdjustmentsToBuffer(current, width, height, adj);
const apply = performance.now() - t;

t = performance.now();
for (let l = 0; l < layers; l++) hashPixels(buf);
const hash = performance.now() - t;

console.log(`${width}x${height}, ${layers} adjustment layers`);
console.log(`  apply (uncached): ${apply.toFixed(0)} ms`);
console.log(`  hash (cache hit cost): ${hash.toFixed(0)} ms`);
