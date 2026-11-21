import React from 'react';
import {
  ArrowLeftRight,
  Bandage,
  Blend,
  Circle,
  Crop,
  Eraser,
  Hand,
  Lasso,
  MousePointer2,
  PaintBucket,
  Paintbrush,
  Pipette,
  Search,
  Shapes,
  SquareDashed,
  Stamp,
  Type,
  Wand2,
} from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';
import type { ToolId } from '../types/editor';

interface ToolDef {
  id: ToolId;
  label: string;
  shortcut: string;
  icon: React.FC<{ className?: string }>;
  dividerAfter?: boolean;
}

const TOOLS: ToolDef[] = [
  { id: 'move', label: 'Move & Transform', shortcut: 'V', icon: MousePointer2 },
  { id: 'marquee-rect', label: 'Rectangular Marquee', shortcut: 'M', icon: SquareDashed },
  { id: 'marquee-ellipse', label: 'Elliptical Marquee', shortcut: 'O', icon: Circle },
  { id: 'lasso', label: 'Lasso Selection', shortcut: 'L', icon: Lasso },
  {
    id: 'magic-wand',
    label: 'Magic Wand Selection',
    shortcut: 'W',
    icon: Wand2,
    dividerAfter: true,
  },
  { id: 'crop', label: 'Crop Image', shortcut: 'C', icon: Crop, dividerAfter: true },
  { id: 'brush', label: 'Brush', shortcut: 'B', icon: Paintbrush },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: Eraser },
  { id: 'bucket', label: 'Paint Bucket Fill', shortcut: 'G', icon: PaintBucket },
  {
    id: 'gradient',
    label: 'Gradient Fill',
    shortcut: 'K',
    icon: Blend,
  },
  { id: 'clone-stamp', label: 'Clone Stamp', shortcut: 'S', icon: Stamp },
  {
    id: 'spot-heal',
    label: 'Spot Healing Brush',
    shortcut: 'J',
    icon: Bandage,
    dividerAfter: true,
  },
  { id: 'text', label: 'Text Tool', shortcut: 'T', icon: Type },
  { id: 'shape', label: 'Shape Tool', shortcut: 'U', icon: Shapes, dividerAfter: true },
  { id: 'eyedropper', label: 'Eyedropper', shortcut: 'I', icon: Pipette },
  { id: 'hand', label: 'Hand / Pan', shortcut: 'H', icon: Hand },
  { id: 'zoom', label: 'Zoom', shortcut: 'Z', icon: Search },
];

export const LeftToolSidebar: React.FC = () => {
  const {
    activeTool,
    setActiveTool,
    foregroundColor,
    backgroundColor,
    setForegroundColor,
    setBackgroundColor,
    swapColors,
  } = useEditorStore();

  return (
    <aside
      className="w-12 shrink-0 flex flex-col items-center py-2 border-r select-none z-20 overflow-y-auto"
      style={{
        backgroundColor: 'var(--lp-sidebar)',
        borderColor: 'var(--lp-border)',
      }}
    >
      <div className="flex flex-col items-center gap-0.5 w-full px-1.5">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const active = activeTool === tool.id;
          return (
            <React.Fragment key={tool.id}>
              <button
                type="button"
                onClick={() => setActiveTool(tool.id)}
                title={`${tool.label} (${tool.shortcut})`}
                aria-label={`${tool.label} (${tool.shortcut})`}
                className={`w-9 h-8 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#0A84FF] text-white'
                    : 'text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] hover:bg-[var(--lp-hover)]'
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
              {tool.dividerAfter && (
                <div
                  className="w-6 h-px my-1"
                  style={{ backgroundColor: 'var(--lp-border)' }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Foreground / Background Color Swatches */}
      <div className="mt-auto pt-3 flex flex-col items-center gap-1.5">
        <div className="relative w-8 h-8">
          <label
            title={`Background: ${backgroundColor} (Click to change)`}
            className="absolute right-0 bottom-0 w-4 h-4 rounded-sm border cursor-pointer overflow-hidden block"
            style={{
              backgroundColor: backgroundColor,
              borderColor: 'var(--lp-border-strong)',
            }}
          >
            <input
              type="color"
              value={backgroundColor}
              onChange={(e) => setBackgroundColor(e.target.value)}
              className="opacity-0 w-full h-full cursor-pointer"
            />
          </label>
          <label
            title={`Foreground: ${foregroundColor} (Click to change)`}
            className="absolute left-0 top-0 w-5 h-5 rounded-sm border shadow-sm cursor-pointer overflow-hidden block"
            style={{
              backgroundColor: foregroundColor,
              borderColor: 'rgba(255,255,255,0.45)',
            }}
          >
            <input
              type="color"
              value={foregroundColor}
              onChange={(e) => setForegroundColor(e.target.value)}
              className="opacity-0 w-full h-full cursor-pointer"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={swapColors}
          title="Swap Foreground / Background (X)"
          className="p-1 rounded text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] hover:bg-[var(--lp-hover)] cursor-pointer"
        >
          <ArrowLeftRight className="w-3 h-3" />
        </button>
      </div>
    </aside>
  );
};
