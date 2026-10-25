// Implémentation IndexedDB du contrat de stockage (voir storage.js).
// Une fiche par jour : modifier un jour ne réécrit jamais les autres.

const DB_NAME = "journal-inflammation";
const DB_VERSION = 1;

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction annulée"));
  });
}

function open(idb, name) {
  return new Promise((resolve, reject) => {
    const req = idb.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Migrations futures : ajouter ici des étapes selon `event.oldVersion`.
      if (!db.objectStoreNames.contains("days")) db.createObjectStore("days", { keyPath: "date" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Base bloquée par un autre onglet ouvert."));
  });
}

export async function createIndexedDBStorage({ indexedDB = globalThis.indexedDB, navigator = globalThis.navigator, name = DB_NAME } = {}) {
  if (!indexedDB) throw new Error("Ce navigateur ne permet pas le stockage local.");
  const db = await open(indexedDB, name);
  // Une nouvelle version de l'app ouverte ailleurs demande la fermeture.
  db.onversionchange = () => db.close();

  const store = (s, mode = "readonly") => {
    const tx = db.transaction(s, mode);
    return { tx, os: tx.objectStore(s) };
  };

  return {
    async getDay(date) {
      return (await request(store("days").os.get(date))) ?? null;
    },
    async putDay(entry) {
      const { tx, os } = store("days", "readwrite");
      os.put(entry);
      await done(tx);
    },
    async putDays(entries) {
      const { tx, os } = store("days", "readwrite");
      for (const e of entries) os.put(e);
      await done(tx);
    },
    async listDays() {
      return request(store("days").os.getAll()); // clés triées : AAAA-MM-JJ
    },
    async getMeta(key) {
      return (await request(store("meta").os.get(key)))?.value;
    },
    async setMeta(key, value) {
      const { tx, os } = store("meta", "readwrite");
      os.put({ key, value });
      await done(tx);
    },
    async persistence({ request: ask = false } = {}) {
      const s = navigator?.storage;
      if (!s?.persisted) return "inconnu";
      if (await s.persisted()) return "persistant";
      if (ask && s.persist && (await s.persist())) return "persistant";
      return "non-persistant";
    },
    close() {
      db.close();
    },
  };
}
