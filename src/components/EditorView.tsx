import React from 'react';
import { BottomStatusBar } from './BottomStatusBar';
import { CanvasWorkspace } from './CanvasWorkspace';
import { DocumentTabs } from './DocumentTabs';
import { LeftToolSidebar } from './LeftToolSidebar';
import { RightInspector } from './RightInspector';
import { ToolOptionsBar } from './ToolOptionsBar';

interface EditorViewProps {
  /** Called when the user starts dragging the inspector's resize handle. */
  onInspectorResizeStart: (clientX: number) => void;
}

/**
 * The full editing layout. Kept in its own module so it can be loaded lazily:
 * the welcome screen does not need the canvas engine UI to render.
 */
const EditorView: React.FC<EditorViewProps> = ({ onInspectorResizeStart }) => (
  <>
    <DocumentTabs />
    <ToolOptionsBar />
    <div className="flex-1 flex min-h-0 overflow-hidden">
      <LeftToolSidebar />
      <CanvasWorkspace />
      <div
        onMouseDown={(e) => onInspectorResizeStart(e.clientX)}
        title="Drag to resize inspector"
        className="w-1 shrink-0 cursor-col-resize hover:bg-[#0A84FF]/60 transition-colors"
      />
      <RightInspector />
    </div>
    <BottomStatusBar />
  </>
);

export default EditorView;
