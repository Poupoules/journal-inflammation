// Corrections ponctuelles des données, appliquées une seule fois au démarrage
// de l'app (chaque migration est mémorisée comme faite). Avant chaque
// migration, une copie des données d'avant est gardée dans le stockage.
import { mergeInDays, removeFromList, showInList } from "./foods.js";

/** Applique des regroupements [de, vers] et des retraits à un état {days, customFoods, hiddenFoods}. */
export function applyFoodCleanup(state, { merges = [], removes = [] }, now) {
  const byDate = new Map(state.days.map((d) => [d.date, d]));
  const changed = new Set();
  let lists = { customFoods: state.customFoods, hiddenFoods: state.hiddenFoods };
  for (const [from, to] of merges) {
    const touched = mergeInDays([...byDate.values()], from, to, now);
    for (const d of touched) { byDate.set(d.date, d); changed.add(d.date); }
    const listed = lists.customFoods.includes(from);
    if (listed || touched.length) lists = showInList(to, lists);
    lists = removeFromList(from, lists);
  }
  for (const id of removes) lists = removeFromList(id, lists);
  return { changedDays: [...changed].sort().map((d) => byDate.get(d)), ...lists };
}

/** Ajoute un aliment aux journées dont les notes correspondent (ex. « lardons » → charcuterie). */
export function tagFromNotes(days, pattern, foodId, now) {
  return days
    .filter((d) => pattern.test(d.notes) && d.foods.length && !d.foods.includes(foodId))
    .map((d) => ({ ...d, foods: [...d.foods, foodId], updatedAt: now }));
}

export const MIGRATIONS = [
  {
    // Nettoyage de la liste d'aliments validé le 7 novembre 2026.
    id: "nettoyage-aliments-2026-11",
    message: "Ta liste d'aliments a été nettoyée comme convenu (blé regroupé dans Gluten, laitages, sans gluten, charcuterie…).",
    run(state, now) {
      const charcuterie = tagFromNotes(state.days, /lardon|jambon/i, "charcuterie", now);
      const days = state.days.map((d) => charcuterie.find((c) => c.date === d.date) ?? d);
      const res = applyFoodCleanup({ ...state, days }, {
        merges: [
          ["perso:Sandwich", "gluten"],
          ["perso:Pâtes (blé)", "gluten"],
          ["perso:Viennoiserie", "gluten"],
          ["perso:Ricotta", "perso:Laitage"],
          ["perso:Mozza", "perso:Laitage"],
          ["perso:Pain sans gluten", "perso:Féculents sans gluten"],
          ["perso:Pâtes ss gluten", "perso:Féculents sans gluten"],
          ["perso:Couscous ss gluten", "perso:Féculents sans gluten"],
          ["perso:Desserts sans gluten et sans lactose", "perso:Dessert sans gluten"],
          ["perso:Sushi", "poisson-gras"],
        ],
        removes: ["perso:Confiture"],
      }, now);
      const changed = new Map(charcuterie.map((d) => [d.date, d]));
      for (const d of res.changedDays) changed.set(d.date, d);
      return { ...res, changedDays: [...changed.values()].sort((a, b) => a.date.localeCompare(b.date)) };
    },
  },
  {
    // Retraits demandés le 8 novembre 2026 (les journées passées gardent ces aliments).
    id: "retrait-legumes-2026-11",
    message: "« Légumes » et « Celeri rave » ont été retirés de ta liste d'aliments.",
    run(state, now) {
      return applyFoodCleanup(state, { removes: ["legumes", "perso:Celeri rave"] }, now);
    },
  },
];

/** Exécute les migrations pas encore faites. Renvoie la liste des migrations appliquées. */
export async function runMigrations(storage, { migrations = MIGRATIONS, now = () => new Date().toISOString() } = {}) {
  const done = (await storage.getMeta("migrations")) ?? [];
  const applied = [];
  for (const m of migrations) {
    if (done.includes(m.id)) continue;
    const state = {
      days: await storage.listDays(),
      customFoods: (await storage.getMeta("customFoods")) ?? [],
      hiddenFoods: (await storage.getMeta("hiddenFoods")) ?? [],
    };
    if (state.days.length || state.customFoods.length) {
      // Les migrations sont rejouables sans dommage ; la copie garde le tout premier état.
      if (!(await storage.getMeta(`copieAvant:${m.id}`))) await storage.setMeta(`copieAvant:${m.id}`, state);
      const res = m.run(state, now());
      if (res.changedDays.length) await storage.putDays(res.changedDays);
      await storage.setMeta("customFoods", res.customFoods);
      await storage.setMeta("hiddenFoods", res.hiddenFoods);
      applied.push(m.id);
    }
    done.push(m.id);
    await storage.setMeta("migrations", done);
  }
  return applied;
}
