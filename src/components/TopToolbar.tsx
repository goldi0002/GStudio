import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Download,
  Home,
  Moon,
  Redo2,
  Search,
  Sun,
  Undo2,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import { PWAInstallButton } from './PWAInstallButton';
import { requestCloseDocument } from '../hooks/useUnsavedChangesGuard';
import { decodeImageFile, parseSerializedProject, pickLocalFiles } from '../persistence/fileAccess';
import { useEditorStore } from '../store/useEditorStore';

type MenuKey = 'file' | 'edit' | 'image' | 'layer' | 'filter' | 'view' | 'help' | null;

interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  divider?: boolean;
}

export const TopToolbar: React.FC = () => {
  const {
    view,
    setView,
    theme,
    toggleTheme,
    documents,
    activeDocumentId,
    saveStatus,
    viewportSettings,
    undo,
    redo,
    setZoom,
    requestFitZoom,
    toggleViewportSetting,
    setBeforeAfterMode,
    openModal,
    openFilterGallery,
    applyAutoLevelsToLayer,
    applyAutoContrastToLayer,
    openDecodedImage,
    placeImageAsLayer,
    openProjectData,
    saveActiveDocumentNow,
    saveProjectFileAs,
    closeDocument,
    copyActiveLayer,
    copyMergedToClipboard,
    cutActiveLayer,
    pasteClipboard,
    clipboardLayer,
    clipboardEffects,
    foregroundColor,
    deleteSelectionOrLayer,
    fillSelectionWithColor,
    strokeSelectionWithColor,
    featherActiveSelection,
    applySelectionAsMask,
    selectAll,
    invertActiveSelection,
    clearSelection,
    cropToSelection,
    trimTransparentPixels,
    rotateActiveDocument,
    flipActiveDocument,
    flattenDocument,
    addRasterLayer,
    addGroupLayer,
    addLayerMask,
    deleteLayerMask,
    addTextLayer,
    addShapeLayer,
    layerViaCopyOrDuplicate,
    mergeLayerDown,
    stampVisibleLayers,
    copyActiveLayerEffects,
    pasteActiveLayerEffects,
    rasterizeActiveLayer,
    deleteLayer,
    moveLayerOrder,
    setEditingTextLayerId,
    showToast,
  } = useEditorStore();

  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  const activeDoc = documents.find((d) => d.id === activeDocumentId) ?? null;
  const canUndo = !!activeDoc && activeDoc.historyIndex > 0;
  const canRedo = !!activeDoc && activeDoc.historyIndex < activeDoc.history.length - 1;
  const activeLayer = activeDoc?.layers.find((l) => l.id === activeDoc.activeLayerId) ?? null;
  const activeLayerIndex = activeDoc
    ? activeDoc.layers.findIndex((l) => l.id === activeDoc.activeLayerId)
    : -1;

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, []);

  const handleOpenImage = async () => {
    setOpenMenu(null);
    const files = await pickLocalFiles(
      'image/png,image/jpeg,image/webp,image/avif,image/bmp,image/gif,image/svg+xml',
      true
    );
    for (const file of files) {
      try {
        const decoded = await decodeImageFile(file);
        openDecodedImage(decoded);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to open image.', 'error');
      }
    }
  };

  const handlePlaceImageLayer = async () => {
    setOpenMenu(null);
    const files = await pickLocalFiles(
      'image/png,image/jpeg,image/webp,image/avif,image/bmp,image/gif,image/svg+xml',
      false
    );
    if (files.length === 0) return;
    try {
      const decoded = await decodeImageFile(files[0]);
      placeImageAsLayer(decoded);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to place image layer.', 'error');
    }
  };

  const handleOpenProject = async () => {
    setOpenMenu(null);
    const files = await pickLocalFiles('.lps,application/json', false);
    if (files.length === 0) return;
    try {
      const text = await files[0].text();
      const parsed = parseSerializedProject(JSON.parse(text));
      await openProjectData(parsed);
      showToast(`Opened project "${parsed.name}"`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not open project file.', 'error');
    }
  };

  const menus: Record<Exclude<MenuKey, null>, MenuItem[]> = {
    file: [
      { label: 'Welcome Home', action: () => setView('welcome') },
      { divider: true },
      { label: 'New Project…', shortcut: '⌘N', action: () => openModal('newProject') },
      { label: 'Open Image…', shortcut: '⌘O', action: handleOpenImage },
      { label: 'Open Project (.lps)…', action: handleOpenProject },
      { divider: true },
      {
        label: 'Save to Local Studio',
        shortcut: '⌘S',
        disabled: !activeDoc,
        action: () => void saveActiveDocumentNow(),
      },
      {
        label: 'Save Project As (.lps)…',
        shortcut: '⇧⌘S',
        disabled: !activeDoc,
        action: () => void saveProjectFileAs(),
      },
      {
        label: 'Export Image…',
        shortcut: '⌘E',
        disabled: !activeDoc,
        action: () => openModal('exportImage'),
      },
      {
        label: 'Batch Process Images…',
        action: () => {
          setOpenMenu(null);
          openModal('batchProcess');
        },
      },
      { divider: true },
      {
        label: 'Close Document',
        shortcut: '⌘W',
        disabled: !activeDoc,
        action: () => activeDoc && requestCloseDocument(activeDoc.id),
      },
    ],
    edit: [
      { label: 'Undo', shortcut: '⌘Z', disabled: !canUndo, action: undo },
      { label: 'Redo', shortcut: '⇧⌘Z', disabled: !canRedo, action: redo },
      { divider: true },
      { label: 'Cut Layer', shortcut: '⌘X', disabled: !activeDoc, action: cutActiveLayer },
      { label: 'Copy Layer', shortcut: '⌘C', disabled: !activeDoc, action: copyActiveLayer },
      {
        label: 'Copy Merged',
        shortcut: '⇧⌘C',
        disabled: !activeDoc,
        action: copyMergedToClipboard,
      },
      {
        label: 'Paste Layer',
        shortcut: '⌘V',
        disabled: !activeDoc || !clipboardLayer,
        action: pasteClipboard,
      },
      {
        label: 'Fill with Foreground',
        shortcut: '⇧⌫',
        disabled: !activeDoc,
        action: () => fillSelectionWithColor(foregroundColor, 100),
      },
      {
        label: 'Stroke Selection (FG, 2px)',
        disabled: !activeDoc,
        action: () => strokeSelectionWithColor(foregroundColor, 2, 100),
      },
      {
        label: 'Delete Selection / Layer',
        shortcut: '⌫',
        disabled: !activeDoc,
        action: deleteSelectionOrLayer,
      },
      { divider: true },
      {
        label: 'Select All',
        shortcut: '⌘A',
        disabled: !activeDoc,
        action: selectAll,
      },
      {
        label: 'Invert Selection',
        shortcut: '⇧⌘I',
        disabled: !activeDoc?.selection,
        action: invertActiveSelection,
      },
      {
        label: 'Feather Selection (6px)',
        disabled: !activeDoc?.selection,
        action: () => featherActiveSelection(6),
      },
      {
        label: 'Color Range…',
        disabled: !activeDoc,
        action: () => openModal('colorRange'),
      },
      {
        label: 'Deselect',
        shortcut: '⌘D',
        disabled: !activeDoc?.selection,
        action: clearSelection,
      },
    ],
    image: [
      {
        label: 'Resize Image…',
        disabled: !activeDoc,
        action: () => openModal('resizeImage'),
      },
      {
        label: 'Canvas Size…',
        disabled: !activeDoc,
        action: () => openModal('canvasSize'),
      },
      {
        label: 'Crop to Selection',
        disabled: !activeDoc?.selection,
        action: cropToSelection,
      },
      {
        label: 'Trim Transparent Pixels',
        disabled: !activeDoc,
        action: trimTransparentPixels,
      },
      {
        label: 'Perspective & Keystone…',
        disabled: !activeLayer || activeLayer.type !== 'raster' || activeLayer.locked,
        action: () => openModal('perspective'),
      },
      {
        label: 'Image & EXIF Metadata…',
        disabled: !activeDoc,
        action: () => openModal('exifMetadata'),
      },
      { divider: true },
      {
        label: 'Rotate 90° Clockwise',
        disabled: !activeDoc,
        action: () => rotateActiveDocument(90),
      },
      {
        label: 'Rotate 90° Counter-Clockwise',
        disabled: !activeDoc,
        action: () => rotateActiveDocument(-90),
      },
      {
        label: 'Rotate 180°',
        disabled: !activeDoc,
        action: () => rotateActiveDocument(180),
      },
      { divider: true },
      {
        label: 'Flip Horizontal',
        disabled: !activeDoc,
        action: () => flipActiveDocument('horizontal'),
      },
      {
        label: 'Flip Vertical',
        disabled: !activeDoc,
        action: () => flipActiveDocument('vertical'),
      },
      { divider: true },
      {
        label: 'Flatten Image',
        disabled: !activeDoc || activeDoc.layers.length <= 1,
        action: flattenDocument,
      },
    ],
    layer: [
      {
        label: 'New Raster Layer',
        shortcut: '⇧⌘N',
        disabled: !activeDoc,
        action: () => addRasterLayer(),
      },
      {
        label: 'New Layer Group',
        disabled: !activeDoc,
        action: () => addGroupLayer(),
      },
      {
        label: 'Add Layer Mask',
        disabled: !activeLayer || !!activeLayer.mask,
        action: () => activeLayer && addLayerMask(activeLayer.id),
      },
      {
        label: 'Mask from Selection',
        disabled: !activeLayer || !activeDoc?.selection,
        action: () => applySelectionAsMask('reveal'),
      },
      {
        label: 'Mask from Color Range…',
        disabled: !activeLayer,
        action: () => openModal('colorRange'),
      },
      {
        label: 'Remove Layer Mask',
        disabled: !activeLayer || !activeLayer.mask,
        action: () => activeLayer && deleteLayerMask(activeLayer.id),
      },
      { divider: true },
      {
        label: 'Place Image as Layer…',
        disabled: !activeDoc,
        action: handlePlaceImageLayer,
      },
      {
        label: 'New Text Layer',
        disabled: !activeDoc,
        action: () => {
          const id = addTextLayer();
          if (id) setEditingTextLayerId(id);
        },
      },
      {
        label: 'New Rectangle Shape',
        disabled: !activeDoc,
        action: () =>
          activeDoc &&
          addShapeLayer(
            activeDoc.width * 0.35,
            activeDoc.height * 0.35,
            activeDoc.width * 0.3,
            activeDoc.height * 0.3,
            'rounded-rect'
          ),
      },
      { divider: true },
      {
        label: activeDoc?.selection ? 'Layer via Copy' : 'Duplicate Layer',
        shortcut: '⌘J',
        disabled: !activeLayer,
        action: layerViaCopyOrDuplicate,
      },
      {
        label: 'Merge Down',
        disabled: !activeLayer || activeLayerIndex <= 0,
        action: () => activeLayer && mergeLayerDown(activeLayer.id),
      },
      {
        label: 'Stamp Visible',
        shortcut: '⇧⌥⌘E',
        disabled: !activeDoc,
        action: stampVisibleLayers,
      },
      {
        label: 'Rasterize Layer',
        disabled:
          !activeLayer ||
          activeLayer.locked ||
          (activeLayer.type !== 'text' && activeLayer.type !== 'shape'),
        action: rasterizeActiveLayer,
      },
      {
        label: 'Perspective & Keystone…',
        disabled: !activeLayer || activeLayer.type !== 'raster' || activeLayer.locked,
        action: () => openModal('perspective'),
      },
      {
        label: 'Copy Layer Style',
        disabled: !activeLayer,
        action: copyActiveLayerEffects,
      },
      {
        label: 'Paste Layer Style',
        disabled: !activeLayer || activeLayer.locked || !clipboardEffects,
        action: pasteActiveLayerEffects,
      },
      {
        label: 'Bring Forward',
        disabled:
          !activeLayer || !activeDoc || activeLayerIndex >= activeDoc.layers.length - 1,
        action: () => activeLayer && moveLayerOrder(activeLayer.id, 'up'),
      },
      {
        label: 'Send Backward',
        disabled: !activeLayer || activeLayerIndex <= 0,
        action: () => activeLayer && moveLayerOrder(activeLayer.id, 'down'),
      },
      { divider: true },
      {
        label: 'Delete Layer',
        disabled: !activeLayer || !activeDoc || activeDoc.layers.length <= 1,
        action: () => activeLayer && deleteLayer(activeLayer.id),
      },
    ],
    filter: [
      {
        label: 'Filter Gallery…',
        disabled: !activeLayer || activeLayer.type !== 'raster' || activeLayer.locked,
        action: () => openFilterGallery(),
      },
      {
        label: 'Liquify…',
        disabled: !activeLayer || activeLayer.type !== 'raster' || activeLayer.locked,
        action: () => openModal('liquify'),
      },
      { divider: true },
      {
        label: 'Auto Levels',
        disabled: !activeLayer || activeLayer.type !== 'raster' || activeLayer.locked,
        action: applyAutoLevelsToLayer,
      },
      {
        label: 'Auto Contrast',
        disabled: !activeLayer || activeLayer.type !== 'raster' || activeLayer.locked,
        action: applyAutoContrastToLayer,
      },
      { divider: true },
      {
        label: 'High Pass…',
        disabled: !activeLayer || activeLayer.type !== 'raster' || activeLayer.locked,
        action: () => openFilterGallery('high-pass'),
      },
      {
        label: 'Motion Blur…',
        disabled: !activeLayer || activeLayer.type !== 'raster' || activeLayer.locked,
        action: () => openFilterGallery('motion-blur'),
      },
      {
        label: 'Oil Paint…',
        disabled: !activeLayer || activeLayer.type !== 'raster' || activeLayer.locked,
        action: () => openFilterGallery('oil-paint'),
      },
      {
        label: 'Halftone Dot Screen…',
        disabled: !activeLayer || activeLayer.type !== 'raster' || activeLayer.locked,
        action: () => openFilterGallery('halftone'),
      },
      {
        label: 'Emboss…',
        disabled: !activeLayer || activeLayer.type !== 'raster' || activeLayer.locked,
        action: () => openFilterGallery('emboss'),
      },
      {
        label: 'Edge Detect…',
        disabled: !activeLayer || activeLayer.type !== 'raster' || activeLayer.locked,
        action: () => openFilterGallery('edge-detect'),
      },
    ],
    view: [
      {
        label: 'Zoom In',
        shortcut: '⌘+',
        disabled: !activeDoc,
        action: () => activeDoc && setZoom(activeDoc.zoom * 1.25),
      },
      {
        label: 'Zoom Out',
        shortcut: '⌘-',
        disabled: !activeDoc,
        action: () => activeDoc && setZoom(activeDoc.zoom / 1.25),
      },
      {
        label: 'Fit to Screen',
        shortcut: '⌘0',
        disabled: !activeDoc,
        action: requestFitZoom,
      },
      {
        label: 'Actual Pixels (100%)',
        shortcut: '⌘1',
        disabled: !activeDoc,
        action: () => setZoom(1, 0, 0),
      },
      { divider: true },
      {
        label: 'Show Rulers',
        checked: viewportSettings.showRulers,
        action: () => toggleViewportSetting('showRulers'),
      },
      {
        label: 'Show Pixel Grid',
        checked: viewportSettings.showGrid,
        action: () => toggleViewportSetting('showGrid'),
      },
      {
        label: 'Transparency Checkerboard',
        checked: viewportSettings.showTransparency,
        action: () => toggleViewportSetting('showTransparency'),
      },
      { divider: true },
      {
        label: 'Before / After Split Comparison',
        checked: viewportSettings.beforeAfterMode === 'split',
        disabled: !activeDoc,
        action: () =>
          setBeforeAfterMode(
            viewportSettings.beforeAfterMode === 'split' ? 'off' : 'split'
          ),
      },
    ],
    help: [
      {
        label: 'Keyboard Shortcuts',
        shortcut: '?',
        action: () => openModal('shortcuts'),
      },
      {
        label: 'Local Privacy & Storage Info',
        action: () => openModal('privacy'),
      },
    ],
  };

  const menuLabels: Array<{ key: Exclude<MenuKey, null>; label: string }> = [
    { key: 'file', label: 'File' },
    { key: 'edit', label: 'Edit' },
    { key: 'image', label: 'Image' },
    { key: 'layer', label: 'Layer' },
    { key: 'filter', label: 'Filter' },
    { key: 'view', label: 'View' },
    { key: 'help', label: 'Help' },
  ];

  const zoomPercent = activeDoc ? Math.round(activeDoc.zoom * 100) : 100;

  return (
    <header
      ref={menuBarRef}
      className="h-11 shrink-0 flex items-center justify-between px-3 border-b select-none z-40"
      style={{
        backgroundColor: 'var(--lp-sidebar)',
        borderColor: 'var(--lp-border)',
      }}
    >
      {/* Left: Brand & macOS Menu Bar */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={() => setView('welcome')}
          title="Welcome Screen"
          className="flex items-center px-1.5 py-1 rounded-md hover:bg-[var(--lp-hover)] transition-colors cursor-pointer shrink-0"
        >
          <BrandMark size="sm" />
        </button>

        <div className="h-4 w-px bg-[var(--lp-border)] mx-0.5 shrink-0" />

        <nav className="flex items-center gap-0.5 relative">
          {menuLabels.map((m) => (
            <div key={m.key} className="relative">
              <button
                type="button"
                onClick={() => setOpenMenu(openMenu === m.key ? null : m.key)}
                onMouseEnter={() => {
                  if (openMenu !== null) setOpenMenu(m.key);
                }}
                className={`px-2 py-1 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  openMenu === m.key
                    ? 'bg-[#0A84FF] text-white'
                    : 'text-[var(--lp-text)] hover:bg-[var(--lp-hover)]'
                }`}
              >
                {m.label}
              </button>

              {openMenu === m.key && (
                <div
                  className="absolute left-0 top-full mt-1 w-60 rounded-lg border py-1 z-50 shadow-xl backdrop-blur-md"
                  style={{
                    backgroundColor: 'var(--lp-panel)',
                    borderColor: 'var(--lp-border-strong)',
                  }}
                >
                  {menus[m.key].map((item, idx) =>
                    item.divider ? (
                      <div
                        key={`div-${idx}`}
                        className="my-1 h-px"
                        style={{ backgroundColor: 'var(--lp-border)' }}
                      />
                    ) : (
                      <button
                        key={item.label}
                        type="button"
                        disabled={item.disabled}
                        onClick={() => {
                          setOpenMenu(null);
                          item.action?.();
                        }}
                        className="w-full px-3 py-1.5 text-left text-[12px] flex items-center justify-between gap-4 disabled:opacity-35 disabled:cursor-not-allowed hover:bg-[#0A84FF] hover:text-white transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className="w-3.5 inline-flex justify-center shrink-0">
                            {item.checked ? <Check className="w-3 h-3" /> : null}
                          </span>
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.shortcut && (
                          <span className="text-[11px] opacity-65 font-mono-tabular shrink-0">
                            {item.shortcut}
                          </span>
                        )}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Center: Undo/Redo & Active Document Status */}
      <div className="hidden lg:flex items-center gap-3 min-w-0">
        {view === 'editor' && activeDoc ? (
          <>
            <div className="flex items-center gap-0.5 rounded-md border px-0.5 py-0.5" style={{ borderColor: 'var(--lp-border)' }}>
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                title="Undo (⌘Z)"
                className="p-1 rounded hover:bg-[var(--lp-hover)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                title="Redo (⇧⌘Z)"
                className="p-1 rounded hover:bg-[var(--lp-hover)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-[12px] min-w-0">
              <span className="font-medium truncate max-w-[200px]">{activeDoc.name}</span>
              <span className="text-[var(--lp-text-secondary)]">·</span>
              <span className="text-[11px] text-[var(--lp-text-secondary)] font-mono-tabular whitespace-nowrap">
                {activeDoc.width} × {activeDoc.height}
              </span>
              <span className="text-[var(--lp-text-secondary)]">·</span>
              <span className="text-[11px] text-[var(--lp-text-secondary)] whitespace-nowrap">
                {saveStatus === 'saving'
                  ? 'Saving locally…'
                  : activeDoc.dirty
                    ? 'Modified'
                    : 'Saved locally'}
              </span>
            </div>
          </>
        ) : (
          <span className="text-[12px] text-[var(--lp-text-secondary)]">
            Your images. Your device. Your control.
          </span>
        )}
      </div>

      {/* Right: Zoom, Appearance & Primary Export */}
      <div className="flex items-center gap-2 shrink-0">
        {view === 'editor' && activeDoc && (
          <div className="flex items-center gap-1 rounded-md border px-1.5 py-0.5" style={{ borderColor: 'var(--lp-border)' }}>
            <button
              type="button"
              onClick={() => setZoom(activeDoc.zoom / 1.25)}
              title="Zoom Out (⌘-)"
              className="px-1.5 py-0.5 text-[12px] rounded hover:bg-[var(--lp-hover)] cursor-pointer"
            >
              −
            </button>
            <button
              type="button"
              onClick={requestFitZoom}
              title="Click to Fit Canvas (⌘0)"
              className="px-1.5 py-0.5 text-[11px] font-mono-tabular rounded hover:bg-[var(--lp-hover)] cursor-pointer min-w-[46px] text-center"
            >
              {zoomPercent}%
            </button>
            <button
              type="button"
              onClick={() => setZoom(activeDoc.zoom * 1.25)}
              title="Zoom In (⌘+)"
              className="px-1.5 py-0.5 text-[12px] rounded hover:bg-[var(--lp-hover)] cursor-pointer"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setZoom(1, 0, 0)}
              title="Actual Pixels 100% (⌘1)"
              className="px-1.5 py-0.5 text-[11px] text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] rounded hover:bg-[var(--lp-hover)] cursor-pointer"
            >
              1:1
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => openModal('commandPalette')}
          title="Command Palette (⌘K)"
          className="px-2 py-1 rounded-md border hover:bg-[var(--lp-hover)] transition-colors cursor-pointer flex items-center gap-1.5 text-[11px] text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] whitespace-nowrap shrink-0"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <Search className="w-3 h-3" />
          <span className="hidden md:inline">Commands</span>
          <kbd className="font-mono-tabular text-[10px] opacity-75">⌘K</kbd>
        </button>

        {view === 'editor' && (
          <button
            type="button"
            onClick={() => setView('welcome')}
            title="Home Screen"
            className="p-1.5 rounded-md border hover:bg-[var(--lp-hover)] transition-colors cursor-pointer"
            style={{ borderColor: 'var(--lp-border)' }}
          >
            <Home className="w-3.5 h-3.5" />
          </button>
        )}

        <PWAInstallButton />

        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Appearance' : 'Switch to Dark Graphite'}
          className="p-1.5 rounded-md border hover:bg-[var(--lp-hover)] transition-colors cursor-pointer"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          {theme === 'dark' ? (
            <Sun className="w-3.5 h-3.5" />
          ) : (
            <Moon className="w-3.5 h-3.5" />
          )}
        </button>

        {activeDoc && (
          <button
            type="button"
            onClick={() => openModal('exportImage')}
            className="px-3 py-1 rounded-md bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-[12px] font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
            <ChevronDown className="w-3 h-3 opacity-80" />
          </button>
        )}
      </div>
    </header>
  );
};
