// Analyse locale, pensée pour être lue en phrases : « dans les 3 jours après
// tel facteur, tu as eu des douleurs X fois sur N ». Fonctions pures.
import { ALCOHOL_TYPES, ANALYSIS, CUSTOM_FOOD_PREFIX, FOODS, INTENSITY_LABELS, MOODS, SPORTS, labelOf } from "./config.js";
import { addDays, diffDays } from "./dates.js";
import { painScore, skinScore, sleepHours } from "./model.js";

/** Nombre de jours suivants observés après un facteur (lendemain à J+3). */
export const WINDOW = 3;
const MIN_FOLLOW = 2; // jours renseignés minimum dans la fenêtre
export const NOTABLE = 0.25; // écart de fréquence à partir duquel c'est une « piste »

/** Mesures : `present(e)` vaut true, false, ou null si non renseigné. */
export const OUTCOMES = [
  { id: "douleur", label: "Douleurs", noun: "des douleurs", after: "de douleurs", present: (e) => (painScore(e) === null ? null : painScore(e) > 0) },
  { id: "psoriasis", label: "Psoriasis", noun: "des plaques", after: "de plaques", present: (e) => (skinScore(e) === null ? null : skinScore(e) > 0) },
  { id: "fatigue", label: "Fatigue", noun: "de la fatigue", after: "de fatigue", present: (e) => (e.moods.length ? e.moods.includes("fatiguee") : null) },
  { id: "crise", label: "Crises", noun: "une crise", after: "d'une crise", present: (e) => e.flare },
];

const outcomeOf = (id) => {
  const o = OUTCOMES.find((x) => x.id === id);
  if (!o) throw new Error(`Mesure inconnue : ${id}`);
  return o;
};

// Une valeur `null` signifie « on ne sait pas » : le jour est ignoré pour ce facteur.
const ateKnown = (e) => e.foods.length > 0;
const moodKnown = (e) => e.moods.length > 0;

/**
 * Facteurs oui/non testés. La crème à la cortisone n'en fait pas partie :
 * préventive ou réaction à une poussée, elle ne peut pas en être la cause.
 */
export function binaryFactors(entries = [], outcomeId = "douleur") {
  const used = [...new Set(entries.flatMap((e) => e.foods))];
  const foodIds = [...FOODS.map((f) => f.id), ...used.filter((f) => f.startsWith(CUSTOM_FOOD_PREFIX))];
  return [
    ...foodIds.map((id) => ({
      id: `aliment:${id}`, group: "Alimentation", label: labelOf(FOODS, id),
      value: (e) => (ateKnown(e) ? e.foods.includes(id) : null),
    })),
    { id: "sport", group: "Sport", label: "Sport (quel qu'il soit)", value: (e) => e.sports.length > 0 },
    ...SPORTS.map((s) => ({ id: `sport:${s.id}`, group: "Sport", label: s.label, value: (e) => e.sports.includes(s.id) })),
    ...Object.keys(INTENSITY_LABELS).map((lvl) => ({
      id: `intensite:${lvl}`, group: "Sport", label: `Sport d'intensité ${INTENSITY_LABELS[lvl]}`,
      value: (e) => e.sports.some((s) => SPORTS.find((x) => x.id === s)?.intensity === lvl),
    })),
    { id: "alcool", group: "Alcool", label: "Alcool (quel qu'il soit)", value: (e) => e.alcohol.types.length > 0 },
    ...ALCOHOL_TYPES.map((t) => ({ id: `alcool:${t.id}`, group: "Alcool", label: t.label, value: (e) => e.alcohol.types.includes(t.id) })),
    { id: "alcool:3+", group: "Alcool", label: "Plus de 2 verres", value: (e) => e.alcohol.glasses === "3+" },
    ...MOODS.filter((m) => !(outcomeId === "fatigue" && m.id === "fatiguee")).map((m) => ({
      id: `humeur:${m.id}`, group: "Humeur", label: m.label, value: (e) => (moodKnown(e) ? e.moods.includes(m.id) : null),
    })),
    { id: "sommeil:moyen", group: "Sommeil", label: "Sommeil moyen", value: (e) => (e.sleep.quality ? e.sleep.quality === "moyen" : null) },
    {
      id: "sommeil:court", group: "Sommeil", label: "Nuit courte (moins de 7 h)",
      value: (e) => { const h = sleepHours(e.sleep); return h === null ? null : h < 7; },
    },
    { id: "regles", group: "Cycle", label: "Règles", value: (e) => e.period },
  ];
}

/** Nombre de jours depuis la dernière injection, pour chaque jour enregistré après la première. */
export function daysSinceInjection(entries) {
  const out = new Map();
  let last = null;
  for (const e of entries) {
    if (e.injection === true) last = e.date;
    if (last) out.set(e.date, diffDays(last, e.date));
  }
  return out;
}

/**
 * Regroupe les jours de règles en cycles. Un jour non rempli entre deux
 * jours de règles ne coupe pas le cycle (oubli de saisie probable).
 */
