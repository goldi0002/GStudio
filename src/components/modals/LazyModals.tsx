import React, { lazy, Suspense, useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';

type ModalState = ReturnType<typeof useEditorStore.getState>['modals'];

const NewProjectModal = lazy(() =>
  import('./NewProjectModal').then((m) => ({ default: m.NewProjectModal }))
);
const ResizeImageModal = lazy(() =>
  import('./ResizeImageModal').then((m) => ({ default: m.ResizeImageModal }))
);
const CanvasSizeModal = lazy(() =>
  import('./CanvasSizeModal').then((m) => ({ default: m.CanvasSizeModal }))
);
const ExportModal = lazy(() => import('./ExportModal').then((m) => ({ default: m.ExportModal })));
const BatchProcessModal = lazy(() =>
  import('./BatchProcessModal').then((m) => ({ default: m.BatchProcessModal }))
);
const FilterGalleryModal = lazy(() =>
  import('./FilterGalleryModal').then((m) => ({ default: m.FilterGalleryModal }))
);
const PerspectiveModal = lazy(() =>
  import('./PerspectiveModal').then((m) => ({ default: m.PerspectiveModal }))
);
const ShortcutsPrivacyModal = lazy(() =>
  import('./ShortcutsPrivacyModal').then((m) => ({ default: m.ShortcutsPrivacyModal }))
);
const TextEditModal = lazy(() =>
  import('./TextEditModal').then((m) => ({ default: m.TextEditModal }))
);
const LiquifyModal = lazy(() =>
  import('./LiquifyModal').then((m) => ({ default: m.LiquifyModal }))
);
const ColorRangeModal = lazy(() =>
  import('./ColorRangeModal').then((m) => ({ default: m.ColorRangeModal }))
);
const CommandPaletteModal = lazy(() =>
  import('./CommandPaletteModal').then((m) => ({ default: m.CommandPaletteModal }))
);
const ExifMetadataModal = lazy(() =>
  import('./ExifMetadataModal').then((m) => ({ default: m.ExifMetadataModal }))
);

const MODALS: Array<{ isOpen: (m: ModalState) => boolean; Component: React.ComponentType }> = [
  { isOpen: (m) => m.newProject, Component: NewProjectModal },
  { isOpen: (m) => m.resizeImage, Component: ResizeImageModal },
  { isOpen: (m) => m.canvasSize, Component: CanvasSizeModal },
  { isOpen: (m) => m.exportImage, Component: ExportModal },
  { isOpen: (m) => m.batchProcess, Component: BatchProcessModal },
  { isOpen: (m) => m.filterGallery, Component: FilterGalleryModal },
  { isOpen: (m) => m.perspective, Component: PerspectiveModal },
  { isOpen: (m) => m.liquify, Component: LiquifyModal },
  { isOpen: (m) => m.colorRange, Component: ColorRangeModal },
  { isOpen: (m) => m.commandPalette, Component: CommandPaletteModal },
  { isOpen: (m) => m.shortcuts || m.privacy, Component: ShortcutsPrivacyModal },
  { isOpen: (m) => m.exifMetadata, Component: ExifMetadataModal },
  { isOpen: (m) => m.editingTextLayerId != null, Component: TextEditModal },
];

/**
 * Loads a modal's code the first time it opens, then keeps it mounted so its
 * internal state (e.g. the batch queue) survives closing and reopening —
 * matching the behaviour of the previously always-mounted modals.
 */
const LazyModal: React.FC<{ open: boolean; Component: React.ComponentType }> = ({
  open,
  Component,
}) => {
  const [loaded, setLoaded] = useState(open);
  if (open && !loaded) setLoaded(true);
  if (!loaded) return null;
  return (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  );
};

export const LazyModals: React.FC = () => {
  const modals = useEditorStore((s) => s.modals);
  return (
    <>
      {MODALS.map(({ isOpen, Component }, i) => (
        <LazyModal key={i} open={isOpen(modals)} Component={Component} />
      ))}
    </>
  );
};
