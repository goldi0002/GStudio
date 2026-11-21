import { applyAdjustmentsToBuffer, isDefaultAdjustments } from './adjustments';
import type { WorkerAdjustRequest, WorkerAdjustResponse } from './adjustments.worker';
import type { Adjustments } from '../types/editor';

let workerInstance: Worker | null = null;
let workerUnavailable = false;
let nextRequestId = 1;

const pendingRequests = new Map<
  number,
  { resolve: (data: ImageData) => void; reject: (err: Error) => void }
>();

function getWorker(): Worker | null {
  if (workerUnavailable || typeof Worker === 'undefined') {
    return null;
  }
  if (!workerInstance) {
    try {
      workerInstance = new Worker(new URL('./adjustments.worker.ts', import.meta.url), {
        type: 'module',
      });
      workerInstance.onmessage = (event: MessageEvent<WorkerAdjustResponse>) => {
        const { requestId, width, height, buffer } = event.data;
        const entry = pendingRequests.get(requestId);
        if (!entry) return;
        pendingRequests.delete(requestId);
        const clamped = new Uint8ClampedArray(buffer);
        entry.resolve(new ImageData(clamped, width, height));
      };
      workerInstance.onerror = () => {
        workerUnavailable = true;
        workerInstance?.terminate();
        workerInstance = null;
        for (const [, entry] of pendingRequests) {
          entry.reject(new Error('Worker execution failed'));
        }
        pendingRequests.clear();
      };
    } catch {
      workerUnavailable = true;
      return null;
    }
  }
  return workerInstance;
}

export async function processAdjustmentsAsync(
  imageData: ImageData,
  adjustments: Adjustments
): Promise<ImageData> {
  if (isDefaultAdjustments(adjustments)) {
    return imageData;
  }

  const worker = getWorker();
  if (!worker) {
    const out = applyAdjustmentsToBuffer(
      imageData.data,
      imageData.width,
      imageData.height,
      adjustments
    );
    return new ImageData(new Uint8ClampedArray(out), imageData.width, imageData.height);
  }

  const requestId = nextRequestId++;
  // Copy source buffer so caller keeps ownership if needed
  const copy = new Uint8ClampedArray(imageData.data);
  const buffer = copy.buffer;

  try {
    return await new Promise<ImageData>((resolve, reject) => {
      pendingRequests.set(requestId, { resolve, reject });
      const req: WorkerAdjustRequest = {
        requestId,
        width: imageData.width,
        height: imageData.height,
        adjustments,
        buffer,
      };
      worker.postMessage(req, [buffer]);
    });
  } catch {
    const out = applyAdjustmentsToBuffer(
      imageData.data,
      imageData.width,
      imageData.height,
      adjustments
    );
    return new ImageData(new Uint8ClampedArray(out), imageData.width, imageData.height);
  }
}
