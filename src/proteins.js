// Compteur hebdomadaire des protéines (semaine du lundi au dimanche).
import { MEALS, PROTEINS } from "./config.js";
import { addDays, weekStart } from "./dates.js";

/**
 * Nombre de repas par protéine dans la semaine de `date`. `draft` (la
 * journée en cours de saisie, pas encore enregistrée) remplace la version
 * enregistrée du même jour.
 */
export function weeklyProteins(days, date, draft = null) {
  const from = weekStart(date);
  const to = addDays(from, 6);
  const week = days.filter((d) => d.date >= from && d.date <= to && d.date !== draft?.date);
  if (draft && draft.date >= from && draft.date <= to) week.push(draft);
  return PROTEINS.map((p) => {
    const count = week.reduce((n, d) => n + MEALS.filter((m) => d.proteins?.[m.id] === p.id).length, 0);
    return { id: p.id, label: p.label, count, max: p.weeklyMax, left: p.weeklyMax === null ? null : p.weeklyMax - count };
  });
}
