import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Images, Loader2, Plus, Trash2, X } from 'lucide-react';
import { DEFAULT_ADJUSTMENTS } from '../../engine/adjustments';
import {
  decodeImageFile,
  encodeDocumentForExport,
  pickLocalFiles,
  saveBlobLocally,
} from '../../persistence/fileAccess';
import { useEditorStore } from '../../store/useEditorStore';
import type { DocumentState, ExportFormat, RasterLayer } from '../../types/editor';

const IMAGE_ACCEPT =
  'image/png,image/jpeg,image/webp,image/avif,image/bmp,image/gif,image/svg+xml';

type EdgeMode = 'original' | '4096' | '2048' | '1600' | '1080' | '800';

interface QueueEntry {
  id: string;
  name: string;
  sizeBytes: number;
  thumbUrl: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  detail?: string;
}

const EDGE_OPTIONS: Array<{ value: EdgeMode; label: string }> = [
  { value: 'original', label: 'Keep original' },
  { value: '4096', label: '4096 px' },
  { value: '2048', label: '2048 px' },
  { value: '1600', label: '1600 px' },
  { value: '1080', label: '1080 px' },
  { value: '800', label: '800 px' },
];

const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

const EXT_BY_FORMAT: Record<ExportFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  bmp: 'bmp',
};

interface WritableLike {
  write: (blob: Blob) => Promise<void>;
  close: () => Promise<void>;
}

interface DirectoryHandleLike {
  getFileHandle: (
    name: string,
    options: { create: boolean }
  ) => Promise<{ createWritable: () => Promise<WritableLike> }>;
}

interface BatchOutput {
  filename: string;
  blob: Blob;
  mime: string;
  ext: string;
}

function makeEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `batch_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `batch_${Math.random().toString(36).slice(2, 10)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function safeName(name: string): string {
  return name.replace(/[^a-z0-9_\- ]/gi, '_').trim() || 'image';
}

function buildBatchDocument(
  name: string,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  sourceFormat: string
): DocumentState {
  const layer: RasterLayer = {
    id: 'batch-layer',
    name,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    x: 0,
    y: 0,
    width,
    height,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    canvas,
  };
  return {
    id: 'batch-doc',
    name,
    width,
    height,
    backgroundColor: 'transparent',
    layers: [layer],
    activeLayerId: layer.id,
    editingTarget: 'layer',
    adjustments: DEFAULT_ADJUSTMENTS,
    selection: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    history: [],
    historyIndex: 0,
    dirty: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sourceFormat,
  };
}

async function saveOutputs(
  outputs: BatchOutput[]
): Promise<'folder' | 'downloads' | 'cancelled'> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (options: { mode: string }) => Promise<DirectoryHandleLike>;
    }
  ).showDirectoryPicker;

  if (typeof picker === 'function') {
    try {
      const dir = await picker({ mode: 'readwrite' });
      for (const output of outputs) {
        const handle = await dir.getFileHandle(output.filename, { create: true });
        const writable = await handle.createWritable();
        await writable.write(output.blob);
        await writable.close();
      }
      return 'folder';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'cancelled';
      }
      // SecurityError in sandboxed frames — fall back to per-file downloads.
    }
  }

  for (const output of outputs) {
    await saveBlobLocally(
      output.blob,
      output.filename,
      `${output.ext.toUpperCase()} Image`,
      output.mime,
      `.${output.ext}`
    );
    await new Promise((resolve) => window.setTimeout(resolve, 200));
  }
  return 'downloads';
}

