import React, { useEffect } from 'react';
import { Camera, Check, Copy, X } from 'lucide-react';
import {
  formatCameraDisplayName,
  formatLensDisplayName,
  hasAnyExifFields,
} from '../../persistence/exifParser';
import { useEditorStore } from '../../store/useEditorStore';

interface MetadataRow {
  label: string;
  value: string;
  mono?: boolean;
}

function formatBytes(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatCoordinates(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(5)}° ${latDir}, ${Math.abs(lon).toFixed(5)}° ${lonDir}`;
}

export const ExifMetadataModal: React.FC = () => {
  const { modals, closeModal, documents, activeDocumentId, showToast } = useEditorStore();
  const [copied, setCopied] = React.useState(false);

  const doc = documents.find((d) => d.id === activeDocumentId) ?? null;

  useEffect(() => {
    if (!modals.exifMetadata) {
      setCopied(false);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal('exifMetadata');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modals.exifMetadata, closeModal]);

  if (!modals.exifMetadata || !doc) return null;

  const exif = doc.exif ?? null;
  const hasExif = hasAnyExifFields(exif);
  const cameraName = formatCameraDisplayName(exif);
  const lensName = formatLensDisplayName(exif);

  const documentRows: MetadataRow[] = [
    { label: 'Document', value: doc.name },
    { label: 'Canvas Size', value: `${doc.width} × ${doc.height} px`, mono: true },
    { label: 'Format', value: doc.sourceFormat || 'LPS', mono: true },
    { label: 'File Size', value: formatBytes(doc.fileSizeBytes), mono: true },
    { label: 'Layers', value: String(doc.layers.length), mono: true },
    { label: 'Last Modified', value: new Date(doc.updatedAt).toLocaleString(), mono: true },
  ];

  const cameraRows: MetadataRow[] = [];
  if (exif) {
    if (cameraName) cameraRows.push({ label: 'Camera Model', value: cameraName });
    if (lensName) cameraRows.push({ label: 'Lens', value: lensName });
    if (exif.focalLength) {
      const fl =
        exif.focalLength35mm && exif.focalLength35mm !== exif.focalLength
          ? `${exif.focalLength} (${exif.focalLength35mm} eq.)`
          : exif.focalLength;
      cameraRows.push({ label: 'Focal Length', value: fl, mono: true });
    } else if (exif.focalLength35mm) {
      cameraRows.push({ label: 'Focal Length (35mm)', value: exif.focalLength35mm, mono: true });
    }
    if (exif.aperture) cameraRows.push({ label: 'Aperture', value: exif.aperture, mono: true });
    if (exif.shutterSpeed) cameraRows.push({ label: 'Shutter Speed', value: exif.shutterSpeed, mono: true });
    if (exif.iso !== undefined) cameraRows.push({ label: 'ISO', value: String(exif.iso), mono: true });
    if (exif.exposureBias) cameraRows.push({ label: 'Exposure Bias', value: exif.exposureBias, mono: true });
  }

  const captureRows: MetadataRow[] = [];
  if (exif) {
    if (exif.dateTimeOriginal) captureRows.push({ label: 'Date Taken', value: exif.dateTimeOriginal, mono: true });
    if (exif.exposureProgram) captureRows.push({ label: 'Exposure Mode', value: exif.exposureProgram });
    if (exif.meteringMode) captureRows.push({ label: 'Metering Mode', value: exif.meteringMode });
    if (exif.whiteBalance) captureRows.push({ label: 'White Balance', value: exif.whiteBalance });
    if (exif.flash) captureRows.push({ label: 'Flash', value: exif.flash });
    if (exif.colorSpace) captureRows.push({ label: 'Color Space', value: exif.colorSpace, mono: true });
    if (exif.orientation) captureRows.push({ label: 'Orientation', value: exif.orientation, mono: true });
    if (exif.xResolution) captureRows.push({ label: 'Resolution', value: exif.xResolution, mono: true });
    if (exif.exifWidth && exif.exifHeight) {
      captureRows.push({
        label: 'Original EXIF Size',
        value: `${exif.exifWidth} × ${exif.exifHeight} px`,
        mono: true,
      });
    }
    if (exif.software) captureRows.push({ label: 'Software', value: exif.software });
    if (exif.artist) captureRows.push({ label: 'Artist', value: exif.artist });
    if (exif.copyright) captureRows.push({ label: 'Copyright', value: exif.copyright });
  }

  const gpsRows: MetadataRow[] = [];
  if (exif?.gps) {
    gpsRows.push({
      label: 'Coordinates',
      value: formatCoordinates(exif.gps.latitude, exif.gps.longitude),
      mono: true,
    });
    if (exif.gps.altitude) {
      gpsRows.push({ label: 'Altitude', value: exif.gps.altitude, mono: true });
    }
  }

  const handleCopySummary = async () => {
    const sections = [
      ['Document', documentRows],
      ...(cameraRows.length > 0 ? [['Camera & Optics', cameraRows] as const] : []),
      ...(captureRows.length > 0 ? [['Capture & Technical', captureRows] as const] : []),
      ...(gpsRows.length > 0 ? [['Location', gpsRows] as const] : []),
    ] as Array<[string, MetadataRow[]]>;

    const text = sections
      .map(([title, rows]) => `${title}\n${rows.map((r) => `  ${r.label}: ${r.value}`).join('\n')}`)
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      showToast('Image EXIF metadata copied to clipboard', 'success');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast('Clipboard access unavailable', 'error');
    }
  };

  const renderSection = (title: string, rows: MetadataRow[]) => {
    if (rows.length === 0) return null;
    return (
      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold text-[var(--lp-text-secondary)]">{title}</h3>
        <dl
          className="divide-y rounded-lg border"
          style={{
            backgroundColor: 'var(--lp-bg)',
            borderColor: 'var(--lp-border)',
          }}
        >
          {rows.map((row) => (
            <div
              key={row.label}
              className="px-3 py-2 flex items-center justify-between gap-4 text-[12px]"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              <dt className="text-[var(--lp-text-secondary)] shrink-0">{row.label}</dt>
              <dd
                className={`text-right text-[var(--lp-text)] truncate ${
                  row.mono ? 'font-mono-tabular' : ''
                }`}
                title={row.value}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    );
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal('exifMetadata');
      }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Image and EXIF Metadata"
        className="w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        style={{
          backgroundColor: 'var(--lp-panel)',
          borderColor: 'var(--lp-border-strong)',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Camera className="w-4 h-4 text-[#0A84FF] shrink-0" />
            <h2 className="text-[13px] font-semibold truncate">Image & EXIF Metadata</h2>
          </div>
          <button
            type="button"
            onClick={() => closeModal('exifMetadata')}
            className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
            aria-label="Close EXIF Metadata"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {!hasExif && (
            <div
              className="rounded-lg border px-3.5 py-3 text-[12px] text-[var(--lp-text-secondary)] leading-relaxed"
              style={{
                backgroundColor: 'var(--lp-bg)',
                borderColor: 'var(--lp-border)',
              }}
            >
              No camera or capture EXIF tags are embedded in this image. Camera model, lens, date
              taken, and focal length appear automatically when you open a JPEG, PNG, WebP, or TIFF
              photo containing EXIF metadata.
            </div>
          )}

          {renderSection('Camera & Optics', cameraRows)}
          {renderSection('Capture & Technical', captureRows)}
          {renderSection('Location', gpsRows)}
          {renderSection('Document Summary', documentRows)}
        </div>

        <div
          className="px-4 py-3 border-t flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <button
            type="button"
            onClick={() => void handleCopySummary()}
            className="px-3 py-1.5 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 hover:bg-[var(--lp-hover)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            style={{ borderColor: 'var(--lp-border)' }}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#30D158]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Summary'}</span>
          </button>
          <button
            type="button"
            onClick={() => closeModal('exifMetadata')}
            className="px-4 py-1.5 rounded-lg bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
