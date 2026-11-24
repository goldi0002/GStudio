import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Command, Search, X } from 'lucide-react';
import { useEditorStore } from '../../store/useEditorStore';
import type { ToolId } from '../../types/editor';

interface PaletteAction {
  id: string;
  category: 'Tool' | 'Image' | 'Layer' | 'Filter' | 'Selection' | 'View' | 'File';
  label: string;
  keywords?: string;
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
}

export const CommandPaletteModal: React.FC = () => {
  const {
    modals,
    closeModal,
    view,
    documents,
    activeDocumentId,
    viewportSettings,
    theme,
    setActiveTool,
    openModal,
    openFilterGallery,
    applyAutoLevelsToLayer,
    applyAutoContrastToLayer,
    applyAutoEnhance,
    resetAdjustments,
    addRasterLayer,
    addGroupLayer,
    addAdjustmentLayer,
    addLayerMask,
    addTextLayer,
    stampVisibleLayers,
    flattenDocument,
    trimTransparentPixels,
    rotateActiveDocument,
    flipActiveDocument,
    selectAll,
    invertActiveSelection,
    clearSelection,
    cropToSelection,
    toggleViewportSetting,
    setBeforeAfterMode,
    setZoom,
    requestFitZoom,
    toggleTheme,
    undo,
    redo,
    saveActiveDocumentNow,
    saveProjectFileAs,
    setEditingTextLayerId,
  } = useEditorStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const doc = documents.find((d) => d.id === activeDocumentId) ?? null;
  const activeLayer = doc?.layers.find((l) => l.id === doc.activeLayerId) ?? null;
  const isRasterUnlocked = !!activeLayer && activeLayer.type === 'raster' && !activeLayer.locked;

  useEffect(() => {
    if (modals.commandPalette) {
      setQuery('');
      setSelectedIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [modals.commandPalette]);

  const actions = useMemo<PaletteAction[]>(() => {
    const toolItems: Array<[ToolId, string, string]> = [
      ['move', 'Move & Transform Tool', 'V'],
      ['marquee-rect', 'Rectangular Marquee Tool', 'M'],
      ['marquee-ellipse', 'Elliptical Marquee Tool', 'O'],
      ['lasso', 'Lasso Selection Tool', 'L'],
      ['magic-wand', 'Magic Wand Selection Tool', 'W'],
      ['crop', 'Crop & Straighten Tool', 'C'],
      ['brush', 'Brush Tool', 'B'],
      ['eraser', 'Eraser Tool', 'E'],
      ['bucket', 'Paint Bucket Fill Tool', 'G'],
      ['gradient', 'Gradient Fill Tool', 'K'],
      ['clone-stamp', 'Clone Stamp Tool', 'S'],
      ['spot-heal', 'Spot Healing & Red-Eye Tool', 'J'],
      ['dodge-burn', 'Dodge & Burn / Sponge Tool', 'D'],
      ['smudge-blur', 'Smudge / Blur / Sharpen Tool', 'R'],
      ['text', 'Text Tool', 'T'],
      ['shape', 'Shape Tool', 'U'],
      ['eyedropper', 'Eyedropper & Pixel Loupe Tool', 'I'],
      ['hand', 'Hand / Pan Tool', 'H'],
      ['zoom', 'Zoom Tool', 'Z'],
    ];

    const list: PaletteAction[] = [];

    if (doc && view === 'editor') {
      for (const [id, label, shortcut] of toolItems) {
        list.push({
          id: `tool-${id}`,
          category: 'Tool',
          label: `Switch to ${label}`,
          shortcut,
          run: () => setActiveTool(id),
        });
      }
    }

    list.push(
      {
        id: 'filter-liquify',
        category: 'Filter',
        label: 'Liquify Mesh Studio…',
        keywords: 'warp push bloat pinch twirl distort',
        disabled: !doc || !isRasterUnlocked,
        run: () => openModal('liquify'),
      },
      {
        id: 'select-color-range',
        category: 'Selection',
        label: 'Color Range & Chroma Matte…',
        keywords: 'background remove key isolate color selection mask',
        disabled: !doc,
        run: () => openModal('colorRange'),
      },
      {
        id: 'filter-gallery',
        category: 'Filter',
        label: 'Open Filter Gallery…',
        keywords: 'high pass motion blur oil paint halftone emboss edge detect',
        disabled: !doc || !isRasterUnlocked,
        run: () => openFilterGallery(),
      },
      {
        id: 'image-perspective',
        category: 'Image',
        label: 'Perspective & Keystone Transform…',
        keywords: 'skew corner warp homography',
        disabled: !doc || !isRasterUnlocked,
        run: () => openModal('perspective'),
      },
      {
        id: 'filter-auto-levels',
        category: 'Filter',
        label: 'Apply Auto Levels to Layer',
        disabled: !doc || !isRasterUnlocked,
        run: applyAutoLevelsToLayer,
      },
      {
        id: 'filter-auto-contrast',
        category: 'Filter',
        label: 'Apply Auto Contrast to Layer',
        disabled: !doc || !isRasterUnlocked,
        run: applyAutoContrastToLayer,
      },
      {
        id: 'adj-auto-balance',
        category: 'Image',
        label: 'Auto Balance Tone & Color',
        disabled: !doc,
        run: applyAutoEnhance,
      },
      {
        id: 'adj-reset',
        category: 'Image',
        label: 'Reset All Adjustments',
        disabled: !doc,
        run: resetAdjustments,
      },
      {
        id: 'layer-new-raster',
        category: 'Layer',
        label: 'New Raster Layer',
        shortcut: '⇧⌘N',
        disabled: !doc,
        run: () => addRasterLayer(),
      },
      {
        id: 'layer-new-adjustment',
        category: 'Layer',
        label: 'New Adjustment Layer',
        disabled: !doc,
        run: () => addAdjustmentLayer(),
      },
      {
        id: 'layer-new-group',
        category: 'Layer',
        label: 'New Layer Group',
        disabled: !doc,
        run: () => addGroupLayer(),
      },
      {
        id: 'layer-new-text',
        category: 'Layer',
        label: 'New Text Layer',
        disabled: !doc,
        run: () => {
          const id = addTextLayer();
          if (id) setEditingTextLayerId(id);
        },
      },
      {
        id: 'layer-add-mask',
        category: 'Layer',
        label: 'Add Layer Mask',
        disabled: !activeLayer || !!activeLayer.mask,
        run: () => activeLayer && addLayerMask(activeLayer.id),
      },
      {
        id: 'layer-stamp',
        category: 'Layer',
        label: 'Stamp Visible Layers',
        shortcut: '⇧⌥⌘E',
        disabled: !doc,
        run: stampVisibleLayers,
      },
      {
        id: 'image-flatten',
        category: 'Image',
        label: 'Flatten Document',
        disabled: !doc || doc.layers.length <= 1,
        run: flattenDocument,
      },
      {
        id: 'image-resize',
        category: 'Image',
        label: 'Resize Image…',
        disabled: !doc,
        run: () => openModal('resizeImage'),
      },
      {
        id: 'image-canvas-size',
        category: 'Image',
        label: 'Canvas Size…',
        disabled: !doc,
        run: () => openModal('canvasSize'),
      },
      {
        id: 'image-trim',
        category: 'Image',
        label: 'Trim Transparent Pixels',
        disabled: !doc,
        run: trimTransparentPixels,
      },
      {
        id: 'image-exif-metadata',
        category: 'Image',
        label: 'View Image & EXIF Metadata…',
        keywords: 'exif camera model lens focal length date taken iso aperture shutter gps info',
        disabled: !doc,
        run: () => openModal('exifMetadata'),
      },
      {
        id: 'image-rotate-cw',
        category: 'Image',
        label: 'Rotate Document 90° Clockwise',
        disabled: !doc,
        run: () => rotateActiveDocument(90),
      },
      {
        id: 'image-rotate-ccw',
        category: 'Image',
        label: 'Rotate Document 90° Counter-Clockwise',
        disabled: !doc,
        run: () => rotateActiveDocument(-90),
      },
      {
        id: 'image-flip-h',
        category: 'Image',
        label: 'Flip Document Horizontal',
        disabled: !doc,
        run: () => flipActiveDocument('horizontal'),
      },
      {
        id: 'select-all',
        category: 'Selection',
        label: 'Select All',
        shortcut: '⌘A',
        disabled: !doc,
        run: selectAll,
      },
      {
        id: 'select-invert',
        category: 'Selection',
        label: 'Invert Selection',
        shortcut: '⇧⌘I',
        disabled: !doc?.selection,
        run: invertActiveSelection,
      },
      {
        id: 'select-crop',
        category: 'Selection',
        label: 'Crop to Active Selection',
        disabled: !doc?.selection,
        run: cropToSelection,
      },
      {
        id: 'select-clear',
        category: 'Selection',
        label: 'Deselect',
        shortcut: '⌘D',
        disabled: !doc?.selection,
        run: clearSelection,
      },
      {
        id: 'view-fit',
        category: 'View',
        label: 'Fit Canvas to Screen',
        shortcut: '⌘0',
        disabled: !doc,
        run: requestFitZoom,
      },
      {
        id: 'view-100',
        category: 'View',
        label: 'Zoom to Actual Pixels (100%)',
        shortcut: '⌘1',
        disabled: !doc,
        run: () => setZoom(1, 0, 0),
      },
      {
        id: 'view-rulers',
        category: 'View',
        label: viewportSettings.showRulers ? 'Hide Rulers' : 'Show Rulers',
        run: () => toggleViewportSetting('showRulers'),
      },
      {
        id: 'view-grid',
        category: 'View',
        label: viewportSettings.showGrid ? 'Hide Pixel Grid' : 'Show Pixel Grid',
        run: () => toggleViewportSetting('showGrid'),
      },
      {
        id: 'view-split',
        category: 'View',
        label: 'Toggle Before / After Split View',
        shortcut: '\\',
        disabled: !doc,
        run: () =>
          setBeforeAfterMode(viewportSettings.beforeAfterMode === 'split' ? 'off' : 'split'),
      },
      {
        id: 'view-theme',
        category: 'View',
        label: theme === 'dark' ? 'Switch to Light Appearance' : 'Switch to Dark Graphite',
        run: toggleTheme,
      },
      {
        id: 'file-new',
        category: 'File',
        label: 'New Project…',
        shortcut: '⌘N',
        run: () => openModal('newProject'),
      },
      {
        id: 'file-export',
        category: 'File',
        label: 'Export Image…',
        shortcut: '⌘E',
        disabled: !doc,
        run: () => openModal('exportImage'),
      },
      {
        id: 'file-batch',
        category: 'File',
        label: 'Batch Process Images…',
        run: () => openModal('batchProcess'),
      },
      {
        id: 'file-save',
        category: 'File',
        label: 'Save to Local Studio',
        shortcut: '⌘S',
        disabled: !doc,
        run: () => void saveActiveDocumentNow(),
      },
      {
        id: 'file-save-as',
        category: 'File',
        label: 'Save Project File (.lps)…',
        shortcut: '⇧⌘S',
        disabled: !doc,
        run: () => void saveProjectFileAs(),
      },
      {
        id: 'edit-undo',
        category: 'Image',
        label: 'Undo',
        shortcut: '⌘Z',
        disabled: !doc || doc.historyIndex <= 0,
        run: undo,
      },
      {
        id: 'edit-redo',
        category: 'Image',
        label: 'Redo',
        shortcut: '⇧⌘Z',
        disabled: !doc || doc.historyIndex >= doc.history.length - 1,
        run: redo,
      }
    );

    return list.filter((a) => !a.disabled);
  }, [
    doc,
    view,
    activeLayer,
    isRasterUnlocked,
    viewportSettings,
    theme,
    setActiveTool,
    openModal,
    openFilterGallery,
    applyAutoLevelsToLayer,
    applyAutoContrastToLayer,
    applyAutoEnhance,
    resetAdjustments,
    addRasterLayer,
    addGroupLayer,
    addAdjustmentLayer,
    addLayerMask,
    addTextLayer,
    stampVisibleLayers,
    flattenDocument,
    trimTransparentPixels,
    rotateActiveDocument,
    flipActiveDocument,
    selectAll,
    invertActiveSelection,
    clearSelection,
    cropToSelection,
    toggleViewportSetting,
    setBeforeAfterMode,
    setZoom,
    requestFitZoom,
    toggleTheme,
    undo,
    redo,
    saveActiveDocumentNow,
    saveProjectFileAs,
    setEditingTextLayerId,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    const terms = q.split(/\s+/);
    return actions.filter((item) => {
      const hay = `${item.category} ${item.label} ${item.keywords ?? ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [actions, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!modals.commandPalette) return null;

  const safeIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));

  const executeItem = (item?: PaletteAction) => {
    if (!item) return;
    closeModal('commandPalette');
    item.run();
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal('commandPalette');
      }}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-start justify-center pt-[12vh] p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        className="w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--lp-panel)',
          borderColor: 'var(--lp-border-strong)',
        }}
      >
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 border-b"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <Search className="w-4 h-4 text-[var(--lp-text-secondary)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                closeModal('commandPalette');
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                executeItem(filtered[safeIndex]);
              }
            }}
            placeholder="Search tools, filters, layers, or actions…"
            className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-[var(--lp-text-secondary)]"
          />
          <button
            type="button"
            onClick={() => closeModal('commandPalette')}
            className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-[var(--lp-text-secondary)]">
              No matching commands found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const active = idx === safeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => executeItem(item)}
                  className={`w-full px-3.5 py-2 text-left flex items-center justify-between gap-3 text-[12px] cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#0A84FF] text-white'
                      : 'text-[var(--lp-text)] hover:bg-[var(--lp-hover)]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`text-[10px] font-medium w-14 shrink-0 ${
                        active ? 'text-white/80' : 'text-[var(--lp-text-secondary)]'
                      }`}
                    >
                      {item.category}
                    </span>
                    <span className="truncate font-medium">{item.label}</span>
                  </span>
                  {item.shortcut && (
                    <kbd
                      className={`text-[10px] font-mono-tabular px-1.5 py-0.5 rounded shrink-0 ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-[var(--lp-bg)] text-[var(--lp-text-secondary)]'
                      }`}
                    >
                      {item.shortcut}
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div
          className="px-3.5 py-1.5 border-t flex items-center justify-between text-[10px] text-[var(--lp-text-secondary)]"
          style={{
            backgroundColor: 'var(--lp-bg)',
            borderColor: 'var(--lp-border)',
          }}
        >
          <span className="flex items-center gap-1">
            <Command className="w-3 h-3" />
            <span>Up/Down to navigate · Enter to run · Esc to close</span>
          </span>
          <span className="font-mono-tabular">{filtered.length} commands</span>
        </div>
      </div>
    </div>
  );
};
