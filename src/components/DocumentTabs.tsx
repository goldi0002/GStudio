import React, { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { REQUEST_CLOSE_DOCUMENT_EVENT } from '../hooks/useUnsavedChangesGuard';
import { forgetPersistedRevision, isDocumentUnsaved } from '../persistence/revisionTracker';
import { useEditorStore } from '../store/useEditorStore';

export const DocumentTabs: React.FC = () => {
  const { documents, activeDocumentId, setActiveDocument, closeDocument, openModal } =
    useEditorStore();
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null);

  // The tab button, File > Close Document and ⌘W all route through this event
  // so a dirty document always gets the confirmation dialog.
  useEffect(() => {
    const onRequestClose = (event: Event) => {
      const docId = (event as CustomEvent<{ docId?: string }>).detail?.docId;
      if (!docId) return;
      const target = useEditorStore.getState().documents.find((doc) => doc.id === docId);
      if (target && isDocumentUnsaved(target)) {
        setPendingCloseId(docId);
        return;
      }
      forgetPersistedRevision(docId);
      closeDocument(docId);
    };
    window.addEventListener(REQUEST_CLOSE_DOCUMENT_EVENT, onRequestClose);
    return () => window.removeEventListener(REQUEST_CLOSE_DOCUMENT_EVENT, onRequestClose);
  }, [closeDocument]);

  useEffect(() => {
    if (!pendingCloseId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingCloseId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingCloseId]);

  if (documents.length === 0) return null;

  const pendingDoc = documents.find((doc) => doc.id === pendingCloseId) ?? null;

  return (
    <div
      className="h-8 shrink-0 flex items-center px-2 gap-1 border-b overflow-x-auto select-none"
      style={{
        backgroundColor: 'var(--lp-bg)',
        borderColor: 'var(--lp-border)',
      }}
    >
      {documents.map((doc) => {
        const isActive = doc.id === activeDocumentId;
        return (
          <div
            key={doc.id}
            onClick={() => setActiveDocument(doc.id)}
            className={`group h-6 px-2.5 rounded-md flex items-center gap-2 text-[11px] cursor-pointer transition-colors max-w-[200px] shrink-0 ${
              isActive
                ? 'bg-[var(--lp-panel)] text-[var(--lp-text)] border'
                : 'text-[var(--lp-text-secondary)] hover:bg-[var(--lp-hover)] hover:text-[var(--lp-text)]'
            }`}
            style={{
              borderColor: isActive ? 'var(--lp-border-strong)' : 'transparent',
            }}
          >
            <span className="truncate font-medium">{doc.name}</span>
            <span className="text-[10px] opacity-60 font-mono-tabular shrink-0">
              {doc.dirty ? '•' : `${doc.width}×${doc.height}`}
            </span>
            <button
              type="button"
              aria-label={`Close ${doc.name}`}
              onClick={(e) => {
                e.stopPropagation();
                if (isDocumentUnsaved(doc)) {
                  setPendingCloseId(doc.id);
                } else {
                  forgetPersistedRevision(doc.id);
                  closeDocument(doc.id);
                }
              }}
              className="p-0.5 rounded hover:bg-[var(--lp-hover)] opacity-60 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => openModal('newProject')}
        title="New Project (⌘N)"
        className="h-6 w-6 rounded-md flex items-center justify-center text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] hover:bg-[var(--lp-hover)] transition-colors cursor-pointer shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      {pendingDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-close-title"
            className="w-full max-w-sm rounded-xl border shadow-2xl overflow-hidden"
            style={{
              backgroundColor: 'var(--lp-panel)',
              borderColor: 'var(--lp-border-strong)',
            }}
          >
            <div
              className="px-4 py-3 border-b"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              <h2 id="unsaved-close-title" className="text-[13px] font-semibold">
                Unsaved Changes
              </h2>
            </div>
            <div className="px-4 py-3 text-[12px] text-[var(--lp-text-secondary)] leading-relaxed">
              “{pendingDoc.name}” has changes that have not been saved. Closing it will
              discard them.
            </div>
            <div
              className="px-4 py-3 border-t flex items-center justify-end gap-2"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              <button
                type="button"
                autoFocus
                onClick={() => setPendingCloseId(null)}
                className="px-3.5 py-1.5 rounded-lg border text-[12px] hover:bg-[var(--lp-hover)] cursor-pointer"
                style={{ borderColor: 'var(--lp-border)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const docId = pendingCloseId;
                  setPendingCloseId(null);
                  if (docId) {
                    forgetPersistedRevision(docId);
                    closeDocument(docId);
                  }
                }}
                className="px-4 py-1.5 rounded-lg bg-[#FF453A] hover:bg-[#FF453A]/90 text-white text-[12px] font-medium cursor-pointer"
              >
                Discard &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
