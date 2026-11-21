import React, { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { BottomStatusBar } from './components/BottomStatusBar';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { DocumentTabs } from './components/DocumentTabs';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LeftToolSidebar } from './components/LeftToolSidebar';
import { ExportModal } from './components/modals/ExportModal';
import { NewProjectModal } from './components/modals/NewProjectModal';
import { ResizeImageModal } from './components/modals/ResizeImageModal';
import { ShortcutsPrivacyModal } from './components/modals/ShortcutsPrivacyModal';
import { TextEditModal } from './components/modals/TextEditModal';
import { RightInspector } from './components/RightInspector';
import { ToolOptionsBar } from './components/ToolOptionsBar';
import { TopToolbar } from './components/TopToolbar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { decodeImageFile, pickLocalFiles } from './persistence/fileAccess';
import { useEditorStore } from './store/useEditorStore';
import type { SerializedProject, ToolId } from './types/editor';

const TOOL_SHORTCUTS: Record<string, ToolId> = {
  v: 'move',
  m: 'marquee-rect',
  o: 'marquee-ellipse',
  l: 'lasso',
  w: 'magic-wand',
  c: 'crop',
  b: 'brush',
  e: 'eraser',
  g: 'bucket',
  k: 'gradient',
  s: 'clone-stamp',
  j: 'spot-heal',
  t: 'text',
  u: 'shape',
  i: 'eyedropper',
  h: 'hand',
  z: 'zoom',
};

