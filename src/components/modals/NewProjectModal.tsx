import React, { useState } from 'react';
import { X } from 'lucide-react';
import { constrainCanvasDimensions, MAX_IMAGE_DIMENSION } from '../../persistence/fileAccess';
import { useEditorStore } from '../../store/useEditorStore';

const PRESETS = [
  { label: '4K UHD', width: 3840, height: 2160 },
  { label: '1080p HD', width: 1920, height: 1080 },
  { label: 'Square 1080', width: 1080, height: 1080 },
  { label: 'Portrait 4:5', width: 1080, height: 1350 },
  { label: 'App Icon 1024', width: 1024, height: 1024 },
  { label: 'Photo 3:2', width: 1800, height: 1200 },
];

export const NewProjectModal: React.FC = () => {
  const { modals, closeModal, createDocument } = useEditorStore();
  const [name, setName] = useState('Untitled Artwork');
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [bgType, setBgType] = useState<'transparent' | '#FFFFFF' | '#141414' | 'custom'>('transparent');
  const [customBg, setCustomBg] = useState('#252528');

  if (!modals.newProject) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const bg = bgType === 'custom' ? customBg : bgType;
    const clamped = constrainCanvasDimensions(width, height);
    createDocument({ name, width: clamped.width, height: clamped.height, backgroundColor: bg });
    closeModal('newProject');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleCreate}
        className="w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--lp-panel)',
          borderColor: 'var(--lp-border-strong)',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <h2 className="text-[13px] font-semibold">New Local Project</h2>
          <button
            type="button"
            onClick={() => closeModal('newProject')}
            className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-[12px]">
          <div className="space-y-1">
            <label className="text-[11px] text-[var(--lp-text-secondary)]">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border bg-[var(--lp-bg)] outline-none focus:border-[#0A84FF]"
              style={{ borderColor: 'var(--lp-border)' }}
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] text-[var(--lp-text-secondary)] block">Canvas Presets</span>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setWidth(p.width);
                    setHeight(p.height);
                  }}
                  className={`px-2.5 py-2 rounded-lg border text-left cursor-pointer transition-colors ${
                    width === p.width && height === p.height
                      ? 'border-[#0A84FF] bg-[var(--lp-active-surface)]'
                      : 'hover:bg-[var(--lp-hover)]'
                  }`}
                  style={{
                    borderColor:
                      width === p.width && height === p.height ? '#0A84FF' : 'var(--lp-border)',
                  }}
                >
                  <div className="font-medium text-[11px]">{p.label}</div>
                  <div className="text-[10px] text-[var(--lp-text-secondary)] font-mono-tabular">
                    {p.width} × {p.height}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--lp-text-secondary)]">Width (px)</span>
              <input
                type="number"
                min={1}
                max={MAX_IMAGE_DIMENSION}
                value={width}
                onChange={(e) => {
                  const clamped = constrainCanvasDimensions(Number(e.target.value) || 1, height);
                  setWidth(clamped.width);
                  setHeight(clamped.height);
                }}
                className="w-full px-3 py-1.5 rounded-lg border bg-[var(--lp-bg)] font-mono-tabular outline-none focus:border-[#0A84FF]"
                style={{ borderColor: 'var(--lp-border)' }}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--lp-text-secondary)]">Height (px)</span>
              <input
                type="number"
                min={1}
                max={MAX_IMAGE_DIMENSION}
                value={height}
                onChange={(e) => {
                  const clamped = constrainCanvasDimensions(width, Number(e.target.value) || 1);
                  setWidth(clamped.width);
                  setHeight(clamped.height);
                }}
                className="w-full px-3 py-1.5 rounded-lg border bg-[var(--lp-bg)] font-mono-tabular outline-none focus:border-[#0A84FF]"
                style={{ borderColor: 'var(--lp-border)' }}
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] text-[var(--lp-text-secondary)] block">Background</span>
            <div className="flex items-center gap-2">
              {(
                [
                  ['transparent', 'Transparent'],
                  ['#FFFFFF', 'White'],
                  ['#141414', 'Graphite'],
                  ['custom', 'Custom'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setBgType(val)}
                  className={`flex-1 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer ${
                    bgType === val
                      ? 'bg-[#0A84FF] text-white border-[#0A84FF]'
                      : 'hover:bg-[var(--lp-hover)]'
                  }`}
                  style={{ borderColor: bgType === val ? '#0A84FF' : 'var(--lp-border)' }}
                >
                  {label}
                </button>
              ))}
              {bgType === 'custom' && (
                <input
                  type="color"
                  value={customBg}
                  onChange={(e) => setCustomBg(e.target.value)}
                  className="w-8 h-8 rounded border cursor-pointer bg-transparent"
                  style={{ borderColor: 'var(--lp-border)' }}
                />
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
            onClick={() => closeModal('newProject')}
            className="px-3.5 py-1.5 rounded-lg border text-[12px] hover:bg-[var(--lp-hover)] cursor-pointer"
            style={{ borderColor: 'var(--lp-border)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 rounded-lg bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-[12px] font-medium cursor-pointer"
          >
            Create Canvas
          </button>
        </div>
      </form>
    </div>
  );
};
