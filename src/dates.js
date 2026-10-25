// Dates au format AAAA-MM-JJ, en heure locale (jamais en UTC, pour éviter
// qu'une saisie tardive le soir bascule sur le lendemain).

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s) {
  if (typeof s !== "string" || !ISO.test(s)) return false;
  const d = parse(s);
  return toISO(d) === s;
}

export function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parse(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12); // midi : insensible aux changements d'heure
}

export function today(now = new Date()) {
  return toISO(now);
}

export function addDays(s, n) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(a, b) {
  return Math.round((parse(b) - parse(a)) / 86400000);
}

/** Toutes les dates de `from` à `to` inclus. */
export function range(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const WEEKDAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function formatShort(s) {
  const d = parse(s);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatLong(s) {
  const d = parse(s);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
