import React, { useEffect, useState } from 'react';
import { Lock, Unlock, X } from 'lucide-react';
import { useEditorStore } from '../../store/useEditorStore';

export const ResizeImageModal: React.FC = () => {
  const { modals, closeModal, documents, activeDocumentId, resizeActiveDocument } =
    useEditorStore();
  const doc = documents.find((d) => d.id === activeDocumentId);

  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [lockAspect, setLockAspect] = useState(true);

  useEffect(() => {
    if (doc && modals.resizeImage) {
      setWidth(doc.width);
      setHeight(doc.height);
    }
  }, [doc, modals.resizeImage]);

  if (!modals.resizeImage || !doc) return null;

  const aspect = doc.width / doc.height;

  const handleWidthChange = (nextW: number) => {
    const clamped = Math.max(1, Math.min(8192, Math.round(nextW) || 1));
    setWidth(clamped);
    if (lockAspect) {
      setHeight(Math.max(1, Math.round(clamped / aspect)));
    }
  };

  const handleHeightChange = (nextH: number) => {
    const clamped = Math.max(1, Math.min(8192, Math.round(nextH) || 1));
    setHeight(clamped);
    if (lockAspect) {
      setWidth(Math.max(1, Math.round(clamped * aspect)));
    }
  };

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    resizeActiveDocument(width, height);
    closeModal('resizeImage');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleApply}
        className="w-full max-w-sm rounded-xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--lp-panel)',
          borderColor: 'var(--lp-border-strong)',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <h2 className="text-[13px] font-semibold">Resize Image</h2>
          <button
            type="button"
            onClick={() => closeModal('resizeImage')}
            className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-[12px]">
          <div className="text-[11px] text-[var(--lp-text-secondary)] font-mono-tabular">
            Original: {doc.width} × {doc.height} px
          </div>

          <div className="flex items-end gap-2">
            <label className="flex-1 space-y-1">
              <span className="text-[11px] text-[var(--lp-text-secondary)]">Width (px)</span>
              <input
                type="number"
                min={1}
                max={8192}
                value={width}
                onChange={(e) => handleWidthChange(Number(e.target.value))}
                className="w-full px-3 py-1.5 rounded-lg border bg-[var(--lp-bg)] font-mono-tabular outline-none focus:border-[#0A84FF]"
                style={{ borderColor: 'var(--lp-border)' }}
              />
            </label>

            <button
              type="button"
              onClick={() => setLockAspect(!lockAspect)}
              title={lockAspect ? 'Unlock Aspect Ratio' : 'Lock Aspect Ratio'}
              className={`p-2 rounded-lg border cursor-pointer ${
                lockAspect ? 'text-[#0A84FF] border-[#0A84FF]' : 'text-[var(--lp-text-secondary)]'
              }`}
              style={{ borderColor: lockAspect ? '#0A84FF' : 'var(--lp-border)' }}
            >
              {lockAspect ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>

            <label className="flex-1 space-y-1">
              <span className="text-[11px] text-[var(--lp-text-secondary)]">Height (px)</span>
              <input
                type="number"
                min={1}
                max={8192}
                value={height}
                onChange={(e) => handleHeightChange(Number(e.target.value))}
                className="w-full px-3 py-1.5 rounded-lg border bg-[var(--lp-bg)] font-mono-tabular outline-none focus:border-[#0A84FF]"
                style={{ borderColor: 'var(--lp-border)' }}
              />
            </label>
          </div>

          <div className="flex items-center gap-1.5">
            {[0.5, 0.75, 1, 1.5, 2].map((scale) => (
              <button
                key={scale}
                type="button"
                onClick={() => {
                  setWidth(Math.max(1, Math.round(doc.width * scale)));
                  setHeight(Math.max(1, Math.round(doc.height * scale)));
                }}
                className="flex-1 py-1 rounded border text-[11px] font-mono-tabular hover:bg-[var(--lp-hover)] cursor-pointer"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                {scale * 100}%
              </button>
            ))}
          </div>
        </div>

        <div
          className="px-4 py-3 border-t flex items-center justify-end gap-2"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <button
            type="button"
            onClick={() => closeModal('resizeImage')}
            className="px-3.5 py-1.5 rounded-lg border text-[12px] hover:bg-[var(--lp-hover)] cursor-pointer"
            style={{ borderColor: 'var(--lp-border)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 rounded-lg bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-[12px] font-medium cursor-pointer"
          >
            Resize
          </button>
        </div>
      </form>
    </div>
  );
};