export const BatchProcessModal: React.FC = () => {
  const { modals, closeModal, showToast } = useEditorStore();
  const open = modals.batchProcess;

  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [format, setFormat] = useState<ExportFormat>('jpeg');
  const [quality, setQuality] = useState(88);
  const [edgeMode, setEdgeMode] = useState<EdgeMode>('2048');
  const [running, setRunning] = useState(false);

  const filesRef = useRef<Map<string, File>>(new Map());
  const entriesRef = useRef<QueueEntry[]>([]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(
    () => () => {
      for (const entry of entriesRef.current) {
        URL.revokeObjectURL(entry.thumbUrl);
      }
      filesRef.current.clear();
    },
    []
  );

  const addImages = useCallback(async () => {
    const files = await pickLocalFiles(IMAGE_ACCEPT, true);
    if (files.length === 0) return;

    const added: QueueEntry[] = [];
    for (const file of files) {
      const id = makeEntryId();
      filesRef.current.set(id, file);
      added.push({
        id,
        name: file.name.replace(/\.[^.]+$/, '') || 'image',
        sizeBytes: file.size,
        thumbUrl: URL.createObjectURL(file),
        status: 'queued',
      });
    }
    setEntries((prev) => [...prev, ...added]);
  }, []);

  const removeEntry = (id: string) => {
    const entry = entriesRef.current.find((e) => e.id === id);
    if (entry) URL.revokeObjectURL(entry.thumbUrl);
    filesRef.current.delete(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const clearAll = () => {
    for (const entry of entriesRef.current) {
      URL.revokeObjectURL(entry.thumbUrl);
    }
    filesRef.current.clear();
    setEntries([]);
  };

  const updateEntry = (id: string, patch: Partial<QueueEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const processAll = async () => {
    if (running || entries.length === 0) return;
    setRunning(true);

    const outputs: BatchOutput[] = [];
    const usedNames = new Set<string>();
    let failures = 0;

    for (const entry of entriesRef.current) {
      const file = filesRef.current.get(entry.id);
      if (!file) {
        updateEntry(entry.id, { status: 'error', detail: 'File no longer available' });
        failures += 1;
        continue;
      }

      if (entry.status === 'done') continue;
      updateEntry(entry.id, { status: 'processing', detail: undefined });

      try {
        const decoded = await decodeImageFile(file);
        const sourceEdge = Math.max(decoded.width, decoded.height);
        const maxEdge = edgeMode === 'original' ? sourceEdge : Number(edgeMode);
        const scale = Math.min(1, maxEdge / Math.max(1, sourceEdge));
        const targetWidth = Math.max(1, Math.round(decoded.width * scale));
        const targetHeight = Math.max(1, Math.round(decoded.height * scale));

        const doc = buildBatchDocument(
          entry.name,
          decoded.canvas,
          decoded.width,
          decoded.height,
          decoded.sourceFormat
        );

        const { blob, previewUrl } = await encodeDocumentForExport(doc, {
          format,
          quality,
          width: targetWidth,
          height: targetHeight,
          fitMode: 'stretch',
          preserveTransparency: format !== 'jpeg',
          matteColor: '#FFFFFF',
        });
        if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);

        const ext = EXT_BY_FORMAT[format];
        const base = safeName(entry.name);
        let filename = `${base}.${ext}`;
        let counter = 2;
        while (usedNames.has(filename.toLowerCase())) {
          filename = `${base}-${counter}.${ext}`;
          counter += 1;
        }
        usedNames.add(filename.toLowerCase());

        outputs.push({ filename, blob, mime: MIME_BY_FORMAT[format], ext });
        updateEntry(entry.id, {
          status: 'done',
          detail: `${targetWidth}×${targetHeight} · ${formatBytes(blob.size)}`,
        });
      } catch (err) {
        failures += 1;
        updateEntry(entry.id, {
          status: 'error',
          detail: err instanceof Error ? err.message : 'Processing failed',
        });
      }
    }

    if (outputs.length > 0) {
      const destination = await saveOutputs(outputs);
      if (destination === 'cancelled') {
        showToast('Save cancelled. Processed images were not written.', 'info');
      } else if (destination === 'folder') {
        showToast(`Saved ${outputs.length} images into the chosen folder.`, 'success');
      } else {
        showToast(`Downloaded ${outputs.length} images.`, 'success');
      }
    } else if (failures > 0) {
      showToast('No images could be processed. Check the errors in the list.', 'error');
    }

    setRunning(false);
  };

  if (!open) return null;

  const queuedCount = entries.filter((e) => e.status !== 'done').length;
  const doneCount = entries.filter((e) => e.status === 'done').length;

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="w-full max-w-3xl rounded-xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{ backgroundColor: 'var(--lp-panel)', borderColor: 'var(--lp-border-strong)' }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <div>
            <h2 className="text-[13px] font-semibold flex items-center gap-1.5">
              <Images className="w-4 h-4 text-[#0A84FF]" />
              <span>Batch Process</span>
            </h2>
            <p className="text-[11px] text-[var(--lp-text-secondary)]">
              Resize and re-encode many images at once — entirely on your device
            </p>
          </div>
          <button
            type="button"
            onClick={() => closeModal('batchProcess')}
            className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Settings */}
        <div
          className="px-4 py-3 border-b grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <div className="space-y-1.5">
            <span className="text-[11px] text-[var(--lp-text-secondary)] block">Output format</span>
            <div className="grid grid-cols-4 gap-1">
              {(['jpeg', 'png', 'webp', 'bmp'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setFormat(fmt)}
                  className={`py-1 rounded border text-[10px] font-medium uppercase cursor-pointer ${
                    format === fmt
                      ? 'bg-[#0A84FF] text-white border-[#0A84FF]'
                      : 'hover:bg-[var(--lp-hover)]'
                  }`}
                  style={{ borderColor: format === fmt ? '#0A84FF' : 'var(--lp-border)' }}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--lp-text-secondary)]">Quality</span>
              <span className="font-mono-tabular">
                {format === 'png' || format === 'bmp' ? 'Lossless' : `${quality}%`}
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              value={quality}
              disabled={format === 'png' || format === 'bmp'}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="lp-slider w-full disabled:opacity-40"
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] text-[var(--lp-text-secondary)] block">
              Maximum long edge
            </span>
            <select
              value={edgeMode}
              onChange={(e) => setEdgeMode(e.target.value as EdgeMode)}
              className="w-full h-7 rounded border bg-transparent px-1.5 text-[11px] cursor-pointer"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              {EDGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Queue */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
          {entries.length === 0 ? (
            <button
              type="button"
              onClick={() => void addImages()}
              className="w-full rounded-xl border border-dashed p-8 text-center hover:border-[#0A84FF] transition-colors cursor-pointer"
              style={{ borderColor: 'var(--lp-border-strong)' }}
            >
              <Plus className="w-5 h-5 mx-auto mb-2 text-[#0A84FF]" />
              <div className="text-[13px] font-medium">Add images to process</div>
              <p className="text-[11px] text-[var(--lp-text-secondary)] mt-0.5">
                PNG, JPEG, WebP, AVIF, BMP, GIF or SVG
              </p>
            </button>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 p-2 rounded-lg border"
                style={{ backgroundColor: 'var(--lp-sidebar)', borderColor: 'var(--lp-border)' }}
              >
                <div className="w-12 h-12 rounded overflow-hidden checkerboard-bg shrink-0">
                  <img
                    src={entry.thumbUrl}
                    alt={entry.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium truncate">{entry.name}</div>
                  <div className="text-[10px] text-[var(--lp-text-secondary)] font-mono-tabular">
                    {formatBytes(entry.sizeBytes)}
                    {entry.detail ? ` · ${entry.detail}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {entry.status === 'processing' && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0A84FF]" />
                  )}
                  {entry.status === 'done' && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#30D158]" />
                  )}
                  {entry.status === 'error' && (
                    <AlertCircle className="w-3.5 h-3.5 text-[#FF453A]" />
                  )}
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => removeEntry(entry.id)}
                    className="p-1 rounded text-[var(--lp-text-secondary)] hover:text-[#FF453A] hover:bg-[var(--lp-hover)] disabled:opacity-40 cursor-pointer"
                    title="Remove from queue"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div
          className="px-4 py-3 border-t flex items-center justify-between gap-2"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={running}
              onClick={() => void addImages()}
              className="px-3 py-1.5 rounded-lg border text-[12px] flex items-center gap-1.5 hover:bg-[var(--lp-hover)] disabled:opacity-40 cursor-pointer"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Images</span>
            </button>
            {entries.length > 0 && (
              <button
                type="button"
                disabled={running}
                onClick={clearAll}
                className="px-2 py-1.5 rounded text-[11px] text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] disabled:opacity-40 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {entries.length > 0 && (
              <span className="text-[11px] text-[var(--lp-text-secondary)] font-mono-tabular">
                {doneCount}/{entries.length} done
              </span>
            )}
            <button
              type="button"
              disabled={running || queuedCount === 0}
              onClick={() => void processAll()}
              className="px-4 py-1.5 rounded-lg bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {running ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Images className="w-3.5 h-3.5" />
              )}
              <span>
                {running ? 'Processing…' : `Process ${queuedCount} image${queuedCount === 1 ? '' : 's'}`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
