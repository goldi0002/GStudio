import { deserializeProject, isSafeRasterDataUrl, serializeDocument } from './fileAccess';
import { markDocumentPersisted } from './revisionTracker';
import type { DocumentState, RecentProjectMeta, SerializedProject } from '../types/editor';

const DB_NAME = 'localpixel-studio-db';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_SETTINGS = 'settings';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      dbPromise = null;
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
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('Failed to open IndexedDB'));
    };
  });

  return dbPromise;
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
      thumbnailDataUrl: isSafeRasterDataUrl(serialized.thumbnailDataUrl)
        ? serialized.thumbnailDataUrl
        : '',
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
    const all = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const req = tx.objectStore(STORE_PROJECTS).getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error);
    });

    const results: RecentProjectMeta[] = [];
    for (const item of all) {
      if (!item || typeof item !== 'object') continue;
      const p = item as Partial<SerializedProject>;
      if (typeof p.id !== 'string' || !p.id.trim() || !Array.isArray(p.layers)) continue;

      let estimatedBytes = 0;
      try {
        estimatedBytes = JSON.stringify(p).length;
      } catch {
        continue;
      }

      results.push({
        id: p.id,
        name: typeof p.name === 'string' && p.name.trim() ? p.name : 'Untitled Project',
        width: typeof p.width === 'number' && Number.isFinite(p.width) && p.width > 0 ? Math.round(p.width) : 1024,
        height: typeof p.height === 'number' && Number.isFinite(p.height) && p.height > 0 ? Math.round(p.height) : 1024,
        layerCount: p.layers.length,
        updatedAt: typeof p.updatedAt === 'number' && Number.isFinite(p.updatedAt) ? p.updatedAt : 0,
        thumbnailDataUrl: isSafeRasterDataUrl(p.thumbnailDataUrl) ? p.thumbnailDataUrl : '',
        sourceFormat: typeof p.sourceFormat === 'string' && p.sourceFormat.trim() ? p.sourceFormat : 'LPS',
        estimatedBytes,
      });
    }

    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function loadProjectFromIndexedDb(id: string) {
  try {
    const db = await openDb();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const req = tx.objectStore(STORE_PROJECTS).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!raw) return null;
    return await deserializeProject(raw);
  } catch {
    return null;
  }
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
