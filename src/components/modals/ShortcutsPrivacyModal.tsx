import React, { useEffect, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { detectLocalCapabilities } from '../../persistence/fileAccess';
import { estimateStorageUsage } from '../../persistence/indexedDb';
import { useEditorStore } from '../../store/useEditorStore';

const SHORTCUTS = [
  ['V', 'Move, Resize (Shift proportional corner) & Rotate (Shift 15° snap)'],
  ['Arrows / ⇧Arrows', 'Nudge Active Layer 1px / 10px'],
  ['M / O', 'Rect / Elliptical Marquee'],
  ['L / W', 'Lasso / Magic Wand Selection'],
  ['C', 'Crop Tool'],
  ['B / E', 'Brush / Eraser'],
  ['G / K', 'Paint Bucket / Gradient Tool'],
  ['S / J', 'Clone Stamp (Alt+Click sample) / Spot Healing Brush'],
  ['D / R', 'Dodge & Burn (Sponge) / Smudge, Blur & Sharpen'],
  ['T / U', 'Text / Shape Tool'],
  ['I / H / Z', 'Eyedropper / Hand / Zoom'],
  ['[ / ]', 'Decrease / Increase Brush & Retouch Tool Size'],
  ['⌘J / ⇧⌘N', 'Layer via Copy (or Duplicate) / New Raster Layer'],
  ['⇧⌥⌘E', 'Stamp Visible Layers to New Layer'],
  ['⌘A / ⇧⌘I / ⌘D', 'Select All / Invert / Deselect'],
  ['⇧⌫', 'Fill Selection with Foreground Color'],
  ['⇧⌘C / ⌘V', 'Copy Merged / Paste Layer or Clipboard Image'],
  ['\\', 'Toggle Before / After Split'],
  ['Space + Drag', 'Temporary Pan Canvas'],
  ['⌘Z / ⇧⌘Z', 'Undo / Redo'],
  ['⌘0 / ⌘1', 'Fit Screen / Actual Pixels'],
  ['⌘E / ⌘S / ⌘W', 'Export / Save Locally / Close Tab'],
  ['⌘K', 'Open Command Palette (Search Tools, Filters & Actions)'],
];

export const ShortcutsPrivacyModal: React.FC = () => {
  const { modals, closeModal } = useEditorStore();
  const [storage, setStorage] = useState<{ usageBytes: number; quotaBytes: number } | null>(null);
  const caps = detectLocalCapabilities();

  useEffect(() => {
    if (modals.privacy) {
      void estimateStorageUsage().then(setStorage);
    }
  }, [modals.privacy]);

  if (!modals.shortcuts && !modals.privacy) return null;

  const isPrivacy = modals.privacy;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="w-full max-w-md rounded-xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--lp-panel)',
          borderColor: 'var(--lp-border-strong)',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <h2 className="text-[13px] font-semibold">
            {isPrivacy ? 'Local Privacy & Storage' : 'Keyboard Shortcuts'}
          </h2>
          <button
            type="button"
            onClick={() => closeModal(isPrivacy ? 'privacy' : 'shortcuts')}
            className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 text-[12px] space-y-3 max-h-[70vh] overflow-y-auto">
          {isPrivacy ? (
            <>
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#30D158]/10 border border-[#30D158]/25">
                <ShieldCheck className="w-4 h-4 text-[#30D158] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium text-[var(--lp-text)]">
                    Zero Cloud Processing Guarantee
                  </p>
                  <p className="text-[11px] text-[var(--lp-text-secondary)] leading-relaxed">
                    Every decode, layer composite, pixel filter, autosave snapshot, and export runs locally on your device. No image bytes ever leave your browser.
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-y-2 text-[11px]">
                <dt className="text-[var(--lp-text-secondary)]">IndexedDB Autosave</dt>
                <dd className="text-right font-mono-tabular">
                  {caps.indexedDb ? 'Supported' : 'Unavailable'}
                </dd>
                <dt className="text-[var(--lp-text-secondary)]">File System Access</dt>
                <dd className="text-right font-mono-tabular">
                  {caps.fileSystemAccess ? 'Native' : 'Fallback Active'}
                </dd>
                <dt className="text-[var(--lp-text-secondary)]">Web Workers</dt>
                <dd className="text-right font-mono-tabular">
                  {caps.webWorker ? 'Active' : 'Main Thread'}
                </dd>
                <dt className="text-[var(--lp-text-secondary)]">Local Usage</dt>
                <dd className="text-right font-mono-tabular">
                  {storage
                    ? `${(storage.usageBytes / (1024 * 1024)).toFixed(2)} MB`
                    : '—'}
                </dd>
              </dl>
            </>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--lp-border)' }}>
              {SHORTCUTS.map(([keys, desc]) => (
                <div
                  key={keys}
                  className="py-2 flex items-center justify-between gap-4"
                  style={{ borderColor: 'var(--lp-border)' }}
                >
                  <span className="text-[var(--lp-text)]">{desc}</span>
                  <kbd
                    className="px-2 py-0.5 rounded border text-[11px] font-mono-tabular shrink-0"
                    style={{
                      backgroundColor: 'var(--lp-bg)',
                      borderColor: 'var(--lp-border)',
                    }}
                  >
                    {keys}
                  </kbd>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
