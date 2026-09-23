/**
 * Keeping the city between visits.
 *
 * "Your pieces stay up. They always do." was only true until the tab closed.
 * Everything a player makes is a data URL — the editor's flattened canvas, the
 * photograph of it in the street, the shots off the phone — and together that
 * is several megabytes, which is far past what localStorage will hold. So the
 * session goes into IndexedDB as one record, written a moment after anything
 * changes and read back once on load.
 *
 * All of it stays in the browser. Nothing is uploaded anywhere.
 */
import type { PaintedPiece } from "./graffitiTypes";

const DB = "neon-walls";
const STORE = "session";
const KEY = "city";
const VERSION = 1;

export interface SavedSession {
  painted: Record<string, PaintedPiece>;
  photos: string[];
  tag: string;
  savedAt: number;
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      // private windows in some browsers throw rather than fail the request
      resolve(null);
    }
  });
}

export async function loadSession(): Promise<SavedSession | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        const v = req.result as SavedSession | undefined;
        resolve(v && typeof v === "object" && v.painted ? v : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeSession(session: SavedSession): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(session, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearSession(): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
