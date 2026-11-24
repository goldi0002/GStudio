import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Crosshair,
  X,
} from 'lucide-react';
import { useEditorStore } from '../../store/useEditorStore';
import type { CanvasAnchor } from '../../types/editor';

const ANCHORS: Array<{
  id: CanvasAnchor;
  label: string;
  Icon: React.FC<{ className?: string }>;
}> = [
  { id: 'nw', label: 'Top Left', Icon: ArrowUpLeft },
  { id: 'n', label: 'Top Center', Icon: ArrowUp },
  { id: 'ne', label: 'Top Right', Icon: ArrowUpRight },
  { id: 'w', label: 'Middle Left', Icon: ArrowLeft },
  { id: 'c', label: 'Center', Icon: Crosshair },
  { id: 'e', label: 'Middle Right', Icon: ArrowRight },
  { id: 'sw', label: 'Bottom Left', Icon: ArrowDownLeft },
  { id: 's', label: 'Bottom Center', Icon: ArrowDown },
  { id: 'se', label: 'Bottom Right', Icon: ArrowDownRight },
];

type ExtensionMode = 'transparent' | '#FFFFFF' | '#000000' | 'foreground' | 'custom';

export const CanvasSizeModal: React.FC = () => {
  const {
    modals,
    closeModal,
    documents,
    activeDocumentId,
    foregroundColor,
    canvasSizeActiveDocument,
  } = useEditorStore();
  const doc = documents.find((d) => d.id === activeDocumentId);

  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [anchor, setAnchor] = useState<CanvasAnchor>('c');
  const [extensionMode, setExtensionMode] = useState<ExtensionMode>('transparent');
  const [customColor, setCustomColor] = useState('#1D1D1F');

  useEffect(() => {
    if (doc && modals.canvasSize) {
      setWidth(doc.width);
      setHeight(doc.height);
      setAnchor('c');
    }
  }, [doc, modals.canvasSize]);

  if (!modals.canvasSize || !doc) return null;

  const dw = width - doc.width;
  const dh = height - doc.height;

  const resolvedColor =
    extensionMode === 'foreground'
      ? foregroundColor
      : extensionMode === 'custom'
        ? customColor
        : extensionMode;

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    canvasSizeActiveDocument(width, height, anchor, resolvedColor);
    closeModal('canvasSize');
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
          <h2 className="text-[13px] font-semibold">Canvas Size</h2>
          <button
            type="button"
            onClick={() => closeModal('canvasSize')}
            className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-[12px]">
          <div className="flex items-center justify-between text-[11px] text-[var(--lp-text-secondary)] font-mono-tabular">
            <span>
              Current: {doc.width} × {doc.height} px
            </span>
            <span>
              Delta: {dw >= 0 ? `+${dw}` : dw} × {dh >= 0 ? `+${dh}` : dh}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--lp-text-secondary)]">Width (px)</span>
              <input
                type="number"
                min={1}
                max={8192}
                value={width}
                onChange={(e) =>
                  setWidth(Math.max(1, Math.min(8192, Math.round(Number(e.target.value)) || 1)))
                }
                className="w-full px-3 py-1.5 rounded-lg border bg-[var(--lp-bg)] font-mono-tabular outline-none focus:border-[#0A84FF]"
                style={{ borderColor: 'var(--lp-border)' }}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--lp-text-secondary)]">Height (px)</span>
              <input
                type="number"
                min={1}
                max={8192}
                value={height}
                onChange={(e) =>
                  setHeight(Math.max(1, Math.min(8192, Math.round(Number(e.target.value)) || 1)))
                }
                className="w-full px-3 py-1.5 rounded-lg border bg-[var(--lp-bg)] font-mono-tabular outline-none focus:border-[#0A84FF]"
                style={{ borderColor: 'var(--lp-border)' }}
              />
            </label>
          </div>

          <div className="flex items-center gap-1.5">
            {[
              {
                label: '+100 px',
                apply: () => {
                  setWidth(Math.min(8192, doc.width + 100));
                  setHeight(Math.min(8192, doc.height + 100));
                },
              },
              {
                label: '+200 px',
                apply: () => {
                  setWidth(Math.min(8192, doc.width + 200));
                  setHeight(Math.min(8192, doc.height + 200));
                },
              },
              {
                label: 'Square',
                apply: () => {
                  const side = Math.max(doc.width, doc.height);
                  setWidth(side);
                  setHeight(side);
                },
              },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={preset.apply}
                className="flex-1 py-1 rounded border text-[11px] font-mono-tabular hover:bg-[var(--lp-hover)] cursor-pointer whitespace-nowrap"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <span className="text-[11px] text-[var(--lp-text-secondary)] block">Anchor</span>
              <div
                className="grid grid-cols-3 gap-1 p-1 rounded-lg border"
                style={{ backgroundColor: 'var(--lp-bg)', borderColor: 'var(--lp-border)' }}
              >
                {ANCHORS.map(({ id, label, Icon }) => {
                  const selected = anchor === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      title={label}
                      aria-label={`Anchor ${label}`}
                      onClick={() => setAnchor(id)}
                      className={`w-7 h-7 rounded flex items-center justify-center cursor-pointer transition-colors ${
                        selected
                          ? 'bg-[#0A84FF] text-white'
                          : 'text-[var(--lp-text-secondary)] hover:bg-[var(--lp-hover)] hover:text-[var(--lp-text)]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 space-y-1.5">
              <span className="text-[11px] text-[var(--lp-text-secondary)] block">
                Extension Fill
              </span>
              <select
                value={extensionMode}
                onChange={(e) => setExtensionMode(e.target.value as ExtensionMode)}
                className="w-full px-2.5 py-1.5 rounded-lg border bg-[var(--lp-bg)] text-[12px]"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                <option value="transparent">Transparent</option>
                <option value="#FFFFFF">White</option>
                <option value="#000000">Black</option>
                <option value="foreground">Foreground Color</option>
                <option value="custom">Custom Color</option>
              </select>
              {extensionMode === 'custom' && (
                <label className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-[var(--lp-text-secondary)]">Pick Fill</span>
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => setCustomColor(e.target.value)}
                    className="w-8 h-6 rounded border bg-transparent cursor-pointer"
                    style={{ borderColor: 'var(--lp-border)' }}
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        <div
          className="px-4 py-3 border-t flex items-center justify-end gap-2"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <button
            type="button"
            onClick={() => closeModal('canvasSize')}
            className="px-3.5 py-1.5 rounded-lg border text-[12px] hover:bg-[var(--lp-hover)] cursor-pointer"
            style={{ borderColor: 'var(--lp-border)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 rounded-lg bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-[12px] font-medium cursor-pointer"
          >
            Apply Canvas Size
          </button>
        </div>
      </form>
    </div>
  );
};
