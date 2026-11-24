import { applyAdjustmentsToBuffer } from './adjustments';
import type { Adjustments } from '../types/editor';

export interface WorkerAdjustRequest {
  requestId: number;
  width: number;
  height: number;
  adjustments: Adjustments;
  buffer: ArrayBuffer;
}

export interface WorkerAdjustResponse {
  requestId: number;
  width: number;
  height: number;
  buffer?: ArrayBuffer;
  error?: string;
}

self.onmessage = (event: MessageEvent<WorkerAdjustRequest>) => {
  const { requestId, width, height, adjustments, buffer } = event.data;
  try {
    const src = new Uint8ClampedArray(buffer);
    const out = applyAdjustmentsToBuffer(src, width, height, adjustments);
    const outBuffer = out.buffer as ArrayBuffer;
    const msg: WorkerAdjustResponse = {
      requestId,
      width,
      height,
      buffer: outBuffer,
    };
    self.postMessage(msg, { transfer: [outBuffer] });
  } catch (err) {
    const msg: WorkerAdjustResponse = {
      requestId,
      width,
      height,
      error: err instanceof Error ? err.message : 'Worker adjustment error',
    };
    self.postMessage(msg);
  }
};
