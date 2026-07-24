const DATABASE = "z-babel-standalone";
const LEGACY_DATABASE = "z-ai-standalone";
const SAVES = "saves";
const TRANSLATIONS = "translations";
const AUDIO = "audio";

export class SessionStorage {
  constructor() {
    this.database = openDatabase();
  }

  async put(record) {
    const db = await this.database;
    await transaction(db, SAVES, "readwrite", (store) => store.put(record));
  }

  async get(storyId, slot) {
    const db = await this.database;
    return request(transaction(db, SAVES, "readonly", (store) => store.get(`${storyId}:${slot}`)));
  }

  async clearStory(storyId) {
    const db = await this.database;
    await transaction(db, SAVES, "readwrite", (store) => {
      store.delete(`${storyId}:autosave`);
      store.delete(`${storyId}:manual`);
    });
  }

  async latest(slot = "autosave") {
    const db = await this.database;
    const records = await request(transaction(db, SAVES, "readonly", (store) => store.getAll()));
    return records.filter((record) => record.slot === slot)
      .sort((left, right) => right.savedAt - left.savedAt)[0] || null;
  }

  async getTranslation(id) {
    const db = await this.database;
    const record = await request(transaction(db, TRANSLATIONS, "readonly", (store) => store.get(id)));
    return record?.text || null;
  }

  async putTranslation(id, text) {
    const db = await this.database;
    await transaction(db, TRANSLATIONS, "readwrite", (store) => store.put({ id, text }));
  }

  async getAudio(id) {
    const db = await this.database;
    const record = await request(transaction(db, AUDIO, "readonly", (store) => store.get(id)));
    return record?.data || null;
  }

  async putAudio(id, data) {
    const db = await this.database;
    await transaction(db, AUDIO, "readwrite", (store) => store.put({ id, data }));
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DATABASE, 3);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(SAVES)) open.result.createObjectStore(SAVES, { keyPath: "id" });
      if (!open.result.objectStoreNames.contains(TRANSLATIONS)) {
        open.result.createObjectStore(TRANSLATIONS, { keyPath: "id" });
      }
      if (!open.result.objectStoreNames.contains(AUDIO)) {
        open.result.createObjectStore(AUDIO, { keyPath: "id" });
      }
    };
    open.onsuccess = async () => {
      try {
        await migrateLegacy(open.result);
        resolve(open.result);
      } catch (error) {
        reject(error);
      }
    };
    open.onerror = () => reject(open.error);
  });
}

async function migrateLegacy(db) {
  const saves = await request(transaction(db, SAVES, "readonly", (store) => store.getAll()));
  if (saves.length) return;
  const legacy = await new Promise((resolve) => {
    const open = indexedDB.open(LEGACY_DATABASE, 3);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => resolve(null);
  });
  if (!legacy?.objectStoreNames.contains(SAVES)) {
    legacy?.close();
    return;
  }
  for (const storeName of [SAVES, TRANSLATIONS, AUDIO]) {
    if (!legacy.objectStoreNames.contains(storeName) || !db.objectStoreNames.contains(storeName)) continue;
    const records = await request(transaction(legacy, storeName, "readonly", (store) => store.getAll()));
    if (!records.length) continue;
    await transaction(db, storeName, "readwrite", (store) => {
      for (const record of records) store.put(record);
    });
  }
  legacy.close();
}

function transaction(db, storeName, mode, operation) {
  const tx = db.transaction(storeName, mode);
  const result = operation(tx.objectStore(storeName));
  if (mode === "readonly") return result;
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Storage transaction was aborted."));
  });
}

function request(value) {
  if (value instanceof Promise) return value;
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

export function encodePortableSave(record) {
  return JSON.stringify({
    format: "z-babel-save-v1",
    storyId: record.storyId,
    storyName: record.storyName,
    savedAt: record.savedAt,
    saveBytes: bytesToBase64(record.saveBytes),
    state: record.state,
  });
}

export function decodePortableSave(text) {
  const value = JSON.parse(text);
  if (!["z-babel-save-v1", "z-ai-save-v1"].includes(value.format) || !value.storyId || !value.saveBytes || !value.state) {
    throw new Error("The selected file is not a Z-Babel save.");
  }
  return { ...value, slot: "import", saveBytes: base64ToBytes(value.saveBytes) };
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
