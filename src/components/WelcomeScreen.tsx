import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Clock,
  FileImage,
  FolderOpen,
  HardDrive,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import { getSampleThumbnail, SAMPLE_PRESETS } from '../engine/sampleImages';
import {
  decodeImageFile,
  detectLocalCapabilities,
  pickLocalFiles,
} from '../persistence/fileAccess';
import { estimateStorageUsage } from '../persistence/indexedDb';
import { useEditorStore } from '../store/useEditorStore';
import type { SerializedProject } from '../types/editor';

const QUICK_FORMATS = [
  { label: 'Instagram Square', w: 1080, h: 1080, bg: '#FFFFFF' },
  { label: 'Portrait 4:5', w: 1080, h: 1350, bg: '#FFFFFF' },
  { label: 'Story 9:16', w: 1080, h: 1920, bg: '#141414' },
  { label: 'Widescreen 16:9', w: 1920, h: 1080, bg: '#141414' },
  { label: 'Photo 3:2', w: 1800, h: 1200, bg: '#FFFFFF' },
  { label: 'Transparent Icon', w: 1024, h: 1024, bg: 'transparent' },
];

export const WelcomeScreen: React.FC = () => {
  const {
    documents,
    setView,
    openModal,
    createDocument,
    openDecodedImage,
    openSamplePreset,
    openProjectData,
    openRecentProject,
    deleteRecentProject,
    recentProjects,
    showToast,
  } = useEditorStore();

  const [dragActive, setDragActive] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{
    usageBytes: number;
    quotaBytes: number;
  } | null>(null);
  const [activeNav, setActiveNav] = useState<'all' | 'recent' | 'samples' | 'storage'>('all');

  const caps = useMemo(() => detectLocalCapabilities(), []);

  useEffect(() => {
    void estimateStorageUsage().then(setStorageInfo);
  }, [recentProjects.length]);

  const handleOpenImages = async () => {
    const files = await pickLocalFiles(
      'image/png,image/jpeg,image/webp,image/avif,image/bmp,image/gif,image/svg+xml',
      true
    );
    for (const file of files) {
      try {
        const decoded = await decodeImageFile(file);
        openDecodedImage(decoded);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Unable to open image.', 'error');
      }
    }
  };

  const handleOpenProject = async () => {
    const files = await pickLocalFiles('.lps,application/json', false);
    if (files.length === 0) return;
    try {
      const text = await files[0].text();
      const parsed = JSON.parse(text) as SerializedProject;
      if (parsed.formatVersion !== 1 || !Array.isArray(parsed.layers)) {
        throw new Error('Invalid .lps project file.');
      }
      await openProjectData(parsed);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to open project.', 'error');
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
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

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  };

  const latestRecent = recentProjects[0] ?? null;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      className="flex-1 flex overflow-hidden relative select-none mac-workspace-well"
    >
      {/* Drag Overlay */}
      {dragActive && (
        <div className="absolute inset-0 z-50 bg-[#0A84FF]/15 backdrop-blur-xs border-2 border-dashed border-[#0A84FF] flex items-center justify-center pointer-events-none">
          <div
            className="px-6 py-4 rounded-xl border text-center"
            style={{
              backgroundColor: 'var(--lp-panel)',
              borderColor: 'var(--lp-border-strong)',
            }}
          >
            <Upload className="w-6 h-6 text-[#0A84FF] mx-auto mb-2" />
            <p className="text-sm font-semibold">Drop image or .lps project to open locally</p>
            <p className="text-xs text-[var(--lp-text-secondary)] mt-0.5">
              Decoded directly on your device
            </p>
          </div>
        </div>
      )}

      {/* Left Sidebar Navigation */}
      <aside
        className="w-60 shrink-0 border-r p-4 flex flex-col justify-between"
        style={{
          backgroundColor: 'var(--lp-sidebar)',
          borderColor: 'var(--lp-border)',
        }}
      >
        <div className="space-y-5">
          <BrandMark size="md" showSubtitle />

          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => openModal('newProject')}
              className="w-full py-2 px-3 rounded-lg bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-[12px] font-medium flex items-center justify-between transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                <span>New Project</span>
              </span>
              <span className="text-[10px] opacity-80 font-mono-tabular">⌘N</span>
            </button>
            <button
              type="button"
              onClick={handleOpenImages}
              className="w-full py-2 px-3 rounded-lg border hover:bg-[var(--lp-hover)] text-[12px] font-medium flex items-center justify-between transition-colors cursor-pointer"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              <span className="flex items-center gap-2">
                <FileImage className="w-4 h-4 text-[var(--lp-text-secondary)]" />
                <span>Open Image…</span>
              </span>
              <span className="text-[10px] text-[var(--lp-text-secondary)] font-mono-tabular">
                ⌘O
              </span>
            </button>
            <button
              type="button"
              onClick={handleOpenProject}
              className="w-full py-2 px-3 rounded-lg border hover:bg-[var(--lp-hover)] text-[12px] font-medium flex items-center gap-2 transition-colors cursor-pointer"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              <FolderOpen className="w-4 h-4 text-[var(--lp-text-secondary)]" />
              <span>Open Project (.lps)…</span>
            </button>
            {documents.length > 0 && (
              <button
                type="button"
                onClick={() => setView('editor')}
                className="w-full py-2 px-3 rounded-lg bg-[var(--lp-active-surface)] text-[#0A84FF] text-[12px] font-medium flex items-center justify-between transition-colors cursor-pointer"
              >
                <span>Active Workspace ({documents.length})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <nav className="space-y-0.5 pt-3 border-t" style={{ borderColor: 'var(--lp-border)' }}>
            {(
              [
                ['all', 'Home Overview'],
                ['recent', `Recent Projects (${recentProjects.length})`],
                ['samples', 'Studio Samples'],
                ['storage', 'Formats & Storage'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveNav(id)}
                className={`w-full px-2.5 py-1.5 rounded-md text-left text-[12px] cursor-pointer transition-colors ${
                  activeNav === id
                    ? 'bg-[var(--lp-hover)] font-medium text-[var(--lp-text)]'
                    : 'text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)]'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div
          className="pt-3 border-t text-[11px] text-[var(--lp-text-secondary)] space-y-1.5"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <div className="flex items-center gap-1.5 text-[var(--lp-text)] font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-[#30D158]" />
            <span>Private & Offline Ready</span>
          </div>
          <p className="leading-relaxed">
            Your images. Your device. Your control. No cloud uploads or accounts required.
          </p>
        </div>
      </aside>

      {/* Main Content Stage */}
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-5xl mx-auto space-y-7">
          {/* Welcome Hero + Dropzone + Resume CTA */}
          {activeNav === 'all' && (
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h2 className="text-[22px] font-semibold tracking-tight">
                    Ready to edit locally
                  </h2>
                  <p className="text-[13px] text-[var(--lp-text-secondary)] mt-0.5">
                    Drop any photo to start immediately, pick a common canvas size, or try a bundled sample.
                  </p>
                </div>

                {latestRecent && (
                  <button
                    type="button"
                    onClick={() => void openRecentProject(latestRecent.id)}
                    className="px-3.5 py-2 rounded-lg border hover:border-[#0A84FF] flex items-center gap-2.5 text-left transition-colors cursor-pointer shrink-0"
                    style={{
                      backgroundColor: 'var(--lp-panel)',
                      borderColor: 'var(--lp-border-strong)',
                    }}
                  >
                    <Clock className="w-3.5 h-3.5 text-[#0A84FF] shrink-0" />
                    <div className="text-[11px]">
                      <div className="font-medium truncate max-w-[150px]">
                        Resume: {latestRecent.name}
                      </div>
                      <div className="text-[var(--lp-text-secondary)] font-mono-tabular">
                        {latestRecent.width}×{latestRecent.height} · {formatTime(latestRecent.updatedAt)}
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {/* Primary 3 Action Cards + Drop Zone */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={handleOpenImages}
                  className="rounded-xl border border-dashed p-4 text-left hover:border-[#0A84FF] transition-colors cursor-pointer flex items-start gap-3"
                  style={{
                    backgroundColor: 'var(--lp-panel)',
                    borderColor: 'var(--lp-border-strong)',
                  }}
                >
                  <div className="w-9 h-9 rounded-lg bg-[#0A84FF]/12 text-[#0A84FF] flex items-center justify-center shrink-0">
                    <Upload className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold">Open or Drop Photo</div>
                    <p className="text-[11px] text-[var(--lp-text-secondary)] mt-0.5 leading-snug">
                      JPEG, PNG, WebP, AVIF, BMP, GIF, or SVG from your device
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => openModal('newProject')}
                  className="rounded-xl border p-4 text-left hover:border-[#0A84FF] transition-colors cursor-pointer flex items-start gap-3"
                  style={{
                    backgroundColor: 'var(--lp-panel)',
                    borderColor: 'var(--lp-border)',
                  }}
                >
                  <div className="w-9 h-9 rounded-lg bg-[var(--lp-hover)] text-[var(--lp-text)] flex items-center justify-center shrink-0">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold">Custom Blank Canvas</div>
                    <p className="text-[11px] text-[var(--lp-text-secondary)] mt-0.5 leading-snug">
                      Set custom dimensions, background matte, or transparent canvas
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleOpenProject}
                  className="rounded-xl border p-4 text-left hover:border-[#0A84FF] transition-colors cursor-pointer flex items-start gap-3"
                  style={{
                    backgroundColor: 'var(--lp-panel)',
                    borderColor: 'var(--lp-border)',
                  }}
                >
                  <div className="w-9 h-9 rounded-lg bg-[var(--lp-hover)] text-[var(--lp-text)] flex items-center justify-center shrink-0">
                    <FolderOpen className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold">Load .lps Project</div>
                    <p className="text-[11px] text-[var(--lp-text-secondary)] mt-0.5 leading-snug">
                      Reopen layered projects with full adjustments intact
                    </p>
                  </div>
                </button>
              </div>

              {/* 1-Click Common Canvas Sizes */}
              <div className="space-y-2 pt-1">
                <span className="text-[11px] font-medium text-[var(--lp-text-secondary)] block">
                  Start with a popular size
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {QUICK_FORMATS.map((fmt) => (
                    <button
                      key={fmt.label}
                      type="button"
                      onClick={() =>
                        createDocument({
                          name: fmt.label,
                          width: fmt.w,
                          height: fmt.h,
                          backgroundColor: fmt.bg,
                        })
                      }
                      className="px-3 py-2 rounded-lg border text-left hover:border-[#0A84FF] transition-colors cursor-pointer"
                      style={{
                        backgroundColor: 'var(--lp-panel)',
                        borderColor: 'var(--lp-border)',
                      }}
                    >
                      <div className="text-[11px] font-medium truncate">{fmt.label}</div>
                      <div className="text-[10px] text-[var(--lp-text-secondary)] font-mono-tabular mt-0.5">
                        {fmt.w} × {fmt.h}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Recent Projects */}
          {(activeNav === 'all' || activeNav === 'recent') && (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[14px] font-semibold tracking-tight">Recent Projects</h2>
                <span className="text-[11px] text-[var(--lp-text-secondary)]">
                  Autosaved locally in IndexedDB
                </span>
              </div>

              {recentProjects.length === 0 ? (
                <div
                  className="rounded-xl border p-5 text-center text-[12px] text-[var(--lp-text-secondary)]"
                  style={{
                    backgroundColor: 'var(--lp-panel)',
                    borderColor: 'var(--lp-border)',
                  }}
                >
                  Your edited projects automatically save here for instant recovery across sessions.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recentProjects.map((proj) => (
                    <div
                      key={proj.id}
                      onClick={() => void openRecentProject(proj.id)}
                      className="group rounded-xl border overflow-hidden cursor-pointer transition-all hover:border-[#0A84FF]"
                      style={{
                        backgroundColor: 'var(--lp-panel)',
                        borderColor: 'var(--lp-border)',
                      }}
                    >
                      <div className="aspect-[16/10] checkerboard-bg relative overflow-hidden">
                        <img
                          src={proj.thumbnailDataUrl}
                          alt={proj.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                        />
                        <button
                          type="button"
                          title="Delete from local storage"
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteRecentProject(proj.id);
                          }}
                          className="absolute top-2 right-2 p-1.5 rounded-md bg-black/65 text-white opacity-0 group-hover:opacity-100 hover:bg-[#FF453A] transition-opacity cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium truncate">{proj.name}</div>
                          <div className="flex items-center gap-1.5 text-[11px] text-[var(--lp-text-secondary)] mt-0.5 font-mono-tabular">
                            <span>
                              {proj.width} × {proj.height}
                            </span>
                            <span>·</span>
                            <span>{proj.layerCount} {proj.layerCount === 1 ? 'layer' : 'layers'}</span>
                            <span>·</span>
                            <span>{formatTime(proj.updatedAt)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Bundled Local Sample Images */}
          {(activeNav === 'all' || activeNav === 'samples') && (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[14px] font-semibold tracking-tight">
                  Try with Bundled Studio Samples
                </h2>
                <span className="text-[11px] text-[var(--lp-text-secondary)]">
                  Click any sample to open in the editor
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {SAMPLE_PRESETS.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => openSamplePreset(sample.id)}
                    className="group text-left rounded-xl border overflow-hidden hover:border-[#0A84FF] transition-colors cursor-pointer"
                    style={{
                      backgroundColor: 'var(--lp-panel)',
                      borderColor: 'var(--lp-border)',
                    }}
                  >
                    <div className="aspect-[16/10] checkerboard-bg overflow-hidden">
                      <img
                        src={getSampleThumbnail(sample)}
                        alt={sample.name}
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    </div>
                    <div className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium truncate">{sample.name}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-[var(--lp-text-secondary)] group-hover:text-[#0A84FF] shrink-0 transition-colors" />
                      </div>
                      <div className="text-[11px] text-[var(--lp-text-secondary)] mt-0.5">
                        {sample.subtitle}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Supported Formats & Local Storage Capabilities */}
          {(activeNav === 'all' || activeNav === 'storage') && (
            <section
              className="rounded-xl border p-5 grid grid-cols-1 md:grid-cols-2 gap-6"
              style={{
                backgroundColor: 'var(--lp-panel)',
                borderColor: 'var(--lp-border)',
              }}
            >
              <div className="space-y-2">
                <h3 className="text-[13px] font-semibold">Supported Formats</h3>
                <div className="text-[12px] text-[var(--lp-text-secondary)] space-y-1.5">
                  <p>
                    <span className="text-[var(--lp-text)] font-medium">Import:</span>{' '}
                    JPEG, PNG, WebP, AVIF, BMP, GIF (first frame), SVG rasterization, and GStudio Project (.lps)
                  </p>
                  <p>
                    <span className="text-[var(--lp-text)] font-medium">Export:</span>{' '}
                    PNG (lossless + alpha), JPEG (quality slider), WebP (lossy + alpha), and uncompressed BMP
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-[var(--lp-text-secondary)]" />
                    <span>Device Storage & Engine</span>
                  </h3>
                  {storageInfo && (
                    <span className="text-[11px] text-[var(--lp-text-secondary)] font-mono-tabular">
                      {formatBytes(storageInfo.usageBytes)} used locally
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-[var(--lp-text-secondary)] space-y-1">
                  <p>
                    IndexedDB Autosave: {caps.indexedDb ? 'Active' : 'Unavailable'} · Web Workers:{' '}
                    {caps.webWorker ? 'Active' : 'Main-thread fallback'}
                  </p>
                  <p>
                    File System Access API:{' '}
                    {caps.fileSystemAccess ? 'Native Picker' : 'Standard File Dialog Fallback'} · OPFS:{' '}
                    {caps.opfs ? 'Supported' : 'IndexedDB Fallback'}
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
};
