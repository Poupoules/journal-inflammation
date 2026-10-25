// Sauvegarde (JSON complet, restaurable) et export tableur (CSV).
import {
  ALCOHOL_GLASSES, ALCOHOL_TYPES, FOODS, MOODS, PAIN_INTENSITIES, PAIN_SITES, SKIN_SITES,
  SLEEP_QUALITIES, SPORTS, labelOf,
} from "./config.js";
import { normalizeEntry, sameContent, skinScore, sleepHours } from "./model.js";
import { daysSinceInjection } from "./analysis.js";

export const APP_ID = "journal-inflammation";
export const BACKUP_FORMAT = 1;

export function buildBackup(days, { customFoods = [], now = new Date() } = {}) {
  return {
    app: APP_ID,
    format: BACKUP_FORMAT,
    exportedAt: now.toISOString(),
    customFoods,
    days,
  };
}

/**
 * Lit un fichier de sauvegarde. Refuse un fichier qui n'en est pas un ;
 * les fiches illisibles sont comptées dans `rejected` plutôt que bloquantes.
 */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde lisible.");
  }
  if (data?.app !== APP_ID || !Array.isArray(data.days)) {
    throw new Error("Ce fichier n'est pas une sauvegarde du journal.");
  }
  if (data.format > BACKUP_FORMAT) {
    throw new Error("Sauvegarde créée par une version plus récente de l'app : mets l'app à jour.");
  }
  const days = [];
  let rejected = 0;
  for (const raw of data.days) {
    try {
      days.push({ ...normalizeEntry(raw), updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null });
    } catch {
      rejected++;
    }
  }
  const customFoods = Array.isArray(data.customFoods) ? data.customFoods.filter((f) => typeof f === "string") : [];
  return { days, customFoods, rejected, exportedAt: data.exportedAt ?? null };
}

/**
 * Prépare une restauration sans rien écraser à l'aveugle : pour un jour
 * présent des deux côtés avec un contenu différent, la version modifiée le
 * plus récemment l'emporte.
 */
export function planRestore(current, incoming) {
  const byDate = new Map(current.map((e) => [e.date, e]));
  const plan = { add: [], replace: [], keepLocal: [], identical: 0 };
  for (const e of incoming) {
    const local = byDate.get(e.date);
    if (!local) plan.add.push(e);
    else if (sameContent(local, e)) plan.identical++;
    else if ((e.updatedAt ?? "") > (local.updatedAt ?? "")) plan.replace.push(e);
    else plan.keepLocal.push(e);
  }
  return plan;
}

const CSV_COLUMNS = [
  ["date", (e) => e.date],
  ["coucher", (e) => e.sleep.bed],
  ["reveil", (e) => e.sleep.wake],
  ["sommeil_h", (e) => sleepHours(e.sleep)],
  ["sommeil_qualite", (e) => e.sleep.quality && labelOf(SLEEP_QUALITIES, e.sleep.quality)],
  ["humeur", (e) => e.moods.map((m) => labelOf(MOODS, m)).join("|")],
  ["sport", (e) => e.sports.map((s) => labelOf(SPORTS, s)).join("|")],
  ["douleur_endroits", (e) => e.pain.sites.map((s) => labelOf(PAIN_SITES, s)).join("|")],
  ["douleur_autre", (e) => e.pain.other],
  ["douleur_intensite", (e) => e.pain.intensity && labelOf(PAIN_INTENSITIES, e.pain.intensity)],
  ["psoriasis_zones", (e) => e.skin.map((s) => labelOf(SKIN_SITES, s)).join("|")],
  ["psoriasis_nb_zones", (e) => skinScore(e)],
  ["crise", (e) => yesNo(e.flare)],
  ["cortisone", (e) => yesNo(e.cortisone)],
  ["injection", (e) => yesNo(e.injection)],
  ["jours_depuis_injection", (e, ctx) => ctx.get(e.date)],
  ["aliments", (e) => e.foods.map((f) => labelOf(FOODS, f)).join("|")],
  ["alcool", (e) => e.alcohol.types.map((t) => labelOf(ALCOHOL_TYPES, t)).join("|")],
  ["alcool_verres", (e) => e.alcohol.glasses && labelOf(ALCOHOL_GLASSES, e.alcohol.glasses)],
  ["regles", (e) => (e.period ? "oui" : "non")],
  ["notes", (e) => e.notes],
];

function yesNo(v) {
  return v === null ? "" : v ? "oui" : "non";
}

function cell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(days) {
  const ctx = daysSinceInjection(days);
  const lines = [CSV_COLUMNS.map(([h]) => h).join(",")];
  for (const e of days) lines.push(CSV_COLUMNS.map(([, f]) => cell(f(e, ctx))).join(","));
  // BOM : accents corrects à l'ouverture dans Excel.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function backupFileName(date, ext) {
  return `journal-inflammation-${date}.${ext}`;
}
