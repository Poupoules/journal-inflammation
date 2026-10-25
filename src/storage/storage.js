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
 * fiche pour vérifier qu'elle a bien été enregistrée.
 */
export function withVerification(backend, now = () => new Date().toISOString()) {
  return {
    ...backend,
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