function StudioShell() {
  const {
    view,
    documents,
    activeDocumentId,
    activeTool,
    toolOptions,
    viewportSettings,
    foregroundColor,
    clipboardLayer,
    preferInternalClipboard,
    inspectorWidth,
    toast,
    initializeApp,
    setActiveTool,
    updateToolOptions,
    setBeforeAfterMode,
    undo,
    redo,
    setZoom,
    requestFitZoom,
    openModal,
    closeDocument,
    saveActiveDocumentNow,
    saveProjectFileAs,
    openDecodedImage,
    placeImageAsLayer,
    openProjectData,
    addRasterLayer,
    layerViaCopyOrDuplicate,
    nudgeActiveLayer,
    copyActiveLayer,
    copyMergedToClipboard,
    cutActiveLayer,
    pasteClipboard,
    setPreferInternalClipboard,
    selectAll,
    invertActiveSelection,
    clearSelection,
    deleteSelectionOrLayer,
    fillSelectionWithColor,
    swapColors,
    setInspectorWidth,
    clearToast,
    showToast,
  } = useEditorStore();

  const [globalDragActive, setGlobalDragActive] = useState(false);
  const resizingRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    void initializeApp();
  }, [initializeApp]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && key === 'n') {
        e.preventDefault();
        if (e.shiftKey && view === 'editor' && activeDocumentId) {
          addRasterLayer();
        } else {
          openModal('newProject');
        }
        return;
      }
      if (mod && key === 'w' && view === 'editor' && activeDocumentId) {
        e.preventDefault();
        closeDocument(activeDocumentId);
        return;
      }
      if (mod && key === 'j' && view === 'editor' && activeDocumentId) {
        e.preventDefault();
        layerViaCopyOrDuplicate();
        return;
      }
      if (mod && key === 'o') {
        e.preventDefault();
        const files = await pickLocalFiles(
          'image/png,image/jpeg,image/webp,image/avif,image/bmp,image/gif,image/svg+xml',
          true
        );
        for (const f of files) {
          try {
            openDecodedImage(await decodeImageFile(f));
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'Unable to open image.', 'error');
          }
        }
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        if (e.shiftKey) void saveProjectFileAs();
        else void saveActiveDocumentNow();
        return;
      }
      if (mod && key === 'e') {
        e.preventDefault();
        if (activeDocumentId) openModal('exportImage');
        return;
      }
      if (mod && key === '0') {
        e.preventDefault();
        requestFitZoom();
        return;
      }
      if (mod && key === '1') {
        e.preventDefault();
        setZoom(1, 0, 0);
        return;
      }
      if (mod && (key === '=' || key === '+')) {
        e.preventDefault();
        const doc = documents.find((d) => d.id === activeDocumentId);
        if (doc) setZoom(doc.zoom * 1.25);
        return;
      }
      if (mod && key === '-') {
        e.preventDefault();
        const doc = documents.find((d) => d.id === activeDocumentId);
        if (doc) setZoom(doc.zoom / 1.25);
        return;
      }
      if (mod && key === 'c') {
        e.preventDefault();
        if (e.shiftKey && view === 'editor') copyMergedToClipboard();
        else copyActiveLayer();
        return;
      }
      if (mod && key === 'x') {
        e.preventDefault();
        cutActiveLayer();
        return;
      }
      if (mod && key === 'v') {
        if (preferInternalClipboard && clipboardLayer) {
          e.preventDefault();
          pasteClipboard();
        }
        return;
      }
      if (mod && key === 'a' && view === 'editor') {
        e.preventDefault();
        selectAll();
        return;
      }
      if (mod && e.shiftKey && key === 'i' && view === 'editor') {
        e.preventDefault();
        invertActiveSelection();
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        clearSelection();
        return;
      }
      if (!mod && (e.key === 'Backspace' || e.key === 'Delete')) {
        if (view === 'editor') {
          e.preventDefault();
          if (e.shiftKey) {
            fillSelectionWithColor(foregroundColor, 100);
          } else {
            deleteSelectionOrLayer();
          }
        }
        return;
      }
      if (
        !mod &&
        view === 'editor' &&
        activeDocumentId &&
        (e.key === 'ArrowUp' ||
          e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight')
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        nudgeActiveLayer(dx, dy);
        return;
      }
      if (!mod && e.key === '[') {
        if (activeTool === 'brush') {
          updateToolOptions({ brushSize: Math.max(1, toolOptions.brushSize - 4) });
        } else if (activeTool === 'eraser') {
          updateToolOptions({ eraserSize: Math.max(2, toolOptions.eraserSize - 4) });
        } else if (activeTool === 'clone-stamp') {
          updateToolOptions({ cloneSize: Math.max(2, toolOptions.cloneSize - 4) });
        } else if (activeTool === 'spot-heal') {
          updateToolOptions({ healSize: Math.max(2, toolOptions.healSize - 4) });
        }
        return;
      }
      if (!mod && e.key === ']') {
        if (activeTool === 'brush') {
          updateToolOptions({ brushSize: Math.min(200, toolOptions.brushSize + 4) });
        } else if (activeTool === 'eraser') {
          updateToolOptions({ eraserSize: Math.min(200, toolOptions.eraserSize + 4) });
        } else if (activeTool === 'clone-stamp') {
          updateToolOptions({ cloneSize: Math.min(200, toolOptions.cloneSize + 4) });
        } else if (activeTool === 'spot-heal') {
          updateToolOptions({ healSize: Math.min(150, toolOptions.healSize + 4) });
        }
        return;
      }
      if (!mod && e.key === '\\' && view === 'editor') {
        setBeforeAfterMode(viewportSettings.beforeAfterMode === 'split' ? 'off' : 'split');
        return;
      }
      if (!mod && e.key === '?') {
        openModal('shortcuts');
        return;
      }
      if (!mod && key === 'x' && view === 'editor') {
        swapColors();
        return;
      }
      if (!mod && TOOL_SHORTCUTS[key] && view === 'editor') {
        setActiveTool(TOOL_SHORTCUTS[key]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    view,
    documents,
    activeDocumentId,
    activeTool,
    toolOptions.brushSize,
    toolOptions.eraserSize,
    toolOptions.cloneSize,
    toolOptions.healSize,
    viewportSettings.beforeAfterMode,
    foregroundColor,
    clipboardLayer,
    preferInternalClipboard,
    undo,
    redo,
    openModal,
    closeDocument,
    openDecodedImage,
    saveActiveDocumentNow,
    saveProjectFileAs,
    requestFitZoom,
    setZoom,
    addRasterLayer,
    layerViaCopyOrDuplicate,
    nudgeActiveLayer,
    copyActiveLayer,
    copyMergedToClipboard,
    cutActiveLayer,
    pasteClipboard,
    selectAll,
    invertActiveSelection,
    clearSelection,
    deleteSelectionOrLayer,
    fillSelectionWithColor,
    swapColors,
    setActiveTool,
    updateToolOptions,
    setBeforeAfterMode,
    showToast,
  ]);

  // Native OS Clipboard Image Paste & External Clipboard Focus Sync
  useEffect(() => {
    const resetInternalPref = () => {
      setPreferInternalClipboard(false);
    };

    const onPaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }

      const items = Array.from(e.clipboardData?.items ?? []);
      const imgItem = items.find((item) => item.type.startsWith('image/'));
      if (imgItem) {
        const file = imgItem.getAsFile();
        if (file) {
          e.preventDefault();
          try {
            const decoded = await decodeImageFile(file);
            if (view === 'editor' && activeDocumentId) {
              placeImageAsLayer({ ...decoded, name: 'Pasted Image' });
            } else {
              openDecodedImage({ ...decoded, name: 'Pasted Image' });
            }
            showToast('Pasted image from clipboard', 'success');
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'Unable to paste image.', 'error');
          }
          return;
        }
      }

      if (clipboardLayer && view === 'editor' && activeDocumentId) {
        e.preventDefault();
        pasteClipboard();
      }
    };

    window.addEventListener('blur', resetInternalPref);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('blur', resetInternalPref);
      window.removeEventListener('paste', onPaste);
    };
  }, [
    view,
    activeDocumentId,
    clipboardLayer,
    openDecodedImage,
    placeImageAsLayer,
    pasteClipboard,
    setPreferInternalClipboard,
    showToast,
  ]);

  // Inspector width drag resize
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const dx = resizingRef.current.startX - e.clientX;
      setInspectorWidth(resizingRef.current.startW + dx);
    };
    const onUp = () => {
      resizingRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setInspectorWidth]);

  const handleGlobalDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setGlobalDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.lps')) {
        try {
          const text = await file.text();
          const parsed = JSON.parse(text) as SerializedProject;
          await openProjectData(parsed);
        } catch {
          showToast(`Failed to open project "${file.name}".`, 'error');
        }
      } else {
        try {
          const decoded = await decodeImageFile(file);
          openDecodedImage(decoded);
        } catch {
          showToast(`Unsupported file "${file.name}".`, 'error');
        }
      }
    }
  };

  return (
    <div
      onDragOver={(e) => {
        if (view === 'editor' && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setGlobalDragActive(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setGlobalDragActive(false);
      }}
      onDrop={handleGlobalDrop}
      className="h-screen w-screen flex flex-col overflow-hidden relative"
      style={{
        backgroundColor: 'var(--lp-bg)',
        color: 'var(--lp-text)',
      }}
    >
      {globalDragActive && view === 'editor' && (
        <div className="absolute inset-0 z-50 bg-[#0A84FF]/15 backdrop-blur-xs border-2 border-dashed border-[#0A84FF] flex items-center justify-center pointer-events-none">
          <div
            className="px-6 py-4 rounded-xl border text-center"
            style={{
              backgroundColor: 'var(--lp-panel)',
              borderColor: 'var(--lp-border-strong)',
            }}
          >
            <Upload className="w-6 h-6 text-[#0A84FF] mx-auto mb-2" />
            <p className="text-sm font-semibold">Drop image or .lps project to open in new tab</p>
          </div>
        </div>
      )}

      <TopToolbar />

      {view === 'welcome' || !activeDocumentId ? (
        <WelcomeScreen />
      ) : (
        <>
          <DocumentTabs />
          <ToolOptionsBar />
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <LeftToolSidebar />
            <CanvasWorkspace />
            <div
              onMouseDown={(e) => {
                resizingRef.current = { startX: e.clientX, startW: inspectorWidth };
              }}
              title="Drag to resize inspector"
              className="w-1 shrink-0 cursor-col-resize hover:bg-[#0A84FF]/60 transition-colors"
            />
            <RightInspector />
          </div>
          <BottomStatusBar />
        </>
      )}

      {/* Modals */}
      <NewProjectModal />
      <ResizeImageModal />
      <ExportModal />
      <ShortcutsPrivacyModal />
      <TextEditModal />

      {/* Toast Feedback */}
      {toast && (
        <div
          onClick={clearToast}
          className="fixed bottom-9 left-1/2 -translate-x-1/2 z-50 px-3.5 py-2 rounded-lg border shadow-xl text-[12px] flex items-center gap-2 cursor-pointer backdrop-blur-md"
          style={{
            backgroundColor: 'var(--lp-panel)',
            borderColor:
              toast.kind === 'error'
                ? '#FF453A'
                : toast.kind === 'success'
                  ? '#30D158'
                  : 'var(--lp-border-strong)',
          }}
        >
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <StudioShell />
    </ErrorBoundary>
  );
}
