import { deserializeProject, serializeDocument } from './fileAccess';
import { markDocumentPersisted } from './revisionTracker';
import type { DocumentState, RecentProjectMeta, SerializedProject } from '../types/editor';

const DB_NAME = 'localpixel-studio-db';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_SETTINGS = 'settings';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

export async function saveProjectToIndexedDb(doc: DocumentState): Promise<RecentProjectMeta | null> {
  try {
    const serialized = serializeDocument(doc);
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      tx.objectStore(STORE_PROJECTS).put(serialized);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    markDocumentPersisted(doc);
    const jsonSize = JSON.stringify(serialized).length;
    return {
      id: serialized.id,
      name: serialized.name,
      width: serialized.width,
      height: serialized.height,
      layerCount: serialized.layers.length,
      updatedAt: serialized.updatedAt,
      thumbnailDataUrl: serialized.thumbnailDataUrl,
      sourceFormat: serialized.sourceFormat,
      estimatedBytes: jsonSize,
    };
  } catch {
    return null;
  }
}

export async function listRecentProjectsFromIndexedDb(): Promise<RecentProjectMeta[]> {
  try {
    const db = await openDb();
    const all = await new Promise<SerializedProject[]>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const req = tx.objectStore(STORE_PROJECTS).getAll();
      req.onsuccess = () => resolve((req.result as SerializedProject[]) || []);
      req.onerror = () => reject(req.error);
    });

    return all
      .map((p) => ({
        id: p.id,
        name: p.name,
        width: p.width,
        height: p.height,
        layerCount: p.layers.length,
        updatedAt: p.updatedAt,
        thumbnailDataUrl: p.thumbnailDataUrl,
        sourceFormat: p.sourceFormat || 'LPS',
        estimatedBytes: JSON.stringify(p).length,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function loadProjectFromIndexedDb(id: string) {
  const db = await openDb();
  const raw = await new Promise<SerializedProject | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const req = tx.objectStore(STORE_PROJECTS).get(id);
    req.onsuccess = () => resolve(req.result as SerializedProject | undefined);
    req.onerror = () => reject(req.error);
  });
  if (!raw) return null;
  return deserializeProject(raw);
}

export async function deleteProjectFromIndexedDb(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      tx.objectStore(STORE_PROJECTS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore storage delete errors gracefully
  }
}

export async function saveSetting<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readwrite');
      tx.objectStore(STORE_SETTINGS).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try {
      localStorage.setItem(`lp_${key}`, JSON.stringify(value));
    } catch {
      // Ignore
    }
  }
}

export async function loadSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await openDb();
    const res = await new Promise<{ key: string; value: T } | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readonly');
      const req = tx.objectStore(STORE_SETTINGS).get(key);
      req.onsuccess = () => resolve(req.result as { key: string; value: T } | undefined);
      req.onerror = () => reject(req.error);
    });
    return res ? res.value : fallback;
  } catch {
    try {
      const raw = localStorage.getItem(`lp_${key}`);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }
}

export async function estimateStorageUsage(): Promise<{ usageBytes: number; quotaBytes: number } | null> {
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
    try {
      const est = await navigator.storage.estimate();
      return {
        usageBytes: est.usage ?? 0,
        quotaBytes: est.quota ?? 0,
      };
    } catch {
      return null;
    }
  }
  return null;
}
