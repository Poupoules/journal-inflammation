// Modèle d'une fiche quotidienne : création, validation, normalisation.
// Règle : une information non renseignée vaut `null` (ou liste vide),
// jamais une valeur par défaut qui fausserait l'analyse.
import {
  ALCOHOL_GLASSES, ALCOHOL_TYPES, CUSTOM_FOOD_PREFIX, FOODS, MOODS, PAIN_INTENSITIES,
  PAIN_SITES, SKIN_SITES, SLEEP_QUALITIES, SPORTS,
} from "./config.js";
import { isISODate } from "./dates.js";

export const SCHEMA_VERSION = 1;

export function emptyEntry(date) {
  return {
    date,
    schema: SCHEMA_VERSION,
    updatedAt: null,
    sleep: { bed: null, wake: null, quality: null },
    moods: [],
    sports: [],
    pain: { sites: [], other: "", intensity: null },
    skin: [],
    flare: null,
    cortisone: null,
    injection: null,
    foods: [],
    alcohol: { types: [], glasses: null },
    period: false,
    notes: "",
  };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ids = (list) => new Set(list.map((x) => x.id));
const VALID = {
  moods: ids(MOODS),
  sports: ids(SPORTS),
  painSites: ids(PAIN_SITES),
  painIntensity: ids(PAIN_INTENSITIES),
  skin: ids(SKIN_SITES),
  foods: ids(FOODS),
  alcoholTypes: ids(ALCOHOL_TYPES),
  glasses: ids(ALCOHOL_GLASSES),
  quality: ids(SLEEP_QUALITIES),
};

const isFood = (f) => VALID.foods.has(f) || (typeof f === "string" && f.startsWith(CUSTOM_FOOD_PREFIX) && f.length > CUSTOM_FOOD_PREFIX.length);

/**
 * Renvoie une fiche propre à partir de données quelconques (saisie, fichier
 * de sauvegarde). Lève une erreur si la donnée est inutilisable ; sinon
 * corrige les incohérences (choix exclusifs, valeurs inconnues ignorées).
 */
export function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Fiche invalide");
  if (!isISODate(raw.date)) throw new Error(`Date invalide : ${raw.date}`);
  const e = emptyEntry(raw.date);
  const list = (v, ok) => [...new Set(Array.isArray(v) ? v.filter(ok) : [])];
  const pick = (v, set) => (set.has(v) ? v : null);
  const bool = (v) => (v === true || v === false ? v : null);
  const text = (v) => (typeof v === "string" ? v.trim().slice(0, 2000) : "");

  e.updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : null;
  e.sleep.bed = TIME.test(raw.sleep?.bed) ? raw.sleep.bed : null;
  e.sleep.wake = TIME.test(raw.sleep?.wake) ? raw.sleep.wake : null;
  e.sleep.quality = pick(raw.sleep?.quality, VALID.quality);

  e.moods = exclusive(list(raw.moods, (m) => VALID.moods.has(m)), MOODS);
  e.sports = list(raw.sports, (s) => VALID.sports.has(s));

  e.pain.sites = exclusive(list(raw.pain?.sites, (s) => VALID.painSites.has(s)), PAIN_SITES);
  const ras = e.pain.sites.includes("ras");
  e.pain.other = e.pain.sites.includes("autre") ? text(raw.pain?.other) : "";
  e.pain.intensity = ras || !e.pain.sites.length ? null : pick(raw.pain?.intensity, VALID.painIntensity);

  e.skin = exclusive(list(raw.skin, (s) => VALID.skin.has(s)), SKIN_SITES);
  e.flare = bool(raw.flare);
  e.cortisone = bool(raw.cortisone);
  e.injection = bool(raw.injection);
  e.foods = list(raw.foods, isFood);
  e.alcohol.types = list(raw.alcohol?.types, (t) => VALID.alcoholTypes.has(t));
  e.alcohol.glasses = e.alcohol.types.length ? pick(raw.alcohol?.glasses, VALID.glasses) : null;
  e.period = raw.period === true;
  e.notes = text(raw.notes);
  return e;
}

/** Un choix « exclusif » (Neutre, RAS) annule les autres s'il est présent. */
function exclusive(selected, options) {
  const ex = options.filter((o) => o.exclusive).map((o) => o.id);
  const hit = selected.find((s) => ex.includes(s));
  return hit ? [hit] : selected;
}

/**
 * Bascule un choix dans une sélection multiple en respectant les choix
 * exclusifs : choisir RAS retire les endroits, choisir un endroit retire RAS.
 */
export function toggleChoice(selected, id, options) {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  const opt = options.find((o) => o.id === id);
  if (opt?.exclusive) return [id];
  const ex = new Set(options.filter((o) => o.exclusive).map((o) => o.id));
  return [...selected.filter((s) => !ex.has(s)), id];
}

/** Durée de sommeil en heures (nuit à cheval sur minuit gérée), ou null. */
export function sleepHours(sleep) {
  if (!sleep?.bed || !sleep?.wake) return null;
  const min = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  let d = min(sleep.wake) - min(sleep.bed);
  if (d <= 0) d += 24 * 60;
  return Math.round((d / 60) * 100) / 100;
}

/** Score de douleur : RAS = 0, légère 1, moyenne 2, intense 3 ; null si non renseigné. */
export function painScore(e) {
  if (e.pain.sites.includes("ras")) return 0;
  const i = PAIN_INTENSITIES.find((p) => p.id === e.pain.intensity);
  return i ? i.score : null;
}

/** Nombre de zones de psoriasis : RAS = 0 ; null si rien n'a été coché. */
export function skinScore(e) {
  if (e.skin.includes("ras")) return 0;
  return e.skin.length ? e.skin.length : null;
}

/** Compare deux fiches sans tenir compte de la date de modification. */
export function sameContent(a, b) {
  const strip = ({ updatedAt, ...rest }) => rest;
  return stableStringify(strip(a)) === stableStringify(strip(b));
}

export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}
