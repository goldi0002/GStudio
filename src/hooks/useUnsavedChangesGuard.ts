import { useEffect } from 'react';
import {
  hasUnsavedDocuments,
  prunePersistedRevisions,
} from '../persistence/revisionTracker';
import { useEditorStore } from '../store/useEditorStore';

export const REQUEST_CLOSE_DOCUMENT_EVENT = 'gstudio:request-close-document';

/**
 * Ask the UI to close a document. DocumentTabs listens for this so the same
 * unsaved-changes confirmation covers the tab button, the File menu and ⌘W.
 */
export function requestCloseDocument(docId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REQUEST_CLOSE_DOCUMENT_EVENT, { detail: { docId } }));
}

/**
 * Warn before the tab unloads while at least one open document has work that is
 * not persisted. Autosave only clears a document's record for the revisions it
 * actually wrote, so a newer edit keeps the guard active instead of racing the
 * debounce timer. Browsers show their own generic message, so no custom text
 * is set.
 */
export function useUnsavedChangesGuard(): void {
  const documents = useEditorStore((state) => state.documents);
  const hasUnsavedChanges = hasUnsavedDocuments(documents);

  // A project reopened from Recent Projects reuses its id; drop the record
  // when the tab closes so the clean copy starts with a clean record again.
  useEffect(() => {
    prunePersistedRevisions(new Set(documents.map((doc) => doc.id)));
  }, [documents]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges]);
}
