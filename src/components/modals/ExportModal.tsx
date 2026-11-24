import React, { useEffect, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import {
  constrainCanvasDimensions,
  encodeDocumentForExport,
  saveBlobLocally,
} from '../../persistence/fileAccess';
import { useEditorStore } from '../../store/useEditorStore';
import type { ExportFitMode, ExportFormat } from '../../types/editor';

type PresetCategory = 'custom' | 'social' | 'web' | 'print';

interface ExportPreset {
  id: string;
  category: Exclude<PresetCategory, 'custom'>;
  label: string;
  width: number;
  height: number;
  note: string;
}

const EXPORT_PRESETS: ExportPreset[] = [
  { id: 'ig-square', category: 'social', label: 'Instagram Post', width: 1080, height: 1080, note: '1:1' },
  { id: 'ig-story', category: 'social', label: 'Story / Reel', width: 1080, height: 1920, note: '9:16' },
  { id: 'social-wide', category: 'social', label: 'X / Post Wide', width: 1200, height: 675, note: '16:9' },
  { id: 'yt-thumb', category: 'social', label: 'YouTube Thumb', width: 1280, height: 720, note: '16:9' },

  { id: 'web-fhd', category: 'web', label: 'Full HD (1080p)', width: 1920, height: 1080, note: '16:9' },
  { id: 'web-og', category: 'web', label: 'Open Graph', width: 1200, height: 630, note: 'Share' },
  { id: 'web-4k', category: 'web', label: '4K UHD', width: 3840, height: 2160, note: '2160p' },
  { id: 'web-icon', category: 'web', label: 'App Icon', width: 512, height: 512, note: '1:1' },

  { id: 'print-4x6', category: 'print', label: '4 × 6 in', width: 1200, height: 1800, note: '300 DPI' },
  { id: 'print-5x7', category: 'print', label: '5 × 7 in', width: 1500, height: 2100, note: '300 DPI' },
  { id: 'print-8x10', category: 'print', label: '8 × 10 in', width: 2400, height: 3000, note: '300 DPI' },
  { id: 'print-letter', category: 'print', label: 'US Letter', width: 2550, height: 3300, note: '8.5×11"' },
];

export const ExportModal: React.FC = () => {
  const { modals, closeModal, documents, activeDocumentId, showToast } = useEditorStore();
  const doc = documents.find((d) => d.id === activeDocumentId);

  const [format, setFormat] = useState<ExportFormat>('png');
  const [quality, setQuality] = useState(92);
  const [presetCategory, setPresetCategory] = useState<PresetCategory>('custom');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('ig-square');
  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState<ExportFitMode>('contain');
  const [preserveTransparency, setPreserveTransparency] = useState(true);
  const [matteColor, setMatteColor] = useState('#FFFFFF');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [estimatedBytes, setEstimatedBytes] = useState<number | null>(null);
  const [encoding, setEncoding] = useState(false);

  const activePreset =
    presetCategory === 'custom'
      ? null
      : EXPORT_PRESETS.find((p) => p.id === selectedPresetId && p.category === presetCategory) ??
        EXPORT_PRESETS.find((p) => p.category === presetCategory) ??
        null;

  const rawTargetW = doc
    ? activePreset
      ? activePreset.width
      : Math.max(1, Math.round(doc.width * scale))
    : 1;
  const rawTargetH = doc
    ? activePreset
      ? activePreset.height
      : Math.max(1, Math.round(doc.height * scale))
    : 1;
  const { width: targetW, height: targetH } = constrainCanvasDimensions(rawTargetW, rawTargetH);

  useEffect(() => {
    if (!modals.exportImage || !doc) {
      setPreviewUrl(null);
      setEstimatedBytes(null);
      return;
    }
    let cancelled = false;
    let createdObjectUrl: string | null = null;
    setEncoding(true);

    const timer = window.setTimeout(async () => {
      try {
        const { blob, previewUrl: url } = await encodeDocumentForExport(doc, {
          format,
          quality,
          width: targetW,
          height: targetH,
          fitMode: activePreset ? fitMode : 'stretch',
          preserveTransparency: format === 'jpeg' ? false : preserveTransparency,
          matteColor,
        });
        if (cancelled) {
          if (url.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        createdObjectUrl = url.startsWith('blob:') ? url : null;
        setPreviewUrl(url);
        setEstimatedBytes(blob.size);
      } catch {
        if (!cancelled) {
          setEstimatedBytes(null);
        }
      } finally {
        if (!cancelled) setEncoding(false);
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
    };
  }, [
    modals.exportImage,
    doc,
    format,
    quality,
    targetW,
    targetH,
    activePreset,
    fitMode,
    preserveTransparency,
    matteColor,
  ]);

  if (!modals.exportImage || !doc) return null;

  const formatBytes = (b: number | null) => {
    if (b === null) return '—';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleExport = async () => {
    setEncoding(true);
    try {
      const { blob, previewUrl: url } = await encodeDocumentForExport(doc, {
        format,
        quality,
        width: targetW,
        height: targetH,
        fitMode: activePreset ? fitMode : 'stretch',
        preserveTransparency: format === 'jpeg' ? false : preserveTransparency,
        matteColor,
      });
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);

      const ext = format === 'jpeg' ? 'jpg' : format;
      const mimeMap: Record<ExportFormat, string> = {
        png: 'image/png',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        bmp: 'image/bmp',
      };
      const safeName = doc.name.replace(/[^a-z0-9_\- ]/gi, '_').trim() || 'export';
      const suffix = activePreset ? `_${targetW}x${targetH}` : '';
      const saved = await saveBlobLocally(
        blob,
        `${safeName}${suffix}.${ext}`,
        `${format.toUpperCase()} Image`,
        mimeMap[format],
        `.${ext}`
      );
      if (saved) {
        showToast(`Exported "${safeName}${suffix}.${ext}" (${formatBytes(blob.size)})`, 'success');
        closeModal('exportImage');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed.', 'error');
    } finally {
      setEncoding(false);
    }
  };

  const categoryPresets =
    presetCategory === 'custom'
      ? []
      : EXPORT_PRESETS.filter((p) => p.category === presetCategory);

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="w-full max-w-3xl rounded-xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{
          backgroundColor: 'var(--lp-panel)',
          borderColor: 'var(--lp-border-strong)',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <div>
            <h2 className="text-[13px] font-semibold">Export Image</h2>
            <p className="text-[11px] text-[var(--lp-text-secondary)]">
              Encoded locally on your device with zero quality loss unless selected
            </p>
          </div>
          <button
            type="button"
            onClick={() => closeModal('exportImage')}
            className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 min-h-0 overflow-y-auto">
          {/* Preview Pane */}
          <div className="md:col-span-7 p-4 flex flex-col items-center justify-center checkerboard-bg relative min-h-[260px]">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Export preview"
                className="max-w-full max-h-[340px] object-contain shadow-lg"
              />
            ) : (
              <Loader2 className="w-5 h-5 animate-spin text-[var(--lp-text-secondary)]" />
            )}
            <div
              className="mt-3 px-2.5 py-1 rounded border text-[11px] font-mono-tabular flex items-center gap-2"
              style={{
                backgroundColor: 'var(--lp-panel)',
                borderColor: 'var(--lp-border-strong)',
              }}
            >
              <span>
                {targetW} × {targetH} px
              </span>
              <span className="text-[var(--lp-text-secondary)]">·</span>
              <span>{encoding ? 'Calculating…' : formatBytes(estimatedBytes)}</span>
            </div>
          </div>

          {/* Export Settings */}
          <div
            className="md:col-span-5 p-4 border-t md:border-t-0 md:border-l space-y-3.5 text-[12px] overflow-y-auto"
            style={{ borderColor: 'var(--lp-border)' }}
          >
            <div className="space-y-1.5">
              <span className="text-[11px] text-[var(--lp-text-secondary)] block">Format</span>
              <div className="grid grid-cols-4 gap-1.5">
                {(['png', 'jpeg', 'webp', 'bmp'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormat(fmt)}
                    className={`py-1.5 rounded-md border text-[11px] font-medium uppercase cursor-pointer ${
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

            {(format === 'jpeg' || format === 'webp') && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--lp-text-secondary)]">Quality</span>
                  <span className="font-mono-tabular">{quality}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="lp-slider w-full"
                />
              </div>
            )}

            {/* Destination Size Presets */}
            <div className="space-y-2">
              <span className="text-[11px] text-[var(--lp-text-secondary)] block">
                Destination Size
              </span>
              <div className="grid grid-cols-4 gap-1">
                {(
                  [
                    ['custom', 'Scale'],
                    ['social', 'Social'],
                    ['web', 'Web'],
                    ['print', 'Print'],
                  ] as const
                ).map(([cat, label]) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setPresetCategory(cat);
                      if (cat !== 'custom') {
                        const first = EXPORT_PRESETS.find((p) => p.category === cat);
                        if (first) setSelectedPresetId(first.id);
                      }
                    }}
                    className={`py-1 rounded border text-[11px] font-medium cursor-pointer ${
                      presetCategory === cat
                        ? 'bg-[#0A84FF] text-white border-[#0A84FF]'
                        : 'hover:bg-[var(--lp-hover)]'
                    }`}
                    style={{ borderColor: presetCategory === cat ? '#0A84FF' : 'var(--lp-border)' }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {presetCategory === 'custom' ? (
                <div className="grid grid-cols-4 gap-1.5">
                  {[0.5, 1, 1.5, 2].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScale(s)}
                      className={`py-1 rounded-md border text-[11px] font-mono-tabular cursor-pointer ${
                        scale === s
                          ? 'bg-[#0A84FF] text-white border-[#0A84FF]'
                          : 'hover:bg-[var(--lp-hover)]'
                      }`}
                      style={{ borderColor: scale === s ? '#0A84FF' : 'var(--lp-border)' }}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {categoryPresets.map((preset) => {
                      const active = activePreset?.id === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setSelectedPresetId(preset.id)}
                          className={`px-2 py-1.5 rounded-md border text-left cursor-pointer transition-colors ${
                            active
                              ? 'bg-[#0A84FF]/15 border-[#0A84FF] text-[var(--lp-text)]'
                              : 'hover:bg-[var(--lp-hover)]'
                          }`}
                          style={{ borderColor: active ? '#0A84FF' : 'var(--lp-border)' }}
                        >
                          <div className="flex items-center justify-between gap-1 text-[11px] font-medium">
                            <span className="truncate">{preset.label}</span>
                            <span className="text-[10px] text-[var(--lp-text-secondary)] shrink-0">
                              {preset.note}
                            </span>
                          </div>
                          <div className="text-[10px] font-mono-tabular text-[var(--lp-text-secondary)]">
                            {preset.width} × {preset.height}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-[11px] text-[var(--lp-text-secondary)]">Fit Mode</span>
                    <div className="flex items-center gap-1">
                      {(['contain', 'cover', 'stretch'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setFitMode(mode)}
                          className={`px-2 py-0.5 rounded border text-[10px] capitalize cursor-pointer ${
                            fitMode === mode
                              ? 'bg-[#0A84FF] text-white border-[#0A84FF]'
                              : 'hover:bg-[var(--lp-hover)]'
                          }`}
                          style={{ borderColor: fitMode === mode ? '#0A84FF' : 'var(--lp-border)' }}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {format !== 'jpeg' ? (
              <label className="flex items-center justify-between py-1 cursor-pointer">
                <span className="text-[11px]">Preserve Transparency</span>
                <input
                  type="checkbox"
                  checked={preserveTransparency}
                  onChange={(e) => setPreserveTransparency(e.target.checked)}
                />
              </label>
            ) : (
              <p className="text-[11px] text-[var(--lp-text-secondary)]">
                JPEG does not support alpha transparency; transparent areas use matte color below.
              </p>
            )}

            {(format === 'jpeg' || !preserveTransparency) && (
              <label className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--lp-text-secondary)]">Background Matte</span>
                <input
                  type="color"
                  value={matteColor}
                  onChange={(e) => setMatteColor(e.target.value)}
                  className="w-7 h-6 rounded border bg-transparent cursor-pointer"
                  style={{ borderColor: 'var(--lp-border)' }}
                />
              </label>
            )}
          </div>
        </div>

        <div
          className="px-4 py-3 border-t flex items-center justify-end gap-2"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <button
            type="button"
            onClick={() => closeModal('exportImage')}
            className="px-3.5 py-1.5 rounded-lg border text-[12px] hover:bg-[var(--lp-hover)] cursor-pointer"
            style={{ borderColor: 'var(--lp-border)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={encoding}
            onClick={() => void handleExport()}
            className="px-4 py-1.5 rounded-lg bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-[12px] font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export {format.toUpperCase()}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
