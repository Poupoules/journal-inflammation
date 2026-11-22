// Couche de stockage. Toute l'app passe par cette interface : pour changer
// de technologie (ex. Capacitor + SQLite), il suffit d'en fournir une autre
// implémentation qui respecte le même contrat.
//
// Contrat (toutes les méthodes sont asynchrones) :
//   getDay(date)            -> fiche | null
//   putDay(entry)           -> fiche enregistrée (relue et vérifiée)
//   listDays()              -> toutes les fiches, triées par date
//   putDays(entries)        -> enregistre plusieurs fiches en une transaction
//   getMeta(key)            -> valeur | undefined
//   setMeta(key, value)
//   persistence()           -> "persistant" | "non-persistant" | "inconnu"
import { normalizeEntry, sameContent } from "../model.js";
import { createIndexedDBStorage } from "./indexeddb.js";

export class StorageError extends Error {}

/** Point d'entrée de l'app : le stockage utilisé en production. */
export async function openStorage(options) {
  return withVerification(await createIndexedDBStorage(options));
}

/**
 * Enveloppe commune : normalise et horodate avant écriture, puis relit la
 * fiche pour vérifier qu'elle a bien été enregistrée. À la lecture, les
 * fiches écrites par une ancienne version sont complétées des champs ajoutés
 * depuis (ex. protéines), pour que le reste de l'app trouve toujours la même forme.
 */
export function withVerification(backend, now = () => new Date().toISOString()) {
  return {
    ...backend,
    async getDay(date) {
      const e = await backend.getDay(date);
      return e ? normalizeEntry(e) : null;
    },
    async listDays() {
      return (await backend.listDays()).map(normalizeEntry);
    },
    async putDay(raw) {
      const entry = { ...normalizeEntry(raw), updatedAt: now() };
      await backend.putDay(entry);
      const back = await backend.getDay(entry.date);
      if (!back || !sameContent(back, entry)) {
        throw new StorageError("La relecture après enregistrement ne correspond pas.");
      }
      return back;
    },
    async putDays(raws) {
      const entries = raws.map(normalizeEntry);
      await backend.putDays(entries);
      for (const e of entries) {
        const back = await backend.getDay(e.date);
        if (!back || !sameContent(back, e)) throw new StorageError(`Vérification échouée pour ${e.date}.`);
      }
      return entries;
    },
  };
}
