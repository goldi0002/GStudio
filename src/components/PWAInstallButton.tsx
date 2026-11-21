import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        title="Install GStudio as an offline desktop/mobile app"
        className="px-2.5 py-1 rounded-md border text-[11px] font-medium flex items-center gap-1.5 hover:bg-[var(--lp-hover)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        style={{ borderColor: 'var(--lp-border-strong)' }}
      >
        <Download className="w-3 h-3 text-[#0A84FF]" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="px-2.5 py-1 rounded-md border text-[11px] font-medium flex items-center gap-1.5 hover:bg-[var(--lp-hover)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          style={{ borderColor: 'var(--lp-border-strong)' }}
        >
          <Share className="w-3 h-3 text-[#0A84FF]" />
          <span>Install</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div
              className="w-full max-w-sm rounded-xl border p-5 shadow-2xl space-y-3"
              style={{
                backgroundColor: 'var(--lp-panel)',
                borderColor: 'var(--lp-border-strong)',
              }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold">Install GStudio on iOS</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded hover:bg-[var(--lp-hover)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-[12px] text-[var(--lp-text-secondary)] space-y-1.5 list-decimal list-inside">
                <li>
                  Tap the <strong className="text-[var(--lp-text)]">Share</strong> button in Safari&apos;s toolbar.
                </li>
                <li>
                  Scroll down and tap{' '}
                  <strong className="text-[var(--lp-text)]">Add to Home Screen</strong>.
                </li>
                <li>Launch GStudio anytime, even completely offline.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-1.5 rounded-lg bg-[#0A84FF] text-white text-[12px] font-medium cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
