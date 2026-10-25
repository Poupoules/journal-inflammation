// Analyse locale : comparaisons avec/sans un facteur et corrélations,
// le jour même (J) et le lendemain (J+1). Fonctions pures, sans affichage.
import {
  ALCOHOL_TYPES, ANALYSIS, CUSTOM_FOOD_PREFIX, FOODS, INTENSITY_LABELS, MOODS, SPORTS, labelOf,
} from "./config.js";
import { addDays, diffDays } from "./dates.js";
import { painScore, skinScore, sleepHours } from "./model.js";

/** Mesures que l'on cherche à expliquer. */
export const OUTCOMES = [
  { id: "douleur", label: "Douleur", unit: "sur 3", value: painScore },
  { id: "psoriasis", label: "Psoriasis", unit: "zones", value: skinScore },
  { id: "crise", label: "Crise", unit: "%", percent: true, value: (e) => (e.flare === null ? null : e.flare ? 1 : 0) },
];

// Une valeur `null` signifie « on ne sait pas » : le jour est ignoré pour ce facteur.
const ateKnown = (e) => e.foods.length > 0;
const moodKnown = (e) => e.moods.length > 0;

/** Facteurs oui/non testés. Les aliments perso présents dans les données sont ajoutés. */
export function binaryFactors(entries = []) {
  const custom = [...new Set(entries.flatMap((e) => e.foods.filter((f) => f.startsWith(CUSTOM_FOOD_PREFIX))))];
  const foods = [...FOODS.map((f) => f.id), ...custom].map((id) => ({
    id: `aliment:${id}`, group: "Alimentation", label: labelOf(FOODS, id),
    value: (e) => (ateKnown(e) ? e.foods.includes(id) : null),
  }));
  const intensities = Object.keys(INTENSITY_LABELS).map((lvl) => ({
    id: `intensite:${lvl}`, group: "Sport", label: `Sport d'intensité ${INTENSITY_LABELS[lvl]}`,
    value: (e) => e.sports.some((s) => SPORTS.find((x) => x.id === s)?.intensity === lvl),
  }));
  return [
    ...foods,
    { id: "sport", group: "Sport", label: "Sport (quel qu'il soit)", value: (e) => e.sports.length > 0 },
    ...SPORTS.map((s) => ({ id: `sport:${s.id}`, group: "Sport", label: s.label, value: (e) => e.sports.includes(s.id) })),
    ...intensities,
    { id: "alcool", group: "Alcool", label: "Alcool (quel qu'il soit)", value: (e) => e.alcohol.types.length > 0 },
    ...ALCOHOL_TYPES.map((t) => ({ id: `alcool:${t.id}`, group: "Alcool", label: t.label, value: (e) => e.alcohol.types.includes(t.id) })),
    { id: "alcool:3+", group: "Alcool", label: "Plus de 2 verres", value: (e) => e.alcohol.glasses === "3+" },
    ...MOODS.map((m) => ({ id: `humeur:${m.id}`, group: "Humeur", label: m.label, value: (e) => (moodKnown(e) ? e.moods.includes(m.id) : null) })),
    { id: "sommeil:moyen", group: "Sommeil", label: "Sommeil moyen", value: (e) => (e.sleep.quality ? e.sleep.quality === "moyen" : null) },
    { id: "cortisone", group: "Traitement", label: "Cortisone", value: (e) => e.cortisone },
    { id: "injection", group: "Traitement", label: "Jour d'injection", value: (e) => e.injection },
    { id: "regles", group: "Cycle", label: "Règles", value: (e) => e.period },
  ];
}

/** Variables chiffrées testées par corrélation. */
export const CONTINUOUS = [
  { id: "sommeil:heures", label: "Heures de sommeil", value: (e) => sleepHours(e.sleep) },
  { id: "injection:jours", label: "Jours depuis l'injection", value: (e, ctx) => ctx.daysSinceInjection.get(e.date) ?? null },
];

export function mean(a) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
}

export function pearson(x, y) {
  const n = x.length;
  if (n < 2 || n !== y.length) return NaN;
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
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

function context(entries) {
  return { byDate: new Map(entries.map((e) => [e.date, e])), daysSinceInjection: daysSinceInjection(entries) };
}

/** Compare la mesure avec/sans le facteur, le jour même (lag 0) ou le lendemain (lag 1). */
function compare(entries, ctx, outcome, factor, lag) {
  const withF = [], without = [];
  for (const e of entries) {
    const f = factor.value(e, ctx);
    const target = ctx.byDate.get(addDays(e.date, lag));
    const y = target ? outcome.value(target) : null;
    if (f === null || f === undefined || y === null) continue;
    (f ? withF : without).push(y);
  }
  const enough = withF.length >= ANALYSIS.minGroup && without.length >= ANALYSIS.minGroup;
  return {
    nWith: withF.length,
    nWithout: without.length,
    with: enough ? mean(withF) : NaN,
    without: enough ? mean(without) : NaN,
    diff: enough ? mean(withF) - mean(without) : NaN,
    fragile: enough && Math.min(withF.length, without.length) < ANALYSIS.solidGroup,
  };
}

function correlate(entries, ctx, outcome, variable, lag) {
  const x = [], y = [];
  for (const e of entries) {
    const v = variable.value(e, ctx);
    const target = ctx.byDate.get(addDays(e.date, lag));
    const o = target ? outcome.value(target) : null;
    if (v === null || o === null) continue;
    x.push(v);
    y.push(o);
  }
  return { n: x.length, r: x.length >= ANALYSIS.minPairs ? pearson(x, y) : NaN };
}

/**
 * Analyse complète pour une mesure. `entries` doit être trié par date.
 * Les facteurs sans assez de jours avec ET sans sont écartés et comptés.
 */
export function analyse(entries, outcomeId = "douleur") {
  const outcome = OUTCOMES.find((o) => o.id === outcomeId);
  if (!outcome) throw new Error(`Mesure inconnue : ${outcomeId}`);
  const ctx = context(entries);
  const values = entries.map(outcome.value).filter((v) => v !== null);

  const factors = [];
  let skipped = 0;
  for (const f of binaryFactors(entries)) {
    const sameDay = compare(entries, ctx, outcome, f, 0);
    const nextDay = compare(entries, ctx, outcome, f, 1);
    if (isNaN(sameDay.diff) && isNaN(nextDay.diff)) { skipped++; continue; }
    factors.push({ id: f.id, group: f.group, label: f.label, sameDay, nextDay });
  }
  const strength = (r) => Math.abs(isNaN(r.nextDay.diff) ? r.sameDay.diff : r.nextDay.diff);
  factors.sort((a, b) => strength(b) - strength(a));

  const correlations = CONTINUOUS.map((v) => ({
    id: v.id, label: v.label,
    sameDay: correlate(entries, ctx, outcome, v, 0),
    nextDay: correlate(entries, ctx, outcome, v, 1),
  }));

  return {
    outcome: { id: outcome.id, label: outcome.label, unit: outcome.unit, percent: !!outcome.percent },
    days: entries.length,
    measured: values.length,
    average: mean(values),
    flares: entries.filter((e) => e.flare === true).length,
    enoughDays: entries.length >= ANALYSIS.minDays,
    factors,
    skipped,
    correlations,
    cycles: periodCycles(entries),
  };
}
