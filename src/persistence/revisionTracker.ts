import type { DocumentState } from '../types/editor';

/**
 * Identifies the editable content of a document at a point in time.
 * `updatedAt` advances on every mutation; the history counters keep two edits
 * that land within the same millisecond distinguishable.
 */
export function documentRevision(doc: DocumentState): string {
  return `${doc.updatedAt}:${doc.historyIndex}:${doc.history.length}`;
}

const persistedRevisions = new Map<string, string>();

/**
 * Record the revision a save just wrote. The last completed save wins: if an
 * older autosave settles after a newer save, the store may now hold the older
 * snapshot, so the newer revision must stay unsaved.
 */
export function recordPersistedRevision(docId: string, revision: string): void {
  persistedRevisions.set(docId, revision);
}

/** Mark the revision currently held by `doc` as persisted. */
export function markDocumentPersisted(doc: DocumentState): void {
  recordPersistedRevision(doc.id, documentRevision(doc));
}

export function getPersistedRevision(docId: string): string | undefined {
  return persistedRevisions.get(docId);
}

export function forgetPersistedRevision(docId: string): void {
  persistedRevisions.delete(docId);
}

/** Drop records for documents that are no longer open. */
export function prunePersistedRevisions(openDocumentIds: ReadonlySet<string>): void {
  for (const docId of persistedRevisions.keys()) {
    if (!openDocumentIds.has(docId)) persistedRevisions.delete(docId);
  }
}

export function resetPersistedRevisions(): void {
  persistedRevisions.clear();
}

/**
 * A document has genuine unsaved work when its current revision has not been
 * written to local storage. The store's `dirty` flag is only consulted for
 * documents that have never been persisted, because autosave clears it as soon
 * as *any* save settles — even when a newer edit is still pending.
 */
export function isDocumentUnsaved(doc: DocumentState): boolean {
  const persisted = persistedRevisions.get(doc.id);
  if (persisted === undefined) return doc.dirty;
  return persisted !== documentRevision(doc);
}

export function hasUnsavedDocuments(documents: readonly DocumentState[]): boolean {
  return documents.some(isDocumentUnsaved);
}
