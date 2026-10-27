import type { VNProject } from '../types.ts';

const DATABASE_NAME = 'moovn-project-storage';
const DATABASE_VERSION = 1;
const STORE_NAME = 'snapshots';

export interface ProjectSnapshot {
  key: string;
  project: VNProject;
  updatedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('ERR_INDEXEDDB_UNAVAILABLE: 浏览器存储不可用'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('ERR_INDEXEDDB_OPEN'));
    request.onblocked = () => reject(new Error('ERR_INDEXEDDB_BLOCKED: 浏览器存储被其他窗口占用'));
  });
}

/** A write is successful only when the transaction has actually committed. */
export async function putProjectSnapshot(key: string, project: VNProject): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({ key, project, updatedAt: Date.now() } satisfies ProjectSnapshot);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('ERR_INDEXEDDB_WRITE'));
      transaction.onabort = () => reject(transaction.error || new Error('ERR_INDEXEDDB_ABORT'));
    });
  } finally {
    db.close();
  }
}

export async function getProjectSnapshot(key: string): Promise<ProjectSnapshot | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result as ProjectSnapshot | undefined);
      request.onerror = () => reject(request.error || new Error('ERR_INDEXEDDB_READ'));
      transaction.onabort = () => reject(transaction.error || new Error('ERR_INDEXEDDB_ABORT'));
    });
  } finally {
    db.close();
  }
}

export async function getLatestDraft(): Promise<ProjectSnapshot | undefined> {
  const db = await openDatabase();
  try {
    const records = await new Promise<ProjectSnapshot[]>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as ProjectSnapshot[]);
      request.onerror = () => reject(request.error || new Error('ERR_INDEXEDDB_READ'));
    });
    return records.filter((entry) => entry.key.startsWith('draft:')).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  } finally {
    db.close();
  }
}

export async function deleteProjectSnapshot(key: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('ERR_INDEXEDDB_DELETE'));
      transaction.onabort = () => reject(transaction.error || new Error('ERR_INDEXEDDB_ABORT'));
    });
  } finally {
    db.close();
  }
}
