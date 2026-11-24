/**
 * Your own music: one audio file the visitor chooses from their device. It is kept in this
 * browser (IndexedDB) and played from there. It is never uploaded anywhere, and no music
 * ships with the site.
 */
const DB = 'break-ball';
const STORE = 'music';

function open(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
async function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((ok, no) => {
      const tx = db.transaction(STORE, mode);
      const req = f(tx.objectStore(STORE));
      tx.oncomplete = () => ok(req.result);
      tx.onerror = () => no(tx.error);
      tx.onabort = () => no(tx.error);
    });
  } finally {
    db.close();
  }
}

export interface SavedMusic {
  name: string;
  file: Blob;
}
export const loadMusic = (): Promise<SavedMusic | undefined> => run('readonly', (s) => s.get('track') as IDBRequest<SavedMusic | undefined>);
export const saveMusic = (m: SavedMusic) => run('readwrite', (s) => s.put(m, 'track'));
export const clearMusic = () => run('readwrite', (s) => s.delete('track'));
