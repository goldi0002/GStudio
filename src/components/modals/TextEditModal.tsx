import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { FONT_PRESETS } from '../../engine/presets';
import { useEditorStore } from '../../store/useEditorStore';
import type { TextLayer } from '../../types/editor';

export const TextEditModal: React.FC = () => {
  const {
    modals,
    setEditingTextLayerId,
    documents,
    activeDocumentId,
    updateLayer,
  } = useEditorStore();

  const doc = documents.find((d) => d.id === activeDocumentId);
  const layer = doc?.layers.find(
    (l): l is TextLayer => l.id === modals.editingTextLayerId && l.type === 'text'
  );

  const [text, setText] = useState('');
  const [fontFamily, setFontFamily] = useState(FONT_PRESETS[0].value);
  const [fontSize, setFontSize] = useState(64);
  const [color, setColor] = useState('#FFFFFF');
  const [fontWeight, setFontWeight] = useState<'400' | '500' | '600' | '700'>('600');
  const [fontStyle, setFontStyle] = useState<'normal' | 'italic'>('normal');
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('left');
  const [lineHeight, setLineHeight] = useState(1.25);

  useEffect(() => {
    if (layer) {
      setText(layer.text);
      setFontFamily(layer.fontFamily);
      setFontSize(layer.fontSize);
      setColor(layer.color);
      setFontWeight(layer.fontWeight);
      setFontStyle(layer.fontStyle);
      setAlign(layer.align);
      setLineHeight(layer.lineHeight);
    }
  }, [layer]);

  if (!layer) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateLayer(
      layer.id,
      {
        text: text || ' ',
        name: (text.trim().slice(0, 22) || 'Text Layer'),
        fontFamily,
        fontSize,
        color,
        fontWeight,
        fontStyle,
        align,
        lineHeight,
      },
      'Edit Text Layer'
    );
    setEditingTextLayerId(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleSave}
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
          <h2 className="text-[13px] font-semibold">Edit Text Layer</h2>
          <button
            type="button"
            onClick={() => setEditingTextLayerId(null)}
            className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-[12px]">
          <textarea
            autoFocus
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border bg-[var(--lp-bg)] outline-none focus:border-[#0A84FF] resize-y"
            style={{ borderColor: 'var(--lp-border)' }}
          />

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-[var(--lp-text-secondary)]">Font Family</span>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="w-full px-2 py-1 rounded border bg-[var(--lp-bg)]"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                {!FONT_PRESETS.some((f) => f.value === fontFamily) && (
                  <option value={fontFamily}>Custom Font</option>
                )}
                {FONT_PRESETS.map((f) => (
                  <option key={f.label} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-[var(--lp-text-secondary)]">Line Height</span>
              <input
                type="number"
                min={0.8}
                max={3.0}
                step={0.05}
                value={lineHeight}
                onChange={(e) =>
                  setLineHeight(Math.max(0.8, Math.min(3.0, Number(e.target.value) || 1.25)))
                }
                className="w-full px-2 py-1 rounded border bg-[var(--lp-bg)] font-mono-tabular"
                style={{ borderColor: 'var(--lp-border)' }}
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-[var(--lp-text-secondary)]">Size (px)</span>
              <input
                type="number"
                min={8}
                max={400}
                value={fontSize}
                onChange={(e) => setFontSize(Math.max(8, Number(e.target.value) || 24))}
                className="w-full px-2 py-1 rounded border bg-[var(--lp-bg)] font-mono-tabular"
                style={{ borderColor: 'var(--lp-border)' }}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-[var(--lp-text-secondary)]">Weight</span>
              <select
                value={fontWeight}
                onChange={(e) =>
                  setFontWeight(e.target.value as '400' | '500' | '600' | '700')
                }
                className="w-full px-2 py-1 rounded border bg-[var(--lp-bg)]"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                <option value="400">Regular</option>
                <option value="500">Medium</option>
                <option value="600">Semibold</option>
                <option value="700">Bold</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-[var(--lp-text-secondary)]">Align</span>
              <select
                value={align}
                onChange={(e) => setAlign(e.target.value as 'left' | 'center' | 'right')}
                className="w-full px-2 py-1 rounded border bg-[var(--lp-bg)]"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setFontStyle(fontStyle === 'italic' ? 'normal' : 'italic')}
              className={`px-3 py-1 rounded border text-[11px] italic cursor-pointer transition-colors ${
                fontStyle === 'italic'
                  ? 'bg-[#0A84FF] text-white border-[#0A84FF]'
                  : 'hover:bg-[var(--lp-hover)]'
              }`}
              style={{ borderColor: fontStyle === 'italic' ? '#0A84FF' : 'var(--lp-border)' }}
            >
              Italic
            </button>
            <label className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--lp-text-secondary)]">Text Color</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-7 rounded border bg-transparent cursor-pointer"
                style={{ borderColor: 'var(--lp-border)' }}
              />
            </label>
          </div>
        </div>

        <div
          className="px-4 py-3 border-t flex items-center justify-end gap-2"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <button
            type="button"
            onClick={() => setEditingTextLayerId(null)}
            className="px-3.5 py-1.5 rounded-lg border text-[12px] hover:bg-[var(--lp-hover)] cursor-pointer"
            style={{ borderColor: 'var(--lp-border)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 rounded-lg bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-[12px] font-medium cursor-pointer"
          >
            Apply Text
          </button>
        </div>
      </form>
    </div>
  );
};
