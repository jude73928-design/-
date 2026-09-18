import type { SavedDeck } from "./flashcards";

const DB_NAME = "flashcards-storage-v1";
const STORE_NAME = "decks";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB not available"));
  }

  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
  }

  return dbPromise;
}

export async function getAllIdbDecks(): Promise<SavedDeck[]> {
  try {
    const db = await getDB();
    return await new Promise<SavedDeck[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        resolve((req.result as SavedDeck[]) || []);
      };

      req.onerror = () => {
        reject(req.error);
      };
    });
  } catch (e) {
    console.warn("IndexedDB getAllIdbDecks failed:", e);
    return [];
  }
}

export async function saveIdbDecks(decks: SavedDeck[]): Promise<void> {
  try {
    const db = await getDB();
    return await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      store.clear();
      for (const d of decks) {
        if (d && d.id) {
          store.put(d);
        }
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("IndexedDB saveIdbDecks failed:", e);
  }
}

export async function saveIdbDeck(deck: SavedDeck): Promise<void> {
  try {
    const db = await getDB();
    return await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(deck);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("IndexedDB saveIdbDeck failed:", e);
  }
}

export async function deleteIdbDeck(id: string): Promise<void> {
  try {
    const db = await getDB();
    return await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("IndexedDB deleteIdbDeck failed:", e);
  }
}