export function periodCycles(entries) {
  const recorded = new Set(entries.map((e) => e.date));
  const days = entries.filter((e) => e.period).map((e) => e.date);
  const cycles = [];
  for (const d of days) {
    const cur = cycles[cycles.length - 1];
    const gap = cur ? diffDays(cur.end, d) : Infinity;
    if (cur && (gap === 1 || (gap === 2 && !recorded.has(addDays(cur.end, 1))))) cur.end = d;
    else cycles.push({ start: d, end: d });
  }
  return cycles.map((c, i) => ({
    ...c,
    length: diffDays(c.start, c.end) + 1,
    sincePrevious: i ? diffDays(cycles[i - 1].start, c.start) : null,
  }));
}

/**
 * La mesure est-elle apparue dans les 3 jours qui suivent `date` ?
 * null si moins de 2 de ces jours sont renseignés.
 */
function followedBy(byDate, outcome, date) {
  const seen = [];
  for (let k = 1; k <= WINDOW; k++) {
    const e = byDate.get(addDays(date, k));
    const v = e ? outcome.present(e) : null;
    if (v !== null && v !== undefined) seen.push(v);
  }
  return seen.length >= MIN_FOLLOW ? seen.includes(true) : null;
}

/** Compare la fréquence de la mesure dans les 3 jours suivants, avec et sans le facteur. */
export function compareFactor(entries, outcome, factor) {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const w = { yes: 0, n: 0 }, wo = { yes: 0, n: 0 };
  for (const e of entries) {
    const f = factor.value(e);
    if (f === null || f === undefined) continue;
    const after = followedBy(byDate, outcome, e.date);
    if (after === null) continue;
    const g = f ? w : wo;
    g.n++;
    if (after) g.yes++;
  }
  const enough = w.n >= ANALYSIS.minGroup && wo.n >= ANALYSIS.minGroup;
  return {
    with: w,
    without: wo,
    enough,
    diff: enough ? w.yes / w.n - wo.yes / wo.n : NaN,
    fragile: enough && Math.min(w.n, wo.n) < ANALYSIS.solidGroup,
  };
}

const INJECTION_PHASES = [
  { from: 0, to: 3, label: "0 à 3 jours après l'injection" },
  { from: 4, to: 13, label: "4 à 13 jours après" },
  { from: 14, to: 20, label: "14 à 20 jours après" },
  { from: 21, to: Infinity, label: "21 jours et plus" },
];

/** Fréquence de la mesure selon la phase du cycle d'injection. */
export function injectionPhases(entries, outcomeId) {
  const outcome = outcomeOf(outcomeId);
  const since = daysSinceInjection(entries);
  return INJECTION_PHASES.map((p) => {
    let yes = 0, n = 0;
    for (const e of entries) {
      const d = since.get(e.date);
      const v = outcome.present(e);
      if (d === undefined || v === null || v === undefined || d < p.from || d > p.to) continue;
      n++;
      if (v) yes++;
    }
    return { ...p, yes, n };
  });
}

/** Résumé par mesure : jours renseignés, jours concernés, dernier jour concerné. */
export function summary(entries) {
  return OUTCOMES.map((o) => {
    const known = entries.filter((e) => { const v = o.present(e); return v !== null && v !== undefined; });
    const hits = known.filter((e) => o.present(e));
    return { id: o.id, label: o.label, noun: o.noun, known: known.length, yes: hits.length, last: hits.at(-1)?.date ?? null };
  });
}

/** Facteurs impossibles à analyser, avec la raison (presque toujours / presque jamais). */
function unanalysable(entries, outcome, factors, analysed) {
  const out = { always: [], rare: [] };
  for (const f of factors) {
    if (analysed.has(f.id)) continue;
    const vals = entries.map((e) => f.value(e)).filter((v) => v !== null && v !== undefined);
    const yes = vals.filter(Boolean).length;
    if (!yes) continue; // jamais rencontré : rien à dire
    if (vals.length - yes < ANALYSIS.minGroup) out.always.push(f.label);
    else out.rare.push(f.label);
  }
  return out;
}

/** Analyse complète d'une mesure. `entries` doit être trié par date. */
export function analyse(entries, outcomeId = "douleur") {
  const outcome = outcomeOf(outcomeId);
  const factors = binaryFactors(entries, outcomeId);
  const results = [];
  for (const f of factors) {
    const c = compareFactor(entries, outcome, f);
    if (c.enough) results.push({ id: f.id, group: f.group, label: f.label, ...c });
  }
  results.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  return {
    outcome: { id: outcome.id, label: outcome.label, noun: outcome.noun, after: outcome.after },
    days: entries.length,
    enoughDays: entries.length >= ANALYSIS.minDays,
    summary: summary(entries),
    leads: results.filter((r) => Math.abs(r.diff) >= NOTABLE),
    factors: results,
    unanalysable: unanalysable(entries, outcome, factors, new Set(results.map((r) => r.id))),
    injections: entries.filter((e) => e.injection === true).map((e) => e.date),
    phases: injectionPhases(entries, outcomeId),
    cycles: periodCycles(entries),
  };
}
