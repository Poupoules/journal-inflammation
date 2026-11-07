// Liste d'aliments de l'utilisatrice : liste de base (config.js) moins les
// aliments retirés, plus ses aliments perso. Fonctions pures, sans stockage.
//
// Retirer un aliment ne touche pas l'historique : les journées passées le
// gardent. Regrouper A dans B remplace A par B dans toutes les journées.
import { CUSTOM_FOOD_PREFIX, FOODS, labelOf } from "./config.js";

const norm = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Aliments proposés à la saisie, dans l'ordre : base visible puis perso. */
export function visibleFoods({ customFoods = [], hiddenFoods = [] }) {
  return [
    ...FOODS.filter((f) => !hiddenFoods.includes(f.id)).map((f) => ({ ...f, custom: false })),
    ...customFoods.map((id) => ({ id, label: labelOf(FOODS, id), custom: true })),
  ];
}

/** Aliments de base retirés, pour pouvoir les remettre. */
export function hiddenBaseFoods({ hiddenFoods = [] }) {
  return FOODS.filter((f) => hiddenFoods.includes(f.id));
}

/** Nombre de journées où chaque aliment est coché. */
export function usage(days) {
  const n = new Map();
  for (const d of days) for (const f of d.foods) n.set(f, (n.get(f) ?? 0) + 1);
  return n;
}

/**
 * Identifiant pour un nom saisi : un aliment existant (base ou perso, sans
 * tenir compte des majuscules) ou un nouvel aliment perso.
 */
export function foodIdFor(name, { customFoods = [] }) {
  const n = norm(name);
  const base = FOODS.find((f) => norm(f.label) === n);
  if (base) return base.id;
  const mine = customFoods.find((id) => norm(id.slice(CUSTOM_FOOD_PREFIX.length)) === n);
  if (mine) return mine;
  const clean = name.trim().replace(/\s+/g, " ");
  return CUSTOM_FOOD_PREFIX + clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Rend un aliment visible dans la liste (perso ajouté, ou base remise). */
export function showInList(id, { customFoods = [], hiddenFoods = [] }) {
  if (id.startsWith(CUSTOM_FOOD_PREFIX)) {
    return { customFoods: customFoods.includes(id) ? customFoods : [...customFoods, id], hiddenFoods };
  }
  return { customFoods, hiddenFoods: hiddenFoods.filter((h) => h !== id) };
}

/** Retire un aliment de la liste proposée (l'historique n'est pas modifié). */
export function removeFromList(id, { customFoods = [], hiddenFoods = [] }) {
  if (id.startsWith(CUSTOM_FOOD_PREFIX)) return { customFoods: customFoods.filter((c) => c !== id), hiddenFoods };
  return { customFoods, hiddenFoods: hiddenFoods.includes(id) ? hiddenFoods : [...hiddenFoods, id] };
}

/**
 * Journées modifiées par le regroupement de `from` dans `to` : `from` est
 * remplacé par `to` (sans doublon). Seules les journées concernées sont renvoyées.
 */
export function mergeInDays(days, from, to, now = new Date().toISOString()) {
  if (from === to) return [];
  return days
    .filter((d) => d.foods.includes(from))
    .map((d) => ({
      ...d,
      foods: [...new Set(d.foods.map((f) => (f === from ? to : f)))],
      updatedAt: now,
    }));
}
